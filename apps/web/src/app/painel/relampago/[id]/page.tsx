import { FilaClient } from "../fila-client";

export const dynamic = "force-dynamic";

/**
 * Shell da tela da promoção. Todo o estado vive no client: a fila muda a cada
 * segundo enquanto a promoção acontece, e é o próprio poll que recicla as
 * reservas vencidas — a rota chama `releaseExpired` antes de servir.
 */
export default async function OfertaRelampago({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <FilaClient offerId={id} />;
}
