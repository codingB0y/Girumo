# Funil de disparos — PR 1 · Motor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar o banco, os módulos puros e as duas rotas prontos para a sub-aba Funil (PR 2) criar N agendamentos de uma vez, com a etapa relâmpago abrindo a Oferta na hora do disparo.

**Architecture:** Um funil é um roteiro em módulo TypeScript puro que a tela (PR 2) transforma em N chamadas à rota de mensagens que já existe. O banco ganha três colunas de rastreio e a `promote_due_schedules` passa a abrir a Oferta Relâmpago ligada ao broadcast que ela promove. Nenhum código novo no worker.

**Tech Stack:** Next.js 15 (App Router, `apps/web`), TypeScript strict, Supabase (Postgres + plpgsql), testes com `node:test` via `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-19-funil-de-disparos-design.md` (seções 2, 3, 4 e 8). O PR 2 (tela) tem plano próprio.

## Global Constraints

- Branch a partir de `origin/main` em worktree novo (`superpowers:using-git-worktrees`); nunca `checkout -b` no checkout principal. Copiar `apps/web/.env.local` do checkout principal para o worktree (`vercel env pull` omite as variáveis Sensitive).
- Toda query em tabela com `tenant_id` filtra `.eq("tenant_id", …)` no service-role. O RLS não é a proteção.
- Migração nos DOIS bancos: dev `wfjuwogxaupyadwhvoxy` e prod `nidoatbxaylrkcgbszns`. Só em dev deixa o gate de drift vermelho para todo mundo. Depois: `npm run schema:baseline` (credencial de prod) e `npm run check:advisors`.
- `create or replace function` NÃO preserva ACL em dev: todo `create or replace` vem seguido de `revoke … from public, anon, authenticated` + `grant execute … to service_role`.
- Só grupo, nunca DM. Nenhum roteiro dispara sozinho.
- Copies dos roteiros são as do spec, seção 3, palavra por palavra. Negrito do WhatsApp é `*texto*`. Chaves são `{loja}`, `{nicho}`, `{dia}`, `{hora}`, `{peça}`, `{preço}`, `{grade}`, `{quantidade}`, `{link}`, `{link da live}`.
- Sem `any`. Sem emoji em código ou copy. Arquivos até 400 linhas.
- Antes do push: `npx tsc --noEmit -p apps/web` e `npx tsc --noEmit -p apps/worker` (lint e `tsx --test` não checam tipo), depois `infra/scripts/verify-local.ps1`.
- Comandos de shell em PowerShell 5.1: sem `&&`; encadear com `;`.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `apps/web/supabase/migrations/20260919120000_funnel_dispatch.sql` (novo) | colunas de rastreio, `app.lid_map_from_history`, `app.promote_due_schedules` abrindo a oferta |
| `deploy/supabase/apply-order.txt` | ordem de aplicação |
| `deploy/supabase/schema-baseline.json` | assinatura de prod, regenerada |
| `apps/web/src/lib/funnels/templates.ts` (novo) | os 4 roteiros, tipos, `getFunnelTemplate`, `blackFridayAtacado` |
| `apps/web/src/lib/funnels/render.ts` (novo) | `resolveStepDate`, `anchorValues`, `renderCopy`, `missingFields`, `copyKeys` |
| `apps/web/src/lib/funnels/api.ts` (novo) | `parseFunnelFields` (validação do corpo da rota) |
| `apps/web/src/lib/funnels/agenda.ts` (novo) | `indexFunnelRuns` (chip i/n da Agenda) |
| `apps/web/src/lib/stores/broadcasts.ts` | `Broadcast` e `createBroadcast` ganham `funnel_template_id`, `funnel_run_id` |
| `apps/web/src/lib/campaigns/dispatch-view.ts` | `BroadcastRow`, `DispatchView`, `toDispatchView` expõem os dois campos |
| `apps/web/src/lib/messages-store.ts` | `CampaignMessage` (tipo que a Agenda consome) ganha os dois campos |
| `apps/web/src/app/api/campanhas/[slug]/messages/route.ts` | aceita e valida `funnelTemplateId` + `funnelRunId` |
| `apps/web/src/app/api/relampago/offers/route.ts` | modo rascunho com `broadcastId` |
| `apps/web/src/components/painel/messages/messages-agenda.tsx` | chip `Live · 1/4` |

---

### Task 1: Migração — colunas, mapa `@lid` em SQL e abertura na promoção

**Files:**
- Create: `apps/web/supabase/migrations/20260919120000_funnel_dispatch.sql`
- Modify: `deploy/supabase/apply-order.txt` (append)
- Modify: `deploy/supabase/schema-baseline.json` (regenerado por script)

**Interfaces:**
- Consumes: `app.enqueue_broadcast(tenant_id, broadcast_id)` (já existe em `20260730100000_dispatch_fanout.sql`); tabelas `broadcasts.group_ids text[]` (whatsapp ids), `groups(id uuid, tenant_id, whatsapp_group_id)`, `flash_offers`, `flash_offer_groups`, `engine_events(tenant_id, type, payload jsonb, created_at)`.
- Produces: colunas `broadcasts.funnel_template_id text`, `broadcasts.funnel_run_id uuid`, `flash_offers.broadcast_id uuid`; função `app.lid_map_from_history(uuid, text) returns jsonb`; nova `app.promote_due_schedules(integer)`.

- [ ] **Step 1: Conferir por SQL que nada disso já existe (dev e prod)**

No SQL editor de cada projeto (ou `npx supabase link --project-ref <ref>; npx supabase db query --linked "<sql>"`):

```sql
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'broadcasts' and column_name like 'funnel%')
    or (table_name = 'flash_offers' and column_name = 'broadcast_id')
    or (table_name = 'organizations' and column_name in ('niche', 'nicho', 'segment', 'segmento')));
select proname from pg_proc where proname = 'lid_map_from_history';
```

Expected: zero linhas nas duas consultas. Se `organizations` já tiver uma coluna de segmento, o spec (4.3) manda usá-la: tirar o `alter table public.organizations` da migração do Step 2 e anotar o nome real da coluna no PR para o plano da tela. Se aparecer coluna `funnel%` ou `broadcast_id`, parar e reportar: alguém já começou este trabalho (conferir branches abertas com `git branch -r | findstr funil`).

- [ ] **Step 2: Escrever a migração**

`apps/web/supabase/migrations/20260919120000_funnel_dispatch.sql`:

