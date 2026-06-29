"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ExternalLink, Minus, Plus, Search, Store } from "lucide-react";
import { CopyLinkButton } from "@/components/copy-link-button";
import { Topbar } from "@/components/topbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { getActiveCampanhaId, setActiveCampanhaId } from "@/lib/active-campanha";
import {
  buildCampaignGroupsOverview,
  type CampaignGroupStatus,
  type CampaignOperationalStatus,
} from "@/lib/campaign-groups-overview";
import { getCampaignNextStep } from "@/lib/campaign-next-step";
import { getGroupDisplayName, hasInternalGroupName } from "@/lib/group-display-name";
import { type Group } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

type CampanhaWithSlug = {
  id: string;
  name: string;
  loja: string;
  groupIds: string[];
  slug?: string;
  createdAt: string;
};

const statusCopy: Record<CampaignOperationalStatus, { label: string; tone: "green" | "amber" | "red" | "slate" }> = {
  empty: { label: "Sem grupos", tone: "slate" },
  ready: { label: "Pronta", tone: "green" },
  needs_invites: { label: "Precisa de convites", tone: "amber" },
  full: { label: "Grupos cheios", tone: "red" },
};

const groupStatusCopy: Record<CampaignGroupStatus, { label: string; tone: "green" | "amber" | "red" | "slate" }> = {
  available: { label: "disponivel", tone: "green" },
  full: { label: "cheio", tone: "red" },
  missing_invite: { label: "sem convite", tone: "amber" },
  unknown: { label: "nao encontrado", tone: "slate" },
};

