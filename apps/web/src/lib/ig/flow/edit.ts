import { nodeById, targetOf, triggerOf } from "./graph";
import { linearize } from "./linearize";
import { DEFAULT_TEXTS } from "./recipes";
import { MAX_WAIT_MINUTES, type FlowDef, type FlowEdge, type FlowNode, type FlowOut, type InviteNode, type MessageNode, type TriggerNode } from "./types";

/**
 * Edição por operações nomeadas (spec §6): o painel não mexe no grafo à mão,
 * chama estas funções. Todas devolvem um grafo novo; nada é mutado.
 */
export type NodePatch =
  | Partial<Omit<TriggerNode, "id" | "type">>
  | Partial<Omit<MessageNode, "id" | "type">>
  | Partial<Omit<InviteNode, "id" | "type">>;

export function updateNode(def: FlowDef, id: string, patch: NodePatch): FlowDef {
  let nodes = def.nodes.map((n) => (n.id === id ? ({ ...n, ...patch, id: n.id, type: n.type } as FlowNode) : n));
  // O lembrete repete o convite: mudou a campanha num, muda no outro.
  const alvo = nodes.find((n) => n.id === id);
  if (alvo?.type === "invite" && "campaignSlug" in patch) {
    const lembreteId = targetOf(def, id, "not_clicked");
    nodes = nodes.map((n) => (n.id === lembreteId && n.type === "invite" ? { ...n, campaignSlug: alvo.campaignSlug } : n));
  }
  return { ...def, nodes };
}

/** O primeiro convite da trilha principal. */
export function mainInvite(def: FlowDef): InviteNode | undefined {
  return linearize(def)
    .map((p) => p.node)
    .find((n): n is InviteNode => n.type === "invite");
}

export function hasFollowGate(def: FlowDef): boolean {
  return def.nodes.some((n) => n.type === "condition");
}

export function canAddFollowGate(def: FlowDef): boolean {
  const t = triggerOf(def);
  if (!t || t.on !== "comment" || hasFollowGate(def)) return false;
  const alvo = targetOf(def, t.id, "next");
  return alvo !== null && nodeById(def, alvo)?.type === "invite";
}

export function setFollowGate(def: FlowDef, on: boolean): FlowDef {
  const t = triggerOf(def);
  if (!t) return def;
  if (on) {
    if (!canAddFollowGate(def)) return def;
    const convite = targetOf(def, t.id, "next") as string;
    const pede = freshId(def, "pede");
    const segue = freshId(def, "segue");
    const pedeSeguir = freshId(def, "pede_seguir");
    const nodes: FlowNode[] = [
      ...def.nodes.filter((n) => n.id !== convite),
      { id: pede, type: "message", text: DEFAULT_TEXTS.pedeResposta, button: null, wait: { minutes: MAX_WAIT_MINUTES } },
      { id: segue, type: "condition", check: "follows" },
      { id: pedeSeguir, type: "message", text: DEFAULT_TEXTS.pedeSeguir, button: null, wait: { minutes: MAX_WAIT_MINUTES } },
      nodeById(def, convite) as FlowNode,
    ];
    const edges: FlowEdge[] = [
      ...def.edges.filter((e) => !(e.from === t.id && e.out === "next")),
      { from: t.id, out: "next", to: pede },
      { from: pede, out: "replied", to: segue },
      { from: segue, out: "yes", to: convite },
      { from: segue, out: "no", to: pedeSeguir },
      { from: pedeSeguir, out: "replied", to: segue },
    ];
    return ordenar({ ...def, nodes, edges });
  }
  const segue = def.nodes.find((n) => n.type === "condition");
  const pedeId = targetOf(def, t.id, "next");
  const pede = pedeId ? nodeById(def, pedeId) : undefined;
  if (!segue || !pede || pede.type !== "message" || targetOf(def, pede.id, "replied") !== segue.id) return def;
  const pedeSeguir = targetOf(def, segue.id, "no");
  const convite = targetOf(def, segue.id, "yes");
  const remover = new Set([segue.id, pede.id, pedeSeguir].filter((x): x is string => Boolean(x)));
  const base: FlowDef = {
    ...def,
    nodes: def.nodes.filter((n) => !remover.has(n.id)),
    edges: [...def.edges.filter((e) => !remover.has(e.from) && !remover.has(e.to)), ...(convite ? [{ from: t.id, out: "next", to: convite } as FlowEdge] : [])],
  };
  // Sem a resposta não há segundo direct: o lembrete cai junto.
  return ordenar(setReminder(base, false));
}

export function hasReminder(def: FlowDef): boolean {
  const inv = mainInvite(def);
  return !!inv && inv.remindAfterMinutes !== null;
}

export function canAddReminder(def: FlowDef): boolean {
  const inv = mainInvite(def);
  const t = triggerOf(def);
  if (!inv || !t || hasReminder(def)) return false;
  return t.on === "dm" || hasFollowGate(def);
}

export function setReminder(def: FlowDef, on: boolean): FlowDef {
  const inv = mainInvite(def);
  if (!inv) return def;
  if (on) {
    if (!canAddReminder(def)) return def;
    const lembrete = freshId(def, "lembrete");
    const nodes: FlowNode[] = [
      ...def.nodes.map((n) => (n.id === inv.id && n.type === "invite" ? { ...n, remindAfterMinutes: 60 } : n)),
      { id: lembrete, type: "invite", text: DEFAULT_TEXTS.lembrete, campaignSlug: inv.campaignSlug, remindAfterMinutes: null },
    ];
    return ordenar({ ...def, nodes, edges: [...def.edges, { from: inv.id, out: "not_clicked", to: lembrete }] });
  }
  const lembrete = targetOf(def, inv.id, "not_clicked");
  const nodes = def.nodes
    .filter((n) => n.id !== lembrete)
    .map((n) => (n.id === inv.id && n.type === "invite" ? { ...n, remindAfterMinutes: null } : n));
  const edges = def.edges.filter((e) => !(e.from === inv.id && e.out === "not_clicked") && e.from !== lembrete && e.to !== lembrete);
  return ordenar({ ...def, nodes, edges });
}

function freshId(def: FlowDef, base: string): string {
  let id = base;
  for (let i = 2; def.nodes.some((n) => n.id === id); i += 1) id = `${base}_${i}`;
  return id;
}

/** Ordem canônica (trilha primeiro, depois os desvios), para o deepEqual dos testes e um jsonb estável. */
function ordenar(def: FlowDef): FlowDef {
  const ordem = ["gatilho", "pede", "segue", "pede_seguir", "convite", "lembrete"];
  const saidas: FlowOut[] = ["next", "replied", "yes", "no", "clicked", "not_clicked", "timeout"];
  const posicao = (id: string) => (ordem.includes(id) ? ordem.indexOf(id) : ordem.length);
  const nodes = [...def.nodes].sort((a, b) => posicao(a.id) - posicao(b.id));
  const edges = [...def.edges].sort((a, b) => posicao(a.from) - posicao(b.from) || saidas.indexOf(a.out) - saidas.indexOf(b.out));
  return { ...def, nodes, edges };
}
