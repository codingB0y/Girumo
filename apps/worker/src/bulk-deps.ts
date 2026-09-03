/**
 * Deps reais do loop de ações em massa: Supabase + app web + Evolution.
 *
 * Separado de `bulk-loop.ts` para o loop continuar puro e testável sem rede —
 * mesmo arranjo de `grow-deps.ts` em relação a `grow-loop.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppClient } from "./app-client.js";
import type { BulkAck, BulkDeps, BulkJobClaim } from "./bulk-loop.js";
import type { EvolutionGroups } from "./evolution-groups.js";
import { log } from "./log.js";
import { resolveMediaPath } from "./media-id.js";
import { type InstanceRow, pickSendInstance } from "./pick-send-instance.js";

/** Mesmo bucket e TTL do envio e do auto-grow. */
const MEDIA_BUCKET = "uploads";
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Tenants com job na fila. Só esses precisam de tick.
 *
 * Ler a fila direto (e não uma tabela de configuração, como o auto-grow faz com
 * `listGrowTenants`) é o recorte certo aqui: ação em massa é episódica — quase
 * sempre a resposta é lista vazia, e nenhum tenant paga uma chamada HTTP à toa.
 */
async function listBulkTenants(supabase: SupabaseClient): Promise<string[]> {
  const { data, error } = await supabase
    .from("group_bulk_jobs")
    .select("tenant_id")
    .eq("status", "queued")
    .limit(500);

  if (error) throw new Error(`listBulkTenants: ${error.message}`);
  return [...new Set((data ?? []).map((row) => String(row.tenant_id)))];
}

export function makeBulkDeps(
  supabase: SupabaseClient,
  app: AppClient,
  groups: EvolutionGroups,
): BulkDeps {
  return {
    listTenants: () => listBulkTenants(supabase),

    async claimJobs(tenantId) {
      const jobs = await app.post<BulkJobClaim[]>(tenantId, "/api/groups/bulk/pending");
      return Array.isArray(jobs) ? jobs : [];
    },

    async ack(tenantId, jobId, ack: BulkAck) {
      await app.post(tenantId, "/api/groups/bulk/ack", { id: jobId, ...ack });
    },

    async instanceFor(tenantId) {
      // Sem cache por tenant, pelo mesmo motivo do auto-grow: uma instância
      // trocada no meio precisa valer no ciclo seguinte, não na próxima
      // reinicialização do worker.
      const { data, error } = await supabase
        .from("instances")
        .select("id, status, provider_instance_id, created_at")
        .eq("tenant_id", tenantId);

      if (error) throw new Error(`instanceFor: ${error.message}`);

      const rows = (data ?? []) as InstanceRow[];
      const chosenId = pickSendInstance(rows);
      if (!chosenId) return null;

      // Diferente do auto-grow, aqui NÃO é preciso o número da instância: nenhuma
      // dessas operações leva `participants`. Só o nome basta — e exigir o número
      // faria a ação em massa falhar em instância cujo pareamento ainda não
      // devolveu telefone, sem necessidade.
      const name = rows.find((row) => row.id === chosenId)?.provider_instance_id;
      if (!name) {
        log.warn("ações em massa: instância sem nome de provedor", { tenant_id: tenantId });
        return null;
      }
      return name;
    },

    setOpenToAll: (instanceName, jid) => groups.setOpenToAll(instanceName, jid),
    setAnnounceOnly: (instanceName, jid) => groups.setAnnounceOnly(instanceName, jid),
    // `inviteUrl` já existia para o auto-grow — a revisão de link não precisou de
    // chamada HTTP nova, só de ser exposta ao loop.
    inviteUrl: (instanceName, jid) => groups.inviteUrl(instanceName, jid),
    setDescription: (instanceName, jid, description) =>
      groups.setDescription(instanceName, jid, description),
    setPicture: (instanceName, jid, imageUrl) => groups.setPicture(instanceName, jid, imageUrl),

    async signedMediaUrl(mediaId, tenantId) {
      // A checagem de tenant é obrigatória: o mediaId é o storage path em
      // base64url, não um segredo (ver media-id.ts). Sem ela, um id forjado
      // apontaria para o arquivo de outro lojista.
      const storagePath = resolveMediaPath(mediaId, tenantId);
      if (!storagePath) {
        log.warn("ações em massa: mediaId inválido para o tenant", { tenant_id: tenantId });
        return null;
      }

      const { data, error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

      if (error) {
        log.warn("ações em massa: falha ao assinar a imagem", { error: error.message });
        return null;
      }
      return data?.signedUrl ?? null;
    },
  };
}
