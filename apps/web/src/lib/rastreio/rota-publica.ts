import "server-only";

import { SLUG_BIO } from "@/lib/bio/documento";
import { renderPaginaNaoEncontrada } from "@/lib/bio/render";
import { hashIp } from "@/lib/pages/analytics";
import { docHmac, normalizarDocumento, pepperDoRastreio, ultimos4 } from "@/lib/rastreio/documento";
import { lojaDoRastreio, type LojaDoRastreio } from "@/lib/rastreio/loja";
import { MUITAS_TENTATIVAS, NAO_ENCONTRADO, PEDIDO_NAO_ENCONTRADO, renderPagina, type Tela } from "@/lib/rastreio/pagina";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { lojaPorSlug } from "@/lib/stores/rastreio-config";
import { buscarPedidos, pedidoPorToken } from "@/lib/stores/rastreio-pedidos";

/**
 * Página pública do Rastreio do pedido no www (spec rastreio-pedidos §1.3, §3.5 e §7):
 * `GET|HEAD /rastreio/<slug>` = busca, `POST` = a busca feita, `GET /rastreio/<slug>/<token>`
 * = um pedido. GET nunca grava nada. A CSP sai do middleware e o 308 de `app.`/apex do
 * next.config; aqui só a decisão da resposta. Banco e relógio por parâmetro, no molde da bio.
 */
const DEPS = {
  lojaPorSlug,
  loja: lojaDoRastreio,
  buscar: buscarPedidos,
  porToken: pedidoPorToken,
  pepper: pepperDoRastreio,
  limitar: checkRateLimit,
  agora: (): Date => new Date(),
};
export type DepsRastreio = typeof DEPS;

export const TOKEN_RASTREIO = /^[0-9a-f]{32}$/;

const JANELA_DA_BUSCA_MS = 90 * 86_400_000;
const CABECALHO_HTML = {
  "content-type": "text/html; charset=utf-8",
  "x-robots-tag": "noindex",
  // O HTML leva o nonce desta request (e o pedido de alguém): nunca em cache compartilhado.
  "cache-control": "private, no-store",
};
const CABECALHO_TEXTO = { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex", "cache-control": "no-store" };

type PaginaDaLoja = { loja: LojaDoRastreio; base: string };

export async function responderBusca(req: Request, slug: string, deps: DepsRastreio = DEPS): Promise<Response> {
  try {
    const achada = await paginaDaLoja(req, slug, deps);
    if (achada instanceof Response) return achada;
    if (req.method !== "POST") return html(200, tela(req, achada, { tipo: "busca", aviso: null }));
    return await buscar(req, achada, deps);
  } catch (e) {
    return indisponivel(slug, e);
  }
}

export async function responderPedido(req: Request, slug: string, token: string, deps: DepsRastreio = DEPS): Promise<Response> {
  try {
    const achada = await paginaDaLoja(req, slug, deps);
    if (achada instanceof Response) return achada;
    // Fora do formato nem consulta. O pedido vem filtrado pela loja do slug: token de outra loja é 404.
    const pedido = TOKEN_RASTREIO.test(token) ? await deps.porToken(achada.loja.tenantId, token) : null;
    if (!pedido) return html(404, tela(req, achada, { tipo: "busca", aviso: PEDIDO_NAO_ENCONTRADO }));
    return html(200, tela(req, achada, { tipo: "pedido", pedido, convite: null }));
  } catch (e) {
    return indisponivel(slug, e);
  }
}

/** A loja do slug, só com o rastreio ligado (`lojaPorSlug` filtra); senão o 404 neutro da bio. */
async function paginaDaLoja(req: Request, slug: string, deps: DepsRastreio): Promise<PaginaDaLoja | Response> {
  if (!SLUG_BIO.test(slug)) return naoEncontrada(req);
  const config = await deps.lojaPorSlug(slug);
  const loja = config ? await deps.loja(config.tenantId) : null;
  if (!loja) return naoEncontrada(req);
  return { loja, base: `/rastreio/${slug}` };
}

async function buscar(req: Request, { loja, base }: PaginaDaLoja, deps: DepsRastreio): Promise<Response> {
  // Um id por janela: o balde em memória usa só o id como chave. IP puro não entra em chave.
  const quem = `${hashIp(req) ?? "sem-ip"}:${loja.tenantId}`;
  if ((await deps.limitar(`rastreio-busca-min:${quem}`, 5, 60_000)) || (await deps.limitar(`rastreio-busca-h:${quem}`, 20, 3_600_000))) {
    return html(429, tela(req, { loja, base }, { tipo: "busca", aviso: MUITAS_TENTATIVAS }));
  }
  const campos = new URLSearchParams(await req.text());
  const documento = (campos.get("documento") ?? "").slice(0, 40);
  const celular = (campos.get("celular") ?? "").slice(0, 40).replace(/\D/g, "");
  const pepper = deps.pepper();
  // Documento inválido roda a mesma consulta, com o que foi digitado limpo como o normalizarDocumento limpa:
  // a resposta não diz se o documento existe.
  const chave = normalizarDocumento(documento)?.digitos ?? documento.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const desde = new Date(deps.agora().getTime() - JANELA_DA_BUSCA_MS);
  const achados = await deps.buscar(loja.tenantId, docHmac(chave, pepper), ultimos4(celular), desde);
  if (achados.length === 1) {
    return new Response(null, { status: 303, headers: { location: `${base}/${achados[0].linkToken}`, "cache-control": "no-store" } });
  }
  return html(200, tela(req, { loja, base }, achados.length ? { tipo: "lista", pedidos: achados } : { tipo: "busca", aviso: NAO_ENCONTRADO }));
}

function tela(req: Request, { loja, base }: PaginaDaLoja, t: Tela): string {
  return renderPagina({ loja, base, nonce: req.headers.get("x-nonce") }, t);
}

function html(status: number, corpo: string): Response {
  return new Response(corpo, { status, headers: CABECALHO_HTML });
}

function naoEncontrada(req: Request): Response {
  return html(404, renderPaginaNaoEncontrada(req.headers.get("x-nonce")));
}

function indisponivel(slug: string, e: unknown): Response {
  // Só o slug (público) e o erro: documento e celular nunca entram no log.
  console.error(`[rastreio] ${slug}: página não abriu`, e);
  return new Response("Não conseguimos abrir agora. Tente de novo em instantes.", { status: 503, headers: CABECALHO_TEXTO });
}
