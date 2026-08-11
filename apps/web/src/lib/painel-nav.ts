import {
  Sun,
  Layers,
  Send,
  Zap,
  Users,
  UserPlus,
  PanelsTopLeft,
  TrendingUp,
  Gift,
  Bot,
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

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export type NavGroup = {
  /** `null` = sem cabeçalho (grupo de topo). */
  title: string | null;
  items: NavItem[];
};

export const NAV_GROUPS: NavGroup[] = [
  {
    title: null,
    items: [
      { href: "/painel", label: "Início", icon: Sun },
      { href: "/painel/campanhas", label: "Campanhas", icon: Layers },
      { href: "/painel/disparos", label: "Disparos", icon: Send },
      { href: "/painel/automacoes", label: "Automações", icon: Zap },
      { href: "/painel/grupos", label: "Grupos", icon: Users },
      { href: "/painel/contatos", label: "Contatos", icon: UserPlus },
    ],
  },
  {
    title: "Crescimento",
    items: [
      { href: "/painel/pages", label: "Páginas", icon: PanelsTopLeft },
      { href: "/painel/resultados", label: "Resultados", icon: TrendingUp },
      { href: "/painel/indicacao", label: "Indicação", icon: Gift },
    ],
  },
];

/** Itens do rodapé da sidebar, abaixo do status de conexão. */
export const NAV_FOOTER: NavItem[] = [
  { href: "/painel/squad-os", label: "Equipe AI", icon: Bot },
  { href: "/painel/configuracoes", label: "Configurações", icon: Settings },
];

/** Barra inferior do mobile — os quatro destinos de uso diário. */
export const NAV_MOBILE_PRIMARY: NavItem[] = [
  { href: "/painel", label: "Início", icon: Sun },
  { href: "/painel/campanhas", label: "Campanhas", icon: Layers },
  { href: "/painel/grupos", label: "Grupos", icon: Users },
  { href: "/painel/resultados", label: "Resultados", icon: TrendingUp },
];

/** Tudo, achatado — para o drawer do mobile e a command palette. */
export const NAV_ALL: NavItem[] = [
  ...NAV_GROUPS.flatMap((g) => g.items),
  ...NAV_FOOTER,
];

export function isNavItemActive(pathname: string, href: string): boolean {
  return href === "/painel" ? pathname === href : pathname.startsWith(href);
}
