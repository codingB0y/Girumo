# Rastreio do pedido — PR 5: WhatsApp (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada aviso `whatsapp` do Rastreio sai pelo número do atendimento da loja com o texto fixo da etapa; o status
volta da base; o que falhar vira e-mail no lugar; "parar avisos" cancela o que ainda está na fila.

**Architecture:** `mensagens.ts` (puro) monta o texto exato do spec §1.4. `enviar-whatsapp.ts` enfileira cada aviso
`pendente` com `enfileirarDm` (base do privado) e guarda o id da `private_messages`; depois lê `statusDosDms` dos
avisos `enviando` e, na falha, cria o aviso `email` da etapa e o manda pelo PR 4. Ganchos: o registro enfileira logo
depois de criar o aviso, o cron roda os dois passos e o "parar avisos" do PR 3 cancela os DMs na fila. Dependências
por parâmetro (molde `DepsBio` de `lib/bio/rota-publica.ts`).

**Tech Stack:** TypeScript strict, `tsx --test` (node:test) com deps falsas e PostgREST falso, base do privado
(`@/lib/privado/dm`), e-mail do PR 4.

**Spec:** `docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md` (§0, §1.2, §1.4, §3.4, §6). Base: spec do
Recuperar (`git show 6655d66d:docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md`, "Envio (worker)",
"Resposta da cliente", "Base do privado").
Índice: `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md` — Contrato, Global Constraints e Review Focus valem aqui.

## Antes de começar

- Branch `feat/rastreio-pr5-whatsapp`, worktree novo a partir de `origin/main` (junctions do "Ambiente do worktree"
  do índice). Mais de ~20 commits atrás → atualizar antes de escrever código.
- Em `main`: PRs 1, 2, 3 e 4 (as três partes) do Rastreio, B·2, B·3 e B·4 da base e, pela ordem do índice, o 6.
  Conferir (raiz do repo):

  ```powershell
  git fetch origin main
  git grep -nE "export ((async )?(function|const) (enfileirarDm|statusDosDms|cancelarDms)|type (ParteDm|StatusDm))" origin/main -- apps/web/src/lib/privado
  git grep -nE "export (async )?(function|const) (criarAvisos|avisosParaEnviar|avisosEnviando|marcarAviso|lerPedido|pararAvisos|lojaDoRastreio|linkDoPedido|enviarAvisoPorEmail|registrarPedidoDaYampi|rodarCronRastreio|responderParar|previaDoWhatsapp)" origin/main -- apps/web/src/lib
  ```

  Expected: as três funções, `ParteDm` e `StatusDm` em `lib/privado/dm.ts`; os 13 nomes do Rastreio. Faltou um dos
  12 primeiros → o PR 5 não começa. Faltou só `previaDoWhatsapp` (o PR 6 ainda não entrou) → a parte de `previas.ts`
  da Task 1 sai daqui: o PR 6 encontra `mensagens.ts` em `main` e chama direto (o plano dele prevê os dois casos).
- Contrato da base: conferir em `main`, ou no plano `docs/superpowers/plans/2026-10-29-recuperar-yampi-03-envio-de-dm.md`
  (branch `docs/recuperar-spec`), que `enfileirarDm` recebe `partes: ParteDm[]` e devolve `{ messageIds: string[] }`
  ou `{ recusado: "sem_numero" | "modulo_desligado" | "bloqueado" }`, com os mesmos ids para a mesma `dedupeKey`; que
  `statusDosDms` devolve `Record<string, StatusDm>` (só o status; o DM vencido vira `cancelada`) e `cancelarDms`, um
  `number`. Nome ou forma diferente → trocar neste plano e no código, no mesmo PR, e anotar no PR.
- Teste de um arquivo (raiz): `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test <arquivo>`.

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| Create `apps/web/src/lib/rastreio/mensagens.ts` (+ `.test.ts`) | texto exato por etapa; puro, sem `server-only` |
| Modify `apps/web/src/lib/rastreio/previas.ts` (+ teste) | o "Ver mensagem" do PR 6 passa a mostrar o texto de verdade |
| Create `apps/web/src/lib/rastreio/enviar-whatsapp.ts` (+ `.test.ts`) | enfileirar, ler status, e-mail no lugar, cancelar a fila do pedido parado |
| Modify `apps/web/src/lib/stores/rastreio-avisos.ts` (+ teste) | `pularWhatsappsDoPedido` |
| Modify `apps/web/src/lib/rastreio/registrar.ts`, `cron.ts` (+ testes) | aviso `whatsapp` criado entra na fila na hora; passos no cron |
| Modify `apps/web/src/lib/rastreio/rota-publica.ts` (+ teste) | o `responderParar` do PR 3 cancela os DMs na fila |

