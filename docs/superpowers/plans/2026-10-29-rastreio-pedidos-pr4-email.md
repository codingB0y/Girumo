# Rastreio do pedido — PR 4: E-mail (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A compradora recebe por e-mail, com o nome e a cor da loja, o aviso de cada etapa (confirmado, enviado, retirada, problema, entregue): na hora em que a etapa muda e, se o provedor falhar, em novas tentativas por ~8,5 h. A loja recebe um e-mail quando um pedido vira `problema`.

**Architecture:** O remetente é o endereço da Girumo com o nome da loja (`fromName`). O layout é próprio e puro (`lib/rastreio/email.ts`: HTML escapado, cor da loja com contraste, versão em texto). `enviarAvisoPorEmail` lê o aviso, confere loja ligada e "parar avisos", abre o e-mail cifrado, envia com chave de idempotência `rastreio:<aviso>:<resends>` e marca o aviso; falha agenda nova tentativa com espera crescente. Três ganchos usam isso: o registrar (saída imediata), o cron (retentativa) e `avisarLojaDoProblema` (e-mail à loja).

**Tech Stack:** TypeScript (Next.js, `server-only`), Resend via `sendEmail`, `tsx --test` (node:test) com dependências injetadas.

**Spec:** `docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md` (§1.2, §1.5, §3.3, §7). **Mockup** (fora do repo, tem o nome da loja-piloto): `C:\Users\Igor\Desktop\girumo-design-refs\rastreio-pedidos\project\Email.dc.html`.
**Índice:** `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md` — Contrato, Global Constraints e Review Focus valem aqui. Dados de teste inventados; o nome da piloto nunca entra no repo (aqui: "Loja Exemplo").

## Antes de começar

São ~20 arquivos com testes, então **três Partes**, três PRs pequenos, em ordem. A 3 não depende da 2, mas as duas editam `registrar.ts`: sobem em sequência. Este PR anda em paralelo com o 3 e o 6; não toque em arquivos deles (página pública, painel).

1. Worktree novo a partir de `origin/main` (`EnterWorktree` ou o comando abaixo; a cada Parte, depois de mergear a anterior; junctions do `node_modules` como no índice, "Ambiente do worktree"):
   ```powershell
   git fetch origin main
   git worktree add .claude/worktrees/rastreio-pr4-email -b feat/rastreio-pr4-email origin/main
   ```
2. PRs 1 e 2 têm de estar em `main`. Conferir:
   ```powershell
   $d = "apps/web/src/lib"
   "$d/rastreio/tipos.ts","$d/rastreio/loja.ts","$d/rastreio/link.ts","$d/rastreio/registrar.ts","$d/rastreio/cron.ts","$d/stores/rastreio-pedidos.ts","$d/stores/rastreio-avisos.ts","$d/stores/rastreio-config.ts" | ForEach-Object { git cat-file -e "origin/main:$_" 2>$null; "$_ " + $(if ($LASTEXITCODE -eq 0) { "ok" } else { "FALTA" }) }
   ```
   Expected: oito `ok`; qualquer `FALTA` = PR 1 ou 2 não mergeado, parar.
3. Teste de um arquivo (mais rápido que a suíte): `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/email/send.test.ts`. A suíte e os dois `tsc` ficam para o fechamento.
4. Sem migração e sem env nova (`RESEND_API_KEY` e `RESEND_FROM_EMAIL` já existem). Todo commit leva `-m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"` além da mensagem.

## Partes e arquivos (sob `apps/web/src/`)

| Parte · branch | Arquivos |
|---|---|
| **1** · `feat/rastreio-pr4-email` | `lib/email/delivery-log.ts` (`"rastreio"`), `lib/email/send.ts` (`fromName`, `text`, `remetenteComNome`), `lib/rastreio/email.ts` (`corDaLoja`, `montarEmailDoAviso`, puro), `lib/rastreio/convite.ts` (`conviteDoGrupo`) + os testes |
| **2** · `feat/rastreio-pr4-email-envio` | `lib/stores/rastreio-avisos.ts` (`avisoPendente`), `lib/rastreio/enviar-email.ts` (envio e retentativa), ganchos em `lib/rastreio/registrar.ts` e `cron.ts` + os testes |
| **3** · `feat/rastreio-pr4-email-alerta` | `lib/email/delivery-log.ts` (`"rastreio_problema"`), `templates.ts` (`rastreioProblemaEmail`), `lib/bling/avisar-reconectar.ts` (só `export`), `lib/rastreio/avisar-loja-por-email.ts`, gancho em `registrar.ts` + os testes |

## Foco da revisão (deste PR; o do índice continua valendo)

1. **Texto do banco no HTML e no remetente:** nome da loja, código, primeiro nome e URL do convite escapados; `fromName` com `< > " @` e quebra de linha não vira outro destinatário (`email.test.ts`, `send.test.ts`).
2. **"Parar avisos" vence a corrida:** aviso `pendente` de pedido parado vira `pulado` e nunca sai (tabela de pulados, Task 4).
3. **Reenvio manual de verdade:** a chave do Resend leva `resends`; sem ele o reenvio devolve o e-mail antigo sem mandar nada (chave `rastreio:a-1:2`).
4. **E-mail que falha não derruba o registrar nem o cron** e gasta no máximo 5 tentativas ("nunca lança", "5ª falha").
5. **Convite só quando faz sentido:** sem `vipLinkId`, com o link apagado ou com a compradora já em `leads`, sai sem convite (`convite.test.ts`).

---

## Parte 1 — remetente, layout e convite

### Task 1: `fromName`, `text` e o tipo `rastreio` no envio

**Files:**
- Modify: `apps/web/src/lib/email/delivery-log.ts` (`EmailKind` ganha `"rastreio"`), `apps/web/src/lib/email/send.ts`, `apps/web/src/lib/email/send.test.ts`

**Interfaces:**
- Produces: `SendOptions.fromName?: string` (só o nome de exibição; o endereço segue o de `FROM_EMAIL`); `SendOptions.text?: string` (parte em texto puro do mesmo e-mail); `remetenteComNome(base: string, nome: string | undefined): string`, exportada.

- [ ] **Step 1: Testes que falham** — em `send.test.ts` (`remetenteComNome` entra no `import`; `ENVIO`, `fetchOriginal` e o servidor falso já existem lá):

