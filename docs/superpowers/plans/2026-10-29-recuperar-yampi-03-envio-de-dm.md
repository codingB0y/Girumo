# Recuperar — PR 3: Envio de DM (comum) — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O número do atendimento (instância `purpose = 'privado'`) passa a mandar mensagem no privado pela fila, no
ritmo da spec (teto, intervalo, horário, pausa, validade), com trava nos dois sentidos entre número de grupos e número do
atendimento; o Recuperar e o Rastreio enfileiram, consultam e cancelam pela API de `lib/privado/dm.ts`.

**Architecture:** `enfileirarDm` chama uma RPC que grava, numa transação, uma linha em `private_messages` (`na_fila`) e
um comando `dm_text`/`dm_image` em `engine_commands` por parte. O worker ganha um loop próprio (`claim_dm_commands` →
`sendDmFromCommand` → `registrar_dm_enviada`/`registrar_dm_falhou`). O ritmo mora no banco, numa função só
(`app.ritmo_privado`, como o `app.instance_caps` dos grupos). A manutenção do worker (`limpar_fila_dm`, a cada 30 s)
cancela a DM que não pode mais sair e espelha na `private_messages` o comando que terminou sem sair — sem trigger em
`engine_commands`, de propósito (`20260730100000_dispatch_fanout.sql`: trigger no fechamento do comando vira mensagem
duplicada).

**Tech Stack:** Postgres/Supabase (migração pelo CI; check SQL com `begin … rollback`), worker Node ESM (`tsx --test`,
`node:test`), Evolution API v2.3.7, Next 15 em `apps/web` (teste com PostgREST falso).

**Spec:** `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` — §1.5 (ritmo), §1.6 (pausa), §3 "Envio
(worker)" e "Base do privado", §8 (prova 2), §10 (testes).
**Índice:** `docs/superpowers/plans/2026-10-29-recuperar-yampi-00-indice.md` — "Contrato comum" (API de `dm.ts`) e
"Restrições globais". Quem também consome esta base: o Rastreio
(`docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md`, "Contrato pedido à base").

## Antes de começar

- Depende de: PR 1a, PR 2a e PR 2b em `main` (aplicados em dev) e da prova 2 da Fase 0 (mensagem no privado de
  verdade), com os fixtures em `apps/web/src/lib/evolution/__fixtures__/` e o resultado escrito em
  `docs/superpowers/plans/_recuperar-fase-0-resultado.md`. A Task 1 confere tudo; faltando um, pare.
- Worktree novo a partir de `origin/main`, branch `feat/recuperar-pr3-envio-dm`. Defasagem antes de codar:
  `git fetch origin main && git log HEAD..origin/main --oneline | wc -l` menor que 20.
- Bash do executor: o cwd reseta entre chamadas; todo comando começa com `WT=$(git rev-parse --show-toplevel)`. Blocos
  para o Igor: PowerShell 5.1, sem `&&`.
- `node_modules` por duas junctions, como no índice do Rastreio ("Ambiente do worktree"):
  `cmd /c mklink /J "<WT>\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"` e o mesmo para
  `apps\web\node_modules`.
- SQL em dev: de `apps/web`, `supabase link --project-ref wfjuwogxaupyadwhvoxy --yes` e
  `supabase db query --linked -o json -f <arquivo>`. Leitura e o check (que termina em `rollback`) passam; DDL nunca —
  migração só pelo CI.

## Decisões deste plano

1. **Conversa nova, na base.** A base não sabe o que é caso ou pedido. Conta como conversa nova a parte 0 de um passo pra
   telefone que nunca escreveu pro número (`last_inbound_at` nulo) e que não recebeu nada do número nos 7 dias antes — a
   mesma janela do "recebeu sequência nos últimos 7 dias" (§1.1). Aviso do Rastreio do mesmo pedido mais de 7 dias depois
   do anterior conta de novo (erra pro lado de mandar menos).
2. **Quem escreveu nas últimas 24 h** passa por pausa, horário e teto; só o intervalo vale. A spec isenta essa conversa
   na pausa (§1.6); aqui também no horário (responder 21h30 quem escreveu 21h25 é conversa, não abordagem).
3. **Um passo não para no meio.** A parte 1 (e a 2) só sai depois da anterior ter saído, 5–15 s depois, e não esbarra em
   horário nem teto: o teto do passo inteiro é reservado na parte 0. Para na pausa. Anterior falhou ou foi cancelada →
   as seguintes são canceladas (`parte_anterior`).
4. **Ordem no teto:** prioridade (resposta > pix > pedido > carrinho), depois ordem de chegada. "Carrinho de maior
   valor" (§1.5) fica com quem enfileira: o agendador do PR 7 enfileira os carrinhos do lote do maior pro menor valor.
   O contrato não tem campo de valor.
5. **Motivo da falha** vai em `private_messages.error`, num código fixo (tabela na Task 2). `statusDosDms` devolve o
   status e o código: `Record<id, { status, erro }>`, como no contrato do índice (nulo enquanto não falhou nem foi
   cancelada).
6. **Restrição** (429, `rate-overlimit`, 463) pausa o número por 24 h com `app.privado_pausar(…, 'restricao')`, criada
   **só aqui** e reusada pelo PR 4 (sinais e entrega). O aviso no sino de **toda** pausa sai dela, num lugar só: quando
   pausa agora (`true`), grava um `notifications` (`type` `privado_pausa`) com o motivo; quem chama não avisa de novo.
   A pausa por restrição deste PR avisa também.
7. **O número dos grupos nunca manda DM também pelo destino:** o sender de grupo recusa alvo que não seja `@g.us` (hoje
   aceita pessoa). `jidToNumber` deixa de transformar `@lid` em telefone.
8. **Sem dry-run de DM:** o loop de DM só liga com `WORKER_SEND_ENABLED=true`. Fingir "enviada" diria aos módulos que a
   cliente recebeu; parada, a fila vence pela manutenção, que roda sempre (`cancelada` com `error = 'vencida'`).
9. **`private_messages` ganha `sent_at`, `abre_conversa` e `conta_no_teto`:** o teto do dia conta o que saiu, com o que
   valia na hora do envio (a resposta da cliente depois não "devolve" a vaga).
10. **"O caso segue ativo" não é barreira da base** (§3 "No claim" pede as duas): a base não conhece caso nem pedido. O
    banco barra telefone bloqueado e add-on desligado; caso que parou é o módulo que cancela, com `cancelarDms`.
11. **A confirmação do SAIR atravessa o bloqueio** (spec §1.4, "1 mensagem de confirmação"): só a DM cuja `dedupeKey`
    começa com `privado:sair:` (o PR 4 enfileira `privado:sair:<conversation_id>` depois de gravar o `private_optouts`)
    passa pela barreira no `enfileirar_dm`, no claim e na limpeza. Qualquer outra pra esse telefone é recusada.
12. **Add-on desligado não cancela a fila:** o claim não pega DM do módulo desligado, e ela vence pelo `valid_until`
    (`cancelada` com `error = 'vencida'`). Religar a tempo deixa sair o que ainda vale.

## Arquivos

| Arquivo | O quê |
|---|---|
| `apps/web/supabase/migrations/20261030120000_envio_de_dm.sql` | colunas, índices, RPCs, ritmo, trava no claim de grupos |
| `deploy/supabase/apply-order.txt` | linha da migração |
| `deploy/supabase/schema-baseline.json` | a tabela `private_messages` e as seis funções `public.` novas |
| `infra/tests/envio-de-dm-check.sql` | check do banco (10 blocos) |
| `apps/worker/src/evolution-sender.ts` (+ `.test.ts`) | `whatsappNumbers`; envio devolve `key.id` |
| `apps/worker/src/instance-info.ts` (+ `.test.ts`) | nome e `purpose` da instância, com cache |
| `apps/worker/src/send-command.ts` (+ `.test.ts`), `send-loop.ts` | trava do lado dos grupos e `jidToNumber` |
| `apps/worker/src/dm-command.ts` (+ `.test.ts`) | decisão de envio de uma DM |
| `apps/worker/src/dm-loop.ts` (+ `.test.ts`) | deps reais e o tick |
| `apps/worker/src/housekeeping.ts` (+ `.test.ts`), `index.ts` | `limpar_fila_dm` e o loop `dm` |
| `apps/web/src/lib/privado/dm.ts` (+ `.test.ts`) | a API do contrato |

## Global Constraints

- TypeScript strict; web com imports `@/`; worker ESM (`NodeNext`, import relativo com `.js`); arquivos `kebab-case`;
  sem `any` sem justificativa; nomes de domínio em português, como no código.
- Store com service-role filtra `.eq('tenant_id', …)` sempre: o RLS não protege esse caminho. RPC `security definer`
  filtra a loja pelo parâmetro.
- Migração: arquivo novo em `apps/web/supabase/migrations/` + linha no fim de `deploy/supabase/apply-order.txt`; o CI
  aplica em dev no PR e em prod no merge; baseline no mesmo PR; idempotente; `security definer` sempre com
  `set search_path`; nunca DDL à mão.
- Função nova: `revoke all … from public, anon, authenticated` e `grant execute … to service_role`, conferido com
  `has_function_privilege` (o default privilege dá EXECUTE a `authenticated`).
- `hubflow-engine/DECISIONS.md` é vinculante: nada de "digitando", marcar como lida, texto girado, troca de aparelho,
  proxy. O worker nunca manda `delay`, presença nem `markMessageAsRead` para a Evolution.
- O número dos grupos nunca manda DM; o número do atendimento nunca posta em grupo — trava no claim e no sender, com
  teste mutante.
- Ritmo (spec §1.5, exato): teto de conversas novas 20 nos 3 primeiros dias do número, +10 a cada 3 dias seguidos sem
  pausa de proteção, no máximo 60, volta pra 20 depois de pausa — na conta: `least(60, 20 + 10 × floor(dias inteiros
  desde healthy_since / 3))`, com `healthy_since` começando igual ao `ramp_started_at` e a pausa gravando
  `healthy_since = paused_until`; mensagens pra quem ainda não respondeu até 3× o teto
  do dia, automático e manual juntos, e mensagem pra quem escreveu nas últimas 24 h não conta; intervalo sorteado 40–120 s
  entre envios do número e 5–15 s entre partes do mesmo passo; horário 9h–21h de Brasília, ajustável entre 8h e 22h
  (`private_number_state`); no teto, resposta > pix > pedido > carrinho; "dia" = data de Brasília.
- Pausa (spec §1.6): erro de restrição no envio (ex.: 463, `rate-overlimit`) pausa na hora, `pause_reason = 'restricao'`
  (valores do 1a: `sinais` · `restricao` · `entrega`), 24 h; durante a pausa não sai conversa nova e responder quem
  escreveu nas últimas 24 h continua liberado; ao sair, o teto volta pra 20.
- Valores fixados pelo 1a: `direction` `saida` · `entrada`; não existe status `vencida` (vencida = `cancelada` com
  `error = 'vencida'`); `engine_commands.priority` é `smallint` e menor sai antes.
- Validade: DM não cai na `app.missed_send_tolerance()`; passou do `valid_until` → cancelada (`vencida`) e o módulo
  decide.
- Alvo: só `<dígitos>@s.whatsapp.net` (o do `whatsappNumbers`, ou o já salvo na conversa); `@lid` nunca vira telefone.
- Telefone comparado sempre por `public.phone_key` (DDD + 8 últimos dígitos; espelho TS `chaveDoTelefone` em
  `apps/web/src/lib/pages/phone.ts`); ninguém cria outra chave.
- Logs (`apps/worker/src/log.ts`): nunca telefone, JID de pessoa, texto, legenda nem código Pix — só ids, contagens e
  códigos. O erro gravado no banco também é código (`evolution_500`), nunca o corpo da Evolution.
- Evolution v2.3.7 (`deploy/coolify/evolution.docker-compose.yml`); contrato lido na fonte (`EvolutionAPI/evolution-api`,
  tag `2.3.7`).
- Tipos: rodar os três `tsc` (web, web e2e, worker); lint e `tsx --test` não checam tipo. Antes do push:
  `infra/scripts/verify-local.ps1`.
- Commit com prefixo semântico em inglês e a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; corpo do PR
  termina com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Review Focus

1. **O mesmo telefone em formatos diferentes** (máscara, sem 55, sem o 9º dígito): uma conversa só, e o bloqueio vale.
   Testes: check bloco 2 (`optouts` gravado como `(11) 8765-4321` bloqueia `5511987654321`) e bloco 3 (`1133334444` cai
   na conversa de `5511933334444`); `validarPedidoDeDm` normaliza a máscara (Task 7).
2. **Worker ou VPS fora por horas:** na volta sai uma DM por vez por número, e o que venceu não sai. Testes: check bloco 4
   (com uma em andamento o claim devolve 0; `next_send_at`) e bloco 5 (`vencida`).
3. **O módulo repete o pedido** (retentativa, aviso duplicado da Yampi): mesmos ids, nenhum comando a mais. Teste: check
   bloco 3 (duas chamadas, mesmos ids, 2 mensagens, 2 comandos).
4. **Passo de várias partes interrompido** (horário, teto ou pausa no meio; parte 0 falhou): a parte 1 nunca sai sozinha
   nem antes da 0. Testes: check bloco 4 (continuação fora do horário) e bloco 7 (`parte_anterior`).
5. **A cliente pede SAIR, o add-on desliga ou o módulo cancela depois de enfileirar:** nada sai — menos a confirmação do
   próprio SAIR. Testes: check bloco 5 (o claim não pega DM do módulo desligado nem pra telefone bloqueado; a
   `privado:sair:` passa e outra chave pro mesmo telefone é recusada; a do módulo desligado vence) e `cancelarDms` (Task 7).

---

### Task 1: Conferência da Fase 0 e da base

**Files:** nenhum (o resultado vai no corpo do PR, Task 8).
**Depends-on:** none.

**Interfaces:**
- Consumes: fixtures da prova 2 da Fase 0 e o resultado dela (`docs/superpowers/plans/_recuperar-fase-0-resultado.md`,
  linhas W2, W3, W4, W7, W9, W10, W17 e W18 e a seção 8); a migração do PR 1a; `apps/web/src/lib/privado/numero.ts` (PR 2b).
- Produces: a lista "Fase 0 e base conferidas" para o PR e, se um nome do PR 1a diferir deste plano, a troca feita no
  plano inteiro antes da Task 2.

Suposições sobre a Evolution v2.3.7 (lidas na fonte em 29/10):

| # | Suposição | Usada em |
|---|---|---|
| E1 | `POST /chat/whatsappNumbers/{instance}` com `{"numbers":["55DDDNÚMERO"]}` → 200 e lista `[{"jid","exists","number","name"?,"lid"?}]` (`OnWhatsAppDto`); para celular do Brasil o `jid` volta com ou sem o 9º dígito, do jeito que o WhatsApp conhece | Tasks 3, 5 |
| E2 | o `lid` do `whatsappNumbers` é só a marca `"lid"` ou ausente, nunca o `@lid` da cliente (`whatsappNumber` em `whatsapp.baileys.service.ts`); só se guarda `lid` que é JID (`<dígitos>[:<aparelho>]@lid` ou `@hosted.lid`), gravado sem o `:<aparelho>` (PR 4, S13) | Tasks 3, 5 |
| E3 | `POST /message/sendText/{instance}` com `{"number":"<jid>","text":"…"}` → 2xx com `{"key":{"remoteJid","fromMe","id"},…,"status":"PENDING"}` (`prepareMessage`); o `key.id` é o `keyId` do `messages.update` dessa mensagem (o PR 4 casa o status por ele) | Tasks 3, 5 |
| E4 | `POST /message/sendMedia/{instance}` com `{"number","mediatype":"image","media":"<URL assinada>","caption"}` → o formato de E3 | Task 3 |
| E5 | número sem WhatsApp no envio → HTTP 400 com corpo `{"status":400,"error":"Bad Request","response":{"message":[{"jid","exists":false,"number"}]}}` (`BadRequestException(isWA)`) | Task 5 |
| E6 | sem `delay` no corpo não sai "digitando" (`sendPresenceUpdate` só `if (options?.delay)`) | Task 3 |
| E7 | restrição chega como 429, ou com `rate-overlimit` ou `463` nos primeiros 200 caracteres do corpo do erro | Task 5 |
| E8 | um `@lid` da cliente, se vier no envio, vem em `key.remoteJid` ou `key.remoteJidAlt` | Tasks 3, 5 |

- [ ] **Step 1: Conferir os fixtures da prova 2**

Run: `WT=$(git rev-parse --show-toplevel); ls "$WT/apps/web/src/lib/evolution/__fixtures__/"`
Expected: além dos de julho e setembro, os da prova 2, com os nomes que a Fase 0 grava (Tarefa 11 dela):
`whatsapp-numbers.privado.json`, `send-text.privado.json`, `send-media.privado.json`, `send-text.privado-sem-whatsapp.json`,
`send-message.privado.json` e `messages-update.privado-servidor.json` / `messages-update.privado-entregue.json` (o
`messages.update` de mensagem enviada). Abrir cada um e comparar com E1–E8, junto com as linhas W do resultado da Fase 0
(seção 8 dele diz onde cada E se responde).

- Contradiz E1, E3 ou E5 (sem `jid` de pessoa no whatsappNumbers, sem `key.id` no envio, número sem WhatsApp não
  distinguível): **pare** e reporte ao Igor com o fixture. Não adapte sozinho.
- `key.id` do envio diferente do `keyId` do `messages.update` da mesma mensagem: **pare** (o status por mensagem do PR 4
  depende disso).
- Só diferença de forma (campo a mais, `lid` em outro lugar): ajuste a leitura na Task 3 e os literais dos testes das
  Tasks 3 e 5 ao fixture, e anote.
- **Se a Fase 0 confirmar W2 e W3** (W2: o `whatsappNumbers` devolve só a marca `"lid"`, nunca o LID; W3: o `sendText`
  roda o `whatsappNumber` por dentro e responde 400 `{jid, exists: false, number}` — a fonte da 2.3.7 já diz as duas
  coisas), o pré-check separado sai, e o E1 deixa de ser condição de parada. Na Task 5, o passo 6 manda direto, com `number` = `row.jid` se já é
  `@s.whatsapp.net`, senão os dígitos do `phone`; o 400 `exists:false` vira `sem_whatsapp` (definitivo, pelo
  `isSemWhatsapp` que já está no `catch`); o JID gravado na conversa passa a ser o `key.remoteJid` da resposta do envio
  quando for `@s.whatsapp.net` (o JID que o WhatsApp conhece, com ou sem o 9º dígito). O `@lid` da cliente só pode vir
  na resposta do envio (`key.remoteJid` / `key.remoteJidAlt`, E8), nunca do `whatsappNumbers`. Sai `whatsappNumber` do
  `DmDeps` e dos deps reais (Task 6), o teste "1ª mensagem pro telefone: whatsappNumbers antes…" vira "1ª mensagem: envia
  pelos dígitos e grava o JID da resposta", e o `EvolutionSender.whatsappNumbers` da Task 3 sai (nada mais o chama).
  Anotar no PR: é desvio consciente da spec §3 ("Antes da 1ª mensagem do caso: `whatsappNumbers`"), que o índice lista
  entre as decisões que o Igor pode vetar. Se a Fase 0 mostrar o contrário (W2 com o LID de verdade, ou envio sem a
  checagem por dentro), o plano segue como está.
