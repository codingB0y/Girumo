# Link da bio — PR 5: API do painel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O editor do painel ganha a API que ele vai chamar: `GET`/`POST`/`PATCH /api/link-da-bio` (abrir, criar, salvar), `GET /api/link-da-bio/slug?valor=` (endereço livre?) e `GET /api/link-da-bio/relatorio?dias=7|30` (visitas e toques), com testes de rota.

**Architecture:** Três route handlers finos sobre o núcleo do PR 2 (documento, conferência, store, cache), mais um módulo `lib/bio/painel-api.ts` com o que as três repartem: sessão + loja (`getRouteTenantContext`, `campaign:edit` para escrever), as campanhas com o slug do link mestre, a sugestão de endereço livre, o motivo de um slug não servir e a janela do relatório. A vendedora para no guard de módulo do `getTenantContext` (rota fora do mapa = 403), sem nada novo em `lib/auth/modulos.ts`. Os testes rodam as rotas de verdade contra um PostgREST de mentira que entende filtros, objeto único, insert, update e o gatilho de `bio_slugs`.

**Tech Stack:** Next 15 App Router (route handlers), Supabase service-role (PostgREST + `rpc`), zod 4, `node:test` via tsx, Playwright (job e2e do CI).

**Spec:** `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` — §8 (permissões, primeira vez, 409), §9 (contratos e o bloco "API do painel"), §10 (segurança, rotas do painel), §12 linha 5.

**Depende de:** PR 1 (tabelas e `bio_relatorio` nos dois bancos) e PR 2 (`documento.ts`, `conferir.ts`, `bio-pages.ts`, `cache.ts`) em `main`. Não depende de 3a/3b/4a/4b. Quem depende deste: 6a (GET/POST/PATCH e os tipos) e 6b (slug, relatório, `dominio`/`origemGirumo`). Índice: `docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md`.

## Tamanho

Um PR, 8 arquivos (7 novos, 1 alterado — tabela "Arquivos"). Branch `feat/link-da-bio-pr5-api-painel`, de `origin/main` **depois** do PR 2 mergeado. Nenhuma DDL, nenhuma página nova do painel (nada em `e2e/conteudo-esperado.ts`).

## Decisões deste plano

| Decisão | Por quê | Custo se estiver errada |
|---|---|---|
| **`GET`, `/slug` e `/relatorio` sem `assertPermission`**; `POST` e `PATCH` com `campaign:edit` | Spec §8: "Quem edita: owner, admin, operator (`campaign:edit`)" e "Vendedora não vê (guarda de módulo fechada por padrão)". Ler segue `GET /api/campanhas`, `GET /api/dominio` e `GET /api/settings`, que só resolvem a loja. Quem o guard deixa passar é exatamente dono, administração e operação (`PAPEIS_LIVRES`); papel desconhecido também cai fechado | Se um dia entrar um papel "só leitura" em `PAPEIS_LIVRES`, ele lê a página e o relatório — que é o esperado de leitura |
| **A vendedora é barrada sem tocar em `lib/auth/modulos.ts`** | `getTenantContext` responde 403 `MENSAGEM_BLOQUEIO` para `seller` em rota fora de `ROTAS`; rota nova já nasce fechada. As tabelas `bio_*` não têm policy nem grant para `authenticated` (PR 1), então o token dela também não lê pelo PostgREST (achado "RLS não filtra papel") | Nenhum |
| **`slug` da campanha = `linksMestresDasCampanhas` do PR 2** (linha de `tracked_links` com `slug = campaign_groups.slug` e `campaign_group_id = campaign_groups.id`) | É o que faz `/r/<slug>` abrir (`lib/campaigns/master-link.ts`). É a mesma função que o `estadoDosLinks` usa: painel e página pública nunca discordam sobre qual campanha tem link. Busca pelos slugs (`listTrackedLinksBySlugs`, lotes de 100), sem o corte calado de 1000 linhas do `listTrackedLinks` | Nenhum: uma implementação só |
| **"A primeira campanha com link mestre" (POST) é a primeira de `listCampaignGroups`** — a mais recente | É a ordem do store e da lista de campanhas do painel | Loja com várias campanhas nasce com o botão na mais nova; troca-se na aba Links |
| **O PATCH lê a página antes de salvar** (`lerPaginaDaLoja`) | Única fonte do slug antigo para `invalidarBio` (o `salvarPaginaDaLoja` devolve só a nova). Se o UPDATE condicional por `versao` passar, o slug lido era o trocado; se outra aba salvou no meio, o UPDATE falha (409) e nada é invalidado | Uma leitura a mais por salvar |
| **`invalidarBio` em try/catch: falha vira log e o PATCH responde 200** | O salvar já está gravado. Um 500 aqui faria o painel achar que não salvou, e o próximo salvar daria 409 "versao" contra a própria gravação | Página pública com o conteúdo velho até o cache vencer (5 min, spec §6) |
| **Slug sem normalização no servidor** (nada de `trim`/`toLowerCase`) | O slug que grava é o que o painel mostrou; o painel normaliza ao digitar com o `SLUG_BIO` exportado pelo PR 2 (PR 6b). O mesmo `motivoDoSlug` vale no `PATCH` e no `/slug` | Cliente que mandar "Minha-Loja" recebe `formato` em vez de ter o slug corrigido |
| **Com página, `sugestaoSlug` = `pagina.slug`** | A sugestão só serve ao estado vazio ("Criar minha página"); com página não há o que consultar | Nenhum |
| **`POST` responde 201 também quando a página já existe** | Contrato do §9: "201 `PaginaBio` (idempotente)" | Nenhum para quem lê `res.ok` |
| **`/relatorio` aceita só `dias=7` ou `dias=30`, sem padrão**; "últimos N dias" = hoje e os N−1 anteriores, em Brasília | Contrato do §9; mesma conta do ritmo semanal (`lib/weekly-rhythm.ts`: `dayBRAgo(6..0)`) | Chamada sem `dias` dá 400 |
| **Erro de validação do documento: `error` = mensagem do `documentoBio` (zod do PR 2), `campo` relativo ao documento** ("links.2.numero"), no mesmo formato do `conferirDocumentoDaLoja` | Um formato só de `campo` para o painel focar o primeiro erro. As mensagens do PR 2 já são em português, escritas para o campo ("Escreva o texto do botão.") | Nenhum |
| **O nome da loja vai cru para o `documentoPadrao` e para o `sugerirSlug`** | O `documentoPadrao` do PR 2 já apara, corta `perfil.nome` em 60 sem partir emoji e troca vazio por "Minha loja"; o `slugify` corta o endereço em 40. Cortar aqui de novo seria uma segunda regra para o mesmo campo | Nenhum |
| **Teste de rota com PostgREST falso que entende `eq`/`neq`/`in`/`is`, objeto único, insert, update, o unique de loja e o gatilho de slug** | Prova o que a rota faz com o banco — inclusive o filtro de loja — sem amarrar o teste a como o PR 2 escreveu cada consulta. Responde aos pedidos da tabela "Os pedidos que cada uma faz" do plano do PR 2 (nenhum embed) e manda os 23505 com o texto do PR 1, que o PR 2 classifica pela mensagem. Conferido contra o supabase-js 2.108 (maybeSingle, single, insert+select, update+select, `in`, rpc) | Operador ou RPC que o falso não conhece estoura "falso: …": acrescentar ao falso, nunca afrouxar a asserção |
| **Invalidação provada montando o `workAsyncStorage` do Next no teste** | Fora de uma request, `revalidateTag` lança "static generation store missing"; dentro do contexto montado, as tags ficam em `pendingRevalidatedTags` e o teste vê slug novo e antigo | Interno do Next 15.5: numa atualização o teste quebra alto, nunca calado |

## Global Constraints

- Contrato do §9 (copiado): `GET /api/link-da-bio` → `{ pagina: PaginaBio | null, campanhas: [{ id, nome, slug | null }], dominio: string | null, origemGirumo: string /* getPublicSiteUrl() */, sugestaoSlug: string, linksEscondidos: string[] }`; `POST /api/link-da-bio` → 201 `PaginaBio` (idempotente); `PATCH /api/link-da-bio` body `{ versao, slug, publicada, documento }` → 200 `PaginaBio` · 400 `{ error, campo? }` · 404 `{ error }` (loja sem página) · 409 `{ error, motivo: "versao" | "slug" }`; `GET /api/link-da-bio/slug?valor=` → `{ disponivel: boolean, motivo?: "formato" | "reservado" | "em-uso" }` (`em-uso` inclui slug que já foi de outra loja); `GET /api/link-da-bio/relatorio?dias=7|30` → `RelatorioBio`.
- Ordem do PATCH (§9): `documentoBio` e slug (formato, `slugReservado`) → `conferirDocumentoDaLoja` → `salvarPaginaDaLoja` → `invalidarBio` com o slug novo e o antigo.
- Slug (§2): 3–40, `^[a-z0-9]+(-[a-z0-9]+)*$` — o `SLUG_BIO` do PR 2 (`/^(?=.{3,40}$)[a-z0-9]+(-[a-z0-9]+)*$/`) já confere os dois; reservados `_dominio`, `admin`, `api`, `bio`, `girumo`, `painel`, `login`, `ajuda`, `suporte` e qualquer slug que contenha `girumo` ou `hubflow` (`slugReservado`, PR 2). Sugestão inicial = `slugify(nome da loja)` de `lib/pages/slug.ts`.
- `perfil.nome` 1–60, padrão `organizations.name` (§4). Primeira vez (§8): modelo `etiqueta`, paleta `azul`, nome da loja, slug sugerido livre, um link "Entrar no grupo VIP" se a loja tiver campanha com link mestre, `publicada = false` — tudo isso é o `documentoPadrao` do PR 2.
- 409 "versao": texto do §8 — "Outra pessoa salvou antes. Recarregue pra ver a versão nova."
- `origemGirumo` = `getPublicSiteUrl()` (`lib/brand.ts`), nunca `Host`/`Origin` da request (§2). `dominio` = hostname do domínio próprio **ativo** (`custom_domains.status = "active"`), sem esquema.
- Relatório: `dayBRAgo`/`dayBR` de `lib/date-br.ts` (§7); agregado no SQL (`bio_relatorio`), nunca linha crua no app.
- Autorização (§10): `getRouteTenantContext(req, { allowEngine: false })` em todo handler; `assertPermission(role, "campaign:edit")` no `POST` e no `PATCH`. O corpo nunca escolhe a loja (`z.strictObject` recusa `tenant_id`).
- Toda query em tabela com `tenant_id` filtra `.eq("tenant_id", …)` (CLAUDE.md, "Isolamento multi-tenant"); `organizations` por `.eq("id", tenantId)`; `bio_slugs` (sem `tenant_id`) só por slug.
- Rotas: JSON puro, erro `{ error }`, sem envelope; PATCH, nunca PUT; `export const runtime = "nodejs"; export const dynamic = "force-dynamic"`; `cache-control: no-store` em toda resposta da rota; erro que não é `Response` → 500 com `console.error` e sem mensagem do banco. Os 401/403 de sessão, de loja e da vendedora saem como os helpers lançam (texto), igual a todo o painel.
- Sem DDL, sem fallback JSON (`USE_SUPABASE` é o padrão; as tabelas `bio_*` só existem no Supabase, como `ad_spend` na rota de gasto).
- Dados fictícios em teste e exemplo (repo público): nada de foto, nome ou CNPJ da loja-piloto.
- Testes: `node:test` + `node:assert/strict`; em `apps/web`, `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. Gate antes do push: `infra/scripts/verify-local.ps1` (inclui os dois `tsc` e o build). PowerShell 5.1: sem `&&`.
- Revisão de segurança obrigatória antes do merge (spec §10). Commits em inglês com prefixo semântico.

## Review Focus

- **Nome da loja com mais de 60 caracteres, ou emoji bem no corte** (`organizations.name` vai até 80): o "Criar minha página" não pode dar 500 do `jsonb` por meio emoji, nem recusar o nome. O corte é do `documentoPadrao` (PR 2); aqui se prova que a rota entrega o nome cru e a página nasce. Coberto: "POST com nome de 80 caracteres e emoji no corte: cria" (Task 2).
- **Loja chamada "Girumo …", "Hubflow …" ou "Admin"**: a sugestão de endereço nunca pode ser reservada — senão o primeiro salvar volta 400 num endereço que o próprio sistema escolheu. Coberto: `motivoDoSlug` (Task 1) e "GET: nome com girumo sugere raiz loja; endereço ocupado ganha sufixo" (Task 2).
- **Dois toques em "Criar minha página"** (rede lenta, duplo clique): uma página só, as duas respostas com o mesmo id. Coberto: "POST: dois cliques ao mesmo tempo dão a mesma página" (Task 2).
- **Salvar com versão velha depois que outra aba trocou o endereço**: 409 sem gravar e sem invalidar o cache (o 301 do slug antigo não pode virar laço). Coberto: "PATCH com versão velha: 409 versao, nada muda e o cache não é tocado" (Task 3).
- **Endereço digitado com maiúscula, espaço, acento ou 41 letras**: 400 com `campo: "slug"`, nunca o 500 do `check` do banco. Coberto: "PATCH recusa corpo fora do formato…" (Task 3) e "slug: formato e reservado respondem sem consultar o banco" (Task 4).

---

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/src/lib/bio/painel-api.ts` (+ `.test.ts`) | tipos das respostas; `motivoDoSlug`, `periodoDoRelatorio` (puros); `resposta`, `lojaDoPainel`, `campanhasDaLoja`, `sugerirSlug` (servidor) |
| `apps/web/src/app/api/link-da-bio/route.ts` | `GET` (estado do editor), `POST` (criar, idempotente), `PATCH` (salvar) |
| `apps/web/src/app/api/link-da-bio/slug/route.ts` | `GET ?valor=` (endereço livre?) |
| `apps/web/src/app/api/link-da-bio/relatorio/route.ts` | `GET ?dias=7\|30` |
| `apps/web/src/app/api/link-da-bio/route.test.ts` | as três rotas contra o PostgREST falso |
| `apps/web/e2e/link-da-bio-api.spec.ts` | o dono lê pela API contra o banco de dev de verdade (só leitura) |
| `apps/web/e2e/vendas-vendedora.spec.ts` (alterado) | a vendedora recebe 403 nas cinco chamadas |

