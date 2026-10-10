# Funil de anúncios — PR 1: banco Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Criar no banco a chave de telefone, as tabelas de cadastro/integração/gasto, as colunas novas do clique e a função `attribution_report`, com o contrato TypeScript do relatório e os testes que provam cada regra.

**Architecture:** Duas migrações idempotentes (tabelas; função de leitura), aplicadas pelo Igor nos dois bancos. A atribuição é calculada na leitura por `public.attribution_report(p_tenant, p_de, p_ate) returns jsonb`, que junta cadastro ↔ contato ↔ pedido pela `phone_key`. O app lê o JSON por um parser zod (`lerRelatorioAnuncios`) que vira o contrato dos PRs de tela.

**Tech Stack:** Postgres (Supabase), SQL/plpgsql, TypeScript, zod 4, `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-10-funil-anuncios-design.md` (§1 regras, §2 dados, §6 bordas, §8 testes)

**Índice da série:** `docs/superpowers/plans/2026-10-10-funil-anuncios-00-indice.md`

## Global Constraints

- Migração nos **dois** bancos: dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`; registrada em `deploy/supabase/apply-order.txt`; `deploy/supabase/schema-baseline.json` regenerado (nunca editado à mão) no mesmo PR.
- **Depois do Postar por grupo PR 1 (#423).** Ele usa `20261010120000_postar_por_grupo.sql` e mexe em `groups`, `campaign_groups`, `broadcasts`, `group_bulk_jobs`; por isso as migrações daqui são `20261010130000`/`20261010130100` e entram **depois** dele no `apply-order.txt`. Antes de começar: #423 mergeado e aplicado em prod, e `git merge origin/main` nesta branch. Regenerar a baseline com a main em dia; senão um PR desfaz a linha do outro (memória "Baseline entre PRs").
- `create … if not exists` / `create or replace`; toda função `security definer` com `set search_path = ''` e nomes qualificados.
- Tabela nova com `tenant_id`: RLS ligado; leitura de `authenticated` só por `app.has_membership(tenant_id)` (já exclui a vendedora); escrita só `service_role`.
- `attribution_report`: `revoke all … from public, anon, authenticated` e `grant execute … to service_role`.
- Janelas: `JANELA_ENTRADA = 7 dias`, `JANELA_VENDA = 90 dias`, ambas inclusivas; fuso `America/Sao_Paulo`; período máximo 400 dias.
- Chave de telefone: DDD + últimos 8 dígitos, depois de tirar não-dígitos, zeros à esquerda e o `55` (quando sobram ≥ 12 dígitos); < 10 dígitos → nula.
- DDL quem aplica é o Igor (o classificador nega `apply_migration`). O implementador **não** roda DDL.
- Testes: `node:test` + `node:assert/strict`, rodados por `tsx --import ./src/test/server-only-shim.mjs --test <arquivo>` dentro de `apps/web`. Teste de integração se pula sozinho sem `E2E_TENANT_ID` ou com `SUPABASE_URL` de prod.
- Commits em inglês com prefixo semântico; código e comentários seguem o padrão do arquivo vizinho (comentários em português).

## Review Focus

- **Telefone do pedido vazio com lead ligado:** o pedido deve casar pelo telefone do lead (`orders.phone = ''`, `lead_id` preenchido). Coberto no teste de integração (pedido O2 da Maria).
- **Borda exata das janelas:** entrada exatamente 7 dias depois e pedido exatamente 90 dias depois contam; 1 minuto a mais não conta. Coberto (Bia, João, Ana).
- **Gasto de campanha sem nenhum cadastro:** aparece como linha de campanha com cadastros 0 e o gasto. Coberto (C9).
- **Mesma pessoa em outra loja:** um cadastro com o mesmo telefone em outra loja nunca entra no relatório. Coberto (loja grande com a chave da Maria).
- **Loja com mais de 1000 contatos:** nada corta em 1000. Coberto (1.500 cadastros e entradas).

---

## Arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/supabase/migrations/20261010130000_funil_anuncios_tabelas.sql` | `phone_key`, `site_integrations`, `site_captures`, `ad_spend`, colunas do clique, índices, RLS |
| `apps/web/supabase/migrations/20261010130100_funil_anuncios_relatorio.sql` | `attribution_report` + privilégios |
| `deploy/supabase/apply-order.txt` | duas entradas novas |
| `deploy/supabase/schema-baseline.json` | regenerado depois da DDL em prod |
| `apps/web/src/lib/resultados/relatorio-anuncios.ts` | tipo + parser zod do JSON do relatório (contrato dos PRs de tela) |
| `apps/web/src/lib/resultados/relatorio-anuncios.test.ts` | parser |
| `apps/web/src/lib/resultados/relatorio-anuncios.integration.test.ts` | regras da §1 contra o banco de dev |

---

### Task 1: Contrato TypeScript do relatório

**Files:**
- Create: `apps/web/src/lib/resultados/relatorio-anuncios.ts`
- Test: `apps/web/src/lib/resultados/relatorio-anuncios.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type NivelLinha = "campanha" | "conjunto" | "anuncio"`
  - `type LinhaRelatorio = { nivel: NivelLinha; campanha: string | null; conjunto: string | null; anuncio: string | null; cadastros: number; foram: number; entraram: number; ja_membros: number; compradores: number; pedidos: number; vendido: number; gasto: number | null }`
  - `type RelatorioAnuncios = { periodo: { de: string; ate: string }; total: { cadastros: number; foram: number; entraram: number; ja_membros: number; compradores: number; pedidos: number; vendido: number; gasto: number }; linhas: LinhaRelatorio[]; por_origem: { origem: string | null; cadastros: number; vendido: number }[]; por_dia: { dia: string; cadastros: number; entraram: number }[]; fora: { entradas_sem_cadastro: number; pedidos_sem_origem: number; vendido_sem_origem: number } }`
  - `function lerRelatorioAnuncios(bruto: unknown): RelatorioAnuncios` — lança `Error("relatorio invalido: …")` se o formato não bate.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/resultados/relatorio-anuncios.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";

import { lerRelatorioAnuncios } from "./relatorio-anuncios";

