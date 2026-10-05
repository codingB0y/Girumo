import { MAX_WAIT_MINUTES, type FlowDef } from "./types";

export type RecipeId = "comment_invite" | "comment_follow_invite" | "dm_invite" | "blank";

export type Recipe = {
  id: RecipeId;
  titulo: string;
  descricao: string;
  /** A cadeia mostrada em "Novo fluxo" (chips ligados por setas). */
  cadeia: string[];
  /** Texto curto na coluna "Gatilho" da lista. */
  gatilho: string;
  destaque?: string;
  build: () => FlowDef;
};

/** Textos iniciais; o lojista troca na tela. Sem emoji: a contagem é em bytes. */
export const DEFAULT_TEXTS = {
  convite: "Oi! Aqui está o link do grupo VIP:",
  respostaPublica: "Te chamei no direct.",
  pedeResposta: "Oi! Vi seu comentário. Me responde aqui com OK que eu te mando o link do grupo.",
  pedeSeguir: "Pra receber o link, segue a loja e me responde aqui de novo.",
  lembrete: "Oi! Ainda dá tempo de entrar no grupo. O link está aqui:",
} as const;

const gatilhoComentario = (keywords: string[]) =>
  ({ id: "gatilho", type: "trigger", on: "comment", keywords, postId: null, publicReply: DEFAULT_TEXTS.respostaPublica, storyReplies: false }) as const;

const convite = (remindAfterMinutes: number | null) =>
  ({ id: "convite", type: "invite", text: DEFAULT_TEXTS.convite, campaignSlug: null, remindAfterMinutes }) as const;

export const RECIPES: Record<RecipeId, Recipe> = {
  comment_invite: {
    id: "comment_invite",
    titulo: "Comentou, entra no grupo",
    descricao: "Quem comenta a palavra recebe o link do grupo no direct, na hora.",
    cadeia: ["Comentário", "Direct com o convite do grupo"],
    gatilho: "Comentário",
    destaque: "a mais usada",
    build: () => ({
      v: 1,
      nodes: [gatilhoComentario(["quero", "eu quero"]), convite(null)],
      edges: [{ from: "gatilho", out: "next", to: "convite" }],
    }),
  },
  comment_follow_invite: {
    id: "comment_follow_invite",
    titulo: "Comentou, segue e entra no grupo",
    descricao: "Pede uma resposta, confere se a pessoa segue a loja e lembra quem não clicou.",
    cadeia: ["Comentário", "Direct que pede resposta", "Segue a loja?", "Convite", "Lembrete"],
    gatilho: "Comentário",
    build: () => ({
      v: 1,
      nodes: [
        gatilhoComentario(["quero", "eu quero"]),
        { id: "pede", type: "message", text: DEFAULT_TEXTS.pedeResposta, button: null, wait: { minutes: MAX_WAIT_MINUTES } },
        { id: "segue", type: "condition", check: "follows" },
        { id: "pede_seguir", type: "message", text: DEFAULT_TEXTS.pedeSeguir, button: null, wait: { minutes: MAX_WAIT_MINUTES } },
        convite(60),
        { id: "lembrete", type: "invite", text: DEFAULT_TEXTS.lembrete, campaignSlug: null, remindAfterMinutes: null },
      ],
      edges: [
        { from: "gatilho", out: "next", to: "pede" },
        { from: "pede", out: "replied", to: "segue" },
        { from: "segue", out: "yes", to: "convite" },
        { from: "segue", out: "no", to: "pede_seguir" },
        { from: "pede_seguir", out: "replied", to: "segue" },
        { from: "convite", out: "not_clicked", to: "lembrete" },
      ],
    }),
  },
  dm_invite: {
    id: "dm_invite",
    titulo: "Pediu no direct",
    descricao: "Quem escreve a palavra no direct, ou responde um story, recebe o link do grupo.",
    cadeia: ["Palavra no direct", "Direct com o convite do grupo"],
    gatilho: "Direct ou story",
    build: () => ({
      v: 1,
      nodes: [
        { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero", "grupo"], postId: null, publicReply: null, storyReplies: true },
        convite(null),
      ],
      edges: [{ from: "gatilho", out: "next", to: "convite" }],
    }),
  },
  blank: {
    id: "blank",
    titulo: "Em branco",
    descricao: "Começa só com o gatilho. Você escreve o resto.",
    cadeia: [],
    gatilho: "Comentário",
    build: () => ({
      v: 1,
      nodes: [{ id: "gatilho", type: "trigger", on: "comment", keywords: [], postId: null, publicReply: null, storyReplies: false }],
      edges: [],
    }),
  },
};

export const RECIPE_ORDER: RecipeId[] = ["comment_invite", "comment_follow_invite", "dm_invite", "blank"];

export function isRecipeId(value: unknown): value is RecipeId {
  return typeof value === "string" && (RECIPE_ORDER as string[]).includes(value);
}
