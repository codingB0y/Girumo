# Número do atendimento (Recuperar PR 2, comum com o Rastreio) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A loja ganha o "número do atendimento" (`instances.purpose = 'privado'`): conecta pelo mesmo fluxo de QR/código, não ocupa vaga do plano, é recusado se for o chip dos grupos, tem alerta de queda, e nenhum seletor de "número da loja" (post, sync, auto-grow, ações em massa, recontagem, sessão, saúde, disjuntor) o escolhe.

**Architecture:** No banco, três corpos de função passam a olhar só `purpose = 'grupos'` (migração com trava de md5). No web, um seletor novo da store (`listGroupInstances`) substitui `listInstances` onde a pergunta é "qual número posta"; `listInstances` continua com todos onde a pergunta é "esse telefone é nosso?". O número do atendimento nasce por `POST /api/instances` com `purpose: "privado"` (portão do add-on no lugar do limite do plano), pareia pela rota de ações de sempre, e uma conferência única (`conferirNumeroDoAtendimento`) roda quando qualquer número da loja abre sessão: recusa o chip repetido (quem cai é sempre o do atendimento) ou cria a linha de `private_number_state`. O cartão `CartaoNumeroDoAtendimento` aparece na página Conectar quando a loja tem o Recuperar ou o Rastreio.

**Tech Stack:** Next.js App Router (route handlers), Supabase/Postgres (migração pelo CI, `plpgsql` `security definer`), worker Node (`apps/worker`), Evolution API v2.3.7, `tsx --test` (node:test) com PostgREST/Evolution falsos, Playwright (e2e com `page.route`).

**Spec:** `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` — §3 "Base do privado: o que muda no código que já existe" e "Conectar o número de privado", §2 (`instances.purpose`, `private_number_state`), §7 ("Número do atendimento desconectado"), §10 ("Base do privado", "Mutante").
**Índice e contrato:** `docs/superpowers/plans/2026-10-29-recuperar-yampi-00-indice.md` ("Contrato comum", "Restrições globais").
**Depende de:** PR 1a mergeado e aplicado nos dois bancos (`instances.purpose`, `instances_one_privado_per_tenant`, `tenant_settings.recuperar_enabled`/`rastreio_enabled`, `private_number_state`, `engine_commands.dm_module`/`valid_until`). O 2b depende também do 2a (seção "Fatiamento em PRs").

## Antes de começar

- Worktree novo a partir de `origin/main` **com o PR 1a já em `main`** (CLAUDE.md: base sempre `main`; defasagem `git fetch origin main` + `git log HEAD..origin/main --oneline`).
- `node_modules` por junction, como no índice do Rastreio ("Ambiente do worktree"): `cmd /c mklink /J "<worktree>\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"` e o mesmo para `apps\web\node_modules`. Não há `.env.local` com credencial: `*.integration.test.ts` e e2e rodam no job `e2e` do CI.
- Todos os comandos abaixo rodam da raiz do worktree, exceto onde diz `cd apps/web`. Os blocos `bash` são para o Git Bash (heredoc); os demais rodam igual no PowerShell 5.1 (sem `&&`).

## Global Constraints

Do índice ("Restrições globais"), sem mudança:

- TypeScript strict, imports com `@/`, arquivos em `kebab-case`, sem `any` sem justificativa. Nomes de domínio seguem o código (em português, como `reconciliarConexoes`).
- Store com service-role filtra `.eq('tenant_id', …)` sempre: o RLS não protege esse caminho.
- Migração: arquivo novo em `apps/web/supabase/migrations/` + linha no fim de `deploy/supabase/apply-order.txt`; o CI aplica em dev no PR e em prod no merge; baseline com `npm run schema:baseline` (credencial de dev) no mesmo PR; idempotente (`if not exists`); `security definer` sempre com `set search_path`; RLS ligado; policy no padrão `auth.uid()` + `memberships` (`app.has_membership`, `app.user_tenant_ids`), nunca GUC. Nunca DDL à mão.
- Função nova: conferir `has_function_privilege` de `anon`, `authenticated` e `public` (o event trigger `ensure_anon_revoked` cobre `anon`/`public`; `authenticated` nasce com EXECUTE pelo default privilege).
- `hubflow-engine/DECISIONS.md` é vinculante: nada de "digitando", marcar como lida, texto girado, troca de aparelho, proxy.
- O número dos grupos nunca manda DM; o número do atendimento nunca posta em grupo (trava com teste mutante).
- Tipos: rodar os dois `tsc` (web e worker); lint e `tsx --test` não checam tipo.
- Antes do push: `verify-local.ps1` (secrets + build).
- Texto de tela em português do Brasil, design G2 (fonte base 14 px; 12 px só em contador; verde ácido só em Postar/AO VIVO/LOTOU).
- Commit com prefixo semântico em inglês e a linha `Co-Authored-By` do assistente.

Deste PR (valores fixos da spec e do contrato):

- `instances.purpose`: `'grupos'` (padrão) ou `'privado'`; no máximo uma `privado` por loja (`instances_one_privado_per_tenant`, PR 1a).
- Telefone se compara por `public.phone_key` / `chaveDoTelefone` (`@/lib/pages/phone`, DDD + 8 últimos dígitos). Nenhum plano cria outra chave.
- O número do atendimento "vem com o add-on: não ocupa vaga de celular do plano e não tem preço à parte"; criar e parear exigem `recuperar_enabled` **ou** `rastreio_enabled`; desconectar sempre pode.
- "Recusa (desconecta e explica) se o telefone for o mesmo de uma instância `grupos` da loja." Quem cai é sempre o do atendimento, nunca o dos grupos.
- "Fica fora da sincronização de grupos e dos destinos de post." O "esse telefone é nosso?" (`ourPhones`) continua vendo todos os números.
- Alerta de número caído (Job 3): mais de 2 h fora do ar, no máximo 1 por tipo por loja por dia, mesmo opt-out (`disconnect_alert_enabled`).
- Repo público: telefones e nomes de teste são inventados.

## Review Focus

1. **Os dois chips com o telefone escrito diferente** (um com o nono dígito e o 55, outro sem): a recusa acontece do mesmo jeito. Teste: Tarefa 4, "chip dos grupos no número do atendimento, com o 9 e o 55 diferentes: recusa, avisa no sino e desconecta".
2. **Ordem inversa** — o lojista reconecta o número dos grupos usando o chip que já era o do atendimento: cai o do atendimento, o dos grupos segue postando. Teste: Tarefa 8, "o número dos grupos conectando com o chip do atendimento derruba o do atendimento, nunca o dos grupos".
3. **Loja só com o número do atendimento** (o dos grupos nunca conectou, ou caiu): nada posta, sincroniza, cresce grupo ou reconta por ele, e a tela Conectar cria o número dos grupos em vez de mostrar o do atendimento. Testes: check SQL bloco 2 (Tarefa 1), "o número dos grupos caído vence o do atendimento conectado" (Tarefa 2), "pedir o Sincronizar com o id do número do atendimento é 409…" (Tarefa 5), "loja só com o número do atendimento: a lista do Conectar vem vazia" (Tarefa 7).
4. **Clique duplo / duas abas em "Conectar o número do atendimento"**: o segundo pedido vira 409 e não nasce uma segunda instância na Evolution. Teste: Tarefa 7, "segundo número do atendimento (clique duplo): 409 e nenhuma instância nova na Evolution".
5. **Add-on desligado com o número ainda conectado**: o lojista desconecta, não pareia de novo, e o alerta de queda dele não sai. Testes: Tarefa 8, "número do atendimento sem add-on não pareia…" e "sem add-on, desconectar…"; Tarefa 9, "número do atendimento caído avisa à parte, só com o Recuperar ou o Rastreio ligado".

## Mapa dos seletores (tudo o que lê "o número da loja")

Busca feita em `apps/web/src`, `apps/worker/src`, migrações e `hubflow-engine` por `.from("instances")`, `from public.instances`, `connected_at`, `status = 'connected'`, `listInstances`, `getSession`, `selectSessionRow`. Decisão para cada um:

| # | Onde | Pergunta que responde | Decisão (tarefa) |
|---|---|---|---|
| 1 | `app.enqueue_broadcast` (única porta dos posts: agora, agendado, recorrente, funil, aviso ao lotar) | qual número dispara | `and purpose = 'grupos'` (T1) |
| 2 | `app.instance_caps` | teto de post do número | zero linhas para `privado` (T1) |
| 3 | `app.claim_send_commands` | qual comando de post sai | sem mudança de corpo: o `cross join lateral app.instance_caps` já descarta o privado (check bloco 3). A trava formal nos dois sentidos é do PR 3 |
| 4 | `app.instance_health` → `/api/instances/health`, "Saúde do número", Job 6 do cron | saúde anti-ban | sem mudança de corpo: herda o zero linhas de `instance_caps` (check bloco 3) |
| 5 | `public.avaliar_disjuntor_saidas` (#525) | "a loja enviou nas últimas 3 h" | só envio de `grupos` (T1). O cancelamento já é só de `send_message`/`send_media`/`send_poll`: DM não cai (check bloco 4) |
| 6 | `pickSendInstance` ← `grow-deps.ts`, `bulk-deps.ts` | número do auto-grow e das ações em massa | só `purpose === "grupos"`; os dois deps passam a selecionar `purpose` (T2) |
| 7 | `listRecountTenants` (`recount-loop.ts`) | lojas para recontar | `.eq("purpose", "grupos")` (T2) |
| 8 | `send-loop.ts` `instanceName(id)` | nome do número do comando | sem mudança: resolve pelo `instance_id` do comando; a trava no sender é do PR 3 |
| 9 | `sincronizarGrupos` (`lib/groups/sincronizar.ts`) ← `/api/groups/sync`, `/api/groups/recount` | número que sincroniza | `listGroupInstances`; id explícito do atendimento → 409 (T5). O `ourPhones` dele fica com todos |
| 10 | `getSession` (`lib/session-store.ts`) ← `/api/session`, Início, barra, `campanhas/[slug]/messages` (portão de postar), `business-health`, `playbook` | "a sessão" | `.eq("purpose", "grupos")` (T6) |
| 11 | `setSession` (heartbeat da engine Baileys, sem chamador hoje) | instância mais recente | `.eq("purpose", "grupos")` (T6) |
| 12 | página Conectar (`selectSessionRow` sobre `GET /api/instances`) | o número da tela | `GET /api/instances` devolve só grupos (T7) |
| 13 | `carregarSessao` (`lib/painel/inicio-carga.ts`) | quem reconciliar antes de ler a sessão | `listGroupInstances` (T5) |
| 14 | `reconciliarConexoes` (`lib/instances/reconciliar-conexao.ts`) | recuperar `connection.update` perdido | recebe a lista de quem chama (grupos no Conectar e na sessão, atendimento no cartão); depois de promover, confere o número do atendimento (T8) |
| 15 | `/api/relampago/offers` | número que lê os participantes | `listGroupInstances` (T5) |
| 16 | `lib/bio/conferir.ts` | número que a bio não pode linkar | `listGroupInstances`: o do atendimento pode ir na bio, como a própria mensagem `NUMERO_CONECTADO` sugere (T5) |
| 17 | `assertPlanLimit("instances:create")` / `CAPABILITY_TABLE` | vaga de celular do plano | conta só `purpose = 'grupos'` (`countFilter`, T7) |
| 18 | `/api/cron/emails` Job 3 | número caído há mais de 2 h | avalia o dos grupos e o do atendimento separados (T9) |
| 19 | `/api/cron/emails` Job 1 | "já conectou?" (conta de 24–48 h) | sem mudança: onboarding de conta nova; o do atendimento exige add-on |
| 20 | webhook Evolution, `ourPhones` (`applyGroupDeltas`, `applyNewGroups`) | "esse telefone é nosso?" | sem mudança (spec) |
| 21 | webhook Evolution, `groups.upsert`/`group-participants.update` vindos do número do atendimento | importa grupo, mexe em `is_admin`, contagem, entradas/saídas, disjuntor, lead (worker) | ignorados e não gravados (T8) |
| 22 | webhook Evolution, `trackFunnelEvent("qr_connected")` | marco de ativação | sem mudança (`onlyFirst`) |
| 23 | `/admin`, `/admin/instancias`, `/admin/tenants/[id]`, `/api/admin/instances/rewebhook`, seeds, `dev-tools/reset` | visão e operação de admin | sem mudança: veem todos; o rewebhook precisa do número do atendimento |
| 24 | `hubflow-engine/supervisor.js` | legado (tabela `whatsapp_instances`) | sem mudança |

Fora da lista da spec e decididos aqui: 3, 4, 8, 11, 13 (já citado como "quem usa"), 14 (a conferência), 18 (Job 3 pedia conferência), 19, 21, 22, 23, 24.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `apps/web/supabase/migrations/20261029160000_numero_do_atendimento.sql` | os três corpos com `purpose` | 1 |
| `infra/tests/numero-do-atendimento-check.sql` | RED/GREEN da migração nos dois bancos | 1 |
| `apps/worker/src/pick-send-instance.ts`, `grow-deps.ts`, `bulk-deps.ts`, `recount-loop.ts` | o worker só usa o número dos grupos | 2 |
| `apps/web/src/lib/stores/instances.ts` | `purpose`, `listGroupInstances`, `getPrivadoInstance` | 3 |
| `apps/web/src/lib/privado/numero.ts` | `numeroDoAtendimento`, `privadoLiberado`, `pausaDoNumero`, `conferirNumeroDoAtendimento` | 4 |
| `apps/web/src/lib/groups/sincronizar.ts`, `lib/bio/conferir.ts`, `lib/painel/inicio-carga.ts`, `app/api/relampago/offers/route.ts` | seletores do web | 5 |
| `apps/web/src/lib/session-store.ts` | a sessão é a do número dos grupos | 6 |
| `apps/web/src/lib/billing/capability-limits.ts`, `entitlements.ts`, `app/api/instances/route.ts` | vaga só para grupos; criar o número do atendimento | 7 |
| `apps/web/src/app/api/instances/[id]/actions/route.ts`, `app/api/webhooks/evolution/route.ts`, `lib/instances/reconciliar-conexao.ts` | parear com portão, eventos de grupo ignorados, conferência ao abrir sessão | 8 |
| `apps/web/src/lib/email/numero-caido.ts`, `templates.ts`, `delivery-log.ts`, `app/api/cron/emails/route.ts` | alerta de queda dos dois números | 9 |
| `apps/web/src/lib/privado/cartao.ts`, `app/api/privado/numero/route.ts`, `components/privado/cartao-numero-do-atendimento.tsx`, `components/painel/conectar/vitrine/conectar-vitrine.tsx`, `app/painel/conectar/page.tsx`, `e2e/painel-numero-do-atendimento.spec.ts` | o cartão | 10 |

## Fatiamento em PRs (2a e 2b)

Dois PRs em sequência, o 2b de `origin/main` depois do merge do 2a (CLAUDE.md, "Regra de PR": o conjunto passa de 30 arquivos). As tarefas não mudam; muda só em qual PR cada uma entra.

| PR | Tarefas | Entrega | Fica de pé sozinho porque |
|---|---|---|---|
| **2a** `numero-seletores` | 1, 2, 3, 5, 6 e o fechamento (11) | O número do atendimento fora de todo seletor de "número da loja": banco (`enqueue_broadcast`, `instance_caps`, disjuntor; migração só de corpo, com trava de md5), worker (auto-grow, ações em massa, recontagem), store (`purpose`, `listGroupInstances`, `getPrivadoInstance`), Sincronizar, Relâmpago, bio, Início e a sessão | ainda não existe número `privado` (só o 2b cria): os seletores ficam prontos antes do primeiro |
| **2b** `numero-conectar` | 4, 7, 8, 9, 10 e o fechamento (11) | `lib/privado/numero.ts` (`numeroDoAtendimento`, `privadoLiberado`, `pausaDoNumero`, conferência do chip), vaga do plano só de grupos e `POST /api/instances` com `purpose: "privado"`, parear com o portão do add-on, eventos de grupo do número ignorados, alerta de queda dos dois números, o cartão e `GET /api/privado/numero` | usa a T3 e os seletores do 2a, já em `main` |

A Tarefa 11 fecha cada um. **2a:** Steps 1–5, 7 e 8 (migração e check em dev e prod) e o **Step 9 — redeploy do worker no Coolify antes de qualquer loja ganhar `recuperar_enabled` ou `rastreio_enabled`** (o worker antigo escolheria o número do atendimento para auto-grow e ações em massa). **2b:** Steps 1–4, o `gh pr checks` do Step 5 (sem check SQL: não há migração; o e2e `painel-numero-do-atendimento.spec.ts` é deste), o Step 6 (revisão de segurança do portão do add-on, do limite do plano e do webhook) e o 7. Steps 10 e 11 nos dois. O PR 3 depende do 2b (`numero.ts`); o PR 6 do Rastreio importa o cartão do 2b.

---

### Tarefa 1: Banco — o número do atendimento fora dos seletores de post

**Depende de:** nada (só do PR 1a aplicado).

**Files:**
- Create: `infra/tests/numero-do-atendimento-check.sql`
- Create: `apps/web/supabase/migrations/20261029160000_numero_do_atendimento.sql` (nome entre o do PR 1b, `20261029140000`, e o do PR 3, `20261030120000`, que depende deste; a ordem que vale é a do `apply-order.txt`)
- Modify: `deploy/supabase/apply-order.txt` (fim do arquivo)

**Interfaces:**
- Consumes (PR 1a): `instances.purpose`; `engine_commands.dm_module`, `engine_commands.valid_until` (só no check).
- Produces: `app.enqueue_broadcast` escolhe o número entre `purpose = 'grupos'`; `app.instance_caps(<id de um privado>)` devolve **zero linhas** (logo `public.instance_health` não lista o privado, `app.instance_daily_cap` dele é nulo e `app.claim_send_commands` não pega comando de post nele); `public.avaliar_disjuntor_saidas` só conta envio de `grupos`. **Para o PR 3:** o claim de DM não pode fazer `cross join lateral app.instance_caps(...)` (vem vazio para o privado).

- [ ] **Step 1: Conferir os corpos atuais nos dois bancos (só leitura).** A trava da migração recusa corpo diferente do repo; em prod isso só apareceria no `migrate-prod`, depois do merge.

```bash
cd apps/web
Q="select p.oid::regprocedure::text as f, md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) as md5, exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'instances' and column_name = 'purpose') as tem_purpose from pg_proc p where p.oid in (to_regprocedure('app.enqueue_broadcast(uuid,uuid)'), to_regprocedure('app.instance_caps(uuid)'), to_regprocedure('public.avaliar_disjuntor_saidas(uuid)'))"
npx supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
npx supabase db query --linked -o json "$Q"
npx supabase link --project-ref nidoatbxaylrkcgbszns --yes
npx supabase db query --linked -o json "$Q"
npx supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

Expected nos dois: `app.enqueue_broadcast(uuid,uuid)` → `1f4dd5f929572998777a1fd9c4901398`, `app.instance_caps(uuid)` → `b72a1efad9acd074f3b50f81811edf0f`, `avaliar_disjuntor_saidas(uuid)` → `13246a4fb89d8de0375c2d78fea3934a`, e `tem_purpose = true`. Qualquer diferença: parar e avisar o Igor (algum banco tem corpo aplicado à mão ou falta o PR 1a). Sem acesso a prod nesta máquina: pedir ao Igor o resultado da mesma consulta.

- [ ] **Step 2: Escrever o check** em `infra/tests/numero-do-atendimento-check.sql`, exatamente:

```sql
-- Conferência da migração 20261029160000_numero_do_atendimento.sql (o número do atendimento fica fora
-- de todo seletor de post no banco), nos DOIS bancos. Rodar de apps\web:
--   npx supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   npx supabase db query --linked -o json -f ../../infra/tests/numero-do-atendimento-check.sql
--
-- Tudo o que escreve fica entre begin e rollback: uma loja descartável (a7e0…) com o número dos grupos
-- conectado há 30 dias e o do atendimento conectado agora (é ele que o order by de antes escolhia), um
-- grupo administrado e comandos de envio. Cada bloco levanta 'FALHOU: …' e o script para ali. Sem erro,
-- a última linha traz r = 'ok'.
--
-- Antes da migração o bloco 1 falha com "o post saiu pelo número do atendimento": é o RED, e é também o
-- mutante — o corpo de hoje é o seletor sem o filtro.
--
-- Só toca a loja do check: enqueue_broadcast, o claim (p_tenant) e o disjuntor recebem o tenant dela.
-- Escreve, mesmo com rollback: em prod é do Igor.
--
-- O comando de DM do bloco 4 leva dm_module/valid_until (PR 1a) e private_message_id nulo. Se o PR 1a
-- tiver posto CHECK exigindo private_message_id em dm_text, criar antes a conversa e a mensagem da loja
-- do check e apontar para ela.

begin;

insert into public.organizations (id, tenant_id, name, slug) values
  ('a7e00000-0000-4000-8000-000000000001', 'a7e00000-0000-4000-8000-000000000001',
   'Check numero do atendimento', 'check-numero-atendimento-a7e0');

insert into public.instances (id, tenant_id, name, status, purpose, phone, provider_instance_id, connected_at) values
  ('a7e00000-0000-4000-8000-0000000000e1', 'a7e00000-0000-4000-8000-000000000001',
   'Check grupos', 'connected', 'grupos', '5562999990001', 'gr_check_atend_grupos', now() - interval '30 days'),
  ('a7e00000-0000-4000-8000-0000000000e2', 'a7e00000-0000-4000-8000-000000000001',
   'Check atendimento', 'connected', 'privado', '5562988880002', 'gr_check_atend_privado', now());

-- Um grupo administrado com 100 membros: limite do disjuntor = max(30, 1% de 100) = 30.
insert into public.groups (tenant_id, whatsapp_group_id, name, is_admin, members) values
  ('a7e00000-0000-4000-8000-000000000001', 'atend-g1@g.us', 'Check grupo 1', true, 100);

-- 1) O post sai pelo número dos grupos, mesmo com o do atendimento conectado depois.
do $$
declare
  t    constant uuid := 'a7e00000-0000-4000-8000-000000000001';
  g    constant uuid := 'a7e00000-0000-4000-8000-0000000000e1';
  v_id uuid;
  b    public.broadcasts;
