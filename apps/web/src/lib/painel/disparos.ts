import type { Group } from "@/lib/mock-data";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";

/**
 * Regras puras da tela de Disparos da Vitrine Aberta (cena 2 da seção 11 da
 * spec 2026-09-07-painel-vitrine-aberta-telas.md).
 *
 * A conta do alcance mora aqui e em nenhum outro lugar: o rótulo do botão, a
 * linha de aviso e a prévia falam do MESMO número. Duas contas do mesmo valor
 * no cliente já produziram duas verdades na tela antes (valor do pedido, PR 6).
 */

export type Alcance = {
  /** Grupos da campanha que existem na lista carregada. */
  grupos: number;
  /** Soma dos membros desses grupos. */
  pessoas: number;
  /** Grupos da campanha que não apareceram na lista (some da conta de pessoas). */
  desconhecidos: number;
};

const ALCANCE_VAZIO: Alcance = { grupos: 0, pessoas: 0, desconhecidos: 0 };

/**
 * Quantos grupos e quantas pessoas o post alcança.
 *
 * `groupIds` da campanha casa tanto por id interno quanto por `whatsappGroupId`:
 * em produção o alvo é gravado pelo id do WhatsApp, mas o seed de dev guarda o
 * UUID (ver memória `finding-group-ids-casa-por-whatsapp-id`).
 */
export function alcance(grupos: readonly Group[], groupIds: readonly string[] | undefined): Alcance {
  if (!groupIds || groupIds.length === 0) return ALCANCE_VAZIO;

  const porChave = new Map<string, Group>();
  for (const g of grupos) {
    porChave.set(g.id, g);
    if (g.whatsappGroupId) porChave.set(g.whatsappGroupId, g);
  }

  const achados = new Set<Group>();
  let desconhecidos = 0;
  for (const alvo of groupIds) {
    const g = porChave.get(alvo);
    if (g) achados.add(g);
    else desconhecidos += 1;
  }

  let pessoas = 0;
  for (const g of achados) pessoas += Math.max(0, g.members ?? 0);

  return { grupos: achados.size, pessoas, desconhecidos };
}

const numeroBR = new Intl.NumberFormat("pt-BR");

/** "13 grupos" / "1 grupo" — o plural certo em toda a tela. */
export function frasePlural(n: number, singular: string, plural: string): string {
  return `${numeroBR.format(n)} ${n === 1 ? singular : plural}`;
}

/**
 * "Vai pra 13 grupos · 9.736 pessoas veem" (cena 2).
 *
 * Sem grupos a frase vira instrução, não um zero decorativo. Quando parte dos
 * alvos não está na lista carregada, a contagem de pessoas está incompleta e a
 * tela precisa dizer isso — número torto calado é pior que número ausente.
 */
export function fraseAlcance(a: Alcance): string {
  if (a.grupos === 0) {
    return a.desconhecidos > 0
      ? "Os grupos desta campanha não estão mais na sua lista."
      : "Esta campanha ainda não tem grupos — escolha os grupos antes de postar.";
  }
  const base = `Vai pra ${frasePlural(a.grupos, "grupo", "grupos")} · ${frasePlural(a.pessoas, "pessoa vê", "pessoas veem")}`;
  return a.desconhecidos > 0
    ? `${base} · ${frasePlural(a.desconhecidos, "grupo fora da lista", "grupos fora da lista")}`
    : base;
}

/** Rótulo do botão: "Postar em 13 grupos". */
export function rotuloPostar(a: Alcance): string {
  return a.grupos === 0 ? "Postar" : `Postar em ${frasePlural(a.grupos, "grupo", "grupos")}`;
}

/** Máximo de quadradinhos desenhados no histórico: acima disso viram régua ilegível. */
export const MAX_QUADRADINHOS = 40;

export type Quadradinhos = { total: number; entregues: number };

/**
 * Um quadradinho por grupo alcançado, enchendo um a um (cena 2).
 *
 * Trunca em 40 e nunca deixa `entregues` passar de `total`: um worker que
 * reporta enviados maiores que o alvo não pode desenhar caixa fantasma.
 */
export function quadradinhos(d: Pick<TenantDispatchView, "sent" | "total">): Quadradinhos {
  const total = Math.max(0, Math.min(d.total ?? 0, MAX_QUADRADINHOS));
  const bruto = Math.max(0, d.sent ?? 0);
  const entregues = total === 0 ? 0 : Math.min(Math.round((bruto / Math.max(d.total, 1)) * total), total);
  return { total, entregues };
}
