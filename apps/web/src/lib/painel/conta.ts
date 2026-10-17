/**
 * Regras puras da porta "Conta" (`/painel/configuracoes`).
 *
 * O bloco já aparecia dentro da tela nova com a paleta antiga — a vitrine o
 * recebe como prop `conta`, então ele atravessou a migração inteiro.
 */

export type CampoDaConta = "name" | "email" | "password";

/** O mínimo que o Supabase aceita; abaixo disso o PATCH volta com erro. */
export const MINIMO_DA_SENHA = 6;

/** `api/auth/account` recusa nome com menos que isto — o client para antes. */
export const MINIMO_DO_NOME = 2;

/**
 * O botão "Salvar" só liga quando há o que salvar.
 *
 * A casca antiga desabilitava apenas a senha CURTA (`length > 0 && length < 6`),
 * então com o campo vazio o botão ficava aceso nos três — e o clique caía num
 * `if (!value.trim()) return` mudo. Botão que parece funcionar e não faz nada é
 * pior do que botão desligado: o lojista clica, não vê erro, e conclui que
 * salvou.
 */
export function podeSalvarCampo(campo: CampoDaConta, valor: string): boolean {
  const limpo = valor.trim();
  if (limpo.length === 0) return false;
  if (campo === "password") return limpo.length >= MINIMO_DA_SENHA;
  // O servidor exige 2 no nome; aceitar 1 aqui manda o lojista clicar para
  // receber um toast de erro que a tela já sabia prever.
  if (campo === "name") return limpo.length >= MINIMO_DO_NOME;
  return true;
}

/** Por que o botão está desligado — `null` quando ele está ligado. */
export function motivoDoBloqueio(campo: CampoDaConta, valor: string): string | null {
  if (podeSalvarCampo(campo, valor)) return null;
  if (valor.trim().length === 0) return null; // campo intocado não acusa nada
  if (campo === "name") return `O nome precisa de pelo menos ${MINIMO_DO_NOME} letras.`;
  return `A senha precisa de pelo menos ${MINIMO_DA_SENHA} caracteres.`;
}

/**
 * Trocar e-mail ou senha pede a senha atual (`api/auth/account` recusa sem).
 *
 * Sem isso, quem pegasse a sessão aberta — o celular da loja, o PC do balcão —
 * trocava o e-mail de entrada e ficava com a conta.
 */
export function exigeSenhaAtual(campo: CampoDaConta): boolean {
  return campo !== "name";
}

/**
 * O que o toast diz depois de salvar.
 *
 * `emailPendente` vem da rota: com a troca segura do Supabase, o e-mail de
 * entrada só muda depois do clique no link — dizer "atualizado" antes disso
 * faz o lojista tentar entrar com um endereço que ainda não vale.
 */
export function mensagemDeSucesso(campo: CampoDaConta, emailPendente = false): string {
  if (campo === "name") return "Nome atualizado.";
  if (campo === "email") {
    return emailPendente
      ? "Enviamos um link de confirmação por e-mail. O e-mail de entrada só muda depois que você confirmar."
      : "E-mail atualizado.";
  }
  return "Senha atualizada. Os outros aparelhos foram desconectados.";
}

/** O campo some da tela depois de salvo? Só a senha — não se relê senha. */
export function limpaDepoisDeSalvar(campo: CampoDaConta): boolean {
  return campo === "password";
}
