import { horaBR } from "@/lib/date-br";
import type { Group } from "@/lib/mock-data";
import type { GrupoAberto, Movimento } from "@/lib/painel/atividade";
import type { EstadoNaCampanha } from "@/lib/painel/campanha-visao";
import { estadoDoGrupo, lotacao, numero, porLotacaoDecrescente } from "@/lib/painel/grupos";

/**
 * O mapa dos grupos da Início "Ao vivo" (spec 2026-10-02): uma célula por grupo,
 * agrupada por campanha, com o estado de `estadoDoGrupo` — a mesma regra da tela
 * de Grupos, para o mapa nunca discordar dela.
 */

/** `sumiu` é o mesmo estado da página da campanha: o grupo está na campanha mas não no cadastro. */
export type FiltroDoMapa = "todos" | EstadoNaCampanha;

export type CelulaDoMapa = {
  id: string;
  rotulo: string;
  nome: string;
  membros: number;
  capacidade: number;
  lotacao: number;
  estado: EstadoNaCampanha;
  entraram: number;
  sairam: number;
  /** "09:14" quando o "Lotou → abre outro" abriu o grupo hoje. */
  novoAs: string | null;
  href: string;
};

export type BlocoDoMapa = {
  chave: string;
  titulo: string;
  href: string;
  /** Nulo em "Outros grupos" e quando a campanha não diz. */
  autoGrow: boolean | null;
  /** Todos os grupos do bloco, em ordem; é onde um filtro procura (`celulasDoFiltro`, que aplica o limite de 200+). */
  todas: CelulaDoMapa[];
  limitado: boolean;
};

export type AlertaDoMapa = { chave: string; texto: string; acao: { rotulo: string; href: string } };

export type CampanhaDoMapa = { id: string; name: string; slug?: string; groupIds: string[]; autoGrow?: boolean };

export type MapaDosGrupos = { blocos: BlocoDoMapa[]; contagens: Record<FiltroDoMapa, number>; alertas: AlertaDoMapa[] };

/** Acima disto as células não cabem: cada campanha mostra só as mais cheias. */
export const LIMITE_DO_MAPA_INTEIRO = 200;
export const CELULAS_POR_BLOCO_NO_LIMITE = 60;
export const MAX_ALERTAS = 3;

export const TEXTO_DO_ESTADO: Record<EstadoNaCampanha, string> = {
  cheio: "lotou",
  quase: "quase lotado",
  ativo: "com vaga",
  sem_convite: "sem convite",
  sumiu: "sumiu do cadastro",
};

const GRUPOS = "/painel/grupos";

/** `displayNumber`, depois "#n" em qualquer ponto do nome, depois o número no fim ("VIP Revenda 41", o nome padrão do abre-outro). */
export function numeroDoGrupo(g: Group): number | null {
  if (typeof g.displayNumber === "number" && Number.isFinite(g.displayNumber) && g.displayNumber > 0) return g.displayNumber;
  const m = /#\s?(\d+)/.exec(g.name) ?? /\s(\d+)\s*$/.exec(g.name);
  return m ? Number(m[1]) : null;
}

/** Pelo número do grupo; sem número, depois dos numerados, pelo nome. */
function emOrdem(grupos: Group[]): Group[] {
  return [...grupos].sort((a, b) => {
    const na = numeroDoGrupo(a);
    const nb = numeroDoGrupo(b);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if ((na === null) !== (nb === null)) return na === null ? 1 : -1;
    return a.name.localeCompare(b.name, "pt-BR", { numeric: true });
  });
}

function hrefDaCampanha(c: CampanhaDoMapa): string {
  return c.slug ? `/painel/campanhas/${c.slug}` : "/painel/campanhas";
}

/** Os grupos cadastrados da campanha, sem repetir e sem os que sumiram do cadastro. */
function gruposDa(c: CampanhaDoMapa, porId: Map<string, Group>): Group[] {
  return [...new Set(c.groupIds)].flatMap((id) => {
    const g = porId.get(id);
    return g ? [g] : [];
  });
}

/** Os ids da campanha sem registro no cadastro (a página da campanha os chama de "sumiu"). */
function sumidosDa(c: CampanhaDoMapa, porId: Map<string, Group>): string[] {
  // Cadastro vazio = loja sem grupos (ou sem sincronizar): é o estado vazio da tela, não uma fila de "sumiu".
  if (porId.size === 0) return [];
  return [...new Set(c.groupIds)].filter((id) => !porId.has(id));
}

type Contexto = { hoje: Record<string, Movimento>; novos: Map<string, string>; limitar: boolean };

