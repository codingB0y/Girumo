/**
 * Sugestão de cobertura: quais grupos de uma comunidade, no menor número
 * possível, alcançam `alvo` (default 95%) das pessoas únicas da comunidade.
 *
 * Guloso: a cada passo escolhe o grupo ainda não escolhido que adiciona mais
 * pessoas NOVAS (contribuição marginal, não tamanho bruto do grupo) — não é
 * ótimo global (set cover é NP-difícil), mas com ~91 grupos e ~10 mil pessoas
 * a aproximação guloga fica a poucos pontos percentuais do ótimo e roda
 * instantâneo em memória.
 *
 * Leitura, nunca ação: a plataforma nunca corta grupo sozinha — quem chama
 * decide o que fazer com o corte sugerido.
 */

export type GrupoParaCobertura = { whatsappGroupId: string; name: string };
export type ParticipanteRef = { whatsappGroupId: string; participantLid: string };
export type GrupoNoCorte = { whatsappGroupId: string; name: string; pessoasNovas: number };
export type SugestaoCobertura = {
  grupos: GrupoNoCorte[];
  pessoasCobertas: number;
  pessoasTotais: number;
  cobertura: number;
};

export const ALVO_COBERTURA = 0.95;

export function sugerirCobertura(
  grupos: GrupoParaCobertura[],
  participantes: ParticipanteRef[],
  alvo: number = ALVO_COBERTURA,
): SugestaoCobertura {
  const porGrupo = new Map<string, Set<string>>();
  for (const g of grupos) porGrupo.set(g.whatsappGroupId, new Set());
  for (const p of participantes) {
    const set = porGrupo.get(p.whatsappGroupId);
    if (set) set.add(p.participantLid);
  }

  const pessoasTotais = new Set(
    participantes.filter((p) => porGrupo.has(p.whatsappGroupId)).map((p) => p.participantLid),
  ).size;

  if (pessoasTotais === 0 || grupos.length === 0) {
    return { grupos: [], pessoasCobertas: 0, pessoasTotais, cobertura: 0 };
  }

  const restantes = new Map(grupos.map((g) => [g.whatsappGroupId, g] as const));
  const cobertas = new Set<string>();
  const escolhidos: GrupoNoCorte[] = [];

  while (cobertas.size / pessoasTotais < alvo && restantes.size > 0) {
    let melhorId: string | null = null;
    let melhorNovas = -1;
    for (const [id] of restantes) {
      const set = porGrupo.get(id) ?? new Set<string>();
      let novas = 0;
      for (const lid of set) if (!cobertas.has(lid)) novas++;
      if (novas > melhorNovas) {
        melhorNovas = novas;
        melhorId = id;
      }
    }
    if (melhorId === null || melhorNovas <= 0) break; // nenhum grupo restante acrescenta gente nova
    const grupo = restantes.get(melhorId)!;
    for (const lid of porGrupo.get(melhorId) ?? []) cobertas.add(lid);
    escolhidos.push({ whatsappGroupId: melhorId, name: grupo.name, pessoasNovas: melhorNovas });
    restantes.delete(melhorId);
  }

  return {
    grupos: escolhidos,
    pessoasCobertas: cobertas.size,
    pessoasTotais,
    cobertura: cobertas.size / pessoasTotais,
  };
}