Sete de código e os testes deles. Nenhuma migração, nenhuma rota nova (`API_CONTRACTS.md` não muda).

### Task 1: Texto do WhatsApp por etapa

**Files:** Create `apps/web/src/lib/rastreio/mensagens.ts`, `apps/web/src/lib/rastreio/mensagens.test.ts`; Modify
`apps/web/src/lib/rastreio/previas.ts` e `apps/web/src/components/painel/rastreio/rastreio-config-painel.test.ts` (onde
o PR 6, Task 10, afirma `previaDoWhatsapp(…) === null`; se ele pôs essa asserção noutro arquivo, nesse).

**Interfaces:**
- Consumes: `EtapaComAviso`, `ETAPAS_COM_AVISO` (`@/lib/rastreio/tipos`, PR 1); `previaDoWhatsapp(etapa, d: DadosDaPrevia)`
  e `DADOS_DE_EXEMPLO` (PR 6).
- Produces: `mensagemWhatsapp(etapa: EtapaComAviso, d: { primeiroNome: string | null; numero: string; loja: string; servico: string | null; codigo: string | null; link: string; numeroDaLoja: string | null }): string`
  (índice); `enviado` com `codigo` nulo lança `Error("aviso enviado sem código")`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
const LINK = "https://www.girumo.com.br/rastreio/loja-exemplo/0f3c9a7d2b6e4a1c8f5d7e9b1a3c5e7f";
const D = { primeiroNome: "Ana", numero: "1532", loja: "Loja Exemplo", servico: "SEDEX", codigo: "AB123456789BR", link: LINK, numeroDaLoja: "+55 11 91234-5678" };
const R = "\n\nAviso automático de pedido · para parar, use o link acima";

test("cada etapa tem o texto exato do spec, e o rodapé só vai com link", () => {
  assert.equal(mensagemWhatsapp("enviado", D), `Oi, Ana! Seu pedido nº 1532 da Loja Exemplo foi enviado (SEDEX). Código de rastreio: AB123456789BR. Acompanhe aqui: ${LINK}${R}`);
  assert.equal(mensagemWhatsapp("retirada", D), `Seu pedido nº 1532 da Loja Exemplo está pronto para retirada. Detalhes: ${LINK}${R}`);
  assert.equal(mensagemWhatsapp("problema", D), `A transportadora não conseguiu entregar o pedido nº 1532 da Loja Exemplo. A loja já foi avisada e vai falar com você. Detalhes: ${LINK}${R}`);
  assert.equal(mensagemWhatsapp("entregue", D), "Seu pedido nº 1532 da Loja Exemplo foi entregue. Se alguma peça não estiver certa, fale com a loja: +55 11 91234-5678");
  assert.equal(mensagemWhatsapp("confirmado", D), `Recebemos o pagamento do pedido nº 1532 da Loja Exemplo. Acompanhe: ${LINK}${R}`);
});

test("sem nome é Olá!, sem serviço some o parêntese, entregue sem número da loja", () => {
  assert.equal(mensagemWhatsapp("enviado", { ...D, primeiroNome: null, servico: null }),
    `Olá! Seu pedido nº 1532 da Loja Exemplo foi enviado. Código de rastreio: AB123456789BR. Acompanhe aqui: ${LINK}${R}`);
  assert.equal(mensagemWhatsapp("entregue", { ...D, numeroDaLoja: null }),
    "Seu pedido nº 1532 da Loja Exemplo foi entregue. Se alguma peça não estiver certa, fale com a loja.");
  assert.match(mensagemWhatsapp("enviado", { ...D, primeiroNome: "Lúcia" }), /^Oi, Lúcia! /);
  assert.match(mensagemWhatsapp("enviado", { ...D, primeiroNome: "Ana-Maria" }), /^Oi, Ana-Maria! /);
});

