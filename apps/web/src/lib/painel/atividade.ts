import type { DispatchView } from "@/lib/campaigns/dispatch-view";
import { dayBR, dayBRAgo, dayBROf, horaBR, monthBROf } from "@/lib/date-br";
import { quandoDoPost, textoDoPost } from "@/lib/painel/campanha-visao";

/**
 * Séries da campanha na direção D (spec 2026-09-24, PR C). Quem agrupa é o banco
 * (`public.campaign_activity`); aqui ficam as janelas que a rota pede e as barras
 * que a tela desenha, tudo no relógio de Brasília.
 */

export type PontoDaSerie = { inicio: string; novas: number; cliques: number };

export type AtividadeDaCampanha = {
  /** O "agora" do servidor: é ele que diz qual hora ainda está enchendo. */
  geradoEm: string;
  /** Hoje, as 24 horas; as que não chegaram vêm zeradas. */
  porHora: PontoDaSerie[];
  /** Do menor entre o dia 1º e 6 dias atrás até o último dia do mês. */
  porDia: PontoDaSerie[];
  /** O mesmo dia da semana passada, até a mesma hora e minuto de agora. */
  semanaPassada: { novas: number; cliques: number };
};

export type Fatia = "hour" | "day";
export type Janela = { de: Date; ate: Date; fatia: Fatia };
export type Periodo = "hoje" | "7d" | "mes";
export type Medida = "novas" | "cliques";

const UMA_HORA_MS = 3_600_000;
const UM_DIA_MS = 86_400_000;
const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const DIAS_POR_EXTENSO = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** No mês, 30 rótulos não cabem em 390 px: o eixo marca só estes dias. */
const DIAS_COM_ROTULO = new Set([1, 5, 10, 15, 20, 25, 30]);

/**
 * Meia-noite de Brasília de um `YYYY-MM-DD`. Deslocamento fixo: o Brasil não
 * tem horário de verão desde 2019 (a mesma regra de `campaigns/settings.ts`).
 */
export function meiaNoiteBR(dia: string): Date {
  return new Date(`${dia}T00:00:00-03:00`);
}

