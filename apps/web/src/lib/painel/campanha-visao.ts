import type { CampaignGroupOverview } from "@/lib/campaign-groups-overview";
import type { DispatchRecurrence, DispatchView } from "@/lib/campaigns/dispatch-view";
import { dayBR, dayBRAgo, dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import { estadoDoGrupo, type EstadoDoGrupo } from "@/lib/painel/grupos";

/**
 * Visão geral da campanha na direção D (spec 2026-09-24, PR B): grupos, o dia
 * dos posts e as últimas entradas. As novas pessoas saem de `leads.entered_at`
 * (1ª entrada de cada pessoa, no grupo de origem). As séries por hora e por dia
 * vêm do banco, em `atividade.ts` (PR C); saídas, no PR D.
 */

export type LeadResumo = {
  id?: string;
  name?: string | null;
  sourceGroup?: string | null;
  sourceGroupId?: string | null;
  enteredAt?: string | null;
};

export type EstadoNaCampanha = EstadoDoGrupo | "sumiu";
export type FiltroDeGrupos = "todos" | "lotados" | "quase" | "com_vaga";

/** Grupo que saiu do WhatsApp (sem registro) não é "sem convite": sumiu. */
export function estadoNaCampanha(g: CampaignGroupOverview): EstadoNaCampanha {
  return g.group ? estadoDoGrupo(g.group) : "sumiu";
}

export type FaixaDeLotacao = { lotados: number; quase: number; comVaga: number; semConvite: number; sumiram: number };

export function faixaDeLotacao(grupos: CampaignGroupOverview[]): FaixaDeLotacao {
  const faixa: FaixaDeLotacao = { lotados: 0, quase: 0, comVaga: 0, semConvite: 0, sumiram: 0 };
  for (const g of grupos) {
    const estado = estadoNaCampanha(g);
    if (estado === "cheio") faixa.lotados += 1;
    else if (estado === "quase") faixa.quase += 1;
    else if (estado === "ativo") faixa.comVaga += 1;
    else if (estado === "sem_convite") faixa.semConvite += 1;
    else faixa.sumiram += 1;
  }
  return faixa;
}

const ALVO: Record<Exclude<FiltroDeGrupos, "todos">, EstadoNaCampanha> = {
  lotados: "cheio",
  quase: "quase",
  com_vaga: "ativo",
};

export function filtrarGrupos(grupos: CampaignGroupOverview[], filtro: FiltroDeGrupos): CampaignGroupOverview[] {
  if (filtro === "todos") return grupos;
  return grupos.filter((g) => estadoNaCampanha(g) === ALVO[filtro]);
}

/** Mais novo primeiro (#40, #39…): é o grupo que está recebendo gente agora. */
export function ordenarGrupos(grupos: CampaignGroupOverview[]): CampaignGroupOverview[] {
  return [...grupos].sort((a, b) =>
    (b.group?.name ?? "").localeCompare(a.group?.name ?? "", "pt-BR", { numeric: true }),
  );
}

function daCampanha(leads: LeadResumo[], groupIds: string[]): LeadResumo[] {
  const ids = new Set(groupIds);
  return leads.filter((l) => l.sourceGroupId && ids.has(l.sourceGroupId) && l.enteredAt);
}

/** Novas pessoas de hoje por grupo de origem. */
export function novasHojePorGrupo(leads: LeadResumo[], groupIds: string[], agora = new Date()): Map<string, number> {
  const hoje = dayBR(agora);
  const porGrupo = new Map<string, number>();
  for (const l of daCampanha(leads, groupIds)) {
    if (dayBROf(l.enteredAt) !== hoje || !l.sourceGroupId) continue;
    porGrupo.set(l.sourceGroupId, (porGrupo.get(l.sourceGroupId) ?? 0) + 1);
  }
  return porGrupo;
}

export function ultimasEntradas(leads: LeadResumo[], groupIds: string[], quantas = 5): LeadResumo[] {
  return daCampanha(leads, groupIds)
    .sort((a, b) => Date.parse(b.enteredAt ?? "") - Date.parse(a.enteredAt ?? ""))
    .slice(0, quantas);
}

export type EstadoDoPost = "postando" | "na_fila" | "postado" | "falhou" | "agendado";

export type ItemDoDia = {
  id: string;
  /** "14:08" hoje; "amanhã 06:30" ou "26/09 08:00" para o que vem. */
  hora: string;
  estado: EstadoDoPost;
  texto: string;
  enviados: number;
  total: number;
  repete: DispatchRecurrence;
};

/** A 1ª linha do post (até 70 caracteres), ou o que ele é quando não tem texto. */
export function textoDoPost(p: DispatchView): string {
  const linha = p.body.split("\n").map((s) => s.trim()).find(Boolean);
  if (linha) return linha.length > 70 ? `${linha.slice(0, 69)}…` : linha;
  if (p.poll) return `Enquete: ${p.poll.question}`;
  if (p.mediaType === "video") return "Vídeo";
  if (p.mediaType) return "Foto";
  return "Post";
}

/** Quando o post saiu (ou começou a sair); o rascunho, quando foi criado. */
export function quandoDoPost(p: DispatchView): string {
  return p.runningSince ?? p.dispatchedAt ?? p.createdAt;
}

/**
 * O dia da campanha, como a linha do tempo mostra: primeiro o que está saindo
 * agora, depois o que saiu hoje (mais recente em cima) e, por fim, os próximos
 * agendados. Rascunho não entra.
 */
export function hojeNaCampanha(posts: DispatchView[], agora = new Date(), proximos = 2): ItemDoDia[] {
  const hoje = dayBR(agora);
  const amanha = dayBRAgo(-1, agora);
  const item = (p: DispatchView, estado: EstadoDoPost, iso: string): ItemDoDia => {
    const dia = dayBROf(iso);
    const prefixo = dia === hoje ? "" : dia === amanha ? "amanhã " : `${diaMesBR(iso) ?? ""} `;
    return { id: p.id, hora: `${prefixo}${horaBR(iso)}`, estado, texto: textoDoPost(p), enviados: p.sent, total: p.total, repete: p.recurrence };
  };
  const agoraMs = agora.getTime();
  const emCurso = posts
    .filter((p) => p.status === "running" || p.status === "queued")
    .map((p) => item(p, p.status === "running" ? "postando" : "na_fila", quandoDoPost(p)));
  const feitos = posts
    .filter((p) => (p.status === "sent" || p.status === "failed") && dayBROf(quandoDoPost(p)) === hoje)
    .sort((a, b) => Date.parse(quandoDoPost(b)) - Date.parse(quandoDoPost(a)))
    .map((p) => item(p, p.status === "sent" ? "postado" : "falhou", quandoDoPost(p)));
  const agendados = posts
    .filter((p) => p.status === "scheduled" && p.scheduledAt && Date.parse(p.scheduledAt) >= agoraMs)
    .sort((a, b) => Date.parse(a.scheduledAt ?? "") - Date.parse(b.scheduledAt ?? ""))
    .slice(0, proximos)
    .map((p) => item(p, "agendado", p.scheduledAt ?? ""));
  return [...emCurso, ...feitos, ...agendados];
}