São 8 arquivos: 7 novos, 1 alterado.

---

## Passo 0 — antes de tudo

Na raiz do checkout principal (CLAUDE.md, "Regra de PR"):

```bash
git fetch origin main
git log origin/main --oneline -80 -i --grep "bio"
```

Expected: aparecem os commits do PR 1 (banco) e do PR 2 (núcleo). Sem eles, **parar**: este PR importa `documento.ts`, `conferir.ts`, `bio-pages.ts` e `cache.ts`.

```bash
git worktree add -b feat/link-da-bio-pr5-api-painel .claude/worktrees/link-da-bio-pr5 origin/main
```

No worktree novo: `node_modules` por junction (ver "Ambiente do worktree" no índice). Os comandos de teste abaixo rodam em `apps/web` do worktree novo; os de git, na raiz dele (`git -C <worktree>` se o cwd resetar).

Conferir os nomes do §9 que este plano consome (cada linha tem de aparecer):

```bash
git grep -n -E "export (const|function|type) (documentoBio|documentoPadrao|SLUG_BIO|slugReservado|DocumentoBio|LinkBio)\b" -- apps/web/src/lib/bio/documento.ts
git grep -n -E "export (async )?function (conferirDocumentoDaLoja|estadoDosLinks|linksMestresDasCampanhas)\b" -- apps/web/src/lib/bio/conferir.ts
git grep -n -E "export async function listTrackedLinksBySlugs\b" -- apps/web/src/lib/stores/tracked-links.ts
git grep -n -E "export (async )?function (lerPaginaDaLoja|criarPaginaDaLoja|salvarPaginaDaLoja|slugDisponivel|relatorioBio)\b|export type (PaginaBio|RelatorioBio)\b" -- apps/web/src/lib/stores/bio-pages.ts
git grep -n -E "export function invalidarBio\b|bio-slug:|bio-loja:|bio-pagina:" -- apps/web/src/lib/bio/cache.ts
```

Se um nome mudou no caminho, usar o de `main` e anotar no corpo do PR.

O PostgREST falso da Task 2 responde aos pedidos da tabela "Os pedidos que cada uma faz" do plano do PR 2 (`2026-10-19-link-da-bio-pr2-nucleo.md`, "Interface com os outros PRs"). Conferir no código de `main` (`apps/web/src/lib/stores/bio-pages.ts`, `apps/web/src/lib/bio/conferir.ts`, `apps/web/src/lib/stores/tracked-links.ts`, `apps/web/src/lib/bio/cache.ts`) que continua assim:

1. Tabelas e RPCs: `bio_pages`, `bio_slugs`, `campaign_groups`, `tracked_links` (`select=slug,campaign_group_id&tenant_id=eq.<t>&slug=in.(…)`, em lotes de 100), `instances`, `uploads`, e `rpc/bio_relatorio` com `p_tenant`, `p_desde`, `p_ate`; mais `custom_domains` e `organizations`, que são deste PR.
2. Operadores: o falso entende `eq`, `neq`, `in`, `is.null`, `not.is.null`, `.single()`, `.maybeSingle()`, insert e update com `.select()`; nenhum embed. Outro operador (`.or`, `.ilike`…) → acrescentar ao `passa` do falso antes de seguir.
3. 23505 pelo texto: o PR 2 lê `bio_pages_tenant_id_key` (a loja já tem página), `bio_pages_slug_key` ou `bio_slugs` (slug tomado). O falso manda essas mensagens, com o texto do gatilho do PR 1 (`bio_slugs: o slug "<slug>" já foi de outra página`).
4. As tags do `invalidarBio`: o teste da Task 3 espera `bio-slug:<slug>`, `bio-loja:<tenantId>` e `bio-pagina:<id>` (spec §6; `tagDoSlug`, `tagDaLoja`, `tagDaPagina` no PR 2). O teste escreve as tags por extenso de propósito: importar `@/lib/bio/cache` no topo carregaria o Next antes da `AsyncLocalStorage` que o teste monta.

### Task 1: Regras puras do painel

**Files:**
- Create: `apps/web/src/lib/bio/painel-api.ts`
- Test: `apps/web/src/lib/bio/painel-api.test.ts`

**Interfaces:**
- Consumes: `SLUG_BIO: RegExp` (já com o 3–40), `slugReservado(slug: string): boolean`, `type DocumentoBio` de `@/lib/bio/documento` (PR 2); `type PaginaBio` de `@/lib/stores/bio-pages` (PR 2); `dayBR(d?: Date): string`, `dayBRAgo(daysAgo: number, now?: Date): string` de `@/lib/date-br`.
- Produces:
  - `type CampanhaDoPainel = { id: string; nome: string; slug: string | null }`
  - `type RespostaDoPainelBio = { pagina: PaginaBio | null; campanhas: CampanhaDoPainel[]; dominio: string | null; origemGirumo: string; sugestaoSlug: string; linksEscondidos: string[] }`
  - `type CorpoDoPatchBio = { versao: number; slug: string; publicada: boolean; documento: DocumentoBio }`
  - `type MotivoDoSlug = "formato" | "reservado" | "em-uso"`
  - `type RespostaDoSlug = { disponivel: true } | { disponivel: false; motivo: MotivoDoSlug }`
  - `type ErroDoPainelBio = { error: string; campo?: string; motivo?: "versao" | "slug" }`
  - `motivoDoSlug(slug: string): Exclude<MotivoDoSlug, "em-uso"> | null`
  - `periodoDoRelatorio(dias: string | null, agora?: Date): { desde: string; ate: string } | null`

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/bio/painel-api.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { motivoDoSlug, periodoDoRelatorio } from "./painel-api";

test("slug: formato e tamanho (3 a 40), reservado (lista do §2 e qualquer um com girumo ou hubflow)", () => {
  const formato = ["", "ab", "a".repeat(41), "a".repeat(10_000), "Minha-Loja", "minha loja", "atelie_ouro", "-atelie", "atelie-", "atelie--ouro", "ateliê"];
  for (const slug of formato) assert.equal(motivoDoSlug(slug), "formato", slug.slice(0, 20));
  for (const slug of ["admin", "api", "bio", "painel", "girumo", "loja-girumo", "hubflow-moda"]) {
    assert.equal(motivoDoSlug(slug), "reservado", slug);
  }
  for (const slug of ["abc", "atelie-ouro-prata", "a".repeat(40), "loja-2026"]) assert.equal(motivoDoSlug(slug), null, slug);
});

