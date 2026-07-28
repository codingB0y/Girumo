/**
 * Vídeo embed-only (Girumo LP v2). Normaliza URLs públicas do YouTube/Vimeo
 * para `{ provider, id }`. NÃO aceita upload, iframe cru, HTML nem URL arbitrária —
 * o iframe de embed é construído por nós (https), só a partir do id validado.
 */

export type LpVideoProvider = "youtube" | "vimeo";
export type LpVideoEmbed = { provider: LpVideoProvider; id: string };

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function isYouTubeId(id: string): boolean {
  return YOUTUBE_ID.test(id);
}

/**
 * Extrai `{ provider, id }` de uma URL pública de YouTube ou Vimeo.
 * Retorna null para qualquer entrada que não seja uma URL de vídeo reconhecida.
 */
export function parseVideoUrl(raw: string): LpVideoEmbed | null {
  if (typeof raw !== "string") return null;
  const input = raw.trim();
  if (!input || input.includes("<")) return null; // rejeita HTML/iframe cru

  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.replace(/^www\./, "").toLowerCase();

  // YouTube
  if (host === "youtu.be") {
    const id = url.pathname.slice(1).split("/")[0];
    return isYouTubeId(id) ? { provider: "youtube", id } : null;
  }
  if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
    if (url.pathname === "/watch") {
      const id = url.searchParams.get("v") ?? "";
      return isYouTubeId(id) ? { provider: "youtube", id } : null;
    }
    const match = url.pathname.match(/^\/(?:shorts|embed|v)\/([^/?#]+)/);
    return match && isYouTubeId(match[1]) ? { provider: "youtube", id: match[1] } : null;
  }

  // Vimeo
  if (host === "vimeo.com") {
    const match = url.pathname.match(/^\/(\d+)(?:\/|$)/);
    return match ? { provider: "vimeo", id: match[1] } : null;
  }
  if (host === "player.vimeo.com") {
    const match = url.pathname.match(/^\/video\/(\d+)/);
    return match ? { provider: "vimeo", id: match[1] } : null;
  }

  return null;
}

/**
 * Monta o `src` do iframe de embed a partir de `{ provider, id }` já validado.
 * O iframe é criado só após o clique do visitante (facade) — `autoplay` só é
 * pedido nesse momento, com o gesto do usuário liberando o som pelo browser.
 *  - YouTube: domínio `youtube-nocookie` (não seta cookie antes do play) + `rel=0`.
 *  - Vimeo: player oficial com `dnt=1` (do-not-track).
 */
export function embedUrl(
  provider: LpVideoProvider,
  id: string,
  opts?: { autoplay?: boolean },
): string {
  const autoplay = opts?.autoplay ? "&autoplay=1" : "";
  if (provider === "youtube") {
    return `https://www.youtube-nocookie.com/embed/${id}?rel=0${autoplay}`;
  }
  return `https://player.vimeo.com/video/${id}?dnt=1${autoplay}`;
}
