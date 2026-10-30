# Recuperar — PR 1a: banco comum (Recuperar + Rastreio) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar no banco a base que o Recuperar e o Rastreio dividem — conexão e avisos da Yampi, o número do atendimento (conversas, mensagens, ritmo, sinais, lista "não falar no privado"), `instances.purpose`, os campos do DM em `engine_commands`, as flags `recuperar_enabled`/`rastreio_enabled`, os módulos novos da vendedora e a limpeza — sem mudar comportamento nenhum.

**Architecture:** Uma migração idempotente aplicada pelo CI (`migrate-dev` no PR, `migrate-prod` no merge). As sete tabelas novas têm RLS ligado; as cinco do número do atendimento ganham policy de leitura para os membros da loja (`app.user_tenant_ids()`, vendedora fora) e `authenticated` só com SELECT nelas; as duas da Yampi ficam sem policy e sem privilégio fora do service_role. Só o servidor (service_role, `.eq('tenant_id')`) grava. Duas provas: `infra/tests/base-comum-yampi-privado-check.sql` (catálogo — RLS, ACL, nomes, gatilhos — nos dois bancos) e `apps/web/src/lib/privado/base-comum.integration.test.ts` (comportamento pelo PostgREST, no job e2e, contra dev).

**Tech Stack:** Postgres 17 (Supabase), SQL/plpgsql, Supabase CLI (`db query --linked`), `tsx --test` (node:test) com `@supabase/supabase-js`, GitHub Actions (`.github/workflows/verify.yml`), `gh`.

**Spec:** `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` (§2 inteira; §1.1, §1.4–§1.6 para os valores; §3 "Envio", "Resposta", "Base do privado"; §6; §10 "Integração")

**Índice:** `docs/superpowers/plans/2026-10-29-recuperar-yampi-00-indice.md` ("Contrato comum" e "Restrições globais") · **Rastreio:** `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md` ("Contrato pedido à base"; o PR 1 dele só confere que a flag e a trava existem) · **Card:** `recuperar-yampi` (prod)

## Decisões deste plano (onde spec e contrato não diziam)

1. **Uma migração só.** Os objetos se referenciam (`engine_commands.private_message_id` → `private_messages`) e todo PR seguinte (1b, 2, 5, 6, Rastreio 1) precisa do conjunto; partir em várias só multiplicaria baseline e drift entre PRs.
2. **RLS + policy de leitura nas cinco tabelas do número do atendimento; as duas da Yampi só com o service-role** (CLAUDE.md: "ligar RLS + policy assim mesmo"; spec §2). `private_conversations`, `private_messages`, `private_number_state`, `private_signals` e `private_optouts` ganham `<tabela>_select_member`, `for select to authenticated using (tenant_id = any (app.user_tenant_ids()))` — a forma do PR 1b, que avalia o helper uma vez por consulta —, e `authenticated` fica só com SELECT nelas. O helper exclui a vendedora (com ou sem módulo): ela passa pela rota service-role + guarda. O operador lê pelo JWT o que a rota já mostra a ele (spec §5: Hoje, Conversas, Automático e Ajustes). Nada do app lê pelo JWT (Conversas é polling numa rota; o Realtime é decorativo): a policy é segunda linha de defesa e dá controle ao teste "vendedora não lê". `yampi_connections` e `yampi_events` ficam **sem policy e sem privilégio** para `anon`/`authenticated`: a primeira guarda credencial selada (token, chave e segredo do aviso), a segunda o payload cru do aviso, com dado pessoal de cliente (nome, CPF, telefone, endereço); nenhuma tela as lê pelo JWT (o cartão da Yampi passa por rota). Mesmo padrão de `bling_*` e `site_integrations`; o advisor tolera `rls_enabled_no_policy` por classe. Prova da spec §10: a dona lê as cinco da própria loja, a vendedora e a outra loja não leem nada, as duas da Yampi dão `42501` a qualquer JWT e toda escrita pelo JWT dá `42501`.
3. **Credencial com os nomes exatos da spec** (`user_token`, `user_secret_key`, `webhook_secret`), selados por `selar()`, com CHECK do formato (`v<n>.<iv>.<tag>.<cifra>`, base64url): token em texto aberto não grava. `status = 'desconectada'` é o único estado sem credencial.
4. **Unicidade por constraint inteira, nunca índice parcial**, nas chaves que as stores usam em upsert: o `onConflict` do PostgREST não casa com índice parcial, e `NULL` não colide (o "única quando não nula" sai de graça). Exceção: `instances_one_privado_per_tenant`, que o contrato fixa parcial.
5. **`private_messages.dedupe_key` única por loja, como o contrato diz: `unique (tenant_id, dedupe_key)`** — a chave é da linha, então cada parte de um passo grava a sua (o PR 3 decide o sufixo; o PR 4 usa `evo:<key.id>` na mensagem recebida). `provider_message_id` único por loja: o eco `fromMe` de um envio nosso esbarra nele em vez de virar mensagem "pelo celular". **`yampi_events.dedupe_key` única sozinha** (`unique (dedupe_key)`): o PR 6 grava `<id da conexão>:<sha256 do corpo>` e faz upsert com `on_conflict=dedupe_key`.
6. **Valores que o índice passou a fixar** (Contrato comum): `direction` `saida` · `entrada`; `private_signals.kind` `sair` · `recusa` (§1.6); `pause_reason` `sinais` · `restricao` · `entrega` (§1.6; `sinais` e `entrega` são os que o PR 4 grava); horário em hora cheia de Brasília (`smallint`), envio em `[horario_inicio, horario_fim)`. `module`, `priority`, `status` e `phone` da mensagem são obrigatórios só para o que a Girumo manda (`automatico`, `pessoa`); mensagem da cliente e do celular do chip podem vir sem eles.
7. **`message_ref` é texto, sem FK** (o PR 4 grava o id da mensagem): a loja só com o Rastreio não guarda a mensagem da cliente, e o SAIR vive mais que a mensagem (180 dias). **`private_messages.command_id` sem FK**: o vínculo com FK é o do contrato (`engine_commands.private_message_id`), e `engine_commands` só é apagado na cascata da loja.
8. **Limpeza apaga a conversa** (as mensagens vão em cascata) quando a última atividade (`greatest(created_at, last_message_at, last_inbound_at)`) passou de 180 dias **e** não há mensagem dos últimos 180 dias — o segundo teste segura a conversa se o produtor esquecer de atualizar `last_message_at`. Devolve avisos + conversas apagados.
9. **`app.limpar_dados_vencidos_comuns()` (nome do contrato) + `public.limpar_dados_vencidos_comuns()`**: o PostgREST só expõe `public`, então o cron (PR 6) chama o wrapper por `rpc`. Molde de `public.prune_instance_sends` (`20260729120000`): `language sql`, `security definer`, `set search_path = public, app`, só chama a do `app`; EXECUTE só `service_role`.
10. **Flags protegidas como `instagram_enabled`** (o Rastreio e o PR 5 pedem). Conferido em 29/10: a de Instagram tem duas camadas — o trigger `tenant_settings_guard_instagram_flag` (`20261003120000`) e, desde `20261004120000`, `authenticated` sem INSERT/UPDATE em tabela nenhuma de `public` (a policy `tenant_settings_update_member` existe, mas sem privilégio não vale). As duas flags novas herdam a segunda camada e ganham a primeira: `public.tenant_settings_guard_recuperar_rastreio_flags()` + trigger de mesmo nome, com a forma exata da de Instagram (INSERT recusa flag ligada; UPDATE recusa mudança). Provas: o JWT da dona recebe 42501 e a flag não muda, o service_role liga (integração); com o privilégio de INSERT dado só dentro do `rollback`, a trava recusa (check — o ramo de UPDATE precisaria de um JWT de membro dentro do SQL, e tem a mesma forma do que já roda em prod).
11. **`engine_commands` sem CHECK novo**: não há CHECK em `type` nem no destino (`@g.us`) — conferido em 29/10, nada a afrouxar; `dm_module` é cópia de `private_messages.module`, que tem o CHECK. Dois índices parciais: o lado filho do FK e a fila de DM por número.
12. **Índices só para os acessos previstos:** conversa por (número, `phone_key`) e por (número, `lid`); contador "precisa de você" da barra por (`tenant_id`, `status`); mensagem por `provider_message_id` e por `dedupe_key`; histórico (`conversation_id, created_at`); evento por `dedupe_key` e pendente; sinais por (número, `at`); claim de DM. A ordenação da lista de Conversas fica com o PR 8 (spec §11).
13. **`updated_at` com `app.set_updated_at()`** nas quatro tabelas que mudam (`yampi_connections`, `private_conversations`, `private_messages`, `private_number_state`): o status da mensagem muda depois de gravada, e o polling precisa ver.
14. **Ordem no arquivo:** tabelas novas e funções primeiro; `engine_commands`, `tenant_settings`, `instances` e `memberships` (lidas pelo worker e em todo request) no fim, para o `ACCESS EXCLUSIVE` durar o mínimo até o commit; `set lock_timeout = '5s'` no topo.
15. **Baseline calculada aqui.** A fórmula de `public.schema_signature()` reproduziu as chaves atuais de `instances`, `engine_commands` e `tenant_settings` (conferido em 29/10), então as doze chaves novas estão no Task 2. Se outro PR mexer numa dessas três tabelas antes do merge, a chave muda: recalcule pelo `r` do check em dev.

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

Deste PR:

- Nomes do contrato, exatos: as sete tabelas e as colunas da spec §2; `public.phone_key(p text)` (já existe, `20261010130000`) gera toda coluna `phone_key` (`generated always as (public.phone_key(phone)) stored`) — nenhuma função de telefone nova; `instances.purpose text not null default 'grupos' check (purpose in ('grupos','privado'))` + `instances_one_privado_per_tenant on instances (tenant_id) where purpose = 'privado'`; `tenant_settings.recuperar_enabled`/`rastreio_enabled boolean not null default false`; `memberships_modules_validos` aceita `postar`, `recuperar`, `rastreio`; `engine_commands.private_message_id uuid` (FK `private_messages`, `on delete set null`), `dm_module text`, `valid_until timestamptz`; tipos `dm_text`, `dm_image`; `private_messages.priority`, `dedupe_key`, `part_index smallint` (0–2), `phone`; `app.limpar_dados_vencidos_comuns() returns integer`.
- Valores (CHECK): módulo `recuperar` · `rastreio` · `teste`; prioridade `resposta` · `pix` · `pedido` · `carrinho`; status da mensagem `na_fila` · `enviada` · `entregue` · `lida` · `falhou` · `cancelada`; autor `automatico` · `pessoa` · `cliente` · `celular`; tipo `texto` · `imagem` · `audio` · `outro`; status da conversa `precisa_de_voce` · `aberta` · `encerrada`; status da conexão `ativa` · `credencial_invalida` · `aviso_desativado` · `desconectada`.
- Limites da spec: `text` até 4096, `last_preview` até 200; horário 9h–21h por padrão, ajustável entre 8h e 22h; avisos crus 30 dias; mensagens 180 dias depois da última da conversa; `private_optouts` sem prazo.
- Nenhum comportamento muda: nenhum seletor, claim, rota ou worker passa a ler estes objetos (PRs 2, 3, 4, 6).
- Repo público: telefones, ids e nomes dos testes são inventados (`55629…`, lojas `privtest-<run>` e `ab1a0000-…`, alias `privtest-<run>`); nenhum dado da loja-piloto.
- Bash do executor: o cwd reseta entre chamadas — todo comando começa com `WT=$(git rev-parse --show-toplevel)`. Blocos para o Igor: PowerShell 5.1 (sem `&&`), com o caminho Windows `<WT>` impresso no Task 0.
- ≤ 10 arquivos (são 5).

## Review Focus

1. **O mesmo telefone com e sem o 55 ou o nono dígito** (a Yampi manda `55`+DDD+número, o `whatsappNumbers` devolve JID sem o 9) → duas conversas para a mesma cliente, o teto contando duas "conversas novas" e o SAIR de uma não valendo na outra. → Task 1, testes `private_conversations: …` e `private_optouts: …`.
2. **A mesma parte do mesmo passo enfileirada duas vezes** (aviso repetido, cron que roda de novo, duplo clique em Mandar) → a cliente recebe em dobro. → Task 1, teste `private_messages: …` (23505 na mesma chave; chave da outra parte, outra loja e linha sem chave passam).
3. **Segundo número de privado na mesma loja** (duplo clique em conectar; Recuperar e Rastreio conectando cada um o seu) → ritmo e conversa divididos entre dois chips. → Task 1, teste `instances.purpose: …`.
4. **Token da Yampi em texto aberto, ou conexão "ativa" sem credencial** (store que esquece de selar; desconexão pela metade) → token legível no banco e no backup; cron chamando a Yampi com token nulo. → Task 1, teste `yampi: …`.
5. **Limpeza apagando conversa viva ou travando num FK** (`last_message_at` que o produtor não atualizou; resposta recente só em `last_inbound_at`; comando apontando para a mensagem) → some o histórico de quem respondeu ontem, ou a limpeza falha todo dia. → Task 1, teste `limpar_dados_vencidos_comuns: …`.

---

