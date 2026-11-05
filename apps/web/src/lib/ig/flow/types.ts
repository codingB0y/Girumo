/**
 * O fluxo do Instagram como dado: um grafo pequeno, guardado em jsonb
 * (`ig_flows.draft` / `ig_flows.published`). Spec §6.
 *
 * Tudo nesta pasta é PURO (sem I/O): painel e servidor validam com a mesma
 * função, e as duas visões saem do mesmo grafo.
 */
/** Uma saída por escolha de pergunta (ou valor de "Se…"), na ordem: `v0` … `v12`. */
export type ChoiceOut = "v0" | "v1" | "v2" | "v3" | "v4" | "v5" | "v6" | "v7" | "v8" | "v9" | "v10" | "v11" | "v12";
export type FlowOut = "next" | "replied" | "timeout" | "yes" | "no" | "clicked" | "not_clicked" | "other" | ChoiceOut;

export const MAX_CHOICES = 13;
export const MAX_CHOICE_LENGTH = 20;

export function choiceOut(i: number): FlowOut {
  return `v${i}` as FlowOut;
}

/** O índice da escolha que a saída `v<i>` representa; `null` para qualquer outra saída. */
export function choiceIndex(out: FlowOut): number | null {
  const m = /^v(\d{1,2})$/.exec(out);
  return m && Number(m[1]) < MAX_CHOICES ? Number(m[1]) : null;
}

/** Saída sem aresta = o fluxo para ali. Não existe bloco "fim". */
export type FlowEdge = { from: string; out: FlowOut; to: string };

export type TriggerNode = {
  id: string;
  type: "trigger";
  on: "comment" | "dm";
  keywords: string[];
  /** Só `comment`. `null` = qualquer post ou reel. */
  postId: string | null;
  /** Só `comment`. Resposta pública no comentário; `null` = não responde. */
  publicReply: string | null;
  /** Só `dm`. Resposta a story também dispara. */
  storyReplies: boolean;
};

export type MessageNode = {
  id: string;
  type: "message";
  text: string;
  /** Rótulo do botão (o toque conta como resposta). Proibido no primeiro direct depois de comentário. */
  button: string | null;
  /**
   * Espera a resposta (ou o toque) da pessoa. `null` = segue direto.
   * `keywords`: só uma resposta com uma delas libera o próximo bloco; vazio ou ausente = qualquer resposta.
   */
  wait: { minutes: number; keywords?: string[] } | null;
  /**
   * Pergunta com escolhas (1 a 13, até 20 caracteres): sempre espera, sem botão. Cada escolha tem a
   * própria saída (`v0` …) e há `other` para o que não casar. Vírgula separa alternativas ("Sim, quero").
   */
  choices?: string[];
  /** Campo da ficha onde a resposta fica. */
  saveTo?: string | null;
};

export type InviteNode = {
  id: string;
  type: "invite";
  text: string;
  /** Link mestre da campanha (`/r/<slug>`), acrescentado no fim do texto. */
  campaignSlug: string | null;
  /** Rótulo do botão que abre o link (no lugar do link no fim do texto). Ausente em fluxo antigo = sem botão. */
  button?: string | null;
  /** Depois de quanto tempo sem clique a saída `not_clicked` dispara. */
  remindAfterMinutes: number | null;
};

/** Põe e tira etiquetas da pessoa. Não manda mensagem, então pode vir em qualquer lugar. */
export type TagNode = { id: string; type: "tag"; add: string[]; remove: string[] };

export type ConditionNode = {
  id: string;
  type: "condition";
  check: "follows" | "clicked" | "field" | "tag";
  /** `field`: o campo da ficha comparado. */
  field?: string;
  /** `field`: um valor por saída (`v0` …); o valor inteiro é comparado. */
  values?: string[];
  /** `tag`: a etiqueta conferida. */
  tag?: string;
};

export type FlowNode = TriggerNode | MessageNode | InviteNode | TagNode | ConditionNode;

export type FlowDef = { v: 1; nodes: FlowNode[]; edges: FlowEdge[] };

/** As saídas que a trilha principal segue, em ordem de preferência. */
export const MAIN_OUTS: readonly FlowOut[] = ["next", "replied", "v0", "yes", "clicked"];

const choiceOuts = (n: number): FlowOut[] => Array.from({ length: Math.min(n, MAX_CHOICES) }, (_, i) => choiceOut(i));

export function outsOf(node: FlowNode): FlowOut[] {
  switch (node.type) {
    case "trigger":
      return ["next"];
    case "message":
      if (node.choices && node.choices.length > 0) return [...choiceOuts(node.choices.length), "other", ...(node.wait ? (["timeout"] as const) : [])];
      return node.wait ? ["replied", "timeout"] : ["next"];
    case "invite":
      return ["clicked", "not_clicked"];
    case "tag":
      return ["next"];
    case "condition":
      if (node.check === "field") return [...choiceOuts(node.values?.length ?? 0), "other"];
      return ["yes", "no"];
  }
}

/** A janela da Meta é de 24 h; paramos em 23 pra não disputar o último minuto. */
export const MAX_WAIT_MINUTES = 1380;
/** Limite da Meta para um direct, em BYTES UTF-8 (emoji custa 4). */
export const MAX_MESSAGE_BYTES = 1000;
/** Espaço guardado para o link que o convite acrescenta no fim do texto. */
export const LINK_RESERVE_BYTES = 120;
export const MAX_TEXT_WITH_BUTTON = 640;
export const MAX_BUTTON_LABEL = 20;
export const MAX_KEYWORDS = 10;
export const MAX_KEYWORD_LENGTH = 40;
export const MAX_PUBLIC_REPLY = 300;
export const MAX_NODES = 20;
/** Uma pergunta cheia tem 13 escolhas + `other` + `timeout`. */
export const MAX_EDGES = MAX_NODES * (MAX_CHOICES + 2);
