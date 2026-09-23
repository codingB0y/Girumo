/**
 * Tela Funis: todos os funis da loja, de todas as campanhas. Puro.
 *
 * Um funil agendado é o que ainda tem etapa por sair: `scheduled` (dá para
 * cancelar) ou `queued`/`running` (saindo agora, não cancela mais). Enviado é o
 * que já pôs ao menos uma etapa no grupo e não tem mais nada por sair. Funil todo cancelado antes de sair não aparece: não tem nada a
 * mostrar nem a fazer.
 */
import type { FunnelResult } from "./results";

export type CampaignRef = { slug: string; name: string };

export type FunnelOverviewItem = FunnelResult & {
  campaign: CampaignRef;
  /** Ids das etapas ainda agendadas: é o que "Cancelar funil" cancela. */
  pendentes: string[];
  /** Próxima etapa a sair (agendado) ou a última que saiu (enviado). */
  quando?: string;
};

export type FunnelOverview = { agendados: FunnelOverviewItem[]; enviados: FunnelOverviewItem[] };

/** Ainda vai sair: agendada, ou já na fila do worker. */
const POR_SAIR: ReadonlySet<string> = new Set(["scheduled", "queued", "running"]);

const menor = (a: string, b: string) => (a < b ? a : b);
const maior = (a: string, b: string) => (a > b ? a : b);

export function buildOverview(runs: ReadonlyArray<FunnelResult & { campaign: CampaignRef }>): FunnelOverview {
  const agendados: FunnelOverviewItem[] = [];
  const enviados: FunnelOverviewItem[] = [];
  for (const run of runs) {
    const aSair = run.steps.filter((s) => POR_SAIR.has(s.status));
    if (aSair.length > 0) {
      const datas = aSair.map((s) => s.at).filter((at): at is string => Boolean(at));
      // Só o agendado se cancela; o que já está na fila do worker vai sair.
      const pendentes = aSair.filter((s) => s.status === "scheduled").map((s) => s.id);
      agendados.push({ ...run, pendentes, quando: datas.length ? datas.reduce(menor) : undefined });
      continue;
    }
    if (run.enviadas === 0) continue;
    const saidas = run.steps.filter((s) => s.status === "sent").map((s) => s.at).filter((at): at is string => Boolean(at));
    enviados.push({ ...run, pendentes: [], quando: saidas.length ? saidas.reduce(maior) : undefined });
  }
  // Agendados: o próximo a sair primeiro. Enviados: o mais recente primeiro.
  const porQuando = (a: FunnelOverviewItem, b: FunnelOverviewItem) => ((a.quando ?? "") < (b.quando ?? "") ? -1 : 1);
  return { agendados: agendados.sort(porQuando), enviados: enviados.sort((a, b) => porQuando(b, a)) };
}
