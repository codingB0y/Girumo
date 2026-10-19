# Link da bio — PR 2: núcleo (documento, cores, store, conferência e cache) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar o núcleo do link da bio com os nomes do §9: o documento validado (`documento.ts`), as cores de cada modelo com contraste garantido (`cores.ts`), o `escapeHtml` com apóstrofo, o store `bio-pages.ts`, a conferência contra a loja (`conferir.ts`) e o cache da página pública (`cache.ts`).

**Architecture:** A Parte 1 é pura (roda no navegador e no servidor): um schema zod é a única fonte da validação e da normalização, e `coresDoModelo` devolve as variáveis CSS do modelo já conferidas (texto 4,5:1, ícone e seta 3:1, anel de foco 3:1). A Parte 2 é servidor: o store espelha `landing-pages.ts` (insert com nova tentativa de slug, update condicional pela versão), a conferência só consulta o que o documento usa, e o cache tem dois passos de `unstable_cache` — achar a página pela chave e guardar o núcleo já com as tags da loja e da página.

**Tech Stack:** TypeScript strict, zod 4.4.3, `@supabase/supabase-js` 2.108.2 (service role), Next 15.5 (`next/cache`), `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` — §3 (contraste), §4, §6 (cache), §7 (`contarBio`), §9 até `lib/bio/cache.ts`, §10 (escape)

**Índice da série:** `docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md` · **Depende de:** PR 1 (banco), só a Parte 2 · **Card:** `link-da-bio` (prod, `em_construcao`)

## Duas partes, dois PRs

São 14 arquivos de código. Cada parte tem branch, PR e merge próprios:

| Parte | Arquivos | Branch | Precisa em `main` | Libera |
|---|---|---|---|---|
| 1 — documento, cores, escape (Tasks 1–6) | `lib/campaigns/entry-page.ts`, `lib/bio/documento.ts`, `lib/bio/cores.ts` e os 3 testes (6) | `feat/link-da-bio-pr2a-documento` | nada: não toca o banco | PR 3a |
| 2 — store, conferência, cache (Tasks 7–10) | `lib/stores/bio-pages.ts`, `lib/bio/conferir.ts`, `lib/bio/cache.ts` e os 3 testes, `lib/media-store.ts`, `lib/stores/tracked-links.ts` (8) | `feat/link-da-bio-pr2b-store` | PR 1 e a Parte 1 | PRs 4a, 4b e 5 |

A Parte 1 pode entrar em `main` antes do PR 1 (é código puro, ninguém importa ainda); o 3a começa assim que ela entra.

## Decisões deste plano (onde a spec não dizia, ou dizia diferente do que se mediu)

1. **Anel de foco.** O §3 só tratou o Romaneio, mas o dourado das paletas prontas reprova em outros modelos: no Etiqueta, `azul` tem 1,92:1 contra `fundo1` e 2,60:1 contra `fundo2`, `rosa` 2,89:1 e `menta` 2,66:1 contra `fundo1`; no Clássico `azul`, 2,60:1 contra `fundo2`. Regra (prontas e marca): `--foco` é o anel **onde ficam os links** — Etiqueta `fundo1`, `fundo2` e `fundo3` (as etiquetas penduradas no degradê), Vitrine e Clássico `fundo2`, Romaneio `papel` (a nota). O foco da paleta fica onde passa (≥ 3:1 contra todos esses fundos); onde não passa, entre o texto daquele fundo (`--on`; no Romaneio `--tinta`), `#000000` e `#FFFFFF`, o de **maior contraste mínimo**. `--foco-fora` só existe no Romaneio, como o §3 manda: entre `--on`, `#000000` e `#FFFFFF`, o de maior contraste mínimo contra `fundo1`–`fundo3`. Dentro dos blocos de `--papel` do Etiqueta, Vitrine e Clássico (confere, endereço) o anel é `var(--tinta)` — o par tinta/papel já garante 4,5:1 —, que é o que o PR 3a faz. Resultado nas prontas: Etiqueta `azul`, `rosa` e `menta` → `#FFFFFF`, `grafite` fica `#D4AF37` (5,17:1 ou mais); Clássico `azul` → `#FFFFFF`; Vitrine e as outras do Clássico e do Romaneio ficam com o foco do mockup; `--foco-fora` do Romaneio: `kraft` `#000000` (6,07:1), `caneta`, `nota` e `azul` `#FFFFFF`.
2. **Cores da marca.** A `derivada` do mockup não fecha o contraste: o `garante` dele escolhe o extremo pela luminância do fundo (`> 0,4` → preto) e devolve, por exemplo, `garante("#888888", "#959595", 4.5)` = `#FFFFFF`, com 3,0:1; e o "escuro" dele (`lum < 0,4`) às vezes discorda do texto escolhido para a página. Aqui: escuro = o texto da página é branco; `garante` empurra a cor primeiro para o lado em que ela já está (texto escuro continua escuro) e só se não der vai para o outro; Vitrine, Romaneio e Clássico ganham os ajustes que as paletas prontas deles já fazem (o papel do confere acompanha o fundo; a nota é sempre clara; o acento é conferido contra o `chip`). Medido com o código deste plano: zero falha em 300 mil pares sorteados nos 4 modelos (1,2 milhão de conjuntos de tokens); o teste fica com 500 sorteados (semente fixa), os cinzas de 5 em 5 e três tons médios conhecidos (`#959595`, `#4B9F1D`, `#767676`).
3. **Pares de contraste além do `contraste.py`.** O script do mockup não via: o `--ico` usado como texto (Copiar CNPJ, título do confere), 4,5:1; `--tinta2` e `--ico` sobre o `--papel`; `--acento` e `--tinta` sobre o papel no Vitrine; `--on` sobre o `fundo3`. As 16 prontas passam nos pares novos sem mudar um hex (a mais justa: `rosa`, `--ico` sobre `--icobg`, 4,52:1). A lista vai exportada (`PARES_DE_CONTRASTE`): o renderizador só pinta texto com par desta lista. O véu da foto é fixo (`rgb(0 0 0 / .62)`, PR 3a): não há token de véu.
4. **Paletas prontas**: cópia hex por hex do `paletas.json` (`mks` → `azul`); a chave `avatar` do Clássico fica fora (o CSS não lê). Só o foco muda (item 1).
5. **`TokensBio`**: chave com `--` (`"--fundo1"`), valor `#RRGGBB` maiúsculo, só as variáveis que o CSS do modelo lê, numa ordem fixa (lista na Interface).
6. **CNPJ alfanumérico.** A Receita emite CNPJ com letras desde julho de 2026 (12 caracteres `[0-9A-Z]` + 2 dígitos verificadores; cada caractere vale o código ASCII − 48). O §9 diz "só dígitos": aqui o `cnpj` é guardado sem pontuação e em maiúsculas, numérico ou alfanumérico (`12.ABC.345/01DE-35` vale). Vazio continua valendo.
7. **NUL e meio emoji viram 400.** O `jsonb` recusa `\u0000` e surrogate solto — seria 500 no salvar. O schema recusa com mensagem no campo; o `documentoPadrao` corta o nome da loja em 60 sem partir um emoji.
8. **`SLUG_BIO` já tem o 3–40** (igual ao CHECK do PR 1). **`UUID_BIO` (novo)**: id de link e `campanhaId` são uuid minúsculo — o formato do CHECK `bio_contagens_alvo_check`; maiúsculo seria 23514 no `bio_contar`, então o schema recusa antes (400).
9. **`linkBio` (novo)**: o schema de um link sozinho, para a folha do painel (PR 6a). Garantias com teste, que o 6a usa: `links` é `z.discriminatedUnion("tipo", …)` (o erro chega em `links.N.campo`), a normalização é idempotente (o painel guarda o normalizado e a API valida de novo) e o `documentoPadrao` sempre passa no schema, com e sem campanha.
10. **Mídia da loja**: `midiasPublicasDaLoja` (nova) mora em `media-store.ts`, onde estão `encodeMediaId`/`decodeMediaId` (privados). Vale a mídia cujo id é o canônico do caminho, cujo caminho é da loja e que tem linha em `uploads` com `kind` `lp-media`/`lp-logo` — exatamente o que `/api/p/media/<id>` serve em página pública. Uma consulta para todas as mídias do documento.
11. **Link mestre** (a mesma regra do PR 5): linha de `tracked_links` com `slug` = slug da campanha **e** `campaign_group_id` = id dela. `listTrackedLinksBySlugs` (nova) busca pelos slugs: `slug` é único no banco inteiro, então volta no máximo uma linha por slug — sem o corte calado de 1000 linhas que `listTrackedLinks` sofre numa loja grande. Lotes de 100 slugs, porque o filtro vai na URL. `linksMestresDasCampanhas` (nova) é a função que o PR 5 pode usar no seletor de campanhas, para painel e página nunca discordarem.
12. **Número conectado**: `chaveDoTelefone` (DDD + 8 últimos; resolve o nono dígito) contra o telefone de **toda** instância da loja, conectada ou não. Vale para o botão de WhatsApp e para link `wa.me/…`, `api.whatsapp.com/send?phone=…` (e `web.whatsapp.com`, `whatsapp.com`).
13. **Leitura pública sem `tenant_id`** (a exceção que o §9 já prevê): `lerPublicadaPorSlug` acha a página por `bio_slugs` (slug atual ou antigo) e `lerPublicadaPorId` pelo id; as duas exigem `publicada = true` e `bloqueada_em is null`. O passo 2 do cache confere que a página relida ainda é da loja achada no passo 1.
14. **23505 pelo texto** (como o PR 1 entrega): `bio_pages_tenant_id_key` → a loja já tem página (o criar devolve a existente); `bio_pages_slug_key` ou `bio_slugs` → slug tomado (o criar tenta de novo com sufixo; o salvar devolve `motivo: "slug"`); outra unique → erro. `contarBio` recusa, sem chamar o banco, alvo que não seja `"visita"` nem uuid minúsculo.
15. **Cache em dois passos**: as tags de um `unstable_cache` são fixas antes de a função rodar, e a loja só se conhece depois de achar a página. Passo 1 (chave: slug, loja ou id) guarda só `{ id, tenantId, slug }`, com a tag da chave; passo 2 guarda o núcleo com `bio-loja:<loja>` e `bio-pagina:<id>`. Fora do Next, `unstable_cache` e `revalidateTag` lançam ("incrementalCache missing", "static generation store missing"): o teste cobre `montarNucleo` e as tags, e o caminho com cache se prova no e2e da rota pública (PR 4a).
16. **Textos.** O `documentoPadrao` cria o botão do grupo como no mockup: "Entrar no grupo VIP", "Kit novo e reposição saem primeiro no grupo", ícone `coroa`, sem principal; nome vazio vira "Minha loja". O @ do Instagram é guardado minúsculo e sem `@`. Mensagens do schema em português, no campo (`issue.path.join(".")`; chave desconhecida na raiz → campo `""`).

## Global Constraints

- Nomes do §9 exatamente como estão; nome novo só acrescenta (os novos estão marcados na Interface).
- `lib/bio/documento.ts` e `lib/bio/cores.ts` são puros: sem `server-only`, Supabase, `node:*` ou `process`. O PR 6a importa os dois no navegador (`crypto.randomUUID()` é global nos dois lados).
- Store e conferência com `import "server-only"` e `getSupabaseAdmin()`. O service role ignora RLS: **toda** query em tabela com `tenant_id` leva `.eq("tenant_id", …)` (CLAUDE.md). Exceções, só as do §9: `bio_slugs` por slug; `bio_pages` por id na leitura pública, sempre com `publicada = true` e `bloqueada_em is null`.
- Testes em `apps/web`: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`. Store e conferência contra PostgREST falso em `node:http` (padrão de `src/lib/stores/vendas.test.ts`), conferindo os filtros da URL. O falso nunca responde 503/520 (o supabase-js repete).
- Dados fictícios (repo público): nenhuma foto, nome, CNPJ ou telefone da loja-piloto; do mockup só as cores. CNPJ de exemplo `11.222.333/0001-81`, telefone `(62) 99999-0000`.
- Gate antes de cada push: `powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1` na raiz do worktree (os dois `tsc` e o build). PowerShell 5.1: sem `&&`.
- Commits em inglês com prefixo semântico; nada de `.env*`, segredo ou dado de cliente.

## Review Focus

- **Cor de marca em tom médio** (cinza `#959595`, verde `#4B9F1D`): branco e preto quase empatam; texto ≥ 4,5:1, ícone e seta ≥ 3:1 e anel ≥ 3:1 em todo modelo. Teste: Task 5 ("os tons do meio…", "500 cores de marca…").
- **O número que posta nos grupos, colado de outro jeito** (sem o nono dígito, `wa.me/55…`, `api.whatsapp.com/send/?phone=`): recusado no salvar e escondido na página, mesmo com o botão desligado. Teste: Task 8.
- **Request montado à mão ou texto colado** (id de link maiúsculo, `campanhaId` que não é uuid, NUL, meio emoji, chave a mais): 400 com o campo, nunca 500 do Postgres nem 23514 no `bio_contar`. Teste: Task 3; Task 7 ("contar…").
- **Slug que já foi de outra página**: continua tomado (inclusive o de página apagada); o antigo da própria página pode voltar. Teste: Task 7 ("slug disponível…", "salvar com slug de outra página…").
- **Loja grande** (mais de 1000 links rastreados ou de 100 campanhas): o link mestre continua achado. Teste: Task 8 ("muitas campanhas…").

## Arquivos

| Arquivo | Parte | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/campaigns/entry-page.ts` (+ `.test.ts`) | 1 | `escapeHtml` escapa também `'` |
| `apps/web/src/lib/bio/documento.ts` (+ `.test.ts`) | 1 | tipos e listas do §9, `documentoBio`, `linkBio`, `documentoPadrao` |
| `apps/web/src/lib/bio/cores.ts` (+ `.test.ts`) | 1 | contraste, paletas prontas, derivação da marca, anéis de foco |
| `apps/web/src/lib/stores/bio-pages.ts` (+ `.test.ts`) | 2 | o store do §9 |
| `apps/web/src/lib/media-store.ts` | 2 | + `midiasPublicasDaLoja` |
| `apps/web/src/lib/stores/tracked-links.ts` | 2 | + `listTrackedLinksBySlugs` |
| `apps/web/src/lib/bio/conferir.ts` (+ `.test.ts`) | 2 | mídia, campanha e número contra a loja; estado dos links |
| `apps/web/src/lib/bio/cache.ts` (+ `.test.ts`) | 2 | cache em dois passos, tags, invalidação |

Caminhos relativos à raiz do worktree; os comandos de teste rodam em `apps/web`, os de git na raiz (`git -C <worktree>` se o cwd resetar).

---

## Parte 1 — documento, cores e escape

### Task 1: Worktree da Parte 1 e `escapeHtml` com apóstrofo

**Files:**
- Modify: `apps/web/src/lib/campaigns/entry-page.ts:15-17` (`escapeHtml`)
- Test: `apps/web/src/lib/campaigns/entry-page.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `escapeHtml(s: string): string` escapando `& < > " '` (`'` → `&#39;`). O PR 3a passa todo texto do lojista por ela.

