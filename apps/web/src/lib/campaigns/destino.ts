/**
 * Para quais grupos um post vai (spec postar-por-grupo §6.5, D5–D8). Puro, sem
 * I/O e sem `server-only`: a rota de mensagens valida com ele e a tela usa o
 * mesmo `Destino` e o mesmo padrão.
 *
 * Regra = guardada no disparo (`broadcasts.target_rule`) e refeita pelo banco a
 * cada envio (`app.alvos_do_disparo`). Lista fixa = exatamente aqueles grupos.
 */
import { isRegraDestino, type RegraDestino } from "@/lib/groups/estado";

export type Destino = { regra: RegraDestino } | { grupos: string[] };

const REGRA_PADRAO: RegraDestino = "menos_enchendo";

/** D5: o padrão seguro. Antes do seletor, post sem lista ia para todos os grupos. */
export const DESTINO_PADRAO: Destino = { regra: REGRA_PADRAO };

export const NENHUM_GRUPO_NA_REGRA = "Nenhum grupo nesta regra agora.";

const SEM_GRUPOS = "Esta campanha ainda não tem grupos. Escolha os grupos antes de disparar.";
const DESTINO_INVALIDO = "Destino inválido.";
const REGRA_INVALIDA = "Regra de destino inválida.";
const LISTA_INVALIDA = "Lista de grupos inválida.";
const LISTA_VAZIA = "Escolha ao menos um grupo.";
const GRUPO_DE_FORA = "Um dos grupos escolhidos não está nesta campanha. Recarregue a página e escolha de novo.";

type Lido = { ok: true; destino: Destino } | { ok: false; error: string };
type Campanha = { group_ids: string[] };

/**
 * `permitidosExtras`: grupos aceitos na lista fixa mesmo fora de `group_ids` —
 * hoje só o Avisos da comunidade nativa, que `reconciliar.ts` tira de
 * `group_ids` de propósito.
 */
export function lerDestino(body: Record<string, unknown>, campanha: Campanha, permitidosExtras: readonly string[] = []): Lido {
  const bruto = body.destino;
  if (bruto !== undefined && bruto !== null) {
    if (typeof bruto !== "object" || Array.isArray(bruto)) return { ok: false, error: DESTINO_INVALIDO };
    const destino = bruto as Record<string, unknown>;
    if ("regra" in destino) return lerRegra(destino.regra, campanha);
    if ("grupos" in destino) return lerLista(destino.grupos, campanha, permitidosExtras);
    return { ok: false, error: DESTINO_INVALIDO };
  }
  // Compatibilidade: antes do seletor, `groupIds` era a lista do disparo.
  if (body.groupIds !== undefined && body.groupIds !== null) return lerLista(body.groupIds, campanha, permitidosExtras);
  return lerRegra(REGRA_PADRAO, campanha);
}

function lerRegra(regra: unknown, campanha: Campanha): Lido {
  if (!isRegraDestino(regra)) return { ok: false, error: REGRA_INVALIDA };
  if (campanha.group_ids.length === 0) return { ok: false, error: SEM_GRUPOS };
  return { ok: true, destino: { regra } };
}

function lerLista(bruto: unknown, campanha: Campanha, extras: readonly string[]): Lido {
  if (!Array.isArray(bruto) || !bruto.every((jid): jid is string => typeof jid === "string")) {
    return { ok: false, error: LISTA_INVALIDA };
  }
  const grupos = [...new Set(bruto.map((jid) => jid.trim()).filter(Boolean))];
  if (grupos.length === 0) {
    return { ok: false, error: campanha.group_ids.length === 0 && extras.length === 0 ? SEM_GRUPOS : LISTA_VAZIA };
  }
  const permitidos = new Set([...campanha.group_ids, ...extras]);
  if (grupos.some((jid) => !permitidos.has(jid))) return { ok: false, error: GRUPO_DE_FORA };
  return { ok: true, destino: { grupos } };
}