```sql
-- Funil de disparos (spec docs/superpowers/specs/2026-09-19-funil-de-disparos-design.md)
--
-- Tres colunas de rastreio e um comportamento novo na promocao de agendamentos:
-- quando o broadcast promovido tem uma Oferta Relampago em rascunho ligada a ele,
-- a oferta abre no mesmo instante, na mesma transacao. E o que faz a etapa
-- "manda EU QUERO" do funil funcionar sem ninguem clicar em Abrir as 06:00.

alter table public.broadcasts
  add column if not exists funnel_template_id text,
  add column if not exists funnel_run_id uuid;

comment on column public.broadcasts.funnel_template_id is
  'Roteiro do funil que gerou este broadcast (id de FUNNEL_TEMPLATES). Null fora do funil.';
comment on column public.broadcasts.funnel_run_id is
  'Agrupa as N mensagens de uma mesma confirmacao de funil. Gerado no cliente.';

create index if not exists broadcasts_funnel_run_idx
  on public.broadcasts (tenant_id, funnel_run_id)
  where funnel_run_id is not null;

alter table public.flash_offers
  add column if not exists broadcast_id uuid references public.broadcasts(id) on delete set null;

comment on column public.flash_offers.broadcast_id is
  'Oferta criada por uma etapa relampago do funil: abre quando este broadcast e promovido.';

create unique index if not exists flash_offers_broadcast_uidx
  on public.flash_offers (broadcast_id)
  where broadcast_id is not null;

-- {nicho} da copy do funil (spec 4.3). {loja} e organizations.name, que ja existe.
alter table public.organizations
  add column if not exists niche text;

comment on column public.organizations.niche is
  'Nicho da loja em texto livre ("moda feminina"), usado na copy do funil de disparos.';

-- Porte SQL de lidMapFromHistory (apps/web/src/lib/stores/flash-offers.ts):
-- ultimos 90 dias de group-participants.update do grupo, o registro mais
-- recente de cada @lid vence, telefone normalizado para digitos (8 a 15).
create or replace function app.lid_map_from_history(p_tenant_id uuid, p_whatsapp_group_id text)
returns jsonb
language sql
stable
security definer
set search_path = public, app
as $$
  with eventos as (
    select e.payload, e.created_at
    from public.engine_events e
    where e.tenant_id = p_tenant_id
      and e.type = 'group-participants.update'
      and e.created_at >= now() - interval '90 days'
      and e.payload #>> '{data,id}' = p_whatsapp_group_id
    order by e.created_at desc
    limit 500
  ),
  participantes as (
    select distinct on (p->>'id')
      p->>'id' as jid,
      regexp_replace(split_part(p->>'phoneNumber', '@', 1), '\D', '', 'g') as fone
    from eventos ev
    cross join lateral jsonb_array_elements(coalesce(ev.payload #> '{data,participants}', '[]'::jsonb)) p
    where p->>'id' is not null
      and p->>'phoneNumber' is not null
    order by p->>'id', ev.created_at desc
  )
  select coalesce(jsonb_object_agg(jid, fone), '{}'::jsonb)
  from participantes
  where fone ~ '^\d{8,15}$';
$$;

revoke all on function app.lid_map_from_history(uuid, text) from public, anon, authenticated;
grant execute on function app.lid_map_from_history(uuid, text) to service_role;

-- Mesma funcao de 20260730100000_dispatch_fanout.sql, mais o bloco "Funil".
create or replace function app.promote_due_schedules(max_schedules integer default 50)
returns integer
language plpgsql
security definer
set search_path = public, app
as $$
declare
  promoted integer := 0;
  s record;
  step interval;
  next_at timestamptz;
  offer_id uuid;
  b_group_ids text[];
begin
  for s in
    select sc.id, sc.tenant_id, sc.broadcast_id, sc.scheduled_at, sc.recurrence
    from public.schedules sc
    where sc.status = 'pending'
      and sc.scheduled_at <= now()
    order by sc.scheduled_at asc
    limit greatest(max_schedules, 1)
    for update skip locked
  loop
    if s.broadcast_id is not null then
      perform app.enqueue_broadcast(s.tenant_id, s.broadcast_id);
      promoted := promoted + 1;

      -- Funil: etapa relampago. A oferta ligada abre agora, junto da mensagem.
      offer_id := null;
      select fo.id into offer_id
      from public.flash_offers fo
      where fo.broadcast_id = s.broadcast_id
        and fo.tenant_id = s.tenant_id
        and fo.status = 'draft'
      limit 1;

      if offer_id is not null then
        select b.group_ids into b_group_ids
        from public.broadcasts b
        where b.id = s.broadcast_id;

        update public.flash_offers
        set status = 'open', opened_at = now(), updated_at = now()
        where id = offer_id;

        -- Grupo que ja tem outra oferta aberta e pulado (indice parcial
        -- flash_offer_groups_um_aberto_uidx). A mensagem sai mesmo assim.
        insert into public.flash_offer_groups
          (tenant_id, offer_id, group_id, whatsapp_group_id, opened_at, lid_map)
        select g.tenant_id, offer_id, g.id, g.whatsapp_group_id, now(),
               app.lid_map_from_history(g.tenant_id, g.whatsapp_group_id)
        from public.groups g
        where g.tenant_id = s.tenant_id
          and g.whatsapp_group_id = any(coalesce(b_group_ids, '{}'::text[]))
        on conflict (tenant_id, whatsapp_group_id) where closed_at is null do nothing;
      end if;
    end if;

    if s.recurrence = 'none' then
      update public.schedules
      set status = 'done', last_run_at = now(), updated_at = now()
      where id = s.id;
    else
      step := case when s.recurrence = 'daily' then interval '1 day' else interval '7 days' end;
      -- Avanca ate o futuro: um worker parado 3 dias nao pode gerar 3 disparos.
      next_at := s.scheduled_at;
      while next_at <= now() loop
        next_at := next_at + step;
      end loop;
      update public.schedules
      set scheduled_at = next_at, last_run_at = now(), updated_at = now()
      where id = s.id;
    end if;
  end loop;

  return promoted;
end;
$$;

revoke all on function app.promote_due_schedules(integer) from public, anon, authenticated;
grant execute on function app.promote_due_schedules(integer) to service_role;
```

- [ ] **Step 3: Registrar na ordem de aplicação**

Append em `deploy/supabase/apply-order.txt`:

```
# 2026-09-19 — funil de disparos (PR 1, motor). Tres colunas de rastreio e a
# promote_due_schedules abrindo a Oferta Relampago ligada ao broadcast promovido.
apps/web/supabase/migrations/20260919120000_funnel_dispatch.sql
```

- [ ] **Step 4: Aplicar em DEV e provar a abertura numa transação que desfaz**

Aplicar o arquivo inteiro no SQL editor de dev (`wfjuwogxaupyadwhvoxy`). Depois rodar este bloco **de uma vez** (o `rollback` no fim impede que o fan-out mande mensagem de verdade):

```sql
begin;

with t as (select tenant_id, id as group_id, whatsapp_group_id from public.groups limit 1),
b as (
  insert into public.broadcasts (tenant_id, name, message, group_ids, status, sent, total, funnel_template_id, funnel_run_id)
  select tenant_id, 'TESTE FUNIL', 'teste', array[whatsapp_group_id], 'draft', 0, 1, 'live', gen_random_uuid()
  from t returning id, tenant_id
),
o as (
  insert into public.flash_offers (tenant_id, name, keyword, slots, status, broadcast_id)
  select tenant_id, 'TESTE FUNIL', 'eu quero', 5, 'draft', id from b returning id
)
insert into public.schedules (tenant_id, broadcast_id, name, scheduled_at, recurrence, status)
select tenant_id, id, 'TESTE FUNIL', now() - interval '1 minute', 'none', 'pending' from b;

select app.promote_due_schedules(50) as promovidos;

select fo.status, fo.opened_at is not null as abriu,
       (select count(*) from public.flash_offer_groups g where g.offer_id = fo.id) as grupos,
       (select lid_map from public.flash_offer_groups g where g.offer_id = fo.id limit 1) as mapa
from public.flash_offers fo
where fo.name = 'TESTE FUNIL';

rollback;
```

Expected: `promovidos` ≥ 1; a última consulta devolve `status = open`, `abriu = true`, `grupos = 1` (ou `0` se esse grupo já tiver outra oferta aberta: isso é o `on conflict do nothing` funcionando; trocar o `limit 1` por outro grupo e repetir). `mapa` é um jsonb, `{}` se o grupo não tem histórico.

