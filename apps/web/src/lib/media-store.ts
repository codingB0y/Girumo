import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

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

function encodeMediaId(storagePath: string): string {
  return Buffer.from(storagePath, "utf8").toString("base64url");
}

function decodeMediaId(id: string): string | null {
  try {
    const decoded = Buffer.from(id, "base64url").toString("utf8");
    if (!/^[0-9a-f-]{36}\/media\/[0-9a-f-]+\.[a-z0-9]+$/i.test(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}

export async function saveMedia(
  buffer: Buffer,
  mime: string,
  tenantId: string,
  authUserId: string,
): Promise<{ id: string; type: "image" | "video" }> {
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
    kind: "media",
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

  return { id: encodeMediaId(storagePath), type: VIDEO_EXT.has(ext) ? "video" : "image" };
}

export async function readMedia(id: string): Promise<{ buffer: Buffer; contentType: string } | null> {
  const storagePath = decodeMediaId(id);
  if (!storagePath) return null;

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