- Sem os fixtures da prova 2: **pare**.

- [ ] **Step 2: Conferir a base (PR 1a, 2a e 2b)**

Run: `WT=$(git rev-parse --show-toplevel); grep -ln "create table if not exists public.private_messages" "$WT"/apps/web/supabase/migrations/*.sql`
Expected: a migração do PR 1a. Nela, conferir e anotar:
- `private_messages`: `tenant_id`, `conversation_id`, `module`, `direction`, `author`, `author_user_id`, `kind`, `text`,
  `media_ref`, `command_id` (sem FK: o vínculo com FK é `engine_commands.private_message_id`), `provider_message_id`,
  `status`, `error`, `priority`,
  `dedupe_key` (único por loja), `part_index`, `phone`; **o valor de `direction` da saída** (este plano escreve
  `'saida'`); `kind` aceita `texto` e `imagem`.
- `private_conversations`: `phone_key` gerada com `public.phone_key(phone)`, único `(instance_id, phone_key)`, `jid`, `lid`
  (único por número), `first_outbound_at`, `last_inbound_at`, `last_message_at`, `last_preview`, e default em `status` e
  `unread`.
- `private_number_state`: único em `instance_id`; `horario_inicio`/`horario_fim` em horas inteiras (este plano compara com
  `extract(hour …)`); `ramp_started_at`, `healthy_since`, `paused_until`, `pause_reason`, `next_send_at`.
- `private_optouts` (`tenant_id`, `phone`, `phone_key`, `module`); `engine_commands.private_message_id`, `dm_module`,
  `valid_until`; `instances.purpose`; `tenant_settings.recuperar_enabled` e `rastreio_enabled`.
- Índices: o 1a já cria `engine_commands_private_message_idx` e `engine_commands_dm_fila_idx (instance_id, priority,
  available_at) where status = 'queued' and type in ('dm_text','dm_image')` (o claim da Task 2 ordena por `priority`,
  então usa este). A Task 2 cria `optouts_tenant_phone_key_idx` e `engine_commands_dm_instance_idx`; se já existir
  equivalente, tire da Task 2.
- `pause_reason` aceita `sinais`, `restricao`, `entrega`; nenhum plano anterior criou `app.privado_pausar` (o PR 4 a
  consome desta Task 2).

Regra: nome ou valor diferente → vale o do PR 1a; trocar em todo o plano (SQL e TS) antes da Task 2 e anotar no PR.
Objeto ausente → **pare**.

Run: `grep -n "export" "$WT/apps/web/src/lib/privado/numero.ts"`
Expected: `numeroDoAtendimento` e o tipo `NumeroDoAtendimento` (PR 2b). Diferente → o reexport da Task 7 usa o do PR 2b.

- [ ] **Step 3: Conferir o corpo vigente do claim de grupos**

Run: `grep -l "claim_send_commands" "$WT"/apps/web/supabase/migrations/*.sql | sort | tail -1`
Expected: `…/20261023120000_antiban_saidas_e_todos.sql` (md5 normalizado `e129ff5b504e8e86122f5fdf53bb1955`). Se vier outra
(o PR 2a não mexe nele; outro PR pode ter mexido), a Task 2 parte do corpo dessa e a trava aceita o md5 dela; se ela já filtra `purpose`, a
Task 2 só acrescenta o cancelamento com motivo.

- [ ] **Step 4: Sem commit.** O resultado vai no corpo do PR (Task 8).

---

### Task 2: Banco — migração e check

**Files:**
- Create: `apps/web/supabase/migrations/20261030120000_envio_de_dm.sql` (com a data do dia da implementação; conferir
  com `ls apps/web/supabase/migrations | grep <prefixo>` que o prefixo não existe)
- Create: `infra/tests/envio-de-dm-check.sql`
- Modify: `deploy/supabase/apply-order.txt` (linha no fim)

**Depends-on:** 1.

**Interfaces:**
- Consumes: as tabelas e colunas do PR 1a (Task 1); `public.phone_key(text)`; `app.complete_engine_command`;
  `app.instance_caps`, `app.exit_breaker` e o corpo vigente de `app.claim_send_commands`.
- Produces (só `service_role` executa):
  - `public.enfileirar_dm(p_tenant uuid, p_pedido jsonb) returns jsonb` — `p_pedido`: `modulo`, `telefone`, `partes`
    (`[{texto}]` ou `[{imagem, legenda?}]`, 1–3), `prioridade`, `valido_ate` (ISO), `dedupe_key`, `autor_user_id`
    (nulo = automático). Devolve `{"message_ids":[…]}` ou `{"recusado":"sem_numero"|"modulo_desligado"|"bloqueado"}`.
    Chave da parte i: `<dedupe_key>#i` na `private_messages`, `dm:<dedupe_key>#i` no comando. Payload do comando:
    `{phone, text}` (`dm_text`) ou `{phone, image, caption}` (`dm_image`). `engine_commands.priority` (`smallint`): parte
    0 = 10/20/30/40 (resposta/pix/pedido/carrinho), parte > 0 = 0. `dedupe_key` começando com `privado:sair:` não é
    recusada por bloqueio (decisão 11).
  - `public.claim_dm_commands(p_max integer default 5, p_tenant uuid default null) returns table (command_id uuid,
    tenant_id uuid, instance_id uuid, type text, payload jsonb, dm_module text, private_message_id uuid, jid text)` —
    no máximo um por número; `jid` = o salvo na conversa (nulo antes do 1º envio).
  - `public.registrar_dm_enviada(p_command_id uuid, p_provider_message_id text, p_jid text, p_lid text) returns void`
  - `public.registrar_dm_falhou(p_command_id uuid, p_erro text, p_definitivo boolean, p_restricao boolean) returns void`
  - `public.limpar_fila_dm(p_tenant uuid default null) returns integer` — mensagens que mudaram de status.
  - `app.ritmo_privado(p_instance uuid) returns table (teto integer, conversas_novas integer, mensagens integer,
    limite_mensagens integer, no_horario boolean, pausado_ate timestamptz, proximo_envio_em timestamptz)` — fonte única
    do ritmo; a tela "Ritmo do número" (PR 7) lê daqui.
  - `app.privado_pausar(p_tenant uuid, p_instance uuid, p_motivo text) returns boolean` e o wrapper
    `public.privado_pausar` (mesma assinatura) — grava `paused_until = now() + 24 h`, `pause_reason = p_motivo`,
    `healthy_since = paused_until`; `true` se pausou agora, `false` se já estava pausado (não estende). Quando pausa
    agora, grava o aviso no sino (`notifications`, `type` `privado_pausa`, corpo pelo motivo): é o único lugar que avisa
    pausa, para `restricao` (aqui), `sinais` e `entrega` (PR 4, que só chama).
  - `app.modulo_privado_ligado(p_tenant uuid, p_modulo text) returns boolean`,
    `app.telefone_bloqueado(p_tenant uuid, p_phone text) returns boolean`,
    `app.dm_abre_conversa(p_message uuid) returns boolean`, `app.dm_parte(p_chave text, p_parte integer) returns text`,
    `app.dm_intervalo(p_mesmo_passo boolean) returns interval`.
  - Colunas `private_messages.sent_at`, `abre_conversa`, `conta_no_teto`.
  - Códigos em `private_messages.error`:

| Código | Quando | Status da mensagem |
|---|---|---|
| `vencida` | passou do `valid_until` na fila (inclusive a do módulo desligado, que o claim não pega) | `cancelada` |
| `trava_numero` | DM fora do número do atendimento (ou instância/mensagem sumiu) | `cancelada` (fila) · `falhou` (worker) |
| `modulo_desligado` | o add-on desligou entre o claim e o envio (corrida rara) | `falhou` |
| `bloqueado` | telefone entrou em `private_optouts`/`optouts` depois de enfileirar (menos `privado:sair:`) | `cancelada` |
| `parte_anterior` | a parte anterior do passo falhou ou foi cancelada | `cancelada` |
| `cancelada` | `cancelarDms` | `cancelada` |
| `sem_whatsapp` | `whatsappNumbers` sem conta, ou 400 `exists:false` no envio | `falhou` |
| `payload_invalido`, `destino_invalido`, `tipo_inesperado` | comando mal formado; JID que não é de pessoa | `falhou` |
| `restricao`, `evolution_<status>`, `erro_de_envio`, `sem_instancia`, `imagem_indisponivel` | falha que tenta de novo (5 tentativas, espera 30 s·2ⁿ) | `falhou` no fim |

- [ ] **Step 1: Escrever o check** — `infra/tests/envio-de-dm-check.sql`:

```sql
-- Conferência da migração 20261030120000_envio_de_dm.sql (envio de DM pelo número do atendimento), nos DOIS
-- bancos, depois de aplicar. Rodar de apps\web, entre 8h e 21h59 de Brasília (os blocos de horário dependem):
--   supabase link --project-ref <ref> --yes      # dev wfjuwogxaupyadwhvoxy / prod nidoatbxaylrkcgbszns
--   supabase db query --linked -o json -f ..\..\infra\tests\envio-de-dm-check.sql
-- Tudo o que escreve fica entre begin e rollback: duas lojas descartáveis (d30d…), um número do atendimento,
-- um de grupos, DMs e comandos. Cada bloco levanta 'FALHOU: …' e o script para ali; sem erro, r = 'ok'.
-- Antes da migração o bloco 1 falha (função ausente) — é o RED. Claim e limpeza sempre com p_tenant da loja.

begin;

do $$ begin
  if extract(hour from now() at time zone 'America/Sao_Paulo') not between 8 and 21 then
    raise exception 'FALHOU: rode entre 8h e 21h59 de Brasília (o check usa o horário 8h–22h do número)';
  end if;
end $$;

create function pg_temp.loja() returns uuid language sql immutable as $f$ select 'd30d0000-0000-4000-8000-000000000001'::uuid $f$;
create function pg_temp.privado() returns uuid language sql immutable as $f$ select 'd30d0000-0000-4000-8000-0000000000e1'::uuid $f$;

insert into public.organizations (id, tenant_id, name, slug) values
  ('d30d0000-0000-4000-8000-000000000001', 'd30d0000-0000-4000-8000-000000000001', 'Check envio de DM', 'check-envio-dm-d30d'),
  ('d30d0000-0000-4000-8000-000000000002', 'd30d0000-0000-4000-8000-000000000002', 'Check DM sem número', 'check-envio-dm-d30d-b');
insert into public.tenant_settings (tenant_id, recuperar_enabled, rastreio_enabled) values
  ('d30d0000-0000-4000-8000-000000000001', true, false), ('d30d0000-0000-4000-8000-000000000002', true, false)
on conflict (tenant_id) do update set recuperar_enabled = excluded.recuperar_enabled, rastreio_enabled = excluded.rastreio_enabled;
insert into public.instances (id, tenant_id, name, status, purpose, provider_instance_id) values
  ('d30d0000-0000-4000-8000-0000000000e1', 'd30d0000-0000-4000-8000-000000000001', 'Check atendimento', 'connected', 'privado', 'gr_check_privado'),
  ('d30d0000-0000-4000-8000-0000000000e2', 'd30d0000-0000-4000-8000-000000000001', 'Check grupos', 'connected', 'grupos', 'gr_check_grupos');
insert into public.private_number_state (tenant_id, instance_id, horario_inicio, horario_fim, ramp_started_at, healthy_since)
values (pg_temp.loja(), pg_temp.privado(), 8, 22, now(), now());
-- A optouts geral guarda o telefone como veio: sem o 55 e sem o nono dígito.
insert into public.optouts (tenant_id, phone) values (pg_temp.loja(), '(11) 8765-4321');

create function pg_temp.pedido(p_tel text, p_chave text, p_extra jsonb default '{}') returns jsonb language sql as $f$
  select jsonb_build_object('modulo', 'recuperar', 'telefone', p_tel, 'prioridade', 'carrinho',
           'partes', jsonb_build_array(jsonb_build_object('texto', 'Oi! Seu carrinho ficou guardado.')),
           'valido_ate', now() + interval '1 hour', 'dedupe_key', p_chave) || p_extra $f$;
create function pg_temp.dm(p_tel text, p_chave text, p_extra jsonb default '{}') returns jsonb language sql as $f$
  select public.enfileirar_dm(pg_temp.loja(), pg_temp.pedido(p_tel, p_chave, p_extra)) $f$;
create function pg_temp.cmd(p_chave text, p_parte integer default 0) returns public.engine_commands language sql as $f$
  select c.* from public.engine_commands c join public.private_messages m on m.id = c.private_message_id
   where m.tenant_id = pg_temp.loja() and m.dedupe_key = p_chave || '#' || p_parte $f$;
create function pg_temp.msg(p_chave text, p_parte integer default 0) returns public.private_messages language sql as $f$
  select m.* from public.private_messages m where m.tenant_id = pg_temp.loja() and m.dedupe_key = p_chave || '#' || p_parte $f$;
create function pg_temp.pegar() returns text[] language sql as $f$
  select coalesce(array_agg(m.dedupe_key order by m.dedupe_key), '{}')
    from public.claim_dm_commands(10, pg_temp.loja()) d join public.private_messages m on m.id = d.private_message_id $f$;
create function pg_temp.liberar() returns void language sql as $f$
  update public.private_number_state set next_send_at = now() - interval '1 second' where instance_id = pg_temp.privado() $f$;
-- n DMs já enviadas hoje pelo número, uma conversa cada (para encher o teto sem esperar).
create function pg_temp.fake_enviadas(p_n integer, p_novas boolean, p_desde integer) returns void language plpgsql as $f$
declare k integer; v uuid; m uuid; tel text;
begin
  for k in p_desde .. p_desde + p_n - 1 loop
    tel := '55119' || lpad(k::text, 8, '0');
    insert into public.private_conversations (tenant_id, instance_id, phone) values (pg_temp.loja(), pg_temp.privado(), tel)
    returning id into v;
    insert into public.private_messages (tenant_id, conversation_id, module, direction, author, kind, text, status,
                                         priority, dedupe_key, part_index, phone, sent_at, abre_conversa, conta_no_teto)
    values (pg_temp.loja(), v, 'recuperar', 'saida', 'automatico', 'texto', 'x', 'enviada',
            'carrinho', 'check:fake:' || k || '#0', 0, tel, now(), p_novas, true)
    returning id into m;
    insert into public.engine_commands (tenant_id, instance_id, type, status, payload, completed_at, private_message_id, dm_module, valid_until)
    values (pg_temp.loja(), pg_temp.privado(), 'dm_text', 'done', '{}', now(), m, 'recuperar', now() + interval '1 hour');
  end loop;
end $f$;

-- 1) Contrato: search_path, execute só do service_role, security definer onde lê tabela; colunas; corpo do claim.
do $$ begin
  if exists (
    select 1 from (values
      ('public.enfileirar_dm(uuid,jsonb)', true), ('public.claim_dm_commands(integer,uuid)', true),
      ('public.registrar_dm_enviada(uuid,text,text,text)', true), ('public.registrar_dm_falhou(uuid,text,boolean,boolean)', true),
      ('public.limpar_fila_dm(uuid)', true), ('app.ritmo_privado(uuid)', true),
      ('app.privado_pausar(uuid,uuid,text)', true), ('public.privado_pausar(uuid,uuid,text)', true),
      ('app.modulo_privado_ligado(uuid,text)', true), ('app.telefone_bloqueado(uuid,text)', true),
      ('app.dm_abre_conversa(uuid)', true), ('app.dm_parte(text,integer)', false), ('app.dm_intervalo(boolean)', false),
      ('app.claim_send_commands(integer,uuid)', true)) as f(sig, definer)
    left join pg_proc p on p.oid = to_regprocedure(f.sig)
    where p.oid is null or p.prosecdef <> f.definer
       or not exists (select 1 from unnest(p.proconfig) c(cfg) where c.cfg like 'search_path=%')
       or has_function_privilege('anon', p.oid, 'EXECUTE') or has_function_privilege('authenticated', p.oid, 'EXECUTE')
       or not has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then raise exception 'FALHOU: funções do envio de DM fora do contrato (definer, search_path, execute só service_role)'; end if;
  if (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'private_messages'
        and column_name in ('sent_at', 'abre_conversa', 'conta_no_teto')) <> 3 then
    raise exception 'FALHOU: private_messages sem sent_at/abre_conversa/conta_no_teto'; end if;
  if (select md5(btrim(regexp_replace(regexp_replace(p.prosrc, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
        from pg_proc p where p.oid = to_regprocedure('app.claim_send_commands(integer,uuid)')) <> '<md5-novo>' then
    raise exception 'FALHOU: corpo de app.claim_send_commands difere da migração 20261030120000'; end if;
end $$;

-- 2) Recusas: sem número, módulo desligado, bloqueio por chave de telefone (optouts e private_optouts); nada gravado.
do $$ declare r jsonb; begin
  r := public.enfileirar_dm('d30d0000-0000-4000-8000-000000000002', pg_temp.pedido('5511944440009', 'check:b'));
  if r is distinct from '{"recusado": "sem_numero"}' then raise exception 'FALHOU: loja sem número: %', r; end if;
  r := pg_temp.dm('5511944440009', 'check:rastreio', '{"modulo": "rastreio", "prioridade": "pedido"}');
  if r is distinct from '{"recusado": "modulo_desligado"}' then raise exception 'FALHOU: módulo desligado: %', r; end if;
  r := pg_temp.dm('5511987654321', 'check:optout');
  if r is distinct from '{"recusado": "bloqueado"}' then raise exception 'FALHOU: optouts "(11) 8765-4321" bloqueia 5511987654321: %', r; end if;
  insert into public.private_optouts (tenant_id, phone, module) values (pg_temp.loja(), '5511955556666', 'rastreio');
  r := pg_temp.dm('11955556666', 'check:sair');
  if r is distinct from '{"recusado": "bloqueado"}' then raise exception 'FALHOU: SAIR do Rastreio bloqueia o Recuperar: %', r; end if;
  if exists (select 1 from public.private_messages where tenant_id = pg_temp.loja()) then
    raise exception 'FALHOU: recusa gravou mensagem'; end if;
end $$;

-- 3) Enfileirar: uma mensagem e um comando por parte, idempotente pela chave, mesma conversa em outro formato.
do $$ declare r1 jsonb; r2 jsonb; begin
  perform pg_temp.dm('5511944440001', 'check:carrinho');              -- chega primeiro, prioridade carrinho
  r1 := pg_temp.dm('5511933334444', 'check:pix-1', jsonb_build_object('prioridade', 'pix', 'partes', jsonb_build_array(
          jsonb_build_object('texto', 'Seu pedido tá separado'), jsonb_build_object('texto', '00020126580014BR.GOV.BCB.PIX'))));
  r2 := pg_temp.dm('5511933334444', 'check:pix-1', '{"prioridade": "pix", "partes": [{"texto": "outro"}]}');
  if jsonb_array_length(r1->'message_ids') <> 2 or r1 is distinct from r2 then
    raise exception 'FALHOU: mesma chave tem que devolver os mesmos 2 ids: % / %', r1, r2; end if;
  if (select count(*) from public.private_messages m where m.tenant_id = pg_temp.loja() and m.dedupe_key like 'check:pix-1#%'
        and m.status = 'na_fila' and m.priority = 'pix' and m.module = 'recuperar' and m.author = 'automatico') <> 2
     or (select array_agg(c.priority order by c.priority) from public.engine_commands c
           join public.private_messages m on m.command_id = c.id and m.id = c.private_message_id
          where m.tenant_id = pg_temp.loja() and m.dedupe_key like 'check:pix-1#%' and c.type = 'dm_text'
            and c.status = 'queued' and c.instance_id = pg_temp.privado() and c.dm_module = 'recuperar'
            and c.valid_until > now()) is distinct from array[0, 20]::smallint[] then
    raise exception 'FALHOU: pix-1 = 2 mensagens na fila e 2 comandos dm_text (prioridade 20 e 0) no número do atendimento'; end if;
  perform pg_temp.dm('1133334444', 'check:formato');                  -- sem 55 e sem o nono dígito
  if (pg_temp.msg('check:formato')).conversation_id is distinct from (pg_temp.msg('check:pix-1')).conversation_id then
    raise exception 'FALHOU: o mesmo telefone em outro formato abriu outra conversa'; end if;
end $$;

-- 4) Claim: uma por vez por número, prioridade antes da ordem de chegada, parte 1 só depois da 0 e sem parar no
--    horário, DM em número de grupos não sai, e nem o disjuntor de saídas nem a tolerância de 15 min mexem em DM.
do $$ declare v text[]; ns timestamptz; h integer := extract(hour from now() at time zone 'America/Sao_Paulo'); begin
  update public.engine_commands set instance_id = 'd30d0000-0000-4000-8000-0000000000e2' where id = (pg_temp.cmd('check:formato')).id;
  update public.engine_commands set available_at = now() - interval '20 minutes' where id = (pg_temp.cmd('check:pix-1')).id;
  insert into app.exit_breaker (tenant_id, tripped_at, until, saidas, limite) values (pg_temp.loja(), now(), now() + interval '6 hours', 99, 30);
  perform app.claim_send_commands(10, pg_temp.loja());
  if exists (select 1 from public.engine_commands where tenant_id = pg_temp.loja() and type like 'dm\_%' and status <> 'queued') then
    raise exception 'FALHOU: o claim de grupos mexeu em DM'; end if;
  v := pg_temp.pegar();
  if v is distinct from array['check:pix-1#0'] then raise exception 'FALHOU: claim deveria pegar só pix-1#0, pegou %', v; end if;
  if pg_temp.pegar() <> '{}' then raise exception 'FALHOU: com uma DM em andamento o número não pega outra'; end if;
  perform public.registrar_dm_enviada((pg_temp.cmd('check:pix-1')).command_id, '3EB0CHECK', '551133334444@s.whatsapp.net', '9990001@lid');
  if (pg_temp.msg('check:pix-1')).status <> 'enviada' or (pg_temp.msg('check:pix-1')).provider_message_id <> '3EB0CHECK'
     or (pg_temp.msg('check:pix-1')).sent_at is null or not (pg_temp.msg('check:pix-1')).abre_conversa
     or not (pg_temp.msg('check:pix-1')).conta_no_teto or (pg_temp.cmd('check:pix-1')).status <> 'done'
     or not exists (select 1 from public.private_conversations c where c.id = (pg_temp.msg('check:pix-1')).conversation_id
                      and c.jid = '551133334444@s.whatsapp.net' and c.lid = '9990001@lid' and c.first_outbound_at is not null) then
    raise exception 'FALHOU: envio registrado errado (mensagem, comando ou conversa)'; end if;
  select next_send_at into ns from public.private_number_state where instance_id = pg_temp.privado();
  if ns not between now() + interval '5 seconds' and now() + interval '15 seconds' then
    raise exception 'FALHOU: entre partes o intervalo é 5–15 s, veio %', ns - now(); end if;
  if pg_temp.pegar() <> '{}' then raise exception 'FALHOU: claim antes do intervalo'; end if;
  update public.private_number_state set horario_inicio = case when h = 21 then 8 else 21 end,
         horario_fim = case when h = 21 then 9 else 22 end where instance_id = pg_temp.privado();  -- fora do horário
  perform pg_temp.liberar();
  v := pg_temp.pegar();
  if v is distinct from array['check:pix-1#1'] then raise exception 'FALHOU: a continuação sai fora do horário, pegou %', v; end if;
  perform public.registrar_dm_enviada((pg_temp.cmd('check:pix-1', 1)).command_id, '3EB0CHECK2', null, null);
  select next_send_at into ns from public.private_number_state where instance_id = pg_temp.privado();
  if ns not between now() + interval '40 seconds' and now() + interval '120 seconds' or (pg_temp.msg('check:pix-1', 1)).abre_conversa then
    raise exception 'FALHOU: fim do passo = 40–120 s, e a parte 1 não abre conversa'; end if;
  perform pg_temp.liberar();
  if pg_temp.pegar() <> '{}' then raise exception 'FALHOU: parte 0 saiu fora do horário'; end if;
  update public.private_number_state set horario_inicio = 8, horario_fim = 22 where instance_id = pg_temp.privado();
  delete from app.exit_breaker where tenant_id = pg_temp.loja();
end $$;

-- 5) Barreiras depois de enfileirar: o claim não pega DM de módulo desligado nem pra telefone bloqueado; a confirmação
--    do SAIR passa e outra chave pro mesmo telefone é recusada; a limpeza cancela trava e bloqueio, e a DM do módulo
--    desligado fica na fila até vencer. As duas conversas escreveram há 1 h (isentas de horário e teto), e o horário
--    fica fechado pro carrinho: só as barreiras seguram.
do $$ declare v text[]; n integer; r jsonb; conversa uuid; h integer := extract(hour from now() at time zone 'America/Sao_Paulo'); begin
  update public.tenant_settings set rastreio_enabled = true where tenant_id = pg_temp.loja();
  perform pg_temp.dm('5511944440002', 'check:rastreio-off', '{"modulo": "rastreio", "prioridade": "pedido"}');
  update public.tenant_settings set rastreio_enabled = false where tenant_id = pg_temp.loja();
  perform pg_temp.dm('5511944440003', 'check:sair-depois');
  conversa := (pg_temp.msg('check:sair-depois')).conversation_id;
  update public.private_conversations set last_inbound_at = now() - interval '1 hour'
   where id in (conversa, (pg_temp.msg('check:rastreio-off')).conversation_id);
  insert into public.private_optouts (tenant_id, phone, module) values (pg_temp.loja(), '11944440003', 'recuperar');
  update public.private_number_state set horario_inicio = case when h = 21 then 8 else 21 end,
         horario_fim = case when h = 21 then 9 else 22 end where instance_id = pg_temp.privado();
  perform pg_temp.liberar();
  if pg_temp.pegar() <> '{}' then raise exception 'FALHOU: claim pegou DM de módulo desligado ou pra telefone bloqueado'; end if;

  r := pg_temp.dm('11944440003', 'check:outra-depois-do-sair');
  if r is distinct from '{"recusado": "bloqueado"}' then raise exception 'FALHOU: depois do SAIR, outra chave é recusada: %', r; end if;
  r := pg_temp.dm('5511944440003', 'privado:sair:' || conversa, '{"prioridade": "resposta"}');
  if r ? 'recusado' then raise exception 'FALHOU: a confirmação do SAIR entra na fila: %', r; end if;
  v := pg_temp.pegar();
  if v is distinct from array['privado:sair:' || conversa || '#0'] then raise exception 'FALHOU: só a confirmação do SAIR sai, pegou %', v; end if;
  perform public.registrar_dm_enviada((pg_temp.cmd('privado:sair:' || conversa)).command_id, '3EB0SAIR', '5511944440003@s.whatsapp.net', null);

  n := public.limpar_fila_dm(pg_temp.loja());
  if n <> 2 or (pg_temp.msg('check:formato')).status <> 'cancelada' or (pg_temp.msg('check:formato')).error <> 'trava_numero'
     or (pg_temp.msg('check:sair-depois')).status <> 'cancelada' or (pg_temp.msg('check:sair-depois')).error <> 'bloqueado'
     or (pg_temp.msg('check:rastreio-off')).status <> 'na_fila' or (pg_temp.cmd('check:carrinho')).status <> 'queued' then
    raise exception 'FALHOU: limpeza cancela trava e bloqueio e deixa módulo desligado e carrinho na fila (veio %)', n; end if;
  update public.engine_commands set valid_until = now() - interval '1 minute' where id = (pg_temp.cmd('check:rastreio-off')).id;
  perform public.limpar_fila_dm(pg_temp.loja());
  if (pg_temp.msg('check:rastreio-off')).status <> 'cancelada' or (pg_temp.msg('check:rastreio-off')).error <> 'vencida'
     or (pg_temp.cmd('check:rastreio-off')).status <> 'canceled' then
    raise exception 'FALHOU: DM do módulo desligado vence pelo valid_until (cancelada, error vencida)'; end if;
  update public.private_number_state set horario_inicio = 8, horario_fim = 22 where instance_id = pg_temp.privado();
end $$;

-- 6) Teto, rampa, pausa por restrição, isenção de quem escreveu e limite de 3× o teto.
do $$ declare r record; v text[]; begin
  select * into r from app.ritmo_privado(pg_temp.privado());
  if (r.teto, r.conversas_novas, r.mensagens, r.limite_mensagens, r.no_horario) is distinct from (20, 1, 2, 60, true) then
    raise exception 'FALHOU: ritmo do dia 1: %', r; end if;
  perform pg_temp.fake_enviadas(19, true, 1);                          -- 20 conversas novas hoje: teto cheio
  perform pg_temp.dm('5511922223333', 'check:resposta');
  update public.private_conversations set last_inbound_at = now() - interval '1 hour'
   where id = (pg_temp.msg('check:resposta')).conversation_id;
  perform pg_temp.liberar();
  v := pg_temp.pegar();
  if v is distinct from array['check:resposta#0'] then raise exception 'FALHOU: teto cheio, só sai pra quem escreveu: %', v; end if;
  perform public.registrar_dm_falhou((pg_temp.cmd('check:resposta')).command_id, 'evolution_500', false, false);
  if (pg_temp.cmd('check:resposta')).status <> 'queued' or (pg_temp.cmd('check:resposta')).attempts <> 1
     or (pg_temp.msg('check:resposta')).status <> 'na_fila' then
    raise exception 'FALHOU: falha comum volta pra fila com retentativa e não marca a mensagem'; end if;
  update public.private_number_state set healthy_since = now() - interval '3 days' where instance_id = pg_temp.privado();
  if (select teto from app.ritmo_privado(pg_temp.privado())) <> 30 then raise exception 'FALHOU: 3 dias sem pausa = 30'; end if;
  update public.private_number_state set healthy_since = now() - interval '12 days' where instance_id = pg_temp.privado();
  if (select teto from app.ritmo_privado(pg_temp.privado())) <> 60 then raise exception 'FALHOU: 12 dias sem pausa = 60'; end if;
  update public.private_number_state set healthy_since = now() - interval '40 days' where instance_id = pg_temp.privado();
  if (select teto from app.ritmo_privado(pg_temp.privado())) <> 60 then raise exception 'FALHOU: o teto para em 60'; end if;
  perform pg_temp.liberar();
  v := pg_temp.pegar();
  if v is distinct from array['check:carrinho#0'] then raise exception 'FALHOU: com teto 60 a conversa nova sai: %', v; end if;
  perform public.registrar_dm_falhou((pg_temp.cmd('check:carrinho')).command_id, 'restricao', false, true);
  select * into r from app.ritmo_privado(pg_temp.privado());
  if r.teto <> 20 or r.pausado_ate not between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute'
     or (select pause_reason from public.private_number_state where instance_id = pg_temp.privado()) <> 'restricao' then
    raise exception 'FALHOU: restrição pausa 24 h e o teto volta pra 20: %', r; end if;
  if (select count(*) from public.notifications where tenant_id = pg_temp.loja() and type = 'privado_pausa') <> 1 then
    raise exception 'FALHOU: a pausa por restrição avisa no sino uma vez (notifications privado_pausa)'; end if;
  if public.privado_pausar(pg_temp.loja(), pg_temp.privado(), 'sinais')
     or (select pause_reason from public.private_number_state where instance_id = pg_temp.privado()) <> 'restricao'
     or (select count(*) from public.notifications where tenant_id = pg_temp.loja() and type = 'privado_pausa') <> 1 then
    raise exception 'FALHOU: número já pausado: privado_pausar devolve false, não mexe na pausa e não avisa de novo'; end if;
  update public.engine_commands set available_at = now() - interval '1 second'
   where id in ((pg_temp.cmd('check:resposta')).id, (pg_temp.cmd('check:carrinho')).id);
  perform pg_temp.liberar();
  v := pg_temp.pegar();
  if v is distinct from array['check:resposta#0'] then raise exception 'FALHOU: na pausa só sai pra quem escreveu: %', v; end if;
  perform public.registrar_dm_enviada((pg_temp.cmd('check:resposta')).command_id, '3EB0RESP', '5511922223333@s.whatsapp.net', null);
  if (pg_temp.msg('check:resposta')).conta_no_teto or (pg_temp.msg('check:resposta')).abre_conversa then
    raise exception 'FALHOU: mensagem pra quem escreveu nas últimas 24 h não conta no teto'; end if;
  -- Teto 20 = 60 mensagens: já são 2 (pix-1) + 19; mais 39 enche.
  update public.private_number_state set paused_until = null, healthy_since = now() where instance_id = pg_temp.privado();
  perform pg_temp.fake_enviadas(39, false, 100);
  perform pg_temp.dm('5511933334444', 'check:limite', '{"prioridade": "pix"}');
  perform pg_temp.liberar();
  if pg_temp.pegar() <> '{}' then raise exception 'FALHOU: com 60 mensagens no dia nada sai pra quem não escreveu'; end if;
  update public.engine_commands set status = 'failed' where private_message_id = (pg_temp.msg('check:fake:100')).id;
  if pg_temp.pegar() is distinct from array['check:limite#0'] then raise exception 'FALHOU: 59 + 1 = 60 cabe'; end if;
end $$;

-- 7) Imagem vira dm_image; parte 0 sem WhatsApp falha na hora e a parte 1 é cancelada (parte_anterior).
do $$ begin
  update public.engine_commands set status = 'canceled', error = 'check'
   where tenant_id = pg_temp.loja() and type in ('dm_text', 'dm_image') and status in ('queued', 'processing');
  perform public.limpar_fila_dm(pg_temp.loja());
  perform pg_temp.dm('5511922223333', 'check:duas', jsonb_build_object('partes', jsonb_build_array(jsonb_build_object('texto', 'Oi'),
            jsonb_build_object('imagem', 'recuperar-depoimentos/' || pg_temp.loja() || '/ana.jpg', 'legenda', 'Ana amou'))));
  if (pg_temp.cmd('check:duas', 1)).type <> 'dm_image'
     or (pg_temp.cmd('check:duas', 1)).payload->>'image' <> ('recuperar-depoimentos/' || pg_temp.loja() || '/ana.jpg') then
    raise exception 'FALHOU: parte de imagem vira dm_image com a referência'; end if;
  perform pg_temp.liberar();
  if pg_temp.pegar() is distinct from array['check:duas#0'] then raise exception 'FALHOU: parte 0 de check:duas'; end if;
  perform public.registrar_dm_falhou((pg_temp.cmd('check:duas')).command_id, 'sem_whatsapp', true, false);
  if (pg_temp.cmd('check:duas')).status <> 'failed' or (pg_temp.msg('check:duas')).status <> 'falhou'
     or (pg_temp.msg('check:duas')).error <> 'sem_whatsapp' then raise exception 'FALHOU: sem_whatsapp é falha definitiva'; end if;
  perform public.limpar_fila_dm(pg_temp.loja());
  if (pg_temp.cmd('check:duas', 1)).status <> 'canceled' or (pg_temp.msg('check:duas', 1)).error <> 'parte_anterior' then
    raise exception 'FALHOU: a parte 1 não sai sem a 0'; end if;
end $$;

-- 8) Comando de grupo no número do atendimento: cancelado com o motivo; o do número de grupos sai.
do $$ declare got uuid[]; begin
  insert into public.engine_commands (id, tenant_id, instance_id, type, payload) values
    ('d30d0000-0000-4000-8000-0000000000c1', pg_temp.loja(), pg_temp.privado(), 'send_message', '{"jid": "120363000000000001@g.us", "text": "promo"}'),
    ('d30d0000-0000-4000-8000-0000000000c2', pg_temp.loja(), 'd30d0000-0000-4000-8000-0000000000e2', 'send_message', '{"jid": "120363000000000001@g.us", "text": "promo"}');
  select array_agg(c.id) into got from app.claim_send_commands(10, pg_temp.loja()) c;
  if got is distinct from array['d30d0000-0000-4000-8000-0000000000c2']::uuid[] then
    raise exception 'FALHOU: claim de grupos pega só o comando do número de grupos, pegou %', got; end if;
  if not exists (select 1 from public.engine_commands where id = 'd30d0000-0000-4000-8000-0000000000c1' and status = 'canceled'
                   and error = 'Não enviado: o número do atendimento não posta em grupo.') then
    raise exception 'FALHOU: comando de grupo no número do atendimento é cancelado com o motivo'; end if;
end $$;

-- 9) Intervalo sorteado dentro dos limites.
do $$ begin
  if exists (select 1 from generate_series(1, 500) g
              where extract(epoch from app.dm_intervalo(true)) not between 5 and 15
                 or extract(epoch from app.dm_intervalo(false)) not between 40 and 120) then
    raise exception 'FALHOU: intervalo fora de 5–15 s (entre partes) ou 40–120 s (entre passos)'; end if;
end $$;

-- 10) O lid de uma conversa nunca é copiado para outra do mesmo número (e o registro não quebra).
do $$ begin
  perform pg_temp.dm('5511922223333', 'check:lid');
  perform pg_temp.liberar();
  if pg_temp.pegar() is distinct from array['check:lid#0'] then raise exception 'FALHOU: check:lid não saiu'; end if;
  perform public.registrar_dm_enviada((pg_temp.cmd('check:lid')).command_id, '3EB0LID', '5511922223333@s.whatsapp.net', '9990001@lid');
  if (select lid from public.private_conversations where id = (pg_temp.msg('check:lid')).conversation_id) is not null
     or (select lid from public.private_conversations where id = (pg_temp.msg('check:pix-1')).conversation_id) <> '9990001@lid' then
    raise exception 'FALHOU: lid já usado por outra conversa do número não pode ser copiado'; end if;
end $$;

select 'ok' as r;

rollback;

-- Assinatura para a baseline (só leitura): t|private_messages e as seis f| novas.
select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r
  from public.schema_signature()
 where (kind = 't' and nome = 'private_messages')
    or (kind = 'f' and (nome like 'enfileirar\_dm(%' or nome like 'claim\_dm\_commands(%' or nome like 'registrar\_dm\_%'
                        or nome like 'limpar\_fila\_dm(%' or nome like 'privado\_pausar(%'));
```

