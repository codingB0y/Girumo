# Recuperar (Yampi) — PR 4 · Resposta 1:1 e status (comum) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O webhook da Evolution passa a ouvir o número do atendimento (`instances.purpose = 'privado'`): guarda a resposta 1:1 da cliente na conversa certa, aplica o SAIR, conta os sinais de proteção, pausa o número quando precisa, grava entregue/lida pelo `key.id` e chama um ponto de extensão por módulo, que o PR 7 completa.

**Architecture:** Um ramo novo no `POST /api/webhooks/evolution`, antes do `applyFlashOfferComment`, entrega todo evento da instância `privado` (menos `connection.update`) a `processarEventoDoAtendimento`. O TypeScript valida e lê o payload (`lerMensagemDoAtendimento`), classifica o texto (`classificarResposta`) e decide o que guardar conforme os módulos ligados. O banco faz numa transação só o que não pode ficar pela metade: `privado_registrar_mensagem` (achar ou criar a conversa, gravar a mensagem com dedupe, opt-out, sinal e pausa), `privado_registrar_status` (status que só anda pra frente e taxa de entrega) e `privado_vincular_conversa`. O resto (cancelar DMs, confirmar o SAIR, consumidores dos módulos, sino) roda depois e é idempotente: a reentrega da Evolution completa o que faltou.

**Tech Stack:** Next 15 (route handlers, `runtime = "nodejs"`), TypeScript strict, Zod 4, Supabase/Postgres (RPC `security definer`, migração pelo CI), `node:test` via `tsx` com PostgREST falso e deps falsas, SQL de conferência em `infra/tests/`.

**Spec:** `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` — 1.4 (quando para), 1.6 (pausa de proteção), §3 "Resposta da cliente (webhook da Evolution)" e "Base do privado", §6 (segurança e LGPD), §8.2 (prova do WhatsApp). Contrato comum: `docs/superpowers/plans/2026-10-29-recuperar-yampi-00-indice.md`.

**Depende de:** 1a (tabelas `private_*`, `instances.purpose`, flags), 2a e 2b (número do atendimento), 3 (`enfileirarDm`, `cancelarDms`, `app.privado_pausar`, `provider_message_id` e `private_conversations.lid` gravados no envio), 5a (`requireRecuperar`, `ROTAS.recuperar`, `rotas-guardadas.test.ts`; as rotas `/painel/recuperar/*` são as da decisão 6 do plano 5) e a prova 2 da Fase 0 (resultado em `docs/superpowers/plans/_recuperar-fase-0-resultado.md`). A Tarefa 1 confere tudo antes de qualquer código.

**Comandos usados abaixo** (PowerShell 5.1: um por linha, sem `&&`; da raiz do worktree):
`T` = `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test` (caminhos relativos a `apps/web`) ·
`TSC` = `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json` (e de novo com `tsconfig.e2e.json`) ·
`LINT` = `npm --workspace apps/web run lint`.

## Decisões deste plano (o que o contrato não fixava)

1. **Transação no banco.** Uma RPC por mensagem grava a mensagem (âncora de dedupe `dedupe_key = 'evo:' || key.id`) junto com a conversa, o opt-out, o sinal e a pausa. Se o SAIR fosse gravado num passo separado depois da âncora, uma falha no meio faria a reentrega ver a mensagem como "já vista" e o SAIR se perderia. Descartado: várias chamadas PostgREST (sem `unread + 1` atômico; e o `on_conflict` do PostgREST não acha índice único parcial).
2. **Depois da transação, só passo idempotente.** Cancelar os DMs pendentes, enfileirar a confirmação (mesma `dedupeKey`) e chamar os consumidores rodam também na reentrega; só o sino da resposta fica restrito à primeira entrega. Erro em qualquer passo sobe e vira 500, e a Evolution reentrega.
3. **Conversa sem telefone.** Resposta só com `@lid`, sem conversa que case, cria conversa com `phone` nulo ("número não identificado"). Coluna nova `private_conversations.sair_pendente_at` guarda o SAIR dela até alguém vincular. Quando uma mensagem posterior traz o par lid + telefone, a mesma função do vínculo identifica ou mescla sozinha.
4. **Pausa.** Pela `app.privado_pausar` do PR 3 (a única porta da pausa): grava `paused_until = now() + 24 h` e `healthy_since = paused_until` — é o "volta pra 20" que o PR 3 lê — e avisa no sino quando pausa agora, para qualquer motivo; este PR só chama, com `sinais` e `entrega`. A pausa por taxa de entrega também dura 24 h e também avisa no sino (a spec só diz "imediata").
5. **Quando a taxa de entrega é avaliada.** A cada `messages.update` de mensagem nossa (todo envio gera ao menos `SERVER_ACK`, suposição E4), contando só mensagem que saiu depois de `healthy_since`. Assim a mesma amostra ruim não pausa de novo quando a pausa acaba.
6. **Fora do `engine_events`.** Nada do número do atendimento entra lá, nem `messages.update`: é dado pessoal, sem consumidor, numa tabela sem retenção. O `connection.update` continua indo, como hoje.
7. **Ponto de extensão** = registro `CONSUMIDORES_DE_RESPOSTA` (molde do `CONSUMIDORES` do PR 6), vazio neste PR. O PR 7 acrescenta a entrada do Recuperar (caso vira `respondeu`/`nao_quer`, passos cancelados).
8. **"Vincular à cliente"** recebe o telefone do caso que a pessoa escolheu: `POST /api/recuperar/conversas/[id]/vincular`. Fica sob `/api/recuperar/` para cair no `rotas-guardadas.test.ts` do PR 5 e no `ROTAS.recuperar` da vendedora. Só o Recuperar tem a tela Conversas.
9. **A confirmação do SAIR atravessa o bloqueio** por exceção na barreira do PR 3: DM cuja `dedupe_key` começa com `privado:sair:` sai mesmo com o telefone em `private_optouts` (conferido na Tarefa 1, S11).
10. **`direction`** = `entrada` / `saida` (fixado no índice e no CHECK do 1a; S5 confere). Mensagem recebida grava `status = 'entregue'`; mensagem do celular do chip, `'enviada'`.

## Global Constraints

Do índice (restrições globais):

- TypeScript strict, imports com `@/`, arquivos em `kebab-case`, sem `any` sem justificativa. Nomes de domínio seguem o código (em português, como `reconciliarConexoes`).
- Store com service-role filtra `.eq('tenant_id', …)` sempre: o RLS não protege esse caminho.
- Migração: arquivo novo em `apps/web/supabase/migrations/` + linha no fim de `deploy/supabase/apply-order.txt`; o CI aplica em dev no PR e em prod no merge; baseline com `npm run schema:baseline` (credencial de dev) no mesmo PR; idempotente (`if not exists`); `security definer` sempre com `set search_path`; RLS ligado; policy no padrão `auth.uid()` + `memberships` (`app.has_membership`, `app.user_tenant_ids`), nunca GUC. Nunca DDL à mão.
- Função nova: conferir `has_function_privilege` de `anon`, `authenticated` e `public` (o event trigger `ensure_anon_revoked` cobre `anon`/`public`; `authenticated` nasce com EXECUTE pelo default privilege).
- `hubflow-engine/DECISIONS.md` é vinculante: nada de "digitando", marcar como lida, texto girado, troca de aparelho, proxy.
- O número dos grupos nunca manda DM; o número do atendimento nunca posta em grupo (trava com teste mutante).
- Tipos: rodar os dois `tsc` (web e worker); lint e `tsx --test` não checam tipo.
- Antes do push: `verify-local.ps1` (secrets + build).
- Texto de tela em português do Brasil, design G2 (fonte base 14 px; 12 px só em contador; verde ácido só em Postar/AO VIVO/LOTOU).
- Commit com prefixo semântico em inglês e a linha `Co-Authored-By` do assistente (abaixo vai a desta sessão; a sessão de execução usa a que receber).

Deste PR (valores da spec):

- SAIR = palavra sozinha, sem diferença de caixa ou acento: `sair`, `parar`, `stop`, `cancelar`, `descadastrar`. Efeito (1.4): entra em `private_optouts`, para todo DM pendente pra esse telefone (Recuperar e Rastreio), 1 mensagem de confirmação, conta como sinal.
- Recusa (1.6, lista em código, com teste): "não pedi", "quem é", "não conheço", "spam", "denunciar", "para de mandar", "engano". Conta como sinal.
- 3 sinais em 24 h pausam o número inteiro por 24 h e avisam no sino. Taxa de entrega abaixo de 60% nas últimas 20 mensagens com mais de 1 h: pausa imediata. Ao sair da pausa o teto volta pra 20 (a pausa só grava `healthy_since`; quem lê é o PR 3).
- Loja sem o Recuperar (só o Rastreio, ou nenhum dos dois): não guarda texto nem prévia, não move a conversa pra "Precisa de você", não soma não lida, não avisa resposta no sino. `last_inbound_at`, SAIR, sinais e pausa valem igual.
- Texto da cliente até 4096 caracteres; `last_preview` até 200; nome do perfil até 80. O CHECK do 1a recusa `text` acima de 4096 e `last_preview` acima de 200 (a mensagem inteira cairia, com o SAIR junto): `lerMensagemDoAtendimento` corta antes de gravar (`TEXTO_MAX`, `PREVIEW_MAX`, Tarefa 3) e a RPC grava `left(…, 4096)` / `left(…, 200)` por defesa (Tarefa 8).
- Nunca em log, em mensagem de erro ou no sino: texto da cliente, telefone, LID, nome completo do perfil. Erro do PostgREST sobe só com `error.message` (o `details` traz `Failing row contains (…)` com os valores).
- Repositório público: fixtures e testes só com dados inventados (telefone `5511987650001`, LID `100000000000777@lid`, nome "Ana Teste", número do chip `5511900000000`).
- Textos para revisão do Igor (marcar no PR): `TEXTO_CONFIRMACAO_SAIR` e os títulos e corpos do sino (Tarefa 5). Os corpos do aviso de pausa (sinais, entrega e restrição) moram na `app.privado_pausar` do PR 3.

## Review Focus

1. **Evolution reentregando ou entregando fora de ordem** (o mesmo `messages.upsert` duas vezes; `READ` antes de `DELIVERY_ACK`): nada soma duas vezes, o sino não repete e o status nunca volta. Testes: blocos 2 e 13 do check (Tarefa 8); "reentrega não avisa de novo…" e "reentrega do SAIR refaz…" (Tarefa 5).
2. **SAIR escrito como a cliente escreve** ("Sair!", " sáir ", "DESCADASTRAR 👍"): vale. "quero sair" não é SAIR e vira resposta pra uma pessoa ler. Testes: Tarefa 2.
3. **Tráfego que não é conversa 1:1 chegando no número do atendimento** (o chip adicionado num grupo, `status@broadcast`, canal `@newsletter`, `groups.upsert`, reação, edição): nada gravado, nenhum `groups` criado, nada em `engine_events`. Testes: "não é conversa 1:1…" e "reação, edição…" (Tarefa 3); "grupo, groups.upsert e status@broadcast…" (Tarefa 6).
4. **Resposta que chega só com `@lid`**, e depois a mesma pessoa aparece com telefone, ou alguém vincula: vira uma conversa só e o SAIR pendente passa a valer. Testes: blocos 4 a 8 do check (Tarefa 8); "vincular que aplica SAIR…" e "SAIR pendente aplicado na identificação automática…" (Tarefa 5).
5. **Pausa por taxa de entrega que se repete sozinha**: ao fim das 24 h, as mesmas 20 mensagens ruins não pausam de novo. Teste: bloco 14 do check (Tarefa 8).

## Mapa de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `apps/web/src/lib/evolution/__fixtures__/*.privado-*.json` (5) | capturas da prova 2 da Fase 0, anonimizadas | 1 |
| `apps/web/src/lib/privado/resposta/fase0-suposicoes.test.ts` | trava das suposições E1–E5 sobre as capturas | 1 |
| `apps/web/src/lib/privado/resposta/classificar.ts` | SAIR, recusa ou resposta | 2 |
| `apps/web/src/lib/privado/resposta/mensagem.ts` | ler o `messages.upsert` 1:1 (remetente, conteúdo) e o status do `messages.update` | 3 |
| `apps/web/src/lib/stores/privado-respostas.ts` | flags dos módulos, RPCs, DMs pendentes, sino | 4 |
| `apps/web/src/lib/privado/resposta/sino.ts` | textos do sino | 5 |
| `apps/web/src/lib/privado/resposta/consumidores.ts` | ponto de extensão por módulo (vazio) | 5 |
| `apps/web/src/lib/privado/resposta/processar.ts` | orquestra resposta, SAIR, status e vínculo | 5 |
| `apps/web/src/app/api/webhooks/evolution/route.ts` (mod) | ramo do número do atendimento | 6 |
| `apps/web/src/app/api/recuperar/conversas/[id]/vincular/route.ts` | API "vincular à cliente" | 7 |
| `apps/web/src/lib/auth/modulos.ts` (mod) | a vendedora com o Recuperar alcança o vincular | 7 |
| `apps/web/supabase/migrations/20261030140000_privado_resposta.sql` | coluna, três funções, ACL | 8 |
| `infra/tests/privado-resposta-check.sql` | conferência da migração nos dois bancos | 8 |

---

### Task 1: Worktree, base e conferência da Fase 0 (PARAR se contradisser)

**Files:**
- Modify: `apps/web/src/lib/evolution/__fixtures__/messages-upsert.privado-resposta.json`, `messages-upsert.privado-celular.json`, `messages-upsert.privado-imagem.json`, `messages-update.privado-entregue.json`, `messages-update.privado-lida.json` (mesma pasta; a Fase 0 já as grava com estes nomes, com os valores falsos dela — Tarefa 11 do plano da Fase 0)
- Create: `apps/web/src/lib/privado/resposta/fase0-suposicoes.test.ts`
- Modify: `apps/web/src/lib/evolution/webhook-schema.test.ts` (lista `ALL_FIXTURES`)
- Ler: o resultado da Fase 0, `docs/superpowers/plans/_recuperar-fase-0-resultado.md` (linhas W5, W6, W8, W11–W14, W16 e W18, a seção 3 com o `CASO_DA_FASE_0` e a seção 8), as migrações do 1a e do 3, `apps/web/src/lib/privado/*`, `apps/web/src/lib/recuperar/access.ts`

**Depends-on:** none

**Interfaces:**
- Consumes: PRs 1a, 2a, 2b, 3 e 5a em `main` e aplicados em dev; as capturas da prova 2 e o resultado escrito da Fase 0.
- Produces: as cinco fixtures com os valores da tabela do Step 3 (as Tarefas 3, 5 e 6 leem); `CASO_DA_FASE_0` (`"A"`, `"B"` ou `"C"`) registrado no PR e no topo de `mensagem.ts` (Tarefa 3); S1–S17 conferidas.