begin
  insert into public.broadcasts (tenant_id, name, message, group_ids, status)
  values (t, 'Check atendimento A', 'oferta', array['atend-g1@g.us'], 'draft')
  returning id into v_id;
  b := app.enqueue_broadcast(t, v_id);
  if b.status is distinct from 'queued' or b.total <> 1 then
    raise exception 'FALHOU: o post deveria entrar na fila: status %, total %, error %', b.status, b.total, b.error;
  end if;
  if exists (select 1 from public.engine_commands c
             where c.origin_id = v_id and c.origin_run_id = b.run_id
               and c.instance_id is distinct from g) then
    raise exception 'FALHOU: o post saiu pelo número do atendimento';
  end if;
end $$;

-- 2) Só o número do atendimento conectado: o post falha como "sem número" e nenhum comando nasce.
do $$
declare
  t    constant uuid := 'a7e00000-0000-4000-8000-000000000001';
  g    constant uuid := 'a7e00000-0000-4000-8000-0000000000e1';
  v_id uuid;
  b    public.broadcasts;
begin
  update public.instances set status = 'disconnected' where id = g;
  insert into public.broadcasts (tenant_id, name, message, group_ids, status)
  values (t, 'Check atendimento B', 'oferta', array['atend-g1@g.us'], 'draft')
  returning id into v_id;
  b := app.enqueue_broadcast(t, v_id);
  if b.status is distinct from 'failed' or b.error is distinct from 'Nenhum número conectado para disparar.' then
    raise exception 'FALHOU: sem o número dos grupos o post deveria falhar como sem número: status %, error %',
      b.status, b.error;
  end if;
  if exists (select 1 from public.engine_commands c where c.origin_id = v_id) then
    raise exception 'FALHOU: nasceu comando de post sem o número dos grupos';
  end if;
  update public.instances set status = 'connected' where id = g;
end $$;

-- 3) Teto, saúde e claim: o número do atendimento não tem teto de post, não aparece na saúde do número e
--    o claim de post nunca pega comando de grupo nele; o comando do número dos grupos (bloco 1) sai.
do $$
declare
  t constant uuid := 'a7e00000-0000-4000-8000-000000000001';
  g constant uuid := 'a7e00000-0000-4000-8000-0000000000e1';
  p constant uuid := 'a7e00000-0000-4000-8000-0000000000e2';
begin
  if exists (select 1 from app.instance_caps(p)) then
    raise exception 'FALHOU: o número do atendimento ganhou teto de post';
  end if;
  if not exists (select 1 from app.instance_caps(g)) then
    raise exception 'FALHOU: o número dos grupos perdeu o teto de post';
  end if;
  if exists (select 1 from public.instance_health(t) h where h.instance_id = p) then
    raise exception 'FALHOU: o número do atendimento apareceu na saúde do número';
  end if;
  if not exists (select 1 from public.instance_health(t) h where h.instance_id = g) then
    raise exception 'FALHOU: o número dos grupos sumiu da saúde do número';
  end if;

  insert into public.engine_commands (id, tenant_id, instance_id, type, status, payload, available_at) values
    ('a7e00000-0000-4000-8000-0000000000c1', t, p, 'send_message', 'queued',
     '{"jid": "atend-g1@g.us", "text": "x"}', now());
  perform app.claim_send_commands(10, t);
  -- queued até o PR 3; depois dele, canceled com o motivo (o claim de grupos cancela comando de grupo em
  -- número que não é 'grupos'). Nos dois casos, nunca processing.
  if (select c.status from public.engine_commands c where c.id = 'a7e00000-0000-4000-8000-0000000000c1')
     not in ('queued', 'canceled') then
    raise exception 'FALHOU: o claim de post pegou comando de grupo no número do atendimento';
  end if;
  if not exists (select 1 from public.engine_commands c
                 where c.tenant_id = t and c.instance_id = g and c.status = 'processing') then
    raise exception 'FALHOU: o claim de post deveria ter pegado o comando do número dos grupos';
  end if;
end $$;

-- 4) Disjuntor: envio só do número do atendimento nas últimas 3 h não conta (sem_envio). Com envio do
--    número dos grupos, 30 saídas abrem o disjuntor e os posts na fila caem; o comando de DM fica.
do $$
declare
  t constant uuid := 'a7e00000-0000-4000-8000-000000000001';
  g constant uuid := 'a7e00000-0000-4000-8000-0000000000e1';
  p constant uuid := 'a7e00000-0000-4000-8000-0000000000e2';
  r jsonb;
begin
  insert into public.instance_sends (instance_id, sent_at) values (p, now() - interval '20 minutes');
  insert into public.engine_events (tenant_id, instance_id, type, payload, created_at)
  select t, g, 'group-participants.update',
         jsonb_build_object('data', jsonb_build_object(
           'id', 'atend-g1@g.us', 'action', 'remove', 'author', 'p' || n || '@lid',
           'participants', jsonb_build_array(jsonb_build_object('id', 'p' || n || '@lid')))),
         now() - interval '10 minutes'
  from generate_series(1, 30) n;

  r := public.avaliar_disjuntor_saidas(t);
  if (r->>'aberto')::boolean or r->>'motivo' is distinct from 'sem_envio' then
    raise exception 'FALHOU: envio só do número do atendimento não deveria contar para o disjuntor, veio %', r;
  end if;

  insert into public.instance_sends (instance_id, sent_at) values (g, now() - interval '20 minutes');
  insert into public.engine_commands (id, tenant_id, instance_id, type, status, payload, available_at,
                                      dm_module, valid_until) values
    ('a7e00000-0000-4000-8000-0000000000c2', t, p, 'dm_text', 'queued', '{}', now(),
     'teste', now() + interval '1 hour');
  r := public.avaliar_disjuntor_saidas(t);
  if not coalesce((r->>'aberto')::boolean, false) or not coalesce((r->>'novo')::boolean, false) then
    raise exception 'FALHOU: 30 saídas com envio do número dos grupos deveriam abrir o disjuntor, veio %', r;
  end if;
  if (select c.status from public.engine_commands c where c.id = 'a7e00000-0000-4000-8000-0000000000c2')
     is distinct from 'queued' then
    raise exception 'FALHOU: o disjuntor de saídas cancelou um comando de DM';
  end if;
  if exists (select 1 from public.engine_commands c
             where c.tenant_id = t and c.status = 'queued'
               and c.type in ('send_message', 'send_media', 'send_poll')) then
    raise exception 'FALHOU: o disjuntor deveria cancelar os posts na fila';
  end if;
end $$;

-- 5) Contrato: os corpos são os desta migração (md5 normalizado, como na trava), security definer com
--    search_path e execute só do service_role.
do $$
begin
  if exists (
    select 1
      from (values
        ('app.enqueue_broadcast(uuid,uuid)', '568df07ab69fc81d8473e724b81c69b4'),
        ('app.instance_caps(uuid)', 'e60de0eda8f02f171ec9cd2739cd0a7c'),
        ('public.avaliar_disjuntor_saidas(uuid)', '448edbce30d6ac74449ba9b7be6980ee')) as f(sig, md5)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) <> f.md5
  ) then
    raise exception 'FALHOU: corpo de função diferente do da migração 20261029160000';
  end if;

  if exists (
    select 1
      from (values
        ('app.enqueue_broadcast(uuid,uuid)'),
        ('app.instance_caps(uuid)'),
        ('public.avaliar_disjuntor_saidas(uuid)')) as f(sig)
      join pg_proc p on p.oid = to_regprocedure(f.sig)
     where not p.prosecdef
        or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'FALHOU: funções fora do contrato (security definer, search_path, execute só service_role)';
  end if;
end $$;

select 'ok' as r;

rollback;
```

- [ ] **Step 3: Rodar o check em dev, antes da migração (RED — e é o mutante: o corpo de hoje é o seletor sem o filtro).**

```bash
cd apps/web
npx supabase db query --linked -o json -f ../../infra/tests/numero-do-atendimento-check.sql
```

Expected: erro com `FALHOU: o post saiu pelo número do atendimento`.

- [ ] **Step 4: Escrever a migração** `apps/web/supabase/migrations/20261029160000_numero_do_atendimento.sql`, exatamente (os corpos são os de hoje com uma troca cada; os comentários dentro do corpo não entram no md5):

```sql
-- 2026-10-29 - Número do atendimento (Recuperar PR 2, comum com o Rastreio): no banco, quem escolhe
-- "o número da loja" passa a ver só o número dos grupos.
--
-- A loja ganha um segundo número, o do atendimento (instances.purpose = 'privado', PR 1a), que só fala
-- no privado e nunca posta em grupo. Spec: docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md,
-- §3 "Base do privado". Três corpos mudam, cada um com trava de md5 (molde de 20261026120000):
--
--   1. app.enqueue_broadcast: o número que dispara é o connected mais recente COM purpose = 'grupos'.
--      Sem isso, um número do atendimento conectado depois do dos grupos passaria a postar (o order by
--      é connected_at desc).
--   2. app.instance_caps: o número do atendimento não tem teto de post e devolve zero linhas. O claim de
--      post (cross join lateral) nunca pega comando de grupo nele, app.instance_health não o lista (a
--      saúde do número em /painel/conectar e o Job 6 do cron seguem só com o dos grupos) e
--      app.instance_daily_cap dele sai nulo.
--   3. public.avaliar_disjuntor_saidas: "a loja enviou nas últimas 3 h" conta só envio do número dos
--      grupos. O cancelamento já era só de send_message/send_media/send_poll: comando de DM (dm_text,
--      dm_image) não é tocado.
--
-- Corpo de função não entra no hash do gate de drift: não muda a baseline. Conferir com
-- infra/tests/numero-do-atendimento-check.sql nos dois bancos. Idempotente: create or replace, e cada
-- trava aceita o corpo anterior e o desta migração (reaplicar passa).

-- 0) Depende de instances.purpose (PR 1a). plpgsql não confere coluna ao criar a função: sem esta guarda
--    a migração passaria num banco sem a coluna e o envio quebraria na primeira chamada.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'instances' and column_name = 'purpose'
  ) then
    raise exception 'numero_do_atendimento: falta instances.purpose (migração do PR 1a)';
  end if;
