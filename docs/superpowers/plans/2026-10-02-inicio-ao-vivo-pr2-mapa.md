# Início "Ao vivo" — PR 2 (mapa dos grupos) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Em `/painel?ao-vivo`, abaixo da faixa, o "Mapa dos grupos": uma célula por grupo, agrupada por campanha (e "Outros grupos"), com lotação, estado, "+n hoje", "novo HH:MM", filtros, tooltip e até 3 alertas.

**Architecture:** Sem DDL e sem parte nova na rota: a parte `atividade` do PR 1 já traz `hojePorGrupo` (todos os grupos da loja) e `gruposAbertosHoje`, que hoje vem vazio para a loja inteira — este PR lê os grupos abertos do tenant inteiro. A montagem do mapa é uma função pura (`lib/painel/ao-vivo/mapa.ts`) sobre `groups`, `campanhas` e `atividade`, que já chegam na tela; os componentes só desenham.

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4, TypeScript strict, Supabase (PostgREST), `node --test` via tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-painel-inicio-ao-vivo-design.md` (seção "Mapa dos grupos" e PR 2)

## Global Constraints

- Toda query de store leva o tenant explícito (`.eq('tenant_id', …)`); service-role passa por cima do RLS.
- Acid só em Postar, AO VIVO e LOTOU; **zero** `button`/`a` com `bg-acid` na Início (`e2e/painel-vitrine-casca.spec.ts`, `e2e/painel-inicio-ao-vivo.spec.ts`). A célula LOTOU é um link: o acid vai num `span` dentro dela, nunca na classe do link.
- Estado do grupo: **só** `estadoDoGrupo` de `lib/painel/grupos.ts` (cheio ≥ 0,95 via `GROUP_FULL_RATIO`; quase ≥ 0,85; ativo; sem convite quando `inviteUrl` vazio). Nenhuma regra nova.
- Entradas e saídas só existem para grupos cadastrados (os que `carregarGrupos` devolve, sem pai e avisos de comunidade).
- A cor nunca é a única pista: cada célula tem nome acessível completo com o estado por extenso.
- Sem ordem de envio, sem posição de fila em lugar nenhum.
- Código e commits em inglês; texto de tela em pt-BR. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; tipos `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json`; lint `npm run lint`; suíte `npm test`.
- Nunca `git add -A`; conferir `git diff --cached --stat` antes de cada commit. Não rodar `next build` local.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/src/lib/stores/group-grow-jobs.ts` | modificar | `listGroupsCreatedSinceByTenant(tenantId, desde)` |
| `apps/web/src/lib/stores/group-grow-jobs.test.ts` | modificar | teste do filtro por tenant |
| `apps/web/src/lib/painel/atividade-carga.ts` | modificar | loja inteira lê os grupos abertos do tenant |
| `apps/web/src/lib/painel/ao-vivo/mapa.ts` (+ `.test.ts`) | criar | montagem do mapa, contagens, alertas, nome acessível (puro) |
| `apps/web/src/components/painel/home/types.ts` | modificar | `Campanha.autoGrow?: boolean` |
| `apps/web/src/components/painel/home/ao-vivo/celula-do-grupo.tsx` | criar | a célula (link + preenchimento + tooltip) |
| `apps/web/src/components/painel/home/ao-vivo/mapa-dos-grupos.tsx` | criar | seção: cabeçalho, filtros, alertas, blocos, legenda, vazio |
| `apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx` | modificar | monta o mapa abaixo da faixa |
| `apps/web/src/components/painel/home/ao-vivo/faixa-de-status.tsx` | modificar | "Sexta-feira" (não "Sexta-Feira") |
| `apps/web/src/app/painel/page.tsx` | modificar | passa `campanhas` |
| `apps/web/e2e/painel-inicio-ao-vivo.spec.ts` | modificar | o mapa aparece |
| `docs/superpowers/specs/2026-10-02-painel-inicio-ao-vivo-design.md` | modificar | dados do mapa vêm da `atividade`; destinos dos links |

---

### Task 1: grupos abertos hoje na loja inteira

**Files:**
- Modify: `apps/web/src/lib/stores/group-grow-jobs.ts` (logo depois de `listGroupsCreatedSince`)
- Modify: `apps/web/src/lib/stores/group-grow-jobs.test.ts` (novo teste no fim)
- Modify: `apps/web/src/lib/painel/atividade-carga.ts`

**Interfaces:**
- Consumes: `GrupoCriado` (`{ seq; subject; whatsapp_group_id: string | null; updated_at }`) de `group-grow-jobs.ts`.
- Produces: `listGroupsCreatedSinceByTenant(tenantId: string, desde: string): Promise<GrupoCriado[]>`; `carregarAtividade(tenantId, { campanhaId: null, … }, agora)` passa a devolver `gruposAbertosHoje` preenchido.

- [ ] **Step 1: Teste (falha: função não existe)**

No fim de `group-grow-jobs.test.ts` (e acrescentar `listGroupsCreatedSinceByTenant` ao import):

