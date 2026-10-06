/**
 * Tipo de mídia de um post de campanha (`undefined` quando o post não tem mídia).
 *
 * Foto, vídeo e áudio saem. O áudio vai como nota de voz gravada na hora (o worker
 * reconhece pela extensão do arquivo, porque o fan-out `app.enqueue_broadcast`
 * grava "image" para ele) — e nota de voz não tem legenda, então áudio com texto é
 * recusado em vez de o texto sumir. Arquivo continua recusado: o worker não passa
 * nome nem mimetype de documento, e um PDF chegaria como "foto" que não abre.
 * Lança com a frase pro lojista, como o `parseTemplateMedia` da Biblioteca.
 */
export function resolvePostMediaType(body: {
  mediaId?: unknown;
  mediaType?: unknown;
  body?: unknown;
}): "image" | "video" | "audio" | undefined {
  if (!body.mediaId) return undefined;
  const tipo = body.mediaType ?? "image";
  if (tipo === "video") return "video";
  if (tipo === "audio") {
    if (String(body.body ?? "").trim()) {
      throw new Error("Áudio sai como mensagem de voz, sem legenda. Mande o texto numa mensagem separada.");
    }
    return "audio";
  }
  if (tipo === "file" || tipo === "document") {
    throw new Error("Arquivo ainda não sai nos grupos. Mande como foto, vídeo ou áudio.");
  }
  return "image";
}