const VALIDO = {
  periodo: { de: "2026-01-01", ate: "2026-01-31" },
  total: { cadastros: 6, foram: 1, entraram: 3, ja_membros: 1, compradores: 2, pedidos: 3, vendido: 1300, gasto: 190 },
  linhas: [
    { nivel: "campanha", campanha: "C1", conjunto: null, anuncio: null, cadastros: 4, foram: 1, entraram: 2,
      ja_membros: 1, compradores: 1, pedidos: 2, vendido: 1000, gasto: 100 },
    { nivel: "anuncio", campanha: "C1", conjunto: "S1", anuncio: "A1", cadastros: 2, foram: 1, entraram: 2,
      ja_membros: 0, compradores: 1, pedidos: 1, vendido: 600, gasto: null },
  ],
  por_origem: [{ origem: "ig", cadastros: 3, vendido: 900 }, { origem: null, cadastros: 1, vendido: 0 }],
  por_dia: [{ dia: "2026-01-05", cadastros: 1, entraram: 1 }],
  fora: { entradas_sem_cadastro: 2, pedidos_sem_origem: 2, vendido_sem_origem: 120 },
};

test("aceita o JSON que attribution_report devolve", () => {
  const r = lerRelatorioAnuncios(VALIDO);
  assert.equal(r.total.vendido, 1300);
  assert.equal(r.linhas[1].anuncio, "A1");
  assert.equal(r.linhas[0].gasto, 100);
  assert.equal(r.por_origem[1].origem, null);
});

test("recusa nível desconhecido em vez de desenhar linha errada", () => {
  const ruim = { ...VALIDO, linhas: [{ ...VALIDO.linhas[0], nivel: "grupo" }] };
  assert.throws(() => lerRelatorioAnuncios(ruim), /relatorio invalido/);
});

test("recusa número negativo ou texto no lugar de número", () => {
  assert.throws(() => lerRelatorioAnuncios({ ...VALIDO, total: { ...VALIDO.total, cadastros: -1 } }), /relatorio invalido/);
  assert.throws(() => lerRelatorioAnuncios({ ...VALIDO, total: { ...VALIDO.total, vendido: "1300" } }), /relatorio invalido/);
});

