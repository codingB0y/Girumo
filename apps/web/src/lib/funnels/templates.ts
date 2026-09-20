/**
 * Roteiros do funil de disparos (spec 2026-09-19-funil-de-disparos-design, seção 3).
 *
 * Módulo puro: sem I/O, sem server-only, importável no cliente. A copy é a mesma
 * para todo lojista; as {chaves} são trocadas no cliente por `renderCopy`
 * (./render.ts) antes de a mensagem virar um broadcast comum. Nenhum roteiro
 * dispara sozinho: cada etapa é confirmada e vira o mesmo par broadcast +
 * schedule da sub-aba Agendar.
 */

export type FunnelStepKind = "texto" | "midia" | "link" | "relampago";
export type FunnelField = "peça" | "preço" | "grade" | "quantidade" | "link da live";

/** Chaves que não são campo da etapa. */
export const STORE_KEYS = ["loja", "nicho"] as const;
export const ANCHOR_KEYS = ["dia", "hora"] as const;
export const CAMPAIGN_KEYS = ["link"] as const;

export type FunnelStep = {
  readonly id: string;
  readonly label: string;
  /** `time` = hora fixa naquele dia; `minutes` = relativo à hora da âncora. Um dos dois. */
  readonly at: { readonly days: number; readonly time?: string; readonly minutes?: number };
  readonly kind: FunnelStepKind;
  /** Campos obrigatórios para gerar a copy. */
  readonly fields: readonly FunnelField[];
  readonly mentionAll: boolean;
  /** Sugere anexar 1 foto; não obriga. */
  readonly wantsMedia: boolean;
  readonly copy: string;
};

export type FunnelTemplateId = "grade-do-dia" | "evento-2-dias" | "live" | "black-friday-atacado";

export type FunnelTemplate = {
  readonly id: FunnelTemplateId;
  readonly label: string;
  readonly description: string;
  readonly anchorLabel: string;
  readonly anchorNeedsTime: boolean;
  readonly suggestAnchor?: (today: Date) => Date;
  readonly steps: readonly FunnelStep[];
};

/**
 * Última sexta de novembro menos 21 dias; se já passou, a do ano seguinte.
 *
 * CONHECIDO E INTENCIONAL — não "conserte": em 2029, 2035 e 2040 (anos em que
 * 1º de novembro cai numa quinta) a última sexta de novembro NÃO é a Black
 * Friday, que é o dia seguinte à 4ª quinta. Nesses três anos a sugestão cai 14
 * dias antes da BF, não 21. Fica assim por decisão de produto: é só uma
 * sugestão e a âncora é editável na tela.
 */
export function blackFridayAtacado(today: Date): Date {
  const paraAno = (ano: number): Date => {
    const d = new Date(ano, 10, 30);
    d.setDate(d.getDate() - ((d.getDay() + 2) % 7)); // volta até a sexta (getDay 5)
    d.setDate(d.getDate() - 21);
    d.setHours(0, 0, 0, 0);
    return d;
  };
  const esteAno = paraAno(today.getFullYear());
  return esteAno >= today ? esteAno : paraAno(today.getFullYear() + 1);
}

const CAMPOS_GRADE: readonly FunnelField[] = ["peça", "preço", "grade", "quantidade"];

