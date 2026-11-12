import { isClosedAt, readEntrada } from "@/lib/campaigns/settings";
import { hrefDaCampanha, type CampanhaDoAviso } from "@/lib/email/link-parado-aviso";

/**
 * Regra do aviso por e-mail de convite quebrado (Job 9 do cron de e-mails). Pura:
 * a parte com banco é `cron-convite-quebrado.ts`.
 *
 * Só lê o veredito que a revisão de convite já gravou (`groups.invite_check`): este
 * aviso nunca consulta o WhatsApp. Quem atualiza o veredito é o "Revisar links" da
 * campanha e, para grupo ainda sem link guardado, o Sincronizar.
 */

/** `notifications.type` do aviso. O dedupe é por campanha, pelo `href`. */
export const TIPO_CONVITE_QUEBRADO = "convite_quebrado";

/**
 * No máximo um aviso por campanha nesta janela. O veredito muda pouco (só quando
 * alguém revisa), então avisar todo dia repetiria a mesma notícia.
 */
export const JANELA_DO_AVISO_MS = 7 * 24 * 60 * 60 * 1000;

/** Uma campanha a avisar. `grupos` são os nomes, na ordem da campanha. */
export type ConviteQuebrado = { nome: string; href: string; grupos: string[] };

/**
 * Os grupos da campanha com convite quebrado, ou `null` se não há o que avisar.
 * `quebrados` vai do `whatsapp_group_id` ao nome do grupo (`group_ids` guarda o id
 * do WhatsApp, não o da linha).
 *
 * Campanha encerrada pela data fica de fora: o link dela já não manda ninguém.
 */
export function conviteQuebradoDaCampanha(
  campanha: CampanhaDoAviso,
  quebrados: ReadonlyMap<string, string>,
  agora: Date,
): ConviteQuebrado | null {
  if (isClosedAt(readEntrada(campanha.metadata).encerra_em, agora)) return null;
  const grupos = [...new Set(campanha.group_ids)].flatMap((id) => {
    const nome = quebrados.get(id);
    return nome === undefined ? [] : [nome];
  });
  if (grupos.length === 0) return null;
  return { nome: campanha.name.trim() || campanha.slug, href: hrefDaCampanha(campanha.slug), grupos };
}

/** "Moda 1", "Moda 1 e Moda 2", "Moda 1, Moda 2 e mais 3" — a lista do e-mail não cresce sem fim. */
export const GRUPOS_NA_LISTA = 3;

export function listaDeGrupos(grupos: readonly string[]): string {
  if (grupos.length <= 1) return grupos[0] ?? "";
  if (grupos.length <= GRUPOS_NA_LISTA) return `${grupos.slice(0, -1).join(", ")} e ${grupos[grupos.length - 1]}`;
  return `${grupos.slice(0, GRUPOS_NA_LISTA - 1).join(", ")} e mais ${grupos.length - (GRUPOS_NA_LISTA - 1)}`;
}
