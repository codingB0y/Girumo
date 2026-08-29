-- Proteção do ativo (R1): quantos administradores cada grupo tem, e quantos
-- deles são números nossos.
--
-- O problema que isto mede: hoje `groups.is_admin` só diz "o número conectado
-- administra este grupo". Ele não distingue o grupo em que o lojista é UM entre
-- vários admins do grupo em que ele é o ÚNICO. No segundo caso, se o número
-- cair (ban, troca de aparelho, os 14 dias de linked device), o grupo fica sem
-- nenhum administrador operável e a lista de clientes é irrecuperável — não há
-- endpoint no WhatsApp que devolva a administração de um grupo órfão.
--
-- `admins_counted_at` é o que separa "contamos e deu zero" de "nunca contamos".
-- Sem ela, os grupos que já existem herdariam o default 0 e a tela acusaria
-- risco em todos eles no primeiro deploy.
alter table public.groups
  add column if not exists admins_total integer not null default 0,
  add column if not exists admins_ours integer not null default 0,
  add column if not exists admins_counted_at timestamptz;

comment on column public.groups.admins_total is
  'Quantos administradores o grupo tem no total (nossos + humanos). Só vale quando admins_counted_at não é nulo.';
comment on column public.groups.admins_ours is
  'Quantos desses administradores são números conectados ao Girumo. Só vale quando admins_counted_at não é nulo.';
comment on column public.groups.admins_counted_at is
  'Quando a contagem foi apurada. Nulo = nunca medido; não tratar o 0 das outras colunas como fato.';

-- O cron varre todos os tenants procurando exatamente esta condição. Índice
-- parcial porque a linha em risco é a minoria: o filtro mora no índice, não na
-- varredura.
create index if not exists groups_sem_backup_idx
  on public.groups (tenant_id)
  where is_admin and admins_counted_at is not null and admins_total <= 1;

-- Aplica um delta relativo na contagem, para o webhook `group-participants.update`
-- manter o número vivo sem refazer o fetch de todos os grupos.
--
-- Duas guardas importantes:
--
-- 1. `admins_counted_at is not null` — o webhook NÃO cria contagem do nada.
--    Partir de 0 e somar deltas produziria um número inventado para um grupo
--    que nunca foi sincronizado. A contagem base vem sempre do sync, que vê a
--    lista inteira de participantes; o webhook só a mantém.
-- 2. `admins_ours` nunca passa de `admins_total`, e nenhum dos dois fica
--    negativo — um evento perdido ou fora de ordem não pode produzir estado
--    impossível.
create or replace function public.apply_group_admin_delta(
  target_tenant_id uuid,
  target_group_id text,
  delta_total integer,
  delta_ours integer
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  update public.groups
     set admins_total = greatest(0, admins_total + delta_total),
         -- No lado direito, `admins_total`/`admins_ours` ainda são os valores
         -- antigos: os dois ramos somam o próprio delta.
         admins_ours = least(
           greatest(0, admins_total + delta_total),
           greatest(0, admins_ours + delta_ours)
         ),
         admins_counted_at = now()
   where tenant_id = target_tenant_id
     and whatsapp_group_id = target_group_id
     and admins_counted_at is not null;
$$;

-- Só service-role. A função é `security definer` E recebe o tenant como
-- PARÂMETRO: exposta a `authenticated`, qualquer usuário logado poderia somar
-- deltas em grupos de outro tenant — inclusive inflar `admins_total` de um
-- grupo alheio para que o dono nunca fosse avisado de que está sem backup.
--
-- O event trigger `ensure_anon_revoked` cobre `anon` e `public` em objeto novo,
-- mas não `authenticated`. Sem estas duas linhas o advisor de segurança do
-- Supabase acusa (0029) — foi assim que este buraco apareceu.
revoke all on function public.apply_group_admin_delta(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.apply_group_admin_delta(uuid, text, integer, integer)
  to service_role;
