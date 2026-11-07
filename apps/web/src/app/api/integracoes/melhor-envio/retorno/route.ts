import { concluirRetorno, destinoNoApp, type MotivoDoRetorno } from "@/lib/melhor-envio/conexao";
import { getAppUrl } from "@/lib/environment";
import { readCookie } from "@/lib/links/deep-link";
import { COOKIE_DO_ESTADO_ME, cookieDoEstadoMe } from "@/lib/stores/melhorenvio-oauth-states";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/integracoes/melhor-envio/retorno — volta do Melhor Envio. Sem sessão: é uma navegação vinda do
 * melhorenvio.com.br, que não carrega o Bearer. Quem autentica é o par state + cookie. Toda saída é 302
 * para o cartão, apagando o cookie. Molde: `bling/retorno`.
 */
export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const noApp = destinoNoApp(url, getAppUrl());
  // Voltou em www: o cookie é do app., então refaz a navegação lá, sem consumir nada.
  if (noApp) return new Response(null, { status: 302, headers: { location: noApp, "cache-control": "no-store" } });

  let motivo: MotivoDoRetorno;
  try {
    motivo = await concluirRetorno(url, readCookie(req.headers.get("cookie"), COOKIE_DO_ESTADO_ME));
  } catch (e) {
    // Mensagens de store e do Melhor Envio não levam token, code nem cookie.
    console.error(`[melhor-envio/retorno] ${(e as Error).message}`);
    motivo = "erro";
  }
  const destino = new URL(`/painel/configuracoes?secao=integracoes&melhorenvio=${motivo}`, req.url);
  return new Response(null, {
    status: 302,
    headers: { location: destino.toString(), "set-cookie": cookieDoEstadoMe("", 0), "cache-control": "no-store" },
  });
}
