/**
 * Tipo de mídia de um post de campanha (`undefined` quando o post não tem mídia).
 *
 * Foto, vídeo e áudio saem. O áudio vai como nota de voz gravada na hora (o worker
 * reconhece pela extensão do arquivo, porque o fan-out `app.enqueue_broadcast`
 * grava "image" para ele) — e nota de voz não tem legenda, então áudio com texto é
 * recusado em vez de o texto sumir. Arquivo (PDF, Word, Excel, PowerPoint, ZIP) sai
 * como documento, com legenda e com o nome que o lojista subiu: o worker reconhece
 * pela extensão e o fan-out leva `media_name` como `fileName` (20261015120000).
 * Lança com a frase pro lojista, como o `parseTemplateMedia` da Biblioteca.
 */
export function resolvePostMediaType(body: {
  mediaId?: unknown;
  mediaType?: unknown;
  body?: unknown;
}): "image" | "video" | "audio" | "file" | undefined {
  if (!body.mediaId) return undefined;
  const tipo = body.mediaType ?? "image";
  if (tipo === "video") return "video";
  if (tipo === "audio") {
    if (String(body.body ?? "").trim()) {
      throw new Error("Áudio sai como mensagem de voz, sem legenda. Mande o texto numa mensagem separada.");
    }
    return "audio";
  }
  if (tipo === "file" || tipo === "document") return "file";
  return "image";
}
