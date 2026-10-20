# Link da bio — PR 4b: toque Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada toque num botão da página pública do link da bio vira +1 no contador daquele botão (`bio_contagens`, `alvo` = id do link): o JS da página manda um `sendBeacon` e `POST /api/p/bio/toque` confere e conta, respondendo 204 sempre.

**Architecture:** `app/api/p/bio/toque/route.ts` só chama `responderToque` (`lib/bio/toque.ts`), que filtra robô, lê no máximo 256 bytes do corpo, valida os dois uuids, acha a página no cache do PR 2 (`paginaPublicaPorId`), confere que o link é um dos que a página mostra (`linksVisiveis`, PR 3a), aplica o teto por IP+página e chama `contarBio` (PR 2). Cache e banco entram por parâmetro (`DepsToque`, o desenho do `responderBio` do 4a), porque o `unstable_cache` não roda fora do Next. No navegador, o ramo do `[data-link]` do `script.ts` (PR 3a) ganha o `navigator.sendBeacon`. `/api/p/*` já passa sem sessão nos dois hosts: nada muda em middleware, CSP, `next.config.ts` nem `host.ts` — o plano só trava isso com teste.

**Tech Stack:** Next 15.5 route handler (Node), store e cache do PR 2 (service role), `checkRateLimit` (Upstash em produção, balde em memória no teste), `node:test` via tsx, Playwright contra o banco de dev.

**Spec:** `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` — §7 (toque), §9 (`scriptDaPagina`, a marcação que o JS lê e "Público: `POST /api/p/bio/toque` → 204"), §10 (toque) e a linha 4b do §12. Índice: `docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md`.

**Depende de:** PRs 1, 2 e 3a e **as duas partes do 4a** em `main`. O e2e deste PR usa a loja fixa do 4a e o `DOMINIO` que a Parte 2 cria; o `analytics.ts` já vem com `"bio-visita"`.

**Conferido antes de virar plano** (Node 24, fora do repo, com cópias fiéis do código): o `lerTextoComTeto` sobre `new Response(req.body)` aceita 256 bytes e recusa 257 com qualquer `Content-Length`, e um corpo em stream sem fim para depois de 5 pedaços de 64 bytes; o JS novo tem 1112 bytes (eram 906), chama o `sendBeacon` como método do `navigator`, manda o beacon do endereço só na abertura e não chama `preventDefault`; a lógica de `responderToque` passou nos 9 cenários da Task 1.

## Arquivos (4 de código + 3 de teste: um PR só)