test("nome que não é só letras vira Olá!; nunca @; no máximo um link", () => {
  for (const nome of ["Ana@golpe.com", "Ana golpe.com", "Ana1", "A".repeat(21), ""])
    assert.match(mensagemWhatsapp("enviado", { ...D, primeiroNome: nome }), /^Olá! /);
  for (const etapa of ETAPAS_COM_AVISO) {
    const texto = mensagemWhatsapp(etapa, { ...D, loja: "@Loja Exemplo" });
    assert.equal(texto.includes("@"), false);
    assert.equal(texto.split("https://").length - 1, etapa === "entregue" ? 0 : 1);
  }
  assert.throws(() => mensagemWhatsapp("enviado", { ...D, codigo: null }), /sem código/);
});
```

  No teste da prévia (PR 6), o `null` do WhatsApp vira o início exato do texto: `previaDoWhatsapp("enviado", …)`
  começa com `"Oi, Ana! Seu pedido nº 1541 da Loja Exemplo foi enviado (PAC). Código de rastreio: AB123456789BR. Acompanhe aqui: "`.

- [ ] **Step 2: Rodar e ver falhar** — `src/lib/rastreio/mensagens.test.ts` e o teste da prévia. Expected: FAIL,
  `Cannot find module './mensagens'` e a prévia ainda `null`.
- [ ] **Step 3: Implementar** — `switch` exaustivo em `etapa`, com `pedido nº ${numero} da ${loja}` nos cinco modelos.
  `Oi, ${nome}!` só se o nome casar com `/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]{0,19}$/` (a regra do primeiro nome em
  `pedido-yampi.ts`, PR 2; se ela estiver exportada lá, importar), senão `Olá!`: o primeiro nome é a única parte do
  texto que um terceiro escreve, e esta é a última porta antes do número da loja. Serviço vira ` (${servico})` ou nada.
  Rodapé = `"\n\n"` + "Aviso automático de pedido · para parar, use o link acima" nos quatro modelos com link. O texto
  final passa por `.replace(/@/g, "")` (o link é nosso e não tem `@`). Em `previas.ts`, `previaDoWhatsapp` troca o
  `null` por `mensagemWhatsapp(etapa, d)` (as 3 linhas que o PR 6 reservou).
- [ ] **Step 4: Rodar e ver passar** — os dois testes e os dois `tsc` do índice. Expected: verde.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/rastreio/mensagens.ts apps/web/src/lib/rastreio/mensagens.test.ts apps/web/src/lib/rastreio/previas.ts apps/web/src/components/painel/rastreio/rastreio-config-painel.test.ts
git commit -m "feat(rastreio): fixed WhatsApp text per order stage" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: Enfileirar os avisos e o e-mail no lugar

**Files:** Create `apps/web/src/lib/rastreio/enviar-whatsapp.ts`, `apps/web/src/lib/rastreio/enviar-whatsapp.test.ts`

**Interfaces:**
- Consumes: `avisosParaEnviar`, `marcarAviso`, `criarAvisos` (`@/lib/stores/rastreio-avisos`, PR 1); `lerPedido`
  (`@/lib/stores/rastreio-pedidos`, PR 1); `lojaDoRastreio`, `linkDoPedido` (`@/lib/rastreio/loja`, `link`, PR 2);
  `enviarAvisoPorEmail` (`@/lib/rastreio/enviar-email`, PR 4: nunca lança e reconfere loja ligada, plano e "parar
  avisos"); `enfileirarDm` (`@/lib/privado/dm`, sem `autor`: o padrão é automático); `formatPhoneBR` (`@/lib/phone`,
  já existe); `mensagemWhatsapp` (Task 1).
- Produces:
  - `const DEPS = { avisosParaEnviar, marcarAviso, criarAvisos, lerPedido, lojaDoRastreio, enviarAvisoPorEmail, enfileirarDm }`
    (as Tasks 3 e 4 acrescentam) e `export type DepsWhatsapp = typeof DEPS`.
  - `enviarWhatsappsPendentes(tenantId: string, agora: Date, limite = LOTE, deps: DepsWhatsapp = DEPS): Promise<number>`
    — quantos entraram na fila. `LOTE = 50`, `VALIDADE_MS = 24 * 60 * 60 * 1000`, `RETENTATIVA_MS = 5 * 60 * 1000`,
    `TENTATIVAS = 3`.
  - Códigos em `tracking_notices.error`: `pulado` com `parado`, `sem_codigo`, `sem_loja`; `falhou` com `sem_telefone`,
    `erro_na_fila`, a recusa da base como veio (`sem_numero`, `modulo_desligado`, `bloqueado`) e, pela Task 3, o
    status da base como veio (`falhou`, `cancelada`) ou `sem_status`; `pendente` com `erro_na_fila` na retentativa.

- [ ] **Step 1: Escrever os testes que falham**

`cenario(o)` monta deps falsas que gravam cada chamada em `filas`, `marcados` (`[avisoId, patch]`), `criados`
(`[tenantId, orderId, etapa, canais]`) e `emails`. Padrão: aviso `{ id: "aviso-1", orderId: "pedido-1", etapa: "enviado", canal: "whatsapp", attempts: 0, resends: 0, messageId: null }`;
`PedidoInterno` com `numero: "1532"`, `buyerFirstName: "Ana"`, `buyerPhone: "5511987654321"`,
`buyerEmailEnc: "selado"`, `trackingCode: "AB123456789BR"`, `shipmentService: "SEDEX"`,
`linkToken: TOKEN` (`"0f3c9a7d2b6e4a1c8f5d7e9b1a3c5e7f"`), `noticesStoppedAt: null`; `LOJA` com `tenantId: "loja-1"`,
`nome: "Loja Exemplo"`, `publicSlug: "loja-exemplo"`, `dominio: null`, `storeWhatsapp: "5511912345678"`;
`enfileirarDm` → `{ messageIds: ["dm-1"] }`; `criarAvisos` → `[{ id: "email-1", canal: "email" }]`;
`AGORA = new Date("2026-11-02T13:00:00Z")`.

- `"enfileira pela base com módulo, prioridade, validade de 24 h e dedupeKey com resends"` — avisos `aviso-1`
  (`resends: 0`) e `aviso-2` (`resends: 2`) ⇒ `filas[0]` deepEqual `{ tenantId: "loja-1", modulo: "rastreio", telefone: "5511987654321", partes: [{ texto: mensagemWhatsapp("enviado", { primeiroNome: "Ana", numero: "1532", loja: "Loja Exemplo", servico: "SEDEX", codigo: "AB123456789BR", link: linkDoPedido(LOJA, TOKEN), numeroDaLoja: "+55 11 91234-5678" }) }], prioridade: "pedido", validoAte: new Date("2026-11-03T13:00:00Z"), dedupeKey: "rastreio:aviso-1:0" }`;
  `filas[1].dedupeKey === "rastreio:aviso-2:2"`; os dois marcados `{ status: "enviando", messageId: "dm-1", error: null }`;
  retorno 2.
- `"recusa da base vira e-mail no lugar"` — `{ recusado: "bloqueado" }` ⇒ `marcados`
  `[["aviso-1", { status: "falhou", error: "bloqueado" }]]`, `criados` `[["loja-1", "pedido-1", "enviado", ["email"]]]`,
  `emails` `["email-1"]`, retorno 0. No mesmo teste: `buyerEmailEnc: null` ⇒ `criados` vazio; `criarAvisos` → `[]`
  (o e-mail da etapa já existe) ⇒ `emails` vazio.
- `"pedido sem telefone: nenhuma chamada à base, falhou e e-mail no lugar"` — `buyerPhone: null` ⇒ `filas` vazio,
  `{ status: "falhou", error: "sem_telefone" }`, `emails` `["email-1"]`.
- `"pulado sem chamar a base: pedido parado, enviado sem código, loja sem config"` — `noticesStoppedAt` preenchido ⇒
  `{ status: "pulado", error: "parado" }`; `trackingCode: null` ⇒ `"sem_codigo"`; `lojaDoRastreio` → `null` ⇒
  `"sem_loja"`; `filas` e `criados` vazios nos três.
- `"erro ao enfileirar volta pendente em 5 min; com 3 tentativas vira e-mail"` — `enfileirarDm` rejeitando ⇒
  `{ status: "pendente", error: "erro_na_fila", somarTentativa: true, nextTryAt: "2026-11-02T13:05:00.000Z" }`; aviso
  com `attempts: 3` ⇒ `filas` vazio, `{ status: "falhou", error: "erro_na_fila" }`, `emails` `["email-1"]`.

- [ ] **Step 2: Rodar e ver falhar** — `src/lib/rastreio/enviar-whatsapp.test.ts`. Expected: FAIL, `Cannot find module './enviar-whatsapp'`.
- [ ] **Step 3: Implementar** (`import "server-only"`; `DEPS` com as funções reais). `enviarWhatsappsPendentes`:
  `avisosParaEnviar(tenantId, "whatsapp", limite, agora)`, vazio → 0; `lojaDoRastreio` uma vez. Por aviso, num `try`,
  vale a primeira regra que casar:
  1. `lerPedido` nulo → próximo (purgado: o aviso foi junto, em cascata);
  2. sem loja → `pulado` `sem_loja`; `noticesStoppedAt` → `pulado` `parado`; `enviado` sem `trackingCode` → `pulado`
     `sem_codigo` (spec §1.1: "enviado" só sai com código);
  3. sem `buyerPhone` → `falhar(…, "sem_telefone")`; `attempts >= TENTATIVAS` → `falhar(…, "erro_na_fila")`;
  4. `enfileirarDm` com os campos do primeiro teste — texto de `mensagemWhatsapp` com
     `link: linkDoPedido(loja, pedido.linkToken)` e `numeroDaLoja: formatPhoneBR(loja.storeWhatsapp)`, `validoAte` =
     `agora + VALIDADE_MS`, `dedupeKey` = `` `rastreio:${aviso.id}:${aviso.resends}` `` — e então `recusado` →
     `falhar(…, r.recusado)`; senão `marcarAviso({ status: "enviando", messageId: r.messageIds[0], error: null })` e conta.

  `catch`: `console.error` só com o id do aviso e `e.message` (telefone, e-mail e texto nunca no log) e
  `marcarAviso({ status: "pendente", error: "erro_na_fila", somarTentativa: true, nextTryAt: agora + RETENTATIVA_MS })`.

```ts
/** E-mail no lugar (spec §1.2): o mesmo aviso em outro canal. Pedido parado vira `pulado`, sem e-mail. */
async function falhar(tenantId: string, aviso: AvisoParaEnviar, pedido: PedidoInterno, motivo: string, deps: DepsWhatsapp): Promise<void> {
  if (pedido.noticesStoppedAt) return deps.marcarAviso(tenantId, aviso.id, { status: "pulado", error: "parado" });
  const criados = pedido.buyerEmailEnc ? await deps.criarAvisos(tenantId, aviso.orderId, aviso.etapa, ["email"]) : [];
  await deps.marcarAviso(tenantId, aviso.id, { status: "falhou", error: motivo });
  for (const c of criados) await deps.enviarAvisoPorEmail(tenantId, c.id);
}
```

  Se algo cair no meio de `falhar`, o aviso continua onde estava e a próxima rodada refaz: o `unique (order_id, etapa,
  channel)` segura o e-mail, e o que não saiu na hora fica `pendente` para o passo de e-mail do cron (PR 4).
- [ ] **Step 4: Rodar e ver passar** — o arquivo e os dois `tsc`. Expected: verde.
- [ ] **Step 5: Commit** — `git add` dos dois arquivos;
  `git commit -m "feat(rastreio): queue order WhatsApp notices through the private number" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

