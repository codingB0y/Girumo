import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O aviso de privacidade do Recuperar e o registro de que o lojista o confirmou.
 *
 * Sem `server-only` de proposito: o checkout (cliente) importa so o texto. As funcoes
 * recebem o `SupabaseClient` (mesmo padrao de `billing/trial-claims.ts`) e o chamador
 * passa o service-role, que ignora RLS: o `.eq("tenant_id")` da leitura e o isolamento
 * entre lojas.
 *
 * Quem mudar o texto muda a `versao`: o registro guarda a versao e o texto que o
 * lojista viu, e uma confirmacao antiga continua provando o texto antigo.
 */
export const AVISO_DE_PRIVACIDADE = {
  versao: "2026-10-29",
  texto:
    "Confirmo que o site da loja ou a política de privacidade avisa que a loja pode falar com a cliente pelo WhatsApp sobre o pedido e o carrinho dela.",
} as const;

export const EVENTO_AVISO = "recuperar.aviso.confirmado";

export type OrigemDoAviso = "checkout" | "admin";

/**
 * Grava a confirmacao em `logs`. Quem chama bloqueia a cobranca se vier `error`: sem o
 * registro nao ha prova de que o lojista foi avisado.
 */
export async function registrarAviso(
  supabase: SupabaseClient,
  { tenantId, userId, origem }: { tenantId: string; userId: string; origem: OrigemDoAviso },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from("logs").insert({
    tenant_id: tenantId,
    actor_user_id: userId,
    level: "info",
    event: EVENTO_AVISO,
    message: "Lojista confirmou o aviso de privacidade do Recuperar.",
    metadata: { versao: AVISO_DE_PRIVACIDADE.versao, texto: AVISO_DE_PRIVACIDADE.texto, origem },
  });
  return { error: error?.message ?? null };
}

/** Quando a loja confirmou o aviso pela ultima vez (`null` = nunca confirmou). */
export async function avisoConfirmadoEm(
  supabase: SupabaseClient,
  tenantId: string,
): Promise<{ em: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from("logs")
    .select("created_at")
    .eq("tenant_id", tenantId)
    .eq("event", EVENTO_AVISO)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { em: null, error: error.message };
  return { em: (data?.created_at as string | undefined) ?? null, error: null };
}