```ts
const BASE = "Girumo <noreply@girumo.com.br>";

test("remetenteComNome troca só o nome de exibição e não deixa < > \" \\ @ nem quebra de linha passar", () => {
  assert.equal(remetenteComNome(BASE, "Loja Exemplo"), '"Loja Exemplo" <noreply@girumo.com.br>');
  assert.equal(remetenteComNome("noreply@girumo.com.br", "Loja Exemplo"), '"Loja Exemplo" <noreply@girumo.com.br>');
  assert.equal(remetenteComNome(BASE, "x".repeat(100)), `"${"x".repeat(60)}" <noreply@girumo.com.br>`);
  assert.equal(
    remetenteComNome(BASE, 'Loja <ceo@banco.test>"\r\nBcc: alguem@x.test'),
    '"Loja ceo banco.test Bcc: alguem x.test" <noreply@girumo.com.br>',
  );
  assert.equal(remetenteComNome(BASE, '<>"\r\n'), BASE);
  assert.equal(remetenteComNome(BASE, undefined), BASE);
});

test("fromName e text chegam ao Resend; sem fromName vale o remetente padrão", async () => {
  process.env.RESEND_API_KEY = "re_chave_falsa";
  const corpos: Array<{ from: string; text?: string }> = [];
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = entrada instanceof Request ? entrada.url : String(entrada);
    if (!url.startsWith("https://api.resend.com/")) return fetchOriginal(entrada, init);
    corpos.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ id: "email-1" }), { status: 200 });
  }) as typeof fetch;

  assert.equal(await sendEmail({ ...ENVIO, kind: "rastreio", fromName: "Loja Exemplo", text: "oi" }), true);
  assert.equal(await sendEmail(ENVIO), true);
  assert.match(corpos[0].from, /^"Loja Exemplo" <[^<>]+>$/);
  assert.equal(corpos[0].text, "oi");
  assert.doesNotMatch(corpos[1].from, /Loja Exemplo/);
});
```

- [ ] **Step 2: Rodar e ver falhar** — comando do item 3 de "Antes de começar" · Expected: FAIL (`remetenteComNome` não existe).
- [ ] **Step 3: Implementar** — `delivery-log.ts`: `| "rastreio"` no fim de `EmailKind`. `send.ts`: os dois campos em `SendOptions` e `resend.emails.send({ from: remetenteComNome(FROM_EMAIL, fromName), to, subject, html, text }, { idempotencyKey })`. Qualquer outro caminho do nome da loja até o `From` é bug:

```ts
const PROIBIDOS = '<>"\\@';
export function remetenteComNome(base: string, nome: string | undefined): string {
  const limpo = Array.from(nome ?? "")
    .map((c) => (c < " " || c === "\u007f" || PROIBIDOS.includes(c) ? " " : c))
    .join("").replace(/\s+/g, " ").trim().slice(0, 60);
  if (!limpo) return base;
  const dentro = /<([^>]+)>\s*$/.exec(base);
  return `"${limpo}" <${(dentro ? dentro[1] : base).trim()}>`;
}
```
- [ ] **Step 4: Rodar e ver passar** — mesmo comando · Expected: PASS no arquivo todo (os dois testes antigos seguem verdes).
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/email/delivery-log.ts apps/web/src/lib/email/send.ts apps/web/src/lib/email/send.test.ts
git commit -m "feat(email): let sendEmail set the sender display name and a plain-text part" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 2: `montarEmailDoAviso`, o e-mail com a cara da loja

**Files:**
- Create: `apps/web/src/lib/rastreio/email.ts`, `apps/web/src/lib/rastreio/email.test.ts`

**Interfaces:**
- Consumes: `LojaDoRastreio` (`./loja`), `linkDoPedido(loja, token): string` (`./link`), `PedidoInterno`, `EtapaComAviso` (`./tipos`), `escapeHtml` (`@/lib/email/invite-copy`), `derivePalette(hex): { accent: string } | null` (`@/lib/pages/palette`: `#rrggbb` com ~4,5:1 sobre branco, ou `null` se a cor for inválida).
- Produces: `corDaLoja(cor: string | null): string` (`#rrggbb` minúsculo; ausente ou inválida → `#14181c`); `montarEmailDoAviso(loja, pedido, etapa, convite): { subject: string; html: string; text: string }` (contrato do índice).

- [ ] **Step 1: Testes que falham** — `email.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { corDaLoja, montarEmailDoAviso } from "./email";
import { linkDoPedido } from "./link";
import type { LojaDoRastreio } from "./loja";
import type { EtapaComAviso, PedidoInterno } from "./tipos";

const LOJA: LojaDoRastreio = { tenantId: "t-1", nome: "Loja Exemplo", publicSlug: "loja-exemplo", dominio: null, corPrimaria: "#BE185D", storeWhatsapp: "5511999990000", vipLinkId: null };
const PEDIDO: PedidoInterno = { id: "p-1", numero: "1532", orderCreatedAt: "2026-10-20T13:00:00.000Z", etapa: "enviado", etapaAt: "2026-10-21T13:14:00.000Z", events: [], shipmentService: "Correios SEDEX", trackingCode: "AB123456789BR", trackingUrl: null, linkToken: "0123456789abcdef0123456789abcdef", noticesStoppedAt: null, tenantId: "t-1", externalId: "9001", statusRaw: "on_carriage", buyerFirstName: "Maria", buyerPhone: "5511987654321", buyerEmailEnc: null };
const LINK = linkDoPedido(LOJA, PEDIDO.linkToken);

test("enviado: saudação, serviço, código, WhatsApp da loja e dois links para a página do pedido", () => {
  const { subject, html, text } = montarEmailDoAviso(LOJA, PEDIDO, "enviado", null);
  assert.equal(subject, "Seu pedido nº 1532 foi enviado");
  assert.ok(html.includes("Oi, Maria! Seu pedido nº 1532 da Loja Exemplo foi enviado (Correios SEDEX)."));
  assert.ok(html.includes("Código de rastreio · Correios SEDEX") && html.includes("AB123456789BR") && html.includes(">LE<"));
  assert.equal(html.split(`href="${LINK}"`).length - 1, 2); // botão e "Parar avisos"
  assert.ok(html.includes("Enviado pela Girumo em nome da Loja Exemplo.") && html.includes('href="https://wa.me/5511999990000"'));
  assert.ok(!html.includes("grupo VIP") && text.includes(LINK) && !/<[a-z/]/i.test(text));
});

test("texto do banco entra escapado no HTML e cru no assunto e no texto", () => {
  const loja = { ...LOJA, nome: 'Moda <b>"Sul"</b> & Cia' };
  const pedido = { ...PEDIDO, numero: "15\n32", trackingCode: "<script>x</script>", buyerFirstName: "<i>Ana" };
  const { subject, html, text } = montarEmailDoAviso(loja, pedido, "enviado", { url: 'https://x.test/a"b' });
  assert.ok(!html.includes("<script>") && !html.includes("<b>") && !html.includes("<i>Ana"));
  assert.ok(html.includes("Moda &lt;b&gt;&quot;Sul&quot;&lt;/b&gt; &amp; Cia") && html.includes("&lt;script&gt;x&lt;/script&gt;"));
  assert.ok(html.includes("Oi, &lt;i&gt;Ana!") && html.includes('href="https://x.test/a&quot;b"'));
  assert.ok(text.includes('Moda <b>"Sul"</b> & Cia'));
  assert.equal(subject, "Seu pedido nº 15 32 foi enviado");
});

test("sem primeiro nome a saudação é 'Olá!'; cor inválida cai na neutra e não vira CSS", () => {
  const { html } = montarEmailDoAviso({ ...LOJA, corPrimaria: "red;} body{display:none" }, { ...PEDIDO, buyerFirstName: null }, "entregue", null);
  assert.ok(html.includes("Olá! Seu pedido nº 1532 da Loja Exemplo foi entregue.") && !html.includes("Oi, ") && !html.includes("display:none"));
  assert.deepEqual([corDaLoja("#BE185D"), corDaLoja("#FFE600"), corDaLoja(null), corDaLoja("red;}")], ["#be185d", "#857800", "#14181c", "#14181c"]);
});

test("convite, WhatsApp da loja e código só aparecem com dado", () => {
  const url = "https://www.girumo.com.br/r/vip-exemplo";
  const com = montarEmailDoAviso(LOJA, PEDIDO, "enviado", { url });
  assert.ok(com.html.includes("As novidades saem primeiro no grupo VIP") && com.html.includes(`<a href="${url}"`) && com.text.includes(url));
  for (const storeWhatsapp of [null, "abc"]) assert.ok(!montarEmailDoAviso({ ...LOJA, storeWhatsapp }, PEDIDO, "enviado", null).html.includes("wa.me"));
  assert.ok(!montarEmailDoAviso(LOJA, { ...PEDIDO, trackingCode: null }, "confirmado", null).html.includes("Código de rastreio"));
});

test("cada etapa tem assunto e título próprios; o terceiro passo do andamento acompanha", () => {
  const casos: Array<[EtapaComAviso, string, string]> = [
    ["confirmado", "Recebemos o pagamento do pedido nº 1532", "Pagamento confirmado"],
    ["enviado", "Seu pedido nº 1532 foi enviado", "Seu pedido está a caminho"],
    ["retirada", "Seu pedido nº 1532 está pronto para retirada", "Seu pedido está pronto para retirada"],
    ["problema", "Problema na entrega do pedido nº 1532", "A entrega não foi concluída"],
    ["entregue", "Seu pedido nº 1532 foi entregue", "Seu pedido foi entregue"],
  ];
  for (const [etapa, assunto, titulo] of casos) {
    const r = montarEmailDoAviso(LOJA, PEDIDO, etapa, null);
    assert.equal(r.subject, assunto);
    assert.ok(r.html.includes(`>${titulo}</h1>`), etapa);
  }
  const retirada = montarEmailDoAviso(LOJA, PEDIDO, "retirada", null).html;
  assert.ok(retirada.includes(">Retirada<") && !retirada.includes(">Enviado<"));
  assert.match(montarEmailDoAviso(LOJA, PEDIDO, "enviado", null).html, />Confirmado<[\s\S]*>Separado<[\s\S]*>Enviado<[\s\S]*>Entregue</);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `… --test src/lib/rastreio/email.test.ts` · Expected: FAIL (módulo `./email` não existe).
- [ ] **Step 3: Implementar** `email.ts`. `corDaLoja(cor) = (cor ? derivePalette(cor)?.accent : null) ?? "#14181c"` (só `#rrggbb` chega ao `style`). `montarEmailDoAviso`: coluna de 560 px, tabelas e `style` inline (sem `<style>`, imagem remota ou script; e-mail não tem flex), todo texto do banco e todo atributo por `escapeHtml`; assunto e `text` em texto puro (`numero` com espaço ou quebra vira um espaço no assunto). Saudação `Oi, {primeiro nome}!`, ou `Olá!` sem nome. Cópia (sem serviço some o ` ({serviço})`):

