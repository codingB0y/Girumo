# Campanha de Grupos 360 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o modulo `/campanhas` em um cockpit operacional de campanhas de grupos, com cards de campanha, detalhe focado em grupos, link mestre e criacao com selecao inicial de grupos.

**Architecture:** A regra de status e metricas fica em `src/lib/campaign-groups-overview.ts`, testada com `tsx` e `node:assert`. As telas consomem esse helper para evitar duplicar calculos em `/campanhas` e `/campanhas/[id]`. A primeira fatia usa APIs e stores existentes, sem banco novo e sem mudancas na engine.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind 4, lucide-react, stores JSON existentes, `tsx` para testes leves.

---

## File Structure

- Create: `apps/web/src/lib/campaign-groups-overview.ts`
  - Responsavel por calcular status operacional, metricas, grupos da campanha e acao principal.
- Create: `apps/web/src/lib/campaign-groups-overview.test.ts`
  - Testes executaveis com `node:assert`.
- Create: `apps/web/src/components/copy-link-button.tsx`
  - Botao client-side para copiar links e exibir toast.
- Modify: `apps/web/src/app/(app)/campanhas/page.tsx`
  - Trocar lista atual por cards operacionais de campanhas e melhorar criacao com selecao inicial de grupos.
- Create: `apps/web/src/app/(app)/campanhas/[id]/page.tsx`
  - Detalhe/cockpit da campanha com KPIs, link mestre e cards de grupos.

---

### Task 1: Helper de Visao Operacional

**Files:**
- Create: `apps/web/src/lib/campaign-groups-overview.ts`
- Create: `apps/web/src/lib/campaign-groups-overview.test.ts`

- [ ] **Step 1: Write the failing helper test**

Create `apps/web/src/lib/campaign-groups-overview.test.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildCampaignGroupsOverview,
  getCampaignGroupStatus,
  type CampaignGroupsOverviewInput,
} from "./campaign-groups-overview";

const baseGroups = [
  {
    id: "g1",
    whatsappGroupId: "g1",
    name: "Grupo 1",
    members: 100,
    capacity: 200,
    selected: false,
    engagement: "medio" as const,
    inviteUrl: "https://chat.whatsapp.com/one",
  },
  {
    id: "g2",
    whatsappGroupId: "g2",
    name: "Grupo 2",
    members: 195,
    capacity: 200,
    selected: false,
    engagement: "medio" as const,
    inviteUrl: "https://chat.whatsapp.com/two",
  },
  {
    id: "g3",
    whatsappGroupId: "g3",
    name: "Grupo 3",
    members: 50,
    capacity: 200,
    selected: false,
    engagement: "medio" as const,
  },
];

const input: CampaignGroupsOverviewInput = {
  campaign: {
    id: "c1",
    name: "Inverno",
    loja: "Virei Moda",
    groupIds: ["g1", "g2", "g3"],
    slug: "inverno",
    createdAt: "2026-06-25T00:00:00.000Z",
  },
  groups: baseGroups,
  clicks: 12,
};

const overview = buildCampaignGroupsOverview(input);

assert.equal(getCampaignGroupStatus(baseGroups[0]), "available");
assert.equal(getCampaignGroupStatus(baseGroups[1]), "full");
assert.equal(getCampaignGroupStatus(baseGroups[2]), "missing_invite");
assert.equal(overview.groupCount, 3);
assert.equal(overview.availableCount, 1);
assert.equal(overview.fullCount, 1);
assert.equal(overview.missingInviteCount, 1);
assert.equal(overview.totalMembers, 345);
assert.equal(overview.totalCapacity, 600);
assert.equal(overview.fillPct, 58);
assert.equal(overview.operationalStatus, "ready");
assert.equal(overview.primaryAction.kind, "copy_link");
assert.equal(overview.masterLink, "/r/inverno");
assert.equal(overview.clicks, 12);

const emptyOverview = buildCampaignGroupsOverview({
  campaign: { ...input.campaign, groupIds: [] },
  groups: baseGroups,
});
assert.equal(emptyOverview.operationalStatus, "empty");
assert.equal(emptyOverview.primaryAction.kind, "choose_groups");

const missingInviteOverview = buildCampaignGroupsOverview({
  campaign: { ...input.campaign, groupIds: ["g3"] },
  groups: baseGroups,
});
assert.equal(missingInviteOverview.operationalStatus, "needs_invites");
assert.equal(missingInviteOverview.primaryAction.kind, "configure_invites");

const fullOverview = buildCampaignGroupsOverview({
  campaign: { ...input.campaign, groupIds: ["g2"] },
  groups: baseGroups,
});
assert.equal(fullOverview.operationalStatus, "full");
assert.equal(fullOverview.primaryAction.kind, "add_groups");

console.log("campaign-groups-overview tests passed");
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```bash
npm --workspace apps/web exec tsx src/lib/campaign-groups-overview.test.ts
```

Expected: FAIL because `src/lib/campaign-groups-overview.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `apps/web/src/lib/campaign-groups-overview.ts`:

```ts
import type { Group } from "@/lib/mock-data";
import type { Campanha } from "@/lib/campanhas-store";
import { GROUP_FULL_RATIO } from "@/lib/groups-store";

export type CampaignGroupStatus = "available" | "full" | "missing_invite" | "unknown";
export type CampaignOperationalStatus = "empty" | "needs_invites" | "ready" | "full";
export type CampaignPrimaryAction =
  | { kind: "choose_groups"; label: "Escolher grupos"; href: string }
  | { kind: "configure_invites"; label: "Configurar convites"; href: string }
  | { kind: "copy_link"; label: "Copiar link da campanha"; href: string }
  | { kind: "add_groups"; label: "Adicionar grupos"; href: string };

export type CampaignGroupOverview = {
  group: Group;
  status: CampaignGroupStatus;
  fillPct: number;
};

export type CampaignGroupsOverviewInput = {
  campaign: Campanha;
  groups: Group[];
  clicks?: number;
};

export type CampaignGroupsOverview = {
  campaign: Campanha;
  masterLink: string;
  groups: CampaignGroupOverview[];
  groupCount: number;
  totalMembers: number;
  totalCapacity: number;
  fillPct: number;
  availableCount: number;
  fullCount: number;
  missingInviteCount: number;
  clicks: number | null;
  operationalStatus: CampaignOperationalStatus;
  primaryAction: CampaignPrimaryAction;
};

export function getCampaignGroupStatus(group: Group | undefined): CampaignGroupStatus {
  if (!group) return "unknown";
  if (!group.inviteUrl) return "missing_invite";
  if (group.members >= group.capacity * GROUP_FULL_RATIO) return "full";
  return "available";
}

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.min(100, Math.round((numerator / denominator) * 100));
}

function masterLinkFor(campaign: Campanha): string {
  return campaign.slug ? `/r/${campaign.slug}` : "";
}

function primaryActionFor(
  status: CampaignOperationalStatus,
  campaignId: string,
  masterLink: string,
): CampaignPrimaryAction {
  if (status === "empty") return { kind: "choose_groups", label: "Escolher grupos", href: `/campanhas/${campaignId}` };
  if (status === "needs_invites") return { kind: "configure_invites", label: "Configurar convites", href: `/campanhas/${campaignId}` };
  if (status === "full") return { kind: "add_groups", label: "Adicionar grupos", href: `/campanhas/${campaignId}` };
  return { kind: "copy_link", label: "Copiar link da campanha", href: masterLink };
}

export function buildCampaignGroupsOverview(input: CampaignGroupsOverviewInput): CampaignGroupsOverview {
  const byId = new Map(input.groups.map((group) => [group.whatsappGroupId, group]));
  const campaignGroups = input.campaign.groupIds
    .map((id) => byId.get(id))
    .filter((group): group is Group => Boolean(group));

  const groups = campaignGroups.map((group) => ({
    group,
    status: getCampaignGroupStatus(group),
    fillPct: pct(group.members, group.capacity),
  }));

  const groupCount = groups.length;
  const totalMembers = groups.reduce((sum, item) => sum + item.group.members, 0);
  const totalCapacity = groups.reduce((sum, item) => sum + item.group.capacity, 0);
  const availableCount = groups.filter((item) => item.status === "available").length;
  const fullCount = groups.filter((item) => item.status === "full").length;
  const missingInviteCount = groups.filter((item) => item.status === "missing_invite").length;
  const operationalStatus: CampaignOperationalStatus =
    groupCount === 0 ? "empty" : availableCount > 0 ? "ready" : missingInviteCount > 0 ? "needs_invites" : "full";
  const masterLink = masterLinkFor(input.campaign);

  return {
    campaign: input.campaign,
    masterLink,
    groups,
    groupCount,
    totalMembers,
    totalCapacity,
    fillPct: pct(totalMembers, totalCapacity),
    availableCount,
    fullCount,
    missingInviteCount,
    clicks: input.clicks ?? null,
    operationalStatus,
    primaryAction: primaryActionFor(operationalStatus, input.campaign.id, masterLink),
  };
}
```

