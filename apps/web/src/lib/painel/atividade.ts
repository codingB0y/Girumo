import type { DispatchView } from "@/lib/campaigns/dispatch-view";
import { dayBR, dayBRAgo, dayBROf, horaBR, monthBROf } from "@/lib/date-br";
import { apelidoDoGrupo, quandoDoPost, textoDoPost } from "@/lib/painel/campanha-visao";

/**
 * Séries da campanha na direção D (spec 2026-09-24, PRs C e D). Quem agrupa é o
 * banco (`public.campaign_activity`); aqui ficam as janelas que a rota pede e as
 * barras que a tela desenha, tudo no relógio de Brasília.
 */

export type PontoDaSerie = { inicio: string; novas: number; cliques: number; entraram: number; sairam: number };

export type Movimento = { entraram: number; sairam: number };

/** Grupo que o "Grupo lotou → abre outro" criou hoje, com a hora em que passou a existir. */
export type GrupoAberto = { nome: string; grupo: string | null; quando: string };

export type AtividadeDaCampanha = {
  /** O "agora" do servidor: é ele que diz qual hora ainda está enchendo. */
  geradoEm: string;
  /** Desde quando o webhook grava entradas e saídas: antes disso não há medição. */
  entradasDesde: string;
  /** Hoje, as 24 horas; as que não chegaram vêm zeradas. */
  porHora: PontoDaSerie[];
  /** Do menor entre o dia 1º e 6 dias atrás até o último dia do mês. */
  porDia: PontoDaSerie[];
  /** O mesmo dia da semana passada, até a mesma hora e minuto de agora. */
  semanaPassada: Omit<PontoDaSerie, "inicio">;
  /** Entraram e saíram hoje em cada grupo da campanha, por `whatsapp_group_id`. */
  hojePorGrupo: Record<string, Movimento>;
  /** Grupos abertos sozinhos hoje, do mais antigo ao mais novo. */
  gruposAbertosHoje: GrupoAberto[];
};

export type Fatia = "hour" | "day";
export type Janela = { de: Date; ate: Date; fatia: Fatia };
export type Periodo = "hoje" | "7d" | "mes";
export type Medida = "novas" | "cliques" | "entraram" | "sairam";

/**
 * Quando o webhook passou a gravar entradas e saídas (`group_member_events`):
 * o deploy de produção do #342 em app.girumo.com.br. Não existe histórico para
 * trás: hora ou dia anterior a isto é "sem medição" no gráfico, nunca zero.
 */
export const ENTRADAS_E_SAIDAS_DESDE = "2026-09-30T23:01:58-03:00";

const MEDIDAS_DE_EVENTO: ReadonlySet<Medida> = new Set(["entraram", "sairam"]);

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

/**
 * A comparação de entradas com a semana passada só vale quando aquele dia já
 * estava medido; antes disso, o "zero" da semana passada é ausência de dado.
 */
export function semanaPassadaMedida(a: AtividadeDaCampanha): boolean {
  const inicioDeHoje = meiaNoiteBR(dayBR(new Date(a.geradoEm))).getTime();
  return inicioDeHoje - 7 * UM_DIA_MS >= Date.parse(a.entradasDesde);
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
  /** A série de baixo (saíram), na mesma escala da de cima; só no gráfico de entradas e saídas. */
  abaixo?: number;
  /** Hora (ou dia) que ainda não chegou: desenhada apagada, nunca como zero. */
  futuro: boolean;
  /** A hora (ou o dia) em curso: ainda está enchendo. */
  atual: boolean;
  /** Antes de a medição existir (entradas e saídas): sem barra e sem zero. */
  semMedicao: boolean;
};

function barrasPorHora(a: AtividadeDaCampanha, medida: Medida, abaixo?: Medida): Barra[] {
  const agora = Date.parse(a.geradoEm);
  const desde = MEDIDAS_DE_EVENTO.has(medida) ? Date.parse(a.entradasDesde) : -Infinity;
  return a.porHora.map((p) => {
    const inicio = Date.parse(p.inicio);
    const hh = horaBR(p.inicio).slice(0, 2);
    const atual = inicio <= agora && agora < inicio + UMA_HORA_MS;
    return {
      chave: p.inicio,
      rotulo: atual ? "agora" : `${hh}h`,
      rotuloLongo: `${hh}h às ${hh}h59`,
      valor: p[medida],
      ...(abaixo ? { abaixo: p[abaixo] } : {}),
      futuro: inicio > agora,
      atual,
      // A hora em que a medição começou conta, mesmo que só a partir do meio dela.
      semMedicao: inicio + UMA_HORA_MS <= desde,
    };
  });
}

function barrasPorDia(a: AtividadeDaCampanha, periodo: "7d" | "mes", medida: Medida, abaixo?: Medida): Barra[] {
  const agora = new Date(a.geradoEm);
  const hoje = dayBR(agora);
  const limite = dayBRAgo(7, agora);
  const desde = MEDIDAS_DE_EVENTO.has(medida) ? Date.parse(a.entradasDesde) : -Infinity;
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
      ...(abaixo ? { abaixo: p[abaixo] } : {}),
      futuro: dia > hoje,
      atual,
      // Ao contrário da hora, o dia em que a medição começou só conta se ela começou
      // à meia-noite: pela metade, a soma dele (e a conversão dos cliques) sairia baixa.
      semMedicao: Date.parse(p.inicio) < desde,
    };
  });
}

/**
 * As barras de um período e de uma medida, prontas para o gráfico. Com
 * `abaixo`, cada barra traz também a série de baixo (entraram em cima, saíram
 * embaixo).
 */
export function barrasDaAtividade(a: AtividadeDaCampanha, periodo: Periodo, medida: Medida, abaixo?: Medida): Barra[] {
  return periodo === "hoje" ? barrasPorHora(a, medida, abaixo) : barrasPorDia(a, periodo, medida, abaixo);
}

/** Soma o que foi medido e já aconteceu: hora sem medição ou futura não entra. */
export function somaMedida(barras: Barra[]): Movimento {
  let entraram = 0;
  let sairam = 0;
  for (const b of barras) {
    if (b.semMedicao || b.futuro) continue;
    entraram += b.valor;
    sairam += b.abaixo ?? 0;
  }
  return { entraram, sairam };
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

/** Os grupos abertos hoje como marcas no gráfico por hora: "#40 aberto". */
export function marcasDeGrupoAberto(grupos: GrupoAberto[]): MarcaDePost[] {
  return grupos.map((g) => {
    const hora = horaBR(g.quando);
    const [hh, mm] = hora.split(":").map(Number);
    return { id: `grupo:${g.grupo ?? g.nome}:${g.quando}`, hora, posicao: (hh * 60 + mm) / 1440, texto: `${apelidoDoGrupo(g.nome)} aberto` };
  });
}