end $$;

-- 1) app.enqueue_broadcast: corpo de 20261026120000 com uma troca (purpose = 'grupos' na escolha do número).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('app.enqueue_broadcast(uuid,uuid)');
  if v_src is null then
    raise exception 'numero_do_atendimento: app.enqueue_broadcast não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('1f4dd5f929572998777a1fd9c4901398', '568df07ab69fc81d8473e724b81c69b4') then
    raise exception 'numero_do_atendimento: o corpo de app.enqueue_broadcast neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça a troca e aplique de novo.';
  end if;
end $$;

create or replace function app.enqueue_broadcast(
  target_tenant_id uuid,
  target_broadcast_id uuid
)
returns public.broadcasts
language plpgsql
security definer
set search_path = public, app
as $$
declare
  b public.broadcasts;
  target_instance uuid;
  new_run_id uuid := gen_random_uuid();
  cmd_type text;
  jids text[];
  inserted integer := 0;
  msg text;
  media text;
  media_kind text;
  mention boolean;
  poll_question text;
  poll_options text[];
  v_teto integer := app.posts_por_grupo_dia();
  cheios text[];
  saindo integer := 0;
begin
  -- FOR UPDATE serializa duplo-clique no botão: o segundo espera o primeiro
  -- terminar e então cai no guard de status abaixo, em vez de fazer 2 fan-outs.
  select * into b
  from public.broadcasts
  where id = target_broadcast_id and tenant_id = target_tenant_id
  for update;

  if not found then
    return null;
  end if;

  -- Idempotente: já na fila / já rodando não refaz o fan-out. Mesmos estados que
  -- o enqueueBroadcast antigo aceitava (draft/sent/failed).
  if b.status not in ('draft', 'sent', 'failed') then
    return b;
  end if;

  msg := coalesce(b.message, '');
  media := b.media_id;
  mention := coalesce(b.mention_all, false);
  media_kind := case when b.media_type in ('video', 'document') then b.media_type else 'image' end;
  poll_question := nullif(b.poll ->> 'question', '');

  select coalesce(array_agg(value), '{}'::text[])
    into poll_options
  from jsonb_array_elements_text(coalesce(b.poll -> 'options', '[]'::jsonb)) as value
  where value <> '';

  -- Tipo do comando com a MESMA precedência do engine legado
  -- (hubflow-engine/index.js: enquete > mídia > texto).
  if poll_question is not null and coalesce(array_length(poll_options, 1), 0) >= 2 then
    cmd_type := 'send_poll';
  elsif media is not null then
    cmd_type := 'send_media';
  elsif msg <> '' then
    cmd_type := 'send_message';
  else
    update public.broadcasts
    set status = 'failed', error = 'Oferta sem conteúdo (texto, mídia ou enquete).',
        sent = 0, total = 0, dispatched_at = now(), updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  -- Número que vai disparar. Fixado agora: o comando carrega instance_id e o
  -- gate anti-ban é POR NÚMERO, então o alvo precisa ser conhecido no enfileiramento.
  select id into target_instance
  from public.instances
  where tenant_id = target_tenant_id
    -- Só o número dos grupos posta. O do atendimento (purpose = 'privado') nunca entra aqui, nem
    -- conectado depois: o order by abaixo o escolheria.
    and purpose = 'grupos'
    and status = 'connected'
    and provider_instance_id is not null
  order by connected_at desc nulls last, created_at asc
  limit 1;

  if target_instance is null then
    update public.broadcasts
    set status = 'failed', error = 'Nenhum número conectado para disparar.',
        sent = 0, total = 0, dispatched_at = now(), updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  -- Destinos: app.alvos_do_disparo (20261010120000) é a única definição. Sem regra
  -- (target_rule nulo) é o predicado de antes; com regra, os JIDs da regra na
  -- campanha, refeitos agora (spec D8).
  jids := app.alvos_do_disparo(b);

  if coalesce(array_length(jids, 1), 0) = 0 then
    update public.broadcasts
    set status = 'failed',
        error = case
          when b.target_rule is not null then 'Nenhum grupo nesta regra agora.'
          else 'Nenhum grupo de destino (verifique se o número é admin dos grupos).'
        end,
        sent = 0, total = 0, dispatched_at = now(), updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  -- Uma contagem por loja de cada vez: dois posts enfileirados juntos leriam o mesmo "3".
  -- ponytail: o lock vale até o fim da transação de QUEM CHAMA. Resta deadlock entre dois loops
  -- de várias lojas que pegam os locks em ordem diferente (duas réplicas do worker sobrepostas num
  -- deploy, ou o check rodado em prod contra o worker); o Postgres aborta um lado e o worker repete
  -- no próximo tick.
  perform pg_advisory_xact_lock(hashtextextended('posts_por_grupo:' || target_tenant_id::text, 0));
  select coalesce(array_agg(h.jid), '{}') into cheios
  from app.posts_hoje_por_grupo(target_tenant_id) h
  where h.posts >= v_teto and h.jid = any(jids);

  -- Um comando por grupo. priority 100 = fan-out (ver engine_queue_v2).
  -- O payload é o contrato que apps/worker/src/send-command.ts consome.
  with ins as (
    insert into public.engine_commands (
      tenant_id, instance_id, type, status, payload, priority, dedupe_key,
      origin_kind, origin_id, origin_run_id, error
    )
    select
      target_tenant_id,
      target_instance,
      cmd_type,
      -- Grupo no teto: o comando nasce canceled, marcado e com o motivo; não sai e não conta.
      (case when t.jid = any(cheios) then 'canceled' else 'queued' end)::public.engine_command_status,
      case cmd_type
        when 'send_poll' then jsonb_build_object(
          'jid', t.jid, 'question', poll_question, 'options', to_jsonb(poll_options))
        when 'send_media' then jsonb_build_object(
          'jid', t.jid, 'mediaId', media, 'mediaType', media_kind,
          'caption', msg, 'mentionAll', mention, 'fileName', b.media_name)
        else jsonb_build_object(
          'jid', t.jid, 'text', msg, 'mentionAll', mention)
      end
        || case when t.jid = any(cheios) then jsonb_build_object('foraDoTeto', true) else '{}'::jsonb end,
      100,
      -- run_id na chave: sem ele, reenviar a MESMA oferta bateria no índice
      -- único, inseriria 0 linhas e o disparo sumiria em silêncio.
      'bc:' || target_broadcast_id::text || ':' || new_run_id::text || ':' || t.jid,
      'broadcast',
      target_broadcast_id,
      new_run_id,
      case when t.jid = any(cheios) then format(
        'Não enviado: este grupo já recebeu %s posts hoje (limite do anti-ban). Volta à meia-noite.', v_teto)
      end
    from unnest(jids) as t(jid)
    on conflict (tenant_id, dedupe_key) where dedupe_key is not null do nothing
    returning status
  )
  -- inserted = todas as linhas (total do post, inclui as de fora); saindo = só as que vão para a fila.
  select count(*)::integer, (count(*) filter (where ins.status = 'queued'))::integer
    into inserted, saindo
  from ins;

  -- Todos de fora: nenhum comando sai. O post vira failed numa rodada nova, com as linhas de fora
  -- nela, para a coluna do post mostrar "limite do dia" em cada grupo.
  if saindo = 0 then
    update public.broadcasts
    set
      run_id = new_run_id,
      status = 'failed',
      sent = 0,
      total = inserted,
      error = format(
        'Nenhum grupo recebeu: todos já tinham %s posts hoje. O limite volta à meia-noite.', v_teto),
      dispatched_at = now(),
      running_since = now(),
      last_ack_at = now(),
      updated_at = now()
    where id = target_broadcast_id
    returning * into b;
    return b;
  end if;

  update public.broadcasts
  set
    run_id = new_run_id,
    status = 'queued',
    sent = 0,
    total = inserted,
    error = null,
    dispatched_at = null,
    running_since = now(),
    last_ack_at = now(),
    updated_at = now()
  where id = target_broadcast_id
  returning * into b;

  return b;
end;
$$;

-- create or replace não preserva o ACL em todo banco (ver 20260904100000): explícito sempre.
revoke all on function app.enqueue_broadcast(uuid, uuid) from public, anon, authenticated;
grant execute on function app.enqueue_broadcast(uuid, uuid) to service_role;

-- 2) app.instance_caps: corpo de 20260904100000 com uma troca (zero linhas para o número do atendimento).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('app.instance_caps(uuid)');
  if v_src is null then
    raise exception 'numero_do_atendimento: app.instance_caps não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('b72a1efad9acd074f3b50f81811edf0f', 'e60de0eda8f02f171ec9cd2739cd0a7c') then
    raise exception 'numero_do_atendimento: o corpo de app.instance_caps neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça a troca e aplique de novo.';
  end if;
end $$;

create or replace function app.instance_caps(target_instance_id uuid)
returns table (
  perfil       text,
  per_min      integer,
  per_hour     integer,
  per_day      integer,
  admin_groups integer,
  warmup_day   integer,
  graduated    boolean
)
language plpgsql
stable
security definer
set search_path = public, app
as $$
declare
  v_declared  text;
  v_tenant    uuid;
  v_groups    integer := 0;
  v_graduated boolean := false;
  v_started   timestamptz;
  v_day       integer := 0;
  v_ramp      integer;
  v_purpose   text;
begin
  select i.numero_perfil, i.tenant_id, i.purpose into v_declared, v_tenant, v_purpose
    from public.instances i
   where i.id = target_instance_id;

  -- O número do atendimento não tem teto de post: zero linhas. O claim de post nunca pega comando
  -- dele e app.instance_health não o lista. O ritmo do privado é outro (PR 3).
  if v_purpose = 'privado' then
    return;
  end if;

  if v_tenant is not null then
    -- Evidência: grupos que o número administra com gente de verdade.
    select count(*)::int into v_groups
      from public.groups g
     where g.tenant_id = v_tenant and g.is_admin and g.members >= 10;

    select coalesce(s.warmup_graduated, false), s.warmup_started_at
      into v_graduated, v_started
      from public.instance_send_state s
     where s.instance_id = target_instance_id;
    v_graduated := coalesce(v_graduated, false);

    if v_started is not null then
      v_day := floor(extract(epoch from now() - v_started) / 86400)::int;
    end if;
    if v_day >= 7 then
      v_graduated := true;
    end if;
  end if;

  if v_graduated
     or (v_declared is distinct from 'novo' and (v_declared = 'antigo' or v_groups >= 5)) then
    return query select
      'veterano'::text,
      10,
      least(400, greatest(60, v_groups * 3)),
      least(1500, greatest(300, v_groups * 15)),
      v_groups,
      v_day + 1,
      true;
    return;
  end if;

  -- Novo: rampa de 7 dias (40, 64, 102, 164, 262, 419, 671), limitada pelos grupos.
  v_ramp := round(40 * power(1.6, v_day))::int;
  return query select
    'novo'::text,
    8,
    least(150, greatest(40, v_ramp)),
    least(800, greatest(40, v_groups * 6), v_ramp),
    v_groups,
    v_day + 1,
    false;
end;
$$;

revoke all on function app.instance_caps(uuid) from public, anon, authenticated;
grant execute on function app.instance_caps(uuid) to service_role;

-- 3) public.avaliar_disjuntor_saidas: corpo de 20261023120000 com uma troca (só envio do número dos grupos).
do $$
declare
  v_src text;
begin
  select p.prosrc into v_src
  from pg_proc p
  where p.oid = to_regprocedure('public.avaliar_disjuntor_saidas(uuid)');
  if v_src is null then
    raise exception 'numero_do_atendimento: public.avaliar_disjuntor_saidas não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('13246a4fb89d8de0375c2d78fea3934a', '448edbce30d6ac74449ba9b7be6980ee') then
    raise exception 'numero_do_atendimento: o corpo de public.avaliar_disjuntor_saidas neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça a troca e aplique de novo.';
  end if;
end $$;

