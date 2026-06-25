"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Plus,
  Search,
  Store,
  Trash2,
  Users,
} from "lucide-react";
import { CopyLinkButton } from "@/components/copy-link-button";
import { Topbar } from "@/components/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";
import { getActiveCampanhaId, setActiveCampanhaId } from "@/lib/active-campanha";
import {
  buildCampaignGroupsOverview,
  type CampaignGroupsOverview,
  type CampaignOperationalStatus,
  type CampaignPrimaryAction,
} from "@/lib/campaign-groups-overview";
import { getCreateWizardGroups } from "@/lib/campaign-create-wizard";
import { getCampaignNextStep } from "@/lib/campaign-next-step";
import { getGroupDisplayName, hasInternalGroupName } from "@/lib/group-display-name";
import { type Group } from "@/lib/mock-data";
import { useCampanhas, type Campanha } from "@/lib/use-campanhas";
import { cn } from "@/lib/utils";

type CampanhaWithSlug = Campanha & { slug?: string };
type FilterStatus = "all" | CampaignOperationalStatus;

const statusCopy: Record<CampaignOperationalStatus, { label: string; tone: "green" | "amber" | "red" | "slate" }> = {
  empty: { label: "Sem grupos", tone: "slate" },
  ready: { label: "Pronta", tone: "green" },
  needs_invites: { label: "Precisa de convites", tone: "amber" },
  full: { label: "Grupos cheios", tone: "red" },
};

const filters: Array<{ value: FilterStatus; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "ready", label: "Prontas" },
  { value: "needs_invites", label: "Sem convite" },
  { value: "full", label: "Cheias" },
  { value: "empty", label: "Sem grupos" },
];

