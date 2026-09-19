# Comunidade nativa do WhatsApp — leitura e disparo pelo Avisos (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o Girumo enxergar as comunidades nativas do WhatsApp que já existem no número do lojista, e oferecer um disparo único pelo grupo de Avisos no lugar de N envios.

**Architecture:** Nenhuma chamada nova à Evolution e nenhum fork. O `fetchAllGroups` que o sync já faz devolve `linkedParent`, `isCommunity` e `isCommunityAnnounce` — hoje descartados porque `EvolutionGroup` declara só 6 campos. Duas colunas em `groups` guardam o vínculo, uma reconciliação espelha cada comunidade nativa numa linha de `campaign_groups`, e a tela `/painel/comunidades` que já existe passa a mostrá-las.

**Tech Stack:** Next.js 15 (App Router), TypeScript strict, Supabase (service-role + `.eq("tenant_id")`), `node:test` via `tsx`, Tailwind com namespace `pn-*`.

**Spec:** `docs/superpowers/specs/2026-09-17-comunidade-nativa-leitura-design.md`

## Global Constraints

- **Isolamento multi-tenant:** toda query em tabela com `tenant_id` leva `.eq("tenant_id", ...)` explícito. O service-role bypassa RLS — esse filtro é a proteção real, nunca o RLS.
- **Dois bancos:** toda migração vai em dev `wfjuwogxaupyadwhvoxy` **e** prod `nidoatbxaylrkcgbszns`. Aplicar só em um cria drift silencioso, e as rotas dual-mode caem no fallback JSON sem erro.
- **`apps/web/supabase/migrations/` não é o schema.** A fonte de verdade da ordem é `deploy/supabase/apply-order.txt`. Antes de criar migração, conferir por SQL se o objeto já existe.
- **TypeScript strict, sem `any` sem justificativa.** Imports com alias `@/`.
- **Arquivos:** 200-400 linhas típico, 800 máximo. Lógica pura vai em `apps/web/src/lib/communities/`, acesso a banco em `apps/web/src/lib/stores/`.
- **Testes:** `node:test` + `node:assert/strict`, arquivo `*.test.ts` ao lado da lógica. Nomes de teste descrevem comportamento, sem acento.
- **Commits em inglês**, prefixo semântico (`feat:`, `fix:`, `refactor:`, `docs:`).
- **Nada de `git add -A`** — dois checkouts compartilham a pasta. Sempre nomear os arquivos, e conferir `git diff --cached` numa chamada separada antes de commitar.

---

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `apps/web/src/lib/communities/papel.ts` | **novo.** Função pura: dado o metadata de um grupo, devolve `{communityJid, communityRole}` |
| `apps/web/src/lib/communities/papel.test.ts` | **novo.** Testes da classificação |
| `apps/web/src/lib/communities/reconciliar.ts` | **novo.** Função pura: dada a lista de grupos classificados, devolve as comunidades nativas a espelhar |
| `apps/web/src/lib/communities/reconciliar.test.ts` | **novo.** Testes da reconciliação |
| `apps/web/supabase/migrations/20260917<hhmm>_groups_community.sql` | **novo.** As duas colunas |
| `deploy/supabase/apply-order.txt` | **modificar.** Registrar a migração |
| `deploy/supabase/schema-baseline.json` | **modificar.** Regravar o baseline |
| `apps/web/src/lib/evolution/client.ts` | **modificar.** `EvolutionGroup` ganha os 3 campos |
| `apps/web/src/lib/stores/groups.ts` | **modificar.** `syncGroupsFromProvider` aceita e grava as 2 colunas |
| `apps/web/src/app/api/groups/sync/route.ts` | **modificar.** Classifica cada grupo e chama a reconciliação |
| `apps/web/src/lib/stores/communities.ts` | **modificar.** `espelharComunidadesNativas` |
| `apps/web/src/components/painel/comunidades/comunidade-card.tsx` | **modificar.** Selo, alcance, botões |

---

### Task 1: Classificar o papel de um grupo na comunidade

Função pura, sem banco e sem rede. É a peça que traduz o que a Evolution devolve para as duas colunas.

**Files:**
- Create: `apps/web/src/lib/communities/papel.ts`
- Test: `apps/web/src/lib/communities/papel.test.ts`

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: `classificarPapel(g: GrupoComunidadeRef): VinculoComunidade`, os tipos `PapelComunidade = "parent" | "announce" | "member"`, `GrupoComunidadeRef = { id, isCommunity?, isCommunityAnnounce?, linkedParent? }` e `VinculoComunidade = { communityJid: string | null; communityRole: PapelComunidade | null }`. Tasks 3 e 4 dependem desses nomes.