- [ ] **Step 1: Worktree novo a partir de `origin/main`** (nunca `checkout -b` no principal); conferir antes que o `node_modules` do principal não está vazio.

```powershell
git -C C:\Users\Igor\Desktop\HubFlow-platform fetch origin main
git -C C:\Users\Igor\Desktop\HubFlow-platform worktree add -b feat/privado-resposta C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\privado-resposta origin/main
cmd /c mklink /J "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\privado-resposta\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\node_modules"
cmd /c mklink /J "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\privado-resposta\apps\web\node_modules" "C:\Users\Igor\Desktop\HubFlow-platform\apps\web\node_modules"
```

Daqui em diante tudo roda neste worktree. Ao apagá-lo, desarmar as junctions antes (`[System.IO.Directory]::Delete(<junction>, $false)`).

- [ ] **Step 2: Ler o resultado da Fase 0 (`docs/superpowers/plans/_recuperar-fase-0-resultado.md`) e preencher a tabela** (vai na descrição do PR, seção "Fase 0"). As linhas citam a fonte da Evolution na tag `2.3.7` (`src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts`), lida em 29/10.

| # | O que este plano supõe | Se a Fase 0 mostrou outra coisa |
|---|---|---|
| E1 | A resposta 1:1 chega em `messages.upsert` num destes casos. **A:** `data.key.remoteJid` em `@s.whatsapp.net` (a 2.3.7 troca o `@lid` pelo `remoteJidAlt` antes de mandar o webhook, L1478). **B:** igual a A, mais `key.remoteJidAlt` em `@lid`. **C:** só `@lid`, sem telefone ao lado, e o PR 3 aprende o `lid` no envio (`whatsappNumbers` ou resposta do envio) | Nenhum caminho determinístico entre resposta e telefone → **PARAR**: é o no-go da spec §8 ("o automático não liga; volta pro Igor") |
| E2 | Texto em `data.message.conversation` (a Evolution converte `extendedTextMessage`, `prepareMessage` L4677); legenda em `imageMessage.caption`; áudio em `audioMessage` | **PARAR** (a Tarefa 3 lê isso) |
| E3 | `messages.update` da mensagem enviada: `data.keyId` igual ao `key.id` devolvido no envio (o que o PR 3 grava em `provider_message_id`), `data.fromMe = true`, `data.status` = `DELIVERY_ACK` ou `READ` (`PLAYED` em áudio) | **PARAR** (a pausa por entrega de 1.6 depende disso) |
| E4 | Cada envio gera pelo menos um `messages.update` (`SERVER_ACK`): é ele que dispara a conta da taxa de entrega mesmo quando nenhum recibo chega | Seguir; anotar no PR e avisar o coordenador: com zero recibos a taxa nunca seria avaliada, e a avaliação precisa de outro gatilho (claim do PR 3 ou cron) |
| E5 | Mensagem mandada pela API não volta como `messages.upsert` (`emitOwnEvents: false`, L658); mensagem digitada no celular do chip volta com `key.fromMe = true` | Seguir: a RPC ignora o eco cujo `key.id` já é de mensagem da Girumo; anotar |

Anotar também qual caso (A, B ou C) a prova mostrou: é o `CASO_DA_FASE_0`.

- [ ] **Step 3: Ajustar as cinco fixtures que a Fase 0 gravou** (já redigidas, com os valores falsos dela: chip `5511999990001`, B `5511999990002`, C `5511999990003`), mantendo todas as chaves e a forma, e trocando pelos valores deste plano (repositório público): `apikey` → `"REMOVIDO"`; `server_url` → `"https://evo.example.com"`; `destination` removido; `instance` → `"gr_privado-teste"`; `sender` → `"5511900000000@s.whatsapp.net"`; telefone da cliente → `5511987650001` em todo JID ou campo onde aparecer; LID da cliente → `100000000000777@lid`; `pushName` da cliente → `"Ana Teste"`; `base64`, `jpegThumbnail` e URLs de mídia removidos. Se a Fase 0 já gravou a mesma captura nesta pasta com outro nome, `git mv` para o nome daqui.

| Fixture | Campos fixos |
|---|---|
| `messages-upsert.privado-resposta.json` | `data.key.id` `"3EB0AAAA0000000000000001"`, `fromMe` `false`, `remoteJid`/`remoteJidAlt` como a prova mostrou (com os valores trocados), `message.conversation` `"Oi, ainda tenho interesse"`, `messageTimestamp` `1793278991` |
| `messages-upsert.privado-celular.json` | `key.id` `"3A00000000000000000000C1"`, `fromMe` `true`, `message.conversation` `"Oi Ana, aqui é a Bia da loja"`, `messageTimestamp` `1793279051` |
| `messages-upsert.privado-imagem.json` | `key.id` `"3EB0AAAA0000000000000002"`, `fromMe` `false`, `message.imageMessage.caption` `"essa aqui"`, `messageTimestamp` `1793279111` |
| `messages-update.privado-entregue.json` | `data.keyId` `"3EB0BBBB0000000000000010"`, `fromMe` `true`, `status` `"DELIVERY_ACK"` |
| `messages-update.privado-lida.json` | igual, com `status` `"READ"` |

- [ ] **Step 4: Write the test** `apps/web/src/lib/privado/resposta/fase0-suposicoes.test.ts`. Helpers do arquivo, sem `any`: `const DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "evolution", "__fixtures__")`; `ler(nome): unknown` = `JSON.parse(readFileSync(join(DIR, \`${nome}.json\`), "utf8"))`; `campo(v: unknown, ...caminho: string[]): unknown` desce pelo caminho (`undefined` se algum degrau não for objeto). `CASO_DA_FASE_0` é constante deste arquivo, com o valor do Step 2.

```ts
const CASO_DA_FASE_0: "A" | "B" | "C" = "A"; // trocar pelo caso que a prova 2 mostrou
const FIXTURES = ["messages-upsert.privado-resposta", "messages-upsert.privado-celular", "messages-upsert.privado-imagem",
  "messages-update.privado-entregue", "messages-update.privado-lida"];

test("E1 a resposta 1:1 chega no formato do caso da Fase 0", () => {
  const r = ler("messages-upsert.privado-resposta");
  assert.equal(campo(r, "data", "key", "fromMe"), false);
  if (CASO_DA_FASE_0 === "C") assert.equal(campo(r, "data", "key", "remoteJid"), "100000000000777@lid");
  else assert.equal(campo(r, "data", "key", "remoteJid"), "5511987650001@s.whatsapp.net");
  if (CASO_DA_FASE_0 === "B") assert.equal(campo(r, "data", "key", "remoteJidAlt"), "100000000000777@lid");
});
test("E2 texto em message.conversation e legenda em imageMessage.caption", () => {
  assert.equal(campo(ler("messages-upsert.privado-resposta"), "data", "message", "conversation"), "Oi, ainda tenho interesse");
  assert.equal(campo(ler("messages-upsert.privado-imagem"), "data", "message", "imageMessage", "caption"), "essa aqui");
});
test("E3 o status da mensagem enviada vem com keyId, fromMe true e DELIVERY_ACK/READ", () => {
  for (const [nome, status] of [["messages-update.privado-entregue", "DELIVERY_ACK"], ["messages-update.privado-lida", "READ"]]) {
    const r = ler(nome);
    assert.deepEqual([campo(r, "data", "keyId"), campo(r, "data", "fromMe"), campo(r, "data", "status")],
      ["3EB0BBBB0000000000000010", true, status]);
  }
});
test("E5 o que é digitado no celular do chip chega com fromMe true", () => {
  assert.equal(campo(ler("messages-upsert.privado-celular"), "data", "key", "fromMe"), true);
});
test("fixtures sem dado pessoal (repositório público)", () => {
  for (const nome of FIXTURES) {
    const texto = readFileSync(join(DIR, `${nome}.json`), "utf8");
    for (const tel of texto.match(/55\d{10,11}/g) ?? []) assert.ok(["5511987650001", "5511900000000"].includes(tel), `${nome}: ${tel}`);
    for (const lid of texto.match(/\d+@lid/g) ?? []) assert.equal(lid, "100000000000777@lid", nome);
    assert.equal(/"apikey"\s*:\s*"(?!REMOVIDO")/.test(texto), false, `${nome}: apikey`);
  }
});
```

Em `webhook-schema.test.ts`, acrescentar os cinco nomes (sem `.json`) a `ALL_FIXTURES`: o teste "every real fixture parses" passa a provar que o schema de hoje aceita a resposta real.

- [ ] **Step 5: Run**

Run: `T src/lib/privado/resposta/fase0-suposicoes.test.ts src/lib/evolution/webhook-schema.test.ts`
Expected: PASS (`# fail 0`). Falha em E1, E2 ou E3 → **PARAR** (o plano supõe outro payload). Falha em "every real fixture parses" → **PARAR**: o schema de hoje recusaria a resposta real com 400, e mexer nele muda também o caminho dos grupos (decisão do coordenador).

- [ ] **Step 6: Conferir o schema do 1a em dev** (de `apps\web`, com o projeto de dev ligado: `npx supabase link --project-ref wfjuwogxaupyadwhvoxy --yes`; depois `npx supabase db query --linked -o json -f <arquivo>` com o SQL abaixo salvo no scratchpad).

```sql
select c.table_name, c.column_name, c.is_nullable, c.column_default, c.generation_expression
  from information_schema.columns c
 where c.table_schema = 'public'
   and c.table_name in ('private_conversations','private_messages','private_signals','private_optouts','private_number_state')
 order by c.table_name, c.ordinal_position;

select conrelid::regclass::text as tabela, contype::text as tipo, pg_get_constraintdef(oid) as def
  from pg_constraint
 where conrelid::regclass::text in ('private_conversations','private_messages','private_signals','private_optouts','private_number_state')
   and contype in ('c', 'u', 'p')
union all
select tablename, 'i', indexdef
  from pg_indexes
 where schemaname = 'public'
   and tablename in ('private_conversations','private_messages','private_signals','private_optouts','private_number_state')
 order by 1, 2;

select n.nspname || '.' || p.proname as funcao
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where p.proname like 'privado\_%';
```

| # | Esperado | Se não |
|---|---|---|
| S1 | `private_conversations.phone`, `jid` e `lid` aceitam nulo; `phone_key` gerada de `public.phone_key(phone)`; `unread` com default `0` | **PARAR** (a conversa "número não identificado" não cabe) |
| S2 | único em `private_conversations (instance_id, lid)` e em `(instance_id, phone_key)` | **PARAR** (o casamento supõe uma conversa por número + telefone) |
| S3 | CHECK de `private_conversations.status` com `precisa_de_voce`, `aberta`, `encerrada` | **PARAR** |
| S4 | `private_messages.text`, `phone`, `provider_message_id` e `command_id` aceitam nulo; único em `(tenant_id, dedupe_key)` (parcial serve); CHECKs aceitam `author` `cliente` e `celular`, `kind` `texto`/`imagem`/`audio`/`outro`, `status` `entregue` e `enviada` | **PARAR** |
| S5 | CHECK de `private_messages.direction`: anotar os dois valores | este plano grava `entrada`/`saida`; se o CHECK usar outros, trocar só esses dois literais na RPC da Tarefa 8 (o TypeScript não grava `direction`) |
| S6 | índice em `private_messages` que comece por `provider_message_id` ou por `(tenant_id, provider_message_id)` | se existir, a Tarefa 8 não cria o dela |
| S7 | `private_signals.kind` aceita `sair` e `recusa` (ou não tem CHECK); `message_ref` (nas duas tabelas) é `uuid` ou `text`; `private_optouts.message_ref` aceita nulo (o SAIR aplicado no vínculo não aponta mensagem) | **PARAR** |
| S8 | `private_number_state`: PK ou único em `instance_id`; toda coluna NOT NULL além de `tenant_id` e `instance_id` tem default; `pause_reason` aceita `sinais` e `entrega` (ou não tem CHECK) | **PARAR** |
| S9 | entre as funções `privado_*`, só `app.privado_pausar(uuid, uuid, text)` e `public.privado_pausar(uuid, uuid, text)`, do PR 3 (com o aviso no sino) | outra `privado_*` → **PARAR** (alguém já fez; ler antes de duplicar); sem a `privado_pausar` → **PARAR** (o PR 3 não entrou) |

- [ ] **Step 7: Conferir o código dos PRs 2a, 2b, 3 e 5a em `main`**

```powershell
git grep -n "export async function enfileirarDm\|export async function cancelarDms" origin/main -- apps/web/src/lib/privado
git grep -n "privado:sair:" origin/main -- apps/web/src apps/worker/src apps/web/supabase/migrations
git grep -n "conversation_id" origin/main -- apps/web/src/lib/privado/dm.ts
git grep -n "lid" origin/main -- apps/web/src/lib/privado apps/worker/src
git grep -n "healthy_since" origin/main -- apps/web/src apps/worker/src apps/web/supabase/migrations
git grep -n "export async function requireRecuperar" origin/main -- apps/web/src/lib/recuperar/access.ts
git grep -n "purpose" origin/main -- apps/web/src/lib/stores/instances.ts
git log origin/main --oneline -- apps/web/src/app/api/webhooks/evolution/route.ts
```

| # | Esperado | Se não |
|---|---|---|
| S10 | `enfileirarDm(pedido: PedidoDeDm): Promise<ResultadoDm>` e `cancelarDms(tenantId: string, messageIds: string[]): Promise<number>`, como no índice | **PARAR** |
| S11 | a barreira de bloqueio do PR 3 (no `enfileirarDm` e no claim do worker) deixa passar DM cuja `dedupe_key` começa com `privado:sair:` | **PARAR e levar ao coordenador**: sem essa exceção a confirmação do SAIR (spec 1.4) nunca sai |
| S12 | `enfileirarDm` grava `private_messages.conversation_id` já ao enfileirar | **PARAR** (o SAIR cancela os pendentes por conversa) |
| S13 | o PR 3 grava `private_conversations.lid` como o JID inteiro (`<dígitos>@lid`) | **PARAR** (o casamento por lid compara o texto) |
| S14 | o teto do PR 3 conta a rampa a partir de `healthy_since` | seguir; anotar no PR e avisar o coordenador (a pausa daqui grava `healthy_since = paused_until`) |
| S15 | `requireRecuperar(req: Request): Promise<TenantContext>` | **PARAR** |
| S16 | `Instance` em `lib/stores/instances.ts` tem `purpose` e `LIST_COLUMNS` lê `purpose` | se não tiver, a Tarefa 6 acrescenta |
| S17 | nenhum commit da série já desvia evento da instância `privado` no webhook | se desviar, juntar no ramo da Tarefa 6 em vez de duplicar |

- [ ] **Step 8: Commit**