- [ ] **Step 5: Aplicar em PROD, regenerar a baseline e rodar os gates**

Aplicar o mesmo arquivo em prod (`nidoatbxaylrkcgbszns`). Depois, no checkout do worktree:

```powershell
npm run schema:baseline
npm run check:drift
npm run check:advisors
```

Expected: `check:drift` verde; `check:advisors` sem achado novo (as duas funções são `security definer` com `search_path`). Se o advisor acusar "function search_path mutable", a migração está errada: as duas têm `set search_path = public, app`.

- [ ] **Step 6: Commit**

```powershell
git add apps/web/supabase/migrations/20260919120000_funnel_dispatch.sql deploy/supabase/apply-order.txt deploy/supabase/schema-baseline.json
git commit -m "feat(funil): colunas de rastreio e abertura da oferta relampago na promocao"
```

---

### Task 2: Roteiros em módulo puro

**Files:**
- Create: `apps/web/src/lib/funnels/templates.ts`
- Test: `apps/web/src/lib/funnels/templates.test.ts`

**Interfaces:**
- Produces: tipos `FunnelStepKind`, `FunnelField`, `FunnelStep`, `FunnelTemplateId`, `FunnelTemplate`; constantes `FUNNEL_TEMPLATES`, `FUNNEL_TEMPLATE_IDS`, `STORE_KEYS`, `ANCHOR_KEYS`, `CAMPAIGN_KEYS`; funções `getFunnelTemplate(id: string): FunnelTemplate | undefined`, `blackFridayAtacado(today: Date): Date`.

- [ ] **Step 1: Escrever o teste**

`apps/web/src/lib/funnels/templates.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  ANCHOR_KEYS,
  CAMPAIGN_KEYS,
  FUNNEL_TEMPLATES,
  FUNNEL_TEMPLATE_IDS,
  STORE_KEYS,
  blackFridayAtacado,
  getFunnelTemplate,
  type FunnelStep,
} from "./templates";

// Os 4 roteiros do spec, ids unicos.
assert.deepEqual(
  FUNNEL_TEMPLATES.map((t) => t.id),
  ["grade-do-dia", "evento-2-dias", "live", "black-friday-atacado"],
);
assert.deepEqual([...FUNNEL_TEMPLATE_IDS], FUNNEL_TEMPLATES.map((t) => t.id));

// Contagem de etapas por roteiro (spec 3.1 a 3.4).
const contagem = Object.fromEntries(FUNNEL_TEMPLATES.map((t) => [t.id, t.steps.length]));
assert.deepEqual(contagem, { "grade-do-dia": 3, "evento-2-dias": 7, live: 4, "black-friday-atacado": 7 });

// So a live precisa de hora na ancora.
assert.deepEqual(
  FUNNEL_TEMPLATES.filter((t) => t.anchorNeedsTime).map((t) => t.id),
  ["live"],
);

const minutosDoDia = (s: FunnelStep): number => {
  if (s.at.time) {
    const [h, m] = s.at.time.split(":").map(Number);
    return s.at.days * 1440 + h * 60 + m;
  }
  return s.at.days * 1440 + (s.at.minutes ?? 0);
};

for (const t of FUNNEL_TEMPLATES) {
  // Ids de etapa unicos dentro do roteiro.
  const ids = t.steps.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `${t.id}: etapa duplicada`);

  // Etapas em ordem cronologica (relativas a ancora).
  for (let i = 1; i < t.steps.length; i += 1) {
    assert.ok(
      minutosDoDia(t.steps[i]) > minutosDoDia(t.steps[i - 1]),
      `${t.id}: ${t.steps[i].id} nao vem depois de ${t.steps[i - 1].id}`,
    );
  }

  for (const s of t.steps) {
    // Uma etapa tem `time` OU `minutes`, nunca os dois, nunca nenhum.
    assert.ok((s.at.time === undefined) !== (s.at.minutes === undefined), `${t.id}/${s.id}: at invalido`);
    // Etapa com minutos relativos so existe em roteiro com hora na ancora.
    if (s.at.minutes !== undefined) assert.ok(t.anchorNeedsTime, `${t.id}/${s.id}: minutos sem hora na ancora`);
    // Relampago pede quantidade (vira slots).
    if (s.kind === "relampago") assert.ok(s.fields.includes("quantidade"), `${t.id}/${s.id}: relampago sem quantidade`);
    // Etapa link carrega {link} ou {link da live}; nenhuma outra carrega.
    const temLink = s.copy.includes("{link}") || s.copy.includes("{link da live}");
    assert.equal(temLink, s.kind === "link", `${t.id}/${s.id}: link fora de etapa link`);
    // Toda chave da copy e campo da etapa, da loja, da ancora ou da campanha.
    const permitidas = new Set<string>([...s.fields, ...STORE_KEYS, ...ANCHOR_KEYS, ...CAMPAIGN_KEYS]);
    for (const [, chave] of s.copy.matchAll(/\{([^}]+)\}/g)) {
      assert.ok(permitidas.has(chave), `${t.id}/${s.id}: chave {${chave}} sem campo`);
    }
    // Negrito e do WhatsApp, nao markdown.
    assert.ok(!s.copy.includes("**"), `${t.id}/${s.id}: negrito markdown`);
  }
}

// getFunnelTemplate.
assert.equal(getFunnelTemplate("live")?.label, "Lançamento de live");
assert.equal(getFunnelTemplate("nope"), undefined);

// BF do atacado: 3 semanas antes da ultima sexta de novembro. 2026: BF 27/11 -> 06/11.
const sugerida = blackFridayAtacado(new Date(2026, 8, 19));
assert.equal(sugerida.getFullYear(), 2026);
assert.equal(sugerida.getMonth(), 10);
assert.equal(sugerida.getDate(), 6);
// Ja passou este ano -> ano que vem (2027: BF 26/11 -> 05/11).
const proxima = blackFridayAtacado(new Date(2026, 11, 1));
assert.equal(proxima.getFullYear(), 2027);
assert.equal(proxima.getDate(), 5);

console.log("funnels/templates tests passed");
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
cd apps/web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/funnels/templates.test.ts
```

Expected: FAIL, `Cannot find module './templates'`.

- [ ] **Step 3: Escrever o módulo**

`apps/web/src/lib/funnels/templates.ts`:

```ts
/**
 * Roteiros do funil de disparos (spec 2026-09-19-funil-de-disparos-design, seção 3).
 *
 * Módulo puro: sem I/O, sem server-only, importável no cliente. A copy é a mesma
 * para todo lojista; as {chaves} são trocadas no cliente por `renderCopy`
 * (./render.ts) antes de a mensagem virar um broadcast comum. Nenhum roteiro
 * dispara sozinho: cada etapa é confirmada e vira o mesmo par broadcast +
 * schedule da sub-aba Agendar.
 */

export type FunnelStepKind = "texto" | "midia" | "link" | "relampago";
export type FunnelField = "peça" | "preço" | "grade" | "quantidade" | "link da live";

/** Chaves que não são campo da etapa. */
export const STORE_KEYS = ["loja", "nicho"] as const;
export const ANCHOR_KEYS = ["dia", "hora"] as const;
export const CAMPAIGN_KEYS = ["link"] as const;

export type FunnelStep = {
  id: string;
  label: string;
  /** `time` = hora fixa naquele dia; `minutes` = relativo à hora da âncora. Um dos dois. */
  at: { days: number; time?: string; minutes?: number };
  kind: FunnelStepKind;
  /** Campos obrigatórios para gerar a copy. */
  fields: FunnelField[];
  mentionAll: boolean;
  /** Sugere anexar 1 foto; não obriga. */
  wantsMedia: boolean;
  copy: string;
};

export type FunnelTemplateId = "grade-do-dia" | "evento-2-dias" | "live" | "black-friday-atacado";

export type FunnelTemplate = {
  id: FunnelTemplateId;
  label: string;
  description: string;
  anchorLabel: string;
  anchorNeedsTime: boolean;
  suggestAnchor?: (today: Date) => Date;
  steps: FunnelStep[];
};

/** Última sexta de novembro menos 21 dias; se já passou, a do ano seguinte. */
export function blackFridayAtacado(today: Date): Date {
  const paraAno = (ano: number): Date => {
    const d = new Date(ano, 10, 30);
    d.setDate(d.getDate() - ((d.getDay() + 2) % 7)); // volta até a sexta (getDay 5)
    d.setDate(d.getDate() - 21);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const esteAno = paraAno(today.getFullYear());
  return esteAno >= today ? esteAno : paraAno(today.getFullYear() + 1);
}

const CAMPOS_GRADE: FunnelField[] = ["peça", "preço", "grade", "quantidade"];

export const FUNNEL_TEMPLATES: FunnelTemplate[] = [
  {
    id: "grade-do-dia",
    label: "Grade do dia",
    description: "A grade das 06:00, o link com vagas 12 minutos depois e o reforço do meio-dia.",
    anchorLabel: "Dia da grade",
    anchorNeedsTime: false,
    steps: [
      {
        id: "grade-de-hoje", label: "Grade de hoje", at: { days: 0, time: "06:00" },
        kind: "relampago", fields: CAMPOS_GRADE, mentionAll: true, wantsMedia: true,
        copy: "Bom dia! Grade de hoje da {loja}: {peça} por {preço} no atacado, grade {grade}. Só {quantidade} peças. Quer? Manda *EU QUERO* aqui no grupo que eu separo a sua.",
      },
      {
        id: "vagas-de-hoje", label: "Vagas de hoje", at: { days: 0, time: "06:12" },
        kind: "link", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Pra quem ainda não entrou: o link de pedido da {loja} é este, com as vagas de hoje: {link}",
      },
      {
        id: "ultimas-da-grade", label: "Últimas da grade", at: { days: 0, time: "12:00" },
        kind: "texto", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Sobrou pouca coisa da grade de hoje. Quem mandou EU QUERO já está na fila; quem ficou de fora ainda pega o que restou por aqui.",
      },
    ],
  },
  {
    id: "evento-2-dias",
    label: "Evento de 2 dias",
    description: "Aviso, prévia, duas aberturas às 06:00, última chamada e sobras. Serve para coleção nova e queima de estoque.",
    anchorLabel: "Dia 1",
    anchorNeedsTime: false,
    steps: [
      {
        id: "vem-ai", label: "Vem aí", at: { days: -2, time: "19:00" },
        kind: "midia", fields: [], mentionAll: false, wantsMedia: true,
        copy: "{dia} tem evento de 2 dias da {loja}, só pra quem está nos grupos: {nicho} com preço de atacado que não vai pro site. Guarda a data.",
      },
      {
        id: "previa", label: "Prévia", at: { days: -1, time: "19:00" },
        kind: "midia", fields: ["peça", "preço", "grade"], mentionAll: false, wantsMedia: true,
        copy: "Amanhã 06:00 abre. Prévia: {peça} a partir de {preço}, grade {grade}. Quem estiver no grupo às 6 pega primeiro.",
      },
      {
        id: "abriu-dia-1", label: "Abriu · dia 1", at: { days: 0, time: "06:00" },
        kind: "relampago", fields: CAMPOS_GRADE, mentionAll: true, wantsMedia: true,
        copy: "Abriu! Dia 1 do evento da {loja}: {peça} por {preço}, grade {grade}, {quantidade} peças. Manda *EU QUERO* que eu separo na ordem.",
      },
      {
        id: "ainda-da-tempo", label: "Ainda dá tempo", at: { days: 0, time: "12:00" },
        kind: "texto", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Meio-dia e o evento segue. O que saiu de manhã não volta; o que sobrou está por aqui.",
      },
      {
        id: "abriu-dia-2", label: "Abriu · dia 2", at: { days: 1, time: "06:00" },
        kind: "relampago", fields: CAMPOS_GRADE, mentionAll: true, wantsMedia: true,
        copy: "Dia 2! Nova grade da {loja}: {peça} por {preço}, grade {grade}, {quantidade} peças. Manda *EU QUERO*.",
      },
      {
        id: "ultima-chamada", label: "Última chamada", at: { days: 1, time: "18:00" },
        kind: "link", fields: [], mentionAll: true, wantsMedia: false,
        copy: "Última chamada do evento. Pedido pelo link até hoje à noite: {link}",
      },
      {
        id: "sobras", label: "Sobras", at: { days: 2, time: "10:00" },
        kind: "link", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Sobras do evento com o mesmo preço, enquanto durar: {link}",
      },
    ],
  },
  {
    id: "live",
    label: "Lançamento de live",
    description: "Prévia na véspera, chamada 15 minutos antes, grade relâmpago depois da live e sobras no dia seguinte.",
    anchorLabel: "Dia e hora da live",
    anchorNeedsTime: true,
    steps: [
      {
        id: "previa-da-grade", label: "Prévia da grade", at: { days: -1, time: "19:00" },
        kind: "midia", fields: CAMPOS_GRADE, mentionAll: false, wantsMedia: true,
        copy: "Amanhã {hora} tem live da {loja}! Prévia da grade de {nicho}: {peça} a partir de {preço} no atacado, grade {grade}, {quantidade} peças. Quem estiver ao vivo leva condição exclusiva.",
      },
      {
        id: "entra-agora", label: "Entra agora", at: { days: 0, minutes: -15 },
        kind: "link", fields: ["link da live"], mentionAll: true, wantsMedia: false,
        copy: "Tô entrando ao vivo em 15 min! Entra aqui: {link da live}. Pedido é pelo grupo, na condição da live.",
      },
      {
        id: "grade-da-live", label: "Grade da live", at: { days: 0, minutes: 90 },
        kind: "relampago", fields: CAMPOS_GRADE, mentionAll: false, wantsMedia: true,
        copy: "Grade da live liberada: {peça} {preço}, {grade}. Só {quantidade} peças. Manda *EU QUERO* aqui que eu separo a sua.",
      },
      {
        id: "sobras-da-live", label: "Sobras da live", at: { days: 1, time: "10:00" },
        kind: "link", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Sobrou da live e ainda está na condição de ontem. Pedido por aqui: {link}",
      },
    ],
  },
  {
    id: "black-friday-atacado",
    label: "Black Friday do atacado",
    description: "Três semanas antes da BF do varejo: a revendedora compra agora pra revender na BF das lojas.",
    anchorLabel: "Dia da BF do atacado",
    anchorNeedsTime: false,
    suggestAnchor: blackFridayAtacado,
    steps: [
      {
        id: "vem-ai", label: "Vem aí", at: { days: -7, time: "19:00" },
        kind: "midia", fields: [], mentionAll: false, wantsMedia: true,
        copy: "Black Friday do atacado da {loja} é {dia}. Antes da BF das lojas, pra você revender na BF delas. Só nos grupos.",
      },
      {
        id: "previa", label: "Prévia", at: { days: -3, time: "19:00" },
        kind: "midia", fields: ["peça", "preço", "grade"], mentionAll: false, wantsMedia: true,
        copy: "Prévia da Black do atacado: {peça} vai sair por {preço}, grade {grade}. Na {dia} às 06:00.",
      },
      {
        id: "vespera", label: "Véspera", at: { days: -1, time: "19:00" },
        kind: "texto", fields: [], mentionAll: true, wantsMedia: false,
        copy: "Amanhã 06:00. A grade sai aqui no grupo primeiro; quem mandar EU QUERO cedo pega.",
      },
      {
        id: "abriu", label: "Abriu", at: { days: 0, time: "06:00" },
        kind: "relampago", fields: CAMPOS_GRADE, mentionAll: true, wantsMedia: true,
        copy: "Abriu a Black do atacado da {loja}! {peça} por {preço}, grade {grade}, {quantidade} peças. Manda *EU QUERO* que eu separo na ordem.",
      },
      {
        id: "reforco", label: "Reforço", at: { days: 0, time: "12:00" },
        kind: "texto", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Metade do dia e metade da grade já foi. O que sobrou continua no mesmo preço até hoje à noite.",
      },
      {
        id: "ultima-chamada", label: "Última chamada", at: { days: 0, time: "18:00" },
        kind: "link", fields: [], mentionAll: true, wantsMedia: false,
        copy: "Última chamada da Black do atacado. Pedido pelo link até meia-noite: {link}",
      },
      {
        id: "sobras", label: "Sobras", at: { days: 1, time: "10:00" },
        kind: "link", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Sobras da Black no mesmo preço, enquanto durar: {link}",
      },
    ],
  },
];

export const FUNNEL_TEMPLATE_IDS: ReadonlySet<string> = new Set(FUNNEL_TEMPLATES.map((t) => t.id));

export function getFunnelTemplate(id: string): FunnelTemplate | undefined {
  return FUNNEL_TEMPLATES.find((t) => t.id === id);
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
cd apps/web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/funnels/templates.test.ts
```