- [ ] **Step 2: Rodar o check em dev (RED)**

Run (de `apps/web`, com dev ligado): `supabase db query --linked -o json -f ../../infra/tests/envio-de-dm-check.sql`
Expected: erro no bloco 1 (`public.enfileirar_dm` não existe / `FALHOU: funções do envio de DM fora do contrato`). Erro
antes do bloco 1 é do preparo (coluna NOT NULL do PR 1a sem valor, nome diferente): ajustar o preparo ao PR 1a e rodar de
novo, até o RED cair no bloco 1.

- [ ] **Step 3: Escrever a migração** — `apps/web/supabase/migrations/20261030120000_envio_de_dm.sql`:

```sql
-- 2026-10-30 - Envio de DM pelo número do atendimento (Recuperar PR 3; comum com o Rastreio).
-- Spec: docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md §1.5, §1.6, §3 "Envio (worker)".
-- Plano: docs/superpowers/plans/2026-10-29-recuperar-yampi-03-envio-de-dm.md.
--
--   1. Trava nos dois sentidos: app.claim_send_commands cancela comando de grupo em número que não é 'grupos';
--      public.claim_dm_commands só pega DM de número 'privado' conectado, com o add-on do módulo ligado.
--   2. public.enfileirar_dm: por parte, uma private_messages (na_fila) e um comando dm_text/dm_image; idempotente.
--   3. Ritmo no claim, de uma fonte só (app.ritmo_privado), como o app.instance_caps dos grupos.
--   4. Resultado do envio: registrar_dm_enviada / registrar_dm_falhou (restrição pausa 24 h).
--   5. public.limpar_fila_dm (manutenção do worker): cancela a DM que não pode mais sair e espelha na
--      private_messages o comando que terminou sem sair. Sem trigger em engine_commands, de propósito
--      (20260730100000: trigger no fechamento do comando vira mensagem duplicada).
--
-- Muda a baseline (t|private_messages e seis f|). O gate não vê corpo de app.*, índice nem ACL: conferir com
-- infra/tests/envio-de-dm-check.sql nos dois bancos. Idempotente.

-- Trava: o corpo de app.claim_send_commands tem que ser o de 20261023120000 ou o desta migração (reaplicar passa).
do $$
declare
  v_src text;
begin
  if to_regclass('public.private_messages') is null or to_regclass('public.private_number_state') is null then
    raise exception 'envio_de_dm: aplique antes a migração do PR 1a';
  end if;
  select p.prosrc into v_src from pg_proc p where p.oid = to_regprocedure('app.claim_send_commands(integer,uuid)');
  if v_src is null then
    raise exception 'envio_de_dm: app.claim_send_commands não existe neste banco';
  end if;
  if md5(btrim(regexp_replace(regexp_replace(v_src, '--[^\n]*', '', 'g'), '\s+', ' ', 'g')))
       not in ('e129ff5b504e8e86122f5fdf53bb1955', '<md5-novo>') then
    raise exception 'envio_de_dm: o corpo de app.claim_send_commands neste banco difere do repo. Copie o pg_get_functiondef deste banco para a migração, refaça as trocas e aplique de novo.';
  end if;
end $$;

-- 1) Colunas do envio (o resto da private_messages é do PR 1a).
alter table public.private_messages
  add column if not exists sent_at       timestamptz,
  add column if not exists abre_conversa boolean not null default false,
  add column if not exists conta_no_teto boolean not null default false;

comment on column public.private_messages.sent_at is
  'Quando a Evolution aceitou o envio. O dia (de Brasília) em que a mensagem conta no ritmo.';
comment on column public.private_messages.abre_conversa is
  'Gravado no envio: parte 0, telefone que nunca escreveu e sem envio do número nos 7 dias antes. Conta no teto.';
comment on column public.private_messages.conta_no_teto is
  'Gravado no envio: o telefone não escreveu nas 24 h antes. Conta no limite de mensagens (3x o teto).';

-- 2) Índices: DMs do dia por número (o ritmo conta) e bloqueio por chave de telefone na optouts. A fila de DM por
--    número (engine_commands_dm_fila_idx) e o comando de uma mensagem (engine_commands_private_message_idx) são do 1a.
create index if not exists engine_commands_dm_instance_idx
  on public.engine_commands (instance_id, completed_at) where type in ('dm_text', 'dm_image');
create index if not exists optouts_tenant_phone_key_idx
  on public.optouts (tenant_id, (public.phone_key(phone)));

-- 3) Helpers.
-- Chave de outra parte do mesmo passo, a partir da chave gravada ("<chave do módulo>#<parte>").
create or replace function app.dm_parte(p_chave text, p_parte integer)
returns text
language sql
immutable
set search_path to 'public', 'app'
as $$ select regexp_replace(p_chave, '#\d+$', '') || '#' || p_parte $$;

-- Média de dois sorteios uniformes, como o jitter de 3–7 s do app.record_send.
create or replace function app.dm_intervalo(p_mesmo_passo boolean)
returns interval
language sql
volatile
set search_path to 'public', 'app'
as $$
  select make_interval(secs => case when p_mesmo_passo then 5 + ((random() + random()) / 2) * 10
                                    else 40 + ((random() + random()) / 2) * 80 end)
$$;

create or replace function app.modulo_privado_ligado(p_tenant uuid, p_modulo text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select coalesce((
    select case p_modulo
             when 'recuperar' then s.recuperar_enabled
             when 'rastreio'  then s.rastreio_enabled
             when 'teste'     then s.recuperar_enabled or s.rastreio_enabled
             else false
           end
      from public.tenant_settings s
     where s.tenant_id = p_tenant), false)
$$;

-- SAIR (private_optouts, dos dois módulos) e a optouts geral da loja, pela chave do telefone.
create or replace function app.telefone_bloqueado(p_tenant uuid, p_phone text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select exists (select 1 from public.private_optouts o
                  where o.tenant_id = p_tenant and o.phone_key = public.phone_key(p_phone))
      or exists (select 1 from public.optouts o
                  where o.tenant_id = p_tenant and public.phone_key(o.phone) = public.phone_key(p_phone))
$$;

-- Conversa nova (decisão 1 do plano): parte 0, telefone que nunca escreveu, nada enviado pra ele nos 7 dias antes.
create or replace function app.dm_abre_conversa(p_message uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  select m.part_index = 0
     and v.last_inbound_at is null
     and not exists (select 1 from public.private_messages o
                      where o.conversation_id = m.conversation_id
                        and o.id <> m.id
                        and o.sent_at > now() - interval '7 days')
    from public.private_messages m
    join public.private_conversations v on v.id = m.conversation_id
   where m.id = p_message
$$;

-- Ritmo do número (spec 1.5). Claim e tela leem daqui.
create or replace function app.ritmo_privado(p_instance uuid)
returns table (
  teto             integer,
  conversas_novas  integer,
  mensagens        integer,
  limite_mensagens integer,
  no_horario       boolean,
  pausado_ate      timestamptz,
  proximo_envio_em timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'app'
as $$
  with estado as (
    select coalesce(s.healthy_since, s.ramp_started_at, now()) as desde,
           coalesce(s.horario_inicio, 9) as inicio,
           coalesce(s.horario_fim, 21) as fim,
           case when s.paused_until > now() then s.paused_until end as pausado_ate,
           s.next_send_at
      from (select 1) um
      left join public.private_number_state s on s.instance_id = p_instance
  ),
  hoje as (
    select count(*) filter (where m.abre_conversa)::int as novas,
           count(*) filter (where m.conta_no_teto)::int as msgs
      from public.engine_commands c
      join public.private_messages m on m.id = c.private_message_id
     where c.instance_id = p_instance
       and c.type in ('dm_text', 'dm_image')
       and c.status = 'done'
       and c.completed_at >= date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo'
  )
  select t.teto, h.novas, h.msgs, 3 * t.teto,
         extract(hour from now() at time zone 'America/Sao_Paulo') >= e.inicio
           and extract(hour from now() at time zone 'America/Sao_Paulo') < e.fim,
         e.pausado_ate,
         e.next_send_at
    from estado e
   cross join hoje h
   -- 20 + 10 x floor(dias inteiros desde healthy_since / 3), no máximo 60 (dia inteiro como no app.instance_caps).
   -- A pausa grava healthy_since = paused_until: durante ela a conta dá negativo e o teto é 20.
   cross join lateral (
     select least(60, 20 + 10 * (greatest(0, floor(extract(epoch from now() - e.desde) / 86400))::int / 3)) as teto
   ) t
$$;

-- Pausa de proteção (spec 1.6), comum aos PRs 3 e 4: 24 h, e a rampa recomeça no fim (healthy_since = paused_until,
-- o teto volta pra 20). true = pausou agora; false = já estava pausado (não estende, uma pausa e um aviso só).
-- O aviso no sino de TODA pausa (restricao aqui; sinais e entrega no PR 4) sai daqui, só quando pausa agora: quem
-- chama não avisa. Precedente de notifications gravada pelo banco: public.avaliar_disjuntor_saidas (20261023120000).
create or replace function app.privado_pausar(p_tenant uuid, p_instance uuid, p_motivo text)
returns boolean
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_ate timestamptz;
begin
  insert into public.private_number_state as s (tenant_id, instance_id, paused_until, pause_reason, healthy_since)
  values (p_tenant, p_instance, now() + interval '24 hours', p_motivo, now() + interval '24 hours')
  on conflict (instance_id) do update
     set paused_until = excluded.paused_until, pause_reason = excluded.pause_reason, healthy_since = excluded.healthy_since
   where s.paused_until is null or s.paused_until <= now()
  returning s.paused_until into v_ate;
  if v_ate is null then
    return false;
  end if;

  -- Textos para revisão do Igor (os de sinais e entrega vieram do PR 4). Sem telefone nem texto de cliente.
  -- O link vai para os Ajustes do Recuperar; loja só com o Rastreio recebe o aviso sem link.
  insert into public.notifications (tenant_id, type, title, body, href)
  values (
    p_tenant,
    'privado_pausa',
    'Número do atendimento pausado por 24 horas',
    format(case p_motivo
             when 'sinais' then 'Três clientes pediram para sair ou recusaram as mensagens em 24 horas, sinal de denúncia. Nenhuma conversa nova sai até %s; responder quem escreveu continua liberado.'
             when 'entrega' then 'Menos de 60%% das últimas 20 mensagens foram entregues, sinal de restrição do WhatsApp. Nenhuma conversa nova sai até %s; responder quem escreveu continua liberado.'
             else 'O WhatsApp recusou um envio por limite ou restrição do número. Nenhuma conversa nova sai até %s; responder quem escreveu continua liberado.'
           end,
           to_char(v_ate at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI')),
    case when exists (select 1 from public.tenant_settings t where t.tenant_id = p_tenant and t.recuperar_enabled)
         then '/painel/recuperar/ajustes' end);
  return true;
end;
$$;

create or replace function public.privado_pausar(p_tenant uuid, p_instance uuid, p_motivo text)
returns boolean
language sql
security definer
set search_path to 'public', 'app'
as $$ select app.privado_pausar(p_tenant, p_instance, p_motivo) $$;

-- 4) Enfileirar: por parte, uma mensagem e um comando. A mesma chave devolve os mesmos ids (mesmo que hoje fosse
--    recusada: o pedido já tinha sido aceito).
create or replace function public.enfileirar_dm(p_tenant uuid, p_pedido jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_chave    text := p_pedido->>'dedupe_key';
  v_modulo   text := p_pedido->>'modulo';
  v_prior    text := p_pedido->>'prioridade';
  v_telefone text := regexp_replace(coalesce(p_pedido->>'telefone', ''), '\D', '', 'g');
  v_partes   jsonb := p_pedido->'partes';
  v_validade timestamptz := (p_pedido->>'valido_ate')::timestamptz;
  v_pessoa   uuid := (p_pedido->>'autor_user_id')::uuid;
  v_ids      uuid[];
  v_instance uuid;
  v_conversa uuid;
  v_parte    jsonb;
  v_i        integer := 0;
  v_msg      uuid;
  v_cmd      uuid;
begin
  -- Quem valida de verdade é o TypeScript (validarPedidoDeDm); aqui só o que estragaria a fila.
  if jsonb_typeof(v_partes) is distinct from 'array' then
    raise exception 'enfileirar_dm: pedido inválido' using errcode = '22023';
  end if;
  if coalesce(v_chave, '') = '' or jsonb_array_length(v_partes) not between 1 and 3
     or public.phone_key(v_telefone) is null or v_validade is null
     or v_modulo not in ('recuperar', 'rastreio', 'teste')
     or v_prior not in ('resposta', 'pix', 'pedido', 'carrinho') then
    raise exception 'enfileirar_dm: pedido inválido' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('enfileirar_dm:' || p_tenant::text || ':' || v_chave, 0));
  select array_agg(m.id order by m.part_index) into v_ids
    from public.private_messages m
   where m.tenant_id = p_tenant
     and m.dedupe_key in (v_chave || '#0', v_chave || '#1', v_chave || '#2');
  if v_ids is not null then
    return jsonb_build_object('message_ids', to_jsonb(v_ids));
  end if;

  select i.id into v_instance from public.instances i where i.tenant_id = p_tenant and i.purpose = 'privado';
  if v_instance is null then
    return jsonb_build_object('recusado', 'sem_numero');
  end if;
  if not app.modulo_privado_ligado(p_tenant, v_modulo) then
    return jsonb_build_object('recusado', 'modulo_desligado');
  end if;
  -- Só a confirmação do SAIR (PR 4: privado:sair:<conversation_id>) passa pelo bloqueio.
  if v_chave not like 'privado:sair:%' and app.telefone_bloqueado(p_tenant, v_telefone) then
    return jsonb_build_object('recusado', 'bloqueado');
  end if;

  insert into public.private_conversations (tenant_id, instance_id, phone)
  values (p_tenant, v_instance, v_telefone)
  on conflict (instance_id, phone_key) do nothing;
  select v.id into v_conversa
    from public.private_conversations v
   where v.instance_id = v_instance and v.phone_key = public.phone_key(v_telefone);

  v_ids := '{}';
  for v_parte in select e.value from jsonb_array_elements(v_partes) e loop
    insert into public.private_messages
      (tenant_id, conversation_id, module, direction, author, author_user_id, kind, text, media_ref,
       status, priority, dedupe_key, part_index, phone)
    values
      (p_tenant, v_conversa, v_modulo, 'saida',
       case when v_pessoa is null then 'automatico' else 'pessoa' end, v_pessoa,
       case when v_parte ? 'imagem' then 'imagem' else 'texto' end,
       coalesce(v_parte->>'texto', v_parte->>'legenda'), v_parte->>'imagem',
       'na_fila', v_prior, v_chave || '#' || v_i, v_i, v_telefone)
    returning id into v_msg;

    insert into public.engine_commands
      (tenant_id, instance_id, type, payload, priority, dedupe_key, private_message_id, dm_module, valid_until)
    values
      (p_tenant, v_instance,
       case when v_parte ? 'imagem' then 'dm_image' else 'dm_text' end,
       case when v_parte ? 'imagem'
            then jsonb_build_object('phone', v_telefone, 'image', v_parte->>'imagem', 'caption', v_parte->>'legenda')
            else jsonb_build_object('phone', v_telefone, 'text', v_parte->>'texto') end,
       -- A continuação vai na frente (só fica elegível depois da parte anterior); a parte 0, pela prioridade.
       case when v_i > 0 then 0
            else case v_prior when 'resposta' then 10 when 'pix' then 20 when 'pedido' then 30 else 40 end end,
       'dm:' || v_chave || '#' || v_i, v_msg, v_modulo, v_validade)
    returning id into v_cmd;

    update public.private_messages set command_id = v_cmd where id = v_msg;
    v_ids := v_ids || v_msg;
    v_i := v_i + 1;
  end loop;

  return jsonb_build_object('message_ids', to_jsonb(v_ids));
end;
$$;

-- 5) Claim de DM: no máximo uma por número, a melhor que cabe no ritmo.
create or replace function public.claim_dm_commands(p_max integer default 5, p_tenant uuid default null)
returns table (
  command_id         uuid,
  tenant_id          uuid,
  instance_id        uuid,
  type               text,
  payload            jsonb,
  dm_module          text,
  private_message_id uuid,
  jid                text
)
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
#variable_conflict use_column
begin
  return query
  with numeros as (
    -- Trava: só número do atendimento, conectado, sem DM em andamento e com o intervalo vencido.
    select i.id, r.*
      from public.instances i
     cross join lateral app.ritmo_privado(i.id) r
     where i.purpose = 'privado'
       and i.status = 'connected'
       and (p_tenant is null or i.tenant_id = p_tenant)
       and exists (select 1 from public.engine_commands q
                    where q.instance_id = i.id and q.status = 'queued' and q.type in ('dm_text', 'dm_image'))
       and not exists (select 1 from public.engine_commands p
                        where p.instance_id = i.id and p.status = 'processing' and p.type in ('dm_text', 'dm_image'))
       and coalesce(r.proximo_envio_em, now()) <= now()
  ),
  elegiveis as (
    select distinct on (c.instance_id) c.id
      from public.engine_commands c
      join numeros n on n.id = c.instance_id
      join public.private_messages m on m.id = c.private_message_id
      join public.private_conversations v on v.id = m.conversation_id
     where c.status = 'queued'
       and c.type in ('dm_text', 'dm_image')
       and c.available_at <= now()
       and c.valid_until > now()
       and m.status = 'na_fila'
       and app.modulo_privado_ligado(c.tenant_id, c.dm_module)
       and (m.dedupe_key like 'privado:sair:%' or not app.telefone_bloqueado(c.tenant_id, m.phone))
       -- Parte seguinte só depois da anterior ter saído.
       and (m.part_index = 0 or exists (
             select 1 from public.private_messages a
              where a.tenant_id = m.tenant_id
                and a.dedupe_key = app.dm_parte(m.dedupe_key, m.part_index - 1)
                and a.status in ('enviada', 'entregue', 'lida')))
       and (
         -- Quem escreveu nas últimas 24 h: só o intervalo vale.
         v.last_inbound_at > now() - interval '24 hours'
         or (n.pausado_ate is null
             and (m.part_index > 0   -- passo já começado não para no horário nem no teto
                  or (n.no_horario
                      and n.mensagens + (select count(*) from public.private_messages s
                                          where s.tenant_id = m.tenant_id
                                            and s.dedupe_key in (app.dm_parte(m.dedupe_key, 0),
                                                                 app.dm_parte(m.dedupe_key, 1),
                                                                 app.dm_parte(m.dedupe_key, 2)))
                          <= n.limite_mensagens
                      and (not coalesce(app.dm_abre_conversa(m.id), false) or n.conversas_novas < n.teto)))))
     order by c.instance_id, c.priority, c.created_at, c.id
  ),
  pegos as (
    update public.engine_commands c
       set status = 'processing',
           claimed_at = now(),
           lease_expires_at = now() + interval '2 minutes',
           updated_at = now()
     where c.id in (
       select q.id from public.engine_commands q
        where q.id in (select e.id from elegiveis e) and q.status = 'queued'
        order by q.priority, q.created_at, q.id
        limit greatest(p_max, 1)
        for update of q skip locked)
    returning c.command_id, c.tenant_id, c.instance_id, c.type, c.payload, c.dm_module, c.private_message_id
  )
  select p.command_id, p.tenant_id, p.instance_id, p.type, p.payload, p.dm_module, p.private_message_id, v.jid
    from pegos p
    join public.private_messages m on m.id = p.private_message_id
    join public.private_conversations v on v.id = m.conversation_id;
end;
$$;

-- 6) Envio aceito pela Evolution: comando done, mensagem enviada (com o que conta no teto), conversa, intervalo.
create or replace function public.registrar_dm_enviada(
  p_command_id uuid, p_provider_message_id text, p_jid text, p_lid text)
returns void
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_cmd   public.engine_commands;
  v_msg   public.private_messages;
  v_novo  boolean;
  v_conta boolean;
  v_mais  boolean;
begin
  update public.engine_commands c
     set status = 'done', completed_at = now(), lease_expires_at = null, error = null, updated_at = now()
   where c.command_id = p_command_id and c.status = 'processing'
  returning c.* into v_cmd;
  if v_cmd.id is null then
    return;  -- já fechado por outro caminho (lease vencido): não conta duas vezes
  end if;

  select m.* into v_msg from public.private_messages m where m.id = v_cmd.private_message_id;
  v_novo := coalesce(app.dm_abre_conversa(v_msg.id), false);
  select c.last_inbound_at is null or c.last_inbound_at <= now() - interval '24 hours' into v_conta
    from public.private_conversations c where c.id = v_msg.conversation_id;

  update public.private_messages m
     set status = 'enviada', provider_message_id = p_provider_message_id, sent_at = now(),
         abre_conversa = v_novo, conta_no_teto = coalesce(v_conta, true), error = null
   where m.id = v_msg.id;

  update public.private_conversations c
     set jid = coalesce(nullif(p_jid, ''), c.jid),
         first_outbound_at = coalesce(c.first_outbound_at, now()),
         last_message_at = now(),
         last_preview = left(coalesce(v_msg.text, ''), 200)
   where c.id = v_msg.conversation_id;

  -- O lid (JID inteiro, sem o :<aparelho>, que o worker já tirou) é único por número: outra conversa já com ele fica
  -- pro "vincular à cliente" do PR 4.
  if p_lid ~ '^[0-9]+@(lid|hosted\.lid)$' then
    update public.private_conversations c set lid = p_lid
     where c.id = v_msg.conversation_id and c.lid is null
       and not exists (select 1 from public.private_conversations o
                        where o.instance_id = c.instance_id and o.lid = p_lid);
  end if;

  v_mais := exists (select 1 from public.private_messages n
                     where n.tenant_id = v_msg.tenant_id
                       and n.dedupe_key = app.dm_parte(v_msg.dedupe_key, v_msg.part_index + 1)
                       and n.status = 'na_fila');
  insert into public.private_number_state as s (tenant_id, instance_id, ramp_started_at, healthy_since, next_send_at)
  values (v_cmd.tenant_id, v_cmd.instance_id, now(), now(), now() + app.dm_intervalo(v_mais))
  on conflict (instance_id) do update
     set ramp_started_at = coalesce(s.ramp_started_at, now()),
         healthy_since   = coalesce(s.healthy_since, now()),
         next_send_at    = excluded.next_send_at;
end;
$$;

-- 7) Envio que falhou: definitiva (falhou na hora) ou retentativa (complete_engine_command); restrição pausa.
create or replace function public.registrar_dm_falhou(
  p_command_id uuid, p_erro text, p_definitivo boolean, p_restricao boolean)
returns void
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_cmd public.engine_commands;
begin
  select c.* into v_cmd from public.engine_commands c
   where c.command_id = p_command_id and c.status = 'processing'
   for update;
  if v_cmd.id is null then
    return;
  end if;

  if p_restricao then
    perform app.privado_pausar(v_cmd.tenant_id, v_cmd.instance_id, 'restricao');
  end if;

  if p_definitivo then
    update public.engine_commands c
       set status = 'failed', attempts = c.attempts + 1, failed_at = now(), error = p_erro,
           lease_expires_at = null, updated_at = now()
     where c.id = v_cmd.id
    returning c.* into v_cmd;
  else
    v_cmd := app.complete_engine_command(p_command_id, false, p_erro);
  end if;

  if v_cmd.status = 'failed' then
    update public.private_messages m set status = 'falhou', error = p_erro
     where m.id = v_cmd.private_message_id and m.status = 'na_fila';
  end if;

  -- Uma tentativa também espaça o número.
  insert into public.private_number_state as s (tenant_id, instance_id, ramp_started_at, healthy_since, next_send_at)
  values (v_cmd.tenant_id, v_cmd.instance_id, now(), now(), now() + app.dm_intervalo(false))
  on conflict (instance_id) do update set next_send_at = excluded.next_send_at;
end;
$$;

-- 8) Manutenção (worker, a cada 30 s): cancela com o motivo e espelha na private_messages. Módulo desligado não é
--    motivo: o claim não pega, e a DM vence pelo valid_until (decisão 12 do plano).
create or replace function public.limpar_fila_dm(p_tenant uuid default null)
returns integer
language plpgsql
security definer
set search_path to 'public', 'app'
as $$
declare
  v_n integer;
begin
  update public.engine_commands c
     set status = 'canceled', error = x.motivo, lease_expires_at = null, updated_at = now()
    from (
      select q.id,
             case
               when q.valid_until is null or q.valid_until <= now() then 'vencida'
               when m.id is null or i.id is null or i.purpose <> 'privado' then 'trava_numero'
               when m.dedupe_key not like 'privado:sair:%' and app.telefone_bloqueado(q.tenant_id, m.phone) then 'bloqueado'
               when m.part_index > 0 and exists (
                 select 1 from public.private_messages a
                  where a.tenant_id = m.tenant_id
                    and a.dedupe_key = app.dm_parte(m.dedupe_key, m.part_index - 1)
                    and a.status in ('falhou', 'cancelada')) then 'parte_anterior'
             end as motivo
        from public.engine_commands q
        left join public.private_messages m on m.id = q.private_message_id
        left join public.instances i on i.id = q.instance_id
       where q.status = 'queued'
         and q.type in ('dm_text', 'dm_image')
         and (p_tenant is null or q.tenant_id = p_tenant)
    ) x
   where c.id = x.id and x.motivo is not null;

  -- Comando que terminou sem sair (aqui, por cancelarDms, pela retentativa esgotada, pelo encerramento da loja).
  update public.private_messages m
     set status = case when c.status = 'canceled' then 'cancelada' else 'falhou' end,
         error  = coalesce(c.error, case when c.status = 'canceled' then 'cancelada' else 'falhou' end)
    from public.engine_commands c
   where c.id = m.command_id
     and m.status = 'na_fila'
     and c.status in ('canceled', 'failed')
     and (p_tenant is null or m.tenant_id = p_tenant);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- 9) Claim de grupos: o corpo de 20261023120000 com duas trocas — (1) comando de grupo em número que não é
--    'grupos' é cancelado com o motivo, antes de tudo; (2) o candidato tem que ser de número 'grupos'.
CREATE OR REPLACE FUNCTION app.claim_send_commands(max_commands integer DEFAULT 5, p_tenant uuid DEFAULT NULL::uuid)
 RETURNS SETOF engine_commands
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app'
AS $function$
begin
  -- Trava: o numero do atendimento nunca posta em grupo. O filtro no candidato, mais abaixo, cobre o
  -- comando que chegar entre os dois comandos desta funcao.
  update public.engine_commands c
  set status = 'canceled',
      error = 'Não enviado: o número do atendimento não posta em grupo.',
      lease_expires_at = null,
      updated_at = now()
  where c.status = 'queued'
    and (p_tenant is null or c.tenant_id = p_tenant)
    and c.type in ('send_message', 'send_media', 'send_poll')
    and exists (select 1 from public.instances i
                where i.id = c.instance_id and i.purpose <> 'grupos');

  -- Envio parado na fila alem da tolerancia, num numero que nao mandou nada
  -- nesse intervalo sem o anti-ban segurando (worker/VPS fora do ar, numero
  -- desconectado), e cancelado em vez de sair atrasado. A tolerancia conta do
  -- fim da retencao (app.send_hold_ended_at): fila parada pelo teto da hora ou
  -- pela pausa de 429 espera o gate abrir e sai (incidente de 09/10/2026).
  -- O disjuntor de saidas NAO e retencao: o que chega durante ele e cancelado.
  -- reconcile_broadcast_progress fecha a oferta.
  update public.engine_commands c
  set status = 'canceled',
      error = case
        when exists (select 1 from app.exit_breaker b
                     where b.tenant_id = c.tenant_id and b.until > now())
          then 'Não enviado: o anti-ban pausou os posts porque muita gente saiu dos grupos logo depois dos últimos posts.'
        -- Teto do dia nao entra na retencao (sairia no dia seguinte): cancela, com o motivo.
        when (select count(*) from public.instance_sends x
              where x.instance_id = c.instance_id
                and x.sent_at > now() - interval '1 day')
             >= (select k.per_day from app.instance_caps(c.instance_id) k)
          then 'Não enviado: ficou parado na fila além do horário (número no teto diário do anti-ban).'
        else 'Não enviado: ficou parado na fila além do horário (servidor ou número fora do ar).'
      end,
      lease_expires_at = null,
      updated_at = now()
  where c.status = 'queued'
    and (p_tenant is null or c.tenant_id = p_tenant)
    and c.type in ('send_message', 'send_media', 'send_poll')
    and c.instance_id is not null
    and c.available_at < now() - app.missed_send_tolerance()
    -- case, e nao and: a retencao (cara) so e calculada para numero sem envio recente.
    and case
      when exists (
        select 1 from public.instance_sends x
        where x.instance_id = c.instance_id
          and x.sent_at > now() - app.missed_send_tolerance()
      ) then false
      else app.send_hold_ended_at(c.instance_id) < now() - app.missed_send_tolerance()
    end;

  return query
  update public.engine_commands c
  set
    status = 'processing',
    claimed_at = now(),
    lease_expires_at = now() + interval '2 minutes',
    updated_at = now(),
    -- Orcamento de @todos: decidido por post (origin_id + origin_run_id; o broadcast se repete
    -- no recorrente e no reenvio, o run nao). Post ja cortado segue cortado; post que ja saiu
    -- marcando segue marcando; post novo acima do orcamento sai sem marcar.
    payload = case
      when c.payload->>'mentionAll' = 'true' and (
        exists (
          select 1 from public.engine_commands x
          where x.origin_id = c.origin_id and x.id <> c.id
            and x.origin_run_id is not distinct from c.origin_run_id
            and x.payload->>'mentionAllCortado' = 'true'
        )
        or (
          not exists (
            select 1 from public.engine_commands x
            where x.origin_id = c.origin_id and x.id <> c.id
              and x.origin_run_id is not distinct from c.origin_run_id
              and x.claimed_at is not null
              and x.payload->>'mentionAll' = 'true'
          )
          and (select count(distinct (coalesce(x.origin_id, x.id), x.origin_run_id))
               from public.engine_commands x
               where x.instance_id = c.instance_id
                 and x.payload->>'mentionAll' = 'true'
                 and x.claimed_at > now() - interval '1 day'
                 and (coalesce(x.origin_id, x.id), x.origin_run_id)
                     is distinct from (coalesce(c.origin_id, c.id), c.origin_run_id))
              >= app.mention_all_daily_budget()
        )
      )
        then c.payload || jsonb_build_object('mentionAll', false, 'mentionAllCortado', true)
      else c.payload
    end
  where c.id in (
    select cand.id
    from public.engine_commands cand
    cross join lateral app.instance_caps(cand.instance_id) caps
    where cand.status = 'queued'
      and (p_tenant is null or cand.tenant_id = p_tenant)
      and cand.type in ('send_message', 'send_media', 'send_poll')
      and cand.available_at <= now()
      and cand.instance_id is not null
      and exists (
        select 1 from public.instances i
        where i.id = cand.instance_id and i.purpose = 'grupos'
      )
      and not exists (
        select 1 from app.exit_breaker b
        where b.tenant_id = cand.tenant_id and b.until > now()
      )
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
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 minute') < caps.per_min
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 hour') < caps.per_hour
      and (select count(*) from public.instance_sends x
           where x.instance_id = cand.instance_id and x.sent_at > now() - interval '1 day') < caps.per_day
      and cand.id = (
        select best.id
        from public.engine_commands best
        where best.status = 'queued'
          and (p_tenant is null or best.tenant_id = p_tenant)
          and best.type in ('send_message', 'send_media', 'send_poll')
          and best.available_at <= now()
          and best.instance_id = cand.instance_id
        order by best.priority asc, best.created_at asc, best.id asc
        limit 1
      )
    order by cand.priority asc, cand.created_at asc, cand.id asc
    limit greatest(max_commands, 1)
    for update of cand skip locked
  )
  returning c.*;
end;
$function$;

-- 10) ACL: create or replace não preserva o ACL em todo banco (20260904100000); explícito sempre.
revoke all on function app.dm_parte(text, integer) from public, anon, authenticated;
revoke all on function app.dm_intervalo(boolean) from public, anon, authenticated;
revoke all on function app.modulo_privado_ligado(uuid, text) from public, anon, authenticated;
revoke all on function app.telefone_bloqueado(uuid, text) from public, anon, authenticated;
revoke all on function app.dm_abre_conversa(uuid) from public, anon, authenticated;
revoke all on function app.ritmo_privado(uuid) from public, anon, authenticated;
revoke all on function app.privado_pausar(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.privado_pausar(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.enfileirar_dm(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.claim_dm_commands(integer, uuid) from public, anon, authenticated;
revoke all on function public.registrar_dm_enviada(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.registrar_dm_falhou(uuid, text, boolean, boolean) from public, anon, authenticated;
revoke all on function public.limpar_fila_dm(uuid) from public, anon, authenticated;
revoke all on function app.claim_send_commands(integer, uuid) from public, anon, authenticated;
grant execute on function app.dm_parte(text, integer) to service_role;
grant execute on function app.dm_intervalo(boolean) to service_role;
grant execute on function app.modulo_privado_ligado(uuid, text) to service_role;
grant execute on function app.telefone_bloqueado(uuid, text) to service_role;
grant execute on function app.dm_abre_conversa(uuid) to service_role;
grant execute on function app.ritmo_privado(uuid) to service_role;
grant execute on function app.privado_pausar(uuid, uuid, text) to service_role;
grant execute on function public.privado_pausar(uuid, uuid, text) to service_role;
grant execute on function public.enfileirar_dm(uuid, jsonb) to service_role;
grant execute on function public.claim_dm_commands(integer, uuid) to service_role;
grant execute on function public.registrar_dm_enviada(uuid, text, text, text) to service_role;
grant execute on function public.registrar_dm_falhou(uuid, text, boolean, boolean) to service_role;
grant execute on function public.limpar_fila_dm(uuid) to service_role;
grant execute on function app.claim_send_commands(integer, uuid) to service_role;
```