## Arquivos

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `infra/tests/base-comum-yampi-privado-check.sql` | criar | catálogo nos dois bancos (RLS, ACL, nomes, índices, gatilhos), trava das flags e as doze assinaturas |
| `apps/web/src/lib/privado/base-comum.integration.test.ts` | criar | comportamento pelo PostgREST no job e2e (constraints, `phone_key`, limpeza; a dona lê só as cinco `private_*` da própria loja, a vendedora nada, as `yampi_*` ninguém; nenhum JWT escreve nem liga a flag) |
| `apps/web/supabase/migrations/20261029120000_base_comum_yampi_privado.sql` | criar | tabelas, colunas, constraints, índices, RLS, privilégios, trava, limpeza |
| `deploy/supabase/apply-order.txt` | modificar | entrada da migração no fim |
| `deploy/supabase/schema-baseline.json` | modificar | 3 chaves mudam, 9 entram |

## Contrato do banco (o que os testes cobram e a migração entrega)

Os testes (Task 1) são escritos contra esta tabela; a migração (Task 2) a entrega; os PRs 1b, 2, 3, 4, 5, 6 e o PR 1 do Rastreio a consomem. Nome de constraint aparece no `message` do PostgREST entre aspas.

| Objeto | O que garante | Recusa (`code` · nome) |
|---|---|---|
| `instances.purpose` | `'grupos'` (padrão) ou `'privado'`; no máximo uma `privado` por loja | 23514 `instances_purpose_check` · 23505 `instances_one_privado_per_tenant` |
| `tenant_settings.recuperar_enabled`, `.rastreio_enabled` | `boolean not null default false`; só o servidor (service_role) muda. Membro com JWT não liga: sem privilégio de escrita (42501 `permission denied for table tenant_settings`) e, se um dia ganhar, o trigger `tenant_settings_guard_recuperar_rastreio_flags` (`before insert or update`) recusa | 42501 · `recuperar_enabled e rastreio_enabled so podem ser alterados pelo servidor` |
| `memberships.modules` | ⊆ `postar, recuperar, rastreio`; só `seller` tem módulo | 23514 `memberships_modules_validos` |
| `engine_commands` | `private_message_id` (FK, `on delete set null`), `dm_module`, `valid_until`; `dm_text`/`dm_image` sem mudança de schema; índice `engine_commands_dm_fila_idx (instance_id, priority, available_at) where status = 'queued' and type in ('dm_text','dm_image')` — serve ao claim do PR 3 se ele gravar a ordem do DM em `priority` (menor sai antes) | — |
| `yampi_connections` | `id` vai na URL do aviso; uma por loja; credenciais seladas; só `desconectada` sem token e chave | 23505 `yampi_connections_tenant_id_key` · 23514 `yampi_connections_segredos_selados`, `yampi_connections_ativa_tem_credencial`, `yampi_connections_status_check` |
| `yampi_events` | `dedupe_key` única sozinha (upsert com `onConflict: "dedupe_key"`); `processed_at` nulo = pendente (`yampi_events_pendentes_idx`) | 23505 `yampi_events_dedupe_unique` |
| `private_conversations` | uma por (número, `phone_key`) e por (número, `lid`); `phone` só dígitos (10–13) ou nulo; precisa de `phone` ou `lid`; índice `private_conversations_tenant_status_idx (tenant_id, status)` para o contador "precisa de você" da barra | 23505 `private_conversations_telefone_unique`, `private_conversations_lid_unique` · 23514 `private_conversations_tem_contato`, `private_conversations_phone_check`, `private_conversations_status_check` |
| `private_messages` | uma linha por (loja, `dedupe_key`) — cada parte do passo com a sua chave — e por (loja, `provider_message_id`), as duas por constraint inteira (`onConflict: "tenant_id,dedupe_key"` funciona); `entrada` ⇔ `cliente`; `automatico`/`pessoa` levam `module`, `priority`, `status` e `phone`; `text` ≤ 4096 (quem grava a resposta da cliente corta antes); sem `vencida` no status | 23505 `private_messages_dedupe_unique`, `private_messages_provider_unique` · 23514 `private_messages_direcao_do_autor`, `private_messages_envio_completo`, `private_messages_<coluna>_check` |
| `private_number_state` | uma por número (`instance_id` pk); `horario_inicio` 9 e `horario_fim` 21 por padrão, entre 8 e 22, início < fim; `pause_reason` `sinais`, `restricao` ou `entrega`; toda coluna NOT NULL além de `instance_id` e `tenant_id` tem padrão | 23514 `private_number_state_horario`, `…_horario_inicio_check`, `…_horario_fim_check`, `…_pause_reason_check` |
| `private_signals` | `kind` `sair` ou `recusa`; contagem por (número, `at`) | 23514 `private_signals_kind_check` |
| `private_optouts` | um por (loja, `phone_key`); `phone` obrigatório, só dígitos | 23505 `private_optouts_telefone_unique` |
| `public.limpar_dados_vencidos_comuns() returns integer` | apaga aviso com `received_at` > 30 dias e conversa parada > 180 dias (mensagens em cascata; comando fica com `private_message_id` nulo); `execute` só `service_role` | — |
| RLS e privilégios | RLS nas sete; `<tabela>_select_member` (`for select to authenticated using (tenant_id = any (app.user_tenant_ids()))`) nas cinco `private_*`; `authenticated`: só SELECT nas cinco `private_*` (a policy filtra a loja e tira a vendedora), nada nas duas `yampi_*`; `anon`: nada nas sete; `service_role`: select/insert/update/delete | 42501 (escrita pelo JWT; leitura das `yampi_*` pelo JWT; qualquer coisa pelo `anon`) |

**Toda tabela nova tem `tenant_id uuid not null references public.organizations(id) on delete cascade`** (`private_number_state` inclusive, ao lado da pk `instance_id`) e toda leitura ou escrita das stores leva `.eq('tenant_id', …)`.

**Colunas NOT NULL** (para fixture e insert; `phone_key` é gerada e nunca vai no insert):

| Tabela | NOT NULL sem padrão (o insert manda) | NOT NULL com padrão | Regra entre colunas |
|---|---|---|---|
| `private_conversations` | `tenant_id`, `instance_id` | `id` (`gen_random_uuid()`), `status` (`'aberta'`), `unread` (`0`), `created_at`, `updated_at` (`now()`) | `phone` ou `lid` preenchido (`private_conversations_tem_contato`) |
| `private_messages` | `tenant_id`, `conversation_id`, `direction`, `author` | `id`, `kind` (`'texto'`), `part_index` (`0`), `created_at`, `updated_at` | `direction = 'entrada'` ⇔ `author = 'cliente'`; `author` `automatico`/`pessoa` exige `module`, `priority`, `status` e `phone` (`private_messages_envio_completo`) |

`direction` aceita `'saida'` e `'entrada'`. Fixture mínima de mensagem da Girumo: `{ tenant_id, conversation_id, direction: "saida", author: "automatico", module: "recuperar", priority: "pix", status: "na_fila", phone: "5562…" }`; da cliente: `{ tenant_id, conversation_id, direction: "entrada", author: "cliente" }`.

Regra para quem vier depois: **todo FK que apontar para `private_conversations` ou `private_messages` (PR 1b `recovery_cases.conversation_id`, Rastreio `tracking_notices.message_id`) é `on delete set null` ou `cascade`** — a limpeza apaga conversa e mensagem. O PR 1b cria `app.limpar_dados_vencidos_recuperar()` com o seu wrapper `public.`, como aqui. Coluna que o PR 1b acrescentar em `private_messages` entra nullable (ou com padrão): as linhas do Rastreio e as da cliente não a preenchem.

---

### Task 0: worktree, conferências e card

**Files:** nenhum arquivo do repositório (cria `C:\Users\Igor\AppData\Local\Temp\recuperar-1a-card-abrir.sql`).

**Interfaces:**
- Consumes: nada (o 1a não depende de outro PR).
- Produces: worktree na branch `feat/recuperar-banco-comum`, criada de `origin/main` em dia; `<WT>`; prefixo de migração livre; card `recuperar-yampi` em `em_construcao`.

- [ ] **Step 1: worktree novo a partir de `origin/main`** (nunca `checkout -b` no checkout principal). Se a sessão já está num worktree novo, só crie a branch nele (`git switch -c feat/recuperar-banco-comum origin/main`). Senão:

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform fetch origin main && git -C /c/Users/Igor/Desktop/HubFlow-platform worktree add .claude/worktrees/recuperar-1a -b feat/recuperar-banco-comum origin/main
```

- [ ] **Step 2: posição e que nada disto existe**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" fetch origin main; git -C "$WT" status -sb | head -1; git -C "$WT" rev-list --count HEAD..origin/main; git -C "$WT" grep -l -E "private_conversations|yampi_connections" origin/main -- apps/web/supabase/migrations; git -C "$WT" ls-tree --name-only origin/main apps/web/supabase/migrations/ | grep "/20261029"; gh pr list --repo codingB0y/Girumo --state open --json number,headRefName,title --jq '.[] | "\(.number) \(.headRefName) \(.title)"'
```

Esperado: `## feat/recuperar-banco-comum`, `0`, nada do `grep` nem do `ls-tree`. Na lista de PRs, nenhum que crie `private_conversations` ou `yampi_connections` (PR só de docs da série pode aparecer). Achou = outra sessão fez a base: **pare** e avise o Igor.

- [ ] **Step 3: `<WT>`** (caminho Windows, usado nos blocos do Igor): `cygpath -w "$(git rev-parse --show-toplevel)"`.

- [ ] **Step 4: nome da migração.** O plano usa `20261029120000_base_comum_yampi_privado.sql`. Se hoje não é 29/10/2026, ou o Step 2 achou o prefixo ocupado (inclusive num PR aberto do 1b ou do 2), troque `20261029120000` pelo dia de hoje + `120000` (ou `121000`, `122000`…) em todo lugar deste plano onde ele aparece: nome do arquivo, linha da `apply-order` (Task 2, Step 2), cabeçalhos do check e do teste (Task 1), comandos e corpo do PR. Prefixo duplicado quebra o Supabase CLI; a ordem de aplicação é a da `apply-order`.

- [ ] **Step 5: PEÇA AO IGOR — abrir o card** (spec §9: "Antes do PR 1a: abrir o card `recuperar-yampi`"). Ferramenta Write em `C:\Users\Igor\AppData\Local\Temp\recuperar-1a-card-abrir.sql`:

```sql
insert into public.board_features (key, title, area, status, summary, priority)
values ('recuperar-yampi', 'Recuperar (carrinho e Pix da Yampi pelo WhatsApp)', 'Vendas', 'nao_existe',
        'Add-on R$ 127/mês: Pix pendente e carrinho da Yampi recuperados pelo número do atendimento, com chat embutido. Spec docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md; planos 2026-10-29-recuperar-yampi-*.',
        'alta')
on conflict (key) do nothing;
select public.move_card('recuperar-yampi', 'em_construcao', 'PR 1a (banco comum com o Rastreio) começou',
                        'docs/superpowers/plans/2026-10-29-recuperar-yampi-01a-banco-comum.md');
```

Bloco para ele (PowerShell 5.1; o link volta para dev no fim):

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref nidoatbxaylrkcgbszns --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -o json -f "$env:TEMP\recuperar-1a-card-abrir.sql" }
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

Esperado: a linha de `move_card` com `status` `em_construcao`. Siga sem esperar a resposta dele; confira no Task 4.

---

### Task 1: testes primeiro — conferência SQL (RED em dev) e teste de integração

**Files:**
- Create: `infra/tests/base-comum-yampi-privado-check.sql`
- Create: `apps/web/src/lib/privado/base-comum.integration.test.ts`

**Interfaces:**
- Consumes: "Contrato do banco" acima (nomes, valores, códigos); `getSupabaseAdmin`, `getSupabaseAnonForToken` de `@/lib/supabase/server`; `public.schema_signature()`; o padrão de `criarPessoa` em `apps/web/src/lib/stores/order-items.integration.test.ts:57-82`.
- Produces: o RED (o check falha em dev com a tabela ausente) e os onze testes que o job e2e roda depois do `migrate-dev`.

- [ ] **Step 1: escrever a conferência** — `infra/tests/base-comum-yampi-privado-check.sql`:

