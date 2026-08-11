/**
 * Decisão de roteamento de um clique em /r/:slug — função PURA, sem I/O.
 *
 * Fica separada da rota de propósito: a rota importa stores com `server-only`,
 * que quebra `tsx --test`. Aqui a lógica de rotação/cheio/cap fica testável.
 */

/** Capacidade padrão de grupo do WhatsApp (até a engine reportar o limite real). */
export const DEFAULT_GROUP_CAPACITY = 1024;
/** Grupo é "cheio" ao atingir esta fração da capacidade (deixa folga p/ não estourar). */
export const GROUP_FULL_RATIO = 0.95;

export type ResolvableGroup = {
  whatsapp_group_id: string;
  members: number;
  capacity: number;
  invite_url?: string | null;
};

export type ResolvableLink = {
  /** Preenchido = link MESTRE de campanha (destino rotativo). Nulo = destino fixo. */
  campaign_group_id: string | null;
  target_url: string;
  clicks: number;
  metadata: Record<string, unknown>;
};

export type BlockedReason =
  /** Link de destino fixo atingiu o teto de cliques configurado. */
  | "cap-reached"
  /** Campanha existe mas não tem nenhum grupo no pool. */
  | "empty-pool"
  /** Há grupos no pool, mas nenhum tem convite configurado no painel. */
  | "no-invite"
  /** Todos os grupos com convite já bateram ~95% da capacidade. */
  | "all-full";

export type ClickTarget =
  | { kind: "redirect"; url: string; groupId?: string; pixelId?: string }
  | { kind: "blocked"; reason: BlockedReason };

/** Convite utilizável: `Response.redirect` estoura em URL relativa/lixo. */
export function isUsableInvite(url: string | null | undefined): boolean {
  return typeof url === "string" && /^https?:\/\/\S+$/i.test(url);
}

/** Grupo está disponível p/ receber gente: tem convite e ainda não atingiu 95% da capacidade. */
export function isGroupAvailable(g: ResolvableGroup): boolean {
  const capacity = g.capacity > 0 ? g.capacity : DEFAULT_GROUP_CAPACITY;
  return isUsableInvite(g.invite_url) && g.members < capacity * GROUP_FULL_RATIO;
}

/**
 * Próximo grupo DISPONÍVEL na ordem do pool (preenchimento sequencial = "lota sozinho":
 * enche o 1º até ~95%, transborda pro próximo). Pula cheios e os sem convite.
 *
 * `groupIds` guarda `whatsapp_group_id` (ex.: `1203...@g.us`), não o uuid da tabela.
 */
export function nextAvailableGroup(
  groupIds: readonly string[],
  groups: readonly ResolvableGroup[],
): ResolvableGroup | null {
  const byWhatsappId = new Map(groups.map((g) => [g.whatsapp_group_id, g]));
  for (const id of groupIds) {
    const g = byWhatsappId.get(id);
    if (g && isGroupAvailable(g)) return g;
  }
  return null;
}

/** Teto de cliques humanos gravado em `metadata.clickCap` pela criação do link. */
export function readClickCap(metadata: Record<string, unknown>): number | null {
  const raw = Number(metadata?.clickCap);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : null;
}

/** Pixel do Facebook em `metadata.pixelId` — só aceita id numérico plausível. */
export function readPixelId(metadata: Record<string, unknown>): string | undefined {
  const raw = String(metadata?.pixelId ?? "");
  return /^\d{5,20}$/.test(raw) ? raw : undefined;
}

/** Por que o pool não rendeu nenhum grupo — separa "cheio" de "nem configurado". */
function diagnosePool(groupIds: readonly string[], groups: readonly ResolvableGroup[]): BlockedReason {
  if (groupIds.length === 0) return "empty-pool";
  const byWhatsappId = new Map(groups.map((g) => [g.whatsapp_group_id, g]));
  const pool = groupIds.map((id) => byWhatsappId.get(id)).filter((g): g is ResolvableGroup => !!g);
  if (pool.length === 0) return "empty-pool";
  if (pool.every((g) => !isUsableInvite(g.invite_url))) return "no-invite";
  return "all-full";
}

/**
 * Para onde este clique vai. Link mestre de campanha rotaciona pelo pool;
 * link comum vai pro destino fixo respeitando o teto de cliques.
 */
export function resolveClickTarget(input: {
  link: ResolvableLink;
  campaign: { group_ids: string[] } | null;
  groups: readonly ResolvableGroup[];
}): ClickTarget {
  const { link, campaign, groups } = input;

  // 1) Link MESTRE de campanha → próximo grupo disponível do pool.
  if (link.campaign_group_id) {
    // Campanha sumiu (ou o link ficou órfão): trata como pool vazio, nunca redireciona.
    if (!campaign) return { kind: "blocked", reason: "empty-pool" };
    const target = nextAvailableGroup(campaign.group_ids, groups);
    if (!target) return { kind: "blocked", reason: diagnosePool(campaign.group_ids, groups) };
    return {
      kind: "redirect",
      url: target.invite_url!,
      groupId: target.whatsapp_group_id,
      pixelId: readPixelId(link.metadata),
    };
  }

  // 2) Link comum → destino fixo, respeitando o teto ("grupo cheio").
  const cap = readClickCap(link.metadata);
  if (cap !== null && link.clicks >= cap) return { kind: "blocked", reason: "cap-reached" };
  return { kind: "redirect", url: link.target_url, pixelId: readPixelId(link.metadata) };
}
