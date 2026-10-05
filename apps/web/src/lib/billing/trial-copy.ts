import { dayBR, dayBROf, diaMesBR } from "../date-br";
import { formatarPreco } from "./plan-display";
import { subscriptionNotice } from "./subscription-access";
import { TRIAL_DAYS, type TrialView } from "./trial";

/**
 * Os textos do teste grátis no painel (mockup v4), puros para serem testados.
 * Nenhum fala em reembolso: desde 03/10/2026 ele vive só nos Termos.
 */

const DIA_MS = 86_400_000;
/** O Stripe emite `trial_will_end` 3 dias antes do fim. */
const AVISO_ANTES_DIAS = 3;

export type Faixa = {
  tipo: "oferta" | "em_teste" | "cartao_repetido";
  texto: string;
  acao: string;
} | null;

/**
 * Dias entre hoje e o dia da cobrança, no calendário de Brasília — o mesmo da data
 * "Em DD/MM" na frase: o dia da ativação lê 7 (o que o modal prometeu), a véspera
 * "falta 1 dia", e o dia da cobrança, ou depois dele com o webhook atrasado, "último
 * dia" — nunca "faltam 0 dias". Contar horas restantes dizia "faltam 2 dias. Em
 * 10/10" na manhã de 09/10.
 */
function faltam(fim: string, agora: Date): string {
  const diaDoFim = dayBROf(fim);
  // Datas `YYYY-MM-DD` parseiam como meia-noite UTC: a diferença é um número exato de dias.
  const dias = diaDoFim ? (Date.parse(diaDoFim) - Date.parse(dayBR(agora))) / DIA_MS : Number.NaN;
  if (!Number.isFinite(dias) || dias <= 0) return "último dia";
  return dias === 1 ? "falta 1 dia" : `faltam ${dias} dias`;
}

export function faixaDoTeste(view: TrialView | null, agora: Date): Faixa {
  if (!view) return null;

  if (view.emTeste) {
    const { fim, plano, precoCents, semCobranca } = view.emTeste;
    // Cancelado no portal, o teste segue até o fim sem fatura (spec 6). Anunciar a
    // cobrança aqui faria o cliente cancelar de novo, ou achar que vai pagar.
    // A frase é a mesma de Configurações › Plano, para as duas telas não discordarem.
    if (semCobranca) {
      return { tipo: "em_teste", texto: subscriptionNotice("trial_canceled", fim), acao: "Ver plano" };
    }
    // "do plano X", não "do X": Essencial e Operação pedem o feminino.
    // Preço desconhecido (0) some da frase em vez de virar "R$ 0/mês", como em
    // Configurações › Plano: a tela não inventa valor.
    const doPlano = plano ? `do plano ${plano}` : "do seu plano";
    const valor = precoCents > 0 ? ` de ${formatarPreco(precoCents)}/mês` : "";
    return {
      tipo: "em_teste",
      texto: `Teste grátis ${doPlano}: ${faltam(fim, agora)}. Em ${diaMesBR(fim) ?? "breve"} começa a cobrança${valor} no cartão cadastrado.`,
      acao: "Ver plano",
    };
  }

  if (view.cartaoRepetido) {
    return {
      tipo: "cartao_repetido",
      texto: "Esse cartão já foi usado num teste grátis em outra conta. Não cobramos nada. Pra continuar, assine direto.",
      acao: "Ver planos",
    };
  }

  if (view.elegivel) {
    return {
      tipo: "oferta",
      texto: "Teste o Girumo completo por 7 dias. Hoje você não paga nada.",
      acao: "Ativar 7 dias grátis",
    };
  }

  return null;
}

/** Linha do tempo do modal: quando chega o aviso e quando acontece a 1ª cobrança. */
export function datasDoTeste(agora: Date): { aviso: string; cobranca: string } {
  const fim = agora.getTime() + TRIAL_DAYS * DIA_MS;
  return {
    aviso: diaMesBR(new Date(fim - AVISO_ANTES_DIAS * DIA_MS).toISOString()) ?? "",
    cobranca: diaMesBR(new Date(fim).toISOString()) ?? "",
  };
}

export function linhaDoPrecoNoTeste(precoCents: number): string {
  return `R$ 0 hoje · depois ${formatarPreco(precoCents)}/mês`;
}