| Arquivo | Task | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/bio/toque.ts` (+ `toque.test.ts`) | 1 | `responderToque`: robô, corpo, ids, página e link, teto, contagem |
| `apps/web/src/app/api/p/bio/toque/route.ts` | 1 | `POST` que chama `responderToque` |
| `apps/web/src/lib/pages/analytics.ts` | 1 | balde `"bio-toque"` |
| `apps/web/src/lib/bio/render/script.ts` (+ `script.test.ts`) | 2 | o beacon no JS da página |
| `apps/web/e2e/link-da-bio-publica.spec.ts` | 3 | toque nos dois hosts e no navegador, contra o dev |

As Tasks 1 e 2 têm arquivos disjuntos e nenhuma dependência entre si. Com dois implementadores, as duas entram na mesma wave: eles não commitam, e o controller commita uma de cada vez. A Task 3 depende das duas.

## Decisões deste plano

| Decisão | Por quê | Custo se estiver errada |
|---|---|---|
| A lógica mora em `lib/bio/toque.ts`, e o `route.ts` só delega | O `route.ts` do Next só pode exportar handlers. Cache e banco entram por parâmetro, como no `responderBio` do 4a | Nenhum |
| Conta só o link que `linksVisiveis` devolve | É a regra do renderizador: link ativo, fora de `linksEscondidos` **e** com destino válido. Se a página não mostra o link, ninguém tocou nele | Nenhum |
| Ordem: robô → outro site → corpo → ids → página e link → teto → conta | O mais barato vem primeiro. Id inventado não gasta chamada ao Upstash, e o balde só enche com toque que contaria. A spec lista os mesmos passos sem fixar a ordem | Nenhum |
| Corpo lido com `lerTextoComTeto` (`lib/bling/cliente.ts`) sobre `req.body`, com prazo de 2 s (`pipeThrough` com `AbortSignal.timeout`) | Reuso do leitor que já existe e já tem teste: lê aos pedaços e para no teto. Com `req.text()`, o corpo inteiro iria para a memória antes da medição. O prazo impede que quem manda alguns bytes e não fecha a conexão segure a função até o timeout da plataforma | `lib/bio` importa de `lib/bling`. O módulo só importa `zod` e não tem `server-only`. Cliente que leva mais de 2 s para mandar 87 B perde o toque |
| `Content-Type` não é conferido | Não protege nada: o corpo passa pela mesma validação de qualquer jeito. O cliente usa `text/plain` só para o navegador não fazer preflight | Nenhum |
| Conta antes de responder, sem `after()` | O `sendBeacon` não espera a resposta, e a função leva o mesmo tempo. Fica com menos peças que o `after` da visita | Nenhum |
| Recusa de corpo, página fora do ar e link fora da página vão para `console.warn`, cada uma com o seu aviso; falha para `console.error`; robô, outro site e teto não deixam log | A lição do `/api/track/outbound`: um 204 sem log escondeu uma série que tinha parado. Só entram no log o motivo e os ids que passaram pela regex, nunca o corpo | O log cresce durante uma varredura |
| No `<summary>` do endereço, o beacon só sai quando o `<details>` abre | A spec diz "na abertura". No clique, o `open` ainda guarda o estado anterior, então aberto quer dizer que o toque vai fechar | Nenhum |
| Sempre `navigator.sendBeacon(...)` | Chamada solta (`var b=navigator.sendBeacon; b(…)`), ela dá "Illegal invocation" no navegador. O teste confere o `this` | Nenhum |
| `customHostRoute` não muda | `/api/p/` já é `"public-api"` pelo prefixo (`pathname.startsWith("/api/p/")` em `host.ts`). O teste trava isso | Nenhum |
| `Sec-Fetch-Site` conferido quando vem; `Origin`, não | O beacon da página é sempre same-origin (URL relativa, no www e no domínio próprio): com o header presente, só `same-origin` conta. Sem o header (WebView antigo), conta. O `Origin` não serve: o Origin pode vir null (política no-referrer, documento em sandbox). Ver "Riscos" | Um navegador que rotule errado um beacon same-origin perde o toque (nenhum conhecido) |
| O e2e põe dois botões fixos (link e endereço) na loja fixa do 4a | Precisa de um botão para tocar. A mudança fica no mesmo `beforeAll` e não cria uma segunda loja, que deixaria slug preso em `bio_slugs` | Nenhum |

## Global Constraints

- `POST /api/p/bio/toque` → **204 sempre**, sem corpo, "inclusive em erro" e sem revelar nada (spec §7, §9, §10).
- Corpo: até **256 B**, medidos no que foi lido (o `Content-Length` não vale). Formato `{"p":"<uuid da página>","l":"<uuid do link>"}`, os dois uuids em minúsculo pelo `UUID_BIO` do PR 2 (`^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$`, o check de `bio_contagens.alvo` do PR 1), sem o `'visita'`.
- Página por `paginaPublicaPorId` (publicada, não bloqueada). O link existe, está ativo e fica fora de `linksEscondidos`.
- Robô: `isBotUserAgent`. Teto: `isRateLimited("bio-toque", req, 30, paginaId)`. Conta com `contarBio(paginaId, linkId)`, e o `tenant_id` sai da página, nunca do corpo.
- Nada de IP, user agent ou referer guardado (spec §7). O IP só aparece em hash, na chave do balde.
- Beacon: `navigator.sendBeacon('/api/p/bio/toque', '{"p":"<pagina>","l":"<link>"}')` no clique de `[data-link]`, com corpo `text/plain` e sem preflight (spec §7). Sem `preventDefault`, sem atrasar a navegação. JS ES5, ≤ 3 KB e sem `<`, sem nenhum texto do lojista (spec §10, §11).
- O JS só lê `<body data-pagina>` e `data-link`/`data-tipo` (a marcação do §9).
- `/api/p/*` público nos dois hosts. O beacon sai para o mesmo host da página, e a CSP `"bio"` (4a) libera com `connect-src 'self'`.
- Revisão de segurança obrigatória antes do merge (spec §10).
- Testes de um arquivo, em `apps/web`: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. Commits em inglês, com prefixo semântico. Nenhuma DDL. Repositório público: só dados fictícios.

## Review Focus

- **"Como chegar" aberto e fechado várias vezes**: só a abertura conta. Testes: "endereço: o beacon sai quando o `<details>` abre, não quando fecha" (Task 2) e, num navegador de verdade, o teste do navegador (Task 3).
- **Página aberta antes de uma mudança** (link desligado ou escondido, número que virou conectado, campanha apagada, página despublicada): 204 sem contar. Testes: "link que a página não mostra…" e "página não publicada…" (Task 1).
- **Navegador sem `sendBeacon`** (WebView antigo): o toque continua igual (status, balanço e navegação), sem erro de JS. Teste: "navegador sem sendBeacon…" (Task 2).
- **Página no domínio próprio**: o beacon vai para o host do lojista e passa no middleware sem sessão. Testes: "o beacon passa sem sessão nos dois hosts" (Task 1) e o caso `host: DOMINIO` do e2e (Task 3).
- **`l: "visita"` ou uuid em maiúsculas**: o check do banco aceita `'visita'`. Sem a regex, só a conferência do link impediria uma visita falsa. Um uuid em maiúsculas nunca é id de botão. Os dois são recusados antes de consultar qualquer coisa. Teste: "JSON ruim e ids fora do formato…" (Task 1).

---

### Task 0: Pré-condições e branch

**Files:** nenhum.

- [ ] **Step 1: As dependências estão em `main`?** Rodar na raiz do checkout principal (`C:\Users\Igor\Desktop\HubFlow-platform`):

```powershell
git fetch origin main
git ls-tree --name-only origin/main apps/web/src/lib/bio/cache.ts apps/web/src/lib/stores/bio-pages.ts apps/web/src/lib/bio/render/partes.ts apps/web/src/lib/bio/render/script.ts apps/web/src/lib/bio/rota-publica.ts apps/web/e2e/link-da-bio-publica.spec.ts
git grep -n "bio-root" origin/main -- apps/web/src/lib/custom-domains/host.ts
```

Expected: o `ls-tree` lista os 6 caminhos e o `git grep` acha `"bio-root"`, sinal de que a Parte 2 do 4a está em `main`. Se faltar algum, parar.

- [ ] **Step 2: Criar o worktree a partir de `origin/main`** (nunca `checkout -b` no checkout principal):

```powershell
git worktree add .claude/worktrees/bio-toque -b feat/bio-toque origin/main
```

No worktree novo: `node_modules` por junction e e2e contra o dev só com `E2E_SUPABASE_*` no ambiente (ver "Ambiente do worktree" no índice). **Daqui em diante todo comando, git inclusive, roda em `apps/web` do worktree**, exceto o gate da Task 4.

- [ ] **Step 3: Conferir os nomes de que o plano depende**:

```powershell
git grep -nE 'paginaPublicaPorId|contarBio|export const UUID_BIO|export function linksVisiveis|export async function lerTextoComTeto|bio-visita' -- src/lib/bio/cache.ts src/lib/stores/bio-pages.ts src/lib/bio/documento.ts src/lib/bio/render/partes.ts src/lib/bling/cliente.ts src/lib/pages/analytics.ts
git grep -nE 'const DOMINIO|async function visitas|const documento = documentoPadrao' -- e2e/link-da-bio-publica.spec.ts
```

Expected: pelo menos uma linha para cada nome. Se faltar algum, parar e reportar. Os nomes do §9 são contrato. Os padrões vão sem aspas duplas porque o PowerShell 5.1 estraga aspas dentro de argumento de exe.

- [ ] **Step 4: Atualizar o quadro ao começar.** O card continua em `em_construcao`, então não chamar `move_card` para o mesmo status. O Igor roda em prod:

```sql
update public.board_features
   set blocker = 'PR 4b (toque: POST /api/p/bio/toque + beacon na página) em construção.'
 where key = 'link-da-bio';
```

---

### Task 1: `responderToque` e a rota `/api/p/bio/toque`

**Files:**
- Create: `apps/web/src/lib/bio/toque.ts`
- Create: `apps/web/src/app/api/p/bio/toque/route.ts`
- Modify: `apps/web/src/lib/pages/analytics.ts` (union de `isRateLimited`, linha `rota: …`)
- Test: `apps/web/src/lib/bio/toque.test.ts`

**Interfaces:**
- Consumes: `paginaPublicaPorId(id: string): Promise<DadosRender | null>` (PR 2, `lib/bio/cache.ts`); `contarBio(paginaId: string, alvo: string): Promise<void>` (PR 2, `lib/stores/bio-pages.ts`, que também recusa alvo fora do formato antes de chamar o banco); `type DadosRender` e `UUID_BIO: RegExp` (= `/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/`, PR 2, `lib/bio/documento.ts`); `linksVisiveis(d: DadosRender): LinkVisivel[]`, com `LinkVisivel = { link: LinkBio; href: string; principal: boolean }` (PR 3a, `lib/bio/render/partes.ts`); `IDS`, `dadosFalsos()` (PR 3a, `src/test/bio-dados-falsos.ts`). Do repo: `lerTextoComTeto(res: Response, teto: number): Promise<string | null>` (`lib/bling/cliente.ts`); `isBotUserAgent(ua: string | null): boolean`; `isRateLimited(...)` (`lib/pages/analytics.ts`); `customHostRoute`, `skipsFirstPartyMiddleware` (`lib/custom-domains/host.ts`).
- Produces: `type DepsToque = { porId: (id: string) => Promise<DadosRender | null>; contar: (paginaId: string, alvo: string) => Promise<void> }`; `responderToque(req: Request, deps?: DepsToque): Promise<Response>`; `POST /api/p/bio/toque`; `isRateLimited(rota: "lead" | "track" | "outbound" | "bio-visita" | "bio-toque", …)`.

- [ ] **Step 1: Write the failing test** — criar `apps/web/src/lib/bio/toque.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { DadosRender } from "@/lib/bio/documento";
import { customHostRoute, skipsFirstPartyMiddleware } from "@/lib/custom-domains/host";
import { IDS, dadosFalsos } from "@/test/bio-dados-falsos";
import { responderToque, type DepsToque } from "./toque";

/**
 * `responderToque` com o cache e o banco trocados por funções (`DepsToque`): o
 * `paginaPublicaPorId` de verdade usa `unstable_cache`, que não roda fora do Next.
 * O teto é o de verdade (sem Upstash, o `checkRateLimit` cai no balde em memória):
 * cada teste usa um IP próprio do bloco de documentação (RFC 5737).
 */

const ROTA = "https://www.girumo.com.br/api/p/bio/toque";
const GENTE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
/** uuid válido que não é botão da página. */
const OUTRO = "f0e1d2c3-b4a5-4968-8776-655443322110";

/** O corpo que o `sendBeacon` da página manda (script.ts): 87 bytes. */
const beacon = (p: string, l: string) => `{"p":"${p}","l":"${l}"}`;

function cenario(busca: DadosRender | null | Error = dadosFalsos()) {
  const buscados: string[] = [];
  const contados: [string, string][] = [];
  const deps: DepsToque = {
    porId: async (id: string) => {
      buscados.push(id);
      if (busca instanceof Error) throw busca;
      return busca;
    },
    contar: async (paginaId: string, alvo: string) => {
      contados.push([paginaId, alvo]);
    },
  };
  return { deps, buscados, contados };
}

function pedido(corpo: string, i: { ip: string; ua?: string | null; headers?: Record<string, string> }): Request {
  const headers: Record<string, string> = {
    "content-type": "text/plain;charset=UTF-8",
    "x-forwarded-for": i.ip,
    ...i.headers,
  };
  if (i.ua !== null) headers["user-agent"] = i.ua ?? GENTE;
  return new Request(ROTA, { method: "POST", headers, body: corpo });
}

