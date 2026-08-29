// Proteção do ativo — regras puras, sem `server-only`, testáveis isoladas
// (mesmo padrão de instance-health.ts).
//
// O ativo do lojista não é o número: é a LISTA. Um número banido se recompra em
// uma tarde; um grupo de 900 clientes sem nenhum administrador operável não se
// recupera — o WhatsApp não tem endpoint que devolva a administração de um
// grupo órfão, e não há como reextrair os membros de fora.
//
// Por isso `groups.is_admin` sozinho não basta. Ele responde "meu número
// administra este grupo?", e a pergunta que decide se o ativo sobrevive é
// outra: "existe alguém ALÉM do meu número administrando?".

import { jidDigits } from "@/lib/evolution/admin-group";

/** Colunas de contagem, como vêm de `public.groups`. */
export type AdminCount = {
  is_admin?: boolean | null;
  admins_total?: number | null;
  admins_ours?: number | null;
  /** Nulo = nunca medimos. O 0 das outras colunas é default, não fato. */
  admins_counted_at?: string | null;
};

export type ProtectionLevel =
  /** Nunca contamos os admins deste grupo — não afirmamos nada sobre ele. */
  | "nao_medido"
  /** Um único administrador no grupo. Se ele cair, a lista fica órfã. */
  | "sem_backup"
  /** Existe admin além do nosso número (o sócio, a vendedora). */
  | "backup_humano"
  /** Dois ou mais números nossos administram — redundância própria. */
  | "backup_proprio";

/**
 * Nível de proteção de UM grupo administrado.
 *
 * `sem_backup` cobre tanto "só o nosso número administra" quanto "nenhum admin
 * detectado": os dois terminam no mesmo lugar se o número cair, e distingui-los
 * na tela só acrescentaria uma categoria que o lojista não sabe o que fazer com.
 */
export function protectionOf(group: AdminCount): ProtectionLevel {
  if (!group.admins_counted_at) return "nao_medido";

  const total = Math.max(0, group.admins_total ?? 0);
  const ours = Math.max(0, group.admins_ours ?? 0);

  // O total manda. Um `ours` maior que o total só aparece por delta fora de
  // ordem, e nesse caso quem decide é o número de administradores do grupo —
  // não quantos deles achamos que são nossos.
  if (total <= 1) return "sem_backup";
  return ours >= 2 ? "backup_proprio" : "backup_humano";
}

/** O que a tela precisa saber de cada grupo em risco. */
export type GroupAtRisk = {
  id: string;
  name: string;
  members: number;
};

export type ProtectionSummary = {
  /** Grupos que o nosso número administra (os únicos em escopo). */
  administrados: number;
  /** Destes, quantos já foram contados. */
  medidos: number;
  /** Contados e com um único administrador. */
  semBackup: number;
  /** Contados e com pelo menos um admin além do nosso número. */
  comBackup: number;
  /** Ainda não contados — a tela diz "sincronize", não "está em risco". */
  naoMedidos: number;
  /**
   * Soma dos membros dos grupos sem backup. É o tamanho do prejuízo em pessoas,
   * que é como o lojista pensa no assunto — não em "12 grupos".
   */
  membrosEmRisco: number;
  /** Os grupos sem backup, do maior para o menor. */
  emRisco: GroupAtRisk[];
};

type GroupRow = AdminCount & {
  id?: string | null;
  whatsapp_group_id?: string | null;
  name?: string | null;
  members?: number | null;
};

/**
 * Agrega a lista de grupos do tenant no que a tela e o e-mail mostram.
 *
 * Grupos que não administramos são descartados: não é que estejam protegidos, é
 * que a pergunta não se aplica a eles.
 */
export function summarizeProtection(groups: GroupRow[], limit = 10): ProtectionSummary {
  const administrados = groups.filter((g) => g.is_admin === true);

  const emRisco: GroupAtRisk[] = [];
  let medidos = 0;
  let comBackup = 0;

  for (const g of administrados) {
    const level = protectionOf(g);
    if (level === "nao_medido") continue;

    medidos++;
    if (level === "sem_backup") {
      emRisco.push({
        id: String(g.id ?? g.whatsapp_group_id ?? ""),
        name: (g.name ?? "").trim() || "Grupo sem nome",
        members: Math.max(0, g.members ?? 0),
      });
    } else {
      comBackup++;
    }
  }

  emRisco.sort((a, b) => b.members - a.members || a.name.localeCompare(b.name, "pt-BR"));

  return {
    administrados: administrados.length,
    medidos,
    semBackup: emRisco.length,
    comBackup,
    naoMedidos: administrados.length - medidos,
    membrosEmRisco: emRisco.reduce((sum, g) => sum + g.members, 0),
    emRisco: emRisco.slice(0, limit),
  };
}

