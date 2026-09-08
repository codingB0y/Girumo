/**
 * Regras puras dos dois blocos que vivem DENTRO de `/painel/conectar`: a saúde
 * do número e a proteção dos grupos.
 *
 * Os dois já estavam na tela nova com o desenho antigo — cores Tailwind cruas
 * (`bg-red-500/10`, `bg-emerald-500/12`) que não existem na paleta da Vitrine.
 * O que muda aqui é só a decisão; nenhum número é estimado, todos vêm do banco
 * pela mesma fonte que o envio usa.
 */

export type TomDaEtiqueta = "ok" | "atencao" | "risco";

export type SaudeDoNumero = {
  connected: boolean;
  everConnected: boolean;
  tone: TomDaEtiqueta;
  usedToday: number;
  dailyCap: number;
  usedRatio: number;
};

/**
 * A etiqueta do cartão.
 *
 * Desconectado também é `risco` no domínio, mas "Requer ação" não diz o que
 * houve — e o que houve é a única informação que importa naquele instante.
 */
export function etiquetaDoTom(health: Pick<SaudeDoNumero, "connected" | "tone">): {
  texto: string;
  tom: TomDaEtiqueta;
} {
  if (!health.connected) return { texto: "Desconectado", tom: "risco" };
  if (health.tone === "atencao") return { texto: "Atenção", tom: "atencao" };
  if (health.tone === "risco") return { texto: "Requer ação", tom: "risco" };
  return { texto: "Saudável", tom: "ok" };
}

export type UsoDeHoje = {
  restante: number;
  /** 0..1 para a barra. */
  proporcao: number;
  /** A partir de 90% do teto a barra vira Aviso. */
  perto: boolean;
};

/**
 * Quanto ainda dá para enviar hoje.
 *
 * O piso da barra é CONDICIONAL: sem nenhuma mensagem enviada ela fica em zero
 * mesmo, porque aqui a barra mede consumo de uma cota — desenhar um tracinho
 * onde nada foi gasto sugere gasto que não houve. (Diferente das barras de
 * lotação da Vitrine, onde o piso existe para a peça não sumir.)
 */
export function usoDeHoje(health: Pick<SaudeDoNumero, "usedToday" | "dailyCap" | "usedRatio">): UsoDeHoje {
  const usadas = Math.max(0, health.usedToday);
  const teto = Math.max(0, health.dailyCap);
  const proporcao = Math.min(1, Math.max(0, health.usedRatio));
  return {
    restante: Math.max(0, teto - usadas),
    proporcao: usadas > 0 ? Math.max(proporcao, 0.03) : 0,
    perto: proporcao >= 0.9,
  };
}

/**
 * Quais números aparecem no bloco.
 *
 * O critério é HISTÓRICO, não sessão aberta. Filtrar por `connected` fazia o
 * bloco sumir exatamente quando o número caiu — a única hora em que o lojista
 * precisa dele. Mas o outro extremo também erra: instância criada e nunca
 * pareada não tem rampa de aquecimento para mostrar.
 */
export function numerosComHistorico<T extends { everConnected: boolean }>(
  numeros: readonly T[] | null,
): T[] {
  return (numeros ?? []).filter((n) => n.everConnected);
}

/** O bloco inteiro some quando não há nada de verdade a dizer. */
export function mostraSaudeDoNumero(
  numeros: readonly { everConnected: boolean }[] | null,
  falhou: boolean,
): boolean {
  if (falhou) return false;
  // Ainda carregando: mostra o esqueleto em vez de piscar a seção inteira.
  if (numeros === null) return true;
  return numerosComHistorico(numeros).length > 0;
}

export type ResumoDaProtecao = {
  administrados: number;
  semBackup: number;
  medidos: number;
};

export type CenaDaProtecao = "nao-se-aplica" | "risco" | "protegido" | "nao-medido";

/**
 * Qual das três cenas de proteção mostrar.
 *
 * "Sem grupo administrado" não é "tudo certo": é não haver ativo a proteger, e
 * dizer "protegido" ali seria um elogio ao nada.
 */
export function cenaDaProtecao(resumo: ResumoDaProtecao | null): CenaDaProtecao {
  if (!resumo || resumo.administrados === 0) return "nao-se-aplica";
  if (resumo.semBackup > 0) return "risco";
  if (resumo.medidos > 0) return "protegido";
  return "nao-medido";
}

/** "3 grupos seus" / "1 grupo seu". */
export function textoDeGruposSeus(administrados: number): string {
  const n = Math.max(0, administrados);
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? "grupo seu" : "grupos seus"}`;
}