test("toque em cada tipo de botão da página: 204 sem corpo, conta uma vez (página, link)", async () => {
  for (const link of [IDS.whatsapp, IDS.catalogo, IDS.grupo, IDS.endereco, IDS.canal]) {
    const { deps, buscados, contados } = cenario();
    const res = await responderToque(pedido(beacon(IDS.pagina, link), { ip: "203.0.113.70" }), deps);
    assert.equal(res.status, 204, link);
    assert.equal(await res.text(), "", link);
    assert.deepEqual(buscados, [IDS.pagina], link);
    assert.deepEqual(contados, [[IDS.pagina, link]], link);
  }
});

test("corpo: até 256 bytes lidos conta, 257 não, diga o Content-Length o que disser", async (t) => {
  t.mock.method(console, "warn", () => {});
  const valido = beacon(IDS.pagina, IDS.whatsapp); // espaço depois do JSON continua JSON válido
  const casos: [string, Record<string, string>, number][] = [
    [valido + " ".repeat(256 - valido.length), { "content-length": "99999" }, 1],
    [valido + " ".repeat(257 - valido.length), { "content-length": "10" }, 0],
  ];
  for (const [corpo, headers, esperado] of casos) {
    const { deps, buscados, contados } = cenario();
    const res = await responderToque(pedido(corpo, { ip: "203.0.113.71", headers }), deps);
    assert.equal(res.status, 204);
    assert.equal(contados.length, esperado, `${Buffer.byteLength(corpo)} bytes`);
    if (!esperado) assert.deepEqual(buscados, [], "consultou a página de um corpo recusado");
  }
});

test("corpo sem fim: para de ler logo depois do teto e responde 204", async (t) => {
  t.mock.method(console, "warn", () => {});
  let puxadas = 0;
  const pedaco = new TextEncoder().encode(" ".repeat(64));
  const semFim = new ReadableStream<Uint8Array>({
    pull(controle) {
      puxadas += 1;
      controle.enqueue(pedaco);
    },
  });
  // `duplex` é exigido pelo undici para corpo em stream e não existe no RequestInit do lib.dom.
  const req = new Request(ROTA, {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.72", "user-agent": GENTE },
    body: semFim,
    duplex: "half",
  } as RequestInit);
  const { deps, contados } = cenario();
  const res = await responderToque(req, deps);
  assert.equal(res.status, 204);
  assert.ok(puxadas <= 8, `leu ${puxadas} pedaços de 64 bytes`);
  assert.deepEqual(contados, []);
});

test("JSON ruim e ids fora do formato: 204 sem consultar a página nem contar, com o motivo no log", async (t) => {
  const avisos = t.mock.method(console, "warn", () => {});
  const casos = [
    "",
    "oi",
    "null",
    "[]",
    '{"p":1,"l":2}',
    `{"p":"${IDS.pagina}"}`,
    beacon(IDS.pagina.toUpperCase(), IDS.whatsapp),
    beacon(IDS.pagina, IDS.whatsapp.toUpperCase()),
    // O alvo da visita: o check de bio_contagens aceita 'visita', e o toque não pode somar visita.
    beacon(IDS.pagina, "visita"),
    beacon(IDS.pagina, IDS.whatsapp.replaceAll("-", "")),
    beacon(` ${IDS.pagina}`, IDS.whatsapp),
  ];
  for (const corpo of casos) {
    const { deps, buscados, contados } = cenario();
    const res = await responderToque(pedido(corpo, { ip: "203.0.113.73" }), deps);
    assert.equal(res.status, 204, corpo);
    assert.deepEqual([...buscados, ...contados], [], corpo);
  }
  assert.equal(avisos.mock.callCount(), casos.length, "recusa sem log");
});

test("página não publicada, bloqueada ou inexistente (o cache devolve null): 204 sem contar", async (t) => {
  t.mock.method(console, "warn", () => {});
  const { deps, buscados, contados } = cenario(null);
  const res = await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.74" }), deps);
  assert.equal(res.status, 204);
  assert.deepEqual(buscados, [IDS.pagina]);
  assert.deepEqual(contados, []);
});

test("link que a página não mostra: escondido, desligado, sem link mestre ou de outra página", async (t) => {
  t.mock.method(console, "warn", () => {});
  const d = dadosFalsos();
  const desligado: DadosRender = {
    ...d,
    documento: { ...d.documento, links: d.documento.links.map((l) => (l.id === IDS.canal ? { ...l, ativo: false } : l)) },
  };
  const casos: [DadosRender, string][] = [
    [{ ...d, linksEscondidos: [IDS.whatsapp] }, IDS.whatsapp], // número que virou conectado
    [desligado, IDS.canal],
    [{ ...d, campanhas: {} }, IDS.grupo], // campanha apagada ou sem link mestre
    [d, OUTRO],
  ];
  for (const [dados, link] of casos) {
    const { deps, contados } = cenario(dados);
    const res = await responderToque(pedido(beacon(IDS.pagina, link), { ip: "203.0.113.75" }), deps);
    assert.equal(res.status, 204, link);
    assert.deepEqual(contados, [], link);
  }
});

test("robô (prévia de link, navegador headless, sem user agent): 204 sem ler corpo nem página", async () => {
  for (const ua of ["facebookexternalhit/1.1", "Mozilla/5.0 HeadlessChrome/120.0", "WhatsApp/2.23.20.0", null]) {
    const { deps, buscados, contados } = cenario();
    const res = await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.76", ua }), deps);
    assert.equal(res.status, 204, String(ua));
    assert.deepEqual([...buscados, ...contados], [], String(ua));
  }
});

test("teto por IP e página: o 31º toque do minuto não conta; outro IP conta", async () => {
  const { deps, contados } = cenario();
  for (let i = 0; i < 31; i++) {
    const res = await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.77" }), deps);
    assert.equal(res.status, 204);
  }
  await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.78" }), deps);
  assert.equal(contados.length, 31);
});

test("cache ou banco fora do ar: 204 e o erro no log", async (t) => {
  const erros = t.mock.method(console, "error", () => {});
  const caiu = cenario(new Error("banco caiu"));
  const r1 = await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.79" }), caiu.deps);
  const naoContou = cenario();
  naoContou.deps.contar = async () => {
    throw new Error("rpc falhou");
  };
  const r2 = await responderToque(pedido(beacon(IDS.pagina, IDS.whatsapp), { ip: "203.0.113.79" }), naoContou.deps);
  assert.deepEqual([r1.status, r2.status], [204, 204]);
  assert.equal(erros.mock.callCount(), 2);
});