- [ ] **Step 4: Run the helper test**

Run:

```bash
npm --workspace apps/web exec tsx src/lib/campaign-groups-overview.test.ts
```

Expected: PASS and output `campaign-groups-overview tests passed`.

- [ ] **Step 5: Commit**

Run:

```bash
git add apps/web/src/lib/campaign-groups-overview.ts apps/web/src/lib/campaign-groups-overview.test.ts
git commit -m "feat: add campaign groups overview helper"
```

---

### Task 2: Copy Link Button

**Files:**
- Create: `apps/web/src/components/copy-link-button.tsx`

- [ ] **Step 1: Create the client component**

Create `apps/web/src/components/copy-link-button.tsx`:

```tsx
"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/toast";

export function CopyLinkButton({
  value,
  label = "Copiar",
  disabledLabel = "Sem link",
  size = "sm",
}: {
  value: string;
  label?: string;
  disabledLabel?: string;
  size?: "sm" | "md";
}) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const disabled = !value;

  async function copy() {
    if (disabled) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast("Link copiado");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast("Nao foi possivel copiar o link", "error");
    }
  }

  return (
    <Button type="button" variant="outline" size={size} onClick={copy} disabled={disabled}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {disabled ? disabledLabel : copied ? "Copiado" : label}
    </Button>
  );
}
```

- [ ] **Step 2: Run lint**

Run:

```bash
npm --workspace apps/web run lint
```

Expected: PASS or only pre-existing warnings unrelated to `copy-link-button.tsx`.

- [ ] **Step 3: Commit**

Run:

```bash
git add apps/web/src/components/copy-link-button.tsx
git commit -m "feat: add copy link button"
```

---

### Task 3: Lista de Campanhas em Cards Operacionais

**Files:**
- Modify: `apps/web/src/app/(app)/campanhas/page.tsx`

- [ ] **Step 1: Add imports**

Modify the imports in `apps/web/src/app/(app)/campanhas/page.tsx` so the page can render campaign cards:

```tsx
import Link from "next/link";
import { useEffect, useState } from "react";
import { Copy, Plus, Trash2, Check, Store, Users, CheckCircle2, ChevronDown, ExternalLink } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type Group } from "@/lib/mock-data";
import { buildCampaignGroupsOverview } from "@/lib/campaign-groups-overview";
import { useCampanhas, type Campanha } from "@/lib/use-campanhas";
import { getActiveCampanhaId, setActiveCampanhaId } from "@/lib/active-campanha";
import { useToast } from "@/components/toast";
import { cn } from "@/lib/utils";
```

- [ ] **Step 2: Add initial group selection state**

Inside `CampanhasPage`, add state for selected groups during creation:

```tsx
const [selectedNewGroupIds, setSelectedNewGroupIds] = useState<string[]>([]);
const [query, setQuery] = useState("");
```

- [ ] **Step 3: Update create campaign payload**

Change `criar()` to include initial groups and reset them:

```tsx
async function criar() {
  if (!name.trim()) return;
  const response = await fetch("/api/campanhas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, loja: loja || "Minha loja", groupIds: selectedNewGroupIds }),
  });
  const created = await response.json().catch(() => null);
  setName("");
  setLoja("");
  setSelectedNewGroupIds([]);
  setOpen(false);
  await reload();
  toast("Campanha criada");
  if (created?.id) {
    setActiveCampanhaId(created.id);
    setActiveId(created.id);
  }
}
```