test("recusa nulo e lixo", () => {
  assert.throws(() => lerRelatorioAnuncios(null), /relatorio invalido/);
  assert.throws(() => lerRelatorioAnuncios({ periodo: {} }), /relatorio invalido/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (em `apps/web`): `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/relatorio-anuncios.test.ts`
Expected: FAIL — `Cannot find module './relatorio-anuncios'`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/web/src/lib/resultados/relatorio-anuncios.ts
import { z } from "zod";

/**
 * Contrato do JSON de `public.attribution_report` (migração
 * 20261010130100_funil_anuncios_relatorio.sql; spec 2026-10-10-funil-anuncios §2).
 *
 * A tela nunca confia no formato: um campo que mudar no SQL quebra aqui, com
 * mensagem, em vez de virar zero desenhado no funil.
 */

const contagem = z.number().int().nonnegative();
const dinheiro = z.number().nonnegative();
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const linhaSchema = z.object({
  nivel: z.enum(["campanha", "conjunto", "anuncio"]),
  campanha: z.string().nullable(),
  conjunto: z.string().nullable(),
  anuncio: z.string().nullable(),
  cadastros: contagem,
  foram: contagem,
  entraram: contagem,
  ja_membros: contagem,
  compradores: contagem,
  pedidos: contagem,
  vendido: dinheiro,
  gasto: dinheiro.nullable(),
});

const relatorioSchema = z.object({
  periodo: z.object({ de: dia, ate: dia }),
  total: z.object({
    cadastros: contagem,
    foram: contagem,
    entraram: contagem,
    ja_membros: contagem,
    compradores: contagem,
    pedidos: contagem,
    vendido: dinheiro,
    gasto: dinheiro,
  }),
  linhas: z.array(linhaSchema),
  por_origem: z.array(z.object({ origem: z.string().nullable(), cadastros: contagem, vendido: dinheiro })),
  por_dia: z.array(z.object({ dia, cadastros: contagem, entraram: contagem })),
  fora: z.object({
    entradas_sem_cadastro: contagem,
    pedidos_sem_origem: contagem,
    vendido_sem_origem: dinheiro,
  }),
});

export type RelatorioAnuncios = z.infer<typeof relatorioSchema>;
export type LinhaRelatorio = z.infer<typeof linhaSchema>;
export type NivelLinha = LinhaRelatorio["nivel"];

export function lerRelatorioAnuncios(bruto: unknown): RelatorioAnuncios {
  const lido = relatorioSchema.safeParse(bruto);
  if (!lido.success) {
    const primeiro = lido.error.issues[0];
    throw new Error(`relatorio invalido: ${primeiro?.path.join(".") ?? "?"} ${primeiro?.message ?? ""}`.trim());
  }
  return lido.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/relatorio-anuncios.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/resultados/relatorio-anuncios.ts apps/web/src/lib/resultados/relatorio-anuncios.test.ts
git commit -m "feat(resultados): typed contract for the ads attribution report"
```

---

### Task 2: Migração das tabelas (`phone_key`, cadastro, integração, gasto, clique)

**Files:**
- Create: `apps/web/supabase/migrations/20261010130000_funil_anuncios_tabelas.sql`
- Modify: `deploy/supabase/apply-order.txt` (fim do arquivo)

**Interfaces:**
- Consumes: `public.organizations`, `public.tracked_links`, `public.link_click_events`, `public.leads`, `public.orders`, `public.lp_contacts`, `app.has_membership(uuid)`.
- Produces (usados pelos PRs 2 e 4 e pela Task 3):
  - `public.phone_key(text) returns text` (imutável)
  - `public.site_integrations(tenant_id pk, key_hash unique, key_last4, tracked_link_id, created_at, rotated_at, last_used_at)`
  - `public.site_captures(id, tenant_id, whatsapp, phone_key generated, event_id, tracked_link_id, page_url, utm_source, utm_medium, utm_campaign, utm_content, utm_term, fbclid, fbc, fbp, created_at)`, único `(tenant_id, event_id)`
  - `public.ad_spend(id, tenant_id, utm_campaign, starts_on, ends_on, amount, created_by, created_at, updated_at)`
  - `public.link_click_events.capture_id uuid` e `.whatsapp_group_id text`

- [ ] **Step 1: Escrever a migração**

```sql
-- apps/web/supabase/migrations/20261010130000_funil_anuncios_tabelas.sql
-- Funil de anúncios, parte 1: tabelas (docs/superpowers/specs/2026-10-10-funil-anuncios-design.md §2).
--
-- Idempotente. Vai nos DOIS bancos (dev wfjuwogxaupyadwhvoxy, prod
-- nidoatbxaylrkcgbszns) e muda deploy/supabase/schema-baseline.json
-- (f|phone_key, t|site_integrations, t|site_captures, t|ad_spend, t|link_click_events).

-- Chave de telefone: DDD + últimos 8 dígitos. É ela que junta cadastro, contato e
-- pedido apesar do nono dígito (970 dos 1.214 contatos da loja-piloto chegam sem o 9)
-- e do 55 do país. Colisão aceita: fixo XXXX-XXXX e celular 9XXXX-XXXX com os mesmos
-- 8 finais no mesmo DDD.
-- ATENÇÃO: site_captures.phone_key é coluna GERADA com esta função. Mudar o corpo
-- daqui não recalcula as linhas gravadas: exige reescrever a coluna.
create or replace function public.phone_key(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when length(d) >= 10 then left(d, 2) || right(d, 8) end
  from (
    select case when length(x) >= 12 and left(x, 2) = '55' then substr(x, 3) else x end as d
    from (select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^0+', '') as x) a
  ) b
$$;

comment on function public.phone_key(text) is
  'DDD + últimos 8 dígitos do telefone (sem 55, sem nono dígito). Chave da atribuição do funil de anúncios.';

-- Uma integração de site próprio por loja. A chave inteira nunca é guardada: só o
-- sha256 (comparação por igualdade do hash) e os 4 últimos caracteres para a tela.
create table if not exists public.site_integrations (
  tenant_id       uuid primary key references public.organizations(id) on delete cascade,
  key_hash        text not null,
  key_last4       text not null,
  tracked_link_id uuid not null references public.tracked_links(id) on delete restrict,
  created_at      timestamptz not null default now(),
  rotated_at      timestamptz,
  last_used_at    timestamptz,
  constraint site_integrations_key_hash_unique unique (key_hash),
  constraint site_integrations_key_hash_formato check (key_hash ~ '^[0-9a-f]{64}$')
);

comment on table public.site_integrations is
  'Chave do site próprio do lojista (POST /api/integracoes/cadastro). Só o hash; trocar a chave desliga a anterior.';

-- Cadastro vindo do site próprio. phone_key gerada: a junção usa o índice abaixo.
create table if not exists public.site_captures (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.organizations(id) on delete cascade,
  whatsapp        text not null,
  phone_key       text generated always as (public.phone_key(whatsapp)) stored,
  event_id        text not null,
  tracked_link_id uuid references public.tracked_links(id) on delete set null,
  page_url        text,
  utm_source      text,
  utm_medium      text,
  utm_campaign    text,
  utm_content     text,
  utm_term        text,
  fbclid          text,
  fbc             text,
  fbp             text,
  created_at      timestamptz not null default now(),
  -- O site reenvia o mesmo event_id no segundo toque: não pode virar dois cadastros.
  constraint site_captures_tenant_event_unique unique (tenant_id, event_id)
);

comment on table public.site_captures is
  'Cadastro (WhatsApp + UTMs) enviado pelo site próprio do lojista. Origem do funil de anúncios; nunca guarda IP nem user-agent.';

create index if not exists site_captures_tenant_key_idx
  on public.site_captures (tenant_id, phone_key, created_at desc);
create index if not exists site_captures_tenant_created_idx
  on public.site_captures (tenant_id, created_at);

-- Gasto de anúncio lançado à mão, por campanha (utm_campaign exato).
create table if not exists public.ad_spend (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.organizations(id) on delete cascade,
  utm_campaign text not null,
  starts_on    date not null,
  ends_on      date not null,
  amount       numeric(12, 2) not null,
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ad_spend_campanha_tamanho check (char_length(utm_campaign) between 1 and 200),
  constraint ad_spend_periodo check (ends_on >= starts_on),
  constraint ad_spend_valor check (amount > 0 and amount <= 10000000)
);

create index if not exists ad_spend_tenant_idx on public.ad_spend (tenant_id, starts_on);

-- O clique passa a saber qual cadastro o trouxe (?cid=) e para qual grupo foi.
-- whatsapp_group_id é o que resolveClickTarget devolve em groupId (ex.: 1203...@g.us).
alter table public.link_click_events
  add column if not exists capture_id uuid references public.site_captures(id) on delete set null,
  add column if not exists whatsapp_group_id text;

create index if not exists link_click_events_capture_idx
  on public.link_click_events (capture_id) where capture_id is not null;

-- Junção pela chave nas tabelas que já existem.
create index if not exists leads_tenant_phone_key_idx
  on public.leads (tenant_id, public.phone_key(phone));
create index if not exists orders_tenant_phone_key_idx
  on public.orders (tenant_id, public.phone_key(phone));
create index if not exists lp_contacts_tenant_phone_key_idx
  on public.lp_contacts (tenant_id, public.phone_key(whatsapp));

-- RLS como segunda linha: quem grava e lê é o servidor (service-role), com o tenant explícito.
alter table public.site_integrations enable row level security;
alter table public.site_captures enable row level security;
alter table public.ad_spend enable row level security;

-- site_integrations: SEM policy, de propósito. O hash da chave não tem por que sair do
-- servidor, nem para o dono. Não "destravar" com using (true): ler isto pelo JWT é bug.
revoke all on public.site_integrations from authenticated;

drop policy if exists "site_captures_tenant_read" on public.site_captures;
create policy "site_captures_tenant_read" on public.site_captures
  for select using (app.has_membership(tenant_id));
revoke insert, update, delete, truncate on public.site_captures from authenticated;

drop policy if exists "ad_spend_tenant_read" on public.ad_spend;
create policy "ad_spend_tenant_read" on public.ad_spend
  for select using (app.has_membership(tenant_id));
revoke insert, update, delete, truncate on public.ad_spend from authenticated;

-- O event trigger ensure_anon_revoked já tira anon de tabela e função novas; explícito
-- para não depender dele estar aplicado no banco.
revoke all on public.site_integrations, public.site_captures, public.ad_spend from anon;
```

- [ ] **Step 2: Registrar no apply-order**

Acrescentar ao fim de `deploy/supabase/apply-order.txt`:

```
# 2026-10-10 - Funil de anuncios (spec 2026-10-10-funil-anuncios), parte 1: phone_key,
# site_integrations, site_captures, ad_spend, link_click_events.capture_id/whatsapp_group_id,
# indices por phone_key em leads/orders/lp_contacts. Muda a baseline.
apps/web/supabase/migrations/20261010130000_funil_anuncios_tabelas.sql
```

- [ ] **Step 3: Conferir a sintaxe sem aplicar**

Ler a migração de novo procurando: parêntese aberto, vírgula sobrando antes de `constraint`, nome de tabela sem `public.`. **Não aplicar** — DDL é do Igor (Task 4).

- [ ] **Step 4: Commit**

```bash
git add apps/web/supabase/migrations/20261010130000_funil_anuncios_tabelas.sql deploy/supabase/apply-order.txt
git commit -m "feat(db): phone_key, site captures, site integration, ad spend tables"
```

---

### Task 3: `attribution_report` + teste de integração das regras

**Files:**
- Create: `apps/web/supabase/migrations/20261010130100_funil_anuncios_relatorio.sql`
- Modify: `deploy/supabase/apply-order.txt` (fim do arquivo)
- Test: `apps/web/src/lib/resultados/relatorio-anuncios.integration.test.ts`

**Interfaces:**
- Consumes: tabelas da Task 2; `lerRelatorioAnuncios` da Task 1.
- Produces: `public.attribution_report(p_tenant uuid, p_de date, p_ate date) returns jsonb` no formato de `RelatorioAnuncios`. Erros: `raise exception 'periodo invalido…'` / `'loja inexistente'` com `errcode 22023`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/resultados/relatorio-anuncios.integration.test.ts
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { lerRelatorioAnuncios, type LinhaRelatorio, type RelatorioAnuncios } from "./relatorio-anuncios";

/**
 * `attribution_report` contra o Supabase de DEV, em duas lojas descartáveis
 * criadas aqui e apagadas no fim. Cada caso da spec §1 tem uma pessoa:
 *
 * - Maria (6299911111): cadastro m1 pelo A1, entra 5 min depois SEM o nono dígito,
 *   compra R$ 600 (pedido com telefone); cadastra de novo pelo A2 já sendo membro
 *   e compra R$ 400 num pedido SEM telefone, só com lead_id.
 * - Bia: entra exatamente 7 dias depois do cadastro → conta.
 * - João: entra 7 dias e 1 minuto depois → não conta (vai para "fora").
 * - Ana: compra exatamente 90 dias depois → conta; 90 dias e 1 minuto → "fora".
 * - Sem UTM: cadastro sem parâmetros vai para a linha campanha null.
 * - Contato sem telefone e pedido sem telefone nem lead → "fora".
 * - Gasto: C1 R$ 100 de 01 a 10/01 (proporcional) e C9 R$ 90 sem nenhum cadastro.
 * - Loja grande: 1.500 cadastros + 1.500 entradas, e um cadastro com o telefone da
 *   Maria na campanha C1 que NUNCA pode aparecer no relatório da primeira loja.
 */

const LIGADO = Boolean(process.env.E2E_TENANT_ID);
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);
const LOTE = 1500;

let loja = "";
let lojaGrande = "";

function pular(): boolean {
  if (EM_PRODUCAO) {
    console.log("SUPABASE_URL é de produção — teste de integração pulado");
    return true;
  }
  if (!LIGADO) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

async function inserir(tabela: string, linhas: Record<string, unknown>[]): Promise<{ id: string }[]> {
  const { data, error } = await getSupabaseAdmin().from(tabela).insert(linhas).select("id");
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return data as { id: string }[];
}

async function relatorio(tenant: string, de: string, ate: string): Promise<RelatorioAnuncios> {
  const { data, error } = await getSupabaseAdmin().rpc("attribution_report", { p_tenant: tenant, p_de: de, p_ate: ate });
  if (error) throw new Error(error.message);
  return lerRelatorioAnuncios(data);
}

function linha(r: RelatorioAnuncios, nivel: LinhaRelatorio["nivel"], campanha: string | null, conjunto: string | null = null, anuncio: string | null = null): LinhaRelatorio {
  const achada = r.linhas.find(
    (l) => l.nivel === nivel && l.campanha === campanha && l.conjunto === conjunto && l.anuncio === anuncio,
  );
  assert.ok(achada, `linha ${nivel} ${campanha}/${conjunto}/${anuncio} não veio`);
  return achada;
}

function cadastro(tenant: string, evento: string, whatsapp: string, quando: string, utm: { origem?: string; campanha?: string; conjunto?: string; anuncio?: string }) {
  return {
    tenant_id: tenant,
    event_id: `${evento}-${RUN}`,
    whatsapp,
    created_at: quando,
    utm_source: utm.origem ?? null,
    utm_campaign: utm.campanha ?? null,
    utm_term: utm.conjunto ?? null,
    utm_content: utm.anuncio ?? null,
  };
}

before(async () => {
  if (pular()) return;
  const [org1, org2] = await inserir("organizations", [
    { name: `attrtest ${RUN}`, slug: `attrtest-${RUN}` },
    { name: `attrtest grande ${RUN}`, slug: `attrtest-grande-${RUN}` },
  ]);
  loja = org1.id;
  lojaGrande = org2.id;

  const [link] = await inserir("tracked_links", [
    { tenant_id: loja, slug: `attrtest-${RUN}`, target_url: "https://chat.whatsapp.com/teste" },
  ]);

  const [m1, , , , , ] = await inserir("site_captures", [
    cadastro(loja, "m1", "+5562999911111", "2026-01-05T10:00:00-03:00", { origem: "ig", campanha: "C1", conjunto: "S1", anuncio: "A1" }),
    cadastro(loja, "m2", "+5562999911111", "2026-01-24T09:00:00-03:00", { origem: "fb", campanha: "C1", conjunto: "S1", anuncio: "A2" }),
    cadastro(loja, "b1", "+5562988882222", "2026-01-06T12:00:00-03:00", { origem: "ig", campanha: "C1", conjunto: "S1", anuncio: "A1" }),
    cadastro(loja, "j1", "+5562977773333", "2026-01-07T12:00:00-03:00", { origem: "fb", campanha: "C1", conjunto: "S2", anuncio: "A3" }),
    cadastro(loja, "a1", "+5511966664444", "2026-01-08T12:00:00-03:00", { origem: "ig", campanha: "C2" }),
    cadastro(loja, "s1", "+5562955555555", "2026-01-09T12:00:00-03:00", {}),
  ]);
  // insert(...).select("id") devolve na ordem do envio: m1 é o primeiro.
  await inserir("link_click_events", [{ tenant_id: loja, tracked_link_id: link.id, capture_id: m1.id }]);

  const [l1] = await inserir("leads", [
    { tenant_id: loja, phone: "556299911111", entered_at: "2026-01-05T10:05:00-03:00" },
    { tenant_id: loja, phone: "5562988882222", entered_at: "2026-01-13T12:00:00-03:00" },
    { tenant_id: loja, phone: "5562977773333", entered_at: "2026-01-14T12:01:00-03:00" },
    { tenant_id: loja, phone: "5511966664444", entered_at: "2026-01-08T12:30:00-03:00" },
    { tenant_id: loja, phone: null, entered_at: "2026-01-10T12:00:00-03:00" },
  ]);

  await inserir("orders", [
    { tenant_id: loja, phone: "556299911111", lead_id: l1.id, value: 600, created_at: "2026-01-14T15:00:00-03:00" },
    { tenant_id: loja, phone: "", lead_id: l1.id, value: 400, created_at: "2026-01-26T11:00:00-03:00" },
    { tenant_id: loja, phone: "5511966664444", value: 300, created_at: "2026-04-08T12:00:00-03:00" },
    { tenant_id: loja, phone: "5511966664444", value: 50, created_at: "2026-04-08T12:01:00-03:00" },
    { tenant_id: loja, phone: "", value: 70, created_at: "2026-01-11T12:00:00-03:00" },
  ]);

  await inserir("ad_spend", [
    { tenant_id: loja, utm_campaign: "C1", starts_on: "2026-01-01", ends_on: "2026-01-10", amount: 100 },
    { tenant_id: loja, utm_campaign: "C9", starts_on: "2026-01-01", ends_on: "2026-01-31", amount: 90 },
  ]);

  // Loja grande: a chave da Maria na campanha C1 (isolamento) + 1.500 pessoas.
  const base = Date.parse("2026-02-01T10:00:00-03:00");
  const capturas = [cadastro(lojaGrande, "intrusa", "+5562999911111", "2026-01-05T09:00:00-03:00", { campanha: "C1" })];
  const entradas: Record<string, unknown>[] = [];
  for (let i = 0; i < LOTE; i++) {
    const numero = `629${String(i).padStart(8, "0")}`;
    capturas.push(cadastro(lojaGrande, `g${i}`, `+55${numero}`, new Date(base + i * 1000).toISOString(), { campanha: "CX" }));
    entradas.push({ tenant_id: lojaGrande, phone: `55${numero}`, entered_at: new Date(base + i * 1000 + 60_000).toISOString() });
  }
  await inserir("site_captures", capturas);
  await inserir("leads", entradas);
});

after(async () => {
  if (pular()) return;
  // organizations leva o resto junto (on delete cascade).
  const falhas: string[] = [];
  for (const id of [loja, lojaGrande].filter(Boolean)) {
    const { error } = await getSupabaseAdmin().from("organizations").delete().eq("id", id);
    if (error) falhas.push(`${id}: ${error.message}`);
  }
  if (falhas.length) throw new Error(`limpeza incompleta:\n${falhas.join("\n")}`);
});

test("regras da §1: crédito, janelas, já era membro, sem UTM, gasto e fora", { skip: pular() }, async () => {
  const r = await relatorio(loja, "2026-01-01", "2026-04-30");

  assert.deepEqual(r.total, {
    cadastros: 6, foram: 1, entraram: 3, ja_membros: 1,
    compradores: 2, pedidos: 3, vendido: 1300, gasto: 190,
  });

  const c1 = linha(r, "campanha", "C1");
  assert.deepEqual(
    [c1.cadastros, c1.foram, c1.entraram, c1.ja_membros, c1.compradores, c1.pedidos, c1.vendido, c1.gasto],
    [4, 1, 2, 1, 1, 2, 1000, 100],
  );

  const a1 = linha(r, "anuncio", "C1", "S1", "A1");
  assert.deepEqual([a1.cadastros, a1.foram, a1.entraram, a1.pedidos, a1.vendido, a1.gasto], [2, 1, 2, 1, 600, null]);

  const a2 = linha(r, "anuncio", "C1", "S1", "A2");
  assert.deepEqual([a2.cadastros, a2.entraram, a2.ja_membros, a2.compradores, a2.vendido], [1, 0, 1, 1, 400]);

  const s2 = linha(r, "conjunto", "C1", "S2");
  assert.deepEqual([s2.cadastros, s2.entraram], [1, 0]);

  const c2 = linha(r, "campanha", "C2");
  assert.deepEqual([c2.cadastros, c2.entraram, c2.pedidos, c2.vendido], [1, 1, 1, 300]);

  const semUtm = linha(r, "campanha", null);
  assert.equal(semUtm.cadastros, 1);

  const c9 = linha(r, "campanha", "C9");
  assert.deepEqual([c9.cadastros, c9.gasto], [0, 90]);

  assert.deepEqual(r.fora, { entradas_sem_cadastro: 2, pedidos_sem_origem: 2, vendido_sem_origem: 120 });

  const ig = r.por_origem.find((o) => o.origem === "ig");
  assert.deepEqual([ig?.cadastros, ig?.vendido], [3, 900]);
});

test("gasto entra proporcional aos dias do período", { skip: pular() }, async () => {
  const r = await relatorio(loja, "2026-01-06", "2026-01-31");
  assert.equal(linha(r, "campanha", "C1").gasto, 50);
  assert.equal(linha(r, "campanha", "C9").gasto, 75.48);
});

test("loja grande: nada corta em 1000 e a outra loja nunca vaza", { skip: pular() }, async () => {
  const grande = await relatorio(lojaGrande, "2026-02-01", "2026-02-28");
  const cx = linha(grande, "campanha", "CX");
  assert.deepEqual([cx.cadastros, cx.entraram], [LOTE, LOTE]);

  const pequena = await relatorio(loja, "2026-01-01", "2026-04-30");
  assert.equal(linha(pequena, "campanha", "C1").cadastros, 4);
});

test("período inválido vira erro com mensagem", { skip: pular() }, async () => {
  const { error } = await getSupabaseAdmin().rpc("attribution_report", { p_tenant: loja, p_de: "2026-02-01", p_ate: "2026-01-01" });
  assert.match(error?.message ?? "", /periodo invalido/);
  const longo = await getSupabaseAdmin().rpc("attribution_report", { p_tenant: loja, p_de: "2025-01-01", p_ate: "2026-04-30" });
  assert.match(longo.error?.message ?? "", /periodo invalido/);
});
```

- [ ] **Step 2: Run test to verify it skips locally**

Run (em `apps/web`): `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/relatorio-anuncios.integration.test.ts`
Expected: os 4 testes `skipped` com "E2E_TENANT_ID ausente". (Ele falha de verdade no job e2e do CI enquanto a função não existir no dev.)

- [ ] **Step 3: Escrever a função**

```sql
-- apps/web/supabase/migrations/20261010130100_funil_anuncios_relatorio.sql
-- Funil de anúncios, parte 2: o relatório (spec 2026-10-10-funil-anuncios §1–§2).
--
-- Idempotente. Vai nos DOIS bancos e muda deploy/supabase/schema-baseline.json
-- (f|attribution_report). Depende de 20261010130000_funil_anuncios_tabelas.sql.
--
-- Regra única: vale o último cadastro da pessoa (phone_key) antes do evento —
-- entrada até 7 dias antes, pedido até 90 dias antes, as duas bordas inclusivas.
-- O período escolhe os CADASTROS (coorte); "fora" conta pela data do evento.

create or replace function public.attribution_report(p_tenant uuid, p_de date, p_ate date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  janela_entrada constant interval := interval '7 days';
  janela_venda constant interval := interval '90 days';
  fuso constant text := 'America/Sao_Paulo';
  v_ini timestamptz;
  v_fim timestamptz;
  v_resultado jsonb;
begin
  if p_tenant is null or p_de is null or p_ate is null or p_de > p_ate then
    raise exception 'periodo invalido' using errcode = '22023';
  end if;
  if p_ate - p_de > 400 then
    raise exception 'periodo invalido: mais de 400 dias' using errcode = '22023';
  end if;
  if not exists (select 1 from public.organizations o where o.id = p_tenant) then
    raise exception 'loja inexistente' using errcode = '22023';
  end if;

  v_ini := p_de::timestamp at time zone fuso;
  v_fim := (p_ate + 1)::timestamp at time zone fuso;

  with
  -- Todos os cadastros da loja (o crédito olha para trás, então não só os do período).
  cadastros as (
    select s.id, s.phone_key as chave, s.created_at,
           nullif(btrim(s.utm_source), '') as origem,
           nullif(btrim(s.utm_campaign), '') as campanha,
           nullif(btrim(s.utm_term), '') as conjunto,
           nullif(btrim(s.utm_content), '') as anuncio
      from public.site_captures s
     where s.tenant_id = p_tenant and s.phone_key is not null
    union all
    select c.id, public.phone_key(k.whatsapp), c.created_at,
           nullif(btrim(c.utm_source), ''), nullif(btrim(c.utm_campaign), ''),
           nullif(btrim(c.utm_term), ''), nullif(btrim(c.utm_content), '')
      from public.lp_captures c
      join public.lp_contacts k on k.id = c.contact_id and k.tenant_id = p_tenant
     where c.tenant_id = p_tenant and public.phone_key(k.whatsapp) is not null
  ),
  coorte as (
    select * from cadastros where created_at >= v_ini and created_at < v_fim
  ),
  entradas as (
    select l.id, public.phone_key(l.phone) as chave, l.entered_at
      from public.leads l
     where l.tenant_id = p_tenant
  ),
  entrada_credito as (
    select distinct on (e.id) e.id as lead_id, e.entered_at, c.id as cadastro_id
      from entradas e
      join cadastros c
        on c.chave = e.chave
       and c.created_at <= e.entered_at
       and c.created_at >= e.entered_at - janela_entrada
     order by e.id, c.created_at desc, c.id desc
  ),
  pedidos as (
    select o.id, o.value, o.created_at,
           public.phone_key(coalesce(nullif(btrim(o.phone), ''), l.phone)) as chave
      from public.orders o
      left join public.leads l on l.id = o.lead_id and l.tenant_id = p_tenant
     where o.tenant_id = p_tenant
  ),
  pedido_credito as (
    select distinct on (p.id) p.id as pedido_id, c.id as cadastro_id
      from pedidos p
      join cadastros c
        on c.chave = p.chave
       and c.created_at <= p.created_at
       and c.created_at >= p.created_at - janela_venda
     order by p.id, c.created_at desc, c.id desc
  ),
  cliques as (
    select distinct ev.capture_id
      from public.link_click_events ev
     where ev.tenant_id = p_tenant and ev.capture_id is not null
  ),
  entradas_por_cadastro as (
    select ec.cadastro_id, count(*) as n from entrada_credito ec group by ec.cadastro_id
  ),
  primeira_entrada as (
    select e.chave, min(e.entered_at) as entered_at
      from entradas e where e.chave is not null group by e.chave
  ),
  por_cadastro as (
    select k.id, k.chave, k.origem, k.campanha, k.conjunto, k.anuncio, k.created_at,
           (cl.capture_id is not null) as foi,
           coalesce(epc.n, 0) as entrou,
           (pe.entered_at is not null and pe.entered_at < k.created_at) as ja_membro
      from coorte k
      left join cliques cl on cl.capture_id = k.id
      left join entradas_por_cadastro epc on epc.cadastro_id = k.id
      left join primeira_entrada pe on pe.chave = k.chave
  ),
  vendas as (
    select p.id, p.value, p.chave, k.origem, k.campanha, k.conjunto, k.anuncio
      from pedido_credito pc
      join pedidos p on p.id = pc.pedido_id
      join coorte k on k.id = pc.cadastro_id
  ),
  cad_niveis as (
    select 'campanha'::text as nivel, campanha, null::text as conjunto, null::text as anuncio,
           count(*) as cadastros, count(*) filter (where foi) as foram,
           coalesce(sum(entrou), 0) as entraram, count(*) filter (where ja_membro) as ja_membros
      from por_cadastro group by campanha
    union all
    select 'conjunto', campanha, conjunto, null,
           count(*), count(*) filter (where foi), coalesce(sum(entrou), 0), count(*) filter (where ja_membro)
      from por_cadastro group by campanha, conjunto
    union all
    select 'anuncio', campanha, conjunto, anuncio,
           count(*), count(*) filter (where foi), coalesce(sum(entrou), 0), count(*) filter (where ja_membro)
      from por_cadastro group by campanha, conjunto, anuncio
  ),
  venda_niveis as (
    select 'campanha'::text as nivel, campanha, null::text as conjunto, null::text as anuncio,
           count(distinct chave) as compradores, count(*) as pedidos, coalesce(sum(value), 0) as vendido
      from vendas group by campanha
    union all
    select 'conjunto', campanha, conjunto, null, count(distinct chave), count(*), coalesce(sum(value), 0)
      from vendas group by campanha, conjunto
    union all
    select 'anuncio', campanha, conjunto, anuncio, count(distinct chave), count(*), coalesce(sum(value), 0)
      from vendas group by campanha, conjunto, anuncio
  ),
  -- Lançamento de 30 dias num período que pega 7 deles entra como valor × 7/30.
  gasto as (
    select g.utm_campaign as campanha,
           round(sum(g.amount
             * ((least(g.ends_on, p_ate) - greatest(g.starts_on, p_de) + 1)::numeric
                / (g.ends_on - g.starts_on + 1))), 2) as valor
      from public.ad_spend g
     where g.tenant_id = p_tenant and g.starts_on <= p_ate and g.ends_on >= p_de
     group by g.utm_campaign
  ),
  linhas as (
    select c.nivel, c.campanha, c.conjunto, c.anuncio,
           c.cadastros, c.foram, c.entraram, c.ja_membros,
           coalesce(v.compradores, 0) as compradores,
           coalesce(v.pedidos, 0) as pedidos,
           coalesce(v.vendido, 0) as vendido,
           case when c.nivel = 'campanha' then g.valor end as gasto
      from cad_niveis c
      left join venda_niveis v
        on v.nivel = c.nivel
       and v.campanha is not distinct from c.campanha
       and v.conjunto is not distinct from c.conjunto
       and v.anuncio is not distinct from c.anuncio
      left join gasto g on c.nivel = 'campanha' and g.campanha = c.campanha
    union all
    -- Campanha com gasto e nenhum cadastro no período: aparece só com o gasto.
    select 'campanha', g.campanha, null, null, 0, 0, 0, 0, 0, 0, 0, g.valor
      from gasto g
     where not exists (select 1 from coorte k where k.campanha = g.campanha)
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('de', p_de, 'ate', p_ate),
    'total', (
      select jsonb_build_object(
        'cadastros', count(*),
        'foram', count(*) filter (where pc.foi),
        'entraram', coalesce(sum(pc.entrou), 0),
        'ja_membros', count(*) filter (where pc.ja_membro),
        'compradores', (select count(distinct v.chave) from vendas v),
        'pedidos', (select count(*) from vendas v),
        'vendido', (select coalesce(sum(v.value), 0) from vendas v),
        'gasto', (select coalesce(sum(g.valor), 0) from gasto g)
      )
      from por_cadastro pc
    ),
    'linhas', coalesce((
      select jsonb_agg(to_jsonb(l) order by l.campanha nulls last, l.conjunto nulls first, l.anuncio nulls first)
        from linhas l
    ), '[]'::jsonb),
    'por_origem', coalesce((
      select jsonb_agg(jsonb_build_object('origem', o.origem, 'cadastros', o.cadastros, 'vendido', o.vendido)
                       order by o.cadastros desc, o.origem nulls last)
        from (
          select pc.origem, count(*) as cadastros,
                 coalesce((select sum(v.value) from vendas v where v.origem is not distinct from pc.origem), 0) as vendido
            from por_cadastro pc group by pc.origem
        ) o
    ), '[]'::jsonb),
    'por_dia', coalesce((
      select jsonb_agg(jsonb_build_object('dia', d.dia, 'cadastros', d.cadastros, 'entraram', d.entraram) order by d.dia)
        from (
          select g.dia::date as dia,
                 (select count(*) from por_cadastro pc
                   where (pc.created_at at time zone fuso)::date = g.dia::date) as cadastros,
                 (select count(*) from entrada_credito ec join coorte k on k.id = ec.cadastro_id
                   where (ec.entered_at at time zone fuso)::date = g.dia::date) as entraram
            from generate_series(p_de::timestamp, p_ate::timestamp, interval '1 day') as g(dia)
        ) d
    ), '[]'::jsonb),
    'fora', jsonb_build_object(
      'entradas_sem_cadastro', (
        select count(*) from entradas e
         where e.entered_at >= v_ini and e.entered_at < v_fim
           and not exists (select 1 from entrada_credito ec where ec.lead_id = e.id)
      ),
      'pedidos_sem_origem', (
        select count(*) from pedidos p
         where p.created_at >= v_ini and p.created_at < v_fim
           and not exists (select 1 from pedido_credito pc where pc.pedido_id = p.id)
      ),
      'vendido_sem_origem', (
        select coalesce(sum(p.value), 0) from pedidos p
         where p.created_at >= v_ini and p.created_at < v_fim
           and not exists (select 1 from pedido_credito pc where pc.pedido_id = p.id)
      )
    )
  )
  into v_resultado;

  return v_resultado;
end;
$$;

comment on function public.attribution_report(uuid, date, date) is
  'Funil de anúncios (cadastro → grupo → entrada → pedido) por campanha/conjunto/anúncio. Só service_role; a rota passa o tenant do contexto.';

-- Função nova nasce executável por authenticated (default privilege do Supabase):
-- revogar explícito. Só o servidor chama, com o tenant da sessão.
revoke all on function public.attribution_report(uuid, date, date) from public, anon, authenticated;
grant execute on function public.attribution_report(uuid, date, date) to service_role;
```

- [ ] **Step 4: Registrar no apply-order**

Acrescentar ao fim de `deploy/supabase/apply-order.txt`:

```
# 2026-10-10 - Funil de anuncios, parte 2: attribution_report (so service_role).
# Depende da parte 1. Muda a baseline (f|attribution_report).
apps/web/supabase/migrations/20261010130100_funil_anuncios_relatorio.sql
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/supabase/migrations/20261010130100_funil_anuncios_relatorio.sql deploy/supabase/apply-order.txt apps/web/src/lib/resultados/relatorio-anuncios.integration.test.ts
git commit -m "feat(db): attribution_report for the ads funnel, with integration tests"
```

---

### Task 4: Aplicar nos dois bancos, baseline, advisor e privilégio (Igor)

**Files:**
- Modify: `deploy/supabase/schema-baseline.json` (regenerado)

**Interfaces:**
- Consumes: as duas migrações.
- Produces: objetos vivos em dev e prod; baseline nova.

- [ ] **Step 1: PEÇA AO IGOR para aplicar nos dois bancos** (DDL em prod é dele). PowerShell, numa pasta vazia fora do repositório (`$w`) e com `$repo` = a raiz do worktree desta branch:

```powershell
$w = "C:\Users\Igor\sb-tmp"; New-Item -ItemType Directory -Force $w | Out-Null
$repo = "<raiz do worktree desta branch>"
npx supabase --workdir $w link --project-ref wfjuwogxaupyadwhvoxy --yes
npx supabase --workdir $w db query --linked -f "$repo\apps\web\supabase\migrations\20261010130000_funil_anuncios_tabelas.sql"
npx supabase --workdir $w db query --linked -f "$repo\apps\web\supabase\migrations\20261010130100_funil_anuncios_relatorio.sql"
npx supabase --workdir $w link --project-ref nidoatbxaylrkcgbszns --yes
npx supabase --workdir $w db query --linked -f "$repo\apps\web\supabase\migrations\20261010130000_funil_anuncios_tabelas.sql"
npx supabase --workdir $w db query --linked -f "$repo\apps\web\supabase\migrations\20261010130100_funil_anuncios_relatorio.sql"
```

- [ ] **Step 2: Regenerar a baseline** — com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` **de produção** no ambiente, na raiz do repositório: `npm run schema:baseline`. `deploy/supabase/schema-baseline.json` muda; entra neste PR.

- [ ] **Step 3: Conferir privilégio e chave nos DOIS bancos** (leitura; `db query --linked` com cada `link`):

```sql
select
  has_function_privilege('authenticated', 'public.attribution_report(uuid,date,date)', 'execute') as authenticated_executa,
  has_function_privilege('anon', 'public.attribution_report(uuid,date,date)', 'execute') as anon_executa,
  has_function_privilege('service_role', 'public.attribution_report(uuid,date,date)', 'execute') as service_executa,
  public.phone_key('+55 (62) 99999-8888') as k1,
  public.phone_key('556299998888') as k2,
  public.phone_key('062 99999-8888') as k3,
  public.phone_key('9999-8888') as k_curta,
  (select count(*) from pg_policies where tablename = 'site_integrations') as policies_integracao,
  has_table_privilege('authenticated', 'public.site_integrations', 'select') as authenticated_le_chave;
```

Expected nos dois: `false, false, true, '6299998888', '6299998888', '6299998888', null, 0, false`.

- [ ] **Step 4: Advisor de segurança nos dois bancos**

```powershell
npx supabase --workdir $w link --project-ref wfjuwogxaupyadwhvoxy --yes
npx supabase --workdir $w db advisors --linked --type security --output-format json
npx supabase --workdir $w link --project-ref nidoatbxaylrkcgbszns --yes
npx supabase --workdir $w db advisors --linked --type security --output-format json
```

Expected: nenhum achado novo citando `site_captures`, `site_integrations`, `ad_spend`, `phone_key` ou `attribution_report`. Achado novo → corrigir a migração (não acrescentar em `advisors-allowlist.json`).

- [ ] **Step 5: Rodar o teste de integração** com as credenciais de dev (`E2E_TENANT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` de **dev**), em `apps/web`:

Run: `npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/resultados/relatorio-anuncios.integration.test.ts`
Expected: PASS (4 testes). Sem as credenciais na máquina, o job e2e do CI roda e confirma.

- [ ] **Step 6: Commit**

```bash
git add deploy/supabase/schema-baseline.json
git commit -m "chore(schema): baseline with the ads funnel tables and report"
```

---

### Task 5: Verificação final e PR

- [ ] **Step 1:** Em `apps/web`: `npm run lint` e `npx tsc --noEmit` (os dois; lint não checa tipo). Na raiz: `npm run check:drift` se tiver credencial de dev; senão o job `drift` do CI confere.
- [ ] **Step 2:** `npm test` em `apps/web` — tudo verde; os integration tests aparecem como pulados localmente.
- [ ] **Step 3:** Push e PR "feat(db): ads funnel tables and attribution_report (funil de anúncios, PR 1)". No corpo: migração **já aplicada nos dois bancos**, baseline regenerada, saída do Step 3 da Task 4, advisor limpo. Terminar com `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- [ ] **Step 4:** Card do quadro em prod (o Igor roda): `select public.move_card('funil-anuncios', 'em_construcao', 'PR 1 do banco mergeado: tabelas e attribution_report nos dois bancos', 'PR #<n>');` — se o card não existir, criar com o mesmo padrão do `board-g2.sql` (INSERT em `board_features` com `key = 'funil-anuncios'`) antes do `move_card`.