### Task 3: Status da base e falha que vira e-mail

**Files:** Modify `apps/web/src/lib/rastreio/enviar-whatsapp.ts`, `apps/web/src/lib/rastreio/enviar-whatsapp.test.ts`

**Interfaces:**
- Consumes: `avisosEnviando` (PR 1); `statusDosDms`, `StatusDm` (`@/lib/privado/dm`); `falhar` (Task 2).
- Produces: `atualizarStatusWhatsapp(tenantId: string, agora: Date, deps: DepsWhatsapp = DEPS): Promise<number>` —
  quantos avisos mudaram. `DEPS` ganha `avisosEnviando` e `statusDosDms`.

- [ ] **Step 1: Escrever os testes que falham** (o `cenario()` ganha as deps novas)
  - `"status da base mapeado no aviso"` — oito avisos `enviando`: `aviso-1`…`aviso-7` com `dm-1`…`dm-7` e `aviso-8`
    com `messageId: null`; `statusDosDms` → `{ "dm-1": "na_fila", "dm-2": "enviada", "dm-3": "entregue", "dm-4": "lida", "dm-5": "falhou", "dm-6": "cancelada" }`
    (o `dm-7` a base não conhece) ⇒ uma chamada, com `["dm-1", …, "dm-7"]`; `aviso-1` sem marca; `aviso-2`, `-3`,
    `-4` ⇒ `{ status: "enviado" | "entregue" | "lido", sentAt: "2026-11-02T13:00:00.000Z" }`; `aviso-5`, `-6` ⇒
    `{ status: "falhou", error: "falhou" | "cancelada" }`; `aviso-7`, `-8` ⇒ `{ status: "falhou", error: "sem_status" }`;
    `criados` com quatro `["email"]`; retorno 7.
  - `"DM cancelado de pedido parado vira pulado, sem e-mail"` (o "parar" chegou entre a leitura dos avisos e a do
    status) — `cancelada` com `noticesStoppedAt` preenchido ⇒ `{ status: "pulado", error: "parado" }`, `criados` vazio.
