-- B.3 da auditoria de 22/08/2026 — aposenta o Squad OS.
--
-- Decisao de 25/08, com o dado na mao (conferido em producao):
--
--  * as 4 tabelas com conteudo tinham min(created_at) = max(created_at) =
--    2026-07-01. Carga inicial e nada nos 55 dias seguintes;
--  * as outras 7 nunca tiveram uma linha;
--  * o modulo nunca ganhou executor: as telas liam dados, nada fazia os agentes
--    trabalharem;
--  * pior, ele ERA alcancavel — "Equipe AI" no rodape da sidebar — e mostrava
--    8 agentes ficticios com reputacao inventada. Como as tabelas usam um
--    workspace_id fixo em vez de tenant_id, todos os lojistas viam a mesma
--    ficcao. Mesma familia do incidente de dados falsos no painel.
--
-- A alternativa (escrever e manter migracoes para 11 tabelas sem uso) custaria
-- mais do que refazer o modulo do zero no dia em que ele for real.
--
-- O conteudo esta guardado em docs/arquivo/squad-os/ (schema.sql com o DDL
-- exato e dados.json com as 24 linhas). As telas e rotas saem no mesmo commit,
-- entao `git revert` traz tudo de volta.
--
-- `tenant_webhooks` vai junto por estar igualmente orfa: 0 linhas e nenhum
-- leitor no codigo. `increment_automation_runs` idem — funcao sem chamador.
--
-- Conferido antes de aplicar: nenhuma FK de fora da lista aponta para estas
-- tabelas, e nenhuma view as referencia.

drop table if exists public.agent_skills;
drop table if exists public.squad_agents;
drop table if exists public.artifacts;
drop table if exists public.handoffs;
drop table if exists public.missions;
drop table if exists public.decisions;
drop table if exists public.knowledge;
drop table if exists public.memories;
drop table if exists public.skills;
drop table if exists public.squads;
drop table if exists public.agents;
drop table if exists public.tenant_webhooks;

drop function if exists public.increment_automation_runs(p_id uuid, p_tenant_id uuid);
