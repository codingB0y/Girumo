/**
 * Páginas (não-API) que abrem sem sessão.
 *
 * Existe como módulo próprio para ser testável: o middleware não roda sob
 * `tsx --test`, então enquanto a lista morava lá dentro a única checagem
 * possível era casar string do arquivo-fonte — que passa mesmo com a rota
 * quebrada, desde que o texto exista.
 *
 * O defeito que isto previne: `/termos` e `/privacidade` responderam 307 para o
 * login até 26/08 porque não estavam nesta lista. Documento legal que só abre
 * para quem já tem conta não cumpre a função — ele existe justamente para quem
 * ainda está decidindo criar uma, e para o robô de verificação do Stripe.
 *
 * Rotas de autenticação (`/login`, `/signup`, …) NÃO entram aqui: elas já saem
 * antes, pelo `matcher` do middleware. O mesmo vale para `/lp3` (a home
 * anterior, guardada em 23/09/2026): o matcher exclui todo caminho que começa
 * com "lp".
 *
 * `/automatico` e `/44eBras` são as landings de anúncio: `index: false`, mas
 * quem chega por elas nunca teve conta — fora da lista, o clique pago morre num
 * 307 para o login.
 */
export const PUBLIC_PAGES: readonly string[] = [
  "/",
  "/home-v2",
  "/termos",
  "/privacidade",
  "/automatico",
  "/44eBras",
];

/** Páginas legais — usadas também pelo rodapé e pelo aceite no cadastro. */
export const LEGAL_PAGES = {
  terms: "/termos",
  privacy: "/privacidade",
} as const;

/**
 * Casa por caminho exato, não por prefixo.
 *
 * Prefixo abriria `/termos-secretos` e qualquer rota futura que comece igual —
 * numa lista de bypass de autenticação isso é a diferença entre liberar duas
 * páginas e liberar uma família inteira delas por acidente.
 */
export function isPublicPage(pathname: string): boolean {
  return PUBLIC_PAGES.includes(pathname);
}

/**
 * Grafia certa de uma página pública digitada com outra caixa, ou `null`.
 *
 * O caso que motivou: `/44eBras` tem maiúscula no meio, e quem digita tudo
 * minúsculo (`/44ebras`) não casa com `isPublicPage` — que é exato de propósito
 * — e cairia no 307 para o login. O middleware usa este retorno para um 308 até
 * a grafia certa, antes do gate.
 *
 * Por que no middleware e NÃO em `redirects()` do next.config: os redirects do
 * Next casam o `source` SEM diferenciar maiúscula (path-to-regexp com
 * `sensitive: false`, a não ser ligando `experimental.caseSensitiveRoutes` para
 * o app inteiro). Uma regra `/44ebras → /44eBras` casaria também o próprio
 * `/44eBras` e redirecionaria para ele mesmo, em loop. Aqui a grafia certa
 * devolve `null`, e é isso que fecha o loop.
 *
 * O destino sai sempre de PUBLIC_PAGES, nunca do que foi digitado: não vira
 * redirect aberto, e rota fora da lista continua indo para o gate.
 */
export function publicPageCaseAlias(pathname: string): string | null {
  if (isPublicPage(pathname)) return null;
  const digitado = pathname.toLowerCase();
  return PUBLIC_PAGES.find((pagina) => pagina.toLowerCase() === digitado) ?? null;
}

/**
 * Telas de autenticação — abrem sem sessão, mas por outro caminho.
 *
 * NÃO passam por `isPublicPage`: elas já saem antes, pelo `matcher` do
 * middleware. Esta lista existe para o lado do BROWSER, que não vê o
 * middleware e precisa saber, sozinho, que está numa tela sem sessão.
 *
 * O que isto habilita: não carregar o SDK do Sentry aqui. Medido em produção
 * em 29/08, visita fria em Slow 4G na tela de login — 468 KB de JavaScript, dos
 * quais 187 KB (41%) eram o SDK, e o maior pedaço dele era o ÚLTIMO recurso a
 * terminar, aos 6036 ms. Ou seja: o coletor de erros definia o tempo de carga
 * da tela. Antes de hidratar, o formulário está visível e inerte — o lojista
 * clica em "Entrar" e nada acontece.
 *
 * A troca é deliberada e estreita: o SDK existe para pegar tela branca e erro
 * de hidratação no PAINEL, onde o lojista passa o dia. Uma tela de dois campos
 * não justifica 187 KB. Ao navegar daqui para qualquer rota com sessão, o SDK
 * carrega — quem faz isso é `onRouterTransitionStart`.
 */
export const AUTH_PAGES: readonly string[] = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/auth/callback",
];

/**
 * Casa por caminho exato, pelo mesmo motivo de `isPublicPage`: prefixo pegaria
 * uma família inteira de rotas por acidente. Aqui o custo do erro é telemetria
 * silenciosamente desligada numa rota que deveria ter — defeito que só aparece
 * quando alguém procura o erro e não acha.
 */
export function isAuthPage(pathname: string): boolean {
  return AUTH_PAGES.includes(pathname);
}
