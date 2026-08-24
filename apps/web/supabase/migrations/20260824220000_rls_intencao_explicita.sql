-- A.3 e o LOW da policy `lp_templates_read`, da auditoria de 22/08/2026.
--
-- Nenhuma mudanca de acesso: so escreve a intencao, para a proxima leitura do
-- advisor nao tratar deny-all deliberado como bug. Esse erro tem precedente
-- caro no projeto — o CLAUDE.md ja avisa sobre as 13 policies que nunca avaliam
-- verdadeiro e a tentacao de "destravar" com `using (true)`.
--
-- Estado conferido nos dois bancos em 24/08: `anon` NAO tem grant em nenhuma
-- destas tabelas (o PR #138 zerou `anon` em `public`); quem tem e `authenticated`
-- e `service_role`.
--
-- Para as quatro tabelas de infraestrutura, RLS ligado + zero policy significa
-- deny-all para `authenticated` e acesso apenas pelo servidor, que bypassa RLS
-- com service-role. E isso mesmo que se quer: nenhuma delas deve ser lida pelo
-- browser.

comment on table public.admin_alerts is
  'Alertas operacionais do admin. RLS ligado SEM policy de proposito: deny-all para authenticated, acesso so pelo servidor via service-role. Nao criar policy permissiva aqui — se uma tela precisar do dado, ela passa por rota de API com admin-guard.';

comment on table public.engine_events is
  'Eventos brutos vindos da engine/worker. RLS ligado SEM policy de proposito: deny-all para authenticated, acesso so pelo servidor via service-role. Volume alto e sem valor direto para o browser.';

comment on table public.engine_commands is
  'Single work queue consumed by the WhatsApp worker (apps/worker) against the Evolution API provider. RLS ligado SEM policy de proposito: deny-all para authenticated, acesso so pelo servidor via service-role — a fila e do worker, nao da tela.';

comment on table public.instance_send_state is
  'Estado anti-ban por numero (warmup, espacamento, breaker). Fonte de verdade do ritmo de envio; substitui o governor em memoria do engine legado. RLS ligado SEM policy de proposito: deny-all para authenticated, acesso so pelo servidor via service-role.';

comment on table public.landing_page_templates is
  'Catalogo de templates de landing page. Nao tem tenant_id: e catalogo compartilhado, como plans. A policy lp_templates_read usa `using (true)` de proposito, e desde o PR #138 isso NAO significa leitura anonima: `anon` nao tem grant nenhum em public, entao a policy so alcanca authenticated. Se um dia `anon` voltar a receber grant, esta policy precisa ser revista junto.';