- [ ] **Step 1: worktree novo a partir de `origin/main`** (CLAUDE.md global: nunca `checkout -b` no checkout principal). Se a sessão já está num worktree novo, só `git switch -c feat/link-da-bio-pr2a-documento origin/main` nele. Senão:

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform fetch origin main && git -C /c/Users/Igor/Desktop/HubFlow-platform worktree add .claude/worktrees/link-da-bio-pr2a -b feat/link-da-bio-pr2a-documento origin/main
```

No worktree novo: `node_modules` por junction (ver "Ambiente do worktree" no índice). Depois, conferir que ninguém fez isto antes:

```bash
WT=$(git rev-parse --show-toplevel); git -C "$WT" ls-tree --name-only origin/main apps/web/src/lib/bio/; gh pr list --repo codingB0y/Girumo --state open --json number,title,headRefName | grep -i "bio"
```

Expected: o `ls-tree` não imprime nada (a pasta não existe em `main`) e nenhum PR aberto faz este núcleo (o do banco ou um só de docs da série pode aparecer). `documento.ts` já em `main` ou PR aberto com ele: **pare** e avise o Igor.

- [ ] **Step 2: Write the failing test** — em `apps/web/src/lib/campaigns/entry-page.test.ts`, trocar o import do topo

```ts
import { LOTADO_REASONS, lotadoRedirect, renderBlockedPage, renderEntryPage } from "./entry-page";
```

por

```ts
import { LOTADO_REASONS, escapeHtml, lotadoRedirect, renderBlockedPage, renderEntryPage } from "./entry-page";
```

e, logo antes da última linha (`console.log("entry-page.test ok");`), acrescentar:

```ts
// Os cinco caracteres perigosos, o apóstrofo inclusive (link da bio, spec §10). O & vai
// primeiro: senão o &lt; viraria &amp;lt;.
assert.equal(escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#39;");
assert.equal(escapeHtml("&lt;"), "&amp;lt;");
const comApostrofo = renderBlockedPage({ loja: "D'Ávila <Moda>", title: "Grupo cheio", message: "Volte amanhã" });
assert.match(comApostrofo, /D&#39;Ávila &lt;Moda&gt;/);
assert.doesNotMatch(comApostrofo, /D'Ávila/);
```

- [ ] **Step 3: Run test to verify it fails**

Run (em `apps/web`): `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/entry-page.test.ts`
Expected: FAIL — `AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:` com `actual: "&amp;&lt;&gt;&quot;'"` e `expected: '&amp;&lt;&gt;&quot;&#39;'`; `ℹ fail 1`.

- [ ] **Step 4: Implementar** — em `apps/web/src/lib/campaigns/entry-page.ts`, trocar

```ts
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
```

por

```ts
/**
 * Texto de fora (nome da loja, do grupo; no link da bio, todo texto do lojista) para dentro do
 * HTML. Escapa os cinco: com o apóstrofo também, um atributo que algum dia saia entre aspas
 * simples continua fechado (spec 2026-10-19-link-da-bio §10).
 */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

- [ ] **Step 5: Run tests to verify they pass** — a função também monta o HTML do `/r/` e a prévia do painel (`components/painel/campanhas/entrada-preview.tsx`, sem teste próprio); estas são as suítes que comparam esse HTML:

```bash
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/entry-page.test.ts src/lib/links/short-link-click.test.ts src/lib/painel/link-parado.test.ts
```

Expected: `entry-page.test ok` e `ℹ fail 0` (hoje são 1 + 10 + 4 testes). O e-mail tem `escapeHtml` próprio (`lib/email/invite-copy.ts`) e não muda.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/campaigns/entry-page.ts apps/web/src/lib/campaigns/entry-page.test.ts
git commit -m "fix(html): escape the apostrophe in escapeHtml"
```

### Task 2: `documento.ts` — tipos, listas, slug e uuid

**Files:**
- Create: `apps/web/src/lib/bio/documento.ts`
- Test: `apps/web/src/lib/bio/documento.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `MODELOS`, `Modelo`, `PALETAS`, `ICONES`, `Icone`, `MidiaRef`, `LinkBio`, `DocumentoBio`, `DadosRender`, `SLUG_BIO`, `SLUGS_RESERVADOS`, `slugReservado(slug: string): boolean` e `UUID_BIO` (novo) — tipos idênticos ao §9 (o `cnpj` aceita o alfanumérico, decisão 6).

- [ ] **Step 1: Write the failing test** — criar `apps/web/src/lib/bio/documento.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { ICONES, MODELOS, PALETAS, SLUG_BIO, UUID_BIO, slugReservado } from "./documento";

/** Dados fictícios: o repositório é público, nada da loja-piloto aqui. */
const L1 = "11111111-2222-4333-8444-555555555555";
const L3 = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

test("listas fechadas do contrato (spec §9)", () => {
  assert.deepEqual(MODELOS, ["etiqueta", "vitrine", "romaneio", "classico"]);
  assert.deepEqual(PALETAS, {
    etiqueta: ["azul", "rosa", "menta", "grafite"],
    vitrine: ["papel", "noite", "rose", "azul"],
    romaneio: ["kraft", "caneta", "nota", "azul"],
    classico: ["claro", "escuro", "lavanda", "azul"],
  });
  assert.equal(ICONES.length, 13);
  assert.ok(ICONES.includes("caminhao") && ICONES.includes("link"));
});

test("slug: 3 a 40, minúsculas, números e hífen simples", () => {
  for (const ok of ["abc", "loja-exemplo", "a1-b2-c3", "x".repeat(40)]) assert.ok(SLUG_BIO.test(ok), ok);
  for (const ruim of ["ab", "x".repeat(41), "Loja", "loja--x", "-loja", "loja-", "lója", "loja_x", "_dominio", "a b"]) {
    assert.equal(SLUG_BIO.test(ruim), false, ruim);
  }
});

test("slug reservado: a lista e qualquer um com girumo ou hubflow", () => {
  for (const s of ["_dominio", "admin", "api", "bio", "girumo", "painel", "login", "ajuda", "suporte", "loja-girumo-oficial", "hubflowx"]) {
    assert.equal(slugReservado(s), true, s);
  }
  assert.equal(slugReservado("loja-exemplo"), false);
});

test("uuid minúsculo, o formato do CHECK de bio_contagens.alvo", () => {
  assert.ok(UUID_BIO.test(L1));
  assert.equal(UUID_BIO.test(L3.toUpperCase()), false);
  assert.equal(UUID_BIO.test("visita"), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/documento.test.ts`
Expected: FAIL — `Error: Cannot find module './documento'`; `ℹ fail 1`.

- [ ] **Step 3: Criar `apps/web/src/lib/bio/documento.ts`** (sem import nenhum por enquanto):

```ts
/**
 * O documento do link da bio (spec 2026-10-19-link-da-bio §4 e §9): uma página = um JSON,
 * validado só aqui. Puro de propósito — o painel valida no navegador antes de salvar e a API
 * valida de novo no servidor, com o MESMO schema. Nada de server-only, Supabase ou Node.
 */

export const MODELOS = ["etiqueta", "vitrine", "romaneio", "classico"] as const;
export type Modelo = (typeof MODELOS)[number];

/** `azul` é a paleta que o mockup (paletas.json) chama de `mks`. */
export const PALETAS = {
  etiqueta: ["azul", "rosa", "menta", "grafite"],
  vitrine: ["papel", "noite", "rose", "azul"],
  romaneio: ["kraft", "caneta", "nota", "azul"],
  classico: ["claro", "escuro", "lavanda", "azul"],
} as const;

export const ICONES = [
  "whatsapp", "catalogo", "coroa", "mapa", "canal", "instagram", "site", "sacola",
  "etiqueta", "caminhao", "video", "cartao", "link",
] as const;
export type Icone = (typeof ICONES)[number];

/** `id` = `^[A-Za-z0-9_-]+$` (o id de `/api/p/media/<id>`); foco `x`,`y` em 0..1. */
export type MidiaRef = { id: string; foco: { x: number; y: number } | null };
type Base = { id: string; titulo: string; sub: string; icone: Icone; ativo: boolean };
export type LinkBio =
  | (Base & { tipo: "whatsapp"; destaque: boolean; numero: string; mensagem: string })
  | (Base & { tipo: "grupo"; destaque: boolean; campanhaId: string })
  | (Base & { tipo: "link"; destaque: boolean; url: string; fotos: MidiaRef[] })
  | (Base & { tipo: "endereco"; endereco: string; horario: string; foto: MidiaRef | null });
export type DocumentoBio = {
  v: 1;
  modelo: Modelo;
  /** De `PALETAS[modelo]` ou `"marca"`. */
  paleta: string;
  /** `#RRGGBB` maiúsculo; obrigatório quando `paleta = "marca"`. */
  cores: { fundo: string; botao: string } | null;
  animar: boolean;
  feitoComGirumo: boolean;
  perfil: {
    nome: string;
    frase: string;
    destaques: string[];
    local: string;
    instagram: string;
    capa: MidiaRef | null;
    capaAlt: string;
    logoClara: MidiaRef | null;
    logoEscura: MidiaRef | null;
  };
  /** `cnpj` sem pontuação: 14 dígitos (ou 12 letras/dígitos + 2 dígitos, o CNPJ alfanumérico). */
  confere: { ativo: boolean; razao: string; cnpj: string; linhas: string[] };
  rastreio: { metaPixelId: string; ga4Id: string };
  links: LinkBio[];
};

/**
 * O que o renderizador recebe. Mora aqui, e não no renderizador, porque o cache e o conferir
 * (PR 2) usam antes de o PR 3a existir.
 */
export type DadosRender = {
  documento: DocumentoBio;
  paginaId: string;
  /** campanhaId -> slug do link mestre (só as que existem e têm link mestre). */
  campanhas: Record<string, string>;
  /** Ids que não saem: número conectado (whatsapp ou wa.me) ou campanha sumida/sem link mestre. */
  linksEscondidos: string[];
  origem: string;
  dominioProprio: boolean;
};

/** 3 a 40, letras minúsculas, números e hífen simples (o CHECK de `bio_pages.slug`). */
export const SLUG_BIO = /^(?=.{3,40}$)[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUGS_RESERVADOS: ReadonlySet<string> = new Set([
  "_dominio", "admin", "api", "bio", "girumo", "painel", "login", "ajuda", "suporte",
]);
export function slugReservado(slug: string): boolean {
  return SLUGS_RESERVADOS.has(slug) || slug.includes("girumo") || slug.includes("hubflow");
}

/** Uuid minúsculo: o mesmo formato do CHECK de `bio_contagens.alvo` (maiúsculo vira 23514). */
export const UUID_BIO = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/documento.test.ts`
Expected: `ℹ pass 4`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/bio/documento.ts apps/web/src/lib/bio/documento.test.ts
git commit -m "feat(bio): link-da-bio document types and slug rules"
```

### Task 3: `documento.ts` — schema `documentoBio`, `linkBio` e `documentoPadrao`

**Files:**
- Modify: `apps/web/src/lib/bio/documento.ts` (imports no topo; o resto no fim)
- Test: `apps/web/src/lib/bio/documento.test.ts`

**Interfaces:**
- Consumes: Task 2; `normalizeWhatsappBR(raw: string): string | null` de `@/lib/pages/phone` (devolve `+55DDDNÚMERO`).
- Produces: `documentoBio: z.ZodType<DocumentoBio>`, `linkBio: z.ZodType<LinkBio>` (novo), `documentoPadrao(i: { nome: string; campanhaId: string | null }): DocumentoBio`.

- [ ] **Step 1: Write the failing test** — em `apps/web/src/lib/bio/documento.test.ts`:

(a) trocar o import de `./documento` por:

```ts
import {
  ICONES,
  MODELOS,
  PALETAS,
  SLUG_BIO,
  UUID_BIO,
  documentoBio,
  documentoPadrao,
  linkBio,
  slugReservado,
  type DocumentoBio,
  type LinkBio,
} from "./documento";
```

(b) logo depois da linha `const L3 = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";`, acrescentar:

```ts
const CAMPANHA = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const L2 = "66666666-7777-4888-9999-aaaaaaaaaaaa";

function documento(muda: (d: DocumentoBio) => void = () => {}): DocumentoBio {
  const d = documentoPadrao({ nome: "Loja Exemplo Atacado", campanhaId: CAMPANHA });
  d.links = [
    { id: L1, tipo: "whatsapp", titulo: "Falar com a vendedora", sub: "", icone: "whatsapp", ativo: true, destaque: true, numero: "(62) 99999-0000", mensagem: "Oi!" },
    { id: L2, tipo: "link", titulo: "Catálogo", sub: "", icone: "catalogo", ativo: true, destaque: false, url: "lojaexemplo.com.br/catalogo", fotos: [] },
    { id: L3, tipo: "endereco", titulo: "Como chegar", sub: "", icone: "mapa", ativo: true, endereco: "Rua Um, 100\nCentro", horario: "", foto: null },
  ];
  muda(d);
  return d;
}

/** Primeiro erro como a API e o painel vão mostrar: o caminho do campo e a frase. */
function primeiroErro(bruto: unknown, caso = ""): { campo: string; mensagem: string } {
  const r = documentoBio.safeParse(bruto);
  assert.equal(r.success, false, `esperava erro de validação: ${caso}`);
  const issue = r.error!.issues[0];
  return { campo: issue.path.join("."), mensagem: issue.message };
}

function valido(bruto: unknown): DocumentoBio {
  const r = documentoBio.safeParse(bruto);
  assert.ok(r.success, r.success ? "" : JSON.stringify(r.error.issues));
  return r.data;
}
```

(c) no fim do arquivo:

```ts
test("página padrão: Etiqueta azul, nome da loja e o grupo VIP quando há campanha", () => {
  const d = valido(documentoPadrao({ nome: "  Loja Exemplo  ", campanhaId: CAMPANHA }));
  assert.equal(d.modelo, "etiqueta");
  assert.equal(d.paleta, "azul");
  assert.equal(d.cores, null);
  assert.equal(d.animar, true);
  assert.equal(d.feitoComGirumo, true);
  assert.equal(d.perfil.nome, "Loja Exemplo");
  assert.equal(d.links.length, 1);
  const vip = d.links[0];
  assert.equal(vip.tipo, "grupo");
  assert.match(vip.id, UUID_BIO);
  assert.equal(vip.titulo, "Entrar no grupo VIP");
  assert.equal(vip.icone, "coroa");
  assert.equal(vip.tipo === "grupo" && vip.campanhaId, CAMPANHA);
  assert.equal(documentoPadrao({ nome: "Loja", campanhaId: null }).links.length, 0);
  assert.equal(documentoPadrao({ nome: "   ", campanhaId: null }).perfil.nome, "Minha loja");
  assert.equal(documentoPadrao({ nome: "x".repeat(80), campanhaId: null }).perfil.nome.length, 60);
  // A API e o painel salvam o padrão como sai daqui: ele sempre passa no schema, com e sem campanha.
  for (const nome of ["Loja", "   ", "x".repeat(80), `${"x".repeat(59)}🌸 e mais`]) {
    for (const campanhaId of [CAMPANHA, null]) valido(documentoPadrao({ nome, campanhaId }));
  }
});

test("normaliza número, endereço, CNPJ, cores e @ do Instagram", () => {
  const d = valido(
    documento((x) => {
      x.paleta = "marca";
      x.cores = { fundo: "#286aa6", botao: " #e98b2b " };
      x.perfil.instagram = " @LojaExemplo ";
      x.confere = { ativo: true, razao: "Loja Exemplo Ltda", cnpj: "11.222.333/0001-81", linhas: [] };
    }),
  );
  const [zap, site] = d.links as [Extract<LinkBio, { tipo: "whatsapp" }>, Extract<LinkBio, { tipo: "link" }>];
  assert.equal(zap.numero, "5562999990000");
  assert.equal(site.url, "https://lojaexemplo.com.br/catalogo");
  assert.deepEqual(d.cores, { fundo: "#286AA6", botao: "#E98B2B" });
  assert.equal(d.perfil.instagram, "lojaexemplo");
  assert.equal(d.confere.cnpj, "11222333000181");
  // CNPJ alfanumérico (emitido desde julho de 2026): mesma conta, letra vale ASCII − 48.
  const alfa = valido(documento((x) => { x.confere.cnpj = "12.abc.345/01de-35"; }));
  assert.equal(alfa.confere.cnpj, "12ABC34501DE35");
  // Vazio continua valendo: o bloco só aparece com razão e CNPJ.
  assert.equal(valido(documento((x) => { x.confere.cnpj = ""; })).confere.cnpj, "");
});

test("texto do lojista é texto: a validação não apaga < nem aspas (quem protege é o escape)", () => {
  const d = valido(documento((x) => { x.perfil.frase = `Kits <b>"novos"</b> & 'baratos'`; }));
  assert.equal(d.perfil.frase, `Kits <b>"novos"</b> & 'baratos'`);
});

test("NUL e metade de emoji não chegam ao jsonb (seriam 500 no salvar)", () => {
  assert.equal(primeiroErro(documento((d) => { d.perfil.frase = "oi \u0000"; })).campo, "perfil.frase");
  assert.equal(primeiroErro(documento((d) => { d.links[0].titulo = "Falar \uD83D"; })).campo, "links.0.titulo");
  valido(documento((d) => { d.perfil.frase = "Kits novos 🌸"; }));
  // O nome padrão é cortado em 60 sem partir o emoji do fim.
  const nome = documentoPadrao({ nome: `${"x".repeat(59)}🌸 e mais`, campanhaId: null }).perfil.nome;
  assert.equal(nome, "x".repeat(59));
  valido(documentoPadrao({ nome: `${"x".repeat(58)}🌸`, campanhaId: null }));
});

test("campo desconhecido é erro, na raiz e dentro do link", () => {
  assert.equal(primeiroErro({ ...documento(), extra: 1 }).campo, "");
  const comExtra = documento() as unknown as { links: Record<string, unknown>[] };
  comExtra.links[0].href = "javascript:alert(1)";
  assert.equal(primeiroErro(comExtra).campo, "links.0");
});

test("erros apontam o campo com a frase do painel", () => {
  const casos: [string, (d: DocumentoBio) => void, string, string | RegExp][] = [
    ["nome vazio", (d) => { d.perfil.nome = "  "; }, "perfil.nome", "Escreva o nome da loja."],
    ["título vazio", (d) => { d.links[0].titulo = ""; }, "links.0.titulo", "Escreva o texto do botão."],
    ["número curto", (d) => { (d.links[0] as { numero: string }).numero = "9999-0000"; }, "links.0.numero", /Número com DDD/],
    ["javascript:", (d) => { (d.links[1] as { url: string }).url = "javascript:alert(1)"; }, "links.1.url", /Só endereços de site/],
    ["sem ponto", (d) => { (d.links[1] as { url: string }).url = "localhost/catalogo"; }, "links.1.url", /não parece um link/],
    ["url vazia", (d) => { (d.links[1] as { url: string }).url = "  "; }, "links.1.url", "Cole o endereço do link."],
    ["url longa", (d) => { (d.links[1] as { url: string }).url = `loja.com.br/${"a".repeat(495)}`; }, "links.1.url", /até 500/],
    ["endereço curto", (d) => { (d.links[2] as { endereco: string }).endereco = "Rua"; }, "links.2.endereco", "Escreva o endereço da loja."],
    ["cnpj errado", (d) => { d.confere.cnpj = "11.222.333/0001-80"; }, "confere.cnpj", /CNPJ inválido/],
    ["cnpj repetido", (d) => { d.confere.cnpj = "00000000000000"; }, "confere.cnpj", /CNPJ inválido/],
    ["instagram", (d) => { d.perfil.instagram = "loja exemplo"; }, "perfil.instagram", /sem @/],
    ["pixel", (d) => { d.rastreio.metaPixelId = "12ab"; }, "rastreio.metaPixelId", /só números/],
    ["ga4", (d) => { d.rastreio.ga4Id = "UA-123"; }, "rastreio.ga4Id", /G-/],
    ["paleta de outro modelo", (d) => { d.paleta = "kraft"; }, "paleta", "Escolha uma das paletas do modelo."],
    ["marca sem cores", (d) => { d.paleta = "marca"; d.cores = null; }, "cores", "Escolha as duas cores da marca."],
    ["cor inválida", (d) => { d.cores = { fundo: "azul", botao: "#FFFFFF" }; }, "cores.fundo", "Escolha uma cor."],
    ["dois principais", (d) => { (d.links[1] as { destaque: boolean }).destaque = true; }, "links.1.destaque", "Só um link pode ser o principal."],
    ["id repetido", (d) => { d.links[2].id = L1; }, "links.2.id", "Link repetido. Apague um deles."],
    ["id maiúsculo", (d) => { d.links[0].id = L3.toUpperCase(); }, "links.0.id", /Link inválido/],
    ["campanha que não é uuid", (d) => { d.links.push({ ...(documentoPadrao({ nome: "x", campanhaId: CAMPANHA }).links[0] as LinkBio), campanhaId: "vip" } as LinkBio); }, "links.3.campanhaId", "Escolha a campanha."],
    ["mídia com barra", (d) => { d.perfil.capa = { id: "a/b", foco: null }; }, "perfil.capa.id", /Imagem inválida/],
    ["foco fora de 0..1", (d) => { d.perfil.capa = { id: "abc", foco: { x: 1.2, y: 0 } }; }, "perfil.capa.foco.x", /.+/],
    ["4 destaques", (d) => { d.perfil.destaques = ["a", "b", "c", "d"]; }, "perfil.destaques", "Até 3 destaques."],
    ["4 fotos", (d) => { (d.links[1] as { fotos: unknown[] }).fotos = [1, 2, 3, 4].map(() => ({ id: "abc", foco: null })); }, "links.1.fotos", "Até 3 fotos."],
    ["21 links", (d) => { d.links = Array.from({ length: 21 }, (_, i) => ({ ...d.links[2], id: `${String(i).padStart(8, "0")}-0000-4000-8000-000000000000` })); }, "links", "Até 20 links."],
  ];
  for (const [nome, muda, campo, mensagem] of casos) {
    const e = primeiroErro(documento(muda), nome);
    assert.equal(e.campo, campo, nome);
    if (typeof mensagem === "string") assert.equal(e.mensagem, mensagem, nome);
    else assert.match(e.mensagem, mensagem, nome);
  }
});

test("endereço não tem principal: dois 'Como chegar' não contam como dois destaques", () => {
  valido(documento((d) => { d.links.push({ ...(d.links[2] as LinkBio), id: "cccccccc-dddd-4eee-8fff-000000000000" } as LinkBio); }));
});

test("linkBio valida um link sozinho com as mesmas regras", () => {
  const r = linkBio.safeParse({ id: L1, tipo: "link", titulo: "Site", sub: "", icone: "site", ativo: true, destaque: false, url: "lojaexemplo.com.br", fotos: [] });
  assert.ok(r.success);
  assert.equal(r.data.tipo === "link" && r.data.url, "https://lojaexemplo.com.br/");
  assert.equal(linkBio.safeParse({ id: L1, tipo: "pix", titulo: "x", sub: "", icone: "link", ativo: true }).success, false);
});

test("links são uma união discriminada por tipo: o erro aponta o campo do próprio tipo", () => {
  // O painel (PR 6a) põe a mensagem no campo pelo caminho links.<n>.<campo>.
  const zap = documento((d) => {
    d.links.push({ id: "cccccccc-dddd-4eee-8fff-000000000000", tipo: "whatsapp", titulo: "Atacado", sub: "", icone: "whatsapp", ativo: true, destaque: false, numero: "123", mensagem: "" });
  });
  assert.deepEqual(primeiroErro(zap), { campo: "links.3.numero", mensagem: "Número com DDD, só o celular. Ex.: 62 99999-9999." });
  const tipoErrado = documento() as unknown as { links: Record<string, unknown>[] };
  tipoErrado.links[2].tipo = "telefone";
  assert.equal(primeiroErro(tipoErrado).campo, "links.2.tipo");
});

test("normalizar duas vezes dá o mesmo documento (o painel guarda o normalizado; a API valida de novo)", () => {
  const brutos: DocumentoBio[] = [
    documentoPadrao({ nome: " Loja Exemplo ", campanhaId: CAMPANHA }),
    documentoPadrao({ nome: "Loja Exemplo", campanhaId: null }),
    documento((x) => {
      x.paleta = "marca";
      x.cores = { fundo: "#286aa6", botao: " #e98b2b " };
      x.perfil.frase = "  Kits novos toda semana  ";
      x.perfil.instagram = " @@LojaExemplo ";
      x.confere = { ativo: true, razao: " Loja Exemplo Ltda ", cnpj: "12.abc.345/01de-35", linhas: [" Desde 2010 "] };
      x.rastreio = { metaPixelId: " 123456789 ", ga4Id: " g-abc1234 " };
    }),
  ];
  // DDD 55 (Santa Maria/RS) é o caso em que o "55" do país e o do DDD se confundem.
  for (const numero of ["(62) 99999-0000", "+55 62 9 9999-0000", "5562999990000", "55 3222-1111", "(55) 99999-0000"]) {
    brutos.push(documento((x) => { (x.links[0] as { numero: string }).numero = numero; }));
  }
  for (const url of ["HTTPS://LojaExemplo.com.br/Catálogo?x=1#y", "lojá.com.br", "http://loja.com.br:80/a/../b"]) {
    brutos.push(documento((x) => { (x.links[1] as { url: string }).url = url; }));
  }
  for (const bruto of brutos) {
    const uma = valido(bruto);
    assert.deepEqual(valido(uma), uma);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/documento.test.ts`
Expected: FAIL — `ℹ pass 4`, `ℹ fail 10`, com `TypeError: (0 , import_documento.documentoPadrao) is not a function`.

- [ ] **Step 3: Implementar** — em `apps/web/src/lib/bio/documento.ts`, acrescentar no topo do arquivo (antes do comentário de cabeçalho):

```ts
import { z } from "zod";

import { normalizeWhatsappBR } from "@/lib/pages/phone";

```

e, no fim do arquivo (depois de `UUID_BIO`):

```ts
const COR = /^#[0-9A-F]{6}$/;
const ENDERECO_INVALIDO = "Esse endereço não parece um link. Ex.: sualoja.com.br/catalogo";

/**
 * Texto que o jsonb aceita: sem NUL e sem metade de emoji (surrogate solto) — os dois viram 500
 * no Postgres em vez de 400 aqui. `encodeURIComponent` lança exatamente no surrogate solto.
 */
function gravavel(v: string): boolean {
  if (v.includes("\u0000")) return false;
  try {
    encodeURIComponent(v);
    return true;
  } catch {
    return false;
  }
}

function texto(max: number, obrigatorio?: string) {
  const campo = z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres.`)
    .refine(gravavel, "Esse texto tem um caractere que não dá para salvar. Apague e digite de novo.");
  return obrigatorio ? campo.min(1, obrigatorio) : campo;
}

/** Corta em `max` unidades (a conta do `.max` do zod) sem deixar metade de um emoji no fim. */
function corta(v: string, max: number): string {
  const cortado = v.slice(0, max);
  return /[\uD800-\uDBFF]$/.test(cortado) ? cortado.slice(0, -1) : cortado;
}

/** Dígitos verificadores do CNPJ, numérico ou alfanumérico (cada caractere vale o código ASCII − 48). */
function cnpjValido(cnpj: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(cnpj) || /^(.)\1{13}$/.test(cnpj)) return false;
  const dv = (base: string) => {
    const soma = [...base].reduce((s, c, i) => s + (c.charCodeAt(0) - 48) * ((base.length - 1 - i) % 8 + 2), 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const primeiro = dv(cnpj.slice(0, 12));
  return primeiro === Number(cnpj[12]) && dv(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

const midia = z.strictObject({
  id: z.string().max(200).regex(/^[A-Za-z0-9_-]+$/, "Imagem inválida. Envie de novo."),
  foco: z.strictObject({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).nullable(),
});

const cor = z.string().trim().toUpperCase().regex(COR, "Escolha uma cor.");

/** "62 99999-9999", "(62) 9 9999-9999", "+55 62…" → "5562999999999". */
const numero = z
  .string()
  .max(30, "Número com DDD, só o celular. Ex.: 62 99999-9999.")
  .transform((bruto, ctx) => {
    const e164 = normalizeWhatsappBR(bruto);
    if (!e164) {
      ctx.addIssue("Número com DDD, só o celular. Ex.: 62 99999-9999.");
      return z.NEVER;
    }
    return e164.slice(1);
  });

/** Só http/https, host com ponto; sem esquema ganha `https://`. Guarda `url.href` (≤ 500). */
const url = z
  .string()
  .max(600, "Endereço longo demais (até 500 caracteres).")
  .transform((bruto, ctx) => {
    const limpo = bruto.trim();
    if (!limpo) {
      ctx.addIssue("Cole o endereço do link.");
      return z.NEVER;
    }
    let lido: URL;
    try {
      lido = new URL(/^[a-z][a-z0-9+.-]*:/i.test(limpo) ? limpo : `https://${limpo}`);
    } catch {
      ctx.addIssue(ENDERECO_INVALIDO);
      return z.NEVER;
    }
    if (lido.protocol !== "https:" && lido.protocol !== "http:") {
      ctx.addIssue("Só endereços de site (que começam com http ou https).");
      return z.NEVER;
    }
    if (!/\.[a-z]{2,}$/i.test(lido.hostname)) {
      ctx.addIssue(ENDERECO_INVALIDO);
      return z.NEVER;
    }
    if (lido.href.length > 500) {
      ctx.addIssue("Endereço longo demais (até 500 caracteres).");
      return z.NEVER;
    }
    return lido.href;
  });

/** Aceita com ou sem pontuação; guarda sem pontuação e em maiúsculas. Vazio vale. */
const cnpj = z
  .string()
  .max(30, "CNPJ inválido. Confira os números.")
  .transform((bruto, ctx) => {
    const limpo = bruto.replace(/[\s./-]/g, "").toUpperCase();
    if (limpo && !cnpjValido(limpo)) {
      ctx.addIssue("CNPJ inválido. Confira os números.");
      return z.NEVER;
    }
    return limpo;
  });

const base = {
  id: z.string().regex(UUID_BIO, "Link inválido. Apague e crie de novo."),
  titulo: texto(50, "Escreva o texto do botão."),
  sub: texto(80),
  icone: z.enum(ICONES),
  ativo: z.boolean(),
};

const link = z.discriminatedUnion("tipo", [
  z.strictObject({ ...base, tipo: z.literal("whatsapp"), destaque: z.boolean(), numero, mensagem: texto(300) }),
  z.strictObject({
    ...base,
    tipo: z.literal("grupo"),
    destaque: z.boolean(),
    campanhaId: z.string().regex(UUID_BIO, "Escolha a campanha."),
  }),
  z.strictObject({
    ...base,
    tipo: z.literal("link"),
    destaque: z.boolean(),
    url,
    fotos: z.array(midia).max(3, "Até 3 fotos."),
  }),
  z.strictObject({
    ...base,
    tipo: z.literal("endereco"),
    endereco: texto(200, "Escreva o endereço da loja.").min(5, "Escreva o endereço da loja."),
    horario: texto(120),
    foto: midia.nullable(),
  }),
]);

/** Um link sozinho — a folha de edição do painel valida com ele antes de pôr na lista. */
export const linkBio: z.ZodType<LinkBio> = link;

/**
 * Fonte única da validação. `strictObject`: campo desconhecido é erro. Normaliza número
 * (`55`+dígitos), url (`href`), cnpj (sem pontuação), cores (maiúsculas) e @ do Instagram.
 * Mensagens em português, prontas para aparecer embaixo do campo; o caminho do campo é
 * `issue.path.join(".")` (ex.: "links.2.numero").
 */
export const documentoBio: z.ZodType<DocumentoBio> = z
  .strictObject({
    v: z.literal(1),
    modelo: z.enum(MODELOS),
    paleta: z.string(),
    cores: z.strictObject({ fundo: cor, botao: cor }).nullable(),
    animar: z.boolean(),
    feitoComGirumo: z.boolean(),
    perfil: z.strictObject({
      nome: texto(60, "Escreva o nome da loja."),
      frase: texto(120),
      destaques: z.array(texto(40, "Escreva o destaque ou apague a linha.")).max(3, "Até 3 destaques."),
      local: texto(90),
      instagram: z
        .string()
        .trim()
        .toLowerCase()
        .overwrite((v) => v.replace(/^@+/, ""))
        .max(30, "Use no máximo 30 caracteres.")
        .regex(/^[a-z0-9._]*$/, "Só letras, números, ponto e _ (sem @)."),
      capa: midia.nullable(),
      capaAlt: texto(140),
      logoClara: midia.nullable(),
      logoEscura: midia.nullable(),
    }),
    confere: z.strictObject({
      ativo: z.boolean(),
      razao: texto(120),
      cnpj,
      linhas: z.array(texto(160, "Escreva a linha ou apague.")).max(2, "Até 2 linhas."),
    }),
    rastreio: z.strictObject({
      metaPixelId: z.string().trim().regex(/^(\d{5,20})?$/, "O ID do Pixel tem só números (5 a 20)."),
      ga4Id: z
        .string()
        .trim()
        .toUpperCase()
        .max(30, "O ID do GA4 começa com G-.")
        .regex(/^(G-[A-Z0-9]{4,})?$/, "O ID do GA4 começa com G-."),
    }),
    links: z.array(link).max(20, "Até 20 links."),
  })
  .superRefine((doc, ctx) => {
    const prontas: readonly string[] = PALETAS[doc.modelo];
    if (doc.paleta !== "marca" && !prontas.includes(doc.paleta)) {
      ctx.addIssue({ code: "custom", message: "Escolha uma das paletas do modelo.", path: ["paleta"] });
    }
    if (doc.paleta === "marca" && !doc.cores) {
      ctx.addIssue({ code: "custom", message: "Escolha as duas cores da marca.", path: ["cores"] });
    }
    const vistos = new Set<string>();
    let destaques = 0;
    doc.links.forEach((l, i) => {
      if (vistos.has(l.id)) {
        ctx.addIssue({ code: "custom", message: "Link repetido. Apague um deles.", path: ["links", i, "id"] });
      }
      vistos.add(l.id);
      if (l.tipo !== "endereco" && l.destaque && ++destaques > 1) {
        ctx.addIssue({ code: "custom", message: "Só um link pode ser o principal.", path: ["links", i, "destaque"] });
      }
    });
  });

/**
 * A página do "Criar minha página" (spec §8): modelo Etiqueta, paleta azul, nome da loja e,
 * se a loja tiver campanha com link mestre, o botão do grupo VIP (textos do mockup).
 */
export function documentoPadrao(i: { nome: string; campanhaId: string | null }): DocumentoBio {
  return {
    v: 1,
    modelo: "etiqueta",
    paleta: "azul",
    cores: null,
    animar: true,
    feitoComGirumo: true,
    perfil: {
      nome: corta(i.nome.trim(), 60).trim() || "Minha loja",
      frase: "",
      destaques: [],
      local: "",
      instagram: "",
      capa: null,
      capaAlt: "",
      logoClara: null,
      logoEscura: null,
    },
    confere: { ativo: false, razao: "", cnpj: "", linhas: [] },
    rastreio: { metaPixelId: "", ga4Id: "" },
    links: i.campanhaId
      ? [
          {
            id: crypto.randomUUID(),
            tipo: "grupo",
            titulo: "Entrar no grupo VIP",
            sub: "Kit novo e reposição saem primeiro no grupo",
            icone: "coroa",
            ativo: true,
            destaque: false,
            campanhaId: i.campanhaId,
          },
        ]
      : [],
  };
}
```

`texto()` corta espaço das pontas e conta o limite depois do corte; `numero`, `url` e `cnpj` são `transform` (guardam o normalizado); `superRefine` cuida das regras que cruzam campos (paleta do modelo, cores da marca, id repetido, um principal só).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/documento.test.ts`
Expected: `ℹ pass 14`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/bio/documento.ts apps/web/src/lib/bio/documento.test.ts
git commit -m "feat(bio): document schema and default page"
```

### Task 4: `cores.ts` — contraste e `garante`

**Files:**
- Create: `apps/web/src/lib/bio/cores.ts`
- Test: `apps/web/src/lib/bio/cores.test.ts`

**Interfaces:**
- Consumes: `parseHex(hex: string): Rgb | null`, `relativeLuminance(c: Rgb): number`, `contrastRatio(a: Rgb, b: Rgb): number` e `type Rgb` de `@/lib/pages/palette`.
- Produces: `contraste(a: string, b: string): number` (novo) e `garante(fg: string, bg: string, min: number): string` — sempre `#RRGGBB` maiúsculo.

- [ ] **Step 1: Write the failing test** — criar `apps/web/src/lib/bio/cores.test.ts`:

```ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { contraste, garante } from "./cores";

const HEX = /^#[0-9A-F]{6}$/;

test("garante: devolve a própria cor quando já passa e empurra para o lado em que ela está", () => {
  assert.equal(garante("#16304F", "#FFFFFF", 4.5), "#16304F");
  assert.equal(garante("#16304f", "#FFFFFF", 4.5), "#16304F");
  const escurecida = garante("#999999", "#FFFFFF", 4.5);
  assert.ok(contraste(escurecida, "#FFFFFF") >= 4.5);
  assert.ok(contraste(escurecida, "#000000") < contraste("#999999", "#000000"), "texto cinza sobre branco escurece");
  const clareada = garante("#555555", "#222222", 4.5);
  assert.ok(contraste(clareada, "#222222") >= 4.5);
  assert.ok(contraste(clareada, "#FFFFFF") < contraste("#555555", "#FFFFFF"), "texto cinza sobre escuro clareia");
});

test("garante: fundo médio, onde a regra do mockup (lum > 0,4 ? preto : branco) devolvia branco com 3:1", () => {
  const cor = garante("#888888", "#959595", 4.5);
  assert.ok(contraste(cor, "#959595") >= 4.5, cor);
});

test("garante: se do próprio lado não dá, vai para o outro", () => {
  const cor = garante("#FFFFFF", "#F0F0F0", 4.5);
  assert.ok(contraste(cor, "#F0F0F0") >= 4.5, cor);
  assert.match(cor, HEX);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/cores.test.ts`
Expected: FAIL — `Error: Cannot find module './cores'`; `ℹ fail 1`.

- [ ] **Step 3: Criar `apps/web/src/lib/bio/cores.ts`:**

```ts
import { contrastRatio, parseHex, relativeLuminance, type Rgb } from "@/lib/pages/palette";

/**
 * Cores dos modelos do link da bio (spec 2026-10-19-link-da-bio §3). Puro: a prévia do painel
 * e a página pública chamam a mesma função.
 *
 * As 16 paletas prontas são as do mockup, hex por hex (paletas.json; lá a `azul` se chama
 * `mks`). "Cores da sua marca" deriva o resto a partir de `fundo` e `botao` como a `derivada()`
 * do mockup, com três correções medidas (ver o plano do PR 2, "Decisões"): `escuro` = o texto
 * da página é branco; `garante` empurra a cor para o lado em que ela já está; e Vitrine e
 * Clássico calculam o acento contra o fundo em que ele é desenhado. Depois, todo par de
 * `PARES_DE_CONTRASTE` passa por `garante` — nas paletas prontas isso não muda nada.
 *
 * Foco: `--foco` é o anel onde ficam os links (`FUNDOS_DO_FOCO`); no Romaneio, fora da nota,
 * vale `--foco-fora`; dentro do `--papel` dos outros modelos o CSS usa `--tinta`. Todos ≥ 3:1
 * contra o fundo em que aparecem.
 */

const PRETO = "#000000";
const BRANCO = "#FFFFFF";

function rgb(hex: string): Rgb {
  const c = parseHex(hex);
  if (!c) throw new Error(`cor inválida: ${hex}`);
  return c;
}

function paraHex(c: Rgb): string {
  const canal = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${canal(c.r)}${canal(c.g)}${canal(c.b)}`.toUpperCase();
}

function luminancia(hex: string): number {
  return relativeLuminance(rgb(hex));
}

export function contraste(a: string, b: string): number {
  return contrastRatio(rgb(a), rgb(b));
}

function mistura(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return paraHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** Branco ou preto, o que tiver mais contraste com `fundo`. */
function textoSobre(fundo: string): string {
  return contraste(BRANCO, fundo) >= contraste(PRETO, fundo) ? BRANCO : PRETO;
}

/**
 * Mistura `fg` rumo a `alvo` em passos de 10% até `min:1` contra `bg`. Só aceita o `fg`
 * original se ele já estiver do lado do `alvo` (senão um botão claro sobre fundo médio
 * "passaria" pelo lado errado). `null` = nem o próprio alvo chega.
 */
function rumo(fg: string, bg: string, min: number, alvo: string): string | null {
  const ladoDoAlvo = luminancia(fg) >= luminancia(bg) === luminancia(alvo) >= luminancia(bg);
  if (ladoDoAlvo && contraste(fg, bg) >= min) return fg;
  for (let passo = 1; passo <= 10; passo++) {
    const cor = mistura(fg, alvo, passo / 10);
    if (contraste(cor, bg) >= min) return cor;
  }
  return null;
}

/**
 * Mistura `fg` rumo a #000000 ou #FFFFFF até ter `min:1` contra `bg` — primeiro para o lado
 * em que `fg` já está (texto escuro continua escuro), e só se não der, para o outro. Se nem
 * assim, o extremo de maior contraste.
 */
export function garante(fg: string, bg: string, min: number): string {
  if (contraste(fg, bg) >= min) return paraHex(rgb(fg));
  const claro = luminancia(fg) >= luminancia(bg);
  return rumo(fg, bg, min, claro ? BRANCO : PRETO) ?? rumo(fg, bg, min, claro ? PRETO : BRANCO) ?? textoSobre(bg);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/cores.test.ts`
Expected: `ℹ pass 3`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/bio/cores.ts apps/web/src/lib/bio/cores.test.ts
git commit -m "feat(bio): contrast helpers for the link-da-bio colors"
```

### Task 5: `cores.ts` — paletas prontas, cores da marca e anéis de foco

**Files:**
- Modify: `apps/web/src/lib/bio/cores.ts` (um import; o resto no fim)
- Test: `apps/web/src/lib/bio/cores.test.ts`

**Interfaces:**
- Consumes: Task 4 (`contraste`, `garante`); `PALETAS`, `type Modelo`, `type DocumentoBio` (Task 2).
- Produces: `TokensBio`, `coresDoModelo(modelo: Modelo, paleta: string, cores: DocumentoBio["cores"]): TokensBio` e os novos `PALETAS_PRONTAS`, `ParDeContraste`, `PARES_DE_CONTRASTE`, `FUNDOS_DO_FOCO`, `FUNDOS_DO_FOCO_FORA`.

- [ ] **Step 1: Write the failing test** — em `apps/web/src/lib/bio/cores.test.ts`, trocar `import { contraste, garante } from "./cores";` por:

```ts
import {
  FUNDOS_DO_FOCO,
  FUNDOS_DO_FOCO_FORA,
  PALETAS_PRONTAS,
  PARES_DE_CONTRASTE,
  contraste,
  coresDoModelo,
  garante,
  type TokensBio,
} from "./cores";
import { MODELOS, PALETAS, type Modelo } from "./documento";
```

e acrescentar no fim do arquivo:

```ts
/** As variáveis que o CSS de cada modelo lê (Main.dc.html) — contrato com os PRs 3a/3b. */
const VARIAVEIS: Record<Modelo, string[]> = {
  etiqueta: ["fundo1", "fundo2", "fundo3", "on", "on2", "chip", "chipbd", "fio", "acento", "cartao", "tinta", "tinta2", "icobg", "ico", "seta", "prin", "printinta", "papel", "linha", "foco"],
  vitrine: ["fundo2", "on", "on2", "linha", "acento", "tinta", "icobg", "ico", "seta", "prin", "printinta", "papel", "foco"],
  romaneio: ["fundo1", "fundo2", "fundo3", "on", "on2", "papel", "tinta", "tinta2", "linha", "acento", "foco", "foco-fora"],
  classico: ["fundo2", "fundo3", "on", "on2", "chip", "chipbd", "acento", "cartao", "tinta", "tinta2", "icobg", "ico", "seta", "prin", "printinta", "papel", "anel", "foco"],
};

const v = (t: TokensBio, nome: string) => t[`--${nome}`];

/** Toda falha de contraste dos tokens: texto 4,5, ícone/seta 3 (pela lista) e os anéis de foco 3. */
function falhas(modelo: Modelo, t: TokensBio): string[] {
  const lista: string[] = [];
  for (const [texto, fundo, minimo] of PARES_DE_CONTRASTE[modelo]) {
    const r = contraste(v(t, texto), v(t, fundo));
    if (r < minimo) lista.push(`${texto}/${fundo} ${r.toFixed(2)} < ${minimo}`);
  }
  const anel = (nome: string, fundos: readonly string[]) => {
    for (const fundo of fundos) {
      const r = contraste(v(t, nome), v(t, fundo));
      if (r < 3) lista.push(`${nome}/${fundo} ${r.toFixed(2)}`);
    }
  };
  anel("foco", FUNDOS_DO_FOCO[modelo]);
  if (modelo === "romaneio") anel("foco-fora", FUNDOS_DO_FOCO_FORA);
  return lista;
}

/** Semente fixa: se um dia falhar, a cor que falhou é a mesma em toda máquina. */
function sorteador(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return `#${(s >>> 8).toString(16).padStart(6, "0").slice(-6).toUpperCase()}`;
  };
}

test("as 16 paletas prontas saem hex por hex do mockup (menos o foco) e passam em todos os pares", () => {
  for (const modelo of MODELOS) {
    for (const paleta of PALETAS[modelo]) {
      const t = coresDoModelo(modelo, paleta, null);
      assert.deepEqual(Object.keys(t), VARIAVEIS[modelo].map((n) => `--${n}`), `${modelo}/${paleta}`);
      for (const nome of VARIAVEIS[modelo]) {
        if (nome === "foco" || nome === "foco-fora") continue;
        assert.equal(v(t, nome), PALETAS_PRONTAS[modelo][paleta][nome], `${modelo}/${paleta} --${nome}`);
      }
      assert.deepEqual(falhas(modelo, t), [], `${modelo}/${paleta}`);
    }
  }
});

test("valores do mockup conferidos à mão, e o foco onde o dourado do mockup não serve de anel", () => {
  const t = coresDoModelo("etiqueta", "azul", null);
  assert.equal(t["--fundo1"], "#3A80BF");
  assert.equal(t["--prin"], "#E98B2B");
  assert.equal(t["--papel"], "#F6F6F2");
  // #D7A85A tem 1,9:1 contra o fundo1 e 2,6:1 contra o fundo2: o anel vira o branco do texto.
  assert.equal(t["--foco"], "#FFFFFF");
  assert.equal(t["--foco-fora"], undefined, "--foco-fora é só do Romaneio");
  // No grafite o dourado passa (5,2:1 ou mais no degradê) e fica.
  assert.equal(coresDoModelo("etiqueta", "grafite", null)["--foco"], "#D4AF37");
  // Clássico azul: o mesmo dourado contra o fundo2 (2,6:1) também cai.
  assert.equal(coresDoModelo("classico", "azul", null)["--foco"], "#FFFFFF");
});

test("Romaneio: no papel o carimbo é o anel; fora dele, de --on/preto/branco, o de maior contraste mínimo", () => {
  for (const paleta of PALETAS.romaneio) {
    const p = PALETAS_PRONTAS.romaneio[paleta];
    const t = coresDoModelo("romaneio", paleta, null);
    assert.equal(v(t, "foco"), p.foco, `${paleta}: no papel o carimbo continua sendo o anel`);
    const pior = (cor: string) => Math.min(...FUNDOS_DO_FOCO_FORA.map((f) => contraste(cor, p[f])));
    const escolhida = v(t, "foco-fora");
    assert.ok([p.on, "#000000", "#FFFFFF"].includes(escolhida), paleta);
    for (const outra of [p.on, "#000000", "#FFFFFF"]) assert.ok(pior(escolhida) >= pior(outra), `${paleta}: ${outra} tem mais`);
    assert.ok(pior(escolhida) >= 3, `${paleta}: ${pior(escolhida).toFixed(2)}`);
  }
  assert.equal(coresDoModelo("romaneio", "kraft", null)["--foco-fora"], "#000000");
});

test("500 cores de marca sorteadas: texto ≥ 4,5, ícone e seta ≥ 3, foco ≥ 3, tudo #RRGGBB", () => {
  const sorteia = sorteador(2026);
  for (let i = 0; i < 500; i++) {
    const cores = { fundo: sorteia(), botao: sorteia() };
    for (const modelo of MODELOS) {
      const t = coresDoModelo(modelo, "marca", cores);
      assert.deepEqual(Object.keys(t), VARIAVEIS[modelo].map((n) => `--${n}`));
      for (const cor of Object.values(t)) assert.match(cor, HEX);
      assert.deepEqual(falhas(modelo, t), [], `${modelo} ${cores.fundo}/${cores.botao}`);
    }
  }
});

test("os tons do meio (onde branco e preto empatam) e os extremos também fecham", () => {
  // #959595: o garante do mockup dava 3,0:1 aqui; #4B9F1D: o verde em que nem branco nem preto
  // tinham 3:1 nas duas pontas do degradê derivado do mockup; #767676: 4,5:1 cravado no branco.
  const fundos = ["#959595", "#4B9F1D", "#767676"];
  for (let canal = 0; canal < 256; canal += 5) fundos.push(`#${canal.toString(16).padStart(2, "0").repeat(3).toUpperCase()}`);
  for (const fundo of fundos) {
    for (const botao of ["#000000", "#FFFFFF", fundo, "#FF0000"]) {
      for (const modelo of MODELOS) assert.deepEqual(falhas(modelo, coresDoModelo(modelo, "marca", { fundo, botao })), [], `${modelo} ${fundo}/${botao}`);
    }
  }
});

test("marca usa as cores da loja: o fundo e o botão são os escolhidos", () => {
  const t = coresDoModelo("classico", "marca", { fundo: "#286AA6", botao: "#E98B2B" });
  assert.equal(t["--fundo2"], "#286AA6");
  assert.equal(t["--prin"], "#E98B2B");
  assert.equal(t["--on"], "#FFFFFF");
  assert.equal(coresDoModelo("classico", "marca", { fundo: "#f2f0eb", botao: "#161616" })["--on"], "#000000");
});

test("paleta que não é do modelo, ou marca sem cores válidas, cai na primeira do modelo", () => {
  const primeira = coresDoModelo("vitrine", "papel", null);
  assert.deepEqual(coresDoModelo("vitrine", "kraft", null), primeira);
  assert.deepEqual(coresDoModelo("vitrine", "marca", null), primeira);
  assert.deepEqual(coresDoModelo("vitrine", "marca", { fundo: "azul", botao: "#000000" }), primeira);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/cores.test.ts`
Expected: FAIL — `ℹ pass 3`, `ℹ fail 7`, com `TypeError: (0 , import_cores.coresDoModelo) is not a function`.

- [ ] **Step 3: Implementar** — em `apps/web/src/lib/bio/cores.ts`, logo abaixo do import de `@/lib/pages/palette`, acrescentar (com uma linha em branco antes):

```ts
import { PALETAS, type DocumentoBio, type Modelo } from "./documento";
```

e, no fim do arquivo:

```ts
/** As variáveis CSS do modelo, com o `--` (`{"--fundo1": "#3A80BF", …}`); valor sempre `#RRGGBB`. */
export type TokensBio = Record<string, string>;

const MIN_FOCO = 3;

type Paleta = Readonly<Record<string, string>>;

/** paletas.json, cópia fiel (só `mks` virou `azul`; `avatar` do Clássico não é usada pelo CSS). */
export const PALETAS_PRONTAS: Readonly<Record<Modelo, Readonly<Record<string, Paleta>>>> = {
  etiqueta: {
    azul: { fundo1: "#3A80BF", fundo2: "#286AA6", fundo3: "#173F68", on: "#FFFFFF", on2: "#D3DEEA", chip: "#1C4E7E", chipbd: "#5E8DBB", fio: "#D7A85A", acento: "#F2CD8A", cartao: "#FFFFFF", tinta: "#16304F", tinta2: "#4A6285", icobg: "#E9EAE4", ico: "#286AA6", seta: "#5D799E", prin: "#E98B2B", printinta: "#142A44", papel: "#F6F6F2", linha: "#B9C4D1", foco: "#D7A85A" },
    rosa: { fundo1: "#CC5283", fundo2: "#B83A6B", fundo3: "#6E1D40", on: "#FFFFFF", on2: "#F3D6E2", chip: "#8E2A53", chipbd: "#D27FA2", fio: "#FFD27A", acento: "#FFD98F", cartao: "#FFFFFF", tinta: "#3B1528", tinta2: "#6B4256", icobg: "#FBE4EE", ico: "#B83A6B", seta: "#8E6578", prin: "#FFD24D", printinta: "#3B1528", papel: "#FFF6FA", linha: "#E2BFCF", foco: "#FFD27A" },
    menta: { fundo1: "#1C8A76", fundo2: "#12705F", fundo3: "#083F36", on: "#FFFFFF", on2: "#CFE6E0", chip: "#0C5045", chipbd: "#5FA597", fio: "#F4C66B", acento: "#F7D48E", cartao: "#FFFFFF", tinta: "#0F2F2A", tinta2: "#45635D", icobg: "#E3F2EE", ico: "#12705F", seta: "#5C7F78", prin: "#FF8A5B", printinta: "#2A140C", papel: "#F4FAF8", linha: "#B7CFC9", foco: "#F4C66B" },
    grafite: { fundo1: "#3A3D45", fundo2: "#24262C", fundo3: "#0F1013", on: "#F4F1EA", on2: "#C9C5BC", chip: "#33363E", chipbd: "#55585F", fio: "#D4AF37", acento: "#E2C35E", cartao: "#F6F3EA", tinta: "#1D1E22", tinta2: "#55575E", icobg: "#E9E4D6", ico: "#24262C", seta: "#6A6C72", prin: "#D4AF37", printinta: "#1D1E22", papel: "#FBF9F4", linha: "#C9C5BC", foco: "#D4AF37" },
  },
  vitrine: {
    papel: { fundo1: "#FFFFFF", fundo2: "#FAF7F2", fundo3: "#EFE9DF", on: "#1B1A17", on2: "#5E5A52", linha: "#E6DFD3", acento: "#A8432C", cartao: "#FFFFFF", tinta: "#1B1A17", tinta2: "#5E5A52", icobg: "#F1EBE0", ico: "#A8432C", seta: "#8A8478", prin: "#1B1A17", printinta: "#FAF7F2", papel: "#FFFFFF", foco: "#A8432C" },
    noite: { fundo1: "#1C1A18", fundo2: "#141312", fundo3: "#0B0A09", on: "#F3EFE8", on2: "#B9B2A6", linha: "#2E2B27", acento: "#D9B36C", cartao: "#1E1C1A", tinta: "#F3EFE8", tinta2: "#B9B2A6", icobg: "#262320", ico: "#D9B36C", seta: "#8E877C", prin: "#F3EFE8", printinta: "#141312", papel: "#1E1C1A", foco: "#D9B36C" },
    rose: { fundo1: "#FFFFFF", fundo2: "#FFF3F0", fundo3: "#F8E1DC", on: "#3A1E24", on2: "#7A5A60", linha: "#F0D8D3", acento: "#B23A63", cartao: "#FFFFFF", tinta: "#3A1E24", tinta2: "#7A5A60", icobg: "#FBE4E0", ico: "#B23A63", seta: "#A08488", prin: "#3A1E24", printinta: "#FFF3F0", papel: "#FFFFFF", foco: "#B23A63" },
    azul: { fundo1: "#FFFFFF", fundo2: "#F4F7FB", fundo3: "#E3EBF4", on: "#16304F", on2: "#4A6285", linha: "#DCE5EF", acento: "#286AA6", cartao: "#FFFFFF", tinta: "#16304F", tinta2: "#4A6285", icobg: "#E6EEF7", ico: "#286AA6", seta: "#5D799E", prin: "#E98B2B", printinta: "#142A44", papel: "#FFFFFF", foco: "#286AA6" },
  },
  romaneio: {
    kraft: { fundo1: "#D2B08A", fundo2: "#C4A07A", fundo3: "#A8835E", on: "#2B2117", on2: "#3F3122", papel: "#FFFDF7", tinta: "#24211C", tinta2: "#5F584D", linha: "#D9D1C2", acento: "#B3261E", foco: "#B3261E" },
    caneta: { fundo1: "#2D5291", fundo2: "#23457D", fundo3: "#172F57", on: "#FFFFFF", on2: "#C9D5EA", papel: "#FFFDF7", tinta: "#1C2538", tinta2: "#57607A", linha: "#D8DCE6", acento: "#1F55C6", foco: "#1F55C6" },
    nota: { fundo1: "#376A5B", fundo2: "#2D5A4D", fundo3: "#1D3D34", on: "#FFFFFF", on2: "#CFE1DA", papel: "#F8FAF3", tinta: "#1E2A25", tinta2: "#56645D", linha: "#D5DDD3", acento: "#23704A", foco: "#23704A" },
    azul: { fundo1: "#3A80BF", fundo2: "#286AA6", fundo3: "#173F68", on: "#FFFFFF", on2: "#E8EFF7", papel: "#FFFDF7", tinta: "#16304F", tinta2: "#4A6285", linha: "#D9DEE6", acento: "#A8500C", foco: "#A8500C" },
  },
  classico: {
    claro: { fundo1: "#F7F5F1", fundo2: "#F2F0EB", fundo3: "#E5E2DA", on: "#161616", on2: "#57544E", chip: "#FFFFFF", chipbd: "#E2DED5", acento: "#161616", cartao: "#FFFFFF", tinta: "#161616", tinta2: "#5F5B54", icobg: "#F2F0EB", ico: "#161616", seta: "#7A766E", prin: "#161616", printinta: "#FFFFFF", papel: "#FFFFFF", linha: "#E2DED5", avatar: "#FFFFFF", anel: "#161616", foco: "#161616" },
    escuro: { fundo1: "#181818", fundo2: "#111111", fundo3: "#0A0A0A", on: "#F5F5F5", on2: "#B5B5B5", chip: "#1F1F1F", chipbd: "#2C2C2C", acento: "#FFD400", cartao: "#1E1E1E", tinta: "#F5F5F5", tinta2: "#B5B5B5", icobg: "#2A2A2A", ico: "#FFD400", seta: "#9A9A9A", prin: "#FFD400", printinta: "#111111", papel: "#1E1E1E", linha: "#2C2C2C", avatar: "#FFFFFF", anel: "#FFD400", foco: "#FFD400" },
    lavanda: { fundo1: "#F4F1FF", fundo2: "#ECE8FF", fundo3: "#DDD6FF", on: "#2A1E5C", on2: "#5A4F86", chip: "#FFFFFF", chipbd: "#DCD5FB", acento: "#4F35D6", cartao: "#FFFFFF", tinta: "#2A1E5C", tinta2: "#5F5689", icobg: "#EFEBFF", ico: "#4F35D6", seta: "#8A82B0", prin: "#4F35D6", printinta: "#FFFFFF", papel: "#FFFFFF", linha: "#DCD5FB", avatar: "#FFFFFF", anel: "#4F35D6", foco: "#4F35D6" },
    azul: { fundo1: "#3A80BF", fundo2: "#286AA6", fundo3: "#173F68", on: "#FFFFFF", on2: "#E8EFF7", chip: "#1C4E7E", chipbd: "#5E8DBB", acento: "#F2CD8A", cartao: "#FFFFFF", tinta: "#16304F", tinta2: "#4A6285", icobg: "#E9EAE4", ico: "#286AA6", seta: "#5D799E", prin: "#E98B2B", printinta: "#142A44", papel: "#FFFFFF", linha: "#B9C4D1", avatar: "#FFFFFF", anel: "#D7A85A", foco: "#D7A85A" },
  },
};

/** As variáveis que o CSS de cada modelo lê (Main.dc.html), na ordem em que saem. */
const VARIAVEIS: Readonly<Record<Modelo, readonly string[]>> = {
  etiqueta: ["fundo1", "fundo2", "fundo3", "on", "on2", "chip", "chipbd", "fio", "acento", "cartao", "tinta", "tinta2", "icobg", "ico", "seta", "prin", "printinta", "papel", "linha", "foco"],
  vitrine: ["fundo2", "on", "on2", "linha", "acento", "tinta", "icobg", "ico", "seta", "prin", "printinta", "papel", "foco"],
  romaneio: ["fundo1", "fundo2", "fundo3", "on", "on2", "papel", "tinta", "tinta2", "linha", "acento", "foco", "foco-fora"],
  classico: ["fundo2", "fundo3", "on", "on2", "chip", "chipbd", "acento", "cartao", "tinta", "tinta2", "icobg", "ico", "seta", "prin", "printinta", "papel", "anel", "foco"],
};

/** `[texto, fundo, mínimo]`: cada cor que o CSS desenha sobre cada fundo. A ordem importa (o mesmo texto só escurece/clareia). */
export type ParDeContraste = readonly [texto: string, fundo: string, minimo: number];

/**
 * Os pares do `contraste.py` do mockup mais os que ele não via no CSS (ícone que vira texto
 * no "Copiar CNPJ" e no título do confere, horário sobre o papel, texto no pé do degradê).
 * Texto 4,5; ícone, seta e o nome grande no topo claro do degradê 3. O renderizador
 * (PRs 3a/3b) só pinta texto com pares desta lista; o véu da foto é fixo no CSS (sem token).
 */
export const PARES_DE_CONTRASTE: Readonly<Record<Modelo, readonly ParDeContraste[]>> = {
  etiqueta: [
    ["on", "fundo2", 4.5], ["on", "fundo1", 3], ["on", "fundo3", 4.5], ["on", "chip", 4.5],
    ["acento", "chip", 4.5], ["on2", "fundo3", 4.5],
    ["tinta", "cartao", 4.5], ["tinta", "papel", 4.5], ["tinta2", "cartao", 4.5], ["tinta2", "papel", 4.5],
    ["seta", "cartao", 3], ["ico", "icobg", 4.5], ["ico", "papel", 4.5], ["printinta", "prin", 4.5],
  ],
  vitrine: [
    ["on", "fundo2", 4.5], ["on2", "fundo2", 4.5], ["acento", "fundo2", 4.5], ["acento", "papel", 4.5],
    ["seta", "fundo2", 3], ["ico", "icobg", 3], ["printinta", "prin", 4.5], ["tinta", "papel", 4.5],
  ],
  romaneio: [
    ["tinta", "papel", 4.5], ["tinta2", "papel", 4.5], ["acento", "papel", 4.5],
    ["on", "fundo2", 4.5], ["on2", "fundo2", 4.5],
  ],
  classico: [
    ["on", "fundo2", 4.5], ["on", "chip", 4.5], ["on2", "fundo2", 4.5], ["acento", "chip", 4.5],
    ["tinta", "cartao", 4.5], ["tinta", "icobg", 4.5], ["tinta", "papel", 4.5],
    ["tinta2", "cartao", 4.5], ["tinta2", "papel", 4.5], ["seta", "cartao", 3],
    ["ico", "icobg", 3], ["ico", "papel", 4.5], ["printinta", "prin", 4.5],
  ],
};

/**
 * Onde o modelo desenha o anel de `--foco` (3:1 contra cada um, spec §3): onde ficam os links.
 * Dentro dos blocos de `--papel` do Etiqueta, Vitrine e Clássico (confere, endereço) o anel é
 * `var(--tinta)` — o par tinta/papel já garante 4,5 —, então o `--foco` não aparece lá.
 */
export const FUNDOS_DO_FOCO: Readonly<Record<Modelo, readonly string[]>> = {
  etiqueta: ["fundo1", "fundo2", "fundo3"],
  vitrine: ["fundo2"],
  romaneio: ["papel"],
  classico: ["fundo2"],
};

/** Só o Romaneio tem `--foco-fora`: o anel fora da nota, sobre o fundo da página. */
export const FUNDOS_DO_FOCO_FORA: readonly string[] = ["fundo1", "fundo2", "fundo3"];

function derivada(modelo: Modelo, fundo: string, botao: string): Record<string, string> {
  const on = textoSobre(fundo);
  const escuro = on === BRANCO;
  const tinta = garante(mistura(fundo, PRETO, 0.6), BRANCO, 7);
  const tinta2 = garante(mistura(tinta, BRANCO, 0.3), BRANCO, 4.5);
  const icobg = mistura(fundo, BRANCO, 0.88);
  const chip = escuro ? mistura(fundo, PRETO, 0.28) : BRANCO;
  const t: Record<string, string> = {
    fundo1: escuro ? garante(mistura(fundo, BRANCO, 0.12), on, 3) : mistura(fundo, BRANCO, 0.5),
    fundo2: fundo,
    fundo3: escuro ? mistura(fundo, PRETO, 0.45) : garante(mistura(fundo, PRETO, 0.08), on, 4.5),
    on,
    on2: garante(mistura(on, fundo, 0.25), fundo, 4.5),
    prin: botao,
    printinta: textoSobre(botao),
    foco: on,
    anel: botao,
    cartao: BRANCO,
    papel: mistura(fundo, BRANCO, 0.94),
    tinta,
    tinta2,
    icobg,
    ico: garante(escuro ? fundo : mistura(fundo, PRETO, 0.5), icobg, 3),
    seta: garante(mistura(tinta2, BRANCO, 0.15), BRANCO, 3),
    linha: mistura(tinta, BRANCO, 0.75),
    chip,
    chipbd: mistura(chip, on, 0.3),
    fio: mistura(botao, BRANCO, 0.25),
    acento: garante(mistura(botao, BRANCO, escuro ? 0.35 : 0), chip, 4.5),
  };
  if (modelo === "vitrine") {
    // Como a paleta "noite": o papel do confere acompanha a página e o texto dele é o da
    // página; o acento fica do lado do texto, para valer na folha e no confere.
    if (escuro) t.papel = garante(mistura(fundo, BRANCO, 0.08), on, 4.5);
    t.tinta = on;
    t.tinta2 = t.on2;
    t.acento = rumo(botao, fundo, 4.5, on) ?? on;
  }
  if (modelo === "romaneio") {
    t.papel = "#FFFDF7";
    t.tinta = "#1F1D19";
    t.tinta2 = "#5F584D";
    t.linha = "#D9D1C2";
    t.acento = garante(botao, t.papel, 4.5);
  }
  return t;
}

/** De `candidatas`, a de maior contraste mínimo contra `fundos` (empate: a primeira). */
function melhorAnel(candidatas: readonly string[], fundos: readonly string[]): string {
  const pior = (cor: string) => Math.min(...fundos.map((f) => contraste(cor, f)));
  return candidatas.reduce((melhor, cor) => (pior(cor) > pior(melhor) ? cor : melhor));
}

/**
 * Os tokens do modelo para a paleta escolhida. `"marca"` sem cores válidas (ou paleta que não é
 * do modelo) cai na primeira paleta do modelo — o renderizador nunca recebe cor fora de `#RRGGBB`.
 */
export function coresDoModelo(modelo: Modelo, paleta: string, cores: DocumentoBio["cores"]): TokensBio {
  const fundo = paleta === "marca" && cores ? parseHex(cores.fundo) : null;
  const botao = paleta === "marca" && cores ? parseHex(cores.botao) : null;
  const base =
    fundo && botao
      ? derivada(modelo, paraHex(fundo), paraHex(botao))
      : (PALETAS_PRONTAS[modelo][paleta] ?? PALETAS_PRONTAS[modelo][PALETAS[modelo][0]]);
  const t: Record<string, string> = { ...base };
  for (const [texto, fundo, minimo] of PARES_DE_CONTRASTE[modelo]) t[texto] = garante(t[texto], t[fundo], minimo);
  // O foco da paleta (o dourado do Etiqueta, o carimbo do Romaneio) fica onde passa; onde não
  // passa, o texto daquele fundo, o preto ou o branco — o de maior contraste mínimo.
  const fundosDoFoco = FUNDOS_DO_FOCO[modelo].map((f) => t[f]);
  const passa = fundosDoFoco.every((f) => contraste(base.foco, f) >= MIN_FOCO);
  t.foco = passa ? base.foco : melhorAnel([modelo === "romaneio" ? t.tinta : t.on, PRETO, BRANCO], fundosDoFoco);
  if (modelo === "romaneio") t["foco-fora"] = melhorAnel([t.on, PRETO, BRANCO], FUNDOS_DO_FOCO_FORA.map((f) => t[f]));
  return Object.fromEntries(VARIAVEIS[modelo].map((v) => [`--${v}`, t[v]]));
}
```

Os hex de `PALETAS_PRONTAS` são os do `paletas.json` (`Desktop/girumo-design-refs/link-da-bio/project/`, fora do repo); o primeiro teste confere cada um contra esta tabela e todos os pares, então um hex digitado errado aparece pelo nome (`etiqueta/rosa --chip`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/cores.test.ts`
Expected: `ℹ pass 10`, `ℹ fail 0` (os 500 sorteados levam ~0,3 s).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/bio/cores.ts apps/web/src/lib/bio/cores.test.ts
git commit -m "feat(bio): palette tokens with guaranteed contrast and focus rings"
```

### Task 6: Fechar a Parte 1 (gate, PR, merge e card)

**Files:** nenhum arquivo do repositório (cria `C:\Users\Igor\AppData\Local\Temp\link-da-bio-pr2a-card.sql`).

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: a Parte 1 em `main` (o que o PR 3a exige para começar); `blocker` do card reescrito.

- [ ] **Step 1: pureza e testes da Parte 1** (em `apps/web`):

```bash
git grep -n -E '^import .*(server-only|@supabase|"node:)|process\.' -- src/lib/bio/documento.ts src/lib/bio/cores.ts
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/entry-page.test.ts src/lib/links/short-link-click.test.ts src/lib/painel/link-parado.test.ts src/lib/bio/documento.test.ts src/lib/bio/cores.test.ts
```

Expected: o `git grep` não imprime nada; os testes terminam com `ℹ fail 0`.

- [ ] **Step 2: gate** (PowerShell, na raiz do worktree):

```powershell
powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`. Erro `ENOSPC` (disco C: cheio) não é do código: libere espaço ou deixe o CI validar, e diga isso no PR.

- [ ] **Step 3: push e PR** (se o classificador negar, entregue os comandos ao Igor e siga quando o PR existir):

```bash
cat > "$TEMP/pr2a.md" <<'EOF'
Parte 1 do PR 2 do link da bio (spec 2026-10-19-link-da-bio §3, §4, §9, §10; plano docs/superpowers/plans/2026-10-19-link-da-bio-pr2-nucleo.md).

- `lib/bio/documento.ts`: tipos e listas do §9, schema zod (`documentoBio`, `linkBio`) e `documentoPadrao`.
- `lib/bio/cores.ts`: variáveis CSS de cada modelo com contraste conferido (16 paletas do mockup + cores da marca).
- `escapeHtml` escapa também o apóstrofo (`&#39;`).

Nada é servido ainda: ninguém importa os módulos novos.

Diferenças da spec (decisões 1 e 6 do plano): `--foco` é o anel onde ficam os links e `--foco-fora` só existe no Romaneio (o dourado do Etiqueta e do Clássico azul tinha 1,9–2,9:1); CNPJ alfanumérico aceito.

Testes: documento 14, cores 10 (16 paletas, 500 marcas sorteadas, cinzas), entry-page, short-link-click e link-parado verdes; verify-local.ps1 verde.
EOF
WT=$(git rev-parse --show-toplevel); git -C "$WT" push -u origin feat/link-da-bio-pr2a-documento && gh pr create --repo codingB0y/Girumo --base main --head feat/link-da-bio-pr2a-documento --title "feat(bio): link-da-bio document schema, palette tokens and apostrophe escape (PR 2, part 1)" --body-file "$TEMP/pr2a.md"
```

Expected: a URL do PR (`<N>`).

- [ ] **Step 4: CI e merge na mesma sessão** (a `main` não tem proteção: merge à mão, só no verde):

```bash
gh pr checks <N> --repo codingB0y/Girumo --watch
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

Expected: todos os checks `pass`, depois o merge. Check vermelho: corrigir na branch (um job do e2e em `processing` é corrida no banco de dev: rodar de novo). Se o classificador negar o merge, entregue ao Igor `gh pr checks <N> --repo codingB0y/Girumo` e `gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo`.

- [ ] **Step 5: SQL do card** — ferramenta Write em `C:\Users\Igor\AppData\Local\Temp\link-da-bio-pr2a-card.sql`, trocando `<DD/MM>` e `<N>`. Antes, conferir em `git log origin/main --oneline -20 -i --grep bio` o que da série já entrou e escrever no `blocker` o que falta de verdade:

```sql
-- Link da bio, PR 2 parte 1 mergeada. O card continua em_construcao (move_card para o mesmo status
-- não grava evento), então o avanço vai no blocker, reescrito à mão.
update public.board_features
   set blocker = 'PR 2 parte 1 no ar em <DD/MM> (#<N>): documento.ts, cores.ts e escapeHtml com apóstrofo. Falta a parte 2 (store bio-pages, conferir, cache; precisa do PR 1 em main) e depois 3a, 4a, 4b, 5, 6a, 3b, 6b e 7.'
 where key = 'link-da-bio'
returning key, status, blocker;
```

- [ ] **Step 6: PEÇA AO IGOR — rodar em prod** (PowerShell 5.1; o link volta para dev no fim):

```powershell
Set-Location "C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\link-da-bio-pr2a\apps\web"
supabase link --project-ref nidoatbxaylrkcgbszns --yes
if ($LASTEXITCODE -eq 0) { supabase db query --linked -o json -f "$env:TEMP\link-da-bio-pr2a-card.sql" }
supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```

Expected: uma linha, `status` `em_construcao` e o `blocker` novo. Zero linhas = key diferente: `select key, status from public.board_features where key ilike '%bio%';` e refazer. Depois, apagar o worktree: `git -C /c/Users/Igor/Desktop/HubFlow-platform worktree remove .claude/worktrees/link-da-bio-pr2a`.

---

## Parte 2 — store, conferência e cache

### Task 7: Worktree da Parte 2 e store `bio-pages.ts`

**Files:**
- Create: `apps/web/src/lib/stores/bio-pages.ts`
- Test: `apps/web/src/lib/stores/bio-pages.test.ts`

**Interfaces:**
- Consumes: `UUID_BIO`, `type DocumentoBio` (Parte 1); `randomSuffix(length = 4): string` de `@/lib/pages/slug`; `getSupabaseAdmin()` de `@/lib/supabase/server`; do PR 1: tabelas `bio_pages` e `bio_slugs`, RPCs `bio_contar(p_pagina, p_alvo)` e `bio_relatorio(p_tenant, p_desde, p_ate)`, e os erros da tabela "Erros que o PR 2 lê" do plano do PR 1.
- Produces: `PaginaBio`, `RelatorioBio`, `lerPaginaDaLoja`, `criarPaginaDaLoja`, `salvarPaginaDaLoja`, `slugDisponivel`, `lerPublicadaPorSlug`, `lerPublicadaPorId`, `lerPublicadaDaLoja`, `contarBio`, `relatorioBio` — as assinaturas do §9 (pedidos exatos na Interface).

- [ ] **Step 1: o que precisa estar em `main`, e o worktree**

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform fetch origin main && git -C /c/Users/Igor/Desktop/HubFlow-platform ls-tree --name-only origin/main apps/web/src/lib/bio/ apps/web/supabase/migrations/ | grep -E "documento.ts|cores.ts|link_da_bio"; git -C /c/Users/Igor/Desktop/HubFlow-platform grep -n -E "já foi de outra página|bio_contar\(p_pagina uuid, p_alvo text\)|bio_relatorio\(p_tenant uuid" origin/main -- apps/web/supabase/migrations/ | head -5
```

Expected: `documento.ts`, `cores.ts` e a migração `…_link_da_bio.sql`; e o `grep` acha a mensagem do trigger e as duas RPCs com esses parâmetros. Faltou algo: **pare** (a Parte 1 ou o PR 1 ainda não entraram). Mensagem do trigger diferente de `bio_slugs: o slug "<slug>" já foi de outra página`: ajuste o `conflito()` do Step 4 e o teste (`ERRO`) ao texto de `main` e anote no PR.

```bash
git -C /c/Users/Igor/Desktop/HubFlow-platform worktree add .claude/worktrees/link-da-bio-pr2b -b feat/link-da-bio-pr2b-store origin/main
```

No worktree novo: `node_modules` por junction (ver "Ambiente do worktree" no índice).

- [ ] **Step 2: Write the failing test** — criar `apps/web/src/lib/stores/bio-pages.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { documentoPadrao } from "@/lib/bio/documento";
import type * as Store from "./bio-pages";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (padrão de `vendas.test.ts`): a
 * query que sai daqui é a de produção. O service-role passa por cima do RLS, então o que cada
 * teste confere é o filtro — `tenant_id=eq.` em toda query de `bio_pages`, menos as leituras
 * públicas por slug e por id. Respostas imitam o postgrest-js 2.108 (nunca 503/520: ele repete).
 */

type Visto = { metodo: string; url: URL; prefer: string; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const vistos: Visto[] = [];
let responder: (pedido: Visto) => Resposta = () => ({ status: 500 });

const postgrest = createServer((req, res) => {
  let texto = "";
  req.on("data", (parte) => (texto += parte));
  req.on("end", () => {
    const pedido: Visto = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      prefer: String(req.headers.prefer ?? ""),
      corpo: texto ? JSON.parse(texto) : undefined,
    };
    vistos.push(pedido);
    const { status, corpo } = responder(pedido);
    const objeto = String(req.headers.accept ?? "").includes("vnd.pgrst.object");
    const saida = objeto && Array.isArray(corpo) ? corpo[0] : corpo;
    if (saida !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(saida === undefined ? undefined : JSON.stringify(saida));
  });
});

let store: typeof Store;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  store = await import("./bio-pages");
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  vistos.length = 0;
});

const SELECT = "id,tenant_id,slug,publicada,bloqueada_em,documento,versao,updated_at";
const params = (url: URL) => Object.fromEntries(url.searchParams);
const DOC = documentoPadrao({ nome: "Loja Exemplo", campanhaId: null });
const LINHA = {
  id: "pagina-1",
  tenant_id: "loja-a",
  slug: "loja-exemplo",
  publicada: true,
  bloqueada_em: null,
  documento: DOC,
  versao: 3,
  updated_at: "2026-10-19T12:00:00.000Z",
};
const PAGINA = {
  id: "pagina-1",
  tenantId: "loja-a",
  slug: "loja-exemplo",
  publicada: true,
  bloqueadaEm: null,
  documento: DOC,
  versao: 3,
  updatedAt: "2026-10-19T12:00:00.000Z",
};

const ERRO = {
  loja: { code: "23505", message: 'duplicate key value violates unique constraint "bio_pages_tenant_id_key"', details: "Key (tenant_id)=(loja-a) already exists.", hint: null },
  slugAtual: { code: "23505", message: 'duplicate key value violates unique constraint "bio_pages_slug_key"', details: "Key (slug)=(loja-exemplo) already exists.", hint: null },
  slugAntigo: { code: "23505", message: 'bio_slugs: o slug "loja-exemplo" já foi de outra página', details: null, hint: null },
  outroUnique: { code: "23505", message: 'duplicate key value violates unique constraint "outra_coisa_key"', details: null, hint: null },
};

test("lê a página da loja só com o tenant e devolve em camelCase", async () => {
  responder = () => ({ status: 200, corpo: [LINHA] });
  assert.deepEqual(await store.lerPaginaDaLoja("loja-a"), PAGINA);
  assert.equal(vistos[0].url.pathname, "/rest/v1/bio_pages");
  assert.deepEqual(params(vistos[0].url), { select: SELECT, tenant_id: "eq.loja-a" });

  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await store.lerPaginaDaLoja("loja-a"), null);
});

test("cria como rascunho, com a loja, o slug e o documento", async () => {
  responder = () => ({ status: 201, corpo: [{ ...LINHA, publicada: false, versao: 1 }] });
  const criada = await store.criarPaginaDaLoja("loja-a", "loja-exemplo", DOC);
  assert.equal(criada.publicada, false);
  assert.equal(criada.versao, 1);
  assert.deepEqual([vistos[0].metodo, vistos[0].url.pathname], ["POST", "/rest/v1/bio_pages"]);
  assert.deepEqual(vistos[0].corpo, { tenant_id: "loja-a", slug: "loja-exemplo", publicada: false, documento: DOC });
  assert.match(vistos[0].prefer, /return=representation/);
});

test("criar de novo (23505 em bio_pages_tenant_id_key) devolve a página que já existe", async () => {
  responder = (p) => (p.metodo === "POST" ? { status: 409, corpo: ERRO.loja } : { status: 200, corpo: [LINHA] });
  assert.deepEqual(await store.criarPaginaDaLoja("loja-a", "loja-exemplo", DOC), PAGINA);
  assert.equal(vistos.length, 2);
  assert.deepEqual(params(vistos[1].url), { select: SELECT, tenant_id: "eq.loja-a" });
});

test("slug tomado (bio_pages_slug_key ou bio_slugs) tenta de novo com sufixo", async () => {
  let posts = 0;
  responder = () => {
    posts += 1;
    if (posts === 1) return { status: 409, corpo: ERRO.slugAtual };
    if (posts === 2) return { status: 409, corpo: ERRO.slugAntigo };
    return { status: 201, corpo: [{ ...LINHA, slug: "loja-exemplo-k7m2" }] };
  };
  await store.criarPaginaDaLoja("loja-a", "loja-exemplo", DOC);
  const slugs = vistos.map((p) => (p.corpo as { slug: string }).slug);
  assert.equal(slugs[0], "loja-exemplo");
  assert.match(slugs[1], /^loja-exemplo-[a-z2-9]{4}$/);
  assert.match(slugs[2], /^loja-exemplo-[a-z2-9]{4}$/);
});

test("sufixo nunca passa de 40 nem deixa hífen duplo", async () => {
  responder = (p) => (vistos.length === 1 ? { status: 409, corpo: ERRO.slugAtual } : { status: 201, corpo: [{ ...LINHA, slug: (p.corpo as { slug: string }).slug }] });
  const longo = `${"a".repeat(34)}-bbbbb`; // 40, com hífen na posição 35
  const criada = await store.criarPaginaDaLoja("loja-a", longo, DOC);
  assert.ok(criada.slug.length <= 40, criada.slug);
  assert.match(criada.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
});

test("três slugs tomados seguidos: desiste com erro; 23505 de outra unique e 500 sobem", async () => {
  responder = () => ({ status: 409, corpo: ERRO.slugAntigo });
  await assert.rejects(store.criarPaginaDaLoja("loja-a", "loja-exemplo", DOC), /Não foi possível reservar/);
  assert.equal(vistos.length, 3);

  responder = () => ({ status: 409, corpo: ERRO.outroUnique });
  await assert.rejects(store.criarPaginaDaLoja("loja-a", "loja-exemplo", DOC), /outra_coisa_key/);

  responder = () => ({ status: 500, corpo: { code: "XX000", message: "caiu", details: null, hint: null } });
  await assert.rejects(store.criarPaginaDaLoja("loja-a", "loja-exemplo", DOC), /caiu/);
});

test("salvar: update só da loja e só na versão lida, gravando versão + 1 e updated_at", async () => {
  responder = () => ({ status: 200, corpo: [{ ...LINHA, versao: 4, slug: "nova" }] });
  const r = await store.salvarPaginaDaLoja("loja-a", { versao: 3, slug: "nova", publicada: true, documento: DOC });
  assert.ok(r.ok && r.pagina.versao === 4 && r.pagina.slug === "nova");
  assert.equal(vistos[0].metodo, "PATCH");
  assert.deepEqual(params(vistos[0].url), { select: SELECT, tenant_id: "eq.loja-a", versao: "eq.3" });
  const corpo = vistos[0].corpo as Record<string, unknown>;
  assert.deepEqual({ ...corpo, updated_at: "x" }, { slug: "nova", publicada: true, documento: DOC, versao: 4, updated_at: "x" });
  assert.ok(!Number.isNaN(Date.parse(String(corpo.updated_at))));
});

test("salvar sem linha atualizada: relê pela loja — existe é 'versao', não existe é 'sem-pagina'", async () => {
  responder = (p) => (p.metodo === "PATCH" ? { status: 200, corpo: [] } : { status: 200, corpo: [LINHA] });
  assert.deepEqual(await store.salvarPaginaDaLoja("loja-a", { versao: 2, slug: "x-y", publicada: true, documento: DOC }), { ok: false, motivo: "versao" });
  assert.deepEqual(params(vistos[1].url), { select: SELECT, tenant_id: "eq.loja-a" });

  responder = () => ({ status: 200, corpo: [] });
  assert.deepEqual(await store.salvarPaginaDaLoja("loja-b", { versao: 1, slug: "x-y", publicada: false, documento: DOC }), { ok: false, motivo: "sem-pagina" });
});

test("salvar com slug de outra página (atual ou antigo) é 'slug'; outro 23505 sobe", async () => {
  for (const erro of [ERRO.slugAtual, ERRO.slugAntigo]) {
    responder = () => ({ status: 409, corpo: erro });
    assert.deepEqual(await store.salvarPaginaDaLoja("loja-a", { versao: 3, slug: "loja-exemplo", publicada: true, documento: DOC }), { ok: false, motivo: "slug" });
  }
  responder = () => ({ status: 409, corpo: ERRO.outroUnique });
  await assert.rejects(store.salvarPaginaDaLoja("loja-a", { versao: 3, slug: "x-y", publicada: true, documento: DOC }), /outra_coisa_key/);
});

test("slug disponível: nunca usado, já desta loja, de outra loja, de página apagada", async () => {
  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await store.slugDisponivel("novo-slug", "loja-a"), true);
  assert.equal(vistos[0].url.pathname, "/rest/v1/bio_slugs");
  assert.deepEqual(params(vistos[0].url), { select: "pagina_id", slug: "eq.novo-slug" });

  vistos.length = 0;
  responder = (p) => (p.url.pathname === "/rest/v1/bio_slugs" ? { status: 200, corpo: [{ pagina_id: "pagina-1" }] } : { status: 200, corpo: [{ id: "pagina-1" }] });
  assert.equal(await store.slugDisponivel("loja-exemplo", "loja-a"), true);
  assert.deepEqual(params(vistos[1].url), { select: "id", tenant_id: "eq.loja-a", id: "eq.pagina-1" });

  responder = (p) => (p.url.pathname === "/rest/v1/bio_slugs" ? { status: 200, corpo: [{ pagina_id: "pagina-de-outra" }] } : { status: 200, corpo: [] });
  assert.equal(await store.slugDisponivel("loja-exemplo", "loja-a"), false);

  responder = () => ({ status: 200, corpo: [{ pagina_id: null }] });
  assert.equal(await store.slugDisponivel("loja-apagada", "loja-a"), false);
});

test("leitura pública pelo slug (atual ou antigo) passa por bio_slugs e só devolve publicada sem bloqueio", async () => {
  responder = (p) => (p.url.pathname === "/rest/v1/bio_slugs" ? { status: 200, corpo: [{ pagina_id: "pagina-1" }] } : { status: 200, corpo: [LINHA] });
  assert.deepEqual(await store.lerPublicadaPorSlug("slug-antigo"), PAGINA);
  assert.deepEqual(params(vistos[0].url), { select: "pagina_id", slug: "eq.slug-antigo" });
  assert.deepEqual(params(vistos[1].url), { select: SELECT, id: "eq.pagina-1", publicada: "eq.true", bloqueada_em: "is.null" });

  vistos.length = 0;
  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await store.lerPublicadaPorSlug("nao-existe"), null);
  assert.equal(vistos.length, 1, "slug desconhecido não vai a bio_pages");

  responder = () => ({ status: 200, corpo: [{ pagina_id: null }] });
  assert.equal(await store.lerPublicadaPorSlug("de-pagina-apagada"), null);
});

test("leitura pública por id e da loja: publicada = true e bloqueada_em nulo", async () => {
  responder = () => ({ status: 200, corpo: [LINHA] });
  await store.lerPublicadaPorId("pagina-1");
  assert.deepEqual(params(vistos[0].url), { select: SELECT, id: "eq.pagina-1", publicada: "eq.true", bloqueada_em: "is.null" });
  await store.lerPublicadaDaLoja("loja-a");
  assert.deepEqual(params(vistos[1].url), { select: SELECT, tenant_id: "eq.loja-a", publicada: "eq.true", bloqueada_em: "is.null" });
});

test("contar chama bio_contar com a página e o alvo; alvo fora do formato nem chama", async () => {
  responder = () => ({ status: 204 });
  await store.contarBio("pagina-1", "visita");
  await store.contarBio("pagina-1", "11111111-2222-4333-8444-aaaaaaaaaaaa");
  assert.deepEqual(
    vistos.map((p) => [p.metodo, p.url.pathname, p.corpo]),
    [
      ["POST", "/rest/v1/rpc/bio_contar", { p_pagina: "pagina-1", p_alvo: "visita" }],
      ["POST", "/rest/v1/rpc/bio_contar", { p_pagina: "pagina-1", p_alvo: "11111111-2222-4333-8444-aaaaaaaaaaaa" }],
    ],
  );
  vistos.length = 0;
  await assert.rejects(store.contarBio("pagina-1", "11111111-2222-4333-8444-AAAAAAAAAAAA"), /Alvo de contagem inválido/);
  await assert.rejects(store.contarBio("pagina-1", "visitas"), /Alvo de contagem inválido/);
  assert.equal(vistos.length, 0);
});

test("relatório chama bio_relatorio com a loja e as datas e devolve o JSON do banco", async () => {
  const relatorio = { visitas: 10, toques: 4, porLink: [{ linkId: "l1", toques: 4 }], porDia: [{ dia: "2026-10-19", visitas: 10, toques: 4 }] };
  responder = () => ({ status: 200, corpo: relatorio });
  assert.deepEqual(await store.relatorioBio("loja-a", "2026-10-13", "2026-10-19"), relatorio);
  assert.deepEqual([vistos[0].url.pathname, vistos[0].corpo], ["/rest/v1/rpc/bio_relatorio", { p_tenant: "loja-a", p_desde: "2026-10-13", p_ate: "2026-10-19" }]);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/bio-pages.test.ts`
Expected: FAIL — `ℹ fail 14`, com `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\src\lib\stores\bio-pages'`.

- [ ] **Step 4: Criar `apps/web/src/lib/stores/bio-pages.ts`:**

```ts
import "server-only";

import { UUID_BIO, type DocumentoBio } from "@/lib/bio/documento";
import { randomSuffix } from "@/lib/pages/slug";
import { getSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Store do link da bio (spec 2026-10-19-link-da-bio §5 e §9). As três tabelas têm RLS sem
 * policy e o service-role passa por cima: o filtro `tenant_id` é a proteção real, e toda query
 * em `bio_pages` leva o seu — menos as três leituras públicas (por slug e por id), que são o
 * ponto de entrada sem loja, como `getTrackedLinkBySlug`; ali quem filtra é `publicada` e
 * `bloqueada_em`, e o `tenant_id` da linha passa a valer daí em diante. `bio_slugs` não tem
 * `tenant_id`: é lida só por slug.
 */

const PAGINAS = "bio_pages";
const SLUGS = "bio_slugs";
const COLUNAS = "id, tenant_id, slug, publicada, bloqueada_em, documento, versao, updated_at";
const UNIQUE_VIOLATION = "23505";
const TENTATIVAS_DE_SLUG = 3;

export type PaginaBio = {
  id: string;
  tenantId: string;
  slug: string;
  publicada: boolean;
  bloqueadaEm: string | null;
  documento: DocumentoBio;
  versao: number;
  updatedAt: string;
};

export type RelatorioBio = {
  visitas: number;
  toques: number;
  porLink: { linkId: string; toques: number }[];
  porDia: { dia: string; visitas: number; toques: number }[];
};

type Linha = {
  id: string;
  tenant_id: string;
  slug: string;
  publicada: boolean;
  bloqueada_em: string | null;
  documento: DocumentoBio;
  versao: number;
  updated_at: string;
};

type ErroDoBanco = { code?: string; message: string; details?: string | null };

function paraPagina(l: Linha): PaginaBio {
  return {
    id: l.id,
    tenantId: l.tenant_id,
    slug: l.slug,
    publicada: l.publicada,
    bloqueadaEm: l.bloqueada_em,
    documento: l.documento,
    versao: l.versao,
    updatedAt: l.updated_at,
  };
}

/**
 * Qual unique o 23505 bateu (nomes fixados no PR 1): a loja já tem página, ou o slug é de outra
 * página — atual (`bio_pages_slug_key`) ou de antes (o trigger `bio_pages_registra_slug`, cuja
 * mensagem começa com `bio_slugs:`). Outro 23505 não é esperado e sobe como erro.
 */
function conflito(e: ErroDoBanco): "loja" | "slug" | null {
  if (e.code !== UNIQUE_VIOLATION) return null;
  const texto = `${e.message} ${e.details ?? ""}`;
  if (texto.includes("bio_pages_tenant_id_key")) return "loja";
  if (texto.includes("bio_pages_slug_key") || texto.includes("bio_slugs")) return "slug";
  return null;
}

/** `loja-exemplo` → `loja-exemplo-k7m2` (no máximo 40, sem hífen duplo). */
function comSufixo(slug: string): string {
  return `${slug.slice(0, 35).replace(/-+$/, "")}-${randomSuffix(4)}`;
}

export async function lerPaginaDaLoja(tenantId: string): Promise<PaginaBio | null> {
  const { data, error } = await getSupabaseAdmin().from(PAGINAS).select(COLUNAS).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? paraPagina(data as Linha) : null;
}

/**
 * Cria a página da loja como rascunho. Idempotente: loja que já tem página (23505 em
 * `bio_pages_tenant_id_key`) recebe a que existe. Slug tomado tenta de novo com sufixo, como
 * `createLandingPage`. Quem chama já validou o slug (formato e `slugReservado`).
 */
export async function criarPaginaDaLoja(tenantId: string, slug: string, documento: DocumentoBio): Promise<PaginaBio> {
  for (let tentativa = 0; tentativa < TENTATIVAS_DE_SLUG; tentativa++) {
    const { data, error } = await getSupabaseAdmin()
      .from(PAGINAS)
      .insert({ tenant_id: tenantId, slug: tentativa === 0 ? slug : comSufixo(slug), publicada: false, documento })
      .select(COLUNAS)
      .single();
    if (!error) return paraPagina(data as Linha);
    const tipo = conflito(error);
    if (tipo === "loja") {
      const existente = await lerPaginaDaLoja(tenantId);
      if (existente) return existente;
      throw new Error("A página da loja sumiu entre o insert e a leitura.");
    }
    if (tipo !== "slug") throw new Error(error.message);
  }
  throw new Error("Não foi possível reservar um endereço livre. Tente de novo.");
}

/**
 * Salvar com trava otimista: o update só pega a linha da loja na `versao` que o painel leu, e
 * grava `versao + 1` e `updated_at` junto (espelho de `compareAndSwapLandingPage`). Nenhuma
 * linha = alguém salvou antes ("versao", 409) ou a loja não tem página ("sem-pagina", 404).
 */
export async function salvarPaginaDaLoja(
  tenantId: string,
  e: { versao: number; slug: string; publicada: boolean; documento: DocumentoBio },
): Promise<{ ok: true; pagina: PaginaBio } | { ok: false; motivo: "versao" | "slug" | "sem-pagina" }> {
  const { data, error } = await getSupabaseAdmin()
    .from(PAGINAS)
    .update({
      slug: e.slug,
      publicada: e.publicada,
      documento: e.documento,
      versao: e.versao + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("tenant_id", tenantId)
    .eq("versao", e.versao)
    .select(COLUNAS)
    .maybeSingle();
  if (error) {
    if (conflito(error) === "slug") return { ok: false, motivo: "slug" };
    throw new Error(error.message);
  }
  if (data) return { ok: true, pagina: paraPagina(data as Linha) };
  return { ok: false, motivo: (await lerPaginaDaLoja(tenantId)) ? "versao" : "sem-pagina" };
}

/** Livre = nunca usado; ou já usado por esta mesma loja. Slug de página apagada fica preso. */
export async function slugDisponivel(slug: string, tenantId: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.from(SLUGS).select("pagina_id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return true;
  const paginaId = (data as { pagina_id: string | null }).pagina_id;
  if (!paginaId) return false;
  const { data: propria, error: erroDaPagina } = await supabase
    .from(PAGINAS)
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("id", paginaId)
    .maybeSingle();
  if (erroDaPagina) throw new Error(erroDaPagina.message);
  return propria !== null;
}

/** Pelo slug atual ou por um antigo (`bio_slugs`): quem chama compara `pagina.slug` para o 301. */
export async function lerPublicadaPorSlug(slug: string): Promise<PaginaBio | null> {
  const { data, error } = await getSupabaseAdmin().from(SLUGS).select("pagina_id").eq("slug", slug).maybeSingle();
  if (error) throw new Error(error.message);
  const paginaId = (data as { pagina_id: string | null } | null)?.pagina_id;
  return paginaId ? lerPublicadaPorId(paginaId) : null;
}

export async function lerPublicadaPorId(id: string): Promise<PaginaBio | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PAGINAS)
    .select(COLUNAS)
    .eq("id", id)
    .eq("publicada", true)
    .is("bloqueada_em", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? paraPagina(data as Linha) : null;
}

export async function lerPublicadaDaLoja(tenantId: string): Promise<PaginaBio | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PAGINAS)
    .select(COLUNAS)
    .eq("tenant_id", tenantId)
    .eq("publicada", true)
    .is("bloqueada_em", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? paraPagina(data as Linha) : null;
}

/**
 * +1 no contador do dia (`bio_contar`; a loja sai da página, no banco). `alvo` = `"visita"` ou o
 * uuid minúsculo do link — o CHECK `bio_contagens_alvo_check` recusa o resto, então nem chama.
 */
export async function contarBio(paginaId: string, alvo: string): Promise<void> {
  if (alvo !== "visita" && !UUID_BIO.test(alvo)) throw new Error("Alvo de contagem inválido.");
  const { error } = await getSupabaseAdmin().rpc("bio_contar", { p_pagina: paginaId, p_alvo: alvo });
  if (error) throw new Error(error.message);
}

/** Agregado no SQL (`bio_relatorio`), nunca no app: o PostgREST corta em 1000 linhas sem avisar. */
export async function relatorioBio(tenantId: string, desde: string, ate: string): Promise<RelatorioBio> {
  const { data, error } = await getSupabaseAdmin().rpc("bio_relatorio", { p_tenant: tenantId, p_desde: desde, p_ate: ate });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("bio_relatorio não devolveu nada.");
  return data as RelatorioBio;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/bio-pages.test.ts`
Expected: `ℹ pass 14`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/stores/bio-pages.ts apps/web/src/lib/stores/bio-pages.test.ts
git commit -m "feat(bio): bio-pages store"
```

### Task 8: `conferir.ts` — mídia, campanha e número contra a loja

**Files:**
- Modify: `apps/web/src/lib/media-store.ts` (nova função antes de `readMedia`)
- Modify: `apps/web/src/lib/stores/tracked-links.ts` (nova função depois de `getTrackedLinkById`)
- Create: `apps/web/src/lib/bio/conferir.ts`
- Test: `apps/web/src/lib/bio/conferir.test.ts`

**Interfaces:**
- Consumes: Parte 1 (`DadosRender`, `DocumentoBio`, `LinkBio`, `documentoPadrao` no teste); `chaveDoTelefone(raw: string | null | undefined): string | null` de `@/lib/pages/phone`; `listCampaignGroups(tenantId: string): Promise<CampaignGroup[]>` e `type CampaignGroup` de `@/lib/stores/campaign-groups`; `listInstances(tenantId: string): Promise<Instance[]>` de `@/lib/stores/instances`; `mediaPathBelongsToTenant(storagePath: string, tenantId: string): boolean` (já importado em `media-store.ts`).
- Produces: `conferirDocumentoDaLoja` e `estadoDosLinks` (§9), e os novos `midiasPublicasDaLoja`, `listTrackedLinksBySlugs`, `linksMestresDasCampanhas`, `numeroDoLinkWhatsapp`, `NUMERO_CONECTADO`.

- [ ] **Step 1: Write the failing test** — criar `apps/web/src/lib/bio/conferir.test.ts`:

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { documentoPadrao, type DocumentoBio, type LinkBio } from "./documento";
import type * as Conferir from "./conferir";

/**
 * As conferências contra um PostgREST de mentira (padrão de `vendas.test.ts`): o que sai daqui
 * são as queries reais de `media-store`, `campaign-groups`, `tracked-links` e `instances`, e o
 * teste confere o filtro de loja em cada uma. Dados fictícios (repositório público).
 */

type Visto = { url: URL };
const vistos: Visto[] = [];

/** O "banco": o que cada tabela devolve para a loja A. */
let banco: {
  uploads: string[]; // caminhos `uploads/<loja>/media/<arquivo>` com kind lp-*
  campanhas: { id: string; slug: string }[];
  links: { slug: string; campaign_group_id: string }[];
  telefones: (string | null)[];
};

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  vistos.push({ url });
  const lista = (nome: string) => (url.searchParams.get(nome) ?? "").replace(/^in\.\(|\)$/g, "").split(",");
  let corpo: unknown = [];
  if (url.pathname === "/rest/v1/uploads") corpo = banco.uploads.filter((p) => lista("path").includes(p)).map((path) => ({ path }));
  if (url.pathname === "/rest/v1/campaign_groups") corpo = banco.campanhas.map((c) => ({ ...c, tenant_id: LOJA, name: c.slug, group_ids: [], metadata: {} }));
  if (url.pathname === "/rest/v1/tracked_links") corpo = banco.links.filter((l) => lista("slug").includes(l.slug));
  if (url.pathname === "/rest/v1/instances") corpo = banco.telefones.map((phone, i) => ({ id: `inst-${i}`, tenant_id: LOJA, phone, status: "connected" }));
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(corpo));
});

let conferir: typeof Conferir;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  conferir = await import("./conferir");
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  vistos.length = 0;
  banco = { uploads: [], campanhas: [], links: [], telefones: [] };
});

const LOJA = "11111111-1111-4111-8111-111111111111";
const OUTRA = "22222222-2222-4222-8222-222222222222";
const C1 = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const C2 = "1c0b9d8e-7f60-4b4c-8d3e-2f1a0b9c8d7e";
const ZAP = "62999990000"; // loja: (62) 99999-0000

function caminho(loja: string, arquivo: string) {
  return `${loja}/media/${arquivo}.jpg`;
}
function midiaId(loja: string, arquivo: string) {
  return Buffer.from(caminho(loja, arquivo), "utf8").toString("base64url");
}
/** O mesmo caminho com os 2 bits de sobra do último caractere ligados: decodifica igual, mas não é o id canônico. */
function naoCanonico(id: string): string {
  const alfabeto = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  return id.slice(0, -1) + alfabeto[alfabeto.indexOf(id.slice(-1)) + 1];
}
const FOTO = "a1b2c3d4-0000-4000-8000-000000000001";
const FOTO2 = "a1b2c3d4-0000-4000-8000-000000000002";

let seq = 0;
function link(tipo: LinkBio["tipo"], extra: Record<string, unknown>): LinkBio {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  const base = { id, titulo: "Botão", sub: "", icone: "link", ativo: true };
  if (tipo === "endereco") return { ...base, tipo, endereco: "Rua Um, 100", horario: "", foto: null, ...extra } as LinkBio;
  return { ...base, tipo, destaque: false, ...extra } as LinkBio;
}

function documento(links: LinkBio[], muda: (d: DocumentoBio) => void = () => {}): DocumentoBio {
  const d = documentoPadrao({ nome: "Loja Exemplo", campanhaId: null });
  d.links = links;
  muda(d);
  return d;
}

const filtros = (pathname: string) => Object.fromEntries(vistos.find((v) => v.url.pathname === pathname)!.url.searchParams);

test("sem mídia, sem grupo e sem WhatsApp: ok, sem nenhuma consulta", async () => {
  const d = documento([link("link", { url: "https://lojaexemplo.com.br/", fotos: [] }), link("endereco", {})]);
  assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, d), { ok: true });
  assert.deepEqual(await conferir.estadoDosLinks(LOJA, d), { campanhas: {}, linksEscondidos: [] });
  assert.equal(vistos.length, 0);
});

test("mídia: só a da loja, com a linha lp-* em uploads, consultada pela loja", async () => {
  banco.uploads = [`uploads/${caminho(LOJA, FOTO)}`];
  const ok = documento([], (d) => { d.perfil.capa = { id: midiaId(LOJA, FOTO), foco: null }; });
  assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, ok), { ok: true });
  assert.deepEqual(filtros("/rest/v1/uploads"), {
    select: "path",
    tenant_id: `eq.${LOJA}`,
    bucket: "eq.uploads",
    kind: "in.(lp-media,lp-logo)",
    path: `in.(uploads/${caminho(LOJA, FOTO)})`,
  });

  // Arquivo da loja sem a linha em uploads (ou com kind privado): recusado.
  const semLinha = documento([link("link", { url: "https://lojaexemplo.com.br/", fotos: [{ id: midiaId(LOJA, FOTO2), foco: null }] })]);
  assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, semLinha), { ok: false, error: "Essa imagem não está na sua loja. Envie de novo.", campo: "links.0.fotos.0" });
});

test("mídia de outra loja ou id que não é o caminho canônico: recusada sem nem ir ao banco", async () => {
  const torto = naoCanonico(midiaId(LOJA, FOTO));
  assert.equal(Buffer.from(torto, "base64url").toString("utf8"), caminho(LOJA, FOTO), "mesmo caminho, outro id");
  for (const id of [midiaId(OUTRA, FOTO), "abc", torto]) {
    vistos.length = 0;
    banco.uploads = [`uploads/${caminho(LOJA, FOTO)}`, `uploads/${caminho(OUTRA, FOTO)}`];
    const d = documento([], (x) => { x.perfil.logoClara = { id, foco: null }; });
    const r = await conferir.conferirDocumentoDaLoja(LOJA, d);
    assert.equal(r.ok === false && r.campo, "perfil.logoClara", id);
    assert.equal(vistos.filter((v) => v.url.pathname === "/rest/v1/uploads").length, 0, id);
  }
});

test("campanha que não é da loja (ou foi apagada): erro no campo da campanha", async () => {
  banco.campanhas = [{ id: C1, slug: "vip-atacado" }];
  const d = documento([link("grupo", { campanhaId: C1 }), link("grupo", { campanhaId: C2 })]);
  assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, d), { ok: false, error: "Essa campanha não existe mais. Escolha outra.", campo: "links.1.campanhaId" });
  assert.equal(filtros("/rest/v1/campaign_groups").tenant_id, `eq.${LOJA}`);
});

test("número que a Girumo usa para postar: recusado no WhatsApp e no wa.me, com ou sem o nono dígito", async () => {
  banco.telefones = [null, `556299990000`]; // instância sem o 9 da frente
  const casos: [LinkBio, string][] = [
    [link("whatsapp", { numero: `55${ZAP}`, mensagem: "" }), "links.0.numero"],
    [link("link", { url: `https://wa.me/55${ZAP}?text=oi`, fotos: [] }), "links.0.url"],
    [link("link", { url: `https://api.whatsapp.com/send/?phone=55${ZAP}`, fotos: [] }), "links.0.url"],
  ];
  for (const [l, campo] of casos) {
    vistos.length = 0;
    assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, documento([l])), { ok: false, error: conferir.NUMERO_CONECTADO, campo });
    assert.equal(filtros("/rest/v1/instances").tenant_id, `eq.${LOJA}`);
  }
  assert.deepEqual(await conferir.conferirDocumentoDaLoja(LOJA, documento([link("whatsapp", { numero: "5562988887777", mensagem: "" })])), { ok: true });
});