| etapa | assunto | título (`h1`) | introdução, depois da saudação | botão |
|---|---|---|---|---|
| confirmado | Recebemos o pagamento do pedido nº {n} | Pagamento confirmado | Recebemos o pagamento do pedido nº {n} da {loja}. | Acompanhar pedido |
| enviado | Seu pedido nº {n} foi enviado | Seu pedido está a caminho | Seu pedido nº {n} da {loja} foi enviado ({serviço}). | Acompanhar pedido |
| retirada | Seu pedido nº {n} está pronto para retirada | Seu pedido está pronto para retirada | Seu pedido nº {n} da {loja} está pronto para retirada. Combine com a loja onde e quando retirar. | Ver o pedido |
| problema | Problema na entrega do pedido nº {n} | A entrega não foi concluída | A transportadora não conseguiu entregar o pedido nº {n} da {loja}. A loja já foi avisada e vai falar com você. | Ver detalhes |
| entregue | Seu pedido nº {n} foi entregue | Seu pedido foi entregue | Seu pedido nº {n} da {loja} foi entregue. Se alguma peça não estiver certa, fale com a loja. | Ver o pedido |

Blocos, nesta ordem (mockup): (1) círculo na cor da loja com as iniciais das duas primeiras palavras + nome da loja; (2) `h1` e introdução; (3) andamento em 4 colunas "Confirmado · Separado · {Enviado | Retirada | Problema} · Entregue" (✓ nos feitos: 0 em `confirmado`, 2 em `enviado`/`retirada`/`problema`, 4 em `entregue`; anel no atual; círculo vazio nos próximos); (4) se houver `trackingCode`, caixa "Código de rastreio · {serviço}" (sem serviço, só "Código de rastreio") com o código em fonte monoespaçada; (5) botão na cor da loja, texto branco, para `linkDoPedido(loja, pedido.linkToken)`; (6) "Falar com a loja no WhatsApp" → `https://wa.me/<só dígitos>`, só com ≥ 10 dígitos em `storeWhatsapp`; (7) se vier `convite`: "As novidades saem primeiro no grupo VIP" / "Lançamentos e reposições aparecem lá antes do site." + link "Entrar no grupo"; (8) rodapé: "Você recebeu este e-mail porque comprou na {loja}." / "Não quer mais avisos deste pedido? Parar avisos" (mesmo link do botão: o botão de parar mora na página e `GET` nunca grava) / "Enviado pela Girumo em nome da {loja}.". `text`: título, introdução, código, `{botão}: {link}`, WhatsApp, convite e rodapé, uma linha cada, sem tag. Nada de endereço, itens, valores, e-mail, telefone ou documento: o builder só lê os campos acima.
- [ ] **Step 4: Rodar e ver passar** — mesmo comando · Expected: PASS (5 testes).
- [ ] **Step 5: Conferência visual (fora do commit)** — gravar o `html` do primeiro teste em `$env:TEMP\email-rastreio.html` com um `writeFileSync` temporário (apagar depois), abrir no pane do navegador e comparar com `Email.dc.html`: iniciais e nome, título, quatro passos, caixa do código, botão na cor da loja, rodapé de três linhas.
- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/rastreio/email.ts apps/web/src/lib/rastreio/email.test.ts
git commit -m "feat(rastreio): store-branded order e-mail" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: `conviteDoGrupo`

**Files:**
- Create: `apps/web/src/lib/rastreio/convite.ts`, `apps/web/src/lib/rastreio/convite.test.ts`

**Interfaces:**
- Consumes: `LojaDoRastreio` (`./loja`), `linkDaBusca(loja)` (`./link`), `getTrackedLinkById(tenantId, id)` (`@/lib/stores/tracked-links`), `variantesDoTelefone(entrada): string[] | null` (`@/lib/vendas/telefone`), `campaignLinkPath(origem, slug)` (`@/lib/custom-domains/host`).
- Produces: `type DepsDoConvite = { linkPorId: (tenantId: string, id: string) => Promise<{ slug: string } | null>; jaEhLead: (tenantId: string, telefones: string[]) => Promise<boolean> }`; `conviteDoGrupo(loja: LojaDoRastreio, telefone: string | null, deps?: DepsDoConvite): Promise<{ url: string } | null>`.