function bloco(chave: string, titulo: string, href: string, autoGrow: boolean | null, grupos: Group[], sumidos: string[], ctx: Contexto): BlocoDoMapa {
  const movimento = (id: string) => ({
    entraram: ctx.hoje[id]?.entraram ?? 0,
    sairam: ctx.hoje[id]?.sairam ?? 0,
    novoAs: ctx.novos.has(id) ? horaBR(ctx.novos.get(id)!) : null,
  });
  const cadastrados = emOrdem(grupos).map((g, i): CelulaDoMapa => {
    const n = numeroDoGrupo(g);
    return {
      id: g.whatsappGroupId,
      rotulo: n !== null ? `#${n}` : `${i + 1}º`,
      nome: g.name,
      membros: g.members,
      capacidade: g.capacity,
      lotacao: lotacao(g.members, g.capacity),
      estado: estadoDoGrupo(g),
      ...movimento(g.whatsappGroupId),
      href,
    };
  });
  const sumiram = sumidos.map(
    (id): CelulaDoMapa => ({
      id,
      rotulo: "sumiu",
      nome: "Grupo sem registro",
      membros: 0,
      capacidade: 0,
      lotacao: 0,
      estado: "sumiu",
      ...movimento(id),
      href,
    }),
  );
  return { chave, titulo, href, autoGrow, todas: [...cadastrados, ...sumiram], limitado: ctx.limitar };
}

/**
 * As células a mostrar para um filtro. O filtro age em TODOS os grupos do bloco e só
 * depois vem o limite dos 60 mais cheios: "Sem convite 5" lista os 5 mesmo que nenhum
 * esteja entre os 60 mais cheios. Quem sumiu do cadastro nunca é cortado — é o alerta.
 */
export function celulasDoFiltro(b: BlocoDoMapa, filtro: FiltroDoMapa): { celulas: CelulaDoMapa[]; ocultos: number } {
  const base = filtro === "todos" ? b.todas : b.todas.filter((c) => c.estado === filtro);
  const cadastrados = base.filter((c) => c.estado !== "sumiu");
  if (!b.limitado || cadastrados.length <= CELULAS_POR_BLOCO_NO_LIMITE) return { celulas: base, ocultos: 0 };
  const ficam = new Set(
    [...cadastrados]
      .sort(porLotacaoDecrescente)
      .slice(0, CELULAS_POR_BLOCO_NO_LIMITE)
      .map((c) => c.id),
  );
  return { celulas: base.filter((c) => c.estado === "sumiu" || ficam.has(c.id)), ocultos: cadastrados.length - CELULAS_POR_BLOCO_NO_LIMITE };
}

export type ResumoDoBloco = { grupos: number; pessoas: number; pctDasVagas: number | null; entraramHoje: number };

const finito = (n: number) => (Number.isFinite(n) ? n : 0);

/**
 * Os números do cabeçalho do bloco no celular. O sumiu entra como grupo e como entrada (membros e capacidade 0).
 * A % das vagas só olha os grupos com capacidade conhecida: pessoas de grupo sem capacidade não inflam a conta;
 * sem nenhuma capacidade conhecida ela é `null` e a tela omite a frase.
 */
export function resumoDoBloco(b: BlocoDoMapa): ResumoDoBloco {
  const comVaga = b.todas.filter((c) => finito(c.capacidade) > 0);
  const vagas = comVaga.reduce((s, c) => s + c.capacidade, 0);
  const ocupadas = comVaga.reduce((s, c) => s + finito(c.membros), 0);
  return {
    grupos: b.todas.length,
    pessoas: b.todas.reduce((s, c) => s + finito(c.membros), 0),
    pctDasVagas: vagas > 0 ? Math.round((ocupadas / vagas) * 100) : null,
    entraramHoje: b.todas.reduce((s, c) => s + c.entraram, 0),
  };
}