- [ ] **Step 2: Rodar e ver falhar** — Expected: FAIL, `… atualizarStatusWhatsapp) is not a function`.
- [ ] **Step 3: Implementar**

```ts
// O que cada status da base faz com o aviso: status novo, falha (e-mail no lugar) ou nada (segue na fila).
const DO_DM: Record<StatusDm, "enviado" | "entregue" | "lido" | "falha" | null> = {
  na_fila: null, enviada: "enviado", entregue: "entregue", lida: "lido", falhou: "falha", cancelada: "falha",
};
```

  `avisosEnviando(tenantId, "whatsapp", LOTE)`; vazio → 0. Um `statusDosDms` com os `messageId` não nulos (`doDm`).
  Por aviso: `dm = aviso.messageId ? doDm[aviso.messageId] : undefined` e `r = dm ? DO_DM[dm] : "falha"` (sem id, ou
  id que a base não conhece: não há o que esperar); `null` → nada; `"falha"` → `lerPedido` (nulo → nada) e
  `falhar(…, dm ?? "sem_status")` (o `error` guarda o status como veio); senão
  `marcarAviso({ status: r, sentAt: agora.toISOString() })`. Cada aviso
  no seu `try/catch` (log só com o id; o aviso segue `enviando` e a próxima rodada lê de novo). No topo da função:
  `// ponytail: o aviso sai da leitura no primeiro estado depois da fila; "lido" que chega depois de "enviado" não sobe. Ler "enviado" por mais 24 h quando Entregas pedir.`
