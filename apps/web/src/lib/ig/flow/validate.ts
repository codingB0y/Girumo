import { normalizeForMatch } from "@/lib/ig/match-keyword";
import { utf8Bytes } from "./bytes";
import { hasNode, reachableIds, targetOf } from "./graph";
import {
  LINK_RESERVE_BYTES,
  MAX_MESSAGE_BYTES,
  MAX_TEXT_WITH_BUTTON,
  MAX_WAIT_MINUTES,
  outsOf,
  type FlowDef,
  type FlowOut,
  type TriggerNode,
} from "./types";

export type IssueCode =
  | "sem_gatilho"
  | "gatilhos_demais"
  | "id_duplicado"
  | "aresta_invalida"
  | "sem_palavra"
  | "palavra_repetida"
  | "palavra_em_uso"
  | "texto_vazio"
  | "texto_longo"
  | "botao_vazio"
  | "sem_convite"
  | "sem_campanha"
  | "campanha_inexistente"
  | "espera_longa"
  | "bloco_solto"
  | "botao_no_primeiro_direct"
  | "segundo_direct_sem_resposta"
  | "condicao_cedo"
  | "ciclo_sem_condicao"
  | "sem_conta"
  | "fase_seguinte";

export type Issue = { code: IssueCode; nodeId: string | null; text: string };

export type ValidateContext = {
  /** Slugs das campanhas da loja. `null` = não conferir (cliente sem a lista). */
  campaignSlugs: readonly string[] | null;
  /** `null` = não conferir. */
  accountConnected: boolean | null;
  /** Palavras dos outros fluxos no ar, por tipo de gatilho. */
  keywordsInUse: readonly { on: "comment" | "dm"; keyword: string }[];
};

/**
 * A mesma função roda no painel (lista "Pra publicar") e no servidor (POST
 * /publish). Devolve TUDO que falta, não só o primeiro problema: o lojista
 * resolve a lista de uma vez.
 */