- [ ] **Step 4: Add helper functions for create form**

Add these functions inside `CampanhasPage`:

```tsx
function toggleNewGroup(groupId: string) {
  setSelectedNewGroupIds((prev) => (prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]));
}

const filteredGroupsForCreate = groups.filter((group) => group.name.toLowerCase().includes(query.toLowerCase()));
```

- [ ] **Step 5: Replace the create form card content**

Inside the `open && <Card>` block, use this `CardContent`:

```tsx
<CardContent className="space-y-4">
  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
    <Input placeholder="Nome da campanha (ex: Grupos VIP Inverno)" value={name} onChange={(e) => setName(e.target.value)} className="sm:col-span-2" />
    <Input placeholder="Loja (ex: Virei Moda)" value={loja} onChange={(e) => setLoja(e.target.value)} />
  </div>
  <div>
    <div className="mb-2 flex items-center justify-between gap-3">
      <p className="text-sm font-medium text-slate-700">Grupos iniciais</p>
      <span className="text-xs text-slate-400">{selectedNewGroupIds.length} selecionado(s)</span>
    </div>
    <Input placeholder="Buscar grupo..." value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
      {filteredGroupsForCreate.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">Nenhum grupo sincronizado.</p>}
      {filteredGroupsForCreate.map((group) => {
        const on = selectedNewGroupIds.includes(group.id);
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => toggleNewGroup(group.id)}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
          >
            <span className={cn("flex h-4 w-4 items-center justify-center rounded border-2", on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300")}>
              {on && <Check className="h-3 w-3" />}
            </span>
            <span className="flex-1 truncate text-sm text-slate-700">{group.name}</span>
            <span className="text-xs text-slate-400">{group.members}/{group.capacity}</span>
          </button>
        );
      })}
    </div>
  </div>
  <Button className="w-full" onClick={criar} disabled={!name.trim()}>
    Criar campanha
  </Button>
</CardContent>
```

- [ ] **Step 6: Render campaign cards using the overview helper**

In the existing `cs.map((c) => { ... })`, compute:

```tsx
const overview = buildCampaignGroupsOverview({ campaign: c, groups });
const isActive = activeId === c.id;
const masterLink = typeof window === "undefined" ? overview.masterLink : `${window.location.origin}${overview.masterLink}`;
```

Use a card body with these visible blocks:

```tsx
<div className="flex flex-col gap-4">
  <div className="flex flex-wrap items-start justify-between gap-3">
    <div>
      <p className="flex items-center gap-2 font-medium text-slate-900">
        {c.name}
        {isActive && <Badge tone="brand"><CheckCircle2 className="h-3 w-3" /> ativa</Badge>}
      </p>
      <p className="mt-0.5 text-xs text-slate-400">{c.loja}</p>
    </div>
    <div className="flex items-center gap-2">
      {!isActive && <Button size="sm" variant="outline" onClick={() => ativar(c.id)}>Ativar</Button>}
      <Link href={`/campanhas/${c.id}`}>
        <Button size="sm">
          <ExternalLink className="h-3.5 w-3.5" />
          Ver campanha
        </Button>
      </Link>
      <button onClick={() => excluir(c.id)} className="rounded-md p-1.5 text-slate-300 hover:bg-red-50 hover:text-red-600">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  </div>
  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
    <p className="mb-1 text-xs font-medium text-slate-500">Link da campanha</p>
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-1.5 text-xs text-slate-600">{overview.masterLink || "Sem slug"}</code>
      <button
        type="button"
        onClick={() => navigator.clipboard.writeText(masterLink).then(() => toast("Link copiado")).catch(() => toast("Nao foi possivel copiar", "error"))}
        className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:text-brand-600"
        aria-label="Copiar link da campanha"
      >
        <Copy className="h-4 w-4" />
      </button>
    </div>
  </div>
  <div>
    <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
      <span>Preenchimento dos grupos</span>
      <span>{overview.fillPct}%</span>
    </div>
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-brand-600" style={{ width: `${overview.fillPct}%` }} />
    </div>
  </div>
  <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
    <CampaignMetric label="Grupos" value={overview.groupCount} />
    <CampaignMetric label="Limite" value={overview.totalCapacity.toLocaleString("pt-BR")} />
    <CampaignMetric label="Membros" value={overview.totalMembers.toLocaleString("pt-BR")} />
    <CampaignMetric label="Disponiveis" value={overview.availableCount} />
  </div>
</div>
```