```sql
-- Conferência do PR 1a do Recuperar (base comum com o Rastreio; migração
-- 20261029120000_base_comum_yampi_privado.sql), nos DOIS bancos, depois de aplicar. Rodar de apps\web
-- (dev pode ser pelo executor; prod é do Igor, depois do migrate-prod):
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\base-comum-yampi-privado-check.sql
--
-- Existe porque o gate de drift não vê RLS, policy, ACL, CHECK, índice, trigger nem corpo de função.
-- O comportamento (constraints pelo PostgREST, phone_key, limpeza, o que o JWT da dona e o da vendedora
-- leem e não escrevem) é do
-- teste apps/web/src/lib/privado/base-comum.integration.test.ts, no job e2e, contra dev.
-- Escreve só entre begin e rollback: duas lojas falsas (ab1a0000-…) e um GRANT que só vive até o
-- rollback, para provar que é a trava (e não a falta de privilégio) que recusa a flag. Cada bloco
-- levanta 'FALHOU: …' e o script para ali. Sem erro, a última linha traz r = as doze assinaturas da
-- baseline. Antes da migração o bloco 1 falha com 'FALHOU: tabela public.yampi_connections ausente'.

begin;

-- 1) As sete tabelas: existem, RLS ligado; anon sem privilégio nenhum (nem por coluna); service_role lê e
--    escreve. As cinco do número do atendimento: exatamente a policy <tabela>_select_member (select, só
--    authenticated, por app.user_tenant_ids) e authenticated só com SELECT. As duas da Yampi: nenhuma policy
--    e authenticated sem privilégio nenhum (credencial selada; payload cru com dado pessoal).
do $$
declare
  t text;
  r regclass;
  v_leitura boolean;
begin
  foreach t in array array['yampi_connections', 'yampi_events', 'private_conversations', 'private_messages',
                           'private_number_state', 'private_signals', 'private_optouts'] loop
    r := to_regclass('public.' || t);
    if r is null then
      raise exception 'FALHOU: tabela public.% ausente', t;
    end if;
    if not (select c.relrowsecurity from pg_class c where c.oid = r) then
      raise exception 'FALHOU: RLS desligado em %', t;
    end if;
    v_leitura := t like 'private\_%';
    if v_leitura then
      if (select count(*) from pg_policy p where p.polrelid = r) <> 1
         or not exists (select 1 from pg_policy p
                         where p.polrelid = r and p.polname = t || '_select_member' and p.polcmd = 'r'
                           and p.polroles = array['authenticated'::regrole]::oid[]
                           and pg_get_expr(p.polqual, p.polrelid) like '%user_tenant_ids%') then
        raise exception 'FALHOU: % sem exatamente a policy %_select_member (select, authenticated, app.user_tenant_ids)', t, t;
      end if;
    elsif exists (select 1 from pg_policy p where p.polrelid = r) then
      raise exception 'FALHOU: % tem policy (as tabelas da Yampi são só do service_role)', t;
    end if;
    if has_table_privilege('anon', r, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_any_column_privilege('anon', r, 'SELECT, INSERT, UPDATE, REFERENCES')
       or has_table_privilege('authenticated', r, 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
       or has_any_column_privilege('authenticated', r, 'INSERT, UPDATE, REFERENCES')
       or has_table_privilege('authenticated', r, 'SELECT') <> v_leitura then
      raise exception 'FALHOU: privilégio de anon ou authenticated fora do contrato em % (authenticated só lê as private_*)', t;
    end if;
    if not (has_table_privilege('service_role', r, 'SELECT') and has_table_privilege('service_role', r, 'INSERT')
            and has_table_privilege('service_role', r, 'UPDATE') and has_table_privilege('service_role', r, 'DELETE')) then
      raise exception 'FALHOU: service_role sem leitura e escrita em %', t;
    end if;
  end loop;
end $$;

-- 2) Nomes que as stores leem no erro, colunas novas, FK, índices e gatilhos.
do $$
declare
  v_faltam text;
begin
  select string_agg(e.tabela || '.' || e.nome, ', ') into v_faltam
    from (values
      ('instances', 'instances_purpose_check'),
      ('yampi_connections', 'yampi_connections_status_check'),
      ('yampi_connections', 'yampi_connections_segredos_selados'),
      ('yampi_connections', 'yampi_connections_ativa_tem_credencial'),
      ('yampi_events', 'yampi_events_dedupe_unique'),
      ('private_conversations', 'private_conversations_telefone_unique'),
      ('private_conversations', 'private_conversations_lid_unique'),
      ('private_conversations', 'private_conversations_tem_contato'),
      ('private_messages', 'private_messages_dedupe_unique'),
      ('private_messages', 'private_messages_provider_unique'),
      ('private_messages', 'private_messages_direcao_do_autor'),
      ('private_messages', 'private_messages_envio_completo'),
      ('private_number_state', 'private_number_state_horario'),
      ('private_signals', 'private_signals_kind_check'),
      ('private_optouts', 'private_optouts_telefone_unique')) as e(tabela, nome)
   where not exists (select 1 from pg_constraint c
                      where c.conrelid = ('public.' || e.tabela)::regclass
                        and c.conname = e.nome and c.convalidated);
  if v_faltam is not null then
    raise exception 'FALHOU: constraints ausentes: %', v_faltam;
  end if;

  if coalesce((select pg_get_constraintdef(c.oid) from pg_constraint c
                where c.conrelid = 'public.memberships'::regclass
                  and c.conname = 'memberships_modules_validos'), '')
     !~ '''postar''.*''recuperar''.*''rastreio''' then
    raise exception 'FALHOU: memberships_modules_validos não aceita postar, recuperar e rastreio';
  end if;

  if not exists (select 1 from pg_constraint c
                  where c.conrelid = 'public.engine_commands'::regclass
                    and c.conname = 'engine_commands_private_message_id_fkey'
                    and c.contype = 'f'
                    and c.confrelid = 'public.private_messages'::regclass
                    and c.confdeltype = 'n') then
    raise exception 'FALHOU: engine_commands.private_message_id sem FK on delete set null';
  end if;

  if (select count(*) from information_schema.columns k
       where k.table_schema = 'public' and k.is_nullable = 'NO'
         and (k.table_name::text, k.column_name::text, k.column_default::text) in (
           ('instances', 'purpose', '''grupos''::text'),
           ('tenant_settings', 'recuperar_enabled', 'false'),
           ('tenant_settings', 'rastreio_enabled', 'false'))) <> 3 then
    raise exception 'FALHOU: purpose, recuperar_enabled ou rastreio_enabled sem not null e o padrão do contrato';
  end if;

  select string_agg(i.nome, ', ') into v_faltam
    from (values ('instances_one_privado_per_tenant'), ('engine_commands_private_message_idx'),
                 ('engine_commands_dm_fila_idx'), ('yampi_events_pendentes_idx'),
                 ('private_conversations_tenant_status_idx'), ('private_messages_conversation_idx'),
                 ('private_signals_instance_at_idx')) as i(nome)
   where to_regclass('public.' || i.nome) is null;
  if v_faltam is not null then
    raise exception 'FALHOU: índices ausentes: %', v_faltam;
  end if;
  if not exists (select 1 from pg_index x
                  where x.indexrelid = 'public.instances_one_privado_per_tenant'::regclass
                    and x.indisunique
                    and pg_get_expr(x.indpred, x.indrelid) = '(purpose = ''privado''::text)') then
    raise exception 'FALHOU: instances_one_privado_per_tenant tem de ser único e parcial (purpose = privado)';
  end if;

  if not exists (select 1 from pg_trigger t
                  where t.tgrelid = 'public.tenant_settings'::regclass
                    and t.tgname = 'tenant_settings_guard_recuperar_rastreio_flags'
                    and t.tgfoid = to_regprocedure('public.tenant_settings_guard_recuperar_rastreio_flags()')
                    and t.tgtype = 23            -- row + before + insert + update
                    and t.tgenabled = 'O') then
    raise exception 'FALHOU: trigger de guarda das flags ausente ou fora de before insert or update for each row';
  end if;
  select string_agg(x.tabela, ', ') into v_faltam
    from (values ('yampi_connections'), ('private_conversations'), ('private_messages'),
                 ('private_number_state')) as x(tabela)
   where not exists (select 1 from pg_trigger t
                      where t.tgrelid = ('public.' || x.tabela)::regclass
                        and t.tgname = 'set_updated_at_' || x.tabela);
  if v_faltam is not null then
    raise exception 'FALHOU: sem trigger de updated_at em: %', v_faltam;
  end if;
end $$;

-- 3) Funções: limpeza definer com search_path e execute só do service_role; trava invoker, ninguém
--    chama direto. As colunas phone_key geradas exigem que service_role execute public.phone_key.
do $$
begin
  if exists (
    select 1
      from (values ('app.limpar_dados_vencidos_comuns()', true),
                   ('public.limpar_dados_vencidos_comuns()', true),
                   ('public.tenant_settings_guard_recuperar_rastreio_flags()', false)) as f(sig, definer)
      left join pg_proc p on p.oid = to_regprocedure(f.sig)
     where p.oid is null
        or p.prosecdef <> f.definer
        or not exists (select 1 from unnest(p.proconfig) as c(cfg) where c.cfg like 'search_path=%')
        or has_function_privilege('anon', p.oid, 'EXECUTE')
        or has_function_privilege('authenticated', p.oid, 'EXECUTE')
        or (f.definer and not has_function_privilege('service_role', p.oid, 'EXECUTE'))
  ) then
    raise exception 'FALHOU: funções da base fora do contrato (definer, search_path, execute só service_role)';
  end if;
  if not has_function_privilege('service_role', 'public.phone_key(text)', 'EXECUTE') then
    raise exception 'FALHOU: service_role não executa public.phone_key (as colunas geradas quebram)';
  end if;
end $$;

-- 4) Trava das flags. O servidor (aqui, postgres) liga e desliga. authenticated não tem escrita em
--    tenant_settings; o GRANT abaixo vale só até o rollback, para a recusa vir da trava.
insert into public.organizations (id, tenant_id, name, slug) values
  ('ab1a0000-0000-4000-8000-00000000000a', 'ab1a0000-0000-4000-8000-00000000000a',
   'Check base privado A', 'check-base-privado-ab1a'),
  ('ab1a0000-0000-4000-8000-00000000000b', 'ab1a0000-0000-4000-8000-00000000000b',
   'Check base privado B', 'check-base-privado-ab1b');

do $$
begin
  insert into public.tenant_settings (tenant_id, recuperar_enabled, rastreio_enabled)
  values ('ab1a0000-0000-4000-8000-00000000000a', true, true);
  update public.tenant_settings set recuperar_enabled = false, rastreio_enabled = false
   where tenant_id = 'ab1a0000-0000-4000-8000-00000000000a';
  if not found then
    raise exception 'FALHOU: o servidor não desligou as flags';
  end if;
end $$;

grant insert (tenant_id, recuperar_enabled, rastreio_enabled) on public.tenant_settings to authenticated;
set local role authenticated;

do $$
begin
  begin
    insert into public.tenant_settings (tenant_id, rastreio_enabled)
    values ('ab1a0000-0000-4000-8000-00000000000b', true);
    raise exception 'FALHOU: authenticated ligou rastreio_enabled';
  exception when insufficient_privilege then
    if sqlerrm not like '%so podem ser alterados pelo servidor%' then
      raise exception 'FALHOU: recusado por outro motivo, não pela trava: %', sqlerrm;
    end if;
  end;
end $$;

reset role;

-- 5) Assinaturas para a baseline (as doze chaves do Task 2, Step 3).
select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r
  from public.schema_signature()
 where (kind = 't' and nome in ('instances', 'engine_commands', 'tenant_settings', 'yampi_connections',
                                'yampi_events', 'private_conversations', 'private_messages',
                                'private_number_state', 'private_signals', 'private_optouts'))
    or (kind = 'f' and nome in ('limpar_dados_vencidos_comuns()',
                                'tenant_settings_guard_recuperar_rastreio_flags()'));

rollback;
```

- [ ] **Step 2: RED em dev** (DML e GRANT só dentro de `begin`…`rollback`; se o classificador negar, pule — o GREEN do Task 3 cobre):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && supabase link --project-ref wfjuwogxaupyadwhvoxy --yes && supabase db query --linked -o json -f ../../infra/tests/base-comum-yampi-privado-check.sql
```

Esperado: erro `… P0001: FALHOU: tabela public.yampi_connections ausente`. Outro `FALHOU` = alguém já criou parte da base em dev (PR aberto?): pare e investigue.

- [ ] **Step 3: escrever o teste de integração** — `apps/web/src/lib/privado/base-comum.integration.test.ts`. Cabeçalho, ligar/pular e limpeza no molde de `apps/web/src/lib/bling/banco.integration.test.ts`; `criarPessoa` copiada de `order-items.integration.test.ts:57-82` com e-mail `privtest-${RUN}-${apelido}@exemplo.invalid`. Os testes rodam em ordem (node:test, um arquivo): o de RLS vem antes do de módulos.

```ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getSupabaseAdmin, getSupabaseAnonForToken } from "@/lib/supabase/server";

/**
 * Base comum do Recuperar e do Rastreio (migração 20261029120000_base_comum_yampi_privado, PR 1a)
 * contra o Supabase de DEV, no job e2e, em duas lojas descartáveis criadas aqui e apagadas no fim (a
 * cascata de organizations leva instâncias, conversas, mensagens, comandos, conexão, avisos e listas)
 * e uma dona e uma vendedora com login de verdade. A loja de QA não é tocada; E2E_TENANT_ID é só a
 * chave de ligar. O catálogo (RLS, ACL, gatilhos) é do infra/tests/base-comum-yampi-privado-check.sql,
 * que também roda em prod. Aqui: o que as stores dos PRs 2, 3, 4, 5 e 6 vão pisar pelo PostgREST, o que
 * um JWT da loja lê (as cinco private_* da própria loja, nunca pela vendedora) e o que ele NÃO consegue
 * (ler as tabelas da Yampi, escrever em qualquer uma, ligar o add-on).
 */