test("o beacon passa sem sessão nos dois hosts (/api/p/* é público)", () => {
  // Host do Girumo: a primeira entrada do matcher pula /api/p/ e o middleware nem roda.
  assert.equal(skipsFirstPartyMiddleware("/api/p/bio/toque"), true);
  // Domínio do lojista: o beacon sai pro mesmo host, e lá /api/p/* é "public-api".
  assert.equal(customHostRoute("/api/p/bio/toque"), "public-api");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/toque.test.ts`
Expected: FAIL — `Cannot find module './toque'`.

- [ ] **Step 3: Implement**

Em `src/lib/pages/analytics.ts`, mudar só a assinatura: `rota: "lead" | "track" | "outbound" | "bio-visita" | "bio-toque",`.

Criar `src/lib/bio/toque.ts`:

```ts
import "server-only";

import { paginaPublicaPorId } from "@/lib/bio/cache";
import { UUID_BIO } from "@/lib/bio/documento";
import { linksVisiveis } from "@/lib/bio/render/partes";
import { lerTextoComTeto } from "@/lib/bling/cliente";
import { isBotUserAgent, isRateLimited } from "@/lib/pages/analytics";
import { contarBio } from "@/lib/stores/bio-pages";

/**
 * `POST /api/p/bio/toque` — o beacon que o JS da página manda quando alguém toca
 * num botão do link da bio (spec link-da-bio §7). Público nos dois hosts: em host
 * do Girumo a primeira entrada do matcher pula `/api/p/`; no domínio do lojista,
 * `customHostRoute` devolve `"public-api"`.
 *
 * Responde 204 SEMPRE (página que não existe, link escondido, robô, teto, banco
 * fora do ar): um beacon que respondesse diferente viraria oráculo de ids. Por
 * isso toda recusa de corpo, de página e de link, e toda falha, vão pro log — a
 * lição do `/api/track/outbound`. Robô, beacon de outro site e teto são esperados
 * e ficam calados.
 *
 * Cache e banco entram por parâmetro para o teste trocá-los sem rede (o desenho
 * do `responderBio`): o `paginaPublicaPorId` usa `unstable_cache`, que só roda
 * dentro do Next.
 */
const DEPS = { porId: paginaPublicaPorId, contar: contarBio };
export type DepsToque = typeof DEPS;

/** O beacon tem 87 bytes. Medido no que foi lido: o `Content-Length` nem é olhado. */
const TETO_DO_CORPO = 256;
/** O beacon tem 87 B e chega de uma vez: corpo que não fecha em 2 s não segura a função. */
const PRAZO_DO_CORPO_MS = 2_000;
/** O teto da visita e do `/api/p/track`: por IP e página, por minuto (spec §7). */
const TOQUES_POR_MINUTO = 30;

export async function responderToque(req: Request, deps: DepsToque = DEPS): Promise<Response> {
  try {
    if (isBotUserAgent(req.headers.get("user-agent"))) return semConteudo();
    // O beacon da página é sempre same-origin (URL relativa, no www e no domínio próprio). Sem o header
    // (WebView antigo), conta. O `Origin` não serve: o Origin pode vir null (política no-referrer,
    // documento em sandbox).
    const site = req.headers.get("sec-fetch-site");
    if (site !== null && site !== "same-origin") return semConteudo();
    const alvo = await lerAlvo(req);
    if (!alvo) return semConteudo();
    const dados = await deps.porId(alvo.pagina);
    if (!dados) {
      console.warn(`[bio/toque] ${alvo.pagina}: página não publicada, bloqueada ou inexistente`);
      return semConteudo();
    }
    // Só conta botão que a página mostra agora: a regra do renderizador (ativo,
    // fora de `linksEscondidos` e com destino válido).
    if (!linksVisiveis(dados).some((v) => v.link.id === alvo.link)) {
      console.warn(`[bio/toque] ${alvo.pagina}: o link ${alvo.link} não está na página publicada`);
      return semConteudo();
    }
    // ponytail: balde por IP+página (spec §7), só depois de achar a página — id inventado nem chega ao balde:
    // cada id novo custa 1 leitura no Supabase e 1 null no cache (300 s), como o GET /bio/<slug>, mais 1 warn.
    // Se a varredura aparecer no log: limite por IP no firewall da Vercel em /api/p/* e /bio/* (antes da função).
    if (await isRateLimited("bio-toque", req, TOQUES_POR_MINUTO, dados.paginaId)) return semConteudo();
    await deps.contar(dados.paginaId, alvo.link);
  } catch (e) {
    console.error("[bio/toque] toque não contado", e);
  }
  return semConteudo();
}

/** `{"p":<uuid da página>,"l":<uuid do link>}` em até 256 bytes. null = recusado: o motivo vai pro log, o corpo nunca. */
async function lerAlvo(req: Request): Promise<{ pagina: string; link: string } | null> {
  // O leitor do cliente do Bling: lê aos pedaços e para no teto, sem esperar o resto. O prazo aborta o
  // pipe, e a leitura pendente rejeita.
  const fluxo =
    req.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(), {
      signal: AbortSignal.timeout(PRAZO_DO_CORPO_MS),
    }) ?? null;
  const texto = await lerTextoComTeto(new Response(fluxo), TETO_DO_CORPO).catch(() => null);
  if (texto === null) return recusado("corpo passou de 256 bytes, demorou mais de 2 s ou caiu no meio");
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return recusado("corpo não é JSON");
  }
  const { p, l } = (typeof corpo === "object" && corpo !== null ? corpo : {}) as { p?: unknown; l?: unknown };
  // UUID_BIO: uuid minúsculo, o formato do check de `bio_contagens.alvo` — e sem o `'visita'`,
  // que o check aceita: o toque nunca pode somar visita.
  if (typeof p !== "string" || typeof l !== "string" || !UUID_BIO.test(p) || !UUID_BIO.test(l)) {
    return recusado("p e l precisam ser uuid em minúsculas");
  }
  return { pagina: p, link: l };
}

function recusado(motivo: string): null {
  console.warn(`[bio/toque] beacon recusado: ${motivo}`);
  return null;
}

function semConteudo(): Response {
  return new Response(null, { status: 204 });
}
```

Criar `src/app/api/p/bio/toque/route.ts`:

```ts
import { responderToque } from "@/lib/bio/toque";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/p/bio/toque — beacon do toque num botão do link da bio (ver responderToque).
export async function POST(req: Request) {
  return responderToque(req);
}
```

Não mexer em `host.ts`, `middleware.ts`, `csp.ts` nem `next.config.ts`. O último teste do Step 1 prova que o caminho já é público nos dois hosts.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/toque.test.ts src/lib/pages/analytics.test.ts src/lib/custom-domains/host.test.ts`
Expected: PASS — 10 testes em `toque`, mais os de `analytics` e `host`, sem falha.
Run: `npx tsc --noEmit --project tsconfig.json`
Expected: sem erro. O tsx não checa tipo: um `DepsToque` que não bate com o `paginaPublicaPorId` do PR 2 só aparece aqui.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bio/toque.ts src/lib/bio/toque.test.ts "src/app/api/p/bio/toque/route.ts" src/lib/pages/analytics.ts
git commit -m "feat(bio): POST /api/p/bio/toque counts a tap on a visible link, always 204"
```

---

### Task 2: O beacon no JS da página

**Files:**
- Modify: `apps/web/src/lib/bio/render/script.ts` (comentário e o array `JS`)
- Test: `apps/web/src/lib/bio/render/script.test.ts` (imports, `monta`, `elemento` e 5 testes no fim)

**Interfaces:**
- Consumes: o `script.ts` e o `script.test.ts` do PR 3a (harness `monta`/`elemento`, 6 testes); `renderPaginaBio` (PR 3a, `./index`); `IDS`, `dadosFalsos`, `dadosCheios` (PR 3a, `@/test/bio-dados-falsos`); a marcação do §9 (`<body data-pagina>`, `[data-link]`, o `<summary>` do endereço como filho direto do `<details>`, que é o `detalhesDoEndereco` de todos os modelos).
- Produces: a mesma assinatura do §9, `scriptDaPagina(o: { rastreio: … | null }): string`. O JS agora manda `navigator.sendBeacon("/api/p/bio/toque", JSON.stringify({ p, l }))` no clique de um `[data-link]`, depois do balanço e antes do status. Ver "Interface com os outros PRs", para o PR 7.

- [ ] **Step 1: Write the failing tests** — em `script.test.ts`:

Trocar o bloco de imports por:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { IDS, dadosCheios, dadosFalsos } from "@/test/bio-dados-falsos";
import { renderPaginaBio } from "./index";
import { scriptDaPagina } from "./script";
```

Trocar a função `monta` inteira por esta versão, que acrescenta o `body` e o `sendBeacon` e devolve `beacons`. As chamadas existentes `monta("ok")`, `monta("falha")` e `monta("sem")` continuam valendo:

```ts
/** Roda o script com um DOM falso: só o que ele usa (status, clique, pageshow, área de transferência, beacon). */
function monta(clipboard: "ok" | "falha" | "sem" = "ok", comBeacon = true) {
  const status = { textContent: "" };
  const ouvintes: Record<string, Ouvinte> = {};
  const copiados: string[] = [];
  const beacons: [string, string][] = [];
  const timers: (() => void)[] = [];
  const navegador: Record<string, unknown> = {};
  if (clipboard !== "sem") {
    navegador.clipboard = {
      writeText: (t: string) => {
        copiados.push(t);
        return clipboard === "ok" ? Promise.resolve() : Promise.reject(new Error("negado"));
      },
    };
  }
  if (comBeacon) {
    // `function` de propósito: o teste confere o `this`. No navegador, o sendBeacon
    // chamado fora do navigator (`var b = navigator.sendBeacon; b(…)`) dá "Illegal invocation".
    navegador.sendBeacon = function (this: unknown, url: string, corpo: string) {
      assert.equal(this, navegador, "sendBeacon chamado fora do navigator");
      beacons.push([url, corpo]);
      return true;
    };
  }
  const documento = {
    body: { getAttribute: (n: string) => (n === "data-pagina" ? IDS.pagina : null) },
    getElementById: (id: string) => (id === "lk-status" ? status : null),
    addEventListener: (tipo: string, fn: Ouvinte) => {
      ouvintes[tipo] = fn;
    },
  };
  new Function("document", "navigator", "addEventListener", "setTimeout", "clearTimeout", JS)(
    documento,
    navegador,
    (tipo: string, fn: Ouvinte) => {
      ouvintes[`janela:${tipo}`] = fn;
    },
    (fn: () => void) => timers.push(fn),
    () => undefined,
  );
  /** Roda os setTimeout pendentes (o relógio do teste). */
  const passa = () => timers.splice(0).forEach((fn) => fn());
  return { status, ouvintes, copiados, beacons, passa };
}
```

Trocar a função `elemento` por esta, que ganha a tag e o pai (o `<summary>` dentro do `<details>`):

```ts
function elemento(attrs: Record<string, string>, extra: { tagName?: string; parentNode?: { open: boolean } } = {}) {
  const classes = new Set<string>();
  const el = {
    textContent: "Copiar CNPJ",
    offsetWidth: 0,
    tagName: "A",
    getAttribute: (n: string) => (n in attrs ? attrs[n] : null),
    classList: { add: (c: string) => classes.add(c), remove: (c: string) => classes.delete(c) },
    closest: (): unknown => el,
    ...extra,
  };
  return { el, classes };
}
```

Acrescentar ao fim do arquivo:

```ts
/** O corpo que o servidor espera (toque.ts): `{"p":<página>,"l":<link>}`. */
const corpoDoToque = (l: string) => `{"p":"${IDS.pagina}","l":"${l}"}`;

test("toque num botão manda o beacon {p, l} pro /api/p/bio/toque, sem segurar a navegação", () => {
  const { ouvintes, beacons } = monta();
  let segurou = false;
  const { el } = elemento({ "data-link": IDS.whatsapp, "data-tipo": "whatsapp" });
  ouvintes.click({
    target: el,
    preventDefault: () => {
      segurou = true;
    },
  });
  assert.deepEqual(beacons, [["/api/p/bio/toque", corpoDoToque(IDS.whatsapp)]]);
  assert.equal(segurou, false, "preventDefault seguraria a ida pro WhatsApp");
});

test("endereço: o beacon sai quando o <details> abre, não quando fecha", () => {
  const { ouvintes, beacons } = monta();
  // No clique o `open` ainda é o de antes: o navegador só abre ou fecha depois dos ouvintes.
  const detalhes = { open: false };
  const { el } = elemento({ "data-link": IDS.endereco, "data-tipo": "endereco" }, { tagName: "SUMMARY", parentNode: detalhes });
  ouvintes.click({ target: el }); // abre
  detalhes.open = true;
  ouvintes.click({ target: el }); // fecha
  detalhes.open = false;
  ouvintes.click({ target: el }); // abre de novo
  assert.deepEqual(beacons, [
    ["/api/p/bio/toque", corpoDoToque(IDS.endereco)],
    ["/api/p/bio/toque", corpoDoToque(IDS.endereco)],
  ]);
});

test("Copiar CNPJ e clique fora de botão não mandam beacon", () => {
  const { ouvintes, beacons } = monta();
  ouvintes.click({ target: elemento({ "data-copiar": "11222333000181" }).el });
  ouvintes.click({ target: { closest: () => null } });
  assert.deepEqual(beacons, []);
});

test("navegador sem sendBeacon: o toque segue igual (status e balanço), sem erro", () => {
  const { status, ouvintes } = monta("ok", false);
  const { el, classes } = elemento({ "data-link": IDS.whatsapp, "data-tipo": "whatsapp" });
  ouvintes.click({ target: el });
  assert.equal(status.textContent, "Abrindo o WhatsApp…");
  assert.ok(classes.has("lk-toque"));
});

test("o <script> da página tem o beacon e nenhum texto ou id do lojista: é o mesmo JS pra qualquer loja", () => {
  assert.match(JS, /navigator\.sendBeacon\("\/api\/p\/bio\/toque",/);
  for (const d of [dadosFalsos(), dadosCheios()]) {
    const html = renderPaginaBio(d, { modo: "publica", nonce: null, animarEntrada: false });
    assert.equal(html.match(/<script>([\s\S]*?)<\/script>/)?.[1], JS);
    for (const texto of [d.paginaId, d.documento.perfil.nome, ...d.documento.links.flatMap((l) => [l.id, l.titulo])]) {
      assert.ok(!JS.includes(texto), texto);
    }
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/script.test.ts`
Expected: FAIL em 3 testes: os dois que esperam beacon ("toque num botão…" e "endereço…", com `beacons` vazio) e o do `<script>`, na regex do `sendBeacon`. Passam os 6 do PR 3a, o "Copiar CNPJ e clique fora…" e o "navegador sem sendBeacon…". Esses dois últimos já passam hoje e ficam como guarda de regressão.

- [ ] **Step 3: Implement** — em `src/lib/bio/render/script.ts`, trocar o comentário do topo e o array `JS`. A função `scriptDaPagina` fica como está:

```ts
/**
 * O JS inline da página do link da bio, devolvido sem a tag (o `index.ts` o
 * embrulha em `<script nonce>`). Nenhum texto do lojista entra aqui: o script
 * só lê `data-*` que o renderizador emite (uuid da página e do link, tipo de
 * lista fechada, CNPJ sem pontuação, só [0-9A-Z]). PR 3a: "Abrindo…" no `#lk-status`, balanço do
 * toque e "Copiado". PR 4b: o beacon do toque (`POST /api/p/bio/toque`, corpo
 * `{"p":<página>,"l":<link>}` em text/plain, sem preflight); no `<summary>` do
 * endereço, só quando abre. PR 7: o Pixel e o GA4 a partir de `rastreio`.
 */
const JS = [
  "(function(){",
  'var d=document,s=d.getElementById("lk-status"),t=0,',
  'M={whatsapp:"Abrindo o WhatsApp…",grupo:"Abrindo o grupo…",link:"Abrindo…"};',
  'function diz(x){if(!s)return;s.textContent=x;clearTimeout(t);if(x)t=setTimeout(function(){s.textContent=""},3000)}',
  'd.addEventListener("click",function(e){',
  'var a=e.target&&e.target.closest?e.target.closest("[data-link],[data-copiar]"):null;if(!a)return;',
  'var c=a.getAttribute("data-copiar");',
  "if(c!==null){var n=navigator.clipboard;if(n&&n.writeText)n.writeText(c).then(function(){",
  'a.textContent="Copiado";diz("CNPJ copiado.");setTimeout(function(){a.textContent="Copiar CNPJ"},2200)},function(){});return}',
  'a.classList.remove("lk-toque");void a.offsetWidth;a.classList.add("lk-toque");',
  'setTimeout(function(){a.classList.remove("lk-toque")},1600);',
  // Beacon (PR 4b). No clique o `open` do <details> ainda é o de antes: aberto = este toque fecha, não conta.
  // Sempre `navigator.sendBeacon(…)`: a função solta (`var b=navigator.sendBeacon`) dá "Illegal invocation".
  'var p=d.body.getAttribute("data-pagina");',
  'if(p&&navigator.sendBeacon&&(a.tagName!=="SUMMARY"||!a.parentNode.open))navigator.sendBeacon("/api/p/bio/toque",JSON.stringify({p:p,l:a.getAttribute("data-link")}));',
  'var k=a.getAttribute("data-tipo");if(k&&M.hasOwnProperty(k))diz(M[k])});',
  'addEventListener("pageshow",function(){diz("")})',
  "})();",
].join("");
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/render/script.test.ts src/lib/bio/render/index.test.ts`
Expected: PASS — 11 testes em `script` (o de 3 KB continua passando: o JS tem 1112 bytes) e os de `index` sem mudança.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bio/render/script.ts src/lib/bio/render/script.test.ts
git commit -m "feat(bio): page script sends the tap beacon, the address only when it opens"
```

