/**
 * Regras de mídia (mime/extensão/limites) sem `server-only` — usado tanto pela
 * rota de API quanto pelo upload direto do browser pro Supabase Storage.
 */

export type MediaKind = "media" | "lp-media" | "lp-logo";

export const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/ogg": "ogg",
  "audio/opus": "opus",
  "audio/wav": "wav",
  "audio/aac": "aac",
  "application/pdf": "pdf",
  "application/zip": "zip",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
};

export const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
  mp3: "audio/mpeg",
  ogg: "audio/ogg",
  opus: "audio/opus",
  wav: "audio/wav",
  aac: "audio/aac",
  pdf: "application/pdf",
  zip: "application/zip",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export const MEDIA_BUCKET = "uploads";

const VIDEO_EXT = new Set(["mp4", "mov", "webm", "3gp"]);
const AUDIO_EXT = new Set(["mp3", "ogg", "opus", "wav", "aac"]);

export function extForMime(mime: string): string {
  return MIME_EXT[mime] ?? "jpg";
}

/**
 * Classifica pela extensão primeiro (mais preciso pros mimes conhecidos),
 * mas cai pro PREFIXO do mime (video/*, audio/*) antes de desistir em "file"
 * — celular manda variantes de mime que `MIME_EXT` não lista (ex.:
 * `audio/x-m4a` de nota de voz do iPhone) e que sem esse fallback vinham
 * classificadas como arquivo genérico.
 */
export function classifyMediaType(mime: string, ext: string): "video" | "audio" | "image" | "file" {
  if (VIDEO_EXT.has(ext) || mime.startsWith("video/")) return "video";
  if (AUDIO_EXT.has(ext) || mime.startsWith("audio/")) return "audio";
  if (mime.startsWith("image/")) return "image";
  return "file";
}

export function parseMediaKind(raw: unknown): MediaKind {
  return raw === "lp-media" || raw === "lp-logo" ? raw : "media";
}

export function buildMediaStoragePath(tenantId: string, mime: string): string {
  return `${tenantId}/media/${crypto.randomUUID()}.${extForMime(mime)}`;
}

/**
 * Limites: logo 5MB · imagem de LP 10MB · vídeo 20MB · áudio 16MB · imagem
 * comum 6MB · arquivo genérico 30MB (§7.4). Mídia de LP precisa ser imagem —
 * a prova em vídeo é embed (YouTube/Vimeo), não upload (escopo travado da v1).
 */
export function resolveUploadLimitBytes(kind: MediaKind, mime: string): number {
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isAudio = mime.startsWith("audio/");

  if (kind === "lp-logo") return 5_000_000;
  if (kind === "lp-media") return 10_000_000;
  if (isVideo) return 20_000_000;
  if (isAudio) return 16_000_000;
  if (isImage) return 6_000_000;
  return 30_000_000;
}

export function isLpMediaAllowed(kind: MediaKind, mime: string): boolean {
  if (kind !== "lp-media" && kind !== "lp-logo") return true;
  return mime.startsWith("image/");
}
