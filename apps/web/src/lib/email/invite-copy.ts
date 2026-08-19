/**
 * Decisões de texto do convite de equipe, separadas do template porque
 * `templates.ts` importa `server-only` e não pode ser carregado sob `tsx --test`.
 * Aqui mora o que tem regra (primeiro nome, escape); lá mora só o HTML.
 *
 * Este é o único e-mail que sai PARA FORA da conta — vai a alguém que ainda não
 * é usuário. Por isso o escape acontece aqui e é testado: nome de organização é
 * texto livre do banco, e sem escapar viraria HTML arbitrário numa mensagem
 * assinada pela marca.
 */

export type InviteCopy = {
  subject: string;
  /** Primeiro nome de quem convidou, já escapado para uso no HTML. */
  quem: string;
  /** Nome da organização, já escapado para uso no HTML. */
  equipe: string;
};

/** Escapa texto do banco antes de interpolar no HTML do e-mail. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function inviteCopy(inviterName: string, tenantName: string): InviteCopy {
  const quemRaw = inviterName.trim().split(" ")[0] || "Alguém";
  const equipeRaw = tenantName.trim() || "sua equipe";

  return {
    // Subject é texto puro: escapar aqui mostraria "&amp;" literal pro leitor.
    subject: `${quemRaw} convidou você para a equipe de ${equipeRaw}`,
    quem: escapeHtml(quemRaw),
    equipe: escapeHtml(equipeRaw),
  };
}