test("estado dos links: slug do link mestre, e some o que não pode sair", async () => {
  const C3 = "2d1c0e9f-8071-4c5d-9e4f-3a2b1c0d9e8f";
  banco.campanhas = [{ id: C1, slug: "vip-atacado" }, { id: C3, slug: "saldao" }];
  banco.links = [
    { slug: "vip-antigo", campaign_group_id: C1 }, // apelido de slug antigo
    { slug: "vip-atacado", campaign_group_id: C1 }, // o mestre
    { slug: "saldao", campaign_group_id: C1 }, // o slug do C3 num link do C1: o C3 não tem link mestre
  ];
  banco.telefones = [`55${ZAP}`];
  const vip = link("grupo", { campanhaId: C1 });
  const apagada = link("grupo", { campanhaId: C2 });
  const semMestre = link("grupo", { campanhaId: C3 });
  const conectado = { ...link("whatsapp", { numero: `55${ZAP}`, mensagem: "" }), ativo: false } as LinkBio;
  const atendimento = link("whatsapp", { numero: "5562988887777", mensagem: "" });
  const waMe = link("link", { url: `https://wa.me/55${ZAP}`, fotos: [] });
  const site = link("link", { url: "https://lojaexemplo.com.br/", fotos: [] });

  const r = await conferir.estadoDosLinks(LOJA, documento([vip, apagada, semMestre, conectado, atendimento, waMe, site]));
  assert.deepEqual(r.campanhas, { [C1]: "vip-atacado" });
  assert.deepEqual(r.linksEscondidos, [apagada.id, semMestre.id, conectado.id, waMe.id]);
  assert.deepEqual(filtros("/rest/v1/tracked_links"), {
    select: "slug,campaign_group_id",
    tenant_id: `eq.${LOJA}`,
    slug: "in.(vip-atacado,saldao)", // só as campanhas que existem na loja
  });
});

