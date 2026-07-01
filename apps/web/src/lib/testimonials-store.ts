import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type Testimonial = {
  id: string;
  tenant_id: string;
  name: string;
  store: string;
  quote: string;
  rating: number;
  approved: boolean;
  created_at: string;
};

/**
 * Lista depoimentos aprovados (para landing page).
 * Fallback: retorna array vazio se tabela não existir.
 */
export async function listApprovedTestimonials(): Promise<Testimonial[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("testimonials")
    .select("*")
    .eq("approved", true)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    // Tabela pode não existir ainda — fallback silencioso
    console.warn("[testimonials] Falha ao buscar:", error.message);
    return [];
  }

  return data as Testimonial[];
}

/**
 * Submete um novo depoimento (não aprovado por default — precisa de review no admin).
 */
export async function submitTestimonial(input: {
  tenantId: string;
  name: string;
  store: string;
  quote: string;
  rating: number;
}): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();

  const { error } = await supabase.from("testimonials").insert({
    tenant_id: input.tenantId,
    name: input.name,
    store: input.store,
    quote: input.quote,
    rating: Math.min(5, Math.max(1, input.rating)),
    approved: false,
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}