test("relatório: os últimos 7 ou 30 dias contando hoje, no fuso de Brasília; o resto é recusado", () => {
  // 02:00 UTC de 19/10 ainda é 18/10 em Brasília (UTC-3).
  const agora = new Date("2026-10-19T02:00:00Z");
  assert.deepEqual(periodoDoRelatorio("7", agora), { desde: "2026-10-12", ate: "2026-10-18" });
  assert.deepEqual(periodoDoRelatorio("30", agora), { desde: "2026-09-19", ate: "2026-10-18" });
  for (const dias of [null, "", "14", "7.0", " 7", "30d", "-7"]) assert.equal(periodoDoRelatorio(dias, agora), null, String(dias));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/painel-api.test.ts`
Expected: FAIL — `Cannot find module './painel-api'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/bio/painel-api.ts
import "server-only";

import { SLUG_BIO, slugReservado, type DocumentoBio } from "@/lib/bio/documento";
import { dayBR, dayBRAgo } from "@/lib/date-br";
import type { PaginaBio } from "@/lib/stores/bio-pages";

/**
 * O que as três rotas de `app/api/link-da-bio` repartem (spec 2026-10-19-link-da-bio §8–§10).
 * O painel (PR 6a/6b) importa daqui só os tipos, com `import type`: o `server-only` não vai junto.
 */

export type CampanhaDoPainel = { id: string; nome: string; slug: string | null };

/** Corpo de `GET /api/link-da-bio`. */
export type RespostaDoPainelBio = {
  pagina: PaginaBio | null;
  campanhas: CampanhaDoPainel[];
  /** Hostname do domínio próprio ATIVO, sem esquema; pendente não conta. */
  dominio: string | null;
  /** `getPublicSiteUrl()`: o painel monta `${origemGirumo}/bio/${slug}`, nunca com o Host da request. */
  origemGirumo: string;
  /** Sem página: endereço livre para o "Criar minha página". Com página: o slug dela. */
  sugestaoSlug: string;
  linksEscondidos: string[];
};

/** Corpo de `PATCH /api/link-da-bio`: a página inteira, nunca um pedaço. */
export type CorpoDoPatchBio = { versao: number; slug: string; publicada: boolean; documento: DocumentoBio };

export type MotivoDoSlug = "formato" | "reservado" | "em-uso";

/** Corpo de `GET /api/link-da-bio/slug?valor=`. */
export type RespostaDoSlug = { disponivel: true } | { disponivel: false; motivo: MotivoDoSlug };

/** Erro das três rotas. Os 401/403 de sessão, de loja e da vendedora saem em texto, como em todo o painel. */
export type ErroDoPainelBio = { error: string; campo?: string; motivo?: "versao" | "slug" };

/** Por que o slug não serve, ou `null`. `em-uso` só o banco sabe (`slugDisponivel`). */
export function motivoDoSlug(slug: string): Exclude<MotivoDoSlug, "em-uso"> | null {
  // O `SLUG_BIO` do PR 2 já confere o tamanho (3–40, como o check do banco) junto com o formato.
  if (!SLUG_BIO.test(slug)) return "formato";
  return slugReservado(slug) ? "reservado" : null;
}

/** `?dias=7|30` → os últimos N dias contando hoje, em Brasília (spec §7). Fora disso, `null` (400). */
export function periodoDoRelatorio(dias: string | null, agora: Date = new Date()): { desde: string; ate: string } | null {
  if (dias !== "7" && dias !== "30") return null;
  return { desde: dayBRAgo(Number(dias) - 1, agora), ate: dayBR(agora) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/painel-api.test.ts`
Expected: PASS — `ℹ pass 2`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/bio/painel-api.ts apps/web/src/lib/bio/painel-api.test.ts
git commit -m "feat(link-da-bio): panel API pure rules (slug reason, report window)"
```

### Task 2: `GET` e `POST /api/link-da-bio` (e o PostgREST falso)

**Files:**
- Modify: `apps/web/src/lib/bio/painel-api.ts` (imports + quatro funções de servidor no fim)
- Create: `apps/web/src/app/api/link-da-bio/route.ts`
- Test: `apps/web/src/app/api/link-da-bio/route.test.ts`

**Interfaces:**
- Consumes: Task 1; `documentoPadrao(i: { nome: string; campanhaId: string | null }): DocumentoBio` de `@/lib/bio/documento` (apara, corta em 60 sem partir emoji, vazio → "Minha loja"); `estadoDosLinks(tenantId: string, documento: DocumentoBio): Promise<Pick<DadosRender, "campanhas" | "linksEscondidos">>` e `linksMestresDasCampanhas(tenantId: string, campanhas: readonly Pick<CampaignGroup, "id" | "slug">[]): Promise<Record<string, string>>` de `@/lib/bio/conferir`; `lerPaginaDaLoja(tenantId: string): Promise<PaginaBio | null>`, `criarPaginaDaLoja(tenantId: string, slug: string, documento: DocumentoBio): Promise<PaginaBio>`, `slugDisponivel(slug: string, tenantId: string): Promise<boolean>` de `@/lib/stores/bio-pages` (todos PR 2); `getRouteTenantContext(req, { allowEngine: false })` (`{ tenantId, role: TenantRole | null, … }`); `assertPermission(role, "campaign:edit")` (lança `Response` 403 em texto); `listCampaignGroups(tenantId): Promise<CampaignGroup[]>` (`id`, `name`, `slug`); `getCustomDomain(tenantId): Promise<CustomDomain | null>` (`hostname`, `status`); `getOrganizationProfile(tenantId): Promise<{ storeName: string; niche: string | null }>`; `getPublicSiteUrl(): string`; `slugify(name: string): string`, `randomSuffix(length?: number): string` de `@/lib/pages/slug`.
- Produces:
  - `resposta(corpo: unknown, status: number): Response` (JSON + `cache-control: no-store`)
  - `lojaDoPainel(req: Request, acao: "ler" | "editar"): Promise<{ tenantId: string } | Response>`
  - `campanhasDaLoja(tenantId: string): Promise<CampanhaDoPainel[]>`
  - `sugerirSlug(nome: string, tenantId: string): Promise<string>`
  - `GET /api/link-da-bio` → 200 `RespostaDoPainelBio` | 401/403 (texto) | 500 `{ error: "Não deu pra carregar o link da bio." }`
  - `POST /api/link-da-bio` (sem corpo) → 201 `PaginaBio` | 401/403 | 500 `{ error: "Não deu pra criar a página." }`

O `supabase-js` manda: página = `GET /rest/v1/bio_pages?select=<cols>&tenant_id=eq.<t>`; criar = `POST /rest/v1/bio_pages?select=<cols>` com `Accept` de objeto; campanhas = `GET /rest/v1/campaign_groups?select=*&tenant_id=eq.<t>`; links mestres = `GET /rest/v1/tracked_links?select=slug,campaign_group_id&tenant_id=eq.<t>&slug=in.(…)` (um pedido por lote de 100 slugs; nenhum sem campanha); domínio = `GET /rest/v1/custom_domains?…&tenant_id=eq.<t>`; nome = `GET /rest/v1/organizations?select=name,niche&id=eq.<t>`; o resto conforme a tabela do PR 2 (Passo 0).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/app/api/link-da-bio/route.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, mock, test } from "node:test";

import { MENSAGEM_BLOQUEIO } from "@/lib/auth/modulos";
import { documentoPadrao, type DocumentoBio, type LinkBio } from "@/lib/bio/documento";
import { getPublicSiteUrl } from "@/lib/brand";
import type { PaginaBio } from "@/lib/stores/bio-pages";

/**
 * As rotas do painel do link da bio contra um PostgREST de mentira que entende o básico
 * (filtros eq/neq/in/is, objeto único, insert, update) e imita o unique de `bio_pages` e o
 * gatilho de `bio_slugs` (spec 2026-10-19-link-da-bio §5). Prova o que a rota faz com o
 * banco — inclusive o filtro de loja — sem depender de como o PR 2 escreveu cada consulta.
 * Molde: api/anuncios/gasto/route.test.ts. Dados fictícios: nada da loja-piloto.
 */

type Linha = Record<string, unknown>;
type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resultado = [status: number, corpo: unknown];
type Cabecalhos = Record<string, string>;
type Rota = (req: Request) => Promise<Response>;

const LOJA = "0d6f3c1e-5b2a-4c8e-9f10-2a3b4c5d6e7f";
const OUTRA = "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const PAGINA = "3c2b1a0f-9e8d-4c7b-8a69-5f4e3d2c1b0a";
const PAGINA_DA_OUTRA = "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a";
const VIP = "1f2e3d4c-5b6a-4798-8a7b-6c5d4e3f2a1b";
const INVERNO = "2a3b4c5d-6e7f-4801-9a2b-3c4d5e6f7a8b";
const DA_OUTRA = "4b5c6d7e-8f90-4a1b-8c2d-3e4f5a6b7c8d";
const SUMIDA = "5c6d7e8f-9a0b-4c1d-8e2f-3a4b5c6d7e8f";
const LINK_GRUPO = "6d7e8f9a-0b1c-4d2e-8f3a-4b5c6d7e8f9a";
const LINK_SUMIDO = "7f8a9b0c-1d2e-4f3a-8b4c-5d6e7f8a9b0c";
const NOME = "Ateliê Ouro & Prata";
const AGORA = "2026-10-19T12:00:00.000Z";
/** O número com que a loja posta nos grupos (`instances.phone`), sem o nono dígito. */
const CONECTADO = "556288887777";
const SESSAO: Cabecalhos = { authorization: "Bearer token-falso", "x-tenant-id": LOJA };
const RELATORIO = {
  visitas: 42,
  toques: 17,
  porLink: [{ linkId: LINK_GRUPO, toques: 17 }],
  porDia: [{ dia: "2026-10-18", visitas: 42, toques: 17 }],
};

const chamadas: Chamada[] = [];
let banco: Record<string, Linha[]> = {};
let papel = "owner";
/** Banco fora: tudo menos sessão e membership responde 500, com detalhe que não pode vazar. */
let falhar = false;
/** A página da loja some entre a leitura da rota e o UPDATE (corrida): o store relê e não acha. */
let sumirNoUpdate = false;

function link(id: string, campanhaId: string, destaque = false): LinkBio {
  return { id, tipo: "grupo", titulo: "Entrar no grupo VIP", sub: "", icone: "coroa", ativo: true, destaque, campanhaId };
}

function documento(links: LinkBio[] = [link(LINK_GRUPO, VIP, true)]): DocumentoBio {
  return { ...documentoPadrao({ nome: NOME, campanhaId: null }), links };
}

function pagina(tenantId: string, id: string, slug: string, extra: Linha = {}): Linha {
  return {
    id, tenant_id: tenantId, slug, publicada: false, bloqueada_em: null, documento: documento(),
    versao: 3, created_at: AGORA, updated_at: AGORA, ...extra,
  };
}

function campanha(id: string, nome: string, slug: string, tenantId = LOJA): Linha {
  return {
    id, tenant_id: tenantId, name: nome, slug, group_ids: [], auto_grow: false, grow_template: null,
    metadata: {}, whatsapp_community_jid: null, created_at: AGORA, updated_at: AGORA,
  };
}

function linkMestre(campanhaId: string, slug: string, tenantId = LOJA): Linha {
  return {
    id: randomUUID(), tenant_id: tenantId, campaign_group_id: campanhaId, slug, target_url: "",
    clicks: 0, metadata: { master: true }, created_at: AGORA, updated_at: AGORA,
  };
}

/** A loja sem página; a outra loja com página no ar e um slug antigo. */
function bancoInicial(): Record<string, Linha[]> {
  return {
    bio_pages: [pagina(OUTRA, PAGINA_DA_OUTRA, "atelie-concorrente", { publicada: true })],
    bio_slugs: [
      { slug: "atelie-concorrente", pagina_id: PAGINA_DA_OUTRA, criado_em: AGORA },
      { slug: "concorrente-antigo", pagina_id: PAGINA_DA_OUTRA, criado_em: AGORA },
    ],
    // Na ordem do store (a mais recente primeiro). "Inverno" é de antes do link mestre.
    campaign_groups: [
      campanha(INVERNO, "Inverno", "inverno"),
      campanha(VIP, "VIP Atacado", "vip-atacado"),
      campanha(DA_OUTRA, "VIP da outra", "vip-da-outra", OUTRA),
    ],
    tracked_links: [linkMestre(VIP, "vip-atacado"), linkMestre(DA_OUTRA, "vip-da-outra", OUTRA)],
    instances: [
      { id: randomUUID(), tenant_id: LOJA, name: "Loja", phone: CONECTADO, status: "connected", provider: "evolution", metadata: {}, created_at: AGORA, updated_at: AGORA },
    ],
    custom_domains: [
      { tenant_id: LOJA, hostname: "links.atelie-ficticio.test", verification_token: "t", status: "active", last_error: null, checked_at: AGORA, verified_at: AGORA },
    ],
    organizations: [
      { id: LOJA, name: NOME, niche: null, status: "active" },
      { id: OUTRA, name: "Concorrente", niche: null, status: "active" },
    ],
    uploads: [],
  };
}

/** A loja com página: slug atual "atelie-ouro-prata", um antigo dela ("atelie-antigo"), versão 3. */
function comPagina(extra: Linha = {}): void {
  banco.bio_pages.push(pagina(LOJA, PAGINA, "atelie-ouro-prata", extra));
  banco.bio_slugs.push(
    { slug: "atelie-ouro-prata", pagina_id: PAGINA, criado_em: AGORA },
    { slug: "atelie-antigo", pagina_id: PAGINA, criado_em: AGORA },
  );
}

// ---- PostgREST de mentira ----

const NAO_FILTRA = new Set(["select", "order", "limit", "offset", "columns", "on_conflict"]);

/** Os operadores que os stores usam. Outro estoura: o teste acusa "falso: filtro …" em vez de passar errado. */
function passa(linha: Linha, url: URL): boolean {
  for (const [coluna, filtro] of url.searchParams) {
    if (NAO_FILTRA.has(coluna)) continue;
    const valor = linha[coluna];
    if (filtro.startsWith("eq.")) {
      if (String(valor) !== filtro.slice(3)) return false;
    } else if (filtro.startsWith("neq.")) {
      if (String(valor) === filtro.slice(4)) return false;
    } else if (filtro.startsWith("in.(")) {
      const lista = filtro.slice(4, -1).split(",").map((v) => v.replace(/^"|"$/g, ""));
      if (!lista.includes(String(valor))) return false;
    } else if (filtro === "is.null") {
      if (valor !== null && valor !== undefined) return false;
    } else if (filtro === "not.is.null") {
      if (valor === null || valor === undefined) return false;
    } else {
      throw new Error(`falso: filtro ${coluna}=${filtro}`);
    }
  }
  return true;
}

/** `Accept: application/vnd.pgrst.object+json` (`.single()`): exatamente uma linha, senão 406. */
function umOuVarios(linhas: Linha[], objeto: boolean): Resultado {
  if (!objeto) return [200, linhas];
  if (linhas.length === 1) return [200, linhas[0]];
  return [406, { code: "PGRST116", details: `The result contains ${linhas.length} rows`, hint: null, message: "JSON object requested, multiple (or no) rows returned" }];
}

function duplicada(mensagem: string): Resultado {
  return [409, { code: "23505", details: null, hint: null, message: mensagem }];
}

/** O unique de `bio_pages.slug` e o gatilho `bio_pages_registra_slug` (PR 1): slug de outra página, atual ou antigo, recusa. */
function slugRecusado(slug: unknown, paginaId: unknown): Resultado | null {
  if (banco.bio_pages.some((p) => p.slug === slug && p.id !== paginaId)) {
    return duplicada('duplicate key value violates unique constraint "bio_pages_slug_key"');
  }
  const usado = banco.bio_slugs.find((s) => s.slug === slug);
  // Mensagem do gatilho do PR 1: cita bio_slugs, nunca bio_pages_tenant_id_key.
  return usado && usado.pagina_id !== paginaId ? duplicada(`bio_slugs: o slug "${String(slug)}" já foi de outra página`) : null;
}

function registrarSlug(p: Linha): void {
  if (!banco.bio_slugs.some((s) => s.slug === p.slug)) {
    banco.bio_slugs = [...banco.bio_slugs, { slug: p.slug, pagina_id: p.id, criado_em: AGORA }];
  }
}

function inserir(tabela: string, corpo: unknown, objeto: boolean): Resultado {
  if (tabela !== "bio_pages") return [500, { message: `falso: insert em ${tabela}` }];
  const nova: Linha = {
    id: randomUUID(), publicada: false, bloqueada_em: null, versao: 1, created_at: AGORA, updated_at: AGORA,
    ...((Array.isArray(corpo) ? corpo[0] : corpo) as Linha),
  };
  if (banco.bio_pages.some((p) => p.tenant_id === nova.tenant_id)) {
    return duplicada('duplicate key value violates unique constraint "bio_pages_tenant_id_key"');
  }
  const recusa = slugRecusado(nova.slug, nova.id);
  if (recusa) return recusa;
  banco.bio_pages = [...banco.bio_pages, nova];
  registrarSlug(nova);
  return umOuVarios([nova], objeto);
}

function atualizar(tabela: string, url: URL, corpo: unknown, objeto: boolean): Resultado {
  if (tabela !== "bio_pages") return [500, { message: `falso: update em ${tabela}` }];
  if (sumirNoUpdate) banco.bio_pages = banco.bio_pages.filter((p) => p.tenant_id !== LOJA);
  const mudanca = corpo as Linha;
  const alvos = banco.bio_pages.filter((p) => passa(p, url));
  for (const p of alvos) {
    const recusa = "slug" in mudanca ? slugRecusado(mudanca.slug, p.id) : null;
    if (recusa) return recusa;
  }
  const novas = alvos.map((p) => ({ ...p, ...mudanca }));
  banco.bio_pages = banco.bio_pages.map((p) => novas.find((n) => n.id === p.id) ?? p);
  novas.forEach(registrarSlug);
  return umOuVarios(novas, objeto);
}

function responder(metodo: string, url: URL, corpo: unknown, objeto: boolean): Resultado {
  const { pathname } = url;
  if (pathname === "/auth/v1/user") return [200, { id: "usuario-1", email: "dono@loja.test" }];
  if (pathname === "/rest/v1/memberships") {
    // Membership só na LOJA: x-tenant-id de outra loja não acha nada (403).
    const pedida = url.searchParams.get("tenant_id");
    const minha = pedida === null || pedida === `eq.${LOJA}`;
    return [200, minha ? [{ tenant_id: LOJA, role: papel, modules: [] }] : []];
  }
  if (falhar) return [500, { code: "XX000", message: "segredo do banco" }];
  if (pathname === "/rest/v1/rpc/bio_relatorio") return [200, RELATORIO];
  const tabela = pathname.replace(/^\/rest\/v1\//, "");
  if (!(tabela in banco)) return [500, { message: `falso: inesperado ${metodo} ${pathname}` }];
  if (metodo === "GET") return umOuVarios(banco[tabela].filter((l) => passa(l, url)), objeto);
  if (metodo === "POST") return inserir(tabela, corpo, objeto);
  if (metodo === "PATCH") return atualizar(tabela, url, corpo, objeto);
  return [500, { message: `falso: inesperado ${metodo} ${pathname}` }];
}

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte.toString("utf8")));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    const corpo: unknown = bruto ? JSON.parse(bruto) : undefined;
    chamadas.push({ metodo: req.method ?? "", url, corpo });
    const objeto = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    let resultado: Resultado;
    try {
      resultado = responder(req.method ?? "", url, corpo, objeto);
    } catch (e) {
      resultado = [500, { message: (e as Error).message }];
    }
    res.statusCode = resultado[0];
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(resultado[1]));
  });
});

// ---- Rotas e pedidos ----

let GET: Rota;
let POST: Rota;