- [ ] **Step 1: Write the failing test**

Criar `apps/web/src/lib/communities/papel.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { classificarPapel } from "./papel";

test("grupo pai da comunidade aponta para si mesmo", () => {
  const r = classificarPapel({ id: "120363314352216368@g.us", isCommunity: true });
  assert.deepEqual(r, { communityJid: "120363314352216368@g.us", communityRole: "parent" });
});

test("grupo de avisos aponta para o pai", () => {
  const r = classificarPapel({
    id: "120363317004683243@g.us",
    isCommunityAnnounce: true,
    linkedParent: "120363314352216368@g.us",
  });
  assert.deepEqual(r, { communityJid: "120363314352216368@g.us", communityRole: "announce" });
});

test("grupo filho comum vira member", () => {
  const r = classificarPapel({
    id: "120363047246515568@g.us",
    linkedParent: "120363314352216368@g.us",
  });
  assert.deepEqual(r, { communityJid: "120363314352216368@g.us", communityRole: "member" });
});

test("grupo fora de comunidade nao tem vinculo", () => {
  const r = classificarPapel({ id: "1@g.us" });
  assert.deepEqual(r, { communityJid: null, communityRole: null });
});

test("linkedParent em branco conta como sem vinculo", () => {
  const r = classificarPapel({ id: "1@g.us", linkedParent: "   " });
  assert.deepEqual(r, { communityJid: null, communityRole: null });
});

test("linkedParent nulo conta como sem vinculo", () => {
  const r = classificarPapel({ id: "1@g.us", linkedParent: null });
  assert.deepEqual(r, { communityJid: null, communityRole: null });
});

test("isCommunity vence mesmo se vier linkedParent junto", () => {
  const r = classificarPapel({ id: "pai@g.us", isCommunity: true, linkedParent: "outro@g.us" });
  assert.deepEqual(r, { communityJid: "pai@g.us", communityRole: "parent" });
});

test("marcado como avisos sem pai nao vira announce solto", () => {
  const r = classificarPapel({ id: "1@g.us", isCommunityAnnounce: true });
  assert.deepEqual(r, { communityJid: null, communityRole: null });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/communities/papel.test.ts
```

Expected: FAIL — `Cannot find module './papel'`.

- [ ] **Step 3: Write minimal implementation**

Criar `apps/web/src/lib/communities/papel.ts`:

```ts
/**
 * Papel de um grupo dentro de uma comunidade nativa do WhatsApp.
 *
 * A Evolution 2.3.7 repassa os campos do `GroupMetadata` do Baileys sem
 * filtrar — medido em 17/09/2026 contra produção, ver
 * `docs/superpowers/specs/2026-09-17-comunidade-nativa-leitura-design.md` §2.1.
 * O grupo-pai traz `isCommunity`, o de Avisos traz `isCommunityAnnounce`, e
 * todo filho traz `linkedParent` com o JID do pai.
 */
export type PapelComunidade = "parent" | "announce" | "member";

export type GrupoComunidadeRef = {
  id: string;
  isCommunity?: boolean;
  isCommunityAnnounce?: boolean;
  linkedParent?: string | null;
};

export type VinculoComunidade = {
  communityJid: string | null;
  communityRole: PapelComunidade | null;
};

const SEM_VINCULO: VinculoComunidade = { communityJid: null, communityRole: null };

export function classificarPapel(g: GrupoComunidadeRef): VinculoComunidade {
  // O pai é testado primeiro porque ele não tem `linkedParent`: ele É o parent.
  if (g.isCommunity) return { communityJid: g.id, communityRole: "parent" };

  // Sem pai declarado não há comunidade, nem que o grupo se diga Avisos. Um
  // "announce" órfão seria um vínculo apontando para lugar nenhum.
  const pai = g.linkedParent?.trim();
  if (!pai) return SEM_VINCULO;

  return { communityJid: pai, communityRole: g.isCommunityAnnounce ? "announce" : "member" };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/communities/papel.test.ts
```

Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/communities/papel.ts apps/web/src/lib/communities/papel.test.ts
git diff --cached --stat
git commit -m "feat(community): classify a group's role inside a native community"
```

---

### Task 2: Migração das duas colunas, nos dois bancos

**Files:**
- Create: `apps/web/supabase/migrations/20260917<hhmm>_groups_community.sql`
- Modify: `deploy/supabase/apply-order.txt`
- Modify: `deploy/supabase/schema-baseline.json`

**Interfaces:**
- Consumes: nada
- Produces: `public.groups.community_jid text` e `public.groups.community_role text`. Task 3 grava nelas.

- [ ] **Step 1: Confirmar que as colunas ainda não existem, nos DOIS bancos**

O diretório de migrações não é retrato do schema — conferir por SQL antes de criar.

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'groups'
  and column_name in ('community_jid', 'community_role');
```

