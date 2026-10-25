import {
  Sun,
  Layers,
  Send,
  Zap,
  Flame,
  Users,
  UserPlus,
  PanelsTopLeft,
  Link2,
  TrendingUp,
  Settings,
  BookOpen,
  Boxes,
  Camera,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { PAPEIS_LIVRES, acessoRestrito, modulosDoAcesso, paginaLiberada, type Acesso, type Modulo } from "@/lib/auth/modulos";

/**
 * Fonte única da navegação do painel.
 *
 * Antes, sidebar, menu mobile e command palette mantinham listas próprias e
 * divergentes: Páginas só existia na sidebar, Equipe AI só no mobile, e
 * Automações — um módulo completo — não aparecia em lugar nenhum. A palette
 * ainda apontava para /painel/ds, que não existe.
 *
 * Rotas deliberadamente fora daqui:
 * - /painel/conectar — entra pelo status de conexão e pelas ações, não pelo menu
 * - /painel/dev-tools — ferramenta interna
 * - /painel/agenda — redirect para campanhas
 *
 * /painel/disparos ENTROU: deixou de ser redirect e virou a tela própria de
 * disparo (compositor + histórico com progresso real). Sem item de menu, a
 * única porta pro envio era entrar numa campanha e achar a aba Mensagens.
 *
 * /painel/vendas ENTROU em 07/10 (acesso da vendedora): é a tela dela, e
 * `visivelNoMenu` a esconde dos outros papéis na v1.
 */

/**
 * Grupo do menu Mais da barra de cima (spec 2026-09-07, 3.1): VENDER é o que
 * sai da loja (disparo, oferta, automação), LOTAR é o que traz gente (campanha,
 * página), LOJA é o balcão (início, grupos, contatos, resultados,
 * configurações).
 */
export type NavGrupo = "vender" | "lotar" | "loja";

/** Add-ons: o item só aparece pra loja com a liberação ligada. */
export type Liberacao = "instagram";
export type Liberacoes = Record<Liberacao, boolean>;

export const NAV_GRUPOS_ORDEM: NavGrupo[] = ["vender", "lotar", "loja"];
export const NAV_GRUPO_TITULO: Record<NavGrupo, string> = { vender: "Vender", lotar: "Lotar", loja: "Loja" };

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  grupo: NavGrupo;
  requer?: Liberacao;
  /** Rótulo da barra de cima, quando o nome inteiro não cabe. */
  curto?: string;
  /**
   * Módulo da vendedora que libera o item (spec 2026-10-07 §1). Para `seller`
   * só aparece item com módulo liberado; sem módulo, ela não vê.
   */
  modulo?: Modulo;
};

export type NavGroup = {
  /** `null` = sem cabeçalho (grupo de topo). */
  title: string | null;
  items: NavItem[];
};

const INICIO: NavItem = { href: "/painel", label: "Início", icon: Sun, grupo: "loja" };
const VENDAS: NavItem = { href: "/painel/vendas", label: "Vendas", icon: ShoppingBag, grupo: "vender", modulo: "vendas" };
const CAMPANHAS: NavItem = { href: "/painel/campanhas", label: "Campanhas", icon: Layers, grupo: "lotar" };
// lucide-react não tem o ícone Instagram (ver lp-piloto/ui.tsx); Camera é o substituto.
const INSTAGRAM: NavItem = { href: "/painel/instagram", label: "Instagram", icon: Camera, grupo: "lotar", requer: "instagram" };
const DISPAROS: NavItem = { href: "/painel/disparos", label: "Disparos", icon: Send, grupo: "vender", modulo: "postar" };
const BIBLIOTECA: NavItem = { href: "/painel/biblioteca", label: "Biblioteca", icon: BookOpen, grupo: "vender" };
const RELAMPAGO: NavItem = { href: "/painel/relampago", label: "Oferta Relâmpago", icon: Flame, grupo: "vender", curto: "Relâmpago" };
const FUNIS: NavItem = { href: "/painel/funis", label: "Funis", icon: Zap, grupo: "vender" };
const COMUNIDADES: NavItem = { href: "/painel/comunidades", label: "Comunidades", icon: Boxes, grupo: "loja" };
const GRUPOS: NavItem = { href: "/painel/grupos", label: "Grupos", icon: Users, grupo: "loja" };
const CONTATOS: NavItem = { href: "/painel/contatos", label: "Contatos", icon: UserPlus, grupo: "loja" };
const PAGINAS: NavItem = { href: "/painel/pages", label: "Páginas", icon: PanelsTopLeft, grupo: "lotar" };
/** Link da bio (spec 2026-10-19 §8): em Lotar, logo depois de Páginas; nunca nas barras. */
const LINK_DA_BIO: NavItem = { href: "/painel/link-da-bio", label: "Link da bio", icon: Link2, grupo: "lotar" };
const RESULTADOS: NavItem = { href: "/painel/resultados", label: "Resultados", icon: TrendingUp, grupo: "loja" };
const CONFIGURACOES: NavItem = { href: "/painel/configuracoes", label: "Configurações", icon: Settings, grupo: "loja" };

