// Motivo da última queda da sessão — regra pura, sem `server-only`, testável
// isolada (mesmo padrão de session-liveness.ts).
//
// O webhook de `connection.update` grava `lastDisconnectReason` em
// `instances.metadata`. Sem esse motivo, `401` (a sessão foi REMOVIDA no
// celular e só volta com um pareamento novo) fica indistinguível de `428` ou
// `440` (quedas que a própria Evolution refaz sozinha) — e a tela dizia apenas
// "desconectado" nos três casos, sem dizer se havia algo a fazer.

/** `401 = loggedOut` no protocolo do WhatsApp. */
export const LOGGED_OUT_REASON = 401;

/**
 * Só o `401` exige ação de quem usa: parear de novo. Os demais motivos voltam
 * sozinhos, e avisar neles seria empurrar o usuário a pedir QR sem necessidade
 * — que é justamente o que substitui a conexão em andamento.
 */
export function precisaParearDeNovo(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  const motivo = metadata?.lastDisconnectReason;
  // `Number(null)` e `Number("")` são 0, então o vazio sai antes da conversão.
  if (motivo === null || motivo === undefined || motivo === "") return false;
  return Number(motivo) === LOGGED_OUT_REASON;
}