- [ ] **Step 1: Testes que falham** — `convite.test.ts` (mesma `LOJA` da Task 2, com `vipLinkId: "l-1"` e `corPrimaria: null`):

```ts
function montar(extra: Partial<DepsDoConvite> = {}) {
  const consultas: string[][] = [];
  const deps: DepsDoConvite = {
    linkPorId: async () => ({ slug: "vip-exemplo" }),
    jaEhLead: async (_t, telefones) => { consultas.push(telefones); return false; },
    ...extra,
  };
  return { deps, consultas };
}
const URL_WWW = { url: "https://www.girumo.com.br/r/vip-exemplo" };

test("link público do VIP: /r/<slug> no www e /<slug> no domínio do lojista", async () => {
  assert.deepEqual(await conviteDoGrupo(LOJA, "5511987654321", montar().deps), URL_WWW);
  assert.deepEqual(await conviteDoGrupo({ ...LOJA, dominio: "loja.exemplo.test" }, "5511987654321", montar().deps), { url: "https://loja.exemplo.test/vip-exemplo" });
});

test("quem já é lead da loja não recebe convite; a consulta usa as 4 formas do telefone", async () => {
  const { deps, consultas } = montar();
  deps.jaEhLead = async (_t, telefones) => { consultas.push(telefones); return true; };
  assert.equal(await conviteDoGrupo(LOJA, "5511987654321", deps), null);
  assert.deepEqual([...consultas[0]].sort(), ["1187654321", "11987654321", "551187654321", "5511987654321"]);
});

test("sem vipLinkId, link apagado ou consulta que falha: sem convite; sem telefone: convida sem consultar", async () => {
  const { deps, consultas } = montar();
  assert.equal(await conviteDoGrupo({ ...LOJA, vipLinkId: null }, "5511987654321", deps), null);
  assert.equal(await conviteDoGrupo(LOJA, "5511987654321", montar({ linkPorId: async () => null }).deps), null);
  assert.deepEqual(await conviteDoGrupo(LOJA, null, deps), URL_WWW);
  assert.deepEqual(consultas, []);
  const aviso = console.warn;
  console.warn = () => undefined;
  try {
    assert.equal(await conviteDoGrupo(LOJA, "5511987654321", montar({ jaEhLead: async () => { throw new Error("banco fora do ar"); } }).deps), null);
  } finally { console.warn = aviso; }
});
```

- [ ] **Step 2: Rodar e ver falhar** — `… --test src/lib/rastreio/convite.test.ts` · Expected: FAIL (módulo não existe).
- [ ] **Step 3: Implementar** `convite.ts` (`import "server-only"`). Ordem: sem `loja.vipLinkId` → `null`; `linkPorId` nulo → `null`; com telefone, `variantes = variantesDoTelefone(telefone)` e, se houver, `jaEhLead(loja.tenantId, variantes)` verdadeiro → `null`; `origem = new URL(linkDaBusca(loja)).origin` (domínio ativo do lojista ou `www`: a regra do link do pedido); `{ url: origem + campaignLinkPath(origem, link.slug) }`. Exceção de qualquer dep: `console.warn` com o `tenantId` (sem telefone) e `null`, porque o aviso do pedido não espera por um convite. Deps reais: `linkPorId: getTrackedLinkById`; `jaEhLead` = `getSupabaseAdmin().from("leads").select("id").eq("tenant_id", tenantId).in("phone", telefones).limit(1)` (`leads` não tem coluna `phone_key`, só um índice de expressão que o PostgREST não filtra; molde: `lib/stores/painel-do-site.ts`).
- [ ] **Step 4: Rodar e ver passar** · Expected: PASS (3 testes).
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/rastreio/convite.ts apps/web/src/lib/rastreio/convite.test.ts
git commit -m "feat(rastreio): VIP group invite for the order e-mail, skipped for people already in the groups" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Fechar a Parte 1** (seção "Fechamento"). O índice não pede revisão de segurança para o PR 4, mas aqui texto do banco chega a um cabeçalho de e-mail (`From`) e ao HTML: pedir ao agente Security Engineer um olhar só sobre `remetenteComNome` e o escape de `email.ts`. Título do PR: `feat(rastreio): store-branded order e-mail layout (rastreio PR 4, part 1)`.

---

## Parte 2 — envio, retentativa e ganchos

### Task 4: `enviarAvisoPorEmail` e `enviarEmailsPendentes`

**Files:**
- Modify: `apps/web/src/lib/stores/rastreio-avisos.ts`, `apps/web/src/lib/stores/rastreio-avisos.test.ts`
- Create: `apps/web/src/lib/rastreio/enviar-email.ts`, `apps/web/src/lib/rastreio/enviar-email.test.ts`

**Interfaces:**
- Consumes (PR 1 e 2): `rastreioLigado`, `lerPedido`, `abrirEmailDoPedido`, `avisosParaEnviar(tenantId, "email", limite, agora)`, `marcarAviso(tenantId, avisoId, patch)`, `lojaDoRastreio`; (Parte 1) `montarEmailDoAviso`, `conviteDoGrupo`, `sendEmail`. O plano ativo não é checado aqui: é condição de nascimento do aviso (índice, Global Constraints).
- Produces: `avisoPendente(tenantId: string, avisoId: string): Promise<AvisoParaEnviar | null>` (o aviso `pendente` desta loja com esse id, sem olhar `next_try_at`; `null` se já saiu, foi pulado ou é de outra loja); `LIMITE_POR_RODADA = 20`; `ESPERA_MIN = [5, 30, 120, 360] as const` (minutos de espera depois da 1ª, 2ª, 3ª e 4ª falha: **5 tentativas no total**, a última ~8,5 h depois da primeira); `proximaTentativa(falhas: number, agora: Date): Date | null`; `type DepsDoEnvio`; `enviarAvisoPorEmail(tenantId: string, avisoId: string, deps?: DepsDoEnvio): Promise<boolean>` (`true` = saiu agora); `enviarEmailsPendentes(tenantId: string, agora: Date, limite?: number, deps?: DepsDoEnvio): Promise<number>` (quantos saíram).

- [ ] **Step 1: Testes que falham.** `rastreio-avisos.test.ts`, no molde do PostgREST falso que `avisosParaEnviar` já usa: com a linha `{ id: "a-1", order_id: "p-1", etapa: "enviado", channel: "email", attempts: 0, resends: 2, message_id: null }`, `avisoPendente("loja-a", "a-1")` devolve `{ id: "a-1", orderId: "p-1", etapa: "enviado", canal: "email", attempts: 0, resends: 2, messageId: null }` e a consulta leva `tenant_id=eq.loja-a`, `id=eq.a-1`, `status=eq.pendente` e `limit=1`; sem linha, devolve `null`. `enviar-email.test.ts` (fixtures `LOJA` e `PEDIDO` iguais às da Task 2, com `buyerEmailEnc: "cifrado"`):