const LIGADO = Boolean(process.env.E2E_TENANT_ID);
// Estas linhas criam usuário e loja: apontado para produção, o teste não roda.
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);
const DIA_MS = 86_400_000;
const TABELAS_DA_YAMPI = ["yampi_connections", "yampi_events"] as const;
const TABELAS_DO_NUMERO = [
  "private_conversations", "private_messages", "private_number_state", "private_signals", "private_optouts",
] as const;
const TABELAS = [...TABELAS_DA_YAMPI, ...TABELAS_DO_NUMERO] as const;
/** Forma do selar() (v1.<iv 12 B>.<tag 16 B>.<cifra>, base64url), sem segredo nenhum dentro. */
const SELADO = `v1.${"A".repeat(16)}.${"A".repeat(22)}.AAAA`;

type Erro = { code: string; message: string };
type Pessoa = { id: string; token: string };

const usuarios: string[] = [];
let loja = "";
let vizinha = "";
let numeroGrupos = "";
let numeroLoja = "";
let numeroVizinha = "";
let conexaoLoja = "";
let dona: Pessoa = { id: "", token: "" };
let vendedora: Pessoa = { id: "", token: "" };

function pular(): boolean; // como em order-items: produção ou sem E2E_TENANT_ID = console.log do motivo e true
const db = () => getSupabaseAdmin();
const ha = (dias: number) => new Date(Date.now() - dias * DIA_MS).toISOString();
/** insert(...).select().single(); erro vira exceção com o nome da tabela. */
async function inserir<T>(tabela: string, linha: Record<string, unknown>): Promise<T>;
/** O erro do PostgREST ao inserir; null = gravou. */
async function erroAoInserir(tabela: string, linha: Record<string, unknown>): Promise<Erro | null>;
/** Linha da loja com esse id existe? (select id, .eq tenant_id loja, .eq id, maybeSingle) */
async function existe(tabela: string, id: string): Promise<boolean>;
async function criarPessoa(apelido: string): Promise<Pessoa>; // createUser + login por senha (usuarios.push)
/** Linhas de `tenant` que o PostgREST devolve a este JWT (caminho authenticated, com RLS): select("tenant_id",
 *  { count: "exact", head: true }).eq("tenant_id", tenant); erro vira exceção com o code. Molde do PR 1b. */
async function visiveis(token: string, tabela: (typeof TABELAS_DO_NUMERO)[number], tenant: string): Promise<number>;

function recusa(erro: Erro | null, code: "23505" | "23514", nome: string): void {
  assert.equal(erro?.code, code, `esperava ${code} em ${nome}, veio ${JSON.stringify(erro)}`);
  assert.match(erro?.message ?? "", new RegExp(`"${nome}"`));
}

before(async () => {
  if (pular()) return;
  if (!process.env.SUPABASE_ANON_KEY) throw new Error("integração ligada sem SUPABASE_ANON_KEY");
  // organizations: [{ name: `privtest ${RUN}`, slug: `privtest-${RUN}` }, { name: `privtest vizinha ${RUN}`, slug: `privtest-vizinha-${RUN}` }]
  //   → [loja, vizinha] na ordem do envio
  // instances: numeroGrupos = { tenant_id: loja, name: `privtest grupos ${RUN}` } (sem purpose);
  //   numeroLoja = { tenant_id: loja, name: …, purpose: "privado" };
  //   numeroVizinha = { tenant_id: vizinha, name: …, purpose: "privado" }
  // conexaoLoja = yampi_connections { tenant_id: loja, alias: `privtest-${RUN}`, user_token: SELADO,
  //   user_secret_key: SELADO, webhook_secret: SELADO }
  // dona = await criarPessoa("dona"); vendedora = await criarPessoa("vendedora");
  // memberships [{ tenant_id: loja, user_id: dona.id, role: "owner", accepted_at: agora },
  //              { tenant_id: loja, user_id: vendedora.id, role: "seller", accepted_at: agora }] (modules = '{}')
});

after(async () => {
  if (pular()) return;
  // Tenta tudo e junta as falhas (molde de order-items): delete de organizations (loja, vizinha);
  // contagem com { count: "exact", head: true } .in("tenant_id", [loja, vizinha]) em
  // [...TABELAS, "engine_commands", "instances"] — sobrou linha = falha; deleteUser de cada usuário.
});

test("RLS: a dona lê as cinco private_* da própria loja; a vendedora e a outra loja não aparecem; as da Yampi dão 42501", { skip: pular() }, async () => {
  // Uma linha de cada tabela do número nas duas lojas, com telefones que nenhum outro teste usa. O estado do
  // número da loja fica no número dos grupos: o teste de private_number_state cria o do numeroLoja.
  for (const [tenant, numero, ritmo] of [[loja, numeroLoja, numeroGrupos], [vizinha, numeroVizinha, numeroVizinha]] as const) {
    const c = await inserir<{ id: string }>("private_conversations", { tenant_id: tenant, instance_id: numero, phone: "5562955550001" });
    await inserir("private_messages", { tenant_id: tenant, conversation_id: c.id, direction: "entrada", author: "cliente", text: "oi" });
    await inserir("private_number_state", { tenant_id: tenant, instance_id: ritmo });
    await inserir("private_signals", { tenant_id: tenant, instance_id: numero, kind: "recusa" });
    await inserir("private_optouts", { tenant_id: tenant, phone: "5562955550002" });
  }
  for (const tabela of TABELAS_DO_NUMERO) {
    assert.ok((await visiveis(dona.token, tabela, loja)) > 0, `a dona não viu ${tabela}: o controle falhou e o teste não prova nada`);
    assert.equal(await visiveis(dona.token, tabela, vizinha), 0, `a dona leu ${tabela} da vizinha`);
    assert.equal(await visiveis(vendedora.token, tabela, loja), 0, `a vendedora leu ${tabela} direto do banco`);
  }
  for (const [quem, pessoa] of [["dona", dona], ["vendedora", vendedora]] as const) {
    for (const tabela of TABELAS_DA_YAMPI) {
      const { error } = await getSupabaseAnonForToken(pessoa.token).from(tabela).select("tenant_id").eq("tenant_id", loja);
      assert.equal(error?.code, "42501", `${quem} em ${tabela}: ${JSON.stringify(error)}`);
    }
  }
});

test("authenticated não escreve: insert, update e delete pelo JWT da dona dão 42501 nas sete tabelas", { skip: pular() }, async () => {
  const jwt = getSupabaseAnonForToken(dona.token);
  for (const t of TABELAS) {
    assert.equal((await jwt.from(t).insert({ tenant_id: loja })).error?.code, "42501", `insert em ${t}`);
    assert.equal((await jwt.from(t).update({ tenant_id: loja }).eq("tenant_id", loja)).error?.code, "42501", `update em ${t}`);
    assert.equal((await jwt.from(t).delete().eq("tenant_id", loja)).error?.code, "42501", `delete em ${t}`);
  }
});

test("instances.purpose: padrão grupos; uma privado por loja; valor fora da lista recusado", { skip: pular() }, async () => {
  const { data } = await db().from("instances").select("purpose").eq("tenant_id", loja).eq("id", numeroGrupos).single();
  assert.equal((data as { purpose: string } | null)?.purpose, "grupos");
  recusa(await erroAoInserir("instances", { tenant_id: loja, name: `privtest 2 ${RUN}`, purpose: "privado" }),
    "23505", "instances_one_privado_per_tenant");
  recusa(await erroAoInserir("instances", { tenant_id: loja, name: `privtest x ${RUN}`, purpose: "outro" }),
    "23514", "instances_purpose_check");
  // A vizinha tem a privado dela (before): o índice é por loja.
});

test("memberships.modules: a vendedora recebe recuperar e rastreio; módulo fora da lista é recusado", { skip: pular() }, async () => {
  const mudar = (modules: string[]) =>
    db().from("memberships").update({ modules }).eq("tenant_id", loja).eq("user_id", vendedora.id);
  assert.equal((await mudar(["postar", "recuperar", "rastreio"])).error, null);
  recusa((await mudar(["recuperar", "vendas"])).error, "23514", "memberships_modules_validos");
  assert.equal((await mudar([])).error, null);
});

test("tenant_settings: as duas flags nascem desligadas, a dona não liga pelo PostgREST e o servidor liga", { skip: pular() }, async () => {
  const flags = "recuperar_enabled, rastreio_enabled";
  const nova = await db().from("tenant_settings").insert({ tenant_id: loja }).select(flags).single();
  assert.deepEqual(nova.data, { recuperar_enabled: false, rastreio_enabled: false });
  for (const flag of ["recuperar_enabled", "rastreio_enabled"] as const) {
    const { error } = await getSupabaseAnonForToken(dona.token).from("tenant_settings")
      .update({ [flag]: true }).eq("tenant_id", loja);
    assert.equal(error?.code, "42501", `a dona mudou ${flag}: ${JSON.stringify(error)}`);
  }
  const lida = await db().from("tenant_settings").select(flags).eq("tenant_id", loja).single();
  assert.deepEqual(lida.data, { recuperar_enabled: false, rastreio_enabled: false });
  const ligada = await db().from("tenant_settings").update({ recuperar_enabled: true, rastreio_enabled: true })
    .eq("tenant_id", loja).select(flags).single();
  assert.deepEqual(ligada.data, { recuperar_enabled: true, rastreio_enabled: true });
});

test("private_conversations: phone_key sem 55 e sem nono dígito; uma conversa por número e telefone e por número e lid", { skip: pular() }, async () => {
  const conversa = (tenant: string, numero: string, campos: Record<string, unknown>) =>
    ({ tenant_id: tenant, instance_id: numero, ...campos });
  const a = await inserir<{ phone_key: string }>("private_conversations", conversa(loja, numeroLoja, { phone: "5562999998888" }));
  assert.equal(a.phone_key, "6299998888");
  recusa(await erroAoInserir("private_conversations", conversa(loja, numeroLoja, { phone: "556299998888" })),
    "23505", "private_conversations_telefone_unique");
  assert.equal(await erroAoInserir("private_conversations", conversa(vizinha, numeroVizinha, { phone: "5562999998888" })), null);
  const semTelefone = await inserir<{ phone_key: string | null }>("private_conversations",
    conversa(loja, numeroLoja, { lid: `${RUN}@lid` }));
  assert.equal(semTelefone.phone_key, null);
  recusa(await erroAoInserir("private_conversations", conversa(loja, numeroLoja, { lid: `${RUN}@lid` })),
    "23505", "private_conversations_lid_unique");
  recusa(await erroAoInserir("private_conversations", conversa(loja, numeroLoja, {})),
    "23514", "private_conversations_tem_contato");
  recusa(await erroAoInserir("private_conversations", conversa(loja, numeroLoja, { phone: "+55 62 98888-0000" })),
    "23514", "private_conversations_phone_check");
});

test("private_messages: valores do contrato, o que a Girumo manda vem completo, uma linha por parte e por id do WhatsApp", { skip: pular() }, async () => {
  const c = await inserir<{ id: string }>("private_conversations", { tenant_id: loja, instance_id: numeroLoja, phone: "5562977776666" });
  const cv = await inserir<{ id: string }>("private_conversations", { tenant_id: vizinha, instance_id: numeroVizinha, phone: "5562977776666" });
  const saida = (tenant: string, conversa: string, campos: Record<string, unknown> = {}) => ({
    tenant_id: tenant, conversation_id: conversa, module: "recuperar", direction: "saida", author: "automatico",
    text: "Oi", phone: "5562977776666", priority: "pix", status: "na_fila",
    dedupe_key: `caso:${RUN}:pix.p1`, part_index: 0, ...campos,
  });
  assert.equal(await erroAoInserir("private_messages", saida(loja, c.id)), null);
  recusa(await erroAoInserir("private_messages", saida(loja, c.id)), "23505", "private_messages_dedupe_unique");
  // A chave é da linha: a parte 2 do mesmo passo grava a sua.
  recusa(await erroAoInserir("private_messages", saida(loja, c.id, { part_index: 1 })), "23505", "private_messages_dedupe_unique");
  assert.equal(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: `caso:${RUN}:pix.p1:1`, part_index: 1 })), null);
  assert.equal(await erroAoInserir("private_messages", saida(vizinha, cv.id)), null, "a mesma chave em outra loja");
  for (let i = 0; i < 2; i++) {
    assert.equal(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: null })), null, "sem chave não colide");
  }
  recusa(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: null, part_index: 3 })),
    "23514", "private_messages_part_index_check");
  for (const [campo, valor] of [["module", "outro"], ["status", "vencida"], ["priority", "urgente"],
                                ["author", "robo"], ["kind", "video"]] as const) {
    recusa(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: null, [campo]: valor })),
      "23514", `private_messages_${campo}_check`);
  }
  recusa(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: null, text: "x".repeat(4097) })),
    "23514", "private_messages_text_check");
  recusa(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: null, author: "cliente" })),
    "23514", "private_messages_direcao_do_autor");
  recusa(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: null, priority: null })),
    "23514", "private_messages_envio_completo");
  // A resposta da cliente chega sem módulo, prioridade, status e telefone.
  const entrada = { tenant_id: loja, conversation_id: c.id, direction: "entrada", author: "cliente",
    text: "quero", provider_message_id: `wa-${RUN}` };
  assert.equal(await erroAoInserir("private_messages", entrada), null);
  recusa(await erroAoInserir("private_messages", entrada), "23505", "private_messages_provider_unique");
  assert.equal(await erroAoInserir("private_messages", { ...entrada, tenant_id: vizinha, conversation_id: cv.id }), null);
});

