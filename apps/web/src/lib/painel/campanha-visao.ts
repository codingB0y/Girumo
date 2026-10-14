import type { CampaignGroupOverview } from "@/lib/campaign-groups-overview";
import type { DispatchRecurrence, DispatchView } from "@/lib/campaigns/dispatch-view";
import { dayBR, dayBRAgo, dayBROf, diaMesBR, horaBR } from "@/lib/date-br";
import type { EstadoDoGrupo as EstadoDoBanco, EstadoGrupo } from "@/lib/groups/estado";
import { isUsableInvite } from "@/lib/links/resolve-click-target";
import type { GrupoAberto } from "@/lib/painel/atividade";
import { abreviaNome } from "@/lib/painel/casca";
import type { EstadoDoGrupo } from "@/lib/painel/grupos";

/**
 * Visão geral da campanha na direção D (spec 2026-09-24, PR B): grupos, o dia
 * dos posts e as últimas entradas. As novas pessoas saem de `leads.entered_at`
 * (1ª entrada de cada pessoa, no grupo de origem). As séries por hora e por dia
 * vêm do banco, em `atividade.ts` (PR C); saídas, no PR D. As últimas entradas,
 * de GET /api/campanhas/[slug]/entradas.
 */

export type LeadResumo = {
  id?: string;
  name?: string | null;
  sourceGroup?: string | null;
  sourceGroupId?: string | null;
  enteredAt?: string | null;
};

/** Uma linha de "Últimas entradas" como sai do servidor: sem telefone, e o nome abreviado. */
export type EntradaRecente = { id: string; nome: string; grupo: string; entrouEm: string };

/** GET /api/campanhas/[slug]/entradas: lido no banco, sem o teto de 1000 linhas de /api/leads. */
export type EntradasDaCampanha = {
  /** Quem entrou nos grupos desde a criação da campanha. */
  entradas: number;
  /** As mais recentes, de qualquer dia. */
  ultimas: EntradaRecente[];
};

/** O nome inteiro e o telefone não saem do servidor: "Daiane S. veio pelo VIP #40" basta. */
export function paraEntradaRecente(l: LeadResumo): EntradaRecente {
  return { id: l.id ?? "", nome: abreviaNome(l.name), grupo: l.sourceGroup ?? "", entrouEm: l.enteredAt ?? "" };
}

/** O estado da tela global de grupos (Início › mapa), pela porcentagem; a campanha usa o banco. */
export type EstadoNaCampanha = EstadoDoGrupo | "sumiu";

/*
 * A Visão geral da campanha (postar por grupo, T5): o estado de cada linha é o do banco
 * (`GET /grupos/estados`, o mesmo da aba Grupos e do `/r/`), nunca a porcentagem. As linhas
 * continuam sendo as de `CampaignGroupOverview`: entrega do post e entradas de hoje são
 * indexadas pelo id que a campanha guarda em `groupIds`.
 */

/** O que o selo da linha diz: o estado do banco, ou por que não há um. */
export type SeloDaLinha = EstadoDoBanco | "sem_convite" | "sumiu" | "sem_estado";
export type FiltroDeGrupos = "todos" | EstadoDoBanco;

/**
 * Pelo JID, como `app.estados_da_campanha` cruza o pool (`whatsapp_group_id = jid`): entrada de
 * `groupIds` com o uuid da linha nunca volta do SQL, e indexar o uuid só duplicaria a linha.
 */
export function indiceDeEstados(estados: EstadoGrupo[]): Map<string, EstadoGrupo> {
  return new Map(estados.map((e) => [e.whatsappGroupId, e]));
}

export function seloDaLinha(g: CampaignGroupOverview, estado: EstadoGrupo | undefined): SeloDaLinha {
  // O banco decide primeiro. O pai e o Avisos da comunidade não chegam aqui: saem de /api/groups e
  // do SQL (20261014120000), e `semEstruturaDeComunidade` os tira da tabela antes.
  if (estado) {
    // O link pula quem não tem convite que ele aceite; lotado não recebe ninguém de qualquer jeito.
    if ((estado.estado === "fila" || estado.estado === "vazio") && !isUsableInvite(estado.inviteUrl)) return "sem_convite";
    return estado.estado;
  }
  // Fora do banco e da lista: saiu do WhatsApp, não é "sem convite". Na lista e fora do banco
  // (um sync entre as duas leituras): não chuta pela porcentagem.
  return g.group ? "sem_estado" : "sumiu";
}

/**
 * Tira da tabela o pai e o Avisos de comunidade postos no pool: o SQL os ignora de propósito
 * (20261014120000) e /api/groups também, então sem isto cairiam em "Sumiu".
 */
