import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { getTenantSettings } from "@/lib/stores/tenant-settings";
import { LIBRARY_CATEGORIES } from "@/lib/library-copies";
import { libraryCopiesForSegment } from "@/lib/content-packs";

export type TemplateFolder = {
  id: string;
  name: string;
  created_at: string;
};

export type MessageTemplate = {
  id: string;
  folder_id: string;
  name: string;
  body: string;
  uses: number;
  created_at: string;
};

export type FolderWithTemplates = TemplateFolder & { templates: MessageTemplate[] };

function friendlyError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new Error("Já existe uma pasta com esse nome.");
  return new Error(error.message);
}

/**
 * Linhas de seed pra um tenant novo — função pura, sem I/O, testável sem mock
 * de Supabase. Mesmas 5 categorias em todo segmento; o TEXTO da copy é que
 * troca pelo pack (`content-packs.ts`, decisão de 30/08: produto horizontal,
 * marketing vertical).
 */
export function buildSeedRows(
  segment: string | null | undefined,
): { folders: { name: string }[]; templatesByFolder: Record<string, { name: string; body: string }[]> } {
  const pack = libraryCopiesForSegment(segment);
  const folders = LIBRARY_CATEGORIES.map((cat) => ({ name: cat.label }));
  const templatesByFolder: Record<string, { name: string; body: string }[]> = {};
  for (const cat of LIBRARY_CATEGORIES) {
    templatesByFolder[cat.label] = pack
      .filter((c) => c.category === cat.id)
      .map((c) => ({ name: c.title, body: c.body }));
  }
  return { folders, templatesByFolder };
}

// ponytail: duas abas abrindo a Biblioteca ao mesmo tempo na 1ª visita do tenant
// podem correr o seed junto. unique(tenant_id, name) faz a 2ª tentativa de pasta
// duplicada falhar e ser pulada — pior caso é uma pasta ficar sem as copies dessa
// categoria, nunca copy duplicada. Se um dia isso incomodar, travar com uma
// advisory lock por tenant_id antes do seed.
async function seedDefaults(tenantId: string): Promise<void> {
  const db = getSupabaseAdmin();
  const settings = await getTenantSettings(tenantId).catch(() => null);
  const { folders, templatesByFolder } = buildSeedRows(settings?.segment ?? null);

  for (const folder of folders) {
    const { data: created } = await db
      .from("template_folders")
      .insert({ tenant_id: tenantId, name: folder.name })
      .select()
      .single();
    if (!created) continue;

    const copies = templatesByFolder[folder.name] ?? [];
    if (copies.length === 0) continue;
    await db.from("templates").insert(
      copies.map((c) => ({ tenant_id: tenantId, folder_id: created.id, name: c.name, body: c.body, uses: 0 })),
    );
  }
}

export async function listLibrary(tenantId: string): Promise<FolderWithTemplates[]> {
  const db = getSupabaseAdmin();

  const { count } = await db
    .from("template_folders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (!count) await seedDefaults(tenantId);

  const [foldersRes, templatesRes] = await Promise.all([
    db.from("template_folders").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: true }),
    db.from("templates").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false }),
  ]);
  if (foldersRes.error) throw new Error(foldersRes.error.message);
  if (templatesRes.error) throw new Error(templatesRes.error.message);

  const templates = (templatesRes.data ?? []) as MessageTemplate[];
  return ((foldersRes.data ?? []) as TemplateFolder[]).map((folder) => ({
    ...folder,
    templates: templates.filter((t) => t.folder_id === folder.id),
  }));
}

export async function createFolder(tenantId: string, name: string): Promise<TemplateFolder> {
  const { data, error } = await getSupabaseAdmin()
    .from("template_folders")
    .insert({ tenant_id: tenantId, name })
    .select()
    .single();
  if (error) throw friendlyError(error);
  return data as TemplateFolder;
}

export async function renameFolder(tenantId: string, id: string, name: string): Promise<TemplateFolder> {
  const { data, error } = await getSupabaseAdmin()
    .from("template_folders")
    .update({ name })
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw friendlyError(error);
  return data as TemplateFolder;
}

export async function deleteFolder(tenantId: string, id: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("template_folders")
    .delete()
    .eq("id", id)
    .eq("tenant_id", tenantId);
  return !error;
}

export async function createTemplateInFolder(
  tenantId: string,
  input: { folder_id: string; name: string; body: string },
): Promise<MessageTemplate> {
  const { data, error } = await getSupabaseAdmin()
    .from("templates")
    .insert({ tenant_id: tenantId, folder_id: input.folder_id, name: input.name, body: input.body, uses: 0 })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MessageTemplate;
}

export async function updateTemplate(
  tenantId: string,
  id: string,
  patch: { name?: string; body?: string },
): Promise<MessageTemplate> {
  const { data, error } = await getSupabaseAdmin()
    .from("templates")
    .update(patch)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MessageTemplate;
}

export async function deleteTemplateById(tenantId: string, id: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin().from("templates").delete().eq("id", id).eq("tenant_id", tenantId);
  return !error;
}
