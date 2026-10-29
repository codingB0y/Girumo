# Rastreio do pedido — PR 3: Página pública (plano de implementação)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A compradora acha o pedido em `www.girumo.com.br/rastreio/<slug>` ou em `/rastreio` no domínio da loja (CPF/CNPJ + 4 últimos dígitos do celular), abre o pedido pelo link do aviso e para os avisos daquele pedido — página sem terceiros, `noindex`, `no-store` e com CSP de nonce.

**Architecture:** Três route handlers finos chamam `lib/rastreio/rota-publica.ts` (molde de `lib/bio/rota-publica.ts`: dependências por parâmetro, loja pelo `public_slug` no www ou pelo dono do host ativo no domínio, 404 sem `rastreio_enabled`, limite da busca com `checkRateLimit` na própria rota). O HTML sai de `lib/rastreio/pagina.ts`, puro: texto de fora escapado, CSS num `<style>` com nonce e um só `<script>` com nonce, o do "Copiar". Os registros de rota pública (CSP, matcher, `headers()`, robots, 308) seguem os do `/bio`.

**Tech Stack:** Next 15.5 (route handlers + middleware Edge), stores Supabase do PR 1, `node:test` via tsx, Playwright contra o banco de dev.

**Spec:** `docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md` (§1.3 busca, §3.5 página, §7 segurança, §8 testes).
**Índice:** `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md` — Contrato, Global Constraints e Review Focus valem aqui (inclusive "Ambiente do worktree" e a verificação TS).
**Mockup** (fora do repo; o nome de loja que aparece nele nunca entra no repo — nos testes, "Loja Exemplo"): `C:\Users\Igor\Desktop\girumo-design-refs\rastreio-pedidos\project\` `Main` (busca), `Pedido`, `Problema` `.dc.html`. Vale a estrutura e os textos; o CSS vira classes.
**Revisão de segurança:** agente `Security Engineer` sobre `git diff origin/main...HEAD` antes do merge de cada parte.

## Duas partes, dois PRs

| Parte | Branch | Depende de | O quê | Arquivos |
|---|---|---|---|---|
| 1 | `feat/rastreio-pr3-pagina` | PRs 1 e 2 | registros, HTML, busca e página do pedido no www | 14 (9 de código, 5 de teste) |
| 2 | `feat/rastreio-pr3-dominio` | Parte 1 e PR 4 parte 1 (`conviteDoGrupo`) | domínio do lojista, "parar avisos", convite do VIP, e2e | 10 |

## Constantes deste PR (exatas)

- Formatos: slug = `SLUG_BIO` (`lib/bio/documento.ts`, puro), o mesmo CHECK de `tracking_settings.public_slug` no PR 1 (3 a 40); token = `TOKEN_RASTREIO = /^[0-9a-f]{32}$/` (`lib/rastreio/rota-publica.ts`). Fora do formato → a resposta de "não encontrado", sem consultar nada.
- Textos (`lib/rastreio/pagina.ts`): `NAO_ENCONTRADO` e `MUITAS_TENTATIVAS` (os do índice, exatos); `PEDIDO_NAO_ENCONTRADO = "Pedido não encontrado. Busque com o CPF/CNPJ e o celular da compra."`; `AVISOS_PARADOS = "Você não recebe mais avisos deste pedido."` (Parte 2). `<title>` de toda tela: `Acompanhe seu pedido · {nome da loja}`.
- Texto puro: 503 `Não conseguimos abrir agora. Tente de novo em instantes.` (o da bio); 403 do parar `Abra o link do pedido para parar os avisos.`; 404 no domínio sem loja: `LINK_NAO_ENCONTRADO` (`host.ts`).
- Limite (só no POST da busca, depois de achar a loja e antes de ler o corpo): `checkRateLimit(\`rastreio-busca-min:${quem}\`, 5, 60_000)` e, se passou, `checkRateLimit(\`rastreio-busca-h:${quem}\`, 20, 3_600_000)`, com `quem = \`${hashIp(req) ?? "sem-ip"}:${tenantId}\``. `true` = bloqueado (`rate-limit.ts`). Um id por janela porque o balde em memória usa só o id como chave; `hashIp` porque IP puro não entra em chave.
- Busca: pedidos de `agora − 90 dias` em diante (o `desde` de `buscarPedidos`).
- Cabeçalhos: HTML `content-type: text/html; charset=utf-8`, `x-robots-tag: noindex`, `cache-control: private, no-store`; texto `text/plain; charset=utf-8` + `noindex` + `no-store`; 303 e 405 com `cache-control: no-store`.
- Status: busca GET 200; POST 200 (nenhum pedido: a busca com `NAO_ENCONTRADO`), 303 para `<base>/<token>` (um), 200 com a lista (dois ou mais), 429 (limite); pedido 200, ou 404 com a busca e `PEDIDO_NAO_ENCONTRADO`; parar 303 para `<base>/<token>`, 403, 404, 405 (todo método que não é POST, `allow: POST`).
- `<base>`: `/rastreio/<slug>` no www; `/rastreio` no domínio do lojista. Todo `href`/`action` da página parte dela.

## Review Focus deste PR (itens 3 e 4 do índice, mais os da rota)

1. Documento inválido roda a mesma consulta e devolve o mesmo HTML; o documento digitado nunca volta na página — Task 3, "não achei, não confere e documento inválido".
2. Link aberto por quem não é a compradora: GET nunca grava, a página do token mostra um pedido só, "parar" só por POST da própria origem — Tasks 3 e 6.
3. Os dois baldes do limite, por IP (com hash) e loja — Task 3.
4. Texto de fora escapado (nome da loja, nº, código), URL de histórico só `http(s)`, cor da loja só `#RRGGBB` — Task 2.
5. Os três registros (sem eles, 307 para `/login`) e uma CSP só (o `next start` junta headers iguais; só a Vercel mostra a duplicada) — Task 1 e a prova pós-deploy.
6. Domínio: só a loja dona do host ativo e com o rastreio ligado; `_dominio` em host do Girumo é 404 sem consulta — Task 6.

---

# Parte 1 — busca e pedido no www

**Antes de começar** (raiz do checkout principal, PowerShell):

```powershell
git fetch origin main
git ls-tree --name-only origin/main apps/web/src/lib/rastreio/tipos.ts apps/web/src/lib/rastreio/documento.ts apps/web/src/lib/rastreio/loja.ts apps/web/src/lib/rastreio/link.ts apps/web/src/lib/stores/rastreio-pedidos.ts apps/web/src/lib/stores/rastreio-config.ts
git worktree add .claude/worktrees/rastreio-pr3-pagina -b feat/rastreio-pr3-pagina origin/main
```

Expected: o `ls-tree` lista os 6 caminhos (PRs 1 e 2 em `main`); faltou um, parar. `node_modules` por junction (índice).

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/security/csp.ts` (+ `csp.test.ts`) | superfície `"rastreio"` |
| `apps/web/src/middleware.ts`, `apps/web/next.config.ts`, `apps/web/src/app/robots.ts` (+ `src/app/brand-routes.test.ts`) | matcher, `headers()`, `redirects()`, robots |
| `apps/web/src/lib/domain-redirects.ts` (+ `.test.ts`) | 308 de `app.`/apex para o www |
| `apps/web/src/lib/rastreio/pagina.ts` (+ `.test.ts`) | HTML das telas e a linha do tempo |
| `apps/web/src/lib/rastreio/rota-publica.ts` (+ `.test.ts`) | busca, limite, página do pedido |
| `apps/web/src/app/rastreio/[slug]/route.ts`, `apps/web/src/app/rastreio/[slug]/[token]/route.ts` | handlers finos |

### Task 1: Registros da rota pública

**Files:** Modify `apps/web/src/lib/security/csp.ts`, `apps/web/src/middleware.ts` (`matcher`), `apps/web/next.config.ts` (`headers()`, `redirects()`, import), `apps/web/src/app/robots.ts`, `apps/web/src/lib/domain-redirects.ts`. Test: `src/lib/security/csp.test.ts`, `src/app/brand-routes.test.ts`, `src/lib/domain-redirects.test.ts`.

**Interfaces:**
- Produces: `type NonceSurface = "public-lp" | "click-redirect" | "bio" | "rastreio"`; `surfaceForPath("/rastreio" | "/rastreio/…") → "rastreio"`; `buildCsp("rastreio", nonce, isDev): string`; `rastreioDomainRedirects(): HostRedirect[]`; `"/rastreio/:path*"` no matcher; `"/rastreio/"` no `disallow`.

- [ ] **Step 1: Testes que falham**

`csp.test.ts`: `"rastreio"` nos laços de "production script-src drops unsafe-inline and unsafe-eval" e "unsafe-eval comes back only in dev" (os testes de hosts de rastreador e o do `'strict-dynamic' ` com espaço no fim não valem para superfície sem hosts; o `deepEqual` abaixo cobre o `'strict-dynamic'`). Ao fim do arquivo (depois de `regraGlobal`):

```ts
const CAMINHOS = ["/rastreio", "/rastreio/loja-exemplo", "/rastreio/loja-exemplo/0123456789abcdef0123456789abcdef/parar"];

test("rastreio: superfície com nonce própria; prefixo parecido não entra", () => {
  for (const p of CAMINHOS) assert.equal(surfaceForPath(p), "rastreio", p);
  for (const p of ["/rastreios", "/rastreio-x", "/api/rastreio/config"]) assert.equal(surfaceForPath(p), null, p);
});

test("CSP do rastreio: só o nonce, nenhum terceiro, formulário só para a mesma origem", () => {
  const nonce = generateNonce();
  const csp = buildCsp("rastreio", nonce, false);
  assert.deepEqual(csp.split("; "), [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    "img-src 'self' data:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ]);
  assert.equal(nonceSeenByNext(csp), nonce);
});

test("o rastreio sai da CSP estática, roda no middleware e fica só no www", () => {
  const casa = regraGlobal();
  for (const p of CAMINHOS) assert.equal(casa(p), false, `${p} sairia com duas CSP`);
  assert.equal(casa("/rastreios"), true);
  assert.match(NEXT_CONFIG, /source:\s*"\/rastreio\/:path\*",\s*headers:\s*headersWithoutCsp/);
  assert.match(NEXT_CONFIG, /\.\.\.rastreioDomainRedirects\(\)/);
  assert.match(MIDDLEWARE, /"\/rastreio\/:path\*"/);
});
```

`brand-routes.test.ts`, em "mantém as páginas de terceiros fora do rastreio": `assert.ok(paths.includes("/rastreio/"), "a página de pedido da compradora precisa sair do índice");`. `domain-redirects.test.ts`: `"/rastreio/:path*"` na lista de "deixa o site público onde ele está" e `"o rastreio sai de app. e do apex para o www com 308 (spec rastreio §3.5)"`, espelho do teste da bio com `rastreioDomainRedirects()`: hosts `[APEX_HOST, APP_HOST]`, `source` `/rastreio/:path*`, `destination` `https://${PUBLIC_SITE_HOST}/rastreio/:path*`, `permanent` `true` ("308 mantém o POST da busca").

- [ ] **Step 2: Rodar e ver falhar** — em `apps/web`: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/security/csp.test.ts src/app/brand-routes.test.ts src/lib/domain-redirects.test.ts` → FAIL: `surfaceForPath("/rastreio")` é `null`; `/rastreio` casa a regra global; `/rastreio/` fora do `disallow`; `rastreioDomainRedirects is not a function`.

- [ ] **Step 3: Implementar**
  - `csp.ts`: `"rastreio"` no tipo; em `surfaceForPath`, antes do `return null`: `if (pathname === "/rastreio" || pathname.startsWith("/rastreio/")) return "rastreio";`; a quarta superfície no comentário do topo ("O que ENTRA"); primeiro ramo de `buildCsp` devolve a lista do teste com `scriptSrc(nonce, isDev, [], true)` no lugar da linha de `script-src`, e o comentário "Rastreio do pedido (spec rastreio-pedidos §3.5): HTML do route handler, sem terceiros. Um script só (o "Copiar"), com nonce; a busca e o "parar avisos" postam na própria origem."
  - `middleware.ts`: `"/rastreio/:path*",` depois de `"/bio/:path*",`; no comentário, "As entradas dedicadas (/p/, /r/, /c/, /bio/ e /rastreio/)".
  - `next.config.ts`: regra global com `source: "/((?!$|p/|p$|r/|r$|c/|c$|bio/|bio$|rastreio/|rastreio$|editor-preview).*)"` (o comentário cita `/rastreio/*`); depois da regra de `/bio/:path*`, `{ source: "/rastreio/:path*", headers: headersWithoutCsp }` com o comentário "Rastreio do pedido: CSP com nonce, do middleware"; `rastreioDomainRedirects` no import e `...rastreioDomainRedirects(),` depois de `...bioDomainRedirects(),`.
  - `robots.ts`: `"/rastreio/"` no fim do `disallow` e no comentário ("`/rastreio/` (pedido da compradora)").
  - `domain-redirects.ts`: o corpo de `bioDomainRedirects` vira `function soNoWww(prefixo: "/bio" | "/rastreio"): HostRedirect[]` (`/bio` trocado por `${prefixo}` no `source` e no `destination`); `bioDomainRedirects()` (com o JSDoc de hoje) devolve `soNoWww("/bio")` e `rastreioDomainRedirects()` devolve `soNoWww("/rastreio")`, com o JSDoc "Rastreio do pedido (spec rastreio-pedidos §3.5): só no www, pelo mesmo motivo; o 308 mantém o POST da busca."

- [ ] **Step 4: Rodar e ver passar** — o comando do Step 2 mais `src/lib/custom-domains/host.test.ts` (a primeira entrada do matcher não mudou) → PASS.
- [ ] **Step 5: Commit** — `git add` dos 8 arquivos; `git commit -m "feat(rastreio): register /rastreio as a public nonce surface" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

### Task 2: HTML das telas (`pagina.ts`)

**Files:** Create `apps/web/src/lib/rastreio/pagina.ts`, `apps/web/src/lib/rastreio/pagina.test.ts`.

**Interfaces:**
- Consumes: `Etapa`, `PedidoPublico` (PR 1, `lib/rastreio/tipos.ts`); `import type { LojaDoRastreio }` (PR 2, `lib/rastreio/loja.ts`); `escapeHtml` (`@/lib/campaigns/entry-page`); `nonceAttribute` (`@/lib/security/csp`); `garante(fg, bg, min)` (`@/lib/bio/cores`); `diaMesBR(iso)` (`@/lib/date-br`, dia de Brasília).
- Produces:

  ```ts
  export type ContextoDaPagina = { loja: Pick<LojaDoRastreio, "nome" | "corPrimaria" | "storeWhatsapp">; base: string; nonce: string | null };
  export type Tela =
    | { tipo: "busca"; aviso: string | null }
    | { tipo: "lista"; pedidos: PedidoPublico[] }
    | { tipo: "pedido"; pedido: PedidoPublico; convite: string | null };
  export type PassoDaLinha = { etapa: Etapa; estado: "feito" | "atual" | "falta"; quando: string | null };
  export function linhaDoTempo(p: Pick<PedidoPublico, "etapa" | "events">): PassoDaLinha[];
  export function renderPagina(ctx: ContextoDaPagina, tela: Tela): string;
  // + NAO_ENCONTRADO, MUITAS_TENTATIVAS, PEDIDO_NAO_ENCONTRADO
  ```

- [ ] **Step 1: Testes que falham** — fixos: `CTX` = loja "Loja Exemplo", `corPrimaria "#0F766E"`, `storeWhatsapp null`, `base "/rastreio/loja-exemplo"`, `nonce "bm9uY2UtZG8tdGVzdGUtMTIz"`; `pedido(over)` = nº `1001`, `orderCreatedAt "2026-10-18T17:32:00Z"`, etapa `enviado`, events `[{confirmado, "2026-10-18T17:32:00Z"}, {enviado, "2026-10-21T02:00:00Z"}]`, serviço `Correios · SEDEX`, código `AB123456789BR`, URL `https://rastreio.exemplo.test/AB123456789BR`, token `0123456789abcdef0123456789abcdef`, `noticesStoppedAt null`.
  - `"linha do tempo: feito, atual e falta, com dia de Brasília e sem data inventada"` — `linhaDoTempo(pedido())` = `[confirmado feito "18/10", separando feito null, enviado atual "20/10", entregue falta null]` (02:00Z de 21/10 é 23:00 de 20/10 em Brasília); `entregue` com `events: []` → três `feito` e `entregue` `atual`, todos com `quando: null`; `retirada` → `retirada` no lugar de `enviado`; `problema` com events `enviado`/`problema` → `[confirmado, separando, enviado feito, problema atual, entregue falta]`; `aguardando_pagamento` → ele `atual` na frente e os quatro `falta`; `cancelado` com events `[confirmado, cancelado]` → `[confirmado feito, cancelado atual]`.
  - `"busca: formulário na base, título da loja, nonce no style, sem style= nem script"` — contém `<title>Acompanhe seu pedido · Loja Exemplo</title>`, `<form method="post" action="/rastreio/loja-exemplo"`, `name="documento"`, `name="celular"`, `<style nonce="bm9uY2UtZG8tdGVzdGUtMTIz">`; não casa `/\sstyle=/` nem `/<script/`; com `aviso: NAO_ENCONTRADO` → `role="alert"` e o texto.
  - `"texto de fora sai escapado"` — pedido com loja `<script>alert(1)</script> & "Cia"`, nº `<b>1</b>` e código `"><img src=x>` → contém `&lt;script&gt;`, `&amp;`, `&quot;Cia&quot;`, `&lt;b&gt;1&lt;/b&gt;`, `data-copiar="&quot;&gt;&lt;img src=x&gt;"`; `(html.match(/<script/g) ?? []).length === 1` (só o do Copiar); nenhum `<img`.
  - `"pedido: só os dados permitidos; Copiar com nonce; histórico só com URL http(s)"` — contém `Pedido nº 1001`, `feito em 18/10`, `aria-current="step"`, `data-copiar="AB123456789BR"`, `<script nonce="bm9uY2UtZG8tdGVzdGUtMTIz">`, `href="https://rastreio.exemplo.test/AB123456789BR"` com `rel="noopener noreferrer"`; com `trackingUrl: "javascript:alert(1)"` → nenhum `javascript:`; sem código → nem `data-copiar` nem `<script`; nunca casa `/\sstyle=/` nem `/<(script|link|img)[^>]*(src|href)="https?:/`.
  - `"problema: alerta com a data e sem convite do VIP"` — `problema`, `etapaAt "2026-10-27T15:00:00Z"`, `convite "https://www.girumo.com.br/r/vip-loja"` → `role="status"`, `A transportadora não conseguiu entregar`, `A entrega falhou em 27/10.`, `Ver o motivo no histórico da entrega`, sem `grupo VIP`; `enviado` com o mesmo convite → `href="https://www.girumo.com.br/r/vip-loja"` e `Entrar no grupo VIP`.
  - `"Falar com a loja só com número; cor só #RRGGBB"` — `storeWhatsapp null` → nenhum `wa.me`; `"5511987650000"` → `href="https://wa.me/5511987650000"`; `corPrimaria: "red;}body{display:none"` → `--cor:#14181C`, sem `display:none`.
  - `"lista: um link por pedido, na ordem recebida"` — pedidos `1002` e `1001` (tokens `…02` e `…01`) → os dois `href="/rastreio/loja-exemplo/<token>"` nessa ordem, com o rótulo da etapa; nenhum `data-copiar`.

- [ ] **Step 2: Rodar e ver falhar** — `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/rastreio/pagina.test.ts` → FAIL: `Cannot find module './pagina'`.

- [ ] **Step 3: Implementar**

Linha do tempo (o resto é montagem):

```ts
export function linhaDoTempo({ etapa, events }: Pick<PedidoPublico, "etapa" | "events">): PassoDaLinha[] {
  const quando = (e: Etapa): string | null => diaMesBR(events.find((x) => x.etapa === e)?.at) ?? null;
  if (etapa === "cancelado") {
    const antes = [...new Set(events.map((x) => x.etapa))].filter((e) => e !== "cancelado");
    return [...antes.map((e) => ({ etapa: e, estado: "feito" as const, quando: quando(e) })), { etapa, estado: "atual", quando: quando(etapa) }];
  }
  // Retirada no lugar de "enviado" quando o pedido passou por ela e não voltou a "enviado".
  const meio: Etapa = etapa === "retirada" || (etapa !== "enviado" && events.some((x) => x.etapa === "retirada")) ? "retirada" : "enviado";
  const trilho: Etapa[] = [
    ...(etapa === "aguardando_pagamento" ? ["aguardando_pagamento" as const] : []),
    "confirmado", "separando", meio,
    ...(etapa === "problema" ? ["problema" as const] : []),
    "entregue",
  ];
  const i = trilho.indexOf(etapa);
  return trilho.map((e, j) => ({ etapa: e, estado: j < i ? "feito" : j === i ? "atual" : "falta", quando: j <= i ? quando(e) : null }));
}
```

Rótulo na linha e no selo (o selo de `enviado` diz "A caminho"): aguardando_pagamento "Aguardando pagamento", confirmado "Pedido confirmado", separando "Em separação", enviado "Enviado", retirada "Pronto para retirada", problema "Problema na entrega", entregue "Entregue", cancelado "Pedido cancelado". Frase debaixo do selo: aguardando_pagamento "A loja ainda espera a confirmação do pagamento."; confirmado "Pagamento confirmado. A loja vai separar seu pedido."; separando "A loja está separando seu pedido."; enviado "Seu pedido está com a transportadora."; retirada "Combine com a loja onde e quando retirar."; entregue "Seu pedido foi entregue."; cancelado "Este pedido foi cancelado. Dúvidas? Fale com a loja."; problema: `<div class="alerta" role="status">` com "A transportadora não conseguiu entregar" e "A entrega falhou em {dia de etapaAt}. A loja já foi avisada e vai falar com você para combinar o que fazer." (sem " em {dia}" se a data não parsear).

Esqueleto — todo texto de fora por `escapeHtml`, todo `href`/`action` montado aqui:
- `<!doctype html><html lang="pt-BR">`; `<head>` com charset, viewport, `<meta name="robots" content="noindex">`, o `<title>`, `<link rel="icon" href="data:,">` e `<style${nonceAttribute(nonce)}>` com o CSS e, no fim, `:root{--cor:…;--sobre-cor:…}` — `--cor` = `corPrimaria` se casar `/^#[0-9a-fA-F]{6}$/`, senão `#14181C`; `--sobre-cor` = `garante("#FFFFFF", cor, 4.5)`.
- `<header class="topo">`: `<span class="selo-loja" aria-hidden="true">` (iniciais das duas primeiras palavras do nome) + `<span class="nome-loja">`.
- busca: `<h1>Acompanhe seu pedido</h1>`; "Digite o CPF ou CNPJ e os 4 últimos números do celular que você usou na compra."; aviso em `<p class="aviso" role="alert">`; `<form class="cartao" method="post" action="{base}">` com `<label for="documento">CPF ou CNPJ</label>` + `<input id="documento" name="documento" inputmode="text" autocapitalize="characters" spellcheck="false" autocomplete="off" required maxlength="20" placeholder="000.000.000-00">` (não só numérico: o CNPJ alfanumérico tem letras, PR 2), `<label for="celular">Últimos 4 números do celular</label>` + `<input id="celular" name="celular" inputmode="numeric" autocomplete="off" required maxlength="20" placeholder="0000" aria-describedby="celular-ajuda">` + `<span id="celular-ajuda" class="ajuda">O mesmo celular que você informou na compra.</span>` e `<button class="botao" type="submit">Ver meus pedidos</button>`; `<p class="nota">Aqui só aparece o andamento da entrega. Endereço, peças e valores ficam com a loja.</p>`; `<div class="dica">` "Recebeu o aviso no WhatsApp ou no e-mail?" / "Toque no link da mensagem: abre direto, sem digitar nada.". Os campos nunca voltam preenchidos.
- lista: `<a class="voltar" href="{base}">Buscar outro pedido</a>`, `<h1>Seus pedidos</h1>`, `<ul class="lista-pedidos">` com `<li><a href="{base}/{token}"><span>Pedido nº {nº}</span><span>feito em {dia} · {rótulo}</span></a></li>`.
- pedido: voltar; `<section class="pedido-cab">` com `<h1>Pedido nº {nº}</h1>`, "feito em {dia}", `<span class="etiqueta">{selo}</span>` e a frase ou o alerta; `<section class="cartao"><h2>Andamento</h2><ol class="linha">` com `<li class="{estado}">` (`aria-current="step"` no atual), rótulo e dia; com serviço, código ou URL, `<section class="cartao envio">` com `<h2>{serviço ou "Entrega"}</h2>`, "Código de rastreio", `<span class="codigo">`, `<button class="copiar" type="button" data-copiar="{código}" hidden>Copiar</button>` e, se `new URL(u).protocol` for `https:`/`http:`, `<a class="externo" href="{url}" target="_blank" rel="noopener noreferrer">Ver o histórico completo da entrega</a>` ("Ver o motivo no histórico da entrega" em `problema`); com `convite` e etapa fora de `problema`/`cancelado`, `<section class="cartao vip">` "As novidades saem primeiro no grupo VIP" / "Lançamentos e reposições aparecem lá antes do site." / `<a class="botao" href="{convite}">Entrar no grupo VIP</a>`.
- "Falar com a loja no WhatsApp" (`<a class="botao-whats" href="https://wa.me/{só dígitos}" target="_blank" rel="noopener noreferrer">`, só com `storeWhatsapp`): no rodapé da busca e da lista; no pedido, logo depois do alerta em `problema` e depois do cartão do envio nas outras etapas. `<footer class="rodape"><p>{loja} · rastreio feito com Girumo</p></footer>`.
- Só no pedido com código: `<script${nonceAttribute(nonce)}>for(const b of document.querySelectorAll("[data-copiar]")){b.hidden=false;b.addEventListener("click",()=>navigator.clipboard.writeText(b.dataset.copiar).then(()=>{b.textContent="Copiado"}))}</script>`.

CSS num `const CSS` (nenhum `style=` no HTML): fundo `#F4F6F8`, texto `#14181C`, secundário `#4F5A64`, bordas `#E3E7EB` (cartão) e `#B9C2CA` (campo), cartões brancos com raio 16px, campos e botões de 48px com raio 10px, coluna de até 480px centrada, alvos de toque de 44px no mínimo; títulos em Manrope 800 (`@font-face` em `/fonts/bio/manrope/manrope-latin.woff2`, `font-weight: 200 800`), código em IBM Plex Mono 500 (`/fonts/bio/ibm-plex-mono/ibm-plex-mono-latin-500.woff2`), corpo na fonte do sistema; `.botao` em `var(--cor)` com texto `var(--sobre-cor)`; `li.feito` bolinha cheia `var(--cor)`, `li.atual` anel de 6px `var(--cor)`, `li.falta` `#D5DBE0`; `.alerta` fundo `#FDECE3` e texto `#6E2706`.

- [ ] **Step 4: Rodar e ver passar** — o comando do Step 2 → PASS.
- [ ] **Step 5: Commit** — `git add apps/web/src/lib/rastreio/pagina.ts apps/web/src/lib/rastreio/pagina.test.ts`; `git commit -m "feat(rastreio): server-rendered tracking page screens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

### Task 3: Busca, limite e página do pedido (`rota-publica.ts` + rotas)

**Files:** Create `apps/web/src/lib/rastreio/rota-publica.ts`, `apps/web/src/lib/rastreio/rota-publica.test.ts`, `apps/web/src/app/rastreio/[slug]/route.ts`, `apps/web/src/app/rastreio/[slug]/[token]/route.ts`.

**Interfaces:**
- Consumes: `lojaPorSlug(slug): Promise<RastreioConfig | null>` (PR 1, só loja com `rastreio_enabled`); `buscarPedidos(tenantId, docHmac, phoneLast4, desde): Promise<PedidoPublico[]>` e `pedidoPorToken(tenantId, linkToken): Promise<PedidoPublico | null>` (PR 1); `lojaDoRastreio(tenantId)` (PR 2; não lê a flag); `normalizarDocumento`, `docHmac`, `pepperDoRastreio`, `ultimos4` (PR 2); `SLUG_BIO` (`lib/bio/documento.ts`); `hashIp(req)` (`lib/pages/analytics`); `checkRateLimit`; `renderPaginaNaoEncontrada(nonce)` (`lib/bio/render`, o 404 neutro, sem marca); Task 2.
- Produces: `TOKEN_RASTREIO`; `type DepsRastreio = typeof DEPS`; `responderBusca(req: Request, slug: string, deps?: DepsRastreio): Promise<Response>` (GET/HEAD = formulário, POST = busca); `responderPedido(req: Request, slug: string, token: string, deps?: DepsRastreio): Promise<Response>`.

- [ ] **Step 1: Testes que falham** — o teste importa o módulo direto (não há `after()`). Fixos: `LOJA: LojaDoRastreio` (`tenantId "loja-a"`, nome "Loja Exemplo", `publicSlug "loja-exemplo"`, resto nulo), `CONFIG: RastreioConfig` da mesma loja (`matrix: MATRIZ_PADRAO`), `TOKEN = "0123456789abcdef0123456789abcdef"`, `PEPPER = "p".repeat(32)`, `AGORA = new Date("2026-10-29T15:00:00Z")`, o `NONCE` da Task 2, e documentos gerados no próprio teste:

  ```ts
  const dv = (s: string, pesos: number[]) => { const r = [...s].reduce((t, c, i) => t + Number(c) * pesos[i], 0) % 11; return String(r < 2 ? 0 : 11 - r); };
  const pesos = (n: number) => Array.from({ length: n }, (_, i) => n + 1 - i);
  const cpfCom = (b: string) => { const d = dv(b, pesos(9)); return b + d + dv(b + d, pesos(10)); }; // "111444777" → "11144477735"
  const cnpjCom = (b: string) => { const p = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const d = dv(b, p); return b + d + dv(b + d, [6, ...p]); }; // "112223330001" → "11222333000181"
  ```

  `cenario({ config?, loja?, achados?, porToken?, limitar?, pepper? })` devolve `{ deps, chamadas, buscas }`: cada dep falsa empurra em `chamadas` (`slug:<s>`, `loja:<t>`, `token:<t>:<tk>`), `buscar` empurra os argumentos em `buscas`, `limitar` padrão `async () => false`, erro no lugar do valor é lançado. `pedido(caminho, { metodo?, host?, ip?, extra? })` monta o `Request` com `host` (padrão `www.girumo.com.br`), `x-nonce` e `x-forwarded-for` (padrão `203.0.113.10`); `postar(campos, opcoes?)` = POST em `/rastreio/loja-exemplo` com `application/x-www-form-urlencoded`.
  - `"GET mostra a busca da loja do slug, com noindex e no-store"` — 200 com os três cabeçalhos HTML exatos, `action="/rastreio/loja-exemplo"`, `chamadas` = `["slug:loja-exemplo", "loja:loja-a"]`.
  - `"slug fora do formato nem consulta; loja sem rastreio ligado é 404"` — `Loja-Exemplo`, `_dominio`, `lo`, `"a".repeat(41)`, `loja--exemplo` → 404 com `Página não encontrada` e `chamadas` vazio; `config: null` → 404.
  - `"um pedido abre direto (303); documento e celular do jeito que a pessoa digita"` — CPF `111.444.777-35` e celular `+55 (11) 98765-4321` com um achado → 303, `location` `/rastreio/loja-exemplo/${TOKEN}`, `cache-control` `no-store`; `buscas` = `[["loja-a", docHmac("11144477735", PEPPER), "4321", new Date(AGORA.getTime() - 90 * 86_400_000)]]`. CNPJ `11.222.333/0001-81` → `docHmac` dos 14 dígitos.
  - `"dois ou mais: a lista, na ordem do banco"` — achados `1002` e `1001` → 200 com os dois `href` nessa ordem.
  - `"não achei, não confere e documento inválido: a mesma tela, e a consulta roda nas três"` — CPF válido e CNPJ válido com achados `[]`, e `documento: "123.456"` → três 200 com `await res.text()` iguais, contendo `NAO_ENCONTRADO`; `buscas.length === 3`; `buscas[2][1] === docHmac("123456", PEPPER)`; nenhum HTML contém `111.444.777-35` nem `11144477735`.
  - `"6ª busca no minuto: 429 com 'Muitas tentativas', sem consultar"` — `limitar` com a semântica real (`async (id, max) => (conta[id] = (conta[id] ?? 0) + 1) > max`) → cinco 200 e o sexto 429 com `MUITAS_TENTATIVAS`; `buscas.length === 5`.
  - `"o limite é por IP (com hash) e loja, um balde por janela, e o da hora também barra"` — um POST grava `[[id1, 5, 60_000], [id2, 20, 3_600_000]]`, `id1` casando `/^rastreio-busca-min:[0-9a-f]{32}:loja-a$/` e `id2` `/^rastreio-busca-h:[0-9a-f]{32}:loja-a$/`, nenhum com `203.0.113.10`; `limitar` que barra só `rastreio-busca-h:` → 429 e `buscas` vazio.
  - `"sem o pepper a busca não roda"` — `pepper` lança → 503 de texto, `buscas` vazio (PR 2: sem pepper é erro, nunca "não achei").
  - `"página do token: só aquele pedido, nunca a busca"` — `responderPedido` → 200 com `Pedido nº 1001`, `chamadas` com `token:loja-a:${TOKEN}`, `buscas` vazio, sem `lista-pedidos`.
  - `"token fora do formato ou de outra loja: 404 com a busca"` — token `abc` → 404 sem `token:` em `chamadas`; `porToken` nulo → 404; os dois com `PEDIDO_NAO_ENCONTRADO` e `name="documento"`.
  - `"banco fora: 503 de texto"` — `lojaPorSlug` lança → 503, `text/plain; charset=utf-8`.

- [ ] **Step 2: Rodar e ver falhar** — `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/rastreio/rota-publica.test.ts` → FAIL: `Cannot find module './rota-publica'`.

- [ ] **Step 3: Implementar** — `import "server-only"`; `DEPS` no molde da bio: `lojaPorSlug`, `loja: lojaDoRastreio`, `buscar: buscarPedidos`, `porToken: pedidoPorToken`, `pepper: pepperDoRastreio`, `limitar: checkRateLimit`, `agora: () => new Date()`. `paginaDaLoja(req, slug, deps): Promise<{ loja: LojaDoRastreio; base: string } | Response>`: slug fora de `SLUG_BIO` → 404 de `renderPaginaNaoEncontrada`; `lojaPorSlug` → `lojaDoRastreio(config.tenantId)`, faltou um → o mesmo 404; `base = \`/rastreio/${slug}\``. Helpers `html(status, corpo)` (cabeçalhos HTML) e `tela(t)` = `renderPagina({ loja, base, nonce: req.headers.get("x-nonce") }, t)`. Cada `responder*` num `try/catch` que loga `[rastreio] <slug>: página não abriu` e devolve o 503. O POST da busca:

  ```ts
  const quem = `${hashIp(req) ?? "sem-ip"}:${loja.tenantId}`;
  if ((await deps.limitar(`rastreio-busca-min:${quem}`, 5, 60_000)) || (await deps.limitar(`rastreio-busca-h:${quem}`, 20, 3_600_000))) {
    return html(429, tela({ tipo: "busca", aviso: MUITAS_TENTATIVAS }));
  }
  const campos = new URLSearchParams(await req.text());
  const documento = (campos.get("documento") ?? "").slice(0, 40);
  const celular = (campos.get("celular") ?? "").slice(0, 40).replace(/\D/g, "");
  const pepper = deps.pepper();
  // Documento inválido roda a mesma consulta, com o que foi digitado limpo como o normalizarDocumento limpa:
  // a resposta não diz se o documento existe.
  const chave = normalizarDocumento(documento)?.digitos ?? documento.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const desde = new Date(deps.agora().getTime() - 90 * 86_400_000);
  const achados = await deps.buscar(loja.tenantId, docHmac(chave, pepper), ultimos4(celular), desde);
  if (achados.length === 1) {
    return new Response(null, { status: 303, headers: { location: `${base}/${achados[0].linkToken}`, "cache-control": "no-store" } });
  }
  return html(200, tela(achados.length ? { tipo: "lista", pedidos: achados } : { tipo: "busca", aviso: NAO_ENCONTRADO }));
  ```

  `responderPedido`: token fora de `TOKEN_RASTREIO` ou `porToken` nulo → 404 com a busca e `PEDIDO_NAO_ENCONTRADO`; senão a tela do pedido com `convite: null` (a Parte 2 liga o convite). Rotas (`runtime = "nodejs"`, `dynamic = "force-dynamic"`, `params` é Promise): `[slug]/route.ts` exporta `GET` chamando `responderBusca`, mais `POST = GET` e `HEAD = GET`; `[slug]/[token]/route.ts` exporta `GET` e `HEAD` chamando `responderPedido`.

- [ ] **Step 4: Rodar e ver passar** — o comando do Step 2, depois os quatro da verificação TS do índice → verde.
- [ ] **Step 5: Commit** — `git add` dos 4 arquivos; `git commit -m "feat(rastreio): public tracking search and order page on www" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

### Task 4: Fechamento da Parte 1

- [ ] **Step 1:** `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1` (raiz do worktree) → sem erro (ENOSPC: o CI valida); `git fetch origin main; git log HEAD..origin/main --oneline` → vazio, senão rebase e repetir.
- [ ] **Step 2:** `git push -u origin feat/rastreio-pr3-pagina`; `gh pr create --base main --title "feat(rastreio): public tracking page on www (rastreio PR 3, parte 1)"`, corpo com o resumo, a spec, este plano, o plano de teste (unitários + prova pós-deploy) e `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 3: Revisão de segurança** — `Security Engineer` sobre `git diff origin/main...HEAD`: CSP de uma linha só e sem `'unsafe-inline'`; nenhum texto de fora sem `escapeHtml`; URL de histórico só `http(s)`; cor só `#RRGGBB`; documento nunca em URL, log ou HTML; a mesma resposta para documento inválido; ids do limite com `hashIp`. CRITICAL/HIGH corrigidos antes de seguir.
- [ ] **Step 4:** `gh pr checks <N>` verde → `gh pr merge <N> --squash --delete-branch` (main sem proteção: merge à mão no verde) → o sha em `/admin/configuracoes` ("Deploy").
- [ ] **Step 5: Prova pós-deploy** (PowerShell; slug que não existe, sem dado de loja):
  - `curl.exe -sI https://www.girumo.com.br/rastreio/nao-existe-e2e` → `404` e `x-robots-tag: noindex`; `(curl.exe -sI https://www.girumo.com.br/rastreio/nao-existe-e2e | Select-String '^content-security-policy:').Count` → `1`, com `default-src 'none'` e `form-action 'self'`.
  - `curl.exe -sI https://app.girumo.com.br/rastreio/nao-existe-e2e` → `308` e `location: https://www.girumo.com.br/rastreio/nao-existe-e2e`.
  - `curl.exe -s https://www.girumo.com.br/robots.txt` contém `Disallow: /rastreio/`.
- [ ] **Step 6: Quadro** — o card segue `em_construcao`; o Igor reescreve em prod `update public.board_features set blocker = 'Falta: PR 3 parte 2 (domínio, parar avisos, convite, e2e)<+ os PRs da série ainda abertos>. Página no www no ar (PR #<N>).' where key = 'rastreio-pedidos';`.

---

# Parte 2 — domínio do lojista, "parar avisos", convite e e2e

**Antes de começar:**

```powershell
git fetch origin main
git ls-tree --name-only origin/main apps/web/src/lib/rastreio/rota-publica.ts apps/web/src/lib/rastreio/convite.ts
git worktree add .claude/worktrees/rastreio-pr3-dominio -b feat/rastreio-pr3-dominio origin/main
```

Expected: os 2 caminhos (Parte 1 e PR 4 parte 1); faltou um, parar.

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/custom-domains/host.ts` (+ `host.test.ts`) | rota `"rastreio"`, `RASTREIO_DOMINIO`, `/rastreio` em `ROOT_RESERVED` |
| `apps/web/src/middleware.ts` | `rastreioResponse`: `/rastreio…` → `/rastreio/_dominio…` com a CSP `rastreio` |
| `apps/web/src/lib/rastreio/rota-publica.ts` (+ `.test.ts`) | ramo `_dominio`, `responderParar`, convite |
| `apps/web/src/lib/rastreio/pagina.ts` (+ `.test.ts`) | formulário "parar" e o estado parado |
| `apps/web/src/app/rastreio/[slug]/[token]/parar/route.ts` | handler fino |
| `apps/web/e2e/rastreio-publica.spec.ts`, `.github/workflows/verify.yml` | e2e contra o dev; pepper do CI |

### Task 5: `/rastreio…` no domínio do lojista

**Files:** Modify `apps/web/src/lib/custom-domains/host.ts`, `apps/web/src/middleware.ts`. Test: `apps/web/src/lib/custom-domains/host.test.ts`.

**Interfaces:**
- Produces: `CustomHostRoute` com `"rastreio"`; `export const RASTREIO_DOMINIO = "_dominio"`; `customHostRoute("/rastreio" | "/rastreio/<x>" | "/rastreio/<x>/parar") → "rastreio"`; o middleware reescreve para `/rastreio/_dominio`, `/rastreio/_dominio/<x>`, `/rastreio/_dominio/<x>/parar`.

- [ ] **Step 1: Teste que falha** (importar `RASTREIO_DOMINIO`):

```ts
test("no domínio do lojista, /rastreio é a página de rastreio da loja dona do host", () => {
  const t = "0123456789abcdef0123456789abcdef";
  for (const p of ["/rastreio", `/rastreio/${t}`, `/rastreio/${t}/parar`]) assert.equal(customHostRoute(p), "rastreio", p);
  for (const p of [`/rastreio/${t}/outra`, "/rastreio/a/b/parar"]) assert.equal(customHostRoute(p), "not-found", p);
  assert.equal(customHostRoute("/rastreios"), "root-link"); // slug de campanha, como antes
  assert.equal(RASTREIO_DOMINIO, "_dominio");
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/custom-domains/host.test.ts` → FAIL: `customHostRoute("/rastreio")` devolve `"root-link"`.
- [ ] **Step 3: Implementar** — `host.ts`: `"rastreio"` no tipo; `RASTREIO_DOMINIO` com JSDoc irmão do `BIO_DOMINIO`; `"/rastreio"` em `ROOT_RESERVED` (rede se a ordem abaixo mudar); em `customHostRoute`, antes do `root-link`: `if (/^\/rastreio(?:\/[^/]+(?:\/parar)?)?$/.test(pathname)) return "rastreio";` (JSDoc: "…e o rastreio do pedido em /rastreio"). `middleware.ts`: importar `RASTREIO_DOMINIO`; depois de `bioRootResponse`:

  ```ts
  /**
   * `/rastreio…` no domínio do lojista: a página de rastreio da loja dona do host, sem mudar a URL
   * (spec rastreio-pedidos §3.5). Irmã de bioRootResponse; quem acha a loja pelo host é o handler.
   */
  function rastreioResponse(req: NextRequest): NextResponse {
    const nonce = generateNonce();
    const destino = req.nextUrl.clone();
    destino.pathname = `/rastreio/${RASTREIO_DOMINIO}${req.nextUrl.pathname.slice("/rastreio".length)}`;
    return nonceResponse(req, buildCsp("rastreio", nonce, process.env.NODE_ENV === "development"), nonce, destino);
  }
  ```

  e, no ramo `if (!firstParty)`, `if (route === "rastreio") return rastreioResponse(req);` (comentário do ramo: "só links, páginas, o rastreio e, na raiz, o link da bio").
- [ ] **Step 4: Rodar e ver passar** — o comando do Step 2 mais `src/lib/security/csp.test.ts` → PASS.
- [ ] **Step 5: Commit** — os 3 arquivos; `git commit -m "feat(rastreio): serve /rastreio on the store's custom domain" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

### Task 6: `_dominio`, "parar avisos" e o convite no handler e na página

**Files:** Modify `apps/web/src/lib/rastreio/rota-publica.ts`, `apps/web/src/lib/rastreio/pagina.ts`; Create `apps/web/src/app/rastreio/[slug]/[token]/parar/route.ts`. Test: `rota-publica.test.ts`, `pagina.test.ts`.

**Interfaces:**
- Consumes: `getActiveDomainTenant(hostname): Promise<string | null>`; `rastreioLigado(tenantId): Promise<boolean>`, `pararAvisos(tenantId, linkToken): Promise<{ orderId: string } | null>` e `lerPedido(tenantId, orderId): Promise<PedidoInterno | null>` (PR 1); `conviteDoGrupo(loja, telefone): Promise<{ url: string } | null>` (PR 4, `lib/rastreio/convite.ts`; não lança); `RASTREIO_DOMINIO`, `LINK_NAO_ENCONTRADO`, `hostnameFromHostHeader`, `isFirstPartyHost` (`host.ts`); `linkDoPedido(loja, token)` (PR 2, só no teste).
- Produces: `DepsRastreio` + `donoDoHost`, `ligado`, `parar`, `lerPedido`, `convite`; `responderParar(req: Request, slug: string, token: string, deps?: DepsRastreio): Promise<Response>`; `AVISOS_PARADOS`; `<form method="post" action="{base}/{token}/parar">` na página do pedido.

**Checagem de origem no "parar" (decisão):** não há sessão; o token de 128 bits é a credencial, e quem o tem posta por curl de qualquer jeito — a checagem não protege o token. Ela impede que uma página de terceiro transforme um link vazado num botão de "parar" que o navegador da compradora submete (o clickjacking já para no `frame-ancestors 'none'`). Regra: `Sec-Fetch-Site` presente → só `same-origin`; ausente e `Origin` presente → host do `Origin` igual ao `Host` (`null` ou inválido = de fora); nenhum dos dois (curl, navegador antigo) → passa. A busca não leva a checagem: não grava.

- [ ] **Step 1: Testes que falham** — `cenario` ganha `dono`, `ligado` (padrão `true`), `parado` (padrão `{ orderId: "o-1" }`), `interno` e `convite`, e as listas `parados` (`parar` empurra `[tenant, token]` e devolve `parado`) e `convites` (`convite` empurra `[loja.tenantId, telefone]`); `chamadas` ganha `host:<h>`, `ligado:<t>` e `interno:<t>:<id>`:
  - `"domínio do lojista: a loja dona do host ativo com o rastreio ligado, base sem slug"` — `responderBusca(pedido("/rastreio/_dominio", { host: "Pedidos.Loja-Exemplo.test:443" }), "_dominio", deps)` → 200, `chamadas` = `["host:pedidos.loja-exemplo.test", "ligado:loja-a", "loja:loja-a"]`, `action="/rastreio"`; `responderPedido` no mesmo host → `action="/rastreio/${TOKEN}/parar"`.
  - `"_dominio em host do Girumo é 404 HTML sem consulta"` — `www.girumo.com.br`, `app.girumo.com.br`, `localhost:3000` → 404 `text/html`, `chamadas` vazio.
  - `"domínio sem dono ou com o rastreio desligado: o 404 de texto"` — `dono: null`; `dono: "loja-a"` com `ligado: false` → 404 `text/plain` e `await res.text() === "Link não encontrado."`.
  - `"parar: POST da própria página grava e volta ao pedido"` — `sec-fetch-site: same-origin` → 303, `location` `/rastreio/loja-exemplo/${TOKEN}`, `parados` = `[["loja-a", TOKEN]]`; sem os dois cabeçalhos → 303.
  - `"parar: GET e HEAD são 405 e não consultam nada"` — 405, `allow` `POST`, `parados` e `chamadas` vazios.
  - `"parar vindo de outro site é 403 e não grava"` — `sec-fetch-site: cross-site`; só `origin: https://outro-site.test`; só `origin: null` → 403 com `Abra o link do pedido para parar os avisos.`, `parados` vazio.
  - `"parar com token fora do formato ou de outra loja: 404 com a busca"` — token `abc` (sem chamar `parar`) e `parar` → `null`.
  - `"convite do VIP: o do conviteDoGrupo com o telefone do pedido; falha não derruba a página"` — `LOJA` com `vipLinkId: "vip-1"`, `interno` com `buyerPhone: "5511987654321"`, `convite` → `{ url: "https://www.girumo.com.br/r/vip-loja" }` → `convites` = `[["loja-a", "5511987654321"]]` e `href="https://www.girumo.com.br/r/vip-loja"`; `vipLinkId: null` → nem `interno:` em `chamadas` nem `convites`; `lerPedido` lançando → 200 sem `grupo VIP`.
  - `"o link do aviso (PR 2) cai nestas rotas"` — `new URL(linkDoPedido(LOJA, TOKEN)).pathname` = `/rastreio/loja-exemplo/${TOKEN}`; com `dominio: "pedidos.loja-exemplo.test"` → `/rastreio/${TOKEN}`.
  - `pagina.test.ts`: `"pedido com avisos ligados tem o formulário de parar; parado mostra o aviso"` — contém `<form method="post" action="/rastreio/loja-exemplo/${TOKEN}/parar">` e `Não quero mais avisos deste pedido`; com `noticesStoppedAt` → contém `AVISOS_PARADOS` e não contém `/parar"`.

- [ ] **Step 2: Rodar e ver falhar** — `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/rastreio/rota-publica.test.ts src/lib/rastreio/pagina.test.ts` → FAIL: `_dominio` cai no 404 de formato; `responderParar` não existe.
- [ ] **Step 3: Implementar**
  - `DEPS` ganha `donoDoHost: getActiveDomainTenant`, `ligado: rastreioLigado`, `parar: pararAvisos`, `lerPedido`, `convite: conviteDoGrupo`.
  - `paginaDaLoja`, primeira linha: `if (slug === RASTREIO_DOMINIO) return lojaDoDominio(req, deps);` — host por `hostnameFromHostHeader`; host do Girumo → 404 HTML sem consulta; `donoDoHost` → `ligado` → `loja`; faltou um → `new Response(LINK_NAO_ENCONTRADO, { status: 404, headers: CABECALHO_TEXTO })`; `base = "/rastreio"`.
  - `responderPedido`: com `loja.vipLinkId`, `convite` = `(await deps.convite(loja, (await deps.lerPedido(tenantId, pedido.id))?.buyerPhone ?? null))?.url ?? null` dentro de um `try/catch` que loga `[rastreio] <tenant>: convite não carregou` (sem telefone) e segue com `null`; sem `vipLinkId`, `null` sem consulta.
  - `responderParar`: método diferente de POST → 405 (`allow: POST`) antes de tudo; `deOutroSite(req)` → 403 de texto; `paginaDaLoja`; token fora do formato ou `parar` nulo → 404 com a busca e `PEDIDO_NAO_ENCONTRADO`; senão 303 para `${base}/${token}`. Nunca toca em `optouts` (spec §1.2).

    ```ts
    /** POST de outra origem: o navegador diz por `Sec-Fetch-Site`; sem ele, pelo `Origin`. Nenhum dos dois = passa. */
    function deOutroSite(req: Request): boolean {
      const site = req.headers.get("sec-fetch-site");
      if (site) return site !== "same-origin";
      const origem = req.headers.get("origin");
      if (!origem) return false;
      try {
        return new URL(origem).host !== (req.headers.get("host") ?? "");
      } catch {
        return true;
      }
    }
    ```
  - `pagina.ts`: `AVISOS_PARADOS`; no pedido, depois do convite: `noticesStoppedAt` → `<p class="parado">`; senão `<form method="post" action="{base}/{token}/parar"><button class="parar" type="submit">Não quero mais avisos deste pedido</button></form>` (botão com cara de link, 13px, `#4F5A64`, alvo de 44px).
  - `parar/route.ts`: `POST` chama `responderParar`; `GET = POST` e `HEAD = POST`, com o comentário "responderParar responde 405 a todo método que não é POST, sem consultar nada: a prévia do WhatsApp e o prefetch abrem o endereço sozinhos".
- [ ] **Step 4: Rodar e ver passar** — o comando do Step 2 e os quatro da verificação TS → verde.
- [ ] **Step 5: Commit** — os 5 arquivos; `git commit -m "feat(rastreio): custom domain, stop-notices form and VIP invite on the order page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

### Task 7: e2e contra o dev

**Files:** Create `apps/web/e2e/rastreio-publica.spec.ts`; Modify `.github/workflows/verify.yml` (env do passo `npm run web:e2e`).

**Interfaces:**
- Consumes: RPC `rastreio_gravar_pedido(p_tenant, p_pedido) → { id, link_token, … }` (PR 1); tabelas `organizations`, `tenant_settings`, `tracking_settings`, `tracking_orders`, `tracking_notices`, `custom_domains`, `optouts`. O `doc_hmac` sai de `createHmac("sha256", PEPPER).update(CPF).digest("hex")` (`node:crypto`), a definição de `docHmac` no PR 2 — o `documento.ts` é `server-only` e o Playwright não o importa.

Loja FIXA no dev, como a da bio (`e2e-bio-fixa`): criada no primeiro run, regravada nos outros; nunca a loja de QA. O e2e e o servidor precisam do mesmo `RASTREIO_DOC_PEPPER`.

- [ ] **Step 1: `verify.yml`** — no `env` do passo `npm run web:e2e`, depois de `CRON_SECRET`: `RASTREIO_DOC_PEPPER: ci-pepper-do-rastreio-so-para-o-e2e-000000`, com o comentário "Placeholder declarado, não segredo: o e2e do rastreio semeia o pedido inventado com este pepper e o servidor busca com ele; o real mora na Vercel".
- [ ] **Step 2: O spec** — cabeçalho no molde de `link-da-bio-publica.spec.ts` (`test.use({ storageState: { cookies: [], origins: [] } })`; `test.skip` sem service role do dev — allowlist `wfjuwogxaupyadwhvoxy` — ou com pepper abaixo de 32 caracteres; o aviso de que CSP duplicada só a Vercel mostra). Fixos: org `e2e-rastreio-fixa` "Loja Exemplo E2E", `PUBLIC_SLUG = "e2e-rastreio"`, `DOMINIO = "pedidos.e2e-rastreio.test"`, CPF `cpfCom("390533447")` (o `dv`/`cpfCom` da Task 3, copiado), `CELULAR = "5511987650001"`. `beforeAll` (`ok(r)` lança com `r.error.message`):

  ```ts
  // org: idDe("organizations", "slug", …) ou insert { name, slug } tolerando 23505, como na bio.
  await ok(banco.from("tenant_settings").upsert({ tenant_id: lojaId, rastreio_enabled: true }, { onConflict: "tenant_id" }));
  await ok(banco.from("tracking_settings").upsert(
    { tenant_id: lojaId, public_slug: PUBLIC_SLUG, store_whatsapp: null, vip_link_id: null, imported_at: new Date().toISOString() },
    { onConflict: "tenant_id" },
  ));
  await ok(banco.from("custom_domains").upsert({ tenant_id: lojaId, hostname: DOMINIO, verification_token: "e2e-rastreio", status: "active" }, { onConflict: "tenant_id" }));
  const comuns = { buyer_first_name: "Ana", buyer_phone: CELULAR, buyer_email_enc: null, doc_hmac: createHmac("sha256", PEPPER).update(CPF).digest("hex"), historico: [] };
  const base = [
    { external_id: "e2e-rastreio-1001", numero: "1001", status_raw: "on_carriage", etapa: "enviado", tracking_code: "AB123456789BR", tracking_url: "https://rastreio.e2e-rastreio.test/AB123456789BR", shipment_service: "Correios · SEDEX" },
    { external_id: "e2e-rastreio-1002", numero: "1002", status_raw: "delivered", etapa: "entregue", tracking_code: "AC987654321BR", tracking_url: null, shipment_service: "Correios · PAC" },
  ];
  for (const [i, p] of base.entries()) {
    const criado = new Date(Date.now() - (2 - i) * 86_400_000).toISOString(); // dentro dos 90 dias a cada run
    const { data, error } = await banco.rpc("rastreio_gravar_pedido", { p_tenant: lojaId, p_pedido: { ...p, ...comuns, order_created_at: criado } });
    if (error) throw new Error(`pedido ${p.numero}: ${error.message}`);
    pedidos[i] = { id: data.id, token: data.link_token };
    await ok(banco.from("tracking_orders").update({ order_created_at: criado, notices_stopped_at: null }).eq("tenant_id", lojaId).eq("id", data.id));
  }
  await ok(banco.from("tracking_notices").upsert(
    { tenant_id: lojaId, order_id: pedidos[0].id, etapa: "enviado", channel: "email", status: "pendente" },
    { onConflict: "order_id,etapa,channel" },
  ));
  ```

  Testes:
  - `"busca no www: uma CSP com nonce, noindex, no-store e o título da loja"` — `GET /rastreio/e2e-rastreio` → 200; um header `content-security-policy` com `default-src 'none'` e `form-action 'self'` e o nonce dele em `nonce="…"` no HTML; `x-robots-tag` `noindex`; `cache-control` com `no-store`; `<title>Acompanhe seu pedido · Loja Exemplo E2E</title>`.
  - `"busca → lista → pedido (só aquele) → parar avisos, no navegador"` — conta `optouts` da loja; `page.goto("/rastreio/e2e-rastreio")`; `getByLabel("CPF ou CNPJ")` ← CPF com pontos e traço; `getByLabel("Últimos 4 números do celular")` ← `0001`; "Ver meus pedidos"; links `/Pedido nº 1002/` e `/Pedido nº 1001/` visíveis; clicar o de 1001 → URL termina em `/rastreio/e2e-rastreio/<token 1001>`, heading "Pedido nº 1001", `getByText("Pedido nº 1002")` com contagem 0, botão "Copiar" visível (o script com nonce rodou sob a CSP); clicar "Não quero mais avisos deste pedido" → "Você não recebe mais avisos deste pedido." visível. No banco: `notices_stopped_at` de 1001 preenchido, o aviso semeado `pulado`, `optouts` da loja igual ao de antes.
  - `"GET no parar é 405 e não grava"` — `GET /rastreio/e2e-rastreio/<token 1002>/parar` → 405; `notices_stopped_at` de 1002 continua nulo.
  - `"domínio do lojista: /rastreio e /rastreio/<token> da loja dona; host sem dono é o 404 de texto"` — `host: DOMINIO`: `GET /rastreio` → 200 com `action="/rastreio"`; `GET /rastreio/<token 1001>` → 200 com `Pedido nº 1001` e `action="/rastreio/<token 1001>/parar"`; `host: sem-dono.e2e-rastreio.test`, `GET /rastreio` → 404 com o corpo `Link não encontrado.`.
  - `"_dominio no host do Girumo é 404"` — `GET /rastreio/_dominio` → 404 com `noindex`.
  - `"app. e o apex mandam /rastreio para o www com 308"` — `host` `app.girumo.com.br` e `girumo.com.br`, `maxRedirects: 0` → 308 e `location` `https://www.girumo.com.br/rastreio/e2e-rastreio`.
  - `"robots.txt tira /rastreio/ do índice"` — `GET /robots.txt` contém `Disallow: /rastreio/`.

- [ ] **Step 3: Rodar** — sem `E2E_SUPABASE_*` de dev nesta máquina o spec se marca skip: a prova é o job `e2e` do PR, com `rastreio-publica.spec.ts` em `7 passed` (skipped não vale). Local: `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json` → sem erro.
- [ ] **Step 4: Commit** — `git add apps/web/e2e/rastreio-publica.spec.ts .github/workflows/verify.yml`; `git commit -m "test(e2e): public tracking search, order and stop-notices against dev" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"`.

### Task 8: Fechamento da Parte 2

- [ ] **Step 1:** gate local e defasagem como na Task 4; `git push -u origin feat/rastreio-pr3-dominio`; `gh pr create --base main --title "feat(rastreio): custom domain, stop notices, VIP invite and e2e (rastreio PR 3, parte 2)"`, corpo no mesmo formato.
- [ ] **Step 2: Revisão de segurança** — `Security Engineer`: `_dominio` só fora dos hosts do Girumo; loja sempre a dona do host **ativo** e com o rastreio ligado; token da loja A no domínio da B = 404; "parar" só por POST da mesma origem e sem tocar em `optouts`; o convite aparecer ou não diz a quem tem o link se o telefone do pedido já é lead da loja (aceito pelo spec §3.3; avaliar); o pepper do `verify.yml` só no CI.
- [ ] **Step 3:** `gh pr checks <N>` verde com o e2e em `7 passed` (cascata de 401/500 em specs alheios = corrida no banco dev: `gh run rerun <id> --failed`); merge à mão; deploy em `/admin/configuracoes`.
- [ ] **Step 4: Prova pós-deploy** — `curl.exe -sI https://<domínio ativo da piloto>/rastreio` → um header CSP com `default-src 'none'` e `form-action 'self'` (200 com o rastreio da piloto ligado; 404 `Link não encontrado.` sem ele — os dois provam que o caminho chega no handler; antes virava `/r/rastreio`, com a CSP do clique); `curl.exe -s -o NUL -w "%{http_code}" https://www.girumo.com.br/rastreio/nao-existe-e2e/00000000000000000000000000000000/parar` → `405`.
- [ ] **Step 5:** blocker do card reescrito sem o PR 3; `kg_insert_text` com a decisão (página do rastreio: `_dominio` no domínio, limite na rota por IP com hash + loja, "parar" só por POST da mesma origem). Encerrar com "PRs que deixei abertos: …".

## Interface com os outros PRs

- **PR 1:** `lojaPorSlug`, `rastreioLigado`, `buscarPedidos`, `pedidoPorToken`, `pararAvisos`, `lerPedido`, `PedidoPublico`, `RastreioConfig`, `MATRIZ_PADRAO` e, no e2e, a RPC e as colunas do spec §2. O CHECK de `public_slug` é o `SLUG_BIO`: a rota usa a mesma regra.
- **PR 2:** `normalizarDocumento`, `docHmac`, `pepperDoRastreio`, `ultimos4`, `lojaDoRastreio`, `LojaDoRastreio` e, só no teste, `linkDoPedido`. `docHmac` = HMAC-SHA256 hex dos dígitos (o e2e repete a conta, porque `documento.ts` é `server-only`).
- **PR 4:** a Parte 2 importa `conviteDoGrupo` (Parte 1 do PR 4) — por isso espera ela em `main`. O "Parar avisos" do e-mail aponta para a página do pedido (`linkDoPedido`), onde está o formulário; não existe GET que pare.
- **PR 5:** acrescenta `cancelarWhatsapps` ao `DEPS` de `rota-publica.ts` e o chama em `responderParar` logo depois de `parar` devolver `{ orderId }` (com `.catch`); os nomes `DepsRastreio`, `responderParar`, `cenario`, `loja-a`, `loja-exemplo` e `TOKEN` deste plano são os que o plano do PR 5 já usa.
- **PR 6:** o "abrir" das Configurações é `linkDaBusca`, que cai em `responderBusca`.

## Divergências com o código e decisões (conferir)

1. **`next.config.ts` entra nos registros** (regra global de `headers()`, `/rastreio/:path*` sem CSP estática, `redirects()`): o §3.5 não lista, mas sem ele a Vercel manda duas CSP (a estática, com `'unsafe-inline'`, e a de nonce), como foi na bio.
2. **Limite:** `checkRateLimit` devolve `true` = bloqueado, e o balde em memória usa só o id como chave — os dois baldes precisam de ids diferentes. `isRateLimited` (`lib/pages/analytics`) é só por minuto; reaproveito o `hashIp` dele.
3. **`/rastreio` no domínio do lojista hoje é `root-link`** (vira `/r/rastreio`): a regra nova vem antes; `/rastreio` em `ROOT_RESERVED` fica de rede.
4. **`lojaPorSlug` devolve `RastreioConfig`** (sem nome e cor): a rota chama `lojaDoRastreio` depois — duas leituras por página. No domínio, a flag é conferida por `rastreioLigado`, porque `lojaDoRastreio` não a lê (plano do PR 2).
5. **Pepper no CI:** o job `e2e` não tem `RASTREIO_DOC_PEPPER`; entra no `verify.yml` como placeholder declarado.
6. **Dependência nova:** a Parte 2 espera o PR 4 parte 1 (`conviteDoGrupo`, que o PR 4 desenhou para o e-mail e a página). A Parte 1 continua em paralelo com os PRs 4 e 6.
7. **Textos e campos do mockup trocados:** "CPF" → "CPF ou CNPJ", com o campo não só numérico (CNPJ alfanumérico, PR 2); "Toque em Acompanhar pedido" → "Toque no link da mensagem" (o WhatsApp não tem botão); "Outros pedidos com esse CPF" → a tela de lista da busca; campo do celular sem `maxlength="4"` (o servidor pega os 4 últimos dígitos, então o número inteiro também acha).
8. **Decidido em 29/10** (era "para decidir"): (a) RPC com `carimbar` no PR 1 — importação sem histórico fica com `events = []`; (b) retirada trocada para "Detalhes: {link}" no spec e no PR 5. Texto original: (a) pedido importado sem histórico ganha `events = [{etapa, now()}]` (RPC do PR 1): a página mostra a data da importação como data da etapa, contra o "sem datas inventadas" do §1.1 — sugiro a RPC gravar `events = []` quando a origem não traz data. (b) O WhatsApp de retirada diz "Veja onde retirar: {link}", mas a página não tem o local de retirada (não está nos dados): ela diz "Combine com a loja onde e quando retirar." — trocar o texto no PR 5.
