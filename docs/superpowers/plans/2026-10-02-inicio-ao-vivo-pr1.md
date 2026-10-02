# Início "Ao vivo" — PR 1 (casca + faixa de status) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/painel?ao-vivo` mostra a Início nova com a faixa de status da loja inteira (entraram, saíram, saldo, cliques, pedidos), atualizando a cada 60 s; `/painel` sem o parâmetro continua na Vitrine.

**Architecture:** `campaign_activity` passa a aceitar `p_campaign` nulo (cliques da loja inteira). A montagem da `AtividadeDaCampanha` sai da rota da campanha para `lib/painel/atividade-carga.ts` e é chamada também por `/api/painel/inicio` como parte nova `atividade`, com todos os grupos do tenant. O cliente ganha uma recarga silenciosa e `InicioAoVivo`, que reaproveita as células de número da página da campanha (extraídas para um arquivo compartilhado).

**Tech Stack:** Next.js 15 App Router, React 19, Tailwind v4, TypeScript strict, Supabase (PostgREST + RPC), `node --test` via tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-painel-inicio-ao-vivo-design.md`

## Global Constraints

- Toda query/RPC de store leva o tenant explícito (`.eq('tenant_id', …)` ou `p_tenant`); service-role passa por cima do RLS.
- DDL vai nos **dois** bancos (dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`) e quem roda é o Igor (o classificador bloqueia DDL). Nunca contornar.
- Função SQL: `security invoker`, `set search_path = ''`, `revoke all ... from public, anon, authenticated`, `grant execute ... to service_role`.
- Acid só em Postar, AO VIVO e LOTOU; **zero** `button`/`a` com `bg-acid` na Início (`e2e/painel-vitrine-casca.spec.ts`).
- Medição de entradas e saídas começa em `ENTRADAS_E_SAIDAS_DESDE` (`2026-09-30T23:01:58-03:00`); comparação com a semana passada só quando `semanaPassadaMedida()` for verdadeiro.
- O tenant de QA (dev) não tem instância e não pode ganhar uma fixa.
- Código e commits em inglês; texto de tela em pt-BR. Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Comandos de teste rodam em `apps/web`: unit `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`; tipos `npx tsc --noEmit -p tsconfig.json` **e** `npx tsc --noEmit -p tsconfig.e2e.json`; lint `npm run lint`.
- Nunca `git add -A`; conferir `git diff --cached --stat` antes de cada commit.

## File Structure

| Arquivo | Ação | Responsabilidade |
|---|---|---|
| `apps/web/supabase/migrations/20261002120000_campaign_activity_loja.sql` | criar | `campaign_activity` com `p_campaign` nulo = todos os links |
| `deploy/supabase/apply-order.txt` | modificar | registrar a migração |
| `apps/web/src/lib/stores/campaign-activity.ts` | modificar | `campanha.id: string \| null` |
| `apps/web/src/lib/stores/campaign-activity.test.ts` | modificar | teste do `p_campaign: null` |
| `apps/web/src/lib/stores/campaign-activity.integration.test.ts` | criar | cliques de duas campanhas + link comum contra o banco de dev |
| `apps/web/src/lib/painel/atividade-carga.ts` | criar | `carregarAtividade(tenantId, alvo, agora)` → `AtividadeDaCampanha` |
| `apps/web/src/app/api/campanhas/[slug]/atividade/route.ts` | modificar | passa a chamar `carregarAtividade` |
| `apps/web/src/app/api/painel/inicio/route.ts` | modificar | parte `atividade` |
| `apps/web/src/components/painel/home/use-dashboard-data.ts` | modificar | parte `atividade` + `atualizar()` silencioso |
| `apps/web/src/components/painel/home/types.ts` | modificar | `DashboardData.atividade` |
| `apps/web/src/lib/painel/ao-vivo/faixa.ts` (+ `.test.ts`) | criar | números da faixa (puro) + `atualizadoHa` |
| `apps/web/src/components/painel/numeros.tsx` | criar | `Celula`, `ContraSemanaPassada`, `EntrouSaiu`, `Faisca` (saem de `visao-geral.tsx`) |
| `apps/web/src/components/painel/campanhas/detalhe/visao-geral.tsx` | modificar | importa de `numeros.tsx` |
| `apps/web/src/components/painel/home/avisos.tsx` | criar | `AvisoParcial`, `BannerDesconectado`, `useAtivacaoNaCasca` (saem da Vitrine) |
| `apps/web/src/components/painel/home/vitrine/inicio-vitrine.tsx` | modificar | usa `avisos.tsx` |
| `apps/web/src/components/painel/home/ao-vivo/faixa-de-status.tsx` | criar | a faixa |
| `apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx` | criar | casca da Início nova |
| `apps/web/src/components/painel/home/ao-vivo/use-recarga.ts` | criar | recarrega a cada N ms com a aba visível |
| `apps/web/src/app/painel/page.tsx` | modificar | escolhe a tela por `?ao-vivo` |
| `apps/web/e2e/painel-inicio-ao-vivo.spec.ts` | criar | e2e da casca nova |

---

### Task 1: `campaign_activity` aceita a loja inteira (DDL)

**Files:**
- Create: `apps/web/supabase/migrations/20261002120000_campaign_activity_loja.sql`
- Modify: `deploy/supabase/apply-order.txt` (final do arquivo)
- Create: `apps/web/src/lib/stores/campaign-activity.integration.test.ts`

**Interfaces:**
- Produces: `public.campaign_activity(p_tenant uuid, p_campaign uuid, p_group_ids text[], p_from timestamptz, p_to timestamptz, p_bucket text)` — mesma assinatura; `p_campaign` nulo conta os cliques de todos os links do tenant (com ou sem campanha).

- [ ] **Step 1: Escrever a migração**

Copiar o corpo inteiro de `campaign_activity` de `apps/web/supabase/migrations/20260929120000_group_member_events.sql` (linhas 53–115) trocando `create function` por `create or replace function` e **só** esta linha da CTE `clique`:

```sql
      and e.campaign_group_id = p_campaign
```

por:

```sql
      -- Nulo = a loja inteira (a Início): todo clique do tenant, de link com ou sem campanha.
      and (p_campaign is null or e.campaign_group_id = p_campaign)
```

Cabeçalho do arquivo e o que vem depois do `$$;`:

```sql
-- Início "Ao vivo" (spec 2026-10-02): a faixa de status conta os cliques da loja
-- inteira. campaign_activity passa a aceitar p_campaign nulo; o resto da função
-- (novas pessoas e entradas/saídas, filtradas por p_group_ids) não muda.
-- create or replace não preserva ACL em dev: o revoke/grant vai de novo.

-- (create or replace function public.campaign_activity(...) ... $$; aqui)

comment on function public.campaign_activity(uuid, uuid, text[], timestamptz, timestamptz, text) is
  'Novas pessoas (leads.entered_at), cliques no link (link_click_events; p_campaign nulo = todos os links da loja) e entradas e saídas (group_member_events) por hora ou dia de Brasília, com zero nas fatias vazias. Chamada só pelo servidor, com o tenant explícito.';

revoke all on function public.campaign_activity(uuid, uuid, text[], timestamptz, timestamptz, text) from public, anon, authenticated;
grant execute on function public.campaign_activity(uuid, uuid, text[], timestamptz, timestamptz, text) to service_role;
```

- [ ] **Step 2: Registrar no `apply-order.txt`**

Acrescentar ao final de `deploy/supabase/apply-order.txt`:

```
# 2026-10-02 - Inicio "Ao vivo": campaign_activity com p_campaign nulo conta os
# cliques de todos os links da loja (faixa de status da Inicio).
apps/web/supabase/migrations/20261002120000_campaign_activity_loja.sql
```

`schema-baseline.json` **não** muda: assinatura e ACL são as mesmas e o gate de drift não vê corpo de função.

- [ ] **Step 3: Escrever o teste de integração (falha até a DDL chegar no dev)**

```ts
// apps/web/src/lib/stores/campaign-activity.integration.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { campaignActivity } from "./campaign-activity";

/**
 * Contra o Supabase de DEV. A Início conta os cliques da loja inteira com
 * `p_campaign` nulo; teste com PostgREST falso não alcança o SQL da função.
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);
// Em 2020: longe do "hoje" que as telas do tenant de E2E mostram.
const DIA = { de: new Date("2020-02-10T03:00:00Z"), ate: new Date("2020-02-11T03:00:00Z"), fatia: "day" as const };
const QUANDO = "2020-02-10T15:00:00Z";

const campanhas: string[] = [];
let linkId = "";

function pular(): boolean {
  if (EM_PRODUCAO) {
    console.log("SUPABASE_URL é de produção — teste de integração pulado");
    return true;
  }
  if (!TENANT) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

before(async () => {
  if (pular()) return;
  const supabase = getSupabaseAdmin();
  for (const sufixo of ["a", "b"]) {
    const { data, error } = await supabase
      .from("campaign_groups")
      .insert({ tenant_id: TENANT, name: `cliques-${RUN}-${sufixo}`, slug: `cliques-${RUN}-${sufixo}` })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    campanhas.push(data!.id as string);
  }
  const { data: link, error: el } = await supabase
    .from("tracked_links")
    .insert({ tenant_id: TENANT, slug: `cliques-${RUN}`, target_url: "https://example.com" })
    .select("id")
    .single();
  if (el) throw new Error(el.message);
  linkId = link!.id as string;
  // Um clique em cada campanha e um de link comum (sem campanha).
  const { error: ec } = await supabase.from("link_click_events").insert([
    { tenant_id: TENANT, tracked_link_id: linkId, campaign_group_id: campanhas[0], occurred_at: QUANDO },
    { tenant_id: TENANT, tracked_link_id: linkId, campaign_group_id: campanhas[1], occurred_at: QUANDO },
    { tenant_id: TENANT, tracked_link_id: linkId, campaign_group_id: null, occurred_at: QUANDO },
  ]);
  if (ec) throw new Error(ec.message);
});

after(async () => {
  if (pular()) return;
  const supabase = getSupabaseAdmin();
  // Os cliques caem junto com o link (on delete cascade).
  if (linkId) await supabase.from("tracked_links").delete().eq("tenant_id", TENANT).eq("id", linkId);
  if (campanhas.length) await supabase.from("campaign_groups").delete().eq("tenant_id", TENANT).in("id", campanhas);
});

test("com a campanha, conta só os cliques dela", async () => {
  if (pular()) return;
  const serie = await campaignActivity(TENANT, { id: campanhas[0], groupIds: [] }, DIA);
  assert.equal(serie.reduce((s, p) => s + p.cliques, 0), 1);
});

test("sem campanha (a loja inteira), conta os cliques de todas as campanhas e do link comum", async () => {
  if (pular()) return;
  const serie = await campaignActivity(TENANT, { id: null, groupIds: [] }, DIA);
  // >= e não ==: outro run em paralelo pode ter cliques do QA no mesmo dia de 2020.
  assert.ok(serie.reduce((s, p) => s + p.cliques, 0) >= 3);
});
```

(O tipo `id: null` só compila depois da Task 2; rodar este teste depois dela.)

- [ ] **Step 4: Entregar o SQL ao Igor**

Mensagem ao Igor com os dois comandos (PowerShell, um por bloco), rodados de `apps/web` num worktree:

```bash
npx supabase link --project-ref wfjuwogxaupyadwhvoxy --yes
```
```bash
npx supabase db query --linked -f supabase/migrations/20261002120000_campaign_activity_loja.sql
```
```bash
npx supabase link --project-ref nidoatbxaylrkcgbszns --yes
```
```bash
npx supabase db query --linked -f supabase/migrations/20261002120000_campaign_activity_loja.sql
```

Depois que ele confirmar, conferir nos dois (leitura, sem DDL) que o corpo novo chegou e a ACL ficou certa:

```sql
select position('p_campaign is null' in pg_get_functiondef('public.campaign_activity(uuid,uuid,text[],timestamptz,timestamptz,text)'::regprocedure)) > 0 as corpo_novo,
       has_function_privilege('authenticated', 'public.campaign_activity(uuid,uuid,text[],timestamptz,timestamptz,text)', 'execute') as authenticated_executa;
```

