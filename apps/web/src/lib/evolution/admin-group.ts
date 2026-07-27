/**
 * Decide se o número conectado é admin de um grupo.
 *
 * Só grupos admin alimentam captura de leads. A regra vem da engine Baileys,
 * que a documentava assim: *"NUNCA cai para todos: melhor não capturar do que
 * capturar grupo errado"*. Capturar lead de grupo alheio suja a base e é
 * problema de LGPD.
 *
 * A engine casava por LID e admitia no próprio comentário que Baileys 7 é
 * inconsistente nisso. A Evolution entrega `phoneNumber` ao lado do `@lid` em
 * cada participante, então aqui o casamento é por telefone — mais estável.
 *
 * Nota sobre `fetchAllGroups`: diferente do webhook `groups.upsert`, ele NÃO
 * devolve `ownerPn` (só `owner`, que costuma vir como `@lid`). Por isso a
 * decisão se apoia nos participantes, não no dono.
 */

export type GroupParticipantLike = {
  id?: string | null;
  phoneNumber?: string | null;
  admin?: string | null;
};

export type GroupLike = {
  owner?: string | null;
  ownerPn?: string | null;
  participants?: GroupParticipantLike[] | null;
};

const ADMIN_ROLES = new Set(["admin", "superadmin"]);

/** Dígitos de um JID/LID: `5511999990001@s.whatsapp.net` → `5511999990001`. */
export function jidDigits(value: string | null | undefined): string {
  if (!value) return "";
  const [user] = String(value).split("@");
  return (user ?? "").split(":")[0].replace(/\D/g, "");
}

/**
 * `true` se `myPhone` é admin, superadmin ou dono do grupo.
 *
 * Sem telefone conhecido devolve `false`: na dúvida, não monitora.
 */
export function isAdminGroup(group: GroupLike, myPhone: string | null | undefined): boolean {
  const mine = jidDigits(myPhone) || (myPhone ?? "").replace(/\D/g, "");
  if (!mine) return false;

  // Dono é admin por definição. `ownerPn` só existe no payload do webhook;
  // `owner` costuma ser @lid e por isso raramente casa — é bônus, não a base.
  for (const owner of [group.ownerPn, group.owner]) {
    if (owner && jidDigits(owner) === mine) return true;
  }

  return (group.participants ?? []).some((p) => {
    if (!ADMIN_ROLES.has(String(p?.admin ?? ""))) return false;
    // `phoneNumber` é o campo confiável; `id` pode ser @lid, que nunca casaria.
    return jidDigits(p?.phoneNumber) === mine || jidDigits(p?.id) === mine;
  });
}
