/**
 * Erros do Supabase Auth em português, para as rotas e telas de entrada.
 *
 * O supabase-js devolve `AuthError` com `status` (HTTP, ou 0 quando a rede
 * caiu) e `code` (o `error_code` do GoTrue). O login tratava qualquer falha como
 * senha errada, e a tela de nova senha mostrava `error.message` cru, em inglês.
 *
 * Puro de propósito: roda no servidor (login, conta), no navegador (redefinir
 * senha) e sob `tsx --test`.
 */

type FalhaDoAuth = { status?: number; code?: string; message?: string };

export type TipoDaFalhaDeLogin = "limite" | "credencial" | "indisponivel";

export const MENSAGEM_DE_LIMITE = "Muitas tentativas. Espere alguns minutos e tente de novo.";

/**
 * Por que o `signInWithPassword` falhou.
 *
 * O teto de tentativas do Supabase é por IP e o login roda no servidor: todo
 * lojista atrás da mesma saída da Vercel cai junto. Chamar isso de "senha
 * incorreta" manda a pessoa trocar uma senha que estava certa.
 */
export function tipoDaFalhaDeLogin(erro: FalhaDoAuth): TipoDaFalhaDeLogin {
  if (erro.status === 429 || erro.code === "over_request_rate_limit") return "limite";
  if (erro.status !== undefined && erro.status >= 400 && erro.status < 500) return "credencial";
  // status 0 (rede), 5xx ou ausente: o Auth não respondeu sobre a senha.
  return "indisponivel";
}

/** Falha do `updateUser({ password })`, na tela de nova senha e na aba Conta. */
export function mensagemDaNovaSenha(erro: FalhaDoAuth): string {
  if (tipoDaFalhaDeLogin(erro) === "limite") return MENSAGEM_DE_LIMITE;
  if (erro.code === "same_password") return "A senha nova precisa ser diferente da atual.";
  if (erro.code === "weak_password") return "Essa senha é fácil de adivinhar. Escolha outra.";
  return "Não foi possível salvar a senha. Tente de novo.";
}

/** Falha do `updateUser({ email })` na aba Conta. */
export function mensagemDoNovoEmail(erro: FalhaDoAuth): string {
  if (tipoDaFalhaDeLogin(erro) === "limite") return MENSAGEM_DE_LIMITE;
  if (erro.code === "email_exists") return "Este e-mail já é usado por outra conta.";
  if (erro.code === "email_address_invalid") return "E-mail inválido.";
  return "Não foi possível trocar o e-mail. Tente de novo.";
}

/**
 * O link de recuperação chegou com erro (vencido ou já usado)?
 *
 * O Supabase devolve o erro no fragmento (`#error_code=otp_expired`). O
 * supabase-js engole esse erro sem gravar sessão, então só lendo a URL a tela
 * sabe que o formulário não vai funcionar.
 */
export function linkDeRecuperacaoFalhou(trechoDaUrl: string): boolean {
  const params = new URLSearchParams(trechoDaUrl.replace(/^[#?]/, ""));
  return params.has("error") || params.has("error_code");
}
