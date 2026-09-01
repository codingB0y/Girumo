/**
 * Escolhe a contagem de membros quando o provedor pode estar mentindo.
 *
 * A Evolution devolve payload INCOMPLETO para parte dos grupos em
 * `fetchAllGroups` — bug conhecido e fechado como "not planned"
 * (EvolutionAPI/evolution-api#2124: 48 de 239 grupos sem dados, e
 * `findGroupInfos` naqueles grupos respondendo 404). Aqui a proporção medida
 * em 01/09/2026 foi a mesma: 40 de 200.
 *
 * Um grupo incompleto volta como se tivesse só o participante "self" —
 * `members: 1`. Gravar isso em cima de um grupo de 500 pessoas apaga o número
 * certo e não há de onde recuperá-lo: nenhum endpoint devolve histórico.
 *
 * A assimetria decide a regra. Um grupo real cair de centenas para 1 exigiria
 * remoção em massa no mesmo instante do sync; o payload truncado, por outro
 * lado, acontece em 20% das linhas toda vez. Diante das duas leituras, manter o
 * número antigo erra raramente e barato; aceitar o novo erra sempre e caro.
 */

/** Acima disto, a contagem é grande demais para ser o artefato do payload truncado. */
const LIMITE_SUSPEITO = 1;

export function escolherContagem(
  vindoDoProvedor: number,
  jaGravado: number | undefined,
): { members: number; protegido: boolean } {
  // Grupo que ainda não conhecemos: não há nada a proteger.
  if (jaGravado === undefined) return { members: vindoDoProvedor, protegido: false };

  const suspeito = vindoDoProvedor <= LIMITE_SUSPEITO && jaGravado > vindoDoProvedor;
  return suspeito
    ? { members: jaGravado, protegido: true }
    : { members: vindoDoProvedor, protegido: false };
}