test("link mestre: a mesma regra que o painel usa no seletor de campanhas", async () => {
  banco.links = [{ slug: "vip-atacado", campaign_group_id: C1 }, { slug: "nome-velho", campaign_group_id: C2 }];
  assert.deepEqual(
    await conferir.linksMestresDasCampanhas(LOJA, [{ id: C1, slug: "vip-atacado" }, { id: C2, slug: "nome-novo" }]),
    { [C1]: "vip-atacado" },
  );
  vistos.length = 0;
  assert.deepEqual(await conferir.linksMestresDasCampanhas(LOJA, []), {});
  assert.equal(vistos.length, 0, "sem campanha, sem consulta");
});

test("muitas campanhas: slugs em lotes de 100 (o filtro vai na URL), todos com a loja", async () => {
  const campanhas = Array.from({ length: 150 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, slug: `campanha-${i}` }));
  banco.links = campanhas.map((c) => ({ slug: c.slug, campaign_group_id: c.id }));
  assert.equal(Object.keys(await conferir.linksMestresDasCampanhas(LOJA, campanhas)).length, 150);
  const pedidos = vistos.filter((v) => v.url.pathname === "/rest/v1/tracked_links");
  assert.deepEqual(pedidos.map((v) => (v.url.searchParams.get("slug") ?? "").split(",").length).sort((a, b) => b - a), [100, 50]);
  for (const v of pedidos) assert.equal(v.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
});

