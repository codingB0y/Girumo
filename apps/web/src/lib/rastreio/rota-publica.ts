import "server-only";

import { SLUG_BIO } from "@/lib/bio/documento";
import { renderPaginaNaoEncontrada } from "@/lib/bio/render";
import { LINK_NAO_ENCONTRADO, RASTREIO_DOMINIO, hostnameFromHostHeader, isFirstPartyHost } from "@/lib/custom-domains/host";
import { hashIp } from "@/lib/pages/analytics";
import { conviteDoGrupo } from "@/lib/rastreio/convite";
import { docHmac, normalizarDocumento, pepperDoRastreio, ultimos4 } from "@/lib/rastreio/documento";
import { lojaDoRastreio, type LojaDoRastreio } from "@/lib/rastreio/loja";
import { MUITAS_TENTATIVAS, NAO_ENCONTRADO, PEDIDO_NAO_ENCONTRADO, renderPagina, type Tela } from "@/lib/rastreio/pagina";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { getActiveDomainTenant } from "@/lib/stores/custom-domains";
import { lojaPorSlug, rastreioLigado } from "@/lib/stores/rastreio-config";
import { buscarPedidos, lerPedido, pararAvisos, pedidoPorToken } from "@/lib/stores/rastreio-pedidos";

/**
 * Página pública do Rastreio do pedido (spec rastreio-pedidos §1.3, §3.5 e §7):
 * `GET|HEAD /rastreio/<slug>` = busca, `POST` = a busca feita, `GET /rastreio/<slug>/<token>`
 * = um pedido, `POST /rastreio/<slug>/<token>/parar` = parar os avisos. GET nunca grava nada.
 * No domínio do lojista o middleware reescreve para o slug `_dominio`, e a loja é a dona do host. A CSP sai do middleware e o 308 de `app.`/apex do
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
  donoDoHost: getActiveDomainTenant,
  ligado: rastreioLigado,
  parar: pararAvisos,
  lerPedido,
  convite: conviteDoGrupo,
};
export type DepsRastreio = typeof DEPS;

export const TOKEN_RASTREIO = /^[0-9a-f]{32}$/;

const TAMANHO_MAX_CORPO = 2_048;
const JANELA_DA_BUSCA_MS = 90 * 86_400_000;
const CABECALHO_HTML = {
  "content-type": "text/html; charset=utf-8",
  "x-robots-tag": "noindex",
  // O HTML leva o nonce desta request (e o pedido de alguém): nunca em cache compartilhado.
  "cache-control": "private, no-store",
};
const PARAR_DE_FORA = "Abra o link do pedido para parar os avisos.";
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
    if (await limiteDoPedido(req, achada.loja.tenantId, deps)) {
      return html(429, tela(req, achada, { tipo: "busca", aviso: MUITAS_TENTATIVAS }));
    }
    // Fora do formato nem consulta. O pedido vem filtrado pela loja do slug: token de outra loja é 404.
    const pedido = TOKEN_RASTREIO.test(token) ? await deps.porToken(achada.loja.tenantId, token) : null;
    if (!pedido) return html(404, tela(req, achada, { tipo: "busca", aviso: PEDIDO_NAO_ENCONTRADO }));
    const convite = await conviteDoPedido(achada.loja, pedido.id, deps);
    return html(200, tela(req, achada, { tipo: "pedido", pedido, convite }));
  } catch (e) {
    return indisponivel(slug, e);
  }
}

/**
 * "Parar avisos" (spec §1.2): só POST, e só da página do próprio pedido. Grava em
 * `tracking_orders.notices_stopped_at` pelo `pararAvisos`; nunca em `optouts`.
 */
export async function responderParar(req: Request, slug: string, token: string, deps: DepsRastreio = DEPS): Promise<Response> {
  // Antes de tudo: a prévia do WhatsApp e o prefetch abrem o endereço com GET sozinhos.
  if (req.method !== "POST") return new Response(null, { status: 405, headers: { allow: "POST", "cache-control": "no-store" } });
  if (deOutroSite(req)) return new Response(PARAR_DE_FORA, { status: 403, headers: CABECALHO_TEXTO });
  try {
    const achada = await paginaDaLoja(req, slug, deps);
    if (achada instanceof Response) return achada;
    if (await limiteDoPedido(req, achada.loja.tenantId, deps)) {
      return html(429, tela(req, achada, { tipo: "busca", aviso: MUITAS_TENTATIVAS }));
    }
    const parado = TOKEN_RASTREIO.test(token) ? await deps.parar(achada.loja.tenantId, token) : null;
    if (!parado) return html(404, tela(req, achada, { tipo: "busca", aviso: PEDIDO_NAO_ENCONTRADO }));
    return new Response(null, { status: 303, headers: { location: `${achada.base}/${token}`, "cache-control": "no-store" } });
  } catch (e) {
    return indisponivel(slug, e);
  }
}

/**
 * POST de outra origem (I1). O token de 128 bits é a credencial e o curl passa de qualquer jeito;
 * isto impede que a página de um terceiro vire o botão de "parar" que o navegador da compradora submete.
 * `Sec-Fetch-Site`, se vier, só `same-origin`; `Origin` (ou, sem ele, `Referer`), se vier, com o host
 * desta request: o www no slug, o domínio da loja no `_dominio`. Nenhum dos três (curl) = passa.
 */
