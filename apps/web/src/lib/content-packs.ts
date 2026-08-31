/**
 * Packs de conteúdo por segmento (produto horizontal, marketing vertical —
 * decisão de 30/08/2026).
 *
 * A biblioteca de copies nasceu nichada em atacado de moda porque a base de
 * clientes veio inteira desse funil. Com as LPs por nicho, o conteúdo pronto
 * passa a seguir o ramo do tenant:
 *
 * - `moda_atacado` → as copies ORIGINAIS de `library-copies.ts`, intactas
 *   (copy aprovada pelo Igor em 29/jul — este módulo não reescreve nada lá).
 * - `mercado` → pack próprio (oferta do dia, prateleira, cadência diária).
 * - demais segmentos e `null` → pack neutro. Tenants antigos foram
 *   backfillados para `moda_atacado` na migração 20260830233000, então `null`
 *   significa CONTA NOVA que ainda não escolheu o ramo — neutro é o default
 *   certo, não uma regressão.
 *
 * Módulo puro (sem I/O) — importável no cliente e testável, como
 * `library-copies.ts` e `campaign-presets.ts`.
 */

import { LIBRARY_COPIES, type LibraryCopy } from "@/lib/library-copies";

export const NEUTRAL_COPIES: LibraryCopy[] = [
  {
    id: "neutro-novidade",
    category: "novidade",
    title: "Chegou novidade",
    body:
      "Chegou novidade na [loja]! 🔥\nAcabou de entrar e eu já tô postando as fotos aqui no grupo. Quem quiser garantir, me chama antes que acabe. 👇",
  },
  {
    id: "neutro-reposicao",
    category: "reposicao",
    title: "Voltou ao estoque",
    body:
      "Voltou ao estoque ✅\nAquilo que esgotou tá de volta. Quem ficou na vontade, agora é a hora — me chama que eu separo o seu.",
  },
  {
    id: "neutro-evento",
    category: "evento",
    title: "Semana de ofertas",
    body:
      "Semana de ofertas começou 🏷️\nPreço especial até sexta, só pra quem tá no grupo. Dá uma olhada e garante o seu antes que acabe!",
  },
  {
    id: "neutro-reativacao",
    category: "reativacao",
    title: "Cliente sumido",
    body:
      "Sumido(a)? 👀\nFaz um tempo que você não aparece por aqui. Voltei com novidade e uma condição especial pra você. Bora retomar? 👇",
  },
  {
    id: "neutro-boas-vindas",
    category: "boas-vindas",
    title: "Boas-vindas ao grupo",
    body:
      "Que bom ter você no grupo da [loja]! 🙌\nAqui você recebe as ofertas e novidades em primeira mão. Fica de olho que sempre tem coisa boa passando.",
  },
];

export const MERCADO_COPIES: LibraryCopy[] = [
  {
    id: "mercado-novidade",
    category: "novidade",
    title: "Produto novo na loja",
    body:
      "Produto novo na [loja] 🛒\nAcabou de chegar e já entrou com preço de estreia. Passa aqui hoje ou me chama pra reservar o seu.",
  },
  {
    id: "mercado-reposicao",
    category: "reposicao",
    title: "Voltou pras prateleiras",
    body:
      "Voltou pras prateleiras ✅\nAquele item que todo mundo procurava chegou de novo. Garante o seu antes que suma outra vez.",
  },
  {
    id: "mercado-evento",
    category: "evento",
    title: "Oferta do dia",
    body:
      "OFERTA DO DIA 🏷️\nSó hoje na [loja]: preço que não se repete amanhã. Válido enquanto durar o estoque — corre!",
  },
  {
    id: "mercado-reativacao",
    category: "reativacao",
    title: "Sentimos sua falta",
    body:
      "Sentimos sua falta por aqui! 👀\nTodo dia sai oferta nova no grupo e você anda perdendo as melhores. Olha o que tá valendo hoje. 👇",
  },
  {
    id: "mercado-boas-vindas",
    category: "boas-vindas",
    title: "Boas-vindas às ofertas",
    body:
      "Que bom ter você no grupo de ofertas da [loja]! 🛒\nTodo dia sai oferta aqui em primeira mão. Ativa as notificações pra não perder a do dia.",
  },
];

/** Copies da biblioteca para o segmento do tenant. */
export function libraryCopiesForSegment(segment: string | null | undefined): LibraryCopy[] {
  if (segment === "moda_atacado") return LIBRARY_COPIES;
  if (segment === "mercado") return MERCADO_COPIES;
  return NEUTRAL_COPIES;
}