test("número de um endereço do WhatsApp", () => {
  assert.equal(conferir.numeroDoLinkWhatsapp("https://wa.me/5562999990000?text=oi"), "5562999990000");
  assert.equal(conferir.numeroDoLinkWhatsapp("https://api.whatsapp.com/send?phone=%2B55%2062%2099999-0000"), "5562999990000");
  assert.equal(conferir.numeroDoLinkWhatsapp("https://wa.me/message/ABCDEF"), null);
  assert.equal(conferir.numeroDoLinkWhatsapp("https://whatsapp.com/channel/0029Va"), null);
  assert.equal(conferir.numeroDoLinkWhatsapp("https://lojaexemplo.com.br/?phone=5562999990000"), null);
  assert.equal(conferir.numeroDoLinkWhatsapp("não é url"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/conferir.test.ts`
Expected: FAIL — `ℹ fail 9`, com `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\src\lib\bio\conferir'`.

- [ ] **Step 3: `midiasPublicasDaLoja`** — em `apps/web/src/lib/media-store.ts`, logo antes de `export async function readMedia(`, acrescentar:

```ts
/**
 * Dos ids recebidos, os que são imagem PÚBLICA de LP (`lp-media`/`lp-logo`) desta loja — o
 * link da bio só salva documento cuja mídia passa aqui (spec 2026-10-19-link-da-bio §4). O id é
 * o caminho em base64url: vale só o canônico (`encode(decode(id)) === id`), dentro da pasta da
 * loja, e com a linha da loja em `uploads`. Sem essa linha `/api/p/media/<id>` dá 404.
 */
export async function midiasPublicasDaLoja(tenantId: string, ids: readonly string[]): Promise<Set<string>> {
  const idPorCaminho = new Map<string, string>();
  for (const id of new Set(ids)) {
    const caminho = decodeMediaId(id);
    if (caminho && encodeMediaId(caminho) === id && mediaPathBelongsToTenant(caminho, tenantId)) {
      idPorCaminho.set(`uploads/${caminho}`, id);
    }
  }
  if (idPorCaminho.size === 0) return new Set();
  const { data, error } = await getSupabaseAdmin()
    .from("uploads")
    .select("path")
    .eq("tenant_id", tenantId)
    .eq("bucket", BUCKET)
    .in("kind", [...PUBLIC_LP_KINDS])
    .in("path", [...idPorCaminho.keys()]);
  if (error) throw new Error(error.message);
  const daLoja = new Set<string>();
  for (const linha of (data ?? []) as { path: string }[]) {
    const id = idPorCaminho.get(linha.path);
    if (id) daLoja.add(id);
  }
  return daLoja;
}
```

- [ ] **Step 4: `listTrackedLinksBySlugs`** — em `apps/web/src/lib/stores/tracked-links.ts`, depois de `getTrackedLinkById` (antes do comentário `+1 clique, atômico no banco…`), acrescentar:

```ts
/** Slugs por pedido: o filtro `in.(…)` vai na URL, e 100 slugs dão uns 5 KB. */
const SLUGS_POR_PEDIDO = 100;

/**
 * Os links desta loja com esses slugs. `slug` é único no banco inteiro, então volta no máximo
 * uma linha por slug — longe do corte calado de 1000 linhas que `listTrackedLinks` sofre numa
 * loja grande. Sem slug, sem consulta.
 */
export async function listTrackedLinksBySlugs(
  tenantId: string,
  slugs: readonly string[],
): Promise<Pick<TrackedLink, "slug" | "campaign_group_id">[]> {
  const unicos = [...new Set(slugs)];
  const lotes: string[][] = [];
  for (let i = 0; i < unicos.length; i += SLUGS_POR_PEDIDO) lotes.push(unicos.slice(i, i + SLUGS_POR_PEDIDO));
  const respostas = await Promise.all(
    lotes.map((lote) =>
      getSupabaseAdmin().from(TABLE).select("slug, campaign_group_id").eq("tenant_id", tenantId).in("slug", lote),
    ),
  );
  return respostas.flatMap(({ data, error }) => {
    if (error) throw new Error(error.message);
    return (data ?? []) as Pick<TrackedLink, "slug" | "campaign_group_id">[];
  });
}
```

- [ ] **Step 5: Criar `apps/web/src/lib/bio/conferir.ts`:**

```ts
import "server-only";

import type { DadosRender, DocumentoBio, LinkBio } from "@/lib/bio/documento";
import { midiasPublicasDaLoja } from "@/lib/media-store";
import { chaveDoTelefone } from "@/lib/pages/phone";
import { listCampaignGroups, type CampaignGroup } from "@/lib/stores/campaign-groups";
import { listInstances } from "@/lib/stores/instances";
import { listTrackedLinksBySlugs } from "@/lib/stores/tracked-links";

/**
 * O que o schema não sabe conferir sozinho porque depende da loja (spec 2026-10-19-link-da-bio
 * §4 e §10): a mídia é desta loja, a campanha é desta loja, e nenhum botão abre o WhatsApp do
 * número que a Girumo usa para postar (risco de banimento). No salvar recusa (400); no render,
 * `estadoDosLinks` esconde o que mudou depois.
 */

export const NUMERO_CONECTADO =
  "Esse é o número que a Girumo usa para postar nos grupos. Use o número de atendimento.";

/** O número que um endereço do WhatsApp abre (`wa.me/<n>`, `api.whatsapp.com/send?phone=<n>`); senão null. */
export function numeroDoLinkWhatsapp(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, "");
  const numero =
    host === "wa.me"
      ? url.pathname.split("/")[1]
      : host === "api.whatsapp.com" || host === "web.whatsapp.com" || host === "whatsapp.com"
        ? url.searchParams.get("phone")
        : null;
  const digitos = numero?.replace(/\D/g, "") ?? "";
  return digitos || null;
}

function numeroDoLink(link: LinkBio): string | null {
  if (link.tipo === "whatsapp") return link.numero;
  if (link.tipo === "link") return numeroDoLinkWhatsapp(link.url);
  return null;
}

/** Chaves (DDD + 8 últimos) de toda instância da loja, conectada ou não. */
async function chavesDasInstancias(tenantId: string): Promise<Set<string>> {
  const instancias = await listInstances(tenantId);
  return new Set(instancias.map((i) => chaveDoTelefone(i.phone)).filter((c): c is string => c !== null));
}

function ehDaLoja(chaves: Set<string>, numero: string): boolean {
  const chave = chaveDoTelefone(numero);
  return chave !== null && chaves.has(chave);
}

/** Cada mídia do documento com o caminho do campo, na ordem da página. */
function midiasDoDocumento(d: DocumentoBio): { campo: string; id: string }[] {
  const lista: { campo: string; id: string }[] = [];
  const doPerfil = { capa: d.perfil.capa, logoClara: d.perfil.logoClara, logoEscura: d.perfil.logoEscura };
  for (const [campo, midia] of Object.entries(doPerfil)) if (midia) lista.push({ campo: `perfil.${campo}`, id: midia.id });
  d.links.forEach((l, i) => {
    if (l.tipo === "link") l.fotos.forEach((f, j) => lista.push({ campo: `links.${i}.fotos.${j}`, id: f.id }));
    if (l.tipo === "endereco" && l.foto) lista.push({ campo: `links.${i}.foto`, id: l.foto.id });
  });
  return lista;
}

/**
 * Antes de salvar (`PATCH /api/link-da-bio`, PR 5): o primeiro problema, com o caminho do campo.
 * Só consulta o que o documento usa — sem mídia, sem grupo e sem WhatsApp, nenhuma query.
 */
export async function conferirDocumentoDaLoja(
  tenantId: string,
  documento: DocumentoBio,
): Promise<{ ok: true } | { ok: false; error: string; campo: string }> {
  const midias = midiasDoDocumento(documento);
  const grupos = documento.links.flatMap((l, i) => (l.tipo === "grupo" ? [{ i, campanhaId: l.campanhaId }] : []));
  const numeros = documento.links.flatMap((l, i) => {
    const numero = numeroDoLink(l);
    return numero ? [{ i, numero, campo: l.tipo === "whatsapp" ? "numero" : "url" }] : [];
  });
  const [daLoja, campanhas, chaves] = await Promise.all([
    midias.length ? midiasPublicasDaLoja(tenantId, midias.map((m) => m.id)) : new Set<string>(),
    grupos.length ? listCampaignGroups(tenantId) : [],
    numeros.length ? chavesDasInstancias(tenantId) : new Set<string>(),
  ]);

  const alheia = midias.find((m) => !daLoja.has(m.id));
  if (alheia) return { ok: false, error: "Essa imagem não está na sua loja. Envie de novo.", campo: alheia.campo };

  const idsDaLoja = new Set(campanhas.map((c) => c.id));
  const semCampanha = grupos.find((g) => !idsDaLoja.has(g.campanhaId));
  if (semCampanha) return { ok: false, error: "Essa campanha não existe mais. Escolha outra.", campo: `links.${semCampanha.i}.campanhaId` };

  const conectado = numeros.find((n) => ehDaLoja(chaves, n.numero));
  if (conectado) return { ok: false, error: NUMERO_CONECTADO, campo: `links.${conectado.i}.${conectado.campo}` };

  return { ok: true };
}

/**
 * campanhaId → slug do link mestre. Link mestre = a linha de `tracked_links` com o slug da
 * campanha e o id dela (`lib/campaigns/master-link.ts`; é ela que faz `/r/<slug>` abrir).
 * Campanha sem essa linha não entra — inclusive quando o slug dela está num link de outra
 * campanha. Busca pelos slugs (no máximo uma linha cada, sem o corte de 1000 do
 * `listTrackedLinks`). O GET do painel (PR 5) pode usar esta mesma função no seletor de
 * campanhas: painel e página nunca discordam sobre qual campanha tem link.
 */
export async function linksMestresDasCampanhas(
  tenantId: string,
  campanhas: readonly Pick<CampaignGroup, "id" | "slug">[],
): Promise<Record<string, string>> {
  const links = await listTrackedLinksBySlugs(tenantId, campanhas.map((c) => c.slug));
  const mestres = new Set(links.map((l) => `${l.campaign_group_id}/${l.slug}`));
  const slugs: Record<string, string> = {};
  for (const c of campanhas) if (mestres.has(`${c.id}/${c.slug}`)) slugs[c.id] = c.slug;
  return slugs;
}

/**
 * Para o render (cache) e para o GET do painel: o slug do link mestre de cada campanha usada e
 * os links que não saem — campanha apagada ou sem link mestre, número que virou da Girumo
 * depois de salvo. Vale para todo link, ativo ou não (o painel avisa nos desligados também).
 */
export async function estadoDosLinks(
  tenantId: string,
  documento: DocumentoBio,
): Promise<Pick<DadosRender, "campanhas" | "linksEscondidos">> {
  const usadas = new Set(documento.links.flatMap((l) => (l.tipo === "grupo" ? [l.campanhaId] : [])));
  const comNumero = documento.links.some((l) => numeroDoLink(l) !== null);
  const [campanhas, chaves] = await Promise.all([
    usadas.size
      ? listCampaignGroups(tenantId).then((daLoja) => linksMestresDasCampanhas(tenantId, daLoja.filter((c) => usadas.has(c.id))))
      : ({} as Record<string, string>),
    comNumero ? chavesDasInstancias(tenantId) : new Set<string>(),
  ]);

  const linksEscondidos = documento.links
    .filter((l) => {
      if (l.tipo === "grupo") return !Object.hasOwn(campanhas, l.campanhaId);
      const numero = numeroDoLink(l);
      return numero !== null && ehDaLoja(chaves, numero);
    })
    .map((l) => l.id);
  return { campanhas, linksEscondidos };
}
```

- [ ] **Step 6: Run tests to verify they pass** — a nova e as dos dois stores que mudaram:

```bash
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/conferir.test.ts src/lib/media-store.test.ts src/lib/stores/tracked-links.test.ts
```

Expected: `ℹ fail 0` (o `conferir.test.ts` com 9 testes).

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/lib/media-store.ts apps/web/src/lib/stores/tracked-links.ts apps/web/src/lib/bio/conferir.ts apps/web/src/lib/bio/conferir.test.ts
git commit -m "feat(bio): check media, campaigns and the connected number against the store"
```

### Task 9: `cache.ts` — cache em dois passos

**Files:**
- Create: `apps/web/src/lib/bio/cache.ts`
- Test: `apps/web/src/lib/bio/cache.test.ts`

**Interfaces:**
- Consumes: `estadoDosLinks` (Task 8); `lerPublicadaPorSlug`, `lerPublicadaPorId`, `lerPublicadaDaLoja`, `type PaginaBio` (Task 7); `type DadosRender` (Parte 1); `getPublicSiteUrl(): string` de `@/lib/brand`; `unstable_cache` e `revalidateTag` de `next/cache`.
- Produces: `BuscaPorSlug`, `paginaPublicaPorSlug`, `paginaPublicaDaLoja`, `paginaPublicaPorId`, `invalidarBio`, `invalidarBioDaLoja` (§9) e os novos `PaginaAchada`, `NucleoBio`, `tagDoSlug`, `tagDaLoja`, `tagDaPagina`, `tagsParaInvalidar`, `montarNucleo`.

- [ ] **Step 1: Write the failing test** — criar `apps/web/src/lib/bio/cache.test.ts`. Ele cobre o que roda fora do Next (as tags e o passo 2 sem cache); `unstable_cache`/`revalidateTag` lançam fora do runtime do Next (decisão 15):

```ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { documentoPadrao } from "./documento";
import type * as Cache from "./cache";

/**
 * `unstable_cache` e `revalidateTag` só rodam dentro do runtime do Next; aqui se prova o que
 * é nosso: as tags (contrato do §6) e a montagem do `DadosRender`, com as queries reais contra
 * um PostgREST de mentira.
 */

const vistos: URL[] = [];
let linhaDaPagina: Record<string, unknown> | null = null;

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  vistos.push(url);
  let corpo: unknown = [];
  if (url.pathname === "/rest/v1/bio_pages") corpo = linhaDaPagina ? [linhaDaPagina] : [];
  if (url.pathname === "/rest/v1/campaign_groups") corpo = [{ id: CAMPANHA, tenant_id: LOJA, name: "VIP", slug: "vip-atacado", group_ids: [], metadata: {} }];
  if (url.pathname === "/rest/v1/tracked_links") corpo = [{ slug: "vip-atacado", campaign_group_id: CAMPANHA }];
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(corpo));
});

let cache: typeof Cache;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  cache = await import("./cache");
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  vistos.length = 0;
});

