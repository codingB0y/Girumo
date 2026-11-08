import { chaveDoTelefone } from "@/lib/pages/phone";

/**
 * Quem a sincronização de grupos encontrou pela primeira vez e deve virar lead.
 *
 * O caminho normal é o aviso de entrada da Evolution (`group-participants.update`,
 * no worker). Em 05/11 ele parou de chegar para um número inteiro e os leads
 * sumiram em silêncio — a sincronização via as pessoas entrando e ninguém virava
 * lead. Aqui a sync passa a cobrir esse buraco: quem aparece num grupo pela
 * primeira vez vira lead mesmo que o aviso nunca tenha chegado. Quando o aviso
 * chega, os dois caem no mesmo `upsert_lead`, que deduplica pelo telefone.
 *
 * Mesmas regras da captura pelo aviso (`apps/worker/src/lead-capture.ts`): só
 * grupo que administramos (a sync só lê esses), opt-out bloqueia a captura.
 * Duas a mais, por serem próprias da sync:
 * - grupo sem nenhum participante gravado antes fica de fora. É a primeira
 *   leitura dele, e todo mundo ali já estava no grupo antes de chegarmos —
 *   transformar a base antiga inteira em lead "de hoje" seria mentir;
 * - admin fica de fora: é a equipe da loja, não quem entrou pelo anúncio.
 * E sem telefone (só `@lid`) também: sem chave, cada sync criaria outro lead.
 */

export type ParticipanteDoSync = {
  participantLid: string;
  phone: string | null;
  isAdmin: boolean;
};

export type GrupoDoSync = {
  whatsappGroupId: string;
  nome: string;
  participantes: ParticipanteDoSync[];
};

export type LeadDoSync = {
  phone: string;
  whatsappGroupId: string;
  nomeDoGrupo: string;
};

/**
 * Mais que isso num sync só é defeito, não entrada: o pior dia real medido foi
 * 85 num grupo depois de 24h sem aviso. Um bug de leitura que faça a base antiga
 * parecer nova (07/11: 639 de uma vez) tem que parar aqui, não virar lead.
 */
export const TETO_DE_LEADS_POR_SYNC = 300;

export function leadsNovosDoSync(
  grupos: GrupoDoSync[],
  /** `participant_lid` já gravados, por grupo, ANTES deste sync gravar os dele. */
  jaVistos: Map<string, Set<string>>,
  /** Chaves de opt-out (`chaveDoTelefone`). */
  optouts: Set<string>,
): LeadDoSync[] {
  const leads: LeadDoSync[] = [];
  for (const g of grupos) {
    const vistos = jaVistos.get(g.whatsappGroupId);
    if (!vistos || vistos.size === 0) continue;

    for (const p of g.participantes) {
      if (vistos.has(p.participantLid) || p.isAdmin || !p.phone) continue;
      const chave = chaveDoTelefone(p.phone.replace(/\D/g, ""));
      if (!chave || optouts.has(chave)) continue;
      leads.push({ phone: p.phone, whatsappGroupId: g.whatsappGroupId, nomeDoGrupo: g.nome });
    }
  }
  return leads;
}
