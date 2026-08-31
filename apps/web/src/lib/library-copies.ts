/**
 * Biblioteca de copies (P1.14) — modelos de mensagem prontos pro lojista copiar
 * e postar nos grupos. Módulo puro (sem I/O), navegável por categoria.
 *
 * São sugestões pra COPIAR e colar no WhatsApp — não há envio automático (regra
 * anti-ban). Placeholders entre colchetes ([loja], [data]) o lojista troca na hora.
 *
 * As copies DESTE arquivo são o pack de ATACADO DE MODA (copy aprovada pelo
 * Igor em 29/jul — não reescrever aqui). Quem escolhe o pack pelo ramo do
 * tenant é `content-packs.ts`; as CATEGORIAS abaixo são o chrome compartilhado
 * por todos os packs, então os hints ficam neutros.
 */

export type LibraryCategory = "novidade" | "reposicao" | "evento" | "reativacao" | "boas-vindas";

export type LibraryCopy = {
  id: string;
  category: LibraryCategory;
  title: string;
  body: string;
};

export const LIBRARY_CATEGORIES: { id: LibraryCategory; label: string; hint: string }[] = [
  { id: "novidade", label: "Novidade", hint: "Anunciar o que acabou de chegar." },
  { id: "reposicao", label: "Reposição", hint: "Avisar que os queridinhos voltaram." },
  { id: "evento", label: "Evento", hint: "Saldão, data especial, semana temática." },
  { id: "reativacao", label: "Reativação", hint: "Trazer de volta quem sumiu." },
  { id: "boas-vindas", label: "Boas-vindas", hint: "Receber quem acabou de entrar no grupo." },
];

export const LIBRARY_COPIES: LibraryCopy[] = [
  {
    id: "novidade-colecao",
    category: "novidade",
    title: "Coleção nova chegou",
    body:
      "Chegou coleção nova na [loja]! 🔥\nSeparei as peças que mais saíram no atacado e repus tudo. Tô postando as fotos aqui no grupo agora — quem quiser garantir, me chama que eu passo a grade e os valores de revenda. 👇",
  },
  {
    id: "novidade-fresquinha",
    category: "novidade",
    title: "Peça fresquinha disponível",
    body:
      "Novidade fresquinha na loja 👗\nAcabou de chegar e já tá liberada pra revenda. Primeiro a pedir é o primeiro a receber — dá uma olhada nas fotos e me chama pra fechar o pedido.",
  },
  {
    id: "reposicao-queridinhos",
    category: "reposicao",
    title: "Queridinhos de volta",
    body:
      "Repus os queridinhos ✅\nAqueles modelos que esgotaram voltaram ao estoque. Quem ficou na vontade, agora é a hora — manda o pedido antes que acabe de novo.",
  },
  {
    id: "reposicao-grade",
    category: "reposicao",
    title: "Grade completa reforçada",
    body:
      "Estoque reforçado essa semana 📦\nGrade completa dos campeões de venda de volta. Aproveita pra montar seu pedido de revenda com os tamanhos que estavam faltando.",
  },
  {
    id: "evento-saldao",
    category: "evento",
    title: "Semana de saldão",
    body:
      "Semana de saldão começou 🏷️\nPreço de atacado ainda melhor até sexta. É a chance de girar o estoque e garantir margem boa na revenda. Corre que é só essa semana!",
  },
  {
    id: "evento-data",
    category: "evento",
    title: "Data especial chegando",
    body:
      "Data especial chegando 🎉\nMontei uma seleção temática pra você revender na [data]. São as peças que saem sozinhas nessa época — me chama que eu te mostro tudo.",
  },
  {
    id: "reativacao-sumido",
    category: "reativacao",
    title: "Cliente sumido",
    body:
      "Sumido(a)? 👀\nFaz um tempo que você não fecha pedido comigo. Voltei com coleção nova e uma condição especial pra quem já é parceiro. Bora retomar? Dá uma olhada aqui. 👇",
  },
  {
    id: "reativacao-senti-falta",
    category: "reativacao",
    title: "Senti sua falta",
    body:
      "Senti sua falta nos pedidos! 💬\nTem bastante novidade desde a última vez que a gente fechou. Preparei uma condição pra te trazer de volta — me chama que eu te atualizo.",
  },
  {
    id: "boas-vindas-grupo",
    category: "boas-vindas",
    title: "Bem-vindo ao grupo",
    body:
      "Seja bem-vindo(a) ao grupo da [loja]! 🙌\nAqui você recebe em primeira mão as novidades, reposições e as melhores condições de atacado. Fica de olho que todo dia tem peça boa passando.",
  },
  {
    id: "boas-vindas-canal",
    category: "boas-vindas",
    title: "Como funciona o canal",
    body:
      "Que bom te ver por aqui! 👋\nEsse é o canal onde eu posto tudo: chegadas novas, grades disponíveis e promoções. Qualquer peça que curtir, é só me chamar que eu passo o valor de revenda.",
  },
];

export function libraryCopiesByCategory(category: LibraryCategory): LibraryCopy[] {
  return LIBRARY_COPIES.filter((c) => c.category === category);
}
