// apps/web/src/lib/bio/rota-publica.ts
import "server-only";
import { after } from "next/server";

import { paginaPublicaPorSlug } from "@/lib/bio/cache";
import { SLUG_BIO, type DadosRender } from "@/lib/bio/documento";
import { renderPaginaBio, renderPaginaNaoEncontrada } from "@/lib/bio/render";
import { isBotUserAgent, isRateLimited } from "@/lib/pages/analytics";
import { contarBio } from "@/lib/stores/bio-pages";

/**
 * `GET|HEAD /bio/<slug>` — página pública do link da bio (spec link-da-bio §6 e §7).
 *
 * O HTML sai do renderizador com o nonce que o middleware pôs em `x-nonce`; o
 * dado vem do cache (5 min). A CSP sai do middleware e o 308 de `app.`/apex do
 * next.config: aqui só a decisão da resposta e a contagem da visita.
 *
 * Cache e banco entram por parâmetro para o teste trocá-los sem rede (o desenho
 * de `renomearSlugCampanha`).
 */
const DEPS = { porSlug: paginaPublicaPorSlug, contar: contarBio };
export type DepsBio = typeof DEPS;

/** O teto do `/api/p/track`: por IP e página, por minuto (spec §7). */
const VISITAS_POR_MINUTO = 30;
const CABECALHO_HTML = { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex" };
const CABECALHO_TEXTO = { "content-type": "text/plain; charset=utf-8", "x-robots-tag": "noindex" };

export async function responderBio(req: Request, slug: string, deps: DepsBio = DEPS): Promise<Response> {
  try {
    // Fora do formato nem consulta: slug inventado não vira chave de cache.
    if (!SLUG_BIO.test(slug)) return naoEncontrada(req); // o SLUG_BIO do PR 2 já conta 3–40
    const busca = await deps.porSlug(slug);
    if (!busca) return naoEncontrada(req);
    if (busca.tipo === "mudou") return paraOSlugAtual(req, busca.slugAtual);
    return pagina(req, busca.dados, deps);
  } catch (e) {
    console.error(`[bio] ${slug}: página não abriu`, e);
    return new Response("Não conseguimos abrir agora. Tente de novo em instantes.", {
      status: 503,
      headers: { ...CABECALHO_TEXTO, "cache-control": "no-store" },
    });
  }
}

function pagina(req: Request, dados: DadosRender, deps: DepsBio): Response {
  const html = renderPaginaBio(dados, {
    modo: "publica",
    nonce: req.headers.get("x-nonce"),
    animarEntrada: dados.documento.animar,
  });
  if (ehVisita(req)) {
    // Depois da resposta: a contagem nunca segura a página, e falha aqui só vai pro log.
    after(async () => {
      try {
        if (await isRateLimited("bio-visita", req, VISITAS_POR_MINUTO, dados.paginaId)) return;
        await deps.contar(dados.paginaId, "visita");
      } catch (e) {
        console.error(`[bio] ${dados.paginaId}: visita não contada`, e);
      }
    });
  }
  return new Response(html, { status: 200, headers: CABECALHO_HTML });
}

/** Visita = GET de gente. HEAD, prefetch do navegador e robô de prévia de link não contam. */
function ehVisita(req: Request): boolean {
  if (req.method !== "GET") return false;
  const proposito = `${req.headers.get("sec-purpose") ?? ""} ${req.headers.get("purpose") ?? ""}`;
  if (/prefetch/i.test(proposito)) return false;
  return !isBotUserAgent(req.headers.get("user-agent"));
}

/**
 * Slug antigo → o atual. `no-store`: a loja pode voltar ao slug antigo, e um 301
 * guardado no navegador viraria laço. A query vai junto (utm do anúncio, do QR).
 */
function paraOSlugAtual(req: Request, slugAtual: string): Response {
  return new Response(null, {
    status: 301,
    headers: { location: `/bio/${slugAtual}${new URL(req.url).search}`, "cache-control": "no-store" },
  });
}

function naoEncontrada(req: Request): Response {
  return new Response(renderPaginaNaoEncontrada(req.headers.get("x-nonce")), { status: 404, headers: CABECALHO_HTML });
}