// ---------------------------------------------------------------------------
// Contagem a partir dos participantes (o sync vê a lista inteira)
// ---------------------------------------------------------------------------

export type ParticipantLike = {
  id?: string | null;
  phoneNumber?: string | null;
  admin?: string | null;
};

const ADMIN_ROLES = new Set(["admin", "superadmin"]);

function isAdminRole(participant: ParticipantLike): boolean {
  return ADMIN_ROLES.has(String(participant?.admin ?? ""));
}

/** Normaliza os telefones nossos para comparação por dígitos. */
function ourDigits(ourPhones: (string | null | undefined)[]): Set<string> {
  const set = new Set<string>();
  for (const phone of ourPhones) {
    const digits = jidDigits(phone) || String(phone ?? "").replace(/\D/g, "");
    if (digits) set.add(digits);
  }
  return set;
}

function isOurs(participant: ParticipantLike, ours: Set<string>): boolean {
  // `phoneNumber` é o campo confiável; `id` costuma ser `@lid`, que nunca
  // casaria com um telefone (mesma razão documentada em admin-group.ts).
  const byPhone = jidDigits(participant?.phoneNumber);
  const byId = jidDigits(participant?.id);
  return (byPhone !== "" && ours.has(byPhone)) || (byId !== "" && ours.has(byId));
}

export type AdminTally = { total: number; ours: number };

/**
 * Conta os administradores de um grupo a partir da lista COMPLETA de
 * participantes — o que só o sync tem (`fetchAllGroups?getParticipants=true`).
 */
export function tallyAdmins(
  participants: ParticipantLike[] | null | undefined,
  ourPhones: (string | null | undefined)[],
): AdminTally {
  const ours = ourDigits(ourPhones);
  let total = 0;
  let mine = 0;

  for (const p of participants ?? []) {
    if (!isAdminRole(p)) continue;
    total++;
    if (isOurs(p, ours)) mine++;
  }

  return { total, ours: mine };
}

// ---------------------------------------------------------------------------
// Delta a partir do webhook (mantém a contagem viva sem polling)
// ---------------------------------------------------------------------------

export type AdminCountDelta = { total: number; ours: number };

const NO_CHANGE: AdminCountDelta = { total: 0, ours: 0 };

/**
 * Quanto a contagem de admins muda com UM evento `group-participants.update`.
 *
 * O payload traz só os participantes AFETADOS, nunca a lista inteira — por isso
 * aqui é delta, e não recontagem. O sync é quem recalibra.
 *
 * Ações e o que fazemos com cada uma:
 *
 * - `promote` / `demote`: a semântica é inequívoca, o delta é ±1 por
 *   participante afetado.
 * - `remove`: só conta quando o payload marca o removido como admin. Quando não
 *   marca, não sabemos se saiu um administrador ou um membro comum, e os dois
 *   erros custam diferente: decrementar sempre inventaria risco em todo grupo de
 *   onde alguém sai (o evento mais comum do produto), enquanto não decrementar
 *   apenas deixa a contagem envelhecer até o próximo sync — e a tela mostra a
 *   idade dela.
 * - `add`: entra como membro comum. Ninguém vira admin ao entrar.
 *
 * Participantes repetidos no mesmo payload são contados uma vez só.
 */
export function adminCountDelta(
  action: string,
  participants: ParticipantLike[] | null | undefined,
  ourPhones: (string | null | undefined)[],
): AdminCountDelta {
  const normalized = String(action ?? "").toLowerCase();
  if (normalized !== "promote" && normalized !== "demote" && normalized !== "remove") {
    return NO_CHANGE;
  }

  const ours = ourDigits(ourPhones);
  const sign = normalized === "promote" ? 1 : -1;
  const seen = new Set<string>();
  let total = 0;
  let mine = 0;

  for (const p of participants ?? []) {
    // Remover quem não era admin não muda a contagem de admins.
    if (normalized === "remove" && !isAdminRole(p)) continue;

    const key = jidDigits(p?.id) || jidDigits(p?.phoneNumber) || String(p?.id ?? "");
    if (!key || seen.has(key)) continue;
    seen.add(key);

    total += sign;
    if (isOurs(p, ours)) mine += sign;
  }

  return { total, ours: mine };
}