- [ ] **Step 4: Calcular o md5 do corpo novo e colar nos dois lugares**

Num arquivo do scratchpad, `select md5(btrim(regexp_replace(regexp_replace($corpo$<texto entre os dois $function$ da
seção 9, sem os delimitadores>$corpo$, '--[^\n]*', '', 'g'), '\s+', ' ', 'g'))) as md5;` e rodar em dev (só leitura):
`supabase db query --linked -o json -f <arquivo>` (de `apps/web`). Trocar `<md5-novo>` pelo valor na trava da migração e
no bloco 1 do check. É a mesma normalização da trava, então o valor bate com o `prosrc` depois de aplicar.
Expected: `grep -c "<md5-novo>"` nos dois arquivos = 0.

- [ ] **Step 5: Linha no fim de `deploy/supabase/apply-order.txt`**

```
# 30/10: Recuperar PR 3 - envio de DM pelo numero do atendimento: enfileirar_dm, claim_dm_commands (ritmo:
# app.ritmo_privado), registrar_dm_enviada/falhou, limpar_fila_dm, privado_pausar (avisa no sino; reusada pelo PR 4);
# app.claim_send_commands cancela comando de grupo em numero que nao e 'grupos'. Depende do PR 1a. Muda a
# baseline (t|private_messages e 6 f|). O gate nao
# ve corpo de app.*, indice nem ACL: conferir com infra/tests/envio-de-dm-check.sql nos dois bancos.
apps/web/supabase/migrations/20261030120000_envio_de_dm.sql
```

- [ ] **Step 6: Commit**

