"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  MessageCircle,
  MoreHorizontal,
  Users,
  Lock,
  Unlock,
  MousePointerClick,
  AlertTriangle,
  Pencil,
  RefreshCw,
  QrCode,
  FileBarChart,
  Archive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/painel/copy-link";
import {
  buildCampaignGroupsOverview,
  type CampaignGroupOverview,
  type CampaignGroupsOverview,
} from "@/lib/campaign-groups-overview";
import type { Group } from "@/lib/mock-data";

type Campanha = { id: string; name: string; loja?: string; groupIds: string[]; slug?: string; createdAt: string };
type TrackedLink = { campaignName?: string; clicks: number };

const TABS = ["Grupos", "Visão geral", "Resultados"] as const;
type Tab = (typeof TABS)[number];

const ACTIONS = [
  { label: "Editar", icon: Pencil },
  { label: "Atualizar membros", icon: RefreshCw },
  { label: "QR Code", icon: QrCode },
  { label: "Relatórios", icon: FileBarChart },
  { label: "Arquivar", icon: Archive },
];

export default function CampanhaDetalhe() {
  const params = useParams<{ slug: string }>();
  const key = params?.slug ?? "";

  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [clicks, setClicks] = useState(0);
  const [live, setLive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");
  const [tab, setTab] = useState<Tab>("Grupos");
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    (async () => {
      try {
        const [c, g, l, s] = await Promise.all([
          fetch("/api/campanhas").then((r) => r.json()).catch(() => []),
          fetch("/api/groups").then((r) => r.json()).catch(() => []),
          fetch("/api/links").then((r) => r.json()).catch(() => []),
          fetch("/api/session").then((r) => r.json()).catch(() => ({})),
        ]);
        const list: Campanha[] = Array.isArray(c) ? c : [];
        setCampanhas(list);
        setGroups(Array.isArray(g) ? g : []);
        setLive(Boolean(s?.live));
        const camp = list.find((x) => x.slug === key || x.id === key);
        if (camp) {
          const ls: TrackedLink[] = Array.isArray(l) ? l : [];
          setClicks(ls.filter((x) => x.campaignName === camp.name).reduce((a, x) => a + (x.clicks ?? 0), 0));
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [key]);

  const campanha = useMemo(() => campanhas.find((c) => c.slug === key || c.id === key) ?? null, [campanhas, key]);
  const o: CampaignGroupsOverview | null = useMemo(
    () => (campanha ? buildCampaignGroupsOverview({ campaign: campanha, groups, clicks }) : null),
    [campanha, groups, clicks],
  );

  if (loading) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-6 sm:px-6">
        <div className="h-40 animate-pulse rounded-3xl bg-white" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="h-56 animate-pulse rounded-3xl bg-white" />)}
        </div>
      </div>
    );
  }

  if (!campanha || !o) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-24 text-center sm:px-6">
        <p className="font-display text-xl font-bold text-breu">Campanha não encontrada</p>
        <Link href="/painel/campanhas" className="mt-4 inline-block text-sm text-iris hover:underline">
          ← Voltar pra campanhas
        </Link>
      </div>
    );
  }

  const fill = o.fillPct;
  const masterUrl = campanha.slug ? `${origin}/r/${campanha.slug}` : "";
  const offline = live === false;
  const semConvite = o.missingInviteCount;

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-6">
      <Link
        href="/painel/campanhas"
        className="font-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-aco/55 transition hover:text-iris"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Campanhas
      </Link>

      {/* Header */}
      <div className="rounded-3xl border border-breu/[0.08] bg-white p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25D366] text-white"><MessageCircle className="h-6 w-6" /></span>
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em]">{campanha.name}</h1>
              {masterUrl && <CopyLink url={masterUrl} className="mt-1" />}
            </div>
          </div>
          <div className="relative flex gap-2">
            <Link
              href={`/painel/campanhas/${campanha.slug ?? campanha.id}/editar`}
              className="inline-flex items-center gap-2 rounded-xl bg-iris px-4 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
            >
              <Pencil className="h-4 w-4" /> Editar
            </Link>
            <button onClick={() => setMenu((v) => !v)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-breu/10 bg-white text-aco transition hover:text-breu">
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menu && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} aria-label="Fechar" />
                <div className="hf-enter absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-2xl border border-breu/10 bg-white py-1.5 shadow-deep">
                  {ACTIONS.map((a) => {
                    const Icon = a.icon;
                    const cls = "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-aco transition hover:bg-bruma/60 hover:text-breu";
                    return a.label === "Editar" ? (
                      <Link key={a.label} href={`/painel/campanhas/${campanha.slug ?? campanha.id}/editar`} className={cls}>
                        <Icon className="h-4 w-4 text-aco/50" /> {a.label}
                      </Link>
                    ) : (
                      <button key={a.label} className={cls}><Icon className="h-4 w-4 text-aco/50" /> {a.label}</button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-bruma">
                <div className="h-full rounded-full" style={{ width: `${fill}%`, background: fill >= 85 ? "#D99B2A" : "#6A4BF0" }} />
              </div>
              <span className={cn("font-data text-sm font-medium tabular-nums", fill >= 85 ? "text-atencao" : "text-iris")}>{fill}%</span>
            </div>
            <p className="font-data mt-1.5 text-[11px] text-aco/50">
              {o.totalMembers.toLocaleString("pt-BR")} / {o.totalCapacity.toLocaleString("pt-BR")} membros
            </p>
          </div>
          <HeaderStat label="Grupos" value={o.groupCount.toLocaleString("pt-BR")} />
          <HeaderStat label="Membros" value={o.totalMembers.toLocaleString("pt-BR")} />
          <HeaderStat label="Cliques" value={o.clicks.toLocaleString("pt-BR")} />
        </div>

        {(offline || semConvite > 0) && (
          <div className="mt-4 flex items-center gap-3 rounded-2xl border border-alerta/20 bg-alerta/[0.04] px-4 py-3">
            <AlertTriangle className="h-5 w-5 shrink-0 text-alerta" />
            <p className="flex-1 text-sm text-aco">
              {offline ? (
                <><strong className="text-breu">WhatsApp desconectado</strong> — leads não entram até reconectar.</>
              ) : (
                <><strong className="text-breu">{semConvite} grupos sem convite</strong> — não recebem leads até configurar o link.</>
              )}
            </p>
            <Link href="/settings" className="rounded-lg bg-alerta px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90">
              {offline ? "Reconectar" : "Configurar"}
            </Link>
          </div>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto border-b border-breu/[0.08]">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("relative shrink-0 px-4 py-2.5 text-sm font-medium transition", tab === t ? "text-breu" : "text-aco/55 hover:text-breu")}>
            {t}
            {tab === t && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-iris" />}
          </button>
        ))}
      </div>

      <div className="hf-enter" key={tab}>
        {tab === "Grupos" && (
          o.groups.length === 0 ? (
            <div className="rounded-3xl border border-breu/[0.08] bg-white px-5 py-16 text-center">
              <p className="font-display text-lg font-bold text-breu">Sem grupos ainda</p>
              <p className="mt-1 text-sm text-aco/60">Adicione grupos pra essa campanha começar a captar.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {o.groups.map((g) => <GroupCard key={g.id} g={g} live={live} origin={origin} />)}
            </div>
          )
        )}

        {tab === "Visão geral" && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-1">
              <Tile label="Grupos" value={String(o.groupCount)} />
              <Tile label="Preenchimento" value={`${fill}%`} tone={fill >= 85 ? "atencao" : "iris"} />
              <Tile label="Cliques" value={o.clicks.toLocaleString("pt-BR")} />
            </div>
            <div className="rounded-3xl border border-breu/[0.08] bg-white p-6 lg:col-span-2">
              <h2 className="font-display text-base font-bold text-breu">Como está a campanha</h2>
              <p className="mt-2 text-sm text-aco">
                Cada clique no link é distribuído pro próximo grupo com vaga. Quando um grupo enche, o
                sistema usa o próximo — você só acompanha.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Mini label="Vaga restante" value={`${Math.max(o.totalCapacity - o.totalMembers, 0).toLocaleString("pt-BR")} membros`} />
                <Mini label="Conversão clique→membro" value={o.clicks > 0 ? `${Math.round((o.totalMembers / o.clicks) * 100)}%` : "—"} />
              </div>
            </div>
          </div>
        )}

        {tab === "Resultados" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Cliques" value={o.clicks.toLocaleString("pt-BR")} />
              <Tile label="Membros" value={o.totalMembers.toLocaleString("pt-BR")} />
              <Tile label="Conversão" value={o.clicks > 0 ? `${Math.round((o.totalMembers / o.clicks) * 100)}%` : "—"} tone="iris" />
              <Tile label="Grupos cheios" value={String(o.fullCount)} tone="atencao" />
            </div>
            <div className="rounded-3xl border border-breu/[0.08] bg-white p-6">
              <h2 className="font-display text-base font-bold text-breu">Do clique ao grupo</h2>
              <div className="mt-5 space-y-3">
                {[
                  { icon: MousePointerClick, label: "Clicaram no link", value: o.clicks, pct: 100 },
                  { icon: Users, label: "Entraram no grupo", value: o.totalMembers, pct: o.clicks > 0 ? Math.round((o.totalMembers / o.clicks) * 100) : 0 },
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label}>
                      <div className="mb-1.5 flex items-center justify-between">
                        <span className="flex items-center gap-2 text-sm text-aco"><Icon className="h-4 w-4 text-iris" />{s.label}</span>
                        <span className="font-display text-base font-extrabold tabular-nums text-breu">{s.value.toLocaleString("pt-BR")}</span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full bg-bruma">
                        <div className="hf-gradient h-full rounded-full" style={{ width: `${Math.max(s.pct, 4)}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <Link href="/painel/resultados" className="font-data mt-5 inline-flex items-center gap-1 text-[11px] uppercase tracking-wider text-iris transition hover:gap-1.5">
                Ver resultados completos →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- grupo (dados reais) ---------- */

function GroupCard({ g, live, origin }: { g: CampaignGroupOverview; live: boolean | null; origin: string }) {
  const cap = g.capacity > 0 ? (g.members / g.capacity) * 100 : 0;
  const quase = cap >= 80;
  const conectado = live !== false && g.status !== "missing_invite";
  const name = g.group?.name ?? "Grupo";
  const invite = g.inviteUrl ? g.inviteUrl.replace(/^https?:\/\//, "") : "";

  return (
    <div className={cn("rounded-3xl border bg-white p-5", conectado ? "border-breu/[0.08]" : "border-alerta/20")}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#25D366] text-white"><MessageCircle className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="font-display truncate text-sm font-bold text-breu">{name}</p>
            <p className="font-data text-[10px] uppercase tracking-wider text-aco/45">WhatsApp</p>
          </div>
        </div>
      </div>

      <div className="mt-3">
        {g.status === "missing_invite" ? (
          <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-atencao/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-atencao">
            <Lock className="h-3 w-3" /> Sem convite
          </span>
        ) : conectado ? (
          <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-sucesso/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-sucesso">
            <Unlock className="h-3 w-3" /> {g.status === "full" ? "Cheio" : "Ativo"}
          </span>
        ) : (
          <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-alerta/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-alerta">
            <Lock className="h-3 w-3" /> Desconectado
          </span>
        )}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">Capacidade</span>
          <span className={cn("font-data text-sm font-medium tabular-nums", quase ? "text-atencao" : "text-iris")}>{Math.round(cap)}%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-bruma">
          <div className="h-full rounded-full" style={{ width: `${cap}%`, background: quase ? "#D99B2A" : "#6A4BF0" }} />
        </div>
        <p className="font-data mt-1 text-[10px] text-aco/45">{g.members.toLocaleString("pt-BR")} membros · limite {g.capacity.toLocaleString("pt-BR")}</p>
      </div>

      {invite ? (
        <CopyLink url={origin && !g.inviteUrl.startsWith("http") ? `${origin}${g.inviteUrl}` : g.inviteUrl} className="mt-3" />
      ) : (
        <p className="font-data mt-3 text-[11px] text-atencao">Configure o link de convite</p>
      )}
    </div>
  );
}

/* ---------- helpers ---------- */

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{label}</p>
      <p className="font-display text-xl font-extrabold tabular-nums text-breu">{value}</p>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "iris" | "atencao" }) {
  return (
    <div className="rounded-2xl border border-breu/[0.08] bg-white p-4">
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{label}</p>
      <p className={cn("font-display mt-1 text-2xl font-extrabold tracking-tight", tone === "iris" ? "text-iris" : tone === "atencao" ? "text-atencao" : "text-breu")}>{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-bruma/50 px-4 py-3">
      <p className="font-data text-[10px] uppercase tracking-wider text-aco/50">{label}</p>
      <p className="mt-1 text-sm font-medium text-breu">{value}</p>
    </div>
  );
}
