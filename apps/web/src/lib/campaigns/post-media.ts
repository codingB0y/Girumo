/**
 * Tipo de mídia de um post de campanha (`undefined` quando o post não tem mídia).
 *
 * Só foto e vídeo saem de verdade. O fan-out (`app.enqueue_broadcast`) manda
 * qualquer outro tipo como imagem, e o worker não tem envio de áudio nem passa
 * nome e mimetype de documento — um PDF ou uma nota de voz chegavam no grupo
 * como uma "foto" que não abre. Lança com a frase pro lojista, como o
 * `parseTemplateMedia` da Biblioteca.
 */
export function resolvePostMediaType(body: { mediaId?: unknown; mediaType?: unknown }): "image" | "video" | undefined {
  if (!body.mediaId) return undefined;
  const tipo = body.mediaType ?? "image";
  if (tipo === "video") return "video";
  if (tipo === "audio" || tipo === "file" || tipo === "document") {
    throw new Error("Áudio e arquivo ainda não saem nos grupos. Mande como foto ou vídeo.");
  }
  return "image";
}