test("yampi: credencial só selada, ativa tem credencial, uma conexão por loja, aviso não repete", { skip: pular() }, async () => {
  const { data } = await db().from("yampi_connections").select("status").eq("tenant_id", loja).single();
  assert.equal((data as { status: string } | null)?.status, "ativa");
  recusa(await erroAoInserir("yampi_connections", { tenant_id: loja, alias: "outra", status: "desconectada" }),
    "23505", "yampi_connections_tenant_id_key");
  recusa(await erroAoInserir("yampi_connections", { tenant_id: vizinha, alias: "v", user_token: "tok_texto_aberto", user_secret_key: SELADO }),
    "23514", "yampi_connections_segredos_selados");
  recusa(await erroAoInserir("yampi_connections", { tenant_id: vizinha, alias: "v" }),
    "23514", "yampi_connections_ativa_tem_credencial");
  assert.equal(await erroAoInserir("yampi_connections", { tenant_id: vizinha, alias: "v", status: "desconectada" }), null);
  const aviso = { tenant_id: loja, connection_id: conexaoLoja, event: "order.paid", resource_id: "1",
    dedupe_key: `order.paid:1:${RUN}`, payload: {} };
  assert.equal(await erroAoInserir("yampi_events", aviso), null);
  recusa(await erroAoInserir("yampi_events", aviso), "23505", "yampi_events_dedupe_unique");
});

test("private_optouts: um por loja e telefone, com e sem 55 e nono dígito", { skip: pular() }, async () => {
  const o = await inserir<{ phone_key: string }>("private_optouts", { tenant_id: loja, phone: "5562988887777", module: "recuperar" });
  assert.equal(o.phone_key, "6288887777");
  recusa(await erroAoInserir("private_optouts", { tenant_id: loja, phone: "6288887777" }), "23505", "private_optouts_telefone_unique");
  assert.equal(await erroAoInserir("private_optouts", { tenant_id: vizinha, phone: "5562988887777" }), null);
  recusa(await erroAoInserir("private_optouts", { tenant_id: loja, phone: "5562911112222", module: "outro" }),
    "23514", "private_optouts_module_check");
});

test("private_number_state e private_signals: 9h–21h por padrão, fora de 8–22 ou invertido recusado, sinal só sair ou recusa", { skip: pular() }, async () => {
  const s = await inserir<{ horario_inicio: number; horario_fim: number }>("private_number_state",
    { instance_id: numeroLoja, tenant_id: loja });
  assert.deepEqual([s.horario_inicio, s.horario_fim], [9, 21]);
  const mudar = (campos: Record<string, unknown>) =>
    db().from("private_number_state").update(campos).eq("tenant_id", loja).eq("instance_id", numeroLoja);
  assert.equal((await mudar({ horario_inicio: 8, horario_fim: 22 })).error, null);
  recusa((await mudar({ horario_fim: 23 })).error, "23514", "private_number_state_horario_fim_check");
  recusa((await mudar({ horario_inicio: 21, horario_fim: 9 })).error, "23514", "private_number_state_horario");
  recusa((await mudar({ pause_reason: "manual" })).error, "23514", "private_number_state_pause_reason_check");
  assert.equal(await erroAoInserir("private_signals", { tenant_id: loja, instance_id: numeroLoja, kind: "sair", message_ref: `wa-${RUN}` }), null);
  recusa(await erroAoInserir("private_signals", { tenant_id: loja, instance_id: numeroLoja, kind: "spam" }),
    "23514", "private_signals_kind_check");
});

test("limpar_dados_vencidos_comuns: aviso com mais de 30 dias e conversa parada há 180 dias somem; o resto fica", { skip: pular() }, async () => {
  const evento = (dias: number, k: string) => ({ tenant_id: loja, connection_id: conexaoLoja, event: "cart.reminder",
    dedupe_key: `${k}:${RUN}`, payload: {}, received_at: ha(dias) });
  const eventoVelho = await inserir<{ id: string }>("yampi_events", evento(31, "velho"));
  const eventoNovo = await inserir<{ id: string }>("yampi_events", evento(29, "novo"));
  const conversa = (fone: string, campos: Record<string, unknown>) =>
    inserir<{ id: string }>("private_conversations", { tenant_id: loja, instance_id: numeroLoja, phone: fone, ...campos });
  const parada = await conversa("5562900000001", { created_at: ha(200), last_message_at: ha(181) });
  const msgParada = await inserir<{ id: string }>("private_messages", { tenant_id: loja, conversation_id: parada.id,
    direction: "entrada", author: "cliente", text: "oi", created_at: ha(181) });
  const comando = await inserir<{ id: string }>("engine_commands", { tenant_id: loja, instance_id: numeroLoja,
    type: "dm_text", status: "canceled", payload: {}, private_message_id: msgParada.id, dm_module: "recuperar",
    valid_until: ha(180) });
  // last_message_at ficou para trás, mas a cliente escreveu ontem.
  const respondeu = await conversa("5562900000002", { created_at: ha(200), last_message_at: ha(181) });
  const msgOntem = await inserir<{ id: string }>("private_messages", { tenant_id: loja, conversation_id: respondeu.id,
    direction: "entrada", author: "cliente", text: "e aí?", created_at: ha(1) });
  // Loja só com o Rastreio: a resposta não vira mensagem, só last_inbound_at.
  const escreveu = await conversa("5562900000003", { created_at: ha(200), last_message_at: ha(181), last_inbound_at: ha(2) });
  const vaziaVelha = await conversa("5562900000004", { created_at: ha(181) });
  const vaziaNova = await conversa("5562900000005", {});
  const saiu = await inserir<{ id: string }>("private_optouts", { tenant_id: loja, phone: "5562900000001", at: ha(400) });

  const { data: apagados, error } = await db().rpc("limpar_dados_vencidos_comuns");
  assert.equal(error, null);
  // Só o tipo: a limpeza é global, e outro run do CI pode ter apagado antes as linhas daqui.
  assert.ok(Number.isInteger(apagados));

  assert.equal(await existe("yampi_events", eventoVelho.id), false);
  assert.equal(await existe("yampi_events", eventoNovo.id), true);
  assert.equal(await existe("private_conversations", parada.id), false);
  assert.equal(await existe("private_messages", msgParada.id), false, "as mensagens vão junto com a conversa");
  const { data: cmd } = await db().from("engine_commands").select("private_message_id")
    .eq("tenant_id", loja).eq("id", comando.id).single();
  assert.equal((cmd as { private_message_id: string | null } | null)?.private_message_id, null, "o comando fica, sem a mensagem");
  assert.equal(await existe("private_conversations", respondeu.id), true);
  assert.equal(await existe("private_messages", msgOntem.id), true);
  assert.equal(await existe("private_conversations", escreveu.id), true);
  assert.equal(await existe("private_conversations", vaziaVelha.id), false);
  assert.equal(await existe("private_conversations", vaziaNova.id), true);
  assert.equal(await existe("private_optouts", saiu.id), true, "SAIR não vence");
});
```

O que está como assinatura (`pular`, `inserir`, `erroAoInserir`, `existe`, `criarPessoa`, `visiveis`) e os comentários de `before`/`after` são para escrever no molde citado; o resto vai como está. Cada caso de recusa viola **uma** constraint só (o Postgres aplica os CHECKs em ordem de nome e reporta o primeiro): não junte dois valores ruins numa linha.

- [ ] **Step 4: tipos e execução local**

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT" && npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json && npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/privado/base-comum.integration.test.ts 2>&1 | tail -6
```

Esperado: `tsc` sem saída; o teste com `# pass 0` e `# skipped 11` (sem `E2E_TENANT_ID` ele se pula). O vermelho de verdade é contra dev sem a migração; o verde, no job e2e (Task 3).

- [ ] **Step 5: commit**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add infra/tests/base-comum-yampi-privado-check.sql apps/web/src/lib/privado/base-comum.integration.test.ts && git -C "$WT" diff --cached --stat && git -C "$WT" commit -m "test(db): checks for the shared Yampi and private-number base (recuperar PR 1a)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Esperado no `--stat`: só esses dois arquivos.

---

### Task 2: migração, `apply-order` e baseline

**Files:**
- Create: `apps/web/supabase/migrations/20261029120000_base_comum_yampi_privado.sql`
- Modify: `deploy/supabase/apply-order.txt` (fim)
- Modify: `deploy/supabase/schema-baseline.json` (3 chaves mudam, 9 entram)

**Interfaces:**
- Consumes: `public.organizations(id)`, `public.instances(id)`, `auth.users(id)`, `public.phone_key(text)`, `app.set_updated_at()`, `app.user_tenant_ids()`, `public.schema_signature()` (todos em `main`).
- Produces: tudo o que está em "Contrato do banco" acima.

- [ ] **Step 1: escrever a migração** — `apps/web/supabase/migrations/20261029120000_base_comum_yampi_privado.sql`:

```sql
-- Recuperar, PR 1a: o banco comum ao Recuperar e ao Rastreio (spec
-- docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md §2; nomes no "Contrato comum" de
-- docs/superpowers/plans/2026-10-29-recuperar-yampi-00-indice.md; plano
-- docs/superpowers/plans/2026-10-29-recuperar-yampi-01a-banco-comum.md).
--
-- Cria a conexão da loja com a Yampi (credenciais seladas) e a caixa de avisos; a base do número do
-- atendimento (instances.purpose = 'privado', um por loja): conversas, mensagens, ritmo, sinais e a
-- lista "não falar no privado"; os campos do DM em engine_commands; as flags recuperar_enabled e
-- rastreio_enabled (só o servidor liga); os módulos recuperar e rastreio da vendedora; a limpeza.
-- Nenhum comportamento muda: seletor, claim, rota e worker ainda não leem nada disto (PRs 2, 3, 4, 6).
--
-- RLS nas sete tabelas. As cinco do número do atendimento: policy de leitura para os membros da loja
-- (app.user_tenant_ids, que exclui a vendedora) e authenticated só com SELECT — segunda linha de defesa,
-- porque o app lê pela rota (Conversas é polling; o Realtime é decorativo). As duas da Yampi: sem policy e
-- sem privilégio fora do service_role (credencial selada; payload cru do aviso com dado pessoal). Escrita
-- só do servidor (service_role, sempre com .eq('tenant_id')). Não "destravar" com using (true).
--
-- Idempotente (if not exists, or replace, drop ... if exists, constraint criada uma vez por nome): o
-- job pode morrer entre aplicar e registrar, e o próximo run reaplica o arquivo. O gate de drift não
-- vê RLS, policy, ACL, CHECK, índice, trigger nem corpo de função: conferir com
-- infra/tests/base-comum-yampi-privado-check.sql nos dois bancos.
--
-- Reversão (emergência): migração NOVA, pelo CI, com
--   drop function if exists public.limpar_dados_vencidos_comuns(), app.limpar_dados_vencidos_comuns();
--   drop trigger if exists tenant_settings_guard_recuperar_rastreio_flags on public.tenant_settings;
--   drop function if exists public.tenant_settings_guard_recuperar_rastreio_flags();
--   alter table public.engine_commands drop column if exists private_message_id,
--     drop column if exists dm_module, drop column if exists valid_until;
--   drop table if exists public.private_optouts, public.private_signals, public.private_number_state,
--     public.private_messages, public.private_conversations, public.yampi_events, public.yampi_connections;
--   alter table public.instances drop column if exists purpose;
--   alter table public.tenant_settings drop column if exists recuperar_enabled,
--     drop column if exists rastreio_enabled;
--   e memberships_modules_validos de volta a array['postar'] (só sem membership com os módulos novos).

-- Mexe em engine_commands, instances, tenant_settings e memberships, que o worker e cada request
-- leem. Sem o lock em 5 s, aborta em vez de segurar a fila: é só rodar o job de novo.
set lock_timeout = '5s';

-- 1) Conexão da loja com a Yampi: uma por loja, a mesma para o Recuperar e o Rastreio. O id vai na URL
--    do aviso (?c=<id>), nunca o tenant_id. Desconectar apaga as credenciais e mantém a linha: o id, e
--    a URL cadastrada na Yampi, não mudam ao reconectar.
create table if not exists public.yampi_connections (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null unique references public.organizations(id) on delete cascade,
  alias           text not null,
  user_token      text,             -- selado (lib/security/secret-box.ts)
  user_secret_key text,             -- selado
  webhook_id      text,             -- id do aviso na Yampi
  webhook_secret  text,             -- selado: secret_key do aviso, confere o X-Yampi-Hmac-SHA256
  events          text[] not null default '{}',
  status          text not null default 'ativa'
                    check (status in ('ativa', 'credencial_invalida', 'aviso_desativado', 'desconectada')),
  last_event_at   timestamptz,
  last_check_at   timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  -- Formato do selar(): v<n>.<iv>.<tag>.<cifra> em base64url. Token em texto aberto não grava.
  constraint yampi_connections_segredos_selados check (
        (user_token is null or user_token ~ '^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
    and (user_secret_key is null or user_secret_key ~ '^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')
    and (webhook_secret is null or webhook_secret ~ '^v[0-9]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$')),
  -- Só a desconectada fica sem credencial: nada chama a Yampi com token nulo.
  constraint yampi_connections_ativa_tem_credencial check (
    status = 'desconectada' or (user_token is not null and user_secret_key is not null))
);

comment on table public.yampi_connections is
  'Conexão da loja com a Yampi (Recuperar e Rastreio). user_token, user_secret_key e webhook_secret selados (AES-256-GCM, INTEGRATIONS_ENCRYPTION_KEY). Só service_role.';

-- 2) Caixa de entrada dos avisos. payload tem dado pessoal: 30 dias (limpeza, seção 9). A dedupe_key é
--    de quem grava (PR 6: <id da conexão>:<sha256 do corpo>, já única entre lojas) e é única sozinha,
--    para o upsert do PostgREST (on_conflict=dedupe_key): o mesmo aviso duas vezes é uma linha só.
create table if not exists public.yampi_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.organizations(id) on delete cascade,
  connection_id uuid not null references public.yampi_connections(id) on delete cascade,
  event         text not null,
  resource_id   text,
  dedupe_key    text not null,
  payload       jsonb not null,
  received_at   timestamptz not null default now(),
  processed_at  timestamptz,
  error         text,
  constraint yampi_events_dedupe_unique unique (dedupe_key)
);

comment on table public.yampi_events is
  'Avisos (webhooks) da Yampi, um por dedupe_key. processed_at nulo = pendente. payload com dado pessoal: 30 dias. Só service_role.';

-- O evento parado que o cron /api/cron/yampi reprocessa (PR 6).
create index if not exists yampi_events_pendentes_idx
  on public.yampi_events (received_at) where processed_at is null;

-- 3) Conversa = (número do atendimento, telefone), comum aos dois módulos: a cliente vê uma conversa só.
--    phone_key gerada com public.phone_key (DDD + 8 últimos): com e sem o 55 e o nono dígito é a mesma
--    conversa. Sem telefone ("número não identificado") ela existe pelo lid.
create table if not exists public.private_conversations (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.organizations(id) on delete cascade,
  instance_id       uuid not null references public.instances(id) on delete cascade,
  phone             text check (phone ~ '^[0-9]{10,13}$'),
  phone_key         text generated always as (public.phone_key(phone)) stored,
  jid               text,
  lid               text,
  contact_name      text,
  status            text not null default 'aberta'
                      check (status in ('precisa_de_voce', 'aberta', 'encerrada')),
  unread            integer not null default 0 check (unread >= 0),
  last_message_at   timestamptz,
  last_preview      text check (char_length(last_preview) <= 200),
  first_outbound_at timestamptz,
  last_inbound_at   timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint private_conversations_tem_contato check (phone is not null or lid is not null),
  -- Constraint inteira, não índice parcial: o upsert do PostgREST (onConflict) só casa com ela. NULL
  -- não colide, então "única quando preenchida" sai de graça.
  constraint private_conversations_telefone_unique unique (instance_id, phone_key),
  constraint private_conversations_lid_unique unique (instance_id, lid)
);

comment on table public.private_conversations is
  'Conversa do número do atendimento com um telefone (Recuperar e Rastreio). Some 180 dias depois da última atividade, com as mensagens. Escreve só o service_role; membros leem a própria loja.';

-- Contador "precisa de você" da barra, lido a cada página (PR 7/8).
create index if not exists private_conversations_tenant_status_idx
  on public.private_conversations (tenant_id, status);

-- 4) Mensagem do número do atendimento, comum aos dois módulos (o PR 1b acrescenta case_id, step_key,
--    script_id e variant). dedupe_key única por loja (contrato): repetir o passo esbarra nela e devolve
--    as mesmas linhas; a chave é da linha, então cada parte do passo (part_index) grava a sua.
--    module, priority, status e phone são obrigatórios no que a Girumo manda (automatico, pessoa); a
--    mensagem da cliente e a do celular do chip podem vir sem eles.
create table if not exists public.private_messages (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.organizations(id) on delete cascade,
  conversation_id     uuid not null references public.private_conversations(id) on delete cascade,
  module              text check (module in ('recuperar', 'rastreio', 'teste')),
  direction           text not null check (direction in ('saida', 'entrada')),
  author              text not null check (author in ('automatico', 'pessoa', 'cliente', 'celular')),
  author_user_id      uuid references auth.users(id) on delete set null,
  kind                text not null default 'texto' check (kind in ('texto', 'imagem', 'audio', 'outro')),
  text                text check (char_length(text) <= 4096),
  media_ref           text,           -- saída: "<bucket>/<caminho>"; entrada: id da mídia na Evolution
  command_id          uuid,           -- engine_commands.id do envio; o vínculo com FK é engine_commands.private_message_id
  provider_message_id text,           -- key.id da Evolution
  status              text check (status in ('na_fila', 'enviada', 'entregue', 'lida', 'falhou', 'cancelada')),
  error               text,
  priority            text check (priority in ('resposta', 'pix', 'pedido', 'carrinho')),
  dedupe_key          text,
  part_index          smallint not null default 0 check (part_index between 0 and 2),
  phone               text check (phone ~ '^[0-9]{10,13}$'),   -- destino, só dígitos
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint private_messages_direcao_do_autor check ((direction = 'entrada') = (author = 'cliente')),
  constraint private_messages_envio_completo check (
    author not in ('automatico', 'pessoa')
    or (module is not null and priority is not null and status is not null and phone is not null)),
  constraint private_messages_dedupe_unique unique (tenant_id, dedupe_key),
  constraint private_messages_provider_unique unique (tenant_id, provider_message_id)
);

comment on table public.private_messages is
  'Mensagem do número do atendimento (Recuperar e Rastreio). Uma linha por dedupe_key (cada parte de passo com a sua) e por key.id da Evolution, por loja. Escreve só o service_role; membros leem a própria loja.';

-- Histórico da conversa (polling do PR 8), a limpeza e o lado filho do FK da conversa.
create index if not exists private_messages_conversation_idx
  on public.private_messages (conversation_id, created_at);

-- 5) Ritmo do número do atendimento, dividido entre os dois módulos. Horário em hora cheia de Brasília:
--    envia de horario_inicio até antes de horario_fim (9h–21h; ajustável entre 8h e 22h).
create table if not exists public.private_number_state (
  instance_id     uuid primary key references public.instances(id) on delete cascade,
  tenant_id       uuid not null references public.organizations(id) on delete cascade,
  horario_inicio  smallint not null default 9 check (horario_inicio between 8 and 22),
  horario_fim     smallint not null default 21 check (horario_fim between 8 and 22),
  ramp_started_at timestamptz,
  healthy_since   timestamptz,
  paused_until    timestamptz,
  pause_reason    text check (pause_reason in ('sinais', 'restricao', 'entrega')),
  next_send_at    timestamptz,
  updated_at      timestamptz not null default now(),
  constraint private_number_state_horario check (horario_inicio < horario_fim)
);

comment on table public.private_number_state is
  'Horário, rampa e pausa do número do atendimento (spec 1.5 e 1.6), um por instância privado. Escreve só o service_role; membros leem a própria loja.';

-- 6) Sinal de proteção (spec 1.6): SAIR ou recusa; 3 em 24 h pausam o número (PR 4). message_ref aponta a
--    mensagem que gerou o sinal (texto, sem FK: a loja só com o Rastreio não guarda a mensagem da
--    cliente, e o sinal pode viver mais que ela).
create table if not exists public.private_signals (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.organizations(id) on delete cascade,
  instance_id uuid not null references public.instances(id) on delete cascade,
  kind        text not null check (kind in ('sair', 'recusa')),
  at          timestamptz not null default now(),
  message_ref text
);

comment on table public.private_signals is
  'Sinais de proteção do número do atendimento (SAIR, recusa). Escreve só o service_role; membros leem a própria loja.';

create index if not exists private_signals_instance_at_idx on public.private_signals (instance_id, at);

-- 7) "Não falar no privado": quem respondeu SAIR, de qualquer módulo. Sem prazo. A optouts geral continua
--    bloqueando o DM (PR 3), mas não ganha linha do SAIR. message_ref como em private_signals.
create table if not exists public.private_optouts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.organizations(id) on delete cascade,
  phone       text not null check (phone ~ '^[0-9]{10,13}$'),
  phone_key   text generated always as (public.phone_key(phone)) stored,
  module      text check (module in ('recuperar', 'rastreio', 'teste')),
  at          timestamptz not null default now(),
  message_ref text,
  constraint private_optouts_telefone_unique unique (tenant_id, phone_key)
);

comment on table public.private_optouts is
  'Telefones que pediram SAIR no número do atendimento (Recuperar e Rastreio), por phone_key. Não vence. Escreve só o service_role; membros leem a própria loja.';

-- 8) RLS, policies, privilégios e updated_at (ver o topo). authenticated só lê as cinco do número do
--    atendimento, da loja em que é membro aceito e não vendedora (a forma do PR 1b); as duas da Yampi são
--    só do service_role.
alter table public.yampi_connections enable row level security;
alter table public.yampi_events enable row level security;
alter table public.private_conversations enable row level security;
alter table public.private_messages enable row level security;
alter table public.private_number_state enable row level security;
alter table public.private_signals enable row level security;
alter table public.private_optouts enable row level security;

drop policy if exists private_conversations_select_member on public.private_conversations;
create policy private_conversations_select_member on public.private_conversations
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists private_messages_select_member on public.private_messages;
create policy private_messages_select_member on public.private_messages
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists private_number_state_select_member on public.private_number_state;
create policy private_number_state_select_member on public.private_number_state
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists private_signals_select_member on public.private_signals;
create policy private_signals_select_member on public.private_signals
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));
drop policy if exists private_optouts_select_member on public.private_optouts;
create policy private_optouts_select_member on public.private_optouts
  for select to authenticated using (tenant_id = any (app.user_tenant_ids()));

revoke all on public.yampi_connections, public.yampi_events, public.private_conversations,
  public.private_messages, public.private_number_state, public.private_signals, public.private_optouts
  from anon, authenticated;
grant select on public.private_conversations, public.private_messages, public.private_number_state,
  public.private_signals, public.private_optouts
  to authenticated;
grant select, insert, update, delete on public.yampi_connections, public.yampi_events,
  public.private_conversations, public.private_messages, public.private_number_state,
  public.private_signals, public.private_optouts
  to service_role;

drop trigger if exists set_updated_at_yampi_connections on public.yampi_connections;
create trigger set_updated_at_yampi_connections before update on public.yampi_connections
  for each row execute function app.set_updated_at();
drop trigger if exists set_updated_at_private_conversations on public.private_conversations;
create trigger set_updated_at_private_conversations before update on public.private_conversations
  for each row execute function app.set_updated_at();
drop trigger if exists set_updated_at_private_messages on public.private_messages;
create trigger set_updated_at_private_messages before update on public.private_messages
  for each row execute function app.set_updated_at();
drop trigger if exists set_updated_at_private_number_state on public.private_number_state;
create trigger set_updated_at_private_number_state before update on public.private_number_state
  for each row execute function app.set_updated_at();

-- 9) Retenção da spec §2 (a dos casos é do PR 1b). O cron /api/cron/yampi (PR 6) chama
--    public.limpar_dados_vencidos_comuns() uma vez por dia. Devolve avisos + conversas apagados; as
--    mensagens vão em cascata e o comando fica com private_message_id nulo. A conversa some quando a
--    última atividade passou de 180 dias E não há mensagem dos últimos 180 dias: o segundo teste
--    segura a conversa se last_message_at ficou para trás.
create or replace function app.limpar_dados_vencidos_comuns()
returns integer
language plpgsql
volatile
security definer
set search_path = public, app
as $$
declare
  v_avisos integer;
  v_conversas integer;
begin
  delete from public.yampi_events e
   where e.received_at < now() - interval '30 days';
  get diagnostics v_avisos = row_count;

  delete from public.private_conversations c
   where greatest(c.created_at, c.last_message_at, c.last_inbound_at) < now() - interval '180 days'
     and not exists (
       select 1 from public.private_messages m
        where m.conversation_id = c.id
          and m.created_at >= now() - interval '180 days');
  get diagnostics v_conversas = row_count;

  return v_avisos + v_conversas;
end;
$$;

-- O PostgREST só expõe public: o cron chama rpc('limpar_dados_vencidos_comuns'). Molde de
-- public.prune_instance_sends (20260729120000).
create or replace function public.limpar_dados_vencidos_comuns()
returns integer
language sql
volatile
security definer
set search_path = public, app
as $$ select app.limpar_dados_vencidos_comuns() $$;

comment on function public.limpar_dados_vencidos_comuns() is
  'Retenção da base comum: yampi_events com mais de 30 dias; conversa do número do atendimento parada há 180 dias (mensagens em cascata). Devolve avisos + conversas apagados.';

-- create or replace não preserva o ACL em todo banco (ver 20260904100000): explícito sempre.
revoke all on function app.limpar_dados_vencidos_comuns() from public, anon, authenticated;
grant execute on function app.limpar_dados_vencidos_comuns() to service_role;
revoke all on function public.limpar_dados_vencidos_comuns() from public, anon, authenticated;
grant execute on function public.limpar_dados_vencidos_comuns() to service_role;

-- Daqui para baixo: tabelas que o worker e cada request leem. No fim do arquivo para o lock durar o
-- mínimo até o commit.

-- 10) Comando de DM (tipos dm_text e dm_image). Não há CHECK em engine_commands.type nem no destino
--     (conferido em 29/10): nada a afrouxar. O worker de hoje só pega send_*; quem cria e consome DM é o
--     PR 3. Sem CHECK em dm_module: o valor é cópia de private_messages.module, que tem.
alter table public.engine_commands
  add column if not exists private_message_id uuid,
  add column if not exists dm_module text,
  add column if not exists valid_until timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.engine_commands'::regclass
                    and conname = 'engine_commands_private_message_id_fkey') then
    alter table public.engine_commands
      add constraint engine_commands_private_message_id_fkey
      foreign key (private_message_id) references public.private_messages(id) on delete set null;
  end if;
end;
$$;

comment on column public.engine_commands.private_message_id is
  'Comando de DM: a linha de private_messages que ele envia (o status volta para ela). Nulo depois que a limpeza apaga a mensagem.';
comment on column public.engine_commands.dm_module is
  'Comando de DM: recuperar, rastreio ou teste. O claim (PR 3) só libera com a flag do módulo ligada.';
comment on column public.engine_commands.valid_until is
  'Comando de DM: passou disto, é cancelado (PR 3). No DM substitui a tolerância de 15 min (app.missed_send_tolerance).';

-- Lado filho do FK: sem ele, cada mensagem apagada pela limpeza varreria a fila inteira.
create index if not exists engine_commands_private_message_idx
  on public.engine_commands (private_message_id) where private_message_id is not null;
-- Fila de DM por número (claim do PR 3): número, prioridade, horário disponível.
create index if not exists engine_commands_dm_fila_idx
  on public.engine_commands (instance_id, priority, available_at)
  where status = 'queued' and type in ('dm_text', 'dm_image');

-- 11) Liberação por loja, como instagram_enabled. Nascem aqui porque conectar o número do atendimento
--     (PR 2b) lê as duas; quem liga recuperar_enabled é o Stripe (PR 5a), rastreio_enabled é o admin.
alter table public.tenant_settings
  add column if not exists recuperar_enabled boolean not null default false,
  add column if not exists rastreio_enabled boolean not null default false;

comment on column public.tenant_settings.recuperar_enabled is
  'Add-on Recuperar liberado (webhook do Stripe ou admin). Só o servidor muda (tenant_settings_guard_recuperar_rastreio_flags).';
comment on column public.tenant_settings.rastreio_enabled is
  'Rastreio do pedido liberado (admin na v1). Só o servidor muda (tenant_settings_guard_recuperar_rastreio_flags).';

-- Trava com a forma da de instagram_enabled (20261003120000), que já roda em prod. authenticated já não
-- escreve em tenant_settings (20261004120000), mas um grant por coluna no futuro destravaria um add-on
-- pago pelo PATCH do PostgREST.
create or replace function public.tenant_settings_guard_recuperar_rastreio_flags()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      if new.recuperar_enabled is true or new.rastreio_enabled is true then
        raise exception 'recuperar_enabled e rastreio_enabled so podem ser alterados pelo servidor'
          using errcode = '42501';
      end if;
    elsif new.recuperar_enabled is distinct from old.recuperar_enabled
       or new.rastreio_enabled is distinct from old.rastreio_enabled then
      raise exception 'recuperar_enabled e rastreio_enabled so podem ser alterados pelo servidor'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.tenant_settings_guard_recuperar_rastreio_flags() from public, anon, authenticated;

drop trigger if exists tenant_settings_guard_recuperar_rastreio_flags on public.tenant_settings;
create trigger tenant_settings_guard_recuperar_rastreio_flags
  before insert or update on public.tenant_settings
  for each row execute function public.tenant_settings_guard_recuperar_rastreio_flags();

-- 12) O número do atendimento é uma instância com purpose = 'privado', no máximo uma por loja. Nenhum
--     seletor filtra por isto ainda: o PR 2a faz enqueue_broadcast e companhia escolherem só 'grupos'
--     ANTES de qualquer número privado poder ser conectado.
alter table public.instances
  add column if not exists purpose text not null default 'grupos';

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.instances'::regclass
                    and conname = 'instances_purpose_check') then
    alter table public.instances
      add constraint instances_purpose_check check (purpose in ('grupos', 'privado'));
  end if;
end;
$$;

create unique index if not exists instances_one_privado_per_tenant
  on public.instances (tenant_id) where purpose = 'privado';

comment on column public.instances.purpose is
  'grupos (padrão): posta nos grupos. privado: número do atendimento do Recuperar e do Rastreio, no máximo um por loja.';

-- 13) Módulos da vendedora: recuperar e rastreio além de postar (spec §5). Por último: memberships é lida
--     em todo request.
alter table public.memberships drop constraint if exists memberships_modules_validos;
alter table public.memberships add constraint memberships_modules_validos
  check (modules <@ array['postar', 'recuperar', 'rastreio']::text[] and (role = 'seller' or modules = '{}'));

-- O PostgREST passa a enxergar as tabelas e a RPC sem esperar o recarregamento automático.
notify pgrst, 'reload schema';
```