```ts
const AGORA = new Date("2026-10-29T12:00:00.000Z");
const AVISO: AvisoParaEnviar = { id: "a-1", orderId: "p-1", etapa: "enviado", canal: "email", attempts: 0, resends: 2, messageId: null };

function montar(extra: Partial<DepsDoEnvio> = {}) {
  const marcas: Array<{ id: string; patch: Parameters<DepsDoEnvio["marcar"]>[2] }> = [];
  const enviados: Array<Parameters<DepsDoEnvio["enviar"]>[0]> = [];
  const deps: DepsDoEnvio = {
    ligado: async () => true, aviso: async () => AVISO, vencidos: async () => [AVISO],
    pedido: async () => PEDIDO, emailDoPedido: () => "maria@exemplo.test", loja: async () => LOJA, convite: async () => null,
    enviar: async (o) => { enviados.push(o); return true; },
    marcar: async (_t, id, patch) => { marcas.push({ id, patch }); },
    agora: () => AGORA,
    ...extra,
  };
  return { deps, marcas, enviados };
}

test("envia com kind rastreio, o nome da loja no remetente e a chave com resends; marca enviado", async () => {
  const { deps, marcas, enviados } = montar({ convite: async () => ({ url: "https://www.girumo.com.br/r/vip-exemplo" }) });
  assert.equal(await enviarAvisoPorEmail("t-1", "a-1", deps), true);
  const e = enviados[0];
  assert.deepEqual([e.to, e.kind, e.tenantId, e.fromName, e.idempotencyKey, e.subject], ["maria@exemplo.test", "rastreio", "t-1", "Loja Exemplo", "rastreio:a-1:2", "Seu pedido nº 1532 foi enviado"]);
  assert.ok(e.html.includes("https://www.girumo.com.br/r/vip-exemplo") && typeof e.text === "string");
  assert.deepEqual(marcas, [{ id: "a-1", patch: { status: "enviado", sentAt: "2026-10-29T12:00:00.000Z", error: null } }]);
});

const PULADOS: Array<[string, Partial<DepsDoEnvio>, string]> = [
  ["pedido com avisos parados", { pedido: async () => ({ ...PEDIDO, noticesStoppedAt: "2026-10-29T10:00:00.000Z" }) }, "avisos_parados"],
  ["loja com o rastreio desligado", { ligado: async () => false }, "rastreio_desligado"],
  ["pedido sem e-mail legível", { emailDoPedido: () => null }, "sem_email"],
];
for (const [nome, extra, motivo] of PULADOS) {
  test(`${nome}: marca pulado e não chama o provedor`, async () => {
    const { deps, marcas, enviados } = montar(extra);
    assert.equal(await enviarAvisoPorEmail("t-1", "a-1", deps), false);
    assert.deepEqual(enviados, []);
    assert.deepEqual(marcas, [{ id: "a-1", patch: { status: "pulado", error: motivo } }]);
  });
}

test("o provedor recusa: soma a tentativa e agenda a próxima; a espera cresce e a 5ª falha desiste", async () => {
  const recusa = (attempts: number) => montar({ enviar: async () => false, aviso: async () => ({ ...AVISO, attempts }) });
  const segunda = recusa(1);
  await enviarAvisoPorEmail("t-1", "a-1", segunda.deps);
  assert.deepEqual(segunda.marcas, [{ id: "a-1", patch: { status: "pendente", somarTentativa: true, nextTryAt: "2026-10-29T12:30:00.000Z", error: "recusado_pelo_provedor" } }]);
  const quinta = recusa(4);
  await enviarAvisoPorEmail("t-1", "a-1", quinta.deps);
  assert.deepEqual(quinta.marcas, [{ id: "a-1", patch: { status: "falhou", somarTentativa: true, nextTryAt: null, error: "recusado_pelo_provedor" } }]);
  assert.deepEqual([1, 2, 3, 4].map((n) => proximaTentativa(n, AGORA)?.toISOString()), ["2026-10-29T12:05:00.000Z", "2026-10-29T12:30:00.000Z", "2026-10-29T14:00:00.000Z", "2026-10-29T18:00:00.000Z"]);
  assert.equal(proximaTentativa(5, AGORA), null);
});

test("nunca lança: provedor e banco explodem; aviso que já saiu não faz nada", async () => {
  const silencio = console.error;
  console.error = () => undefined;
  try {
    const { deps } = montar({ enviar: async () => { throw new Error("resend fora do ar"); }, marcar: async () => { throw new Error("banco fora do ar"); } });
    assert.equal(await enviarAvisoPorEmail("t-1", "a-1", deps), false);
  } finally { console.error = silencio; }
  const { deps, marcas, enviados } = montar({ aviso: async () => null });
  assert.equal(await enviarAvisoPorEmail("t-1", "a-9", deps), false);
  assert.deepEqual([...enviados, ...marcas], []);
});

test("enviarEmailsPendentes lê com limite e agora, uma falha não para os outros, devolve quantos saíram", async () => {
  let n = 0;
  let lido: unknown;
  const { deps, marcas } = montar({
    vencidos: async (_t, limite, agora) => { lido = [limite, agora.toISOString()]; return [AVISO, { ...AVISO, id: "a-2" }]; },
    enviar: async () => (n += 1) === 2,
  });
  assert.equal(await enviarEmailsPendentes("t-1", AGORA, undefined, deps), 1);
  assert.deepEqual(lido, [20, "2026-10-29T12:00:00.000Z"]);
  assert.deepEqual(marcas.map((m) => [m.id, m.patch.status]), [["a-1", "pendente"], ["a-2", "enviado"]]);
});
```