---

### Task 3: e2e do toque, contra o dev

A loja e a página fixas do 4a ganham dois botões de id fixo: um link para fora e o "Como chegar". O teste de API prova a rota, o cache, o store e a RPC nos dois hosts. O teste do navegador prova o que o DOM falso da Task 2 não prova: o script roda sob a CSP real da página, o `connect-src 'self'` deixa o beacon sair, o `open` do `<details>` funciona como o teste supõe e a navegação segue. Outro run (o CI de outro PR) pode usar a mesma página ao mesmo tempo, por isso as contagens são "pelo menos". Contagem de visita só aumenta, então isso não atrapalha o teste de visita do 4a.

**Files:**
- Modify: `apps/web/e2e/link-da-bio-publica.spec.ts`

**Interfaces:**
- Consumes: a loja fixa do 4a (`banco`, `lojaId`, `paginaId`, `SLUG_ATUAL`, `GENTE`, `DOMINIO`, `visitas()`, o `beforeAll`); `documentoPadrao` e `type DocumentoBio` (PR 2); a rota da Task 1 e o script da Task 2.
- Produces: a página fixa do e2e com dois botões, `LINK` e `ENDERECO`. Quem mexer na fixture daqui em diante mantém esses dois ou ajusta estes testes.

- [ ] **Step 1: Edit the spec**

1. Import: `import { documentoPadrao, type DocumentoBio } from "../src/lib/bio/documento";`

2. Depois da constante `ROBO`:

```ts
/** Botões da página fixa, alvos do toque (uuid minúsculo e fixo: o contador é por id). */
const LINK = "e2eb10b0-0000-4000-8000-000000000001";
const ENDERECO = "e2eb10b0-0000-4000-8000-000000000002";
/** uuid válido que nunca é botão da página: o toque nele não pode contar. */
const FORA = "e2eb10b0-0000-4000-8000-0000000000ff";
```

3. Trocar a função `visitas()` por:

```ts
  /** Total de todos os dias do contador (visita ou id de um botão). Outro run em paralelo também soma: "pelo menos". */
  async function contagem(alvo: string): Promise<number> {
    const { data, error } = await banco
      .from("bio_contagens")
      .select("total")
      .eq("tenant_id", lojaId)
      .eq("pagina_id", paginaId)
      .eq("alvo", alvo);
    if (error) throw new Error(`leitura do contador ${alvo}: ${error.message}`);
    return ((data ?? []) as { total: number }[]).reduce((soma, linha) => soma + linha.total, 0);
  }
  const visitas = () => contagem("visita");
```

4. No `beforeAll`, trocar `const documento = documentoPadrao({ nome: NOME, campanhaId: null });` por:

```ts
    const documento: DocumentoBio = {
      ...documentoPadrao({ nome: NOME, campanhaId: null }),
      // Dois botões fixos para o toque (PR 4b): um link pra fora e o "Como chegar".
      links: [
        { id: LINK, tipo: "link", titulo: "Catálogo", sub: "", icone: "catalogo", ativo: true, destaque: false, url: "https://exemplo.com.br/catalogo", fotos: [] },
        { id: ENDERECO, tipo: "endereco", titulo: "Como chegar", sub: "", icone: "mapa", ativo: true, endereco: "Rua Exemplo, 100, Centro", horario: "", foto: null },
      ],
    };
```

5. Ao fim do `test.describe("link da bio: página pública", …)`:

```ts
  test("toque: o beacon de um botão conta no www e no domínio próprio; id que não é botão, não", async ({ request }) => {
    const antes = await contagem(LINK);
    const foraAntes = await contagem(FORA);
    const casos: [string, string, Record<string, string>][] = [
      [LINK, "host do Girumo", {}],
      [LINK, "domínio próprio", { host: DOMINIO }],
      [FORA, "id que não é botão", {}],
    ];
    for (const [alvo, nome, extra] of casos) {
      const res = await request.post("/api/p/bio/toque", {
        headers: { "content-type": "text/plain;charset=UTF-8", "user-agent": GENTE, ...extra },
        data: `{"p":"${paginaId}","l":"${alvo}"}`,
      });
      expect(res.status(), nome).toBe(204);
    }
    // A contagem acontece antes do 204: nada a esperar. Robô, teto e corpo ruim: toque.test.ts.
    expect(await contagem(LINK)).toBeGreaterThanOrEqual(antes + 2);
    expect(await contagem(FORA)).toBe(foraAntes);
  });

  test.describe("toque no navegador", () => {
    test.use({ userAgent: GENTE, contextOptions: { reducedMotion: "reduce" } });

    test("o JS manda o beacon sob a CSP da página, o endereço conta só ao abrir e o link navega", async ({ page }) => {
      // O link vai pra fora: a navegação termina aqui, sem sair pra internet.
      await page.route("https://exemplo.com.br/**", (rota) =>
        rota.fulfill({ status: 200, contentType: "text/plain", body: "fora" }),
      );
      // Anota cada beacon no próprio navegador e manda adiante (o envio de verdade segue).
      await page.addInitScript(() => {
        const janela = window as unknown as { __toques: string[] };
        janela.__toques = [];
        const enviar = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = (url, corpo) => {
          janela.__toques.push(String(corpo));
          return enviar(url, corpo);
        };
      });
      const anotados = () => page.evaluate(() => (window as unknown as { __toques: string[] }).__toques);

      await page.goto(`/bio/${SLUG_ATUAL}`);
      const endereco = page.locator(`summary[data-link="${ENDERECO}"]`);
      await endereco.click(); // abre: conta
      await endereco.click(); // fecha: não conta
      expect(await anotados()).toEqual([`{"p":"${paginaId}","l":"${ENDERECO}"}`]);

      const antes = await contagem(LINK);
      await page.locator(`a[data-link="${LINK}"]`).click();
      await page.waitForURL("https://exemplo.com.br/catalogo");
      // Chegou no contador: o connect-src 'self' deixou o beacon sair e a rota contou.
      await expect.poll(() => contagem(LINK), { timeout: 15_000 }).toBeGreaterThanOrEqual(antes + 1);
    });
  });
```

- [ ] **Step 2: Run the spec locally**

Pré-requisitos:
- `E2E_SUPABASE_URL`/`E2E_SUPABASE_SERVICE_ROLE_KEY` do **dev** no ambiente (sem elas o e2e roda só no CI).
- Nenhum e2e de outro PR em `pending` (`gh pr checks <N>`; ver o achado "corrida no banco dev").
- Nada escutando na porta 3000 além do dev server **deste** worktree (`Get-NetTCPConnection -LocalPort 3000 -State Listen` vazio, ou o servidor certo). Fora do CI o Playwright reaproveita o servidor que encontrar, e o do checkout principal roda o código errado.
- Um dev server que serviu `/bio/e2e-bio-atual` nos últimos 5 minutos guarda o documento antigo, sem os botões: reiniciar.

Run: `npx playwright test e2e/link-da-bio-publica.spec.ts`, duas vezes seguidas.
Expected: `10 passed` nas duas (8 do 4a e 2 novos). "skipped" não vale como prova: faltou a service role.

- [ ] **Step 3: Typecheck do e2e**

Run: `npx tsc --noEmit --project tsconfig.e2e.json`
Expected: sem erro. O `DocumentoBio` trava a forma dos dois botões.

- [ ] **Step 4: Commit**

```bash
git add e2e/link-da-bio-publica.spec.ts
git commit -m "test(e2e): link-in-bio tap beacon on both hosts and in the browser"
```

---

### Task 4: Fechamento (gate, PR, revisão de segurança, merge, prova, quadro)

