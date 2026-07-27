import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mediaPathBelongsToTenant } from "@/lib/media-path";

const BUCKET = "uploads";

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

const EXT_MIME: Record<string, string> = {
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

const VIDEO_EXT = new Set(["mp4", "mov", "webm", "3gp"]);
const AUDIO_EXT = new Set(["mp3", "ogg", "opus", "wav", "aac"]);

function encodeMediaId(storagePath: string): string {
  return Buffer.from(storagePath, "utf8").toString("base64url");
}

function decodeMediaId(id: string): string | null {
  try {
    const decoded = Buffer.from(id, "base64url").toString("utf8");
    if (!/^[0-9a-f-]{36}\/media\/[0-9a-f-]+\.[a-z0-9]{2,5}$/i.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

/**
 * Visibilidade da mídia. `media` é privada (campanhas de WhatsApp etc. — só sai
 * pela rota autenticada). `lp-media`/`lp-logo` são mídia de landing page, servida
 * publicamente por /api/p/media/:id. É este `kind` — e não o id — que autoriza a
 * leitura pública: o id é só o storage path em base64url, então sem esse filtro
 * qualquer upload privado vazaria para quem tivesse o id em mãos.
 */
export type MediaKind = "media" | "lp-media" | "lp-logo";

const PUBLIC_LP_KINDS: readonly MediaKind[] = ["lp-media", "lp-logo"];

export async function saveMedia(
  buffer: Buffer,
  mime: string,
  tenantId: string,
  authUserId: string,
  kind: MediaKind = "media",
): Promise<{ id: string; type: "image" | "video" | "audio" | "file" }> {
  const supabase = getSupabaseAdmin();
  const ext = MIME_EXT[mime] ?? "jpg";
  const filename = `${crypto.randomUUID()}.${ext}`;
  const storagePath = `${tenantId}/media/${filename}`;
  const metadataPath = `uploads/${storagePath}`;

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mime,
    upsert: false,
  });

  if (uploadError) throw new Error(uploadError.message);

  const { error: metadataError } = await supabase.from("uploads").insert({
    tenant_id: tenantId,
    kind,
    bucket: BUCKET,
    path: metadataPath,
    mime_type: mime,
    size: buffer.length,
    created_by: authUserId,
    metadata: { storage_path: storagePath },
  });

  if (metadataError) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw new Error(metadataError.message);
  }

  const mediaType: "video" | "audio" | "image" | "file" = VIDEO_EXT.has(ext)
    ? "video"
    : AUDIO_EXT.has(ext)
      ? "audio"
      : mime.startsWith("image/")
        ? "image"
        : "file";
  return { id: encodeMediaId(storagePath), type: mediaType };
}

/**
 * Leitura PÚBLICA de mídia de landing page (sem sessão). A autorização é o `kind`
 * gravado no upload: só `lp-media`/`lp-logo` saem por aqui. Mídia privada (kind
 * `media`, de campanhas) retorna null mesmo que o chamador tenha o id — o id é
 * apenas o storage path codificado, não um segredo.
 */
export async function readPublicLpMedia(
  id: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const storagePath = decodeMediaId(id);
  if (!storagePath) return null;

  const supabase = getSupabaseAdmin();
  const { data: row, error: rowError } = await supabase
    .from("uploads")
    .select("kind")
    .eq("bucket", BUCKET)
    .eq("path", `uploads/${storagePath}`)
    .maybeSingle();

  if (rowError || !row) return null;
  if (!PUBLIC_LP_KINDS.includes(row.kind as MediaKind)) return null;

  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);
  if (error || !data) return null;

  const arrayBuffer = await data.arrayBuffer();
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: EXT_MIME[ext] ?? "application/octet-stream",
  };
}

export async function readMedia(id: string, tenantId: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const storagePath = decodeMediaId(id);
  if (!storagePath || !mediaPathBelongsToTenant(storagePath, tenantId)) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage.from(BUCKET).download(storagePath);

  if (error || !data) return null;

  const arrayBuffer = await data.arrayBuffer();
  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: EXT_MIME[ext] ?? "application/octet-stream",
  };
}

