-- Tabelas de tenant: so o servidor escreve. Irmao de 20261003150000 (organizations) e
-- 20261003160000 (memberships, users), estendido as demais tabelas de public onde
-- `authenticated` tinha privilegio de escrita E uma policy de escrita que avalia true.
--
-- As policies de escrita dessas tabelas (infra/rls/202606240002 reescrita pela
-- 20260713100000_rls_standardization; FOR ALL nas flash_offer_* / group_bulk_jobs /
-- group_participants, das migracoes de cada feature) so conferem tenant_id contra
-- app.user_*_tenant_ids() / app.has_membership(). Nenhuma restringe coluna, e o check de FK
-- roda sem RLS. Com o privilegio default do Supabase em
-- `authenticated`, pelo PostgREST com o proprio JWT um membro do tenant:
--   - aponta FK para linha de OUTRO tenant: schedules.broadcast_id, broadcasts e
--     campaign_messages.campaign_group_id, campaigns.instance_id, messages.instance_id,
--     templates.folder_id, flash_offers.broadcast_id, flash_offer_*.group_id ...
--   - enfileira trabalho que o worker executa no WhatsApp: group_bulk_jobs (action,
--     target_phone, whatsapp_group_id), broadcasts/campaign_messages (group_ids livre,
--     status de volta para a fila) — inclusive membro sem papel de operador;
--   - troca o alvo do celular/grupo: instances.provider_instance_id, groups.whatsapp_group_id
--     (ja houve incidente de disparo para grupo de terceiro);
--   - passa por cima de limite de plano (instances, campaign_groups, uploads.size) e de
--     regra do app:
--     contacts.opt_out_at (descadastrado volta a receber), testimonials.approved /
--     consent_public, landing_pages.status / target_group_url, logs com actor_user_id falso,
--     orders.value e contadores (views_count, clicks, uses, total_executions).
--
-- Medido em dev em 03/10/2026 (infra/tests/tenant-tables-escrita-check.sql): as 28 com
-- authenticated:INSERT,UPDATE,DELETE,TRUNCATE. Prod nao foi lido — rodar o check antes.
-- Fora daqui de proposito: as 13 com policy em current_setting(...) (nunca avaliam true) e
-- session_revocations (policy `false`).
--
-- O app nao perde nada. Conferido em 03/10/2026:
--   - toda escrita nessas tabelas (stores, rotas, cron, webhooks) vai por getSupabaseAdmin;
--   - getSupabaseServerAnon / getSupabaseAnonForToken / middleware so chamam .auth.*; o
--     cliente de browser so usa .auth.*, Storage (storage.objects) e Realtime (leitura);
--   - worker, hubflow-engine, scripts e CI usam service_role (a anon key do verify.yml so
--     faz login);
--   - nenhuma funcao SECURITY INVOKER executavel por authenticated escreve nessas tabelas;
--     as que escrevem (app.enqueue_broadcast, app.reconcile_broadcast_progress,
--     app.update_instance_status) sao security definer e nao dependem deste privilegio.
-- Por isso nenhum grant por coluna. Se um dia a UI escrever pelo JWT do usuario, o caminho e
-- `grant update (<coluna>) on public.<tabela> to authenticated` — a policy cuida de QUAL
-- linha, o grant por coluna de QUAL coluna — e tirar a tabela do check.
--
-- Privilegio e nao trigger: e allowlist, coluna nova nasce fechada.
-- SELECT fica: as policies de leitura sao das que funcionam.
-- TRUNCATE entra porque pula RLS e trigger de linha.
-- anon e public entram so por idempotencia (anon zerado em public desde 22/08).
-- Um statement so: se alguma tabela nao existir no banco, nada e revogado (o check aponta
-- MISSING antes).
revoke insert, update, delete, truncate on table
  public.agent_configs, public.broadcasts, public.campaign_groups, public.campaign_messages,
  public.campaigns, public.celebrations, public.contacts, public.flash_offer_claims,
  public.flash_offer_entries, public.flash_offer_groups, public.flash_offers, public.funnels,
  public.group_bulk_jobs, public.group_participants, public.groups, public.instances,
  public.landing_pages, public.logs, public.messages, public.orders, public.playbook_progress,
  public.schedules, public.template_folders, public.templates, public.tenant_settings,
  public.testimonials, public.tracked_links, public.uploads
from public, anon, authenticated;

-- Conferencia depois de aplicar, nos dois bancos (o gate de drift nao ve privilegio):
-- infra/tests/tenant-tables-escrita-check.sql — toda linha ok=true.
