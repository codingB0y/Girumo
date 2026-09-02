"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  MessageCircle,
  MoreHorizontal,
  Users,
  Lock,
  Unlock,
  MousePointerClick,
  AlertTriangle,
  Settings2,
  RefreshCw,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyLink } from "@/components/painel/copy-link";
import {
  buildCampaignGroupsOverview,
  type CampaignGroupOverview,
  type CampaignGroupsOverview,
} from "@/lib/campaign-groups-overview";
import type { Group } from "@/lib/mock-data";
import { MessagesTab } from "@/components/painel/messages";
import { AcoesEmMassa } from "@/components/painel/grupos/acoes-em-massa";
import { ConfigChips } from "@/components/painel/campanhas/config-chips";
import { QrLink } from "@/components/painel/campanhas/qr-link";
import { AjudaPainel } from "@/components/painel/campanhas/ajuda-painel";
import { ENTRADA_DEFAULTS, type EntradaSettings } from "@/lib/campaigns/settings";
import { clicksForCampaign } from "@/lib/links/click-attribution";
import { countCampaignEntries, entriesPerClick, type EntryLead } from "@/lib/campaigns/campaign-entries";

type Campanha = {
  id: string;
  name: string;
  loja?: string;
  groupIds: string[];
  slug?: string;
  createdAt: string;
  settings?: { entrada: EntradaSettings };
};
type TrackedLink = { campaignGroupId?: string | null; campaignName?: string; clicks: number };
type Order = { id: string; value: number; campaign_id?: string | null };

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const TABS = ["Grupos", "Mensagens", "Visão geral", "Resultados"] as const;
type Tab = (typeof TABS)[number];