Esperado: `corpo_novo = true`, `authenticated_executa = false`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/supabase/migrations/20261002120000_campaign_activity_loja.sql deploy/supabase/apply-order.txt apps/web/src/lib/stores/campaign-activity.integration.test.ts
git commit -m "feat(db): campaign_activity counts store-wide clicks when campaign is null"
```

---

### Task 2: carga da atividade compartilhada entre a campanha e a Início

**Files:**
- Modify: `apps/web/src/lib/stores/campaign-activity.ts:15-19`
- Modify: `apps/web/src/lib/stores/campaign-activity.test.ts` (novo teste no fim)
- Create: `apps/web/src/lib/painel/atividade-carga.ts`
- Modify: `apps/web/src/app/api/campanhas/[slug]/atividade/route.ts`

**Interfaces:**
- Consumes: `janelasDaAtividade`, `somaDa`, `ENTRADAS_E_SAIDAS_DESDE`, `AtividadeDaCampanha` de `@/lib/painel/atividade`; `listGroupsCreatedSince(tenantId, campaignGroupId, desde)` de `@/lib/stores/group-grow-jobs`.
- Produces: `campaignActivity(tenantId, campanha: { id: string | null; groupIds: string[] }, janela)`; `carregarAtividade(tenantId: string, alvo: { campanhaId: string | null; groupIds: string[] }, agora: Date): Promise<AtividadeDaCampanha>` (com `campanhaId` nulo, `gruposAbertosHoje` é `[]` — o PR 2 resolve os grupos novos da loja).

- [ ] **Step 1: Teste do store com campanha nula (falha de tipo)**

Acrescentar ao fim de `campaign-activity.test.ts`:

```ts
test("a loja inteira vai com p_campaign nulo, e os grupos continuam na RPC", async () => {
  pedidos.length = 0;
  linhas = [];

  await campaignActivity("loja-a", { id: null, groupIds: ["g40@g.us", "g7@g.us"] }, hoje);
  assert.equal(pedidos[0].corpo.p_tenant, "loja-a");
  assert.equal(pedidos[0].corpo.p_campaign, null);
  assert.deepEqual(pedidos[0].corpo.p_group_ids, ["g40@g.us", "g7@g.us"]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsc --noEmit -p tsconfig.json` (em `apps/web`)
Expected: erro `Type 'null' is not assignable to type 'string'` em `campaign-activity.test.ts`.

- [ ] **Step 3: Aceitar nulo no store**

Em `campaign-activity.ts`, trocar a assinatura e o comentário:

```ts
/**
 * Série da campanha (`public.campaign_activity`): uma linha por hora ou dia da
 * janela, com zero onde não houve nada. O tenant vai explícito porque o
 * service-role passa por cima do RLS; é este parâmetro que isola as lojas.
 * `id` nulo é a loja inteira: cliques de todos os links (a Início).
 */
export async function campaignActivity(
  tenantId: string,
  campanha: { id: string | null; groupIds: string[] },
  janela: Janela,
): Promise<PontoDaSerie[]> {
```

- [ ] **Step 4: Rodar teste e tipos**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/stores/campaign-activity.test.ts && npx tsc --noEmit -p tsconfig.json`
Expected: PASS, sem erro de tipo.

- [ ] **Step 5: Extrair a carga**

```ts
// apps/web/src/lib/painel/atividade-carga.ts
import "server-only";
import { ENTRADAS_E_SAIDAS_DESDE, janelasDaAtividade, somaDa, type AtividadeDaCampanha } from "@/lib/painel/atividade";
import { campaignActivity, campaignGroupMemberCounts } from "@/lib/stores/campaign-activity";
import { listGroupsCreatedSince } from "@/lib/stores/group-grow-jobs";

/**
 * A análise de entradas, saídas e cliques num formato só, para a página da
 * campanha e para a Início. `campanhaId` nulo = a loja inteira: os grupos são
 * todos os do tenant e os cliques, de todos os links.
 */
export async function carregarAtividade(
  tenantId: string,
  alvo: { campanhaId: string | null; groupIds: string[] },
  agora: Date,
): Promise<AtividadeDaCampanha> {
  const janelas = janelasDaAtividade(agora);
  const campanha = { id: alvo.campanhaId, groupIds: alvo.groupIds };
  const [porHora, porDia, antes, hojePorGrupo, abertos] = await Promise.all([
    campaignActivity(tenantId, campanha, janelas.porHora),
    campaignActivity(tenantId, campanha, janelas.porDia),
    campaignActivity(tenantId, campanha, janelas.semanaPassada),
    campaignGroupMemberCounts(tenantId, alvo.groupIds, janelas.porHora),
    alvo.campanhaId ? listGroupsCreatedSince(tenantId, alvo.campanhaId, janelas.porHora.de.toISOString()) : Promise.resolve([]),
  ]);

  return {
    geradoEm: agora.toISOString(),
    entradasDesde: new Date(ENTRADAS_E_SAIDAS_DESDE).toISOString(),
    porHora,
    porDia,
    semanaPassada: {
      novas: somaDa(antes, "novas"),
      cliques: somaDa(antes, "cliques"),
      entraram: somaDa(antes, "entraram"),
      sairam: somaDa(antes, "sairam"),
    },
    hojePorGrupo,
    gruposAbertosHoje: abertos.map((g) => ({ nome: g.subject, seq: g.seq, grupo: g.whatsapp_group_id, quando: g.updated_at })),
  };
}
```

- [ ] **Step 6: A rota da campanha usa a carga**

Em `app/api/campanhas/[slug]/atividade/route.ts`, trocar os imports de `@/lib/painel/atividade`, `@/lib/stores/campaign-activity` e `@/lib/stores/group-grow-jobs` por:

```ts
import { carregarAtividade } from "@/lib/painel/atividade-carga";
```

e o miolo do `try` (de `const agora = new Date();` até `return Response.json(resposta);`) por:

```ts
    const atividade = await carregarAtividade(tenantId, { campanhaId: camp.id, groupIds: camp.group_ids ?? [] }, new Date());
    return Response.json(atividade);
```

- [ ] **Step 7: Rodar a suíte e os tipos**

Run: `npm test && npx tsc --noEmit -p tsconfig.json`
Expected: todos PASS (os testes de `atividade.test.ts` e da página da campanha não mudam).

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/stores/campaign-activity.ts apps/web/src/lib/stores/campaign-activity.test.ts apps/web/src/lib/painel/atividade-carga.ts "apps/web/src/app/api/campanhas/[slug]/atividade/route.ts"
git commit -m "refactor(painel): share activity loading between campaign page and home"
```

---

### Task 3: parte `atividade` na Início e recarga silenciosa

**Files:**
- Modify: `apps/web/src/app/api/painel/inicio/route.ts`
- Modify: `apps/web/src/components/painel/home/types.ts` (tipo `DashboardData`)
- Modify: `apps/web/src/components/painel/home/use-dashboard-data.ts`

**Interfaces:**
- Consumes: `carregarAtividade` (Task 2); `carregarGrupos(tenantId)` retorna itens com `whatsappGroupId: string`.
- Produces: `DashboardData.atividade: AtividadeDaCampanha | null`; `DashboardDataHandle.atualizar: () => void` (busca de novo sem voltar ao skeleton; falha mantém o dado anterior).

- [ ] **Step 1: A rota ganha a parte**

Em `app/api/painel/inicio/route.ts`, acrescentar os imports:

```ts
import { carregarAtividade } from "@/lib/painel/atividade-carga";
import { USE_SUPABASE } from "@/lib/stores/use-supabase";
```

e trocar o `resolverPartes({...})` por:

```ts
  // Os grupos são lidos uma vez e servem a duas partes: a lista e a atividade da loja.
  const grupos = carregarGrupos(tenantId);
  const partes = await resolverPartes({
    groups: () => grupos,
    campanhas: () => carregarCampanhas(tenantId),
    links: () => carregarLinks(tenantId),
    leads: () => carregarLeads(tenantId),
    orders: () => listOrdersByTenant(tenantId),
    schedules: () => carregarAgendamentos(tenantId),
    disparos: () => carregarDisparos(tenantId),
    session: () => carregarSessao(tenantId),
    settings: () => getTenantSettings(tenantId),
    // O JSON de dev não guarda entrada nem clique com data: sem banco não há série.
    atividade: async () =>
      USE_SUPABASE
        ? carregarAtividade(tenantId, { campanhaId: null, groupIds: (await grupos).map((g) => g.whatsappGroupId) }, new Date())
        : null,
  });
```

e atualizar o comentário do arquivo ("os nove stores") para "as partes".

- [ ] **Step 2: Tipos do cliente**

Em `components/painel/home/types.ts`, no tipo `DashboardData`, acrescentar:

```ts
  /** Entradas, saídas e cliques da loja inteira (Início "Ao vivo"). Nulo = não carregou ou sem banco. */
  atividade: AtividadeDaCampanha | null;
```

com `import type { AtividadeDaCampanha } from "@/lib/painel/atividade";` no topo.

- [ ] **Step 3: O hook lê a parte e ganha `atualizar`**

Em `use-dashboard-data.ts`:

1. Import: `import type { AtividadeDaCampanha } from "@/lib/painel/atividade";`.
2. No tipo `Carga`, acrescentar `atividade: Parte<AtividadeDaCampanha | null>;`.
3. Trocar `const load = useCallback(async () => { setState({ status: "loading" });` por uma função com parâmetro:

```ts
  const load = useCallback(async (silencioso = false) => {
    if (!silencioso) setState({ status: "loading" });

    const carga = await loadJson<Carga>("/api/painel/inicio");
    if (!carga.ok) {
      // A recarga de fundo que falha mantém a tela como estava: piscar erro a cada minuto sem rede seria pior.
      if (!silencioso) setState({ status: "error" });
      return;
    }
```

   e, logo depois de `const settings = parte(carga.data.settings);`, acrescentar `const atividade = parte(carga.data.atividade);`. No `if (!session.ok || !campanhas.ok || !groups.ok)`, envolver o `setState({ status: "error" })` em `if (!silencioso)` mantendo o `return`. No objeto `data`, acrescentar `atividade: atividade.ok ? (atividade.data ?? null) : null,`. A atividade **não** entra em `partial` (a Vitrine não a usa; na Início nova, a faixa diz "não carregou" sozinha).
4. No `useEffect`, `void load();` continua. No `DashboardDataHandle`, acrescentar `atualizar: () => void;` com o comentário `/** Busca de novo sem o skeleton; falha mantém o dado anterior. */` e retornar `atualizar: () => void load(true)` ao lado de `reload: () => void load()`.

- [ ] **Step 4: Tipos e testes**

Run: `npx tsc --noEmit -p tsconfig.json && npm test`
Expected: PASS. Se algum teste ou fixture constrói `DashboardData` à mão, o `tsc` aponta: acrescentar `atividade: null` nele.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/api/painel/inicio/route.ts apps/web/src/components/painel/home/types.ts apps/web/src/components/painel/home/use-dashboard-data.ts
git commit -m "feat(painel): store-wide activity part on home payload and silent refresh"
```

---

### Task 4: números da faixa (puro)

**Files:**
- Create: `apps/web/src/lib/painel/ao-vivo/faixa.ts`
- Test: `apps/web/src/lib/painel/ao-vivo/faixa.test.ts`

**Interfaces:**
- Consumes: `barrasDaAtividade`, `somaMedida`, `somaDa`, `semanaPassadaMedida`, `diaDaSemanaPassada`, `type AtividadeDaCampanha`, `type Barra` de `@/lib/painel/atividade`; `dayBR`, `dayBROf`, `monthBR` de `@/lib/date-br`; `revenueInMonth`, `type MonthlyOrder` de `@/lib/painel-metrics`.
- Produces:

```ts
export type Comparacao =
  | { tipo: "contra"; antes: number; diaPassado: string }
  | { tipo: "medindo"; desde: string };

export type NumerosDaFaixa = {
  entraram: number;
  sairam: number;
  saldo: number;
  /** Saldo dos últimos 7 dias, só do que foi medido. */
  saldoSemana: number;
  cliques: number;
  seteDias: Barra[];
  comparacao: Comparacao;
};

export type PedidosDeHoje = { quantidade: number; valor: number; metaPct: number | null };

export function numerosDaFaixa(a: AtividadeDaCampanha): NumerosDaFaixa;
export function pedidosDeHoje(orders: readonly MonthlyOrder[], metaDoMes: number | null, agora: Date): PedidosDeHoje;
export function atualizadoHa(geradoEm: string, agora: Date): string;
```

- [ ] **Step 1: Escrever os testes**

```ts
// apps/web/src/lib/painel/ao-vivo/faixa.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import type { AtividadeDaCampanha, PontoDaSerie } from "@/lib/painel/atividade";
import { atualizadoHa, numerosDaFaixa, pedidosDeHoje } from "./faixa";

const ponto = (inicio: string, p: Partial<PontoDaSerie> = {}): PontoDaSerie => ({
  inicio, novas: 0, cliques: 0, entraram: 0, sairam: 0, ...p,
});

function atividade(geradoEm: string, porHora: PontoDaSerie[], porDia: PontoDaSerie[], semanaPassadaEntraram = 0): AtividadeDaCampanha {
  return {
    geradoEm,
    entradasDesde: "2026-10-01T02:01:58.000Z",
    porHora,
    porDia,
    semanaPassada: { novas: 0, cliques: 0, entraram: semanaPassadaEntraram, sairam: 0 },
    hojePorGrupo: {},
    gruposAbertosHoje: [],
  };
}

test("soma entraram, saíram e cliques de hoje e tira o saldo", () => {
  const a = atividade(
    "2026-10-02T17:10:00.000Z",
    [ponto("2026-10-02T12:00:00.000Z", { entraram: 10, sairam: 2, cliques: 30 }), ponto("2026-10-02T16:00:00.000Z", { entraram: 5, sairam: 1, cliques: 4 })],
    [ponto("2026-10-01T03:00:00.000Z", { entraram: 20, sairam: 3 }), ponto("2026-10-02T03:00:00.000Z", { entraram: 15, sairam: 3 })],
  );
  const n = numerosDaFaixa(a);
  assert.equal(n.entraram, 15);
  assert.equal(n.sairam, 3);
  assert.equal(n.saldo, 12);
  assert.equal(n.cliques, 34);
  // As barras vêm dos dias da série; o último é hoje, aceso.
  assert.equal(n.seteDias.at(-1)?.atual, true);
});

test("antes de 7 dias medidos não compara: diz desde quando mede", () => {
  const a = atividade("2026-10-02T17:10:00.000Z", [], [], 99);
  assert.deepEqual(numerosDaFaixa(a).comparacao, { tipo: "medindo", desde: "2026-10-01T02:01:58.000Z" });
});

test("com a semana passada medida, compara com ela", () => {
  const a = atividade("2026-10-09T17:10:00.000Z", [], [], 40);
  const c = numerosDaFaixa(a).comparacao;
  assert.equal(c.tipo, "contra");
  assert.equal(c.tipo === "contra" && c.antes, 40);
});

test("saldo da semana não conta dia sem medição como zero de verdade", () => {
  const a = atividade(
    "2026-10-02T17:10:00.000Z",
    [],
    [ponto("2026-09-28T03:00:00.000Z", { entraram: 999, sairam: 0 }), ponto("2026-10-01T03:00:00.000Z", { entraram: 20, sairam: 3 }), ponto("2026-10-02T03:00:00.000Z", { entraram: 15, sairam: 3 })],
  );
  // 28/09 é antes da medição: fica de fora do saldo.
  assert.equal(numerosDaFaixa(a).saldoSemana, 29);
});

test("pedidos de hoje: só os de hoje em Brasília, e a meta do mês em %", () => {
  const agora = new Date("2026-10-02T17:00:00.000Z");
  const orders = [
    { value: 100, created_at: "2026-10-02T13:00:00.000Z" },
    { value: 50, created_at: "2026-10-02T02:30:00.000Z" }, // 01/10 23:30 em Brasília
    { value: 250, created_at: "2026-10-01T15:00:00.000Z" },
  ];
  assert.deepEqual(pedidosDeHoje(orders, 1000, agora), { quantidade: 1, valor: 100, metaPct: 40 });
  assert.equal(pedidosDeHoje(orders, null, agora).metaPct, null);
  assert.equal(pedidosDeHoje(orders, 0, agora).metaPct, null);
});

test("atualizado há: agora, minutos e horas", () => {
  const agora = new Date("2026-10-02T17:10:00.000Z");
  assert.equal(atualizadoHa("2026-10-02T17:09:40.000Z", agora), "atualizado agora");
  assert.equal(atualizadoHa("2026-10-02T17:07:00.000Z", agora), "atualizado há 3 min");
  assert.equal(atualizadoHa("2026-10-02T15:05:00.000Z", agora), "atualizado há 2 h");
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/ao-vivo/faixa.test.ts`
Expected: FAIL com `Cannot find module './faixa'`.

- [ ] **Step 3: Implementar**

```ts
// apps/web/src/lib/painel/ao-vivo/faixa.ts
import { dayBR, dayBROf, monthBR } from "@/lib/date-br";
import {
  barrasDaAtividade,
  diaDaSemanaPassada,
  semanaPassadaMedida,
  somaDa,
  somaMedida,
  type AtividadeDaCampanha,
  type Barra,
} from "@/lib/painel/atividade";
import { revenueInMonth, type MonthlyOrder } from "@/lib/painel-metrics";

/**
 * A faixa de status da Início "Ao vivo" (spec 2026-10-02): a loja inteira hoje.
 * Mesmas contas da faixa da campanha (`visao-geral.tsx`), sobre a série da loja.
 */

export type Comparacao =
  | { tipo: "contra"; antes: number; diaPassado: string }
  | { tipo: "medindo"; desde: string };

export type NumerosDaFaixa = {
  entraram: number;
  sairam: number;
  saldo: number;
  /** Saldo dos últimos 7 dias, só do que foi medido. */
  saldoSemana: number;
  cliques: number;
  seteDias: Barra[];
  comparacao: Comparacao;
};

export type PedidosDeHoje = { quantidade: number; valor: number; metaPct: number | null };

const MIN_MS = 60_000;

export function numerosDaFaixa(a: AtividadeDaCampanha): NumerosDaFaixa {
  const hoje = somaMedida(barrasDaAtividade(a, "hoje", "entraram", "sairam"));
  const semana = somaMedida(barrasDaAtividade(a, "7d", "entraram", "sairam"));
  return {
    entraram: hoje.entraram,
    sairam: hoje.sairam,
    saldo: hoje.entraram - hoje.sairam,
    saldoSemana: semana.entraram - semana.sairam,
    cliques: somaDa(a.porHora, "cliques"),
    seteDias: barrasDaAtividade(a, "7d", "entraram"),
    comparacao: semanaPassadaMedida(a)
      ? { tipo: "contra", antes: a.semanaPassada.entraram, diaPassado: diaDaSemanaPassada(dayBR(new Date(a.geradoEm)), true) }
      : { tipo: "medindo", desde: a.entradasDesde },
  };
}

export function pedidosDeHoje(orders: readonly MonthlyOrder[], metaDoMes: number | null, agora: Date): PedidosDeHoje {
  const hoje = dayBR(agora);
  const deHoje = orders.filter((o) => dayBROf(o.created_at) === hoje);
  const doMes = revenueInMonth(orders, monthBR(agora));
  return {
    quantidade: deHoje.length,
    valor: deHoje.reduce((s, o) => s + (o.value ?? 0), 0),
    metaPct: metaDoMes && metaDoMes > 0 ? Math.round((doMes / metaDoMes) * 100) : null,
  };
}

export function atualizadoHa(geradoEm: string, agora: Date): string {
  const minutos = Math.floor((agora.getTime() - Date.parse(geradoEm)) / MIN_MS);
  if (minutos < 1) return "atualizado agora";
  if (minutos < 60) return `atualizado há ${minutos} min`;
  return `atualizado há ${Math.floor(minutos / 60)} h`;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/painel/ao-vivo/faixa.test.ts`
Expected: PASS (6 testes). (`somaMedida` já pula barra `semMedicao` e `futuro`: é isso que deixa 28/09 fora do saldo da semana.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/painel/ao-vivo/faixa.ts apps/web/src/lib/painel/ao-vivo/faixa.test.ts
git commit -m "feat(painel): status strip numbers for the live home"
```

---

### Task 5: peças compartilhadas (células de número, avisos, ativação)

Refactor sem mudança de comportamento: a página da campanha e a Vitrine continuam idênticas.

**Files:**
- Create: `apps/web/src/components/painel/numeros.tsx`
- Modify: `apps/web/src/components/painel/campanhas/detalhe/visao-geral.tsx` (remove `Celula`, `ContraSemanaPassada`, `EntrouSaiu`, `Faisca`; importa de `numeros.tsx`)
- Create: `apps/web/src/components/painel/home/avisos.tsx`
- Modify: `apps/web/src/components/painel/home/vitrine/inicio-vitrine.tsx`

**Interfaces:**
- Produces:
  - `numeros.tsx`: `Celula({ rotulo, valor, className?, children })`, `ContraSemanaPassada({ hoje, antes, diaPassado })`, `EntrouSaiu({ entraram, sairam })`, `Faisca({ barras })` — corpos **idênticos** aos de `visao-geral.tsx:369-434`, agora `export`.
  - `avisos.tsx`: `AvisoParcial()`, `BannerDesconectado()`, `useAtivacaoNaCasca({ activation, settings, settingsOk, onOnboardingComplete })`.

- [ ] **Step 1: Mover as células**

Criar `components/painel/numeros.tsx` com `"use client";`, os imports que esses quatro usam (`ArrowDownRight`, `ArrowUpRight` de `lucide-react`; `variacao`, `type Barra` de `@/lib/painel/atividade`; `numero` de `@/lib/painel/grupos`; `cn` de `@/lib/utils`) e as quatro funções copiadas de `visao-geral.tsx` com `export` na frente. Comentário de topo: `/** Células da faixa de números: a da campanha (direção D) e a da Início "Ao vivo". */`. Em `visao-geral.tsx`, apagar as quatro funções e importar `{ Celula, ContraSemanaPassada, EntrouSaiu, Faisca } from "@/components/painel/numeros"`; remover de lá os imports que ficarem sem uso (o `tsc` e o lint apontam).

- [ ] **Step 2: Extrair os avisos e a ativação da Vitrine**

```tsx
// apps/web/src/components/painel/home/avisos.tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { WifiOff } from "lucide-react";
import { useCasca } from "@/components/painel/casca-context";
import type { TenantSettings } from "@/components/painel/home/types";
import type { Activation } from "@/lib/onboarding-steps";

/** O que a Vitrine e a Início "Ao vivo" mostram igual: carga parcial, número caído e o roteiro de ativação. */

export function AvisoParcial() {
  return (
    <p className="rounded-[var(--radius-control)] bg-aviso-fundo px-4 py-3 text-13 text-volt-950">
      Alguns números não carregaram e podem estar incompletos. Recarregue a página pra tentar de novo.
    </p>
  );
}

export function BannerDesconectado() {
  return (
    <Link
      href="/painel/conectar"
      className="flex items-center gap-3 rounded-[var(--radius-control)] border border-alerta bg-canvas-100 px-4 py-3"
    >
      <WifiOff className="h-5 w-5 shrink-0 text-alerta" strokeWidth={2} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-15 font-semibold text-volt-950">Seu WhatsApp está desconectado</span>
        <span className="block text-13 text-slate-600">Nada sai e ninguém entra até reconectar.</span>
      </span>
      <span className="shrink-0 text-13 font-semibold text-cobalt-500">Reconectar</span>
    </Link>
  );
}

/** O corredor mostra "N de 5 passos"; e a ativação completa é carimbada uma vez no servidor. */
export function useAtivacaoNaCasca({
  activation,
  settings,
  settingsOk,
  onOnboardingComplete,
}: {
  activation: Activation;
  settings: TenantSettings;
  settingsOk: boolean;
  onOnboardingComplete: () => void;
}) {
  const { definirPassos } = useCasca();
  useEffect(() => {
    definirPassos({ feitos: activation.doneCount, total: activation.total });
  }, [activation.doneCount, activation.total, definirPassos]);
  useEffect(() => {
    if (settingsOk && activation.complete && settings.onboardingCompletedAt == null) onOnboardingComplete();
  }, [settingsOk, activation.complete, settings.onboardingCompletedAt, onOnboardingComplete]);
}
```

Em `inicio-vitrine.tsx`: trocar os dois `useEffect` e o `useCasca()` por `useAtivacaoNaCasca({ activation, settings, settingsOk, onOnboardingComplete });`, o `<p>` de carga parcial por `<AvisoParcial />` e o `<Link href="/painel/conectar">…</Link>` por `<BannerDesconectado />`. Remover os imports que ficarem sem uso (`useEffect`, `WifiOff`, `useCasca`).

- [ ] **Step 3: Tipos, lint e testes**

Run: `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.e2e.json && npm run lint && npm test`
Expected: tudo PASS, sem import sobrando.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/painel/numeros.tsx apps/web/src/components/painel/campanhas/detalhe/visao-geral.tsx apps/web/src/components/painel/home/avisos.tsx apps/web/src/components/painel/home/vitrine/inicio-vitrine.tsx
git commit -m "refactor(painel): share number cells, home notices and activation hook"
```

---

### Task 6: `InicioAoVivo`, faixa de status e a troca por `?ao-vivo`

**Files:**
- Create: `apps/web/src/components/painel/home/ao-vivo/use-recarga.ts`
- Create: `apps/web/src/components/painel/home/ao-vivo/faixa-de-status.tsx`
- Create: `apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx`
- Modify: `apps/web/src/app/painel/page.tsx`

**Interfaces:**
- Consumes: `numerosDaFaixa`, `pedidosDeHoje`, `atualizadoHa` (Task 4); `Celula`, `ContraSemanaPassada`, `EntrouSaiu`, `Faisca` (Task 5); `AvisoParcial`, `BannerDesconectado`, `useAtivacaoNaCasca` (Task 5); `medindoDesde` de `@/components/painel/campanhas/detalhe/analise`; `saldo` de `@/components/painel/campanhas/detalhe/grafico-barras`; `numero` de `@/lib/painel/grupos`; `DashboardDataHandle.atualizar` (Task 3).
- Produces: `InicioAoVivo(props)` com as mesmas props de `InicioVitrine` + `atividade: AtividadeDaCampanha | null` + `onAtualizar: () => void`; `data-testid="inicio-ao-vivo"` no contêiner e `data-testid="inicio-faixa"` na faixa.

- [ ] **Step 1: A recarga**

```ts
// apps/web/src/components/painel/home/ao-vivo/use-recarga.ts
"use client";

import { useEffect } from "react";

/**
 * Chama `recarregar` a cada `ms` enquanto a aba está visível, e uma vez assim que
 * ela volta a ficar visível. Aba escondida não busca nada (egress do Supabase).
 */
export function useRecarga(recarregar: () => void, ms: number) {
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const ligar = () => {
      clearInterval(timer);
      if (document.visibilityState === "visible") timer = setInterval(recarregar, ms);
    };
    const aoMudar = () => {
      if (document.visibilityState === "visible") recarregar();
      ligar();
    };
    ligar();
    document.addEventListener("visibilitychange", aoMudar);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aoMudar);
    };
  }, [recarregar, ms]);
}
```

- [ ] **Step 2: A faixa**

```tsx
// apps/web/src/components/painel/home/ao-vivo/faixa-de-status.tsx
"use client";

import { ContraSemanaPassada, Celula, EntrouSaiu, Faisca } from "@/components/painel/numeros";
import { medindoDesde } from "@/components/painel/campanhas/detalhe/analise";
import { saldo } from "@/components/painel/campanhas/detalhe/grafico-barras";
import type { Order, TrackedLink } from "@/components/painel/home/types";
import { horaBR } from "@/lib/date-br";
import type { AtividadeDaCampanha } from "@/lib/painel/atividade";
import { atualizadoHa, numerosDaFaixa, pedidosDeHoje } from "@/lib/painel/ao-vivo/faixa";
import { numero } from "@/lib/painel/grupos";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const DIA = new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });

type Props = {
  atividade: AtividadeDaCampanha | null;
  links: TrackedLink[];
  orders: Order[];
  metaDoMes: number | null;
  agora: Date;
};

/** A faixa de status da Início "Ao vivo": a loja inteira hoje, numa linha. */
export function FaixaDeStatus({ atividade, links, orders, metaDoMes, agora }: Props) {
  const n = atividade ? numerosDaFaixa(atividade) : null;
  const pedidos = pedidosDeHoje(orders, metaDoMes, agora);
  const cliquesNoTotal = links.reduce((s, l) => s + (l.clicks ?? 0), 0);

  return (
    <section data-testid="inicio-faixa" aria-label="A loja hoje" className="overflow-hidden rounded-[10px] border border-line-200 bg-line-200">
      <div className="flex flex-wrap items-center justify-between gap-2 bg-paper-0 px-5 py-2.5">
        <p className="flex items-center gap-2.5">
          <span className="pn-chip pn-chip--acid">● AO VIVO</span>
          <span className="text-13 capitalize text-slate-600">
            {DIA.format(agora)} · {horaBR(agora.toISOString())}
          </span>
        </p>
        <p className="text-12 text-slate-600">{atividade ? atualizadoHa(atividade.geradoEm, agora) : "a série não carregou"}</p>
      </div>

      <div className="mt-px grid gap-px sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_1fr_1fr_1.2fr]">
        <div className="bg-paper-0 px-5 py-4 sm:col-span-2 lg:col-span-1">
          <p className="text-13 text-slate-600">Entraram hoje</p>
          <div className="mt-2 flex items-end justify-between gap-4">
            <p className="text-[44px] font-semibold leading-none tabular-nums text-volt-950 [font-stretch:75%]">
              {n ? numero(n.entraram) : "—"}
            </p>
            {n && <Faisca barras={n.seteDias} />}
          </div>
          <p className="mt-2 text-13 text-slate-600">
            {!n || !atividade
              ? "a série não carregou"
              : n.comparacao.tipo === "contra"
                ? <ContraSemanaPassada hoje={n.entraram} antes={n.comparacao.antes} diaPassado={n.comparacao.diaPassado} />
                : `${medindoDesde(n.comparacao.desde)} · a comparação com a semana passada começa em 7 dias`}
          </p>
        </div>
        <Celula rotulo="Saíram hoje" valor={n ? numero(n.sairam) : "—"}>
          {n && <EntrouSaiu entraram={n.entraram} sairam={n.sairam} />}
          {n ? "nos grupos em que você é admin" : null}
        </Celula>
        <Celula rotulo="Saldo hoje" valor={n ? saldo(n.saldo) : "—"}>
          {n ? `${saldo(n.saldoSemana)} em 7 dias` : null}
        </Celula>
        <Celula rotulo="Cliques nos links hoje" valor={n ? numero(n.cliques) : "—"}>
          {cliquesNoTotal === 0 ? "ninguém clicou num link ainda" : `${numero(cliquesNoTotal)} no total`}
        </Celula>
        <Celula rotulo="Pedidos anotados hoje" valor={brl.format(pedidos.valor)} className="sm:col-span-2 lg:col-span-1">
          {pedidos.quantidade === 0 ? "nenhum pedido hoje" : `${numero(pedidos.quantidade)} ${pedidos.quantidade === 1 ? "pedido" : "pedidos"}`}
          {" · "}
          {pedidos.metaPct === null ? "sem meta do mês" : `${pedidos.metaPct}% da meta do mês`}
        </Celula>
      </div>
    </section>
  );
}
```

Conferir antes de rodar: `pn-chip pn-chip--acid` é a classe que `e2e/painel-vitrine-relampago.spec.ts:25` já usa para o AO VIVO (é `span`, não botão — não fere o contrato da casca). `saldo()` já é exportada de `grafico-barras.tsx:262`.

Desvio registrado da spec: o "2–3 maiores campanhas" ao lado dos cliques fica fora do PR 1 — exigiria cliques de hoje por campanha, que nenhuma parte traz. A célula mostra o total de hoje e o total histórico, como a da campanha (a spec já registra isso).

- [ ] **Step 3: A casca**

```tsx
// apps/web/src/components/painel/home/ao-vivo/inicio-ao-vivo.tsx
"use client";

import { CelebrationModal } from "@/components/painel/celebration-modal";
import { ActivationChecklist } from "@/components/painel/home/activation-checklist";
import { AvisoParcial, BannerDesconectado, useAtivacaoNaCasca } from "@/components/painel/home/avisos";
import type { Lead, Order, TenantSettings, TrackedLink } from "@/components/painel/home/types";
import type { Group } from "@/lib/mock-data";
import type { Activation } from "@/lib/onboarding-steps";
import type { AtividadeDaCampanha } from "@/lib/painel/atividade";
import { FaixaDeStatus } from "./faixa-de-status";
import { useRecarga } from "./use-recarga";

const RECARGA_MS = 60_000;

type Props = {
  groups: Group[];
  links: TrackedLink[];
  leads: Lead[];
  orders: Order[];
  settings: TenantSettings;
  settingsOk: boolean;
  isConnected: boolean;
  partial: boolean;
  activation: Activation;
  atividade: AtividadeDaCampanha | null;
  onAtualizar: () => void;
  onDismissOnboarding: () => void;
  onOnboardingComplete: () => void;
};

/**
 * Início "Ao vivo" (spec 2026-10-02, mockup F): a sala de controle da loja.
 * PR 1 = a faixa de status; mapa, postando agora e relâmpago entram nos PRs 2–5.
 */
export function InicioAoVivo({
  groups,
  links,
  leads,
  orders,
  settings,
  settingsOk,
  isConnected,
  partial,
  activation,
  atividade,
  onAtualizar,
  onDismissOnboarding,
  onOnboardingComplete,
}: Props) {
  // Sem memo: a hora da faixa e o "atualizado há" andam a cada recarga.
  const agora = new Date();
  useAtivacaoNaCasca({ activation, settings, settingsOk, onOnboardingComplete });
  useRecarga(onAtualizar, RECARGA_MS);
  const mostrarChecklist = settingsOk && settings.onboardingDismissedAt == null && !activation.complete;

  return (
    <div data-testid="inicio-ao-vivo" className="space-y-6 px-4 py-5 lg:px-8 lg:py-6">
      <CelebrationModal groups={groups} leads={leads} monthlyGoal={settings.monthlyGoalContacts} />
      <h1 className="sr-only">Início ao vivo</h1>
      {!isConnected && <BannerDesconectado />}
      {partial && <AvisoParcial />}
      {mostrarChecklist && (
        <div className="lg:hidden">
          <ActivationChecklist activation={activation} onDismiss={onDismissOnboarding} />
        </div>
      )}
      <FaixaDeStatus atividade={atividade} links={links} orders={orders} metaDoMes={settings.monthlyGoalRevenue} agora={agora} />
    </div>
  );
}
```

- [ ] **Step 4: A troca em `page.tsx`**

Em `app/painel/page.tsx`: importar `InicioAoVivo` de `@/components/painel/home/ao-vivo/inicio-ao-vivo`; desestruturar também `atualizar` de `useDashboardData()`; e `atividade` de `data`. Depois do cálculo de `activation`, antes do `return <InicioVitrine …/>`:

```tsx
  // Início "Ao vivo" em construção atrás de ?ao-vivo (spec 2026-10-02). Lido aqui,
  // depois do skeleton: servidor e cliente renderizam o skeleton igual, então ler
  // window.location não quebra a hidratação nem pede fronteira de Suspense.
  if (new URLSearchParams(window.location.search).has("ao-vivo")) {
    return (
      <InicioAoVivo
        groups={groups}
        links={links}
        leads={leads}
        orders={orders}
        settings={settings}
        settingsOk={settingsOk}
        isConnected={isConnected}
        partial={partial}
        activation={activation}
        atividade={atividade}
        onAtualizar={atualizar}
        onDismissOnboarding={dismissOnboarding}
        onOnboardingComplete={markOnboardingComplete}
      />
    );
  }
```

`atualizar` precisa ser estável entre renders, senão `useRecarga` religa o intervalo a cada render: no hook, trocar `atualizar: () => void load(true)` por um `useCallback(() => void load(true), [load])` declarado antes do `return`.

- [ ] **Step 5: Tipos, lint, testes, build**

Run (em `apps/web`): `npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.e2e.json && npm run lint && npm test`
Expected: PASS. (Build de produção fica para o CI: disco C: costuma estourar com `next build` local.)

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/painel/home/ao-vivo apps/web/src/app/painel/page.tsx apps/web/src/components/painel/home/use-dashboard-data.ts
git commit -m "feat(painel): live home shell with status strip behind ?ao-vivo"
```

---

### Task 7: e2e da casca nova

**Files:**
- Create: `apps/web/e2e/painel-inicio-ao-vivo.spec.ts`

**Interfaces:**
- Consumes: `data-testid` `inicio-ao-vivo`, `inicio-faixa`, `painel-skeleton` (existente); o tenant de QA não tem número.

- [ ] **Step 1: Escrever o spec**

```ts
// apps/web/e2e/painel-inicio-ao-vivo.spec.ts
import { expect, test } from "@playwright/test";

/**
 * Início "Ao vivo" (spec 2026-10-02) atrás de ?ao-vivo. O tenant de QA não tem
 * número: a tela abre com o banner de desconectado e os números da loja.
 */

test.describe("Início ao vivo", () => {
  test("abre com a faixa da loja e o número desconectado", async ({ page }) => {
    await page.goto("/painel?ao-vivo", { waitUntil: "load" });
    await expect(page.getByTestId("painel-skeleton")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible();
    const faixa = page.getByTestId("inicio-faixa");
    await expect(faixa.getByText("AO VIVO")).toBeVisible();
    await expect(faixa.getByText("Entraram hoje")).toBeVisible();
    await expect(faixa.getByText("Pedidos anotados hoje")).toBeVisible();
    await expect(page.getByText("Seu WhatsApp está desconectado")).toBeVisible();
  });

  test("nenhum botão ou link em Acid (regra 10)", async ({ page }) => {
    await page.goto("/painel?ao-vivo", { waitUntil: "load" });
    await expect(page.getByTestId("inicio-ao-vivo")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator('button[class*="bg-acid"], a[class*="bg-acid"]')).toHaveCount(0);
  });

  test("sem o parâmetro, continua a Vitrine", async ({ page }) => {
    await page.goto("/painel", { waitUntil: "load" });
    await expect(page.getByTestId("painel-skeleton")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByTestId("inicio-ao-vivo")).toHaveCount(0);
    await expect(page.getByTestId("inicio-caixa")).toBeVisible();
  });
});
```

- [ ] **Step 2: Tipos do e2e**

Run: `npx tsc --noEmit -p tsconfig.e2e.json`
Expected: PASS. O e2e roda no CI (job `e2e`); local, só com `E2E_BASE_URL` de um servidor do worktree — `preview_start` serve o checkout principal, não este.

- [ ] **Step 3: Commit**

```bash
git add apps/web/e2e/painel-inicio-ao-vivo.spec.ts
git commit -m "test(e2e): live home shell behind ?ao-vivo"
```

---

### Task 8: PR, CI, merge e verificação em produção

- [ ] **Step 1: Atualizar com a main e conferir o diff**

```bash
git fetch origin main
git merge origin/main
git diff origin/main...HEAD --stat
```

Expected: ~20 arquivos, todos da tabela de File Structure + a spec e este plano.

- [ ] **Step 2: Push e PR**

`git push -u origin docs/inicio-ao-vivo-spec`, depois `gh pr create --base main` com título `feat(painel): Início ao vivo PR 1 — casca + faixa de status (?ao-vivo)` e corpo com: resumo, a DDL (aplicada pelo Igor nos dois bancos — Task 1 Step 4), plano de teste, `PRs que deixei abertos`, e a linha final `🤖 Generated with [Claude Code](https://claude.com/claude-code)`. Ligar ao PR com `mcp__ccd_pr__get_status` / `bind_pr`.

- [ ] **Step 3: CI verde e merge**

Ler o CI pelo `get_status` (sem polling manual). Falha no passo "Integracao das stores contra o banco de dev" com `function ... does not exist`/cliques errados = a DDL não chegou no dev: cobrar o Step 4 da Task 1. Verde em todos os checks → `gh pr merge <N> --squash --delete-branch`.

- [ ] **Step 4: Verificar em produção**

Logado em `app.girumo.com.br/painel?ao-vivo`, com o pane emulado em 1440×900, 1100×800 e 390×844 (recarregar em 390): a faixa mostra os números de hoje (conferir "Entraram hoje" contra `select count(*) from group_member_events where tenant_id = … and kind = 'join' and occurred_at >= <meia-noite BRT>` em prod), AO VIVO no chip acid, "atualizado há" muda depois de 60 s, auditoria de contraste (`window.__auditar`) sem falha AA na faixa, `/painel` sem o parâmetro igual a antes. Card `painel-inicio-ao-vivo` **continua** `em_construcao` (só vira verificado no PR 7); registrar a evidência do PR 1 no `summary` se útil.