export const FUNNEL_TEMPLATES: readonly FunnelTemplate[] = [
  {
    id: "grade-do-dia",
    label: "Grade do dia",
    description: "A grade das 06:00, o link com vagas 12 minutos depois e o reforço do meio-dia.",
    anchorLabel: "Dia da grade",
    anchorNeedsTime: false,
    steps: [
      {
        id: "grade-de-hoje", label: "Grade de hoje", at: { days: 0, time: "06:00" },
        kind: "relampago", fields: CAMPOS_GRADE, mentionAll: true, wantsMedia: true,
        copy: "Bom dia! Grade de hoje da {loja}: {peça} por {preço} no atacado, grade {grade}. Só {quantidade} peças. Quer? Manda *EU QUERO* aqui no grupo que eu separo a sua.",
      },
      {
        id: "vagas-de-hoje", label: "Vagas de hoje", at: { days: 0, time: "06:12" },
        kind: "link", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Pra quem ainda não entrou: o link de pedido da {loja} é este, com as vagas de hoje: {link}",
      },
      {
        id: "ultimas-da-grade", label: "Últimas da grade", at: { days: 0, time: "12:00" },
        kind: "texto", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Sobrou pouca coisa da grade de hoje. Quem mandou EU QUERO já está na fila; quem ficou de fora ainda pega o que restou por aqui.",
      },
    ],
  },
  {
    id: "evento-2-dias",
    label: "Evento de 2 dias",
    description: "Aviso, prévia, duas aberturas às 06:00, última chamada e sobras. Serve para coleção nova e queima de estoque.",
    anchorLabel: "Dia 1",
    anchorNeedsTime: false,
    steps: [
      {
        id: "vem-ai", label: "Vem aí", at: { days: -2, time: "19:00" },
        kind: "midia", fields: [], mentionAll: false, wantsMedia: true,
        copy: "{dia} tem evento de 2 dias da {loja}, só pra quem está nos grupos: {nicho} com preço de atacado que não vai pro site. Guarda a data.",
      },
      {
        id: "previa", label: "Prévia", at: { days: -1, time: "19:00" },
        kind: "midia", fields: ["peça", "preço", "grade"], mentionAll: false, wantsMedia: true,
        copy: "Amanhã 06:00 abre. Prévia: {peça} a partir de {preço}, grade {grade}. Quem estiver no grupo às 6 pega primeiro.",
      },
      {
        id: "abriu-dia-1", label: "Abriu · dia 1", at: { days: 0, time: "06:00" },
        kind: "relampago", fields: CAMPOS_GRADE, mentionAll: true, wantsMedia: true,
        copy: "Abriu! Dia 1 do evento da {loja}: {peça} por {preço}, grade {grade}, {quantidade} peças. Manda *EU QUERO* que eu separo na ordem.",
      },
      {
        id: "ainda-da-tempo", label: "Ainda dá tempo", at: { days: 0, time: "12:00" },
        kind: "texto", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Meio-dia e o evento segue. O que saiu de manhã não volta; o que sobrou está por aqui.",
      },
      {
        id: "abriu-dia-2", label: "Abriu · dia 2", at: { days: 1, time: "06:00" },
        kind: "relampago", fields: CAMPOS_GRADE, mentionAll: true, wantsMedia: true,
        copy: "Dia 2! Nova grade da {loja}: {peça} por {preço}, grade {grade}, {quantidade} peças. Manda *EU QUERO*.",
      },
      {
        id: "ultima-chamada", label: "Última chamada", at: { days: 1, time: "18:00" },
        kind: "link", fields: [], mentionAll: true, wantsMedia: false,
        copy: "Última chamada do evento. Pedido pelo link até hoje à noite: {link}",
      },
      {
        id: "sobras", label: "Sobras", at: { days: 2, time: "10:00" },
        kind: "link", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Sobras do evento com o mesmo preço, enquanto durar: {link}",
      },
    ],
  },
  {
    id: "live",
    label: "Lançamento de live",
    description: "Prévia na véspera, chamada 15 minutos antes, grade relâmpago depois da live e sobras no dia seguinte.",
    anchorLabel: "Dia e hora da live",
    anchorNeedsTime: true,
    steps: [
      {
        id: "previa-da-grade", label: "Prévia da grade", at: { days: -1, time: "19:00" },
        kind: "midia", fields: CAMPOS_GRADE, mentionAll: false, wantsMedia: true,
        copy: "Amanhã {hora} tem live da {loja}! Prévia da grade de {nicho}: {peça} a partir de {preço} no atacado, grade {grade}, {quantidade} peças. Quem estiver ao vivo leva condição exclusiva.",
      },
      {
        id: "entra-agora", label: "Entra agora", at: { days: 0, minutes: -15 },
        kind: "link", fields: ["link da live"], mentionAll: true, wantsMedia: false,
        copy: "Tô entrando ao vivo em 15 min! Entra aqui: {link da live}. Pedido é pelo grupo, na condição da live.",
      },
      {
        id: "grade-da-live", label: "Grade da live", at: { days: 0, minutes: 90 },
        kind: "relampago", fields: CAMPOS_GRADE, mentionAll: false, wantsMedia: true,
        copy: "Grade da live liberada: {peça} {preço}, {grade}. Só {quantidade} peças. Manda *EU QUERO* aqui que eu separo a sua.",
      },
      {
        id: "sobras-da-live", label: "Sobras da live", at: { days: 1, time: "10:00" },
        kind: "link", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Sobrou da live e ainda está na condição de ontem. Pedido por aqui: {link}",
      },
    ],
  },
  {
    id: "black-friday-atacado",
    label: "Black Friday do atacado",
    description: "Três semanas antes da BF do varejo: a revendedora compra agora pra revender na BF das lojas.",
    anchorLabel: "Dia da BF do atacado",
    anchorNeedsTime: false,
    suggestAnchor: blackFridayAtacado,
    steps: [
      {
        id: "vem-ai", label: "Vem aí", at: { days: -7, time: "19:00" },
        kind: "midia", fields: [], mentionAll: false, wantsMedia: true,
        copy: "Black Friday do atacado da {loja} é {dia}. Antes da BF das lojas, pra você revender na BF delas. Só nos grupos.",
      },
      {
        id: "previa", label: "Prévia", at: { days: -3, time: "19:00" },
        kind: "midia", fields: ["peça", "preço", "grade"], mentionAll: false, wantsMedia: true,
        copy: "Prévia da Black do atacado: {peça} vai sair por {preço}, grade {grade}. Na {dia} às 06:00.",
      },
      {
        id: "vespera", label: "Véspera", at: { days: -1, time: "19:00" },
        kind: "texto", fields: [], mentionAll: true, wantsMedia: false,
        copy: "Amanhã 06:00. A grade sai aqui no grupo primeiro; quem mandar EU QUERO cedo pega.",
      },
      {
        id: "abriu", label: "Abriu", at: { days: 0, time: "06:00" },
        kind: "relampago", fields: CAMPOS_GRADE, mentionAll: true, wantsMedia: true,
        copy: "Abriu a Black do atacado da {loja}! {peça} por {preço}, grade {grade}, {quantidade} peças. Manda *EU QUERO* que eu separo na ordem.",
      },
      {
        id: "reforco", label: "Reforço", at: { days: 0, time: "12:00" },
        kind: "texto", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Metade do dia e metade da grade já foi. O que sobrou continua no mesmo preço até hoje à noite.",
      },
      {
        id: "ultima-chamada", label: "Última chamada", at: { days: 0, time: "18:00" },
        kind: "link", fields: [], mentionAll: true, wantsMedia: false,
        copy: "Última chamada da Black do atacado. Pedido pelo link até meia-noite: {link}",
      },
      {
        id: "sobras", label: "Sobras", at: { days: 1, time: "10:00" },
        kind: "link", fields: [], mentionAll: false, wantsMedia: false,
        copy: "Sobras da Black no mesmo preço, enquanto durar: {link}",
      },
    ],
  },
];

export const FUNNEL_TEMPLATE_IDS: ReadonlySet<string> = new Set(FUNNEL_TEMPLATES.map((t) => t.id));

export function getFunnelTemplate(id: string): FunnelTemplate | undefined {
  return FUNNEL_TEMPLATES.find((t) => t.id === id);
}