export default function CampanhasPage() {
  const toast = useToast();
  const { campanhas, reload, loaded } = useCampanhas();
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const [loja, setLoja] = useState("");
  const [openCreate, setOpenCreate] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [createGroupQuery, setCreateGroupQuery] = useState("");
  const [selectedCreateGroupIds, setSelectedCreateGroupIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterStatus>("all");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setActiveId(getActiveCampanhaId());
    setOrigin(window.location.origin);
    fetch("/api/groups").then((r) => r.json()).then(setGroups).catch(() => {});
  }, []);

  const overviews = useMemo(() => {
    return (campanhas as CampanhaWithSlug[]).map((campaign) =>
      buildCampaignGroupsOverview({ campaign, groups, clicks: 0 }),
    );
  }, [campanhas, groups]);

  const filteredOverviews = useMemo(() => {
    const q = query.trim().toLowerCase();
    return overviews.filter((overview) => {
      const matchesQuery =
        !q ||
        overview.campaign.name.toLowerCase().includes(q) ||
        (overview.campaign.loja ?? "").toLowerCase().includes(q);
      const matchesStatus = filter === "all" || overview.operationalStatus === filter;
      return matchesQuery && matchesStatus;
    });
  }, [filter, overviews, query]);

  const totals = useMemo(() => {
    return overviews.reduce(
      (acc, overview) => ({
        campanhas: acc.campanhas + 1,
        grupos: acc.grupos + overview.groupCount,
        disponiveis: acc.disponiveis + overview.availableCount,
        membros: acc.membros + overview.totalMembers,
      }),
      { campanhas: 0, grupos: 0, disponiveis: 0, membros: 0 },
    );
  }, [overviews]);

  const createWizardGroups = useMemo(() => getCreateWizardGroups(groups), [groups]);
  const filteredCreateGroups = useMemo(() => {
    const q = createGroupQuery.trim().toLowerCase();
    return createWizardGroups.available.filter((group) => !q || group.name.toLowerCase().includes(q));
  }, [createGroupQuery, createWizardGroups.available]);

  async function criar() {
    if (!name.trim() || selectedCreateGroupIds.length === 0) return;
    await fetch("/api/campanhas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, loja: loja || "Minha loja", groupIds: selectedCreateGroupIds }),
    });
    resetCreateWizard();
    await reload();
    toast("Campanha criada com grupos escolhidos.");
  }

  function resetCreateWizard() {
    setName("");
    setLoja("");
    setCreateStep(1);
    setCreateGroupQuery("");
    setSelectedCreateGroupIds([]);
    setOpenCreate(false);
  }

  function toggleCreateWizard() {
    if (openCreate) {
      resetCreateWizard();
      return;
    }
    setOpenCreate(true);
  }

  function toggleCreateGroup(groupId: string) {
    setSelectedCreateGroupIds((current) =>
      current.includes(groupId) ? current.filter((id) => id !== groupId) : [...current, groupId],
    );
  }

  async function toggleGrupo(c: CampanhaWithSlug, groupId: string) {
    const groupIds = c.groupIds.includes(groupId)
      ? c.groupIds.filter((x) => x !== groupId)
      : [...c.groupIds, groupId];
    await fetch("/api/campanhas", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: c.id, groupIds }),
    });
    await reload();
  }

  async function excluir(id: string) {
    if (!confirm("Excluir esta campanha? Os grupos nao serao apagados.")) return;
    await fetch(`/api/campanhas?id=${id}`, { method: "DELETE" });
    if (activeId === id) {
      setActiveCampanhaId(null);
      setActiveId(null);
    }
    await reload();
  }

  function ativar(id: string) {
    setActiveCampanhaId(id);
    setActiveId(id);
    toast("Campanha ativada. O app agora opera os grupos dela.");
    setTimeout(() => location.reload(), 600);
  }

  function expandForAction(action: CampaignPrimaryAction, id: string) {
    if (action.kind === "copy_link") return;
    setExpanded((current) => (current === id ? null : id));
  }

  return (
    <>
      <Topbar title="Campanhas de grupos" subtitle="Controle links, ocupacao e grupos de cada campanha" />
      <main className="flex-1 space-y-5 p-6">
        <section className="rounded-xl border border-brand-200 bg-white p-4 shadow-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Painel operacional</p>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Cada campanha tem um link mestre. O HUBFLOW envia a revendedora para um grupo disponivel,
                evita grupo cheio e mostra onde voce precisa corrigir convites.
              </p>
            </div>
            <Button size="sm" onClick={toggleCreateWizard}>
              <Plus className="h-4 w-4" />
              Nova campanha
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <MiniStat label="Campanhas" value={totals.campanhas} />
            <MiniStat label="Grupos" value={totals.grupos} />
            <MiniStat label="Disponiveis" value={totals.disponiveis} />
            <MiniStat label="Membros" value={totals.membros.toLocaleString("pt-BR")} />
          </div>
        </section>

        {openCreate && (
          <Card>
            <CardHeader>
              <CardTitle>Nova campanha</CardTitle>
              <p className="text-sm text-slate-500">
                Passo {createStep} de 2: {createStep === 1 ? "diga o nome" : "escolha os grupos"}
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <div className={cn("h-1.5 rounded-full", createStep >= 1 ? "bg-brand-600" : "bg-slate-200")} />
                <div className={cn("h-1.5 rounded-full", createStep >= 2 ? "bg-brand-600" : "bg-slate-200")} />
              </div>

              {createStep === 1 ? (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Nome da campanha</label>
                    <Input
                      placeholder="Ex: Grupos VIP Inverno"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">Loja</label>
                    <Input placeholder="Ex: Virei Moda" value={loja} onChange={(e) => setLoja(e.target.value)} />
                  </div>
                  <div className="flex flex-col gap-2 sm:col-span-3 sm:flex-row sm:justify-end">
                    <Button variant="outline" onClick={resetCreateWizard}>
                      Cancelar
                    </Button>
                    <Button onClick={() => setCreateStep(2)} disabled={!name.trim()}>
                      Continuar
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4">
                    <p className="text-sm font-semibold text-slate-950">Escolha os grupos que vao receber novas revendedoras</p>
                    <p className="mt-1 text-sm text-slate-600">
                      Mostramos primeiro apenas grupos com convite e vaga. Isso evita erro na divulgacao.
                    </p>
                  </div>

                  <label className="relative block">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      aria-label="Buscar grupo para campanha"
                      value={createGroupQuery}
                      onChange={(e) => setCreateGroupQuery(e.target.value)}
                      placeholder="Buscar grupo..."
                      className="pl-9"
                    />
                  </label>

                  {createWizardGroups.available.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                      Nenhum grupo pronto para usar. Sincronize grupos ou corrija convites antes de criar a campanha.
                    </div>
                  )}

                  {createWizardGroups.available.length > 0 && filteredCreateGroups.length === 0 && (
                    <div className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500">
                      Nenhum grupo encontrado com essa busca.
                    </div>
                  )}

                  <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                    {filteredCreateGroups.map((group) => (
                      <CreateWizardGroupOption
                        key={group.id}
                        group={group}
                        selected={selectedCreateGroupIds.includes(group.id)}
                        onToggle={() => toggleCreateGroup(group.id)}
                      />
                    ))}
                  </div>

                  {createWizardGroups.needsAttention.length > 0 && (
                    <p className="text-xs text-slate-400">
                      {createWizardGroups.needsAttention.length} grupo(s) ficaram de fora por estarem cheios ou sem convite.
                    </p>
                  )}

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-slate-500">
                      {selectedCreateGroupIds.length} grupo(s) selecionado(s)
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <Button variant="outline" onClick={() => setCreateStep(1)}>
                        Voltar
                      </Button>
                      <Button onClick={criar} disabled={selectedCreateGroupIds.length === 0}>
                        Criar campanha
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-card lg:flex-row lg:items-center">
          <label className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Pesquisar campanha ou loja..."
              className="pl-9"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition",
                  filter === item.value
                    ? "bg-slate-900 text-white"
                    : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {!loaded && (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={`sk-${i}`} className="p-5">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="mt-4 h-3 w-full" />
                <Skeleton className="mt-5 h-20 w-full" />
              </Card>
            ))}
          </div>
        )}

        {loaded && overviews.length === 0 && (
          <Card className="p-8 text-center">
            <p className="text-base font-semibold text-slate-900">Nenhuma campanha ainda</p>
            <p className="mt-1 text-sm text-slate-500">Crie a primeira campanha e escolha os grupos da sua loja.</p>
            <Button className="mt-4" onClick={() => setOpenCreate(true)}>
              <Plus className="h-4 w-4" />
              Criar campanha
            </Button>
          </Card>
        )}

        {loaded && overviews.length > 0 && filteredOverviews.length === 0 && (
          <Card className="p-8 text-center text-sm text-slate-500">Nenhuma campanha encontrada com esse filtro.</Card>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {filteredOverviews.map((overview) => (
            <CampaignCard
              key={overview.campaign.id}
              overview={overview}
              groups={groups}
              active={activeId === overview.campaign.id}
              origin={origin}
              expanded={expanded === overview.campaign.id}
              onActivate={() => ativar(overview.campaign.id)}
              onDelete={() => excluir(overview.campaign.id)}
              onToggleExpand={() => setExpanded((current) => (current === overview.campaign.id ? null : overview.campaign.id))}
              onPrimaryAction={() => expandForAction(overview.primaryAction, overview.campaign.id)}
              onToggleGroup={(groupId) => toggleGrupo(overview.campaign as CampanhaWithSlug, groupId)}
            />
          ))}
        </div>
      </main>
    </>
  );
}

function CampaignCard({
  overview,
  groups,
  active,
  origin,
  expanded,
  onActivate,
  onDelete,
  onToggleExpand,
  onPrimaryAction,
  onToggleGroup,
}: {
  overview: CampaignGroupsOverview;
  groups: Group[];
  active: boolean;
  origin: string;
  expanded: boolean;
  onActivate: () => void;
  onDelete: () => void;
  onToggleExpand: () => void;
  onPrimaryAction: () => void;
  onToggleGroup: (groupId: string) => void;
}) {
  const status = statusCopy[overview.operationalStatus];
  const fillTone = getFillTone(overview.operationalStatus);
  const masterLink = overview.masterLink;
  const copyLink = origin && masterLink ? `${origin}${masterLink}` : "";
  const nextStep = getCampaignNextStep(overview.operationalStatus);

  return (
    <Card className={cn("overflow-hidden", active && "ring-2 ring-brand-500/30")}>
      <CardContent className="p-5">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={status.tone}>{status.label}</Badge>
                {active && (
                  <Badge tone="brand">
                    <CheckCircle2 className="h-3 w-3" />
                    Ativa
                  </Badge>
                )}
              </div>
              <h2 className="mt-3 truncate text-lg font-semibold text-slate-950">{overview.campaign.name}</h2>
              <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                <Store className="h-3.5 w-3.5" />
                {overview.campaign.loja || "Minha loja"}
              </p>
            </div>
            <div className="flex items-center gap-1">
              {!active && (
                <Button size="sm" variant="ghost" onClick={onActivate}>
                  Ativar
                </Button>
              )}
              <button
                type="button"
                onClick={onDelete}
                className="rounded-md p-2 text-slate-300 transition hover:bg-red-50 hover:text-red-600"
                aria-label="Excluir campanha"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-brand-200 bg-brand-50/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Proximo passo</p>
            <p className="mt-2 text-base font-semibold text-slate-950">{nextStep.title}</p>
            <p className="mt-1 text-sm text-slate-600">{nextStep.description}</p>
            <div className="mt-3">
              {overview.primaryAction.kind === "copy_link" ? (
                <CopyLinkButton url={copyLink} disabled={!copyLink} variant="primary" label={nextStep.actionLabel} />
              ) : (
                <Button size="sm" onClick={onPrimaryAction}>
                  {nextStep.actionLabel}
                  <ChevronDown className={cn("h-4 w-4 transition", expanded && "rotate-180")} />
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Link da campanha</p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                {masterLink || "Link sendo preparado"}
              </code>
              <CopyLinkButton url={copyLink} disabled={!copyLink} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700">Ocupacao dos grupos</span>
              <span className="font-semibold text-slate-900">{overview.fillPct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={cn("h-full rounded-full", fillTone)} style={{ width: `${Math.min(100, overview.fillPct)}%` }} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric label="Grupos" value={overview.groupCount} />
            <Metric label="Disponiveis" value={overview.availableCount} />
            <Metric label="Cheios" value={overview.fullCount} />
            <Metric label="Membros" value={overview.totalMembers.toLocaleString("pt-BR")} />
            <Metric label="Capacidade" value={overview.totalCapacity.toLocaleString("pt-BR")} />
            <Metric label="Cliques" value={overview.clicks.toLocaleString("pt-BR")} />
          </div>

          {overview.operationalStatus !== "ready" && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{getStatusHint(overview.operationalStatus)}</span>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            {overview.primaryAction.kind === "copy_link" ? (
              <CopyLinkButton
                url={copyLink}
                disabled={!copyLink}
                className="sm:flex-1"
                variant="primary"
                label={nextStep.actionLabel}
              />
            ) : (
              <Button className="sm:flex-1" onClick={onPrimaryAction}>
                {nextStep.actionLabel}
                <ChevronDown className={cn("h-4 w-4 transition", expanded && "rotate-180")} />
              </Button>
            )}
            <Button variant="outline" className="sm:flex-1" onClick={onToggleExpand}>
              <Users className="h-4 w-4" />
              Grupos
              <ChevronDown className={cn("h-4 w-4 transition", expanded && "rotate-180")} />
            </Button>
            <Link
              href={`/campanhas/${overview.campaign.id}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
            >
              Ver detalhes
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {expanded && (
            <GroupPicker overview={overview} groups={groups} onToggleGroup={onToggleGroup} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function GroupPicker({
  overview,
  groups,
  onToggleGroup,
}: {
  overview: CampaignGroupsOverview;
  groups: Group[];
  onToggleGroup: (groupId: string) => void;
}) {
  const selected = new Set(overview.campaign.groupIds);

  return (
    <div className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
      {groups.length === 0 && (
        <p className="px-3 py-4 text-sm text-slate-400">Nenhum grupo sincronizado. Rode a engine para carregar grupos.</p>
      )}
      {[...groups].sort((a, b) => b.members - a.members).map((group) => {
        const on = selected.has(group.id);
        const status = group.inviteUrl ? (group.members >= group.capacity * 0.95 ? "cheio" : "disponivel") : "sem convite";
        return (
          <button
            key={group.id}
            type="button"
            onClick={() => onToggleGroup(group.id)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
          >
            <span
              className={cn(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2",
                on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300",
              )}
            >
              {on && <Check className="h-3.5 w-3.5" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-800">{getGroupDisplayName(group)}</span>
              <span className="text-xs text-slate-400">
                {hasInternalGroupName(group) ? `WhatsApp: ${group.name}` : `${group.members.toLocaleString("pt-BR")} de ${group.capacity.toLocaleString("pt-BR")} membros`}
              </span>
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                status === "disponivel" && "bg-green-50 text-green-700",
                status === "cheio" && "bg-red-50 text-red-700",
                status === "sem convite" && "bg-amber-50 text-amber-700",
              )}
            >
              {status}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function CreateWizardGroupOption({
  group,
  selected,
  onToggle,
}: {
  group: Group;
  selected: boolean;
  onToggle: () => void;
}) {
  const fillPct = group.capacity > 0 ? Math.round((group.members * 100) / group.capacity) : 0;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-slate-50"
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border-2",
          selected ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300",
        )}
      >
        {selected && <Check className="h-3.5 w-3.5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">{getGroupDisplayName(group)}</span>
        <span className="text-xs text-slate-400">
          {hasInternalGroupName(group) ? `WhatsApp: ${group.name}` : `${group.members.toLocaleString("pt-BR")} de ${group.capacity.toLocaleString("pt-BR")} membros`}
        </span>
      </span>
      <Badge tone="green">{fillPct}% ocupado</Badge>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function getStatusHint(status: CampaignOperationalStatus) {
  if (status === "empty") return "Escolha pelo menos um grupo para liberar o link da campanha.";
  if (status === "needs_invites") return "Existe grupo sem link de convite. Corrija antes de divulgar a campanha.";
  if (status === "full") return "Todos os grupos selecionados estao cheios. Adicione grupos para continuar recebendo leads.";
  return "";
}

function getFillTone(status: CampaignOperationalStatus) {
  if (status === "full") return "bg-red-500";
  if (status === "needs_invites") return "bg-amber-500";
  if (status === "empty") return "bg-slate-300";
  return "bg-brand-600";
}