const LOJA = "11111111-1111-4111-8111-111111111111";
const CAMPANHA = "0b9a8c7d-6e5f-4a3b-9c2d-1e0f9a8b7c6d";
const DOC = documentoPadrao({ nome: "Loja Exemplo", campanhaId: CAMPANHA });
const LINHA = {
  id: "pagina-1",
  tenant_id: LOJA,
  slug: "loja-exemplo",
  publicada: true,
  bloqueada_em: null,
  documento: DOC,
  versao: 2,
  updated_at: "2026-10-19T12:00:00.000Z",
};

test("as tags são as do contrato (spec §6)", () => {
  assert.equal(cache.tagDoSlug("loja-exemplo"), "bio-slug:loja-exemplo");
  assert.equal(cache.tagDaLoja(LOJA), `bio-loja:${LOJA}`);
  assert.equal(cache.tagDaPagina("pagina-1"), "bio-pagina:pagina-1");
});

test("salvar invalida o slug novo e o antigo, a página e a loja — sem repetir", () => {
  assert.deepEqual(cache.tagsParaInvalidar({ tenantId: LOJA, paginaId: "pagina-1", slugs: ["nova", "velha", "nova", ""] }), [
    `bio-loja:${LOJA}`,
    "bio-pagina:pagina-1",
    "bio-slug:nova",
    "bio-slug:velha",
  ]);
});

