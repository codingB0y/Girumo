import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export type Group = {
  id: string;
  tenant_id: string;
  whatsapp_group_id: string;
  name: string;
  display_name_base?: string;
  display_number?: number;
  members: number;
  capacity: number;
  selected: boolean;
  engagement: "alto" | "medio" | "baixo";
  /** Se a conta conectada é admin do grupo. Só grupo admin entra em sync/disparo. */
  is_admin?: boolean;
  /**
   * Proteção do ativo: quantos administradores o grupo tem e quantos são
   * números nossos. Só valem quando `admins_counted_at` não é nulo — o 0 é
   * default de coluna, não medição (ver lib/groups/admin-protection.ts).
   */
  admins_total?: number;
  admins_ours?: number;
  admins_counted_at?: string | null;
  invite_url?: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const TABLE = "groups";

export async function listGroups(tenantId: string): Promise<Group[]> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("*")
    .eq("tenant_id", tenantId)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}
/**
 * O que um sync pode gravar. Só `whatsapp_group_id`, `name` e `members` são
 * obrigatórios — o resto é configuração do painel e fica opcional de propósito:
 * mandar `selected`/`engagement`/`capacity` fixos em todo sync sobrescreve o que
 * o lojista configurou (o ON CONFLICT só atualiza coluna presente no payload).
 */
export type GroupUpsert = Pick<Group, "whatsapp_group_id" | "name" | "members"> &
  Partial<
    Pick<
      Group,
      | "capacity"
      | "selected"
      | "engagement"
      | "invite_url"
      | "display_name_base"
      | "display_number"
      // `is_admin` é fato do WhatsApp, não config do painel — quem normalmente o
      // grava é `syncGroupsFromProvider`. Está aqui, opcional, para o auto-grow:
      // ao criar o grupo nós SOMOS o admin por definição, e essa é a única via
      // que também grava o `invite_url` do grupo recém-criado. Continua opcional
      // para que nenhum outro chamador o sobrescreva sem querer.
      | "is_admin"
    >
  > & {
    id?: string;
  };

export async function upsertGroupsBatch(tenantId: string, groups: GroupUpsert[]): Promise<Group[]> {
  if (groups.length === 0) return [];
  const rows = groups.map((g) => ({ ...g, tenant_id: tenantId }));
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(rows, { onConflict: "tenant_id,whatsapp_group_id" })
    .select("*");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/**
 * Sync vindo do provedor (Evolution `fetchAllGroups`).
 *
 * Grava SÓ o que o WhatsApp é dono: id do grupo, nome, nº de membros, se somos
 * admin e a contagem de administradores. Os campos configurados no painel
 * (`selected`, `capacity`, `engagement`, `invite_url`) ficam de fora do payload
 * de propósito — o ON CONFLICT só atualiza colunas presentes, então um sync não
 * apaga a seleção do lojista. Em linha nova, o default da tabela cobre cada um.
 *
 * O sync é a fonte da verdade da contagem: só ele vê a lista inteira de
 * participantes. O webhook `group-participants.update` apenas a mantém viva
 * entre um sync e outro, aplicando deltas.
 */
export async function syncGroupsFromProvider(
  tenantId: string,
  groups: Array<{
    whatsapp_group_id: string;
    name: string;
    members: number;
    is_admin: boolean;
    admins_total: number;
    admins_ours: number;
    admins_counted_at: string;
  }>,
): Promise<number> {
  if (groups.length === 0) return 0;
  const rows = groups.map((g) => ({ ...g, tenant_id: tenantId }));
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(rows, { onConflict: "tenant_id,whatsapp_group_id" })
    .select("id");
  if (error) throw new Error(error.message);
  return data?.length ?? 0;
}

export async function updateGroup(tenantId: string, id: string, patch: Partial<Group>): Promise<Group | null> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { tenant_id, created_at, ...safePatch } = patch as Record<string, unknown>;
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update(safePatch)
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/**
 * Aplica um delta relativo na contagem de administradores de um grupo.
 *
 * Delega para a RPC `apply_group_admin_delta` porque a soma tem que acontecer
 * dentro do UPDATE: ler-somar-escrever daqui perderia eventos concorrentes de
 * um grupo movimentado.
 *
 * No-op deliberado quando o grupo ainda não foi sincronizado — a RPC exige
 * `admins_counted_at is not null`. Somar deltas em cima de um zero que nunca
 * foi medido produziria um número inventado.
 */
export async function applyAdminCountDelta(
  tenantId: string,
  whatsappGroupId: string,
  delta: { total: number; ours: number },
): Promise<void> {
  if (delta.total === 0 && delta.ours === 0) return;

  const { error } = await getSupabaseAdmin().rpc("apply_group_admin_delta", {
    target_tenant_id: tenantId,
    target_group_id: whatsappGroupId,
    delta_total: delta.total,
    delta_ours: delta.ours,
  });
  if (error) throw new Error(error.message);
}

/**
 * Colunas mínimas para o resumo de proteção do ativo.
 *
 * Select enxuto de propósito: `listGroups` traz `metadata` (jsonb) de cada uma
 * das centenas de linhas, e nada disso é usado aqui.
 */
export async function listGroupsForProtection(tenantId: string) {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("id, name, members, is_admin, admins_total, admins_ours, admins_counted_at")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return data ?? [];
}