function deOutroSite(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return true;
  const origem = req.headers.get("origin") ?? req.headers.get("referer");
  if (origem === null) return false;
  try {
    return new URL(origem).hostname !== hostnameFromHostHeader(req.headers.get("host"));
  } catch {
    return true; // `null` e lixo
  }
}

/**
 * L3: o token abre por link, sem a prova do documento — teto por IP (com hash) e loja na página do
 * pedido e no parar. Um balde só para os dois: o "parar" não abre uma segunda cota de palpites.
 */
async function limiteDoPedido(req: Request, tenantId: string, deps: DepsRastreio): Promise<boolean> {
  return deps.limitar(`rastreio-pedido-min:${hashIp(req) ?? "sem-ip"}:${tenantId}`, 30, 60_000, { maxSeFalhar: 30 });
}

/** Link do grupo VIP para a página; falha vira "sem convite", nunca derruba a página. */
async function conviteDoPedido(loja: LojaDoRastreio, orderId: string, deps: DepsRastreio): Promise<string | null> {
  if (!loja.vipLinkId) return null;
  try {
    const interno = await deps.lerPedido(loja.tenantId, orderId);
    return (await deps.convite(loja, interno?.buyerPhone ?? null))?.url ?? null;
  } catch (e) {
    // Só o tenant e o erro: o telefone não entra no log.
    console.warn(`[rastreio] ${loja.tenantId}: convite não carregou`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** A loja do slug, só com o rastreio ligado (`lojaPorSlug` filtra); senão o 404 neutro da bio. */
async function paginaDaLoja(req: Request, slug: string, deps: DepsRastreio): Promise<PaginaDaLoja | Response> {
  if (slug === RASTREIO_DOMINIO) return lojaDoDominio(req, deps);
  if (!SLUG_BIO.test(slug)) return naoEncontrada(req);
  const config = await deps.lojaPorSlug(slug);
  const loja = config ? await deps.loja(config.tenantId) : null;
  if (!loja) return naoEncontrada(req);
  return { loja, base: `/rastreio/${slug}` };
}

/** No domínio do lojista: a loja dona do host ATIVO, com o rastreio ligado. Host do Girumo nem consulta. */
async function lojaDoDominio(req: Request, deps: DepsRastreio): Promise<PaginaDaLoja | Response> {
  const host = hostnameFromHostHeader(req.headers.get("host"));
  if (!host || isFirstPartyHost(host)) return naoEncontrada(req);
  const tenantId = await deps.donoDoHost(host);
  const loja = tenantId && (await deps.ligado(tenantId)) ? await deps.loja(tenantId) : null;
  if (!loja) return new Response(LINK_NAO_ENCONTRADO, { status: 404, headers: CABECALHO_TEXTO });
  return { loja, base: "/rastreio" };
}

async function buscar(req: Request, { loja, base }: PaginaDaLoja, deps: DepsRastreio): Promise<Response> {
  // Um id por janela: o balde em memória usa só o id como chave. IP puro não entra em chave.
  // Com o Upstash fora do ar o balde em memória conta com o teto de `maxSeFalhar`, não com o normal.
  const quem = `${hashIp(req) ?? "sem-ip"}:${loja.tenantId}`;
  const bloqueado = (await deps.limitar(`rastreio-busca-min:${quem}`, 5, 60_000, { maxSeFalhar: 5 })) || (await deps.limitar(`rastreio-busca-h:${quem}`, 20, 3_600_000, { maxSeFalhar: 20 }));
  if (bloqueado) return html(429, tela(req, { loja, base }, { tipo: "busca", aviso: MUITAS_TENTATIVAS }));
  // Formulário legítimo tem ~100 bytes: corpo sem tamanho válido ou grande nem é lido.
  const tamanho = Number(req.headers.get("content-length") ?? "0");
  if (!Number.isFinite(tamanho) || tamanho > TAMANHO_MAX_CORPO) {
    return html(413, tela(req, { loja, base }, { tipo: "busca", aviso: NAO_ENCONTRADO }));
  }
  const campos = new URLSearchParams(await req.text());
  const documento = (campos.get("documento") ?? "").slice(0, 40);
  const celular = (campos.get("celular") ?? "").slice(0, 40).replace(/\D/g, "");
  const pepper = deps.pepper();
  // Documento inválido roda a mesma consulta, com o que foi digitado limpo como o normalizarDocumento limpa:
  // a resposta não diz se o documento existe.
  const chave = normalizarDocumento(documento)?.digitos ?? documento.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  const desde = new Date(deps.agora().getTime() - JANELA_DA_BUSCA_MS);
  const hmac = docHmac(chave, pepper);
  // Teto por documento, de qualquer IP: trocar de IP não ressuscita os 10⁴ palpites dos 4 dígitos. Só o HMAC na chave.
  if (await deps.limitar(`rastreio-busca-doc:${loja.tenantId}:${hmac}`, 10, 3_600_000, { maxSeFalhar: 10 })) {
    return html(429, tela(req, { loja, base }, { tipo: "busca", aviso: MUITAS_TENTATIVAS }));
  }
  const achados = await deps.buscar(loja.tenantId, hmac, ultimos4(celular), desde);
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
