/**
 * Montagem do lote de ações em massa sobre grupos. Função PURA — sem Supabase,
 * sem rede.
 *
 * Fica separada da store para que a regra que decide o que entra na fila seja
 * testável sem banco. O que ela protege:
 *
 * - **Grupo sem `whatsapp_group_id` é descartado.** Enfileirar um job que não
 *   tem como ser executado só produziria uma falha garantida alguns minutos
 *   depois — e gastaria uma janela do ritmo anti-ban à toa.
 * - **`set_description` sem `description` LANÇA** em vez de virar string vazia.
 *   String vazia apaga a descrição dos grupos no WhatsApp: é uma ação legítima,
 *   mas tem de ser pedida, nunca ser o default de um campo esquecido.
 * - **Carga de outra ação é ignorada.** Um `open` que chega com `description`
 *   pendurada (sobra de formulário) grava `null`, não o texto — o job é o que a
 *   ação diz que é.
 */

export type BulkAction = "set_description" | "set_picture" | "open" | "close";

export type BulkTargetGroup = {
  id: string;
  whatsapp_group_id: string | null;
};

/** Uma linha de `group_bulk_jobs`, pronta para insert. */
export type BulkJobInsert = {
  tenant_id: string;
  campaign_group_id: string;
  batch_id: string;
  action: BulkAction;
  group_id: string;
  whatsapp_group_id: string;
  description: string | null;
  media_id: string | null;
};

export type BuildBulkJobsInput = {
  tenantId: string;
  campaignGroupId: string;
  batchId: string;
  action: BulkAction;
  groups: readonly BulkTargetGroup[];
  description?: string | null;
  mediaId?: string | null;
};

export function buildBulkJobs(input: BuildBulkJobsInput): BulkJobInsert[] {
  const { action } = input;

  if (action === "set_description" && typeof input.description !== "string") {
    throw new Error("A descrição é obrigatória para aplicar descrição em massa.");
  }
  if (action === "set_picture" && !input.mediaId) {
    throw new Error("A imagem é obrigatória para aplicar foto em massa.");
  }

  const description = action === "set_description" ? (input.description as string) : null;
  const mediaId = action === "set_picture" ? (input.mediaId as string) : null;

  return input.groups
    .filter((g): g is BulkTargetGroup & { whatsapp_group_id: string } =>
      Boolean(g.whatsapp_group_id),
    )
    .map((g) => ({
      tenant_id: input.tenantId,
      campaign_group_id: input.campaignGroupId,
      batch_id: input.batchId,
      action,
      group_id: g.id,
      whatsapp_group_id: g.whatsapp_group_id,
      description,
      media_id: mediaId,
    }));
}
