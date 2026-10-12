// apps/web/src/lib/stores/painel-do-site.ts
import "server-only";

import type {
  CadastroDaChave,
  CadastroLido,
  HistoricoDosCadastros,
  LeadLido,
  PedidoLido,
} from "@/lib/integracoes/situacao-do-cadastro";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { variantesDoTelefone } from "@/lib/vendas/telefone";

const ULTIMOS = 5;
const COLUNAS_DO_PEDIDO = "id, phone, lead_id, value, created_at";

type Resultado = { data: unknown; error: { message: string } | null };

async function linhas<T>(consulta: PromiseLike<Resultado> | null): Promise<T[]> {
  if (!consulta) return [];
  const { data, error } = await consulta;
  if (error) throw new Error(error.message);
  return (data ?? []) as T[];
}

/**
 * O que a tela de integração do site mostra (spec 2026-10-10-funil-anuncios §3):
 * quantos cadastros chegaram desde `desde` e os 5 últimos com o histórico da
 * pessoa para a situação (`situacoesDosCadastros`).
 *
 * Toda consulta filtra `tenant_id` — service-role passa por cima do RLS. A
 * contagem é HEAD + count: listar as linhas pararia em 1000 sem erro. O resto é
 * o histórico de no máximo 5 pessoas, longe do teto.
 *
 * `leads` e `orders` são lidos por igualdade de telefone (com/sem 55, com/sem o
 * 9: `variantesDoTelefone`) porque o índice de `phone_key(phone)` é de expressão
 * e o PostgREST não filtra por função. Os dois writers gravam só dígitos
 * (`upsert_lead`, `addOrder`); a chave exata é conferida depois, em
 * `situacoesDosCadastros`.
 */
export async function lerPainelDoSite(
  tenantId: string,
  desde: string,
): Promise<HistoricoDosCadastros & { recebidos30d: number }> {
  const db = getSupabaseAdmin();
  const [ultimos, contagem] = await Promise.all([
    linhas<CadastroLido>(
      db
        .from("site_captures")
        .select("id, whatsapp, phone_key, utm_campaign, utm_content, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(ULTIMOS),
    ),
    db.from("site_captures").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).gte("created_at", desde),
  ]);
  // HEAD não tem corpo: erro chega sem mensagem e contagem ausente é erro, nunca zero.
  if (contagem.error) throw new Error(contagem.error.message || `HTTP ${contagem.status}`);
  if (contagem.count === null || !Number.isInteger(contagem.count)) throw new Error(`HTTP ${contagem.status} sem contagem`);

  const vazio = { ultimos, daChave: [], leads: [], pedidos: [], comClique: new Set<string>(), recebidos30d: contagem.count };
  if (ultimos.length === 0) return vazio;

  const chaves = [...new Set(ultimos.flatMap((c) => (c.phone_key ? [c.phone_key] : [])))];
  const telefones = [...new Set(ultimos.flatMap((c) => variantesDoTelefone(c.whatsapp) ?? []))];
  const [daChave, leads, cliques] = await Promise.all([
    linhas<CadastroDaChave>(
      chaves.length > 0
        ? db.from("site_captures").select("id, phone_key, created_at").eq("tenant_id", tenantId).in("phone_key", chaves)
        : null,
    ),
    linhas<LeadLido>(
      telefones.length > 0
        ? db.from("leads").select("id, phone, entered_at").eq("tenant_id", tenantId).in("phone", telefones)
        : null,
    ),
    linhas<{ capture_id: string }>(
      db.from("link_click_events").select("capture_id").eq("tenant_id", tenantId).in("capture_id", ultimos.map((c) => c.id)),
    ),
  ]);

  const leadIds = leads.map((l) => l.id);
  const [porTelefone, porLead] = await Promise.all([
    linhas<PedidoLido>(
      telefones.length > 0
        ? db.from("orders").select(COLUNAS_DO_PEDIDO).eq("tenant_id", tenantId).in("phone", telefones)
        : null,
    ),
    // Pedido sem telefone casa pelo telefone do lead (o coalesce da função do banco).
    linhas<PedidoLido>(
      leadIds.length > 0
        ? db.from("orders").select(COLUNAS_DO_PEDIDO).eq("tenant_id", tenantId).in("lead_id", leadIds)
        : null,
    ),
  ]);
  const pedidos = [...new Map([...porTelefone, ...porLead].map((p) => [p.id, p])).values()];

  return { ...vazio, daChave, leads, pedidos, comClique: new Set(cliques.map((c) => c.capture_id)) };
}