Add the local metric component at the end of the file:

```tsx
function CampaignMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-0.5 font-semibold text-slate-900">{value}</p>
    </div>
  );
}
```

- [ ] **Step 7: Run lint and build**

Run:

```bash
npm --workspace apps/web run lint
npm --workspace apps/web run build
```

Expected: both PASS.

- [ ] **Step 8: Commit**

Run:

```bash
git add apps/web/src/app/\(app\)/campanhas/page.tsx
git commit -m "feat: show campaign operational cards"
```

---

### Task 4: Campaign Detail Page

**Files:**
- Create: `apps/web/src/app/(app)/campanhas/[id]/page.tsx`

- [ ] **Step 1: Create the detail page**

Create `apps/web/src/app/(app)/campanhas/[id]/page.tsx`:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users, Link2, AlertTriangle } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyLinkButton } from "@/components/copy-link-button";
import { campanhasColl, ensureSlugs } from "@/lib/campanhas-store";
import { listGroups } from "@/lib/groups-store";
import { getClickAnalytics } from "@/lib/clicks-analytics";
import { buildCampaignGroupsOverview, type CampaignGroupStatus } from "@/lib/campaign-groups-overview";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const statusTone: Record<CampaignGroupStatus, "green" | "amber" | "red" | "slate"> = {
  available: "green",
  full: "red",
  missing_invite: "amber",
  unknown: "slate",
};

const statusLabel: Record<CampaignGroupStatus, string> = {
  available: "Disponivel",
  full: "Cheio",
  missing_invite: "Sem convite",
  unknown: "Indisponivel",
};