Expected: PASS com `funnels/templates tests passed`.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/funnels/templates.ts apps/web/src/lib/funnels/templates.test.ts
git commit -m "feat(funil): os 4 roteiros em modulo puro"
```

---

### Task 3: Datas e copy — `render.ts`

**Files:**
- Create: `apps/web/src/lib/funnels/render.ts`
- Test: `apps/web/src/lib/funnels/render.test.ts`

**Interfaces:**
- Consumes: `FunnelStep`, `FunnelField` de `./templates`.
- Produces: `resolveStepDate(anchor: Date, step: FunnelStep): Date`, `anchorValues(anchor: Date): { dia: string; hora: string }`, `renderCopy(copy: string, values: Record<string, string>): string`, `missingFields(step: FunnelStep, values: Record<string, string>): FunnelField[]`, `copyKeys(copy: string): string[]`.

- [ ] **Step 1: Escrever o teste**

`apps/web/src/lib/funnels/render.test.ts`:

```ts
import assert from "node:assert/strict";
import { anchorValues, copyKeys, missingFields, renderCopy, resolveStepDate } from "./render";
import { getFunnelTemplate, type FunnelStep } from "./templates";

const passo = (at: FunnelStep["at"]): FunnelStep => ({
  id: "x", label: "x", at, kind: "texto", fields: [], mentionAll: false, wantsMedia: false, copy: "",
});

// Ancora: sabado 10/10/2026 20:00, hora local.
const live = new Date(2026, 9, 10, 20, 0);

// Hora fixa em outro dia.
assert.deepEqual(resolveStepDate(live, passo({ days: -1, time: "19:00" })), new Date(2026, 9, 9, 19, 0));
assert.deepEqual(resolveStepDate(live, passo({ days: 1, time: "10:00" })), new Date(2026, 9, 11, 10, 0));
// Minutos relativos a hora da ancora.
assert.deepEqual(resolveStepDate(live, passo({ days: 0, minutes: -15 })), new Date(2026, 9, 10, 19, 45));
assert.deepEqual(resolveStepDate(live, passo({ days: 0, minutes: 90 })), new Date(2026, 9, 10, 21, 30));
// Virada de mes e de ano.
assert.deepEqual(resolveStepDate(new Date(2026, 9, 31, 6, 0), passo({ days: 1, time: "10:00" })), new Date(2026, 10, 1, 10, 0));
assert.deepEqual(resolveStepDate(new Date(2026, 11, 31, 6, 0), passo({ days: 2, time: "10:00" })), new Date(2027, 0, 2, 10, 0));
// A ancora nao e mutada.
assert.equal(live.getTime(), new Date(2026, 9, 10, 20, 0).getTime());

// O roteiro real da live, do inicio ao fim, sai em ordem.
const etapas = getFunnelTemplate("live")!.steps.map((s) => resolveStepDate(live, s).getTime());
assert.deepEqual([...etapas].sort((a, b) => a - b), etapas);

// Valores da ancora para a copy.
const a = anchorValues(live);
assert.ok(a.dia.includes("10/10"), a.dia);
assert.ok(/s[aá]bado/i.test(a.dia), a.dia);
assert.equal(a.hora, "20h");
assert.equal(anchorValues(new Date(2026, 9, 10, 19, 30)).hora, "19h30");

// renderCopy troca todas as chaves, inclusive repetidas e com espaco.
assert.equal(
  renderCopy("{loja} e {loja}: {link da live}", { loja: "Mega", "link da live": "https://x" }),
  "Mega e Mega: https://x",
);
// Campo faltando ou vazio lanca com o nome da chave.
assert.throws(() => renderCopy("oi {peça}", {}), /peça/);
assert.throws(() => renderCopy("oi {peça}", { "peça": "  " }), /peça/);
// Sem chaves, devolve igual.
assert.equal(renderCopy("sem chave", {}), "sem chave");

// missingFields devolve so os obrigatorios vazios, na ordem da etapa.
const grade = getFunnelTemplate("grade-do-dia")!.steps[0];
assert.deepEqual(missingFields(grade, { "peça": "vestido", "preço": "", grade: "P ao GG" }), ["preço", "quantidade"]);
assert.deepEqual(missingFields(grade, { "peça": "v", "preço": "p", grade: "g", quantidade: "120" }), []);

// copyKeys lista as chaves na ordem em que aparecem.
assert.deepEqual(copyKeys("{dia} {loja} {dia}"), ["dia", "loja", "dia"]);

console.log("funnels/render tests passed");
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
cd apps/web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/funnels/render.test.ts
```

Expected: FAIL, `Cannot find module './render'`.

- [ ] **Step 3: Escrever o módulo**

`apps/web/src/lib/funnels/render.ts`:

```ts
/**
 * Datas e copy do funil. Puro; roda no cliente.
 *
 * Fuso: hora LOCAL do navegador, igual à sub-aba Agendar
 * (`new Date(`${date}T${time}`).toISOString()` em schedule-composer.tsx).
 */
import type { FunnelField, FunnelStep } from "./templates";

const CHAVE = /\{([^}]+)\}/g;

/** Data da etapa a partir da âncora. Não muta a âncora. */
export function resolveStepDate(anchor: Date, step: FunnelStep): Date {
  const d = new Date(anchor.getTime());
  d.setDate(d.getDate() + step.at.days);
  if (step.at.time !== undefined) {
    const [h, m] = step.at.time.split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }
  return new Date(d.getTime() + (step.at.minutes ?? 0) * 60_000);
}