create or replace function public.avaliar_disjuntor_saidas(p_tenant uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_until    timestamptz;
  v_saidas   integer;
  v_limite   integer;
  v_cancel   integer;
begin
  -- Uma avaliação por loja de cada vez: dois números no mesmo grupo recebem a mesma saída e
  -- chamariam isto em paralelo, abrindo (e notificando) duas vezes.
  perform pg_advisory_xact_lock(hashtextextended('exit_breaker:' || p_tenant::text, 0));

  select b.until into v_until from app.exit_breaker b where b.tenant_id = p_tenant;
  if v_until > now() then
    return jsonb_build_object('aberto', true, 'novo', false, 'ate', v_until);
  end if;

  -- Sem envio nas últimas 3 h não há o que pausar (e a saída não veio de post nosso).
  if not exists (
    select 1 from public.instance_sends x
    join public.instances i on i.id = x.instance_id
    -- Só envio do número dos grupos: mensagem no privado não é post e não explica saída de grupo.
    where i.tenant_id = p_tenant and i.purpose = 'grupos' and x.sent_at > now() - interval '3 hours'
  ) then
    return jsonb_build_object('aberto', false, 'motivo', 'sem_envio');
  end if;

  -- Saída voluntária = o autor do remove é o próprio participante (remoção por admin, incluindo
  -- o "remover duplicados", fica de fora). Só grupos que a loja administra. Pessoa contada uma vez
  -- por grupo (dois números da loja recebem o mesmo aviso).
  select count(*) into v_saidas
  from (
    select distinct e.payload #>> '{data,id}', p ->> 'id'
    from public.engine_events e
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(e.payload #> '{data,participants}') = 'array'
           then e.payload #> '{data,participants}' else '[]'::jsonb end) p
    where e.tenant_id = p_tenant
      and e.type = 'group-participants.update'
      and e.created_at > now() - interval '3 hours'
      and e.payload #>> '{data,action}' = 'remove'
      and p ->> 'id' = e.payload #>> '{data,author}'
      and exists (
        select 1 from public.groups g
        where g.tenant_id = p_tenant and g.is_admin
          and g.whatsapp_group_id = e.payload #>> '{data,id}'
      )
  ) s;

  v_limite := app.exit_breaker_limit(p_tenant);
  if v_saidas < v_limite then
    return jsonb_build_object('aberto', false, 'saidas', v_saidas, 'limite', v_limite);
  end if;

  v_until := now() + interval '6 hours';
  insert into app.exit_breaker (tenant_id, tripped_at, until, saidas, limite)
  values (p_tenant, now(), v_until, v_saidas, v_limite)
  on conflict (tenant_id) do update
    set tripped_at = excluded.tripped_at, until = excluded.until,
        saidas = excluded.saidas, limite = excluded.limite;

  -- O que já está na fila não sai: reconcile_broadcast_progress fecha a oferta com este motivo.
  update public.engine_commands c
  set status = 'canceled',
      error = 'Não enviado: o anti-ban pausou os posts porque muita gente saiu dos grupos logo depois dos últimos posts.',
      lease_expires_at = null,
      updated_at = now()
  where c.tenant_id = p_tenant
    and c.status = 'queued'
    and c.type in ('send_message', 'send_media', 'send_poll');
  get diagnostics v_cancel = row_count;

  insert into public.notifications (tenant_id, type, title, body, href)
  values (
    p_tenant,
    'antiban_saidas',
    'Posts pausados por 6 horas',
    format('%s pessoas saíram dos grupos nas últimas 3 horas, logo depois dos posts. Isso é o sinal que o WhatsApp usa para restringir o número, então pausamos os envios até %s. Evite marcar todos e espace os posts.',
           v_saidas, to_char(v_until at time zone 'America/Sao_Paulo', 'HH24:MI')),
    '/painel/conectar'
  );

  return jsonb_build_object('aberto', true, 'novo', true, 'ate', v_until,
                            'saidas', v_saidas, 'limite', v_limite, 'cancelados', v_cancel);
end;
$$;

revoke all on function public.avaliar_disjuntor_saidas(uuid) from public, anon, authenticated;
grant execute on function public.avaliar_disjuntor_saidas(uuid) to service_role;
```

- [ ] **Step 5: Linha no fim de `deploy/supabase/apply-order.txt`** (depois da linha do PR 1a):

```text
# 29/10: número do atendimento (Recuperar PR 2, comum com o Rastreio). app.enqueue_broadcast só dispara pelo
# número dos grupos (instances.purpose = 'grupos'); app.instance_caps devolve zero linhas para o número do
# atendimento (fica fora do claim de post e da saúde); public.avaliar_disjuntor_saidas só conta envio do número
# dos grupos. Só corpo, com trava de md5: não muda a baseline. Depende de instances.purpose (PR 1a). Conferir
# com infra/tests/numero-do-atendimento-check.sql nos dois bancos.
apps/web/supabase/migrations/20261029160000_numero_do_atendimento.sql
```

- [ ] **Step 6: Recalcular do repo os md5 da trava** (prova que o corpo copiado é o de hoje com só a troca):

```bash
node - <<'EOF'
const fs = require("fs");
const { createHash } = require("crypto");
const md5n = (s) => createHash("md5").update(s.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim(), "utf8").digest("hex");
const corpo = (t, cab) => { const i = t.indexOf(cab); if (i < 0) throw new Error(cab); const s = t.indexOf("as $$", i) + 5; return t.slice(s, t.indexOf("$$;", s)); };
const M = "apps/web/supabase/migrations/";
const nova = fs.readFileSync(M + "20261029160000_numero_do_atendimento.sql", "utf8");
for (const [nome, antiga, cab] of [
  ["app.enqueue_broadcast", "20261026120000_teto_posts_por_grupo.sql", "create or replace function app.enqueue_broadcast("],
  ["app.instance_caps", "20260904100000_perfil_do_numero_e_caps.sql", "create or replace function app.instance_caps("],
  ["public.avaliar_disjuntor_saidas", "20261023120000_antiban_saidas_e_todos.sql", "create or replace function public.avaliar_disjuntor_saidas("],
]) {
  const antes = md5n(corpo(fs.readFileSync(M + antiga, "utf8"), cab));
  const depois = md5n(corpo(nova, cab));
  console.log(nome, antes, depois, "na trava:", nova.includes(`'${antes}', '${depois}'`));
}
EOF
```

Expected:

```text
app.enqueue_broadcast 1f4dd5f929572998777a1fd9c4901398 568df07ab69fc81d8473e724b81c69b4 na trava: true
app.instance_caps b72a1efad9acd074f3b50f81811edf0f e60de0eda8f02f171ec9cd2739cd0a7c na trava: true
public.avaliar_disjuntor_saidas 13246a4fb89d8de0375c2d78fea3934a 448edbce30d6ac74449ba9b7be6980ee na trava: true
```

- [ ] **Step 7: Commit.** O GREEN do check roda na Tarefa 11, depois que o `migrate-dev` aplicar.

```bash
git add infra/tests/numero-do-atendimento-check.sql apps/web/supabase/migrations/20261029160000_numero_do_atendimento.sql deploy/supabase/apply-order.txt
git commit -m "feat(db): keep the attendance number out of every post selector" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 2: Worker — auto-grow, ações em massa e recontagem só com o número dos grupos

**Depende de:** nada.

**Files:**
- Modify: `apps/worker/src/pick-send-instance.ts`
- Modify: `apps/worker/src/grow-deps.ts:47-49` (o `select`)
- Modify: `apps/worker/src/bulk-deps.ts:61-64` (o `select`)
- Modify: `apps/worker/src/recount-loop.ts:86-92` (`listRecountTenants`)
- Test: `apps/worker/src/pick-send-instance.test.ts`, `apps/worker/src/recount-loop.test.ts`

**Interfaces:**
- Produces: `InstanceRow` ganha `purpose?: string | null`. `pickSendInstance` descarta toda linha com `purpose !== "grupos"` antes das regras de hoje — inclusive linha sem a coluna (select que esqueceu `purpose` falha fechado). `grow-deps` seleciona `"id, status, provider_instance_id, created_at, phone, purpose"`; `bulk-deps`, `"id, status, provider_instance_id, created_at, purpose"`. `listRecountTenants` filtra `status = connected` **e** `purpose = grupos`.

- [ ] **Step 1: Testes que falham.** Em `pick-send-instance.test.ts`, o `inst()` passa a ter `purpose: "grupos"` no padrão, e entram:

```ts
test("o número do atendimento nunca é escolhido, nem sendo o único", () => {
  assert.equal(pickSendInstance([inst({ id: "atendimento", purpose: "privado" })]), null);
});

// Auto-grow e ações em massa criam e mexem em grupo: pelo número do atendimento, nunca.
test("o número dos grupos caído vence o do atendimento conectado", () => {
  const escolhida = pickSendInstance([
    inst({ id: "atendimento", purpose: "privado", status: "connected", created_at: "2026-07-01T00:00:00.000Z" }),
    inst({ id: "grupos", purpose: "grupos", status: "disconnected", created_at: "2026-08-01T00:00:00.000Z" }),
  ]);
  assert.equal(escolhida, "grupos");
});

test("linha sem purpose (o select esqueceu a coluna) não serve", () => {
  assert.equal(pickSendInstance([inst({ purpose: undefined })]), null);
});
```

Em `recount-loop.test.ts`, o `supabaseFalso` passa a anotar cada `eq` (o `select` devolve uma cadeia com `eq(coluna, valor)` que empurra `[coluna, valor]` em `consulta.filtros` e devolve a própria cadeia, e um `then(pronto)` que entrega `{ data: linhas, error: null }`), e o teste "lojas = quem tem número conectado…" passa a afirmar:

```ts
assert.deepEqual(s.consulta, {
  tabela: "instances",
  colunas: "tenant_id",
  filtros: [["status", "connected"], ["purpose", "grupos"]],
});
```

- [ ] **Step 2: Rodar e ver falhar.**

Run: `npm --workspace apps/worker exec -- tsx --test src/pick-send-instance.test.ts src/recount-loop.test.ts`
Expected: FAIL em "o número do atendimento nunca é escolhido…", "o número dos grupos caído vence…", "linha sem purpose…" e "lojas = quem tem número conectado…".

- [ ] **Step 3: Implementar** o filtro no começo de `pickSendInstance` (antes do de `provider_instance_id`), os dois `select` e o segundo `.eq("purpose", "grupos")` em `listRecountTenants` (docstring: "Lojas distintas com ao menos um número dos grupos `connected`").

- [ ] **Step 4: Rodar e ver passar; tipos do worker.**

Run: `npm --workspace apps/worker exec -- tsx --test src/pick-send-instance.test.ts src/recount-loop.test.ts`
Expected: PASS, `fail 0`.
Run: `npm --workspace apps/worker exec tsc -- --noEmit`
Expected: sem saída.

- [ ] **Step 5: Commit.**

```bash
git add apps/worker/src/pick-send-instance.ts apps/worker/src/pick-send-instance.test.ts apps/worker/src/grow-deps.ts apps/worker/src/bulk-deps.ts apps/worker/src/recount-loop.ts apps/worker/src/recount-loop.test.ts
git commit -m "feat(worker): only the groups number grows, bulk-edits and recounts groups" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Mutantes.** (a) Tirar o filtro de `purpose` de `pickSendInstance` → rodar o Step 4 → FAIL em "o número dos grupos caído vence…". (b) Tirar o `.eq("purpose", "grupos")` de `listRecountTenants` → FAIL em "lojas = quem tem número conectado…". Desfazer com `git checkout -- apps/worker/src` e conferir `git status` limpo.

---

### Tarefa 3: Store de instâncias — `purpose`, números dos grupos e número do atendimento

**Depende de:** nada.

**Files:**
- Modify: `apps/web/src/lib/stores/instances.ts`
- Create: `apps/web/src/lib/stores/instances.test.ts`

**Interfaces:**
- Produces:

```ts
export type InstancePurpose = "grupos" | "privado";
// Instance ganha `purpose: InstancePurpose`; LIST_COLUMNS (e portanto FULL_COLUMNS) passa a trazer `purpose`.
/** Os números que postam. Todo seletor de "número da loja" usa esta. */
export async function listGroupInstances(tenantId: string): Promise<Instance[]>; // .eq("purpose", "grupos"), created_at asc
/** O número do atendimento da loja: no máximo um (índice único parcial do PR 1a). */
export async function getPrivadoInstance(tenantId: string): Promise<Instance | null>; // .eq("purpose", "privado").maybeSingle()
```

`listInstances` não muda e ganha no docstring: "Todos os números da loja, inclusive o do atendimento. Para escolher o número que posta, `listGroupInstances`."

- [ ] **Step 1: Testes que falham** — PostgREST falso no molde de `src/lib/stores/posts-hoje.test.ts` (anota método e URL, responde `resposta`):

```ts
test("listGroupInstances pede só os números dos grupos da loja, com o purpose no select", async () => {
  pedidos.length = 0;
  resposta = [{ id: "g", purpose: "grupos" }];
  await listGroupInstances("loja-a");
  const [p] = pedidos;
  assert.equal(p.url.pathname, "/rest/v1/instances");
  assert.equal(p.url.searchParams.get("tenant_id"), "eq.loja-a");
  // Mutante: sem o filtro, o número do atendimento entra em todo seletor de post.
  assert.equal(p.url.searchParams.get("purpose"), "eq.grupos");
  assert.equal(p.url.searchParams.get("order"), "created_at.asc");
  assert.match(p.url.searchParams.get("select") ?? "", /\bpurpose\b/);
});

test("listInstances continua vendo todos os números da loja", async () => {
  pedidos.length = 0;
  resposta = [];
  await listInstances("loja-a");
  assert.equal(pedidos[0].url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(pedidos[0].url.searchParams.get("purpose"), null);
});

test("getPrivadoInstance pede o número do atendimento da loja e devolve null sem linha", async () => {
  pedidos.length = 0;
  resposta = [];
  assert.equal(await getPrivadoInstance("loja-a"), null);
  assert.equal(pedidos[0].url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(pedidos[0].url.searchParams.get("purpose"), "eq.privado");
  resposta = [{ id: "p", purpose: "privado" }];
  assert.equal((await getPrivadoInstance("loja-a"))?.id, "p");
});
```

- [ ] **Step 2: Rodar e ver falhar.**

Run: `npm --workspace apps/web exec -- tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/instances.test.ts`
Expected: FAIL (`listGroupInstances`/`getPrivadoInstance` não exportadas).

- [ ] **Step 3: Implementar** o tipo, as colunas e as duas funções no molde de `listInstances`/`getInstance`.

- [ ] **Step 4: Rodar e ver passar.** Mesmo comando: PASS, `fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/lib/stores/instances.ts apps/web/src/lib/stores/instances.test.ts
git commit -m "feat(instances): purpose column, groups-only list and the attendance number lookup" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Mutante.** Tirar o `.eq("purpose", "grupos")` de `listGroupInstances` → Step 4 → FAIL no primeiro teste. `git checkout -- apps/web/src/lib/stores/instances.ts`.

---

### Tarefa 4: `lib/privado/numero.ts` — o número, a liberação, a pausa e a conferência

**Depende de:** Tarefa 3.

**Files:**
- Create: `apps/web/src/lib/privado/numero.ts`
- Create: `apps/web/src/lib/privado/numero.test.ts`

**Interfaces:**
- Consumes: `getPrivadoInstance`, `listInstances`, `updateInstanceStatus` (Tarefa 3 / store); `logoutInstance`, `providerInstanceId` (`@/lib/evolution/client`); `chaveDoTelefone` (`@/lib/pages/phone`). Do PR 1a: `tenant_settings.recuperar_enabled`, `rastreio_enabled`; `private_number_state` com `tenant_id`, `instance_id` **único** (PK ou unique — o `on_conflict` depende disso), `ramp_started_at`, `healthy_since`, `paused_until`.
- Produces (o contrato do índice para `numeroDoAtendimento`, mais o que este PR precisa):

```ts
import "server-only";
export type NumeroDoAtendimento = { instanceId: string; instanceName: string; status: string; phone: string | null };
export const PRIVADO_SEM_ADDON = "O número do atendimento vem com o Recuperar ou o Rastreio. Ative um deles primeiro.";
/** Valor de `instances.metadata.privado_recusado` quando o chip é o dos grupos. */
export const CHIP_DOS_GRUPOS = "numero_dos_grupos";
export type ConferenciaDoNumero = "sem_numero" | "nada_a_fazer" | "recusado" | "ok";

/** `instanceName` = provider_instance_id ?? providerInstanceId(id). Qualquer status (quem chama olha). */
export async function numeroDoAtendimento(tenantId: string): Promise<NumeroDoAtendimento | null>;
/** recuperar_enabled || rastreio_enabled. Sem linha → false. Erro de leitura → lança (quem chama fecha). */
export async function privadoLiberado(tenantId: string): Promise<boolean>;
/** private_number_state.paused_until do número, ou null. */
export async function pausaDoNumero(tenantId: string, instanceId: string): Promise<string | null>;
/** Roda quando qualquer número da loja abre sessão (webhook e reconciliação). */
export async function conferirNumeroDoAtendimento(tenantId: string): Promise<ConferenciaDoNumero>;
```

O PR 3 reexporta `numeroDoAtendimento` de `dm.ts` (índice).

- [ ] **Step 1: Testes que falham** — um servidor falso para PostgREST e Evolution no molde de `src/lib/groups/sincronizar.test.ts` (resposta por `"MÉTODO /caminho"`, função ou valor; chamada imprevista = 500; `EVOLUTION_API_URL` aponta para ele). Fixtures (telefones inventados): `GRUPOS = { id: "inst-g", tenant_id: LOJA, purpose: "grupos", status: "connected", phone: "556299990001", provider_instance_id: "gr_inst-g", metadata: {}, … }`, `ATENDIMENTO = { id: "inst-p", purpose: "privado", status: "connected", phone: "5562988880002", provider_instance_id: "gr_inst-p", metadata: {}, … }`, `MESMO_CHIP = { ...ATENDIMENTO, phone: "62999990001" }` (sem 55, com o 9: mesma chave `6299990001` do `GRUPOS`). `prepara({ instancias?, settings?, estado?, logout? })` zera `chamadas` e monta as respostas: `GET /rest/v1/instances` → `instancias` (filtradas por `purpose=eq.X` quando vier); `GET /rest/v1/tenant_settings` → `settings` como lista de uma linha (`null` → `[]`, `"erro"` → 500); `GET /rest/v1/private_number_state` → `estado`; `POST /rest/v1/private_number_state` → 201; `POST /rest/v1/rpc/update_instance_status` → 200; `POST /rest/v1/notifications` → 201; `DELETE /instance/logout/gr_inst-p` → `logout` (padrão 200). Cada chamada guarda `metodo`, `url`, `corpo` e o header `prefer`.

```ts
test("numeroDoAtendimento devolve o número da loja no formato do contrato", async () => {
  prepara({ instancias: [ATENDIMENTO] });
  assert.deepEqual(await numeroDoAtendimento(LOJA), {
    instanceId: "inst-p", instanceName: "gr_inst-p", status: "connected", phone: "5562988880002",
  });
  const [leitura] = feitas("GET", "/rest/v1/instances");
  assert.equal(leitura.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(leitura.url.searchParams.get("purpose"), "eq.privado");
});

test("sem número do atendimento, numeroDoAtendimento é null", async () => {
  prepara({ instancias: [] });
  assert.equal(await numeroDoAtendimento(LOJA), null);
});

test("privadoLiberado: o Recuperar ou o Rastreio liberam; nenhum dos dois, ou loja sem linha, não", async () => {
  const casos: [Record<string, boolean> | null, boolean][] = [
    [{ recuperar_enabled: true, rastreio_enabled: false }, true],
    [{ recuperar_enabled: false, rastreio_enabled: true }, true],
    [{ recuperar_enabled: false, rastreio_enabled: false }, false],
    [null, false],
  ];
  for (const [linha, esperado] of casos) {
    prepara({ settings: linha });
    assert.equal(await privadoLiberado(LOJA), esperado, JSON.stringify(linha));
    assert.equal(feitas("GET", "/rest/v1/tenant_settings")[0].url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  }
});

test("privadoLiberado lança se a leitura falha (quem chama decide fechado)", async () => {
  prepara({ settings: "erro" });
  await assert.rejects(privadoLiberado(LOJA));
});

test("pausaDoNumero lê a pausa do número da loja", async () => {
  prepara({ estado: [{ paused_until: "2026-10-30T17:30:00+00:00" }] });
  assert.equal(await pausaDoNumero(LOJA, "inst-p"), "2026-10-30T17:30:00+00:00");
  const [leitura] = feitas("GET", "/rest/v1/private_number_state");
  assert.equal(leitura.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(leitura.url.searchParams.get("instance_id"), "eq.inst-p");
  prepara({ estado: [] });
  assert.equal(await pausaDoNumero(LOJA, "inst-p"), null);
});

test("chip dos grupos no número do atendimento, com o 9 e o 55 diferentes: recusa, avisa no sino e desconecta", async () => {
  prepara({ instancias: [MESMO_CHIP, GRUPOS] });
  assert.equal(await conferirNumeroDoAtendimento(LOJA), "recusado");
  const atualizacoes = feitas("POST", "/rest/v1/rpc/update_instance_status").map((c) => c.corpo as Record<string, unknown>);
  assert.equal(atualizacoes.length, 1);
  assert.equal(atualizacoes[0].target_tenant_id, LOJA);
  assert.equal(atualizacoes[0].target_instance_id, "inst-p"); // o dos grupos nunca é tocado
  assert.equal(atualizacoes[0].target_status, "disconnected");
  assert.deepEqual(atualizacoes[0].target_metadata, { privado_recusado: "numero_dos_grupos" });
  const [aviso] = feitas("POST", "/rest/v1/notifications").map((c) => c.corpo as Record<string, unknown>);
  assert.equal(aviso.tenant_id, LOJA);
  assert.equal(aviso.type, "privado_recusado");
  assert.equal(aviso.href, "/painel/conectar");
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 1);
  assert.equal(feitas("POST", "/rest/v1/private_number_state").length, 0);
});

test("recusa repetida não avisa de novo no sino", async () => {
  prepara({ instancias: [{ ...MESMO_CHIP, metadata: { privado_recusado: "numero_dos_grupos" } }, GRUPOS] });
  assert.equal(await conferirNumeroDoAtendimento(LOJA), "recusado");
  assert.equal(feitas("POST", "/rest/v1/notifications").length, 0);
});

test("Evolution fora no logout não desfaz a recusa", async () => {
  prepara({ instancias: [MESMO_CHIP, GRUPOS], logout: { status: 500, corpo: { message: "fora" } } });
  assert.equal(await conferirNumeroDoAtendimento(LOJA), "recusado");
  assert.equal(feitas("POST", "/rest/v1/rpc/update_instance_status").length, 1);
});

test("chip próprio: cria o estado do número sem reiniciar a rampa de quem já tinha", async () => {
  prepara({ instancias: [ATENDIMENTO, GRUPOS] });
  assert.equal(await conferirNumeroDoAtendimento(LOJA), "ok");
  const [estado] = feitas("POST", "/rest/v1/private_number_state");
  assert.equal(estado.url.searchParams.get("on_conflict"), "instance_id");
  assert.match(estado.prefer, /resolution=ignore-duplicates/);
  const linha = ([] as Record<string, unknown>[]).concat(estado.corpo as Record<string, unknown>)[0];
  assert.equal(linha.tenant_id, LOJA);
  assert.equal(linha.instance_id, "inst-p");
  assert.equal(typeof linha.ramp_started_at, "string");
  assert.equal(linha.healthy_since, linha.ramp_started_at);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 0);
  assert.equal(feitas("POST", "/rest/v1/rpc/update_instance_status").length, 0);
});

test("chip próprio depois de uma recusa limpa a marca da recusa", async () => {
  prepara({ instancias: [{ ...ATENDIMENTO, metadata: { privado_recusado: "numero_dos_grupos" } }, GRUPOS] });
  assert.equal(await conferirNumeroDoAtendimento(LOJA), "ok");
  const [rpc] = feitas("POST", "/rest/v1/rpc/update_instance_status").map((c) => c.corpo as Record<string, unknown>);
  assert.equal(rpc.target_status, "connected");
  assert.deepEqual(rpc.target_metadata, { privado_recusado: null });
});

test("loja sem número do atendimento: uma leitura só, nada mais", async () => {
  prepara({ instancias: [GRUPOS] });
  assert.equal(await conferirNumeroDoAtendimento(LOJA), "sem_numero");
  assert.equal(chamadas.length, 1);
});

test("número do atendimento fora do ar, ou aberto sem telefone: nada a fazer", async () => {
  for (const atendimento of [{ ...MESMO_CHIP, status: "qr" }, { ...ATENDIMENTO, phone: null }]) {
    prepara({ instancias: [atendimento, GRUPOS] });
    assert.equal(await conferirNumeroDoAtendimento(LOJA), "nada_a_fazer");
    assert.equal(chamadas.length, 1);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar.**

Run: `npm --workspace apps/web exec -- tsx --import ./src/test/server-only-shim.mjs --test src/lib/privado/numero.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar.** `numeroDoAtendimento` usa `getPrivadoInstance`; `privadoLiberado` e `pausaDoNumero` leem com `.eq("tenant_id", …)` e `maybeSingle()`. A conferência, na ordem abaixo (o banco primeiro: com a Evolution fora, o número já está fora de uso):

```ts
const instancias = await listInstances(tenantId);
const privado = instancias.find((i) => i.purpose === "privado");
if (!privado) return "sem_numero";
const chave = chaveDoTelefone(privado.phone);
if (privado.status !== "connected" || !chave) return "nada_a_fazer";
const jaRecusado = privado.metadata?.privado_recusado === CHIP_DOS_GRUPOS;
if (instancias.some((i) => i.purpose === "grupos" && chaveDoTelefone(i.phone) === chave)) {
  // 1. updateInstanceStatus(privado → "disconnected", metadata { privado_recusado: CHIP_DOS_GRUPOS })
  // 2. se !jaRecusado: notifications { tenant_id, type: "privado_recusado",
  //      title: "Número do atendimento recusado",
  //      body: "O chip conectado no número do atendimento é o mesmo do número dos grupos. Desconectamos o do atendimento: conecte outro chip nele.",
  //      href: "/painel/conectar" }
  // 3. logoutInstance(privado.provider_instance_id ?? providerInstanceId(privado.id)) em try/catch;
  //    falha → console.warn só com o id da instância (telefone nunca vai para log)
  return "recusado";
}
// 4. private_number_state.upsert({ tenant_id, instance_id, ramp_started_at: agora, healthy_since: agora },
//      { onConflict: "instance_id", ignoreDuplicates: true })
// 5. se jaRecusado: updateInstanceStatus(privado → "connected", metadata { privado_recusado: null })
return "ok";
```

Erro de banco sobe (o webhook devolve 5xx e a Evolution reentrega); só o logout é engolido.

- [ ] **Step 4: Rodar e ver passar.** Mesmo comando: PASS, `fail 0`. Depois `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json` sem saída.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/lib/privado/numero.ts apps/web/src/lib/privado/numero.test.ts
git commit -m "feat(privado): attendance number lookup, add-on gate and same-chip refusal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Mutantes.** (a) Comparar dígitos exatos (`i.phone === privado.phone`) no lugar de `chaveDoTelefone` → FAIL em "chip dos grupos no número do atendimento, com o 9 e o 55 diferentes…". (b) Tirar o `i.purpose === "grupos"` da comparação (o privado se compara consigo mesmo) → FAIL em "chip próprio…". Desfazer com `git checkout -- apps/web/src/lib/privado/numero.ts`.

---

### Tarefa 5: Seletores do web — Sincronizar, Relâmpago, link da bio, Início

**Depende de:** Tarefa 3.

**Files:**
- Modify: `apps/web/src/lib/groups/sincronizar.ts:99-106`
- Modify: `apps/web/src/app/api/relampago/offers/route.ts:152`
- Modify: `apps/web/src/lib/bio/conferir.ts:45-49`
- Modify: `apps/web/src/lib/painel/inicio-carga.ts:269`
- Test: `apps/web/src/lib/groups/sincronizar.test.ts`, `apps/web/src/lib/bio/conferir.test.ts`

**Interfaces:**
- Consumes: `listGroupInstances`, `Instance.purpose` (Tarefa 3).
- Produces: `sincronizarGrupos` sem `instanceId` escolhe o primeiro `connected` de `listGroupInstances`; com `instanceId` de número que não é `grupos` devolve `{ ok: false, status: 409, error: "Esse é o número do atendimento: ele não sincroniza grupos." }` antes da trava e da Evolution. `chavesDasInstancias` (bio), a abertura da oferta relâmpago e `carregarSessao` passam a usar `listGroupInstances`. O `ourPhones` de `lerGrupos` continua com `listInstances`.

- [ ] **Step 1: Testes que falham.**

`sincronizar.test.ts`: o fixture `INSTANCIA` ganha `purpose: "grupos"`; o `"GET /rest/v1/instances"` do `bancoDaLoja` passa a filtrar as linhas pelos parâmetros `purpose=eq.X` e `id=eq.X` quando vierem; e entram:

```ts
const ATENDIMENTO = {
  ...INSTANCIA, id: "inst-p", phone: "5511977770000", provider_instance_id: "gr_inst-p", purpose: "privado",
};

test("o Sincronizar sem número escolhido usa o dos grupos, nunca o do atendimento", async () => {
  prepara({ instancias: [ATENDIMENTO, INSTANCIA] });

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true });

  assert.equal(r.ok, true);
  // Mutante: listInstances no lugar de listGroupInstances — o atendimento vem primeiro e sincroniza.
  assert.equal(feitas("GET", "/group/fetchAllGroups/gr_inst-p").length, 0);
  assert.equal(feitas("GET", "/group/fetchAllGroups/gr_inst-1").length, 1);
});

test("pedir o Sincronizar com o id do número do atendimento é 409, sem trava nem Evolution", async () => {
  prepara({ instancias: [ATENDIMENTO, INSTANCIA] });

  const r = await sincronizarGrupos(LOJA, { somenteContagem: false, instanceId: "inst-p" });

  assert.deepEqual(r, { ok: false, status: 409, error: "Esse é o número do atendimento: ele não sincroniza grupos." });
  assert.deepEqual(comandosDaTrava(), []);
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/group/")).length, 0);
});
```

`conferir.test.ts`: `banco` ganha `privados: string[]` (zerado no `beforeEach`); o handler de `/rest/v1/instances` devolve as linhas de `telefones` com `purpose: "grupos"` mais as de `privados` com `purpose: "privado"`, filtradas por `purpose=eq.X` quando o parâmetro vier; e entra:

```ts
test("o número do atendimento pode ir na bio; o dos grupos continua recusado", async () => {
  banco.telefones = [`55${ZAP}`];
  banco.privados = ["5562988887777"];
  const atendimento = link("whatsapp", { numero: "5562988887777", mensagem: "" });
  assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, documento([atendimento])), { ok: true });
  // Mutante: listInstances no lugar de listGroupInstances — o atendimento viraria "o número que posta".
  assert.equal(filtros("/rest/v1/instances").purpose, "eq.grupos");
  vistos.length = 0;
  const grupos = link("whatsapp", { numero: `55${ZAP}`, mensagem: "" });
  assert.equal((await conferir.conferirDocumentoDaLoja(LOJA, documento([grupos]))).ok, false);
});
```

- [ ] **Step 2: Rodar e ver falhar.**

Run: `npm --workspace apps/web exec -- tsx --import ./src/test/server-only-shim.mjs --test src/lib/groups/sincronizar.test.ts src/lib/bio/conferir.test.ts`
Expected: FAIL nos três testes novos (os antigos seguem verdes).

- [ ] **Step 3: Implementar** as quatro trocas; em `sincronizar.ts`, a recusa do id explícito logo depois do `if (!instance)`, comparando `instance.purpose !== "grupos"` (fecha também para valor desconhecido).

- [ ] **Step 4: Rodar e ver passar.** Mesmo comando: PASS, `fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/lib/groups/sincronizar.ts apps/web/src/lib/groups/sincronizar.test.ts apps/web/src/lib/bio/conferir.ts apps/web/src/lib/bio/conferir.test.ts apps/web/src/app/api/relampago/offers/route.ts apps/web/src/lib/painel/inicio-carga.ts
git commit -m "feat(groups): sync, flash offers, bio check and session reconcile use the groups number" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Mutantes.** (a) `listInstances` no lugar de `listGroupInstances` em `sincronizar.ts` → FAIL em "o Sincronizar sem número escolhido…". (b) Tirar a recusa do id explícito → FAIL em "pedir o Sincronizar com o id…". (c) `listInstances` em `chavesDasInstancias` → FAIL em "o número do atendimento pode ir na bio…". `git checkout -- apps/web/src/lib`.

---

### Tarefa 6: A sessão é a do número dos grupos

**Depende de:** nada.

**Files:**
- Modify: `apps/web/src/lib/session-store.ts:59-64` (`getSession`) e `:93-99` (`setSession`)
- Create: `apps/web/src/lib/session-store.test.ts`

**Interfaces:**
- Produces: `getSession(tenantId)` e `setSession(tenantId, info)` leem só `purpose = 'grupos'` (assinaturas iguais). Tudo que decide "conectado" pela sessão (portão de postar em `campanhas/[slug]/messages`, barra, Início, `business-health`, `playbook`) passa a falar do número dos grupos.

- [ ] **Step 1: Testes que falham** — PostgREST falso no molde de `src/lib/stores/posts-hoje.test.ts`, com `GET /rest/v1/instances` devolvendo `linhas` filtradas por `purpose=eq.X` quando vier, e `PATCH /rest/v1/instances` devolvendo `GRUPOS` (objeto: o `.single()` da escrita pede `vnd.pgrst.object+json`). Fixtures: `GRUPOS = { id: "inst-g", phone: "556299990001", status: "disconnected", connected_at: "2026-09-01T00:00:00Z", last_seen_at: null, metadata: {}, updated_at: "2026-10-01T00:00:00Z", purpose: "grupos" }`, `ATENDIMENTO = { ...GRUPOS, id: "inst-p", phone: "5562988880002", status: "connected", updated_at: "2026-10-29T00:00:00Z", purpose: "privado" }`.

```ts
test("a sessão é a do número dos grupos: o do atendimento conectado não acende 'conectado'", async () => {
  linhas = [ATENDIMENTO, GRUPOS];
  const s = await getSession("loja-a");
  assert.equal(s.status, "disconnected");
  assert.equal(s.phone, "556299990001"); // getSession engole erro e devolve o padrão: o telefone prova que leu
  const [leitura] = pedidos;
  assert.equal(leitura.url.searchParams.get("tenant_id"), "eq.loja-a");
  // Mutante: sem o filtro, o atendimento (conectado e mais recente) vira a sessão e o painel deixa postar.
  assert.equal(leitura.url.searchParams.get("purpose"), "eq.grupos");
});

test("o heartbeat legado (setSession) só grava no número dos grupos", async () => {
  linhas = [ATENDIMENTO, GRUPOS];
  await setSession("loja-a", { status: "disconnected" });
  const [leitura] = pedidos.filter((p) => p.metodo === "GET");
  assert.equal(leitura.url.searchParams.get("purpose"), "eq.grupos");
  const [escrita] = pedidos.filter((p) => p.metodo === "PATCH");
  assert.equal(escrita.url.searchParams.get("id"), "eq.inst-g");
  assert.equal(escrita.url.searchParams.get("tenant_id"), "eq.loja-a");
});
```

- [ ] **Step 2: Rodar e ver falhar.**

Run: `npm --workspace apps/web exec -- tsx --import ./src/test/server-only-shim.mjs --test src/lib/session-store.test.ts`
Expected: FAIL nos dois.

- [ ] **Step 3: Implementar** `.eq("purpose", "grupos")` nas duas leituras (docstring de `getSession`: "a sessão é a do número dos grupos; o do atendimento tem o cartão dele").

- [ ] **Step 4: Rodar e ver passar.** Mesmo comando: PASS.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/lib/session-store.ts apps/web/src/lib/session-store.test.ts
git commit -m "feat(session): the session is the groups number's, never the attendance one" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Mutante.** Tirar o filtro de `getSession` → FAIL no primeiro teste. `git checkout -- apps/web/src/lib/session-store.ts`.

---

### Tarefa 7: A vaga do plano conta só grupos; `/api/instances` cria o número do atendimento

**Depende de:** Tarefas 3 e 4.

**Files:**
- Modify: `apps/web/src/lib/billing/capability-limits.ts` (nova `countFilter`, ao lado de `mirrorExclusionColumn`)
- Modify: `apps/web/src/lib/billing/entitlements.ts:116-125` (`assertPlanLimit`)
- Modify: `apps/web/src/app/api/instances/route.ts`
- Test: `apps/web/src/lib/billing/capability-limits.test.ts`
- Create: `apps/web/src/app/api/instances/route.test.ts`

**Interfaces:**
- Consumes: `listGroupInstances` (T3); `privadoLiberado`, `PRIVADO_SEM_ADDON` (T4).
- Produces:

```ts
// capability-limits.ts
/** Igualdade que restringe a contagem de `table` ao que o plano cobra. Só `instances`: o número do atendimento vem com o add-on. */
export function countFilter(table: string): { column: string; equals: string } | null; // instances → { column: "purpose", equals: "grupos" }
```

  `assertPlanLimit` aplica `query.eq(filtro.column, filtro.equals)` quando houver. `GET /api/instances` → `reconciliarConexoes(await listGroupInstances(...))` (o contrato da tela Conectar fica: lista dos números dos grupos). `POST /api/instances` aceita `purpose?: "grupos" | "privado"` (padrão `grupos`; outro valor → 400 `{ error: "Tipo de número inválido." }`). Com `privado`: depois do papel (dono/admin), `privadoLiberado` falso → 403 `{ error: PRIVADO_SEM_ADDON, code: "privado_sem_addon" }`; **não** chama `assertPlanLimit`; ignora `numero_perfil` (grava `null`); nome padrão `"Atendimento"`; insert com `purpose: "privado"`; erro `23505` → 409 `{ error: "Esta loja já tem um número do atendimento." }` sem tocar na Evolution. Com `grupos`, tudo como hoje mais `purpose: "grupos"` no insert.

- [ ] **Step 1: Testes que falham.**

`capability-limits.test.ts`:

```ts
test("vaga de celular conta só os números dos grupos: o do atendimento vem com o add-on", () => {
  assert.deepEqual(countFilter("instances"), { column: "purpose", equals: "grupos" });
  for (const table of ["leads", "campaign_groups", "memberships", "funnels"]) assert.equal(countFilter(table), null, table);
});
```

`app/api/instances/route.test.ts` — servidor falso no molde de `src/app/api/campanhas/route.test.ts` (auth em `/auth/v1/user` + `/rest/v1/memberships` como `owner`; `Bearer token-falso` + `x-tenant-id`), que também responde a Evolution (`POST /instance/create`, `POST /webhook/set/gr_nova` → 201) e:
`GET /rest/v1/instances` → `mundo.instancias` filtradas por `purpose=eq.X`; `HEAD /rest/v1/instances` → `Content-Range: */0` se a URL tiver `purpose=eq.grupos`, senão `*/1`; `GET /rest/v1/subscriptions` → `[{ status: "active", metadata: {}, current_period_end: null, plans: { limits: mundo.limites } }]` (ou `[]` com `limites: null`); `GET /rest/v1/tenant_settings` → `mundo.settings`; `POST /rest/v1/instances` → `mundo.insert` (padrão 201 `{ id: "nova", name, phone: null, status: "pending", created_at }`); `PATCH /rest/v1/instances` → 204; `POST /rest/v1/logs` → 201. Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_WEBHOOK_SECRET`, `NEXT_PUBLIC_APP_URL`, todos apontando para o falso antes do `import("./route")`. Fixtures: `GRUPOS_CONECTADO = { id: "inst-g", tenant_id: "loja-a", name: "WhatsApp", purpose: "grupos", status: "connected", phone: "556299990001", provider_instance_id: "gr_inst-g", connected_at: "2026-09-01T00:00:00Z", metadata: {}, … }` e `ATENDIMENTO_CONECTADO = { ...GRUPOS_CONECTADO, id: "inst-p", name: "Atendimento", purpose: "privado", phone: "5562988880002", provider_instance_id: "gr_inst-p" }` (conectados: a reconciliação não chama a Evolution). `pedir(metodo, corpo?)` monta o `Request` de `/api/instances` com `authorization: Bearer token-falso`, `x-tenant-id: loja-a` e o JSON. `prepara({ instancias?, settings?, limites?, insert? })` zera `chamadas`; padrões: `instancias: []`, `settings: []`, `limites: {}` (plano sem teto), `insert` 201.

```ts
test("GET devolve só os números dos grupos: a tela Conectar nunca vê o do atendimento", async () => {
  prepara({ instancias: [ATENDIMENTO_CONECTADO, GRUPOS_CONECTADO] });
  const res = await GET(pedir("GET"));
  assert.deepEqual(((await res.json()) as { id: string }[]).map((i) => i.id), ["inst-g"]);
  assert.equal(feitas("GET", "/rest/v1/instances")[0].url.searchParams.get("purpose"), "eq.grupos");
});

test("loja só com o número do atendimento: a lista do Conectar vem vazia (a tela cria o dos grupos)", async () => {
  prepara({ instancias: [ATENDIMENTO_CONECTADO] });
  assert.deepEqual(await (await GET(pedir("GET"))).json(), []);
});

test("POST de grupos: a vaga do plano conta só os números dos grupos", async () => {
  prepara({ instancias: [ATENDIMENTO_CONECTADO], limites: { whatsapp_instances: 1 } });
  const res = await POST(pedir("POST", { name: "WhatsApp", numero_perfil: "antigo" }));
  // Mutante: sem o countFilter a contagem é */1 e o plano devolve 402.
  assert.equal(res.status, 201);
  assert.equal(feitas("HEAD", "/rest/v1/instances")[0].url.searchParams.get("purpose"), "eq.grupos");
  assert.equal((feitas("POST", "/rest/v1/instances")[0].corpo as Record<string, unknown>).purpose, "grupos");
});

test("POST do número do atendimento sem Recuperar nem Rastreio: 403 e nada é criado", async () => {
  prepara({ settings: [{ recuperar_enabled: false, rastreio_enabled: false }] });
  const res = await POST(pedir("POST", { purpose: "privado" }));
  assert.equal(res.status, 403);
  assert.deepEqual(await res.json(), {
    error: "O número do atendimento vem com o Recuperar ou o Rastreio. Ative um deles primeiro.",
    code: "privado_sem_addon",
  });
  assert.equal(feitas("POST", "/rest/v1/instances").length, 0);
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/instance/")).length, 0);
});

test("POST do número do atendimento com o add-on: cria privado sem olhar o plano", async () => {
  prepara({ settings: [{ recuperar_enabled: true, rastreio_enabled: false }], limites: null });
  const res = await POST(pedir("POST", { purpose: "privado", numero_perfil: "novo" }));
  assert.equal(res.status, 201);
  const linha = feitas("POST", "/rest/v1/instances")[0].corpo as Record<string, unknown>;
  assert.equal(linha.purpose, "privado");
  assert.equal(linha.numero_perfil, null);
  assert.equal(linha.name, "Atendimento");
  assert.equal(feitas("HEAD", "/rest/v1/instances").length, 0);
  assert.equal(feitas("GET", "/rest/v1/subscriptions").length, 0);
  assert.equal(feitas("POST", "/instance/create").length, 1);
});

test("segundo número do atendimento (clique duplo): 409 e nenhuma instância nova na Evolution", async () => {
  prepara({
    settings: [{ recuperar_enabled: true, rastreio_enabled: false }],
    insert: { status: 409, corpo: { code: "23505", details: null, hint: null, message: "duplicate key value violates unique constraint \"instances_one_privado_per_tenant\"" } },
  });
  const res = await POST(pedir("POST", { purpose: "privado" }));
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "Esta loja já tem um número do atendimento." });
  assert.equal(feitas("POST", "/instance/create").length, 0);
});

test("tipo de número desconhecido: 400", async () => {
  prepara({});
  assert.equal((await POST(pedir("POST", { purpose: "vendas" }))).status, 400);
});
```

- [ ] **Step 2: Rodar e ver falhar.**

Run: `npm --workspace apps/web exec -- tsx --import ./src/test/server-only-shim.mjs --test src/lib/billing/capability-limits.test.ts src/app/api/instances/route.test.ts`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar** `countFilter`, o filtro em `assertPlanLimit` e a rota.

- [ ] **Step 4: Rodar e ver passar.** Mesmo comando: PASS, `fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/lib/billing/capability-limits.ts apps/web/src/lib/billing/capability-limits.test.ts apps/web/src/lib/billing/entitlements.ts apps/web/src/app/api/instances/route.ts apps/web/src/app/api/instances/route.test.ts
git commit -m "feat(instances): attendance number comes with the add-on and skips the plan slot" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Mutantes.** (a) Tirar o `countFilter` de `assertPlanLimit` → FAIL em "POST de grupos…". (b) `listInstances` no `GET` → FAIL em "GET devolve só…". (c) Tirar o portão do add-on → FAIL em "POST do número do atendimento sem Recuperar…". `git checkout -- apps/web/src`.

---

### Tarefa 8: Parear com segurança — ações, webhook e reconciliação

**Depende de:** Tarefas 3 e 4.

**Files:**
- Modify: `apps/web/src/app/api/instances/[id]/actions/route.ts:78-86`
- Modify: `apps/web/src/app/api/webhooks/evolution/route.ts` (`applyConnectionUpdate` e o `POST`, logo depois de `findByProviderInstanceId`)
- Modify: `apps/web/src/lib/instances/reconciliar-conexao.ts:34-43`
- Create: `apps/web/src/app/api/instances/[id]/actions/route.test.ts`
- Modify: `apps/web/src/app/api/webhooks/evolution/route.test.ts`
- Create: `apps/web/src/lib/instances/reconciliar-conexao.test.ts`

**Interfaces:**
- Consumes: `privadoLiberado`, `PRIVADO_SEM_ADDON`, `conferirNumeroDoAtendimento` (T4); `Instance.purpose` (T3).
- Produces:
  - Rota de ações: com `instance.purpose === "privado"` e `action !== "disconnect"`, `privadoLiberado` falso → 403 `{ error: PRIVADO_SEM_ADDON, code: "privado_sem_addon" }` antes de qualquer chamada à Evolution. Desconectar sempre passa. Número dos grupos não consulta o add-on.
  - Webhook: `groups.upsert` e `group-participants.update` de instância `privado` → `200 { received: true, ignored: true }` sem gravar `engine_events` (o worker nunca vê) e sem aplicar delta, `is_admin`, grupo novo, entradas/saídas ou disjuntor. Em `applyConnectionUpdate`, logo depois do `updateInstanceStatus`, `if (status === "connected") await conferirNumeroDoAtendimento(instance.tenant_id)` — para qualquer número da loja (cobre a ordem inversa). `messages.upsert` do privado fica para o PR 4.
  - `reconciliarConexoes`: depois de promover (o `updateInstanceStatus` + `console.warn` de hoje), `await conferirNumeroDoAtendimento(instance.tenant_id)` dentro do mesmo `try`. A lista devolvida pode mostrar `connected` por um ciclo de polling quando a conferência recusou.

- [ ] **Step 1: Testes que falham.**

`[id]/actions/route.test.ts` — servidor falso no molde do da Tarefa 7 (auth de dono; `GET /rest/v1/instances` → `[mundo.instancia]`; `GET /rest/v1/tenant_settings` → `mundo.settings`; `DELETE /instance/logout/<nome>` → 200; `GET /instance/connect/<nome>` → `{ code: "2@qr-falso" }`; `GET /instance/connectionState/<nome>` → `{ instance: { state: "close" } }`; `POST /rest/v1/rpc/update_instance_status` → 200; `POST /rest/v1/logs` → 201). Chamada: `POST(pedir({ action }), { params: Promise.resolve({ id }) })`. Fixtures: `GRUPOS_EM_QR = { id: "inst-g", tenant_id: "loja-a", name: "WhatsApp", purpose: "grupos", status: "qr", phone: null, provider_instance_id: "gr_inst-g", qr_code: null, connected_at: null, metadata: {}, … }` e `ATENDIMENTO_EM_QR = { ...GRUPOS_EM_QR, id: "inst-p", name: "Atendimento", purpose: "privado", provider_instance_id: "gr_inst-p" }`; `prepara({ instancia, settings })` zera `chamadas`; `pedir(corpo)` monta o `POST` de `/api/instances/<id>/actions` com `authorization: Bearer token-falso`, `x-tenant-id: loja-a` e o JSON.

```ts
test("número do atendimento sem add-on não pareia: 403 e a Evolution não é chamada", async () => {
  prepara({ instancia: ATENDIMENTO_EM_QR, settings: [{ recuperar_enabled: false, rastreio_enabled: false }] });
  const res = await POST(pedir({ action: "refresh_qr" }), { params: Promise.resolve({ id: "inst-p" }) });
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { code: string }).code, "privado_sem_addon");
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/instance/")).length, 0);
});

test("sem add-on, desconectar o número do atendimento continua valendo", async () => {
  prepara({ instancia: { ...ATENDIMENTO_EM_QR, status: "connected" }, settings: [] });
  const res = await POST(pedir({ action: "disconnect" }), { params: Promise.resolve({ id: "inst-p" }) });
  assert.equal(res.status, 200);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 1);
});

test("com o add-on, o número do atendimento gera QR como qualquer número", async () => {
  prepara({ instancia: ATENDIMENTO_EM_QR, settings: [{ recuperar_enabled: false, rastreio_enabled: true }] });
  const res = await POST(pedir({ action: "refresh_qr" }), { params: Promise.resolve({ id: "inst-p" }) });
  assert.equal(res.status, 200);
  assert.equal(feitas("GET", "/instance/connect/gr_inst-p").length, 1);
});

test("número dos grupos não consulta o add-on", async () => {
  prepara({ instancia: GRUPOS_EM_QR, settings: [{ recuperar_enabled: false, rastreio_enabled: false }] });
  const res = await POST(pedir({ action: "refresh_qr" }), { params: Promise.resolve({ id: "inst-g" }) });
  assert.equal(res.status, 200);
  assert.equal(feitas("GET", "/rest/v1/tenant_settings").length, 0);
});
```

`webhooks/evolution/route.test.ts`: `INSTANCIA` ganha `purpose: "grupos"`; `respostas` passa a aceitar função `(c: Chamada) => Resposta` além de valor; o `before()` também define `EVOLUTION_API_URL`/`EVOLUTION_API_KEY` apontando para o servidor; `conexao(state, wuid?, instancia = "gr_inst-1")` ganha o terceiro parâmetro. Fixture: `ATENDIMENTO = { ...INSTANCIA, id: "inst-p", provider_instance_id: "gr_inst-p", purpose: "privado", phone: "5511999990000" }` (mesmo chip do `INSTANCIA`). A lista de instâncias responde por função: com `provider_instance_id=eq.X` devolve só aquela; sem, `[ATENDIMENTO, INSTANCIA]`.

```ts
test("evento de grupo no número do atendimento é ignorado: não grava, não importa grupo, não conta saída", async () => {
  for (const evento of [
    { event: "groups.upsert", data: [{ id: "120363000000000009@g.us", subject: "Grupo do atendimento" }] },
    { event: "group-participants.update", data: { id: "120363000000000001@g.us", action: "remove", author: "1@lid", participants: [{ id: "1@lid" }] } },
  ]) {
    chamadas.length = 0;
    respostas = { "GET /rest/v1/instances": { status: 200, corpo: [ATENDIMENTO] } };
    const res = await POST(webhook({ ...evento, instance: "gr_inst-p", date_time: "2026-10-30T10:00:00.000Z" }));
    assert.equal(res.status, 200, evento.event);
    assert.deepEqual(await res.json(), { received: true, ignored: true });
    // Mutante: sem o ramo, o evento vira engine_events (lead no worker), grupo importado e disjuntor avaliado.
    assert.deepEqual(chamadas.map((c) => `${c.metodo} ${c.url.pathname}`), ["GET /rest/v1/instances"], evento.event);
  }
});

test("o número do atendimento conectando com o chip dos grupos é recusado na hora", async () => {
  cenarioDoisNumeros();
  const res = await POST(conexao("open", "5511999990000@s.whatsapp.net", "gr_inst-p"));
  assert.equal(res.status, 200);
  const rpc = feitas("POST", "/rest/v1/rpc/update_instance_status").map((c) => c.corpo as Record<string, unknown>);
  assert.deepEqual(rpc.map((r) => [r.target_instance_id, r.target_status]), [["inst-p", "connected"], ["inst-p", "disconnected"]]);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 1);
});

