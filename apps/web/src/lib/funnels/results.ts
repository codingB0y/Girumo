import { getFunnelTemplate } from "./templates";

/** Total de uma oferta relâmpago, por broadcast da etapa que a abriu. */
export type OfferTotals = {
  broadcastId: string;
  slots: number;
  /** Mandaram a palavra no grupo. */
  pediram: number;
  /** Entraram em atendimento (tiveram reserva). */
  atendidas: number;
  vendeu: number;
  desistiram: number;
};

export type FunnelResultStep = {
  id: string;
  index: number;
  label: string;
  body: string;
  at?: string;
  status: string;
  sent: number;
  total: number;
  offer?: OfferTotals;
};

export type FunnelResult = {
  runId: string;
  templateId: string;
  label: string;
  /** Criação da 1ª etapa: é o que ordena os funis, do mais novo pro mais velho. */
  startedAt: string;
  steps: FunnelResultStep[];
  enviadas: number;
  gruposEntregues: number;
  gruposAlvo: number;
  /** Soma das ofertas do funil (hoje um roteiro tem no máximo uma). */
  offer?: OfferTotals;
};

/**
 * Tipo estrutural, como em `agenda.ts`: serve a `DispatchView` (Supabase) e a
 * `CampaignMessage` (JSON de dev) sem acoplar a nenhum dos dois.
 */
type Linha = {
  id: string;
  body?: string;
  funnelTemplateId?: string;
  funnelRunId?: string;
  scheduledAt?: string;
  dispatchedAt?: string;
  createdAt: string;
  status: string;
  sent: number;
  total: number;
};

/** Primeira linha do texto, para a lista não virar um muro. */
function primeiraLinha(body: string | undefined): string {
  return (body ?? "").split("\n")[0]?.trim() ?? "";
}

/**
 * Agrupa as mensagens por confirmação de funil. Ordem das etapas é a de
 * criação, pelo mesmo motivo de `indexFunnelRuns`: `confirmFunnel` insere uma
 * a uma, na ordem do roteiro, e `scheduledAt` some ao enviar ou cancelar.
 */
export function buildFunnelResults(
  linhas: ReadonlyArray<Linha>,
  ofertas: ReadonlyArray<OfferTotals> = [],
): FunnelResult[] {
  const porOferta = new Map(ofertas.map((o) => [o.broadcastId, o]));
  const porRun = new Map<string, Linha[]>();
  for (const linha of linhas) {
    if (!linha.funnelRunId) continue;
    porRun.set(linha.funnelRunId, [...(porRun.get(linha.funnelRunId) ?? []), linha]);
  }

  const resultados: FunnelResult[] = [];
  for (const [runId, doRun] of porRun) {
    const ordenadas = [...doRun].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );
    const templateId = ordenadas[0].funnelTemplateId ?? "";
    const template = getFunnelTemplate(templateId);

    // O nome de cada etapa vem do roteiro, POR POSIÇÃO — e só quando a contagem
    // bate. O lojista pode desmarcar etapas antes de agendar, e aí a 2ª mensagem
    // não é a 2ª do roteiro: nomear pela posição poria "Entra agora" no lugar
    // errado. `broadcasts` não guarda qual etapa era, então sem casar fica genérico.
    const nomeia = template !== undefined && template.steps.length === ordenadas.length;

    const steps: FunnelResultStep[] = ordenadas.map((linha, i) => ({
      id: linha.id,
      index: i + 1,
      label: nomeia ? (template as { steps: readonly { label: string }[] }).steps[i].label : `Etapa ${i + 1}`,
      body: primeiraLinha(linha.body),
      at: linha.dispatchedAt ?? linha.scheduledAt,
      status: linha.status,
      sent: linha.sent,
      total: linha.total,
      offer: porOferta.get(linha.id),
    }));

    const enviadas = steps.filter((s) => s.status === "sent").length;
    resultados.push({
      runId,
      templateId,
      label: template?.label ?? "Funil",
      startedAt: ordenadas[0].createdAt,
      steps,
      enviadas,
      gruposEntregues: steps.reduce((soma, s) => soma + s.sent, 0),
      gruposAlvo: steps.reduce((soma, s) => soma + s.total, 0),
      offer: steps.find((s) => s.offer)?.offer,
    });
  }

  return resultados.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}
