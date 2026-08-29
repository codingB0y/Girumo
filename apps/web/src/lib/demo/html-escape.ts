/**
 * Escapa texto vindo de formulario publico antes de entrar no HTML do e-mail.
 *
 * O nome chega de um formulario anonimo na internet aberta. Sem isto, um nome
 * como `<a href="...">Clique aqui</a>` vira link vivo dentro de um e-mail que
 * parece vir do proprio produto — phishing do fundador com a nossa marca.
 *
 * Módulo puro (sem `server-only`) de propósito: `notify.ts` é server-side e
 * não roda sob `tsx --test`, então esta regra mora aqui para ficar testável.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
