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
 * antes, pelo `matcher` do middleware.
 */
export const PUBLIC_PAGES: readonly string[] = ["/", "/home-v2", "/termos", "/privacidade"];

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