/** Cada handler da série com um pedido válido: a recusa de sessão, loja ou papel vem antes de qualquer validação. */
const HANDLERS: Array<[nome: string, chamar: (cabecalhos: Cabecalhos) => Promise<Response>]> = [
  ["GET /api/link-da-bio", (h) => GET(pedir("GET", undefined, undefined, h))],
  ["POST /api/link-da-bio", (h) => POST(pedir("POST", undefined, undefined, h))],
];

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.HUBFLOW_USE_SUPABASE = "1";
  ({ GET, POST } = await import("./route"));
});
after(() => {
  supabase.close();
});
beforeEach(() => {
  chamadas.length = 0;
  banco = bancoInicial();
  papel = "owner";
  falhar = false;
  sumirNoUpdate = false;
});

function pedir(metodo: string, caminho = "/api/link-da-bio", corpo?: unknown, cabecalhos: Cabecalhos = SESSAO): Request {
  return new Request(`http://girumo.test${caminho}`, {
    method: metodo,
    headers: { ...cabecalhos, "content-type": "application/json" },
    body: corpo === undefined ? undefined : typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

/** Só sessão e membership foram consultadas: a recusa veio antes de ler ou gravar qualquer coisa da loja. */
function soTocouNaSessao(): boolean {
  return chamadas.every((c) => c.url.pathname === "/auth/v1/user" || c.url.pathname === "/rest/v1/memberships");
}

/** Tabelas com `tenant_id` que o painel lê ou grava. */
const COM_LOJA = new Set(["bio_pages", "campaign_groups", "tracked_links", "custom_domains", "instances", "uploads"]);

/** Toda leitura e gravação levou a loja da sessão: o service role passa por cima do RLS. */
function soDaLoja(): void {
  for (const c of chamadas) {
    const tabela = c.url.pathname.replace(/^\/rest\/v1\//, "");
    const onde = `${c.metodo} ${tabela}`;
    if (COM_LOJA.has(tabela) && c.metodo === "POST") {
      assert.equal(((Array.isArray(c.corpo) ? c.corpo[0] : c.corpo) as Linha).tenant_id, LOJA, onde);
    } else if (COM_LOJA.has(tabela)) {
      assert.equal(c.url.searchParams.get("tenant_id"), `eq.${LOJA}`, onde);
    } else if (tabela === "organizations") {
      assert.equal(c.url.searchParams.get("id"), `eq.${LOJA}`, onde);
    } else if (tabela === "rpc/bio_relatorio") {
      assert.equal((c.corpo as Linha).p_tenant, LOJA, onde);
    }
  }
}

// ---- Transversais: valem para todo handler em HANDLERS ----

test("sem sessão: 401 em todo handler, e nada da loja é lido", async () => {
  for (const [nome, chamar] of HANDLERS) {
    chamadas.length = 0;
    assert.equal((await chamar({})).status, 401, nome);
    assert.ok(soTocouNaSessao(), nome);
  }
});

test("vendedora: 403 do guard de módulo em todo handler, antes de tocar no banco", async () => {
  // /api/link-da-bio não está em lib/auth/modulos.ts: o mapa é fechado por padrão (spec §8).
  papel = "seller";
  for (const [nome, chamar] of HANDLERS) {
    chamadas.length = 0;
    const r = await chamar(SESSAO);
    assert.equal(r.status, 403, nome);
    assert.equal(await r.text(), MENSAGEM_BLOQUEIO, nome);
    assert.ok(soTocouNaSessao(), nome);
  }
});

test("x-tenant-id de loja da qual o usuário não é membro: 403, nada lido", async () => {
  for (const [nome, chamar] of HANDLERS) {
    chamadas.length = 0;
    assert.equal((await chamar({ ...SESSAO, "x-tenant-id": OUTRA })).status, 403, nome);
    assert.ok(soTocouNaSessao(), nome);
  }
});

test("banco fora: 500 com mensagem nossa, nunca a do banco", async () => {
  falhar = true;
  const silencio = mock.method(console, "error", () => {});
  try {
    for (const [nome, chamar] of HANDLERS) {
      const r = await chamar(SESSAO);
      assert.equal(r.status, 500, nome);
      const texto = await r.text();
      assert.doesNotMatch(texto, /segredo/, nome);
      assert.equal(typeof (JSON.parse(texto) as { error?: unknown }).error, "string", nome);
    }
  } finally {
    silencio.mock.restore();
  }
});

// ---- GET ----

test("GET sem página: campanhas com o slug do link mestre, domínio ativo, origem Girumo e endereço livre", async () => {
  const r = await GET(pedir("GET"));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.deepEqual(await r.json(), {
    // A outra loja tem página: a desta loja continua null.
    pagina: null,
    campanhas: [
      { id: INVERNO, nome: "Inverno", slug: null },
      { id: VIP, nome: "VIP Atacado", slug: "vip-atacado" },
    ],
    dominio: "links.atelie-ficticio.test",
    origemGirumo: getPublicSiteUrl(),
    sugestaoSlug: "atelie-ouro-prata",
    linksEscondidos: [],
  });
  // Link mestre buscado pelos slugs das campanhas da loja (`linksMestresDasCampanhas`), sem o corte
  // de 1000 linhas de ler todos os links: um pedido, com a loja e os dois slugs.
  const links = chamadas.filter((c) => c.url.pathname === "/rest/v1/tracked_links");
  assert.equal(links.length, 1);
  assert.equal(links[0].url.searchParams.get("slug"), "in.(inverno,vip-atacado)");
  soDaLoja();
});

test("GET com página: a da loja, a sugestão é o próprio slug e os links que a página pública esconde", async () => {
  comPagina({ bloqueada_em: AGORA, documento: documento([link(LINK_GRUPO, VIP, true), link(LINK_SUMIDO, SUMIDA)]) });
  banco.custom_domains = banco.custom_domains.map((d) => ({ ...d, status: "pending" }));
  const corpo = (await (await GET(pedir("GET"))).json()) as { pagina: PaginaBio; dominio: string | null; sugestaoSlug: string; linksEscondidos: string[] };
  assert.deepEqual([corpo.pagina.id, corpo.pagina.tenantId, corpo.pagina.versao], [PAGINA, LOJA, 3]);
  // Bloqueada pelo admin: a API repassa, o painel avisa (spec §2).
  assert.equal(corpo.pagina.bloqueadaEm, AGORA);
  assert.equal(corpo.sugestaoSlug, "atelie-ouro-prata");
  // Campanha sumida: o botão sai da página pública e o painel pinta de vermelho.
  assert.deepEqual(corpo.linksEscondidos, [LINK_SUMIDO]);
  // Domínio ainda pendente não é endereço.
  assert.equal(corpo.dominio, null);
  soDaLoja();
});

test("GET: nome com girumo sugere raiz \"loja\"; endereço ocupado por outra loja ganha sufixo", async () => {
  banco.organizations = [{ id: LOJA, name: "Girumo Modas", niche: null, status: "active" }];
  const comMarca = (await (await GET(pedir("GET"))).json()) as { sugestaoSlug: string };
  assert.match(comMarca.sugestaoSlug, /^loja-[a-hjkmnp-z2-9]{4}$/);

  banco.organizations = [{ id: LOJA, name: NOME, niche: null, status: "active" }];
  banco.bio_slugs.push({ slug: "atelie-ouro-prata", pagina_id: PAGINA_DA_OUTRA, criado_em: AGORA });
  const ocupado = (await (await GET(pedir("GET"))).json()) as { sugestaoSlug: string };
  assert.match(ocupado.sugestaoSlug, /^atelie-ouro-prata-[a-hjkmnp-z2-9]{4}$/);
});

// ---- POST ----

test("POST cria fora do ar, com o modelo padrão, o nome da loja e o primeiro link mestre", async () => {
  const r = await POST(pedir("POST"));
  assert.equal(r.status, 201);
  const criada = (await r.json()) as PaginaBio;
  assert.equal(criada.tenantId, LOJA);
  assert.equal(criada.slug, "atelie-ouro-prata");
  assert.equal(criada.publicada, false);
  assert.deepEqual([criada.documento.modelo, criada.documento.paleta, criada.documento.perfil.nome], ["etiqueta", "azul", NOME]);
  // "Inverno" vem antes na lista, mas não tem link mestre: o botão vai para o VIP.
  assert.deepEqual(criada.documento.links.flatMap((l) => (l.tipo === "grupo" ? [l.campanhaId] : [])), [VIP]);
  assert.equal(banco.bio_pages.filter((p) => p.tenant_id === LOJA).length, 1);
  soDaLoja();
});

test("POST é idempotente: com página, devolve a que existe e não grava nada", async () => {
  comPagina();
  const r = await POST(pedir("POST"));
  assert.equal(r.status, 201);
  assert.equal(((await r.json()) as PaginaBio).id, PAGINA);
  assert.equal(chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/bio_pages").length, 0);
});

test("POST: dois cliques ao mesmo tempo dão a mesma página, nunca duas", async () => {
  const [a, b] = await Promise.all([POST(pedir("POST")), POST(pedir("POST"))]);
  assert.deepEqual([a.status, b.status], [201, 201]);
  assert.equal(((await a.json()) as PaginaBio).id, ((await b.json()) as PaginaBio).id);
  assert.equal(banco.bio_pages.filter((p) => p.tenant_id === LOJA).length, 1);
});

test("POST sem campanha com link mestre: a página nasce sem o botão do grupo", async () => {
  banco.tracked_links = [];
  const criada = (await (await POST(pedir("POST"))).json()) as PaginaBio;
  assert.equal(criada.documento.links.some((l) => l.tipo === "grupo"), false);
});

test("POST com nome de 80 caracteres e emoji no corte: cria, com o nome cortado sem meio emoji", async () => {
  // organizations.name vai até 80 (STORE_NAME_MAX); o corte em 60 é do documentoPadrao (PR 2).
  banco.organizations = [{ id: LOJA, name: `${"A".repeat(59)}🌸 Moda Atacado Sul`, niche: null, status: "active" }];
  const r = await POST(pedir("POST"));
  assert.equal(r.status, 201);
  const { perfil } = ((await r.json()) as PaginaBio).documento;
  assert.ok(perfil.nome.length <= 60, perfil.nome);
  // Surrogate alto solto no fim é JSON que o jsonb recusa.
  assert.doesNotMatch(perfil.nome, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
});

test("POST: dono, administração e operação criam (campaign:edit)", async () => {
  for (const p of ["owner", "admin", "operator"]) {
    papel = p;
    banco = bancoInicial();
    assert.equal((await POST(pedir("POST"))).status, 201, p);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/link-da-bio/route.test.ts`
Expected: FAIL — o `before` cai com `Cannot find module './route'` e os 13 testes falham.

- [ ] **Step 3: Acrescentar ao `painel-api.ts` as funções de servidor**

Trocar o bloco de imports do arquivo por:

```ts
import "server-only";

import { linksMestresDasCampanhas } from "@/lib/bio/conferir";
import { SLUG_BIO, slugReservado, type DocumentoBio } from "@/lib/bio/documento";
import { dayBR, dayBRAgo } from "@/lib/date-br";
import { randomSuffix, slugify } from "@/lib/pages/slug";
import { assertPermission } from "@/lib/permissions";
import { getRouteTenantContext } from "@/lib/route-tenant-context";
import { slugDisponivel, type PaginaBio } from "@/lib/stores/bio-pages";
import { listCampaignGroups } from "@/lib/stores/campaign-groups";
```

Logo antes de `export type CampanhaDoPainel`, acrescentar:

```ts
/** 40 do `SLUG_BIO` menos "-" e os 4 caracteres de `randomSuffix()`. */
const RAIZ_MAX = 35;
const TENTATIVAS_DE_SLUG = 5;
```

E no fim do arquivo:

```ts
/** JSON puro, nunca guardado em cache: o painel lê o estado de agora. */
export function resposta(corpo: unknown, status: number): Response {
  return Response.json(corpo, { status, headers: { "cache-control": "no-store" } });
}

/**
 * Sessão (Bearer do painel ou cookie) e loja. A vendedora para antes, no guard de módulo do
 * `getTenantContext`: `/api/link-da-bio` não está em `lib/auth/modulos.ts`, e o mapa é fechado por
 * padrão. Ler é de quem o guard deixa passar (dono, administração, operação); escrever pede
 * `campaign:edit`, a ação que libera editar a loja (spec §8).
 */
export async function lojaDoPainel(req: Request, acao: "ler" | "editar"): Promise<{ tenantId: string } | Response> {
  try {
    const ctx = await getRouteTenantContext(req, { allowEngine: false });
    if (acao === "editar") {
      // `role` só é nulo para a engine, que `allowEngine: false` já recusou.
      if (!ctx.role) return new Response("Sem permissão para esta ação.", { status: 403 });
      assertPermission(ctx.role, "campaign:edit");
    }
    return { tenantId: ctx.tenantId };
  } catch (e) {
    if (e instanceof Response) return e;
    console.error(`[api/link-da-bio] sessão: ${(e as Error).message}`);
    return resposta({ error: "Não deu pra abrir o link da bio." } satisfies ErroDoPainelBio, 500);
  }
}

/**
 * Campanhas da loja para o botão "Grupo VIP". `slug` só quando o link mestre existe — a regra mora
 * no `linksMestresDasCampanhas` (PR 2), o mesmo que o `estadoDosLinks` usa para esconder o botão na
 * página pública. Uma implementação só: o painel nunca oferece um link que a página esconderia.
 */
export async function campanhasDaLoja(tenantId: string): Promise<CampanhaDoPainel[]> {
  const campanhas = await listCampaignGroups(tenantId);
  const mestres = await linksMestresDasCampanhas(tenantId, campanhas);
  return campanhas.map((c) => ({ id: c.id, nome: c.name, slug: mestres[c.id] ?? null }));
}

/**
 * Endereço sugerido e livre (spec §2): `slugify(nome)`; ocupado ou reservado, a raiz ganha sufixo
 * aleatório. Nome com "girumo"/"hubflow" fica reservado em qualquer variação, então a raiz vira
 * "loja". É só sugestão: o `criarPaginaDaLoja` ainda resolve colisão no insert.
 */
export async function sugerirSlug(nome: string, tenantId: string): Promise<string> {
  const base = slugify(nome);
  const raiz = /girumo|hubflow/.test(base) ? "loja" : base.slice(0, RAIZ_MAX).replace(/-+$/, "");
  let candidato = base;
  for (let i = 0; i < TENTATIVAS_DE_SLUG; i++) {
    if (motivoDoSlug(candidato) === null && (await slugDisponivel(candidato, tenantId))) return candidato;
    candidato = `${raiz}-${randomSuffix()}`;
  }
  return candidato;
}
```

- [ ] **Step 4: Escrever `GET` e `POST`**

```ts
// apps/web/src/app/api/link-da-bio/route.ts
import { estadoDosLinks } from "@/lib/bio/conferir";
import { documentoPadrao } from "@/lib/bio/documento";
import {
  campanhasDaLoja,
  lojaDoPainel,
  resposta,
  sugerirSlug,
  type ErroDoPainelBio,
  type RespostaDoPainelBio,
} from "@/lib/bio/painel-api";
import { getPublicSiteUrl } from "@/lib/brand";
import { criarPaginaDaLoja, lerPaginaDaLoja } from "@/lib/stores/bio-pages";
import { getCustomDomain } from "@/lib/stores/custom-domains";
import { getOrganizationProfile } from "@/lib/stores/organization-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function falhou(acao: string, tenantId: string, e: unknown, mensagem: string): Response {
  console.error(`[api/link-da-bio] ${acao} ${tenantId}: ${(e as Error).message}`);
  return resposta({ error: mensagem } satisfies ErroDoPainelBio, 500);
}

/**
 * GET /api/link-da-bio — tudo que o editor precisa para abrir (spec §9): a página (ou `null`), as
 * campanhas com o slug do link mestre, o domínio próprio ativo, a origem Girumo (constante do
 * servidor, nunca o Host), a sugestão de endereço e os links que a página pública esconde.
 */
export async function GET(req: Request): Promise<Response> {
  const loja = await lojaDoPainel(req, "ler");
  if (loja instanceof Response) return loja;
  const { tenantId } = loja;
  try {
    const [pagina, dominio, campanhas, perfil] = await Promise.all([
      lerPaginaDaLoja(tenantId),
      getCustomDomain(tenantId),
      campanhasDaLoja(tenantId),
      getOrganizationProfile(tenantId),
    ]);
    const linksEscondidos = pagina ? (await estadoDosLinks(tenantId, pagina.documento)).linksEscondidos : [];
    // Com página, a sugestão é o próprio slug (nada a consultar); sem, um endereço livre.
    const sugestaoSlug = pagina ? pagina.slug : await sugerirSlug(perfil.storeName, tenantId);
    const corpo: RespostaDoPainelBio = {
      pagina,
      campanhas,
      dominio: dominio?.status === "active" ? dominio.hostname : null,
      origemGirumo: getPublicSiteUrl(),
      sugestaoSlug,
      linksEscondidos,
    };
    return resposta(corpo, 200);
  } catch (e) {
    return falhou("GET", tenantId, e, "Não deu pra carregar o link da bio.");
  }
}

/**
 * POST /api/link-da-bio — "Criar minha página" (spec §8, primeira vez). Idempotente: com página,
 * devolve a que existe. Nasce fora do ar, no modelo padrão, com o nome da loja, o link mestre da
 * primeira campanha que tem um (a mais recente, ordem de `listCampaignGroups`) e um endereço livre.
 */
export async function POST(req: Request): Promise<Response> {
  const loja = await lojaDoPainel(req, "editar");
  if (loja instanceof Response) return loja;
  const { tenantId } = loja;
  try {
    const existente = await lerPaginaDaLoja(tenantId);
    if (existente) return resposta(existente, 201);
    const [perfil, campanhas] = await Promise.all([getOrganizationProfile(tenantId), campanhasDaLoja(tenantId)]);
    const campanhaId = campanhas.find((c) => c.slug !== null)?.id ?? null;
    // O nome vai cru: o `documentoPadrao` apara, corta em 60 sem partir emoji e troca vazio por "Minha loja".
    const documento = documentoPadrao({ nome: perfil.storeName, campanhaId });
    // Dois cliques ao mesmo tempo: o segundo insert cai no unique de loja e o store devolve a mesma.
    const criada = await criarPaginaDaLoja(tenantId, await sugerirSlug(perfil.storeName, tenantId), documento);
    return resposta(criada, 201);
  } catch (e) {
    return falhou("POST", tenantId, e, "Não deu pra criar a página.");
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/link-da-bio/route.test.ts`
Expected: PASS — `ℹ pass 13`, `ℹ fail 0`.

Se aparecer `falso: …` (status 500 inesperado), o PR 2 consulta algo que o falso não conhece: acrescentar ao falso (operador no `passa`, tabela em `bancoInicial`, RPC em `responder`), nunca afrouxar a asserção. Se "banco fora" falhar com 200, a função do PR 2 engole o erro do banco: anotar no PR e abrir a correção no PR 2 (silent failure), não mudar o teste.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/bio/painel-api.ts apps/web/src/app/api/link-da-bio/route.ts apps/web/src/app/api/link-da-bio/route.test.ts
git commit -m "feat(link-da-bio): GET and POST /api/link-da-bio (editor state, idempotent create)"
```

### Task 3: `PATCH /api/link-da-bio`

**Files:**
- Modify: `apps/web/src/app/api/link-da-bio/route.ts` (imports + `PATCH` no fim)
- Test: `apps/web/src/app/api/link-da-bio/route.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `documentoBio: z.ZodType<DocumentoBio>` de `@/lib/bio/documento`; `conferirDocumentoDaLoja(tenantId: string, documento: DocumentoBio): Promise<{ ok: true } | { ok: false; error: string; campo: string }>` de `@/lib/bio/conferir`; `salvarPaginaDaLoja(tenantId: string, e: { versao: number; slug: string; publicada: boolean; documento: DocumentoBio }): Promise<{ ok: true; pagina: PaginaBio } | { ok: false; motivo: "versao" | "slug" | "sem-pagina" }>` de `@/lib/stores/bio-pages`; `invalidarBio(i: { tenantId: string; paginaId: string; slugs: string[] }): void` de `@/lib/bio/cache` (todos PR 2).
- Produces: `PATCH /api/link-da-bio` (corpo `CorpoDoPatchBio`) → 200 `PaginaBio` | 400 `{ error, campo? }` | 404 `{ error: "Crie a página antes de salvar." }` | 409 `{ error, motivo: "versao" | "slug" }` | 401/403 (texto) | 500 `{ error: "Não deu pra salvar a página." }`.

`campo` do 400: a chave do envelope (`versao`, `slug`, `publicada`); ou o caminho relativo ao documento (`modelo`, `links.0.numero`), com `documento` quando o documento inteiro falta; ausente quando o problema é o corpo como um todo (JSON quebrado, chave a mais).

- [ ] **Step 1: Write the failing test**

No `route.test.ts`:

1. Acrescentar aos imports (depois de `import assert …`): `import { AsyncLocalStorage } from "node:async_hooks";` e, depois do import de `@/lib/bio/documento`: `import type { CorpoDoPatchBio, ErroDoPainelBio } from "@/lib/bio/painel-api";`.
2. Depois de `const LINK_SUMIDO = …`: `const LINK_WHATS = "8e9f0a1b-2c3d-4e5f-9a6b-7c8d9e0f1a2b";`.
3. Depois da função `link`:

```ts
function whats(id: string, numero: string): LinkBio {
  return { id, tipo: "whatsapp", titulo: "Falar com a loja", sub: "", icone: "whatsapp", ativo: true, destaque: false, numero, mensagem: "" };
}
```

4. Depois de `let POST: Rota;`:

```ts
let PATCH: Rota;
/** O pedaço do `workAsyncStorage` do Next que o teste usa (Next 15.5). */
type ContextoDoNext = { run<T>(store: never, fn: () => T): T };
let contextoDoNext: ContextoDoNext;
```

5. Ao fim do array `HANDLERS`: `["PATCH /api/link-da-bio", (h) => PATCH(pedir("PATCH", undefined, corpoValido(), h))],`
6. No `before`, trocar a linha `({ GET, POST } = await import("./route"));` por:

```ts
  // O Next só usa a AsyncLocalStorage real se ela estiver no globalThis antes do primeiro import
  // dele (a rota importa `next/cache` pelo `invalidarBio`): por isso os imports são dinâmicos.
  (globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;
  contextoDoNext = (await import("next/dist/server/app-render/work-async-storage.external")).workAsyncStorage;
  ({ GET, POST, PATCH } = await import("./route"));
```

7. Depois de `soDaLoja`:

```ts
function corpoValido(extra: Partial<CorpoDoPatchBio> = {}): CorpoDoPatchBio {
  return { versao: 3, slug: "atelie-ouro-prata", publicada: true, documento: documento(), ...extra };
}

/**
 * Roda o handler como dentro de uma request do Next e devolve as tags que ele invalidou. Fora disso,
 * o `revalidateTag` lança ("static generation store missing"). Usa interno do Next 15.5
 * (`pendingRevalidatedTags`): numa atualização, este teste quebra alto, não calado.
 */
async function comCacheDoNext(fn: () => Promise<Response>): Promise<{ resposta: Response; tags: string[] }> {
  const store: { incrementalCache: object; pendingRevalidatedTags?: string[] } = { incrementalCache: {} };
  const resposta = await contextoDoNext.run(store as never, fn);
  return { resposta, tags: store.pendingRevalidatedTags ?? [] };
}

const gravouPagina = () => chamadas.some((c) => c.metodo === "PATCH" && c.url.pathname === "/rest/v1/bio_pages");
```

8. No fim do arquivo:

```ts
// ---- PATCH ----

test("PATCH salva a página inteira, sobe a versão e invalida o slug novo e o antigo", async () => {
  comPagina();
  const { resposta: r, tags } = await comCacheDoNext(() => PATCH(pedir("PATCH", undefined, corpoValido({ slug: "ouro-prata-atacado" }))));
  assert.equal(r.status, 200);
  const salva = (await r.json()) as PaginaBio;
  assert.deepEqual([salva.id, salva.slug, salva.versao, salva.publicada], [PAGINA, "ouro-prata-atacado", 4, true]);
  // Tags da spec §6: o antigo passa a responder 301; o novo pode ter um 404 guardado.
  for (const tag of ["bio-slug:ouro-prata-atacado", "bio-slug:atelie-ouro-prata", `bio-loja:${LOJA}`, `bio-pagina:${PAGINA}`]) {
    assert.ok(tags.includes(tag), `${tag} em ${JSON.stringify(tags)}`);
  }
  soDaLoja();
});

test("PATCH volta a um endereço que já foi da própria loja", async () => {
  comPagina();
  const { resposta: r } = await comCacheDoNext(() => PATCH(pedir("PATCH", undefined, corpoValido({ slug: "atelie-antigo" }))));
  assert.equal(r.status, 200);
  assert.equal(((await r.json()) as PaginaBio).slug, "atelie-antigo");
});

test("PATCH recusa corpo fora do formato com 400 e o campo, sem gravar", async () => {
  comPagina();
  const casos: Array<[corpo: unknown, campo: string | undefined]> = [
    ["não é json", undefined],
    [{ ...corpoValido(), tenant_id: OUTRA }, undefined],
    [{ ...corpoValido(), versao: 0 }, "versao"],
    [{ ...corpoValido(), versao: "3" }, "versao"],
    [{ ...corpoValido(), publicada: "sim" }, "publicada"],
    [{ ...corpoValido(), documento: undefined }, "documento"],
    // Chave a mais na raiz do documento: o PR 2 aponta caminho vazio, a API responde "documento".
    [{ ...corpoValido(), documento: { ...documento(), extra: 1 } }, "documento"],
    [{ ...corpoValido(), documento: { ...documento(), modelo: "neon" } }, "modelo"],
    [corpoValido({ slug: "Ouro Prata" }), "slug"],
    [corpoValido({ slug: "ab" }), "slug"],
    [corpoValido({ slug: "a".repeat(41) }), "slug"],
    [corpoValido({ slug: "girumo-ouro" }), "slug"],
    [corpoValido({ slug: "admin" }), "slug"],
  ];
  for (const [corpo, campo] of casos) {
    const r = await PATCH(pedir("PATCH", undefined, corpo));
    assert.equal(r.status, 400, JSON.stringify(corpo).slice(0, 80));
    const erro = (await r.json()) as ErroDoPainelBio;
    assert.equal(typeof erro.error, "string");
    assert.equal(erro.campo, campo, JSON.stringify(corpo).slice(0, 80));
  }
  assert.equal(gravouPagina(), false);
});

test("PATCH: o número com que a loja posta é recusado (anti-ban), com o campo do link", async () => {
  comPagina();
  // O banco guarda sem o nono dígito, o link vem com: a chave do telefone casa os dois (spec §4).
  const r = await PATCH(pedir("PATCH", undefined, corpoValido({ documento: documento([whats(LINK_WHATS, "5562988887777")]) })));
  assert.equal(r.status, 400);
  const erro = (await r.json()) as ErroDoPainelBio;
  assert.equal(erro.campo, "links.0.numero");
  assert.match(erro.error, /número que a Girumo usa para postar/);
  assert.equal(gravouPagina(), false);
});

test("PATCH: campanha de outra loja no botão do grupo é recusada, sem gravar", async () => {
  comPagina();
  const r = await PATCH(pedir("PATCH", undefined, corpoValido({ documento: documento([link(LINK_GRUPO, DA_OUTRA, true)]) })));
  assert.equal(r.status, 400);
  assert.match(String(((await r.json()) as ErroDoPainelBio).campo), /^links\.0\./);
  assert.equal(gravouPagina(), false);
});

test("PATCH sem página: 404, e nada é gravado", async () => {
  const r = await PATCH(pedir("PATCH", undefined, corpoValido()));
  assert.equal(r.status, 404);
  assert.deepEqual(await r.json(), { error: "Crie a página antes de salvar." });
  assert.equal(gravouPagina(), false);
});

test("PATCH: a página some entre a leitura e o UPDATE → 404 (\"sem-pagina\" do store)", async () => {
  comPagina();
  sumirNoUpdate = true;
  assert.equal((await PATCH(pedir("PATCH", undefined, corpoValido()))).status, 404);
});

test("PATCH com versão velha: 409 \"versao\", nada muda e o cache não é tocado", async () => {
  comPagina();
  const { resposta: r, tags } = await comCacheDoNext(() => PATCH(pedir("PATCH", undefined, corpoValido({ versao: 2, slug: "ouro-prata-atacado" }))));
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "Outra pessoa salvou antes. Recarregue pra ver a versão nova.", motivo: "versao" });
  assert.deepEqual(tags, []);
  assert.equal(banco.bio_pages.find((p) => p.id === PAGINA)?.slug, "atelie-ouro-prata");
});

test("PATCH com endereço de outra loja, atual ou antigo: 409 \"slug\"", async () => {
  for (const slug of ["atelie-concorrente", "concorrente-antigo"]) {
    banco = bancoInicial();
    comPagina();
    const r = await PATCH(pedir("PATCH", undefined, corpoValido({ slug })));
    assert.equal(r.status, 409, slug);
    assert.deepEqual(await r.json(), { error: "Esse endereço já está em uso. Escolha outro.", motivo: "slug" }, slug);
  }
});

test("PATCH: se invalidar o cache falhar, o salvar vale (200)", async () => {
  comPagina();
  const silencio = mock.method(console, "error", () => {});
  try {
    // Fora do contexto de request do Next, o `revalidateTag` lança.
    assert.equal((await PATCH(pedir("PATCH", undefined, corpoValido()))).status, 200);
  } finally {
    silencio.mock.restore();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/link-da-bio/route.test.ts`
Expected: FAIL — `PATCH is not a function` nos 10 testes novos e nos 4 transversais (a entrada do PATCH em `HANDLERS`); os 9 de GET/POST passam.

- [ ] **Step 3: Escrever o `PATCH`**

Trocar o bloco de imports do `route.ts` por:

```ts
import { z } from "zod";

import { invalidarBio } from "@/lib/bio/cache";
import { conferirDocumentoDaLoja, estadoDosLinks } from "@/lib/bio/conferir";
import { documentoBio, documentoPadrao } from "@/lib/bio/documento";
import {
  campanhasDaLoja,
  lojaDoPainel,
  motivoDoSlug,
  resposta,
  sugerirSlug,
  type ErroDoPainelBio,
  type RespostaDoPainelBio,
} from "@/lib/bio/painel-api";
import { getPublicSiteUrl } from "@/lib/brand";
import { criarPaginaDaLoja, lerPaginaDaLoja, salvarPaginaDaLoja, type PaginaBio } from "@/lib/stores/bio-pages";
import { getCustomDomain } from "@/lib/stores/custom-domains";
import { getOrganizationProfile } from "@/lib/stores/organization-profile";
```

E no fim do arquivo:

```ts
/** Envelope do PATCH. O documento é validado à parte, para o `campo` sair relativo a ele ("links.2.numero"). */
const corpoDoPatch = z.strictObject({
  versao: z.number().int().positive(),
  slug: z.string(),
  publicada: z.boolean(),
  documento: z.unknown(),
});

const ERRO_DO_SLUG = {
  formato: "Use de 3 a 40 letras minúsculas, números e hífen, sem espaço nem acento.",
  reservado: "Esse endereço é reservado. Escolha outro.",
} as const;
const ERRO_409 = {
  // Texto da spec §8: o painel mostra igual, com o botão Recarregar.
  versao: "Outra pessoa salvou antes. Recarregue pra ver a versão nova.",
  slug: "Esse endereço já está em uso. Escolha outro.",
} as const;
const SEM_PAGINA = "Crie a página antes de salvar.";

/** "links.2.numero"; caminho vazio vira `raiz` (ou some do corpo). */
function campoDo(error: z.ZodError, raiz?: string): string | undefined {
  return error.issues[0]?.path.map(String).join(".") || raiz;
}

function recusa(error: string, status: number, extra: Omit<ErroDoPainelBio, "error"> = {}): Response {
  return resposta({ error, ...extra } satisfies ErroDoPainelBio, status);
}

/**
 * Slug novo e antigo (spec §6): o antigo passa a responder 301; o novo pode ter um 404 guardado.
 * Falha aqui não desfaz o salvar, que já está gravado: a página pública atualiza quando o cache
 * vencer (5 min). Responder 500 faria o painel achar que não salvou — e o próximo salvar daria 409.
 */
function invalidar(tenantId: string, pagina: PaginaBio, slugAntigo: string): void {
  try {
    invalidarBio({ tenantId, paginaId: pagina.id, slugs: [pagina.slug, slugAntigo] });
  } catch (e) {
    console.error(`[api/link-da-bio] invalidar ${tenantId}: ${(e as Error).message}`);
  }
}

/**
 * PATCH /api/link-da-bio — salvar (spec §8–§9). Ordem: envelope, documento (`documentoBio`) e slug
 * (formato, reservado) → `conferirDocumentoDaLoja` → `salvarPaginaDaLoja` (trava por `versao`) →
 * `invalidarBio` com o slug novo e o antigo.
 */
export async function PATCH(req: Request): Promise<Response> {
  const loja = await lojaDoPainel(req, "editar");
  if (loja instanceof Response) return loja;
  const { tenantId } = loja;

  const envelope = corpoDoPatch.safeParse(await req.json().catch(() => undefined));
  if (!envelope.success) return recusa("Pedido inválido.", 400, { campo: campoDo(envelope.error) });
  const lido = documentoBio.safeParse(envelope.data.documento);
  if (!lido.success) {
    return recusa(lido.error.issues[0]?.message ?? "Documento inválido.", 400, { campo: campoDo(lido.error, "documento") });
  }
  const { versao, slug, publicada } = envelope.data;
  const slugRuim = motivoDoSlug(slug);
  if (slugRuim) return recusa(ERRO_DO_SLUG[slugRuim], 400, { campo: "slug" });

  try {
    // Lida antes só pelo slug antigo: se o UPDATE condicional por versão passar, era este o slug trocado.
    const atual = await lerPaginaDaLoja(tenantId);
    if (!atual) return recusa(SEM_PAGINA, 404);
    const conferido = await conferirDocumentoDaLoja(tenantId, lido.data);
    if (!conferido.ok) return recusa(conferido.error, 400, { campo: conferido.campo });
    const salvo = await salvarPaginaDaLoja(tenantId, { versao, slug, publicada, documento: lido.data });
    if (!salvo.ok) {
      return salvo.motivo === "sem-pagina"
        ? recusa(SEM_PAGINA, 404)
        : recusa(ERRO_409[salvo.motivo], 409, { motivo: salvo.motivo });
    }
    invalidar(tenantId, salvo.pagina, atual.slug);
    return resposta(salvo.pagina, 200);
  } catch (e) {
    return falhou("PATCH", tenantId, e, "Não deu pra salvar a página.");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/link-da-bio/route.test.ts`
Expected: PASS — `ℹ pass 23`, `ℹ fail 0`.

Se o primeiro PATCH der 200 com `tags` vazio: o teste e a rota carregaram dois `work-async-storage.external.js` diferentes — conferir que o import dinâmico do teste resolve para o mesmo arquivo de `node_modules/next` que o `next/cache` da rota. Se faltar só `bio-loja:`/`bio-pagina:`, o `invalidarBio` do PR 2 não invalida o que a spec §6 pede: anotar e corrigir lá.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/link-da-bio/route.ts apps/web/src/app/api/link-da-bio/route.test.ts
git commit -m "feat(link-da-bio): PATCH /api/link-da-bio with optimistic lock and cache invalidation"
```

### Task 4: Rotas de slug e de relatório

**Files:**
- Create: `apps/web/src/app/api/link-da-bio/slug/route.ts`
- Create: `apps/web/src/app/api/link-da-bio/relatorio/route.ts`
- Test: `apps/web/src/app/api/link-da-bio/route.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2 (`lojaDoPainel`, `motivoDoSlug`, `periodoDoRelatorio`, `resposta`, tipos); `slugDisponivel(slug: string, tenantId: string): Promise<boolean>`, `relatorioBio(tenantId: string, desde: string, ate: string): Promise<RelatorioBio>` de `@/lib/stores/bio-pages` (PR 2).
- Produces:
  - `GET /api/link-da-bio/slug?valor=` → 200 `RespostaDoSlug` | 401/403 (texto) | 500 `{ error: "Não deu pra conferir o endereço." }`
  - `GET /api/link-da-bio/relatorio?dias=7|30` → 200 `RelatorioBio` | 400 `{ error: "Use dias=7 ou dias=30." }` | 401/403 | 500 `{ error: "Não deu pra carregar os números." }`

- [ ] **Step 1: Write the failing test**

No `route.test.ts`:

1. Acrescentar o import `import { dayBR, dayBRAgo } from "@/lib/date-br";` (depois do de `@/lib/brand`) e trocar o import de tipos de `@/lib/bio/painel-api` por `import type { CorpoDoPatchBio, ErroDoPainelBio, RespostaDoSlug } from "@/lib/bio/painel-api";`.
2. Depois de `let PATCH: Rota;`: `let getSlug: Rota;` e `let getRelatorio: Rota;`.
3. Ao fim do array `HANDLERS`:

```ts
  ["GET /api/link-da-bio/slug", (h) => getSlug(pedir("GET", "/api/link-da-bio/slug?valor=atelie-novo", undefined, h))],
  ["GET /api/link-da-bio/relatorio", (h) => getRelatorio(pedir("GET", "/api/link-da-bio/relatorio?dias=7", undefined, h))],
```

4. No `before`, depois da linha do import de `./route`:

```ts
  ({ GET: getSlug } = await import("./slug/route"));
  ({ GET: getRelatorio } = await import("./relatorio/route"));
```

5. No fim do arquivo:

```ts
// ---- slug ----

test("slug: formato e reservado respondem sem consultar o banco", async () => {
  const casos: Array<[valor: string, motivo: "formato" | "reservado"]> = [
    ["", "formato"],
    ["ab", "formato"],
    ["Minha-Loja", "formato"],
    ["minha loja", "formato"],
    ["a".repeat(41), "formato"],
    ["admin", "reservado"],
    ["girumo-moda", "reservado"],
    ["loja-hubflow", "reservado"],
  ];
  for (const [valor, motivo] of casos) {
    const r = await getSlug(pedir("GET", `/api/link-da-bio/slug?valor=${encodeURIComponent(valor)}`));
    assert.equal(r.status, 200, valor);
    assert.deepEqual(await r.json(), { disponivel: false, motivo }, valor);
  }
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/rest/v1/bio_")).length, 0);
});

test("slug: livre; desta loja (atual ou antigo) está livre; de outra loja (atual ou antigo) está em uso", async () => {
  comPagina();
  const casos: Array<[valor: string, esperado: RespostaDoSlug]> = [
    ["atelie-novo", { disponivel: true }],
    ["atelie-ouro-prata", { disponivel: true }],
    ["atelie-antigo", { disponivel: true }],
    ["atelie-concorrente", { disponivel: false, motivo: "em-uso" }],
    ["concorrente-antigo", { disponivel: false, motivo: "em-uso" }],
  ];
  for (const [valor, esperado] of casos) {
    const r = await getSlug(pedir("GET", `/api/link-da-bio/slug?valor=${valor}`));
    assert.deepEqual(await r.json(), esperado, valor);
  }
  soDaLoja();
});

// ---- relatório ----

test("relatório: 7 e 30 dias contando hoje, da loja da sessão, agregado no banco", async () => {
  for (const [dias, atras] of [["7", 6], ["30", 29]] as const) {
    chamadas.length = 0;
    // A rota lê o relógio sozinha: perto da meia-noite de Brasília o dia pode virar no meio do teste.
    const antes = new Date();
    const r = await getRelatorio(pedir("GET", `/api/link-da-bio/relatorio?dias=${dias}`));
    const depois = new Date();
    assert.equal(r.status, 200, dias);
    assert.deepEqual(await r.json(), RELATORIO);
    const rpc = chamadas.find((c) => c.url.pathname === "/rest/v1/rpc/bio_relatorio");
    const { p_desde, p_ate } = rpc?.corpo as { p_desde: string; p_ate: string };
    assert.ok([dayBR(antes), dayBR(depois)].includes(p_ate), p_ate);
    assert.ok([dayBRAgo(atras, antes), dayBRAgo(atras, depois)].includes(p_desde), p_desde);
    soDaLoja();
  }
});

test("relatório: dias fora de 7 e 30 é 400, sem consultar o banco", async () => {
  for (const consulta of ["", "?dias=", "?dias=14", "?dias=7.0", "?dias=30d"]) {
    const r = await getRelatorio(pedir("GET", `/api/link-da-bio/relatorio${consulta}`));
    assert.equal(r.status, 400, consulta);
    assert.equal(typeof ((await r.json()) as ErroDoPainelBio).error, "string");
  }
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/rest/v1/rpc/")).length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/link-da-bio/route.test.ts`
Expected: FAIL — o `before` cai com `Cannot find module './slug/route'` e todos os testes falham.

- [ ] **Step 3: Escrever a rota do slug**

```ts
// apps/web/src/app/api/link-da-bio/slug/route.ts
import { lojaDoPainel, motivoDoSlug, resposta, type ErroDoPainelBio, type RespostaDoSlug } from "@/lib/bio/painel-api";
import { slugDisponivel } from "@/lib/stores/bio-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/link-da-bio/slug?valor= — o endereço serve para esta loja? (spec §9). `em-uso` inclui slug
 * que já foi de outra loja (slug usado nunca volta para outra, spec §2); o atual ou um antigo desta
 * loja está livre. Sem normalizar: o painel manda o slug já no formato de `SLUG_BIO`.
 */
export async function GET(req: Request): Promise<Response> {
  const loja = await lojaDoPainel(req, "ler");
  if (loja instanceof Response) return loja;
  const valor = new URL(req.url).searchParams.get("valor") ?? "";
  const ruim = motivoDoSlug(valor);
  if (ruim) return resposta({ disponivel: false, motivo: ruim } satisfies RespostaDoSlug, 200);
  try {
    const corpo: RespostaDoSlug = (await slugDisponivel(valor, loja.tenantId))
      ? { disponivel: true }
      : { disponivel: false, motivo: "em-uso" };
    return resposta(corpo, 200);
  } catch (e) {
    console.error(`[api/link-da-bio/slug] ${loja.tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não deu pra conferir o endereço." } satisfies ErroDoPainelBio, 500);
  }
}
```

- [ ] **Step 4: Escrever a rota do relatório**

```ts
// apps/web/src/app/api/link-da-bio/relatorio/route.ts
import { lojaDoPainel, periodoDoRelatorio, resposta, type ErroDoPainelBio } from "@/lib/bio/painel-api";
import { relatorioBio } from "@/lib/stores/bio-pages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/link-da-bio/relatorio?dias=7|30 — visitas e toques dos últimos N dias contando hoje, em
 * Brasília (spec §7). Agregado no SQL (`bio_relatorio`): nenhuma linha crua passa pelo teto de 1000
 * do PostgREST.
 */
export async function GET(req: Request): Promise<Response> {
  const loja = await lojaDoPainel(req, "ler");
  if (loja instanceof Response) return loja;
  const periodo = periodoDoRelatorio(new URL(req.url).searchParams.get("dias"));
  if (!periodo) return resposta({ error: "Use dias=7 ou dias=30." } satisfies ErroDoPainelBio, 400);
  try {
    return resposta(await relatorioBio(loja.tenantId, periodo.desde, periodo.ate), 200);
  } catch (e) {
    console.error(`[api/link-da-bio/relatorio] ${loja.tenantId}: ${(e as Error).message}`);
    return resposta({ error: "Não deu pra carregar os números." } satisfies ErroDoPainelBio, 500);
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/link-da-bio/route.test.ts`
Expected: PASS — `ℹ pass 27`, `ℹ fail 0`. As linhas `[api/link-da-bio…]` no stderr são dos testes "banco fora" e "invalidar falha", e esperadas.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/link-da-bio/slug/route.ts apps/web/src/app/api/link-da-bio/relatorio/route.ts apps/web/src/app/api/link-da-bio/route.test.ts
git commit -m "feat(link-da-bio): slug availability and visit report routes"
```

### Task 5: e2e — o dono lê pelo banco de verdade; a vendedora leva 403

**Files:**
- Create: `apps/web/e2e/link-da-bio-api.spec.ts`
- Modify: `apps/web/e2e/vendas-vendedora.spec.ts` (um teste novo, depois de "as rotas da integração do site respondem 403 para ela")

**Interfaces:**
- Consumes: as rotas das Tasks 2–4; `BASE_URL`, `ESTADO_LOGADO` de `./caminhos`; `TEM_CREDENCIAIS` de `./sessao-helpers`; `MENSAGEM_BLOQUEIO` (já importado no spec da vendedora).
- Produces: prova no CI de que as consultas do PR 2, os grants do PR 1 e o `bio_relatorio` respondem pelo Supabase de dev (o teste de rota usa um PostgREST de mentira), e de que a vendedora leva 403 nas cinco chamadas no app de verdade.

- [ ] **Step 1: Escrever o spec do dono (só leitura)**

```ts
// apps/web/e2e/link-da-bio-api.spec.ts
import { expect, request as novoRequest, test } from "@playwright/test";

import { BASE_URL, ESTADO_LOGADO } from "./caminhos";
import { TEM_CREDENCIAIS } from "./sessao-helpers";

/**
 * A API do painel do link da bio contra o banco de dev de verdade (spec 2026-10-19-link-da-bio §9).
 * O teste de rota roda contra um PostgREST de mentira; aqui as consultas do PR 2, os grants do
 * PR 1 e o `bio_relatorio` respondem pelo Supabase real. Só leitura: criar e salvar ficam com o
 * e2e do painel (PR 6a), que limpa o que cria.
 */

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

type Painel = {
  pagina: { tenantId: string } | null;
  campanhas: unknown[];
  dominio: string | null;
  origemGirumo: string;
  sugestaoSlug: string;
  linksEscondidos: unknown[];
};

test.describe("API do link da bio: o dono lê pelo banco de verdade", () => {
  test.skip(!TEM_CREDENCIAIS, "Precisa do usuário de QA (E2E_EMAIL/E2E_PASSWORD).");

  test("GET, slug e relatório respondem com o contrato do §9", async () => {
    const api = await novoRequest.newContext({ baseURL: BASE_URL, storageState: ESTADO_LOGADO });
    try {
      const me = (await (await api.get("/api/auth/me")).json()) as { tenantId?: string | null };

      const painel = await api.get("/api/link-da-bio");
      expect(painel.status()).toBe(200);
      const corpo = (await painel.json()) as Painel;
      if (corpo.pagina) expect(corpo.pagina.tenantId).toBe(me.tenantId);
      expect(Array.isArray(corpo.campanhas)).toBe(true);
      expect(Array.isArray(corpo.linksEscondidos)).toBe(true);
      expect(corpo.origemGirumo).toMatch(/^https?:\/\/[^/]+$/);
      expect(corpo.sugestaoSlug).toMatch(SLUG);
      expect(corpo.sugestaoSlug.length).toBeGreaterThanOrEqual(3);
      expect(corpo.sugestaoSlug.length).toBeLessThanOrEqual(40);

      const reservado = await api.get("/api/link-da-bio/slug?valor=girumo");
      expect(await reservado.json()).toEqual({ disponivel: false, motivo: "reservado" });
      // Endereço que ninguém usou: o `slugDisponivel` consulta `bio_slugs` de verdade.
      const livre = await api.get(`/api/link-da-bio/slug?valor=e2e-livre-${Date.now()}`);
      expect(await livre.json()).toEqual({ disponivel: true });

      const relatorio = await api.get("/api/link-da-bio/relatorio?dias=7");
      expect(relatorio.status()).toBe(200);
      const numeros = (await relatorio.json()) as { visitas: unknown; toques: unknown; porLink: unknown; porDia: unknown };
      expect(typeof numeros.visitas).toBe("number");
      expect(typeof numeros.toques).toBe("number");
      expect(Array.isArray(numeros.porLink)).toBe(true);
      expect(Array.isArray(numeros.porDia)).toBe(true);
    } finally {
      await api.dispose();
    }
  });
});
```

- [ ] **Step 2: Acrescentar o teste da vendedora**

Em `apps/web/e2e/vendas-vendedora.spec.ts`, logo depois do teste `as rotas da integração do site respondem 403 para ela` (antes de `página fora do acesso mostra o bloqueio e volta para Vendas`):

```ts
  test("as rotas do link da bio respondem 403 para ela", async () => {
    // Mapa de módulos fechado por padrão (lib/auth/modulos.ts): /api/link-da-bio nasce fora do
    // acesso dela (spec 2026-10-19-link-da-bio §8, "Vendedora não vê").
    const respostas = [
      ["GET /api/link-da-bio", await page.request.get("/api/link-da-bio")],
      ["POST /api/link-da-bio", await page.request.post("/api/link-da-bio")],
      // Corpo no formato do envelope: o 403 tem de vir do guard, não de uma validação.
      ["PATCH /api/link-da-bio", await page.request.patch("/api/link-da-bio", {
        data: { versao: 1, slug: "loja-e2e", publicada: false, documento: {} },
      })],
      ["GET /api/link-da-bio/slug", await page.request.get("/api/link-da-bio/slug?valor=loja-e2e")],
      ["GET /api/link-da-bio/relatorio", await page.request.get("/api/link-da-bio/relatorio?dias=7")],
    ] as const;
    for (const [rota, resposta] of respostas) {
      expect(resposta.status(), rota).toBe(403);
      expect(await resposta.text(), rota).toBe(MENSAGEM_BLOQUEIO);
    }
  });
```

- [ ] **Step 3: Checar os tipos dos specs**

Run: `npx tsc --noEmit --project tsconfig.e2e.json`
Expected: sem saída, exit 0.

O e2e roda só no CI (precisa do usuário de QA e do banco de dev): o job `e2e` do PR é a primeira execução real dos dois specs.

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e/link-da-bio-api.spec.ts apps/web/e2e/vendas-vendedora.spec.ts
git commit -m "test(e2e): link-da-bio API against dev, and 403 for the seller on every route"
```

### Task 6: Gate, revisão de segurança, PR, merge e quadro

**Files:** nenhum novo (só o que as revisões pedirem).

- [ ] **Step 1: Gate local**

Em `apps/web`:

```bash
npm run lint
npx tsc --noEmit --project tsconfig.json
npx tsc --noEmit --project tsconfig.e2e.json
npm test
```

Expected: lint sem erro; os dois `tsc` sem saída; `npm test` com `ℹ fail 0` (inclui `painel-api.test.ts` e `route.test.ts`).

Na raiz do worktree, em PowerShell: `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1`
Expected: termina sem nenhuma linha `… falhou: exit …`, exit 0.

- [ ] **Step 2: Revisão de segurança (obrigatória, spec §10)**

Despachar o agente **Security Engineer** com o diff `git diff origin/main...HEAD` e este roteiro:

1. Toda leitura e gravação usa o `tenantId` de `getRouteTenantContext`; o corpo nunca escolhe loja (`z.strictObject`); as funções do PR 2 chamadas aqui filtram `tenant_id` (`bio_pages`, `campaign_groups`, `instances`, `uploads`, `custom_domains`) ou `id` (`organizations`).
2. `POST`/`PATCH` exigem `campaign:edit`; a vendedora e papel desconhecido param no guard de módulo; nenhuma rota nova entrou em `lib/auth/modulos.ts`.
3. Validação antes de gravar: envelope, `documentoBio`, slug (`SLUG_BIO`: o lookahead de 3–40 barra o tamanho antes do padrão; depois `slugReservado`), `conferirDocumentoDaLoja` (mídia, campanha, número conectado).
4. Nenhuma mensagem do banco na resposta; logs só com `tenantId` e a mensagem do erro.
5. `origemGirumo` vem de `getPublicSiteUrl()`, nunca de `Host`/`Origin`.
6. `/slug` revela que um endereço já foi usado: só com sessão, e é a mesma informação que o 404/301 público dá.
7. As tabelas `bio_*` sem policy e sem grant para `authenticated` (PR 1): o token da vendedora não lê nada pelo PostgREST (achado "RLS não filtra papel").

CRITICAL/HIGH → corrigir, rodar o Step 1 de novo e commitar `fix(link-da-bio): …`.

- [ ] **Step 3: Abrir o PR**

```bash
git push -u origin feat/link-da-bio-pr5-api-painel
```

Em PowerShell (o `'@` de fechamento na coluna 0):

```powershell
gh pr create --base main --title "feat(link-da-bio): panel API (/api/link-da-bio, slug, report)" --body @'
## O que entra
- `GET /api/link-da-bio`: página, campanhas com o slug do link mestre, domínio ativo, origem Girumo, sugestão de endereço e links escondidos
- `POST /api/link-da-bio`: cria a página fora do ar (idempotente, 201)
- `PATCH /api/link-da-bio`: salva com trava por versão; 400 com campo, 404, 409 versao/slug; invalida o cache do slug novo e do antigo
- `GET /api/link-da-bio/slug?valor=` e `GET /api/link-da-bio/relatorio?dias=7|30`
- `lib/bio/painel-api.ts`: o que as três rotas repartem + os tipos que o painel (6a/6b) importa

Spec: docs/superpowers/specs/2026-10-19-link-da-bio-design.md (§8–§10). Plano: docs/superpowers/plans/2026-10-19-link-da-bio-pr5-api-painel.md.

## Segurança
- POST/PATCH com `campaign:edit`; a vendedora leva 403 do guard de módulo em todas (teste de rota + e2e)
- Revisão de segurança: <resultado do Step 2>

## Test plan
- [x] `route.test.ts` (27) contra PostgREST falso e `painel-api.test.ts` (2)
- [x] `verify-local.ps1`
- [ ] job e2e: `link-da-bio-api.spec.ts` (dono, banco de dev) e o teste novo de `vendas-vendedora.spec.ts`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
'@
```

- [ ] **Step 4: CI verde e merge na mesma sessão**

```bash
gh pr checks <N> --watch
gh pr merge <N> --squash --delete-branch
```

Expected: todos os checks `pass` antes do merge (a `main` não tem proteção: merge à mão, só no verde). Check `e2e` vermelho com `processing` no log = corrida no banco de dev (rerun com `gh pr update-branch <N>`); outro vermelho = corrigir, nunca mergear.

- [ ] **Step 5: Quadro**

SQL em prod (`nidoatbxaylrkcgbszns`); o classificador recusa escrita em prod, então passar para o Igor rodar:

```sql
select key, status, blocker from public.board_features where key = 'link-da-bio';
-- Só se o status NÃO for em_construcao (move_card para o mesmo status não grava evento):
select public.move_card('link-da-bio', 'em_construcao', 'PR 5: API do painel (/api/link-da-bio, slug, relatório) mergeada', 'PR #<N>');
-- O move_card não mexe no blocker: reescrever com o que falta de verdade (conferir em git log origin/main).
update public.board_features
   set blocker = 'Falta o painel: <PRs que faltam, ex. 6a (aba Links, salvar, prévia), 3b, 6b, 7>. API do painel no ar (PR #<N>).'
 where key = 'link-da-bio';
```

- [ ] **Step 6: Grafo e encerramento**

`kg_insert_text` (source `decisao-<AAAA-MM-DD>-link-da-bio-pr5`) com: "Link da bio, API do painel: GET/slug/relatório sem assertPermission (a vendedora para no guard de módulo, rota fora do mapa); POST/PATCH com campaign:edit. Campanha tem link mestre = linha de tracked_links com slug = campaign_groups.slug e campaign_group_id = id, pela mesma linksMestresDasCampanhas (PR 2) que a página pública usa. O nome da loja vai cru para o documentoPadrao, que corta. O PATCH lê a página antes para ter o slug antigo e invalida slug novo e antigo; falha de invalidação vira log e 200."

Remover o worktree do PR (`git worktree remove .claude/worktrees/link-da-bio-pr5`, na raiz do checkout principal) e reportar: "PRs que deixei abertos: nenhum" (ou o número e o motivo).

---

## Critérios de aceite do PR

- `GET /api/link-da-bio` devolve exatamente as chaves do §9, com `origemGirumo = getPublicSiteUrl()`, `dominio` só de domínio ativo, `campanhas[].slug` nulo para campanha sem link mestre, `sugestaoSlug` livre e fora dos reservados, e `linksEscondidos` do `estadoDosLinks`.
- `POST` cria uma página só por loja (inclusive com dois pedidos simultâneos), fora do ar, com `documentoPadrao`, o nome da loja entregue cru (o `documentoPadrao` corta em 60 sem meio emoji) e o primeiro link mestre; com página, devolve a existente com 201.
- `PATCH` segue a ordem do §9; responde 400 com `campo`, 404, 409 `versao`/`slug` (texto do 409 "versao" igual ao do §8); grava só com `campaign:edit`; invalida o slug novo e o antigo; falha de invalidação não vira 500.
- `/slug` responde `formato`/`reservado` sem tocar no banco e `em-uso` para slug atual ou antigo de outra loja; slug atual ou antigo da própria loja está livre.
- `/relatorio` aceita só 7 e 30, janela contando hoje em Brasília, filtrada pela loja.
- Vendedora: 403 `MENSAGEM_BLOQUEIO` nas cinco chamadas (teste de rota e e2e); sem sessão: 401; loja sem membership: 403; nada da loja é lido antes da recusa.
- Toda chamada a tabela com `tenant_id` levou a loja da sessão (`soDaLoja`).
- `npm test`, lint, os dois `tsc`, `verify-local.ps1` e o CI (incluindo o job e2e) verdes; revisão de segurança sem CRITICAL/HIGH aberto.

## Comandos de verificação

Em `apps/web`:

```bash
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/painel-api.test.ts
npx tsx --import ./src/test/server-only-shim.mjs --test src/app/api/link-da-bio/route.test.ts
npm run lint
npx tsc --noEmit --project tsconfig.json
npx tsc --noEmit --project tsconfig.e2e.json
npm test
```

Na raiz do worktree: `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1`. Depois do merge, com a sessão do painel em prod (Bearer do `authenticatedFetch` ou cookie): `GET https://www.girumo.com.br/api/link-da-bio` responde 200 para a dona e 403 `Área não liberada para o seu acesso.` para uma vendedora.

## Riscos e pontos de atenção

- **O teste de rota roda o código do PR 2 contra um PostgREST de mentira.** O falso imita o que o supabase-js manda (conferido em 2.108); operador, embed ou RPC que ele não conheça vira 500 `falso: …`. Corrigir o falso, nunca a asserção. O e2e do dono (Task 5) é o contraponto contra o banco de verdade.
- **Interno do Next no teste** (`next/dist/server/app-render/work-async-storage.external`, `pendingRevalidatedTags`, `globalThis.AsyncLocalStorage`): numa atualização do Next o teste do PATCH quebra alto; ajustar só o `comCacheDoNext`.
- **GET com página lê `campaign_groups` e `tracked_links` duas vezes**: no `campanhasDaLoja` (todas as campanhas) e dentro do `estadoDosLinks` (só as do documento). Dois pedidos curtos a mais por abrir o editor; juntar só se medir lento, nunca duplicando a regra do link mestre fora do `linksMestresDasCampanhas`.
- **401/403 em texto**: vêm dos helpers (`getTenantContext`, `assertPermission`), como em todo o painel. O 6a lê `res.status` antes de `res.json()` (padrão `erroDaResposta` de `configuracoes/bling.tsx`) e trata 401 como sessão (página abre + API 401 = revogação, não "sem internet").
- **Mensagem do 400 do documento** é a do zod do PR 2: em português para o que o lojista pode causar ("Escreva o texto do botão."); erro estrutural (chave a mais, tipo trocado, foco fora de 0..1) pode sair com a padrão do zod, em inglês. Esse só chega a quem burlar o painel, que valida antes com o mesmo `documentoBio`.
- **Pedágio do Bearer no middleware** (+175 ms por chamada): o 6a chama o `GET` uma vez ao abrir; o 6b confere o slug com atraso (spec §8), nunca a cada tecla.
- **Sem normalização de slug no servidor**: o 6b normaliza ao digitar (minúsculas, sem acento, espaço → hífen) com o `SLUG_BIO`; mandar "Minha-Loja" dá `formato`.
- **Função do PR 2 que engole erro de banco** faz o teste "banco fora" falhar com 200: é silent failure do PR 2 — anotar e corrigir lá.
- **Não acrescentar `/api/link-da-bio` em `lib/auth/modulos.ts`**: é o que mantém a vendedora fora.

## Interface com os outros PRs

**Exporta (este PR):**

`apps/web/src/lib/bio/painel-api.ts` (`server-only`; o painel importa só os tipos, com `import type`):

```ts
export type CampanhaDoPainel = { id: string; nome: string; slug: string | null };
export type RespostaDoPainelBio = {
  pagina: PaginaBio | null; campanhas: CampanhaDoPainel[]; dominio: string | null;
  origemGirumo: string; sugestaoSlug: string; linksEscondidos: string[];
};
export type CorpoDoPatchBio = { versao: number; slug: string; publicada: boolean; documento: DocumentoBio };
export type MotivoDoSlug = "formato" | "reservado" | "em-uso";
export type RespostaDoSlug = { disponivel: true } | { disponivel: false; motivo: MotivoDoSlug };
export type ErroDoPainelBio = { error: string; campo?: string; motivo?: "versao" | "slug" };
export function motivoDoSlug(slug: string): Exclude<MotivoDoSlug, "em-uso"> | null;
export function periodoDoRelatorio(dias: string | null, agora?: Date): { desde: string; ate: string } | null;
export function resposta(corpo: unknown, status: number): Response;
export function lojaDoPainel(req: Request, acao: "ler" | "editar"): Promise<{ tenantId: string } | Response>;
export function campanhasDaLoja(tenantId: string): Promise<CampanhaDoPainel[]>;
export function sugerirSlug(nome: string, tenantId: string): Promise<string>;
```

HTTP (o 6a e o 6b chamam por `authenticatedFetch`; toda resposta da rota com `cache-control: no-store`):

| Chamada | Sucesso | Erros |
|---|---|---|
| `GET /api/link-da-bio` | 200 `RespostaDoPainelBio` | 401/403 texto · 500 `{ error }` |
| `POST /api/link-da-bio` (sem corpo) | 201 `PaginaBio` (nova ou a existente) | 401/403 texto · 500 `{ error }` |
| `PATCH /api/link-da-bio` (corpo `CorpoDoPatchBio`) | 200 `PaginaBio` | 400 `{ error, campo? }` · 404 `{ error }` · 409 `{ error, motivo: "versao" \| "slug" }` · 401/403 texto · 500 `{ error }` |
| `GET /api/link-da-bio/slug?valor=` | 200 `RespostaDoSlug` | 401/403 texto · 500 `{ error }` |
| `GET /api/link-da-bio/relatorio?dias=7\|30` | 200 `RelatorioBio` | 400 `{ error }` · 401/403 texto · 500 `{ error }` |

- Endereço principal no painel (spec §8): `dominio ? \`https://${dominio}/\` : \`${origemGirumo}/bio/${pagina.slug}\``.
- `campo` do 400: `versao` | `slug` | `publicada` | `documento` | caminho relativo ao documento (`links.2.numero`, mesmo formato do `conferirDocumentoDaLoja`); ausente para corpo inteiro inválido. O caminho vazio do PR 2 (chave a mais na raiz do documento) sai como `documento`.
- 409 `versao`: `error` = "Outra pessoa salvou antes. Recarregue pra ver a versão nova." (texto do §8, para o painel mostrar com o botão Recarregar).
- Com página, `sugestaoSlug` = `pagina.slug`.
- 401 = sessão (Bearer inválido ou cookie revogado); 403 em texto = loja sem membership, vendedora (`MENSAGEM_BLOQUEIO`) ou papel sem `campaign:edit`.

**Usa (de outros PRs):**

- PR 2, `@/lib/bio/documento`: `documentoBio: z.ZodType<DocumentoBio>`, `documentoPadrao(i: { nome: string; campanhaId: string | null }): DocumentoBio` (apara, corta o nome em 60 sem partir emoji, vazio → "Minha loja": este PR entrega o nome cru), `SLUG_BIO: RegExp` (`/^(?=.{3,40}$)[a-z0-9]+(-[a-z0-9]+)*$/`, já com o 3–40: este PR não confere tamanho à parte), `slugReservado(slug: string): boolean`, `type DocumentoBio`, `type LinkBio` (teste). Os novos `UUID_BIO` e `linkBio` não são usados aqui: o PATCH valida o documento inteiro com `documentoBio`, e os uuids do teste já são minúsculos.
- PR 2, `@/lib/bio/conferir`: `conferirDocumentoDaLoja(tenantId: string, documento: DocumentoBio): Promise<{ ok: true } | { ok: false; error: string; campo: string }>`, `estadoDosLinks(tenantId: string, documento: DocumentoBio): Promise<Pick<DadosRender, "campanhas" | "linksEscondidos">>`, `linksMestresDasCampanhas(tenantId: string, campanhas: readonly Pick<CampaignGroup, "id" | "slug">[]): Promise<Record<string, string>>` (campanhaId → slug, só com link mestre; o `campanhasDaLoja` usa a mesma função que o `estadoDosLinks`).
- PR 2, `@/lib/stores/tracked-links` (pelo `linksMestresDasCampanhas`): `listTrackedLinksBySlugs(tenantId, slugs)` = `GET tracked_links?select=slug,campaign_group_id&tenant_id=eq.<t>&slug=in.(…)`, em lotes de 100, sem pedido quando não há slug. É esse pedido que o PostgREST falso responde (e o teste "GET sem página" confere).
- PR 2, `@/lib/stores/bio-pages`: `lerPaginaDaLoja(tenantId: string): Promise<PaginaBio | null>`, `criarPaginaDaLoja(tenantId: string, slug: string, documento: DocumentoBio): Promise<PaginaBio>`, `salvarPaginaDaLoja(tenantId: string, e: { versao: number; slug: string; publicada: boolean; documento: DocumentoBio }): Promise<{ ok: true; pagina: PaginaBio } | { ok: false; motivo: "versao" | "slug" | "sem-pagina" }>`, `slugDisponivel(slug: string, tenantId: string): Promise<boolean>` (não confere formato nem reservado: este PR confere antes), `relatorioBio(tenantId: string, desde: string, ate: string): Promise<RelatorioBio>`, `type PaginaBio`, `type RelatorioBio`. O 23505 é classificado pelo texto: `bio_pages_tenant_id_key` → a página que já existe; `bio_pages_slug_key` ou `bio_slugs` → slug tomado.
- PR 2, `@/lib/bio/cache`: `invalidarBio(i: { tenantId: string; paginaId: string; slugs: string[] }): void` (tags `bio-slug:<slug>`, `bio-loja:<tenantId>`, `bio-pagina:<id>`, spec §6).
- PR 1 (pelo PR 2): `bio_pages` (unique `tenant_id` = `bio_pages_tenant_id_key`, unique `slug` = `bio_pages_slug_key`), `bio_slugs` + gatilho `bio_pages_registra_slug` (23505 `bio_slugs: o slug "<slug>" já foi de outra página`), `bio_relatorio(p_tenant, p_desde, p_ate)` com grant para `service_role`; RLS sem policy e sem grant para `anon`/`authenticated`.
- Já em `main`: `getRouteTenantContext`, `assertPermission`, `MENSAGEM_BLOQUEIO` (guard de módulo), `listCampaignGroups`, `getCustomDomain`, `getOrganizationProfile`, `getPublicSiteUrl`, `slugify`/`randomSuffix` (`lib/pages/slug.ts`), `dayBR`/`dayBRAgo`.
- Não usa 3a, 3b, 4a nem 4b.
