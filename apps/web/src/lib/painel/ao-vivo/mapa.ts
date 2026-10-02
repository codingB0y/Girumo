import { horaBR } from "@/lib/date-br";
import type { Group } from "@/lib/mock-data";
import type { GrupoAberto, Movimento } from "@/lib/painel/atividade";
import { estadoDoGrupo, lotacao, maisCheioPrimeiro, numero, type EstadoDoGrupo } from "@/lib/painel/grupos";

/**
 * O mapa dos grupos da Início "Ao vivo" (spec 2026-10-02): uma célula por grupo,
 * agrupada por campanha, com o estado de `estadoDoGrupo` — a mesma regra da tela
 * de Grupos, para o mapa nunca discordar dela.
 */

export type FiltroDoMapa = "todos" | EstadoDoGrupo;

export type CelulaDoMapa = {
  id: string;
  rotulo: string;
  nome: string;
  membros: number;
  capacidade: number;
  lotacao: number;
  estado: EstadoDoGrupo;
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
  celulas: CelulaDoMapa[];
  /** Grupos que ficaram fora no limite (lojas com mais de 200 grupos). */
  ocultos: number;
};

export type AlertaDoMapa = { chave: string; texto: string; acao: { rotulo: string; href: string } };

export type CampanhaDoMapa = { id: string; name: string; slug?: string; groupIds: string[]; autoGrow?: boolean };

export type MapaDosGrupos = { blocos: BlocoDoMapa[]; contagens: Record<FiltroDoMapa, number>; alertas: AlertaDoMapa[] };

/** Acima disto as células não cabem: cada campanha mostra só as mais cheias. */
export const LIMITE_DO_MAPA_INTEIRO = 200;
export const CELULAS_POR_BLOCO_NO_LIMITE = 60;
export const MAX_ALERTAS = 3;

export const TEXTO_DO_ESTADO: Record<EstadoDoGrupo, string> = {
  cheio: "lotou",
  quase: "quase lotado",
  ativo: "com vaga",
  sem_convite: "sem convite",
};

const GRUPOS = "/painel/grupos";

function numeroDoGrupo(g: Group): number | null {
  if (typeof g.displayNumber === "number" && Number.isFinite(g.displayNumber)) return g.displayNumber;
  const m = /#\s?(\d+)/.exec(g.name);
  return m ? Number(m[1]) : null;
}

/** Pelo número do grupo; sem número, depois dos numerados, pelo nome. */
function emOrdem(grupos: Group[]): Group[] {
  return [...grupos].sort((a, b) => {
    const na = numeroDoGrupo(a);
    const nb = numeroDoGrupo(b);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if ((na === null) !== (nb === null)) return na === null ? 1 : -1;
    return a.name.localeCompare(b.name, "pt-BR");
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

type Contexto = { hoje: Record<string, Movimento>; novos: Map<string, string>; limitar: boolean };

function bloco(chave: string, titulo: string, href: string, autoGrow: boolean | null, grupos: Group[], ctx: Contexto): BlocoDoMapa {
  const visiveis =
    ctx.limitar && grupos.length > CELULAS_POR_BLOCO_NO_LIMITE ? maisCheioPrimeiro(grupos).slice(0, CELULAS_POR_BLOCO_NO_LIMITE) : grupos;
  const celulas = emOrdem(visiveis).map((g, i): CelulaDoMapa => {
    const n = numeroDoGrupo(g);
    const mov = ctx.hoje[g.whatsappGroupId];
    const aberto = ctx.novos.get(g.whatsappGroupId);
    return {
      id: g.whatsappGroupId,
      rotulo: n !== null ? `#${n}` : `${i + 1}º`,
      nome: g.name,
      membros: g.members,
      capacidade: g.capacity,
      lotacao: lotacao(g.members, g.capacity),
      estado: estadoDoGrupo(g),
      entraram: mov?.entraram ?? 0,
      sairam: mov?.sairam ?? 0,
      novoAs: aberto ? horaBR(aberto) : null,
      href,
    };
  });
  return { chave, titulo, href, autoGrow, celulas, ocultos: grupos.length - visiveis.length };
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
    if (doBloco.length === 0) continue;
    for (const g of doBloco) emCampanha.add(g.whatsappGroupId);
    blocos.push(bloco(c.id, c.name, hrefDaCampanha(c), c.autoGrow ?? null, doBloco, ctx));
  }
  const fora = grupos.filter((g) => !emCampanha.has(g.whatsappGroupId));
  if (fora.length > 0) blocos.push(bloco("outros", "Outros grupos", GRUPOS, null, fora, ctx));

  const contagens: Record<FiltroDoMapa, number> = { todos: grupos.length, cheio: 0, quase: 0, ativo: 0, sem_convite: 0 };
  for (const g of grupos) contagens[estadoDoGrupo(g)] += 1;

  return { blocos, contagens, alertas: alertasDoMapa(grupos, campanhas, porId) };
}

/** O que a célula diz para quem não enxerga a cor (e para o leitor de tela). */
export function rotuloAcessivel(bloco: string, c: CelulaDoMapa): string {
  const titulo = `${bloco} ${c.rotulo}`;
  // O grupo costuma se chamar exatamente "<campanha> #n": não repetir.
  const partes = c.nome === titulo ? [titulo] : [titulo, c.nome];
  partes.push(`${numero(c.membros)} de ${numero(c.capacidade)}`, TEXTO_DO_ESTADO[c.estado]);
  if (c.entraram > 0) partes.push(`${numero(c.entraram)} entraram hoje`);
  if (c.sairam > 0) partes.push(`${numero(c.sairam)} saíram hoje`);
  if (c.novoAs) partes.push(`aberto hoje às ${c.novoAs}`);
  return partes.join(", ");
}
