import "server-only";

import { trackFunnelEvent } from "@/lib/analytics/funnel-events";
import { connectionState, fetchInstance } from "@/lib/evolution/client";
import { precisaConferirConexao, telefoneDoFetchInstances } from "@/lib/instances/reconciliacao";
import { updateInstanceStatus, type Instance } from "@/lib/stores/instances";

/**
 * Curto de propósito: roda dentro do GET que o painel faz a cada 4 s na tela de
 * conectar e no carregamento da barra. Evolution lenta não pode segurar a tela.
 */
const CONFERENCIA_TIMEOUT_MS = 3_000;

/**
 * Recupera o `connection.update` perdido: pergunta à Evolution o estado real de
 * cada instância que o banco diz não estar conectada e, se a sessão está
 * `open`, grava `connected`. Só promove — derrubar continua sendo trabalho do
 * webhook de `close`, que carrega o motivo da queda.
 *
 * Devolve a lista com o status corrigido. Falha na Evolution ou no banco deixa
 * a instância como estava: a conferência nunca piora o que o painel mostraria.
 */
export async function reconciliarConexoes(instances: Instance[]): Promise<Instance[]> {
  return Promise.all(
    instances.map(async (instance) => {
      if (!precisaConferirConexao(instance)) return instance;
      const remoteName = instance.provider_instance_id as string;
      try {
        const { state } = await connectionState(remoteName, CONFERENCIA_TIMEOUT_MS);
        if (state !== "open") return instance;

        const phone = telefoneDoFetchInstances(
          await fetchInstance(remoteName, CONFERENCIA_TIMEOUT_MS).catch(() => null),
        );
        await updateInstanceStatus({
          tenantId: instance.tenant_id,
          instanceId: instance.id,
          status: "connected",
          phone,
          metadata: { lastDisconnectReason: null },
        });
        console.warn(
          `[instances/reconciliar] ${instance.id} estava "${instance.status}" com a sessão aberta na Evolution — connection.update perdido`,
        );
        await trackFunnelEvent({ tenantId: instance.tenant_id, userId: null, event: "qr_connected", onlyFirst: true });

        const agora = new Date().toISOString();
        return {
          ...instance,
          status: "connected" as const,
          qr_code: null,
          phone: phone ?? instance.phone,
          connected_at: instance.connected_at ?? agora,
          updated_at: agora,
        };
      } catch (e) {
        console.warn(`[instances/reconciliar] conferência falhou em ${instance.id}:`, e);
        return instance;
      }
    }),
  );
}
