/**
 * Decisão de roteamento de um clique em /r/:slug — função PURA, sem I/O.
 *
 * Fica separada da rota de propósito: a rota importa stores com `server-only`,
 * que quebra `tsx --test`. Aqui a lógica de rotação/cheio/cap fica testável.
 */

import { ENTRADA_DEFAULTS, isClosedAt, type EntradaSettings } from "@/lib/campaigns/settings";

/** Capacidade padrão de grupo do WhatsApp (até a engine reportar o limite real). */
export const DEFAULT_GROUP_CAPACITY = 1024;
/** Grupo é "cheio" ao atingir esta fração da capacidade (deixa folga p/ não estourar). */
export const GROUP_FULL_RATIO = 0.95;

export type ResolvableGroup = {
  whatsapp_group_id: string;
  /** Nome do grupo no WhatsApp — a tela de entrada mostra "você vai entrar em …". */
  name?: string;
  members: number;
  capacity: number;
  invite_url?: string | null;
  /**
   * Se a conta conectada administra o grupo. Opcional porque grupo gravado
   * antes da coluna existir não tem o campo — e `undefined` não bloqueia.
   */
  is_admin?: boolean | null;
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
  /** Há grupos no pool, mas nenhum é administrado por um número nosso. */
  | "no-admin"
  /** Todos os grupos com convite já bateram ~95% da capacidade. */
  | "all-full"
  /** Campanha passou de `encerra_em` (fim do dia em Brasília). */
  | "closed";

export type ClickTarget =
  | { kind: "redirect"; url: string; groupId?: string; groupName?: string; pixelId?: string }
  | { kind: "blocked"; reason: BlockedReason };

/** Convite utilizável: `Response.redirect` estoura em URL relativa/lixo. */
export function isUsableInvite(url: string | null | undefined): boolean {
  return typeof url === "string" && /^https?:\/\/\S+$/i.test(url);
}

/**
 * Grupo está disponível p/ receber gente: administramos, tem convite e ainda
 * não atingiu 95% da capacidade.
 *
 * `is_admin === false` bloqueia porque mandar o cliente da loja para um grupo
 * de terceiro é o pior desfecho possível do link: lá nada é capturado, nada é
 * disparado, e a lista vira audiência de outra pessoa. `undefined` passa — é
 * grupo gravado antes da coluna existir, não uma negativa.
 */
export function isGroupAvailable(g: ResolvableGroup): boolean {
  if (g.is_admin === false) return false;
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
  // Antes de "no-invite": um pool inteiro de grupo alheio não é falta de
  // convite nem grupo cheio, e dizer "está cheio" mandaria o lojista procurar
  // o problema no lugar errado.
  if (pool.every((g) => g.is_admin === false)) return "no-admin";
  if (pool.every((g) => !isUsableInvite(g.invite_url))) return "no-invite";
  return "all-full";
}

/**
 * Grupo lembrado pelo cookie: vence MESMO lotado (quem clicou uma vez quase
 * sempre já está dentro; mandar para outro é o que fabrica duplicata). Só cai
 * na rotação se saiu da campanha, perdeu o convite ou não é mais nosso.
 */
function rememberedGroup(
  id: string | null | undefined,
  groupIds: readonly string[],
  groups: readonly ResolvableGroup[],
): ResolvableGroup | null {
  if (!id || !groupIds.includes(id)) return null;
  const g = groups.find((x) => x.whatsapp_group_id === id);
  if (!g || g.is_admin === false || !isUsableInvite(g.invite_url)) return null;
  return g;
}

/**
 * Para onde este clique vai. Link mestre de campanha rotaciona pelo pool
 * (respeitando encerramento e grupo lembrado); link comum vai pro destino fixo
 * respeitando o teto de cliques.
 */
export function resolveClickTarget(input: {
  link: ResolvableLink;
  campaign: { group_ids: string[] } | null;
  groups: readonly ResolvableGroup[];
  entrada?: EntradaSettings;
  rememberedGroupId?: string | null;
  now?: Date;
}): ClickTarget {
  const { link, campaign, groups } = input;

  // 1) Link MESTRE de campanha → grupo lembrado ou próximo disponível do pool.
  if (link.campaign_group_id) {
    // Campanha sumiu (ou o link ficou órfão): trata como pool vazio, nunca redireciona.
    if (!campaign) return { kind: "blocked", reason: "empty-pool" };
    const entrada = input.entrada ?? ENTRADA_DEFAULTS;
    if (isClosedAt(entrada.encerra_em, input.now ?? new Date())) return { kind: "blocked", reason: "closed" };
    const remembered = entrada.um_grupo_por_pessoa
      ? rememberedGroup(input.rememberedGroupId, campaign.group_ids, groups)
      : null;
    const target = remembered ?? nextAvailableGroup(campaign.group_ids, groups);
    if (!target) return { kind: "blocked", reason: diagnosePool(campaign.group_ids, groups) };
    return {
      kind: "redirect",
      url: target.invite_url!,
      groupId: target.whatsapp_group_id,
      // Só quando existe: chave `undefined` mudaria a forma que os testes de
      // rotação comparam com deepEqual estrito.
      ...(target.name ? { groupName: target.name } : {}),
      pixelId: readPixelId(link.metadata),
    };
  }

  // 2) Link comum → destino fixo, respeitando o teto ("grupo cheio").
  const cap = readClickCap(link.metadata);
  if (cap !== null && link.clicks >= cap) return { kind: "blocked", reason: "cap-reached" };
  return { kind: "redirect", url: link.target_url, pixelId: readPixelId(link.metadata) };
}