Expected: zero linhas em dev e em prod. Se vier alguma, **parar** e reavaliar — outra branch pode ter aplicado.

- [ ] **Step 2: Escrever a migração**

Criar o arquivo com o timestamp real do momento (`20260917<hhmm>_groups_community.sql`):

```sql
-- Vinculo do grupo com a comunidade nativa do WhatsApp.
-- A Evolution ja devolve esses dados no fetchAllGroups; ate agora eram
-- descartados. Ver docs/superpowers/specs/2026-09-17-comunidade-nativa-leitura-design.md
alter table public.groups
  add column if not exists community_jid  text,
  add column if not exists community_role text;

comment on column public.groups.community_jid is
  'JID da comunidade nativa a que este grupo pertence. Para o proprio grupo-pai, o seu id. NULL = fora de comunidade.';

comment on column public.groups.community_role is
  'parent | announce | member | NULL. Papel do grupo dentro da comunidade nativa.';

-- A consulta quente e "grupos desta comunidade" e "qual o Avisos dela".
create index if not exists groups_community_jid_idx
  on public.groups (tenant_id, community_jid)
  where community_jid is not null;
```

- [ ] **Step 3: Aplicar em dev e conferir**

Aplicar no banco dev (`wfjuwogxaupyadwhvoxy`), depois rodar a consulta do Step 1 nele.

Expected: duas linhas — `community_jid` e `community_role`.

- [ ] **Step 4: Aplicar em prod e conferir**

Aplicar no banco prod (`nidoatbxaylrkcgbszns`) e repetir a consulta.

Expected: duas linhas. Se dev e prod divergirem aqui, o gate de drift do CI fica vermelho para todo mundo.

- [ ] **Step 5: Registrar na ordem de aplicação e regravar o baseline**

Acrescentar o nome do arquivo ao fim de `deploy/supabase/apply-order.txt` e regravar `deploy/supabase/schema-baseline.json` pelo procedimento já usado no repositório (a assinatura vem da RPC `schema_signature()`).

- [ ] **Step 6: Commit**

```bash
git add apps/web/supabase/migrations/20260917*_groups_community.sql deploy/supabase/apply-order.txt deploy/supabase/schema-baseline.json
git diff --cached --stat
git commit -m "feat(db): add community_jid and community_role to groups"
```

---

### Task 3: O sync passa a gravar o vínculo

**Files:**
- Modify: `apps/web/src/lib/evolution/client.ts` (tipo `EvolutionGroup`, ~linha 238)
- Modify: `apps/web/src/lib/stores/groups.ts` (`syncGroupsFromProvider`, ~linha 116)
- Modify: `apps/web/src/app/api/groups/sync/route.ts` (o `rows`, ~linha 116)

**Interfaces:**
- Consumes: `classificarPapel` da Task 1; as colunas da Task 2
- Produces: `groups.community_jid` / `groups.community_role` preenchidos a cada sync. Tasks 4-6 leem isso.

- [ ] **Step 1: Ampliar `EvolutionGroup`**

Em `apps/web/src/lib/evolution/client.ts`, no tipo `EvolutionGroup`, acrescentar depois de `ownerPn`:

```ts
  /**
   * Campos de comunidade nativa. A Evolution 2.3.7 os repassa do
   * `GroupMetadata` do Baileys sem filtrar (medido em 17/09/2026) — o dado já
   * chegava aqui e era descartado porque o tipo não o declarava.
   */
  isCommunity?: boolean;
  isCommunityAnnounce?: boolean;
  linkedParent?: string | null;
```

- [ ] **Step 2: Ampliar `syncGroupsFromProvider`**

Em `apps/web/src/lib/stores/groups.ts`, acrescentar ao tipo do parâmetro `groups`, depois de `admins_counted_at: string;`:

```ts
    community_jid: string | null;
    community_role: string | null;
```

O corpo da função não muda — ele já faz `{ ...g, tenant_id: tenantId }` e o upsert leva os campos novos junto.

- [ ] **Step 3: Classificar no sync**

Em `apps/web/src/app/api/groups/sync/route.ts`, acrescentar ao import de comunidades:

```ts
import { classificarPapel } from "@/lib/communities/papel";
```

E dentro do `gruposAdmin.map((g) => { ... })`, antes do `return`:

```ts
      const vinculo = classificarPapel({
        id: String(g.id),
        isCommunity: g.isCommunity,
        isCommunityAnnounce: g.isCommunityAnnounce,
        linkedParent: g.linkedParent,
      });
```

E no objeto retornado, depois de `admins_counted_at: countedAt,`:

```ts
        community_jid: vinculo.communityJid,
        community_role: vinculo.communityRole,
```

- [ ] **Step 4: Verificar que o tipo fecha**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```

Expected: sem erro. `lint` e `tsx --test` **não** checam tipo — o `tsc` é o único gate real aqui.

- [ ] **Step 5: Verificar contra a Evolution real que `getParticipants=true` também traz os campos**

O spike de 17/09 mediu com `getParticipants=false`; o sync usa `true`. É a única suposição não medida deste plano.

Rodar um sync no tenant `9888373f-e57b-44cb-9cf6-2d8944783150` pelo painel e conferir:

```sql
select community_role, count(*)
from groups
where tenant_id = '9888373f-e57b-44cb-9cf6-2d8944783150'
group by community_role order by 2 desc;
```

Expected: pelo menos 8 linhas `member`, 1 `announce` e 1 `parent` (os grupos vinculados em 17/09). Se vier tudo `null`, a Evolution filtra os campos quando `getParticipants=true` — **parar e reportar**, o desenho precisa mudar para uma segunda chamada com `false`.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/evolution/client.ts apps/web/src/lib/stores/groups.ts apps/web/src/app/api/groups/sync/route.ts
git diff --cached --stat
git commit -m "feat(community): persist native community link on group sync"
```

---

### Task 4: Reduzir grupos classificados a comunidades nativas

Função pura. É ela que decide **quais** comunidades viram gaveta — incluindo o filtro que esconde as comunidades de terceiros.

**Files:**
- Create: `apps/web/src/lib/communities/reconciliar.ts`
- Test: `apps/web/src/lib/communities/reconciliar.test.ts`

**Interfaces:**
- Consumes: `PapelComunidade` da Task 1
- Produces: `comunidadesNativas(grupos: GrupoClassificado[]): ComunidadeNativa[]`, com `GrupoClassificado = { whatsappGroupId, nome, isAdmin, communityJid, communityRole }` e `ComunidadeNativa = { communityJid, nome, avisoGroupId, memberGroupIds }`. Task 5 consome.

- [ ] **Step 1: Write the failing test**

Criar `apps/web/src/lib/communities/reconciliar.test.ts`:

```ts
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { comunidadesNativas } from "./reconciliar";

const pai = {
  whatsappGroupId: "pai@g.us",
  nome: "Mega stock atacado infantil #1",
  isAdmin: true,
  communityJid: "pai@g.us",
  communityRole: "parent" as const,
};
const avisos = {
  whatsappGroupId: "avisos@g.us",
  nome: "Mega stock atacado infantil #1",
  isAdmin: true,
  communityJid: "pai@g.us",
  communityRole: "announce" as const,
};
const filho = (id: string) => ({
  whatsappGroupId: id,
  nome: `Mega Stock Atacado ${id}`,
  isAdmin: true,
  communityJid: "pai@g.us",
  communityRole: "member" as const,
});

test("junta pai avisos e membros numa comunidade", () => {
  const r = comunidadesNativas([pai, avisos, filho("104"), filho("105")]);
  assert.equal(r.length, 1);
  assert.equal(r[0].communityJid, "pai@g.us");
  assert.equal(r[0].nome, "Mega stock atacado infantil #1");
  assert.equal(r[0].avisoGroupId, "avisos@g.us");
  assert.deepEqual(r[0].memberGroupIds, ["104", "105"]);
});

test("comunidade sem nenhum grupo admin fica de fora", () => {
  const alheio = { ...filho("x"), isAdmin: false, communityJid: "gla@g.us" };
  const alheioPai = { ...pai, whatsappGroupId: "gla@g.us", communityJid: "gla@g.us", isAdmin: false };
  assert.deepEqual(comunidadesNativas([alheioPai, alheio]), []);
});

test("basta um grupo admin para a comunidade entrar", () => {
  const paiNaoAdmin = { ...pai, isAdmin: false };
  const r = comunidadesNativas([paiNaoAdmin, filho("104")]);
  assert.equal(r.length, 1);
  assert.deepEqual(r[0].memberGroupIds, ["104"]);
});

test("sem grupo pai o nome vem do avisos", () => {
  const r = comunidadesNativas([avisos, filho("104")]);
  assert.equal(r.length, 1);
  assert.equal(r[0].nome, "Mega stock atacado infantil #1");
});

test("comunidade sem avisos devolve avisoGroupId nulo", () => {
  const r = comunidadesNativas([pai, filho("104")]);
  assert.equal(r[0].avisoGroupId, null);
});

test("grupos fora de comunidade nao geram nada", () => {
  const solto = {
    whatsappGroupId: "1@g.us",
    nome: "Solto",
    isAdmin: true,
    communityJid: null,
    communityRole: null,
  };
  assert.deepEqual(comunidadesNativas([solto]), []);
});

test("duas comunidades saem separadas", () => {
  const outroPai = { ...pai, whatsappGroupId: "pai2@g.us", communityJid: "pai2@g.us", nome: "#2" };
  const r = comunidadesNativas([pai, filho("104"), outroPai]);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((c) => c.communityJid).sort(), ["pai2@g.us", "pai@g.us"]);
});

test("o pai nao entra na lista de membros", () => {
  const r = comunidadesNativas([pai, avisos, filho("104")]);
  assert.ok(!r[0].memberGroupIds.includes("pai@g.us"));
  assert.ok(!r[0].memberGroupIds.includes("avisos@g.us"));
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd apps/web && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/communities/reconciliar.test.ts
```

