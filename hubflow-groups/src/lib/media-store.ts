import "server-only";
import { promises as fs } from "fs";
import path from "path";

// Mídia (foto) anexada às ofertas. Guardada em data/media; a engine baixa os
// bytes (com token) e envia como imagem+legenda pela fila anti-ban.
const DIR = path.join(process.cwd(), "data", "media");

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "video/3gpp": "3gp",
};
const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  "3gp": "video/3gpp",
};

const VIDEO_EXT = new Set(["mp4", "mov", "webm", "3gp"]);

export async function saveMedia(buffer: Buffer, mime: string): Promise<{ id: string; type: "image" | "video" }> {
  await fs.mkdir(DIR, { recursive: true });
  const ext = MIME_EXT[mime] ?? "jpg";
  const id = `${crypto.randomUUID()}.${ext}`;
  await fs.writeFile(path.join(DIR, id), buffer);
  return { id, type: VIDEO_EXT.has(ext) ? "video" : "image" };
}

export async function readMedia(id: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const safe = path.basename(id); // evita path traversal
  try {
    const buffer = await fs.readFile(path.join(DIR, safe));
    const ext = safe.split(".").pop()?.toLowerCase() ?? "jpg";
    return { buffer, contentType: EXT_MIME[ext] ?? "image/jpeg" };
  } catch {
    return null;
  }
}