- [ ] **Step 2: `apply-order.txt`** — acrescentar ao **fim** de `deploy/supabase/apply-order.txt`, exatamente:

```
# 2026-10-29 - Recuperar, PR 1a: base comum com o Rastreio (spec 2026-10-29-recuperar-yampi-design §2).
# yampi_connections (credencial selada, CHECK do formato), yampi_events (30 dias), private_conversations,
# private_messages, private_number_state, private_signals, private_optouts; instances.purpose (uma
# 'privado' por loja), campos do DM em engine_commands, tenant_settings.recuperar_enabled/rastreio_enabled
# (trava: so o servidor liga), memberships.modules aceita recuperar/rastreio, limpeza
# public.limpar_dados_vencidos_comuns(). RLS ligado; authenticated so le as cinco private_* da loja
# (policy app.user_tenant_ids, vendedora fora); yampi_* so service_role. Muda a
# baseline (10 t| e 2 f|). O gate nao ve RLS, ACL, CHECK, indice, trigger nem corpo: conferir com
# infra/tests/base-comum-yampi-privado-check.sql nos dois bancos.
apps/web/supabase/migrations/20261029120000_base_comum_yampi_privado.sql
```

- [ ] **Step 3: baseline** — sem mexer em `gerado_em` nem `projeto`; as chaves existentes ficam no lugar, as novas vão para o fim:

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT" && node -e '
const fs = require("fs");
const f = "deploy/supabase/schema-baseline.json";
const bruto = fs.readFileSync(f, "utf8");
const eol = bruto.includes("\r\n") ? "\r\n" : "\n";
const b = JSON.parse(bruto);
Object.assign(b.objetos, {
  "t|instances": "b6cf09060097020c262dbec56e348e1a",
  "t|engine_commands": "7ef5fb74140a672a78029676e6edc785",
  "t|tenant_settings": "bee86265f1b767cb3ad07d363a17cfc0",
  "t|yampi_connections": "c1db2b6281224acd86f0b21e42e506c1",
  "t|yampi_events": "5a4399ee66bdfc076c1363fd81ddc8d7",
  "t|private_conversations": "405bf54d1d994ec58369b2e4513bb7cb",
  "t|private_messages": "e4d92a92c73df0387332f9fbc280d5dd",
  "t|private_number_state": "e0874f1555cb1c594abaf788c89e9a74",
  "t|private_signals": "d4cc6f8326e514b1ded08a987c5a5aed",
  "t|private_optouts": "0a5973e571b0276f973812444209dcdc",
  "f|limpar_dados_vencidos_comuns()": "230eb6b5304a2bb1f0668777e23a16b0",
  "f|tenant_settings_guard_recuperar_rastreio_flags()": "e8c9208442517f72c1f64ecc6b5cfb2d",
});
fs.writeFileSync(f, JSON.stringify(b, null, 2).replace(/\n/g, eol) + eol);' && git -C "$WT" diff --stat deploy/supabase/schema-baseline.json
```

Esperado: `1 file changed, 13 insertions(+), 4 deletions(-)` (três chaves trocadas, nove novas, a vírgula em `t|users`). De onde vêm: `t|` = `md5` de `coluna:format_type` em ordem de nome, separados por vírgula (a fórmula reproduz hoje as chaves de `instances` `b14e9f70…`, `engine_commands` `bedd5429…` e `tenant_settings` `497667f3…`); `f|` = `md5(resultado || '|secdef=' || definer || '|vol=v')`. Coluna, tipo ou volatilidade diferente = chave diferente: recalcule pelo `r` do check em dev (Task 3).

- [ ] **Step 4: conferências locais, sem banco**

Idempotência (só os `create trigger` aparecem, cada um logo depois do seu `drop trigger if exists`) e ACL depois do último `create or replace`:

```bash
WT=$(git rev-parse --show-toplevel); M="$WT/apps/web/supabase/migrations/20261029120000_base_comum_yampi_privado.sql"; grep -nE "^\s*(create|drop)\s" "$M" | grep -vE "if not exists|if exists|or replace"; echo "---"; grep -nE "add constraint" "$M"; echo "---"; grep -nE "^(create or replace function|revoke all on function|grant execute on function)" "$M"
```

Esperado: antes do primeiro `---`, dez linhas: cinco `create policy` (`<tabela>_select_member`, cada uma logo depois do seu `drop policy if exists`) e cinco `create trigger` (quatro `set_updated_at_*` e `tenant_settings_guard_recuperar_rastreio_flags`); depois, três `add constraint` (duas dentro de `do $$ … if not exists`, a de `memberships` logo depois do `drop constraint if exists`); por último, cada `create or replace function` com número de linha menor que os `revoke`/`grant` da mesma função.

Ordem aponta para arquivos existentes e nenhuma `security definer` de `public` ficou sem revoke de `authenticated`:

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT" && node --test infra/scripts/apply-migrations.test.ts 2>&1 | tail -4; cd "$WT/apps/web" && node --test src/lib/supabase/privilegio-definer.test.ts 2>&1 | tail -4
```

Esperado: `# fail 0` nos dois.

Gate local (pede `npm ci` no worktree; se o disco não deixar, o job `verify` roda o mesmo):

```powershell
Set-Location "<WT>"; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Esperado: `EXIT=0` (secrets, testes, `tsc` web e e2e, build; o worker não muda).

- [ ] **Step 5: commit**

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" add apps/web/supabase/migrations/20261029120000_base_comum_yampi_privado.sql deploy/supabase/apply-order.txt deploy/supabase/schema-baseline.json && git -C "$WT" diff --cached --stat && git -C "$WT" commit -m "feat(db): shared Yampi connection and private-number base (recuperar PR 1a)" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Esperado no `--stat`: só esses três arquivos.

---

### Task 3: PR, `migrate-dev` e o GREEN em dev

**Files:** nenhum arquivo do repositório (cria `C:\Users\Igor\AppData\Local\Temp\recuperar-1a-corpo.md`).

**Interfaces:**
- Consumes: os commits dos Tasks 1 e 2.
- Produces: PR `<N>`, migração aplicada e registrada em dev (`ops.applied_migrations`), os onze testes verdes no job e2e, check verde em dev, `drift` e `advisors` verdes.

- [ ] **Step 1: corpo do PR** — Write em `C:\Users\Igor\AppData\Local\Temp\recuperar-1a-corpo.md`:

```markdown
## O que muda
- Migração `20261029120000_base_comum_yampi_privado.sql` (o CI aplica: dev neste PR, **prod no merge**): `yampi_connections` (credencial selada, CHECK do formato), `yampi_events`, `private_conversations`, `private_messages`, `private_number_state`, `private_signals`, `private_optouts`; `instances.purpose` (uma `privado` por loja); `private_message_id`/`dm_module`/`valid_until` em `engine_commands`; `tenant_settings.recuperar_enabled`/`rastreio_enabled` com trava; `memberships.modules` aceita `recuperar` e `rastreio`; `public.limpar_dados_vencidos_comuns()`.
- RLS ligado nas sete tabelas; `authenticated` só lê as cinco `private_*`, da própria loja e sem a vendedora (policy `<tabela>_select_member`, `app.user_tenant_ids()`); `yampi_connections` e `yampi_events` sem policy, só service-role; nada para `anon`; nenhuma escrita pelo JWT.
- Nenhum comportamento muda: nada lê estes objetos ainda (PRs 2, 3, 4, 6).
- Provas: `infra/tests/base-comum-yampi-privado-check.sql` (catálogo, dois bancos) e `apps/web/src/lib/privado/base-comum.integration.test.ts` (job e2e).
- Baseline: 3 chaves mudam, 9 entram.

## Como foi verificado
- `migrate-dev` aplicou; integração verde no e2e; check em dev sem erro, `r` igual à baseline; `drift` e `advisors` verdes.

## Depois do merge
- `migrate-prod` aplica e confere a baseline; o check roda em prod (Igor).