/** Rótulo da célula no celular: sem o "#" ("40"); o sumiu não escreve a palavra (a célula mostra um ícone). */
export function rotuloNoCelular(c: CelulaDoMapa): string {
  return c.estado === "sumiu" ? "" : c.rotulo.replace(/^#/, "");
}

/** "+N" da célula do celular em no máximo 3 caracteres: "+42", "120" (sem o +), "1k". O nome acessível guarda o número inteiro. */
export function entradaNoCelular(n: number): string {
  if (!(n > 0)) return "";
  if (n < 100) return `+${n}`;
  if (n < 1000) return String(n);
  return `${Math.min(99, Math.floor(n / 1000))}k`;
}

/** O grupo aberto hoje mais recente entre as células mostradas (horas "HH:MM" do mesmo dia comparam como texto). */
export function novoDoBloco(celulas: CelulaDoMapa[]): { hora: string; rotulo: string } | null {
  let achado: CelulaDoMapa | null = null;
  for (const c of celulas) if (c.novoAs && (!achado || c.novoAs >= achado.novoAs!)) achado = c;
  return achado ? { hora: achado.novoAs!, rotulo: achado.rotulo } : null;
}

function alertasDoMapa(grupos: Group[], campanhas: CampanhaDoMapa[], porId: Map<string, Group>): AlertaDoMapa[] {
  const alertas: AlertaDoMapa[] = [];
  for (const c of campanhas) {
    const doBloco = gruposDa(c, porId);
    if (c.autoGrow === false && doBloco.length > 0 && doBloco.every((g) => estadoDoGrupo(g) === "cheio")) {
      alertas.push({
        chave: `lotou-${c.id}`,
        texto: `${c.name}: todos os grupos lotaram e o "Lotou → abre outro" está desligado`,
        acao: { rotulo: "Configurar campanha", href: c.slug ? `/painel/campanhas/${c.slug}/editar` : "/painel/campanhas" },
      });
    }
  }
  const semConvite = grupos.filter((g) => estadoDoGrupo(g) === "sem_convite");
  const cabem = MAX_ALERTAS - alertas.length;
  if (semConvite.length > 0 && cabem > 0) {
    if (semConvite.length <= cabem) {
      for (const g of semConvite) {
        alertas.push({ chave: `convite-${g.whatsappGroupId}`, texto: `${g.name} está sem convite`, acao: { rotulo: "Configurar convite", href: GRUPOS } });
      }
    } else {
      alertas.push({ chave: "convite", texto: `${semConvite.length} grupos estão sem convite`, acao: { rotulo: "Configurar convites", href: GRUPOS } });
    }
  }
  return alertas.slice(0, MAX_ALERTAS);
}

export function montarMapa({
  grupos,
  campanhas,
  hojePorGrupo,
  abertosHoje,
}: {
  grupos: Group[];
  campanhas: CampanhaDoMapa[];
  hojePorGrupo: Record<string, Movimento>;
  abertosHoje: GrupoAberto[];
}): MapaDosGrupos {
  const porId = new Map(grupos.map((g) => [g.whatsappGroupId, g]));
  const ctx: Contexto = {
    hoje: hojePorGrupo,
    novos: new Map(abertosHoje.flatMap((a) => (a.grupo ? [[a.grupo, a.quando] as const] : []))),
    limitar: grupos.length > LIMITE_DO_MAPA_INTEIRO,
  };

  const emCampanha = new Set<string>();
  const blocos: BlocoDoMapa[] = [];
  for (const c of campanhas) {
    const doBloco = gruposDa(c, porId);
    const sumidos = sumidosDa(c, porId);
    if (doBloco.length + sumidos.length === 0) continue;
    for (const g of doBloco) emCampanha.add(g.whatsappGroupId);
    blocos.push(bloco(c.id, c.name, hrefDaCampanha(c), c.autoGrow ?? null, doBloco, sumidos, ctx));
  }
  const fora = grupos.filter((g) => !emCampanha.has(g.whatsappGroupId));
  if (fora.length > 0) blocos.push(bloco("outros", "Outros grupos", GRUPOS, null, fora, [], ctx));

  const contagens: Record<FiltroDoMapa, number> = { todos: 0, cheio: 0, quase: 0, ativo: 0, sem_convite: 0, sumiu: 0 };
  for (const g of grupos) contagens[estadoDoGrupo(g)] += 1;
  for (const b of blocos) contagens.sumiu += b.todas.filter((c) => c.estado === "sumiu").length;
  contagens.todos = grupos.length + contagens.sumiu;

  return { blocos, contagens, alertas: alertasDoMapa(grupos, campanhas, porId) };
}

/** O que a célula diz para quem não enxerga a cor (e para o leitor de tela). */
export function rotuloAcessivel(bloco: string, c: CelulaDoMapa): string {
  const sumiu = c.estado === "sumiu";
  const titulo = sumiu ? bloco : `${bloco} ${c.rotulo}`;
  // O grupo costuma se chamar exatamente "<campanha> #n": não repetir.
  const partes = c.nome === titulo ? [titulo] : [titulo, c.nome];
  if (!sumiu) partes.push(`${numero(c.membros)} de ${numero(c.capacidade)}`);
  partes.push(TEXTO_DO_ESTADO[c.estado]);
  if (c.entraram > 0) partes.push(`${numero(c.entraram)} ${c.entraram === 1 ? "entrou" : "entraram"} hoje`);
  if (c.sairam > 0) partes.push(`${numero(c.sairam)} ${c.sairam === 1 ? "saiu" : "saíram"} hoje`);
  if (c.novoAs) partes.push(`aberto hoje às ${c.novoAs}`);
  return partes.join(", ");
}