Expected: FAIL — `Cannot find module './reconciliar'`.

- [ ] **Step 3: Write minimal implementation**

Criar `apps/web/src/lib/communities/reconciliar.ts`:

```ts
import type { PapelComunidade } from "./papel";

export type GrupoClassificado = {
  whatsappGroupId: string;
  nome: string;
  isAdmin: boolean;
  communityJid: string | null;
  communityRole: PapelComunidade | null;
};

export type ComunidadeNativa = {
  communityJid: string;
  nome: string;
  /** O grupo onde o disparo único acontece. NULL quando não achamos o Avisos. */
  avisoGroupId: string | null;
  /** Só os filhos comuns — o pai e o Avisos ficam de fora. */
  memberGroupIds: string[];
};

/**
 * Agrupa grupos já classificados nas comunidades nativas que o tenant
 * realmente administra.
 *
 * O filtro de admin não é cosmético: o número principal é membro de 14
 * comunidades, a maioria de terceiros (GLA, TINTIM, CPA CHINÊS…). Sem ele a
 * tela do lojista encheria de comunidade alheia que ele não controla.
 */
export function comunidadesNativas(grupos: GrupoClassificado[]): ComunidadeNativa[] {
  const porJid = new Map<string, GrupoClassificado[]>();
  for (const g of grupos) {
    if (!g.communityJid || !g.communityRole) continue;
    const atual = porJid.get(g.communityJid);
    if (atual) atual.push(g);
    else porJid.set(g.communityJid, [g]);
  }

  const saida: ComunidadeNativa[] = [];
  for (const [communityJid, doJid] of porJid) {
    if (!doJid.some((g) => g.isAdmin)) continue;

    const pai = doJid.find((g) => g.communityRole === "parent");
    const aviso = doJid.find((g) => g.communityRole === "announce");
    saida.push({
      communityJid,
      nome: (pai ?? aviso ?? doJid[0]).nome,
      avisoGroupId: aviso?.whatsappGroupId ?? null,
      memberGroupIds: doJid
        .filter((g) => g.communityRole === "member")
        .map((g) => g.whatsappGroupId),
    });
  }
  return saida;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd apps/web && npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/communities/reconciliar.test.ts
```

Expected: PASS, 8 testes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/communities/reconciliar.ts apps/web/src/lib/communities/reconciliar.test.ts
git diff --cached --stat
git commit -m "feat(community): reduce classified groups into owned native communities"
```

---

### Task 5: Espelhar a comunidade nativa numa gaveta

**Files:**
- Modify: `apps/web/src/lib/stores/communities.ts`
- Modify: `apps/web/src/app/api/groups/sync/route.ts`

**Interfaces:**
- Consumes: `comunidadesNativas` da Task 4; `groups.community_*` da Task 3
- Produces: `espelharComunidadesNativas(tenantId: string): Promise<number>` — devolve quantas gavetas foram criadas ou atualizadas. Task 6 lê o resultado pela tela.

- [ ] **Step 1: Escrever a função no store**

Em `apps/web/src/lib/stores/communities.ts`, no fim do arquivo:

```ts
/**
 * Espelha em `campaign_groups` cada comunidade nativa que o tenant administra.
 *
 * A gaveta espelho é um retrato do WhatsApp, não uma coleção editável: quem
 * manda é `linkedParent`, e o próximo sync sobrescreve `group_ids`. Por isso a
 * tela desabilita vincular/desvincular quando `whatsapp_community_jid` existe
 * (spec §3.4) — desvincular aqui não desvincularia lá.
 */