function primeiroDoMesSeguinte(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

/**
 * As três janelas que a rota pede ao banco: hoje por hora, os dias (o mês
 * inteiro e, no começo do mês, os 7 últimos que ficaram no mês anterior) e o
 * mesmo dia da semana passada até este mesmo instante.
 */
export function janelasDaAtividade(agora: Date): { porHora: Janela; porDia: Janela; semanaPassada: Janela } {
  const hoje = dayBR(agora);
  const inicioDeHoje = meiaNoiteBR(hoje);
  const primeiroDoMes = meiaNoiteBR(`${hoje.slice(0, 7)}-01`);
  const seisDiasAtras = new Date(inicioDeHoje.getTime() - 6 * UM_DIA_MS);
  return {
    porHora: { de: inicioDeHoje, ate: new Date(inicioDeHoje.getTime() + UM_DIA_MS), fatia: "hour" },
    porDia: {
      de: primeiroDoMes < seisDiasAtras ? primeiroDoMes : seisDiasAtras,
      ate: meiaNoiteBR(primeiroDoMesSeguinte(hoje.slice(0, 7))),
      fatia: "day",
    },
    semanaPassada: {
      de: new Date(inicioDeHoje.getTime() - 7 * UM_DIA_MS),
      ate: new Date(agora.getTime() - 7 * UM_DIA_MS),
      fatia: "day",
    },
  };
}

export function somaDa(serie: PontoDaSerie[], medida: Medida): number {
  return serie.reduce((s, p) => s + p[medida], 0);
}

/** Dia da semana de um `YYYY-MM-DD` (a data já é de Brasília; o meio-dia UTC não vira o dia). */
function diaDaSemanaDe(dia: string, nomes: string[]): string {
  const [a, m, d] = dia.split("-").map(Number);
  return nomes[new Date(Date.UTC(a, m - 1, d, 12)).getUTCDay()];
}

function diaDaSemana(dia: string): string {
  return diaDaSemanaDe(dia, DIAS);
}

/**
 * "quarta passada", "domingo passado": sábado e domingo são masculinos. Com o
 * artigo: "na quarta passada", "no domingo passado".
 */
export function diaDaSemanaPassada(dia: string, comArtigo = false): string {
  const nome = diaDaSemanaDe(dia, DIAS_POR_EXTENSO);
  const masculino = nome === "sábado" || nome === "domingo";
  const texto = `${nome} ${masculino ? "passado" : "passada"}`;
  return comArtigo ? `${masculino ? "no" : "na"} ${texto}` : texto;
}

/** "quinta, 26 de setembro". */
export function diaPorExtenso(dia: string): string {
  return `${diaDaSemanaDe(dia, DIAS_POR_EXTENSO)}, ${Number(dia.slice(8))} de ${MESES[Number(dia.slice(5, 7)) - 1]}`;
}

/** "Setembro": o nome do botão do período do mês. */
export function nomeDoMes(dia: string): string {
  const nome = MESES[Number(dia.slice(5, 7)) - 1];
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

export type Barra = {
  chave: string;
  /** Rótulo do eixo ("09h", "qua 17", "15"); vazio quando o eixo não marca aquela barra. */
  rotulo: string;
  /** Rótulo por extenso, para a dica e o leitor de tela. */
  rotuloLongo: string;
  valor: number;
  /** Hora (ou dia) que ainda não chegou: desenhada apagada, nunca como zero. */
  futuro: boolean;
  /** A hora (ou o dia) em curso: ainda está enchendo. */
  atual: boolean;
};

function barrasPorHora(a: AtividadeDaCampanha, medida: Medida): Barra[] {
  const agora = Date.parse(a.geradoEm);
  return a.porHora.map((p) => {
    const inicio = Date.parse(p.inicio);
    const hh = horaBR(p.inicio).slice(0, 2);
    const atual = inicio <= agora && agora < inicio + UMA_HORA_MS;
    return {
      chave: p.inicio,
      rotulo: atual ? "agora" : `${hh}h`,
      rotuloLongo: `${hh}h às ${hh}h59`,
      valor: p[medida],
      futuro: inicio > agora,
      atual,
    };
  });
}

function barrasPorDia(a: AtividadeDaCampanha, periodo: "7d" | "mes", medida: Medida): Barra[] {
  const agora = new Date(a.geradoEm);
  const hoje = dayBR(agora);
  const limite = dayBRAgo(7, agora);
  const dias = a.porDia.filter((p) => {
    const dia = dayBROf(p.inicio) ?? "";
    return periodo === "7d" ? dia > limite && dia <= hoje : monthBROf(p.inicio) === hoje.slice(0, 7);
  });
  return dias.map((p) => {
    const dia = dayBROf(p.inicio) ?? "";
    const n = Number(dia.slice(8));
    const atual = dia === hoje;
    const semana = diaDaSemana(dia);
    const rotulo = atual ? "hoje" : periodo === "7d" ? `${semana} ${n}` : DIAS_COM_ROTULO.has(n) ? String(n) : "";
    return {
      chave: dia,
      rotulo,
      rotuloLongo: atual ? "hoje" : `${semana}, ${dia.slice(8)}/${dia.slice(5, 7)}`,
      valor: p[medida],
      futuro: dia > hoje,
      atual,
    };
  });
}

/** As barras de um período e de uma medida, prontas para o gráfico. */
export function barrasDaAtividade(a: AtividadeDaCampanha, periodo: Periodo, medida: Medida): Barra[] {
  return periodo === "hoje" ? barrasPorHora(a, medida) : barrasPorDia(a, periodo, medida);
}

/** Variação em %, ou null quando não há base (dividir por zero não é "+∞%"). */
export function variacao(atual: number, antes: number): number | null {
  if (!Number.isFinite(atual) || !Number.isFinite(antes) || antes <= 0) return null;
  return Math.round(((atual - antes) / antes) * 100);
}

/** Teto do eixo: o próximo número redondo (1, 2 ou 5 × 10ⁿ) acima do máximo, no mínimo 5. */
export function tetoDoEixo(maximo: number): number {
  if (!Number.isFinite(maximo) || maximo <= 5) return 5;
  const ordem = 10 ** Math.floor(Math.log10(maximo));
  for (const m of [1, 2, 5]) if (m * ordem >= maximo) return m * ordem;
  return 10 * ordem;
}

export type MarcaDePost = {
  id: string;
  hora: string;
  /** Posição no eixo do dia, de 0 (00:00) a 1 (24:00). */
  posicao: number;
  texto: string;
};

/**
 * Os posts que saíram hoje, ou estão saindo, como marcas no gráfico por hora:
 * é o que responde "o post trouxe gente?". Post que falhou não entra; ele não
 * chegou a ninguém, e a marca sugeriria que a hora vazia foi culpa dele.
 */
export function marcasDePost(posts: DispatchView[], agora: Date): MarcaDePost[] {
  const hoje = dayBR(agora);
  return posts
    .filter((p) => p.status === "running" || p.status === "sent")
    .map((p) => ({ p, quando: quandoDoPost(p) }))
    .filter(({ quando }) => dayBROf(quando) === hoje)
    .map(({ p, quando }) => {
      const hora = horaBR(quando);
      const [hh, mm] = hora.split(":").map(Number);
      return { id: p.id, hora, posicao: (hh * 60 + mm) / 1440, texto: textoDoPost(p) };
    })
    .sort((x, y) => x.posicao - y.posicao);
}
