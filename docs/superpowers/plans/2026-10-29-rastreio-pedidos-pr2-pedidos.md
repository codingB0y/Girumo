# Rastreio do pedido — PR 2: Pedidos (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo pedido da Yampi de loja com o Rastreio ligado vira uma linha em `tracking_orders` com a etapa certa, pelo
aviso da Yampi, por uma importação de 30 dias sem aviso e por uma varredura por `updated_at` a cada 5 min. Cada etapa
nova e recente cria os `tracking_notices` dos canais ligados (e o sininho do problema) para os PRs 3 a 5.

**Architecture:** Um núcleo puro traduz o pedido da Yampi (`pedidoDaYampi`: etapa, documento em HMAC, telefone
canônico, primeiro nome, histórico) e escolhe os canais (`canaisDoAviso`). `registrarPedidoDaYampi` grava pela RPC do
PR 1 (que segura "a etapa não volta") e só cria aviso quando a RPC diz que a etapa mudou, o pedido é recente, a loja
tem plano e a config manda. O processador da base chama o registro no aviso da Yampi, por uma entrada `rastreio` em
`CONSUMIDORES`; o cron `/api/cron/rastreio` liga a loja nova (config + importação), varre e faz o purge diário.

**Tech Stack:** TypeScript strict, zod 4, `node:crypto` (HMAC), route handler do Next, `tsx --test` (node:test) com
dependências injetadas (molde `DepsBio`, `lib/bio/rota-publica.ts`) e PostgREST falso (molde
`lib/stores/broadcast-deliveries.test.ts`).

**Spec:** `docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md` (§1.1, §1.2, §1.5, §2.1, §3.1, §3.2, §6, §7).
**Índice:** `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md` — Contrato, Global Constraints e Review Focus valem aqui.

## Duas partes

| Parte | O quê | Depende de | Branch |
|---|---|---|---|
| 1 · Núcleo | etapas, documento, pedido da Yampi, canais, links (Tasks 1–6) | PR 1 em `main` | `feat/rastreio-pr2-pedidos-p1` |
| 2 · Registro e cron | loja, registro, importação e varredura, cron, entrada em `CONSUMIDORES` (Tasks 7–12) | Parte 1, B·6 e B·6b, prova 1 da Fase 0 | `feat/rastreio-pr2-pedidos-p2` |

A Parte 1 não chama banco nem base e aceita os dois formatos plausíveis do payload (include com e sem `data`, data em
texto ou no objeto da Yampi): pode ir a `main` antes da Fase 0.

## Antes de começar (cada parte)

1. Worktree a partir de `origin/main` (junctions: "Ambiente do worktree" do índice): `git fetch origin main; git worktree add .claude/worktrees/rastreio-pr2-p1 -b feat/rastreio-pr2-pedidos-p1 origin/main` (Parte 2: `-p2`).
2. Em `main`: Parte 1 → `git ls-tree -r --name-only origin/main -- apps/web/src/lib/rastreio/tipos.ts apps/web/src/lib/stores/rastreio-pedidos.ts apps/web/src/lib/stores/rastreio-avisos.ts apps/web/src/lib/stores/rastreio-config.ts` lista os 4. Parte 2 → B·6 e B·6b em `main`: `git grep -n -E "export (const CONSUMIDORES|async function processarEventoYampi|type ConexaoYampi)" origin/main -- apps/web/src/lib/yampi/consumidores.ts apps/web/src/lib/yampi/processar.ts apps/web/src/lib/yampi/tipos.ts` mostra os 3 (B·6) e `git grep -n -E "export (async function (conexaoYampiAtiva|yampiGet)|class YampiErro)" origin/main -- apps/web/src/lib/yampi/conexao.ts apps/web/src/lib/yampi/api.ts apps/web/src/lib/yampi/cliente.ts` mostra os 3 (B·6b; a `api.ts` reexporta a `YampiErro`). Não há barril `lib/yampi/index`: os imports das Tasks 9–11 vão direto a `@/lib/yampi/tipos`, `/conexao`, `/api`, `/cliente` e `/consumidores`.
3. Parte 2, com a prova 1 da Fase 0: conferir (a) include em `{ data }`; (b) formato de `created_at`/`updated_at` e se `updated_at` vem no `resource` do aviso (se não vier, o `consumir` da entrada, Task 11, passa `{ ...e.recurso, updated_at: e.time }`); (c) `customer.type` da PJ; (d) `customer.phone` e `first_name`; (e) `statuses` com data; (f) se `date=updated_at:` aceita hora e se o fim é inclusivo. Divergiu → ajustar `pedido-yampi.ts` e `src/test/rastreio-dados-falsos.ts` num commit `fix(rastreio): …` antes da Task 7.

## Regras deste PR (além das Global Constraints)

- Janela do aviso: `atualizadoNaYampi ≥ agora − 3 dias`. Importação: 30 dias, `limit` 100, até 20 páginas. Varredura:
  `sweep_cursor − 5 min` até agora, até 10 páginas; o cursor anda mesmo no teto (com `console.warn`), senão a loja fica
  relendo a mesma janela. `include=customer,status,statuses`.
- A janela vai à Yampi por dia de Brasília (`dayBR`, `lib/date-br.ts`), do dia do início ao **dia seguinte** a `agora`
  (o fim pode ser exclusivo); a varredura descarta antes do registro o pedido com `updated_at` anterior ao início.
- Sem varredura antes da importação: sem a linha de base, pedido enviado há dias e mexido agora viraria aviso.
- `pepperDoRastreio()` vem antes de tudo no registro, na importação e na varredura: sem pepper nada é lido nem gravado.
- Log só com tenant, id do pedido na Yampi, origem e alias de status; nunca nome, telefone, e-mail ou documento.
- Erro da Yampi (`YampiErro`: `status` e `retryAfterMs: number | null`; `status 0` = sem resposta) na importação ou na
  varredura de uma loja sobe até o passo do cron (Task 10) e a loja para nesta execução, sem `avancarCursor` nem
  `marcarImportado`; as outras lojas seguem. 401: o próprio `yampiGet` já marcou a conexão `credencial_invalida` e avisou
  no sino (base): o Rastreio não avisa de novo. 429 e sem resposta: a rodada seguinte, 5 min depois, tenta de novo; o cron
  não espera o `retryAfterMs`.
- Todo commit: `git commit -m "<mensagem>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`. Um teste só
  (raiz): `npm --workspace apps/web exec -- tsx --import ./src/test/server-only-shim.mjs --test <caminho em apps/web>`.

## Arquivos

Parte 1, em `apps/web/src/`: `lib/rastreio/etapas.ts` (status → etapa) · `lib/rastreio/documento.ts` (CPF/CNPJ, HMAC,
4 dígitos) · `lib/bio/documento.ts` (só `export` em `cnpjValido`) · `lib/rastreio/pedido-yampi.ts` (pedido da Yampi →
`PedidoParaGravar`, `dataDaYampi`) · `lib/rastreio/avisar.ts` (quem recebe aviso, por qual canal) · `lib/rastreio/link.ts`
(links) · `test/rastreio-dados-falsos.ts` (documentos com dígito calculado e o pedido de mentira; os PRs 3–5 reusam) ·
os 5 `*.test.ts` ao lado.

Parte 2: `lib/rastreio/loja.ts` (dados da loja) · `lib/rastreio/registrar.ts` (registro, sininho, `EVENTOS_DO_RASTREIO`) ·
`lib/rastreio/importar.ts` (importação e varredura) · `lib/rastreio/cron.ts` + `app/api/cron/rastreio/route.ts` +
`apps/web/vercel.json` + `lib/security/request-access-policy.ts` (e o teste) · `lib/yampi/consumidores.ts` (arquivo do
B·6: uma entrada) e o `consumidores.test.ts` · os 4 `*.test.ts` ao lado.

---

## Parte 1 — núcleo

### Task 1: Etapa a partir do status da Yampi

**Files:** Create `apps/web/src/lib/rastreio/etapas.ts`, `apps/web/src/lib/rastreio/etapas.test.ts`

