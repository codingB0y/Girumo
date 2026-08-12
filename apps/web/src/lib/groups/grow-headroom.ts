/**
 * Quando o pool de uma campanha merece um grupo novo.
 *
 * Fica fora do store de propósito: `group-grow-store.ts` importa `server-only`,
 * que quebra o `tsx --test`. Aqui a regra é pura e testável.
 */

/** Cria o próximo grupo quando nenhum do pool está abaixo deste enchimento. */
export const GROW_AHEAD_RATIO = 0.9;

export type PoolGroup = {
  members: number;
  capacity: number;
  inviteUrl?: string;
};

/**
 * A versão antiga desta regra era um `some(g => g.inviteUrl && g.members < cap*0.9)`
 * negado — ou seja, tratava "nenhum grupo com convite" como sinal de LOTAÇÃO. Com os
 * 194 grupos de produção sem `invite_url`, isso significava enfileirar a criação de um
 * grupo na primeira avaliação de toda campanha com auto-grow ligado: a feature nasceria
 * inventando grupo em vez de continuar o pool.
 *
 * Pool sem convite nenhum não é pool cheio — é campanha que nunca foi ligada ao `/r/`.
 * O conserto é preencher o convite (a UI do PR-1), não criar mais um grupo em cima.
 */
export function shouldEnqueueGrow(pool: PoolGroup[], declaredCount = pool.length): boolean {
  // Campanha que ainda não escolheu grupo nenhum: criar o primeiro é o caminho feliz.
  if (declaredCount === 0) return true;

  // Declarou grupo, mas nenhum id resolveu no pool: são ids órfãos (grupo apagado,
  // ou `group_ids` gravado com o uuid da linha em vez do JID — dado assim existe em
  // dev). Isso é dado quebrado, não lotação: criar grupo aqui esconderia o problema
  // e o /r/<campanha> continuaria sem rotear pra lugar nenhum.
  if (pool.length === 0) return false;

  // Só grupo com convite participa do roteamento — os outros são invisíveis pro
  // /r/<campanha> e portanto não contam nem como folga nem como lotação.
  const roteaveis = pool.filter((g) => !!g.inviteUrl);
  if (roteaveis.length === 0) return false;

  // Lotado de verdade: nenhum grupo roteável ainda tem folga.
  return !roteaveis.some((g) => hasHeadroom(g));
}

/** Grupo roteável ainda com espaço para receber gente. */
export function hasHeadroom(g: PoolGroup): boolean {
  return g.capacity > 0 && g.members < g.capacity * GROW_AHEAD_RATIO;
}