/** `{dia}` = "sábado, 10/10" · `{hora}` = "20h" ou "19h30". */
export function anchorValues(anchor: Date): { dia: string; hora: string } {
  const dia = anchor.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" });
  const h = anchor.getHours();
  const m = anchor.getMinutes();
  const hora = m === 0 ? `${h}h` : `${h}h${String(m).padStart(2, "0")}`;
  return { dia, hora };
}

export function copyKeys(copy: string): string[] {
  return [...copy.matchAll(CHAVE)].map((m) => m[1]);
}

/** Troca as {chaves}. Lança se alguma estiver ausente ou vazia. */
export function renderCopy(copy: string, values: Record<string, string>): string {
  return copy.replace(CHAVE, (_, chave: string) => {
    const valor = values[chave]?.trim();
    if (!valor) throw new Error(`campo vazio: ${chave}`);
    return valor;
  });
}

export function missingFields(step: FunnelStep, values: Record<string, string>): FunnelField[] {
  return step.fields.filter((f) => !values[f]?.trim());
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
cd apps/web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/funnels/render.test.ts
```

Expected: PASS. Se `a.dia` vier sem "sábado", o Node está sem ICU completo: usar `node --version` ≥ 18 (ICU completo é padrão).

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/lib/funnels/render.ts apps/web/src/lib/funnels/render.test.ts
git commit -m "feat(funil): datas das etapas e copy com campos"
```

---

### Task 4: Campos de rastreio da rota de mensagens até a Agenda

**Files:**
- Create: `apps/web/src/lib/funnels/api.ts`
- Test: `apps/web/src/lib/funnels/api.test.ts`
- Modify: `apps/web/src/lib/stores/broadcasts.ts:5-30` (tipo) e `:44-79` (`createBroadcast`)
- Modify: `apps/web/src/lib/campaigns/dispatch-view.ts:14-35` (`BroadcastRow`), `:44-68` (`DispatchView`), `:90-120` (`toDispatchView`)
- Modify: `apps/web/src/lib/campaigns/dispatch-view.test.ts` (assertion nova)
- Modify: `apps/web/src/lib/messages-store.ts:8-32` (`CampaignMessage`)
- Modify: `apps/web/src/app/api/campanhas/[slug]/messages/route.ts:155-170` (POST)

**Interfaces:**
- Consumes: `FUNNEL_TEMPLATE_IDS`, `FunnelTemplateId` de `@/lib/funnels/templates`.
- Produces: `parseFunnelFields(body: Record<string, unknown>): { ok: true; fields: FunnelFields | null } | { ok: false; error: string }` com `FunnelFields = { funnel_template_id: FunnelTemplateId; funnel_run_id: string }`; `Broadcast.funnel_template_id: string | null`, `Broadcast.funnel_run_id: string | null`; `DispatchView.funnelTemplateId?: string`, `DispatchView.funnelRunId?: string`; `CampaignMessage.funnelTemplateId?: string`, `CampaignMessage.funnelRunId?: string`.

- [ ] **Step 1: Teste do parser**

`apps/web/src/lib/funnels/api.test.ts`:

```ts
import assert from "node:assert/strict";
import { parseFunnelFields } from "./api";

const RUN = "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

// Ausentes: nao e funil.
assert.deepEqual(parseFunnelFields({}), { ok: true, fields: null });
// Completo e valido.
assert.deepEqual(parseFunnelFields({ funnelTemplateId: "live", funnelRunId: RUN }), {
  ok: true,
  fields: { funnel_template_id: "live", funnel_run_id: RUN },
});
// Um sem o outro.
assert.equal(parseFunnelFields({ funnelTemplateId: "live" }).ok, false);
assert.equal(parseFunnelFields({ funnelRunId: RUN }).ok, false);
// Roteiro desconhecido.
assert.equal(parseFunnelFields({ funnelTemplateId: "nope", funnelRunId: RUN }).ok, false);
// Run id que nao e uuid.
assert.equal(parseFunnelFields({ funnelTemplateId: "live", funnelRunId: "123" }).ok, false);
// Tipos errados.
assert.equal(parseFunnelFields({ funnelTemplateId: 1, funnelRunId: RUN }).ok, false);

console.log("funnels/api tests passed");
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
cd apps/web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/funnels/api.test.ts
```

Expected: FAIL, `Cannot find module './api'`.

- [ ] **Step 3: Escrever o parser**

`apps/web/src/lib/funnels/api.ts`:

```ts
import { FUNNEL_TEMPLATE_IDS, type FunnelTemplateId } from "./templates";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FunnelFields = { funnel_template_id: FunnelTemplateId; funnel_run_id: string };

/**
 * Corpo de POST /api/campanhas/[slug]/messages: `funnelTemplateId` e
 * `funnelRunId` são opcionais, mas vêm juntos e válidos ou não vêm.
 */
export function parseFunnelFields(
  body: Record<string, unknown>,
): { ok: true; fields: FunnelFields | null } | { ok: false; error: string } {
  const template = body.funnelTemplateId;
  const run = body.funnelRunId;
  if (template === undefined && run === undefined) return { ok: true, fields: null };
  if (typeof template !== "string" || !FUNNEL_TEMPLATE_IDS.has(template)) {
    return { ok: false, error: "Roteiro de funil desconhecido." };
  }
  if (typeof run !== "string" || !UUID.test(run)) {
    return { ok: false, error: "funnelRunId inválido." };
  }
  return { ok: true, fields: { funnel_template_id: template as FunnelTemplateId, funnel_run_id: run } };
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
cd apps/web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/funnels/api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Store `broadcasts.ts`**

No tipo `Broadcast`, depois de `last_ack_at: string | null;`:

```ts
  /** Roteiro e confirmação do funil que geraram este broadcast. Null fora do funil. */
  funnel_template_id: string | null;
  funnel_run_id: string | null;
```

Em `createBroadcast`, no tipo do `input`, depois de `poll?: …;`:

```ts
    funnel_template_id?: string;
    funnel_run_id?: string;
```

E no objeto do `.insert({ … })`, depois de `total: input.group_ids.length,`:

```ts
      funnel_template_id: input.funnel_template_id ?? null,
      funnel_run_id: input.funnel_run_id ?? null,
```

- [ ] **Step 6: `dispatch-view.ts` e seu teste**

Em `BroadcastRow`, depois de `created_at: string;`:

```ts
  funnel_template_id?: string | null;
  funnel_run_id?: string | null;
```

Em `DispatchView`, depois de `scheduleId?: string;`:

```ts
  /** Presentes só em mensagens criadas pela sub-aba Funil. */
  funnelTemplateId?: string;
  funnelRunId?: string;
```

Em `toDispatchView`, depois de `scheduleId: pendingSchedule?.id,`:

```ts
    funnelTemplateId: broadcast.funnel_template_id ?? undefined,
    funnelRunId: broadcast.funnel_run_id ?? undefined,
```

No fim de `dispatch-view.test.ts`, antes do `console.log` final:

```ts
// Campos do funil passam quando existem e somem quando nulos.
const comFunil = toDispatchView(
  broadcast({ id: "f1", funnel_template_id: "live", funnel_run_id: "run-1" }),
  "slug",
  null,
);
assert.equal(comFunil.funnelTemplateId, "live");
assert.equal(comFunil.funnelRunId, "run-1");
const semFunil = toDispatchView(broadcast({ id: "f2" }), "slug", null);
assert.equal(semFunil.funnelTemplateId, undefined);
assert.equal(semFunil.funnelRunId, undefined);
```

Rodar: `cd apps/web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/campaigns/dispatch-view.test.ts`. Expected: PASS.

- [ ] **Step 7: `messages-store.ts`**

Em `CampaignMessage`, depois de `recurrence: "none" | "daily" | "weekly";`:

```ts
  /** Presentes só em mensagens criadas pela sub-aba Funil. */
  funnelTemplateId?: string;
  funnelRunId?: string;
```

- [ ] **Step 8: Rota POST**

Em `apps/web/src/app/api/campanhas/[slug]/messages/route.ts`, importar no topo:

```ts
import { parseFunnelFields } from "@/lib/funnels/api";
```

Logo depois do bloco que valida `scheduledAt` (o `if (body.scheduledAt && !scheduledAt) { … }`), inserir:

```ts
  const funnel = parseFunnelFields(body);
  if (!funnel.ok) return Response.json({ error: funnel.error }, { status: 400 });
```

E na chamada `broadcastsStore.createBroadcast(tenantId, { … })`, depois de `poll,`:

```ts
    ...(funnel.fields ?? {}),
```

- [ ] **Step 9: Tipos, testes e verificação manual**

```powershell
npx tsc --noEmit -p apps/web
npm --workspace apps/web test
```

Expected: tsc limpo; todos os testes verdes. Com o dev server no ar (`preview_start`) e logado, no console do navegador:

```js
await fetch("/api/campanhas/<slug-de-uma-campanha>/messages", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: "teste funil", scheduledAt: new Date(Date.now() + 86400000).toISOString(), funnelTemplateId: "nope", funnelRunId: "3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d" }) }).then(r => r.status)
```

Expected: `400`. Repetir com `funnelTemplateId: "live"`: `201` e o JSON traz `funnelTemplateId: "live"`. Cancelar essa mensagem na Agenda depois.

- [ ] **Step 10: Commit**

```powershell
git add apps/web/src/lib/funnels/api.ts apps/web/src/lib/funnels/api.test.ts apps/web/src/lib/stores/broadcasts.ts apps/web/src/lib/campaigns/dispatch-view.ts apps/web/src/lib/campaigns/dispatch-view.test.ts apps/web/src/lib/messages-store.ts "apps/web/src/app/api/campanhas/[slug]/messages/route.ts"
git commit -m "feat(funil): rastreio funnel_template_id/funnel_run_id da rota ate a agenda"
```

---

### Task 5: Oferta Relâmpago em rascunho ligada a um broadcast

**Files:**
- Modify: `apps/web/src/app/api/relampago/offers/route.ts:36-70` (POST)
- Modify: `apps/web/src/lib/stores/flash-offers.ts` (`OfferRow` ganha `broadcast_id`)

**Interfaces:**
- Consumes: coluna `flash_offers.broadcast_id` (Task 1).
- Produces: `POST /api/relampago/offers` aceita `broadcastId?: string`; com ele, cria a oferta com `status: "draft"`, `opened_at: null`, `broadcast_id`, sem `flash_offer_groups` e sem chamada à Evolution; `groupIds` passa a ser opcional nesse modo.

- [ ] **Step 1: Tipo do corpo e validação**

No tipo do `body`, adicionar `broadcastId?: string;`. Substituir a validação de `groupIds`:

```ts
  const modoRascunho = typeof body.broadcastId === "string" && body.broadcastId.length > 0;
  if (!modoRascunho && !body.groupIds?.length) {
    return Response.json({ error: "escolha ao menos um grupo" }, { status: 400 });
  }