- [ ] **Step 4: Rodar e ver passar** — o arquivo e os dois `tsc`.
- [ ] **Step 5: Commit** — `git commit -m "feat(rastreio): read WhatsApp status and fall back to e-mail" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

### Task 4: "Parar avisos" cancela o que está na fila

**Files:** Modify `apps/web/src/lib/stores/rastreio-avisos.ts` e `rastreio-avisos.test.ts`; `enviar-whatsapp.ts` e o
teste; `apps/web/src/lib/rastreio/rota-publica.ts` e `rota-publica.test.ts` (o `responderParar` do PR 3).

**Interfaces:**
- Consumes: `cancelarDms` (`@/lib/privado/dm`); `pararAvisos` (PR 1, sem mudança; a dep `parar` do PR 3).
- Produces: `pularWhatsappsDoPedido(tenantId: string, orderId: string): Promise<string[]>` (store: passa a `pulado`, com
  `error: "parado"`, os avisos `whatsapp` em `enviando` do pedido e devolve os `message_id` não nulos deles);
  `cancelarWhatsappsDoPedido(tenantId: string, orderId: string, deps: DepsWhatsapp = DEPS): Promise<number>` (o que
  `cancelarDms` contou). `DEPS` ganha `pularWhatsappsDoPedido` e `cancelarDms`; `DepsRastreio` (PR 3) ganha
  `cancelarWhatsapps`.

Onde: no `responderParar` do PR 3, chamando a função deste PR — só `enviar-whatsapp.ts` importa a base do privado e
`pararAvisos` (PR 1, já em `main`) não muda. O aviso vira `pulado` antes do cancelamento, então a leitura de status
(Task 3) não o vê mais como `enviando`.

- [ ] **Step 1: Escrever os testes que falham**
  - store (PostgREST falso do arquivo): `"pularWhatsappsDoPedido pula os WhatsApp na fila do pedido da loja"` — um PATCH
    em `/rest/v1/tracking_notices` com `{ tenant_id: "eq.loja-a", order_id: "eq.o-1", channel: "eq.whatsapp", status: "eq.enviando", select: "message_id" }`,
    corpo `{ status: "pulado", error: "parado", updated_at }`; resposta `[{ "message_id": "dm-1" }, { "message_id": null }]`
    ⇒ `["dm-1"]`.
  - `"cancelarWhatsappsDoPedido cancela os DMs do pedido"` — ids `["dm-1", "dm-2"]` e `cancelarDms` → 2 ⇒
    `cancelarDms("loja-1", ["dm-1", "dm-2"])` e retorno 2; ids `[]` ⇒ `cancelarDms` não chamado e retorno 0.
  - `rota-publica.test.ts` (`cenario` do PR 3): `parar` devolvendo `{ orderId: "o-1" }` ⇒ `cancelarWhatsapps` uma vez,
    com `("loja-a", "o-1")`, e o mesmo 303 para `/rastreio/loja-exemplo/${TOKEN}`; `cancelarWhatsapps` rejeitando ⇒ o
    mesmo 303; `parar` → `null` ⇒ não chama. GET e HEAD seguem 405 sem chamar nada.
- [ ] **Step 2: Rodar e ver falhar** — os três arquivos. Expected: FAIL (funções ausentes; `cancelarWhatsapps` não chamado).
- [ ] **Step 3: Implementar** — store no molde de `marcarAviso` (mesmo cliente, `.eq("tenant_id", tenantId)`, erro
  lança, `.select("message_id")` no PATCH). `cancelarWhatsappsDoPedido`: `ids = pularWhatsappsDoPedido(…)`; vazio →
  0; senão `return cancelarDms(tenantId, ids)`. `responderParar`, logo depois de `parar` devolver `{ orderId }` e antes
  do 303: `await deps.cancelarWhatsapps(tenantId, parado.orderId)` com `.catch` que loga sem dado pessoal e segue — o
  "parar" já está gravado; se o cancelamento falhar, o DM que escapar sai uma vez. `DEPS` do PR 3 ganha
  `cancelarWhatsapps: cancelarWhatsappsDoPedido`.
- [ ] **Step 4: Rodar e ver passar** — os três arquivos e os dois `tsc`.
- [ ] **Step 5: Commit** — `git commit -m "feat(rastreio): stopping notices cancels queued WhatsApp messages" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

### Task 5: Ganchos no registro e no cron

