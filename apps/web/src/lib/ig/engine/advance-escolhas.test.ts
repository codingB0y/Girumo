import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowDef, FlowEdge, FlowNode, FlowOut } from "@/lib/ig/flow/types";
import { createFakeTransport } from "@/lib/ig/transport/fake";
import { ZernioError } from "@/lib/ig/transport/types";
import type { IgContactRow } from "@/lib/stores/ig-contacts";
import { advance, EsperaIncerta, type Deps, type RunState } from "./advance";
import { contatoDaPessoa } from "./ficha";
import { criarContatosFalsos } from "./ficha-falsa";

const agora = () => new Date("2026-10-06T12:00:00Z");
const dm: RunState = { id: "run-1", flowId: "f1", ref: "ref123456789", sourceKind: "dm", providerAccountId: "z1", comment: null, conversationId: "conv-1", windowExpiresAt: "2026-10-07T12:00:00Z", directsSent: 0 };
const comentario: RunState = { ...dm, sourceKind: "comment", comment: { platformPostId: "post", commentId: "com" }, conversationId: null, windowExpiresAt: "2026-10-13T12:00:00Z" };

function montar(opts: Parameters<typeof createFakeTransport>[0] = {}, inicial: Partial<IgContactRow> = {}, falharAplicar: boolean | number = false) {
  const { transport, chamadas } = createFakeTransport(opts);
  const passos: Array<[string, FlowOut]> = [];
  const { contatos, aplicacoes } = criarContatosFalsos({ falharAplicar: falharAplicar === true, falharPrimeiras: typeof falharAplicar === "number" ? falharAplicar : 0, inicial: { ig_user_id: "u1", ...inicial } });
  const contato = contatoDaPessoa(contatos, "loja-a", "u1", null, agora().toISOString());
  const deps: Deps = { transport, now: agora, contato, link: async (slug, ref) => `https://app/r/${slug}?ig=${ref}`, step: async (n, o) => { passos.push([n, o]); } };
  return { deps, chamadas, passos, aplicacoes };
}

const gatilho = (on: "dm" | "comment"): FlowNode => ({ id: "gatilho", type: "trigger", on, keywords: ["quero"], postId: null, publicReply: null, storyReplies: false });
const pergunta = (extra: Partial<Extract<FlowNode, { type: "message" }>> = {}): FlowNode => ({ id: "q", type: "message", text: "Qual o tamanho?", button: null, wait: { minutes: 60 }, choices: ["Sim, quero", "Não"], ...extra });
const convite: FlowNode = { id: "convite", type: "invite", text: "Link:", campaignSlug: "vip", remindAfterMinutes: null };
const flow = (nodes: FlowNode[], edges: FlowEdge[]): FlowDef => ({ v: 1, nodes, edges });
const lig = (from: string, out: FlowOut, to: string): FlowEdge => ({ from, out, to });

test("pergunta com escolhas no direct: respostas rápidas com o título inteiro e payload run:bloco:i; o run espera", async () => {
  const { deps, chamadas } = montar();
  const r = await advance(flow([gatilho("dm"), pergunta()], [lig("gatilho", "next", "q")]), dm, deps);
  assert.deepEqual([r.status, r.waiting, r.nodeId], ["active", "reply", "q"]);
  const envio = chamadas[0];
  assert.ok(envio.metodo === "sendMessage");
  assert.deepEqual(envio.args.quickReplies, [{ title: "Sim, quero", payload: "run-1:q:0" }, { title: "Não", payload: "run-1:q:1" }]);
  assert.equal(envio.args.buttons, undefined);
});

test("1º direct depois de comentário: só texto, nenhuma resposta rápida", async () => {
  const { deps, chamadas } = montar();
  const r = await advance(flow([gatilho("comment"), pergunta()], [lig("gatilho", "next", "q")]), comentario, deps);
  assert.equal(r.waiting, "reply");
  const privada = chamadas[0];
  assert.ok(privada.metodo === "privateReply");
  assert.equal(privada.args.quickReplies, undefined);
  assert.equal(privada.args.message, "Qual o tamanho?");
});

