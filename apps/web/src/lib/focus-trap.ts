/**
 * Lógica pura da trava de foco dos modais do painel.
 *
 * `role="dialog"` + `aria-modal` só prometem o comportamento; sem trava o Tab
 * continua passeando pelos links da página atrás do modal. Aqui fica a decisão
 * — quem toca no DOM é o hook `useFocusTrap`.
 */

/** Candidatos a receber foco dentro de um modal. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "[tabindex]",
].join(",");

/**
 * Forma mínima de um elemento para decidir se ele entra na ordem de tabulação.
 * `HTMLElement` satisfaz isto estruturalmente — o tipo existe para permitir
 * testar a regra sem DOM.
 */
export type FocusCandidate = {
  tabIndex: number;
  disabled?: boolean;
  hidden?: boolean;
  getAttribute(name: string): string | null;
};

/** Um elemento entra na ordem de tabulação? */
export function isTabbable(el: FocusCandidate): boolean {
  if (el.disabled === true) return false;
  if (el.hidden === true) return false;
  if (el.tabIndex < 0) return false;
  return el.getAttribute("aria-hidden") !== "true";
}

/**
 * O que fazer com um Tab dentro do modal.
 * `browser` = não interferir; `move` = cancelar o evento e focar `index`;
 * `block` = cancelar sem mover (modal sem nada focável).
 */
export type TabDecision =
  | { type: "browser" }
  | { type: "block" }
  | { type: "move"; index: number };

/**
 * Decide o destino do Tab. Só intercepta nas bordas da lista: no meio dela o
 * browser já faz a coisa certa, e roubar o controle ali quebraria a navegação
 * dentro de widgets compostos.
 *
 * @param focusableCount quantos elementos tabuláveis o modal tem
 * @param currentIndex posição do foco atual na lista, ou -1 se ele escapou
 * @param shiftKey Shift+Tab (para trás)
 */
export function resolveTabTarget(
  focusableCount: number,
  currentIndex: number,
  shiftKey: boolean,
): TabDecision {
  if (focusableCount <= 0) return { type: "block" };

  const last = focusableCount - 1;

  // Foco fora do modal (clique no fundo, foco perdido pro body): puxa de volta.
  if (currentIndex < 0) return { type: "move", index: shiftKey ? last : 0 };

  if (shiftKey && currentIndex === 0) return { type: "move", index: last };
  if (!shiftKey && currentIndex === last) return { type: "move", index: 0 };

  return { type: "browser" };
}