export async function espelharComunidadesNativas(tenantId: string): Promise<number> {
  const { tenantId: tid } = montarQueryComunidades(tenantId);

  const { data: linhas, error: erroGrupos } = await getSupabaseAdmin()
    .from("groups")
    .select("whatsapp_group_id, name, is_admin, community_jid, community_role")
    .eq("tenant_id", tid)
    .not("community_jid", "is", null);
  if (erroGrupos) throw new Error(erroGrupos.message);

  const nativas = comunidadesNativas(
    (linhas ?? []).map((l) => ({
      whatsappGroupId: l.whatsapp_group_id as string,
      nome: (l.name as string) ?? "",
      isAdmin: Boolean(l.is_admin),
      communityJid: l.community_jid as string | null,
      communityRole: l.community_role as PapelComunidade | null,
    })),
  );
  if (nativas.length === 0) return 0;

  const { data: existentes, error: erroGavetas } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id, slug, whatsapp_community_jid")
    .eq("tenant_id", tid)
    .not("whatsapp_community_jid", "is", null);
  if (erroGavetas) throw new Error(erroGavetas.message);

  const porJid = new Map<string, { id: string }>();
  for (const g of existentes ?? []) {
    porJid.set(g.whatsapp_community_jid as string, { id: g.id as string });
  }

  let tocadas = 0;
  for (const nativa of nativas) {
    const ja = porJid.get(nativa.communityJid);
    if (ja) {
      const { error } = await getSupabaseAdmin()
        .from(TABLE)
        .update({ name: nativa.nome, group_ids: nativa.memberGroupIds })
        .eq("tenant_id", tid)
        .eq("id", ja.id);
      if (error) throw new Error(error.message);
    } else {
      // Assinatura: uniqueMasterSlug(name, takenInTenant, fallback) — mesma
      // ordem que `criarComunidade` usa logo acima neste arquivo.
      const slugsEmUso = new Set((await listarComunidades(tid)).map((c) => c.slug));
      const slug = await uniqueMasterSlug(nativa.nome, slugsEmUso, "comunidade");

      const { data, error } = await getSupabaseAdmin()
        .from(TABLE)
        .insert({
          tenant_id: tid,
          name: nativa.nome,
          slug,
          group_ids: nativa.memberGroupIds,
          // `auto_grow: false` não é detalhe: o worker do auto-grow escreve em
          // `group_ids` pela RPC atômica, e esta função regrava o array
          // inteiro. Espelho do WhatsApp e auto-grow na mesma linha seriam
          // lost update garantido.
          auto_grow: false,
          whatsapp_community_jid: nativa.communityJid,
        })
        .select(ROW_FIELDS)
        .single();
      if (error) throw new Error(error.message);

      // Sem link mestre a rota /c/[slug] da Fase 5 não resolve esta coleção.
      const criada = mapRow(data as ComunidadeRow);
      await criarLinkMestreOuDesfazer(tid, {
        id: criada.id,
        slug: criada.slug,
        name: criada.nome,
      });
    }
    tocadas += 1;
  }
  return tocadas;
}
```

E no topo do arquivo, acrescentar aos imports:

```ts
import { comunidadesNativas } from "@/lib/communities/reconciliar";
import type { PapelComunidade } from "@/lib/communities/papel";
```

- [ ] **Step 2: Chamar no sync, fora do caminho crítico**

Em `apps/web/src/app/api/groups/sync/route.ts`, dentro do `after(async () => { ... })` que já existe (o da Fase 3), acrescentar ao final do corpo:

```ts
      try {
        await espelharComunidadesNativas(ctx.tenantId);
      } catch (e) {
        // Espelhar comunidade é enriquecimento; falhar aqui não pode derrubar
        // um sync que o lojista veio fazer por outro motivo.
        console.error("[groups/sync] falha ao espelhar comunidades nativas:", e);
      }
```

E no import de comunidades no topo:

```ts
import { espelharComunidadesNativas } from "@/lib/stores/communities";
```

- [ ] **Step 3: Verificar que o tipo fecha**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
```

Expected: sem erro.

- [ ] **Step 4: Verificar contra o banco real**

Rodar um sync no tenant `9888373f-e57b-44cb-9cf6-2d8944783150` e conferir:

```sql
select name, whatsapp_community_jid, array_length(group_ids, 1) as grupos
from campaign_groups
where tenant_id = '9888373f-e57b-44cb-9cf6-2d8944783150'
  and whatsapp_community_jid is not null;
```

