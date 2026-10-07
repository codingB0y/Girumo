import { SEGUNDOS_POR_MENSAGEM } from "@/lib/campaigns/dispatch-eta";
import { dayBR, dayBRAgo, dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import { aindaSaindo, type EstadoDaEntrega, type ResumoDaEntrega } from "@/lib/painel/entrega";
import { numero } from "@/lib/painel/grupos";

/**
 * A coluna "Postando agora" da Início "Ao vivo": quando o post termina, a barra
 * de entrega e os próximos agendamentos. A entrega grupo a grupo mora em Disparos
 * (spec G2, decisão 8).
 */

export type Proximo = { id: string; quando: string; nome: string };

/** "HH:MM" em que a rodada acaba, na mesma conta de `etaDisparo`: 6 s por mensagem, nunca otimista. Null sem restantes. */
export function terminaPorVolta(resumo: ResumoDaEntrega, agora: Date): string | null {
  const restantes = resumo.postando + resumo.naFila;
  if (restantes <= 0) return null;
  return horaBR(new Date(agora.getTime() + restantes * SEGUNDOS_POR_MENSAGEM * 1000).toISOString());
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

const grupos = (n: number) => (n === 1 ? "grupo" : "grupos");

/** "27 de 40 grupos", "1 de 1 grupo". */
export function placarDosGrupos(feitos: number, total: number): string {
  return `${numero(feitos)} de ${numero(total)} ${grupos(total)}`;
}

export type SegmentoDaEntrega = { estado: EstadoDaEntrega; n: number; texto: string };

/**
 * Os segmentos da barra de entrega (spec G2, decisão 8): entregues sempre (é o que a lojista espera ver,
 * mesmo em zero); enviando, na fila, falhou e cancelado só quando há alguém neles.
 */
export function segmentosDaEntrega(r: ResumoDaEntrega): SegmentoDaEntrega[] {
  const todos: SegmentoDaEntrega[] = [
    { estado: "entregue", n: r.entregues, texto: r.entregues === 1 ? "entregue" : "entregues" },
    { estado: "postando", n: r.postando, texto: "enviando" },
    { estado: "na_fila", n: r.naFila, texto: "na fila" },
    { estado: "falhou", n: r.falharam, texto: r.falharam === 1 ? "falhou" : "falharam" },
    { estado: "cancelado", n: r.cancelados, texto: r.cancelados === 1 ? "cancelado" : "cancelados" },
  ];
  return todos.filter((s) => s.n > 0 || s.estado === "entregue");
}

/** O que a bolha mostra: a pergunta quando é enquete (o corpo vem vazio), senão o texto. */
export function textoDoPost(p: { body: string; poll?: { question: string; options: string[] } | null }): string {
  return p.poll?.question?.trim() || p.body.trim();
}

/** Post `failed` nunca está saindo, mesmo com linha ainda na fila; sem entrega lida, vale o status. */
export function estaSaindo(post: { status: string }, resumo: ResumoDaEntrega | null): boolean {
  if (post.status === "failed") return false;
  return resumo ? aindaSaindo(resumo) : post.status === "running" || post.status === "queued";
}

const STATUS_DO_POST = ["draft", "scheduled", "queued", "running", "sent", "failed"];

/**
 * Número que só muda quando o post muda de verdade (status ou contagem). Passado a
 * `useEntrega`, faz reler a entrega quando um post na fila passa a sair (a leitura
 * vazia de antes não se atualiza sozinha), sem reler a cada recarga da página.
 */
export function versaoDoPost(post: { status: string; sent: number } | null): number {
  if (!post) return 0;
  return (STATUS_DO_POST.indexOf(post.status) + 2) * 1_000_000 + post.sent;
}

const falharam = (n: number) => `${numero(n)} ${n === 1 ? "falhou" : "falharam"}`;

/**
 * A frase de andamento do post: saindo, saiu, saiu com falhas ou não saiu.
 * Post `failed`, ou todos os grupos falharam, nunca diz "Saiu às" — com ou sem
 * a entrega lida (`resumo` nulo = ainda lendo, não carregou ou veio vazia).
 */
export function fraseDoAndamento(a: {
  post: { status: string; error?: string; sent: number; total: number };
  resumo: ResumoDaEntrega | null;
  hora: string;
  termino: string | null;
}): string {
  const { post, resumo, hora, termino } = a;
  if (estaSaindo(post, resumo)) return termino ? `termina por volta de ${termino}` : "saindo agora";
  const todosFalharam = resumo !== null && resumo.entregues === 0 && resumo.falharam > 0;
  if (post.status === "failed" || todosFalharam) {
    if (post.error) return `Não saiu · ${post.error}`;
    return todosFalharam && resumo ? `Não saiu · ${falharam(resumo.falharam)}` : "Não saiu";
  }
  const feitos = resumo ? resumo.entregues : post.sent;
  const total = resumo ? resumo.total : post.total;
  const base = `Saiu às ${hora} · ${numero(feitos)} de ${numero(total)}`;
  return resumo && resumo.falharam > 0 ? `${base} · ${falharam(resumo.falharam)}` : base;
}
