-- Fecha a LEITURA cross-tenant que sobrou depois do #190 (a89e86ab), que tinha
-- fechado a ESCRITA em `confirm_lp_capture` / `record_lp_tracking_event`.
--
-- `funnel_tenant_matrix()` devolve, numa chamada so, `tenant_id`, `name`,
-- `created_at` e os marcos do funil de TODAS as organizacoes. O campo `name`
-- carrega e-mail de cliente. `funnel_event_counts()` devolve a contagem do funil
-- inteiro, sem recorte por tenant. As duas sao `security definer` e nao filtram
-- nada por quem chamou — foram escritas para rodar sob service-role, no admin.
-- Bastava um JWT `authenticated` de usuario comum chamando
-- /rest/v1/rpc/funnel_tenant_matrix para ler a base de clientes inteira.
--
-- MEDIDO EM 31/08/2026 nos DOIS bancos, nao deduzido. `proacl` das quatro,
-- identico em dev (wfjuwogxaupyadwhvoxy) e prod (nidoatbxaylrkcgbszns):
--     postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
-- Diferente do #190, que era furo so de dev: este vale em PRODUCAO tambem.
-- Exploracao em dev confirmada em 30/08 com JWT `authenticated` real de usuario
-- comum, sem cargo: HTTP 200 com o array de tenants, incluindo e-mail de cliente
-- de outro tenant.
--
-- POR QUE `authenticated` ESTAVA LA, e por que isto vai se repetir sem o item
-- (2) abaixo. Nao e heranca de PUBLIC — `anon` ja nao executa nenhuma delas, e
-- o grant e nominal. A origem e o DEFAULT PRIVILEGE do grantor `postgres` em
-- `public`, que e a conexao que aplica migracao. Medido no dia:
--     defaclrole=postgres, tipo=function ->
--       postgres=X/postgres | authenticated=X/postgres | service_role=X/postgres
-- A migracao 20260822190000_anon_sem_privilegio.sql conseguiu tirar `anon` dali,
-- mas nunca mexeu em `authenticated`. Entao TODA funcao nova de `public` nasce
-- com `authenticated=X` explicito, e o event trigger `ensure_anon_revoked` nao
-- alcanca: o corpo dele revoga `from anon, public`, nunca `authenticated`.
-- Hoje sao 36 funcoes `security definer` em `public` e 4 executaveis por
-- `authenticated` — exatamente as quatro daqui. As outras 32 escaparam porque
-- alguma migracao revogou explicitamente, uma a uma. Fechar a torneira e mudanca
-- de superficie ampla; vai em PR separado, com sua propria verificacao.
--
-- POR QUE NENHUM GATE PEGOU. `public.schema_signature()` hasheia
-- `pg_get_function_result | prosecdef | provolatile`. ACL nao entra. O check de
-- drift fica verde com os dois bancos vazando igual.
--
-- Idempotente. Aplicar nos DOIS bancos.

-- ---------------------------------------------------------------------------
-- 1) As duas RPCs de leitura do funil (admin).
-- ---------------------------------------------------------------------------
-- `revoke ... from public` junto porque o ACL default de funcao e `=X/postgres`,
-- ou seja EXECUTE para PUBLIC: tirar so dos papeis nomeados deixaria a porta
-- aberta por heranca no dia em que alguem reconceder.
revoke all on function public.funnel_event_counts() from public, anon, authenticated;
grant execute on function public.funnel_event_counts() to service_role;

revoke all on function public.funnel_tenant_matrix() from public, anon, authenticated;
grant execute on function public.funnel_tenant_matrix() to service_role;

-- `service_role` sozinho basta: os dois unicos call-sites sao
-- apps/web/src/lib/analytics/funnel-events.ts:72 e :90 (`getFunnelMetrics` e
-- `getTenantFunnelMatrix`), ambos com `getSupabaseAdmin()`, num arquivo que abre
-- com `import "server-only"`. Nao ha caminho de browser: conferido com
-- `git grep '\.rpc('` em 31/08/2026, todo call-site de RPC do repo e servidor
-- (apps/web/src/lib/stores/*), worker (apps/worker/src/*) ou engine.

-- ---------------------------------------------------------------------------
-- 2) As duas funcoes de trigger.
-- ---------------------------------------------------------------------------
-- Nenhuma das duas e chamavel por PostgREST de forma util — `anon_revoke_on_new_object`
-- devolve `event_trigger` (respondia 400 0A000, "cannot display a value of type
-- event_trigger") e `subscriptions_reject_stale_event` devolve `trigger`
-- (respondia 404 PGRST202). O risco delas e baixo, mas o privilegio nao tem
-- razao de existir, e enquanto existir elas continuam no lint do advisor —
-- ruido que faz o alarme de verdade passar despercebido.
--
-- Sem `grant ... to service_role` novo, de proposito: o Postgres checa EXECUTE da
-- funcao de trigger no CREATE TRIGGER, nao a cada disparo, entao trigger nao
-- precisa de privilegio para disparar. As duas ficam com
-- `postgres=X | service_role=X` porque o `service_role=X` ja vinha do default
-- privilege e nao ha razao para mexer nele — inofensivo, ja que chamar qualquer
-- uma delas direto nao faz nada util.
--
-- VERIFICADO EM DEV em 31/08/2026, depois do revoke, antes de aplicar em prod:
--   * `ensure_anon_revoked`: `create table public.__verif_hardening_31ago` novo
--     saiu com `anon` sem SELECT e `relrowsecurity = true`, ou seja o event
--     trigger rodou. Tabela removida em seguida.
--   * `subscriptions_reject_stale_event`: UPDATE numa das 8 linhas de
--     `subscriptions`, dentro de `begin/rollback`, passou sem erro de permissao.
revoke all on function public.anon_revoke_on_new_object() from public, anon, authenticated;
revoke all on function public.subscriptions_reject_stale_event() from public, anon, authenticated;