- [ ] **Step 1: Gate local.** Na raiz do worktree, em PowerShell, rodar `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1`. Ele tem de terminar sem erro (testes, os dois `tsc`, lint, build). Se o disco encher (ENOSPC), deixar o CI validar.
- [ ] **Step 2: Defasagem.** Rodar `git fetch origin main; git log HEAD..origin/main --oneline`. Se vier vazio ou com poucos commits, seguir. Se vier mais que isso, rodar `git rebase origin/main` e repetir o Step 1.
- [ ] **Step 3: Push e PR**

```powershell
git push -u origin feat/bio-toque
gh pr create --base main --title "feat(bio): tap counting for the link-in-bio (link da bio 4b)" --body @'
Link da bio, PR 4b (docs/superpowers/specs/2026-10-19-link-da-bio-design.md §7, §9, §10):
- POST /api/p/bio/toque: corpo text/plain <= 256 B lidos (p e l em uuid minúsculo), página por paginaPublicaPorId, só conta link que a página mostra (linksVisiveis), robô fora, teto 30/min por IP+página (balde bio-toque), contarBio; 204 sempre
- script da página: sendBeacon no clique de [data-link] (no Como chegar, só ao abrir), sem preventDefault; JS com 1112 B
- /api/p/* já passa sem sessão nos dois hosts (matcher e customHostRoute): travado por teste, nada muda no middleware
- e2e: toque no www e no domínio próprio, id que não é botão não conta, beacon no navegador sob a CSP da bio

Prova pós-deploy: saída dos curl.exe e o select do bio_contagens colados aqui.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
```

- [ ] **Step 4: Revisão de segurança** (spec §10, obrigatória antes do merge): agente `Security Engineer` sobre `git diff origin/main...HEAD`, com atenção a:
  - 204 em todo caminho. Os ids não são segredo (estão no HTML), mas status e corpo não podem dizer se a página ou o link existem;
  - corpo limitado pelos bytes lidos (stream sem fim não prende a função);
  - só uuid em minúsculas, e nunca `'visita'`;
  - só conta link visível de página publicada, com o `tenant_id` saindo da página;
  - teto antes de gravar, com o IP só em hash na chave e nada de IP, user agent ou referer gravado;
  - log só com o motivo e os ids que passaram pela regex;
  - script sem texto do lojista e sem `preventDefault`.

  Corrigir CRITICAL/HIGH antes de seguir.
- [ ] **Step 5: CI.** Rodar `gh pr checks <N>`: tudo verde, e no log do job `e2e` o `link-da-bio-publica.spec.ts` com `10 passed` (não skipped). Se vier falha em cascata com 401/500 em specs de outros PRs, é corrida no banco dev: `gh run rerun <id> --failed`.
- [ ] **Step 6: Merge.** Rodar `gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo` (merge à mão, com o CI verde). Esperar o deploy: em `/admin/configuracoes`, o campo "Deploy" tem de mostrar o sha do merge ou um descendente.
- [ ] **Step 7: Prova pós-deploy** (PowerShell). O `isBotUserAgent` não pega `curl`, então a sonda usa UA de robô e não conta nada. O corpo vai num arquivo porque o PowerShell 5.1 tira as aspas de JSON passado para um exe:

```powershell
$f = Join-Path $env:TEMP "toque-robo.json"
[IO.File]::WriteAllText($f, '{"p":"00000000-0000-4000-8000-000000000000","l":"00000000-0000-4000-8000-000000000001"}')
curl.exe -s -o NUL -w "%{http_code}`n" -X POST -A "facebookexternalhit/1.1" -H "content-type: text/plain" --data-binary "@$f" "https://www.girumo.com.br/api/p/bio/toque"
$d = "https://<domínio de teste do 4a — o Igor indica>"
curl.exe -s -o NUL -w "%{http_code}`n" -X POST -A "facebookexternalhit/1.1" -H "content-type: text/plain" --data-binary "@$f" "$d/api/p/bio/toque"
```

Expected: `204` nas duas. Um `307`/`308` ou `404` quer dizer que o middleware ou um redirect pegou o beacon.

Contagem de verdade, na página de prova do 4a (`prova-bio`, loja de teste). O Igor pega os ids no SQL de prod:

```sql
select p.id as pagina, l->>'id' as link, l->>'tipo' as tipo
  from public.bio_pages p, jsonb_array_elements(p.documento->'links') l
 where p.tenant_id = '<tenant da loja de teste>';
```

Depois, um toque por curl com UA de gente, que conta de propósito porque é a loja de teste:

```powershell
$g = Join-Path $env:TEMP "toque-prova.json"
[IO.File]::WriteAllText($g, '{"p":"<pagina>","l":"<link do grupo>"}')
curl.exe -s -o NUL -w "%{http_code}`n" -X POST -A "Mozilla/5.0 (prova do PR 4b)" -H "content-type: text/plain" --data-binary "@$g" "https://www.girumo.com.br/api/p/bio/toque"
```

Por último, o Igor abre `https://www.girumo.com.br/bio/prova-bio` num celular de verdade e toca uma vez em "Entrar no grupo VIP". Conferir:

```sql
select dia, alvo, total from public.bio_contagens
 where tenant_id = '<tenant da loja de teste>' and alvo = '<link do grupo>'
 order by dia desc;
```

Expected: `204` no curl e, na linha de hoje, `total` ≥ 2 (o curl e o toque no celular). Se der 1, o beacon do celular não chegou: conferir bloqueador de anúncio e a CSP da página no aparelho. Colar tudo no PR.

- [ ] **Step 8: Quadro, grafo e encerramento.** O card continua em `em_construcao`. O Igor reescreve o blocker com o que faltar da série:

```sql
update public.board_features
   set blocker = 'Falta: <PRs que faltam, ex.: 5, 6a, 3b, 6b, 7>. Toque (beacon + POST /api/p/bio/toque) no ar desde o PR #<N>.'
 where key = 'link-da-bio';
```

Sugerir ao Igor (PowerShell): `rag insert "decisão: toque do link da bio = sendBeacon text/plain para /api/p/bio/toque; 204 sempre; conta só botão de linksVisiveis; 'Como chegar' conta só ao abrir; teto 30/min por IP+página (balde bio-toque); corpo lido com teto de 256 B (lerTextoComTeto)" --source decisao-2026-10-19-link-da-bio-pr4b`. Encerrar com "PRs que deixei abertos: nenhum".

---

## Critérios de aceite do PR

- `POST /api/p/bio/toque` responde 204 sem corpo em todo caminho: válido, corpo grande, JSON ruim, uuid fora do formato, página fora do ar, link que a página não mostra, robô, teto e falha de banco.
- Conta exatamente uma vez por beacon válido, com `contarBio(paginaId, linkId)`, e só para link de `linksVisiveis` de página publicada.
- Mais de 256 bytes lidos não conta nem consulta a página, e um corpo sem fim para de ser lido logo depois do teto.
- `"visita"` e uuid em maiúsculas são recusados antes de qualquer consulta.
- O 31º toque do minuto, do mesmo IP e na mesma página, não conta.
- No clique de `[data-link]`, o script chama `navigator.sendBeacon("/api/p/bio/toque", '{"p":…,"l":…}')` como método. No "Como chegar", só na abertura. Sem `preventDefault`. JS ≤ 3 KB (1112 B), sem `<`, igual para qualquer loja.
- `/api/p/bio/toque` passa sem sessão nos dois hosts: teste de unidade e e2e com `Host` de domínio próprio.
- 15 testes novos passando (`toque` 10, `script` 5), os 6 do `script` do 3a passando com o harness novo, suíte inteira verde e e2e com `10 passed`.
- Revisão de segurança sem CRITICAL/HIGH, CI verde, merge na mesma sessão, prova pós-deploy colada no PR e blocker reescrito.

## Comandos de verificação

```powershell
# em apps/web do worktree do PR
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/toque.test.ts src/lib/bio/render/script.test.ts src/lib/bio/render/index.test.ts src/lib/pages/analytics.test.ts src/lib/custom-domains/host.test.ts
npm test
npx tsc --noEmit --project tsconfig.json
npx tsc --noEmit --project tsconfig.e2e.json
npm run lint
npm run brand:check
npx playwright test e2e/link-da-bio-publica.spec.ts
# na raiz do worktree
powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1
```

