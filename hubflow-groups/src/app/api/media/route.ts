import { saveMedia } from "@/lib/media-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/media — upload de foto (multipart, campo "file"). Retorna { id, type }.
export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json({ error: "Envio inválido." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Arquivo ausente." }, { status: 400 });
  const isImage = file.type.startsWith("image/");
  const isVideo = file.type.startsWith("video/");
  if (!isImage && !isVideo) return Response.json({ error: "Envie uma imagem ou vídeo." }, { status: 400 });
  const limit = isVideo ? 20_000_000 : 6_000_000;
  if (file.size > limit)
    return Response.json({ error: `Arquivo grande demais (máx ${isVideo ? "20MB" : "6MB"}).` }, { status: 413 });

  const buf = Buffer.from(await file.arrayBuffer());
  const saved = await saveMedia(buf, file.type);
  return Response.json(saved, { status: 201 });
}