export default function CampanhaDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const toast = useToast();
  const [campanhas, setCampanhas] = useState<CampanhaWithSlug[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [savingGroupId, setSavingGroupId] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setActiveId(getActiveCampanhaId());
    setOrigin(window.location.origin);
    async function load() {
      try {
        const [campanhasResponse, groupsResponse] = await Promise.all([
          fetch("/api/campanhas"),
          fetch("/api/groups"),
        ]);
        const [campanhasData, groupsData] = await Promise.all([
          campanhasResponse.json(),
          groupsResponse.json(),
        ]);
        setCampanhas(Array.isArray(campanhasData) ? campanhasData : []);
        setGroups(Array.isArray(groupsData) ? groupsData : []);
      } catch {
        toast("Nao foi possivel carregar a campanha", "error");
      } finally {
        setLoaded(true);
      }
    }

    load();
  }, [toast]);

  const campanha = useMemo(() => campanhas.find((item) => item.id === id) ?? null, [campanhas, id]);

  const overview = useMemo(() => {
    if (!campanha) return null;
    return buildCampaignGroupsOverview({ campaign: campanha, groups, clicks: 0 });
  }, [campanha, groups]);

  const selectedIds = useMemo(() => new Set(campanha?.groupIds ?? []), [campanha]);
  const availableGroups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return groups
      .filter((group) => !selectedIds.has(group.id) && !selectedIds.has(group.whatsappGroupId))
      .filter((group) => !normalizedQuery || group.name.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => b.members - a.members);
  }, [groups, query, selectedIds]);

  async function patchGroupIds(nextGroupIds: string[], groupId: string) {
    if (!campanha || savingGroupId) return;
    setSavingGroupId(groupId);
    try {
      const response = await fetch("/api/campanhas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campanha.id, groupIds: nextGroupIds }),
      });
      if (!response.ok) throw new Error("PATCH failed");
      const updated = await response.json();
      setCampanhas((current) => current.map((item) => (item.id === campanha.id ? updated : item)));
    } catch {
      toast("Nao foi possivel atualizar os grupos", "error");
    } finally {
      setSavingGroupId(null);
    }
  }

  function addGroup(groupId: string) {
    if (!campanha || savingGroupId || campanha.groupIds.includes(groupId)) return;
    patchGroupIds([...campanha.groupIds, groupId], groupId);
  }

  function removeGroup(groupId: string) {
    if (!campanha || savingGroupId) return;
    patchGroupIds(campanha.groupIds.filter((item) => item !== groupId), groupId);
  }

  function activateCampaign() {
    if (!campanha) return;
    setActiveCampanhaId(campanha.id);
    setActiveId(campanha.id);
    toast("Campanha ativada. O app agora opera os grupos dela.");
  }

  function scrollToGroups() {
    document.getElementById("campaign-groups-workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!loaded) {
    return (
      <>
        <Topbar title="Campanha" subtitle="Carregando visao geral" />
        <main className="flex-1 space-y-5 p-6">
          <div className="h-6 w-40 rounded bg-bruma" />
          <Card className="p-6">
            <div className="h-6 w-72 rounded bg-bruma" />
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="h-20 rounded-lg bg-bruma" />
              ))}
            </div>
          </Card>
        </main>
      </>
    );
  }

  if (!campanha || !overview) {
    return (
      <>
        <Topbar title="Campanha nao encontrada" subtitle="Verifique se o link esta correto" />
        <main className="flex-1 p-6">
          <Card className="p-8 text-center">
            <p className="text-base font-semibold text-breu">Campanha nao encontrada</p>
            <p className="mt-1 text-sm text-aco/70">Esta campanha pode ter sido removida ou o link esta incorreto.</p>
            <Link
              href="/campanhas"
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-aco/30 bg-white px-4 text-sm font-medium text-aco transition hover:border-aco/50 hover:bg-bruma"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar para campanhas
            </Link>
          </Card>
        </main>
      </>
    );
  }

  const status = statusCopy[overview.operationalStatus];
  const isActive = activeId === campanha.id;
  const copyLink = origin && overview.masterLink ? `${origin}${overview.masterLink}` : "";
  const nextStep = getCampaignNextStep(overview.operationalStatus);

  return (
    <>
      <Topbar title={campanha.name} subtitle="Visao geral da campanha e grupos" />
      <main className="flex-1 space-y-5 p-6">
        <Link href="/campanhas" className="inline-flex items-center gap-2 text-sm font-medium text-aco/70 hover:text-breu">
          <ArrowLeft className="h-4 w-4" />
          Voltar para campanhas
        </Link>

        <section className="rounded-xl border border-iris/20 bg-white p-5 shadow-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={status.tone}>{status.label}</Badge>
                <Badge tone={isActive ? "brand" : "slate"}>
                  {isActive && <CheckCircle2 className="h-3 w-3" />}
                  {isActive ? "Ativa" : "Inativa"}
                </Badge>
              </div>
              <h1 className="mt-3 truncate text-2xl font-semibold tracking-tight text-breu">{campanha.name}</h1>
              <p className="mt-2 flex items-center gap-1 text-sm text-aco/70">
                <Store className="h-4 w-4" />
                {campanha.loja || "Minha loja"}
              </p>
            </div>
            {!isActive && (
              <Button onClick={activateCampaign}>
                <CheckCircle2 className="h-4 w-4" />
                Ativar campanha
              </Button>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-iris/20 bg-iris/10/70 p-5 shadow-card">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-iris-escuro">
                {overview.primaryAction.kind === "copy_link" ? "Central de divulgacao" : "Acao principal"}
              </p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-breu">{nextStep.title}</h2>
              <p className="mt-1 text-sm text-aco">{nextStep.description}</p>

              {overview.primaryAction.kind === "copy_link" && (
                <div className="mt-4 rounded-xl bg-white p-3 ring-1 ring-iris/10">
                  <p className="text-xs font-medium text-aco/70">Link para enviar as clientes</p>
                  <code className="mt-2 block truncate rounded-lg bg-bruma px-3 py-2 text-sm text-breu ring-1 ring-breu/10">
                    {copyLink || overview.masterLink || "Link sendo preparado"}
                  </code>
                </div>
              )}
            </div>
            <div className="shrink-0">
              {overview.primaryAction.kind === "copy_link" ? (
                <CopyLinkButton url={copyLink} disabled={!copyLink} variant="primary" label={nextStep.actionLabel} />
              ) : (
                <Button onClick={scrollToGroups}>{nextStep.actionLabel}</Button>
              )}
            </div>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <KpiCard label="Grupos" value={overview.groupCount} />
          <KpiCard label="Disponiveis" value={overview.availableCount} />
          <KpiCard label="Cheios" value={overview.fullCount} />
          <KpiCard label="Membros" value={overview.totalMembers.toLocaleString("pt-BR")} />
          <KpiCard label="Capacidade" value={overview.totalCapacity.toLocaleString("pt-BR")} />
          <KpiCard label="Cliques" value={overview.clicks.toLocaleString("pt-BR")} />
        </section>

        <div id="campaign-groups-workspace" className="grid scroll-mt-6 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-5">
            <Card>
              <CardHeader className="flex flex-col gap-1">
                <CardTitle>Grupos desta campanha</CardTitle>
                <p className="text-sm text-aco/70">Acompanhe ocupacao, convites e disponibilidade do pool.</p>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.groups.length === 0 && (
                  <div className="rounded-lg border border-dashed border-breu/10 p-6 text-center text-sm text-aco/70">
                    Esta campanha ainda nao tem grupos. Adicione grupos pela lista ao lado.
                  </div>
                )}
                {overview.groups.map((item) => (
                  <CampaignGroupRow
                    key={item.id}
                    item={item}
                    saving={savingGroupId !== null}
                    onRemove={() => removeGroup(item.id)}
                  />
                ))}
              </CardContent>
            </Card>
          </div>

          <Card className="h-fit">
            <CardHeader className="flex flex-col gap-3">
              <div>
                <CardTitle>Adicionar grupos</CardTitle>
                <p className="mt-1 text-sm text-aco/70">Grupos fora desta campanha.</p>
              </div>
              <label className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-aco/50" />
                <Input
                  aria-label="Buscar grupo"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar grupo..."
                  className="pl-9"
                />
              </label>
            </CardHeader>
            <CardContent className="max-h-[560px] space-y-2 overflow-y-auto">
              {availableGroups.length === 0 && (
                <p className="rounded-lg border border-dashed border-breu/10 p-4 text-sm text-aco/70">
                  Nenhum grupo disponivel para adicionar.
                </p>
              )}
              {availableGroups.map((group) => (
                <AvailableGroupRow
                  key={group.id}
                  group={group}
                  saving={savingGroupId !== null}
                  onAdd={() => addGroup(group.id)}
                />
              ))}
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}

function CampaignGroupRow({
  item,
  saving,
  onRemove,
}: {
  item: ReturnType<typeof buildCampaignGroupsOverview>["groups"][number];
  saving: boolean;
  onRemove: () => void;
}) {
  const status = groupStatusCopy[item.status];
  const pct = item.capacity > 0 ? Math.min(100, Math.round((item.members * 100) / item.capacity)) : 0;

  return (
    <div className="rounded-xl border border-breu/10 bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-semibold text-breu">
              {item.group ? getGroupDisplayName(item.group) : item.id}
            </p>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="mt-1 text-xs text-aco/50">
            {item.group && hasInternalGroupName(item.group)
              ? `WhatsApp: ${item.group.name}`
              : `${item.members.toLocaleString("pt-BR")} de ${item.capacity.toLocaleString("pt-BR")} membros`}
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={saving} onClick={onRemove}>
          <Minus className="h-4 w-4" />
          Remover
        </Button>
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-xs text-aco/70">
          <span>Ocupacao</span>
          <span className="font-semibold text-aco">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-bruma">
          <div className={cn("h-full rounded-full", getGroupFillTone(item.status))} style={{ width: `${pct}%` }} />
        </div>
      </div>
      {item.inviteUrl ? (
        <a
          href={item.inviteUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex max-w-full items-center gap-1 truncate text-xs font-medium text-iris-escuro hover:text-iris-escuro"
        >
          <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{item.inviteUrl}</span>
        </a>
      ) : (
        <p className="mt-3 text-xs font-medium text-amber-700">Convite nao configurado</p>
      )}
    </div>
  );
}

function AvailableGroupRow({ group, saving, onAdd }: { group: Group; saving: boolean; onAdd: () => void }) {
  const status = group.inviteUrl ? (group.members >= group.capacity * 0.95 ? "full" : "available") : "missing_invite";
  const copy = groupStatusCopy[status];

  return (
    <div className="rounded-lg border border-breu/10 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-breu">{getGroupDisplayName(group)}</p>
          <p className="mt-1 text-xs text-aco/50">
            {hasInternalGroupName(group)
              ? `WhatsApp: ${group.name}`
              : `${group.members.toLocaleString("pt-BR")} de ${group.capacity.toLocaleString("pt-BR")} membros`}
          </p>
          <Badge tone={copy.tone} className="mt-2">
            {copy.label}
          </Badge>
        </div>
        <Button type="button" size="sm" variant="outline" disabled={saving} onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Adicionar
        </Button>
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium text-aco/70">{label}</p>
      <p className="mt-2 text-xl font-semibold text-breu">{value}</p>
    </Card>
  );
}

function getGroupFillTone(status: CampaignGroupStatus) {
  if (status === "full") return "bg-red-500";
  if (status === "missing_invite") return "bg-amber-500";
  if (status === "unknown") return "bg-aco/30";
  return "bg-iris";
}
