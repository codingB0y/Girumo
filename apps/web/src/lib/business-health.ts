import "server-only";
import { listLeads } from "@/lib/leads-store";
import { listGroups } from "@/lib/groups-store";
import { clickCounts } from "@/lib/store";
import { getSession, isLive } from "@/lib/session-store";
import { collection } from "@/lib/json-collection";
import { listOrders, lastOrderByPhone } from "@/lib/orders-store";
import { listActivity } from "@/lib/activity-store";
import type { Campaign } from "@/lib/mock-data";

// Meta semanal de novas revendedoras. Fixa por ora — vira config no backend.
const WEEKLY_GOAL = 50;

const DAY_MS = 86_400_000;
const COLD_DAYS = 7; // V2: grupo "esfriando" = 7 dias sem entrada
const RECOMPRA_DAYS = 14; // compradora "sumida" = sem comprar há +14 dias

type RecompraItem = { phone: string; group?: string; dias: number; leadId?: string };

export type FunnelStage = {
  key: string;
  label: string;
  short: string; // rótulo curto p/ o funil visual
  icon: string; // emoji da etapa
  color: string; // cor da camada (tailwind bg-*)
  value: number | null; // null = ainda não medimos esse dado
  available: boolean;
};

export type FunnelInsight = {
  tone: "green" | "amber" | "red";
  text: string;
  cta: string;
  href: string;
};

type NextAction = {
  text: string;
  cta: string;
  href: string;
  tone: "green" | "amber" | "red";
};

export type ResultsOverview = {
  crescendo: boolean;
  entradasHoje: number;
  entradasSemana: number;
  entradasPrev: number;
  pedidos: number; // compradoras distintas (pessoas que já fizeram pedido)
  pedidosSemana: number; // pedidos (eventos) nos últimos 7 dias
  faturamentoSemana: number; // soma R$ dos pedidos nos últimos 7 dias
  trafego: number;
  meta: { goal: number; current: number; pct: number };
  funnel: FunnelStage[];
  funnelInsight: FunnelInsight;
  score: { value: number; status: "verde" | "amarelo" | "vermelho"; label: string; reason: string };
  nextAction: NextAction;
  gruposParados: number;
  recompra: { sumidas: number; list: RecompraItem[] };
  atividade: { medida: boolean; mensagensHoje: number; gruposAtivos: number };
};

/**
 * Central de Resultados (V2): traduz o que a engine captura numa leitura de
 * negócio para um lojista leigo. SÓ usa dado real — etapas que não medimos
 * (interação, recompra, cliente ativa) vêm marcadas como indisponíveis,
 * em vez de inventar número.
 */
