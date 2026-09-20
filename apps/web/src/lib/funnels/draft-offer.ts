/**
 * Decisão pura por trás de `POST /api/relampago/offers` (spec D3): a rota cria
 * uma oferta já aberta OU uma em rascunho ligada a um broadcast, nunca as duas
 * coisas. Extraído para ser testável sem Supabase nem servidor — a rota só
 * chama isto e faz o I/O.
 */

export type OfferBody = {
  name?: string;
  keyword?: string;
  slots?: number;
  timerMinutes?: number | null;
  groupIds?: string[];
  broadcastId?: string;
};

export type BodyValidationError = { error: string };

/**
 * `true` quando `broadcastId` é uma string não-vazia: é o único sinal que
 * distingue "abrir agora" de "criar rascunho ligado ao funil".
 */
export function isDraftMode(body: OfferBody): boolean {
  return typeof body.broadcastId === "string" && body.broadcastId.length > 0;
}

/**
 * Validação de corpo comum aos dois modos, antes de qualquer I/O. `groupIds`
 * só é obrigatório fora do modo rascunho — no rascunho os grupos vêm de
 * `broadcasts.group_ids` na hora da abertura (spec D3), não daqui.
 */
export function validateOfferBody(body: OfferBody | null): BodyValidationError | null {
  if (!body?.name?.trim()) return { error: "nome obrigatorio" };
  if (!Number.isInteger(body.slots) || (body.slots ?? 0) < 1) {
    return { error: "informe quantas pecas" };
  }
  if (!isDraftMode(body) && !body.groupIds?.length) {
    return { error: "escolha ao menos um grupo" };
  }
  return null;
}