Spec: `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` §2 · Plano: `docs/superpowers/plans/2026-10-29-recuperar-yampi-01a-banco-comum.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 2: push e PR** (se o classificador negar, entregue os dois comandos ao Igor e siga quando o PR existir):

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" push -u origin feat/recuperar-banco-comum && gh pr create --repo codingB0y/Girumo --base main --head feat/recuperar-banco-comum --title "feat(db): shared Yampi and private-number base (recuperar PR 1a)" --body-file "C:/Users/Igor/AppData/Local/Temp/recuperar-1a-corpo.md"
```

Anote `<N>`. Daqui até o merge o `drift` de **todo outro PR aberto** fica vermelho com estes objetos (dev já os tem, a baseline deles não): feche este PR sem pausa.

- [ ] **Step 3: CI e o log do `migrate-dev`**

```bash
gh pr checks <N> --repo codingB0y/Girumo --watch; RUN=$(gh run list --repo codingB0y/Girumo --branch feat/recuperar-banco-comum --workflow verify.yml --limit 1 --json databaseId -q '.[0].databaseId'); gh run view "$RUN" --repo codingB0y/Girumo --log | grep -E "Aplicando|Falhou em|Sem drift|DRIFT|base-comum.integration|# (pass|fail|skipped)"
```

Esperado: `Aplicando apps/web/supabase/migrations/20261029120000_base_comum_yampi_privado.sql`, `Sem drift fora da allowlist.` e, no passo "Integracao das stores contra o banco de dev", os onze testes de `base-comum.integration.test.ts` passando com `# skipped 0`.
- `Falhou em …base_comum_yampi_privado.sql: <mensagem>` = erro de SQL; o arquivo roda numa transação só, então **nada** ficou aplicado nem registrado. Corrija o próprio arquivo (Task 2, Step 1), refaça o Step 4 do Task 2, commit, push.
- `lock timeout` = tabela quente ocupada: `gh run rerun "$RUN" --repo codingB0y/Girumo --failed`.
- Integração vermelha com `42P01`/`PGRST205` (tabela não encontrada) = o e2e correu antes do `migrate-dev` terminar (o job não espera): rerun do e2e depois do `migrate-dev` verde.
- `drift` vermelho com objeto deste PR = chave da baseline errada: use o `r` do Step 4 e corrija o Step 3 do Task 2. Vermelho só com objetos de **outro** PR = migração dele em dev: espere o merge dele e `git merge origin/main`; não use `drift-allowlist.json`.

- [ ] **Step 4: GREEN em dev** (mesmo comando do RED):

```bash
WT=$(git rev-parse --show-toplevel); cd "$WT/apps/web" && supabase link --project-ref wfjuwogxaupyadwhvoxy --yes && supabase db query --linked -o json -f ../../infra/tests/base-comum-yampi-privado-check.sql
```

Esperado: exit 0 e `rows[0].r` igual a:

```json
{"f|limpar_dados_vencidos_comuns()": "230eb6b5304a2bb1f0668777e23a16b0", "f|tenant_settings_guard_recuperar_rastreio_flags()": "e8c9208442517f72c1f64ecc6b5cfb2d", "t|engine_commands": "7ef5fb74140a672a78029676e6edc785", "t|instances": "b6cf09060097020c262dbec56e348e1a", "t|private_conversations": "405bf54d1d994ec58369b2e4513bb7cb", "t|private_messages": "e4d92a92c73df0387332f9fbc280d5dd", "t|private_number_state": "e0874f1555cb1c594abaf788c89e9a74", "t|private_optouts": "0a5973e571b0276f973812444209dcdc", "t|private_signals": "d4cc6f8326e514b1ded08a987c5a5aed", "t|tenant_settings": "bee86265f1b767cb3ad07d363a17cfc0", "t|yampi_connections": "c1db2b6281224acd86f0b21e42e506c1", "t|yampi_events": "5a4399ee66bdfc076c1363fd81ddc8d7"}
```

Se o classificador negar, mande ao Igor o mesmo comando em PowerShell (`Set-Location "<WT>\apps\web"; supabase link --project-ref wfjuwogxaupyadwhvoxy --yes; if ($LASTEXITCODE -eq 0) { supabase db query --linked -o json -f ..\..\infra\tests\base-comum-yampi-privado-check.sql }`).

**`FALHOU` aqui, ou teste de integração vermelho por defeito da migração = ela JÁ está aplicada e registrada em dev.** Não edite o arquivo aplicado (o registro impede reaplicar, e prod receberia um arquivo que dev nunca rodou). Escreva no mesmo PR uma migração de ajuste `20261029120100_base_comum_yampi_privado_ajuste.sql`, idempotente (`create or replace function` + o bloco de `revoke`/`grant` de novo; tabela por `alter table … drop constraint if exists …, add constraint …`, porque `create table if not exists` não refaz tabela), a linha dela no fim da `apply-order`, a chave da baseline se a assinatura mudou; commit, push, repita os Steps 3 e 4. Defeito do **teste** (expectativa errada): corrija só o teste.

- [ ] **Step 5: tudo verde** — `gh pr checks <N> --repo codingB0y/Girumo`: `verify`, `migrate-dev`, `drift`, `advisors` e `e2e` em `pass`. Lint novo do `advisors` citando uma das tabelas ou funções deste PR = corrija pela migração de ajuste, nunca pela allowlist (o `rls_enabled_no_policy` das duas tabelas da Yampi é tolerado por classe; as cinco `private_*` têm policy).

---

### Task 4: merge, prod e fechamento

**Files:** nenhum arquivo do repositório (cria `C:\Users\Igor\AppData\Local\Temp\recuperar-1a-card.sql`).

**Interfaces:**
- Consumes: PR `<N>` verde.
- Produces: a base em prod, provada pelo `--conferir-baseline` e pelo check; card com o `blocker` novo; decisão no grafo. É o que os PRs 1b, 2a e 5a (e, depois da prova da Yampi, o 6) e o PR 1 do Rastreio esperam para começar.

- [ ] **Step 1: merge** (na mesma sessão; se o classificador negar, entregue ao Igor `gh pr checks <N> --repo codingB0y/Girumo` e `gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo`):

```bash
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

- [ ] **Step 2: `migrate-prod`**

```bash
SHA=$(gh pr view <N> --repo codingB0y/Girumo --json mergeCommit -q .mergeCommit.oid); RUN=$(gh run list --repo codingB0y/Girumo --commit "$SHA" --workflow verify.yml --limit 1 --json databaseId -q '.[0].databaseId'); gh run watch "$RUN" --repo codingB0y/Girumo --exit-status; gh run view "$RUN" --repo codingB0y/Girumo --log | grep -E "Aplicando|Falhou em|Schema de prod|diverge da baseline"
```

`RUN` vazio = o run do merge ainda não nasceu: repita em alguns segundos. Esperado: `Aplicando …base_comum_yampi_privado.sql`, `Schema de prod x deploy/supabase/schema-baseline.json:` e **nenhum** `diverge da baseline`. `lock timeout` = `gh run rerun "$RUN" --repo codingB0y/Girumo --failed`. Outra falha em prod = pare e mostre ao Igor (dev está à frente; a saída é migração de ajuste ou de reversão, nunca DDL à mão).

- [ ] **Step 3: SQL do card** — Write em `C:\Users\Igor\AppData\Local\Temp\recuperar-1a-card.sql`, trocando `<DD/MM>` e `<N>`:

```sql
-- O card continua em_construcao (move_card para o mesmo status não grava evento): o avanço vai no blocker.
update public.board_features
   set blocker = 'PR 1a (banco comum) no ar em <DD/MM> (#<N>): yampi_connections, yampi_events, private_conversations, private_messages, private_number_state, private_signals, private_optouts, instances.purpose, campos do DM em engine_commands, flags recuperar_enabled/rastreio_enabled com trava, módulos da vendedora e limpeza, nos dois bancos; check ok em dev e prod. Próximo: 1b, 2a e 5a podem andar juntos (o 6 espera a prova da Yampi); o PR 1 do Rastreio também.'
 where key = 'recuperar-yampi'
returning key, status, blocker;
```

- [ ] **Step 4: PEÇA AO IGOR — prod (check + card)**, logo depois do Step 2:

```powershell
Set-Location "<WT>\apps\web"
supabase link --project-ref nidoatbxaylrkcgbszns --yes
$linkou = ($LASTEXITCODE -eq 0)
if ($linkou) { supabase db query --linked -o json -f ..\..\infra\tests\base-comum-yampi-privado-check.sql }
if ($linkou -and $LASTEXITCODE -eq 0) { supabase db query --linked -o json -f "$env:TEMP\recuperar-1a-card.sql" }
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

Confira: check **sem erro** e `r` idêntico ao de dev (Task 3, Step 4); card com 1 linha, `status` `em_construcao` (se veio `nao_existe`, o Step 5 do Task 0 não rodou: peça-o agora) e o `blocker` novo. `FALHOU` em prod com dev verde = os bancos divergem no que o gate não vê: migração de ajuste, nunca DDL à mão.

- [ ] **Step 5: decisão no grafo** — `kg_insert_text` (MCP LightRAG) com `source` `decisao-<AAAA-MM-DD>-recuperar-banco-comum` e o texto:

```
decisão (Recuperar PR 1a, #<N>): a base comum do Recuperar e do Rastreio tem sete tabelas (yampi_connections, yampi_events, private_conversations, private_messages, private_number_state, private_signals, private_optouts) com RLS ligado: as cinco private_* têm policy de leitura para membros (app.user_tenant_ids, vendedora fora) e authenticated só com SELECT; yampi_connections e yampi_events ficam sem policy, só service-role (credencial selada, payload cru com dado pessoal); ninguém escreve pelo JWT. O número do atendimento é instances.purpose = 'privado', um por loja (instances_one_privado_per_tenant). phone_key gerada com public.phone_key em conversas e opt-outs. Mensagem dedupe por (loja, dedupe_key) — cada parte do passo com a sua chave — e por (loja, provider_message_id); aviso da Yampi por dedupe_key sozinha. Credencial da Yampi selada com CHECK do formato do selar(). Flags recuperar_enabled e rastreio_enabled com trava (só o servidor muda). Limpeza public.limpar_dados_vencidos_comuns(): avisos 30 dias; conversa parada 180 dias leva as mensagens. FK para private_conversations ou private_messages tem de ser set null ou cascade. Prova: infra/tests/base-comum-yampi-privado-check.sql nos dois bancos + apps/web/src/lib/privado/base-comum.integration.test.ts no e2e.
```

Sem resposta do MCP: entregue ao Igor, na raiz do checkout principal, `.\tools\lightrag\.venv\Scripts\rag.exe insert "<o texto acima>" --source decisao-<AAAA-MM-DD>-recuperar-banco-comum`.

- [ ] **Step 6: encerrar** — apagar o worktree só se `git -C "$WT" status --porcelain` estiver vazio e reportar: "PRs que deixei abertos: nenhum" (ou o número e o motivo).

---

## Critérios de aceite

- Cinco arquivos: migração, check, teste de integração, `apply-order.txt` (uma entrada no fim) e `schema-baseline.json` (13+/4−, `gerado_em` intacto).
- `migrate-dev` aplicou no PR e `migrate-prod` no merge, sem `Falhou em`; `--conferir-baseline` sem `diverge da baseline`.
- Check sem erro em dev **e** prod, `r` idêntico nos dois e igual às doze chaves; os onze testes de integração verdes no e2e com `# skipped 0`.
- `verify`, `migrate-dev`, `drift`, `advisors`, `e2e` verdes; nenhum lint novo.
- PR mergeado e branch apagada na mesma sessão; card `recuperar-yampi` em `em_construcao` com o `blocker` novo; decisão no grafo.

## Riscos e pontos de atenção

- **Drift vermelho nos outros PRs** do `migrate-dev` deste até o merge. Depois do merge, nos outros: `gh pr update-branch <M>` ou `git merge origin/main`. Conflito em `apply-order.txt`/`schema-baseline.json` com PR paralelo: manter as duas entradas, na ordem das datas.
- **Lock nas tabelas quentes**: `engine_commands`, `instances`, `tenant_settings` e `memberships` ficam travadas da alteração até o commit (segundos). `lock timeout` → rerun; o arquivo é idempotente.
- **PR abandonado** deixa dev com a base e prod sem: escrever a migração de reversão (cabeçalho da migração), não fechar e esquecer.
- **A limpeza é global** (todas as lojas). O teste de integração só confere as linhas dele e não confia no número devolvido.
- **O check roda em prod** com DML e um GRANT dentro de `begin`…`rollback` (lojas `ab1a0000-…`); se a conexão cair, o banco desfaz.
- **Para os PRs seguintes:** o status da mensagem não tem `vencida` (o índice fixa: o PR 3 grava `cancelada` com `error = 'vencida'`, e `statusDosDms` devolve `{ status, erro }`); `dedupe_key` é única por loja, então cada parte de um passo leva a sua chave (o PR 3 deriva da `dedupeKey` do pedido); a resposta da cliente acima de 4096 caracteres é recusada — o PR 4 corta antes de gravar; o claim de DM do PR 3 usa `engine_commands_dm_fila_idx` se filtrar `status = 'queued' and type in ('dm_text','dm_image')` e ordenar por `priority` dentro do número.