test("a Zernio recusa as respostas rápidas (400): reenvia o texto puro com outra chave e segue esperando", async () => {
  const recusa = new ZernioError(400, "invalid_request_error", "validation_error", null, "quickReplies inválido");
  const { deps, chamadas } = montar({ recusarQuickReplies: recusa });
  const r = await advance(flow([gatilho("dm"), pergunta()], [lig("gatilho", "next", "q")]), dm, deps);
  assert.deepEqual([r.status, r.waiting], ["active", "reply"]);
  assert.equal(chamadas.length, 2);
  const [a, b] = chamadas;
  assert.ok(a.metodo === "sendMessage" && b.metodo === "sendMessage");
  assert.equal(a.args.idempotencyKey, "run-1:q");
  assert.equal(b.args.idempotencyKey, "run-1:q:texto");
  assert.equal(b.args.quickReplies, undefined);
  assert.equal(b.args.message, "Qual o tamanho?");
});

test("erro passageiro com respostas rápidas não cai no texto puro: vira espera incerta como antes", async () => {
  const fora = new ZernioError(503, "api_error", "temporarily_unavailable", null, "x");
  const { deps, chamadas } = montar({ falhar: { sendMessage: fora } });
  await assert.rejects(() => advance(flow([gatilho("dm"), pergunta()], [lig("gatilho", "next", "q")]), dm, deps), (e: unknown) => e instanceof EsperaIncerta);
  assert.equal(chamadas.length, 1);
});

test("retomada por escolha: guarda o texto inteiro da escolha, grava o passo v<i> e segue a ligação", async () => {
  const def = flow([gatilho("dm"), pergunta({ saveTo: "interesse" }), convite], [lig("gatilho", "next", "q"), lig("q", "v0", "convite")]);
  const { deps, chamadas, passos, aplicacoes } = montar();
  const r = await advance(def, { ...dm, directsSent: 1 }, deps, { nodeId: "q", out: "v0", guardar: { campo: "interesse", valor: "Sim, quero" } });
  assert.deepEqual([r.status, r.nodeId], ["done", "convite"]);
  assert.deepEqual(passos, [["q", "v0"]]);
  assert.deepEqual(aplicacoes[0].set, { interesse: "Sim, quero" });
  assert.equal(chamadas.length, 1);
});

test("etiqueta logo depois do gatilho: aplica, não manda nada, não gasta direct; o 1º direct do comentário continua sendo a privada", async () => {
  const def = flow([gatilho("comment"), { id: "t", type: "tag", add: ["quer-infantil"], remove: ["frio"] }, convite], [lig("gatilho", "next", "t"), lig("t", "next", "convite")]);
  const { deps, chamadas, passos, aplicacoes } = montar({}, { tags: ["frio"] });
  const r = await advance(def, comentario, deps);
  assert.deepEqual([r.status, r.directsSent], ["done", 1]);
  assert.deepEqual(chamadas.map((c) => c.metodo), ["privateReply"]);
  assert.deepEqual(aplicacoes.map((a) => [a.add, a.remove]), [[["quer-infantil"], ["frio"]]]);
  assert.deepEqual(passos, [["gatilho", "next"], ["t", "next"]]);
});

test("Se… campo logo depois da pergunta enxerga o valor recém-gravado (sem acento nem caixa); sem casar vai para other", async () => {
  const def = flow(
    [gatilho("dm"), pergunta({ saveTo: "cidade", choices: ["Goiânia", "Rio"] }), { id: "c", type: "condition", check: "field", field: "cidade", values: ["goiania", "rio"] }, { ...convite, id: "i0" }, { ...convite, id: "i1" }, { ...convite, id: "io" }],
    [lig("q", "v0", "c"), lig("q", "v1", "c"), lig("q", "other", "c"), lig("c", "v0", "i0"), lig("c", "v1", "i1"), lig("c", "other", "io")],
  );
  const a = montar();
  const ra = await advance(def, { ...dm, directsSent: 1 }, a.deps, { nodeId: "q", out: "v0", guardar: { campo: "cidade", valor: "Goiânia" } });
  assert.equal(ra.nodeId, "i0");
  assert.deepEqual(a.passos, [["q", "v0"], ["c", "v0"]]);
  const b = montar();
  const rb = await advance(def, { ...dm, directsSent: 1 }, b.deps, { nodeId: "q", out: "other", guardar: { campo: "cidade", valor: "sei lá" } });
  assert.equal(rb.nodeId, "io");
  assert.deepEqual(b.passos[1], ["c", "other"]);
});