export default async function CampanhaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureSlugs();
  const [campaigns, groups] = await Promise.all([campanhasColl.list(), listGroups()]);
  const campaign = campaigns.find((item) => item.id === id);
  if (!campaign) notFound();

  const clicks = campaign.slug ? (await getClickAnalytics(campaign.slug)).total : null;
  const overview = buildCampaignGroupsOverview({ campaign, groups, clicks: clicks ?? undefined });
  const masterLink = overview.masterLink;

  return (
    <>
      <Topbar title={campaign.name} subtitle="Campanha de grupos, link mestre e capacidade" />
      <main className="flex-1 bg-slate-50/70 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/campanhas" className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-slate-900">
              <ArrowLeft className="h-4 w-4" />
              Voltar para campanhas
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/campaigns" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Mensagens
              </Link>
              <Link href="/schedules" className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
                Agendamentos
              </Link>
            </div>
          </div>

          <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-card">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold text-slate-950">{campaign.name}</h1>
                  <Badge tone={overview.operationalStatus === "ready" ? "green" : overview.operationalStatus === "full" ? "red" : "amber"}>
                    {overview.operationalStatus === "ready" ? "Pronta" : overview.operationalStatus === "full" ? "Lotada" : overview.operationalStatus === "empty" ? "Sem grupos" : "Precisa de convite"}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-500">{campaign.loja}</p>
              </div>
              <CopyLinkButton value={masterLink} label={overview.primaryAction.label} />
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="mb-1 text-xs font-medium text-slate-500">Link da campanha</p>
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-white px-2 py-2 text-xs text-slate-700">{masterLink || "Sem link disponivel"}</code>
                <CopyLinkButton value={masterLink} label="Copiar" />
              </div>
            </div>
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Kpi label="Cliques" value={overview.clicks ?? "--"} />
            <Kpi label="Entraram" value="--" muted />
            <Kpi label="Sairam" value="--" muted />
            <Kpi label="Participantes" value={overview.totalMembers.toLocaleString("pt-BR")} />
            <Kpi label="Grupos" value={overview.groupCount} />
            <Kpi label="Disponiveis" value={overview.availableCount} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-400" />
                Grupos da campanha
              </CardTitle>
            </CardHeader>
            <CardContent>
              {overview.groups.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center">
                  <p className="font-medium text-slate-800">A campanha ainda nao tem grupos.</p>
                  <p className="mt-1 text-sm text-slate-500">Escolha grupos para que o link possa receber novas revendedoras.</p>
                  <Link href="/campanhas" className="mt-4 inline-flex h-9 items-center justify-center rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white hover:bg-brand-700">
                    Escolher grupos
                  </Link>
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  {overview.groups.map((item) => (
                    <GroupCard key={item.group.id} item={item} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function Kpi({ label, value, muted = false }: { label: string; value: string | number; muted?: boolean }) {
  return (
    <Card className="p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold", muted ? "text-slate-400" : "text-slate-950")}>{value}</p>
    </Card>
  );
}

function GroupCard({ item }: { item: ReturnType<typeof buildCampaignGroupsOverview>["groups"][number] }) {
  const tone = statusTone[item.status];
  const bar = item.status === "full" ? "bg-red-500" : item.status === "missing_invite" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{item.group.name}</p>
          <p className="mt-1 truncate text-xs text-slate-400">{item.group.whatsappGroupId}</p>
        </div>
        <Badge tone={tone}>{statusLabel[item.status]}</Badge>
      </div>
      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
          <span>Capacidade</span>
          <span>{item.fillPct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
          <div className={cn("h-full rounded-full", bar)} style={{ width: `${item.fillPct}%` }} />
        </div>
        <p className="mt-1 text-xs text-slate-500">
          {item.group.members.toLocaleString("pt-BR")} / {item.group.capacity.toLocaleString("pt-BR")} membros
        </p>
      </div>
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-2">
        {item.group.inviteUrl ? (
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-slate-400" />
            <code className="min-w-0 flex-1 truncate text-xs text-slate-600">{item.group.inviteUrl}</code>
            <CopyLinkButton value={item.group.inviteUrl} label="Copiar" />
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <AlertTriangle className="h-4 w-4" />
            Adicione um convite para este grupo receber visitantes.
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run lint/build**

Run:

```bash
npm --workspace apps/web run lint
npm --workspace apps/web run build
```

Expected: PASS.

- [ ] **Step 3: Commit**

Run:

```bash
git add apps/web/src/app/\(app\)/campanhas/\[id\]/page.tsx
git commit -m "feat: add campaign groups detail page"
```

---

### Task 5: Manual QA and Polish

**Files:**
- Modify if needed: `apps/web/src/app/(app)/campanhas/page.tsx`
- Modify if needed: `apps/web/src/app/(app)/campanhas/[id]/page.tsx`
- Modify if needed: `apps/web/src/lib/campaign-groups-overview.ts`

- [ ] **Step 1: Run all verification commands**

Run:

```bash
npm --workspace apps/web exec tsx src/lib/campaign-groups-overview.test.ts
npm --workspace apps/web run lint
npm --workspace apps/web run build
```

Expected:

- test prints `campaign-groups-overview tests passed`;
- lint exits 0;
- build exits 0.

- [ ] **Step 2: Start the dev server**

Run:

```bash
npm run web:dev
```

Expected: Next.js starts on `http://localhost:3000` or another available port.

- [ ] **Step 3: Verify pages manually**

In the browser, verify:

- `/campanhas` shows cards instead of a thin list.
- Campaign cards show link, metrics, fill bar, active badge and `Ver campanha`.
- `Nova campanha` allows selecting groups before saving.
- `/campanhas/[id]` opens for an existing campaign.
- Detail page shows KPIs, master link, and group cards.
- Missing invite groups show `Sem convite`.
- Full groups show `Cheio`.
- Available groups show `Disponivel`.
- Copy buttons show a success toast.
- Mobile width around 390px does not overlap text or buttons.

- [ ] **Step 4: Commit polish fixes**

If Step 3 required changes, commit them:

```bash
git add apps/web/src/app/\(app\)/campanhas/page.tsx apps/web/src/app/\(app\)/campanhas/\[id\]/page.tsx apps/web/src/lib/campaign-groups-overview.ts
git commit -m "fix: polish campaign groups cockpit"
```

If no changes were needed, do not create an empty commit.
