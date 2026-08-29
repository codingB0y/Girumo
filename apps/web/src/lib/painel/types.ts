/**
 * Tipos que as telas do painel consomem das rotas de API.
 *
 * Moram fora das páginas porque o modo demonstração (`lib/demo/fixtures.ts`)
 * precisa importá-los: é o acoplamento em TIPO que faz a fixture parar de
 * compilar quando o contrato da rota muda. Sem isso, o demo passa a mostrar um
 * formato que o produto não usa mais — e mente em silêncio, que é a falha que
 * o gatilho G1 mede como arrependimento pós-compra.
 */

export type LeadStatus = "novo" | "ativo" | "comprou";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  sourceGroup: string;
  sourceCampaign: string;
  status: LeadStatus;
  enteredAt: string;
  /** ISO da última saída de grupo, ou null se nunca saiu. */
  leftAt?: string | null;
};