```powershell
git add apps/web/src/lib/evolution/__fixtures__ apps/web/src/lib/evolution/webhook-schema.test.ts apps/web/src/lib/privado/resposta/fase0-suposicoes.test.ts
git commit -m "test(privado): Fase 0 captures for 1:1 replies and delivery status" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: SAIR, recusa ou resposta

**Files:**
- Create: `apps/web/src/lib/privado/resposta/classificar.ts`
- Test: `apps/web/src/lib/privado/resposta/classificar.test.ts`

**Depends-on:** 1

**Interfaces:**
- Consumes: `normalizeKeyword(value: string): string` e `matchesKeyword(text: string | null | undefined, keyword: string): boolean` de `@/lib/relampago/keyword` (reuso: minúscula, sem acento, pontuação e emoji viram separador).
- Produces:

```ts
export type TipoDeResposta = "sair" | "recusa" | "resposta";
export const PALAVRAS_SAIR: readonly string[];
export const FRASES_RECUSA: readonly string[];
export function classificarResposta(texto: string | null): TipoDeResposta;
```

- [ ] **Step 1: Write the failing test**

```ts
test("as listas são exatamente as da spec (1.4 e 1.6)", () => {
  assert.deepEqual(PALAVRAS_SAIR, ["sair", "parar", "stop", "cancelar", "descadastrar"]);
  assert.deepEqual(FRASES_RECUSA, ["não pedi", "quem é", "não conheço", "spam", "denunciar", "para de mandar", "engano"]);
});
test("SAIR e sinônimos sozinhos, em qualquer caixa e com acento ou pontuação, são sair", () => {
  for (const t of ["SAIR", "sair", "Sair!", "  sáir  ", "PARAR", "Stop", "cancelar.", "DESCADASTRAR 👍", "Sair\n"]) {
    assert.equal(classificarResposta(t), "sair", t);
  }
});
test("a palavra no meio de uma frase não é SAIR", () => {
  for (const t of ["quero sair", "sair do grupo", "stop it", "pode parar de mandar?"]) assert.notEqual(classificarResposta(t), "sair", t);
});
test("as recusas da lista viram recusa, em qualquer posição", () => {
  for (const t of ["Não pedi isso", "quem é?", "Quem é você", "nao conheco essa loja", "isso é SPAM", "spam", "vou denunciar", "Para de mandar mensagem", "foi engano"]) {
    assert.equal(classificarResposta(t), "recusa", t);
  }
});
test("o resto é resposta, inclusive sem texto e palavra parecida", () => {
  for (const t of ["Oi, ainda tem o vestido?", "sim", "parabéns", "quero sair", "", null]) assert.equal(classificarResposta(t), "resposta", String(t));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `T src/lib/privado/resposta/classificar.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND`: `./classificar` não existe).

- [ ] **Step 3: Implement `classificarResposta` em `classificar.ts`**: SAIR quando `PALAVRAS_SAIR.includes(normalizeKeyword(texto))` (a mensagem inteira, normalizada, é uma das palavras); senão recusa quando alguma frase de `FRASES_RECUSA` casa com `matchesKeyword(texto, frase)` (fronteira de palavra); senão `"resposta"`. Texto nulo ou vazio → `"resposta"`. Sem `server-only` (puro).

- [ ] **Step 4: Run to verify it passes**

Run: `T src/lib/privado/resposta/classificar.test.ts`
Expected: PASS (`# fail 0`).

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/privado/resposta/classificar.ts apps/web/src/lib/privado/resposta/classificar.test.ts
git commit -m "feat(privado): classify SAIR and refusal replies" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ler a mensagem 1:1 e o status de entrega

**Files:**
- Create: `apps/web/src/lib/privado/resposta/mensagem.ts`
- Test: `apps/web/src/lib/privado/resposta/mensagem.test.ts`

**Depends-on:** 1

**Interfaces:**
- Consumes: as fixtures da Tarefa 1.
- Produces:

```ts
export const TEXTO_MAX = 4096;
export const PREVIEW_MAX = 200;
export const NOME_MAX = 80;
export type KindDaMensagem = "texto" | "imagem" | "audio" | "outro";
export type MensagemDoAtendimento = {
  providerMessageId: string;   // key.id
  deMim: boolean;              // key.fromMe === true (celular do chip)
  telefone: string | null;     // só dígitos
  lid: string | null;          // "<dígitos>@lid" ou "<dígitos>@hosted.lid"
  jid: string | null;          // remoteJid quando é @s.whatsapp.net (sem o ":<aparelho>")
  nome: string | null;         // pushName aparado, até NOME_MAX; sempre null quando deMim
  kind: KindDaMensagem;
  texto: string | null;        // até TEXTO_MAX
  enviadaEm: Date;             // messageTimestamp (segundos) ou, sem ele, a chegada
};
export function lerMensagemDoAtendimento(data: unknown, chegouEm: Date): MensagemDoAtendimento | null;
export function statusDaEntrega(status: string): "entregue" | "lida" | null;
export function previewDaMensagem(m: Pick<MensagemDoAtendimento, "kind" | "texto">): string;
```

Regras (é aqui que mora "casar a resposta"; marcar no topo do arquivo, num comentário de uma linha, o caso que a Fase 0 confirmou e a data):

- **Validação** (fronteira de confiança): `z.looseObject` com `key.remoteJid` e `key.id` obrigatórios (`min(1)`); campo opcional que vier com tipo errado conta como ausente (`.catch(undefined)` no Zod 4), nunca derruba a mensagem. Falhou o obrigatório → `null`.
- **Só conversa 1:1:** o domínio do `remoteJid` (depois do `@`) tem de ser `s.whatsapp.net`, `lid` ou `hosted.lid`. Qualquer outro (`g.us`, `broadcast`, `newsletter`) → `null`.
- **Telefone:** o primeiro dos três, nesta ordem, que for `<8 a 15 dígitos>[:<aparelho>]@s.whatsapp.net` ou só 8 a 15 dígitos: `key.remoteJid` (caso A/B, a fonte que a 2.3.7 entrega), `key.remoteJidAlt`, `key.senderPn` (Baileys 6; mantido por defesa).
- **Lid:** o primeiro de `key.remoteJid`, `key.remoteJidAlt` que for `<dígitos>[:<aparelho>]@lid` ou `@hosted.lid`, sem o `:<aparelho>`. Caso C: o lid é a única ligação, e casa com o `private_conversations.lid` que o PR 3 aprendeu.
- **Conteúdo**, nesta ordem, no `message`: `conversation` ou `extendedTextMessage.text` não vazio → `texto`; `imageMessage` → `imagem`, `texto` = `caption` (ou `null`); `audioMessage` → `audio`, `texto` `null`; `videoMessage`, `documentMessage`, `stickerMessage`, `ptvMessage`, `contactMessage`, `contactsArrayMessage`, `locationMessage`, `liveLocationMessage` → `outro`, `texto` `null`. Qualquer outra coisa (reação, edição, `protocolMessage`, voto de enquete, `message` nulo) → `null`.
- **Hora:** `messageTimestamp` número ou texto numérico positivo → `new Date(segundos * 1000)`; senão `chegouEm`.
- `statusDaEntrega`: `DELIVERY_ACK` → `entregue`; `READ` e `PLAYED` → `lida`; qualquer outro (`SERVER_ACK`, `PENDING`, `ERROR`) → `null`.
- `previewDaMensagem`: `texto` cortado em `PREVIEW_MAX`; sem texto: `imagem` → `"[foto]"`, `audio` → `"[áudio]"`, os outros → `"[mensagem]"`.

- [ ] **Step 1: Write the failing test.** Helpers: `dataDe(nome): Record<string, unknown>` lê a fixture de `../../evolution/__fixtures__` (como na Tarefa 1) e devolve uma cópia (`structuredClone`) do `data`, com cast local para `{ data: Record<string, unknown> }`; `comChave(nome, chave)` = `dataDe(nome)` com `key` trocada por `{ ...key, ...chave }`; `pick(m)` = `{ kind: m.kind, texto: m.texto }`. `CHEGOU = new Date("2026-10-29T15:00:00Z")`.

```ts
test("a resposta real da Fase 0 é lida com id, nome, texto e hora", () => {
  const m = lerMensagemDoAtendimento(dataDe("messages-upsert.privado-resposta"), CHEGOU)!;
  assert.equal(m.providerMessageId, "3EB0AAAA0000000000000001");
  assert.equal(m.deMim, false);
  assert.equal(m.nome, "Ana Teste");
  assert.equal(m.kind, "texto");
  assert.equal(m.texto, "Oi, ainda tenho interesse");
  assert.equal(m.enviadaEm.getTime(), 1793278991 * 1000);
  assert.ok(m.telefone !== null || m.lid !== null);
});
test("caso A: telefone no remoteJid", () => {
  const m = lerMensagemDoAtendimento(comChave("messages-upsert.privado-resposta", { remoteJid: "5511987650001@s.whatsapp.net", remoteJidAlt: undefined }), CHEGOU)!;
  assert.deepEqual([m.telefone, m.lid, m.jid], ["5511987650001", null, "5511987650001@s.whatsapp.net"]);
});
test("caso B: telefone no remoteJid e lid no remoteJidAlt", () => {
  const m = lerMensagemDoAtendimento(comChave("messages-upsert.privado-resposta", { remoteJid: "5511987650001@s.whatsapp.net", remoteJidAlt: "100000000000777@lid" }), CHEGOU)!;
  assert.deepEqual([m.telefone, m.lid, m.jid], ["5511987650001", "100000000000777@lid", "5511987650001@s.whatsapp.net"]);
});
test("caso C: só o lid", () => {
  const m = lerMensagemDoAtendimento(comChave("messages-upsert.privado-resposta", { remoteJid: "100000000000777@lid", remoteJidAlt: undefined }), CHEGOU)!;
  assert.deepEqual([m.telefone, m.lid, m.jid], [null, "100000000000777@lid", null]);
});
test("@lid com o telefone ao lado (remoteJidAlt ou senderPn, JID ou só dígitos)", () => {
  for (const aoLado of [{ remoteJidAlt: "5511987650001@s.whatsapp.net" }, { senderPn: "5511987650001@s.whatsapp.net" }, { senderPn: "5511987650001" }]) {
    const m = lerMensagemDoAtendimento(comChave("messages-upsert.privado-resposta", { remoteJid: "100000000000777@lid", ...aoLado }), CHEGOU)!;
    assert.deepEqual([m.telefone, m.lid, m.jid], ["5511987650001", "100000000000777@lid", null], JSON.stringify(aoLado));
  }
});
test("aparelho no JID e hosted.lid", () => {
  assert.equal(lerMensagemDoAtendimento(comChave("messages-upsert.privado-resposta", { remoteJid: "5511987650001:12@s.whatsapp.net" }), CHEGOU)!.telefone, "5511987650001");
  assert.equal(lerMensagemDoAtendimento(comChave("messages-upsert.privado-resposta", { remoteJid: "100000000000777@hosted.lid", remoteJidAlt: undefined }), CHEGOU)!.lid, "100000000000777@hosted.lid");
});
test("não é conversa 1:1: grupo, status e canal devolvem null", () => {
  for (const remoteJid of ["120363000000000000@g.us", "status@broadcast", "120363000000000000@newsletter"]) {
    assert.equal(lerMensagemDoAtendimento(comChave("messages-upsert.privado-resposta", { remoteJid }), CHEGOU), null, remoteJid);
  }
});
test("campo opcional com tipo errado conta como ausente", () => {
  const m = lerMensagemDoAtendimento(comChave("messages-upsert.privado-resposta", { remoteJid: "5511987650001@s.whatsapp.net", remoteJidAlt: 12345 }), CHEGOU)!;
  assert.equal(m.telefone, "5511987650001");
});
test("mensagem do celular do chip: deMim e sem nome", () => {
  const m = lerMensagemDoAtendimento(dataDe("messages-upsert.privado-celular"), CHEGOU)!;
  assert.deepEqual([m.deMim, m.nome, m.texto], [true, null, "Oi Ana, aqui é a Bia da loja"]);
});
test("imagem com e sem legenda, áudio e o que vira outro", () => {
  const imagem = dataDe("messages-upsert.privado-imagem");
  assert.deepEqual(pick(lerMensagemDoAtendimento(imagem, CHEGOU)!), { kind: "imagem", texto: "essa aqui" });
  assert.deepEqual(pick(lerMensagemDoAtendimento({ ...imagem, message: { imageMessage: {} } }, CHEGOU)!), { kind: "imagem", texto: null });
  assert.deepEqual(pick(lerMensagemDoAtendimento({ ...imagem, message: { audioMessage: {} } }, CHEGOU)!), { kind: "audio", texto: null });
  for (const k of ["videoMessage", "documentMessage", "stickerMessage", "locationMessage"]) {
    assert.deepEqual(pick(lerMensagemDoAtendimento({ ...imagem, message: { [k]: {} } }, CHEGOU)!), { kind: "outro", texto: null }, k);
  }
  assert.equal(lerMensagemDoAtendimento({ ...imagem, message: { extendedTextMessage: { text: "oi" } } }, CHEGOU)!.texto, "oi");
});
test("reação, edição, mensagem sem conteúdo e texto vazio devolvem null", () => {
  const base = dataDe("messages-upsert.privado-resposta");
  for (const message of [{ reactionMessage: { text: "👍" } }, { protocolMessage: {} }, null, { conversation: "   " }]) {
    assert.equal(lerMensagemDoAtendimento({ ...base, message }, CHEGOU), null, JSON.stringify(message));
  }
});
test("cortes: texto em 4096, nome em 80 e aparado", () => {
  const base = dataDe("messages-upsert.privado-resposta");
  assert.equal(lerMensagemDoAtendimento({ ...base, message: { conversation: "a".repeat(5000) } }, CHEGOU)!.texto!.length, TEXTO_MAX);
  assert.equal(lerMensagemDoAtendimento({ ...base, pushName: "  Ana  " }, CHEGOU)!.nome, "Ana");
  assert.equal(lerMensagemDoAtendimento({ ...base, pushName: "x".repeat(100) }, CHEGOU)!.nome!.length, NOME_MAX);
});
test("hora: sem messageTimestamp usa a chegada; texto numérico vale", () => {
  const base = dataDe("messages-upsert.privado-resposta");
  assert.equal(lerMensagemDoAtendimento({ ...base, messageTimestamp: undefined }, CHEGOU)!.enviadaEm.getTime(), CHEGOU.getTime());
  assert.equal(lerMensagemDoAtendimento({ ...base, messageTimestamp: "1793278991" }, CHEGOU)!.enviadaEm.getTime(), 1793278991 * 1000);
});
test("status de entrega: só entregue e lida mudam alguma coisa", () => {
  assert.equal(statusDaEntrega(String(dataDe("messages-update.privado-entregue").status)), "entregue");
  assert.equal(statusDaEntrega(String(dataDe("messages-update.privado-lida").status)), "lida");
  assert.equal(statusDaEntrega("PLAYED"), "lida");
  for (const s of ["SERVER_ACK", "PENDING", "ERROR", "xyz"]) assert.equal(statusDaEntrega(s), null, s);
});
test("prévia: texto cortado em 200, mídia sem texto vira rótulo", () => {
  assert.equal(previewDaMensagem({ kind: "texto", texto: "a".repeat(300) }).length, PREVIEW_MAX);
  assert.equal(previewDaMensagem({ kind: "imagem", texto: null }), "[foto]");
  assert.equal(previewDaMensagem({ kind: "imagem", texto: "essa aqui" }), "essa aqui");
  assert.equal(previewDaMensagem({ kind: "audio", texto: null }), "[áudio]");
  assert.equal(previewDaMensagem({ kind: "outro", texto: null }), "[mensagem]");
});
```


- [ ] **Step 2: Run to verify it fails**

Run: `T src/lib/privado/resposta/mensagem.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Implement `mensagem.ts`** seguindo as regras acima (sem `server-only`: puro). Helpers internos `telefoneDe(v: unknown): string | null` e `lidDe(v: unknown): string | null`, com a mesma checagem de domínio de `phoneFromWuid` (`webhook-schema.ts`): o `@lid` nunca vira telefone.

- [ ] **Step 4: Run to verify it passes**

Run: `T src/lib/privado/resposta/mensagem.test.ts`
Expected: PASS. Depois `TSC` (as duas vezes).

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/privado/resposta/mensagem.ts apps/web/src/lib/privado/resposta/mensagem.test.ts
git commit -m "feat(privado): read 1:1 messages and delivery status from the Evolution webhook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Store das respostas (flags, RPCs, pendentes, sino)

**Files:**
- Create: `apps/web/src/lib/stores/privado-respostas.ts`
- Test: `apps/web/src/lib/stores/privado-respostas.test.ts`

**Depends-on:** 1 (as RPCs nascem na Tarefa 8; o nome e o formato delas ficam presos aqui)

**Interfaces:**
- Consumes: `getSupabaseAdmin()` (`@/lib/supabase/server`); `ModuloPrivado` (`@/lib/privado/dm`, PR 3); `KindDaMensagem` (Tarefa 3); `TipoDeResposta` (Tarefa 2).
- Produces:

```ts
import "server-only";
export type AvisoDoSino = { type: string; title: string; body: string; href: string | null };
export type ModulosLigados = { recuperar: boolean; rastreio: boolean };
export type StatusDaConversa = "precisa_de_voce" | "aberta" | "encerrada";
export type EntradaDoAtendimento = {
  providerMessageId: string; autor: "cliente" | "celular";
  telefone: string | null; lid: string | null; jid: string | null; nome: string | null;
  kind: KindDaMensagem; texto: string | null; preview: string | null; enviadaEm: Date;
  tipo: TipoDeResposta | null;            // null no celular
  atende: boolean;                         // Recuperar ligado: alguém lê a conversa
  moduloPadrao: "recuperar" | "rastreio"; // conversa que nunca recebeu mensagem da Girumo
};
export type MensagemRegistrada =
  | { ignorada: true }
  | { ignorada: false; nova: boolean; conversationId: string; messageId: string; telefone: string | null;
      contactName: string | null; statusAnterior: StatusDaConversa | null; modulo: ModuloPrivado;
      pausou: boolean; sairAplicadoEm: Date | null };
export type StatusRegistrado = { atualizou: boolean; avaliadas: number; entregues: number; pausou: boolean };
export type Vinculo = { conversationId: string; mesclou: boolean; sairAplicadoEm: Date | null };
export type MotivoDoVinculo = "conversa_nao_encontrada" | "ja_identificada" | "telefone_invalido";
export class VinculoErro extends Error { readonly motivo: MotivoDoVinculo }
export async function modulosLigados(tenantId: string): Promise<ModulosLigados>;
export async function registrarMensagem(tenantId: string, instanceId: string, e: EntradaDoAtendimento): Promise<MensagemRegistrada>;
export async function registrarStatus(tenantId: string, instanceId: string, providerMessageId: string, status: "entregue" | "lida" | null): Promise<StatusRegistrado>;
export async function vincularConversa(tenantId: string, conversationId: string, telefone: string): Promise<Vinculo>;
export async function dmsPendentesDaConversa(tenantId: string, conversationId: string): Promise<{ id: string; dedupeKey: string | null }[]>;
export async function avisarNoSino(tenantId: string, aviso: AvisoDoSino): Promise<void>;
```

Contrato com a Tarefa 8 (chamadas `rpc(nome, args)`):

| Função | Argumentos | Devolve (jsonb) |
|---|---|---|
| `privado_registrar_mensagem` | `p_tenant`, `p_instance`, `p_m` = `{ provider_message_id, autor, telefone, lid, jid, nome, kind, texto, preview, enviada_em (ISO), tipo, atende, modulo_padrao }` | `{ ignorada: true }` ou `{ ignorada: false, nova, conversation_id, message_id, telefone, contact_name, status_anterior, modulo, pausou, sair_aplicado_em }` |
| `privado_registrar_status` | `p_tenant`, `p_instance`, `p_provider_id`, `p_status` (`entregue`, `lida` ou `null`) | `{ atualizou, avaliadas, entregues, pausou }` |
| `privado_vincular_conversa` | `p_tenant`, `p_conversa`, `p_telefone` | `{ conversation_id, mesclou, sair_aplicado_em }`; erro com `message` = um dos `MotivoDoVinculo` |

Outras leituras e escritas: `modulosLigados` = `tenant_settings` `select("recuperar_enabled, rastreio_enabled")` `.eq("tenant_id")` `.maybeSingle()` (sem linha ou nulo → `false`); `dmsPendentesDaConversa` = `private_messages` `select("id, dedupe_key")` com `.eq("tenant_id")`, `.eq("conversation_id")`, `.eq("status", "na_fila")`, `.in("author", ["automatico", "pessoa"])`; `avisarNoSino` = `insert` em `notifications` `{ tenant_id, type, title, body, href }`. Todo erro lança `new Error(\`<nome da função ou tabela>: ${error.message}\`)`, nunca o objeto de erro (o `details` leva os valores).

- [ ] **Step 1: Write the failing test.** PostgREST falso no desenho de `api/webhooks/evolution/route.test.ts` (`createServer`, `chamadas`, `respostas` por `MÉTODO caminho`, env `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` antes do `import()` dinâmico). `LOJA = "5b7e3c1a-2d4f-4a6b-8c9d-0e1f2a3b4c5d"`; `ENTRADA` = `providerMessageId` `"3EB0AAAA0000000000000001"`, autor `"cliente"`, `telefone` `"5511987650001"`, `lid` `null`, `jid` `"5511987650001@s.whatsapp.net"`, `nome` `"Ana Teste"`, `kind` `"texto"`, `texto` e `preview` `"Oi"`, `enviadaEm` `new Date("2026-10-29T14:03:11.000Z")`, `tipo` `"resposta"`, `atende` `true`, `moduloPadrao` `"recuperar"`.

```ts
test("registrarMensagem chama a RPC com a loja, o número e a mensagem em snake_case", async () => {
  responder("POST /rest/v1/rpc/privado_registrar_mensagem", 200, { ignorada: false, nova: true, conversation_id: "conv-1", message_id: "msg-1",
    telefone: "5511987650001", contact_name: "Ana Teste", status_anterior: "aberta", modulo: "recuperar", pausou: false, sair_aplicado_em: "2026-10-29T13:00:00+00:00" });
  const r = await registrarMensagem(LOJA, "inst-1", ENTRADA);
  assert.deepEqual(chamadas[0].corpo, { p_tenant: LOJA, p_instance: "inst-1", p_m: { provider_message_id: "3EB0AAAA0000000000000001", autor: "cliente",
    telefone: "5511987650001", lid: null, jid: "5511987650001@s.whatsapp.net", nome: "Ana Teste", kind: "texto", texto: "Oi", preview: "Oi",
    enviada_em: "2026-10-29T14:03:11.000Z", tipo: "resposta", atende: true, modulo_padrao: "recuperar" } });
  assert.deepEqual(r, { ignorada: false, nova: true, conversationId: "conv-1", messageId: "msg-1", telefone: "5511987650001", contactName: "Ana Teste",
    statusAnterior: "aberta", modulo: "recuperar", pausou: false, sairAplicadoEm: new Date("2026-10-29T13:00:00Z") });
});
test("registrarMensagem devolve ignorada quando o banco ignora o eco", async () => {
  responder("POST /rest/v1/rpc/privado_registrar_mensagem", 200, { ignorada: true });
  assert.deepEqual(await registrarMensagem(LOJA, "inst-1", ENTRADA), { ignorada: true });
});
test("erro da RPC sobe só com a mensagem, sem os valores do details", async () => {
  responder("POST /rest/v1/rpc/privado_registrar_mensagem", 400, { code: "23514", message: "new row violates check constraint", details: "Failing row contains (5511987650001, Oi)" });
  await assert.rejects(registrarMensagem(LOJA, "inst-1", ENTRADA), (e: Error) => e.message.startsWith("privado_registrar_mensagem:") && !e.message.includes("5511987650001"));
});
test("registrarStatus manda o id e o status e devolve a avaliação", async () => {
  responder("POST /rest/v1/rpc/privado_registrar_status", 200, { atualizou: true, avaliadas: 20, entregues: 11, pausou: true });
  const r = await registrarStatus(LOJA, "inst-1", "3EB0BBBB0000000000000010", "entregue");
  assert.deepEqual(chamadas[0].corpo, { p_tenant: LOJA, p_instance: "inst-1", p_provider_id: "3EB0BBBB0000000000000010", p_status: "entregue" });
  assert.deepEqual(r, { atualizou: true, avaliadas: 20, entregues: 11, pausou: true });
});
test("vincularConversa traduz os motivos do banco e deixa o resto como erro comum", async () => {
  for (const motivo of ["conversa_nao_encontrada", "ja_identificada", "telefone_invalido"] as const) {
    responder("POST /rest/v1/rpc/privado_vincular_conversa", 400, { code: "P0001", message: motivo });
    await assert.rejects(vincularConversa(LOJA, "conv-9", "5511987650001"), (e: unknown) => e instanceof VinculoErro && e.motivo === motivo);
  }
  responder("POST /rest/v1/rpc/privado_vincular_conversa", 500, { message: "banco fora" });
  await assert.rejects(vincularConversa(LOJA, "conv-9", "5511987650001"), (e: unknown) => !(e instanceof VinculoErro));
});
test("vincularConversa devolve a conversa que ficou", async () => {
  responder("POST /rest/v1/rpc/privado_vincular_conversa", 200, { conversation_id: "conv-1", mesclou: true, sair_aplicado_em: null });
  assert.deepEqual(await vincularConversa(LOJA, "conv-9", "5511987650001"), { conversationId: "conv-1", mesclou: true, sairAplicadoEm: null });
  assert.deepEqual(chamadas.at(-1)!.corpo, { p_tenant: LOJA, p_conversa: "conv-9", p_telefone: "5511987650001" });
});
test("modulosLigados lê só a loja; sem linha é tudo desligado", async () => {
  responder("GET /rest/v1/tenant_settings", 200, [{ recuperar_enabled: true, rastreio_enabled: null }]);
  assert.deepEqual(await modulosLigados(LOJA), { recuperar: true, rastreio: false });
  assert.equal(chamadas[0].url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  responder("GET /rest/v1/tenant_settings", 200, []);
  assert.deepEqual(await modulosLigados(LOJA), { recuperar: false, rastreio: false });
});
test("dmsPendentesDaConversa filtra loja, conversa, na_fila e autor da Girumo", async () => {
  responder("GET /rest/v1/private_messages", 200, [{ id: "p1", dedupe_key: "privado:sair:conv-1#0" }, { id: "p2", dedupe_key: null }]);
  assert.deepEqual(await dmsPendentesDaConversa(LOJA, "conv-1"), [{ id: "p1", dedupeKey: "privado:sair:conv-1#0" }, { id: "p2", dedupeKey: null }]);
  const q = chamadas[0].url.searchParams;
  assert.deepEqual([q.get("tenant_id"), q.get("conversation_id"), q.get("status"), q.get("author")],
    [`eq.${LOJA}`, "eq.conv-1", "eq.na_fila", "in.(automatico,pessoa)"]);
});
test("avisarNoSino grava na loja", async () => {
  responder("POST /rest/v1/notifications", 201);
  await avisarNoSino(LOJA, { type: "privado_resposta", title: "Ana respondeu", body: "Mensagem nova no número do atendimento.", href: "/painel/recuperar/conversas?c=conv-1" });
  assert.deepEqual(chamadas[0].corpo, { tenant_id: LOJA, type: "privado_resposta", title: "Ana respondeu",
    body: "Mensagem nova no número do atendimento.", href: "/painel/recuperar/conversas?c=conv-1" });
});
```

(`responder(rota, status, corpo?)` limpa `chamadas` e define a resposta da rota.)

- [ ] **Step 2: Run to verify it fails**

Run: `T src/lib/stores/privado-respostas.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Implement `privado-respostas.ts`** com a tabela de contrato acima. `sairAplicadoEm` e `enviadaEm` cruzam a fronteira como ISO (`toISOString()` na ida, `new Date(...)` na volta, `null` mantido). `VinculoErro` só para os três motivos conhecidos (comparação exata com `error.message`).

- [ ] **Step 4: Run to verify it passes**

Run: `T src/lib/stores/privado-respostas.test.ts`
Expected: PASS. Depois `TSC` (as duas vezes).

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/stores/privado-respostas.ts apps/web/src/lib/stores/privado-respostas.test.ts
git commit -m "feat(privado): store for 1:1 replies, delivery status and linking" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Orquestrador, sino e consumidores

**Files:**
- Create: `apps/web/src/lib/privado/resposta/sino.ts`, `apps/web/src/lib/privado/resposta/consumidores.ts`, `apps/web/src/lib/privado/resposta/processar.ts`
- Test: `apps/web/src/lib/privado/resposta/sino.test.ts`, `apps/web/src/lib/privado/resposta/processar.test.ts`

**Depends-on:** 2, 3, 4

**Interfaces:**
- Consumes: `classificarResposta`, `TipoDeResposta` (Tarefa 2); `lerMensagemDoAtendimento`, `statusDaEntrega`, `previewDaMensagem` (Tarefa 3); tudo da Tarefa 4; `enfileirarDm`, `cancelarDms`, `PedidoDeDm` (`@/lib/privado/dm`, PR 3); `Instance` (`@/lib/stores/instances`); `EvolutionWebhookEvent` e `parseEvolutionWebhook` (`@/lib/evolution/webhook-schema`).
- Produces:

```ts
// sino.ts (puro; `import type { AvisoDoSino }` da store, que some na compilação)
export const HREF_CONVERSAS = "/painel/recuperar/conversas";       // rota do PR 5
export function primeiroNome(nome: string | null): string | null;  // 1ª palavra se casar /^\p{L}{2,20}$/u, senão null
export function avisoDeResposta(nome: string | null, conversationId: string, identificada: boolean): AvisoDoSino;
export function avisoDeSairSemCliente(conversationId: string): AvisoDoSino;

// consumidores.ts — o ponto de extensão. Cada módulo acrescenta UMA entrada no próprio PR (o PR 7, o Recuperar).
export type RespostaDaCliente = { tenantId: string; conversationId: string; telefone: string; tipo: TipoDeResposta; chegouEm: Date };
export type ConsumidorDeResposta = {
  nome: "recuperar" | "rastreio";
  ligado: (modulos: ModulosLigados) => boolean;
  consumir: (r: RespostaDaCliente) => Promise<unknown>;   // IDEMPOTENTE: a reentrega da Evolution roda de novo
};
export const CONSUMIDORES_DE_RESPOSTA: readonly ConsumidorDeResposta[] = [];

// processar.ts
export const TEXTO_CONFIRMACAO_SAIR = "Pronto! Você não vai mais receber mensagens deste número."; // revisão do Igor
export type DepsDoAtendimento = {
  agora: () => Date;
  modulosLigados: typeof modulosLigados; registrarMensagem: typeof registrarMensagem;
  registrarStatus: typeof registrarStatus; vincularConversa: typeof vincularConversa;
  dmsPendentesDaConversa: typeof dmsPendentesDaConversa; avisarNoSino: typeof avisarNoSino;
  enfileirarDm: typeof enfileirarDm; cancelarDms: typeof cancelarDms;
  consumidores: readonly ConsumidorDeResposta[];
};
export const DEPS_DO_ATENDIMENTO: DepsDoAtendimento; // as funções reais e CONSUMIDORES_DE_RESPOSTA
export async function processarEventoDoAtendimento(instance: Pick<Instance, "id" | "tenant_id">, event: EvolutionWebhookEvent, chegouEm: Date, deps?: DepsDoAtendimento): Promise<void>;
export async function aplicarSair(a: { tenantId: string; conversationId: string; telefone: string; sairEm: Date; modulos: ModulosLigados }, deps?: DepsDoAtendimento): Promise<void>;
export async function vincularEAplicar(tenantId: string, conversationId: string, telefone: string, deps?: DepsDoAtendimento): Promise<Vinculo>;
```

Textos do sino (revisão do Igor):

| Função | `type` | `title` | `body` | `href` |
|---|---|---|---|---|
| `avisoDeResposta(nome, id, true)` | `privado_resposta` | `"<primeiroNome> respondeu"` ou `"Cliente respondeu"` | `"Mensagem nova no número do atendimento."` | `` `${HREF_CONVERSAS}?c=${id}` `` |
| `avisoDeResposta(nome, id, false)` | `privado_resposta` | `"Resposta de número não identificado"` | `"Abra a conversa e vincule à cliente."` | idem |
| `avisoDeSairSemCliente(id)` | `privado_sair_sem_cliente` | `"Pedido de SAIR sem cliente vinculada"` | `"Vincule a conversa à cliente para o SAIR valer."` | idem |

Algoritmos (a ordem importa: o SAIR primeiro; o sino antes dos consumidores, para não se perder quando um consumidor falha e a reentrega já chega com `nova: false`):

`processarEventoDoAtendimento(instance, event, chegouEm, deps = DEPS_DO_ATENDIMENTO)`:
- `messages.update`: `event.data.fromMe !== true` → nada. Senão `registrarStatus(tenant, instance.id, event.data.keyId, statusDaEntrega(event.data.status))` (com status nulo a RPC só avalia a taxa de entrega).
- `messages.upsert`:
  1. `m = lerMensagemDoAtendimento(event.data, chegouEm)`; `null` → nada.
  2. `modulos = await deps.modulosLigados(tenant)`; `atende = modulos.recuperar`.
  3. `m.deMim && !atende` → nada (loja sem o Recuperar não guarda o que sai do celular).
  4. `tipo = m.deMim ? null : classificarResposta(m.texto)`.
  5. `r = await deps.registrarMensagem(tenant, instance.id, { …m, autor: m.deMim ? "celular" : "cliente", texto: atende ? m.texto : null, preview: atende ? previewDaMensagem(m) : null, tipo, atende, moduloPadrao: modulos.rastreio && !modulos.recuperar ? "rastreio" : "recuperar" })`.
  6. `r.ignorada || m.deMim` → fim.
  7. `sairEm = tipo === "sair" ? m.enviadaEm : r.sairAplicadoEm`. Com `sairEm` e `r.telefone`: `aplicarSair({ tenantId, conversationId: r.conversationId, telefone: r.telefone, sairEm, modulos }, deps)`.
  8. `r.nova && atende`: `tipo === "sair" && !r.telefone` → `avisarNoSino(avisoDeSairSemCliente(r.conversationId))`; senão, se `tipo !== "sair"` e `r.statusAnterior !== "precisa_de_voce"` → `avisarNoSino(avisoDeResposta(r.contactName, r.conversationId, r.telefone !== null))`.
  9. Com `r.telefone`: cada consumidor com `ligado(modulos)`, na ordem do registro, recebe `{ tenantId, conversationId: r.conversationId, telefone: r.telefone, tipo: sairEm ? "sair" : tipo, chegouEm: m.enviadaEm }`. Um que lança não impede o próximo; no fim, se algum lançou, relança o primeiro erro (vira 500 e a Evolution reentrega).
- Qualquer outro evento → nada.

`aplicarSair(a, deps)`:
1. Pendentes = `dmsPendentesDaConversa(a.tenantId, a.conversationId)` menos os de `dedupeKey` começando com `privado:sair:` (casamento por prefixo: o PR 3 grava `<dedupeKey>#<parte>`); havendo algum → `cancelarDms(a.tenantId, ids)`.
2. `a.sairEm` com mais de 24 h (em relação a `deps.agora()`) → para.
3. Módulo da confirmação = `recuperar` se ligado, senão `rastreio` se ligado, senão para.
4. `enfileirarDm({ tenantId, modulo, telefone: a.telefone, partes: [{ texto: TEXTO_CONFIRMACAO_SAIR }], prioridade: "resposta", validoAte: agora + 24 h, dedupeKey: \`privado:sair:${a.conversationId}\`, autor: { tipo: "automatico" } })`. Resultado `recusado` → `console.warn(\`[privado] confirmação de saída não enfileirada (${recusado}) na conversa ${a.conversationId}\`)` e segue.

`vincularEAplicar(tenantId, conversationId, telefone, deps)`: `v = vincularConversa(...)`; `modulos = modulosLigados(tenantId)`; com `v.sairAplicadoEm` → `aplicarSair({ tenantId, conversationId: v.conversationId, telefone, sairEm: v.sairAplicadoEm, modulos })`; consumidores ligados recebem `{ tenantId, conversationId: v.conversationId, telefone, tipo: v.sairAplicadoEm ? "sair" : "resposta", chegouEm: deps.agora() }` (mesma regra de falha do passo 9); devolve `v`.

- [ ] **Step 1: Write the failing tests.**

`sino.test.ts`:

```ts
test("primeiro nome: só letras, de 2 a 20", () => {
  assert.equal(primeiroNome("Ana Maria"), "Ana");
  assert.equal(primeiroNome("  José "), "José");
  for (const n of ["http://x.com", "A", "x".repeat(21), "", null, "123"]) assert.equal(primeiroNome(n), null, String(n));
});
test("avisos do sino com os textos e o link da conversa", () => {
  assert.deepEqual(avisoDeResposta("Ana Maria", "c1", true), { type: "privado_resposta", title: "Ana respondeu",
    body: "Mensagem nova no número do atendimento.", href: "/painel/recuperar/conversas?c=c1" });
  assert.equal(avisoDeResposta(null, "c1", true).title, "Cliente respondeu");
  assert.deepEqual(avisoDeResposta("Ana", "c1", false), { type: "privado_resposta", title: "Resposta de número não identificado",
    body: "Abra a conversa e vincule à cliente.", href: "/painel/recuperar/conversas?c=c1" });
  assert.deepEqual(avisoDeSairSemCliente("c1"), { type: "privado_sair_sem_cliente", title: "Pedido de SAIR sem cliente vinculada",
    body: "Vincule a conversa à cliente para o SAIR valer.", href: "/painel/recuperar/conversas?c=c1" });
});
```

`processar.test.ts`. Montagem: `LOJA`; `INST = { id: "inst-privado", tenant_id: LOJA }`; `AGORA = new Date("2026-10-29T15:00:00Z")`; `evento(nome, mexer?)` lê a fixture da Tarefa 1 (as cinco novas e as antigas `messages-update`, `messages-upsert.group`, `groups-upsert`), passa o `data` de uma cópia (`structuredClone`) a `mexer` e devolve `parseEvolutionWebhook(...)` já estreitado (`assert.ok(r.ok)`); `texto(t)` = `(d) => { d.message = { conversation: t }; }`; `REGISTRADA` = `{ ignorada: false, nova: true, conversationId: "conv-1", messageId: "msg-1", telefone: "5511987650001", contactName: "Ana Teste", statusAnterior: "aberta", modulo: "recuperar", pausou: false, sairAplicadoEm: null }`.

`falsas(over = {})` devolve `{ deps, chamadas }`. Cada função de `deps` é `async (...args) => { chamadas.push([nome, registro]); return (over[nome] ?? padrao)(...args); }` — o que vem em `over` troca só o retorno, a chamada continua registrada. `agora: () => AGORA`; `consumidores` = `over.consumidores` ou um consumidor `{ nome: "recuperar", ligado: (m) => m.recuperar, consumir: async (r) => { chamadas.push(["consumir:recuperar", r]); } }`.

| Função | `registro` | Retorno padrão |
|---|---|---|
| `modulosLigados(t)` | `t` | `{ recuperar: true, rastreio: false }` |
| `registrarMensagem(t, i, e)` | `e` | `REGISTRADA` |
| `registrarStatus(t, i, id, s)` | `[t, i, id, s]` | `{ atualizou: true, avaliadas: 0, entregues: 0, pausou: false }` |
| `vincularConversa(t, c, tel)` | `[t, c, tel]` | `{ conversationId: "conv-9", mesclou: false, sairAplicadoEm: null }` |
| `dmsPendentesDaConversa(t, c)` | `[t, c]` | `[]` |
| `cancelarDms(t, ids)` | `ids` | `ids.length` |
| `enfileirarDm(p)` | `p` | `{ messageIds: ["conf-1"] }` |
| `avisarNoSino(t, a)` | `a` | `undefined` |

`com(chamadas, nome)` = `chamadas.filter(([n]) => n === nome).map(([, r]) => r)`.

```ts
test("resposta na loja com o Recuperar: grava com texto, chama o consumidor e avisa 'Ana respondeu'", async () => {
  const { deps, chamadas } = falsas();
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta"), AGORA, deps);
  const [e] = com(chamadas, "registrarMensagem") as [EntradaDoAtendimento];
  assert.deepEqual([e.autor, e.tipo, e.atende, e.texto, e.preview, e.moduloPadrao],
    ["cliente", "resposta", true, "Oi, ainda tenho interesse", "Oi, ainda tenho interesse", "recuperar"]);
  assert.deepEqual(com(chamadas, "consumir:recuperar"), [{ tenantId: LOJA, conversationId: "conv-1", telefone: "5511987650001",
    tipo: "resposta", chegouEm: new Date(1793278991 * 1000) }]);
  assert.deepEqual(com(chamadas, "avisarNoSino"), [avisoDeResposta("Ana Teste", "conv-1", true)]);
  assert.deepEqual([com(chamadas, "cancelarDms").length, com(chamadas, "enfileirarDm").length], [0, 0]);
});
test("conversa que já estava em Precisa de você não avisa de novo", async () => {
  const { deps, chamadas } = falsas({ registrarMensagem: async () => ({ ...REGISTRADA, statusAnterior: "precisa_de_voce" }) });
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta"), AGORA, deps);
  assert.equal(com(chamadas, "avisarNoSino").length, 0);
});
test("reentrega não avisa de novo, mas chama o consumidor (idempotente)", async () => {
  const { deps, chamadas } = falsas({ registrarMensagem: async () => ({ ...REGISTRADA, nova: false }) });
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta"), AGORA, deps);
  assert.equal(com(chamadas, "avisarNoSino").length, 0);
  assert.equal(com(chamadas, "consumir:recuperar").length, 1);
});
test("loja só com o Rastreio: sem texto, sem prévia, sem sino", async () => {
  const { deps, chamadas } = falsas({ modulosLigados: async () => ({ recuperar: false, rastreio: true }) });
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta"), AGORA, deps);
  const [e] = com(chamadas, "registrarMensagem") as [EntradaDoAtendimento];
  assert.deepEqual([e.texto, e.preview, e.atende, e.moduloPadrao], [null, null, false, "rastreio"]);
  assert.equal(com(chamadas, "avisarNoSino").length, 0);
});
test("recusa vai como recusa e ainda é resposta pra uma pessoa ler", async () => {
  const { deps, chamadas } = falsas();
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta", texto("quem é?")), AGORA, deps);
  assert.equal((com(chamadas, "registrarMensagem")[0] as EntradaDoAtendimento).tipo, "recusa");
  assert.equal(com(chamadas, "avisarNoSino").length, 1);
});
test("SAIR com telefone: cancela os pendentes (menos a confirmação), confirma uma vez, avisa o consumidor e não toca o sino", async () => {
  const { deps, chamadas } = falsas({ dmsPendentesDaConversa: async () => [
    { id: "p1", dedupeKey: "recuperar:caso-1:pix.p1#0" }, { id: "p2", dedupeKey: null }, { id: "conf-0", dedupeKey: "privado:sair:conv-1#0" }] });
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta", texto("SAIR")), AGORA, deps);
  assert.deepEqual(com(chamadas, "cancelarDms"), [["p1", "p2"]]);
  assert.deepEqual(com(chamadas, "enfileirarDm"), [{ tenantId: LOJA, modulo: "recuperar", telefone: "5511987650001",
    partes: [{ texto: TEXTO_CONFIRMACAO_SAIR }], prioridade: "resposta", validoAte: new Date(AGORA.getTime() + 24 * 3_600_000),
    dedupeKey: "privado:sair:conv-1", autor: { tipo: "automatico" } }]);
  assert.ok(chamadas.findIndex(([n]) => n === "cancelarDms") < chamadas.findIndex(([n]) => n === "enfileirarDm"));
  assert.equal((com(chamadas, "consumir:recuperar")[0] as RespostaDaCliente).tipo, "sair");
  assert.equal(com(chamadas, "avisarNoSino").length, 0);
});
test("reentrega do SAIR refaz cancelar e confirmar (idempotentes), sem sino", async () => {
  const { deps, chamadas } = falsas({ registrarMensagem: async () => ({ ...REGISTRADA, nova: false }), dmsPendentesDaConversa: async () => [{ id: "p1", dedupeKey: null }] });
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta", texto("sair")), AGORA, deps);
  assert.deepEqual([com(chamadas, "cancelarDms").length, com(chamadas, "enfileirarDm").length, com(chamadas, "avisarNoSino").length], [1, 1, 0]);
});
test("SAIR de conversa sem telefone: só o sino de destaque, nada de cancelar, confirmar ou consumidor", async () => {
  const { deps, chamadas } = falsas({ registrarMensagem: async () => ({ ...REGISTRADA, telefone: null }) });
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta", texto("Sair")), AGORA, deps);
  assert.deepEqual(com(chamadas, "avisarNoSino"), [avisoDeSairSemCliente("conv-1")]);
  assert.deepEqual([com(chamadas, "cancelarDms").length, com(chamadas, "enfileirarDm").length, com(chamadas, "consumir:recuperar").length], [0, 0, 0]);
});
test("SAIR com os dois módulos desligados: cancela e não confirma", async () => {
  const { deps, chamadas } = falsas({ modulosLigados: async () => ({ recuperar: false, rastreio: false }), dmsPendentesDaConversa: async () => [{ id: "p1", dedupeKey: null }] });
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta", texto("PARAR")), AGORA, deps);
  assert.deepEqual([com(chamadas, "cancelarDms").length, com(chamadas, "enfileirarDm").length], [1, 0]);
});
test("confirmação recusada pelo envio vira aviso no log sem telefone nem texto da cliente", async (t) => {
  const aviso = t.mock.method(console, "warn", () => {});
  const { deps } = falsas({ enfileirarDm: async () => ({ recusado: "bloqueado" as const }) });
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta", texto("Sair!")), AGORA, deps);
  assert.equal(aviso.mock.callCount(), 1);
  const linha = String(aviso.mock.calls[0].arguments[0]);
  assert.ok(linha.includes("bloqueado") && linha.includes("conv-1"));
  assert.ok(!linha.includes("5511987650001") && !linha.includes("Sair!"));
});
test("SAIR pendente aplicado na identificação automática dispara o SAIR mesmo com mensagem normal", async () => {
  const { deps, chamadas } = falsas({ registrarMensagem: async () => ({ ...REGISTRADA, sairAplicadoEm: new Date(AGORA.getTime() - 2 * 3_600_000) }) });
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta"), AGORA, deps);
  assert.equal(com(chamadas, "enfileirarDm").length, 1);
  assert.equal((com(chamadas, "consumir:recuperar")[0] as RespostaDaCliente).tipo, "sair");
});
test("mensagem do celular do chip: grava como celular, sem sino e sem consumidor", async () => {
  const { deps, chamadas } = falsas();
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-celular"), AGORA, deps);
  const [e] = com(chamadas, "registrarMensagem") as [EntradaDoAtendimento];
  assert.deepEqual([e.autor, e.tipo, e.nome], ["celular", null, null]);
  assert.deepEqual([com(chamadas, "avisarNoSino").length, com(chamadas, "consumir:recuperar").length], [0, 0]);
});
test("celular em loja sem o Recuperar e eco ignorado não fazem mais nada", async () => {
  const sem = falsas({ modulosLigados: async () => ({ recuperar: false, rastreio: true }) });
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-celular"), AGORA, sem.deps);
  assert.equal(com(sem.chamadas, "registrarMensagem").length, 0);
  const eco = falsas({ registrarMensagem: async () => ({ ignorada: true as const }) });
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta"), AGORA, eco.deps);
  assert.deepEqual(eco.chamadas.map(([n]) => n), ["modulosLigados", "registrarMensagem"]);
});
test("um consumidor que falha não impede o outro e a falha sobe", async () => {
  const visto: string[] = [];
  const { deps } = falsas({ consumidores: [
    { nome: "recuperar", ligado: () => true, consumir: async () => { visto.push("recuperar"); throw new Error("falhou"); } },
    { nome: "rastreio", ligado: () => true, consumir: async () => { visto.push("rastreio"); } },
    { nome: "rastreio", ligado: () => false, consumir: async () => { visto.push("desligado"); } }] });
  await assert.rejects(processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta"), AGORA, deps), /falhou/);
  assert.deepEqual(visto, ["recuperar", "rastreio"]);
});
test("status: entregue e lida vão por key.id; SERVER_ACK só avalia; recebida (fromMe false) é ignorada", async () => {
  const { deps, chamadas } = falsas();
  await processarEventoDoAtendimento(INST, evento("messages-update.privado-entregue"), AGORA, deps);
  await processarEventoDoAtendimento(INST, evento("messages-update.privado-lida"), AGORA, deps);
  await processarEventoDoAtendimento(INST, evento("messages-update.privado-entregue", (d) => { d.status = "SERVER_ACK"; }), AGORA, deps);
  await processarEventoDoAtendimento(INST, evento("messages-update"), AGORA, deps);   // fixture de julho: fromMe false
  assert.deepEqual(com(chamadas, "registrarStatus"), [
    [LOJA, "inst-privado", "3EB0BBBB0000000000000010", "entregue"],
    [LOJA, "inst-privado", "3EB0BBBB0000000000000010", "lida"],
    [LOJA, "inst-privado", "3EB0BBBB0000000000000010", null]]);
});
test("grupo, status@broadcast e groups.upsert no número do atendimento não chegam ao banco", async () => {
  const { deps, chamadas } = falsas();
  await processarEventoDoAtendimento(INST, evento("messages-upsert.group"), AGORA, deps);
  await processarEventoDoAtendimento(INST, evento("messages-upsert.privado-resposta", (d) => { (d.key as Record<string, unknown>).remoteJid = "status@broadcast"; }), AGORA, deps);
  await processarEventoDoAtendimento(INST, evento("groups-upsert"), AGORA, deps);
  assert.deepEqual(chamadas, []);
});
test("vincular sem SAIR chama o consumidor como resposta, sem cancelar nem confirmar", async () => {
  const { deps, chamadas } = falsas();
  assert.deepEqual(await vincularEAplicar(LOJA, "conv-9", "5511987650001", deps), { conversationId: "conv-9", mesclou: false, sairAplicadoEm: null });
  assert.deepEqual(com(chamadas, "consumir:recuperar"), [{ tenantId: LOJA, conversationId: "conv-9", telefone: "5511987650001", tipo: "resposta", chegouEm: AGORA }]);
  assert.deepEqual([com(chamadas, "cancelarDms").length, com(chamadas, "enfileirarDm").length], [0, 0]);
});
test("vincular que aplica SAIR de 1 h atrás cancela e confirma; de 30 h atrás só cancela", async () => {
  for (const [horas, confirmacoes] of [[1, 1], [30, 0]] as const) {
    const { deps, chamadas } = falsas({
      vincularConversa: async () => ({ conversationId: "conv-9", mesclou: true, sairAplicadoEm: new Date(AGORA.getTime() - horas * 3_600_000) }),
      dmsPendentesDaConversa: async () => [{ id: "p1", dedupeKey: null }] });
    await vincularEAplicar(LOJA, "conv-9", "5511987650001", deps);
    assert.deepEqual([com(chamadas, "cancelarDms").length, com(chamadas, "enfileirarDm").length], [1, confirmacoes], `${horas} h`);
    assert.equal((com(chamadas, "consumir:recuperar")[0] as RespostaDaCliente).tipo, "sair");
  }
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `T src/lib/privado/resposta/sino.test.ts src/lib/privado/resposta/processar.test.ts`
Expected: FAIL (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Implement** `sino.ts` e `consumidores.ts` (puros) e `processar.ts` (`import "server-only"`) com os algoritmos acima. `DEPS_DO_ATENDIMENTO` só liga as funções reais; nenhum `console.*` além do aviso da confirmação recusada.

- [ ] **Step 4: Run to verify they pass**

Run: `T src/lib/privado/resposta/sino.test.ts src/lib/privado/resposta/processar.test.ts`
Expected: PASS. Depois `TSC` (as duas vezes) e `LINT`.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/privado/resposta
git commit -m "feat(privado): process 1:1 replies, SAIR and the per-module reply hook" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Ramo do número do atendimento no webhook da Evolution

**Files:**
- Modify: `apps/web/src/app/api/webhooks/evolution/route.ts` (entre o `connection.update` e o `applyFlashOfferComment`)
- Modify (só se S16 deu "não tem"): `apps/web/src/lib/stores/instances.ts` (`purpose` no tipo e em `LIST_COLUMNS`)
- Test: `apps/web/src/app/api/webhooks/evolution/route-privado.test.ts`

**Depends-on:** 5

**Interfaces:**
- Consumes: `processarEventoDoAtendimento` (Tarefa 5); `Instance.purpose: "grupos" | "privado"`.
- Produces: o ramo, assim:

```ts
// Número do atendimento (instances.purpose = 'privado'): conversa 1:1 e status das mensagens dele.
// Grupo, status@broadcast e evento de grupo chegando nele são ignorados — esse número nunca vira destino
// de post — e nada dele entra em engine_events (dado pessoal sem consumidor). O connection.update segue abaixo.
if (instance.purpose === "privado" && event.event !== "connection.update") {
  await processarEventoDoAtendimento(instance, event, chegouEm);
  return Response.json({ received: true });
}
```

- [ ] **Step 1: Write the failing test** `route-privado.test.ts`. Montagem igual à de `route.test.ts` (global `AsyncLocalStorage` antes do `import()`, PostgREST falso com `respostas` por `MÉTODO caminho` e 500 "inesperado" no resto, `SEGREDO` no header `x-evolution-webhook-secret`). `INSTANCIA_PRIVADO` = cópia da `INSTANCIA` de `route.test.ts` com `id: "inst-privado"`, `purpose: "privado"`, `provider_instance_id: "gr_privado-teste"`, `phone: "5511900000000"`; `INSTANCIA_GRUPOS` = a mesma com `purpose: "grupos"`. `pedido(nome, mexer?)` monta o `Request` com o corpo da fixture (Tarefa 1 ou as antigas `messages-upsert.group`, `groups-upsert`), passando o `data` de uma cópia a `mexer`. Respostas-base: `GET /rest/v1/instances` → `[INSTANCIA_PRIVADO]`; `GET /rest/v1/tenant_settings` → `[{ recuperar_enabled: true, rastreio_enabled: false }]`; `POST /rest/v1/rpc/privado_registrar_mensagem` → `{ ignorada: false, nova: true, conversation_id: "conv-1", message_id: "msg-1", telefone: "5511987650001", contact_name: "Ana Teste", status_anterior: "aberta", modulo: "recuperar", pausou: false, sair_aplicado_em: null }`; `POST /rest/v1/rpc/privado_registrar_status` → `{ atualizou: true, avaliadas: 0, entregues: 0, pausou: false }`; `POST /rest/v1/notifications` → 201; `POST /rest/v1/rpc/record_engine_event` → `{ created_at: X, updated_at: X }` (o mesmo `X` nos dois); `POST /rest/v1/rpc/update_instance_status` → `{}`; `POST /rest/v1/funnel_events` → 201. `caminhos()` = `chamadas.map((c) => \`${c.metodo} ${c.url.pathname}\`)`.

```ts
test("resposta 1:1 no número do atendimento vai pela RPC, avisa no sino e não entra em engine_events", async () => {
  const res = await POST(pedido("messages-upsert.privado-resposta"));
  assert.equal(res.status, 200);
  const rpc = chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/privado_registrar_mensagem");
  assert.equal(rpc.length, 1);
  const corpo = rpc[0].corpo as { p_tenant: string; p_instance: string; p_m: Record<string, unknown> };
  assert.deepEqual([corpo.p_tenant, corpo.p_instance, corpo.p_m.texto, corpo.p_m.tipo, corpo.p_m.autor],
    [LOJA, "inst-privado", "Oi, ainda tenho interesse", "resposta", "cliente"]);
  const sino = chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/notifications")
    .map((c) => c.corpo as { tenant_id: string; type: string; title: string });
  assert.deepEqual(sino.map((s) => [s.tenant_id, s.type, s.title]), [[LOJA, "privado_resposta", "Ana respondeu"]]);
  assert.ok(!caminhos().some((p) => p.includes("record_engine_event") || p.includes("flash_offer")));
});
test("status entregue do número do atendimento grava por key.id, sem engine_events", async () => {
  const res = await POST(pedido("messages-update.privado-entregue"));
  assert.equal(res.status, 200);
  assert.deepEqual(chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/privado_registrar_status").map((c) => c.corpo),
    [{ p_tenant: LOJA, p_instance: "inst-privado", p_provider_id: "3EB0BBBB0000000000000010", p_status: "entregue" }]);
  assert.ok(!caminhos().some((p) => p.includes("record_engine_event")));
});
test("grupo, groups.upsert e status@broadcast no número do atendimento: só a leitura da instância", async () => {
  for (const req of [pedido("messages-upsert.group"), pedido("groups-upsert"),
    pedido("messages-upsert.privado-resposta", (d) => { (d.key as Record<string, unknown>).remoteJid = "status@broadcast"; })]) {
    chamadas.length = 0;
    assert.equal((await POST(req)).status, 200);
    assert.deepEqual(caminhos(), ["GET /rest/v1/instances"]);
  }
});
test("o mesmo 1:1 chegando num número de grupos segue descartado como hoje", async () => {
  respostas["GET /rest/v1/instances"] = { status: 200, corpo: [INSTANCIA_GRUPOS] };
  assert.equal((await POST(pedido("messages-upsert.privado-resposta"))).status, 200);
  assert.deepEqual(caminhos(), ["GET /rest/v1/instances"]);
});
test("messages.update de número de grupos continua indo pro engine_events", async () => {
  respostas["GET /rest/v1/instances"] = { status: 200, corpo: [INSTANCIA_GRUPOS] };
  assert.equal((await POST(pedido("messages-update.privado-entregue"))).status, 200);
  assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/rpc/record_engine_event").length, 1);
  assert.ok(!caminhos().some((p) => p.includes("privado_")));
});
test("connection.update do número do atendimento segue o caminho de sempre", async () => {
  assert.equal((await POST(conexao("open", "5511900000000@s.whatsapp.net"))).status, 200);
  assert.ok(caminhos().includes("POST /rest/v1/rpc/update_instance_status"));
  assert.ok(caminhos().includes("POST /rest/v1/rpc/record_engine_event"));
});
test("erro do banco na resposta vira 500 (a Evolution reentrega)", async () => {
  respostas["POST /rest/v1/rpc/privado_registrar_mensagem"] = { status: 500, corpo: { message: "banco fora" } };
  await assert.rejects(POST(pedido("messages-upsert.privado-resposta")));
});
```

(Cada teste começa de `reiniciar()`, que zera `chamadas` e volta `respostas` à base. `conexao(state, wuid)` como em `route.test.ts`, com `instance: "gr_privado-teste"`. O mesmo `wuid` do número evita a invalidação do cache da bio, que pediria escopo de requisição.)

- [ ] **Step 2: Run to verify it fails**

Run: `T src/app/api/webhooks/evolution/route-privado.test.ts`
Expected: FAIL nos testes do número do atendimento (o webhook ainda descarta o 1:1, manda o `messages.update` pro `engine_events` e trata o grupo como se fosse do número de grupos); os dois do número de grupos e o do `connection.update` já passam.

- [ ] **Step 3: Implement**: o ramo acima no `route.ts`, mais o import de `processarEventoDoAtendimento`; se S16 mandou, `purpose: "grupos" | "privado"` em `Instance` e `purpose` em `LIST_COLUMNS`.

- [ ] **Step 4: Run to verify it passes, junto com os testes antigos do webhook**

Run: `T src/app/api/webhooks/evolution/route-privado.test.ts src/app/api/webhooks/evolution/route.test.ts src/app/api/webhooks/evolution/route-alertas.test.ts`
Expected: PASS, sem mudar uma linha dos dois arquivos antigos (prova de que o caminho dos grupos segue igual). Depois `TSC` (as duas vezes) e `LINT`.

- [ ] **Step 5: Mutante** — trocar a condição do ramo por `false`, rodar `T src/app/api/webhooks/evolution/route-privado.test.ts`: tem de falhar ("resposta 1:1…" e "status entregue…"). Desfazer.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/src/app/api/webhooks/evolution apps/web/src/lib/stores/instances.ts
git commit -m "feat(webhook): route attendance-number events to the private reply flow" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: API "vincular à cliente"

**Files:**
- Create: `apps/web/src/app/api/recuperar/conversas/[id]/vincular/route.ts`
- Test: `apps/web/src/app/api/recuperar/conversas/[id]/vincular/route.test.ts`
- Modify: `apps/web/src/lib/auth/modulos.ts` (`ROTAS.recuperar`), `apps/web/src/lib/auth/modulos.test.ts`

**Depends-on:** 5

**Interfaces:**
- Consumes: `requireRecuperar(req: Request): Promise<TenantContext>` (PR 5a; lança `Response` 403 `{ error: "O Recuperar não está liberado para esta loja.", code: "recuperar_disabled" }`); `assertPermission(role, "message:send")` (`@/lib/permissions`: dono, admin, operador e vendedora); `chaveDoTelefone` (`@/lib/pages/phone`, espelho de `public.phone_key`); `vincularEAplicar` (Tarefa 5); `VinculoErro` (Tarefa 4).
- Produces: `POST /api/recuperar/conversas/[id]/vincular`, corpo `{ telefone: string }` (`z.strictObject`, até 30 caracteres) → 200 `{ conversationId: string, mesclou: boolean }`. Erros `{ error, code }`: 400 `telefone_invalido` ("Telefone inválido."); 404 `conversa_nao_encontrada` ("Conversa não encontrada.", também para `id` que não é uuid, sem ir ao banco); 409 `ja_identificada` ("Esta conversa já tem telefone."). JSON inválido ou corpo fora do formato (campo a mais, `telefone` que não é texto) → 400 `{ error: "Corpo inválido." }`, sem `code`. `ROTAS.recuperar` ganha `{ padrao: "/api/recuperar/conversas/*/vincular", metodos: ["POST"] }`. Para o PR 8: o botão manda o telefone do caso escolhido e passa a usar o `conversationId` DEVOLVIDO (na mescla a conversa de origem é apagada; `recovery_cases.conversation_id` que apontava pra ela vira nulo pela FK `on delete set null` do 1b).

Telefone válido = `telefone.replace(/\D/g, "")` com 10 a 13 dígitos e `chaveDoTelefone(digitos) !== null`; vai ao banco só com os dígitos.

- [ ] **Step 1: Write the failing tests.** `route.test.ts` com o PostgREST falso de `api/campanhas/conflitos/route.test.ts`: `GET /auth/v1/user` → `{ id: "usuario-1", email: "dono@loja.test" }`; `GET /rest/v1/memberships` → `[{ tenant_id: LOJA, role: "owner", modules: [] }]`; `GET /rest/v1/tenant_settings` → `[{ recuperar_enabled: ligado, rastreio_enabled: false }]`; `POST /rest/v1/rpc/privado_vincular_conversa` → `vinculo` (variável do teste). `ID = "6a7e0000-0000-4000-8000-0000000000c9"`. `pedir(id, corpo)` = `POST(new Request(\`http://girumo.test/api/recuperar/conversas/${id}/vincular\`, { method: "POST", headers: { authorization: "Bearer token-falso", "x-tenant-id": LOJA, "content-type": "application/json" }, body: typeof corpo === "string" ? corpo : JSON.stringify(corpo) }), { params: Promise.resolve({ id }) })`. `rpcs()` = chamadas a `/rest/v1/rpc/privado_vincular_conversa`.

```ts
test("vincula: o banco recebe a loja do chamador e só os dígitos do telefone", async () => {
  vinculo = { status: 200, corpo: { conversation_id: "conv-9", mesclou: false, sair_aplicado_em: null } };
  const res = await pedir(ID, { telefone: "+55 (11) 98765-0001" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { conversationId: "conv-9", mesclou: false });
  assert.deepEqual(rpcs().map((c) => c.corpo), [{ p_tenant: LOJA, p_conversa: ID, p_telefone: "5511987650001" }]);
});
test("telefone que não vira chave, campo a mais ou JSON inválido: 400 sem ir ao banco", async () => {
  for (const corpo of [{ telefone: "123" }, { telefone: "abc" }, { telefone: "" }, { telefone: "11987650001", caso: "x" }, "{"]) {
    const res = await pedir(ID, corpo);
    assert.equal(res.status, 400, JSON.stringify(corpo));
  }
  assert.equal((await (await pedir(ID, { telefone: "123" })).json()).code, "telefone_invalido");
  assert.equal(rpcs().length, 0);
});
test("id fora do formato: 404 sem ir ao banco", async () => {
  const res = await pedir("nao-e-uuid", { telefone: "11987650001" });
  assert.equal(res.status, 404);
  assert.equal(rpcs().length, 0);
});
test("os motivos do banco viram 404 e 409 com o código", async () => {
  for (const [motivo, status] of [["conversa_nao_encontrada", 404], ["ja_identificada", 409]] as const) {
    vinculo = { status: 400, corpo: { code: "P0001", message: motivo } };
    const res = await pedir(ID, { telefone: "11987650001" });
    assert.equal(res.status, status);
    assert.equal((await res.json()).code, motivo);
  }
});
test("loja sem o Recuperar: 403 recuperar_disabled, sem ir ao banco", async () => {
  ligado = false;
  const res = await pedir(ID, { telefone: "11987650001" });
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "recuperar_disabled");
  assert.equal(rpcs().length, 0);
});
```

Em `modulos.test.ts`:

```ts
test("a vendedora com o Recuperar vincula conversa; sem o módulo, ou com outro método, não", () => {
  const caminho = "/api/recuperar/conversas/6a7e0000-0000-4000-8000-0000000000c9/vincular";
  assert.equal(podeAcessar({ role: "seller", modules: ["recuperar"] }, caminho, "POST"), true);
  assert.equal(podeAcessar({ role: "seller", modules: ["recuperar"] }, caminho, "GET"), false);
  assert.equal(podeAcessar({ role: "seller", modules: [] }, caminho, "POST"), false);
  assert.equal(podeAcessar({ role: "seller", modules: ["postar"] }, caminho, "POST"), false);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `T "src/app/api/recuperar/conversas/[id]/vincular/route.test.ts" src/lib/auth/modulos.test.ts`
Expected: FAIL (rota inexistente; `podeAcessar` devolve `false` para a vendedora com o Recuperar).

- [ ] **Step 3: Implement** a rota no molde de `api/ig/account/route.ts` (`runtime = "nodejs"`, `dynamic = "force-dynamic"`; `try { ctx = await requireRecuperar(req); assertPermission(ctx.role, "message:send"); … } catch (e) { if (e instanceof Response) return e; if (e instanceof VinculoErro) → status do motivo; throw e; }`) e a entrada em `ROTAS.recuperar`.

- [ ] **Step 4: Run to verify they pass, com os guardas do PR 5a**

Run: `T "src/app/api/recuperar/conversas/[id]/vincular/route.test.ts" src/lib/auth/modulos.test.ts src/lib/auth/modulos-rotas.test.ts src/lib/recuperar/rotas-guardadas.test.ts`
Expected: PASS (`modulos-rotas` acha o `route.ts` do padrão novo; `rotas-guardadas` acha `requireRecuperar(` na rota). Depois `TSC` (as duas vezes) e `LINT`.

- [ ] **Step 5: Commit**

```powershell
git add "apps/web/src/app/api/recuperar/conversas" apps/web/src/lib/auth/modulos.ts apps/web/src/lib/auth/modulos.test.ts
git commit -m "feat(recuperar): link an unidentified conversation to the customer's phone" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Migração — resposta, status e vínculo no banco

**Files:**
- Create: `apps/web/supabase/migrations/20261030140000_privado_resposta.sql` (padrão do índice; se o dia for outro, trocar pela data UTC do dia + `140000`, maior que o de toda migração já em `main` — a do PR 3 inclusive — e sem repetir prefixo)
- Create: `infra/tests/privado-resposta-check.sql`
- Modify: `deploy/supabase/apply-order.txt` (comentário + linha no fim), `deploy/supabase/schema-baseline.json` (gerado)

**Depends-on:** 1 (S1–S9) e o contrato da Tarefa 4

**Interfaces:**
- Consumes: S1–S9; `public.phone_key(text)` (já existe, `20261010130000_funil_anuncios_tabelas.sql:14`); tabelas do 1a; `public.notifications (tenant_id, type, title, body, href)`; `tenant_settings.recuperar_enabled`.
- Produces (só o `service_role` executa as três; todas `security definer`, `set search_path = public, app`; depois de cada `create or replace`: `revoke all on function … from public, anon, authenticated;` e `grant execute on function … to service_role;`). A `app.privado_pausar` é do PR 3; aqui só é chamada:

```sql
alter table public.private_conversations add column if not exists sair_pendente_at timestamptz;
  -- SAIR recebido de conversa sem telefone; vira opt-out e volta a nulo quando a conversa ganha telefone
create index if not exists private_messages_provider_message_idx
  on public.private_messages (tenant_id, provider_message_id) where provider_message_id is not null;  -- só se S6 não achou (o 1a já tem private_messages_provider_unique)
public.privado_vincular_conversa(p_tenant uuid, p_conversa uuid, p_telefone text) returns jsonb
public.privado_registrar_mensagem(p_tenant uuid, p_instance uuid, p_m jsonb) returns jsonb
public.privado_registrar_status(p_tenant uuid, p_instance uuid, p_provider_id text, p_status text) returns jsonb
```

Toda leitura e escrita nas tabelas `private_*` filtra `tenant_id = p_tenant`. Erros de regra: `raise exception '<motivo>'` com a mensagem sendo exatamente o motivo (a Tarefa 4 compara o texto).

**`app.privado_pausar`** é do PR 3 (`(p_tenant uuid, p_instance uuid, p_motivo text) returns boolean`): pausa 24 h, grava `healthy_since = paused_until`, devolve `false` se já estava pausado (uma pausa e um aviso só, mesmo com chamadas paralelas) e, quando pausa agora, grava o aviso no sino (`notifications` `privado_pausa`, com os corpos de `sinais`, `entrega` e `restricao`). Este PR só a chama (passos 11 e 3 abaixo) e não grava aviso de pausa.

**`public.privado_vincular_conversa`**:
1. `public.phone_key(p_telefone)` nulo → `telefone_invalido`. O telefone gravado é só dígitos.
2. Conversa `p_conversa` da loja, `for update`; não achou → `conversa_nao_encontrada`.
3. Já tem telefone: mesma `phone_key` → devolve ela (`mesclou false`, `sair_aplicado_em` nulo); outra → `ja_identificada`.
4. Destino = outra conversa da mesma instância com essa `phone_key`, `for update`.
5. Sem destino: grava `phone` na própria; ela é o destino.
6. Com destino (mescla): guarda o `lid` da origem e solta (`lid = null` — o único é por número); move as mensagens (`conversation_id = destino`, `phone = coalesce(phone, destino.phone)`); o destino fica com `lid = coalesce(destino.lid, lid guardado)`, `unread` somado, `status = 'precisa_de_voce'` se qualquer uma estava, `greatest()` em `last_inbound_at` e `last_message_at`, `last_preview` da que tem `last_message_at` maior, `contact_name = coalesce(destino, origem)`, `sair_pendente_at = coalesce(destino, origem)`; apaga a origem.
7. Destino com `sair_pendente_at`: `private_optouts (tenant_id, phone = destino.phone, module, at = now())` `on conflict do nothing`, com `module` = o da última mensagem `author in ('automatico','pessoa')` da conversa ou, sem nenhuma, `'recuperar'` se `recuperar_enabled`, senão `'rastreio'`; `status = 'encerrada'`; `sair_pendente_at = null`; `sair_aplicado_em` = o valor que estava.
8. Devolve `{conversation_id, mesclou, sair_aplicado_em}`.

**`public.privado_registrar_mensagem`** (chaves de `p_m` e do retorno: tabela da Tarefa 4):
1. Instância `p_instance` da loja com `purpose = 'privado'`; senão `instancia_invalida`.
2. `autor = 'celular'` e já existe mensagem da loja com esse `provider_message_id` e `author in ('automatico','pessoa')` → `{"ignorada": true}` (eco de mensagem da Girumo).
3. Reentrega: já existe mensagem da loja com `dedupe_key = 'evo:' || provider_message_id` → `nova: false` com a conversa ATUAL dessa mensagem (pode ter mudado numa mescla), `status_anterior` nulo, `pausou` false, `sair_aplicado_em` nulo.
4. Conversa: por `(instance_id, lid)` se veio `lid`; não achou (ou não veio), por `(instance_id, phone_key = public.phone_key(telefone))` se veio `telefone`; `for update`.
5. Achou pelo `lid` uma conversa sem telefone e veio `telefone` com `public.phone_key(telefone)` não nulo → `privado_vincular_conversa(p_tenant, conversa, telefone)`; segue com a conversa devolvida, e o `sair_aplicado_em` dela vai no retorno. (Sem a chave, não chama: o `telefone_invalido` derrubaria a mensagem inteira.)
6. Achou pelo telefone, veio `lid` e a conversa não tem → grava o `lid`.
7. Não achou → `insert` (`tenant_id`, `instance_id`, `phone` = telefone, `jid`, `lid`, `contact_name` = nome quando cliente, `status 'aberta'`) `on conflict do nothing` e repete o passo 4 (duas mensagens da mesma pessoa nova ao mesmo tempo).
8. `module` = o da última mensagem `author in ('automatico','pessoa')` da conversa; sem nenhuma, `modulo_padrao`.
9. `insert` da mensagem: `tenant_id`, `conversation_id`, `module`, `direction` (`'entrada'` para cliente, `'saida'` para celular — S5), `author` = autor, `kind`, `text` = `left(texto, 4096)` (o TS já corta em `TEXTO_MAX`; acima disso o CHECK do 1a derrubaria a mensagem e o SAIR junto), `provider_message_id`, `dedupe_key = 'evo:' || provider_message_id`, `status` (`'entregue'` para cliente, `'enviada'` para celular), `phone` = o da conversa; `on conflict do nothing returning id`. Sem id → igual ao passo 3.
10. Efeito na conversa:

| Caso | Efeito |
|---|---|
| todos | `last_message_at = greatest(last_message_at, enviada_em)`; `last_preview = left(preview, 200)` quando `preview` não é nulo e `enviada_em >= coalesce(last_message_at, '-infinity')` (valor de antes) |
| cliente | `last_inbound_at = greatest(last_inbound_at, enviada_em)`; `contact_name = coalesce(contact_name, nome)` |
| cliente, `sair`, conversa com telefone | `status = 'encerrada'`; `private_optouts (tenant_id, phone = conversa.phone, module, at = now(), message_ref = id da mensagem)` `on conflict do nothing` |
| cliente, `sair`, conversa sem telefone | `sair_pendente_at = coalesce(sair_pendente_at, now())`; com `atende`: `status = 'precisa_de_voce'`, `unread + 1` |
| cliente, `resposta` ou `recusa`, com `atende` | `status = 'precisa_de_voce'`, `unread + 1` |
| celular | só a primeira linha |

11. Cliente com `tipo` `sair` ou `recusa`: `private_signals (tenant_id, instance_id, kind = tipo, at = now(), message_ref = id da mensagem)`; com 3 ou mais sinais da instância em `at > now() - interval '24 hours'` → `pausou := app.privado_pausar(p_tenant, p_instance, 'sinais')`.
12. Devolve `{ignorada: false, nova: true, conversation_id, message_id, telefone (phone da conversa), contact_name, status_anterior (o de antes do passo 10; conversa criada no passo 7 = 'aberta'), modulo, pausou, sair_aplicado_em}`.

**`public.privado_registrar_status`**:
1. `p_status` fora de `null`, `'entregue'`, `'lida'` → `status_invalido`.
2. Com status: `update private_messages set status = p_status where tenant_id = p_tenant and provider_message_id = p_provider_id and status = any(<anteriores>)`, com anteriores de `entregue` = `{na_fila, enviada}` e de `lida` = `{na_fila, enviada, entregue}`. Nunca volta, nunca mexe em `falhou`/`cancelada`. `atualizou` = alguma linha mudou.
3. Taxa de entrega (sempre, com ou sem status): instância pausada (`paused_until > now()`) → não avalia. Amostra = as 20 mensagens mais recentes da instância (`join private_conversations` por `instance_id`) com `author in ('automatico','pessoa')` e `provider_message_id` não nulo, cuja hora de saída `coalesce(engine_commands.completed_at, private_messages.created_at)` (`left join` por `command_id`) está entre `coalesce(healthy_since, '-infinity')` e `now() - interval '1 hour'`, da mais nova para a mais velha. Exatamente 20 na amostra e menos de 12 em `entregue`/`lida` (abaixo de 60%) → `pausou := app.privado_pausar(p_tenant, p_instance, 'entrega')`.
4. Devolve `{atualizou, avaliadas, entregues, pausou}`.

- [ ] **Step 1: Write the check** `infra/tests/privado-resposta-check.sql`, no molde de `infra/tests/antiban-saidas-e-todos-check.sql`: cabeçalho com os comandos de rodar; tudo entre `begin;` e `rollback;`; cada bloco num `do $$ … $$` que levanta `'FALHOU: <o quê>'`; sem erro, a última linha devolve `r = 'ok'`. Montagem: loja `7e710000-0000-4000-8000-000000000001` com `tenant_settings.recuperar_enabled = true` e instância `privado` conectada `…e1`; loja `7e720000-0000-4000-8000-000000000001` com instância `privado` `…e2` (blocos 10 e 14); na loja 7e71, conversa A (`5511987650001`, lid nulo) com duas mensagens da Girumo (`author` `automatico`, `module` `rastreio`, `provider_message_id` `G-1` e `G-2`, `status` `enviada`). Os inserts de montagem seguem as colunas obrigatórias que S1–S8 mostraram.

| Bloco | Faz | Confere |
|---|---|---|
| 1 Contrato | — | as três funções deste PR e a `app.privado_pausar(uuid,uuid,text)` do PR 3 existem, `prosecdef`, com `search_path=` em `proconfig`, EXECUTE do `service_role` e de mais ninguém (`anon`, `authenticated`, `public` via `aclexplode`); `private_conversations.sair_pendente_at` existe |
| 2 Telefone sem o 9 | `registrar` cliente/`resposta`/`atende` com telefone `551187650001`, id `R-1`; de novo, igual | 1ª: `nova`, conversa A, `unread` 1, `precisa_de_voce`, `last_inbound_at` = `enviada_em`, `modulo` `rastreio`, mensagem com `text`, `author` `cliente`, `status` `entregue`, `dedupe_key` `evo:R-1`. 2ª: `nova` false, `unread` 1, uma linha só |
| 3 Aprende o lid | telefone `5511987650001` + lid `100000000000777@lid`; depois só o lid | A.lid gravado; a segunda cai em A |
| 4 Não identificada | lid `100000000000888@lid`, sem telefone, nome `Bia` | conversa B nova: `phone` nulo, lid, `contact_name` `Bia`, `precisa_de_voce`, `unread` 1 |
| 5 SAIR sem telefone | B manda `sair` | `B.sair_pendente_at` preenchido; um `private_signals` `sair`; nenhum `private_optouts` |
| 6 Vincular | `vincular(B, '5521987650002')`; de novo igual; com `5531900000000`; `'123'`; conversa inexistente | devolve B, `mesclou` false, `sair_aplicado_em` = o pendente; B com telefone; opt-out de `phone_key('5521987650002')` com `module` `recuperar`; `sair_pendente_at` nulo; B `encerrada`. Repetido igual → B de novo; outro telefone → `ja_identificada`; `'123'` → `telefone_invalido`; inexistente → `conversa_nao_encontrada` |
| 7 Mescla | C (`5531987650003`, `unread` 1, mensagem da Girumo `module` `recuperar`) e D (lid `100000000000999@lid`, sem telefone, 2 respostas, `unread` 2); `vincular(D, '5531987650003')` | devolve C, `mesclou` true; D não existe; as 2 mensagens estão em C; `C.unread` 3; `C.lid` = o de D |
| 8 Identificação automática | E (lid `100000000000555@lid`, sem telefone) manda `sair`; depois resposta com telefone `5541987650004` + o mesmo lid | a 2ª devolve `sair_aplicado_em` preenchido; E com telefone; opt-out de `5541987650004` |
| 9 SAIR com telefone | A manda `sair` | opt-out de A com `module` `rastreio`; A `encerrada`; `unread` igual ao de antes; sinal `sair` |
| 10 Pausa por sinais | loja 7e72: 3 recusas de 3 telefones; uma 4ª | a 3ª devolve `pausou` true; `paused_until` entre `now() + 23 h 59 min` e `now() + 24 h 01 min`; `pause_reason` `sinais`; `healthy_since = paused_until`; um `notifications` `privado_pausa` (gravado pela `app.privado_pausar` do PR 3). A 4ª: `pausou` false e continua um aviso só |
| 11 Celular | celular com id `G-1`; celular com id `C-1` | `G-1` → `ignorada` true; `C-1` → `author` `celular`, `status` `enviada`, `unread` e `last_inbound_at` de A sem mudança |
| 12 Loja sem atendimento | `atende` false, `texto` nulo | mensagem com `text` nulo; `status` e `unread` da conversa sem mudança; `last_inbound_at` atualizado |
| 13 Status | `G-2` → `lida`; depois `entregue`; id desconhecido; `'xyz'` | `atualizou` true e fica `lida`; depois `atualizou` false e continua `lida`; desconhecido → false; `'xyz'` → `status_invalido` |
| 14 Taxa de entrega | loja 7e72 com o estado zerado (`paused_until` e `healthy_since` nulos): 20 mensagens da Girumo com id e `created_at = now() - 2 h`, 11 `entregue`; `registrar_status(null)`. Zera; 12 `entregue`. Zera; 19 mensagens. Com `healthy_since = now() + 24 h` | 11 → `avaliadas` 20, `entregues` 11, `pausou` true, `pause_reason` `entrega`. 12 → `pausou` false. 19 → `avaliadas` 19, `pausou` false. Depois da pausa → `avaliadas` 0 |

- [ ] **Step 2: Run the check em dev para ver o RED** (de `apps\web`, dev ligado)

```powershell
npx supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
npx supabase db query --linked -o json -f ..\..\infra\tests\privado-resposta-check.sql
```

Expected: falha no bloco 1 (`FALHOU: …`: funções ausentes).

- [ ] **Step 3: Write the migration** com as regras acima. Cabeçalho: o que faz, "idempotente", "muda a baseline (`t|private_conversations` e as três `f|`)", e "conferir com `infra/tests/privado-resposta-check.sql` nos dois bancos". No fim de `deploy/supabase/apply-order.txt`:

```
# <DD/MM>: PR 4 do Recuperar (resposta 1:1 e status do número do atendimento): privado_registrar_mensagem, privado_registrar_status, privado_vincular_conversa e private_conversations.sair_pendente_at (a pausa usa a app.privado_pausar do PR 3). Muda a baseline.
apps/web/supabase/migrations/20261030140000_privado_resposta.sql
```

- [ ] **Step 4: Gate local, commit, push e PR em rascunho** (o `migrate-dev` só roda com o PR aberto)

```powershell
Set-Location C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\privado-resposta
& .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
git add apps/web/supabase/migrations deploy/supabase/apply-order.txt infra/tests/privado-resposta-check.sql
git commit -m "feat(db): RPCs for 1:1 replies, delivery status and conversation linking" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push -u origin feat/privado-resposta
gh pr create --draft --base main --repo codingB0y/Girumo --title "feat(privado): 1:1 replies, SAIR and delivery status on the attendance number (Recuperar PR 4)" --body-file <corpo.md no scratchpad>
```

Expected: `EXIT=0`. O corpo do PR leva a tabela da Fase 0 (Tarefa 1), os textos para revisão do Igor, o aviso aos PRs 7 e 8 (registro `CONSUMIDORES_DE_RESPOSTA`; usar o `conversationId` devolvido pelo vincular) e termina com a linha de atribuição de PR da sessão.

- [ ] **Step 5: Depois do `migrate-dev` verde, rodar o check de novo**

Run: o comando do Step 2.
Expected: última linha `r = ok`.

- [ ] **Step 6: Baseline** — `npm run schema:baseline` com `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` de dev (dev = prod + esta migração). Sem credencial de dev na máquina: em dev, `select json_object_agg(kind || '|' || nome, sig order by kind || '|' || nome collate "C") as r from public.schema_signature() where (kind = 't' and nome = 'private_conversations') or (kind = 'f' and nome like 'privado\_%' and nome not like 'privado\_pausar(%');` e trocar só essas chaves em `objetos` (quatro: a tabela e as três funções; a `privado_pausar` já está na baseline desde o PR 3 e não muda). Commit e push:

```powershell
git add deploy/supabase/schema-baseline.json
git commit -m "chore(db): schema baseline for the private reply RPCs" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push
```

Expected: job `drift` verde.

---

### Task 9: Fechamento

**Files:** nenhum novo (só correções que a revisão pedir).

**Depends-on:** 1 a 8

- [ ] **Step 1: Suíte inteira e tipos**

Run: `npm --workspace apps/web test`, `TSC` (as duas vezes), `npm --workspace apps/worker exec tsc -- --noEmit` (o worker não muda aqui, mas usa as mesmas tabelas), `LINT`.
Expected: `# fail 0`; os três `tsc` sem saída; lint sem erro.

- [ ] **Step 2: Revisão de segurança** — agente Security Engineer sobre `git diff origin/main...HEAD`. Foco: o webhook como fronteira de confiança (validação antes de usar, nada do número do atendimento em `engine_events`, nenhum texto, telefone ou LID em log, erro ou sino), a ACL das três funções, `tenant_id` em toda leitura e escrita (TS e SQL), a rota do vincular (guarda do add-on, papel, validação). Corrigir CRITICAL e HIGH antes de seguir.

- [ ] **Step 3: Gate local, tirar do rascunho, CI verde, merge à mão**

```powershell
& .\infra\scripts\verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
git push
gh pr ready <N> --repo codingB0y/Girumo
gh pr checks <N> --repo codingB0y/Girumo
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

Expected: `EXIT=0`; todos os checks verdes (`migrate-dev`, `drift`, `e2e` incluídos) antes do merge. O merge dispara o `migrate-prod`.

- [ ] **Step 4: Prod** — depois do `migrate-prod` verde, pedir ao Igor que rode o check em prod (escreve dentro de `begin … rollback`, então em prod é dele): `npx supabase link --project-ref nidoatbxaylrkcgbszns --yes` e o comando do Step 2 da Tarefa 8. Expected: `r = ok`.

- [ ] **Step 5: Quadro e grafo** — em prod, `select public.move_card('recuperar-yampi', 'em_construcao', 'PR 4 (resposta 1:1 e status do número do atendimento) mergeado: SAIR, sinais, pausa e status por id; falta o PR 7 consumir a resposta', 'PR #<N>');` e `update public.board_features set blocker = 'Falta o PR 7 (Pix automático) ligar o caso à resposta' where key = 'recuperar-yampi';`. Sugerir ao Igor (PowerShell): `rag insert "decisão: resposta 1:1 do número do atendimento é gravada numa transação no banco (privado_registrar_mensagem); o resto é idempotente e roda de novo na reentrega da Evolution" --source decisao-<AAAA-MM-DD>`.

- [ ] **Step 6: Encerrar** — apagar o worktree (desarmar as junctions antes) e reportar "PRs que deixei abertos: …" (ou "nenhum").