```ts
test("na loja inteira, lê os grupos abertos de todas as campanhas da loja, sem filtrar campanha", async () => {
  pedidos.length = 0;
  linhas = [{ seq: 7, subject: "Brás 7", whatsapp_group_id: "g7@g.us", updated_at: "2026-10-02T12:14:00+00:00" }];

  assert.deepEqual(await listGroupsCreatedSinceByTenant("loja-a", "2026-10-02T03:00:00.000Z"), linhas);

  assert.equal(pedidos.length, 1);
  const [url] = pedidos;
  assert.equal(url.pathname, "/rest/v1/group_grow_jobs");
  assert.equal(url.searchParams.get("select"), "seq,subject,whatsapp_group_id,updated_at");
  // Mutante: sem o tenant, a Início de uma loja mostraria "novo 09:14" de outra.
  assert.deepEqual(Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select")), {
    tenant_id: "eq.loja-a",
    status: "eq.created",
    updated_at: "gte.2026-10-02T03:00:00.000Z",
    order: "updated_at.asc",
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/group-grow-jobs.test.ts`
Expected: FAIL (`listGroupsCreatedSinceByTenant is not a function` ou erro de import).

- [ ] **Step 3: Implementar o store**

Em `group-grow-jobs.ts`, logo depois de `listGroupsCreatedSince`:

```ts
/** Os mesmos grupos abertos, de todas as campanhas da loja: o "novo 09:14" do mapa da Início. */
export async function listGroupsCreatedSinceByTenant(tenantId: string, desde: string): Promise<GrupoCriado[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("seq,subject,whatsapp_group_id,updated_at")
    .eq("tenant_id", tenantId)
    .eq("status", "created")
    .gte("updated_at", desde)
    .order("updated_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as GrupoCriado[];
}
```

- [ ] **Step 4: A carga usa a função na loja inteira**

Em `atividade-carga.ts`, importar `listGroupsCreatedSinceByTenant` junto de `listGroupsCreatedSince` e trocar o quinto item do `Promise.all`:

```ts
    alvo.campanhaId
      ? listGroupsCreatedSince(tenantId, alvo.campanhaId, janelas.porHora.de.toISOString())
      : listGroupsCreatedSinceByTenant(tenantId, janelas.porHora.de.toISOString()),
```

e atualizar o comentário do arquivo (a loja inteira agora também traz os grupos abertos hoje).

- [ ] **Step 5: Rodar teste, tipos e suíte**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/group-grow-jobs.test.ts && npx tsc --noEmit -p tsconfig.json && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/stores/group-grow-jobs.ts apps/web/src/lib/stores/group-grow-jobs.test.ts apps/web/src/lib/painel/atividade-carga.ts
git commit -m "feat(painel): store-wide groups opened today for the live home"
```

---

### Task 2: montagem do mapa (puro)

**Files:**
- Create: `apps/web/src/lib/painel/ao-vivo/mapa.ts`
- Test: `apps/web/src/lib/painel/ao-vivo/mapa.test.ts`

**Interfaces:**
- Consumes: `Group` de `@/lib/mock-data`; `GrupoAberto`, `Movimento` de `@/lib/painel/atividade`; `estadoDoGrupo`, `lotacao`, `maisCheioPrimeiro`, `numero`, `type EstadoDoGrupo` de `@/lib/painel/grupos`; `horaBR` de `@/lib/date-br`.
- Produces (exatamente estes nomes):

```ts
export type FiltroDoMapa = "todos" | EstadoDoGrupo;
export type CelulaDoMapa = { id: string; rotulo: string; nome: string; membros: number; capacidade: number; lotacao: number; estado: EstadoDoGrupo; entraram: number; sairam: number; novoAs: string | null; href: string };
export type BlocoDoMapa = { chave: string; titulo: string; href: string; autoGrow: boolean | null; celulas: CelulaDoMapa[]; ocultos: number };
export type AlertaDoMapa = { chave: string; texto: string; acao: { rotulo: string; href: string } };
export type CampanhaDoMapa = { id: string; name: string; slug?: string; groupIds: string[]; autoGrow?: boolean };
export type MapaDosGrupos = { blocos: BlocoDoMapa[]; contagens: Record<FiltroDoMapa, number>; alertas: AlertaDoMapa[] };
export const LIMITE_DO_MAPA_INTEIRO = 200;
export const CELULAS_POR_BLOCO_NO_LIMITE = 60;
export const MAX_ALERTAS = 3;
export const TEXTO_DO_ESTADO: Record<EstadoDoGrupo, string>;
export function montarMapa(entrada: { grupos: Group[]; campanhas: CampanhaDoMapa[]; hojePorGrupo: Record<string, Movimento>; abertosHoje: GrupoAberto[] }): MapaDosGrupos;
export function rotuloAcessivel(bloco: string, c: CelulaDoMapa): string;
```

- [ ] **Step 1: Escrever os testes**

```ts
// apps/web/src/lib/painel/ao-vivo/mapa.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { Group } from "@/lib/mock-data";
import { CELULAS_POR_BLOCO_NO_LIMITE, MAX_ALERTAS, montarMapa, rotuloAcessivel, type CampanhaDoMapa } from "./mapa";

const CONVITE = "https://chat.whatsapp.com/abc";

function grupo(id: string, p: Partial<Group> = {}): Group {
  return { id, name: `VIP #${id}`, whatsappGroupId: `${id}@g.us`, members: 100, capacity: 1000, selected: false, engagement: "medio", inviteUrl: CONVITE, ...p };
}

const vip: CampanhaDoMapa = { id: "c-vip", name: "VIP Revenda", slug: "vip", groupIds: ["40@g.us", "39@g.us", "2@g.us"], autoGrow: true };

