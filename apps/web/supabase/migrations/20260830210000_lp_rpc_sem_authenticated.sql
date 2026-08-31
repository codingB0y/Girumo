-- Fecha o mesmo buraco de `claim_bulk_jobs` (a169f315) nas duas RPCs das landing
-- pages: `confirm_lp_capture` e `record_lp_tracking_event`.
--
-- As duas são `security definer` e recebem `p_tenant_id` como PARÂMETRO. Uma
-- função assim não tem como saber que quem chamou é dono daquele tenant: ela
-- confia no argumento. Neste projeto o papel `authenticated` MANTÉM os sete
-- privilégios por default (só `anon` foi zerado, em 22/08 —
-- 20260822190000_anon_sem_privilegio.sql), então basta estar logado para chamar
-- `/rest/v1/rpc/confirm_lp_capture` com o `tenant_id` de outro lojista e injetar
-- lead falso, contato falso e evento de funil falso na base dele. Isso suja
-- atribuição, contagem de leads e o funil de quem paga pelo produto.
--
-- MEDIDO EM 30/08/2026, não deduzido:
--   * dev  (wfjuwogxaupyadwhvoxy): proacl = postgres=X | authenticated=X | service_role=X
--   * prod (nidoatbxaylrkcgbszns): proacl = postgres=X | service_role=X
--   Ou seja, o furo era só de dev; em prod esta migração é no-op. O advisor de
--   segurança confirmava: 6 lints `authenticated_security_definer_function_executable`
--   em dev contra 4 em prod, e a diferença eram exatamente estas duas.
--   Exploração confirmada em dev com JWT `authenticated` real (usuário comum,
--   sem cargo): a chamada respondeu P0001 LP_RENDER_CONTEXT_STALE, que é
--   `raise` de DENTRO do corpo — logo a função executou. O controle com uma
--   função inventada respondeu PGRST202/404, então não era falso positivo.
--
-- POR QUE DERIVOU. A migração 20260723090000_lp_v2_capture_atomicity.sql já
-- trazia estes revokes. A 20260820140000_lp_funnel_functions.sql, que vem
-- DEPOIS na apply-order, refaz as duas com `create or replace` e NÃO repete os
-- grants. `create or replace` preserva o ACL de quem já existe, então ela não
-- concedeu nada — mas também não conserta banco que já estava com o grant, e
-- desde então nenhum arquivo do repositório fixava o privilégio destas duas.
--
-- POR QUE O GATE DE DRIFT NÃO PEGOU. `public.schema_signature()` hasheia
-- `pg_get_function_result | prosecdef | provolatile`. ACL não entra. Privilégio
-- é justamente a dimensão em que dev e prod podem divergir em silêncio — e
-- divergiram por 10 dias. Esta migração não muda a assinatura de schema, então
-- a baseline de prod continua válida como está.
--
-- Idempotente. Aplicar nos DOIS bancos.

-- Revogar de `public` também: o ACL padrão de função é `=X/postgres`, ou seja
-- EXECUTE para PUBLIC — tirar só de `anon` e `authenticated` deixaria a porta
-- aberta por herança.
revoke all on function public.confirm_lp_capture(
  uuid, uuid, text, text, integer, text, text, text, integer, text, text, text,
  jsonb, text, text, text
) from public, anon, authenticated;

grant execute on function public.confirm_lp_capture(
  uuid, uuid, text, text, integer, text, text, text, integer, text, text, text,
  jsonb, text, text, text
) to service_role;

revoke all on function public.record_lp_tracking_event(
  uuid, uuid, text, jsonb, integer, text, text, integer, text, text
) from public, anon, authenticated;

grant execute on function public.record_lp_tracking_event(
  uuid, uuid, text, jsonb, integer, text, text, integer, text, text
) to service_role;

-- Só `service_role` basta porque TODO caminho de chamada é de servidor:
-- apps/web/src/lib/pages/store.ts:244 e :304 usam `getSupabaseAdmin()`, e
-- store.ts é `import "server-only"`. Os únicos consumidores são as rotas
-- apps/web/src/app/api/p/lead/route.ts e .../api/p/track/route.ts. Não há
-- caminho anon nem de browser: as páginas públicas /p/[slug] e /r/[slug] leem
-- pelo servidor. Conferido com `git grep` em 30/08/2026.