test("Se… etiqueta: yes com a etiqueta, no sem; saída sem ligação encerra", async () => {
  const def = flow([gatilho("dm"), { id: "c", type: "condition", check: "tag", tag: "vip" }, convite], [lig("gatilho", "next", "c"), lig("c", "yes", "convite")]);
  const com = await advance(def, dm, montar({}, { tags: ["vip"] }).deps);
  assert.deepEqual([com.status, com.nodeId], ["done", "convite"]);
  const sem = montar();
  const rs = await advance(def, dm, sem.deps);
  assert.deepEqual([rs.status, rs.nodeId], ["done", "c"]);
  assert.deepEqual(sem.chamadas, []);
  assert.deepEqual(sem.passos, [["gatilho", "next"], ["c", "no"]]);
});

test("Se… segue/clicou ainda não rodam; laço só de etiquetas para em 2 visitas", async () => {
  const follows = flow([gatilho("dm"), { id: "c", type: "condition", check: "follows" }], [lig("gatilho", "next", "c")]);
  const rf = await advance(follows, dm, montar().deps);
  assert.deepEqual([rf.status, rf.errorCode], ["failed", "unsupported_node"]);
  const laco = flow([gatilho("dm"), { id: "a", type: "tag", add: ["x"], remove: [] }, { id: "b", type: "tag", add: ["y"], remove: [] }], [lig("gatilho", "next", "a"), lig("a", "next", "b"), lig("b", "next", "a")]);
  const rl = await advance(laco, dm, montar().deps);
  assert.deepEqual([rl.status, rl.errorCode], ["failed", "cycle"]);
});

test("a gravação do Guardar em falha: a resposta não se perde, o run segue e o Se… seguinte ainda enxerga o valor", async () => {
  const def = flow(
    [gatilho("dm"), pergunta({ saveTo: "cidade", choices: ["Goiânia", "Rio"] }), { id: "c", type: "condition", check: "field", field: "cidade", values: ["goiania", "rio"] }, { ...convite, id: "i0" }, { ...convite, id: "i1" }],
    [lig("q", "v0", "c"), lig("q", "v1", "c"), lig("c", "v0", "i0"), lig("c", "v1", "i1")],
  );
  const { deps, passos } = montar({}, {}, true);
  const erro = console.error;
  const logs: unknown[][] = [];
  console.error = (...a: unknown[]) => { logs.push(a); };
  try {
    const r = await advance(def, { ...dm, directsSent: 1 }, deps, { nodeId: "q", out: "v1", guardar: { campo: "cidade", valor: "Rio" } });
    assert.deepEqual([r.status, r.nodeId], ["done", "i1"]);
    assert.deepEqual(passos, [["q", "v1"], ["c", "v1"]]);
  } finally {
    console.error = erro;
  }
  assert.equal(logs.length, 1, "registra a falha uma vez");
});

test("Se… com saída já gravada neste run reusa a saída em vez de reavaliar, e não grava o passo de novo", async () => {
  const def = flow([gatilho("dm"), { id: "c", type: "condition", check: "tag", tag: "vip" }, { ...convite, id: "sim" }, { ...convite, id: "nao" }], [lig("gatilho", "next", "c"), lig("c", "yes", "sim"), lig("c", "no", "nao")]);
  const { deps, passos } = montar({}, { tags: ["vip"] });
  const r = await advance(def, dm, { ...deps, saidasGravadas: new Map<string, FlowOut>([["c", "no"]]) });
  assert.equal(r.nodeId, "nao");
  assert.deepEqual(passos, [["gatilho", "next"]]);
});

test("Guardar em falhou e uma Etiqueta gravou depois: o Se… seguinte ainda enxerga o valor guardado", async () => {
  const def = flow(
    [gatilho("dm"), pergunta({ saveTo: "cidade", choices: ["Goiânia", "Rio"] }), { id: "t", type: "tag", add: ["x"], remove: [] }, { id: "c", type: "condition", check: "field", field: "cidade", values: ["goiania", "rio"] }, { ...convite, id: "i0" }, { ...convite, id: "i1" }],
    [lig("q", "v1", "t"), lig("t", "next", "c"), lig("c", "v0", "i0"), lig("c", "v1", "i1")],
  );
  const { deps } = montar({}, {}, 1);
  const erro = console.error;
  console.error = () => {};
  try {
    const r = await advance(def, { ...dm, directsSent: 1 }, deps, { nodeId: "q", out: "v1", guardar: { campo: "cidade", valor: "Rio" } });
    assert.equal(r.nodeId, "i1");
  } finally {
    console.error = erro;
  }
});