test("o número dos grupos conectando com o chip do atendimento derruba o do atendimento, nunca o dos grupos", async () => {
  cenarioDoisNumeros();
  const res = await POST(conexao("open", "5511999990000@s.whatsapp.net", "gr_inst-1"));
  assert.equal(res.status, 200);
  const rpc = feitas("POST", "/rest/v1/rpc/update_instance_status").map((c) => c.corpo as Record<string, unknown>);
  assert.deepEqual(rpc.map((r) => [r.target_instance_id, r.target_status]), [["inst-1", "connected"], ["inst-p", "disconnected"]]);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 1);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-1").length, 0);
});
```

(`webhook(corpo)` monta o `Request` com o header do segredo; `cenarioDoisNumeros()` = `cenarioConexao()` com a lista por função acima, mais `"POST /rest/v1/notifications"` → 201 e `"DELETE /instance/logout/gr_inst-p"` → 200. Os três testes de `connection.update` de hoje seguem passando: com `[INSTANCIA]` a conferência devolve `sem_numero`.)

`lib/instances/reconciliar-conexao.test.ts` — servidor falso (Evolution: `GET /instance/connectionState/gr_inst-p` → `{ instance: { state: "open" } }`, `GET /instance/fetchInstances` → `[{ ownerJid: "5511999990000@s.whatsapp.net" }]`, `DELETE /instance/logout/gr_inst-p` → 200; PostgREST: `POST /rest/v1/rpc/update_instance_status` → 200, `POST /rest/v1/funnel_events` → 201, `POST /rest/v1/notifications` → 201, `GET /rest/v1/instances` → `mundo.lista`):

```ts
test("promover o número do atendimento com o chip dos grupos recusa na mesma volta", async () => {
  prepara({ lista: [{ ...ATENDIMENTO, status: "connected" }, GRUPOS] });
  await reconciliarConexoes([{ ...ATENDIMENTO, status: "qr" }]);
  const rpc = feitas("POST", "/rest/v1/rpc/update_instance_status").map((c) => c.corpo as Record<string, unknown>);
  // Mutante: sem a conferência depois de promover, o connection.update perdido deixava o chip repetido no ar.
  assert.deepEqual(rpc.map((r) => [r.target_instance_id, r.target_status]), [["inst-p", "connected"], ["inst-p", "disconnected"]]);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 1);
});