```bash
WT=$(git rev-parse --show-toplevel)
git -C "$WT" add apps/web/supabase/migrations/20261030120000_envio_de_dm.sql infra/tests/envio-de-dm-check.sql deploy/supabase/apply-order.txt
git -C "$WT" commit -m "feat(db): private DM queue, pacing claim and group/private send lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

O GREEN deste check (e o mutante do banco) fica para a Task 8, depois do `migrate-dev`. O mutante do banco não roda: seria
DDL à mão. Sem o filtro `purpose = 'grupos'` (e o cancelamento) o bloco 8 falha; sem `i.purpose = 'privado'` no claim de
DM o bloco 4 pega `check:formato` e falha.

---

### Task 3: Evolution — `whatsappNumbers` e o `key.id` do envio

**Files:**
- Modify: `apps/worker/src/evolution-sender.ts`
- Test: `apps/worker/src/evolution-sender.test.ts`

**Depends-on:** 1.

**Interfaces:**
- Consumes: nada novo.
- Produces:
  - `export type EnvioEvolution = { id: string | null; remoteJid: string | null; remoteJidAlt: string | null }`
  - `export type NumeroNoWhatsapp = { exists: boolean; jid: string | null; lid: string | null }`
  - `EvolutionSender.sendText(...)` e `sendMedia(...)` passam a devolver `Promise<EnvioEvolution>`;
    `EvolutionSender.whatsappNumbers(instanceName: string, numbers: string[]): Promise<NumeroNoWhatsapp[]>`.

- [ ] **Step 1: Escrever os testes que falham** (em `evolution-sender.test.ts`; literais iguais aos fixtures da Fase 0)

```ts
const ENVIO = { key: { remoteJid: "551187654321@s.whatsapp.net", fromMe: true, id: "3EB0C431D5F7A2B1C9E8" }, status: "PENDING" };

test("sendText devolve o key.id e o remoteJid, e não manda delay (sem 'digitando')", async () => {
  const captured: Captured[] = [];
  const sender = createEvolutionSender({ baseUrl: "https://wa.example.com", apiKey: "k",
    fetchImpl: fakeFetch(new Response(JSON.stringify(ENVIO), { status: 201 }), captured) });
  const envio = await sender.sendText("gr_atendimento", "551187654321@s.whatsapp.net", "Oi");
  assert.deepEqual(envio, { id: "3EB0C431D5F7A2B1C9E8", remoteJid: "551187654321@s.whatsapp.net", remoteJidAlt: null });
  assert.deepEqual(JSON.parse(captured[0].init.body as string), { number: "551187654321@s.whatsapp.net", text: "Oi" });
});

test("sendText: @lid que vier em key.remoteJidAlt é devolvido", async () => {
  const body = { key: { ...ENVIO.key, remoteJidAlt: "12100000000000002@lid" } };
  const sender = createEvolutionSender({ baseUrl: "https://wa.example.com", apiKey: "k",
    fetchImpl: fakeFetch(new Response(JSON.stringify(body), { status: 201 })) });
  assert.equal((await sender.sendText("gr_x", "551187654321@s.whatsapp.net", "Oi")).remoteJidAlt, "12100000000000002@lid");
});

test("sendText com corpo vazio devolve ids nulos (não quebra o envio que saiu)", async () => {
  const sender = createEvolutionSender({ baseUrl: "https://wa.example.com", apiKey: "k",
    fetchImpl: fakeFetch(new Response("", { status: 201 })) });
  assert.deepEqual(await sender.sendText("gr_x", "x", "y"), { id: null, remoteJid: null, remoteJidAlt: null });
});

test("sendMedia de imagem devolve o key.id", async () => {
  const captured: Captured[] = [];
  const sender = createEvolutionSender({ baseUrl: "https://wa.example.com", apiKey: "k",
    fetchImpl: fakeFetch(new Response(JSON.stringify(ENVIO), { status: 201 }), captured) });
  const envio = await sender.sendMedia("gr_atendimento", "551187654321@s.whatsapp.net",
    { media: "https://signed.example/ana.jpg", mediatype: "image", caption: "Ana amou" });
  assert.equal(envio.id, "3EB0C431D5F7A2B1C9E8");
  assert.deepEqual(JSON.parse(captured[0].init.body as string), { number: "551187654321@s.whatsapp.net",
    mediatype: "image", media: "https://signed.example/ana.jpg", caption: "Ana amou" });
});

test("whatsappNumbers: POST /chat/whatsappNumbers/{instance} com { numbers } e lê exists/jid", async () => {
  const captured: Captured[] = [];
  const lista = [{ jid: "551187654321@s.whatsapp.net", exists: true, number: "5511987654321", name: "Ana" }];
  const sender = createEvolutionSender({ baseUrl: "https://wa.example.com", apiKey: "k",
    fetchImpl: fakeFetch(new Response(JSON.stringify(lista), { status: 200 }), captured) });
  const r = await sender.whatsappNumbers("gr_atendimento", ["5511987654321"]);
  assert.equal(captured[0].url, "https://wa.example.com/chat/whatsappNumbers/gr_atendimento");
  assert.deepEqual(JSON.parse(captured[0].init.body as string), { numbers: ["5511987654321"] });
  assert.deepEqual(r, [{ exists: true, jid: "551187654321@s.whatsapp.net", lid: null }]);
});

test("whatsappNumbers: lid só quando vier como JID @lid (a marca 'lid' da v2.3.7 não serve)", async () => {
  const lista = [{ jid: "a@s.whatsapp.net", exists: true, number: "1", lid: "lid" },
                 { jid: "b@s.whatsapp.net", exists: true, number: "2", lid: "123@lid" }];
  const sender = createEvolutionSender({ baseUrl: "https://wa.example.com", apiKey: "k",
    fetchImpl: fakeFetch(new Response(JSON.stringify(lista), { status: 200 })) });
  assert.deepEqual((await sender.whatsappNumbers("gr_x", ["1", "2"])).map((n) => n.lid), [null, "123@lid"]);
});

test("whatsappNumbers: corpo que não é lista é erro, nunca 'sem WhatsApp'", async () => {
  const sender = createEvolutionSender({ baseUrl: "https://wa.example.com", apiKey: "k",
    fetchImpl: fakeFetch(new Response(JSON.stringify({ error: "x" }), { status: 200 })) });
  await assert.rejects(() => sender.whatsappNumbers("gr_x", ["1"]),
    (err: unknown) => err instanceof EvolutionSendError && err.status === 502);
});

