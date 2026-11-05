import { MAX_WAIT_MINUTES, type FlowDef } from "./types";

export type RecipeId = "comment_invite" | "comment_confirm_invite" | "comment_choose_group" | "comment_follow_invite" | "dm_invite" | "blank";

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
  confirma: "Oi! Você pediu o link para entrar no nosso grupo VIP do WhatsApp. Quer que eu te envie aqui? Responde SIM, QUERO.",
  conviteComBotao: "Clique no botão abaixo e entre no grupo VIP.",
  botaoConvite: "Entrar no grupo VIP",
  escolheConfirma: "Oi! Vi seu comentário. Quer que eu te envie o link do grupo? Responde SIM.",
  escolheIdade: "É pra qual idade?",
  conviteGrupo: "Aqui está o link do grupo VIP:",
  passaPraLoja: "Já já alguém da loja te responde por aqui.",
} as const;

/** Escolhas de exemplo da receita "Comentou, escolhe o grupo"; o lojista troca pelas dele. */
export const ESCOLHAS_EXEMPLO = ["Até 4 anos", "5 a 8 anos", "9 a 12 anos"] as const;

/** Respostas que liberam o convite na receita de confirmação. */
export const RESPOSTAS_CONFIRMA = ["sim", "quero"];

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
  comment_confirm_invite: {
    id: "comment_confirm_invite",
    titulo: "Comentou, confirma e entra no grupo",
    descricao: "Pergunta no direct se a pessoa quer o link; quando ela responde SIM, o convite chega com botão.",
    cadeia: ["Comentário", "Direct que pergunta", "Resposta SIM", "Convite com botão"],
    gatilho: "Comentário",
    build: () => ({
      v: 1,
      nodes: [
        gatilhoComentario(["quero", "eu quero"]),
        { id: "pergunta", type: "message", text: DEFAULT_TEXTS.confirma, button: null, wait: { minutes: MAX_WAIT_MINUTES, keywords: [...RESPOSTAS_CONFIRMA] } },
        { id: "convite", type: "invite", text: DEFAULT_TEXTS.conviteComBotao, campaignSlug: null, button: DEFAULT_TEXTS.botaoConvite, remindAfterMinutes: null },
      ],
      edges: [
        { from: "gatilho", out: "next", to: "pergunta" },
        { from: "pergunta", out: "replied", to: "convite" },
      ],
    }),
  },
  comment_choose_group: {
    id: "comment_choose_group",
    titulo: "Comentou, escolhe o grupo",
    descricao: "Pergunta se a pessoa quer o link e em qual grupo ela entra; cada escolha leva ao convite certo.",
    cadeia: ["Comentário", "Pergunta: quer o link?", "Pergunta: qual grupo?", "Um convite por escolha", "Outra resposta: passa pra loja"],
    gatilho: "Comentário",
    build: () => ({
      v: 1,
      nodes: [
        gatilhoComentario(["quero", "eu quero"]),
        { id: "pergunta", type: "message", text: DEFAULT_TEXTS.escolheConfirma, button: null, wait: { minutes: MAX_WAIT_MINUTES }, choices: ["Sim, quero"] },
        { id: "idade", type: "message", text: DEFAULT_TEXTS.escolheIdade, button: null, wait: { minutes: MAX_WAIT_MINUTES }, choices: [...ESCOLHAS_EXEMPLO], saveTo: "tamanho" },
        ...ESCOLHAS_EXEMPLO.map((_, i) => ({ id: `convite_${i + 1}`, type: "invite" as const, text: DEFAULT_TEXTS.conviteGrupo, campaignSlug: null, remindAfterMinutes: null })),
        { id: "passa", type: "handoff", text: DEFAULT_TEXTS.passaPraLoja },
      ],
      edges: [
        { from: "gatilho", out: "next", to: "pergunta" },
        { from: "pergunta", out: "v0", to: "idade" },
        { from: "pergunta", out: "other", to: "passa" },
        { from: "idade", out: "other", to: "passa" },
        { from: "idade", out: "v0", to: "convite_1" },
        { from: "idade", out: "v1", to: "convite_2" },
        { from: "idade", out: "v2", to: "convite_3" },
      ],
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

export const RECIPE_ORDER: RecipeId[] = ["comment_invite", "comment_confirm_invite", "comment_choose_group", "comment_follow_invite", "dm_invite", "blank"];

export function isRecipeId(value: unknown): value is RecipeId {
  return typeof value === "string" && (RECIPE_ORDER as string[]).includes(value);
}
