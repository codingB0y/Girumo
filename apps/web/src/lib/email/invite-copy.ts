/**
 * Decisões de texto do convite de equipe, separadas do template porque
 * `templates.ts` importa `server-only` e não pode ser carregado sob `tsx --test`.
 * Aqui mora o que tem regra (nome legível, redundância, escape); lá mora só o HTML.
 *
 * Este é o único e-mail que sai PARA FORA da conta — vai a alguém que ainda não
 * é usuário. Por isso o escape acontece aqui e é testado: nome de organização é
 * texto livre do banco, e sem escapar viraria HTML arbitrário numa mensagem
 * assinada pela marca.
 */

export type InviteCopy = {
  subject: string;
  /** Nome de quem convidou, já escapado para uso no HTML. */
  quem: string;
  /**
   * Nome da organização, escapado — ou `null` quando não há nome distinto do de
   * quem convida. Nesse caso o template usa uma frase sem o "de X", que senão
   * sairia como "Igor convidou você para a equipe de Igor".
   */
  equipe: string | null;
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

/**
 * Nome apresentável a partir do que está no banco.
 *
 * Metade das organizações em produção tem o e-mail inteiro no campo `name`
 * (herança do cadastro), então "igor@hubflow.com.br" precisa virar "Igor" antes
 * de ir para um e-mail que uma pessoa de fora vai ler.
 */
export function humanizeName(value: string): string {
  const limpo = value.trim();
  if (!limpo) return "";
  if (!limpo.includes("@")) return limpo;

  const usuario = limpo.split("@")[0].replace(/[._-]+/g, " ").trim();
  if (!usuario) return "";
  return usuario.charAt(0).toUpperCase() + usuario.slice(1);
}

export function inviteCopy(inviterName: string, tenantName: string): InviteCopy {
  // Só de quem convida tiramos o primeiro nome: "Atacado São João" é o nome
  // inteiro da loja e cortar no espaço o descaracterizaria.
  const quemRaw = humanizeName(inviterName).split(" ")[0] || "Alguém";
  const equipeRaw = humanizeName(tenantName);

  const distinta = equipeRaw !== "" && equipeRaw.toLowerCase() !== quemRaw.toLowerCase();

  return {
    // Subject é texto puro: escapar aqui mostraria "&amp;" literal pro leitor.
    subject: distinta
      ? `${quemRaw} convidou você para a equipe de ${equipeRaw}`
      : `${quemRaw} convidou você para a equipe`,
    quem: escapeHtml(quemRaw),
    equipe: distinta ? escapeHtml(equipeRaw) : null,
  };
}
