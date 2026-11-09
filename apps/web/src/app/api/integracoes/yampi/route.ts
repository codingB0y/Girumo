import { z } from "zod";

import { montarCartaoYampi } from "@/lib/yampi/cartao";
import { conectarYampi, desconectarYampi, type FalhaDeConexao } from "@/lib/yampi/conectar";
import { lojaDoDonoYampi, passouDoTetoYampi, respostaYampi } from "@/lib/yampi/rota";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/integracoes/yampi — o cartão. Sem a chave de cifra, nenhuma consulta. */
export async function GET(req: Request): Promise<Response> {
  const tenantId = await lojaDoDonoYampi(req, "yampi/cartao");
  if (tenantId instanceof Response) return tenantId;
  try {
    return respostaYampi(await montarCartaoYampi(tenantId), 200);
  } catch (e) {
    console.error(`[yampi/cartao] ${tenantId}: ${(e as Error).message}`);
    return respostaYampi({ error: "Não foi possível carregar a Yampi." }, 500);
  }
}

/** A validação do valor é do serviço (`lerAlias` / `lerCredencial`): aqui só o formato do corpo. */
const corpoDaConexao = z.strictObject({ alias: z.unknown(), user_token: z.unknown(), user_secret_key: z.unknown() });

const RESPOSTA_DA_FALHA: Record<FalhaDeConexao, [status: number, corpo: { error: string }]> = {
  dados_invalidos: [400, { error: "Confira o alias e copie de novo o token e a chave da Yampi (o navegador pode ter preenchido um campo sozinho)." }],
  credencial_invalida: [400, { error: "A Yampi recusou essas credenciais. Copie o token e a chave de novo em Perfil › Credenciais de API." }],
  yampi_fora: [502, { error: "A Yampi não respondeu agora. Tente de novo em instantes." }],
  aviso_nao_criado: [502, { error: "Conectamos a Yampi, mas não conseguimos criar o aviso agora. Vamos tentar de novo sozinhos em alguns minutos." }],
  indisponivel: [503, { error: "indisponivel" }],
};

/** POST /api/integracoes/yampi — conectar (ou colar de novo). Nem a resposta nem o log repetem token ou chave. */
export async function POST(req: Request): Promise<Response> {
  const tenantId = await lojaDoDonoYampi(req, "yampi/conectar");
  if (tenantId instanceof Response) return tenantId;
  const teto = await passouDoTetoYampi(tenantId);
  if (teto) return teto;

  let bruto: unknown;
  try {
    bruto = await req.json();
  } catch {
    return respostaYampi({ error: "Pedido inválido." }, 400);
  }
  const lido = corpoDaConexao.safeParse(bruto);
  if (!lido.success) return respostaYampi({ error: "Pedido inválido." }, 400);

  try {
    const r = await conectarYampi(tenantId, lido.data);
    if (r.ok) return respostaYampi({ ok: true }, 200);
    const [status, corpo] = RESPOSTA_DA_FALHA[r.falha];
    return respostaYampi(corpo, status);
  } catch (e) {
    console.error(`[yampi/conectar] ${tenantId}: ${(e as Error).message}`);
    return respostaYampi({ error: "Não foi possível conectar a Yampi." }, 500);
  }
}

/** DELETE /api/integracoes/yampi — desconectar: o banco primeiro, depois o aviso na Yampi por melhor esforço. */
export async function DELETE(req: Request): Promise<Response> {
  const tenantId = await lojaDoDonoYampi(req, "yampi/desconectar");
  if (tenantId instanceof Response) return tenantId;
  try {
    const r = await desconectarYampi(tenantId);
    if (!r) return respostaYampi({ error: "Sem conexão com a Yampi." }, 404);
    return respostaYampi({ ok: true, aviso_apagado: r.avisoApagado }, 200);
  } catch (e) {
    console.error(`[yampi/desconectar] ${tenantId}: ${(e as Error).message}`);
    return respostaYampi({ error: "Não foi possível desconectar a Yampi." }, 500);
  }
}
