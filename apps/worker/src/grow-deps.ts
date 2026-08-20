/**
 * Deps reais do loop de auto-grow: Supabase + app web + Evolution.
 *
 * Fica separado de `grow-loop.ts` para o loop continuar puro e testável sob
 * `tsx --test` sem rede — mesmo arranjo de `pick-send-instance.ts` em relação a
 * `send-loop.ts`.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppClient } from "./app-client.js";
import type { EvolutionGroups } from "./evolution-groups.js";
import type { GrowAck, GrowDeps, GrowJobClaim } from "./grow-loop.js";
import { listGrowTenants } from "./grow-tenants.js";
import { log } from "./log.js";
import { resolveMediaPath } from "./media-id.js";
import { type InstanceRow, pickSendInstance } from "./pick-send-instance.js";

/** Mesmo bucket e TTL do envio (ver send-loop.ts). */
const MEDIA_BUCKET = "uploads";
const SIGNED_URL_TTL_SECONDS = 300;

export function makeGrowDeps(
  supabase: SupabaseClient,
  app: AppClient,
  groups: EvolutionGroups,
): GrowDeps {
  return {
    listTenants: () => listGrowTenants(supabase),

    async claimJobs(tenantId) {
      // A rota avalia o gate (evaluateAutoGrow) e só então reivindica — é o mesmo
      // POST que a engine Baileys fazia, com o mesmo contrato de resposta.
      const jobs = await app.post<GrowJobClaim[]>(tenantId, "/api/groups/grow/pending");
      return Array.isArray(jobs) ? jobs : [];
    },

    async ack(tenantId, jobId, ack: GrowAck) {
      await app.post(tenantId, "/api/groups/grow/ack", { id: jobId, ...ack });
    },

    async instanceFor(tenantId) {
      // Sem cache por tenant de propósito: o loop roda a cada 5 min, e uma
      // instância trocada ou reprovisionada no meio precisa valer no ciclo
      // seguinte, não na próxima reinicialização do worker.
      const { data, error } = await supabase
        .from("instances")
        .select("id, status, provider_instance_id, created_at, phone")
        .eq("tenant_id", tenantId);
      if (error) throw new Error(`instanceFor: ${error.message}`);

      const rows = (data ?? []) as Array<InstanceRow & { phone: string | null }>;
      const chosenId = pickSendInstance(rows);
      if (!chosenId) return null;

      const chosen = rows.find((row) => row.id === chosenId);
      const name = chosen?.provider_instance_id;
      const ownerPhone = chosen?.phone;
      if (!name || !ownerPhone) {
        // Instância ainda em `pending`/`connecting` costuma ter `phone` nulo — o
        // número só é conhecido depois do pareamento. Sem ele o create é 400
        // garantido (`participants` exige minItems 1), então é melhor tratar como
        // "não utilizável" e devolver o job à fila.
        log.warn("auto-grow: instância sem nome ou sem número", { tenant_id: tenantId });
        return null;
      }
      return { name, ownerPhone };
    },

    createGroup: (instanceName, subject, ownerPhone) => groups.createGroup(instanceName, subject, ownerPhone),
    setDescription: (instanceName, jid, description) => groups.setDescription(instanceName, jid, description),
    setAnnounceOnly: (instanceName, jid) => groups.setAnnounceOnly(instanceName, jid),
    setPicture: (instanceName, jid, imageUrl) => groups.setPicture(instanceName, jid, imageUrl),
    inviteUrl: (instanceName, jid) => groups.inviteUrl(instanceName, jid),

    async signedMediaUrl(mediaId, tenantId) {
      // A checagem de tenant é obrigatória: o mediaId é o storage path em
      // base64url, não um segredo (ver media-id.ts).
      const storagePath = resolveMediaPath(mediaId, tenantId);
      if (!storagePath) {
        log.warn("auto-grow: mediaId inválido para o tenant", { tenant_id: tenantId });
        return null;
      }
      const { data, error } = await supabase.storage
        .from(MEDIA_BUCKET)
        .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);
      if (error) {
        log.warn("auto-grow: falha ao assinar a foto do grupo", { error: error.message });
        return null;
      }
      return data?.signedUrl ?? null;
    },
  };
}