export default function CampanhaDetalhe() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const key = params?.slug ?? "";

  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [clicks, setClicks] = useState(0);
  const [entries, setEntries] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [live, setLive] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState("");
  const [tab, setTab] = useState<Tab>("Grupos");
  const [menu, setMenu] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function loadData() {
    try {
      const [c, g, l, s, o, lds] = await Promise.all([
        fetch("/api/campanhas").then((r) => r.json()).catch(() => []),
        fetch("/api/groups").then((r) => r.json()).catch(() => []),
        fetch("/api/links").then((r) => r.json()).catch(() => []),
        fetch("/api/session").then((r) => r.json()).catch(() => ({})),
        fetch("/api/orders").then((r) => r.json()).catch(() => []),
        fetch("/api/leads").then((r) => r.json()).catch(() => []),
      ]);
      const list: Campanha[] = Array.isArray(c) ? c : [];
      setCampanhas(list);
      setGroups(Array.isArray(g) ? g : []);
      setLive(Boolean(s?.live));
      setOrders(Array.isArray(o) ? o : []);
      const camp = list.find((x) => x.slug === key || x.id === key);
      if (camp) {
        const ls: TrackedLink[] = Array.isArray(l) ? l : [];
        // Por ID: comparar o nome fazia o histórico sumir quando a campanha era renomeada.
        setClicks(clicksForCampaign(ls, camp));
        // Entradas contam quem ENTROU nos grupos da campanha (leads têm
        // entered_at), não o total de membros — que inclui quem já estava lá.
        // O corte pela criação da campanha tira quem entrou antes dela existir.
        const leadsList: EntryLead[] = Array.isArray(lds) ? lds : [];
        setEntries(countCampaignEntries(leadsList, camp.groupIds, { since: camp.createdAt }));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setOrigin(window.location.origin);
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const campanha = useMemo(() => campanhas.find((c) => c.slug === key || c.id === key) ?? null, [campanhas, key]);
  const o: CampaignGroupsOverview | null = useMemo(
    () => (campanha ? buildCampaignGroupsOverview({ campaign: campanha, groups, clicks }) : null),
    [campanha, groups, clicks],
  );
  const campaignOrders = useMemo(
    () => (campanha ? orders.filter((ord) => ord.campaign_id === campanha.id) : []),
    [orders, campanha],
  );
  const campaignRevenue = useMemo(() => campaignOrders.reduce((a, ord) => a + (ord.value ?? 0), 0), [campaignOrders]);
  // null = ainda não houve clique. Mostrar 0% aí leria "ninguém converteu".
  const taxaEntrada = useMemo(() => entriesPerClick(entries, clicks), [entries, clicks]);

  async function handleRefresh() {
    setRefreshing(true);
    setMenu(false);
    await loadData();
    setRefreshing(false);
  }

  async function handleDelete() {
    if (!campanha) return;
    if (!confirm(`Excluir a campanha "${campanha.name}"? Essa ação não pode ser desfeita.`)) return;
    setDeleting(true);
    setMenu(false);
    try {
      await fetch(`/api/campanhas?id=${campanha.id}`, { method: "DELETE" });
      router.push("/painel/campanhas");
    } catch {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[1100px] space-y-4 px-4 py-8 sm:px-8">
        <div className="pn-skeleton h-40 rounded-2xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <div key={i} className="pn-skeleton h-56 rounded-2xl" />)}
        </div>
      </div>
    );
  }

  if (!campanha || !o) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-24 text-center sm:px-8">
        <p className="font-editorial text-[22px] italic text-volt-950">Campanha não encontrada.</p>
        <Link href="/painel/campanhas" className="mt-4 inline-block text-sm text-cobalt-500 hover:underline">
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
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-8 sm:px-8">
      <Link
        href="/painel/campanhas"
        className="font-data inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.08em] text-aco/55 transition-colors duration-[160ms] hover:text-cobalt-500"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Campanhas
      </Link>

      {/* Header */}
      <div className="pn-card rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#25D366] text-white"><MessageCircle className="h-6 w-6" /></span>
            <div>
              <h1 className="font-display text-2xl font-extrabold tracking-[-0.03em] text-volt-950">{campanha.name}</h1>
              {masterUrl && <CopyLink url={masterUrl} className="mt-1" />}
              {masterUrl && (
                <div className="mt-1.5">
                  <QrLink url={masterUrl} nome={campanha.name} />
                </div>
              )}
              <ConfigChips
                entrada={campanha.settings?.entrada ?? ENTRADA_DEFAULTS}
                href={`/painel/campanhas/${campanha.slug ?? campanha.id}/editar?aba=entrada`}
              />
            </div>
          </div>
          <div className="relative flex gap-2">
            <AjudaPainel />
            <Link
              href={`/painel/campanhas/${campanha.slug ?? campanha.id}/editar`}
              className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
            >
              <Settings2 className="h-4 w-4" /> Configurar
            </Link>
            <button onClick={() => setMenu((v) => !v)} aria-label="Mais ações" className="flex h-10 w-10 items-center justify-center rounded-xl border border-volt-950/10 bg-papel text-aco transition-colors duration-[160ms] hover:text-volt-950">
              <MoreHorizontal className="h-5 w-5" />
            </button>
            {menu && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" onClick={() => setMenu(false)} aria-label="Fechar" />
                <div className="hf-enter absolute right-0 top-12 z-20 w-52 overflow-hidden rounded-2xl border border-volt-950/10 bg-papel py-1.5 shadow-deep">
                  <Link
                    href={`/painel/campanhas/${campanha.slug ?? campanha.id}/editar`}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-aco transition-colors duration-[160ms] hover:bg-poco hover:text-volt-950"
                  >
                    <Settings2 className="h-4 w-4 text-aco/50" /> Configurar
                  </Link>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-aco transition-colors duration-[160ms] hover:bg-poco hover:text-volt-950"
                  >
                    {refreshing ? <Loader2 className="h-4 w-4 animate-spin text-aco/50" /> : <RefreshCw className="h-4 w-4 text-aco/50" />}
                    Atualizar dados
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-alerta transition-colors duration-[160ms] hover:bg-alerta/5"
                  >
                    {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    Excluir campanha
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="pn-poco h-2 flex-1 overflow-hidden rounded-full">
                <div className="pn-fill h-full w-full rounded-full" style={{ transform: `scaleX(${Math.max(fill / 100, 0.02)})`, background: fill >= 85 ? "#D99B2A" : "var(--color-cobalt-500)" }} />
              </div>
              <span className={cn("font-data text-sm font-medium tabular-nums", fill >= 85 ? "text-atencao" : "text-cobalt-500")}>{fill}%</span>
            </div>
            <p className="font-data mt-1.5 text-[11px] tabular-nums text-aco/50">
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
                <><strong className="text-volt-950">WhatsApp desconectado</strong> — leads não entram até reconectar.</>
              ) : (
                <><strong className="text-volt-950">{semConvite} grupos sem convite</strong> — não recebem leads até configurar o link.</>
              )}
            </p>
            <Link href="/painel/conectar" className="rounded-lg bg-alerta px-3 py-1.5 text-xs font-medium text-white transition hover:opacity-90">
              {offline ? "Reconectar" : "Configurar"}
            </Link>
          </div>
        )}
      </div>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto border-b border-volt-950/[0.08]">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("relative shrink-0 px-4 py-2.5 text-sm font-medium transition-colors duration-[160ms]", tab === t ? "text-volt-950" : "text-aco/55 hover:text-volt-950")}>
            {t}
            {tab === t && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-cobalt-500" />}
          </button>
        ))}
      </div>

      <div className="hf-enter" key={tab}>
        {tab === "Grupos" && (
          o.groups.length === 0 ? (
            <div className="pn-card rounded-2xl px-5 py-16 text-center">
              <p className="font-editorial text-[22px] italic text-volt-950">Sem grupos ainda.</p>
              <p className="mt-1 text-sm text-aco/60">Adicione grupos pra essa campanha começar a captar.</p>
              <Link
                href={`/painel/campanhas/${campanha.slug ?? campanha.id}/editar`}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
              >
                <Users className="h-4 w-4" /> Adicionar grupos
              </Link>
            </div>
          ) : (
            <>
              <AcoesEmMassa
                slug={campanha.slug ?? campanha.id}
                administrados={o.groups.filter((g) => g.group?.isAdmin).length}
                totais={o.groups.length}
                onLoteConcluido={loadData}
              />
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {o.groups.map((g) => <GroupCard key={g.id} g={g} live={live} origin={origin} />)}
              </div>
            </>
          )
        )}

        {tab === "Mensagens" && (
          <MessagesTab campaignSlug={campanha.slug ?? campanha.id} groupIds={campanha.groupIds} />
        )}

        {tab === "Visão geral" && (
          <div className="grid gap-5 lg:grid-cols-3">
            <div className="space-y-3 lg:col-span-1">
              <Tile label="Grupos" value={String(o.groupCount)} />
              <Tile label="Preenchimento" value={`${fill}%`} tone={fill >= 85 ? "atencao" : "cobalt"} />
              <Tile label="Cliques" value={o.clicks.toLocaleString("pt-BR")} />
            </div>
            <div className="pn-card rounded-2xl p-6 lg:col-span-2">
              <h2 className="font-display text-base font-bold text-volt-950">Como está a campanha</h2>
              <p className="mt-2 text-sm text-aco">
                Cada clique no link é distribuído pro próximo grupo com vaga. Quando um grupo enche, o
                sistema usa o próximo — você só acompanha.
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Mini label="Vaga restante" value={`${Math.max(o.totalCapacity - o.totalMembers, 0).toLocaleString("pt-BR")} membros`} />
                <Mini
                  label="Entradas por clique"
                  value={taxaEntrada === null ? "—" : `${taxaEntrada}%`}
                />
              </div>
            </div>
          </div>
        )}

        {tab === "Resultados" && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Cliques" value={o.clicks.toLocaleString("pt-BR")} />
              <Tile label="Membros" value={o.totalMembers.toLocaleString("pt-BR")} />
              <Tile label="Entradas" value={entries.toLocaleString("pt-BR")} tone="cobalt" />
              <Tile label="Grupos cheios" value={String(o.fullCount)} tone="atencao" />
            </div>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Tile label="Vendas" value={brl.format(campaignRevenue)} tone="cobalt" />
              <Tile label="Pedidos" value={campaignOrders.length.toLocaleString("pt-BR")} />
            </div>
            <div className="pn-card rounded-2xl p-6">
              {/* O funil antigo comparava clicks com `totalMembers`, que inclui quem já
                  estava no grupo antes do link existir — por isso passava de 100%. Agora
                  a 2ª etapa é ENTRADA (leads têm `entered_at`), que é o que de fato
                  aconteceu depois do clique. Continua sem barra proporcional: entrada não
                  prova origem no link (ver campaign-entries.ts). */}
              <h2 className="font-display text-base font-bold text-volt-950">Do clique à entrada</h2>
              <div className="mt-5 space-y-3">
                {[
                  { icon: MousePointerClick, label: "Clicaram no link", value: o.clicks },
                  { icon: Users, label: "Entraram nos grupos", value: entries },
                ].map((s) => {
                  const Icon = s.icon;
                  return (
                    <div key={s.label} className="flex items-center justify-between">
                      <span className="flex items-center gap-2 text-sm text-aco"><Icon className="h-4 w-4 text-cobalt-500" strokeWidth={1.75} />{s.label}</span>
                      <span className="font-data text-base font-medium tabular-nums text-volt-950">{s.value.toLocaleString("pt-BR")}</span>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 text-[13px] leading-relaxed text-aco/60">
                Entradas são quem entrou nos grupos desta campanha depois que ela foi criada.
                O convite do WhatsApp é o mesmo pra todo mundo, então quem foi adicionado à
                mão entra nessa conta igual — não é prova de que veio do link.
              </p>
              <Link href="/painel/resultados" className="font-data mt-5 inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.08em] text-cobalt-500 transition-[gap] duration-[160ms] hover:gap-1.5">
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

  return (
    <div className={cn("pn-card rounded-2xl p-5", !conectado && "border-alerta/20")}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#25D366] text-white"><MessageCircle className="h-5 w-5" /></span>
          <div className="min-w-0">
            <p className="font-display truncate text-sm font-bold text-volt-950">{name}</p>
            <p className="font-data text-[10px] uppercase tracking-wider text-aco/45">WhatsApp</p>
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
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
        <SeloEnvio estado={g.group?.sendState ?? null} />
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">Capacidade</span>
          <span className={cn("font-data text-sm font-medium tabular-nums", quase ? "text-atencao" : "text-cobalt-500")}>{Math.round(cap)}%</span>
        </div>
        <div className="pn-poco mt-1.5 h-2 w-full overflow-hidden rounded-full">
          <div className="pn-fill h-full w-full rounded-full" style={{ transform: `scaleX(${Math.max(cap / 100, 0.02)})`, background: quase ? "#D99B2A" : "var(--color-cobalt-500)" }} />
        </div>
        <p className="font-data mt-1 text-[10px] tabular-nums text-aco/45">{g.members.toLocaleString("pt-BR")} membros · limite {g.capacity.toLocaleString("pt-BR")}</p>
      </div>

      {g.inviteUrl ? (
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
      <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">{label}</p>
      <p className="font-data text-xl font-medium tabular-nums text-volt-950">{value}</p>
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: "cobalt" | "atencao" }) {
  return (
    <div className="pn-card rounded-2xl p-4">
      <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">{label}</p>
      <p className={cn("font-data mt-2 text-[26px] font-medium tabular-nums tracking-[-0.02em]", tone === "cobalt" ? "text-cobalt-500" : tone === "atencao" ? "text-atencao" : "text-volt-950")}>{value}</p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-poco px-4 py-3">
      <p className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">{label}</p>
      <p className="mt-1 text-sm font-medium text-volt-950">{value}</p>
    </div>
  );
}

/**
 * Aberto / Fechado / sem informação.
 *
 * O terceiro estado é dito em voz alta de propósito: sumir com o selo quando
 * `send_state` é nulo faria "nunca aplicamos" parecer "está aberto", que é a
 * suposição errada mais cara — o lojista acharia que fechou o grupo de
 * madrugada quando não fechou.
 */
function SeloEnvio({ estado }: { estado: "open" | "closed" | null }) {
  if (estado === "open") {
    return (
      <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-sucesso/10 px-2.5 py-1 text-[10px] uppercase tracking-wider text-sucesso">
        <Unlock className="h-3 w-3" /> Aberto
      </span>
    );
  }
  if (estado === "closed") {
    return (
      <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-poco px-2.5 py-1 text-[10px] uppercase tracking-wider text-aco/70">
        <Lock className="h-3 w-3" /> Fechado
      </span>
    );
  }
  return (
    <span className="font-data inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-wider text-aco/40">
      Envio: sem informação
    </span>
  );
}