Expected: uma linha `Mega stock atacado infantil #1` com `whatsapp_community_jid = 120363314352216368@g.us` e `grupos = 8`. As comunidades de terceiros (GLA, TINTIM…) **não** podem aparecer.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/communities.ts apps/web/src/app/api/groups/sync/route.ts
git diff --cached --stat
git commit -m "feat(community): mirror owned native communities into campaign_groups"
```

---

### Task 6: A tela conta a verdade sobre a comunidade nativa

**Files:**
- Modify: `apps/web/src/components/painel/comunidades/comunidade-card.tsx`
- Modify: `apps/web/src/app/api/comunidades/route.ts` (devolver alcance e Avisos)
- Modify: `apps/web/src/app/api/comunidades/[slug]/grupos/route.ts` (recusar escrita em gaveta nativa)

**Interfaces:**
- Consumes: `whatsappCommunityJid` já existente em `Comunidade`; `groups.community_role` da Task 3
- Produces: o tipo `Comunidade` ganha três campos, e `/api/comunidades` passa a
  devolvê-los. A Task 7 depende deles pelos nomes exatos:

```ts
  /** Grupo de Avisos da comunidade nativa. NULL quando a gaveta é só da Girumo. */
  avisoGroupId: string | null;
  /** `members` do Avisos: a comunidade inteira, já deduplicada pelo WhatsApp. */
  alcanceAvisos: number | null;
  /** Só admin escreve em grupo `announce`. Sem isso, o disparo falha no clique. */
  avisoIsAdmin: boolean;
```

Os três saem de uma consulta a `groups` filtrando
`community_jid = <o jid da gaveta> and community_role = 'announce'`, sempre com
`.eq("tenant_id", ...)`.

- [ ] **Step 1: Ler o componente antes de editar**

```bash
cd apps/web && sed -n '1,80p' src/components/painel/comunidades/comunidade-card.tsx
```

Anotar como o card recebe os dados hoje e onde ficam os botões de vincular/desvincular.

- [ ] **Step 2: Fechar a porta no servidor primeiro**

Em `apps/web/src/app/api/comunidades/[slug]/grupos/route.ts`, antes de chamar `vincularGrupo` e antes de `desvincularGrupo`, recusar quando a gaveta espelha uma comunidade nativa:

```ts
    const alvo = (await listarComunidades(ctx.tenantId)).find((c) => c.slug === slug);
    if (alvo?.whatsappCommunityJid) {
      return Response.json(
        { error: "Esta comunidade é do WhatsApp. Vincule ou desvincule grupos pelo aplicativo." },
        { status: 409 },
      );
    }
```

Botão desabilitado é aparência; a barreira real é esta. Sem ela, um POST direto desincroniza a gaveta do WhatsApp até o próximo sync.

- [ ] **Step 3: Marcar o card**

No `comunidade-card.tsx`, quando `whatsappCommunityJid` não for nulo:

- renderizar um selo com o texto **"nativa do WhatsApp"**, usando as classes `pn-*` já presentes no arquivo para chips/selos;
- passar `disabled` aos botões de vincular e desvincular, com `title="Gerencie os grupos desta comunidade pelo WhatsApp"`;
- exibir o alcance com o rótulo **"alcance"** e o número vindo do grupo de Avisos.

O alcance sai de `groups.members` da linha cujo `community_role = 'announce'` e `community_jid` é o da gaveta — é a contagem da comunidade inteira, já deduplicada pelo WhatsApp (spec §2.6). Quando não houver Avisos, mostrar **"alcance não medido"** em vez de somar `members` dos filhos, que contaria a mesma pessoa várias vezes.

- [ ] **Step 4: Tirar pai e Avisos da lista de grupos de envio**

Onde `/painel/grupos` e os seletores de disparo montam a lista de grupos, excluir as linhas com `community_role in ('parent','announce')`.

O motivo está medido: o pai tem **1 membro** (disparar nele não faz nada e o lojista acha que enviou) e o Avisos tem **1.984** (disparar nele alcança a comunidade inteira sem aviso na tela). Localizar os consumidores antes de editar:

```bash
cd apps/web && grep -rn "listGroups\|listarGrupos" src/app/api/groups src/lib/stores/groups.ts | head
```

- [ ] **Step 5: Verificar tipo, lint e testes**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
cd apps/web && npm run lint
cd apps/web && npm test
```

Expected: os três limpos.

- [ ] **Step 6: Verificar na tela, com prova**

Subir o app, abrir `/painel/comunidades` e confirmar: a `Mega stock atacado infantil #1` aparece com selo "nativa do WhatsApp", 8 grupos, alcance lido do Avisos, e os botões de vincular/desvincular desabilitados. Tirar captura — mergeado não é verificado.

- [ ] **Step 7: Commit**

```bash
git add apps/web/src/components/painel/comunidades/comunidade-card.tsx apps/web/src/app/api/comunidades/route.ts "apps/web/src/app/api/comunidades/[slug]/grupos/route.ts"
git diff --cached --stat
git commit -m "feat(community): show native community as read-only with real reach"
```

---

### Task 7: Disparo único pelo grupo de Avisos