**Files:** Modify `apps/web/src/lib/rastreio/registrar.ts`, `apps/web/src/lib/rastreio/cron.ts` e os testes deles.

**Interfaces:**
- Consumes: `enviarWhatsappsPendentes`, `atualizarStatusWhatsapp` (Tasks 2–3). Nenhuma assinatura muda.
  `DepsRegistrar` (PR 2; o PR 4 pôs `enviarEmail`) ganha `enviarWhatsapps`; `DepsCron` (PR 2) ganha `enviarWhatsapps`
  e `atualizarWhatsapps`.

- [ ] **Step 1: Escrever os testes que falham** (nos harness do PR 2, ao lado dos do gancho de e-mail do PR 4)
  - registrar: `"aviso whatsapp criado entra na fila na hora"` — `criarAvisos` devolvendo
    `[{ id: "a-wa", canal: "whatsapp" }, { id: "a-em", canal: "email" }]` ⇒ `enviarWhatsapps` uma vez, com o tenant e
    o `deps.agora()` do registro; só `email` ⇒ não chama; `enviarWhatsapps` rejeitando ⇒ `registrarPedidoDaYampi`
    devolve o mesmo `{ gravado, avisos }` (não lança).
  - cron: `"passos de WhatsApp por loja, fora do if da importação e antes do e-mail"` — duas lojas, a primeira sem
    Yampi conectada (`conexao` → `null`): nas duas, `enviarWhatsapps` e `atualizarWhatsapps` com `(tenantId, AGORA)`,
    antes do passo de e-mail; `enviarWhatsapps` lançando na primeira ⇒ `{ lojas: 2, falhas: 1 }` e o resto roda.
- [ ] **Step 2: Rodar e ver falhar** — Expected: FAIL (`enviarWhatsapps` nunca chamado).
- [ ] **Step 3: Implementar**
  - `registrar.ts`, logo depois do laço do PR 4 que manda os avisos `email` (chamada direta, não `after()`: o registro
    já roda no `after()` do aviso da Yampi e no cron): `if (avisos.some((a) => a.canal === "whatsapp")) await deps.enviarWhatsapps(tenantId, agora)`,
    com `.catch` que só loga o tenant — o pedido já está gravado, o cron tenta de novo em 5 min e o evento da Yampi não
    precisa ser repetido. Corrida com o cron: a `dedupeKey` devolve os mesmos ids.
  - `cron.ts`, no laço por loja, fora do `if (importada)` e **antes** do passo de e-mail:
    `await passo("whatsapp", tenantId, () => deps.enviarWhatsapps(tenantId, agora))` e
    `await passo("status do whatsapp", tenantId, () => deps.atualizarWhatsapps(tenantId, agora))` — o aviso criado pelo
    webhook sai mesmo com a API da loja fora, e um e-mail no lugar que não saiu na hora sai na mesma rodada.
