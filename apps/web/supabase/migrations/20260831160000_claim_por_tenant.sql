-- Filtro de tenant OPCIONAL nas duas filas globais do worker.
--
-- POR QUE: `claim_send_commands` e `claim_automation_runs` reivindicam de uma
-- fila global, sem recorte de tenant. O teste de integracao da cadeia de
-- automacao (apps/worker/src/cadeia-automacao.integration.test.ts) cria um
-- tenant isolado por execucao, mas isso nao o protege do claim: dois runs de CI
-- ao mesmo tempo contra o Supabase de dev se roubam o comando, e um reprova sem
-- haver nada errado no codigo. Aconteceu em 24/08/2026 com os PRs #143 e #144,
-- mergeados com 4 segundos de diferenca.
--
-- A contramedida ate aqui era serializar o job `e2e` num `concurrency` global
-- (`e2e-supabase-dev`, `cancel-in-progress: false`). O custo disso so apareceu
-- em 31/08/2026, quando o CI destravou e varios PRs passaram a coexistir: o
-- GitHub mantem UM run pendente por grupo, entao o e2e de um PR CANCELA o do
-- outro — e run cancelado nao reprova, entao o PR fica verde com a suite de
-- seguranca sem ter rodado. Gate que nao roda e pior que gate ausente, porque
-- parece que rodou.
--
-- `claim_bulk_jobs(p_tenant uuid, p_limit integer)`, criada em 30/08, ja nasceu
-- com o filtro. Esta migracao leva as duas antigas para o mesmo desenho.
--
-- COMPATIBILIDADE: o parametro e o ULTIMO e tem `default null`, e null preserva
-- exatamente o comportamento de hoje. O worker em producao
-- (send-loop.ts:111, automations-loop.ts:240) continua chamando com um argumento
-- so e nao muda de comportamento. Quem passa tenant e o teste.
--
-- Precisa de DROP antes do CREATE: acrescentar parametro cria uma SOBRECARGA, e
-- af a chamada com um argumento so ficaria ambigua ("function is not unique").
--
-- Aplicar nos DOIS bancos.

begin;

-- ---------------------------------------------------------------- envios ----
drop function if exists public.claim_send_commands(integer);
drop function if exists app.claim_send_commands(integer);

create function app.claim_send_commands(
  max_commands integer default 5,
  p_tenant uuid default null
)
returns setof engine_commands
language plpgsql
security definer
set search_path to 'public', 'app'
as $function$
begin
  return query
  update public.engine_commands c
  set
    status = 'processing',
    claimed_at = now(),
    lease_expires_at = now() + interval '2 minutes',
    updated_at = now()
  where c.id in (
    select cand.id
    from public.engine_commands cand
    where cand.status = 'queued'
      and (p_tenant is null or cand.tenant_id = p_tenant)
      and cand.type in ('send_message', 'send_media', 'send_poll')
      and cand.available_at <= now()
      and cand.instance_id is not null
      and not exists (
        select 1 from public.instance_send_state s
        where s.instance_id = cand.instance_id
          and s.paused_until is not null
          and s.paused_until > now()
      )
      and coalesce(
        (select s.next_send_allowed_at from public.instance_send_state s where s.instance_id = cand.instance_id),
        now()
      ) <= now()
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 minute') < 8
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 hour') < 120
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 day')
          < app.instance_daily_cap(cand.instance_id)
      and cand.id = (
        select best.id
        from public.engine_commands best
        where best.status = 'queued'
          -- O MESMO filtro precisa entrar aqui. Sem isso, com p_tenant setado, o
          -- "melhor" comando da instancia poderia ser de outro tenant, `cand.id
          -- = best.id` nunca casaria e o claim devolveria vazio em silencio.
          and (p_tenant is null or best.tenant_id = p_tenant)
          and best.type in ('send_message', 'send_media', 'send_poll')
          and best.available_at <= now()
          and best.instance_id = cand.instance_id
        order by best.priority asc, best.created_at asc, best.id asc
        limit 1
      )
    order by cand.priority asc, cand.created_at asc, cand.id asc
    limit greatest(max_commands, 1)
    for update skip locked
  )
  returning c.*;
end;
$function$;

create function public.claim_send_commands(
  max_commands integer default 5,
  p_tenant uuid default null
)
returns setof engine_commands
language sql
security definer
set search_path to 'public', 'app'
as $function$
  select * from app.claim_send_commands(max_commands, p_tenant);
$function$;

-- ------------------------------------------------------------ automacoes ----
drop function if exists public.claim_automation_runs(integer);
drop function if exists app.claim_automation_runs(integer);

create function app.claim_automation_runs(
  max_runs integer default 10,
  p_tenant uuid default null
)
returns setof automation_runs
language plpgsql
security definer
set search_path to 'public', 'app'
as $function$
begin
  return query
  update public.automation_runs r
  set
    status = 'running',
    claimed_at = now(),
    lease_expires_at = now() + interval '2 minutes',
    updated_at = now()
  where r.id in (
    select due.id
    from public.automation_runs due
    where due.status = 'pending'
      and (p_tenant is null or due.tenant_id = p_tenant)
      and due.next_step_at <= now()
    order by due.next_step_at asc
    limit greatest(max_runs, 1)
    for update skip locked
  )
  returning r.*;
end;
$function$;

create function public.claim_automation_runs(
  max_runs integer default 10,
  p_tenant uuid default null
)
returns setof automation_runs
language sql
security definer
set search_path to 'public', 'app'
as $function$
  select * from app.claim_automation_runs(max_runs, p_tenant);
$function$;

-- ---------------------------------------------------------------- grants ----
-- O DROP levou o ACL junto. Reproduzir o que existia (`postgres | service_role`)
-- e nao deixar o default `=X/postgres` valer: sao `security definer` que
-- recebem tenant como PARAMETRO, exatamente a classe do PR #190.
revoke all on function public.claim_send_commands(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_send_commands(integer, uuid) to service_role;

revoke all on function public.claim_automation_runs(integer, uuid) from public, anon, authenticated;
grant execute on function public.claim_automation_runs(integer, uuid) to service_role;

commit;