**Files:**
- Modify: `apps/web/src/components/painel/messages/messages-tab.tsx`
- Modify: `apps/web/src/app/painel/comunidades/[slug]/page.tsx`

**Interfaces:**
- Consumes: `community_role = 'announce'` da Task 3; o alcance da Task 6
- Produces: nada que outra task consuma

**O backend já está pronto.** A Fase 4 (PR #296) renderiza
`<MessagesTab campaignSlug={comunidade.slug} groupIds={comunidade.groupIds} />`, e o
`MessagesTab` manda `groupIds` no corpo do POST para
`/api/campanhas/[slug]/messages`. Essa rota já sobrepõe os grupos da campanha quando o
corpo traz a lista:

```ts
const groupIds = Array.isArray(body.groupIds) && body.groupIds.length > 0
  ? body.groupIds.map(String)
  : camp.groupIds;
```

Disparar pelo Avisos é, portanto, **mandar `[avisoGroupId]` em vez da lista de
filhos**. Não há rota nova, nem no Girumo nem na Evolution.

- [ ] **Step 1: Levar o Avisos até a tela**

Em `apps/web/src/app/painel/comunidades/[slug]/page.tsx`, a `MessagesTab` já recebe
`groupIds`. Acrescentar duas props novas, vindas da `Comunidade` carregada:

```tsx
<MessagesTab
  campaignSlug={comunidade.slug}
  groupIds={comunidade.groupIds}
  avisoGroupId={comunidade.avisoGroupId}
  alcanceAvisos={comunidade.alcanceAvisos}
/>
```

`avisoGroupId` e `alcanceAvisos` saem da rota `/api/comunidades` ampliada na Task 6.
Quando a comunidade não for nativa, ambas vêm `null` e nada muda na tela.

- [ ] **Step 2: Oferecer as duas opções**

Quando a comunidade tem `avisoGroupId`, a tela de disparo apresenta duas escolhas, com o alcance de cada uma ao lado:

- **"Enviar pelo Avisos (1 envio)"** — alcance = `members` do Avisos
- **"Enviar grupo a grupo (N envios)"** — alcance = soma dos `members` dos filhos, rotulada como **"soma dos grupos, pode contar a mesma pessoa mais de uma vez"**

Nenhuma das duas é padrão silencioso. A escolha é do lojista: o Avisos economiza 91 envios contra os caps de 120/h e 800/dia, mas só alcança quem entrou na comunidade.

- [ ] **Step 3: Enviar com a lista certa**

No `messages-tab.tsx`, nos dois lugares que hoje mandam `groupIds` no corpo (linhas ~63
e ~95), mandar `[avisoGroupId]` quando a opção do Avisos estiver escolhida, e
`groupIds` quando não estiver. Uma variável só, calculada uma vez:

```ts
const alvos = usarAvisos && avisoGroupId ? [avisoGroupId] : groupIds;
```

⚠️ O Avisos tem `announce: true`: **só admin escreve**. Antes de oferecer a opção,
conferir `is_admin` na linha do Avisos (vem junto com `avisoGroupId` da Task 6) e, se
for falso, mostrar a opção desabilitada com a razão — em vez de deixar a Evolution
devolver erro cru depois do clique.

- [ ] **Step 4: Verificar tipo, lint e testes**

```bash
cd apps/web && npx tsc --noEmit -p tsconfig.json
cd apps/web && npm run lint
cd apps/web && npm test
```

- [ ] **Step 5: Prova em produção**

Disparar uma mensagem real pelo Avisos da `Mega stock atacado infantil #1` e confirmar que ela chegou. Mergeado não é verificado; rodando em produção não é verificado; verificado é ter olhado e visto chegar.

- [ ] **Step 6: Commit**

```bash
git diff --cached --stat
git commit -m "feat(community): offer a single send through the Announcements group"
```

---

## Fechamento

- [ ] **Rodar o gate local antes de pushar**

```bash
pwsh -File verify-local.ps1
```

É o que o CI roda — cobre scan de secrets e build, que `lint` e `tsx --test` não pegam.

- [ ] **Atualizar o quadro de features** em produção, com prova colhida na hora:

```sql
select public.move_card('<key>', 'no_ar_verificado', '<motivo>', '<PR #N>');
```

- [ ] **Abrir e fechar o PR na mesma sessão** — revisar, CI verde, mergear, deletar branch. Draft não é estacionamento.

## Fora deste plano

- **`group_participants` vazio no tenant principal.** A Fase 3 (PR #297) não tem dado nesse tenant, então a sugestão de cobertura provavelmente mostra zero. Bug separado, card próprio.
- **Desligar a infra `prova-comunidade`** no Coolify. Com o fork cancelado ela não tem uso, mas desligar é decisão do Igor.
