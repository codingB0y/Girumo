import "server-only";
import { collection } from "@/lib/json-collection";
import { listLinks, slugify } from "@/lib/store";

// Campanha = um conjunto de grupos que o lojista escolhe gerenciar (modelo
// HUBFLOW). Loja → Campanhas → Grupos. É o escopo de TODO o resto: o app opera
// só os grupos da campanha ativa, em vez de misturar todos os grupos admin.
// Molde do grupo que a engine cria quando o pool lota (auto-grow).
export type GrowTemplate = {
  subjectPattern: string; // ex.: "Atacado #{n}" — {n} vira o número do grupo
  desc?: string;
  mediaId?: string;
  announce?: boolean; // grupo "só admin envia" (default true p/ grupo de oferta)
  memberAddMode?: "admin_add" | "all_member_add";
};

export type Campanha = {
  id: string;
  tenantId?: string;
  name: string;
  loja: string; // nome da loja (agrupa campanhas; permite multi-loja)
  groupIds: string[]; // JIDs dos grupos escolhidos p/ esta campanha
  /** Slug do link mestre: /r/<slug> roteia p/ o próximo grupo disponível ("lota sozinho"). */
  slug?: string;
  /** Auto-criar o próximo grupo quando o pool lota (default off — criar grupo é ação de risco). */
  autoGrow?: boolean;
  growTemplate?: GrowTemplate;
  /** Contador p/ numerar os grupos criados ({n}). */
  growCounter?: number;
  createdAt: string;
};

export const campanhasColl = collection<Campanha>("campanhas.json");

/** Gera um slug único entre os já tomados (campanhas + links compartilham o namespace /r/). */
export function uniqueCampanhaSlug(name: string, taken: Set<string>): string {
  const base = slugify(name) || "campanha";
  let slug = base;
  while (taken.has(slug)) slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
  taken.add(slug);
  return slug;
}

/**
 * Garante que toda campanha tenha slug (backfill idempotente das antigas). Só grava
 * quando faltava algum. Considera os slugs de links p/ não colidir no /r/.
 */
export async function ensureSlugs(): Promise<void> {
  const links = await listLinks();
  await campanhasColl.transact((list) => {
    const taken = new Set<string>([...links.map((l) => l.slug), ...list.map((c) => c.slug).filter(Boolean) as string[]]);
    let changed = false;
    for (const c of list) {
      if (!c.slug) {
        c.slug = uniqueCampanhaSlug(c.name, taken);
        changed = true;
      }
    }
    return { items: changed ? list : undefined, result: undefined };
  });
}

/** Resolve o link mestre /r/<slug> para a campanha dona (após backfill). */
export async function findCampanhaBySlug(slug: string): Promise<Campanha | null> {
  await ensureSlugs();
  const list = await campanhasColl.list();
  return list.find((c) => c.slug === slug) ?? null;
}
