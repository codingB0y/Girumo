-- PR C — Configurações dos grupos: Estado + Revisar links.
-- Spec: docs/superpowers/specs/2026-09-02-config-grupos-campanha-design.md (D7).
--
-- Três coisas, nesta ordem:
--   1. a ação `check_invite` entra na CHECK de `group_bulk_jobs.action`;
--   2. `groups` ganha o resultado da revisão (`invite_checked_at`, `invite_check`);
--   3. `claim_bulk_jobs` ganha a cadência de D7 para `check_invite`.
--
-- Idempotente de ponta a ponta: rodar duas vezes não faz nada na segunda.
-- Aplicada nos DOIS bancos (dev wfjuwogxaupyadwhvoxy e prod nidoatbxaylrkcgbszns).
--
-- ⚠ O GATE DE DRIFT NÃO PROTEGE 2 DAS 3 MUDANÇAS DAQUI. Medido em 03/09 com as
-- assinaturas reais dos dois bancos: das três, só as colunas novas de `groups`
-- mexeram no hash. `schema_signature()` hasheia, para tabela, apenas
-- `attname:format_type` — nome e tipo de coluna — e, para função, apenas tipo de
-- retorno + `prosecdef` + `provolatile`. Portanto ficam INVISÍVEIS ao gate:
--
--   • a CHECK constraint de `action` (constraint não entra no hash da tabela);
--   • o corpo novo de `claim_bulk_jobs` (o corpo não entra no hash da função).
--
-- Consequência prática: aplicar esta migração em UM banco só deixaria o CI
-- VERDE, com a fila aceitando `check_invite` num banco e recusando no outro.
-- Por isso a conferência aqui não foi "o CI passou", e sim SQL direto nos dois
-- bancos comparando `pg_get_constraintdef` e `pg_get_functiondef`. Faça o mesmo
-- em qualquer migração que mexa só em constraint, índice, default ou corpo de
-- função. Irmão do buraco de ACL já conhecido (privilégio também não é hasheado).

-- ── 1. A ação nova ──────────────────────────────────────────────────────────
-- Recriar a CHECK é a única forma: constraint de checagem não tem ALTER.
alter table public.group_bulk_jobs
  drop constraint if exists group_bulk_jobs_action_check;

alter table public.group_bulk_jobs
  add constraint group_bulk_jobs_action_check
  check (action = any (array['set_description', 'set_picture', 'open', 'close', 'check_invite']));

-- ── 2. O resultado da revisão ───────────────────────────────────────────────
-- Mora em `groups`, e não em `group_bulk_jobs`, porque a pergunta que a tela faz
-- é "este grupo tem link bom?" e não "como foi o job de terça". O job é o
-- registro de UMA revisão; a coluna é o estado atual.
alter table public.groups
  add column if not exists invite_checked_at timestamptz;

alter table public.groups
  add column if not exists invite_check text;

alter table public.groups
  drop constraint if exists groups_invite_check_check;

-- `null` = nunca revisado, e é diferente de 'broken'. Sem essa distinção a tela
-- diria "quebrado" para 91 grupos no primeiro dia, antes de ter olhado nenhum.
alter table public.groups
  add constraint groups_invite_check_check
  check (invite_check is null or invite_check = any (array['same', 'changed', 'broken']));

-- ── 3. A cadência de D7 ─────────────────────────────────────────────────────
-- D7: 10 leituras a cada 10 min = UMA por minuto, por tenant. O loop de lote
-- roda 1 op a cada 4s (~15/min), que é o ritmo certo para escrita de admin e
-- rápido demais para uma varredura de 91 grupos que ninguém está esperando.
--
-- A trava mora aqui e não num loop novo porque a RPC já é onde o teto vive
-- (`p_limit`), e um segundo loop seria outro processo mordendo o MESMO número da
-- Evolution — os três loops atuais (envio, auto-grow, lote) já compartilham ele.
--
-- O predicado PULA o check_invite estrangulado em vez de bloquear a fila: como a
-- escolha é `order by created_at limit 1`, um check_invite na cabeça travaria
-- tudo que viesse depois. Com 91 revisões enfileiradas, um lote de foto pedido
-- em seguida esperaria 91 minutos para começar.
--
-- `running_since` é a marca certa: é gravado no claim (aqui) e o ack não o
-- toca, então ele registra quando a leitura SAIU, tenha ela terminado ou não.
create or replace function public.claim_bulk_jobs(p_tenant uuid, p_limit integer default 1)
 returns setof group_bulk_jobs
 language plpgsql
 security definer
 set search_path to 'public', 'pg_temp'
as $function$
begin
  return query
  with picked as (
    select id
      from public.group_bulk_jobs
     where tenant_id = p_tenant
       and status = 'queued'
       and (
         action <> 'check_invite'
         or not exists (
           select 1
             from public.group_bulk_jobs recente
            where recente.tenant_id = p_tenant
              and recente.action = 'check_invite'
              and recente.running_since > now() - interval '60 seconds'
         )
       )
     order by created_at
     limit greatest(p_limit, 1)
     for update skip locked
  )
  update public.group_bulk_jobs j
     set status        = 'running',
         running_since = now(),
         last_ack_at   = now(),
         attempts      = j.attempts + 1,
         updated_at    = now()
    from picked
   where j.id = picked.id
  returning j.*;
end;
$function$;