test("promover o número dos grupos numa loja sem número do atendimento não mexe em mais nada", async () => {
  prepara({ lista: [{ ...GRUPOS, status: "connected" }] });
  await reconciliarConexoes([{ ...GRUPOS, status: "qr" }]);
  assert.equal(feitas("POST", "/rest/v1/rpc/update_instance_status").length, 1);
  assert.equal(chamadas.filter((c) => c.metodo === "DELETE").length, 0);
});
```

(`GRUPOS` aqui tem o mesmo telefone `5511999990000`; `ATENDIMENTO` e `GRUPOS` são `Instance` completos com `purpose`.)

- [ ] **Step 2: Rodar e ver falhar.**

Run: `npm --workspace apps/web exec -- tsx --import ./src/test/server-only-shim.mjs --test "src/app/api/instances/[id]/actions/route.test.ts" src/app/api/webhooks/evolution/route.test.ts src/lib/instances/reconciliar-conexao.test.ts`
Expected: FAIL nos testes novos; os antigos do webhook seguem verdes.

- [ ] **Step 3: Implementar** o portão da rota de ações, o ramo do webhook (com o comentário: "O número do atendimento nunca entra na sincronização de grupos (spec §3): evento de grupo dele não importa grupo, não mexe em contagem nem no disjuntor, não vira lead e não fica gravado") e as duas chamadas da conferência.

- [ ] **Step 4: Rodar e ver passar.** Mesmo comando: PASS, `fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add "apps/web/src/app/api/instances/[id]/actions/route.ts" "apps/web/src/app/api/instances/[id]/actions/route.test.ts" apps/web/src/app/api/webhooks/evolution/route.ts apps/web/src/app/api/webhooks/evolution/route.test.ts apps/web/src/lib/instances/reconciliar-conexao.ts apps/web/src/lib/instances/reconciliar-conexao.test.ts
git commit -m "feat(privado): pair the attendance number safely and refuse the groups chip" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Mutantes.** (a) Tirar o ramo do webhook → FAIL em "evento de grupo no número do atendimento…". (b) Tirar a conferência de `applyConnectionUpdate` → FAIL nos dois testes de chip repetido. (c) Tirar a conferência de `reconciliarConexoes` → FAIL em "promover o número do atendimento…". (d) Tirar o portão da rota de ações → FAIL em "número do atendimento sem add-on não pareia…". `git checkout -- apps/web/src`.