export function semEstruturaDeComunidade(
  grupos: CampaignGroupOverview[],
  estrutura: readonly string[],
): CampaignGroupOverview[] {
  if (estrutura.length === 0) return grupos;
  const fora = new Set(estrutura);
  return grupos.filter((g) => !fora.has(g.id));
}

/** Pelo estado do banco, como a faixa conta: a fila sem convite continua em "Na fila". */
export function filtrarGrupos(
  grupos: CampaignGroupOverview[],
  filtro: FiltroDeGrupos,
  porId: Map<string, EstadoGrupo>,
): CampaignGroupOverview[] {
  if (filtro === "todos") return grupos;
  return grupos.filter((g) => porId.get(g.id)?.estado === filtro);
}

/** A ordem do pool, a mesma da aba Grupos e do link; quem não tem estado vai para o fim, na ordem que veio. */
export function ordenarGrupos(grupos: CampaignGroupOverview[], porId: Map<string, EstadoGrupo>): CampaignGroupOverview[] {
  const posicao = (g: CampaignGroupOverview) => porId.get(g.id)?.posicao ?? Number.MAX_SAFE_INTEGER;
  return [...grupos].sort((a, b) => posicao(a) - posicao(b));
}

function daCampanha(leads: LeadResumo[], groupIds: string[]): LeadResumo[] {
  const ids = new Set(groupIds);
  return leads.filter((l) => l.sourceGroupId && ids.has(l.sourceGroupId) && l.enteredAt);
}

/**
 * Serve ao JSON, que não tem teto de linhas; com Supabase a rota lê no banco
 * (`listLatestEntries`, em stores/leads.ts).
 */
export function ultimasEntradas(leads: LeadResumo[], groupIds: string[], quantas = 5): LeadResumo[] {
  return daCampanha(leads, groupIds)
    .sort((a, b) => Date.parse(b.enteredAt ?? "") - Date.parse(a.enteredAt ?? ""))
    .slice(0, quantas);
}

/** O que um item do dia é: um post em cada momento, ou um grupo novo que o "abre outro" criou. */
export type EstadoDoPost = "postando" | "na_fila" | "postado" | "falhou" | "agendado" | "grupo_aberto";

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

/**
 * "#40": o número que o "abre outro" pôs no nome, qualquer que seja o molde. O
 * padrão é "<campanha> {n}", sem "#", então ler o número do nome não serve.
 */
export function apelidoDoGrupo(g: Pick<GrupoAberto, "seq">): string {
  return `#${g.seq}`;
}

/** Quando o post saiu (ou começou a sair); o rascunho, quando foi criado. */
export function quandoDoPost(p: DispatchView): string {
  return p.runningSince ?? p.dispatchedAt ?? p.createdAt;
}

/**
 * O dia da campanha, como a linha do tempo mostra: primeiro o que está saindo
 * agora, depois o que aconteceu hoje (posts que saíram e grupos abertos
 * sozinhos, mais recente em cima) e, por fim, os próximos agendados. Rascunho
 * não entra.
 */
export function hojeNaCampanha(posts: DispatchView[], agora = new Date(), proximos = 2, gruposAbertos: GrupoAberto[] = []): ItemDoDia[] {
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
  const postsFeitos = posts
    .filter((p) => (p.status === "sent" || p.status === "failed") && dayBROf(quandoDoPost(p)) === hoje)
    .map((p) => ({ quando: Date.parse(quandoDoPost(p)), item: item(p, p.status === "sent" ? "postado" : "falhou", quandoDoPost(p)) }));
  const abertos = gruposAbertos
    .filter((g) => dayBROf(g.quando) === hoje)
    .map((g) => ({
      quando: Date.parse(g.quando),
      item: {
        id: `grupo:${g.grupo ?? g.nome}:${g.quando}`,
        hora: horaBR(g.quando),
        estado: "grupo_aberto" as const,
        texto: `${apelidoDoGrupo(g)} aberto sozinho`,
        enviados: 0,
        total: 0,
        repete: "none" as const,
      },
    }));
  const feitos = [...postsFeitos, ...abertos].sort((a, b) => b.quando - a.quando).map((f) => f.item);
  const agendados = posts
    .filter((p) => p.status === "scheduled" && p.scheduledAt && Date.parse(p.scheduledAt) >= agoraMs)
    .sort((a, b) => Date.parse(a.scheduledAt ?? "") - Date.parse(b.scheduledAt ?? ""))
    .slice(0, proximos)
    .map((p) => item(p, "agendado", p.scheduledAt ?? ""));
  return [...emCurso, ...feitos, ...agendados];
}