No PR: `gh pr checks <N>`. Depois do deploy: os blocos do Step 7 da Task 4.

## Riscos e pontos de atenção

- **CGNAT conta a menos.** O teto de 30/min por IP+página é o mesmo da visita, como pede a spec. Numa loja com muito tráfego, várias pessoas atrás do mesmo IP de operadora somam no mesmo balde e alguns toques se perdem. O erro é para menos, nunca para mais.
- **Varredura de ids inventados.** Id de página inventado nem chega ao balde (a página é conferida antes do teto): cada id novo custa uma leitura no Supabase (consulta por PK) e uma entrada `null` no Data Cache por 300 s, como o `GET /bio/<slug>` com slug inventado, mais uma linha de `console.warn`, e não conta nada. Está marcado como `ponytail:` no código. Se a varredura aparecer no log, a saída é um limite por IP no firewall da Vercel em `/api/p/*` e `/bio/*`, que barra antes da função.
- **Inflação cross-site.** Beacon `text/plain` não tem preflight, então outro site poderia fazer o navegador dos visitantes dele inflar a contagem de uma loja. O `Sec-Fetch-Site` presente e diferente de `same-origin` fecha isso nos navegadores que mandam o header. Sobram o script fora do navegador, que manda os headers que quiser, e o navegador antigo sem o header, os dois dentro do teto por IP+página. A contagem é métrica, sem dinheiro nem permissão envolvidos.
- **Cache de 5 min.** Um link escondido ou uma página despublicada por SQL continua aceitando toque até o cache virar. O que é salvo pelo painel invalida na hora (`invalidarBio`).
- **WebKit não roda no CI.** O e2e é só Chromium. A suposição de que o `open` do `<details>` ainda tem o valor antigo durante o clique vale pela especificação do HTML, e quem confere no iPhone é a prova do §13 (abrir e fechar o "Como chegar" e olhar o contador).
- **`curl` conta toque em produção.** O `isBotUserAgent` não reconhece `curl`. Em loja de cliente, sondar sempre com `-A "facebookexternalhit/1.1"`. UA de gente, só na loja de teste.
- **Bloqueador de anúncio** pode barrar o beacon. O caminho `/api/p/bio/toque` não tem `track`, `beacon` nem `collect`, os padrões das listas mais comuns. Mesmo assim, a contagem é sempre "pelo menos".
- **`lerTextoComTeto` mora em `lib/bling/cliente.ts`.** Se um dia for movido, ou se o módulo ganhar `server-only` ou dependência pesada, ajustar o import em `toque.ts`. O teste "corpo sem fim" pega se a troca passar a ler o corpo inteiro.
- **e2e local.** O Playwright reaproveita o servidor que estiver na porta 3000, e um dev server com 5 minutos de cache serve a fixture velha, sem os botões. O Step 2 da Task 3 cobre os dois casos. No CI o servidor nasce limpo.
- **Ordem.** Este PR pede o 4a inteiro em `main`, porque o e2e usa o `DOMINIO` da Parte 2. O PR 7 depende deste (eventos no mesmo ramo do script).

## Interface com os outros PRs

### O que este PR exporta

```ts
// apps/web/src/lib/bio/toque.ts (server-only) — nomes novos, acrescentados ao §9
export type DepsToque = {
  porId: (id: string) => Promise<DadosRender | null>;          // = typeof paginaPublicaPorId
  contar: (paginaId: string, alvo: string) => Promise<void>;    // = typeof contarBio
};
export function responderToque(req: Request, deps?: DepsToque): Promise<Response>; // 204 sempre, sem corpo

// apps/web/src/app/api/p/bio/toque/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function POST(req: Request): Promise<Response>;

// apps/web/src/lib/pages/analytics.ts — "bio-toque" acrescentado
export function isRateLimited(
  rota: "lead" | "track" | "outbound" | "bio-visita" | "bio-toque",
  req: Request,
  max: number,
  slug?: string,
  limitar?: typeof checkRateLimit,
): Promise<boolean>;

// apps/web/src/lib/bio/render/script.ts — assinatura do §9 sem mudança; o JS ganhou o beacon
export function scriptDaPagina(o: { rastreio: { metaPixelId: string; ga4Id: string } | null }): string;
```

**Contrato HTTP:** `POST /api/p/bio/toque`, corpo `text/plain` de até 256 B, `{"p":"<uuid da página>","l":"<uuid do link>"}` com uuid minúsculo. A resposta é `204` sem corpo, sempre. Público em `www` e no domínio próprio, sem sessão. Conta em `bio_contagens` com `alvo` = id do link, e o PR 5 (`relatorioBio`) lê isso em `toques`/`porLink`.

**Contrato do script, para o PR 7:**
- No ramo do `[data-link]`, a ordem é: balanço (`lk-toque`), depois o beacon, depois o `#lk-status` (`var k=` com o `data-tipo`).
- O PR 7 põe o Pixel/GA4 nesse mesmo ramo, depois do beacon, lendo `k`.
- Se quiser no `BioToque` o mesmo critério do endereço (contar só ao abrir), basta repetir `a.tagName!=="SUMMARY"||!a.parentNode.open`.
- O orçamento de 3 KB vale para o JS inteiro, que hoje tem 1112 B.

**Fixture do e2e:** a página fixa de `link-da-bio-publica.spec.ts` agora tem dois botões, `LINK` (`e2eb10b0-0000-4000-8000-000000000001`, tipo `link` para `https://exemplo.com.br/catalogo`) e `ENDERECO` (`e2eb10b0-0000-4000-8000-000000000002`). O helper `contagem(alvo)` substitui `visitas()`, que continua existindo como `() => contagem("visita")`.

### O que este PR usa

- **PR 1**: tabela `bio_contagens` (check de `alvo`: `'visita'` ou uuid minúsculo) e `bio_contar(p_pagina, p_alvo)`, chamada via `contarBio`.
- **PR 2**, `lib/bio/cache.ts`: `paginaPublicaPorId(id: string): Promise<DadosRender | null>` (só página publicada e não bloqueada).
- **PR 2**, `lib/stores/bio-pages.ts`: `contarBio(paginaId: string, alvo: string): Promise<void>`.
- **PR 2**, `lib/bio/documento.ts`: `UUID_BIO: RegExp` (uuid minúsculo, valida `p` e `l`); `type DadosRender`; `type DocumentoBio` e `documentoPadrao(i: { nome: string; campanhaId: string | null }): DocumentoBio` (esses dois só no e2e).
- **PR 3a**, `lib/bio/render/partes.ts`: `linksVisiveis(d: DadosRender): LinkVisivel[]`, com `LinkVisivel = { link: LinkBio; href: string; principal: boolean }`.
- **PR 3a**, `lib/bio/render/script.ts` e `script.test.ts`: o JS (906 B) e o harness `monta`/`elemento`.
- **PR 3a**, `lib/bio/render/index.ts`: `renderPaginaBio(d, { modo, nonce, animarEntrada })`.
- **PR 3a**, `src/test/bio-dados-falsos.ts`: `IDS`, `dadosFalsos()`, `dadosCheios()`.
- **PR 3a**, a marcação: `<body data-pagina>`, `[data-link][data-tipo]` e o `<summary>` filho direto do `<details>` (de `detalhesDoEndereco`).
- **PR 4a**:
  - CSP `"bio"` com `connect-src 'self'`; `surfaceForPath("/api/p/bio/toque") === null`, já travado no `csp.test.ts` do 4a.
  - `isRateLimited` com `"bio-visita"`.
  - O e2e `link-da-bio-publica.spec.ts`: loja fixa, `beforeAll`, `GENTE`, `SLUG_ATUAL`, `DOMINIO` (Parte 2), `visitas()`.
- **Já no repo**:
  - `lerTextoComTeto(res: Response, teto: number): Promise<string | null>` (`lib/bling/cliente.ts`).
  - `isBotUserAgent(ua: string | null): boolean` (`lib/pages/analytics.ts`).
  - `customHostRoute(pathname): CustomHostRoute` e `skipsFirstPartyMiddleware(pathname): boolean` (`lib/custom-domains/host.ts`).
  - `checkRateLimit` (`lib/security/rate-limit.ts`).
