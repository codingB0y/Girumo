import type { MarcaDoFio } from "./fio";
import type { ConversaDto, FioDaConversa, MensagemDto } from "./tipos";

/** Regras puras da tela Conversas (spec §7.7). Sem React, sem rede, sem relógio próprio. */

export type StatusFiltro = "open" | "waiting" | "resolved";
export type FiltroDaLista = { status?: StatusFiltro; naoLidas?: boolean; busca: string; etiqueta: string };
export const SEM_FILTRO: FiltroDaLista = { busca: "", etiqueta: "" };

/** Os filtros na URL de `GET /api/ig/conversations`. */
export function queryDaLista(f: FiltroDaLista, cursor?: string | null): string {
  const p = new URLSearchParams();
  if (f.status) p.set("status", f.status);
  if (f.naoLidas) p.set("naoLidas", "1");
  const busca = f.busca.trim().replace(/^@/, "");
  if (busca) p.set("busca", busca);
  if (f.etiqueta) p.set("etiqueta", f.etiqueta);
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

const tempo = (iso: string | null): number => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
};

/** Junta sem duplicar por `id` (a versão nova vence) e ordena pela última mensagem, a mais recente primeiro. */
export function mesclarConversas(atuais: readonly ConversaDto[], novas: readonly ConversaDto[]): ConversaDto[] {
  const porId = new Map(atuais.map((c) => [c.id, c]));
  for (const c of novas) porId.set(c.id, c);
  return [...porId.values()].sort((a, b) => tempo(b.ultimaEm) - tempo(a.ultimaEm));
}

/**
 * Recarga em silêncio da primeira página: ela substitui a que a tela tinha (some quem saiu do filtro) e as páginas
 * mais antigas já carregadas continuam. Sem próxima página, a primeira é a lista inteira.
 */
export function trocarPrimeiraPagina(atuais: readonly ConversaDto[], primeira: readonly ConversaDto[], haMais: boolean): ConversaDto[] {
  if (!haMais || primeira.length === 0) return mesclarConversas([], primeira);
  const corte = Math.min(...primeira.map((c) => tempo(c.ultimaEm)));
  const ids = new Set(primeira.map((c) => c.id));
  return mesclarConversas(atuais.filter((c) => !ids.has(c.id) && tempo(c.ultimaEm) < corte), primeira);
}

/** Junta sem duplicar por `id` (a versão nova vence) e deixa em ordem de leitura: a mais antiga em cima. */
export function mesclarMensagens(atuais: readonly MensagemDto[], novas: readonly MensagemDto[]): MensagemDto[] {
  const porId = new Map(atuais.map((m) => [m.id, m]));
  for (const m of novas) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) => tempo(a.criadaEm) - tempo(b.criadaEm));
}

/** Rótulo da bolha nossa, pelos eventos: sem evento, sem rótulo (a loja pode ter respondido pelo app do Instagram). */
export function rotuloDaBolha(m: Pick<MensagemDto, "direcao" | "autor">): "Robô" | "Você" | null {
  if (m.direcao !== "out") return null;
  return m.autor === "robo" ? "Robô" : m.autor === "voce" ? "Você" : null;
}

type Partes = { dia: string; hora: string };