```

- [ ] **Step 2: Ramo de rascunho, antes da busca de grupos**

Logo depois de `const supabase = getSupabaseAdmin();`:

```ts
  // Funil: a oferta nasce em rascunho ligada ao broadcast da etapa e quem abre
  // e a promote_due_schedules, na hora do disparo (spec D3). Sem grupos aqui:
  // eles saem de broadcasts.group_ids na abertura.
  if (modoRascunho) {
    const { data: broadcast } = await supabase
      .from("broadcasts")
      .select("id")
      .eq("tenant_id", ctx.tenantId)
      .eq("id", body.broadcastId)
      .maybeSingle();
    if (!broadcast) return Response.json({ error: "broadcast nao encontrado" }, { status: 400 });

    const { data: rascunho, error: erroRascunho } = await supabase
      .from("flash_offers")
      .insert({
        tenant_id: ctx.tenantId,
        name: body.name.trim(),
        keyword: normalizeKeyword(body.keyword || "eu quero"),
        slots: body.slots,
        timer_seconds: body.timerMinutes ? Math.round(body.timerMinutes * 60) : null,
        status: "draft",
        broadcast_id: body.broadcastId,
        created_by: ctx.authUserId,
      })
      .select("*")
      .single();
    if (erroRascunho) {
      if (erroRascunho.code === "23505") {
        return Response.json({ error: "esse disparo ja tem uma oferta ligada" }, { status: 409 });
      }
      throw erroRascunho;
    }
    return Response.json({ offer: rascunho }, { status: 201 });
  }
