import {
  Sun,
  Layers,
  Send,
  Zap,
  Flame,
  Users,
  UserPlus,
  PanelsTopLeft,
  TrendingUp,
  Gift,
  Settings,
  type LucideIcon,
} from "lucide-react";

/**
 * Fonte única da navegação do painel.
 *
 * Antes, sidebar, menu mobile e command palette mantinham listas próprias e
 * divergentes: Páginas só existia na sidebar, Equipe AI só no mobile, e
 * Automações e Indicação — dois módulos completos — não apareciam em lugar
 * nenhum. A palette ainda apontava para /painel/ds, que não existe.
 *
 * Rotas deliberadamente fora daqui:
 * - /painel/conectar — entra pelo status de conexão e pelas ações, não pelo menu
 * - /painel/dev-tools — ferramenta interna
 * - /painel/agenda, /painel/biblioteca — redirects para campanhas
 *
 * /painel/disparos ENTROU: deixou de ser redirect e virou a tela própria de
 * disparo (compositor + histórico com progresso real). Sem item de menu, a
 * única porta pro envio era entrar numa campanha e achar a aba Mensagens.
 */

/**
 * Grupo do corredor da Vitrine Aberta (spec 2026-09-07, 3.1): VENDER é o que
 * sai da loja (disparo, oferta, automação), LOTAR é o que traz gente (campanha,
 * página, indicação), LOJA é o balcão (início, grupos, contatos, resultados,
 * configurações).
 */
export type NavGrupo = "vender" | "lotar" | "loja";

export const NAV_GRUPOS_ORDEM: NavGrupo[] = ["vender", "lotar", "loja"];
export const NAV_GRUPO_TITULO: Record<NavGrupo, string> = { vender: "Vender", lotar: "Lotar", loja: "Loja" };

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  grupo: NavGrupo;
};

export type NavGroup = {
  /** `null` = sem cabeçalho (grupo de topo). */
  title: string | null;
  items: NavItem[];
};

const INICIO: NavItem = { href: "/painel", label: "Início", icon: Sun, grupo: "loja" };
const CAMPANHAS: NavItem = { href: "/painel/campanhas", label: "Campanhas", icon: Layers, grupo: "lotar" };
const DISPAROS: NavItem = { href: "/painel/disparos", label: "Disparos", icon: Send, grupo: "vender" };
const RELAMPAGO: NavItem = { href: "/painel/relampago", label: "Oferta Relâmpago", icon: Flame, grupo: "vender" };
const AUTOMACOES: NavItem = { href: "/painel/automacoes", label: "Automações", icon: Zap, grupo: "vender" };
const GRUPOS: NavItem = { href: "/painel/grupos", label: "Grupos", icon: Users, grupo: "loja" };
const CONTATOS: NavItem = { href: "/painel/contatos", label: "Contatos", icon: UserPlus, grupo: "loja" };
const PAGINAS: NavItem = { href: "/painel/pages", label: "Páginas", icon: PanelsTopLeft, grupo: "lotar" };
const RESULTADOS: NavItem = { href: "/painel/resultados", label: "Resultados", icon: TrendingUp, grupo: "loja" };
const INDICACAO: NavItem = { href: "/painel/indicacao", label: "Indicação", icon: Gift, grupo: "lotar" };
const CONFIGURACOES: NavItem = { href: "/painel/configuracoes", label: "Configurações", icon: Settings, grupo: "loja" };

export const NAV_GROUPS: NavGroup[] = [
  { title: null, items: [INICIO, CAMPANHAS, DISPAROS, RELAMPAGO, AUTOMACOES, GRUPOS, CONTATOS] },
  { title: "Crescimento", items: [PAGINAS, RESULTADOS, INDICACAO] },
];

/** Itens do rodapé da sidebar, abaixo do status de conexão. */
export const NAV_FOOTER: NavItem[] = [CONFIGURACOES];

/**
 * Barra inferior do mobile (casca antiga) — os quatro destinos de uso diário.
 *
 * Páginas entrou no lugar de Resultados: para um lojista mobile-first, a aba de
 * captação era invisível (só existia na sidebar, que o mobile não mostra), e
 * Resultados é consulta esporádica — continua alcançável pelo drawer e pela
 * command palette via NAV_ALL.
 */
export const NAV_MOBILE_PRIMARY: NavItem[] = [INICIO, CAMPANHAS, GRUPOS, PAGINAS];

/**
 * Barra da Vitrine Aberta (spec 3.2): Início, Grupos, [Postar], Contatos, [Mais].
 * Postar e Mais não são rotas — são botões da barra; ficam no componente.
 */
export const NAV_BARRA_ESQUERDA: NavItem[] = [INICIO, GRUPOS];
export const NAV_BARRA_DIREITA: NavItem[] = [CONTATOS];

/** Tudo, achatado — para o drawer do mobile e a command palette. */
export const NAV_ALL: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...NAV_FOOTER,
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return href === "/painel" ? pathname === href : pathname.startsWith(href);
}

/** Estado de cada módulo, como o "Mais" mostra antes do toque. */
export type ResumoDados = {
  campanhas: number;
  /** ISO do disparo mais recente; null sem histórico. */
  ultimoDisparo: string | null;
  relampagoAoVivo: boolean;
  automacoes: { ligadas: number; total: number };
  paginasNoAr: number;
};

function diaHora(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "?";
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(data.getDate())}/${dois(data.getMonth() + 1)} ${dois(data.getHours())}:${dois(data.getMinutes())}`;
}

/**
 * Uma linha por módulo, chaveada pelo href ("Campanhas · 3", "Disparos · último
 * 02/09 12:12"). Estado vazio aponta que não há nada, nunca "0".
 */
export function resumo(dados: ResumoDados): Record<string, string> {
  const { automacoes } = dados;
  return {
    [CAMPANHAS.href]: `Campanhas · ${dados.campanhas === 0 ? "nenhuma" : dados.campanhas}`,
    [DISPAROS.href]: `Disparos · ${dados.ultimoDisparo ? `último ${diaHora(dados.ultimoDisparo)}` : "nenhum ainda"}`,
    [RELAMPAGO.href]: `Oferta Relâmpago · ${dados.relampagoAoVivo ? "ao vivo" : "nenhuma aberta"}`,
    [AUTOMACOES.href]: `Automações · ${automacoes.total === 0 ? "nenhuma" : `${automacoes.ligadas} de ${automacoes.total} ligadas`}`,
    [PAGINAS.href]: `Páginas · ${dados.paginasNoAr === 0 ? "nenhuma no ar" : `${dados.paginasNoAr} no ar`}`,
  };
}
