/**
 * Revisão de link de convite — a DECISÃO, pura e sem rede.
 *
 * O worker não decide nada aqui: ele devolve o que leu na Evolution (ou o erro
 * cru com o status HTTP) e esta função compara com o que está guardado. A
 * separação é de propósito — o `invite_url` guardado mora do lado do banco, e
 * `classifyInviteFailure` (que já sabe ler o vocabulário de erro da Evolution)
 * também. Mandar essas duas coisas para dentro do worker seria duplicá-las.
 *
 * Fica fora de `lib/stores/` porque as stores começam com `import "server-only"`,
 * que quebra sob `tsx --test`. Mesmo arranjo de `invite-backfill.ts`.
 */

import { classifyInviteFailure } from "@/lib/groups/invite-backfill";
import { normalizeInviteUrl } from "@/lib/groups/invite-url";

export type InviteVerdict = "same" | "changed" | "broken";

export type InviteReviewInput = {
  /** `groups.invite_url` como está no banco. */
  guardado: string | null | undefined;
  /** O que o worker leu. `null` = a Evolution respondeu sem convite utilizável. */
  lido?: string | null;
  /** Presente só quando a leitura falhou. `status` 0 = não chegou na Evolution. */
  falha?: { status: number; detail?: string | null };
};

/**
 * `grava: false` é o caso que impede a mentira: a revisão NÃO aconteceu, então
 * nada é escrito em `groups`. Marcar `broken` numa queda de rede diria ao
 * lojista que o grupo está quebrado quando o problema era a Evolution.
 */
export type InviteReviewOutcome =
  | { grava: true; verdict: InviteVerdict; inviteUrl?: string }
  | { grava: false; motivo: string };

export function decideInviteReview(input: InviteReviewInput): InviteReviewOutcome {
  if (input.falha) {
    const falha = classifyInviteFailure(input.falha);
    // Passageiro (rede, 5xx) não é veredito: é a revisão não ter acontecido.
    if (falha.verdict === "transient") return { grava: false, motivo: falha.reason };
    return { grava: true, verdict: "broken" };
  }

  // Resposta 200 sem convite utilizável é tão "quebrado" quanto um 403: o
  // resultado para o lojista é o mesmo — não há link para divulgar.
  const lido = input.lido ? normalizeInviteUrl(input.lido) : null;
  if (!lido) return { grava: true, verdict: "broken" };

  // Compara a forma CANÔNICA dos dois lados. Um convite guardado em formato
  // antigo (`chat.whatsapp.com/invite/XXX`, ou só o código) aponta para o mesmo
  // lugar que a forma nova; comparar string crua marcaria "trocado" para sempre
  // num link que nunca mudou.
  const guardado = input.guardado ? normalizeInviteUrl(input.guardado) : null;
  if (guardado === lido) return { grava: true, verdict: "same" };

  return { grava: true, verdict: "changed", inviteUrl: lido };
}

/** Só o que o resumo precisa de um grupo. */
export type GrupoRevisado = {
  invite_check?: InviteVerdict | null;
  invite_checked_at?: string | null;
};

export type RevisaoResumo = {
  iguais: number;
  trocados: number;
  quebrados: number;
  /** Nunca revisado é DIFERENTE de quebrado — ver o CHECK da coluna. */
  naoRevisados: number;
  /** ISO da revisão mais recente, ou `null` se nunca houve nenhuma. */
  ultimaRevisao: string | null;
};

export function resumoRevisao(grupos: readonly GrupoRevisado[]): RevisaoResumo {
  const resumo: RevisaoResumo = {
    iguais: 0,
    trocados: 0,
    quebrados: 0,
    naoRevisados: 0,
    ultimaRevisao: null,
  };

  for (const g of grupos) {
    if (g.invite_check === "same") resumo.iguais += 1;
    else if (g.invite_check === "changed") resumo.trocados += 1;
    else if (g.invite_check === "broken") resumo.quebrados += 1;
    else resumo.naoRevisados += 1;

    const em = g.invite_checked_at;
    if (em && (resumo.ultimaRevisao === null || em > resumo.ultimaRevisao)) {
      resumo.ultimaRevisao = em;
    }
  }

  return resumo;
}

/**
 * Ritmo de D7: 10 leituras a cada 10 min = UMA por minuto, por tenant.
 *
 * A constante existe para a tela dar um ETA que bate com a realidade. O lote de
 * identidade corre a ~15/min; usar aquele número aqui prometeria 6 minutos para
 * uma revisão de 91 grupos que leva uma hora e meia.
 */
export const LEITURAS_POR_MINUTO = 1;

export function etaRevisaoMin(grupos: number): number {
  return Math.max(1, Math.ceil(grupos / LEITURAS_POR_MINUTO));
}

/** "≈ 45 min" / "≈ 1 h 31" — honestidade legível, não precisão falsa. */
export function formataEta(minutos: number): string {
  if (minutos < 60) return `≈ ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto === 0 ? `≈ ${horas} h` : `≈ ${horas} h ${resto}`;
}
