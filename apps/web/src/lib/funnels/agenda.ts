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
    // Comparação por `<`/`>`, não `localeCompare`: o Postgres/PostgREST serializa
    // timestamptz com largura variável (corta zeros à direita da fração), e a
    // colação ICU de `localeCompare` não é ordem por codepoint — duas datas no
    // mesmo segundo, uma com microssegundos e outra sem, saíam fora de ordem
    // dependendo do locale/ICU do navegador. Mesmo padrão de `dispatch-view.ts`.
    // Após o envio, `scheduledAt` some (`toDispatchView`) e a chave vira
    // `createdAt` — a ordem sobrevive porque os inserts da confirmação são
    // sequenciais, não porque `createdAt` reflete o horário de cada etapa.
    const ordenadas = [...linhas].sort((a, b) => {
      const ka = a.scheduledAt ?? a.createdAt;
      const kb = b.scheduledAt ?? b.createdAt;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
    const label = getFunnelTemplate(ordenadas[0].funnelTemplateId ?? "")?.label ?? "Funil";
    ordenadas.forEach((msg, i) => {
      saida.set(msg.id, { label, index: i + 1, total: ordenadas.length });
    });
  }
  return saida;
}