test("monta o núcleo: documento, id da página e o estado dos links da loja", async () => {
  linhaDaPagina = LINHA;
  const n = await cache.montarNucleo({ id: "pagina-1", tenantId: LOJA, slug: "loja-exemplo" });
  assert.deepEqual(n, { documento: DOC, paginaId: "pagina-1", campanhas: { [CAMPANHA]: "vip-atacado" }, linksEscondidos: [] });
  assert.deepEqual(Object.fromEntries(vistos[0].searchParams), {
    select: "id,tenant_id,slug,publicada,bloqueada_em,documento,versao,updated_at",
    id: "eq.pagina-1",
    publicada: "eq.true",
    bloqueada_em: "is.null",
  });
  for (const url of vistos.slice(1)) assert.equal(url.searchParams.get("tenant_id"), `eq.${LOJA}`, url.pathname);
  assert.deepEqual(JSON.parse(JSON.stringify(n)), n, "o unstable_cache guarda JSON: nada de undefined nem Date");
});

test("página que saiu do ar, ou que não é mais da loja achada no passo 1: nada", async () => {
  linhaDaPagina = null;
  assert.equal(await cache.montarNucleo({ id: "pagina-1", tenantId: LOJA, slug: "loja-exemplo" }), null);

  vistos.length = 0;
  linhaDaPagina = { ...LINHA, tenant_id: "22222222-2222-4222-8222-222222222222" };
  assert.equal(await cache.montarNucleo({ id: "pagina-1", tenantId: LOJA, slug: "loja-exemplo" }), null);
  assert.equal(vistos.length, 1, "não lê campanha nem número de ninguém");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/cache.test.ts`
Expected: FAIL — `ℹ fail 4`, com `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…\src\lib\bio\cache'`.

- [ ] **Step 3: Criar `apps/web/src/lib/bio/cache.ts`:**

```ts
import "server-only";

import { revalidateTag, unstable_cache } from "next/cache";

import { estadoDosLinks } from "@/lib/bio/conferir";
import type { DadosRender } from "@/lib/bio/documento";
import { getPublicSiteUrl } from "@/lib/brand";
import { lerPublicadaDaLoja, lerPublicadaPorId, lerPublicadaPorSlug, type PaginaBio } from "@/lib/stores/bio-pages";

/**
 * Dado da página pública em cache; o HTML é montado a cada request, porque o nonce muda
 * (spec 2026-10-19-link-da-bio §6).
 *
 * Dois passos, de propósito: as tags de um `unstable_cache` são fixas ANTES de a função rodar,
 * e a loja só se conhece depois de achar a página. O passo 1 acha a página pela chave (slug,
 * loja ou id) com a tag da chave; o passo 2 (`nucleo`) monta os dados já com
 * `bio-loja:<loja>` e `bio-pagina:<id>` — é a tag da loja que deixa `invalidarBioDaLoja`
 * (campanha renomeada ou apagada) refazer o botão do grupo na hora.
 *
 * O cache guarda JSON (`unstable_cache` serializa): nada de `undefined`, Date ou Map aqui.
 * `unstable_cache` e `revalidateTag` não rodam fora do runtime do Next ("incrementalCache
 * missing" / "static generation store missing"), então o teste cobre `montarNucleo` e as tags;
 * o caminho com cache se prova no e2e da rota pública (PR 4a).
 */

const REVALIDATE = 300;

export type BuscaPorSlug = { tipo: "pagina"; dados: DadosRender } | { tipo: "mudou"; slugAtual: string } | null;
/** O que o passo 1 guarda: só a chave da página. */
export type PaginaAchada = Pick<PaginaBio, "id" | "tenantId" | "slug">;
/** O que o passo 2 guarda: o `DadosRender` sem o que depende de por onde se chegou. */
export type NucleoBio = Omit<DadosRender, "origem" | "dominioProprio">;

export const tagDoSlug = (slug: string): string => `bio-slug:${slug}`;
export const tagDaLoja = (tenantId: string): string => `bio-loja:${tenantId}`;
export const tagDaPagina = (id: string): string => `bio-pagina:${id}`;

/** Salvar no painel: os slugs (novo e antigo), a página e a loja (a raiz do domínio próprio é por loja). */
export function tagsParaInvalidar(i: { tenantId: string; paginaId: string; slugs: string[] }): string[] {
  return [...new Set([tagDaLoja(i.tenantId), tagDaPagina(i.paginaId), ...i.slugs.filter(Boolean).map(tagDoSlug)])];
}

function achada(p: PaginaBio | null): PaginaAchada | null {
  return p ? { id: p.id, tenantId: p.tenantId, slug: p.slug } : null;
}

/** Passo 2 sem o cache: relê a página pelo id e só monta se ela ainda é da mesma loja. */
export async function montarNucleo(a: PaginaAchada): Promise<NucleoBio | null> {
  const pagina = await lerPublicadaPorId(a.id);
  if (!pagina || pagina.tenantId !== a.tenantId) return null;
  return { documento: pagina.documento, paginaId: pagina.id, ...(await estadoDosLinks(pagina.tenantId, pagina.documento)) };
}

function achar(chave: string[], tag: string, ler: () => Promise<PaginaBio | null>): Promise<PaginaAchada | null> {
  return unstable_cache(async () => achada(await ler()), chave, { revalidate: REVALIDATE, tags: [tag] })();
}

function nucleo(a: PaginaAchada): Promise<NucleoBio | null> {
  return unstable_cache(() => montarNucleo(a), ["bio-nucleo", a.id, a.tenantId], {
    revalidate: REVALIDATE,
    tags: [tagDaLoja(a.tenantId), tagDaPagina(a.id)],
  })();
}

/** `/bio/<slug>`. Slug antigo da página = `mudou` (a rota responde 301 para o atual). */
export async function paginaPublicaPorSlug(slug: string): Promise<BuscaPorSlug> {
  const a = await achar(["bio-slug", slug], tagDoSlug(slug), () => lerPublicadaPorSlug(slug));
  if (!a) return null;
  if (a.slug !== slug) return { tipo: "mudou", slugAtual: a.slug };
  const n = await nucleo(a);
  return n ? { tipo: "pagina", dados: { ...n, origem: getPublicSiteUrl(), dominioProprio: false } } : null;
}

/** Raiz do domínio próprio: `origem` = `https://<host ativo>`, que vem da rota. */
export async function paginaPublicaDaLoja(tenantId: string, origem: string): Promise<DadosRender | null> {
  const a = await achar(["bio-loja", tenantId], tagDaLoja(tenantId), () => lerPublicadaDaLoja(tenantId));
  const n = a && (await nucleo(a));
  return n ? { ...n, origem, dominioProprio: true } : null;
}

/** Rota do toque: confere que a página está no ar e lê `linksEscondidos`. */
export async function paginaPublicaPorId(id: string): Promise<DadosRender | null> {
  const a = await achar(["bio-id", id], tagDaPagina(id), () => lerPublicadaPorId(id));
  const n = a && (await nucleo(a));
  return n ? { ...n, origem: getPublicSiteUrl(), dominioProprio: false } : null;
}

export function invalidarBio(i: { tenantId: string; paginaId: string; slugs: string[] }): void {
  for (const tag of tagsParaInvalidar(i)) revalidateTag(tag);
}

/** Campanha com slug trocado ou apagada (`PATCH`/`DELETE` de `/api/campanhas`, PR 4a). */
export function invalidarBioDaLoja(tenantId: string): void {
  revalidateTag(tagDaLoja(tenantId));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/bio/cache.test.ts`
Expected: `ℹ pass 4`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/bio/cache.ts apps/web/src/lib/bio/cache.test.ts
git commit -m "feat(bio): two-step cache for the public page"
```

### Task 10: Fechar a Parte 2 (revisão, gate, PR, merge, card e grafo)

**Files:** nenhum arquivo do repositório (cria `C:\Users\Igor\AppData\Local\Temp\link-da-bio-pr2b-card.sql`).

**Interfaces:**
- Consumes: Tasks 7–9.
- Produces: a Parte 2 em `main` (o que os PRs 4a, 4b e 5 exigem); `blocker` reescrito; decisão no grafo.

- [ ] **Step 1: todos os testes do PR** (em `apps/web`):

```bash
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/entry-page.test.ts src/lib/bio/documento.test.ts src/lib/bio/cores.test.ts src/lib/stores/bio-pages.test.ts src/lib/bio/conferir.test.ts src/lib/bio/cache.test.ts src/lib/media-store.test.ts src/lib/stores/tracked-links.test.ts src/lib/links/short-link-click.test.ts src/lib/painel/link-parado.test.ts
```

Expected: `ℹ fail 0`.

- [ ] **Step 2: revisão** — despachar em paralelo (só leitura, escopo `git diff origin/main...HEAD`) um **Code Reviewer** e um **Security Engineer**. Para o segundo, pedir que confira: `.eq("tenant_id")` em toda query de `bio_pages` fora das duas leituras públicas do §9; as leituras públicas com `publicada = true` e `bloqueada_em is null`; `midiasPublicasDaLoja` aceitando só id canônico, da loja e com linha `lp-*`; e o `conflito()` sem confundir 23505 de outra unique com slug. Corrigir todo CRITICAL e HIGH antes do push, com teste.

- [ ] **Step 3: gate** (PowerShell, na raiz do worktree):

```powershell
powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Expected: `EXIT=0`.

- [ ] **Step 4: push e PR**

```bash
cat > "$TEMP/pr2b.md" <<'EOF'
Parte 2 do PR 2 do link da bio (spec 2026-10-19-link-da-bio §4, §6, §7, §9, §10; plano docs/superpowers/plans/2026-10-19-link-da-bio-pr2-nucleo.md).

- `lib/stores/bio-pages.ts`: store do §9 (insert com nova tentativa de slug, update condicional por versão, leitura pública, contagem, relatório).
- `lib/bio/conferir.ts`: mídia, campanha e número conectado conferidos contra a loja; estado dos links para o render e o painel.
- `lib/bio/cache.ts`: cache em dois passos com as tags `bio-slug`, `bio-loja` e `bio-pagina`.
- `media-store.ts` + `midiasPublicasDaLoja`; `tracked-links.ts` + `listTrackedLinksBySlugs` (link mestre por slug, sem o corte de 1000 do PostgREST).

Nada é servido ainda: a rota pública é o PR 4a, a API do painel o PR 5.
Revisão de código e de segurança: <resumo, sem CRITICAL/HIGH aberto>.

Testes: bio-pages 14, conferir 9, cache 4 (PostgREST falso conferindo o filtro de loja de cada query); verify-local.ps1 verde.
EOF
WT=$(git rev-parse --show-toplevel); git -C "$WT" push -u origin feat/link-da-bio-pr2b-store && gh pr create --repo codingB0y/Girumo --base main --head feat/link-da-bio-pr2b-store --title "feat(bio): link-da-bio store, store checks and public page cache (PR 2, part 2)" --body-file "$TEMP/pr2b.md"
```

- [ ] **Step 5: CI e merge na mesma sessão**

```bash
gh pr checks <N> --repo codingB0y/Girumo --watch
gh pr merge <N> --squash --delete-branch --repo codingB0y/Girumo
```

Expected: checks `pass`, merge feito. Se o classificador negar, entregue os comandos ao Igor.

- [ ] **Step 6: SQL do card** — Write em `C:\Users\Igor\AppData\Local\Temp\link-da-bio-pr2b-card.sql` (trocar `<DD/MM>`, `<N1>` da parte 1, `<N2>`; o que falta, conferido em `git log origin/main`):

```sql
update public.board_features
   set blocker = 'PR 2 (núcleo) no ar em <DD/MM> (#<N1> e #<N2>): documento, cores, store bio-pages, conferir e cache. Próximos: 3a (render + Etiqueta), 4a (rota pública) e 5 (API do painel); depois 4b, 6a, 3b, 6b e 7.'
 where key = 'link-da-bio'
returning key, status, blocker;
```

e pedir ao Igor o mesmo bloco do Step 6 da Task 6, com `link-da-bio-pr2b` no `Set-Location` e `link-da-bio-pr2b-card.sql`. Depois, `git -C /c/Users/Igor/Desktop/HubFlow-platform worktree remove .claude/worktrees/link-da-bio-pr2b`.

- [ ] **Step 7: decisão no grafo** — `kg_insert_text` (MCP LightRAG) com `source` `decisao-<AAAA-MM-DD>-link-da-bio-nucleo` e o texto:

```text
decisão: Link da bio, PR 2 (núcleo). (1) Anel de foco: --foco é o anel onde ficam os links (Etiqueta fundo1-3, Vitrine e Clássico fundo2, Romaneio papel); fica o foco da paleta se tiver 3:1, senão texto/#000/#FFF de maior contraste mínimo; --foco-fora só no Romaneio; dentro do --papel do Etiqueta, Vitrine e Clássico o anel é var(--tinta). (2) Cores da marca com derivação própria (garante empurra para o lado da cor; o do mockup falhava em tom médio): 0 falha em 300 mil pares. (3) CNPJ alfanumérico aceito (12 [0-9A-Z] + 2 dígitos). (4) Link mestre = tracked_links com o slug da campanha e o campaign_group_id dela, buscado por slug em lotes de 100 (listTrackedLinksBySlugs), sem o corte de 1000 do PostgREST. (5) Cache em dois passos: achar a página pela chave e guardar o núcleo com bio-loja/bio-pagina; unstable_cache não roda em node:test. (6) 23505 classificado pelo texto: bio_pages_tenant_id_key, bio_pages_slug_key, bio_slugs.
```

Se o `kg_insert_text` travar (já travou 30 min), entregar ao Igor em PowerShell: `rag insert "<texto>" --source decisao-<AAAA-MM-DD>-link-da-bio-nucleo`.

---

## Critérios de aceite

**Parte 1**
- `escapeHtml` escapa `& < > " '`; as suítes do `/r/` (`entry-page`, `short-link-click`, `link-parado`) seguem verdes.
- `documento.ts` exporta os nomes do §9 com os tipos do §9, mais `UUID_BIO` e `linkBio`; nem ele nem `cores.ts` importam código de servidor.
- `documentoBio`: chave a mais é erro; `links` é união discriminada (`links.N.campo`); normalização idempotente; mensagens em português no campo; `documentoPadrao` sempre válido.
- `coresDoModelo`: as 16 paletas saem hex por hex do `paletas.json` (menos o foco), todo par da lista passa, os 500 sorteados e os tons do meio (cinzas, `#959595`, `#4B9F1D`, `#767676`) passam em texto 4,5, ícone/seta 3 e anel 3; `--foco-fora` só no Romaneio.
- `verify-local.ps1` e CI verdes; PR mergeado e branch apagada na mesma sessão; `blocker` reescrito.

**Parte 2**
- Toda query em `bio_pages` leva o filtro da loja, menos as duas leituras públicas (por slug via `bio_slugs`, por id), que exigem `publicada = true` e `bloqueada_em is null`; o teste confere a URL de cada uma.
- 23505: tenant → página existente; slug (`bio_pages_slug_key` ou `bio_slugs`) → sufixo (criar) ou `motivo: "slug"` (salvar); outro → erro. Salvar só na versão lida, gravando `versao + 1` e `updated_at`.
- Conferência só consulta o que o documento usa, sempre com a loja; mídia de outra loja ou id não canônico recusado sem ir ao banco; número conectado recusado com e sem o nono dígito, em `wa.me` e `api.whatsapp.com`.
- `estadoDosLinks` esconde campanha apagada, sem link mestre ou com o slug num link de outra campanha, e todo link com o número conectado, ativo ou não.
- Cache: tags `bio-slug:<slug>`, `bio-loja:<tenantId>`, `bio-pagina:<id>`; `invalidarBio` cobre slug novo, antigo, página e loja; `montarNucleo` não monta página de outra loja.
- Revisão de segurança sem CRITICAL/HIGH aberto; `verify-local.ps1` e CI verdes; merge, card e grafo.

## Comandos de verificação

```bash
# em apps/web
git grep -n -E '^import .*(server-only|@supabase|"node:)|process\.' -- src/lib/bio/documento.ts src/lib/bio/cores.ts
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/entry-page.test.ts src/lib/links/short-link-click.test.ts src/lib/painel/link-parado.test.ts src/lib/bio/documento.test.ts src/lib/bio/cores.test.ts
npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/bio-pages.test.ts src/lib/bio/conferir.test.ts src/lib/bio/cache.test.ts src/lib/media-store.test.ts src/lib/stores/tracked-links.test.ts
```

```powershell
# na raiz do worktree
powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1 | Select-Object -Last 12; "EXIT=$LASTEXITCODE"
```

Esperado: o `git grep` vazio; `fail 0` nas duas rodadas (documento 14, cores 10, bio-pages 14, conferir 9, cache 4); `EXIT=0`.

## Riscos e pontos de atenção

- **Duas diferenças da spec que outros PRs precisam seguir.** O anel de foco (decisão 1): o 3a já usa `--foco` no degradê e `--tinta` dentro do papel; o 3b tem de fazer o mesmo no Vitrine e no Clássico e usar `--foco-fora` fora da nota do Romaneio. O CNPJ alfanumérico (decisão 6): o `data-copiar` do Copiar CNPJ pode levar letras, e o campo do painel (6b) não pode aceitar só dígitos.
- **O store depende do texto dos erros do PR 1.** Se a constraint ou a mensagem do trigger mudarem, o slug tomado vira exceção (500) em vez de nova tentativa. A Task 7, Step 1, confere o texto em `main`; o teste cobre as três mensagens.
- **O cache não tem teste de unidade do caminho com `unstable_cache`**: ele só roda no Next; prova no e2e do 4a. O que vai para o cache é JSON (nada de `undefined`, Date ou Map em `DadosRender`). Bloqueio por SQL não invalida: a página some em até 5 min (§6).
- **Tamanho de URL.** Os filtros `in.(…)` vão na URL: `listTrackedLinksBySlugs` em lotes de 100 slugs; `midiasPublicasDaLoja` manda no máximo 63 caminhos (3 do perfil + 3 fotos × 20 links), uns 6 KB.
- **Instância antiga conta.** O número de qualquer instância da loja, conectada ou não, é recusado (spec §4: "qualquer instância"). Loja que trocou de chip e deixou a instância velha com o número de atendimento vai ver o erro: a saída é apagar a instância velha.
- **`slugDisponivel` não confere formato nem reservado**: quem chama (PR 5) passa antes por `SLUG_BIO` e `slugReservado`.
- **`documentoPadrao` espera `campanhaId` como o Postgres devolve (uuid minúsculo).** Id maiúsculo passado à mão sai num documento que o schema recusa.

## Interface com os outros PRs

### O que este PR exporta

**Parte 1 — `apps/web/src/lib/campaigns/entry-page.ts`** (já existia; muda o comportamento)

```ts
export function escapeHtml(s: string): string; // & < > " ' → &amp; &lt; &gt; &quot; &#39;
```

**Parte 1 — `apps/web/src/lib/bio/documento.ts`** (puro: navegador e servidor)

```ts
export const MODELOS: readonly ["etiqueta", "vitrine", "romaneio", "classico"];
export type Modelo = (typeof MODELOS)[number];
export const PALETAS: {
  readonly etiqueta: readonly ["azul", "rosa", "menta", "grafite"];
  readonly vitrine: readonly ["papel", "noite", "rose", "azul"];
  readonly romaneio: readonly ["kraft", "caneta", "nota", "azul"];
  readonly classico: readonly ["claro", "escuro", "lavanda", "azul"];
};
export const ICONES: readonly ["whatsapp", "catalogo", "coroa", "mapa", "canal", "instagram", "site", "sacola", "etiqueta", "caminhao", "video", "cartao", "link"];
export type Icone = (typeof ICONES)[number];
export type MidiaRef = { id: string; foco: { x: number; y: number } | null };
type Base = { id: string; titulo: string; sub: string; icone: Icone; ativo: boolean };
export type LinkBio =
  | (Base & { tipo: "whatsapp"; destaque: boolean; numero: string; mensagem: string })
  | (Base & { tipo: "grupo"; destaque: boolean; campanhaId: string })
  | (Base & { tipo: "link"; destaque: boolean; url: string; fotos: MidiaRef[] })
  | (Base & { tipo: "endereco"; endereco: string; horario: string; foto: MidiaRef | null });
export type DocumentoBio = {
  v: 1; modelo: Modelo; paleta: string; cores: { fundo: string; botao: string } | null;
  animar: boolean; feitoComGirumo: boolean;
  perfil: { nome: string; frase: string; destaques: string[]; local: string; instagram: string;
    capa: MidiaRef | null; capaAlt: string; logoClara: MidiaRef | null; logoEscura: MidiaRef | null };
  confere: { ativo: boolean; razao: string; cnpj: string; linhas: string[] }; // cnpj: "" ou 14 sem pontuação (12 [0-9A-Z] + 2 dígitos)
  rastreio: { metaPixelId: string; ga4Id: string };
  links: LinkBio[];
};
export type DadosRender = { documento: DocumentoBio; paginaId: string; campanhas: Record<string, string>;
  linksEscondidos: string[]; origem: string; dominioProprio: boolean };
export const SLUG_BIO: RegExp;                       // /^(?=.{3,40}$)[a-z0-9]+(-[a-z0-9]+)*$/ — já com o 3–40
export const SLUGS_RESERVADOS: ReadonlySet<string>;  // _dominio admin api bio girumo painel login ajuda suporte
export function slugReservado(slug: string): boolean; // reservado, ou contém "girumo"/"hubflow"
export const UUID_BIO: RegExp;                       // NOVO: /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/ (só minúsculo)
export const linkBio: z.ZodType<LinkBio>;            // NOVO: um link sozinho, mesmas regras
export const documentoBio: z.ZodType<DocumentoBio>;
export function documentoPadrao(i: { nome: string; campanhaId: string | null }): DocumentoBio;
```

O que os outros PRs podem assumir (tudo com teste na Task 3):
- `strictObject` em todo nível; `links` é `z.discriminatedUnion("tipo", …)`. Erro → `{ campo: issue.path.join("."), mensagem: issue.message }`, por exemplo `links.2.numero`; tipo desconhecido → `links.N.tipo`; chave a mais na raiz → campo `""`. Mensagens em português (as que o lojista pode causar), escritas para o painel mostrar no campo: "Escreva o texto do botão.", "Número com DDD, só o celular. Ex.: 62 99999-9999.", "Só um link pode ser o principal." etc.
- Normaliza: `numero` → `55` + DDD + número (`"5562999990000"`); `url` → `url.href` (sem esquema ganha `https://`); `cnpj` sem pontuação e maiúsculo; `cores` maiúsculas; `instagram` minúsculo e sem `@`; `ga4Id` maiúsculo; texto com `trim`. `documentoBio.parse(documentoBio.parse(x))` = `documentoBio.parse(x)`.
- `documentoPadrao`: `modelo "etiqueta"`, `paleta "azul"`, `cores null`, `animar` e `feitoComGirumo` `true`, `perfil.nome` = o nome com `trim`, cortado em 60 (vazio → "Minha loja"), resto vazio, sem foto nem logo; com `campanhaId` (uuid minúsculo, como o Postgres devolve), um link `{ tipo: "grupo", titulo: "Entrar no grupo VIP", sub: "Kit novo e reposição saem primeiro no grupo", icone: "coroa", ativo: true, destaque: false, campanhaId }` com id `crypto.randomUUID()`. Sempre passa em `documentoBio`.

**Parte 1 — `apps/web/src/lib/bio/cores.ts`** (puro)

```ts
export type TokensBio = Record<string, string>; // chave "--nome", valor "#RRGGBB" maiúsculo
export function coresDoModelo(modelo: Modelo, paleta: string, cores: DocumentoBio["cores"]): TokensBio;
export function garante(fg: string, bg: string, min: number): string;
export function contraste(a: string, b: string): number;                           // NOVO
export const PALETAS_PRONTAS: Readonly<Record<Modelo, Readonly<Record<string, Readonly<Record<string, string>>>>>>; // NOVO
export type ParDeContraste = readonly [texto: string, fundo: string, minimo: number]; // NOVO
export const PARES_DE_CONTRASTE: Readonly<Record<Modelo, readonly ParDeContraste[]>>; // NOVO
export const FUNDOS_DO_FOCO: Readonly<Record<Modelo, readonly string[]>>;            // NOVO
export const FUNDOS_DO_FOCO_FORA: readonly string[];                                 // NOVO (só Romaneio)
```

As chaves de `TokensBio`, nesta ordem (sem o `--`):
- `etiqueta`: fundo1 fundo2 fundo3 on on2 chip chipbd fio acento cartao tinta tinta2 icobg ico seta prin printinta papel linha foco
- `vitrine`: fundo2 on on2 linha acento tinta icobg ico seta prin printinta papel foco
- `romaneio`: fundo1 fundo2 fundo3 on on2 papel tinta tinta2 linha acento foco foco-fora
- `classico`: fundo2 fundo3 on on2 chip chipbd acento cartao tinta tinta2 icobg ico seta prin printinta papel anel foco

Contrato com o CSS (PRs 3a e 3b):
- Texto só em par de `PARES_DE_CONTRASTE[modelo]` (texto 4,5:1; ícone, seta e o topo claro do degradê 3:1).
- `:focus-visible` com `var(--foco)` onde ficam os links (`FUNDOS_DO_FOCO`: Etiqueta fundo1–3, Vitrine e Clássico fundo2, Romaneio papel). Dentro de bloco de `--papel` no Etiqueta, Vitrine e Clássico: `outline-color: var(--tinta)`. Romaneio, fora da nota: `var(--foco-fora)`.
- `--foco` das prontas: Etiqueta `azul`, `rosa`, `menta` `#FFFFFF`, `grafite` `#D4AF37`; Vitrine `papel` `#A8432C`, `noite` `#D9B36C`, `rose` `#B23A63`, `azul` `#286AA6`; Romaneio `kraft` `#B3261E`, `caneta` `#1F55C6`, `nota` `#23704A`, `azul` `#A8500C`; Clássico `claro` `#161616`, `escuro` `#FFD400`, `lavanda` `#4F35D6`, `azul` `#FFFFFF`. `--foco-fora` do Romaneio: `kraft` `#000000`, as outras `#FFFFFF`.
- Paleta que não é do modelo, ou `"marca"` sem duas cores válidas → a primeira paleta do modelo. Véu da foto: fixo no CSS do 3a, sem token.

**Parte 2 — `apps/web/src/lib/stores/bio-pages.ts`** (server-only) — as assinaturas do §9:

```ts
export type PaginaBio = { id: string; tenantId: string; slug: string; publicada: boolean; bloqueadaEm: string | null;
  documento: DocumentoBio; versao: number; updatedAt: string };
export type RelatorioBio = { visitas: number; toques: number; porLink: { linkId: string; toques: number }[];
  porDia: { dia: string; visitas: number; toques: number }[] };
export async function lerPaginaDaLoja(tenantId: string): Promise<PaginaBio | null>;
export async function criarPaginaDaLoja(tenantId: string, slug: string, documento: DocumentoBio): Promise<PaginaBio>;
export async function salvarPaginaDaLoja(tenantId: string, e: { versao: number; slug: string; publicada: boolean; documento: DocumentoBio }):
  Promise<{ ok: true; pagina: PaginaBio } | { ok: false; motivo: "versao" | "slug" | "sem-pagina" }>;
export async function slugDisponivel(slug: string, tenantId: string): Promise<boolean>;
export async function lerPublicadaPorSlug(slug: string): Promise<PaginaBio | null>;
export async function lerPublicadaPorId(id: string): Promise<PaginaBio | null>;
export async function lerPublicadaDaLoja(tenantId: string): Promise<PaginaBio | null>;
export async function contarBio(paginaId: string, alvo: string): Promise<void>;
export async function relatorioBio(tenantId: string, desde: string, ate: string): Promise<RelatorioBio>;
```

Os pedidos que cada uma faz (para o PostgREST falso do PR 5; `<cols>` = `id,tenant_id,slug,publicada,bloqueada_em,documento,versao,updated_at`; nenhum embed; o 23505 chega como o PostgREST manda, HTTP 409 com `{ code, message }`):

| Função | Pedido | Resposta |
|---|---|---|
| `lerPaginaDaLoja` | `GET bio_pages?select=<cols>&tenant_id=eq.<t>` | 0 ou 1 linha |
| `criarPaginaDaLoja` | `POST bio_pages?select=<cols>`, corpo `{tenant_id, slug, publicada: false, documento}`, `Accept: application/vnd.pgrst.object+json` | 23505 citando `bio_pages_tenant_id_key` → `lerPaginaDaLoja`; citando `bio_pages_slug_key` ou `bio_slugs` → de novo com `<slug cortado em 35, sem hífen no fim>-<4 de randomSuffix>` (3 tentativas); outro erro → lança |
| `salvarPaginaDaLoja` | `PATCH bio_pages?select=<cols>&tenant_id=eq.<t>&versao=eq.<v>`, corpo `{slug, publicada, documento, versao: v + 1, updated_at}` | linha → `ok`; 23505 de slug → `motivo: "slug"`; nenhuma linha → `lerPaginaDaLoja`: existe = `"versao"`, não = `"sem-pagina"` |
| `slugDisponivel` | `GET bio_slugs?select=pagina_id&slug=eq.<s>`; com `pagina_id`: `GET bio_pages?select=id&tenant_id=eq.<t>&id=eq.<pagina_id>` | sem linha → `true`; `pagina_id` nulo (página apagada) → `false`; senão, se a página é da loja |
| `lerPublicadaPorSlug` | o `GET bio_slugs` acima, depois `lerPublicadaPorId(pagina_id)` | slug antigo devolve a página com o slug atual |
| `lerPublicadaPorId` | `GET bio_pages?select=<cols>&id=eq.<id>&publicada=eq.true&bloqueada_em=is.null` | |
| `lerPublicadaDaLoja` | `GET bio_pages?select=<cols>&tenant_id=eq.<t>&publicada=eq.true&bloqueada_em=is.null` | |
| `contarBio` | `POST rpc/bio_contar` `{p_pagina, p_alvo}` | alvo fora de `"visita"`/`UUID_BIO` → lança `Alvo de contagem inválido.` sem pedido |
| `relatorioBio` | `POST rpc/bio_relatorio` `{p_tenant, p_desde, p_ate}` | o JSON do banco; vazio → lança |

`slugDisponivel` não confere formato nem reservado (o PR 5 confere antes).

**Parte 2 — `apps/web/src/lib/media-store.ts`** (NOVO)

```ts
export async function midiasPublicasDaLoja(tenantId: string, ids: readonly string[]): Promise<Set<string>>;
// GET uploads?select=path&tenant_id=eq.<t>&bucket=eq.uploads&kind=in.(lp-media,lp-logo)&path=in.(uploads/<caminho>,…)
// id não canônico ou de outra loja nunca chega ao banco; sem id válido, sem pedido
```

**Parte 2 — `apps/web/src/lib/stores/tracked-links.ts`** (NOVO)

```ts
export async function listTrackedLinksBySlugs(tenantId: string, slugs: readonly string[]): Promise<Pick<TrackedLink, "slug" | "campaign_group_id">[]>;
// GET tracked_links?select=slug,campaign_group_id&tenant_id=eq.<t>&slug=in.(…), em lotes de 100; sem slug, sem pedido
```

**Parte 2 — `apps/web/src/lib/bio/conferir.ts`** (server-only)

```ts
export async function conferirDocumentoDaLoja(tenantId: string, documento: DocumentoBio):
  Promise<{ ok: true } | { ok: false; error: string; campo: string }>;
export async function estadoDosLinks(tenantId: string, documento: DocumentoBio):
  Promise<Pick<DadosRender, "campanhas" | "linksEscondidos">>;
export async function linksMestresDasCampanhas(tenantId: string, campanhas: readonly Pick<CampaignGroup, "id" | "slug">[]):
  Promise<Record<string, string>>;                         // NOVO: campanhaId -> slug, só com link mestre
export function numeroDoLinkWhatsapp(href: string): string | null; // NOVO
export const NUMERO_CONECTADO: string;                     // NOVO: "Esse é o número que a Girumo usa para postar nos grupos. Use o número de atendimento."
```

- Ordem e mensagens do `conferirDocumentoDaLoja` (o primeiro erro): mídia → "Essa imagem não está na sua loja. Envie de novo." (`perfil.capa`, `perfil.logoClara`, `perfil.logoEscura`, `links.N.fotos.M`, `links.N.foto`); campanha → "Essa campanha não existe mais. Escolha outra." (`links.N.campanhaId`); número → `NUMERO_CONECTADO` (`links.N.numero` ou `links.N.url`). Só consulta o que o documento usa (`uploads`, `campaign_groups`, `instances`), sempre com a loja.
- `estadoDosLinks`: `campanhas` só das campanhas do documento que existem e têm link mestre; `linksEscondidos` na ordem do documento, ativos ou não (o painel avisa nos desligados também).
- **Para o PR 5:** no `campanhasDaLoja`, trocar `listTrackedLinks` por `linksMestresDasCampanhas(tenantId, campanhas)` (`slug: mestres[c.id] ?? null`): a mesma regra, a mesma função e sem o corte de 1000 do PostgREST. O falso do PR 5 responde então `tracked_links` filtrado por `slug=in.(…)`.

**Parte 2 — `apps/web/src/lib/bio/cache.ts`** (server-only)

```ts
export type BuscaPorSlug = { tipo: "pagina"; dados: DadosRender } | { tipo: "mudou"; slugAtual: string } | null;
export async function paginaPublicaPorSlug(slug: string): Promise<BuscaPorSlug>;   // origem getPublicSiteUrl(), dominioProprio false
export async function paginaPublicaDaLoja(tenantId: string, origem: string): Promise<DadosRender | null>; // dominioProprio true
export async function paginaPublicaPorId(id: string): Promise<DadosRender | null>;  // origem getPublicSiteUrl()
export function invalidarBio(i: { tenantId: string; paginaId: string; slugs: string[] }): void;
export function invalidarBioDaLoja(tenantId: string): void;
export type PaginaAchada = Pick<PaginaBio, "id" | "tenantId" | "slug">;            // NOVO
export type NucleoBio = Omit<DadosRender, "origem" | "dominioProprio">;           // NOVO
export const tagDoSlug: (slug: string) => string;      // NOVO: "bio-slug:<slug>"
export const tagDaLoja: (tenantId: string) => string;  // NOVO: "bio-loja:<tenantId>"
export const tagDaPagina: (id: string) => string;      // NOVO: "bio-pagina:<id>"
export function tagsParaInvalidar(i: { tenantId: string; paginaId: string; slugs: string[] }): string[]; // NOVO
export async function montarNucleo(a: PaginaAchada): Promise<NucleoBio | null>;   // NOVO
```

- `revalidate` 300 s. Slug antigo da página → `{ tipo: "mudou", slugAtual }` (o 4a responde 301). Página fora do ar, bloqueada ou inexistente → `null`.
- `invalidarBio` chama `revalidateTag` em `bio-loja:<t>`, `bio-pagina:<id>` e `bio-slug:<s>` de cada slug não vazio, sem repetir (o PR 5 pode mandar o antigo igual ao novo ou vazio). `invalidarBioDaLoja` só `bio-loja:<t>`.
- Só roda dentro do Next (route handler). Para testar invalidação numa rota, montar o `workAsyncStorage` como o plano do PR 5 faz.

### O que este PR usa de outros

- **PR 1** (precisa estar em `main` antes da Parte 2): `bio_pages` (as colunas de `<cols>`; `versao` default 1, `publicada` default false), `bio_slugs (slug, pagina_id)`, `bio_contar(p_pagina uuid, p_alvo text) returns void`, `bio_relatorio(p_tenant uuid, p_desde date, p_ate date) returns jsonb` (no formato `RelatorioBio`), e os erros: 23505 `duplicate key value violates unique constraint "bio_pages_tenant_id_key"` e `"bio_pages_slug_key"`; 23505 do trigger `bio_pages_registra_slug` com `bio_slugs: o slug "<slug>" já foi de outra página`; 23514 de `bio_pages_slug_check`, `bio_pages_versao_check` e `bio_contagens_alvo_check`.
- **De `main`** (não é de PR da série): `normalizeWhatsappBR`, `chaveDoTelefone` (`lib/pages/phone.ts`); `parseHex`, `relativeLuminance`, `contrastRatio`, `type Rgb` (`lib/pages/palette.ts`); `randomSuffix` (`lib/pages/slug.ts`); `getSupabaseAdmin` (`lib/supabase/server.ts`); `listCampaignGroups`, `type CampaignGroup` (`lib/stores/campaign-groups.ts`); `listInstances` (`lib/stores/instances.ts`); `mediaPathBelongsToTenant` (`lib/media-path.ts`); `getPublicSiteUrl` (`lib/brand.ts`); `unstable_cache`, `revalidateTag` (`next/cache`).
- Nada dos PRs 3a a 7.

### Quem usa o quê

| PR | Usa deste PR |
|---|---|
| 3a | `DadosRender`, `DocumentoBio`, `LinkBio`, `MidiaRef`, `Modelo`, `PALETAS`, `documentoBio`, `documentoPadrao`, `coresDoModelo`, `TokensBio`, `escapeHtml`; o contrato do foco |
| 3b | `coresDoModelo` do Vitrine, Romaneio e Clássico (chaves acima), `PARES_DE_CONTRASTE`, `FUNDOS_DO_FOCO`, `--foco-fora` |
| 4a | `paginaPublicaPorSlug`, `paginaPublicaDaLoja`, `BuscaPorSlug`, `invalidarBioDaLoja`, `contarBio(paginaId, "visita")`, `SLUG_BIO`, `documentoPadrao`, `DadosRender` |
| 4b | `paginaPublicaPorId`, `contarBio(paginaId, linkId)`, `UUID_BIO` para validar o corpo |
| 5 | `documentoBio`, `documentoPadrao`, `SLUG_BIO` (já com 3–40), `slugReservado`, `conferirDocumentoDaLoja`, `estadoDosLinks`, `linksMestresDasCampanhas`, `lerPaginaDaLoja`, `criarPaginaDaLoja`, `salvarPaginaDaLoja`, `slugDisponivel`, `relatorioBio`, `PaginaBio`, `RelatorioBio`, `invalidarBio` |
| 6a | `documentoBio`, `linkBio`, `documentoPadrao`, `DocumentoBio`, `LinkBio`, `Icone`, `MidiaRef`, `DadosRender`, `PaginaBio` |
| 7 | `documentoBio` (rastreio já validado: Pixel 5–20 dígitos, GA4 `G-…` em maiúsculas) |