export function validateFlow(def: FlowDef, ctx: ValidateContext): Issue[] {
  const issues: Issue[] = [];
  const add = (code: IssueCode, nodeId: string | null, text: string) => issues.push({ code, nodeId, text });

  const triggers = def.nodes.filter((n): n is TriggerNode => n.type === "trigger");
  if (triggers.length === 0) add("sem_gatilho", null, "O fluxo precisa de um gatilho.");
  if (triggers.length > 1) add("gatilhos_demais", null, "Só pode haver um gatilho por fluxo.");
  const trigger = triggers[0];

  // Id repetido deixaria uma ligação apontar pra dois blocos ao mesmo tempo.
  const idsVistos = new Set<string>();
  for (const node of def.nodes) {
    if (idsVistos.has(node.id)) add("id_duplicado", node.id, "Dois blocos com o mesmo identificador.");
    idsVistos.add(node.id);
  }

  const saidasUsadas = new Set<string>();
  for (const edge of def.edges) {
    const from = def.nodes.find((n) => n.id === edge.from);
    if (!from || !hasNode(def, edge.to) || !outsOf(from).includes(edge.out)) add("aresta_invalida", edge.from, "Ligação inválida.");
    const chave = `${edge.from}:${edge.out}`;
    if (saidasUsadas.has(chave)) add("aresta_invalida", edge.from, "Uma saída não pode ter duas ligações.");
    saidasUsadas.add(chave);
  }

  if (trigger) {
    const palavras = trigger.keywords.map((k) => k.trim()).filter(Boolean);
    if (palavras.length === 0) add("sem_palavra", trigger.id, "Escolha pelo menos uma palavra que dispara.");
    const normalizadas = new Set<string>();
    for (const palavra of palavras) {
      const n = normalizeForMatch(palavra);
      if (normalizadas.has(n)) add("palavra_repetida", trigger.id, `"${palavra}" aparece mais de uma vez.`);
      normalizadas.add(n);
    }
    for (const uso of ctx.keywordsInUse) {
      if (uso.on === trigger.on && normalizadas.has(normalizeForMatch(uso.keyword))) {
        add("palavra_em_uso", trigger.id, `"${uso.keyword}" já dispara outro fluxo no ar.`);
      }
    }
    if (trigger.on === "comment" && trigger.publicReply !== null && trigger.publicReply.trim() === "") {
      add("texto_vazio", trigger.id, "Escreva a resposta pública ou desligue a opção.");
    }
  }

  const alcancaveis = reachableIds(def);
  for (const node of def.nodes) {
    if (!alcancaveis.has(node.id)) add("bloco_solto", node.id, "Este bloco não está ligado ao fluxo.");
  }
  // O destino é sempre o link de uma campanha: sem convite ligado ao gatilho não há o que enviar.
  if (!def.nodes.some((n) => n.type === "invite" && alcancaveis.has(n.id))) {
    add("sem_convite", null, "Falta o convite pro grupo.");
  }

  for (const node of def.nodes) {
    if (node.type === "message") {
      if (node.text.trim() === "") add("texto_vazio", node.id, "Escreva a mensagem deste direct.");
      if (node.button !== null) {
        if (node.button.trim() === "") add("botao_vazio", node.id, "Escreva o texto do botão ou tire o botão.");
        if ([...node.text].length > MAX_TEXT_WITH_BUTTON) add("texto_longo", node.id, `Com botão, a mensagem vai até ${MAX_TEXT_WITH_BUTTON} caracteres.`);
      }
      // Os dois limites valem juntos: com botão, 640 caracteres E 1000 bytes.
      if (utf8Bytes(node.text) > MAX_MESSAGE_BYTES) {
        add("texto_longo", node.id, `Mensagem longa demais: ${utf8Bytes(node.text)} de ${MAX_MESSAGE_BYTES} bytes.`);
      }
      if (node.wait && (node.wait.minutes < 1 || node.wait.minutes > MAX_WAIT_MINUTES)) add("espera_longa", node.id, "A espera vai de 1 minuto a 23 horas.");
    }
    if (node.type === "invite") {
      if (node.text.trim() === "") add("texto_vazio", node.id, "Escreva o texto do convite.");
      if (node.button != null) {
        // Com botão o link vai no botão, não no texto.
        if (node.button.trim() === "") add("botao_vazio", node.id, "Escreva o texto do botão ou tire o botão.");
        if ([...node.text].length > MAX_TEXT_WITH_BUTTON) add("texto_longo", node.id, `Com botão, o convite vai até ${MAX_TEXT_WITH_BUTTON} caracteres.`);
        else if (utf8Bytes(node.text) > MAX_MESSAGE_BYTES) add("texto_longo", node.id, `Convite longo demais: ${utf8Bytes(node.text)} de ${MAX_MESSAGE_BYTES} bytes.`);
      } else if (utf8Bytes(node.text) + LINK_RESERVE_BYTES > MAX_MESSAGE_BYTES) {
        add("texto_longo", node.id, `Convite longo demais: o texto mais o link passam de ${MAX_MESSAGE_BYTES} bytes.`);
      }
      if (node.campaignSlug === null) add("sem_campanha", node.id, "Escolha a campanha do convite.");
      else if (ctx.campaignSlugs && !ctx.campaignSlugs.includes(node.campaignSlug)) add("campanha_inexistente", node.id, "A campanha escolhida não existe mais.");
      if (node.remindAfterMinutes !== null && (node.remindAfterMinutes < 1 || node.remindAfterMinutes > MAX_WAIT_MINUTES)) {
        add("espera_longa", node.id, "O lembrete vai de 1 minuto a 23 horas.");
      }
    }
  }

  // Regras da Meta para quem chegou por comentário: 1 direct, sem botão, e
  // "segue a loja?" só depois de a pessoa mandar mensagem.
  if (trigger?.on === "comment") {
    const primeiroId = targetOf(def, trigger.id, "next");
    const primeiro = primeiroId ? def.nodes.find((n) => n.id === primeiroId) : undefined;
    if ((primeiro?.type === "message" || primeiro?.type === "invite") && primeiro.button != null) {
      add("botao_no_primeiro_direct", primeiro.id, "O primeiro direct depois de um comentário não pode ter botão: o Instagram recusa pra quem não segue a loja, e a recusa gasta o único direct do comentário.");
    }
    for (const id of alcancavelSem(def, trigger.id, "replied")) {
      if (id === trigger.id) continue;
      const node = def.nodes.find((n) => n.id === id);
      if (!node) continue;
      // O primeiro direct é o único permitido; já uma condição logo no começo continua errada.
      if (id === primeiroId && (node.type === "message" || node.type === "invite")) continue;
      if (node.type === "message" || node.type === "invite") {
        add("segundo_direct_sem_resposta", id, "Depois de um comentário só sai um direct. Este só pode vir depois de a pessoa responder.");
      }
      if (node.type === "condition") {
        add("condicao_cedo", id, "“Segue a loja?” só funciona depois de a pessoa responder: o Instagram só revela quem segue depois da primeira mensagem.");
      }
    }
  }

  // Sem as condições e as ligações delas, qualquer ciclo que sobre não passa por condição.
  // (Procurar só o ciclo achado pelo DFS dependia da ordem das ligações.)
  const ids = new Set(def.nodes.filter((n) => n.type !== "condition").map((n) => n.id));
  const semCondicao: FlowDef = {
    ...def,
    nodes: def.nodes.filter((n) => ids.has(n.id)),
    edges: def.edges.filter((e) => ids.has(e.from) && ids.has(e.to)),
  };
  for (const ciclo of ciclos(semCondicao)) {
    add("ciclo_sem_condicao", ciclo[0], "O fluxo volta pra um bloco sem passar por uma condição.");
  }

  if (ctx.accountConnected === false) add("sem_conta", null, "Conecte o Instagram pra publicar.");
  return issues;
}