export async function getResultsOverview(tenantId: string): Promise<ResultsOverview> {
  const [leads, groups, clicks, session, broadcasts, orders, activity] = await Promise.all([
    listLeads(tenantId),
    listGroups(tenantId),
    clickCounts(),
    getSession(tenantId),
    collection<Campaign>("broadcasts.json").list(),
    listOrders(),
    listActivity(tenantId),
  ]);

  const now = Date.now();
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();

  const ts = (iso: string) => new Date(iso).getTime();
  const entradasHoje = leads.filter((l) => ts(l.enteredAt) >= todayMs).length;
  const entradasSemana = leads.filter((l) => ts(l.enteredAt) >= now - 7 * DAY_MS).length;
  const entradasPrev = leads.filter(
    (l) => ts(l.enteredAt) >= now - 14 * DAY_MS && ts(l.enteredAt) < now - 7 * DAY_MS,
  ).length;
  const trafego = Object.values(clicks).reduce((s, n) => s + n, 0);
  const live = isLive(session);

  // === Pedidos REAIS (orders.ndjson) — fonte de faturamento e recompra ===
  const lastOrder = lastOrderByPhone(orders); // telefone(dígitos) → ISO da última compra
  const pedidos = lastOrder.size; // compradoras distintas (etapa "Compraram")
  const pedidosSemana = orders.filter((o) => ts(o.createdAt) >= now - 7 * DAY_MS).length;
  const faturamentoSemana = orders
    .filter((o) => ts(o.createdAt) >= now - 7 * DAY_MS)
    .reduce((s, o) => s + (o.value || 0), 0);

  // Recompra: quem JÁ comprou mas sumiu há +RECOMPRA_DAYS (maior ROI = reativar).
  const latestOrderByPhone = new Map<string, (typeof orders)[number]>();
  for (const o of orders) {
    const d = String(o.phone).replace(/\D/g, "");
    if (!d) continue;
    const cur = latestOrderByPhone.get(d);
    if (!cur || o.createdAt > cur.createdAt) latestOrderByPhone.set(d, o);
  }
  const recompraList: RecompraItem[] = [];
  for (const [phone, o] of latestOrderByPhone) {
    const dias = Math.floor((now - ts(o.createdAt)) / DAY_MS);
    if (dias >= RECOMPRA_DAYS) recompraList.push({ phone, group: o.group, dias, leadId: o.leadId });
  }
  recompraList.sort((a, b) => b.dias - a.dias);
  const recompra = { sumidas: recompraList.length, list: recompraList.slice(0, 6) };

  // === Atividade dos grupos (engine: messages.upsert) ===
  const activityByName = new Map(activity.map((a) => [a.name, a]));
  const today = new Date().toISOString().slice(0, 10);
  const interacaoValue = activity.reduce((s, a) => s + (a.activeMembers || 0), 0);
  const temAtividade = activity.length > 0; // engine já mediu atividade?
  const mensagensHoje = activity.filter((a) => a.date === today).reduce((s, a) => s + (a.messages || 0), 0);
  const gruposAtivos = activity.filter((a) => a.date === today && a.messages > 0).length;

  // Grupos parados: SEM entrada E SEM conversa há COLD_DAYS (antes só entrada —
  // marcava como morto um grupo lotado que vende mas parou de crescer).
  const lastEntryByGroup = new Map<string, number>();
  for (const l of leads) {
    const t = ts(l.enteredAt);
    if (!lastEntryByGroup.has(l.sourceGroup) || t > lastEntryByGroup.get(l.sourceGroup)!) {
      lastEntryByGroup.set(l.sourceGroup, t);
    }
  }
  const gruposParados = groups.filter((g) => {
    const lastMsg = activityByName.get(g.name)?.lastMessageAt;
    const lastSignal = Math.max(lastEntryByGroup.get(g.name) ?? 0, lastMsg ? ts(lastMsg) : 0);
    return lastSignal === 0 || now - lastSignal >= COLD_DAYS * DAY_MS;
  }).length;

  // Atividade recente: última entrada OU última oferta criada.
  const lastLead = leads.length ? Math.max(...leads.map((l) => ts(l.enteredAt))) : 0;
  const lastBroadcast = broadcasts.length
    ? Math.max(...broadcasts.map((b) => ts(b.createdAt ?? new Date(0).toISOString())))
    : 0;
  const lastMsg = activity.reduce((m, a) => Math.max(m, a.lastMessageAt ? ts(a.lastMessageAt) : 0), 0);
  const lastActivity = Math.max(lastLead, lastBroadcast, lastMsg);
  const activityDays = lastActivity ? Math.floor((now - lastActivity) / DAY_MS) : null;

  // === Score de saúde do negócio (0-100) ===
  let growthScore: number;
  if (entradasSemana === 0) growthScore = 0;
  else if (entradasPrev === 0) growthScore = 38;
  else {
    const r = entradasSemana / entradasPrev;
    growthScore = r >= 1.3 ? 45 : r >= 1.05 ? 38 : r >= 0.85 ? 28 : r >= 0.6 ? 16 : 8;
  }
  const activityScore =
    activityDays === null ? 0 : activityDays <= 1 ? 25 : activityDays <= 3 ? 20 : activityDays <= 7 ? 12 : activityDays <= 14 ? 5 : 0;
  const connectionScore = live ? 30 : 0;
  const value = Math.min(100, growthScore + activityScore + connectionScore);

  const status: "verde" | "amarelo" | "vermelho" = value >= 70 ? "verde" : value >= 45 ? "amarelo" : "vermelho";
  const label =
    status === "verde" ? "Crescimento saudável" : status === "amarelo" ? "Atenção" : "Precisa de você";

  let reason: string;
  if (!live) reason = "WhatsApp desconectado — você não está captando ninguém agora.";
  else if (growthScore <= 16) reason = "Seu crescimento desacelerou nesta semana.";
  else if (activityScore <= 5) reason = "Faz dias que nada novo acontece nos grupos.";
  else reason = "Seu negócio está crescendo bem. Continue assim!";

  const crescendo = live && entradasSemana >= entradasPrev && entradasSemana > 0;

  // === Próxima ação (UMA só) ===
  let nextAction: NextAction;
  if (!live) {
    nextAction = { text: "Conecte seu WhatsApp para começar a captar revendedoras.", cta: "Conectar agora", href: "/settings", tone: "red" };
  } else if (recompra.sumidas > 0) {
    nextAction = {
      text: `${recompra.sumidas} revendedora(s) que já compraram sumiram. Reativar é a venda mais barata.`,
      cta: "Reativar quem sumiu",
      href: "/leads?status=ativo",
      tone: "amber",
    };
  } else if (entradasSemana < 10) {
    nextAction = { text: "Poucas pessoas estão entrando nos seus grupos.", cta: "Divulgar campanha", href: "/campanhas", tone: "amber" };
  } else if (entradasSemana < entradasPrev || gruposParados > 0) {
    nextAction = { text: "Seu grupo perdeu ritmo. Revise a campanha e divulgue o link principal.", cta: "Ver campanhas", href: "/campanhas", tone: "amber" };
  } else {
    nextAction = { text: "Seu grupo está crescendo bem. Mantenha a estratégia!", cta: "Ver campanhas", href: "/campanhas", tone: "green" };
  }

  const funnel: FunnelStage[] = [
    { key: "trafego", label: "Pessoas que clicaram no anúncio", short: "Viram o anúncio", icon: "📣", color: "bg-violet-500", value: trafego, available: true },
    { key: "entradas", label: "Entraram no grupo", short: "Entraram", icon: "👥", color: "bg-blue-500", value: leads.length, available: true },
    { key: "interacao", label: "Interagiram no grupo", short: "Interagiram", icon: "🔥", color: "bg-orange-500", value: temAtividade ? interacaoValue : null, available: temAtividade },
    { key: "pedido", label: "Fizeram o 1º pedido", short: "Compraram", icon: "🛍️", color: "bg-green-500", value: pedidos, available: true },
    { key: "recompra", label: "Recompraram", short: "Voltaram", icon: "💎", color: "bg-amber-400", value: null, available: false },
    { key: "ativa", label: "Viraram cliente ativa", short: "Cliente fiel", icon: "⭐", color: "bg-yellow-500", value: null, available: false },
  ];

  // === Insight automático: onde está o maior gargalo? ===
  // Só comparamos etapas que MEDIMOS de verdade (tráfego→entradas→pedido).
  const measured = funnel.filter((s) => s.available && s.value !== null) as (FunnelStage & { value: number })[];
  let funnelInsight: FunnelInsight;
  if (!live) {
    funnelInsight = { tone: "red", text: "Conecte o WhatsApp para o funil começar a medir seus resultados.", cta: "Conectar", href: "/settings" };
  } else if (trafego === 0) {
    funnelInsight = { tone: "amber", text: "Ninguém clicou no link ainda. O funil começa divulgando a campanha.", cta: "Ver campanhas", href: "/campanhas" };
  } else {
    // maior queda percentual entre etapas medidas consecutivas
    let worst = { from: "", to: "", lossPct: -1 };
    for (let i = 1; i < measured.length; i++) {
      const prev = measured[i - 1];
      const curr = measured[i];
      if (prev.value <= 0) continue;
      const lossPct = Math.round((1 - curr.value / prev.value) * 100);
      if (lossPct > worst.lossPct) worst = { from: prev.short, to: curr.short, lossPct };
    }
    if (worst.lossPct >= 80 && worst.from === "Entraram") {
      funnelInsight = { tone: "amber", text: `Muita gente entra, mas pouca compra (${worst.lossPct}% não fecham pedido). Revise sua campanha e abordagem.`, cta: "Ver campanhas", href: "/campanhas" };
    } else if (worst.from === "Viram o anúncio" && worst.lossPct >= 90) {
      funnelInsight = { tone: "amber", text: `Muitos cliques, poucas entradas (${worst.lossPct}% não entram). Revise os grupos e o link da campanha.`, cta: "Ver campanhas", href: "/campanhas" };
    } else {
      funnelInsight = { tone: "green", text: "Boa retenção no funil. Seu próximo ganho está em divulgar mais a campanha.", cta: "Ver campanhas", href: "/campanhas" };
    }
  }

  return {
    crescendo,
    entradasHoje,
    entradasSemana,
    entradasPrev,
    pedidos,
    pedidosSemana,
    faturamentoSemana,
    trafego,
    meta: { goal: WEEKLY_GOAL, current: entradasSemana, pct: Math.min(100, Math.round((entradasSemana / WEEKLY_GOAL) * 100)) },
    funnel,
    funnelInsight,
    score: { value, status, label, reason },
    nextAction,
    gruposParados,
    recompra,
    atividade: { medida: temAtividade, mensagensHoje, gruposAtivos },
  };
}
