import { falhou, resposta } from "@/lib/bio/painel-api";
import { lojaDoRastreioNoPainel } from "@/lib/rastreio/rota-painel";
import { ETAPAS_COM_AVISO, type Canal, type EtapaComAviso } from "@/lib/rastreio/tipos";
import { lerConfig } from "@/lib/stores/rastreio-config";
import { reabrirAvisos } from "@/lib/stores/rastreio-avisos";
import { lerPedido } from "@/lib/stores/rastreio-pedidos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CANAIS: Canal[] = ["whatsapp", "email"];

const recusa = (error: string, code: string) => resposta({ error, code }, 409);

/** Reabre o aviso da etapa atual; quem envia é o cron (até 5 min), a rota não envia. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const loja = await lojaDoRastreioNoPainel(req);
  if (loja instanceof Response) return loja;
  const { id } = await ctx.params;
  if (!UUID.test(id)) return resposta({ error: "Pedido inválido." }, 400);
  try {
    const pedido = await lerPedido(loja.tenantId, id);
    if (!pedido) return resposta({ error: "Pedido não encontrado." }, 404);
    if (pedido.noticesStoppedAt) return recusa("A compradora pediu para parar os avisos deste pedido.", "avisos_parados");
    const etapa = pedido.etapa;
    if (!(ETAPAS_COM_AVISO as readonly string[]).includes(etapa)) {
      return recusa("Este pedido não está numa etapa com aviso.", "etapa_sem_aviso");
    }
    const cfg = await lerConfig(loja.tenantId);
    const comContato: Record<Canal, boolean> = { whatsapp: !!pedido.buyerPhone, email: !!pedido.buyerEmailEnc };
    // A matriz é jsonb ainda sem validação: leitura defensiva, malformada vira "sem canal".
    const canais = CANAIS.filter((c) => cfg?.matrix?.[etapa as EtapaComAviso]?.[c] === true && comContato[c]);
    if (canais.length === 0) {
      return recusa("Nenhum canal ligado tem contato da compradora nesta etapa.", "sem_canal");
    }
    const reabertos = await reabrirAvisos(loja.tenantId, id, etapa as EtapaComAviso, canais);
    return resposta({ reabertos, canais }, 200);
  } catch (e) {
    return falhou("api/rastreio/entregas/reenviar", loja.tenantId, e, "Não deu para reenviar o aviso.");
  }
}