function partes(iso: string, fuso?: string): Partes {
  const f = new Intl.DateTimeFormat("pt-BR", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const o: Record<string, string> = {};
  for (const p of f.formatToParts(new Date(iso))) o[p.type] = p.value;
  return { dia: `${o.day}/${o.month}/${o.year}`, hora: `${o.hour}:${o.minute}` };
}

export const horaCurta = (iso: string, fuso?: string): string => partes(iso, fuso).hora;

/** "14:21" hoje, "amanhã, 14:21", senão "17/10, 13:48". */
export function quando(iso: string, agora: Date, fuso?: string): string {
  const p = partes(iso, fuso);
  if (p.dia === partes(agora.toISOString(), fuso).dia) return p.hora;
  if (p.dia === partes(new Date(agora.getTime() + 86_400_000).toISOString(), fuso).dia) return `amanhã, ${p.hora}`;
  return `${p.dia.slice(0, 5)}, ${p.hora}`;
}

/** Hora na lista: hoje só a hora, antes disso a data. */
export function horaDaLista(iso: string | null, agora: Date, fuso?: string): string {
  if (!iso) return "";
  const p = partes(iso, fuso);
  return p.dia === partes(agora.toISOString(), fuso).dia ? p.hora : p.dia.slice(0, 5);
}

/** "30 min", "5 h", "2 dias". */
export function duracaoDesde(iso: string, agora: Date): string {
  const min = Math.max(0, Math.floor((agora.getTime() - Date.parse(iso)) / 60_000));
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return d === 1 ? "1 dia" : `${d} dias`;
}

export function textoDaMarca(m: MarcaDoFio, fuso?: string): string {
  const h = horaCurta(m.em, fuso);
  if (m.tipo === "waiting") return m.motivo === "handoff" ? `Um fluxo passou a conversa pra você · ${h}` : `Nenhum fluxo respondeu · aguardando você desde ${h}`;
  if (m.tipo === "paused") return m.motivo === "retomado_pela_loja" ? `Robô retomado · ${h}` : `Robô pausa aqui · ${h}`;
  if (m.motivo === "loja") return `Resolvida por você · ${h}`;
  if (m.motivo === "janela_fechou") return `Resolvida: a janela de 7 dias fechou · ${h}`;
  if (m.motivo === "parada_24h") return `Resolvida: sem resposta há 24 h · ${h}`;
  return `Resolvida · ${h}`;
}

export type ItemDoFio = { tipo: "mensagem"; mensagem: MensagemDto } | { tipo: "marca"; chave: string; texto: string };

/** Mensagens e marcas na mesma linha do tempo: cada marca entra antes da primeira mensagem posterior a ela. */
export function itensDoFio(mensagens: readonly MensagemDto[], marcas: readonly MarcaDoFio[], fuso?: string): ItemDoFio[] {
  const ordenadas = [...marcas].sort((a, b) => tempo(a.em) - tempo(b.em));
  const itens: ItemDoFio[] = [];
  let i = 0;
  for (const mensagem of mensagens) {
    while (i < ordenadas.length && tempo(ordenadas[i].em) <= tempo(mensagem.criadaEm)) itens.push(itemDaMarca(ordenadas[i++], fuso));
    itens.push({ tipo: "mensagem", mensagem });
  }
  while (i < ordenadas.length) itens.push(itemDaMarca(ordenadas[i++], fuso));
  return itens;
}

const itemDaMarca = (m: MarcaDoFio, fuso?: string): ItemDoFio => ({ tipo: "marca", chave: `${m.tipo}:${m.em}`, texto: textoDaMarca(m, fuso) });

export type EstadoDoCampo = {
  modo: FioDaConversa["janela"]["estado"];
  podeEnviar: boolean;
  rotuloEnviar: string;
  /** Linha de cima do campo (a faixa da janela). */
  faixa: string;
  /** Explicação debaixo do campo. */
  nota: string;
  /** Só com o robô pausado: o prazo da pausa. */
  pausadoAte: string | null;
};

const JANELA_FECHADA = "O Instagram não deixa a loja escrever primeiro. Quando ela mandar mensagem de novo, a conversa abre aqui e no topo da lista.";

/** Os estados do campo de resposta (`Estados.dc.html`). O estado da janela vem da rota; aqui só vira texto e prazo. */
export function estadoDoCampo(janela: FioDaConversa["janela"], roboPausadoAte: string | null, agora: Date, fuso?: string): EstadoDoCampo {
  const pausadoAte = roboPausadoAte && Date.parse(roboPausadoAte) > agora.getTime() ? roboPausadoAte : null;
  const ultima = janela.ultimaDelaEm;
  if (janela.estado === "aberta" && ultima) {
    const ate = quando(new Date(Date.parse(ultima) + 24 * 3_600_000).toISOString(), agora, fuso);
    return { modo: "aberta", podeEnviar: true, rotuloEnviar: "Enviar", faixa: `Janela aberta: pode responder até ${ate}`, nota: "24 h depois da última mensagem dela. Robô e você respondem normal.", pausadoAte };
  }
  if (janela.estado === "humano" && ultima) {
    const ate = quando(new Date(Date.parse(ultima) + 7 * 86_400_000).toISOString(), agora, fuso);
    const nota = `A última mensagem dela foi há ${duracaoDesde(ultima, agora)}. O Instagram deixa a loja responder até 7 dias depois, só como atendimento de pessoa: o robô não manda nada nesse período. Até ${ate}.`;
    return { modo: "humano", podeEnviar: true, rotuloEnviar: "Enviar como atendimento", faixa: "Passou de 24 h, ainda dentro de 7 dias", nota, pausadoAte };
  }
  const desde = ultima ? `A última mensagem dela foi há ${duracaoDesde(ultima, agora)}. ` : "";
  return { modo: "fechada", podeEnviar: false, rotuloEnviar: "Enviar", faixa: "Fechada pelo Instagram", nota: `${desde}${JANELA_FECHADA}`, pausadoAte };
}

export const NOTA_DA_PAUSA = "Enquanto pausado, nenhuma palavra dela dispara fluxo e nenhum fluxo esperando a resposta dela anda. Volta sozinho depois de 12 h sem você responder, ou quando você clica em Resolver.";

/** Linha de `ig_conversations` como o Realtime entrega (colunas do banco). Só o que a tela usa. */
export type LinhaDoRealtime = {
  id?: unknown;
  tenant_id?: unknown;
  username?: unknown;
  display_name?: unknown;
  status?: unknown;
  folder?: unknown;
  unread_count?: unknown;
  last_message_at?: unknown;
  last_direction?: unknown;
  last_preview?: unknown;
  bot_paused_until?: unknown;
};

const texto = (v: unknown): string | null => (typeof v === "string" ? v : null);

/** Mesma tradução que a rota faz (`paraConversa`); `null` se a linha não é uma conversa legível. */
export function conversaDoRealtime(linha: LinhaDoRealtime | null | undefined, agora: Date): ConversaDto | null {
  if (!linha || typeof linha.id !== "string") return null;
  const situacao = linha.status;
  if (situacao !== "open" && situacao !== "waiting" && situacao !== "resolved") return null;
  const pausa = texto(linha.bot_paused_until);
  const direcao = linha.last_direction === "in" || linha.last_direction === "out" ? linha.last_direction : null;
  return {
    id: linha.id,
    username: texto(linha.username),
    nome: texto(linha.display_name),
    situacao,
    pedido: linha.folder === "requests",
    naoLidas: typeof linha.unread_count === "number" ? linha.unread_count : 0,
    ultimaEm: texto(linha.last_message_at),
    ultimaDirecao: direcao,
    previa: texto(linha.last_preview),
    roboPausadoAte: pausa && Date.parse(pausa) > agora.getTime() ? pausa : null,
  };
}

/** A linha do Realtime é da loja desta sessão? (o filtro do canal já pede, mas a tela não confia só nele). Sem loja conhecida, nada passa. */
export const linhaEhDaLoja = (linha: LinhaDoRealtime | null | undefined, tenantId: string | null): boolean => !!tenantId && linha?.tenant_id === tenantId;

/**
 * Debounce com teto: quanto esperar para o próximo disparo. A cada evento a espera recomeça (`esperaMs`), mas nunca
 * passa de `tetoMs` desde o primeiro evento da rajada (`primeiroEm`, null = rajada nova). Sem teto, um fluxo constante
 * de eventos nunca deixa a consulta sair.
 */
export function atrasoComTeto(primeiroEm: number | null, agora: number, esperaMs: number, tetoMs: number): number {
  if (primeiroEm === null) return Math.min(esperaMs, tetoMs);
  return Math.max(0, Math.min(esperaMs, primeiroEm + tetoMs - agora));
}

/** Carimbo de sequência: só a resposta do último pedido feito pode gravar estado. */
export function criarSequencia() {
  let ultimo = 0;
  return { novo: (): number => ++ultimo, atual: (n: number): boolean => n === ultimo };
}

/**
 * O cursor "mais antigas" depois de uma recarga em silêncio da primeira página: com páginas extras já carregadas ele
 * fica onde está (senão a lista voltaria a oferecer a página 2); sem elas, vale o da primeira página.
 */
export const proximoAposRecarga = (atual: string | null, daPrimeira: string | null, carregouMais: boolean): string | null => (carregouMais ? atual : daPrimeira);

/** A linha cabe no filtro atual? (a etiqueta mora na ficha, então quem filtra por ela não decide aqui). */
export function casaComFiltro(c: ConversaDto, f: FiltroDaLista): boolean {
  if (f.status && c.situacao !== f.status) return false;
  if (f.naoLidas && c.naoLidas === 0) return false;
  const busca = f.busca.trim().replace(/^@/, "").toLowerCase();
  return !busca || (c.username ?? "").toLowerCase().includes(busca);
}

const COM_CONTADOR = /^\(\d+\)\s/;

/** "(4) Instagram — Girumo"; sem ninguém esperando, o título puro. Idempotente. */
export function tituloComContador(titulo: string, n: number): string {
  const base = titulo.replace(COM_CONTADOR, "");
  return n > 0 ? `(${n}) ${base}` : base;
}

export type AoVivo = "conectando" | "realtime" | "consulta";
export const ESPERA_DO_REALTIME_MS = 10_000;

/** A assinatura do Realtime: `inscrito` = conectou; `caiu` = erro, timeout ou fechou; `vencido` = 10 s sem conectar. */
export function proximoAoVivo(atual: AoVivo, sinal: "inscrito" | "caiu" | "vencido"): AoVivo {
  if (sinal === "inscrito") return "realtime";
  if (sinal === "caiu") return "consulta";
  return atual === "conectando" ? "consulta" : atual;
}

export function iniciais(username: string | null, nome: string | null): string {
  const base = (username ?? nome ?? "").replace(/^@/, "").replace(/[^\p{L}\p{N}]/gu, "");
  return base.slice(0, 2).toUpperCase() || "?";
}