- [ ] **Step 2: Rodar e ver falhar** — `… --test src/lib/stores/rastreio-avisos.test.ts` e `… --test src/lib/rastreio/enviar-email.test.ts` · Expected: FAIL (`avisoPendente` e o módulo não existem).
- [ ] **Step 3: Implementar.** `avisoPendente`: mesma `select` e mesmo mapeador de linha de `avisosParaEnviar`; `.eq("tenant_id", …).eq("id", …).eq("status", "pendente").limit(1)`, primeira linha ou `null`; erro do banco lança `Error(error.message)`. `enviar-email.ts` (`import "server-only"`): `DepsDoEnvio` com padrão `depsReais()`, como em `lib/bling/avisar-reconectar.ts` — `ligado` (`rastreioLigado`), `aviso` (`avisoPendente`), `vencidos` (`(t, limite, agora) => avisosParaEnviar(t, "email", limite, agora)`), `pedido` (`lerPedido`), `emailDoPedido` (`abrirEmailDoPedido`), `loja` (`lojaDoRastreio`), `convite` (`conviteDoGrupo`), `enviar` (`sendEmail`), `marcar` (`marcarAviso`), `agora: () => Date`. `enviarUm(tenantId, aviso, deps, agora)` **pula** (`marcar` `{ status: "pulado", error }`, devolve `false`, sem retentativa) nesta ordem, com `error` em código (o vocabulário de `tracking_notices.error`, no molde do PR 5): loja ligada (`rastreio_desligado`) → pedido existe (`pedido_nao_encontrado`) → `noticesStoppedAt` (`avisos_parados`) → e-mail legível (`sem_email`) → loja configurada (`sem_config`). Depois, `convite(loja, pedido.buyerPhone)`, `montarEmailDoAviso(loja, pedido, aviso.etapa, convite)` e `enviar({ to, subject, html, text, tenantId, kind: "rastreio", fromName: loja.nome, idempotencyKey: "rastreio:" + aviso.id + ":" + aviso.resends })`. `true` → `{ status: "enviado", sentAt: agora.toISOString(), error: null }`. `false` → falha com `recusado_pelo_provedor`; exceção → `console.error` com o id do aviso e a mensagem (nunca endereço, nome ou documento) e falha com `erro_ao_enviar`. Falha = `proximaTentativa(aviso.attempts + 1, agora)`: com data, `{ status: "pendente", somarTentativa: true, nextTryAt, error }`; `null`, `{ status: "falhou", somarTentativa: true, nextTryAt: null, error }`. Se o próprio `marcar` lançar: `console.error` e `false`; o aviso fica `pendente` sem `next_try_at` e o cron pega na rodada seguinte (a chave do Resend segura 24 h, então e-mail que saiu e não foi marcado não sai duas vezes). Nada lança para fora. `enviarAvisoPorEmail`: `deps.aviso` (nulo → `false`) e `enviarUm` com `deps.agora()`. `enviarEmailsPendentes`: `deps.vencidos(tenantId, limite ?? LIMITE_POR_RODADA, agora)`, enviados em série (o Resend aceita ~2 req/s; em série fica abaixo), conta os `true`; erro de leitura sobe para o passo do cron contá-lo.
- [ ] **Step 4: Rodar e ver passar** — os dois arquivos · Expected: PASS (2 + 7 testes).
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/rastreio-avisos.ts apps/web/src/lib/stores/rastreio-avisos.test.ts apps/web/src/lib/rastreio/enviar-email.ts apps/web/src/lib/rastreio/enviar-email.test.ts
git commit -m "feat(rastreio): send order notices by e-mail with backoff retries" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 5: ganchos no registrar e no cron

**Files:**
- Modify: `apps/web/src/lib/rastreio/registrar.ts`, `apps/web/src/lib/rastreio/registrar.test.ts`, `apps/web/src/lib/rastreio/cron.ts`, `apps/web/src/lib/rastreio/cron.test.ts`

**Interfaces:**
- Consumes: `enviarAvisoPorEmail`, `enviarEmailsPendentes` (Task 4); do plano do PR 2 (Tasks 8 e 10): `DepsRegistrar`/`DEPS` e `montar(extra)` do `registrar.test.ts` (com `GRAVADO`, `pedidoYampi()` e `log`), `DepsCron`/`DEPS`, o helper `passo(nome, alvo, f)` e o `montar(extra)` do `cron.test.ts`.
- Produces: `DepsRegistrar` ganha `enviarEmail: (tenantId: string, avisoId: string) => Promise<boolean>` (padrão `enviarAvisoPorEmail`) e `DepsCron` ganha `enviarEmails: (tenantId: string, agora: Date) => Promise<number>` (padrão `enviarEmailsPendentes`). `registrarPedidoDaYampi` envia, antes de devolver, os avisos de e-mail que acabou de criar (o retorno não muda). Chamada direta (`await`), não `after()`: o registrar já roda dentro do `after()` do aviso da Yampi e no cron, e `after()` fora de uma requisição lança.

- [ ] **Step 1: Testes que falham** — acrescentar o fake `enviarEmail`/`enviarEmails` ao `montar(extra)` de cada arquivo, guardando as chamadas em `log.emails`. `registrar.test.ts`: `"o aviso de e-mail criado sai na hora, o de WhatsApp não"` — `montar()` com o `GRAVADO` e a matriz padrão (`criarAvisos` devolve `av-0` `whatsapp` e `av-1` `email`) ⇒ `log.emails` deepEqual `[["loja-a", "av-1"]]`; `"sem aviso criado, sem envio"` — `origem: "importacao"`, depois `gravarPedido` → `{ ...GRAVADO, mudou: false }`, depois `planoAtivo` → `false` ⇒ `log.emails` vazio nos três. `cron.test.ts`: `"o passo de e-mail roda em toda loja, até sem Yampi conectada"` — o caso de `lerConfig` e `conexao` nulos ⇒ `log.emails` deepEqual `[["loja-a", AGORA], ["loja-b", AGORA]]` e `falhas: 0`; `"e-mail que lança numa loja não para as outras"` — `enviarEmails` lançando `new Error("resend fora do ar")` em `loja-a` (com `console.error` espiado, como no caso do token) ⇒ `{ lojas: 2, falhas: 1, purgados: null }`, `log.emails` com as duas lojas e o erro `"[rastreio/cron] e-mails loja-a: resend fora do ar"`.
- [ ] **Step 2: Rodar e ver falhar** — `… --test src/lib/rastreio/registrar.test.ts` e `… cron.test.ts` · Expected: FAIL (`log.emails` vazio).
- [ ] **Step 3: Implementar.** `registrar.ts`: `DEPS` ganha `enviarEmail: enviarAvisoPorEmail`; no fim de `registrarPedidoDaYampi`, depois do passo 6 (o sininho primeiro: é barato e não depende do provedor) e antes do `return`: `for (const aviso of avisos) if (aviso.canal === "email") await deps.enviarEmail(tenantId, aviso.id);`, com `avisos` o que `criarAvisos` devolveu; sem `try`, porque ele nunca lança. `cron.ts`: `DEPS` ganha `enviarEmails: enviarEmailsPendentes`; no laço por loja, depois do `if (importada) … varrer`, **fora do `if`** (o aviso criado pelo webhook sai mesmo com a API da loja fora; o PR 2 deixou o comentário): `await passo("e-mails", tenantId, () => deps.enviarEmails(tenantId, agora));`. O PR 5 põe os passos de WhatsApp antes dele, para o e-mail no lugar sair na mesma rodada. Se o arquivo real divergir do plano do PR 2, preservar o comportamento e anotar em "Divergências".
- [ ] **Step 4: Rodar e ver passar** · **Step 5: Commit** (os quatro arquivos): `feat(rastreio): send e-mail notices right away and retry them from the cron`, com o `Co-Authored-By`.

**Fechar a Parte 2.** Título: `feat(rastreio): send order notices by e-mail with retries (rastreio PR 4, part 2)`.

---

## Parte 3 — e-mail de problema para a loja

### Task 6: aviso à loja e gancho em `avisarLojaDoProblema`