test("agrupa por campanha, ordena pelo número do grupo e põe os fora de campanha em Outros grupos", () => {
  const mapa = montarMapa({
    grupos: [grupo("40"), grupo("2"), grupo("39"), grupo("solto", { name: "Clientes antigos" })],
    campanhas: [vip],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  assert.deepEqual(mapa.blocos.map((b) => b.titulo), ["VIP Revenda", "Outros grupos"]);
  assert.deepEqual(mapa.blocos[0].celulas.map((c) => c.rotulo), ["#2", "#39", "#40"]);
  assert.equal(mapa.blocos[0].href, "/painel/campanhas/vip");
  assert.equal(mapa.blocos[0].autoGrow, true);
  assert.equal(mapa.blocos[1].href, "/painel/grupos");
  assert.equal(mapa.blocos[1].autoGrow, null);
  // Sem número no nome nem displayNumber: a posição no bloco.
  assert.equal(mapa.blocos[1].celulas[0].rotulo, "1º");
});

test("displayNumber vence o número do nome; campanha sem grupo cadastrado não vira bloco", () => {
  const mapa = montarMapa({
    grupos: [grupo("a", { name: "VIP #3", displayNumber: 12 })],
    campanhas: [{ ...vip, groupIds: ["a@g.us"] }, { id: "c-vazia", name: "Vazia", groupIds: ["sumiu@g.us"] }],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  assert.deepEqual(mapa.blocos.map((b) => b.titulo), ["VIP Revenda"]);
  assert.equal(mapa.blocos[0].celulas[0].rotulo, "#12");
});

test("estado, lotação, +n e −n de hoje e a hora de Brasília em que o grupo foi aberto", () => {
  const mapa = montarMapa({
    grupos: [
      grupo("40", { members: 980 }),
      grupo("39", { members: 900 }),
      grupo("2", { members: 10, inviteUrl: undefined }),
    ],
    campanhas: [vip],
    hojePorGrupo: { "39@g.us": { entraram: 38, sairam: 2 } },
    abertosHoje: [{ nome: "VIP 40", seq: 40, grupo: "40@g.us", quando: "2026-10-02T12:14:00.000Z" }],
  });
  const [c2, c39, c40] = mapa.blocos[0].celulas;
  assert.equal(c40.estado, "cheio");
  assert.equal(c40.novoAs, "09:14");
  assert.equal(c39.estado, "quase");
  assert.equal(c39.lotacao, 0.9);
  assert.equal(c39.entraram, 38);
  assert.equal(c39.sairam, 2);
  assert.equal(c2.estado, "sem_convite");
  assert.equal(c2.entraram, 0);
  assert.deepEqual(mapa.contagens, { todos: 3, cheio: 1, quase: 1, ativo: 0, sem_convite: 1 });
});

test("acima de 200 grupos, cada campanha mostra os 60 mais cheios e conta os escondidos", () => {
  const ids = Array.from({ length: 201 }, (_, i) => String(i + 1));
  const mapa = montarMapa({
    grupos: ids.map((id, i) => grupo(id, { members: i })),
    campanhas: [{ ...vip, groupIds: ids.map((id) => `${id}@g.us`) }],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  const [bloco] = mapa.blocos;
  assert.equal(bloco.celulas.length, CELULAS_POR_BLOCO_NO_LIMITE);
  assert.equal(bloco.ocultos, 201 - CELULAS_POR_BLOCO_NO_LIMITE);
  // Os mais cheios ficaram (membros = posição - 1), na ordem do número.
  assert.equal(bloco.celulas[0].rotulo, "#142");
  assert.equal(bloco.celulas.at(-1)?.rotulo, "#201");
  assert.equal(mapa.contagens.todos, 201);
});

test("alertas: campanha toda lotada com o abre-outro desligado e grupo sem convite, no máximo 3", () => {
  const lotada: CampanhaDoMapa = { id: "c-bras", name: "Brás", slug: "bras", groupIds: ["b1@g.us"], autoGrow: false };
  const mapa = montarMapa({
    grupos: [grupo("b1", { members: 1000 }), grupo("s1", { name: "Brás #2", inviteUrl: "" })],
    campanhas: [lotada],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  assert.deepEqual(
    mapa.alertas.map((a) => [a.texto, a.acao.href]),
    [
      ['Brás: todos os grupos lotaram e o "Lotou → abre outro" está desligado', "/painel/campanhas/bras/editar"],
      ["Brás #2 está sem convite", "/painel/grupos"],
    ],
  );

  const muitos = montarMapa({
    grupos: ["s1", "s2", "s3", "s4"].map((id) => grupo(id, { inviteUrl: "" })),
    campanhas: [],
    hojePorGrupo: {},
    abertosHoje: [],
  });
  assert.deepEqual(muitos.alertas.map((a) => a.texto), ["4 grupos estão sem convite"]);
  assert.ok(muitos.alertas.length <= MAX_ALERTAS);

  const ligada = montarMapa({ grupos: [grupo("b1", { members: 1000 })], campanhas: [{ ...lotada, autoGrow: true }], hojePorGrupo: {}, abertosHoje: [] });
  assert.deepEqual(ligada.alertas, []);
});

test("nome acessível diz tudo o que a cor diz", () => {
  const mapa = montarMapa({
    grupos: [grupo("39", { name: "VIP Revenda #39", members: 935, capacity: 1024 })],
    campanhas: [{ ...vip, groupIds: ["39@g.us"] }],
    hojePorGrupo: { "39@g.us": { entraram: 38, sairam: 0 } },
    abertosHoje: [],
  });
  assert.equal(
    rotuloAcessivel("VIP Revenda", mapa.blocos[0].celulas[0]),
    "VIP Revenda #39, 935 de 1.024, quase lotado, 38 entraram hoje",
  );
  // Nome diferente do rótulo do bloco: entra também.
  const outro = montarMapa({ grupos: [grupo("7", { name: "Brás atacado 7", displayNumber: 7, inviteUrl: "" })], campanhas: [], hojePorGrupo: {}, abertosHoje: [] });
  assert.equal(
    rotuloAcessivel("Outros grupos", outro.blocos[0].celulas[0]),
    "Outros grupos #7, Brás atacado 7, 100 de 1.000, sem convite",
  );
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/ao-vivo/mapa.test.ts`
Expected: FAIL com `Cannot find module './mapa'`.

- [ ] **Step 3: Implementar**

```ts
// apps/web/src/lib/painel/ao-vivo/mapa.ts
import { horaBR } from "@/lib/date-br";
import type { Group } from "@/lib/mock-data";
import type { GrupoAberto, Movimento } from "@/lib/painel/atividade";
import { estadoDoGrupo, lotacao, maisCheioPrimeiro, numero, type EstadoDoGrupo } from "@/lib/painel/grupos";

/**
 * O mapa dos grupos da Início "Ao vivo" (spec 2026-10-02): uma célula por grupo,
 * agrupada por campanha, com o estado de `estadoDoGrupo` — a mesma regra da tela
 * de Grupos, para o mapa nunca discordar dela.
 */

export type FiltroDoMapa = "todos" | EstadoDoGrupo;

export type CelulaDoMapa = {
  id: string;
  rotulo: string;
  nome: string;
  membros: number;
  capacidade: number;
  lotacao: number;
  estado: EstadoDoGrupo;
  entraram: number;
  sairam: number;
  /** "09:14" quando o "Lotou → abre outro" abriu o grupo hoje. */
  novoAs: string | null;
  href: string;
};

export type BlocoDoMapa = {
  chave: string;
  titulo: string;
  href: string;
  /** Nulo em "Outros grupos" e quando a campanha não diz. */
  autoGrow: boolean | null;
  celulas: CelulaDoMapa[];
  /** Grupos que ficaram fora no limite (lojas com mais de 200 grupos). */
  ocultos: number;
};

export type AlertaDoMapa = { chave: string; texto: string; acao: { rotulo: string; href: string } };

export type CampanhaDoMapa = { id: string; name: string; slug?: string; groupIds: string[]; autoGrow?: boolean };

export type MapaDosGrupos = { blocos: BlocoDoMapa[]; contagens: Record<FiltroDoMapa, number>; alertas: AlertaDoMapa[] };

/** Acima disto as células não cabem: cada campanha mostra só as mais cheias. */
export const LIMITE_DO_MAPA_INTEIRO = 200;
export const CELULAS_POR_BLOCO_NO_LIMITE = 60;
export const MAX_ALERTAS = 3;

export const TEXTO_DO_ESTADO: Record<EstadoDoGrupo, string> = {
  cheio: "lotou",
  quase: "quase lotado",
  ativo: "com vaga",
  sem_convite: "sem convite",
};

const GRUPOS = "/painel/grupos";

function numeroDoGrupo(g: Group): number | null {
  if (typeof g.displayNumber === "number" && Number.isFinite(g.displayNumber)) return g.displayNumber;
  const m = /#\s?(\d+)/.exec(g.name);
  return m ? Number(m[1]) : null;
}

/** Pelo número do grupo; sem número, depois dos numerados, pelo nome. */
function emOrdem(grupos: Group[]): Group[] {
  return [...grupos].sort((a, b) => {
    const na = numeroDoGrupo(a);
    const nb = numeroDoGrupo(b);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if ((na === null) !== (nb === null)) return na === null ? 1 : -1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

function hrefDaCampanha(c: CampanhaDoMapa): string {
  return c.slug ? `/painel/campanhas/${c.slug}` : "/painel/campanhas";
}

/** Os grupos cadastrados da campanha, sem repetir e sem os que sumiram do cadastro. */
function gruposDa(c: CampanhaDoMapa, porId: Map<string, Group>): Group[] {
  return [...new Set(c.groupIds)].flatMap((id) => {
    const g = porId.get(id);
    return g ? [g] : [];
  });
}

type Contexto = { hoje: Record<string, Movimento>; novos: Map<string, string>; limitar: boolean };

function bloco(chave: string, titulo: string, href: string, autoGrow: boolean | null, grupos: Group[], ctx: Contexto): BlocoDoMapa {
  const visiveis =
    ctx.limitar && grupos.length > CELULAS_POR_BLOCO_NO_LIMITE ? maisCheioPrimeiro(grupos).slice(0, CELULAS_POR_BLOCO_NO_LIMITE) : grupos;
  const celulas = emOrdem(visiveis).map((g, i): CelulaDoMapa => {
    const n = numeroDoGrupo(g);
    const mov = ctx.hoje[g.whatsappGroupId];
    const aberto = ctx.novos.get(g.whatsappGroupId);
    return {
      id: g.whatsappGroupId,
      rotulo: n !== null ? `#${n}` : `${i + 1}º`,
      nome: g.name,
      membros: g.members,
      capacidade: g.capacity,
      lotacao: lotacao(g.members, g.capacity),
      estado: estadoDoGrupo(g),
      entraram: mov?.entraram ?? 0,
      sairam: mov?.sairam ?? 0,
      novoAs: aberto ? horaBR(aberto) : null,
      href,
    };
  });
  return { chave, titulo, href, autoGrow, celulas, ocultos: grupos.length - visiveis.length };
}

function alertasDoMapa(grupos: Group[], campanhas: CampanhaDoMapa[], porId: Map<string, Group>): AlertaDoMapa[] {
  const alertas: AlertaDoMapa[] = [];
  for (const c of campanhas) {
    const doBloco = gruposDa(c, porId);
    if (c.autoGrow === false && doBloco.length > 0 && doBloco.every((g) => estadoDoGrupo(g) === "cheio")) {
      alertas.push({
        chave: `lotou-${c.id}`,
        texto: `${c.name}: todos os grupos lotaram e o "Lotou → abre outro" está desligado`,
        acao: { rotulo: "Configurar campanha", href: c.slug ? `/painel/campanhas/${c.slug}/editar` : "/painel/campanhas" },
      });
    }
  }
  const semConvite = grupos.filter((g) => estadoDoGrupo(g) === "sem_convite");
  const cabem = MAX_ALERTAS - alertas.length;
  if (semConvite.length > 0 && cabem > 0) {
    if (semConvite.length <= cabem) {
      for (const g of semConvite) {
        alertas.push({ chave: `convite-${g.whatsappGroupId}`, texto: `${g.name} está sem convite`, acao: { rotulo: "Configurar convite", href: GRUPOS } });
      }
    } else {
      alertas.push({ chave: "convite", texto: `${semConvite.length} grupos estão sem convite`, acao: { rotulo: "Configurar convites", href: GRUPOS } });
    }
  }
  return alertas.slice(0, MAX_ALERTAS);
}

export function montarMapa({
  grupos,
  campanhas,
  hojePorGrupo,
  abertosHoje,
}: {
  grupos: Group[];
  campanhas: CampanhaDoMapa[];
  hojePorGrupo: Record<string, Movimento>;
  abertosHoje: GrupoAberto[];
}): MapaDosGrupos {
  const porId = new Map(grupos.map((g) => [g.whatsappGroupId, g]));
  const ctx: Contexto = {
    hoje: hojePorGrupo,
    novos: new Map(abertosHoje.flatMap((a) => (a.grupo ? [[a.grupo, a.quando] as const] : []))),
    limitar: grupos.length > LIMITE_DO_MAPA_INTEIRO,
  };

  const emCampanha = new Set<string>();
  const blocos: BlocoDoMapa[] = [];
  for (const c of campanhas) {
    const doBloco = gruposDa(c, porId);
    if (doBloco.length === 0) continue;
    for (const g of doBloco) emCampanha.add(g.whatsappGroupId);
    blocos.push(bloco(c.id, c.name, hrefDaCampanha(c), c.autoGrow ?? null, doBloco, ctx));
  }
  const fora = grupos.filter((g) => !emCampanha.has(g.whatsappGroupId));
  if (fora.length > 0) blocos.push(bloco("outros", "Outros grupos", GRUPOS, null, fora, ctx));

  const contagens: Record<FiltroDoMapa, number> = { todos: grupos.length, cheio: 0, quase: 0, ativo: 0, sem_convite: 0 };
  for (const g of grupos) contagens[estadoDoGrupo(g)] += 1;

  return { blocos, contagens, alertas: alertasDoMapa(grupos, campanhas, porId) };
}

/** O que a célula diz para quem não enxerga a cor (e para o leitor de tela). */
export function rotuloAcessivel(bloco: string, c: CelulaDoMapa): string {
  const titulo = `${bloco} ${c.rotulo}`;
  // O grupo costuma se chamar exatamente "<campanha> #n": não repetir.
  const partes = c.nome === titulo ? [titulo] : [titulo, c.nome];
  partes.push(`${numero(c.membros)} de ${numero(c.capacidade)}`, TEXTO_DO_ESTADO[c.estado]);
  if (c.entraram > 0) partes.push(`${numero(c.entraram)} entraram hoje`);
  if (c.sairam > 0) partes.push(`${numero(c.sairam)} saíram hoje`);
  if (c.novoAs) partes.push(`aberto hoje às ${c.novoAs}`);
  return partes.join(", ");
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/ao-vivo/mapa.test.ts`
Expected: PASS (6 testes). Se um teste falhar, investigar a função antes de mexer na expectativa; mudar uma expectativa só se ela contradiz `estadoDoGrupo`/`lotacao`/`horaBR` como estão escritos, e explicar no relatório.

- [ ] **Step 5: Tipos, lint e commit**

Run: `npx tsc --noEmit -p tsconfig.json && npm run lint`

```bash
git add apps/web/src/lib/painel/ao-vivo/mapa.ts apps/web/src/lib/painel/ao-vivo/mapa.test.ts
git commit -m "feat(painel): group map model for the live home"
```

---

### Task 3: o mapa na tela

**Files:**
- Modify: `apps/web/src/components/painel/home/types.ts` (`Campanha`)
- Create: `apps/web/src/components/painel/home/ao-vivo/celula-do-grupo.tsx`
- Create: `apps/web/src/components/painel/home/ao-vivo/mapa-dos-grupos.tsx`
- Modify: `apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx`
- Modify: `apps/web/src/components/painel/home/ao-vivo/faixa-de-status.tsx`
- Modify: `apps/web/src/app/painel/page.tsx`

**Interfaces:**
- Consumes: `montarMapa`, `rotuloAcessivel`, `TEXTO_DO_ESTADO`, `type FiltroDoMapa`, `type CelulaDoMapa`, `type BlocoDoMapa` (Task 2); `numero` de `@/lib/painel/grupos`; `cn` de `@/lib/utils`; `atividade` (já em `InicioAoVivo`: `hojePorGrupo`, `gruposAbertosHoje`).
- Produces: `MapaDosGrupos({ grupos, campanhas, atividade })` com `data-testid="inicio-mapa"` e `<h2>` "Mapa dos grupos"; `CelulaDoGrupo({ celula, bloco })`.

- [ ] **Step 1: `Campanha` ganha `autoGrow`**

Em `components/painel/home/types.ts`, no tipo `Campanha`, acrescentar:

```ts
  /** "Lotou → abre outro" ligado. Já vem em /api/painel/inicio (`carregarCampanhas`). */
  autoGrow?: boolean;
```

- [ ] **Step 2: A célula**

```tsx
// apps/web/src/components/painel/home/ao-vivo/celula-do-grupo.tsx
import Link from "next/link";
import { numero } from "@/lib/painel/grupos";
import { rotuloAcessivel, TEXTO_DO_ESTADO, type CelulaDoMapa } from "@/lib/painel/ao-vivo/mapa";
import { cn } from "@/lib/utils";

/**
 * A lotação enche a célula de baixo para cima. O preenchimento é um tom com a
 * cor do estado e um fio sólido no topo: com o tom fraco o número continua
 * legível em cima dele, e o fio ainda diz "lotou" de longe. O Acid fica no
 * `span` — nunca na classe do link (regra 10, e2e da casca).
 */
const PREENCHIMENTO: Record<CelulaDoMapa["estado"], string> = {
  cheio: "bg-acid-500/25 border-t-2 border-acid-500",
  quase: "bg-quase/25 border-t-2 border-quase",
  ativo: "bg-slate-600/20 border-t border-slate-600/60",
  sem_convite: "bg-slate-600/15",
};

export function CelulaDoGrupo({ celula: c, bloco }: { celula: CelulaDoMapa; bloco: string }) {
  return (
    <Link
      href={c.href}
      aria-label={rotuloAcessivel(bloco, c)}
      className="group/celula relative block h-14 w-14 rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative flex h-full w-full flex-col justify-between overflow-hidden rounded-md border bg-paper-0 p-1 tabular-nums",
          c.estado === "sem_convite" ? "border-danger-700" : "border-line-200",
        )}
      >
        <span className={cn("absolute inset-x-0 bottom-0", PREENCHIMENTO[c.estado])} style={{ height: `${Math.round(c.lotacao * 100)}%` }} />
        <span className="relative text-12 font-semibold leading-none text-volt-950">{c.rotulo}</span>
        <span className="relative text-[11px] leading-none text-volt-950">
          {c.novoAs ? `novo ${c.novoAs}` : c.entraram > 0 ? `+${numero(c.entraram)}` : ""}
        </span>
      </span>
      {/* Dica no hover e no foco do teclado; o leitor de tela já tem tudo no aria-label. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-max max-w-[220px] -translate-x-1/2 rounded-md bg-volt-950 px-2.5 py-1.5 text-12 leading-snug text-paper-0 shadow-lg group-hover/celula:block group-focus-visible/celula:block"
      >
        <span className="block font-semibold">{c.nome}</span>
        <span className="block tabular-nums">
          {numero(c.membros)} / {numero(c.capacidade)} · {Math.round(c.lotacao * 100)}% · {TEXTO_DO_ESTADO[c.estado]}
        </span>
        {(c.entraram > 0 || c.sairam > 0) && (
          <span className="block tabular-nums">
            hoje: +{numero(c.entraram)} −{numero(c.sairam)}
          </span>
        )}
        {c.novoAs && <span className="block">aberto hoje às {c.novoAs}</span>}
      </span>
    </Link>
  );
}
```

- [ ] **Step 3: A seção**

```tsx
// apps/web/src/components/painel/home/ao-vivo/mapa-dos-grupos.tsx
"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type { Campanha } from "@/components/painel/home/types";
import type { Group } from "@/lib/mock-data";
import type { AtividadeDaCampanha } from "@/lib/painel/atividade";
import { montarMapa, type FiltroDoMapa } from "@/lib/painel/ao-vivo/mapa";
import { numero } from "@/lib/painel/grupos";
import { cn } from "@/lib/utils";
import { CelulaDoGrupo } from "./celula-do-grupo";

const FILTROS: [FiltroDoMapa, string][] = [
  ["todos", "Todos"],
  ["cheio", "Lotou"],
  ["quase", "Quase"],
  ["ativo", "Ativo"],
  ["sem_convite", "Sem convite"],
];

const LEGENDA: [string, string][] = [
  ["bg-acid-500", "lotou"],
  ["bg-quase", "quase"],
  ["bg-slate-600", "com vaga"],
  ["border border-danger-700", "sem convite"],
];

type Props = { grupos: Group[]; campanhas: Campanha[]; atividade: AtividadeDaCampanha | null };

/** O mapa dos grupos da Início "Ao vivo" (spec 2026-10-02): onde está entrando gente e o que lotou. */
export function MapaDosGrupos({ grupos, campanhas, atividade }: Props) {
  const [filtro, setFiltro] = useState<FiltroDoMapa>("todos");
  const mapa = useMemo(
    () =>
      montarMapa({
        grupos,
        campanhas,
        hojePorGrupo: atividade?.hojePorGrupo ?? {},
        abertosHoje: atividade?.gruposAbertosHoje ?? [],
      }),
    [grupos, campanhas, atividade],
  );
  const pessoas = grupos.reduce((s, g) => s + (Number.isFinite(g.members) ? g.members : 0), 0);

  return (
    <section data-testid="inicio-mapa" aria-labelledby="mapa-titulo" className="rounded-[10px] border border-line-200 bg-paper-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-200 px-5 py-3">
        <h2 id="mapa-titulo" className="text-16 font-semibold text-volt-950">
          Mapa dos grupos
        </h2>
        {grupos.length > 0 && (
          <p className="text-13 tabular-nums text-slate-600">
            {numero(grupos.length)} {grupos.length === 1 ? "grupo" : "grupos"} · {numero(pessoas)} pessoas
          </p>
        )}
        {grupos.length > 0 && (
          <div role="group" aria-label="Filtrar grupos" className="flex w-full gap-1 overflow-x-auto sm:ml-auto sm:w-auto">
            {FILTROS.map(([f, rotulo]) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtro === f}
                onClick={() => setFiltro(f)}
                className={cn(
                  "h-8 shrink-0 rounded-md border px-2.5 text-13 transition-colors",
                  filtro === f ? "border-slate-600 bg-hover-ficha text-volt-950" : "border-line-200 text-slate-600 hover:text-volt-950",
                )}
              >
                {rotulo} <span className="tabular-nums">{mapa.contagens[f]}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {grupos.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <p className="text-15 font-semibold text-volt-950">Nenhum grupo ainda</p>
          <p className="mt-1 text-13 text-slate-600">Crie ou importe seus grupos do WhatsApp para vê-los aqui.</p>
          <Link href="/painel/grupos" className="mt-3 inline-flex h-10 items-center rounded-[var(--radius-control)] border border-line-200 px-4 text-[14px] font-medium text-volt-950">
            Ir para Grupos
          </Link>
        </div>
      ) : (
        <div className="space-y-5 px-5 py-4">
          {mapa.alertas.length > 0 && (
            <ul className="space-y-1.5">
              {mapa.alertas.map((a) => (
                <li key={a.chave} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-aviso-fundo px-3 py-2 text-13 text-volt-950">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-danger-700" aria-hidden="true" />
                  <span className="min-w-0 flex-1">{a.texto}</span>
                  <Link href={a.acao.href} className="font-semibold text-cobalt-500 hover:underline">
                    {a.acao.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {mapa.blocos.map((b) => {
            const celulas = filtro === "todos" ? b.celulas : b.celulas.filter((c) => c.estado === filtro);
            if (celulas.length === 0) return null;
            return (
              <div key={b.chave}>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h3 className="text-13 font-semibold text-volt-950">
                    <Link href={b.href} className="hover:underline">
                      {b.titulo}
                    </Link>{" "}
                    <span className="font-normal tabular-nums text-slate-600">{b.celulas.length + b.ocultos}</span>
                  </h3>
                  {b.autoGrow !== null && (
                    <p className="text-12 text-slate-600">Lotou → abre outro: {b.autoGrow ? "ligado" : "desligado"}</p>
                  )}
                </div>
                <ul className="flex flex-wrap gap-1.5">
                  {celulas.map((c) => (
                    <li key={c.id}>
                      <CelulaDoGrupo celula={c} bloco={b.titulo} />
                    </li>
                  ))}
                </ul>
                {b.ocultos > 0 && (
                  <p className="mt-2 text-12 text-slate-600">
                    mostrando os {b.celulas.length} mais cheios ·{" "}
                    <Link href={b.href} className="font-semibold text-cobalt-500 hover:underline">
                      ver todos os {numero(b.celulas.length + b.ocultos)}
                    </Link>
                  </p>
                )}
              </div>
            );
          })}

          <p className="flex flex-wrap gap-x-3 gap-y-1 text-12 text-slate-600">
            {LEGENDA.map(([cor, rotulo]) => (
              <span key={rotulo} className="inline-flex items-center gap-1">
                <span className={cn("h-2.5 w-2.5 rounded-[2px]", cor)} aria-hidden="true" />
                {rotulo}
              </span>
            ))}
            <span>· +n = entraram hoje</span>
          </p>
        </div>
      )}
    </section>
  );
}
```

Antes de rodar, conferir que as classes existem no CSS do painel: `bg-hover-ficha` (usada em `visao-geral.tsx` nos filtros), `bg-aviso-fundo`, `text-danger-700`, `border-danger-700`, `bg-quase`, `border-quase`, `bg-acid-500`, `border-acid-500`. Se alguma utilitária com cor por token não existir no `@theme`, usar a variante que `visao-geral.tsx` usa para o mesmo papel e anotar no relatório.

- [ ] **Step 4: Montar na Início e passar as campanhas**

Em `inicio-ao-vivo.tsx`: acrescentar `campanhas: Campanha[]` às props (import `Campanha` de `@/components/painel/home/types`), importar `MapaDosGrupos` de `./mapa-dos-grupos` e renderizar logo depois da `<FaixaDeStatus … />`:

```tsx
      <MapaDosGrupos grupos={groups} campanhas={campanhas} atividade={atividade} />
```

Atualizar o comentário do componente ("PR 1 = a faixa" → "PR 1 a faixa, PR 2 o mapa; postando agora e relâmpago entram nos PRs 4–5").

Em `app/painel/page.tsx`, no `<InicioAoVivo …/>`, acrescentar `campanhas={campanhas}` (`campanhas` já é desestruturado de `data`).

- [ ] **Step 5: "Sexta-feira", não "Sexta-Feira"**

Em `faixa-de-status.tsx`, o `capitalize` do Tailwind põe maiúscula em cada palavra ("Sexta-Feira"). Tirar `capitalize` da classe do `<span>` do dia e montar o texto com só a primeira letra maiúscula:

```tsx
function primeiraMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
```

e usar `{primeiraMaiuscula(DIA.format(agora))} · {horaBR(agora.toISOString())}`.

- [ ] **Step 6: Tipos, lint, testes**

Run (em `apps/web`): `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.e2e.json && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/painel/home/types.ts apps/web/src/components/painel/home/ao-vivo/celula-do-grupo.tsx apps/web/src/components/painel/home/ao-vivo/mapa-dos-grupos.tsx apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx apps/web/src/components/painel/home/ao-vivo/faixa-de-status.tsx apps/web/src/app/painel/page.tsx
git commit -m "feat(painel): group map on the live home"
```

---

### Task 4: e2e e spec

**Files:**
- Modify: `apps/web/e2e/painel-inicio-ao-vivo.spec.ts`
- Modify: `docs/superpowers/specs/2026-10-02-painel-inicio-ao-vivo-design.md`

- [ ] **Step 1: O e2e vê o mapa**

No primeiro teste de `painel-inicio-ao-vivo.spec.ts` ("abre com a faixa da loja e o número desconectado"), depois das asserções da faixa:

```ts
    // O mapa aparece com ou sem grupos no tenant de QA: o título é o mesmo nos dois estados.
    await expect(page.getByTestId("inicio-mapa").getByRole("heading", { name: "Mapa dos grupos" })).toBeVisible();
```

O teste 2 ("nenhum botão ou link em Acid") passa a cobrir também as células, sem mudança.

- [ ] **Step 2: A spec diz de onde vem o dado e para onde a célula leva**

Em `docs/superpowers/specs/2026-10-02-painel-inicio-ao-vivo-design.md`:
- Na tabela de "Dados", trocar as linhas `grupos_hoje` e `grupos_novos` por uma nota: "+n hoje e "novo HH:MM" vêm da própria parte `atividade` (`hojePorGrupo`, `gruposAbertosHoje`), que no PR 2 passa a ler os grupos abertos do tenant inteiro — sem parte nova."
- Em "Mapa dos grupos", trocar "Clique na célula abre o grupo." por: "Clique na célula abre a campanha do grupo (`/painel/campanhas/<slug>`); em "Outros grupos", a tela de Grupos. Não existe página de um grupo só." e "Configurar convite" → "leva à tela de Grupos, onde o convite se edita na linha".

- [ ] **Step 3: Tipos e commit**

Run: `npx tsc --noEmit -p tsconfig.e2e.json`

```bash
git add apps/web/e2e/painel-inicio-ao-vivo.spec.ts docs/superpowers/specs/2026-10-02-painel-inicio-ao-vivo-design.md
git commit -m "test(e2e): live home shows the group map"
```

---

### Task 5: PR, CI, merge e verificação em produção

- [ ] **Step 1:** `git fetch origin main && git merge origin/main`; `git diff origin/main...HEAD --stat` deve listar só os arquivos deste plano + o próprio plano.
- [ ] **Step 2:** `git push -u origin feat/inicio-ao-vivo-mapa`; `gh pr create --base main` com título `feat(painel): Início ao vivo PR 2 — mapa dos grupos (?ao-vivo)`, corpo com resumo, teste e `🤖 Generated with [Claude Code](https://claude.com/claude-code)`; ligar com `mcp__ccd_pr__get_status`.
- [ ] **Step 3:** CI verde pelo `get_status` → `gh pr merge <N> --squash` → apagar o branch remoto. Nunca ligar o auto-merge do GitHub (a `main` não tem checks obrigatórios).
- [ ] **Step 4:** Em produção, logado, `/painel?ao-vivo` em 1440, 1100 e 390: o mapa mostra as campanhas e "Outros grupos"; o estado de 3 células confere com `members/capacity/invite_url` no banco de prod; "+n hoje" confere com `hojePorGrupo` da API; filtros mudam as células; tooltip aparece no foco do teclado; auditoria de contraste sem falha; zero `button`/`a` com `bg-acid`; o cabeçalho diz "Sexta-feira" (ou o dia que for) com só a inicial maiúscula. O card `painel-inicio-ao-vivo` continua `em_construcao`; atualizar o `summary` com o PR 2.
