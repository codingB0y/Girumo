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
  createdAt: string;
};

/** Chip "Live · 2/4" por mensagem: agrupa por confirmação e ordena pela criação. */
export function indexFunnelRuns(messages: ReadonlyArray<Linha>): Map<string, FunnelChip> {
  const porRun = new Map<string, Linha[]>();
  for (const msg of messages) {
    if (!msg.funnelRunId) continue;
    porRun.set(msg.funnelRunId, [...(porRun.get(msg.funnelRunId) ?? []), msg]);
  }

  const saida = new Map<string, FunnelChip>();
  for (const linhas of porRun.values()) {
    // Comparação por `<`/`>`, não `localeCompare`: o Postgres/PostgREST serializa
    // timestamptz com largura variável (corta zeros à direita da fração), e a
    // colação ICU de `localeCompare` não é ordem por codepoint — duas datas no
    // mesmo segundo, uma com microssegundos e outra sem, saíam fora de ordem
    // dependendo do locale/ICU do navegador. Mesmo padrão de `dispatch-view.ts`.
    // Chave é só `createdAt`: `confirmFunnel` insere as etapas uma a uma, na
    // ordem do roteiro (retomada pula as já criadas). `scheduledAt` não serve —
    // some ao enviar ou cancelar, e a etapa pulava pra frente das pendentes.
    const ordenadas = [...linhas].sort((a, b) =>
      a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : 0,
    );
    const label = getFunnelTemplate(ordenadas[0].funnelTemplateId ?? "")?.label ?? "Funil";
    ordenadas.forEach((msg, i) => {
      saida.set(msg.id, { label, index: i + 1, total: ordenadas.length });
    });
  }
  return saida;
}