**Files:**
- Modify: `apps/web/src/lib/email/delivery-log.ts` (`"rastreio_problema"`), `apps/web/src/lib/email/templates.ts`, `apps/web/src/lib/email/templates.test.ts`, `apps/web/src/lib/bling/avisar-reconectar.ts` (só `export` em `donosDaLoja`), `apps/web/src/lib/rastreio/registrar.ts`, `apps/web/src/lib/rastreio/registrar.test.ts`
- Create: `apps/web/src/lib/rastreio/avisar-loja-por-email.ts`, `apps/web/src/lib/rastreio/avisar-loja-por-email.test.ts`

**Interfaces:**
- Consumes: `donosDaLoja(tenantId): Promise<Dono[]>` e `Dono = { email: string; nome: string }` (`@/lib/bling/avisar-reconectar`), `sendEmail`, `getAppUrl` (`@/lib/environment`).
- Produces: `rastreioProblemaEmail(name: string, href: string, numero: string): { subject: string; html: string }`; `emailDoProblemaParaLoja(tenantId: string, pedido: { id: string; numero: string }, deps?: DepsDoAlertaDaLoja): Promise<void>` (um e-mail por dono, `kind: "rastreio_problema"`, nunca lança; sem retentativa de propósito: o sininho já avisou e a falha fica em `public.logs`); `avisarLojaDoProblema(tenantId, pedido, deps?)` (PR 2, Task 8; `true` = criou o sininho agora) ganha o terceiro parâmetro `deps: { emailDoProblema: typeof emailDoProblemaParaLoja } = { emailDoProblema: emailDoProblemaParaLoja }` e chama `deps.emailDoProblema(tenantId, pedido)` logo depois de gravar o sininho; o retorno não muda (é o que o plano do PR 2 reservou para o PR 4).

- [ ] **Step 1: Testes que falham.** `templates.test.ts` (importar `rastreioProblemaEmail`):

```ts
test("aviso de problema na entrega escapa o nome e o número e leva o botão para o pedido", () => {
  const { subject, html } = rastreioProblemaEmail("<b>Ana", "https://app.x/painel/vendas/entregas?pedido=p-1&v=1", "15<3");
  assert.equal(subject, "Pedido nº 15<3: a entrega não foi concluída");
  assert.doesNotMatch(html, /<b>Ana/);
  assert.match(html, /Oi &lt;b&gt;Ana!/);
  assert.match(html, /pedido nº 15&lt;3\./);
  assert.match(html, /href="https:\/\/app\.x\/painel\/vendas\/entregas\?pedido=p-1&amp;v=1"/);
});
```
`avisar-loja-por-email.test.ts` (deps `{ donos, enviar, appUrl }` no molde de `avisar-reconectar.test.ts`; `donos` devolve `[{ email: "ana@loja.test", nome: "Ana Paula" }, { email: "beto@loja.test", nome: "Beto" }]`, `appUrl` devolve `"https://app.girumo.test"`): (a) `emailDoProblemaParaLoja("t-1", { id: "p-1", numero: "1541" }, deps)` envia 2 e-mails, `to` `["ana@loja.test", "beto@loja.test"]`, ambos com `kind: "rastreio_problema"`, `tenantId: "t-1"`, `subject` `"Pedido nº 1541: a entrega não foi concluída"` e `html` com `href="https://app.girumo.test/painel/vendas/entregas?pedido=p-1"`; (b) sem dono, não envia e não lança; (c) `enviar` lançando no primeiro dono não impede o segundo, e a função resolve; (d) `config` devolvendo `{ notifyStoreOnProblem: false }` ⇒ nenhum envio (o sininho já saiu pelo PR 2). `registrar.test.ts`, no teste do sininho do PR 2 (PostgREST falso com `jaTem` e `chamadas`): `avisarLojaDoProblema("loja-a", { id: "ped-1", numero: "1042" }, { emailDoProblema: espiao })` com `jaTem = false` ⇒ `true`, `espiao` chamado **uma vez** com `("loja-a", { id: "ped-1", numero: "1042" })` e depois do `POST` do insert; com `jaTem = true` ⇒ `false` e `espiao` nunca chamado.
- [ ] **Step 2: Rodar e ver falhar** — `templates.test.ts`, `avisar-loja-por-email.test.ts` e `registrar.test.ts` · Expected: FAIL (função, módulo e chamada não existem).
- [ ] **Step 3: Implementar.** `delivery-log.ts`: `| "rastreio_problema"`. `avisar-reconectar.ts`: `export` em `donosDaLoja`. `templates.ts`, depois de `blingReconectarEmail` (sem as palavras que o `brand-copy.test.ts` proíbe nesse arquivo):

```ts
// --- Pedido com problema na entrega (aviso à loja; o sininho do painel diz o mesmo) ---
export function rastreioProblemaEmail(name: string, href: string, numero: string): { subject: string; html: string } {
  const firstName = escapeHtml(primeiroNome(name));
  return {
    subject: `Pedido nº ${numero.replace(/\s+/g, " ").trim()}: a entrega não foi concluída`,
    html: layout(`
      <h1 style="margin:0 0 12px;font-size:22px;color:${BRAND_COLORS.volt}">Entrega com problema</h1>
      <p style="margin:0 0 8px;font-size:15px;color:${BRAND_COLORS.volt};line-height:1.6">
        Oi ${firstName}! A transportadora não conseguiu entregar o pedido nº ${escapeHtml(numero)}. Fale com a compradora para combinar o que fazer.
      </p>
      <p style="margin:0 0 8px;font-size:14px;color:${BRAND_COLORS.volt};line-height:1.6">
        Se o aviso de problema estiver ligado, a compradora já recebeu uma mensagem dizendo que a loja vai entrar em contato.
      </p>
      ${button("Ver o pedido", escapeHtml(href))}
      <p style="margin:20px 0 0;font-size:13px;color:${BRAND_COLORS.slate}">
        Não quer receber este e-mail? Desligue "me avisar por e-mail quando houver problema" em Configurações › Rastreio de pedidos. O aviso no painel continua.
      </p>
    `),
  };
}
```
`avisar-loja-por-email.ts` (`import "server-only"`): `DepsDoAlertaDaLoja = { donos: typeof donosDaLoja; enviar: typeof sendEmail; appUrl: () => string; config: typeof lerConfig }` (padrão: `donosDaLoja`, `sendEmail`, `getAppUrl`, `lerConfig` de `@/lib/stores/rastreio-config`). Primeiro, `config(tenantId)`: nula ou com `notifyStoreOnProblem` falso → retorna sem enviar. Para cada dono: `rastreioProblemaEmail(dono.nome, href, pedido.numero)`, com `href` = `<appUrl>/painel/vendas/entregas?pedido=<pedido.id por encodeURIComponent>`, e `enviar({ to, subject, html, tenantId, kind: "rastreio_problema" })`, cada envio no seu `try/catch` (`console.warn` com o `tenantId`, sem endereço); `donos` lançando: `console.error` e retorna. Sem `idempotencyKey`: a chave seria por pedido, e donos diferentes têm conteúdo diferente (o Resend responderia 409). `registrar.ts`: em `avisarLojaDoProblema`, depois do insert do sininho e antes do `return true`, `await deps.emailDoProblema(tenantId, pedido);` (ele nunca lança, então o sininho já gravado não vira erro). O `deps.avisarLoja` do registrar segue chamando com dois argumentos, e nos testes do registrar ele é fake, então nenhum e-mail real sai de lá.
- [ ] **Step 4: Rodar e ver passar** — os três arquivos, mais `brand-copy.test.ts` (confere o `templates.ts`) · Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/email/delivery-log.ts apps/web/src/lib/email/templates.ts apps/web/src/lib/email/templates.test.ts apps/web/src/lib/bling/avisar-reconectar.ts apps/web/src/lib/rastreio/avisar-loja-por-email.ts apps/web/src/lib/rastreio/avisar-loja-por-email.test.ts apps/web/src/lib/rastreio/registrar.ts apps/web/src/lib/rastreio/registrar.test.ts
git commit -m "feat(rastreio): e-mail the store owners when an order has a delivery problem" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

