import type { DispatchView } from "@/lib/campaigns/dispatch-view";
import { dayBR, dayBROf } from "@/lib/date-br";
import { quandoDoPost, type ItemDoDia } from "@/lib/painel/campanha-visao";

/**
 * Entrega do post grupo a grupo (painel direção D, PR E; spec 2026-09-24).
 *
 * Sem posição na fila, de propósito: o fan-out insere todos os grupos com o
 * mesmo `created_at` e o worker pega por `priority, created_at, id`, então a
 * ordem entre grupos é aleatória. "12º na fila" seria um número inventado.
 */
export type EstadoDaEntrega = "entregue" | "postando" | "na_fila" | "falhou" | "cancelado";

export type EntregaNoGrupo = {
  /** `whatsapp_group_id` do grupo, o mesmo id de `campaign_groups.group_ids`. */
  grupo: string;
  estado: EstadoDaEntrega;
  /** Quando chegou ou falhou; null enquanto não terminou. */
  quando: string | null;
};

export type EntregaDoPost = {
  postId: string;
  /** Quando esta rodada do post começou a sair. */
  desde: string | null;
  grupos: EntregaNoGrupo[];
};

export type ResumoDaEntrega = {
  entregues: number;
  postando: number;
  naFila: number;
  falharam: number;
  cancelados: number;
  total: number;
};

const DO_COMANDO: Record<string, EstadoDaEntrega> = {
  done: "entregue",
  processing: "postando",
  queued: "na_fila",
  failed: "falhou",
  canceled: "cancelado",
};

/** O status de `engine_commands` como a tela fala; status desconhecido fica de fora. */
export function estadoDaEntrega(status: string): EstadoDaEntrega | null {
  return DO_COMANDO[status] ?? null;
}

export function resumoDaEntrega(grupos: EntregaNoGrupo[]): ResumoDaEntrega {
  const resumo: ResumoDaEntrega = { entregues: 0, postando: 0, naFila: 0, falharam: 0, cancelados: 0, total: grupos.length };
  for (const g of grupos) {
    if (g.estado === "entregue") resumo.entregues += 1;
    else if (g.estado === "postando") resumo.postando += 1;
    else if (g.estado === "na_fila") resumo.naFila += 1;
    else if (g.estado === "falhou") resumo.falharam += 1;
    else resumo.cancelados += 1;
  }
  return resumo;
}

/** Ainda tem grupo esperando: vale ler de novo daqui a pouco. */
export function aindaSaindo(resumo: ResumoDaEntrega): boolean {
  return resumo.postando + resumo.naFila > 0;
}

/** Item do dia com a contagem lida ao vivo; `restantes` é quantos grupos ainda esperam. */
export type ItemAoVivo = ItemDoDia & { restantes?: number };

/**
 * O post em curso de "Hoje na campanha" com a entrega lida agora: a lista de
 * posts foi lida uma vez, a entrega é relida enquanto ele sai.
 *
 * O estado sai da entrega, não da carga da página: um post que estava na fila
 * quando a página abriu passa a "postando" assim que um grupo recebe. Rodada
 * toda cancelada antes de sair não é falha: o item fica como estava.
 */
export function itemAoVivo(item: ItemDoDia, resumo: ResumoDaEntrega): ItemAoVivo {
  if (resumo.total === 0) return item;
  const saindo = aindaSaindo(resumo);
  if (!saindo && resumo.entregues === 0 && resumo.falharam === 0) return item;
  const estado = saindo
    ? resumo.entregues + resumo.postando > 0 ? "postando" : "na_fila"
    : resumo.entregues > 0 ? "postado" : "falhou";
  return { ...item, estado, enviados: resumo.entregues, total: resumo.total, restantes: resumo.postando + resumo.naFila };
}

/**
 * O post que a tabela de grupos acompanha: o que está saindo agora ou, se nada
 * está saindo, o último que saiu hoje. Null quando não houve post hoje.
 */
export function postDaTabela(posts: DispatchView[], agora: Date): DispatchView | null {
  const emCurso = posts.find((p) => p.status === "running" || p.status === "queued");
  if (emCurso) return emCurso;
  const hoje = dayBR(agora);
  return (
    posts
      .filter((p) => (p.status === "sent" || p.status === "failed") && dayBROf(quandoDoPost(p)) === hoje)
      .sort((a, b) => Date.parse(quandoDoPost(b)) - Date.parse(quandoDoPost(a)))[0] ?? null
  );
}
