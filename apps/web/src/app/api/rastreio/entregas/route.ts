import { falhou, resposta } from "@/lib/bio/painel-api";
import {
  linhaDeEntrega,
  parseFiltroDeEntregas,
  POR_PAGINA,
  type FiltroDeEntregas,
  type RespostaDeEntregas,
} from "@/lib/rastreio/entregas";
import { linkDoPedido } from "@/lib/rastreio/link";
import { lojaDoRastreio } from "@/lib/rastreio/loja";
import { lojaDoRastreioNoPainel } from "@/lib/rastreio/rota-painel";
import { listarEntregas, numerosDasEntregas } from "@/lib/stores/rastreio-entregas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAGINA_MAX = 400;
const BUSCA_MAX = 80;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Pedido = { filtro: FiltroDeEntregas; busca: string | null; pagina: number; pedido: string | null };

function pagina(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= PAGINA_MAX ? n : 1;
}

const texto = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);

/** O documento só anda no corpo do POST; o GET ignora `busca` (nunca em URL nem em log de acesso). */
async function lerPedido(req: Request): Promise<Pedido> {
  if (req.method === "GET") {
    const q = new URL(req.url).searchParams;
    return { filtro: parseFiltroDeEntregas(q.get("filtro")), busca: null, pagina: pagina(q.get("pagina")), pedido: q.get("pedido") };
  }
  const corpo = (await req.json().catch(() => ({}))) as Record<string, unknown> | null;
  const c = corpo && typeof corpo === "object" ? corpo : {};
  return {
    filtro: parseFiltroDeEntregas(texto(c.filtro)),
    busca: texto(c.busca)?.slice(0, BUSCA_MAX) ?? null,
    pagina: pagina(c.pagina),
    pedido: typeof c.pedido === "string" ? c.pedido : null,
  };
}

async function entregas(req: Request): Promise<Response> {
  const loja = await lojaDoRastreioNoPainel(req);
  if (loja instanceof Response) return loja;
  const p = await lerPedido(req);
  if (p.pedido !== null && !UUID.test(p.pedido)) return resposta({ error: "Pedido inválido." }, 400);
  const agora = new Date();
  try {
    const consultas = [
      listarEntregas(loja.tenantId, { filtro: p.filtro, busca: p.busca, pedidoId: p.pedido, pagina: p.pagina, agora }),
      numerosDasEntregas(loja.tenantId, agora),
      lojaDoRastreio(loja.tenantId),
    ] as const;
    // allSettled antes: a resposta só sai quando as três terminaram — nenhuma consulta fica correndo depois dela.
    await Promise.allSettled(consultas);
    const [lista, numeros, dados] = await Promise.all(consultas);
    const corpo: RespostaDeEntregas = {
      numeros, filtro: p.filtro, pagina: p.pagina, porPagina: POR_PAGINA, total: lista.total,
      linhas: lista.pedidos.map((pedido) =>
        linhaDeEntrega(pedido, lista.avisos, dados ? linkDoPedido(dados, pedido.linkToken) : null, agora),
      ),
      atualizadoEm: agora.toISOString(),
    };
    return resposta(corpo, 200);
  } catch (e) {
    // Só a mensagem do erro vai ao log; o corpo (e a busca) nunca.
    return falhou("api/rastreio/entregas", loja.tenantId, e, "Não deu para buscar as entregas.");
  }
}

export const GET = entregas;
export const POST = entregas;