/** Ids alcançáveis a partir de `start` sem atravessar uma aresta `bloqueada`. */
function alcancavelSem(def: FlowDef, start: string, bloqueada: FlowOut): Set<string> {
  const seen = new Set<string>();
  const stack = [start];
  while (stack.length > 0) {
    const id = stack.pop() as string;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const e of def.edges) {
      if (e.from === id && e.out !== bloqueada && !seen.has(e.to)) stack.push(e.to);
    }
  }
  return seen;
}

/** Cada ciclo como a lista de ids que ele atravessa (DFS com pilha). */
function ciclos(def: FlowDef): string[][] {
  const resultado: string[][] = [];
  const estado = new Map<string, "aberto" | "fechado">();
  const pilha: string[] = [];
  const visitar = (id: string) => {
    estado.set(id, "aberto");
    pilha.push(id);
    for (const e of def.edges) {
      if (e.from !== id) continue;
      const s = estado.get(e.to);
      if (s === "aberto") resultado.push(pilha.slice(pilha.indexOf(e.to)));
      else if (!s && hasNode(def, e.to)) visitar(e.to);
    }
    pilha.pop();
    estado.set(id, "fechado");
  };
  for (const n of def.nodes) if (!estado.has(n.id)) visitar(n.id);
  return resultado;
}

export type GrupoChave = "palavras" | "textos" | "campanha" | "regras" | "ligacoes" | "conta";
export type ChecklistItem = { chave: GrupoChave; rotulo: string; ok: boolean };

const GRUPOS: { chave: GrupoChave; rotulo: string; codes: IssueCode[] }[] = [
  { chave: "palavras", rotulo: "Palavras que disparam", codes: ["sem_gatilho", "gatilhos_demais", "sem_palavra", "palavra_repetida", "palavra_em_uso"] },
  { chave: "textos", rotulo: "Texto de cada direct", codes: ["texto_vazio", "texto_longo", "botao_vazio"] },
  { chave: "campanha", rotulo: "Campanha do convite", codes: ["sem_convite", "sem_campanha", "campanha_inexistente"] },
  { chave: "regras", rotulo: "Regras do Instagram", codes: ["botao_no_primeiro_direct", "segundo_direct_sem_resposta", "condicao_cedo", "espera_longa", "fase_seguinte"] },
  { chave: "ligacoes", rotulo: "Blocos ligados", codes: ["bloco_solto", "ciclo_sem_condicao", "aresta_invalida", "id_duplicado"] },
  { chave: "conta", rotulo: "Conta do Instagram conectada", codes: ["sem_conta"] },
];

/** A que item da lista "Pra publicar" um problema pertence. */
export function grupoDaIssue(code: IssueCode): GrupoChave {
  const grupo = GRUPOS.find((g) => g.codes.includes(code));
  if (!grupo) throw new Error(`IssueCode sem grupo: ${code}`);
  return grupo.chave;
}

/** A lista "Pra publicar" da tela: um item por grupo, feito ou pendente. */
export function checklist(issues: readonly Issue[]): ChecklistItem[] {
  const pendentes = new Set(issues.map((i) => grupoDaIssue(i.code)));
  return GRUPOS.map((g) => ({ chave: g.chave, rotulo: g.rotulo, ok: !pendentes.has(g.chave) }));
}
