/**
 * Regras puras da porta "Conta" (`/painel/configuracoes`).
 *
 * O bloco já aparecia dentro da tela nova com a paleta antiga — a vitrine o
 * recebe como prop `conta`, então ele atravessou a migração inteiro.
 */

export type CampoDaConta = "name" | "email" | "password";

/** O mínimo que o Supabase aceita; abaixo disso o PATCH volta com erro. */
export const MINIMO_DA_SENHA = 6;

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
  return true;
}

/** Por que o botão está desligado — `null` quando ele está ligado. */
export function motivoDoBloqueio(campo: CampoDaConta, valor: string): string | null {
  if (podeSalvarCampo(campo, valor)) return null;
  if (valor.trim().length === 0) return null; // campo intocado não acusa nada
  return `A senha precisa de pelo menos ${MINIMO_DA_SENHA} caracteres.`;
}

/**
 * O que o toast diz depois de salvar.
 *
 * O e-mail é o único que não termina o trabalho no clique: o Supabase manda
 * confirmação, e sem essa frase o lojista acha que já trocou.
 */
export function mensagemDeSucesso(campo: CampoDaConta): string {
  if (campo === "name") return "Nome atualizado.";
  if (campo === "email") return "E-mail atualizado. Confirme na caixa de entrada.";
  return "Senha atualizada.";
}

/** O campo some da tela depois de salvo? Só a senha — não se relê senha. */
export function limpaDepoisDeSalvar(campo: CampoDaConta): boolean {
  return campo === "password";
}
