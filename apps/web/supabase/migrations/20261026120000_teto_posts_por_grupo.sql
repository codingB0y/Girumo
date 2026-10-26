-- 2026-10-26 - Teto de 4 posts por grupo por dia (dia de Brasília), a terceira alavanca do anti-ban.
--
-- Depois do incidente de 23/10/2026 (Moda kids do Sul, número restringido por 24 h) o #525 passou a
-- ler a reação da base (disjuntor por saídas e orçamento de @todos). Falta limitar quantas vezes o
-- MESMO grupo recebe post no mesmo dia: hoje os únicos tetos são por número (minuto, hora, dia), e
-- eles não impedem 8 posts no mesmo grupo. Prod, 30 dias: mediana 3 posts por grupo por dia, p90 7,
-- máximo 8; os dias de 7-8 posts tiveram 76-141 saídas, os de 1-2 tiveram 21-83. A regra vive só no
-- banco (o TypeScript nunca guarda o 4). Spec: docs/superpowers/specs/2026-10-24-teto-posts-por-grupo-design.md.
--
-- Esta migração tem três seções:
--
--   1. Contagem do dia, teto, leitura para a tela e índice (este bloco).
--      - app.posts_por_grupo_dia(): o teto (4), no molde de app.mention_all_daily_budget().
--      - app.posts_hoje_por_grupo(tenant): (jid, posts) de todo grupo da loja com post hoje. Conta
--        cada comando send_message/send_media/send_poll da loja para o grupo (payload->>'jid') criado
--        desde a meia-noite de Brasília com status queued, processing ou done. canceled e failed não
--        chegaram no grupo e não contam. A conta é por loja e grupo, não por número: dois números
--        somam. A origem do post (agora, agendado, recorrente, funil, reenvio, aviso ao lotar) não
--        importa.
--      - public.posts_hoje_por_grupo(tenant): wrapper para a tela, {"teto": 4, "grupos": {jid: n}}.
--        Muda a baseline.
--      - Índice parcial engine_commands_posts_dia_idx: a contagem roda a cada enfileiramento.
--
--   2. app.enqueue_broadcast: grupos que já têm 4 posts hoje ficam de fora, com o motivo.
--
--   3. app.promote_due_schedules: a oferta relâmpago ignora o grupo que ficou de fora e o agendado
--      cortado inteiro avisa o lojista.
--
-- Idempotente (create or replace, create index if not exists). Sem trava de md5 nesta seção: ela só
-- cria objetos novos.

-- 1) Contagem do dia, teto, leitura para a tela e índice.

create or replace function app.posts_por_grupo_dia()
returns integer
language sql
immutable
set search_path to 'public', 'app'
as $$ select 4 $$;

revoke all on function app.posts_por_grupo_dia() from public, anon, authenticated;
grant execute on function app.posts_por_grupo_dia() to service_role;

-- Uma linha por grupo da loja com pelo menos um post hoje. "Hoje" = desde a meia-noite de Brasília.
create or replace function app.posts_hoje_por_grupo(p_tenant uuid)
returns table (jid text, posts integer)
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select c.payload->>'jid', count(*)::int
  from public.engine_commands c
  where c.tenant_id = p_tenant
    and c.type in ('send_message', 'send_media', 'send_poll')
    and c.status in ('queued', 'processing', 'done')
    and c.created_at >= (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo'
    and c.payload->>'jid' is not null
  group by 1
$$;

revoke all on function app.posts_hoje_por_grupo(uuid) from public, anon, authenticated;
grant execute on function app.posts_hoje_por_grupo(uuid) to service_role;

-- Leitura para a tela: o teto e a contagem saem do mesmo lugar, o TypeScript não recalcula nada.
create or replace function public.posts_hoje_por_grupo(p_tenant uuid)
returns jsonb
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select jsonb_build_object(
    'teto', app.posts_por_grupo_dia(),
    'grupos', coalesce(jsonb_object_agg(g.jid, g.posts), '{}'::jsonb)
  )
  from app.posts_hoje_por_grupo(p_tenant) g
$$;

revoke all on function public.posts_hoje_por_grupo(uuid) from public, anon, authenticated;
grant execute on function public.posts_hoje_por_grupo(uuid) to service_role;

-- A contagem filtra por loja e por data de criação, só nos comandos de envio.
create index if not exists engine_commands_posts_dia_idx
  on public.engine_commands (tenant_id, created_at)
  where type in ('send_message', 'send_media', 'send_poll');
