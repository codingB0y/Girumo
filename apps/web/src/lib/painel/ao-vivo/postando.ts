import { SEGUNDOS_POR_MENSAGEM } from "@/lib/campaigns/dispatch-eta";
import { dayBR, dayBRAgo, dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import type { Group } from "@/lib/mock-data";
import { numeroDoGrupo } from "@/lib/painel/ao-vivo/mapa";
import { aindaSaindo, type EntregaNoGrupo, type EstadoDaEntrega, type ResumoDaEntrega } from "@/lib/painel/entrega";
import { numero } from "@/lib/painel/grupos";

/**
 * A coluna "Postando agora" da Início "Ao vivo": quando o post termina, a grade
 * de entrega e os próximos agendamentos. Sem ordem de envio nem posição na fila
 * (ver `lib/painel/entrega.ts`): a grade é por número do grupo.
 */

export type CelulaDaGrade = { id: string; rotulo: string; nome: string; estado: EstadoDaEntrega; quando: string | null };
export type Proximo = { id: string; quando: string; nome: string };

/** Rótulo curto do grupo sem número: o nome, cortado. Nunca uma posição, que pareceria ordem de envio. */
const LIMITE_DO_ROTULO = 24;
const GRUPO_FORA_DO_CADASTRO = "grupo fora do cadastro";

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
    return { e, nome: g?.name ?? GRUPO_FORA_DO_CADASTRO, numero: g ? numeroDoGrupo(g) : null, cadastrado: g !== undefined };
  });
  itens.sort((a, b) => {
    if (a.cadastrado !== b.cadastrado) return a.cadastrado ? -1 : 1;
    if (a.numero !== null && b.numero !== null && a.numero !== b.numero) return a.numero - b.numero;
    if ((a.numero === null) !== (b.numero === null)) return a.numero === null ? 1 : -1;
    return a.nome.localeCompare(b.nome, "pt-BR", { numeric: true });
  });
  return itens.map(({ e, nome, numero }) => ({
    id: e.grupo,
    rotulo: numero !== null ? `#${numero}` : nome.length > LIMITE_DO_ROTULO ? `${nome.slice(0, LIMITE_DO_ROTULO - 1).trimEnd()}…` : nome,
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
  // Nome igual ao rótulo, ou rótulo que é só o nome cortado: o nome completo basta.
  const titulo = c.nome === c.rotulo || c.rotulo.endsWith("…") ? c.nome : `${c.rotulo}, ${c.nome}`;
  const hora = c.estado === "entregue" ? horaBR(c.quando) : "";
  return `${titulo}: ${TEXTO_DO_ESTADO[c.estado]}${hora ? ` às ${hora}` : ""}`;
}

const grupos = (n: number) => (n === 1 ? "grupo" : "grupos");

/** "Entrega no 1 grupo" / "Entrega nos 40 grupos". */
export function tituloDaGrade(n: number): string {
  return `Entrega ${n === 1 ? "no" : "nos"} ${numero(n)} ${grupos(n)}`;
}

/** "27 de 40 grupos", "1 de 1 grupo". */
export function placarDosGrupos(feitos: number, total: number): string {
  return `${numero(feitos)} de ${numero(total)} ${grupos(total)}`;
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