test("número sem WhatsApp no envio: 400 com o exists:false no detalhe", async () => {
  const corpo = { status: 400, error: "Bad Request", response: { message: [{ jid: "5511900000000@s.whatsapp.net", exists: false, number: "5511900000000" }] } };
  const sender = createEvolutionSender({ baseUrl: "https://wa.example.com", apiKey: "k",
    fetchImpl: fakeFetch(new Response(JSON.stringify(corpo), { status: 400 })) });
  await assert.rejects(() => sender.sendText("gr_x", "5511900000000@s.whatsapp.net", "Oi"),
    (err: unknown) => err instanceof EvolutionSendError && err.status === 400 && /"exists":false/.test(err.message));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `WT=$(git rev-parse --show-toplevel); npm --prefix "$WT" --workspace apps/worker exec -- tsx --test src/evolution-sender.test.ts`
Expected: FAIL nos 8 novos (`whatsappNumbers is not a function`; `sendText` devolve `undefined`).

- [ ] **Step 3: Implementar em `apps/worker/src/evolution-sender.ts`**

- `post(path, body): Promise<unknown>` devolve o corpo lido com `response.json()`, ou `null` se não for JSON (erro e
  status continuam como hoje).
- `sendText`/`sendMedia` devolvem `envioDaResposta(corpo)`: `key.id`, `key.remoteJid`, `key.remoteJidAlt` quando forem
  string, senão `null`. Nenhum campo novo no corpo do envio (nada de `delay`). `sendAudio`/`sendPoll` não mudam.
- `whatsappNumbers` → `POST /chat/whatsappNumbers/{encodeURIComponent(instanceName)}` com `{ numbers }`; corpo que não é
  array → `throw new EvolutionSendError(502, "whatsappNumbers: resposta sem lista")`; cada item vira
  `{ exists: item.exists === true, jid: string | null, lid: string com "@" ou null }` (a marca `"lid"` da v2.3.7 vira
  `null`; quem normaliza o JID é o `lidDe` da Task 5).

- [ ] **Step 4: Rodar e ver passar** — mesmo comando. Expected: todos os testes do arquivo PASS (os 5 antigos também).

- [ ] **Step 5: Commit**

```bash
WT=$(git rev-parse --show-toplevel)
git -C "$WT" add apps/worker/src/evolution-sender.ts apps/worker/src/evolution-sender.test.ts
git -C "$WT" commit -m "feat(worker): evolution whatsappNumbers and message id from send

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Trava do lado dos grupos e `jidToNumber`

**Files:**
- Create: `apps/worker/src/instance-info.ts`, `apps/worker/src/instance-info.test.ts`
- Modify: `apps/worker/src/send-command.ts` (`SendDeps`, `jidToNumber` linhas 114–120, `sendFromCommand` linhas 172–253),
  `apps/worker/src/send-loop.ts` (linhas 17–36)
- Test: `apps/worker/src/send-command.test.ts`

**Depends-on:** 1.

**Interfaces:**
- Consumes: `instances.purpose` (PR 1a).
- Produces:
  - `export type InstanceInfo = { name: string | null; purpose: string | null }` e
    `export function createInstanceInfo(supabase: SupabaseClient): (instanceId: string) => Promise<InstanceInfo | null>`
    — uma consulta (`instances`: `provider_instance_id, purpose`, `.eq("id", …)`); guarda em cache só a instância que já
    tem nome. A Task 6 usa.
  - `SendDeps.instancePurpose(instanceId: string): Promise<string | null>`.
  - `sendFromCommand` com os motivos novos `wrong-purpose` e `not-group`.

- [ ] **Step 1: Escrever os testes que falham**

Em `send-command.test.ts`: `fakeDeps` ganha a opção `purpose?: string | null` (padrão `"grupos"`) e o método
`instancePurpose` que registra a chamada. Os testes de `sendFromCommand` que hoje mandam pra pessoa (`5511999990002@s.whatsapp.net`
em "envio OK", "falha de envio", "429…", "falha comum…", "payload ruim", "instância sem provider_instance_id", "comando sem
instance_id") passam a usar `const GROUP = "120363000000000001@g.us"`; as sequências esperadas ganham `"instancePurpose"` na
frente (ex.: `["instancePurpose", "instanceName", "sendText", "recordSend", "completeCommand"]`). O teste
"resolveSendTarget: jid @lid usa a parte antes do @" é trocado pelo primeiro abaixo.

```ts
test("resolveSendTarget: @lid nunca vira telefone (sem phone lança; com phone usa o phone)", () => {
  assert.throws(() => resolveSendTarget({ jid: "20100000000000009@lid", text: "oi" }), /jid ou payload\.phone/);
  assert.equal(resolveSendTarget({ jid: "20100000000000009@lid", phone: "5511999990002", text: "oi" }).number, "5511999990002");
});

test("número do atendimento não posta em grupo: purpose diferente de grupos fecha o comando sem enviar", async () => {
  for (const purpose of ["privado", null]) {
    const f = fakeDeps({ purpose });
    const out = await sendFromCommand(cmd({ jid: GROUP, text: "promo" }), f.deps);
    assert.equal(out.reason, "wrong-purpose");
    assert.deepEqual(f.names(), ["instancePurpose", "completeCommand"]);
    assert.equal(f.calls.find((c) => c.m === "completeCommand")!.args[1], false);
  }
});

test("número dos grupos nunca manda DM: destino que não é grupo fecha o comando sem enviar", async () => {
  for (const alvo of [{ jid: "5511999990002@s.whatsapp.net" }, { phone: "+55 (11) 99999-0002" }]) {
    const f = fakeDeps();
    const out = await sendFromCommand(cmd({ ...alvo, text: "oi" }), f.deps);
    assert.equal(out.reason, "not-group");
    assert.equal(f.calls.some((c) => c.m === "sendText" || c.m === "recordSendFailure"), false);
  }
});
```

Em `instance-info.test.ts`, um Supabase falso (molde de `housekeeping.test.ts`): `fakeInstancias(linha)` devolve
`{ supabase, consultas, select, eq }`, em que `from("instances").select(c).eq(k, v).maybeSingle()` grava `select = c`,
`eq = [k, v]`, soma 1 em `consultas` e devolve `{ data: linha, error: null }`.

```ts
test("nome e purpose numa consulta só; a instância com nome fica em cache", async () => {
  const fake = fakeInstancias({ provider_instance_id: "gr_1", purpose: "privado" });
  const info = createInstanceInfo(fake.supabase);
  assert.deepEqual(await info("i-1"), { name: "gr_1", purpose: "privado" });
  await info("i-1");
  assert.equal(fake.consultas, 1);
  assert.equal(fake.select, "provider_instance_id, purpose");
  assert.deepEqual(fake.eq, ["id", "i-1"]);
});

test("instância ainda sem nome não fica em cache (pode ser provisionada depois)", async () => {
  const fake = fakeInstancias({ provider_instance_id: null, purpose: "privado" });
  const info = createInstanceInfo(fake.supabase);
  assert.deepEqual(await info("i-1"), { name: null, purpose: "privado" });
  await info("i-1");
  assert.equal(fake.consultas, 2);
});

test("instância que não existe devolve null", async () => {
  assert.equal(await createInstanceInfo(fakeInstancias(null).supabase)("i-1"), null);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `WT=$(git rev-parse --show-toplevel); npm --prefix "$WT" --workspace apps/worker exec -- tsx --test src/send-command.test.ts src/instance-info.test.ts`
Expected: FAIL nos novos e nas sequências atualizadas (`instancePurpose` nunca chamado; módulo `instance-info` ausente).

- [ ] **Step 3: Implementar**

- `jidToNumber`: `@g.us` → o JID inteiro; `@s.whatsapp.net` → os dígitos; qualquer outro `@` (inclusive `@lid`) → `null`.
- `sendFromCommand`, nesta ordem: tipo → `instance_id` → `instancePurpose` (≠ `"grupos"` →
  `completeCommand(false, "trava: o número do atendimento não posta em grupo")`, `wrong-purpose`, sem breaker) → payload
  → destino que não termina em `@g.us` → `completeCommand(false, "trava: o número dos grupos não manda mensagem no
  privado")`, `not-group`, sem breaker → `instanceName` → envio (resto igual).
- `send-loop.ts`: `makeSendDeps` usa `createInstanceInfo(supabase)` para `instanceName` e `instancePurpose` (sai o
  `nameCache` local).

- [ ] **Step 4: Rodar e ver passar** — mesmo comando, e o arquivo inteiro do worker: `npm --prefix "$WT" --workspace apps/worker test`.
Expected: PASS.

- [ ] **Step 5: Rodar os mutantes** (um de cada vez; reverter depois de cada um)
  1. Tirar a checagem de `instancePurpose` → falha "número do atendimento não posta em grupo".
  2. Tirar a checagem de `@g.us` → falha "número dos grupos nunca manda DM".
  3. Voltar `jidToNumber` a cortar `@lid` → falha "@lid nunca vira telefone".
Expected: cada mutante derruba o seu teste; depois de reverter, tudo PASS.

- [ ] **Step 6: Commit**

```bash
WT=$(git rev-parse --show-toplevel)
git -C "$WT" add apps/worker/src/instance-info.ts apps/worker/src/instance-info.test.ts apps/worker/src/send-command.ts apps/worker/src/send-command.test.ts apps/worker/src/send-loop.ts
git -C "$WT" commit -m "fix(worker): group sender only posts to groups from a groups number; lid is never a phone

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Envio de DM no worker

**Files:**
- Create: `apps/worker/src/dm-command.ts`
- Test: `apps/worker/src/dm-command.test.ts`

**Depends-on:** 3.

**Interfaces:**
- Consumes: `EnvioEvolution`, `NumeroNoWhatsapp`, `EvolutionSendError` (Task 3); `isRateLimited`, `SendOutcome`
  (`send-command.ts`).
- Produces:
  - `export const DM_TYPES = ["dm_text", "dm_image"] as const`
  - `export type DmCommandRow = { command_id: string; tenant_id: string; instance_id: string; type: string; payload: unknown; dm_module: string | null; private_message_id: string; jid: string | null }` (a linha de `claim_dm_commands`)
  - `export type FalhaDm = { erro: string; definitivo: boolean; restricao: boolean }`
  - `export interface DmDeps { instancePurpose(instanceId: string): Promise<string | null>; moduloLigado(tenantId: string, modulo: string): Promise<boolean>; instanceName(instanceId: string): Promise<string | null>; whatsappNumber(instanceName: string, phone: string): Promise<NumeroNoWhatsapp>; sendText(instanceName: string, jid: string, text: string): Promise<EnvioEvolution>; sendImage(instanceName: string, jid: string, input: { media: string; caption?: string }): Promise<EnvioEvolution>; signedImageUrl(ref: string): Promise<string | null>; registrarEnviada(commandId: string, e: { providerMessageId: string | null; jid: string; lid: string | null }): Promise<void>; registrarFalha(commandId: string, f: FalhaDm): Promise<void> }`
  - `export function isRestricao(err: unknown): boolean` — `isRateLimited(err)` ou `EvolutionSendError` com `/\b463\b/`.
  - `export function isSemWhatsapp(err: unknown): boolean` — `EvolutionSendError` 400 com `/"exists"\s*:\s*false/`.
  - `export function imagemDaLoja(ref: string, tenantId: string): { bucket: string; path: string } | null` — `ref` =
    `<bucket>/<tenantId>/<arquivo…>`; bucket `^[a-z0-9][a-z0-9_-]*$`; nada de `..`, `\` ou `//`.
  - `export function lidDe(jid: string | null | undefined): string | null` — `^(\d+)(?::\d+)?@(lid|hosted\.lid)$` →
    `<dígitos>@<domínio>` (sem o `:<aparelho>`, como o PR 4 compara); qualquer outra coisa → `null`.
  - `export async function sendDmFromCommand(row: DmCommandRow, deps: DmDeps): Promise<SendOutcome>` — `reason` = o
    código gravado.

- [ ] **Step 1: Escrever os testes que falham** — `dm-command.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";

import { imagemDaLoja, isRestricao, isSemWhatsapp, lidDe, sendDmFromCommand, type DmCommandRow, type DmDeps, type FalhaDm } from "./dm-command.js";
import { EvolutionSendError, type EnvioEvolution, type NumeroNoWhatsapp } from "./evolution-sender.js";

const TENANT = "11111111-1111-4111-8111-111111111111";
const INSTANCE = "22222222-2222-4222-8222-222222222222";
const JID = "551187654321@s.whatsapp.net";
const IMAGEM = `recuperar-depoimentos/${TENANT}/ana.jpg`;

function fakeDmDeps(o: { purpose?: string | null; ligado?: boolean; instanceName?: string | null; numero?: NumeroNoWhatsapp;
  envio?: EnvioEvolution; sendThrows?: Error; signedUrl?: string | null; registrarThrows?: Error } = {}) {
  const calls: Array<{ m: string; args: unknown[] }> = [];
  const reg = (m: string, ...args: unknown[]) => { calls.push({ m, args }); };
  const deps: DmDeps = {
    async instancePurpose(id) { reg("instancePurpose", id); return o.purpose === undefined ? "privado" : o.purpose; },
    async moduloLigado(t, mod) { reg("moduloLigado", t, mod); return o.ligado ?? true; },
    async instanceName(id) { reg("instanceName", id); return o.instanceName === undefined ? "gr_atendimento" : o.instanceName; },
    async whatsappNumber(name, phone) { reg("whatsappNumber", name, phone); return o.numero ?? { exists: true, jid: JID, lid: null }; },
    async sendText(name, jid, text) { reg("sendText", name, jid, text); if (o.sendThrows) throw o.sendThrows; return o.envio ?? { id: "3EB0ABC", remoteJid: JID, remoteJidAlt: null }; },
    async sendImage(name, jid, input) { reg("sendImage", name, jid, input); if (o.sendThrows) throw o.sendThrows; return o.envio ?? { id: "3EB0IMG", remoteJid: JID, remoteJidAlt: null }; },
    async signedImageUrl(ref) { reg("signedImageUrl", ref); return o.signedUrl === undefined ? "https://signed.example/ana.jpg" : o.signedUrl; },
    async registrarEnviada(id, e) { reg("registrarEnviada", id, e); if (o.registrarThrows) throw o.registrarThrows; },
    async registrarFalha(id, f) { reg("registrarFalha", id, f); },
  };
  return { deps, names: () => calls.map((c) => c.m), call: (m: string) => calls.find((c) => c.m === m),
           falha: () => calls.find((c) => c.m === "registrarFalha")?.args[1] as FalhaDm | undefined };
}

const dm = (over: Partial<DmCommandRow> = {}): DmCommandRow => ({ command_id: "cmd-1", tenant_id: TENANT, instance_id: INSTANCE,
  type: "dm_text", payload: { phone: "5511987654321", text: "Oi, Ana" }, dm_module: "recuperar", private_message_id: "msg-1",
  jid: JID, ...over });

test("DM com o JID já salvo: manda pro JID inteiro e registra o key.id", async () => {
  const f = fakeDmDeps();
  assert.equal((await sendDmFromCommand(dm(), f.deps)).status, "sent");
  assert.deepEqual(f.names(), ["instancePurpose", "moduloLigado", "instanceName", "sendText", "registrarEnviada"]);
  assert.deepEqual(f.call("sendText")!.args, ["gr_atendimento", JID, "Oi, Ana"]);
  assert.deepEqual(f.call("registrarEnviada")!.args, ["cmd-1", { providerMessageId: "3EB0ABC", jid: JID, lid: null }]);
});

test("1ª mensagem pro telefone: whatsappNumbers antes, e o envio vai pro JID devolvido (9º dígito)", async () => {
  const f = fakeDmDeps({ numero: { exists: true, jid: "551187654321@s.whatsapp.net", lid: null } });
  await sendDmFromCommand(dm({ jid: null }), f.deps);
  assert.deepEqual(f.call("whatsappNumber")!.args, ["gr_atendimento", "5511987654321"]);
  assert.equal(f.call("sendText")!.args[1], "551187654321@s.whatsapp.net");
  assert.equal((f.call("registrarEnviada")!.args[1] as { jid: string }).jid, "551187654321@s.whatsapp.net");
});

test("telefone sem WhatsApp: sem_whatsapp definitivo, sem envio", async () => {
  const f = fakeDmDeps({ numero: { exists: false, jid: null, lid: null } });
  assert.equal((await sendDmFromCommand(dm({ jid: null }), f.deps)).reason, "sem_whatsapp");
  assert.deepEqual(f.falha(), { erro: "sem_whatsapp", definitivo: true, restricao: false });
  assert.equal(f.call("sendText"), undefined);
});

test("trava: DM fora do número do atendimento não sai nem consulta o WhatsApp", async () => {
  for (const purpose of ["grupos", null]) {
    const f = fakeDmDeps({ purpose });
    await sendDmFromCommand(dm({ jid: null }), f.deps);
    assert.deepEqual(f.names(), ["instancePurpose", "registrarFalha"]);
    assert.deepEqual(f.falha(), { erro: "trava_numero", definitivo: true, restricao: false });
  }
});

test("trava: add-on do módulo desligado não sai", async () => {
  const f = fakeDmDeps({ ligado: false });
  await sendDmFromCommand(dm(), f.deps);
  assert.deepEqual(f.call("moduloLigado")!.args, [TENANT, "recuperar"]);
  assert.deepEqual(f.falha(), { erro: "modulo_desligado", definitivo: true, restricao: false });
  assert.equal(f.call("sendText"), undefined);
});

test("restrição (429, rate-overlimit, 463) pausa o número e tenta de novo depois", async () => {
  for (const err of [new EvolutionSendError(429, "x"), new EvolutionSendError(500, '{"message":"rate-overlimit"}'),
                     new EvolutionSendError(500, '{"response":{"message":"Error: 463"}}')]) {
    const f = fakeDmDeps({ sendThrows: err });
    await sendDmFromCommand(dm(), f.deps);
    assert.deepEqual(f.falha(), { erro: "restricao", definitivo: false, restricao: true });
  }
});

test("400 com exists:false no envio vira sem_whatsapp definitivo", async () => {
  const f = fakeDmDeps({ sendThrows: new EvolutionSendError(400, '{"status":400,"error":"Bad Request","response":{"message":[{"jid":"5511900000000@s.whatsapp.net","exists":false,"number":"5511900000000"}]}}') });
  await sendDmFromCommand(dm(), f.deps);
  assert.deepEqual(f.falha(), { erro: "sem_whatsapp", definitivo: true, restricao: false });
});

test("falha comum: retentativa com código, sem o corpo da Evolution (que traz o telefone)", async () => {
  const f = fakeDmDeps({ sendThrows: new EvolutionSendError(500, "Connection Closed 5511987654321") });
  await sendDmFromCommand(dm(), f.deps);
  assert.deepEqual(f.falha(), { erro: "evolution_500", definitivo: false, restricao: false });
});

test("instância ainda sem nome na Evolution: retentativa (sem_instancia), sem tocar no WhatsApp", async () => {
  const f = fakeDmDeps({ instanceName: null });
  await sendDmFromCommand(dm({ jid: null }), f.deps);
  assert.deepEqual(f.falha(), { erro: "sem_instancia", definitivo: false, restricao: false });
  assert.equal(f.call("whatsappNumber"), undefined);
});

test("dm_image: assina a imagem da loja e manda como imagem com legenda", async () => {
  const f = fakeDmDeps();
  const out = await sendDmFromCommand(dm({ type: "dm_image", payload: { phone: "5511987654321", image: IMAGEM, caption: "Ana amou" } }), f.deps);
  assert.equal(out.status, "sent");
  assert.deepEqual(f.call("signedImageUrl")!.args, [IMAGEM]);
  assert.deepEqual(f.call("sendImage")!.args, ["gr_atendimento", JID, { media: "https://signed.example/ana.jpg", caption: "Ana amou" }]);
});

test("dm_image de outra loja é recusada antes de assinar; imagem que não assina tenta de novo", async () => {
  const outra = fakeDmDeps();
  await sendDmFromCommand(dm({ type: "dm_image", payload: { phone: "5511987654321", image: "recuperar-depoimentos/99999999-9999-4999-8999-999999999999/x.jpg" } }), outra.deps);
  assert.deepEqual(outra.falha(), { erro: "payload_invalido", definitivo: true, restricao: false });
  assert.equal(outra.call("signedImageUrl"), undefined);
  const sumiu = fakeDmDeps({ signedUrl: null });
  await sendDmFromCommand(dm({ type: "dm_image", payload: { phone: "5511987654321", image: IMAGEM } }), sumiu.deps);
  assert.deepEqual(sumiu.falha(), { erro: "imagem_indisponivel", definitivo: false, restricao: false });
  assert.equal(sumiu.call("sendImage"), undefined);
});

test("JID salvo que não é de pessoa é ignorado; JID devolvido que não é de pessoa não recebe", async () => {
  const salvo = fakeDmDeps();
  await sendDmFromCommand(dm({ jid: "120363000000000001@g.us" }), salvo.deps);
  assert.deepEqual(salvo.call("whatsappNumber")!.args, ["gr_atendimento", "5511987654321"]);
  const devolvido = fakeDmDeps({ numero: { exists: true, jid: "12100000000000002@lid", lid: null } });
  await sendDmFromCommand(dm({ jid: null }), devolvido.deps);
  assert.deepEqual(devolvido.falha(), { erro: "destino_invalido", definitivo: true, restricao: false });
  assert.equal(devolvido.call("sendText"), undefined);
});

test("o @lid que vier no envio vai pro registro, sem o :<aparelho>", async () => {
  const f = fakeDmDeps({ envio: { id: "3EB0ABC", remoteJid: JID, remoteJidAlt: "12100000000000002:7@lid" } });
  await sendDmFromCommand(dm(), f.deps);
  assert.deepEqual(f.call("registrarEnviada")!.args[1], { providerMessageId: "3EB0ABC", jid: JID, lid: "12100000000000002@lid" });
});

test("falha ao registrar o envio propaga (infra) e não vira falha de envio", async () => {
  const f = fakeDmDeps({ registrarThrows: new Error("db fora") });
  await assert.rejects(() => sendDmFromCommand(dm(), f.deps), /db fora/);
  assert.equal(f.call("registrarFalha"), undefined);
});

test("lidDe: JID inteiro sem o aparelho; @hosted.lid vale; telefone e marca 'lid' não", () => {
  assert.equal(lidDe("12100000000000002:15@lid"), "12100000000000002@lid");
  assert.equal(lidDe("12100000000000002@hosted.lid"), "12100000000000002@hosted.lid");
  for (const nao of ["5511987654321@s.whatsapp.net", "lid", "", null, undefined, "abc@lid"]) assert.equal(lidDe(nao), null);
});

test("isRestricao, isSemWhatsapp e imagemDaLoja", () => {
  assert.equal(isRestricao(new EvolutionSendError(500, "Error: 463")), true);
  assert.equal(isRestricao(new EvolutionSendError(500, "5511946312345")), false);
  assert.equal(isSemWhatsapp(new EvolutionSendError(400, '{"exists": false}')), true);
  assert.equal(isSemWhatsapp(new EvolutionSendError(500, '{"exists":false}')), false);
  assert.deepEqual(imagemDaLoja(IMAGEM, TENANT), { bucket: "recuperar-depoimentos", path: `${TENANT}/ana.jpg` });
  for (const ruim of [`recuperar-depoimentos/${TENANT}/../x.jpg`, `../${TENANT}/x.jpg`, `recuperar-depoimentos/${TENANT}`, `b/${TENANT}//x.jpg`]) {
    assert.equal(imagemDaLoja(ruim, TENANT), null, ruim);
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `WT=$(git rev-parse --show-toplevel); npm --prefix "$WT" --workspace apps/worker exec -- tsx --test src/dm-command.test.ts`
Expected: FAIL (`Cannot find module './dm-command.js'`).

- [ ] **Step 3: Implementar `sendDmFromCommand` em `apps/worker/src/dm-command.ts`**

Ordem fixa (cada recusa chama `registrarFalha` e devolve `{ status: "failed", reason: <erro> }`):

1. `type` fora de `DM_TYPES` → `tipo_inesperado` (definitivo).
2. `instancePurpose(instance_id) !== "privado"` → `trava_numero` (definitivo).
3. sem `dm_module` ou `!moduloLigado(tenant_id, dm_module)` → `modulo_desligado` (definitivo).
4. payload: `phone` só dígitos, 10–13; `dm_text` com `text` não vazio; `dm_image` com `imagemDaLoja(image, tenant_id)` não
   nulo (`caption` opcional) → senão `payload_invalido` (definitivo).
5. `instanceName` nulo → `sem_instancia` (retentativa).
6. Num `try` só: JID = `row.jid` se terminar em `@s.whatsapp.net`; senão `whatsappNumber(nome, phone)` — `!exists` →
   `sem_whatsapp` (definitivo); JID devolvido sem `@s.whatsapp.net` → `destino_invalido` (definitivo). Imagem:
   `signedImageUrl(image)` nulo → `imagem_indisponivel` (retentativa). Envia (`sendText` ou `sendImage`). No `catch`:
   `isSemWhatsapp` → `sem_whatsapp` (definitivo); `isRestricao` → `restricao` (retentativa, `restricao: true`); outro
   `EvolutionSendError` → `evolution_<status>`; resto → `erro_de_envio` (retentativa).
7. Fora do `try`: `registrarEnviada(command_id, { providerMessageId: envio.id, jid, lid })`, com `lid` = o primeiro
   `lidDe(…)` não nulo de `envio.remoteJid`, `envio.remoteJidAlt`, `numero.lid`, senão `null`. Erro aqui propaga (infra:
   o lease vence e o comando volta — at-least-once, como nos grupos).

Sem log aqui; nada de telefone, JID, texto ou legenda em `Error.message` criado por este módulo.

- [ ] **Step 4: Rodar e ver passar** — mesmo comando. Expected: PASS (16 testes).

- [ ] **Step 5: Rodar os mutantes** (um de cada vez; reverter)
  1. Tirar o passo 2 → falha "trava: DM fora do número do atendimento".
  2. Tirar o passo 3 → falha "trava: add-on do módulo desligado".
  3. Trocar `@s.whatsapp.net` por aceitar qualquer JID no passo 6 → falha "JID salvo que não é de pessoa…".
Expected: cada um derruba o seu teste.

- [ ] **Step 6: Commit**

```bash
WT=$(git rev-parse --show-toplevel)
git -C "$WT" add apps/worker/src/dm-command.ts apps/worker/src/dm-command.test.ts
git -C "$WT" commit -m "feat(worker): private DM send decision with number and add-on lock

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Loop de DM e manutenção

**Files:**
- Create: `apps/worker/src/dm-loop.ts`, `apps/worker/src/dm-loop.test.ts`
- Modify: `apps/worker/src/housekeeping.ts`, `apps/worker/src/housekeeping.test.ts`, `apps/worker/src/index.ts`

**Depends-on:** 3, 4, 5.

**Interfaces:**
- Consumes: `createInstanceInfo` (Task 4); `DmDeps`, `DmCommandRow`, `sendDmFromCommand` (Task 5);
  `EvolutionSender.whatsappNumbers`/`sendText`/`sendMedia` (Task 3); `createSignedUrlCache` (`signed-url-cache.ts`);
  `SendTickSummary` (`send-loop.ts`); RPCs `claim_dm_commands`, `registrar_dm_enviada`, `registrar_dm_falhou`,
  `limpar_fila_dm` (Task 2, nomes de parâmetro exatos).
- Produces: `export function makeDmDeps(supabase: SupabaseClient, sender: EvolutionSender): DmDeps`;
  `export async function runDmTick(supabase: SupabaseClient, deps: DmDeps, batchSize: number): Promise<SendTickSummary>`;
  `HousekeepingSummary.dms: number`.

- [ ] **Step 1: Escrever os testes que falham**

`dm-loop.test.ts`. Helpers do teste: `fakeSupabase({ settings?, claim? })` devolve `{ supabase, rpcs, filtros, assinadas,
settings }` — `rpc(fn, args)` grava `{ fn, args }` e devolve `claim` para `claim_dm_commands`; `from(t).select().eq(c, v)
.maybeSingle()` grava `[\`${t}.${c}\`, v]` e devolve o `settings` atual (padrão `{ recuperar_enabled: true,
rastreio_enabled: false }`); `storage.from(bucket).createSignedUrl(path, ttl)` grava `{ bucket, path, ttl }`.
`senderFalso(numeros = [])` é um `EvolutionSender` com `whatsappNumbers` devolvendo `numeros`. `linha(id)` é uma
`DmCommandRow` válida com `command_id: id`; `depsFalsos` é um `DmDeps` em que tudo dá certo, menos `registrarEnviada` de
`cmd-2`, que lança `Error("db fora")`.

```ts
test("registrarEnviada e registrarFalha usam os nomes de parâmetro das RPCs do banco", async () => {
  const fake = fakeSupabase();
  const deps = makeDmDeps(fake.supabase, senderFalso());
  await deps.registrarEnviada("cmd-1", { providerMessageId: "3EB0", jid: JID, lid: "9@lid" });
  await deps.registrarFalha("cmd-1", { erro: "restricao", definitivo: false, restricao: true });
  assert.deepEqual(fake.rpcs, [
    { fn: "registrar_dm_enviada", args: { p_command_id: "cmd-1", p_provider_message_id: "3EB0", p_jid: JID, p_lid: "9@lid" } },
    { fn: "registrar_dm_falhou", args: { p_command_id: "cmd-1", p_erro: "restricao", p_definitivo: false, p_restricao: true } },
  ]);
});

test("moduloLigado lê a tenant_settings da loja; 'teste' vale com qualquer um dos add-ons; sem linha = desligado", async () => {
  const fake = fakeSupabase({ settings: { recuperar_enabled: true, rastreio_enabled: false } });
  const deps = makeDmDeps(fake.supabase, senderFalso());
  assert.deepEqual([await deps.moduloLigado(TENANT, "recuperar"), await deps.moduloLigado(TENANT, "rastreio"),
                    await deps.moduloLigado(TENANT, "teste")], [true, false, true]);
  assert.ok(fake.filtros.every(([col, val]) => col === "tenant_settings.tenant_id" && val === TENANT));
  fake.settings = null;
  assert.equal(await deps.moduloLigado(TENANT, "recuperar"), false);
});

test("signedImageUrl assina no bucket da referência, por 1 h", async () => {
  const fake = fakeSupabase();
  const url = await makeDmDeps(fake.supabase, senderFalso()).signedImageUrl(`recuperar-depoimentos/${TENANT}/ana.jpg`);
  assert.ok(url);
  assert.deepEqual(fake.assinadas, [{ bucket: "recuperar-depoimentos", path: `${TENANT}/ana.jpg`, ttl: 3600 }]);
});

test("whatsappNumber devolve o 1º item, ou 'não existe' se a lista vier vazia", async () => {
  const achou = { exists: true, jid: JID, lid: null };
  assert.deepEqual(await makeDmDeps(fakeSupabase().supabase, senderFalso([achou])).whatsappNumber("gr_x", "5511987654321"), achou);
  assert.deepEqual(await makeDmDeps(fakeSupabase().supabase, senderFalso([])).whatsappNumber("gr_x", "5511987654321"),
    { exists: false, jid: null, lid: null });
});

test("runDmTick: claim_dm_commands com p_max e um envio por linha; erro de infra numa linha não derruba o lote", async () => {
  const fake = fakeSupabase({ claim: [linha("cmd-1"), linha("cmd-2")] });
  // deps falsos: cmd-1 envia; cmd-2 lança no registrarEnviada
  const r = await runDmTick(fake.supabase, depsFalsos, 7);
  assert.deepEqual(fake.rpcs[0], { fn: "claim_dm_commands", args: { p_max: 7 } });
  assert.deepEqual(r, { claimed: 2, sent: 1, failed: 1 });
});
```

`housekeeping.test.ts`: as listas de chamadas esperadas ganham `"limpar_fila_dm"` logo depois de
`"requeue_expired_commands"`, e os resumos esperados ganham `dms: 0`; teste novo:

```ts
test("limpar_fila_dm roda depois do requeue (lease vencido volta pra fila antes da limpeza olhar)", async () => {
  const calls: RpcCall[] = [];
  const summary = await runHousekeeping(fakeSupabase({ limpar_fila_dm: { data: 4 } }, calls));
  const nomes = calls.map((c) => c.fn);
  assert.ok(nomes.indexOf("requeue_expired_commands") < nomes.indexOf("limpar_fila_dm"));
  assert.equal(summary.dms, 4);
  assert.equal(housekeepingDidWork({ requeued: 0, dms: 1, reconciled: 0, promoted: 0, avisos: 0, pruned: 0 }), true);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `WT=$(git rev-parse --show-toplevel); npm --prefix "$WT" --workspace apps/worker exec -- tsx --test src/dm-loop.test.ts src/housekeeping.test.ts`
Expected: FAIL (`dm-loop.js` ausente; `limpar_fila_dm` nunca chamado).

- [ ] **Step 3: Implementar**

- `dm-loop.ts`, `makeDmDeps`: `createInstanceInfo(supabase)` para `instanceName`/`instancePurpose`; `moduloLigado` lê
  `tenant_settings` (`recuperar_enabled, rastreio_enabled`, `.eq("tenant_id", tenantId).maybeSingle()`) com a mesma regra de
  `app.modulo_privado_ligado` (`teste` = qualquer um); `whatsappNumber` = 1º item de `sender.whatsappNumbers(nome, [phone])`
  ou `{ exists: false, jid: null, lid: null }`; `sendText` = `sender.sendText(nome, jid, text)`; `sendImage` =
  `sender.sendMedia(nome, jid, { media, mediatype: "image", caption })`; `signedImageUrl` = `createSignedUrlCache` com
  `supabase.storage.from(bucket).createSignedUrl(path, ttl)`, `bucket`/`path` cortados no primeiro `/` (erro → `null` +
  `log.warn("falha ao assinar imagem de DM", { error })`); RPCs com os parâmetros do teste; erro de RPC → `throw`.
- `runDmTick`: espelho de `runSendTick` — `rpc("claim_dm_commands", { p_max: batchSize })`, `Promise.allSettled` de
  `sendDmFromCommand`, log só com `command_id` e `reason` (`"comando de DM falhou"` / `"DM falhou (infra)"`).
- `housekeeping.ts`: `const dms = await rpcInt(supabase, "limpar_fila_dm", {})` logo depois do requeue; `dms` no resumo e em
  `housekeepingDidWork`.
- `index.ts`: `buildDmDeps(env, supabase): DmDeps | null` — sem Evolution → `log.warn("DM desligada: EVOLUTION_API_URL/EVOLUTION_API_KEY ausentes")`
  e `null`; `!env.sendEnabled` → `log.warn("DM desligada: só sai com WORKER_SEND_ENABLED=true; a fila vence sozinha")` e
  `null`; senão `makeDmDeps(supabase, createEvolutionSender(...))`. Loop `"dm"` com `env.sendPollMs` e
  `env.sendBatchSize`, `onError: falhou("ciclo de DM")`, log `"ciclo de DM"` quando `claimed > 0`; `dm: "on" | "off"` no
  log `"worker iniciado"`; `dm?.done` no `Promise.all` final.

- [ ] **Step 4: Rodar e ver passar** — o worker inteiro e o tipo:

Run: `WT=$(git rev-parse --show-toplevel); npm --prefix "$WT" --workspace apps/worker test && npm --prefix "$WT" --workspace apps/worker exec -- tsc --noEmit`
Expected: PASS e `tsc` sem erro.

- [ ] **Step 5: Commit**

```bash
WT=$(git rev-parse --show-toplevel)
git -C "$WT" add apps/worker/src/dm-loop.ts apps/worker/src/dm-loop.test.ts apps/worker/src/housekeeping.ts apps/worker/src/housekeeping.test.ts apps/worker/src/index.ts
git -C "$WT" commit -m "feat(worker): private DM loop and queue cleanup in housekeeping

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: `lib/privado/dm.ts`

**Files:**
- Create: `apps/web/src/lib/privado/dm.ts`
- Test: `apps/web/src/lib/privado/dm.test.ts`

**Depends-on:** 1.

**Interfaces:**
- Consumes: `numeroDoAtendimento` e `NumeroDoAtendimento` de `./numero` (PR 2b); `normalizeWhatsappBR` de
  `@/lib/pages/phone`; `getSupabaseAdmin` de `@/lib/supabase/server`; RPC `enfileirar_dm` (Task 2, chaves de `p_pedido`).
- Produces: exatamente o "Contrato comum" do índice (`ModuloPrivado`, `PrioridadeDm`, `StatusDm`, `ParteDm`, `AutorDm`,
  `PedidoDeDm`, `ResultadoDm`, `numeroDoAtendimento` reexportado, `enfileirarDm`, `statusDosDms`, `cancelarDms`) e mais
  `export function validarPedidoDeDm(pedido: PedidoDeDm, agora?: Date): PedidoDeDm` — devolve uma cópia com `telefone` em
  `55` + DDD + número; lança `Error("pedido de DM inválido: <campo>")`. O prefixo `privado:sair:` na `dedupeKey` é só da
  confirmação do SAIR (PR 4): é o único que o banco deixa passar por telefone bloqueado.

- [ ] **Step 1: Escrever os testes que falham** — `dm.test.ts`, com o PostgREST falso de `lib/billing/encerrar-loja.test.ts`
(servidor `http` em `127.0.0.1:0` que guarda método, caminho, `URL` e corpo JSON) e o env de `lib/stores/leads.test.ts`
(`SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` no `before()`):

```ts
const LOJA = "11111111-1111-4111-8111-111111111111";
const base: PedidoDeDm = { tenantId: LOJA, modulo: "rastreio", telefone: "(11) 98765-4321", partes: [{ texto: "Seu pedido saiu" }],
  prioridade: "pedido", validoAte: new Date(Date.now() + 86_400_000), dedupeKey: "rastreio:aviso-1:0" };
const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select"));

test("validarPedidoDeDm: telefone com máscara e sem 55 vira 55+DDD+número", () => {
  assert.equal(validarPedidoDeDm(base).telefone, "5511987654321");
});

test("validarPedidoDeDm: recusa o que não pode sair", () => {
  const casos: Array<[string, Partial<PedidoDeDm>]> = [
    ["sem partes", { partes: [] }], ["4 partes", { partes: [{ texto: "a" }, { texto: "b" }, { texto: "c" }, { texto: "d" }] }],
    ["texto vazio", { partes: [{ texto: "   " }] }], ["texto longo", { partes: [{ texto: "x".repeat(4097) }] }],
    ["imagem de outra loja", { partes: [{ imagem: "recuperar-depoimentos/99999999-9999-4999-8999-999999999999/a.jpg" }] }],
    ["imagem com ..", { partes: [{ imagem: `recuperar-depoimentos/${LOJA}/../a.jpg` }] }],
    ["legenda longa", { partes: [{ imagem: `recuperar-depoimentos/${LOJA}/a.jpg`, legenda: "x".repeat(1025) }] }],
    ["telefone curto", { telefone: "98765432" }], ["vencido", { validoAte: new Date(Date.now() - 1000) }],
    ["sem chave", { dedupeKey: "" }], ["chave longa", { dedupeKey: "k".repeat(201) }],
    ["pessoa sem id", { autor: { tipo: "pessoa", userId: "x" } }],
  ];
  for (const [nome, over] of casos) assert.throws(() => validarPedidoDeDm({ ...base, ...over }), /pedido de DM inválido/, nome);
});

test("enfileirarDm: uma RPC enfileirar_dm com o pedido em snake_case, e devolve os ids", async () => {
  pedidos.length = 0;
  responder = () => ({ status: 200, corpo: { message_ids: ["m1"] } });
  assert.deepEqual(await enfileirarDm(base), { messageIds: ["m1"] });
  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].metodo, "POST");
  assert.equal(pedidos[0].caminho, "/rest/v1/rpc/enfileirar_dm");
  assert.deepEqual(pedidos[0].corpo, { p_tenant: LOJA, p_pedido: { modulo: "rastreio", telefone: "5511987654321",
    partes: [{ texto: "Seu pedido saiu" }], prioridade: "pedido", valido_ate: base.validoAte.toISOString(),
    dedupe_key: "rastreio:aviso-1:0", autor_user_id: null } });
});

test("enfileirarDm: recusa do banco volta como recusado; pedido inválido não chega no banco", async () => {
  responder = () => ({ status: 200, corpo: { recusado: "bloqueado" } });
  assert.deepEqual(await enfileirarDm(base), { recusado: "bloqueado" });
  pedidos.length = 0;
  await assert.rejects(() => enfileirarDm({ ...base, partes: [] }), /pedido de DM inválido/);
  assert.equal(pedidos.length, 0);
});

test("statusDosDms: lê só as mensagens da loja e devolve o status e o código do erro", async () => {
  pedidos.length = 0;
  responder = () => ({ status: 200, corpo: [{ id: "m1", status: "enviada", error: null },
    { id: "m2", status: "cancelada", error: "vencida" }] });
  assert.deepEqual(await statusDosDms(LOJA, ["m1", "m2"]), {
    m1: { status: "enviada", erro: null }, m2: { status: "cancelada", erro: "vencida" } });
  assert.equal(pedidos[0].caminho, "/rest/v1/private_messages");
  assert.equal(pedidos[0].url.searchParams.get("select"), "id,status,error");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: `eq.${LOJA}`, id: "in.(m1,m2)" });
});

test("cancelarDms: cancela o comando na fila e depois a mensagem, só da loja", async () => {
  pedidos.length = 0;
  responder = (p) => p.caminho.endsWith("/engine_commands")
    ? { status: 200, corpo: [{ private_message_id: "m1" }] } : { status: 200, corpo: [{ id: "m1" }] };
  assert.equal(await cancelarDms(LOJA, ["m1", "m2"]), 1);
  assert.deepEqual([pedidos[0].metodo, pedidos[0].caminho], ["PATCH", "/rest/v1/engine_commands"]);
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: `eq.${LOJA}`, private_message_id: "in.(m1,m2)", status: "eq.queued" });
  assert.deepEqual(pedidos[0].corpo, { status: "canceled", error: "cancelada" });
  assert.deepEqual([pedidos[1].metodo, pedidos[1].caminho], ["PATCH", "/rest/v1/private_messages"]);
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: `eq.${LOJA}`, id: "in.(m1)", status: "eq.na_fila" });
  assert.deepEqual(pedidos[1].corpo, { status: "cancelada", error: "cancelada" });
});

test("statusDosDms e cancelarDms com lista vazia não consultam o banco", async () => {
  pedidos.length = 0;
  assert.deepEqual(await statusDosDms(LOJA, []), {});
  assert.equal(await cancelarDms(LOJA, []), 0);
  assert.equal(pedidos.length, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `WT=$(git rev-parse --show-toplevel); npm --prefix "$WT" --workspace apps/web exec -- tsx --import ./src/test/server-only-shim.mjs --test src/lib/privado/dm.test.ts`
Expected: FAIL (`Cannot find module './dm'`).

- [ ] **Step 3: Implementar `apps/web/src/lib/privado/dm.ts`**

- `import "server-only"`; tipos do contrato copiados do índice; `export { numeroDoAtendimento } from "./numero"` e
  `export type { NumeroDoAtendimento } from "./numero"`.
- `validarPedidoDeDm` com zod (já é dependência do web): `tenantId` UUID; `modulo` e `prioridade` nas uniões do contrato;
  telefone por `normalizeWhatsappBR` (nulo → inválido; guarda sem o `+`); `partes` 1–3, cada uma `{ texto }` (1–4096
  depois do `trim`) ou `{ imagem, legenda? }` (imagem = `<bucket>/<tenantId>/<arquivo>`, mesma regra do `imagemDaLoja` do
  worker; legenda até 1024); `validoAte` depois de `agora`; `dedupeKey` 1–200; `autor.userId` UUID quando `pessoa`.
- `enfileirarDm`: valida, chama `rpc("enfileirar_dm", { p_tenant, p_pedido })` com `autor_user_id` = `userId` ou `null`;
  `{ message_ids }` → `{ messageIds }`, `{ recusado }` → `{ recusado }`; erro do banco ou corpo sem um dos dois → `throw`.
- `statusDosDms`: lista vazia → `{}`; senão `from("private_messages").select("id,status,error").eq("tenant_id", …).in("id", ids)`
  → `{ [id]: { status, erro: error } }` (o código da tabela da Task 2; nulo enquanto não falhou nem foi cancelada).
  Id que não é da loja não aparece no resultado.
- `cancelarDms`: lista vazia → `0`; 1º `from("engine_commands").update({ status: "canceled", error: "cancelada" })`
  `.eq("tenant_id", …).in("private_message_id", ids).eq("status", "queued").select("private_message_id")` (o que já está
  `processing` está saindo e não é cancelado); 2º, com os ids devolvidos, `from("private_messages").update({ status:
  "cancelada", error: "cancelada" }).eq("tenant_id", …).in("id", …).eq("status", "na_fila").select("id")`; devolve quantas
  mensagens mudaram. Se o 2º falhar, lança — o `limpar_fila_dm` espelha em até 30 s.
- `ponytail:` comentário nos `in(...)`: ids inteiros na URL; virar RPC se um módulo passar centenas.

- [ ] **Step 4: Rodar e ver passar** — mesmo comando, e os tipos do web:

Run: `npm --prefix "$WT" --workspace apps/web exec -- tsc --noEmit --project tsconfig.json`
Expected: PASS (7 testes) e `tsc` sem erro.

- [ ] **Step 5: Mutante** — tirar o `.eq("tenant_id", …)` de `cancelarDms` (o 1º update) → o teste "cancelarDms" falha.
Reverter.

- [ ] **Step 6: Commit**

```bash
WT=$(git rev-parse --show-toplevel)
git -C "$WT" add apps/web/src/lib/privado/dm.ts apps/web/src/lib/privado/dm.test.ts
git -C "$WT" commit -m "feat(privado): enqueue, status and cancel API for private DMs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: No ar em dev, revisão e merge

**Files:**
- Modify: `deploy/supabase/schema-baseline.json`

**Depends-on:** 2, 3, 4, 5, 6, 7.

**Interfaces:**
- Consumes: tudo acima.
- Produces: PR mergeado, migração em prod, worker com o loop `dm`.

- [ ] **Step 1: Suítes e tipos**

Run: `WT=$(git rev-parse --show-toplevel); npm --prefix "$WT" --workspace apps/worker test && npm --prefix "$WT" --workspace apps/worker exec -- tsc --noEmit && npm --prefix "$WT" --workspace apps/web test && npm --prefix "$WT" --workspace apps/web exec -- tsc --noEmit --project tsconfig.json && npm --prefix "$WT" --workspace apps/web exec -- tsc --noEmit --project tsconfig.e2e.json && npm --prefix "$WT" --workspace apps/web run lint`
Expected: tudo verde.

- [ ] **Step 2: Gate do CI local** (PowerShell): `Set-Location <WT>; & .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"`
Expected: `EXIT=0`.

- [ ] **Step 3: Push e PR.** Corpo do PR (arquivo no scratchpad, `gh pr create --body-file`): **O que muda** (as 12 decisões
  deste plano em uma linha cada), **Fase 0 e base conferidas** (resultado da Task 1: E1–E8, nomes do PR 1a/PR 2b, corpo do
  claim), **Como foi verificado** (suítes, mutantes TS rodados, check em dev), **Depois do merge** (`migrate-prod`, check em
  prod, redeploy do worker), e a linha `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Se o classificador
  negar o push ou o `gh pr create`, entregar os dois comandos ao Igor e seguir quando o PR existir.

- [ ] **Step 4: GREEN do banco.** Esperar o `migrate-dev` verde e rodar o check em dev (de `apps/web`):
`supabase db query --linked -o json -f ../../infra/tests/envio-de-dm-check.sql`
Expected: `r = "ok"` e, depois do `rollback`, o JSON da assinatura (7 chaves: `t|private_messages` e 6 `f|`).

- [ ] **Step 5: Baseline.** Juntar essas 7 chaves em `deploy/supabase/schema-baseline.json` (só elas; script Node que lê,
  atualiza e grava com a mesma ordenação do arquivo), commit `chore(db): schema baseline for private DM send` (com o
  `Co-Authored-By`), push. Expected: job `drift` verde. Se o `drift` acusar objeto de outro PR aberto com migração, é o
  efeito colateral conhecido: mergear aquele primeiro e `git merge origin/main` aqui.

- [ ] **Step 6: Revisão.** Agentes **Code Reviewer** e **Security Engineer** em paralelo, sobre `git diff origin/main...HEAD`,
  com o foco: trava nos dois sentidos (claim e sender), telefone/texto/código Pix fora de log, idempotência do
  `enfileirar_dm`, ACL das funções novas, at-least-once no registro do envio, filtro de loja em `dm.ts`. Corrigir CRITICAL e
  HIGH (commit por correção), suítes de novo.

- [ ] **Step 7: Merge.** `gh pr checks <N>` todo verde → `gh pr merge <N> --squash --delete-branch`. Depois do
  `migrate-prod`, rodar o check em prod (link em `nidoatbxaylrkcgbszns`, entre 8h e 21h59 de Brasília) → `r = "ok"`; se o
  classificador barrar, o comando vai pro Igor.

- [ ] **Step 8: Worker.** Pedir ao Igor o redeploy do worker no Coolify e conferir no log `"worker iniciado"` com
  `dm: "on"` (com `WORKER_SEND_ENABLED=true`). Até alguma loja ter número do atendimento conectado, o loop não pega nada.

- [ ] **Step 9: Quadro (prod).** `select public.move_card('recuperar-yampi', 'em_construcao', 'PR 3 (envio de DM) em main: #<N>', 'PR #<N>');`
  e o `blocker` do card reescrito para "falta o PR 4 (resposta 1:1 e status)".

- [ ] **Step 10: Encerrar.** Reportar "PRs que deixei abertos: …" (ou "nenhum") e sugerir ao Igor, em PowerShell:
  `rag insert "decisão: ritmo do número do atendimento mora em app.ritmo_privado (teto 20→60, 3x mensagens, 40–120 s, horário, pausa 24 h); conversa nova na base = parte 0 sem resposta e sem envio em 7 dias" --source decisao-2026-10-30`.