- [ ] **Step 4: Rodar e ver passar** — os dois arquivos, `npm --workspace apps/web test` inteiro e os dois `tsc`.
- [ ] **Step 5: Commit** — `git commit -m "feat(rastreio): send WhatsApp notices on order events and in the cron" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

### Task 6: Fechamento do PR 5

- [ ] **Step 1: Gate local** — os quatro comandos do índice e
  `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1`. Expected: verde.
- [ ] **Step 2: Revisão de segurança** (agente Security Engineer) sobre `git diff origin/main...HEAD`. Este PR liga DM
  automática no número do atendimento — exceção à regra "nunca DM", só para aviso de pedido. Conferir: (a) nenhum
  envio fora de `enfileirarDm` (nada fala com a Evolution direto); (b) o primeiro nome é a única entrada de terceiro
  no texto: quem compra com o celular de outra pessoa não põe link nem `@` na boca do número da loja; (c) telefone,
  e-mail e texto fora de log (só ids); (d) `.eq("tenant_id")` na store nova e `cancelarDms` só com ids lidos da
  própria loja; (e) pedido parado não recebe DM nem e-mail no lugar; (f) corrida registro × cron segura pela
  `dedupeKey`. CRITICAL/HIGH corrigidos antes do merge.
- [ ] **Step 3: PR e merge** ("Fechamento de cada PR" do índice) — `git push -u origin feat/rastreio-pr5-whatsapp`;
  `gh pr create --base main --repo codingB0y/Girumo --title "feat(rastreio): order notices on WhatsApp (rastreio, PR 5)"`
  (resumo, spec, plano de teste, nomes trocados em relação ao índice e `🤖 Generated with [Claude Code](https://claude.com/claude-code)`);
  CI verde (`gh pr checks <N>`) → `gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo`, à mão.
- [ ] **Step 4: Card** — em prod:
  `update public.board_features set blocker = 'WhatsApp no ar (PR 5); falta a prova do PR 7', updated_at = now() where key = 'rastreio-pedidos';`.
  O status só muda com a prova do PR 7. Escrita em prod recusada pelo classificador → vai para os comandos do Igor.

## Decisões deste plano

- **E-mail no lugar respeita "parar avisos"** (parado → `pulado`, sem e-mail; o PR 4 ainda reconfere, com loja
  ligada e plano) e **não reaplica a janela de 3 dias**: ela decide se o aviso nasce (`canaisDoAviso`); o e-mail no
  lugar é o mesmo aviso em outro canal, no máximo 24 h + 5 min depois. Vale também para `bloqueado`: o SAIR é do
  WhatsApp, o aviso de pedido é execução do contrato e o spec diz "e-mail continua".
- **Cancelar no "parar" mora no `responderParar` do PR 3**, chamando `cancelarWhatsappsDoPedido`: só um arquivo do
  Rastreio importa a base, e a store `pararAvisos` não muda. O aviso vira `pulado` antes de cancelar.
- **Sem número do atendimento = recusa `sem_numero`** do `enfileirarDm`; `numeroDoAtendimento` não é chamado aqui (é do
  cartão do PR 6). Número caído ou pausado enfileira assim mesmo: o DM espera até 24 h, vira `cancelada` e só então
  e-mail (spec §6).
- **Erro ao enfileirar** volta `pendente` em 5 min e vira e-mail na 3ª vez: sem teto, um aviso preso sairia dias depois.
- **`{número da loja}`** sai com `formatPhoneBR` (`+55 11 91234-5678`, o formato do painel); o rodapé vem depois de uma
  linha em branco.

## Interface com os outros PRs

- **PR 1:** consome `criarAvisos`, `avisosParaEnviar`, `avisosEnviando`, `marcarAviso`, `lerPedido`; acrescenta
  `pularWhatsappsDoPedido` em `rastreio-avisos.ts`. `pararAvisos` não muda.
- **PR 2:** `lojaDoRastreio` (o `nome` tem de ser legível, não o e-mail que muita `organizations.name` guarda — ver
  "Divergências" do PR 4), `linkDoPedido`; ganchos em `registrarPedidoDaYampi` e `rodarCronRastreio`.
- **PR 3:** `responderParar` chama `cancelarWhatsappsDoPedido` (dep `cancelarWhatsapps`). **PR 4:**
  `enviarAvisoPorEmail` manda o e-mail no lugar; no cron, o passo de e-mail roda depois dos de WhatsApp.
- **PR 6:** Entregas lê só `tracking_notices.status` (o `error` fica para diagnóstico). "Reenviar" reabre o aviso
  `whatsapp`, que sai no próximo cron (≤ 5 min), sem gancho na rota. O "Ver mensagem" passa a usar `mensagemWhatsapp`
  (Task 1, `previas.ts`), como o PR 6 reservou.
- **PR 7:** a prova do passo 4 confere o texto exato e o aviso em `enviado`/`entregue`/`lido`.
- **Base:** `enfileirarDm`, `statusDosDms`, `cancelarDms`, `ParteDm`, `StatusDm` de `@/lib/privado/dm`.
- **Nomes novos** (acréscimo ao índice): `DepsWhatsapp`, `cancelarWhatsappsDoPedido`, `pularWhatsappsDoPedido`, o
  parâmetro `deps` no fim de `enviarWhatsappsPendentes` e `atualizarStatusWhatsapp`, `enviarWhatsapps` em
  `DepsRegistrar` e `DepsCron`, `atualizarWhatsapps` em `DepsCron` e `cancelarWhatsapps` em `DepsRastreio`.

## Divergências

- **PR 4:** diz que o e-mail no lugar "cria (ou reabre)" o aviso de e-mail; aqui só cria (spec §1.2: o e-mail da etapa
  que já existe — saiu, falhou ou foi pulado — não volta). O PR 4 grava frase em `error` ("avisos parados pela
  compradora"); aqui vai código, com o status da base como veio, porque ela não manda o motivo.
- **Mockup × índice:** o mockup quebra o "enviado" em parágrafos e diz "pelos Correios (SEDEX)"; o "entregue" diz "foi
  entregue hoje", traz o número da loja noutro formato e leva o rodapé "Aviso automático de pedido". Vale o índice
  (spec §1.4, posterior ao mockup): texto corrido, rodapé só nos modelos com link.
- **"A loja já foi avisada"** (modelo `problema`) é sempre verdade: o sininho do problema sai sempre (PR 2), e o "me
  avisar por e-mail" decide só o e-mail à loja (PR 4). **Retirada** diz "Detalhes: {link}", não "Veja onde retirar": a
  página não tem o local de retirada e manda combinar com a loja (spec §1.4, ajustado em 29/10).
