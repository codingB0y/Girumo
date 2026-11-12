import { readEntrada } from "@/lib/campaigns/settings";
import type { EstadoGrupo } from "@/lib/groups/estado";
import { destinoDoLink } from "@/lib/painel/destino-do-link";

/**
 * Regra do aviso por e-mail de link de campanha parado (Job 8 do cron de e-mails).
 * Pura: a parte com banco é `cron-link-parado.ts`.
 *
 * O `/r/` não grava o clique bloqueado (só o que foi para um grupo entra em
 * `link_click_events`), então "clique perdido" não dá para contar. O que dá para
 * saber é: o link teve clique que passou nos últimos dias (está circulando) e,
 * pelo estado de agora, quem clicar pela primeira vez não entra em grupo nenhum.
 *
 * ponytail: a janela de clique é o teto do aviso — depois de 3 dias sem nenhum
 * clique passar, o link para de ser avisado mesmo que siga recebendo clique
 * bloqueado. Gravar o clique bloqueado com o motivo no `/r/` troca isso por
 * "cliques bloqueados nas últimas 24 h".
 */

/** "Clique recente": o mesmo horizonte do aviso de campanha parada do sino. */
export const JANELA_DE_CLIQUE_MS = 3 * 24 * 60 * 60 * 1000;

/** `notifications.type` do aviso. O dedupe é por campanha, pelo `href`. */
export const TIPO_LINK_PARADO = "link_parado";

export type CampanhaDoAviso = {
  name: string;
  slug: string;
  group_ids: string[];
  metadata: Record<string, unknown>;
};

/** Uma campanha a avisar. `href` é relativo ao app: vai no e-mail e no sino. */
export type LinkParado = { nome: string; texto: string; href: string };

export function hrefDaCampanha(slug: string): string {
  return `/painel/campanhas/${encodeURIComponent(slug)}`;
}

/**
 * Por que o link desta campanha não manda ninguém para grupo agora, com a frase da
 * aba "Link e cliques" — ou `null` se não há problema a avisar.
 *
 * Só o `grave` de `paradoDoLink` vira aviso: encerrada pela data é o fim planejado,
 * e lotado com lista de espera ou outro link guarda quem clicou.
 *
 * `gruposNaTela` vai como 1: na tela ele separa "os grupos saíram da sua conta" de
 * "/api/groups falhou". Aqui os estados vêm da RPC, que lança em erro — lista vazia
 * é a resposta do banco, não uma leitura que falhou.
 */
export function linkParadoDaCampanha(
  campanha: CampanhaDoAviso,
  estados: EstadoGrupo[],
  agora: Date,
): LinkParado | null {
  const { parado } = destinoDoLink({
    estados,
    groupIds: campanha.group_ids,
    gruposNaTela: 1,
    entrada: readEntrada(campanha.metadata),
    agora,
  });
  if (!parado?.grave) return null;
  return { nome: campanha.name, texto: parado.texto, href: hrefDaCampanha(campanha.slug) };
}