---

### Tarefa 9: Alerta de número caído cobre os dois números

**Depende de:** nada.

**Files:**
- Create: `apps/web/src/lib/email/numero-caido.ts`
- Create: `apps/web/src/lib/email/numero-caido.test.ts`
- Modify: `apps/web/src/lib/email/templates.ts` (depois de `disconnectAlertEmail`)
- Modify: `apps/web/src/lib/email/delivery-log.ts:10-22` (`EmailKind`)
- Modify: `apps/web/src/app/api/cron/emails/route.ts:400-487` (Job 3)
- Test: `apps/web/src/app/api/cron/emails/route.test.ts`

**Interfaces:**
- Produces:

```ts
// numero-caido.ts — puro (sem server-only), reusa selectSessionRow/isConnectedStatus
export const QUEDA_MS = 2 * 60 * 60 * 1000;
export type LinhaDoNumero = { status: string | null; updated_at: string | null; disconnected_at: string | null; purpose: string | null };
export type NumeroDaLoja = "grupos" | "privado";
/** Números fora do ar há mais de 2 h, grupos antes. Grupos: a linha de selectSessionRow sobre as de purpose "grupos". Privado: a linha de purpose "privado". Caído = não conectado e disconnected_at válido e <= agora − 2 h. */
export function numerosCaidos(linhas: readonly LinhaDoNumero[], agoraMs: number): NumeroDaLoja[];

// templates.ts
export function disconnectAlertPrivadoEmail(name: string, appUrl: string): { subject: string; html: string };
// delivery-log.ts: EmailKind ganha "disconnect_privado"
```

  Texto do e-mail (molde de `disconnectAlertEmail`, mesmo `layout`/`button`/`escapeHtml(primeiroNome(name))`): assunto `O número do atendimento desconectou — reconecte para as mensagens voltarem a sair`; título `O número do atendimento caiu`; parágrafo `Oi {nome}! O número do atendimento está desconectado há mais de 2 horas — enquanto isso, nenhuma mensagem sai por ele no privado.`; parágrafo `Reconectar leva 2 minutos: escaneie o QR Code com o celular do chip do atendimento.`; botão `Reconectar agora` → `${appUrl}/painel/conectar`.

  Job 3: o `select` de `instances` ganha `purpose`; `numerosCaidos(...)` vazio → próxima loja; o `select` de `tenant_settings` vira `"disconnect_alert_enabled, recuperar_enabled, rastreio_enabled"`; depois de `canSendAlert`, o `privado` só fica se `recuperar_enabled === true || rastreio_enabled === true`; dedupe do dia por tipo; dono buscado uma vez por loja; um envio por número pendente, pela tabela:

| Número | `notifications.type` | `kind` | título | corpo | `href` |
|---|---|---|---|---|---|
| `grupos` | `disconnect_alert` | `disconnect` | `WhatsApp desconectado` (como hoje) | `Enviamos um e-mail avisando que o WhatsApp está desconectado há mais de 2h.` (como hoje) | sem |
| `privado` | `disconnect_alert_privado` | `disconnect_privado` | `Número do atendimento desconectado` | `Enviamos um e-mail avisando que o número do atendimento está desconectado há mais de 2h.` | `/painel/conectar` |

- [ ] **Step 1: Testes que falham.**

`numero-caido.test.ts`:

```ts
const AGORA = Date.parse("2026-10-30T15:00:00Z");
const ha = (h: number) => new Date(AGORA - h * 3_600_000).toISOString();
const linha = (purpose: string | null, status: string, caiuHa: number | null) => ({
  purpose, status, updated_at: ha(caiuHa ?? 0), disconnected_at: caiuHa === null ? null : ha(caiuHa),
});

test("número dos grupos caído há 3 h com o do atendimento conectado: avisa o dos grupos", () => {
  // Mutante: selectSessionRow sobre todas as linhas — o atendimento conectado esconderia a queda dos grupos.
  assert.deepEqual(numerosCaidos([linha("privado", "connected", null), linha("grupos", "disconnected", 3)], AGORA), ["grupos"]);
});
test("número do atendimento caído há 3 h com o dos grupos conectado: só o do atendimento", () => {
  assert.deepEqual(numerosCaidos([linha("grupos", "connected", null), linha("privado", "disconnected", 3)], AGORA), ["privado"]);
});
test("caído há 1 h ainda não avisa", () => {
  assert.deepEqual(numerosCaidos([linha("grupos", "disconnected", 1), linha("privado", "disconnected", 1)], AGORA), []);
});
test("os dois caídos: os dois, grupos primeiro", () => {
  assert.deepEqual(numerosCaidos([linha("privado", "disconnected", 5), linha("grupos", "disconnected", 4)], AGORA), ["grupos", "privado"]);
});
test("sem linha, nunca conectou (sem disconnected_at) ou sem purpose: nada", () => {
  assert.deepEqual(numerosCaidos([], AGORA), []);
  assert.deepEqual(numerosCaidos([linha("grupos", "qr", null), linha("privado", "pending", null)], AGORA), []);
  assert.deepEqual(numerosCaidos([linha(null, "disconnected", 3)], AGORA), []);
});
```

`cron/emails/route.test.ts`: `Mundo` ganha `numeros?: Record<string, object[]>` (linhas de `instances` do Job 3 por loja; padrão: `[{ status: "disconnected", updated_at: desconectadoHa3h, disconnected_at: desconectadoHa3h, purpose: "grupos" }]`) e `addons?: string[]` (lojas com `recuperar_enabled`); o `GET /rest/v1/tenant_settings` responde `[{ disconnect_alert_enabled: true, recuperar_enabled: true, rastreio_enabled: false }]` para loja em `addons`, senão `[]`. Entram:

```ts
test("Job 3: número dos grupos caído com o do atendimento conectado ainda avisa", async () => {
  const agora = new Date().toISOString();
  const ha3h = new Date(Date.now() - 3 * H).toISOString();
  await rodarCron({
    lojas: ["pagante"],
    assinaturas: [{ tenant_id: "pagante", status: "active" }],
    numeros: { pagante: [
      { status: "connected", updated_at: agora, disconnected_at: null, purpose: "privado" },
      { status: "disconnected", updated_at: ha3h, disconnected_at: ha3h, purpose: "grupos" },
    ] },
  });
  assert.deepEqual(tentativas("disconnect"), ["pagante"]);
  assert.deepEqual(tentativas("disconnect_privado"), []);
});

test("Job 3: número do atendimento caído avisa à parte, só com o Recuperar ou o Rastreio ligado", async () => {
  const agora = new Date().toISOString();
  const ha3h = new Date(Date.now() - 3 * H).toISOString();
  const linhas = [
    { status: "connected", updated_at: agora, disconnected_at: null, purpose: "grupos" },
    { status: "disconnected", updated_at: ha3h, disconnected_at: ha3h, purpose: "privado" },
  ];
  await rodarCron({
    lojas: ["com-addon", "sem-addon"],
    assinaturas: [{ tenant_id: "com-addon", status: "active" }, { tenant_id: "sem-addon", status: "active" }],
    numeros: { "com-addon": linhas, "sem-addon": linhas },
    addons: ["com-addon"],
  });
  assert.deepEqual(tentativas("disconnect_privado"), ["com-addon"]);
  assert.deepEqual(tentativas("disconnect"), []);
});
```

Os quatro testes do Job 3 de hoje seguem iguais (o padrão de `numeros` é a linha de grupos caída).

- [ ] **Step 2: Rodar e ver falhar.**

Run: `npm --workspace apps/web exec -- tsx --import ./src/test/server-only-shim.mjs --test src/lib/email/numero-caido.test.ts src/app/api/cron/emails/route.test.ts`
Expected: FAIL nos testes novos.

- [ ] **Step 3: Implementar** `numerosCaidos`, o template, o `EmailKind` e o Job 3.

- [ ] **Step 4: Rodar e ver passar.** Mesmo comando: PASS, `fail 0`.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/src/lib/email/numero-caido.ts apps/web/src/lib/email/numero-caido.test.ts apps/web/src/lib/email/templates.ts apps/web/src/lib/email/delivery-log.ts apps/web/src/app/api/cron/emails/route.ts apps/web/src/app/api/cron/emails/route.test.ts
git commit -m "feat(alerts): down-number alert covers the groups and the attendance number" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Mutante.** Em `numerosCaidos`, `selectSessionRow(linhas)` (todas) no lugar das de `grupos` → FAIL em "número dos grupos caído há 3 h…" (e no teste da rota). `git checkout -- apps/web/src/lib/email/numero-caido.ts`.

---

### Tarefa 10: O cartão do número do atendimento

**Depende de:** Tarefas 3, 4, 7 e 8.

**Files:**
- Create: `apps/web/src/lib/privado/cartao.ts`
- Create: `apps/web/src/lib/privado/cartao.test.ts`
- Create: `apps/web/src/app/api/privado/numero/route.ts`
- Create: `apps/web/src/components/privado/cartao-numero-do-atendimento.tsx`
- Modify: `apps/web/src/components/painel/conectar/vitrine/conectar-vitrine.tsx` (`export` em `PainelDoCodigo` e `Etiqueta`; nada mais muda)
- Modify: `apps/web/src/app/painel/conectar/page.tsx:43-58`
- Create: `apps/web/e2e/painel-numero-do-atendimento.spec.ts`