**Interfaces:** Consumes `Etapa` (PR 1). Produces `etapaDaYampi(e: { statusAlias: string | null; trackCode: string | null; delivered: boolean }): Etapa | null`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
const COD = "QA123456789BR";
const TABELA: Array<[alias: string, codigo: string | null, etapa: Etapa]> = [
  ["waiting_payment", null, "aguardando_pagamento"], ["authorized", null, "aguardando_pagamento"], ["created", null, "aguardando_pagamento"],
  ["waiting_payment", COD, "aguardando_pagamento"], ["paid", null, "confirmado"], ["paid", COD, "enviado"],
  ["handling_products", null, "separando"], ["invoiced", null, "separando"], ["ready_for_shipping", COD, "enviado"],
  ["on_carriage", null, "separando"], ["on_carriage", "  ", "separando"], ["on_carriage", COD, "enviado"],
  ["ready_for_pickup", COD, "retirada"], ["shipment_exception", COD, "problema"], ["delivered", null, "entregue"],
  ["refused", null, "cancelado"], ["cancelled", COD, "cancelado"],
];
test("cada status da Yampi vira a etapa do spec §1.1, com a regra do código de rastreio", () => {
  for (const [statusAlias, trackCode, etapa] of TABELA)
    assert.equal(etapaDaYampi({ statusAlias, trackCode, delivered: false }), etapa, `${statusAlias} + ${trackCode}`);
});
test("delivered = true é entregue, mas cancelado vence", () => {
  assert.equal(etapaDaYampi({ statusAlias: "on_carriage", trackCode: COD, delivered: true }), "entregue");
  assert.equal(etapaDaYampi({ statusAlias: "cancelled", trackCode: null, delivered: true }), "cancelado");
});
test("status desconhecido devolve null e o log leva só o alias", (t) => {
  const avisos: string[] = [];
  t.mock.method(console, "warn", (...a: unknown[]) => avisos.push(a.map(String).join(" ")));
  for (const statusAlias of ["em_disputa", "constructor", null]) // constructor: nada herdado de Object
    assert.equal(etapaDaYampi({ statusAlias, trackCode: COD, delivered: false }), null);
  assert.deepEqual(avisos, ["em_disputa", "constructor", "null"].map((a) => `[rastreio] status da Yampi desconhecido: ${a}`));
});
```

- [ ] **Step 2: Rodar e ver falhar** — Expected: FAIL, `ERR_MODULE_NOT_FOUND` (`etapas`).
- [ ] **Step 3: Implementar** — `const ETAPA_DO_STATUS = new Map<string, Etapa>([...])` com os 13 aliases do §1.1
  (`on_carriage` → `separando`). `base = alias === null ? undefined : mapa.get(alias)`; `base === "cancelado"` →
  `cancelado`; `delivered` → `entregue`; `base === undefined` → o `console.warn` do teste e `null`; `base` em
  `confirmado`/`separando` com `trackCode?.trim()` → `enviado`; senão `base`.
- [ ] **Step 4: Rodar e ver passar.** · **Step 5: Commit** — `feat(rastreio): map Yampi order status to tracking stage`

### Task 2: Documento (CPF/CNPJ), HMAC e 4 últimos dígitos

**Files:** Create `apps/web/src/lib/rastreio/documento.ts`, `apps/web/src/lib/rastreio/documento.test.ts`,
`apps/web/src/test/rastreio-dados-falsos.ts` · Modify `apps/web/src/lib/bio/documento.ts:124`

**Interfaces:** Consumes `cnpjValido(cnpj: string): boolean` (hoje privado na bio; aceita o CNPJ alfanumérico, exige
maiúsculas). Produces os 4 nomes do contrato; no teste, `gerarCpf(base9: string): string` e `gerarCnpj(base12: string): string`.

- [ ] **Step 1: Escrever os geradores e o teste que falha** — `rastreio-dados-falsos.ts` (cabeçalho no molde de
  `bio-dados-falsos.ts`: repo público, nada de gente de verdade): `gerarCpf` acrescenta os 2 dígitos pelo módulo 11
  (pesos `comprimento + 1 − i`, dígito `(soma × 10) % 11 % 10`); `gerarCnpj` usa o valor `charCode − 48` (aceita letra),
  pesos `((comprimento − 1 − i) % 8) + 2`, dígito `resto < 2 ? 0 : 11 − resto`. O primeiro teste prende os dois aos
  exemplos publicados.

```ts
const cpf = gerarCpf("123456789"), cnpj = gerarCnpj("112223330001");
const fmtCpf = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
const fmtCnpj = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
const trocaUltimo = (d: string) => d.slice(0, -1) + String((Number(d.slice(-1)) + 1) % 10);
test("os geradores batem com os exemplos publicados", () => {
  assert.deepEqual([gerarCpf("111444777"), cpf, cnpj, gerarCnpj("12ABC34501DE")], ["11144477735", "12345678909", "11222333000181", "12ABC34501DE35"]);
});
test("documento digitado com ponto, traço, barra ou espaço vira só os caracteres", () => {
  for (const e of [fmtCpf, fmtCpf.replace(/[.-]/g, " "), ` ${cpf} `]) assert.deepEqual(normalizarDocumento(e), { tipo: "cpf", digitos: cpf }, e);
  assert.deepEqual(normalizarDocumento(fmtCnpj), { tipo: "cnpj", digitos: cnpj });
  assert.deepEqual(normalizarDocumento("12.abc.345/01de-35"), { tipo: "cnpj", digitos: "12ABC34501DE35" });
});
test("dígito errado, tamanho errado ou tudo igual não é documento", () => {
  for (const e of [trocaUltimo(cpf), trocaUltimo(cnpj), cpf.slice(1), "000.000.000-00", "11111111111111", "", "abc"])
    assert.equal(normalizarDocumento(e), null, e);
});
test("docHmac é HMAC-SHA256 em hex com o pepper como chave", () => {
  // RFC 4231, caso 2: prende algoritmo, ordem chave/mensagem e formato.
  assert.equal(docHmac("what do ya want for nothing?", "Jefe"), "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
  assert.notEqual(docHmac(cpf, "a".repeat(32)), docHmac(cpf, "b".repeat(32)));
});
test("pepper: 32 caracteres no mínimo, aparado, e o valor nunca no erro", () => {
  delete process.env.RASTREIO_DOC_PEPPER;
  assert.throws(() => pepperDoRastreio(), /RASTREIO_DOC_PEPPER/);
  process.env.RASTREIO_DOC_PEPPER = "segredo-curto-de-teste";
  assert.throws(() => pepperDoRastreio(), (e: Error) => /RASTREIO_DOC_PEPPER/.test(e.message) && !e.message.includes("segredo-curto"));
  process.env.RASTREIO_DOC_PEPPER = ` ${"p".repeat(32)}\n`;
  assert.equal(pepperDoRastreio(), "p".repeat(32));
});
test("ultimos4 do telefone canônico", () => assert.equal(ultimos4("5511987654321"), "4321"));
```

- [ ] **Step 2: Rodar e ver falhar** — Expected: FAIL, `ERR_MODULE_NOT_FOUND` (`lib/rastreio/documento`).
- [ ] **Step 3: Implementar** — `export` em `cnpjValido` (`lib/bio/documento.ts:124`, corpo igual, comentário "o Rastreio
  também usa"). `documento.ts` com `import "server-only"`: `cpfValido` privado (11 dígitos, não todos iguais, os dois
  dígitos pela regra do gerador); `normalizarDocumento`: `limpo = entrada.replace(/[^0-9A-Za-z]/g, "").toUpperCase()`,
  `/^\d{11}$/` + `cpfValido` → cpf, 14 caracteres + `cnpjValido` → cnpj, senão `null`; `docHmac`:
  `createHmac("sha256", pepper).update(digitos).digest("hex")`; `pepperDoRastreio`: env aparada, menos de 32 →
  `throw new Error("RASTREIO_DOC_PEPPER ausente ou com menos de 32 caracteres")`; `ultimos4`: `slice(-4)`.
- [ ] **Step 4: Rodar este teste e `npm --workspace apps/web test`** (a bio segue verde).
- [ ] **Step 5: Commit** — `feat(rastreio): normalize CPF/CNPJ and hash it with the tracking pepper`

### Task 3: Pedido da Yampi → pedido para gravar

**Files:** Create `apps/web/src/lib/rastreio/pedido-yampi.ts`, `apps/web/src/lib/rastreio/pedido-yampi.test.ts` · Modify `apps/web/src/test/rastreio-dados-falsos.ts`

**Interfaces:** Consumes Tasks 1 e 2, `telefoneCanonico` (`lib/vendas/telefone.ts`), `PedidoParaGravar` (PR 1).
Produces `pedidoDaYampi(payload: unknown, pepper: string): PedidoParaGravar | null` (contrato) e
`dataDaYampi(v: unknown): string | null` (ISO; a Task 9 usa). No teste: `PEDIDO_CPF`, `pedidoYampi(extra?: Record<string, unknown>): Record<string, unknown>`.

- [ ] **Step 1: Escrever o pedido de mentira e o teste que falha** — `PEDIDO_CPF = gerarCpf("123456789")`;
  `pedidoYampi(extra)` = `{ ...pedido, ...extra }`, com `brt = (d) => ({ date: \`${d}.000000\`, timezone_type: 3, timezone: "America/Sao_Paulo" })`:
  `id: 90001`, `number: 1042`, `created_at: brt("2026-10-27 10:15:00")`, `updated_at: brt("2026-10-29 09:30:00")`,
  `status: { data: { id: 7, alias: "on_carriage", name: "Em transporte" } }`, `track_code: "QA123456789BR"`,
  `track_url: "https://rastreio.exemplo/QA123456789BR"`, `delivered: false`, `shipment_service: "PAC"`,
  `customer: { data: { type: "f", name: "Maria Teste da Silva", email: "maria.teste@exemplo.com", cpf: "123.456.789-09", cnpj: null, phone: { area_code: "11", number: "987654321", full_number: "11987654321" } } }`,
  `statuses: { data: [<waiting_payment 2026-10-27 10:15>, <paid 10:20>, <invoiced 2026-10-28 08:00>, <on_carriage 2026-10-29 09:30>] }`,
  cada item `{ status: { data: { alias } }, created_at: brt(...) }`.

```ts
const PEPPER = "p".repeat(32);
test("o pedido da Yampi vira o pedido para gravar", () => {
  assert.deepEqual(pedidoDaYampi(pedidoYampi(), PEPPER), {
    externalId: "90001", numero: "1042", orderCreatedAt: "2026-10-27T13:15:00.000Z", statusRaw: "on_carriage", etapa: "enviado",
    trackingCode: "QA123456789BR", trackingUrl: "https://rastreio.exemplo/QA123456789BR", shipmentService: "PAC",
    buyerFirstName: "Maria", buyerPhone: "5511987654321", buyerEmail: "maria.teste@exemplo.com", docHmac: docHmac(PEDIDO_CPF, PEPPER),
    historico: [ // on_carriage sem código = separando, junta com o anterior; a etapa atual entra com o updated_at
      { etapa: "aguardando_pagamento", at: "2026-10-27T13:15:00.000Z" }, { etapa: "confirmado", at: "2026-10-27T13:20:00.000Z" },
      { etapa: "separando", at: "2026-10-28T11:00:00.000Z" }, { etapa: "enviado", at: "2026-10-29T12:30:00.000Z" },
    ],
    atualizadoNaYampi: "2026-10-29T12:30:00.000Z",
  });
});
```

| Teste | Entrada | Esperado |
|---|---|---|
| include sem `data` e data em texto | `pedidoYampi({ status: { alias: "paid" }, track_code: null, created_at: "2026-10-27 10:15:00", updated_at: "2026-10-29T12:30:00Z", statuses: undefined, customer: { name: "Ana", phone: { area_code: 21, number: 912345678 } } })` | `etapa: "confirmado"`, `buyerPhone: "5521912345678"`, `buyerFirstName: "Ana"`, `docHmac` e `buyerEmail` `null`, `historico: []`, as duas datas como no teste acima |
| telefone em qualquer formato | `phone` `{ full_number: "5511987654321" }`; `{ area_code: "11", number: "987654321", full_number: "987654321" }`; sem `phone` | `"5511987654321"`, `"5511987654321"`, `null` |
| PJ: CNPJ, e o nome da empresa não vira primeiro nome | `customer: { type: "j", name: "Confeccoes Exemplo Ltda", cpf: null, cnpj: <gerarCnpj("112223330001") formatado> }`; o mesmo com `first_name: "Bia"` | `docHmac(gerarCnpj("112223330001"), PEPPER)` e `buyerFirstName: null`; depois `"Bia"` |
| só vai limpo para mensagem e página | `name` `"www.golpe.com"` e `"Ana2"`; `email: "sem-arroba"`; `track_url: "javascript:alert(1)"`; `cpf` com o último dígito trocado | `buyerFirstName: null` nos dois; `buyerEmail`, `trackingUrl` e `docHmac` `null` |
| payload fora do formato | `null`, `"x"`, `{}`, `pedidoYampi({ id: undefined })`, `pedidoYampi({ updated_at: "ontem" })`, `pedidoYampi({ status: undefined })` | `null` em todos |
| histórico sem data fica vazio | `statuses: { data: [{ status: { data: { alias: "paid" } } }] }` | `historico: []` |
| `dataDaYampi` | `"2026-10-29 09:30:00"`, `"2026-10-29T12:30:00Z"`, `"2026-10-29T09:30:00-03:00"`, `"2026-10-29T12:30:00+0000"`, `brt("2026-10-29 09:30:00")`, `{ date: "2026-10-29 12:30:00.000000", timezone: "UTC" }` | `"2026-10-29T12:30:00.000Z"` em todos; `"29/10/2026"`, `null` e `42` → `null` |

- [ ] **Step 2: Rodar e ver falhar** — Expected: FAIL, `ERR_MODULE_NOT_FOUND` (`pedido-yampi`).
- [ ] **Step 3: Implementar** — zod com `safeParse` (falhou → `null`); include desembrulhado por
  `z.preprocess((v) => (v && typeof v === "object" && "data" in v ? (v as { data: unknown }).data : v), schema)`.
  Obrigatórios: `id` e `number` (número ou texto → `String`), `created_at` e `updated_at` (por `dataDaYampi`),
  `status.alias`; o resto `nullish`, texto aparado, vazio → `null`.
  - `dataDaYampi`: texto ou `{ date, timezone? }` casando `/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/`;
    sem fuso → `-03:00` (sem horário de verão desde 2019, `lib/date-br.ts`), ou `Z` com `timezone === "UTC"`;
    `+0000` → `+00:00`; `toISOString()`; não casou ou data inválida → `null`.
  - `etapa` por `etapaDaYampi` com `delivered === true || delivered === 1`; `statusRaw` = alias.
  - `trackingUrl`: `new URL(v)` com `http:`/`https:` → `href`, senão `null` (a página vira link dele).
  - Documento: `[cnpj, cpf]` se `/^j/i.test(type)`, senão `[cpf, cnpj]`; o primeiro que `normalizarDocumento` aceitar → `docHmac(digitos, pepper)`.
  - Primeiro nome: `first_name`, ou `name` quando o documento escolhido não for CNPJ; primeira palavra, só se casar
    `/^[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'-]{0,19}$/` (vai no texto do WhatsApp: nada de link, `@` ou número).
  - Telefone (partes em texto ou número): `telefoneCanonico(String(full_number ?? "")) ?? telefoneCanonico(\`${area_code ?? ""}${number ?? ""}\`)`.
    E-mail só se casar `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`.
  - Histórico: item com alias (`status.alias ?? alias`) e `created_at` → `{ etapaDaYampi(alias, sem código), at }`; sem
    etapa sai; ordena por `at`; etapas iguais seguidas ficam na primeira; sobrou algo e a última difere da etapa atual
    (não nula) → acrescenta `{ etapa atual, at: atualizadoNaYampi }` (a RPC do PR 1 só completa com `now()` se faltar).
- [ ] **Step 4: Rodar e ver passar.** · **Step 5: Commit** — `feat(rastreio): read a Yampi order into the order to record`

### Task 4: Canais do aviso

**Files:** Create `apps/web/src/lib/rastreio/avisar.ts`, `apps/web/src/lib/rastreio/avisar.test.ts`

**Interfaces:** Consumes `ETAPAS_COM_AVISO`, `MATRIZ_PADRAO` e tipos (PR 1). Produces `canaisDoAviso` (contrato),
`mudancaParaAvisar(e: { gravado: PedidoGravado; origem: OrigemDoPedido; atualizadoNaYampi: string; agora: Date }): boolean`
e `ehEtapaComAviso(etapa: Etapa): etapa is EtapaComAviso` (a Task 8 usa os dois).

- [ ] **Step 1: Escrever o teste que falha** (Review Focus 2)

```ts
const gravado = (etapa: Etapa, mudou = true): PedidoGravado => ({ id: "ped-1", etapa, etapaAnterior: "separando", mudou, linkToken: "0".repeat(32), paradoEm: null, temTelefone: true, temEmail: true });
const base = { gravado: gravado("enviado"), origem: "aviso" as const, atualizadoNaYampi: "2026-10-29T14:00:00Z", agora: new Date("2026-10-29T15:00:00Z"), matriz: MATRIZ_PADRAO, paradoEm: null, temTelefone: true, temEmail: true };
const canais = (extra: Partial<Parameters<typeof canaisDoAviso>[0]>) => canaisDoAviso({ ...base, ...extra });
test("matriz padrão: enviado nos dois canais, entregue só no WhatsApp, confirmado e separando em nenhum", () => {
  assert.deepEqual([canais({}), canais({ gravado: gravado("entregue") }), canais({ gravado: gravado("confirmado") }), canais({ gravado: gravado("separando") })],
    [["whatsapp", "email"], ["whatsapp"], [], []]);
});
test("pedido velho reaparecendo não avisa; a varredura avisa como o aviso da Yampi", () => {
  assert.deepEqual(canais({ atualizadoNaYampi: "2026-10-26T14:59:59Z" }), []);
  assert.deepEqual(canais({ atualizadoNaYampi: "2026-10-26T15:00:00Z" }), ["whatsapp", "email"]);
  for (const extra of [{ origem: "importacao" as const }, { gravado: gravado("enviado", false) }, { atualizadoNaYampi: "ontem" }]) assert.deepEqual(canais(extra), []);
  assert.deepEqual(canais({ origem: "varredura" }), ["whatsapp", "email"]);
});
test("parar avisos, falta de contato e a matriz da loja cortam canal", () => {
  assert.deepEqual(canais({ paradoEm: "2026-10-29T14:30:00Z" }), []);
  assert.deepEqual([canais({ temTelefone: false }), canais({ temEmail: false })], [["email"], ["whatsapp"]]);
  assert.deepEqual(canais({ matriz: { ...MATRIZ_PADRAO, enviado: { whatsapp: false, email: true } } }), ["email"]);
});
```

- [ ] **Step 2: Rodar e ver falhar.** · **Step 3: Implementar** — `mudancaParaAvisar` = `gravado.mudou && origem !== "importacao" && Date.parse(atualizadoNaYampi) >= agora.getTime() - 3 * 86_400_000`
  (`NaN` dá falso). `canaisDoAviso`: `[]` sem `mudancaParaAvisar`, com etapa fora de `ETAPAS_COM_AVISO` ou com
  `paradoEm`; senão `(["whatsapp", "email"] as const).filter((c) => matriz[etapa][c] && (c === "whatsapp" ? temTelefone : temEmail))`.
- [ ] **Step 4: Rodar e ver passar.** · **Step 5: Commit** — `feat(rastreio): choose notice channels for a stage change`

### Task 5: Links do pedido e da busca

**Files:** Create `apps/web/src/lib/rastreio/link.ts`, `apps/web/src/lib/rastreio/link.test.ts`

**Interfaces:** Consumes `getPublicSiteUrl()` (`lib/brand.ts`: a origem da bio em `lib/bio/cache.ts`, padrão
`https://www.girumo.com.br`). Produces `linkDoPedido(loja: { dominio: string | null; publicSlug: string }, token: string): string`
e `linkDaBusca(loja: { dominio: string | null; publicSlug: string }): string` (a `LojaDoRastreio` cabe).

- [ ] **Step 1: Escrever o teste que falha**

```ts
delete process.env.NEXT_PUBLIC_SITE_URL; // a origem padrão, como no CI
const TOKEN = "0123456789abcdef0123456789abcdef";
test("sem domínio próprio, o www da Girumo com o slug; com domínio ativo, o caminho curto", () => {
  const girumo = { dominio: null, publicSlug: "loja-teste" }, propria = { dominio: "loja.exemplo.com.br", publicSlug: "loja-teste" };
  assert.equal(linkDoPedido(girumo, TOKEN), `https://www.girumo.com.br/rastreio/loja-teste/${TOKEN}`);
  assert.equal(linkDaBusca(girumo), "https://www.girumo.com.br/rastreio/loja-teste");
  assert.equal(linkDoPedido(propria, TOKEN), `https://loja.exemplo.com.br/rastreio/${TOKEN}`);
  assert.equal(linkDaBusca(propria), "https://loja.exemplo.com.br/rastreio");
});
```

- [ ] **Step 2: Rodar e ver falhar** · **Step 3: Implementar** (`encodeURIComponent` no slug e no token) · **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `feat(rastreio): build the order and search links`

### Task 6: Fechamento da Parte 1

- [ ] **Step 1:** os quatro comandos de verificação do índice e `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1` verdes; revisão do diff (agente Code Reviewer).
- [ ] **Step 2:** `git push -u origin feat/rastreio-pr2-pedidos-p1`; `gh pr create --base main --title "feat(rastreio): order core — stage, document, Yampi order, notice rules (PR 2, part 1)"` (corpo: resumo, plano, plano de teste, `🤖 Generated with [Claude Code](https://claude.com/claude-code)`).
- [ ] **Step 3:** `gh pr checks <N>`; verde → `gh pr merge <N> --squash --delete-branch` (a `main` não tem proteção: merge à mão no verde).

---

## Parte 2 — registro e cron

### Task 7: Dados da loja para página e avisos

**Files:** Create `apps/web/src/lib/rastreio/loja.ts`, `apps/web/src/lib/rastreio/loja.test.ts`

**Interfaces:** Consumes `lerConfig` (PR 1), `getCustomDomain`, `getOrganizationProfile`, `lerPublicadaDaLoja`
(`lib/stores/`), `coresDaMarca` (`lib/bio/editor-aparencia.ts`), `humanizeName` (`lib/email/invite-copy.ts`).
Produces `LojaDoRastreio` e `lojaDoRastreio(tenantId, deps?: DepsLoja)` (contrato), `DepsLoja = typeof DEPS`,
`DEPS = { lerConfig, dominio: getCustomDomain, perfil: getOrganizationProfile, bio: lerPublicadaDaLoja }`.

- [ ] **Step 1: Escrever o teste que falha** — `CONFIG: RastreioConfig = { tenantId: "loja-a", publicSlug: "loja-teste", matrix: MATRIZ_PADRAO, notifyStoreOnProblem: true, vipLinkId: "link-vip", storeWhatsapp: "5511900000000", importedAt: null, sweepCursor: null }`;
  a bio = `documentoPadrao({ nome: "Loja da Bio", campanhaId: null })` com `paleta: "marca"` e `cores: { fundo: "#111111", botao: "#C0FFEE" }`.

| Teste | Fakes | Esperado |
|---|---|---|
| junta nome e cor da bio, domínio ativo e a config | domínio `active` `loja.exemplo.com.br`, bio publicada, `storeName: "Outro Nome"` | `{ tenantId: "loja-a", nome: "Loja da Bio", publicSlug: "loja-teste", dominio: "loja.exemplo.com.br", corPrimaria: "#C0FFEE", storeWhatsapp: "5511900000000", vipLinkId: "link-vip" }` |
| sem bio: nome legível da organização, domínio pendente não vale | bio `null`, domínio `pending`, `storeName: "maria.loja@exemplo.com"` | `nome: "Maria loja"`, `dominio: null`, `corPrimaria: null` |
| nome vazio usa o slug | bio `null`, `storeName: "  "` | `nome: "loja-teste"` |
| Rastreio nunca ligado | `lerConfig` → `null` | `null`, e os outros três fakes não chamados |

- [ ] **Step 2: Rodar e ver falhar** · **Step 3: Implementar** — `import "server-only"`; não lê `rastreio_enabled` (quem
  chama confere); config primeiro, os outros três em `Promise.all`; `dominio = d?.status === "active" ? d.hostname : null`; `corPrimaria = pagina ? coresDaMarca(pagina.documento).botao : null`;
  `nome = pagina?.documento.perfil.nome.trim() || humanizeName(perfil.storeName) || config.publicSlug` (metade das
  `organizations.name` guarda o e-mail; o nome vira remetente e texto do aviso nos PRs 4 e 5).
- [ ] **Step 4: Rodar e ver passar.** · **Step 5: Commit** — `feat(rastreio): gather the store data for the page and notices`

### Task 8: Registrar o pedido, sininho do problema, consumidor do aviso

**Files:** Create `apps/web/src/lib/rastreio/registrar.ts`, `apps/web/src/lib/rastreio/registrar.test.ts`

**Interfaces:** Consumes a Parte 1, `gravarPedido`/`criarAvisos`/`lerConfig` (PR 1; o `PedidoGravado`
traz `paradoEm`, `temTelefone` e `temEmail` da linha gravada), `tenantGrantsPlan` (`lib/billing/entitlements.ts`).
Produces `registrarPedidoDaYampi(tenantId, payload, origem, deps?: DepsRegistrar)` e `avisarLojaDoProblema(tenantId, pedido)`
(contrato); `DEPS = { pepper: pepperDoRastreio, gravarPedido, lerConfig, planoAtivo: tenantGrantsPlan, criarAvisos, avisarLoja: avisarLojaDoProblema, agora: () => new Date() }`;
`EVENTOS_DO_RASTREIO = ["order.created", "order.paid", "order.status.updated"] as const` (o `eventos` da entrada em
`CONSUMIDORES`, Task 11).

- [ ] **Step 1: Escrever os testes que falham** — fakes: `GRAVADO = { id: "ped-1", etapa: "enviado", etapaAnterior: "separando", mudou: true, linkToken: "0".repeat(32), paradoEm: null, temTelefone: true, temEmail: true }`;
  `CONFIG` da Task 7; `agora` 2026-10-29T15:00:00Z; `montar(extra)` conta `gravar`/`config` e guarda as chamadas de
  `criarAvisos` (devolve `canais.map((canal, i) => ({ id: \`av-${i}\`, canal }))`) e de `avisarLoja`.

```ts
test("etapa nova e recente vira aviso nos canais da matriz", async () => {
  const { deps, log } = montar();
  const r = await registrarPedidoDaYampi("loja-a", pedidoYampi(), "aviso", deps);
  assert.deepEqual(log.criar, [["loja-a", "ped-1", "enviado", ["whatsapp", "email"]]]);
  assert.deepEqual(r?.avisos, [{ id: "av-0", canal: "whatsapp" }, { id: "av-1", canal: "email" }]);
});
test("sem RASTREIO_DOC_PEPPER lança antes de gravar", async () => { // Review Focus 5
  const { deps, log } = montar({ pepper: () => { throw new Error("RASTREIO_DOC_PEPPER ausente ou com menos de 32 caracteres"); } });
  await assert.rejects(registrarPedidoDaYampi("loja-a", pedidoYampi(), "aviso", deps), /RASTREIO_DOC_PEPPER/);
  assert.equal(log.gravar, 0);
});
test("loja sem plano: grava o pedido e não cria aviso nem sininho", async () => {
  const { deps, log } = montar({ planoAtivo: async () => false, gravarPedido: async () => ({ ...GRAVADO, etapa: "problema" }) });
  assert.deepEqual((await registrarPedidoDaYampi("loja-a", pedidoYampi(), "aviso", deps))?.avisos, []);
  assert.deepEqual([log.gravar, log.criar, log.loja], [1, [], []]);
});
```

| Teste | Mudança | Esperado |
|---|---|---|
| importação e etapa que não mudou não leem config | `origem: "importacao"`; depois `gravarPedido` → `{ ...GRAVADO, mudou: false }` | `log.config === 0`, `log.criar` vazio, nos dois |
| contato e "parar avisos" vêm do `gravado`, não do payload | `pedidoYampi({ customer: undefined })` com o `GRAVADO`; `gravarPedido` → `{ ...GRAVADO, temEmail: false }`; → `{ ...GRAVADO, paradoEm: "2026-10-29T14:00:00Z" }` | canais `["whatsapp", "email"]`; `["whatsapp"]`; `log.criar` vazio |
| problema sempre avisa a loja no sininho (o "me avisar" é só do e-mail, PR 4) | `gravarPedido` → `{ ...GRAVADO, etapa: "problema" }`; depois também `lerConfig` → `{ ...CONFIG, notifyStoreOnProblem: false }` | `log.loja = [["loja-a", { id: "ped-1", numero: "1042" }]]` nas duas rodadas |
| payload fora do formato | `{}` | `null` e `log.gravar === 0` |

Sininho, com PostgREST falso (molde `broadcast-deliveries.test.ts`; `GET /rest/v1/notifications` responde `[]` ou
`[{ id: "n1" }]` conforme `jaTem`, `POST` responde 201 vazio):

```ts
test("o sininho do problema nasce uma vez por pedido, apontando para Entregas", async () => {
  jaTem = false;
  assert.equal(await avisarLojaDoProblema("loja-a", { id: "ped-1", numero: "1042" }), true);
  const [busca, insert] = chamadas;
  assert.deepEqual(Object.fromEntries(busca.url.searchParams), { select: "id", tenant_id: "eq.loja-a", type: "eq.rastreio_problema", href: "eq./painel/vendas/entregas?pedido=ped-1", limit: "1" });
  assert.deepEqual(insert.corpo, { tenant_id: "loja-a", type: "rastreio_problema", title: "Problema na entrega do pedido nº 1042", body: "A transportadora não conseguiu entregar. Fale com a compradora.", href: "/painel/vendas/entregas?pedido=ped-1" });
  chamadas.length = 0; jaTem = true;
  assert.equal(await avisarLojaDoProblema("loja-a", { id: "ped-1", numero: "1042" }), false);
  assert.equal(chamadas.filter((c) => c.metodo === "POST").length, 0);
});
```

- [ ] **Step 2: Rodar e ver falhar** — Expected: FAIL, `ERR_MODULE_NOT_FOUND` (`registrar`).
- [ ] **Step 3: Implementar** (`import "server-only"`). `registrarPedidoDaYampi`:
  1. `pedido = pedidoDaYampi(payload, deps.pepper())`; nulo → `console.warn(\`[rastreio] ${tenantId}: pedido da Yampi fora do formato (${origem})\`)` e `null`.
  2. `gravado = await deps.gravarPedido(tenantId, pedido, origem)` (a importação não carimba data inventada, PR 1);
     `agora = deps.agora()` (uma vez; os PRs 4 e 5 reusam).
  3. Sem `mudancaParaAvisar({ gravado, origem, atualizadoNaYampi: pedido.atualizadoNaYampi, agora })` → `{ gravado, avisos: [] }` (quase todo pedido para aqui).
  4. `Promise.all([planoAtivo(tenantId), lerConfig(tenantId)])`; sem plano ou sem config → `{ gravado, avisos: [] }`. O plano vale para tudo abaixo, sininho incluído.
  5. `canaisDoAviso({ …, matriz: config.matrix, paradoEm: gravado.paradoEm, temTelefone: gravado.temTelefone, temEmail: gravado.temEmail })` (a linha gravada: nulo no payload não apaga contato de aviso anterior); com canal e `ehEtapaComAviso(gravado.etapa)` → `criarAvisos`.
  6. `etapa === "problema"` → `deps.avisarLoja(tenantId, { id: gravado.id, numero: pedido.numero })`. O sininho sai
     sempre, porque o texto à compradora diz "A loja já foi avisada"; `notifyStoreOnProblem` decide só o e-mail à loja
     (PR 4, Parte 3).
  `// ponytail:` falha entre o passo 2 e o 6 perde o aviso daquela etapa (a retentativa vê `mudou = false`); a página
  fica certa. Subir para "avisos criados na RPC" se aparecer na prova.
  `avisarLojaDoProblema`: select `.eq("tenant_id").eq("type", "rastreio_problema").eq("href", href).limit(1)`; achou →
  `false`; senão insert com os textos do teste e `true`; erro do Supabase → `throw new Error(error.message)`.
  A flag fica com quem chama o registro (a entrada de `CONSUMIDORES`, pelo `ligado: rastreioLigado`, Task 11; e, no
  cron, `lojasComRastreio`): a RPC não a lê. O filtro de evento (carrinho não registra pedido) é o `eventos` da entrada.
- [ ] **Step 4: Rodar e ver passar.** · **Step 5: Commit** — `feat(rastreio): record Yampi orders and create stage notices`

### Task 9: Importação de 30 dias e varredura por `updated_at`

**Files:** Create `apps/web/src/lib/rastreio/importar.ts`, `apps/web/src/lib/rastreio/importar.test.ts`

**Interfaces:** Consumes `ConexaoYampi` (`@/lib/yampi/tipos`, B·6), `conexaoYampiAtiva` (`@/lib/yampi/conexao`, B·6b: a
conexão `ativa` ou `aviso_desativado`, porque a credencial vale e a importação e a varredura rodam nas duas; `null` no
resto), `yampiGet` (`@/lib/yampi/api`, B·6b; caminho relativo ao alias), `YampiErro` (`@/lib/yampi/cliente`, só no teste;
a `api.ts` a reexporta), `registrarPedidoDaYampi`,
`dataDaYampi`, `pepperDoRastreio`, `lerConfig`/`avancarCursor` (PR 1), `dayBR`. Produces `importarPedidos(tenantId, desde, deps?)`
e `varrerPedidos(tenantId, agora, deps?)` (contrato); `DEPS = { conexao: conexaoYampiAtiva, get: yampiGet, registrar: registrarPedidoDaYampi, lerConfig, avancarCursor, pepper: pepperDoRastreio, agora: () => new Date() }`.

- [ ] **Step 1: Escrever o teste que falha** — `CONEXAO: ConexaoYampi = { id: "cx-1", tenantId: "loja-a", alias: "loja-teste", status: "ativa", userTokenSelado: null, userSecretKeySelado: null, webhookId: null, webhookSecretSelado: null, lastEventAt: null, lastCheckAt: null, lastError: null }` (o tipo da base; credencial nula, porque o `get` é falso);
  `get` falso (cast `as DepsImportar["get"]`) guarda cada `query` e devolve `{ data: paginas[page - 1] ?? [] }`;
  `registrar` falso guarda `(tenantId, payload, origem)` e devolve `{ gravado: GRAVADO, avisos: [] }`; `agora` 2026-10-29T15:00:00Z.

| Teste | Montagem | Esperado |
|---|---|---|
| importação: 30 dias por `updated_at`, de 100 em 100, sem aviso | páginas de 100 (`pedidoYampi({ id: i + 1 })`) e de 1; `importarPedidos("loja-a", new Date("2026-09-29T15:00:00Z"))` | 101; consultas `{ date: "updated_at:2026-09-29\|2026-10-30", include: "customer,status,statuses", limit: 100, page: 1 }` e `page: 2`; toda origem `"importacao"` |
| um pedido que não grava não para a importação | ids 1, 2, 3; o registro lança no 2 | 2; `console.error` começando com `"[rastreio] loja-a: pedido 2 não gravou (importacao)"` |
| sem conexão lança; sem pepper nem consulta | `conexao` → `null`; depois `pepper` lançando | `rejects(/conexão/)`; depois `rejects(/RASTREIO_DOC_PEPPER/)` e nenhuma consulta |
| teto de 20 páginas | toda página com 100 | 20 consultas; `console.warn` `"[rastreio] loja-a: importacao parou no teto de 20 páginas"` |
| varredura: cursor − 5 min até agora, só o que mudou, cursor anda | `sweepCursor: "2026-10-29T14:00:00.000Z"`; `updated_at` `"2026-10-29 10:50:00"` (id 1), `"10:56:00"` (id 2), `"11:04:00"` (id 3); `varrerPedidos("loja-a", new Date("2026-10-29T14:05:00Z"))` | 2; `date: "updated_at:2026-10-29\|2026-10-30"`; ids 2 e 3 com `"varredura"`; `avancarCursor("loja-a", "2026-10-29T14:05:00.000Z")` |
| varredura sem conexão não consulta nem anda o cursor | `conexao` → `null` | 0, nenhuma consulta, nenhum `avancarCursor` |
| varredura no teto anda o cursor mesmo assim | toda página com 100 | 10 consultas, um `avancarCursor`, `console.warn` com `"varredura parou no teto de 10 páginas"` |
| conexão com o aviso desativado lê do mesmo jeito | `conexao` → `{ ...CONEXAO, status: "aviso_desativado" }`; `varrerPedidos` com um pedido novo | a consulta é feita e o pedido é registrado como em `ativa` (a varredura é o que cobre o pedido que o aviso não traz; nenhum filtro por `status` aqui) |
| erro da Yampi sobe, e o cursor fica | `get` lança `new YampiErro(401, …)`, `new YampiErro(429, "limite", 30_000)` e `new YampiErro(0, "sem resposta")`, cada um na página 2 (a página 1 vem cheia, com 100 pedidos), em `importarPedidos` e em `varrerPedidos` | `rejects` com o mesmo erro (`status` e `retryAfterMs` intactos; nada é capturado aqui); `avancarCursor` nunca chamado; os pedidos da página 1 já registrados ficam (o registro é idempotente) |

- [ ] **Step 2: Rodar e ver falhar** — Expected: FAIL, `ERR_MODULE_NOT_FOUND` (`importar`).
- [ ] **Step 3: Implementar** — `import "server-only"`; o laço comum:

```ts
async function lerPaginas(tenantId: string, conexao: ConexaoYampi, de: Date, ate: Date, teto: number, origem: OrigemDoPedido, descartaAntesDe: number | null, deps: DepsImportar): Promise<number> {
  let registrados = 0;
  for (let page = 1; page <= teto; page++) {
    const { data } = await deps.get<{ data: unknown[] }>(conexao, "/orders", { date: `updated_at:${dayBR(de)}|${dayBR(new Date(ate.getTime() + 86_400_000))}`, include: "customer,status,statuses", limit: 100, page });
    for (const p of data) {
      const em = dataDaYampi((p as { updated_at?: unknown } | null)?.updated_at);
      if (descartaAntesDe !== null && (em === null || Date.parse(em) < descartaAntesDe)) continue;
      try { if (await deps.registrar(tenantId, p, origem)) registrados++; }
      catch (e) { console.error(`[rastreio] ${tenantId}: pedido ${String((p as { id?: unknown } | null)?.id)} não gravou (${origem}): ${e instanceof Error ? e.message : String(e)}`); }
    }
    if (data.length < 100) return registrados;
  }
  console.warn(`[rastreio] ${tenantId}: ${origem} parou no teto de ${teto} páginas`);
  return registrados;
}
```

  `importarPedidos`: `deps.pepper()`; sem conexão → `throw new Error("[rastreio] importação sem conexão ativa com a Yampi")`;
  `lerPaginas(…, desde, deps.agora(), 20, "importacao", null)`. `varrerPedidos`: `deps.pepper()`; sem conexão ou
  config → `0` (o cursor fica: a conexão de volta recupera a janela); `inicio = Date.parse(config.sweepCursor ?? agora.toISOString()) - 5 * 60_000`;
  `lerPaginas(…, new Date(inicio), agora, 10, "varredura", inicio)`; `avancarCursor(tenantId, agora.toISOString())`. O
  `YampiErro` de `deps.get` não é capturado em lugar nenhum daqui: sobe até o `passo` da Task 10, e o cursor só anda
  depois do laço.
- [ ] **Step 4: Rodar e ver passar.** · **Step 5: Commit** — `feat(rastreio): import 30 days of Yampi orders and sweep by updated_at`

### Task 10: Cron, rota, `vercel.json` e a política de acesso

**Files:** Create `apps/web/src/lib/rastreio/cron.ts`, `apps/web/src/lib/rastreio/cron.test.ts`, `apps/web/src/app/api/cron/rastreio/route.ts` ·
Modify `apps/web/vercel.json`, `apps/web/src/lib/security/request-access-policy.ts`, `apps/web/src/lib/security/request-access-policy.test.ts`

**Interfaces:** Consumes `lojasComRastreio`, `lerConfig`, `garantirConfig`, `marcarImportado`, `avancarCursor`,
`purgarVencidos` (PR 1, `lib/stores/rastreio-pedidos.ts`; nada de RPC direta), `conexaoYampiAtiva`
(`@/lib/yampi/conexao`) e `YampiErro` (`@/lib/yampi/cliente`) (B·6b), Task 9, `isCronAuthorized`. Produces
`rodarCronRastreio(agora: Date, deps?: DepsCron): Promise<{ lojas: number; falhas: number; purgados: number | null }>`
(`purgados` acrescentado: o contrato da rota no PR 1 o devolve); `DEPS = { lojas: lojasComRastreio, lerConfig, garantirConfig, conexao: conexaoYampiAtiva, importar: importarPedidos, avancarCursor, marcarImportado, varrer: varrerPedidos, purgar: purgarVencidos }`;
`GET /api/cron/rastreio` → `200 { ok: true, lojas, falhas, purgados }` · `401 { error: "Unauthorized" }` · `500 { error: "falhou" }`.

- [ ] **Step 1: Escrever o teste que falha** — `montar(extra)` com os nove fakes (padrão: lojas `["loja-a", "loja-b"]`,
  `lerConfig` → `CONFIG_IMPORTADA` (`{ ...CONFIG, importedAt: "2026-10-01T00:00:00.000Z" }`), `garantirConfig` →
  `CONFIG` (`importedAt: null`), conexão `CONEXAO` (a da Task 9), `purgar` → 3) guardando as chamadas; `AGORA = new Date("2026-10-29T15:00:00Z")`;
  os erros da Yampi saem do construtor do B·6b, `new YampiErro(status, mensagem, retryAfterMs?)`: `ERRO_401`, `ERRO_429`
  (`retryAfterMs` `30_000`) e `ERRO_SEM_RESPOSTA` (`status` 0).

```ts
test("loja nova: config, 30 dias importados, cursor no começo da importação e marcada", async () => {
  const { deps, log } = montar({ lojas: async () => ["loja-a"], lerConfig: async () => null });
  assert.deepEqual(await rodarCronRastreio(AGORA, deps), { lojas: 1, falhas: 0, purgados: null });
  assert.deepEqual([log.garantir, log.importar, log.cursor, log.importado, log.varrer],
    [["loja-a"], [["loja-a", new Date("2026-09-29T15:00:00Z")]], [["loja-a", "2026-10-29T15:00:00.000Z"]], [["loja-a", AGORA]], ["loja-a"]]);
});
const DA_YAMPI: Array<[erro: YampiErro, motivo: string]> = [
  [ERRO_401, "a Yampi recusou a credencial (401)"], [ERRO_429, "a Yampi limitou as chamadas (429)"], [ERRO_SEM_RESPOSTA, "a Yampi não respondeu"],
];
test("erro da Yampi numa loja (401, 429, sem resposta) não para as outras", async (t) => { // Review Focus 5
  for (const [erro, motivo] of DA_YAMPI) await t.test(motivo, async (t) => {
    const erros: string[] = [];
    t.mock.method(console, "error", (m: unknown) => erros.push(String(m)));
    const { deps, log } = montar({ varrer: async (id) => { log.varrer.push(id); if (id === "loja-a") throw erro; return 0; } });
    assert.deepEqual(await rodarCronRastreio(AGORA, deps), { lojas: 2, falhas: 1, purgados: null });
    assert.deepEqual([log.varrer, erros], [["loja-a", "loja-b"], [`[rastreio/cron] varrer loja-a: ${motivo}`]]);
  });
});
```

  E: `"loja já importada só varre"` (nenhuma importação, `varrer` nas duas); `"sem Yampi conectada não importa nem
  varre, e não é falha"` (`lerConfig` → `null`, `conexao` → `null`: `importar` e `varrer` vazios, `falhas: 0`);
  `"importação que falha tenta de novo na rodada seguinte"` (`lerConfig` → `null`, `importar` lançando `ERRO_429`:
  `falhas: 1`, `log.cursor`, `log.importado` e `log.varrer` vazios; sem `marcarImportado`, a loja volta a importar);
  `"purge uma vez por dia, na execução das 06:00 UTC"` (`2026-10-30T06:02:00Z` → `purgados: 3` e 1 chamada; `06:07` e
  `18:02` → `null` e nenhuma); `"sem a lista de lojas a execução lança"` (`lojas` lançando → `rejects`).
- [ ] **Step 2: Rodar e ver falhar** — Expected: FAIL, `ERR_MODULE_NOT_FOUND` (`cron`).
- [ ] **Step 3: Implementar** — `cron.ts` (`import "server-only"`):

```ts
const MOTIVO_DA_YAMPI: Record<number, string> = { 401: "a Yampi recusou a credencial (401)", 429: "a Yampi limitou as chamadas (429)", 0: "a Yampi não respondeu" };

export async function rodarCronRastreio(agora: Date, deps: DepsCron = DEPS): Promise<{ lojas: number; falhas: number; purgados: number | null }> {
  let falhas = 0;
  async function passo<T>(nome: string, alvo: string, f: () => Promise<T>): Promise<T | null> {
    try { return await f(); } catch (e) {
      falhas++;
      // YampiErro: a loja para nesta rodada (o cursor só anda depois do laço) e a seguinte, 5 min depois, tenta de novo; o cron não espera o retryAfterMs.
      // 401 = token trocado: o yampiGet (B·6b) já marcou a conexão credencial_invalida e avisou no sino, então aqui é só o log. A mensagem do erro fica fora do log.
      const motivo = (e instanceof YampiErro && MOTIVO_DA_YAMPI[e.status]) || (e instanceof Error ? e.message : String(e));
      console.error(`[rastreio/cron] ${nome} ${alvo}: ${motivo}`);
      return null;
    }
  }
  const lojas = await deps.lojas(); // lista fora = execução inteira falha (a rota responde 500)
  for (const tenantId of lojas) {
    const importada = await passo("ligar", tenantId, () => ligarLoja(tenantId, agora, deps));
    if (importada) await passo("varrer", tenantId, () => deps.varrer(tenantId, agora));
    // PRs 4 e 5: passos de e-mail e WhatsApp aqui, fora do `if`: aviso criado pelo webhook sai mesmo com a API da loja fora.
  }
  const purgados = agora.getUTCHours() === 6 && agora.getUTCMinutes() < 5 ? await passo("purgar", "global", deps.purgar) : null;
  return { lojas: lojas.length, falhas, purgados };
}
```

  `ligarLoja(tenantId, agora, deps): Promise<boolean>`: `config = (await lerConfig(tenantId)) ?? (await garantirConfig(tenantId))`;
  `importedAt` preenchido → `true`; sem conexão → `false`; senão `importar(tenantId, agora − 30 dias)`,
  `avancarCursor(tenantId, agora.toISOString())`, `marcarImportado(tenantId, agora)`, `true`. `// ponytail:` sem
  orçamento de tempo por loja (molde `app/api/cron/bling/executar.ts`); acrescentar quando lojas × páginas encostarem
  nos 300 s. Rota no molde de `app/api/cron/bling/route.ts`: `runtime = "nodejs"`, `dynamic = "force-dynamic"`,
  `maxDuration = 300`; `isCronAuthorized(req.headers.get("authorization"), process.env.CRON_SECRET ?? "")` → 401;
  `Response.json({ ok: true, ...(await rodarCronRastreio(new Date())) })`; `catch` → `console.error` e 500.
  `vercel.json`: `{ "path": "/api/cron/rastreio", "schedule": "*/5 * * * *" }` no fim de `crons`. `classifyRequest`:
  `pathname === "/api/cron/rastreio"` na lista dos crons, com a linha "/api/cron/rastreio: importação, varredura e
  purge do Rastreio a cada 5 min"; no teste `"cron endpoints use handler-level authentication"`,
  `classifyRequest("/api/cron/rastreio", "GET") === "cron"` e `("/api/cron/rastreio/outra", "GET") === "user"`.
- [ ] **Step 4: Rodar os testes e os dois `tsc`** · Expected: verde. · **Step 5: Commit** — `feat(rastreio): tracking cron every 5 minutes with daily purge`

### Task 11: Entrada do Rastreio em `CONSUMIDORES`

**Files:** Modify `apps/web/src/lib/yampi/consumidores.ts` (arquivo do B·6, que nasce com `CONSUMIDORES = []`; este PR só acrescenta a entrada e não toca `processar.ts`) · Create `apps/web/src/lib/yampi/consumidores.test.ts` (se o B·6 ou o Recuperar já o criou em `main`, acrescentar os casos).

**Interfaces:** Consumes `ConsumidorDeEvento` e `EventoParaConsumir` (o mesmo arquivo), `EVENTOS_DO_RASTREIO` e
`registrarPedidoDaYampi` (Task 8), `rastreioLigado` (PR 1, `lib/stores/rastreio-config.ts`). Produces, e só isto, uma entrada no array:

```ts
{ nome: "rastreio", eventos: EVENTOS_DO_RASTREIO, ligado: rastreioLigado, consumir: (e) => registrarPedidoDaYampi(e.tenantId, e.recurso, "aviso") }
```

`e.recurso` já é o `resource` do envelope (o envelope inteiro fica em `e.payload`). O processador do B·6 chama só o
consumidor ligado que assina o evento e só marca `processed_at` depois de todos; se o `consumir` lança, o evento fica
com `error` e volta pelo `/api/cron/yampi` (parado entre 3 min e 24 h, até 50 por execução). Sem `try/catch` na
entrada. `consumir` é idempotente, como o contrato exige: a RPC do PR 1 segura "a etapa não volta" e `criarAvisos` é
`on conflict do nothing`. O Recuperar acrescenta a entrada dele no PR 7 dele, no mesmo array: quem mergear depois
reconcilia (conflito trivial).

- [ ] **Step 1: Escrever os testes que falham** (`consumidores.test.ts`; `RASTREIO_DOC_PEPPER` de 32 caracteres antes dos testes):
  - `"a entrada rastreio assina só os três eventos de pedido e liga pela flag do módulo"` —
    `CONSUMIDORES.filter((c) => c.nome === "rastreio")` tem uma entrada; `eventos` `deepEqual`
    `["order.created", "order.paid", "order.status.updated"]` (sem `cart.reminder` nem `transaction.payment.refused`: o
    carrinho não registra pedido); `ligado === rastreioLigado`.
  - `"consumir passa a loja, o recurso (não o envelope) e a origem aviso"` — evento
    `{ eventoId: "e1", tenantId: "loja-a", conexao: {} as ConexaoYampi, evento: "order.paid", time: "2026-10-29 10:00:00", recurso: {}, payload: pedidoYampi() }`
    e `console.warn` espiado ⇒ `consumir` resolve `null` e o log é `"[rastreio] loja-a: pedido da Yampi fora do formato (aviso)"`.
    Mutante: `e.payload` no lugar de `e.recurso` levaria o pedido válido ao banco, sem credencial no teste, e o caso falha
    (o `payload` é de propósito um pedido válido e o `recurso`, não: é o que distingue os dois campos).
- [ ] **Step 2: Rodar e ver falhar** — Expected: FAIL, nenhuma entrada `rastreio` em `CONSUMIDORES`.
- [ ] **Step 3: Implementar** — a entrada acima no array, com os imports direto dos arquivos (`@/lib/rastreio/registrar`,
  `@/lib/stores/rastreio-config`; a base não tem barril, e o registro importa os módulos).
- [ ] **Step 4: Rodar e ver passar** — o arquivo, o `processar.test.ts` do B·6 e os dois `tsc`.
- [ ] **Step 5: Commit** — `feat(rastreio): record orders from the Yampi webhook through CONSUMIDORES`

### Task 12: Fechamento da Parte 2

- [ ] **Step 1:** os quatro comandos do índice e o `verify-local.ps1` verdes; revisão do diff (agente Code Reviewer).
- [ ] **Step 2:** push → `gh pr create --base main --title "feat(rastreio): record Yampi orders — webhook, import, sweep, cron (PR 2, part 2)"` → CI verde → `gh pr merge <N> --squash --delete-branch`.
- [ ] **Step 3: Conferência em prod** — no log da Vercel, a execução seguinte de `/api/cron/rastreio` responde `200 {"ok":true,"lojas":0,"falhas":0,"purgados":null}` (nenhuma loja com `rastreio_enabled` ainda). `RASTREIO_DOC_PEPPER` nos dois ambientes antes de ligar a piloto (spec §10).
- [ ] **Step 4: Card** (prod): `update public.board_features set blocker = 'PR 2 no ar: pedido gravado pelo aviso, importação e varredura; faltam página (3), e-mail (4), painel (6) e WhatsApp (5)' where key = 'rastreio-pedidos';`.
- [ ] **Step 5:** sugerir `rag insert "decisão: Rastreio grava pedido pelo aviso da Yampi e por varredura de updated_at; aviso só com etapa nova de até 3 dias, fora da importação e com plano ativo" --source decisao-2026-10-29`; ao encerrar, "PRs que deixei abertos: …".

---

## Interface com os outros PRs

- **PR 1:** usa `PedidoGravado.paradoEm`/`temTelefone`/`temEmail` (da linha gravada), `purgarVencidos` e a regra de `phone_last4` = `ultimos4(buyer_phone)`; `doc_hmac` = 64 hex minúsculos.
- **PR 3:** `normalizarDocumento`, `docHmac`, `pepperDoRastreio`, `ultimos4`, `lojaDoRastreio`, `linkDoPedido`, `linkDaBusca`. O CNPJ alfanumérico tem letra: o campo da busca não pode ser só numérico. Sem pepper, a busca é erro do servidor, nunca "não achei".
- **PR 4 e PR 5:** os ganchos entram em `registrarPedidoDaYampi` depois do `criarAvisos` (o `agora` do passo 2 já existe) e, no cron, como `passo(...)` fora do `if (importada)`. `avisarLojaDoProblema` não tem `deps` (teste com PostgREST falso): o PR 4 acrescenta `deps?` com `emailDoProblema`, sem mudar o retorno. Os envios reconferem `noticesStoppedAt`: o "parar avisos" pode chegar depois de o aviso nascer.
- **PR 6:** `/painel/vendas/entregas?pedido=<id>` é o `href` do sininho; o reenvio usa `reabrirAvisos` (PR 1), não o registro.
- **B·6 e B·6b (base):** `yampiGet(conexao, "/orders", query)` (`@/lib/yampi/api`), caminho relativo ao alias, `query` com número; o `YampiErro` (`@/lib/yampi/cliente`; `status`, `retryAfterMs`; `status 0` = sem resposta) sobe da varredura até o passo do cron, que para a loja nesta execução; no 401 o próprio `yampiGet` marca a conexão `credencial_invalida` e avisa no sino uma vez; `conexaoYampiAtiva` (`@/lib/yampi/conexao`) devolve a conexão `ativa` ou `aviso_desativado` (a credencial vale) e `null` fora disso, e é o `null` que cala a varredura da loja com token trocado; o processador (`processarEventoYampi`) chama a entrada `rastreio` de `CONSUMIDORES` (só com `rastreioLigado` e um dos três eventos) e só marca `processed_at` depois de todos os consumidores; a retentativa do evento é do `/api/cron/yampi`, que o Rastreio não reprocessa.

## Divergências com o código (e decisões deste plano)

1. A origem pública da bio não é constante em `lib/bio/editor-divulgar.ts`: é `getPublicSiteUrl()` (`lib/brand.ts`, env `NEXT_PUBLIC_SITE_URL`, padrão `https://www.girumo.com.br`), a de `lib/bio/cache.ts`. O `link.ts` usa a mesma.
2. `cnpjValido` da bio aceita o CNPJ alfanumérico (Receita, desde jul/2026) e exige maiúsculas; o spec diz "11 ou 14 dígitos". `normalizarDocumento` guarda as letras em `digitos`.
3. `linkDoPedido`/`linkDaBusca` recebem `{ dominio; publicSlug }` (a `LojaDoRastreio` cabe), para a Parte 1 não depender de `loja.ts`.
4. Spec §1.2 diz que "a reconciliação" enche sem aviso; o índice deixa a varredura avisar etapa de até 3 dias. Segui o índice: ela cobre o aviso perdido e o código de rastreio sem mudança de status (que não dispara `order.status.updated`).
5. A bio não tem "cor primária" nem nome de loja separado: cor = botão em destaque (`coresDaMarca(documento).botao`) e nome = `perfil.nome` da página publicada; sem bio, `humanizeName` do nome da organização (pedido dos PRs 4 e 5).
6. `notifications` não tem helper nem restrição de `type` (o teto gravou `teto_posts_grupo` assim); dedupe por `tenant_id` + `type` + `href`, que leva o id do pedido.
7. Loja sem plano não ganha nem o sininho do problema ("nenhum aviso" do índice).
8. O envelope da Yampi é `{ event, time, merchant, resource }`; o `EventoParaConsumir` da base já traz o `resource` em `e.recurso` (o envelope inteiro fica em `e.payload`, e o `time` em `e.time`), com o formato do item de `GET /orders`. A entrada do Rastreio passa `e.recurso`.
9. `rodarCronRastreio` devolve também `purgados` (a resposta da rota no contrato da API do PR 1).
