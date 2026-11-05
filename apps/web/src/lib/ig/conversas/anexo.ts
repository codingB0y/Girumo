/**
 * Limites do Instagram para o que a loja manda no direct (spec §7.10): PNG/JPEG até 8 MB e MP4 até 25 MB.
 * A mesma regra roda no navegador (recusa cedo) e no servidor (o navegador não é confiável).
 */

export const IMAGEM_MAX_BYTES = 8_000_000;
export const VIDEO_MAX_BYTES = 25_000_000;

/** Para o atributo `accept` do seletor de arquivo. */
export const ANEXO_ACCEPT = "image/png,image/jpeg,video/mp4";

export type TipoDeAnexo = "image" | "video";
export type AnexoValido = { ok: true; tipo: TipoDeAnexo } | { ok: false; mensagem: string };

const TIPOS: Record<string, { tipo: TipoDeAnexo; max: number; limite: string; nome: string }> = {
  "image/png": { tipo: "image", max: IMAGEM_MAX_BYTES, limite: "8 MB", nome: "Foto" },
  "image/jpeg": { tipo: "image", max: IMAGEM_MAX_BYTES, limite: "8 MB", nome: "Foto" },
  "video/mp4": { tipo: "video", max: VIDEO_MAX_BYTES, limite: "25 MB", nome: "Vídeo" },
};

export function classificarAnexo(mime: string, bytes: number): AnexoValido {
  const t = TIPOS[mime.trim().toLowerCase()];
  if (!t || !Number.isFinite(bytes) || bytes <= 0) return { ok: false, mensagem: "O Instagram aceita foto em PNG ou JPEG e vídeo em MP4." };
  if (bytes > t.max) return { ok: false, mensagem: `${t.nome} grande demais: o Instagram aceita até ${t.limite}.` };
  return { ok: true, tipo: t.tipo };
}