export const NAV_GROUPS: NavGroup[] = [
  { title: null, items: [INICIO, VENDAS, CAMPANHAS, INSTAGRAM, DISPAROS, BIBLIOTECA, RELAMPAGO, FUNIS, COMUNIDADES, GRUPOS, CONTATOS] },
  { title: "Crescimento", items: [PAGINAS, LINK_DA_BIO, RESULTADOS] },
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

/** Barra de cima (spec G2, decisão 4): os seis módulos do dia; o resto fica no "Mais". */
export const NAV_BARRA_DESKTOP: NavItem[] = [INICIO, CAMPANHAS, DISPAROS, RELAMPAGO, GRUPOS, CONTATOS];

/** Tudo, achatado — para o drawer do mobile e a command palette. */
export const NAV_ALL: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...NAV_FOOTER,
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return href === "/painel" ? pathname === href : pathname.startsWith(href);
}

/** `null` = a casca ainda não sabe: esconde o que depende de liberação em vez de piscar. */
export function liberado(item: NavItem, liberacoes: Liberacoes | null): boolean {
  return !item.requer || (liberacoes?.[item.requer] ?? false);
}

/**
 * O item aparece no menu deste acesso (spec 2026-10-07 §1, "Página")?
 * - vendedora: só item com `modulo` liberado para ela (`vendas` sempre; `postar` se o dono marcou);
 * - owner/admin/operator (`PAPEIS_LIVRES`): a regra de antes (`liberado`), e Vendas fica fora — o dono não usa a tela na v1;
 * - papel desconhecido: nada (fechado por padrão, como `paginaLiberada`);
 * - `null` depois de carregado = o `/api/auth/me` falhou: não dá pra distinguir o dono da vendedora,
 *   então nada que dependa de módulo aparece (nem Vendas, nem Disparos/Postar) — o dono recupera
 *   Postar e Disparos na próxima carga. A casca nem desenha os módulos enquanto `carregado` é falso.
 */
export function visivelNoMenu(item: NavItem, acesso: Acesso | null, liberacoes: Liberacoes | null): boolean {
  if (acesso === null) return item.modulo === undefined && liberado(item, liberacoes);
  if (acesso.role === "seller") {
    return item.modulo !== undefined && modulosDoAcesso(acesso).includes(item.modulo) && liberado(item, liberacoes);
  }
  if (!PAPEIS_LIVRES.includes(acesso.role)) return false;
  return item.modulo !== "vendas" && liberado(item, liberacoes);
}

/** Postar (barra e celular) segue Disparos: quem não vê a tela de postar não ganha o atalho. */
export function podePostar(acesso: Acesso | null): boolean {
  return visivelNoMenu(DISPAROS, acesso, null);
}

/**
 * Itens da barra de cima. Outros papéis: os seis do dia. Vendedora: o menu
 * inteiro filtrado — é curto (Vendas e o que o dono liberou) e nenhum item
 * dela está entre os seis do dono.
 */
export function itensDaBarra(acesso: Acesso | null, liberacoes: Liberacoes | null): NavItem[] {
  const base = acessoRestrito(acesso) ? NAV_ALL : NAV_BARRA_DESKTOP;
  return base.filter((item) => visivelNoMenu(item, acesso, liberacoes));
}

export type DestinoDaPagina = "mostrar" | "ir-para-vendas" | "bloquear";

/**
 * O que a guarda faz com a página (spec §1, "Página"). Só experiência: quem
 * barra é o guard das rotas de API. A Início da vendedora é Vendas; fora de
 * `paginaLiberada`, a tela de bloqueio. `null` (o `/api/auth/me` falhou) e os papéis
 * livres veem a página; papel desconhecido é bloqueado.
 */
export function destinoDaPagina(acesso: Acesso | null, pathname: string): DestinoDaPagina {
  if (acesso === null || PAPEIS_LIVRES.includes(acesso.role)) return "mostrar";
  if (acesso.role !== "seller") return "bloquear";
  if (pathname === INICIO.href) return "ir-para-vendas";
  return paginaLiberada(acesso, pathname) ? "mostrar" : "bloquear";
}

/** Estado de cada módulo, como o "Mais" mostra antes do toque. */
export type ResumoDados = {
  campanhas: number;
  /** ISO do disparo mais recente; null sem histórico. */
  ultimoDisparo: string | null;
  relampagoAoVivo: boolean;
  /** Funis com mensagem ainda agendada. */
  funisAgendados: number;
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
  return {
    [CAMPANHAS.href]: `Campanhas · ${dados.campanhas === 0 ? "nenhuma" : dados.campanhas}`,
    [DISPAROS.href]: `Disparos · ${dados.ultimoDisparo ? `último ${diaHora(dados.ultimoDisparo)}` : "nenhum ainda"}`,
    [RELAMPAGO.href]: `Oferta Relâmpago · ${dados.relampagoAoVivo ? "ao vivo" : "nenhuma aberta"}`,
    [FUNIS.href]: `Funis · ${dados.funisAgendados === 0 ? "nenhum agendado" : `${dados.funisAgendados} agendado${dados.funisAgendados === 1 ? "" : "s"}`}`,
    [PAGINAS.href]: `Páginas · ${dados.paginasNoAr === 0 ? "nenhuma no ar" : `${dados.paginasNoAr} no ar`}`,
  };
}
