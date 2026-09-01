export type ClaimLike = {
  claimedAt: Date;
  contactedAt: Date | null;
};

export type ClaimState = "reservada" | "em_conversa" | "expirada_vendedora" | "expirada_cliente";

/**
 * Quando a reserva vence. `null` = sem timer.
 *
 * O prazo corre do contato quando ele existe: antes de chamar, a vendedora tem
 * o prazo para chamar; depois, a cliente tem o mesmo prazo para responder.
 */
export function deadlineOf(claim: ClaimLike, timerSeconds: number | null): Date | null {
  if (timerSeconds == null) return null;
  const base = claim.contactedAt ?? claim.claimedAt;
  return new Date(base.getTime() + timerSeconds * 1000);
}

/**
 * Estado de uma reserva. Um único número, dois efeitos — e o desfecho depende de
 * QUEM falhou:
 *
 *  - venceu sem contato -> `expirada_vendedora`. A loja não chamou; a cliente
 *    mantém a posição na fila.
 *  - venceu com contato -> `expirada_cliente`. A cliente não respondeu; vai para
 *    o fim, sem perder o registro do horário original.
 *
 * É a diferença entre "a loja me ignorou" e "eu sumi". Sem ela, o sistema puniria
 * a cliente por lentidão interna da loja.
 */
export function claimState(claim: ClaimLike, timerSeconds: number | null, now: Date): ClaimState {
  const prazo = deadlineOf(claim, timerSeconds);
  const venceu = prazo != null && now > prazo;

  if (claim.contactedAt == null) return venceu ? "expirada_vendedora" : "reservada";
  return venceu ? "expirada_cliente" : "em_conversa";
}
