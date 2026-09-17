import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { mediaPathBelongsToTenant } from "@/lib/media-path";
import { assertUploadLimit } from "@/lib/billing/entitlements";
import {
  EXT_MIME,
  MEDIA_BUCKET,
  buildMediaStoragePath,
  classifyMediaType,
  resolveUploadLimitBytes,
  isLpMediaAllowed,
  type MediaKind,
} from "@/lib/media-mime";

export type { MediaKind } from "@/lib/media-mime";

const BUCKET = MEDIA_BUCKET;

/** Grava a linha de metadata; em erro, desfaz o upload pra não deixar objeto órfão no bucket. */
async function insertUploadRow(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  row: {
    tenantId: string;
    kind: MediaKind;
    storagePath: string;
    mime: string;
    size: number;
    authUserId: string;
  },
): Promise<void> {
  const { error } = await supabase.from("uploads").insert({
    tenant_id: row.tenantId,
    kind: row.kind,
    bucket: BUCKET,
    path: `uploads/${row.storagePath}`,
    mime_type: row.mime,
    size: row.size,
    created_by: row.authUserId,
    metadata: { storage_path: row.storagePath },
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([row.storagePath]).catch(() => {});
    throw new Error(error.message);
  }
}

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
const PUBLIC_LP_KINDS: readonly MediaKind[] = ["lp-media", "lp-logo"];

export async function saveMedia(
  buffer: Buffer,
  mime: string,
  tenantId: string,
  authUserId: string,
  kind: MediaKind = "media",
): Promise<{ id: string; type: "image" | "video" | "audio" | "file" }> {
  const supabase = getSupabaseAdmin();
  const storagePath = buildMediaStoragePath(tenantId, mime);

  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) throw new Error(uploadError.message);

  await insertUploadRow(supabase, { tenantId, kind, storagePath, mime, size: buffer.length, authUserId });

  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  return { id: encodeMediaId(storagePath), type: classifyMediaType(mime, ext) };
}

/**
 * Decide ONDE o browser vai subir o arquivo direto pro Storage — sem receber
 * o binário. Existe porque uma Vercel Function tem um limite fixo de 4.5MB de
 * corpo de requisição (infra, não contornável por código): vídeo/áudio reais
 * estouram isso o tempo todo, então o binário nunca pode passar por uma rota
 * desta app; só o path (JSON minúsculo) sai daqui.
 *
 * O tenant continua 100% resolvido no SERVIDOR (mesma auth de sempre) — o
 * client não precisa saber seu próprio tenant pra montar o path, então isto
 * funciona mesmo se o localStorage do painel estiver vazio/desatualizado.
 */
export function prepareMediaUpload(
  mime: string,
  tenantId: string,
  kind: MediaKind = "media",
): { storagePath: string } {
  if (!isLpMediaAllowed(kind, mime)) {
    throw Response.json({ error: "Envie uma imagem (PNG, JPEG ou WebP)." }, { status: 415 });
  }
  return { storagePath: buildMediaStoragePath(tenantId, mime) };
}

/**
 * Registra a metadata de um arquivo que o PRÓPRIO BROWSER já subiu direto pro
 * Storage (via `getSupabaseBrowserClient()`, autorizado pela RLS de
 * `storage.objects` — ver `prepareMediaUpload`). Reaplica as MESMAS regras do
 * upload direto (`saveMedia`): tamanho por kind/tipo, `assertUploadLimit`, e
 * que o path pertence ao tenant do chamador.
 *
 * O `mime`/`size` usados em toda decisão de negócio vêm do OBJETO REAL no
 * Storage (`list()`), nunca do que o client alega — um client não confiável
 * poderia mentir o mime pra outro limite/visibilidade, e o `File.type` do
 * browser é tão forjável quanto o `mime` de um JSON.
 */
export async function registerUploadedMedia(
  storagePath: string,
  tenantId: string,
  authUserId: string,
  kind: MediaKind = "media",
): Promise<{ id: string; type: "image" | "video" | "audio" | "file" }> {
  if (!mediaPathBelongsToTenant(storagePath, tenantId)) {
    throw Response.json({ error: "Caminho de mídia inválido." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const dir = `${tenantId}/media`;
  const filename = storagePath.slice(dir.length + 1);
  const { data: listing, error: listError } = await supabase.storage.from(BUCKET).list(dir, {
    search: filename,
  });
  const found = listing?.find((item) => item.name === filename);
  if (listError || !found) {
    throw Response.json({ error: "Arquivo não encontrado no storage." }, { status: 404 });
  }

  // `metadata.size` ausente é tratado como falha, não como "0 bytes" — um
  // fallback silencioso furaria o limite por kind/tipo E a cota de plano
  // (que soma `uploads.size`) pra sempre, já que a linha nasceria com 0.
  const rawSize = found.metadata?.size;
  if (rawSize === undefined || rawSize === null) {
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw Response.json({ error: "Não foi possível confirmar o arquivo enviado." }, { status: 500 });
  }
  const size = Number(rawSize);
  const mime: string = found.metadata?.mimetype ?? "application/octet-stream";

  try {
    if (!isLpMediaAllowed(kind, mime)) {
      throw Response.json({ error: "Envie uma imagem (PNG, JPEG ou WebP)." }, { status: 415 });
    }

    const limit = resolveUploadLimitBytes(kind, mime);
    if (size > limit) {
      const maxLabel = `${Math.round(limit / 1_000_000)}MB`;
      throw Response.json({ error: `Arquivo grande demais (max ${maxLabel}).` }, { status: 413 });
    }

    await assertUploadLimit(tenantId, size);
    await insertUploadRow(supabase, { tenantId, kind, storagePath, mime, size, authUserId });
  } catch (error) {
    // insertUploadRow já limpa o storage no erro DELE; os outros três throws
    // acima ainda não tocaram no arquivo — sem este catch ele ficava órfão.
    await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => {});
    throw error;
  }

  const ext = storagePath.split(".").pop()?.toLowerCase() ?? "jpg";
  return { id: encodeMediaId(storagePath), type: classifyMediaType(mime, ext) };
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