**Interfaces:**
- Consumes: `getPrivadoInstance` (T3); `privadoLiberado`, `pausaDoNumero` (T4); `reconciliarConexoes`; `POST /api/instances` com `purpose: "privado"` (T7); `/api/instances/[id]/actions` (T8); `PainelDoCodigo`, `Etiqueta`, `etiquetaDaConexao`, `telefoneNaVitrine` (Conectar); `useConfirmacao`; `useRole().can("settings:connection")`; `POLL_MS`, `WATCH_MS` (`@/lib/engine-poll`).
- Produces (o que o PR 7 do Recuperar e o PR 6 do Rastreio importam):

```ts
// lib/privado/cartao.ts — puro, sem server-only
export type NumeroNaTela = {
  id: string; name: string; status: string; phone: string | null; qr_code: string | null;
  connected_at: string | null; metadata: Record<string, unknown> | null; pausadoAte: string | null;
};
export type CartaoDoNumero = { liberado: boolean; numero: NumeroNaTela | null }; // resposta de GET /api/privado/numero
export type CenaDoCartao = "oculto" | "sem-numero" | "pareando" | "conectado" | "desconectado";
export function cenaDoCartao(cartao: CartaoDoNumero | null): CenaDoCartao;
export function recusadoPeloChipDosGrupos(numero: Pick<NumeroNaTela, "metadata">): boolean;
export function textoDaSaude(numero: Pick<NumeroNaTela, "pausadoAte">, agora: Date): string;
export function noArDesde(connectedAt: string | null): string | null;

// components/privado/cartao-numero-do-atendimento.tsx — "use client", sem props
export function CartaoNumeroDoAtendimento(): React.JSX.Element | null;
```

  `GET /api/privado/numero` (`getTenantContext`; a vendedora não alcança: rota fora de `ROTAS`): `privadoLiberado` + `getPrivadoInstance` em paralelo; se há número, `reconciliarConexoes([numero])` e `pausaDoNumero`; responde `CartaoDoNumero`. Erro → 500 `{ error: "Erro ao ler o número do atendimento." }`.

  Regras de `cenaDoCartao`: `null` → `oculto`; sem número e sem add-on → `oculto`; sem número → `sem-numero`; `connected` → `conectado`; `pending`/`qr`/`connecting` → `pareando`; o resto → `desconectado`. Com add-on desligado e número presente, a cena é a do status (o lojista ainda desconecta). `textoDaSaude`: sem pausa ou pausa vencida → `Sem pausa de proteção`; pausa que acaba hoje (Brasília) → `Em pausa de proteção até 14:30`; outro dia → `Em pausa de proteção até 31/10 às 09:00`. `noArDesde`: `No ar desde 01/10/2026` (data de Brasília) ou `null`.

  O cartão (`<section aria-labelledby="numero-atendimento-titulo" data-testid="numero-do-atendimento" className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8">`) carrega `GET /api/privado/numero` e repete a cada `POLL_MS` em `pareando` e `WATCH_MS` nas outras cenas (pula com a aba oculta); em `oculto` devolve `null`. Ações: conectar = `POST /api/instances` `{ purpose: "privado", name: "Atendimento" }` e recarregar (o QR chega pelo webhook); gerar QR / código / desconectar = `POST /api/instances/<id>/actions` com `refresh_qr` / `pairing_code` + `phone` / `disconnect` (este depois de `pedirConfirmacao`); erro da API vai para a tela com o `error` dela. Botões só com `can("settings:connection")`; os de conectar, só com `liberado`. Texto fixo (pt-BR):

| Onde | Texto |
|---|---|
| título (`h2#numero-atendimento-titulo`, `font-brand text-20 font-bold text-volt-950`) | `Número do atendimento` |
| linha fixa | `O WhatsApp que fala com a cliente no privado, pelo Recuperar e pelo Rastreio. Ele nunca posta nos grupos.` |
| `sem-numero` | `Use um chip só para o atendimento, diferente do número dos grupos.` + botão primário (classe do "Gerar QR code" de `pergunta-perfil-numero.tsx`) `Conectar o número do atendimento` |
| `pareando` | `Escaneie com o celular do chip do atendimento, não com o dos grupos.` + `<PainelDoCodigo instancia={numero} upgradeUrl={null} …/>` (sem quem age: só o texto `Conectando…`) |
| `conectado` | telefone (`telefoneNaVitrine(phone) ?? name`, `font-data text-24`), `<Etiqueta>` de `etiquetaDaConexao`, `noArDesde(...)`, `textoDaSaude(...)`, botão `Desconectar` com `aria-label="Desconectar o número do atendimento"` (estilo do Desconectar de `CenaDoNumero`) |
| `desconectado`, recusado | `Esse chip é o mesmo do número dos grupos. O número do atendimento precisa de outro chip, para uma restrição no privado nunca derrubar os seus grupos.` + botão `Conectar outro chip` (`refresh_qr`) |
| `desconectado` | `O número do atendimento está desconectado. Enquanto isso, nenhuma mensagem sai por ele.` + botão `Conectar de novo` (`refresh_qr`) |
| número presente sem add-on | `O Recuperar e o Rastreio estão desligados: nada sai por este número.` |
| sem permissão | `Só o dono ou um admin da loja conecta e desconecta este número.` |
| confirmação | título `Desconectar o número do atendimento?`, texto `As mensagens do Recuperar e os avisos do Rastreio param até você conectar de novo pelo celular do chip.`, rótulo `Desconectar`, destrutivo |

  Na página Conectar, depois de `<ConectarVitrine …/>`: `<div className="mx-auto max-w-[1000px] px-4 pb-8 empty:hidden lg:px-8"><CartaoNumeroDoAtendimento /></div>` — some inteiro quando o cartão devolve `null`.

- [ ] **Step 1: Testes que falham.**

`cartao.test.ts`:

```ts
const numero = (over: Partial<NumeroNaTela> = {}): NumeroNaTela => ({
  id: "inst-p", name: "Atendimento", status: "connected", phone: "5562988880002", qr_code: null,
  connected_at: "2026-10-02T02:00:00Z", metadata: null, pausadoAte: null, ...over,
});

test("sem resposta ainda, ou sem add-on e sem número, o cartão não aparece", () => {
  assert.equal(cenaDoCartao(null), "oculto");
  assert.equal(cenaDoCartao({ liberado: false, numero: null }), "oculto");
});
test("com add-on e sem número, convida a conectar", () => {
  assert.equal(cenaDoCartao({ liberado: true, numero: null }), "sem-numero");
});
test("QR, código ou conectando é pareando; aberto é conectado; o resto é desconectado", () => {
  for (const status of ["pending", "qr", "connecting"]) assert.equal(cenaDoCartao({ liberado: true, numero: numero({ status }) }), "pareando", status);
  assert.equal(cenaDoCartao({ liberado: true, numero: numero() }), "conectado");
  for (const status of ["disconnected", "blocked", "error"]) assert.equal(cenaDoCartao({ liberado: true, numero: numero({ status }) }), "desconectado", status);
});
test("add-on desligado com o número ainda lá: o cartão continua (para desconectar)", () => {
  assert.equal(cenaDoCartao({ liberado: false, numero: numero() }), "conectado");
});
test("a recusa pelo chip dos grupos vem do metadata", () => {
  assert.equal(recusadoPeloChipDosGrupos(numero({ metadata: { privado_recusado: "numero_dos_grupos" } })), true);
  assert.equal(recusadoPeloChipDosGrupos(numero({ metadata: null })), false);
});
test("saúde: sem pausa, pausa que acaba hoje e pausa até outro dia, no horário de Brasília", () => {
  const agora = new Date("2026-10-30T15:00:00Z"); // 12:00 em Brasília
  assert.equal(textoDaSaude({ pausadoAte: null }, agora), "Sem pausa de proteção");
  assert.equal(textoDaSaude({ pausadoAte: "2026-10-30T14:00:00Z" }, agora), "Sem pausa de proteção");
  assert.equal(textoDaSaude({ pausadoAte: "2026-10-30T17:30:00Z" }, agora), "Em pausa de proteção até 14:30");
  assert.equal(textoDaSaude({ pausadoAte: "2026-10-31T12:00:00Z" }, agora), "Em pausa de proteção até 31/10 às 09:00");
});
test("no ar desde: a data do primeiro pareamento, em Brasília", () => {
  assert.equal(noArDesde("2026-10-02T02:00:00Z"), "No ar desde 01/10/2026");
  assert.equal(noArDesde(null), null);
});
```

`e2e/painel-numero-do-atendimento.spec.ts` (molde de `e2e/painel-vitrine-conectar.spec.ts`: `page.route` em `**/api/instances` → `[CONECTADA]` dos grupos e `**/api/groups/sync` → 200; o cartão por `page.getByRole("region", { name: "Número do atendimento" })`):

```ts
test("sem o Recuperar e sem o Rastreio o cartão não aparece", …);
// /api/privado/numero → { liberado: false, numero: null } → região com contagem 0
test("com o add-on e sem número, o dono vê o convite para conectar", …);
// { liberado: true, numero: null } → botão "Conectar o número do atendimento" visível dentro da região
test("chip dos grupos recusado: o cartão explica e oferece outro chip", …);
// numero { status: "disconnected", metadata: { privado_recusado: "numero_dos_grupos" } } → texto
// "Esse chip é o mesmo do número dos grupos" e botão "Conectar outro chip"
test("conectado: telefone formatado, e desconectar pergunta antes", async ({ page }) => {
  await gruposConectado(page); // os dois page.route do número dos grupos
  await cartao(page, { liberado: true, numero: { ...ATENDIMENTO, status: "connected", phone: "556298887777" } });
  const acoes: unknown[] = [];
  await page.route("**/api/instances/inst-p/actions", async (route) => {
    acoes.push(route.request().postDataJSON());
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  await page.goto("/painel/conectar", { waitUntil: "load" });
  const regiao = page.getByRole("region", { name: "Número do atendimento" });
  await expect(regiao).toContainText("+55 62 9888•7777", { timeout: 30_000 });

  await regiao.getByRole("button", { name: "Desconectar o número do atendimento" }).click();
  expect(acoes).toHaveLength(0); // o toque só abre a pergunta
  await confirmarNaFolha(page, "Desconectar");
  await expect.poll(() => acoes.length).toBe(1);
  expect(acoes[0]).toEqual({ action: "disconnect" });
});
```

(`gruposConectado(page)` = os dois `page.route` do molde: `**/api/instances` → `[CONECTADA]` e `**/api/groups/sync` → 200; `cartao(page, corpo)` = `page.route("**/api/privado/numero", …)` respondendo `corpo`; `ATENDIMENTO` = `NumeroNaTela` com `id: "inst-p"`, `name: "Atendimento"`, `qr_code: null`, `connected_at: "2026-10-01T12:00:00Z"`, `metadata: null`, `pausadoAte: null`.)

- [ ] **Step 2: Rodar e ver falhar.**

Run: `npm --workspace apps/web exec -- tsx --import ./src/test/server-only-shim.mjs --test src/lib/privado/cartao.test.ts`
Expected: FAIL (módulo não existe). O e2e roda no job `e2e` do CI (Tarefa 11).

- [ ] **Step 3: Implementar** `cartao.ts` (datas com `Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", … })`), a rota, os dois `export` da vitrine, o componente e a página.

- [ ] **Step 4: Rodar e ver passar; tipos e lint.**

Run: `npm --workspace apps/web exec -- tsx --import ./src/test/server-only-shim.mjs --test src/lib/privado/cartao.test.ts`
Expected: PASS, `fail 0`.
Run: `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json`, `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json`, `npm --workspace apps/web run lint`
Expected: sem erro.

- [ ] **Step 5: Commit.** (O e2e roda no job `e2e` do PR: é a prova de tela, Tarefa 11.)

```bash
git add apps/web/src/lib/privado/cartao.ts apps/web/src/lib/privado/cartao.test.ts apps/web/src/app/api/privado/numero/route.ts apps/web/src/components/privado/cartao-numero-do-atendimento.tsx apps/web/src/components/painel/conectar/vitrine/conectar-vitrine.tsx apps/web/src/app/painel/conectar/page.tsx apps/web/e2e/painel-numero-do-atendimento.spec.ts
git commit -m "feat(painel): attendance number card on the connect page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Tarefa 11: Fechamento — verificação, PR, bancos e worker

**Depende de:** Tarefas 1 a 10.

- [ ] **Step 1: Atualizar com `main`.** `git fetch origin main`, `git log HEAD..origin/main --oneline`; se o PR 1b (ou 5, 6) mergeou, `git merge origin/main` (o `schema-baseline.json` deles precisa vir; resolver `apply-order.txt` mantendo as linhas em ordem). Esta migração não muda a baseline.

- [ ] **Step 2: Suítes e tipos.**

Run: `npm --workspace apps/web test`, `npm --workspace apps/worker test`, `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json`, `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json`, `npm --workspace apps/worker exec tsc -- --noEmit`, `npm --workspace apps/web run lint`
Expected: `fail 0` nas duas suítes; tsc e lint sem erro.

- [ ] **Step 3: Gate local.** `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1` → termina sem erro.

- [ ] **Step 4: PR.** `git push -u origin <branch>` e `gh pr create` com título `feat: attendance number (Recuperar PR 2, shared base)`, corpo com: o mapa dos seletores (resumo), "migração só de corpo (md5 conferido em dev e prod no Step 1 da Tarefa 1)", plano de teste (o check SQL em dev, as suítes, o e2e, os mutantes rodados) e a linha `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

- [ ] **Step 5: CI e GREEN do banco.** `gh pr checks <N> --watch`. Com o `migrate-dev` verde:

```bash
cd apps/web
npx supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
npx supabase db query --linked -o json -f ../../infra/tests/numero-do-atendimento-check.sql
```

Expected: última linha `r = ok`; job `e2e` verde (inclui `painel-numero-do-atendimento.spec.ts`, a prova de tela do cartão). `drift` vermelho só por migração de outro PR aberto (dev é de todos): esperar aquele mergear e repetir o Step 1.

- [ ] **Step 6: Revisão de segurança** (portão de add-on, limite do plano, webhook): agente Security Engineer sobre `git diff origin/main...HEAD`. CRITICAL/HIGH corrigidos antes do merge.

- [ ] **Step 7: Merge à mão no verde** (`main` sem proteção: auto-merge mergearia na hora): `gh pr merge <N> --squash --delete-branch`. O `migrate-prod` aplica; conferir o job verde.

- [ ] **Step 8: Check em prod (é do Igor: escreve, com rollback).** Pedir ao Igor: `npx supabase link --project-ref nidoatbxaylrkcgbszns --yes` e o mesmo `db query -f` do Step 5 → `r = ok`.

- [ ] **Step 9: Worker.** Pedir ao Igor o redeploy do worker no Coolify e conferir no log o boot da versão nova. **Nenhuma loja ganha `recuperar_enabled`/`rastreio_enabled` antes disso**: o worker antigo ainda escolheria o número do atendimento para auto-grow e ações em massa.

- [ ] **Step 10: Registro.** Card `recuperar-yampi` segue `em_construcao` (sem `move_card`). Sugerir ao Igor:

```powershell
rag insert "decisão: o número do atendimento (instances.purpose='privado') fica fora de todo seletor de post; listGroupInstances é o seletor do web, app.instance_caps devolve zero linhas para ele, e chip repetido derruba sempre o do atendimento, nunca o dos grupos" --source decisao-2026-10-30
```

- [ ] **Step 11: Encerrar** com "PRs que deixei abertos: …" (ou "nenhum").

## Fora deste PR (de propósito)

- Pré-checagem do telefone digitado no `pairing_code` contra o número dos grupos: a recusa depois da conexão já cobre QR e código. Acrescentar se o lojista errar o chip com frequência.
- Aviso de 14 dias sem abrir o celular (Job 6) para o chip do atendimento: hoje o Job 6 só vê o dos grupos (via `instance_health`). Acrescentar quando o número do atendimento tiver volume.
- Coluna de `purpose` nas telas de admin. Acrescentar quando o suporte precisar distinguir.
- `messages.upsert` do número do atendimento (o 1:1 e o grupo que chega nele): PR 4.
