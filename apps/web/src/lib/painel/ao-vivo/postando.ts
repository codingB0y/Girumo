import { SEGUNDOS_POR_MENSAGEM } from "@/lib/campaigns/dispatch-eta";
import { dayBR, dayBRAgo, dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import type { Group } from "@/lib/mock-data";
import { numeroDoGrupo } from "@/lib/painel/ao-vivo/mapa";
import type { EntregaNoGrupo, EstadoDaEntrega, ResumoDaEntrega } from "@/lib/painel/entrega";

/**
 * A coluna "Postando agora" da Início "Ao vivo": quando o post termina, a grade
 * de entrega e os próximos agendamentos. Sem ordem de envio nem posição na fila
 * (ver `lib/painel/entrega.ts`): a grade é por número do grupo.
 */

export type CelulaDaGrade = { id: string; rotulo: string; nome: string; estado: EstadoDaEntrega; quando: string | null };
export type Proximo = { id: string; quando: string; nome: string };

const TEXTO_DO_ESTADO: Record<EstadoDaEntrega, string> = {
  entregue: "entregue",
  postando: "postando",
  na_fila: "na fila",
  falhou: "falhou",
  cancelado: "cancelado",
};

/** "HH:MM" em que a rodada acaba, na mesma conta de `etaDisparo`: 6 s por mensagem, nunca otimista. Null sem restantes. */
export function terminaPorVolta(resumo: ResumoDaEntrega, agora: Date): string | null {
  const restantes = resumo.postando + resumo.naFila;
  if (restantes <= 0) return null;
  return horaBR(new Date(agora.getTime() + restantes * SEGUNDOS_POR_MENSAGEM * 1000).toISOString());
}

/** Pelo número do grupo; sem número, depois, pelo nome; fora do cadastro por último. */
export function gradeDaEntrega(entrega: EntregaNoGrupo[], grupos: Group[]): CelulaDaGrade[] {
  const porId = new Map(grupos.map((g) => [g.whatsappGroupId, g]));
  const itens = entrega.map((e) => {
    const g = porId.get(e.grupo);
    return { e, nome: g?.name ?? e.grupo, numero: g ? numeroDoGrupo(g) : null, cadastrado: g !== undefined };
  });
  itens.sort((a, b) => {
    if (a.cadastrado !== b.cadastrado) return a.cadastrado ? -1 : 1;
    if (a.numero !== null && b.numero !== null && a.numero !== b.numero) return a.numero - b.numero;
    if ((a.numero === null) !== (b.numero === null)) return a.numero === null ? 1 : -1;
    return a.nome.localeCompare(b.nome, "pt-BR", { numeric: true });
  });
  return itens.map(({ e, nome, numero }, i) => ({
    id: e.grupo,
    rotulo: numero !== null ? `#${numero}` : `${i + 1}º`,
    nome,
    estado: e.estado,
    quando: e.quando,
  }));
}

function quandoDoAgendamento(iso: string, agora: Date): string {
  const dia = dayBROf(iso);
  if (dia === dayBR(agora)) return horaBR(iso);
  if (dia === dayBRAgo(-1, agora)) return `amanhã ${horaBR(iso)}`;
  return `${diaMesBR(iso)} ${horaBR(iso)}`;
}

export function proximosAgendamentos(
  agendamentos: { id: string; campaignName?: string; scheduledAt?: string; status?: string }[],
  agora: Date,
  limite = 3,
): Proximo[] {
  return agendamentos
    .flatMap((a) => {
      const t = a.scheduledAt ? Date.parse(a.scheduledAt) : NaN;
      return a.status === "pending" && a.scheduledAt && t > agora.getTime() ? [{ a, t, iso: a.scheduledAt }] : [];
    })
    .sort((x, y) => x.t - y.t)
    .slice(0, limite)
    .map(({ a, iso }) => ({ id: a.id, quando: quandoDoAgendamento(iso, agora), nome: a.campaignName || "Post agendado" }));
}

/** O que a célula diz para quem não enxerga a cor: "#3, Moda Sul 03: entregue às 14:08". */
export function rotuloDaCelula(c: CelulaDaGrade): string {
  const titulo = c.nome === c.rotulo ? c.rotulo : `${c.rotulo}, ${c.nome}`;
  const hora = c.estado === "entregue" ? horaBR(c.quando) : "";
  return `${titulo}: ${TEXTO_DO_ESTADO[c.estado]}${hora ? ` às ${hora}` : ""}`;
}