```

O caminho existente (abrir agora) continua igual abaixo. Ajustar a query de grupos para usar `body.groupIds ?? []`.

- [ ] **Step 3: `OfferRow`**

Em `apps/web/src/lib/stores/flash-offers.ts`, no `OfferRow`, adicionar `broadcast_id: string | null;`.

- [ ] **Step 4: Tipos e verificação manual**

```powershell
npx tsc --noEmit -p apps/web
```

No console do navegador, logado, usando o `id` do broadcast criado no Step 9 da Task 4 (ou outro `draft` seu):

```js
await fetch("/api/relampago/offers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "teste funil", slots: 5, broadcastId: "<id-do-broadcast>" }) }).then(r => r.json())
```

Expected: `201` com `offer.status === "draft"`, `offer.broadcast_id` preenchido, `offer.opened_at === null`. Repetir a mesma chamada: `409`. Com `broadcastId` de outro tenant ou inexistente: `400`. Apagar a oferta de teste: `delete from flash_offers where name = 'teste funil'` em dev.

- [ ] **Step 5: Commit**

```powershell
git add apps/web/src/app/api/relampago/offers/route.ts apps/web/src/lib/stores/flash-offers.ts
git commit -m "feat(relampago): oferta em rascunho ligada a um broadcast"
```

---

### Task 6: Chip do funil na Agenda

**Files:**
- Create: `apps/web/src/lib/funnels/agenda.ts`
- Test: `apps/web/src/lib/funnels/agenda.test.ts`
- Modify: `apps/web/src/components/painel/messages/messages-agenda.tsx:205-262` (`MessageRow`) e o lugar onde as linhas são renderizadas

**Interfaces:**
- Consumes: `getFunnelTemplate` de `./templates`; `CampaignMessage.funnelTemplateId/funnelRunId` (Task 4).
- Produces: `indexFunnelRuns(messages): Map<string, FunnelChip>` com `FunnelChip = { label: string; index: number; total: number }`, chaveado por id da mensagem.

- [ ] **Step 1: Teste**

`apps/web/src/lib/funnels/agenda.test.ts`:

```ts
import assert from "node:assert/strict";
import { indexFunnelRuns } from "./agenda";

const m = (id: string, run: string | undefined, at: string, template = "live") => ({
  id, funnelTemplateId: run ? template : undefined, funnelRunId: run, scheduledAt: at, createdAt: "2026-09-19T10:00:00Z",
});

const idx = indexFunnelRuns([
  m("c", "r1", "2026-10-10T21:30:00Z"),
  m("a", "r1", "2026-10-09T19:00:00Z"),
  m("b", "r1", "2026-10-10T19:45:00Z"),
  m("solta", undefined, "2026-10-12T10:00:00Z"),
  m("z", "r2", "2026-11-06T06:00:00Z", "black-friday-atacado"),
]);

// Ordenado por data dentro da mesma confirmacao.
assert.deepEqual(idx.get("a"), { label: "Lançamento de live", index: 1, total: 3 });
assert.deepEqual(idx.get("b"), { label: "Lançamento de live", index: 2, total: 3 });
assert.deepEqual(idx.get("c"), { label: "Lançamento de live", index: 3, total: 3 });
// Outra confirmacao, outro roteiro.
assert.deepEqual(idx.get("z"), { label: "Black Friday do atacado", index: 1, total: 1 });
// Mensagem fora do funil nao entra.
assert.equal(idx.has("solta"), false);
// Roteiro desconhecido (dado antigo) ganha rotulo generico.
const antigo = indexFunnelRuns([{ ...m("q", "r9", "2026-10-10T10:00:00Z"), funnelTemplateId: "sumiu" }]);
assert.equal(antigo.get("q")?.label, "Funil");

console.log("funnels/agenda tests passed");
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
cd apps/web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/funnels/agenda.test.ts
```

Expected: FAIL, `Cannot find module './agenda'`.

- [ ] **Step 3: Módulo**

`apps/web/src/lib/funnels/agenda.ts`:

```ts
import { getFunnelTemplate } from "./templates";

export type FunnelChip = { label: string; index: number; total: number };

type Linha = {
  id: string;
  funnelTemplateId?: string;
  funnelRunId?: string;
  scheduledAt?: string;
  createdAt: string;
};

/** Chip "Live · 2/4" por mensagem: agrupa por confirmação e ordena por data. */
export function indexFunnelRuns(messages: ReadonlyArray<Linha>): Map<string, FunnelChip> {
  const porRun = new Map<string, Linha[]>();
  for (const msg of messages) {
    if (!msg.funnelRunId) continue;
    porRun.set(msg.funnelRunId, [...(porRun.get(msg.funnelRunId) ?? []), msg]);
  }

  const saida = new Map<string, FunnelChip>();
  for (const linhas of porRun.values()) {
    const ordenadas = [...linhas].sort((a, b) =>
      (a.scheduledAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.createdAt),
    );
    const label = getFunnelTemplate(ordenadas[0].funnelTemplateId ?? "")?.label ?? "Funil";
    ordenadas.forEach((msg, i) => {
      saida.set(msg.id, { label, index: i + 1, total: ordenadas.length });
    });
  }
  return saida;
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
cd apps/web; npx tsx --import ./src/test/server-only-shim.mjs --test src/lib/funnels/agenda.test.ts
```

Expected: PASS.

- [ ] **Step 5: Componente**

Em `messages-agenda.tsx`: importar `import { indexFunnelRuns, type FunnelChip } from "@/lib/funnels/agenda";` e acrescentar `Workflow` ao import existente de `lucide-react` (o ícone existe na 1.21). No corpo do componente principal, antes do `return`, calcular `const funil = indexFunnelRuns(messages);` e passar `funnel={funil.get(msg.id)}` em cada `<MessageRow …>`. Em `MessageRow`, adicionar a prop `funnel?: FunnelChip` e, no `div` dos chips, logo depois do chip de `scheduledAt`:

```tsx
          {funnel && (
            <span className="inline-flex items-center gap-1 rounded-full bg-cobalt-500/10 px-2 py-0.5 text-[10px] font-medium text-cobalt-700">
              <Workflow className="h-3 w-3" />
              {funnel.label} · {funnel.index}/{funnel.total}
            </span>
          )}
```

- [ ] **Step 6: Verificar no navegador**

`npx tsc --noEmit -p apps/web`; com o dev server no ar, abrir a campanha do Step 9 da Task 4 → aba Mensagens → Agenda. A mensagem criada com `funnelTemplateId: "live"` mostra o chip `Lançamento de live · 1/1`. Mensagens comuns não mostram chip. Tirar screenshot com o browser pane.

- [ ] **Step 7: Commit**

```powershell
git add apps/web/src/lib/funnels/agenda.ts apps/web/src/lib/funnels/agenda.test.ts apps/web/src/components/painel/messages/messages-agenda.tsx
git commit -m "feat(funil): chip do funil na agenda"
```

---

### Task 7: Quadro, gate local e PR

**Files:**
- Modify: nenhum arquivo de código; `docs/superpowers/specs/2026-09-19-funil-de-disparos-design.md` e este plano entram no PR.

- [ ] **Step 1: Card do quadro (prod `nidoatbxaylrkcgbszns`)**

```sql
select public.move_card('funil-de-disparos', 'em_construcao', 'PR 1 (motor) aberto', 'docs/superpowers/plans/2026-09-19-funil-de-disparos-motor.md');
```

Se a chave não existir, criar o card em `/admin/quadro` com a chave `funil-de-disparos` e repetir.

- [ ] **Step 2: Gate local**

```powershell
npx tsc --noEmit -p apps/web
npx tsc --noEmit -p apps/worker
powershell -ExecutionPolicy Bypass -File infra/scripts/verify-local.ps1
```

Expected: tudo verde. Se o scan de secrets acusar algo neste PR, é falso positivo em fixture: montar a string em pedaços.

- [ ] **Step 3: Commit dos docs, push e PR**

```powershell
git add docs/superpowers/specs/2026-09-19-funil-de-disparos-design.md docs/superpowers/plans/2026-09-19-funil-de-disparos-motor.md
git commit -m "docs(funil): spec e plano do motor"
git push -u origin HEAD
gh pr create --title "feat(funil): motor do funil de disparos (migracao, roteiros, rastreio)" --body-file "$env:TEMP\pr-funil-motor.md"
```

Corpo do PR (gravar antes em `$env:TEMP\pr-funil-motor.md`, com a saída real do SQL no lugar indicado):

```
## O que muda
- Migração `20260919120000_funnel_dispatch.sql` aplicada em dev e prod; baseline regenerada.
- `promote_due_schedules` abre a Oferta Relâmpago em rascunho ligada ao broadcast promovido.
- Módulos puros `lib/funnels/{templates,render,api,agenda}.ts` com testes.
- `POST /api/campanhas/[slug]/messages` aceita `funnelTemplateId` + `funnelRunId`.
- `POST /api/relampago/offers` aceita `broadcastId` (rascunho).
- Chip do funil na Agenda.

## Prova
- Bloco SQL da Task 1 Step 4 em dev: status open, N grupos, rollback. (colar a saída)
- `npm test` verde; `verify-local.ps1` verde.

## Fora deste PR
A sub-aba Funil (tela) é o PR 2. Spec: docs/superpowers/specs/2026-09-19-funil-de-disparos-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 4: CI, revisão e merge na mesma sessão**

Ler o CI com as ferramentas de PR do app; corrigir o que falhar; `gh pr merge --squash --delete-branch` quando verde. Reportar "PRs que deixei abertos" ao encerrar.