**Fechar a Parte 3.** Título: `feat(rastreio): e-mail the store when an order has a delivery problem (rastreio PR 4, part 3)`.

---

## Fechamento de cada Parte

1. Gate: `npm --workspace apps/web test`, os dois `tsc` (`tsconfig.json` e `tsconfig.e2e.json`) e `npm --workspace apps/web run lint` (índice, Global Constraints), e `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1`; depois, revisão do diff pelo agente Code Reviewer.
2. `git push -u origin <branch>`; `gh pr create --base main --repo codingB0y/Girumo --title "<título da Parte>"`, corpo com resumo, spec, plano de teste e `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Sem migração: o `migrate-dev` não aplica nada.
3. CI verde → `gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo` (a `main` não tem proteção: merge à mão no verde, nunca auto-merge).
4. Card (prod): `update public.board_features set blocker = '<texto>', updated_at = now() where key = 'rastreio-pedidos';` com o texto da Parte: 1 "e-mail: layout e remetente no ar; faltam envio e alerta (PR 4, partes 2 e 3)"; 2 "e-mail ao comprador no ar; falta o alerta à loja (PR 4, parte 3)"; 3 "e-mail no ar; faltam WhatsApp (PR 5) e a prova do PR 7". O status segue `em_construcao`. Escrita em prod recusada pelo classificador → lista de comandos do Igor.
5. Na Parte 3, `kg_insert_text` com a decisão: "e-mail do Rastreio sai da Girumo com o nome da loja; 5 tentativas com espera de 5, 30, 120 e 360 min; chave de idempotência rastreio:<aviso>:<resends>". Ao encerrar: "PRs que deixei abertos: …" (ou "nenhum").

## Interface com os outros PRs

- **PR 3 (página):** a Parte 2 do PR 3 importa `conviteDoGrupo` (Task 3 desta Parte 1) com o telefone do pedido; por isso esta Parte 1 vai a `main` antes dela. Nenhum outro arquivo em comum.
- **PR 6 (prévia):** se o PR 6 já estiver em `main`, a Parte 1 troca o `null` de `previaDoEmail` em `lib/rastreio/previas.ts` pela chamada de `montarEmailDoAviso` (3 linhas, como o plano do PR 6 descreve) e ajusta o teste; senão, o PR 6 liga. `email.ts` continua puro, sem `server-only` (a prévia roda no navegador).
- **PR 5 (WhatsApp):** o fallback "WhatsApp falhou → e-mail" cria o aviso de e-mail como `pendente` e chama `enviarAvisoPorEmail(tenantId, avisoId)`. Vem depois da Parte 2: os dois editam `registrar.ts` e `cron.ts` (os passos de WhatsApp entram antes do `passo("e-mails", …)`).
- **PR 6 (painel):** "Reenviar" só faz `reabrirAvisos`; o e-mail reaberto (`pendente`, `resends + 1`) sai na rodada seguinte do cron, em até 5 min, com a chave nova do Resend. A opção `notify_store_on_problem` decide só o e-mail à loja (a Parte 3 a lê pela `lerConfig`); o sininho sai sempre (PR 2), porque o texto à compradora diz "A loja já foi avisada". Na tela, o rótulo é "Me avisar por e-mail quando houver problema".
- **PR 7 (prova):** com um pedido real da piloto, conferir na caixa de entrada o remetente com o nome da loja, a cor, o botão para a página, "Parar avisos" e, fora do grupo, o convite.
- **Nomes novos** (acréscimo ao índice): `SendOptions.text`, `remetenteComNome`, `corDaLoja`, `conviteDoGrupo` e `DepsDoConvite`, `avisoPendente`, `LIMITE_POR_RODADA`, `ESPERA_MIN`, `proximaTentativa`, `DepsDoEnvio` e o parâmetro `deps` no fim de `enviarAvisoPorEmail` e `enviarEmailsPendentes`, `rastreioProblemaEmail`, `emailDoProblemaParaLoja` e `DepsDoAlertaDaLoja`, e o vocabulário de `tracking_notices.error` do e-mail (Task 4): `rastreio_desligado`, `pedido_nao_encontrado`, `avisos_parados`, `sem_email`, `sem_config`, `recusado_pelo_provedor`, `erro_ao_enviar`.

## Divergências com o código

- Escrito contra os planos dos PRs 1 e 2 (os arquivos ainda não existiam): ganchos das Tasks 5 e 6 nas formas de `DepsRegistrar`, `DepsCron`, `passo(...)` e `avisarLojaDoProblema(…, deps?)` que o PR 2 descreve; `avisoPendente` (Task 4) no mapeador de linha do PR 1. Conferir a forma real e ajustar o encaixe, não o comportamento.
- `sendEmail` ganha `text?` além de `fromName?`: o contrato manda o builder devolver `text`, e o envio só aceitava HTML.
- `leads` não tem coluna `phone_key` (só o índice de expressão `leads_tenant_phone_key_idx`, que o PostgREST não filtra): o spec §3.3 vale como regra de equivalência (com/sem 55 e 9º dígito), e a consulta usa `phone in (variantesDoTelefone(…))`, como `lib/stores/painel-do-site.ts`.
- `avisoPendente` é nome novo: `enviarAvisoPorEmail(tenantId, avisoId)` precisa ler um aviso por id, e as stores do PR 1 só leem em lote.
- Spec §9 põe "criação dos avisos" no PR 4; o índice a põe no PR 2 (`registrar.ts`). Este plano só envia o que o PR 2 criou.
- `donosDaLoja` (e-mail dos donos) já existe, privada, em `lib/bling/avisar-reconectar.ts`: ganha `export` em vez de uma cópia (o cron `emails` repete a consulta inline, só com o primeiro `owner`).
- Plano ativo e nome legível da loja já são do PR 2 (`planoAtivo` no registrar; `humanizeName` em `lojaDoRastreio`), por isso o envio não os reaplica; `LojaDoRastreio.nome` vira remetente e rodapé como vem.
- Mockup: sem "em 21/10" na frase do envio (pedido importado não tem a data da etapa; a caixa de entrada já mostra a do e-mail), sem os traços entre as bolinhas (e-mail não tem flex) e, em `retirada`, "Combine com a loja onde e quando retirar" no lugar de "veja onde retirar": a página (PR 3) não tem o local de retirada.
