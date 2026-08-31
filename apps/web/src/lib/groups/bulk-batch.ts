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

/** Um grupo da store, como candidato a alvo do lote. */
export type BulkCandidateGroup = {
  id: string;
  whatsapp_group_id: string | null;
  is_admin?: boolean | null;
};

export type BulkTargetSelection = {
  targets: BulkTargetGroup[];
  /** Grupos da campanha onde não somos admin. */
  skippedNoAdmin: number;
  /** Ids da campanha sem grupo correspondente (ou grupo sem id do WhatsApp). */
  skippedNoId: number;
};

/**
 * Decide quais grupos da campanha entram no lote.
 *
 * Só entra grupo onde SOMOS admin: trocar foto, descrição ou o modo de envio é
 * operação de administrador, então enfileirar os outros produziria falha
 * garantida — e cada falha ainda gastaria uma janela de 4s do ritmo anti-ban.
 * As duas contagens não são cosméticas: são o que a tela mostra como
 * "aplicar em 91 dos 196 grupos", para o lojista não achar que o lote cobriu
 * tudo.
 *
 * `groupIds` vem de `campaign_groups.group_ids`, que guarda `whatsapp_group_id`
 * — nunca o UUID de `groups`.
 */
export function selectBulkTargets(
  groupIds: readonly string[],
  groups: readonly BulkCandidateGroup[],
): BulkTargetSelection {
  const porWhatsappId = new Map<string, BulkCandidateGroup>();
  for (const group of groups) {
    if (group.whatsapp_group_id) porWhatsappId.set(group.whatsapp_group_id, group);
  }

  const targets: BulkTargetGroup[] = [];
  let skippedNoAdmin = 0;
  let skippedNoId = 0;

  for (const whatsappGroupId of new Set(groupIds)) {
    const group = porWhatsappId.get(whatsappGroupId);
    if (!group?.whatsapp_group_id) {
      skippedNoId += 1;
      continue;
    }
    if (group.is_admin !== true) {
      skippedNoAdmin += 1;
      continue;
    }
    targets.push({ id: group.id, whatsapp_group_id: group.whatsapp_group_id });
  }

  return { targets, skippedNoAdmin, skippedNoId };
}

export type PlanIdentityInput = {
  tenantId: string;
  campaignGroupId: string;
  batchId: string;
  targets: readonly BulkTargetGroup[];
  description?: string | null;
  mediaId?: string | null;
  /** Consentimento explícito para apagar a descrição de todos os grupos. */
  confirmClear?: boolean;
};

/**
 * Monta o lote de identidade: foto e descrição sob o MESMO `batch_id`.
 *
 * Um lote só porque uma aplicação é um evento só para o lojista — a barra diz
 * "aplicando identidade, 47 de 182", não duas barras correndo em ritmos
 * diferentes na mesma fila.
 *
 * A trava do vazio é aqui, e não só na tela: string vazia apaga a descrição de
 * todos os grupos no WhatsApp. É ação legítima e tem de continuar possível —
 * mas pedida, nunca o efeito colateral de um campo esquecido ou de um `fetch`
 * escrito à mão.
 */
export function planIdentityJobs(input: PlanIdentityInput): BulkJobInsert[] {
  const temDescricao = typeof input.description === "string";
  const temFoto = Boolean(input.mediaId);

  if (!temDescricao && !temFoto) {
    throw new Error("Informe uma descrição, uma imagem, ou as duas.");
  }
  if (temDescricao && input.description === "" && input.confirmClear !== true) {
    throw new Error(
      "Descrição vazia apaga a descrição de todos os grupos. Confirme para continuar.",
    );
  }

  const comum = {
    tenantId: input.tenantId,
    campaignGroupId: input.campaignGroupId,
    batchId: input.batchId,
    groups: input.targets,
  };

  const jobs: BulkJobInsert[] = [];
  if (temDescricao) {
    jobs.push(
      ...buildBulkJobs({ ...comum, action: "set_description", description: input.description }),
    );
  }
  if (temFoto) {
    jobs.push(...buildBulkJobs({ ...comum, action: "set_picture", mediaId: input.mediaId }));
  }
  return jobs;
}

/**
 * Grava a identidade aplicada no `grow_template` da campanha — a herança.
 *
 * MERGE, nunca replace: `parseGrowTemplate` (em `group-grow-store.ts`) devolve
 * `null` quando falta `subjectPattern`, e um template nulo desliga o auto-grow.
 * Trocar o objeto inteiro por `{ desc, mediaId }` pararia a criação de grupos da
 * campanha sem erro nenhum aparecer na tela.
 */
export function mergeGrowIdentity(
  current: Record<string, unknown> | null,
  identity: { description?: string | null; mediaId?: string | null },
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...(current ?? {}) };
  if (typeof identity.description === "string") merged.desc = identity.description;
  if (identity.mediaId) merged.mediaId = identity.mediaId;
  return merged;
}
