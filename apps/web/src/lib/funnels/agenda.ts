import { getFunnelTemplate } from "./templates";

export type FunnelChip = { label: string; index: number; total: number };

/**
 * Tipo estrutural de propósito — não importa `CampaignMessage` nem
 * `DispatchView`. Em produção (`USE_SUPABASE`) a Agenda recebe `DispatchView`
 * (`@/lib/campaigns/dispatch-view`); o caminho legado JSON recebe
 * `CampaignMessage` (`@/lib/messages-store`). Os dois têm os mesmos campos
 * usados aqui, então um tipo mínimo funciona com ambos sem acoplar a um.
 */
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
