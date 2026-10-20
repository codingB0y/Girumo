import "server-only";

import { paginaPublicaPorId } from "@/lib/bio/cache";
import { UUID_BIO } from "@/lib/bio/documento";
import { linksVisiveis } from "@/lib/bio/render/partes";
import { lerTextoComTeto } from "@/lib/bling/cliente";
import { isBotUserAgent, isRateLimited } from "@/lib/pages/analytics";
import { contarBio } from "@/lib/stores/bio-pages";

/**
 * `POST /api/p/bio/toque` — o beacon que o JS da página manda quando alguém toca
 * num botão do link da bio (spec link-da-bio §7). Público nos dois hosts: em host
 * do Girumo a primeira entrada do matcher pula `/api/p/`; no domínio do lojista,
 * `customHostRoute` devolve `"public-api"`.
 *
 * Responde 204 SEMPRE (página que não existe, link escondido, robô, teto, banco
 * fora do ar): um beacon que respondesse diferente viraria oráculo de ids. Por
 * isso toda recusa de corpo, de página e de link, e toda falha, vão pro log — a
 * lição do `/api/track/outbound`. Robô, beacon de outro site e teto são esperados
 * e ficam calados.
 *
 * Cache e banco entram por parâmetro para o teste trocá-los sem rede (o desenho
 * do `responderBio`): o `paginaPublicaPorId` usa `unstable_cache`, que só roda
 * dentro do Next.
 */
const DEPS = { porId: paginaPublicaPorId, contar: contarBio };
export type DepsToque = typeof DEPS;

/** O beacon tem 87 bytes. Medido no que foi lido: o `Content-Length` nem é olhado. */
const TETO_DO_CORPO = 256;
/** O beacon tem 87 B e chega de uma vez: corpo que não fecha em 2 s não segura a função. */
const PRAZO_DO_CORPO_MS = 2_000;
/** O teto da visita e do `/api/p/track`: por IP e página, por minuto (spec §7). */
const TOQUES_POR_MINUTO = 30;

export async function responderToque(req: Request, deps: DepsToque = DEPS): Promise<Response> {
  try {
    if (isBotUserAgent(req.headers.get("user-agent"))) return semConteudo();
    // O beacon da página é sempre same-origin (URL relativa, no www e no domínio próprio). Sem o header
    // (WebView antigo), conta. O `Origin` não serve: o Origin pode vir null (política no-referrer,
    // documento em sandbox).
    const site = req.headers.get("sec-fetch-site");
    if (site !== null && site !== "same-origin") return semConteudo();
    const alvo = await lerAlvo(req);
    if (!alvo) return semConteudo();
    const dados = await deps.porId(alvo.pagina);
    if (!dados) {
      console.warn(`[bio/toque] ${alvo.pagina}: página não publicada, bloqueada ou inexistente`);
      return semConteudo();
    }
    // Só conta botão que a página mostra agora: a regra do renderizador (ativo,
    // fora de `linksEscondidos` e com destino válido).
    if (!linksVisiveis(dados).some((v) => v.link.id === alvo.link)) {
      console.warn(`[bio/toque] ${alvo.pagina}: o link ${alvo.link} não está na página publicada`);
      return semConteudo();
    }
    // ponytail: balde por IP+página (spec §7), só depois de achar a página — id inventado nem chega ao balde:
    // cada id novo custa 1 leitura no Supabase e 1 null no cache (300 s), como o GET /bio/<slug>, mais 1 warn.
    // Se a varredura aparecer no log: limite por IP no firewall da Vercel em /api/p/* e /bio/* (antes da função).
    if (await isRateLimited("bio-toque", req, TOQUES_POR_MINUTO, dados.paginaId)) return semConteudo();
    await deps.contar(dados.paginaId, alvo.link);
  } catch (e) {
    console.error("[bio/toque] toque não contado", e);
  }
  return semConteudo();
}

/** `{"p":<uuid da página>,"l":<uuid do link>}` em até 256 bytes. null = recusado: o motivo vai pro log, o corpo nunca. */
async function lerAlvo(req: Request): Promise<{ pagina: string; link: string } | null> {
  // O leitor do cliente do Bling: lê aos pedaços e para no teto, sem esperar o resto. O prazo aborta o
  // pipe, e a leitura pendente rejeita.
  const fluxo =
    req.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>(), {
      signal: AbortSignal.timeout(PRAZO_DO_CORPO_MS),
    }) ?? null;
  const texto = await lerTextoComTeto(new Response(fluxo), TETO_DO_CORPO).catch(() => null);
  if (texto === null) return recusado("corpo passou de 256 bytes, demorou mais de 2 s ou caiu no meio");
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return recusado("corpo não é JSON");
  }
  const { p, l } = (typeof corpo === "object" && corpo !== null ? corpo : {}) as { p?: unknown; l?: unknown };
  // UUID_BIO: uuid minúsculo, o formato do check de `bio_contagens.alvo` — e sem o `'visita'`,
  // que o check aceita: o toque nunca pode somar visita.
  if (typeof p !== "string" || typeof l !== "string" || !UUID_BIO.test(p) || !UUID_BIO.test(l)) {
    return recusado("p e l precisam ser uuid em minúsculas");
  }
  return { pagina: p, link: l };
}

function recusado(motivo: string): null {
  console.warn(`[bio/toque] beacon recusado: ${motivo}`);
  return null;
}

function semConteudo(): Response {
  return new Response(null, { status: 204 });
}
