import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowDef, FlowOut } from "@/lib/ig/flow/types";
import { createFakeTransport } from "@/lib/ig/transport/fake";
import { advance, type Deps, type RunState } from "./advance";
import { contatoDaPessoa } from "./ficha";
import { criarContatosFalsos } from "./ficha-falsa";

const agora = () => new Date("2026-10-06T12:00:00Z");
const dm: RunState = { id: "run-1", flowId: "f1", ref: "ref123456789", sourceKind: "dm", providerAccountId: "z1", comment: null, conversationId: "conv-9", windowExpiresAt: "2026-10-07T12:00:00Z", directsSent: 0 };
const fluxo = (text: string | null): FlowDef => ({
  v: 1,
  nodes: [
    { id: "gatilho", type: "trigger", on: "dm", keywords: ["oi"], postId: null, publicReply: null, storyReplies: false },
    { id: "loja", type: "handoff", text },
  ],
  edges: [{ from: "gatilho", out: "next", to: "loja" }],
});

function montar() {
  const { transport, chamadas } = createFakeTransport();
  const passos: Array<[string, FlowOut]> = [];
  const enviados: string[] = [];
  const { contatos } = criarContatosFalsos({ inicial: { ig_user_id: "u1" } });
  const deps: Deps = { transport, now: agora, contato: contatoDaPessoa(contatos, "loja-a", "u1", null, agora().toISOString()), link: async () => "x", step: async (n, o) => { passos.push([n, o]); }, enviado: (_n, _m, tipo) => { enviados.push(tipo); } };
  return { deps, chamadas, passos, enviados };
}

test("handoff com texto: manda o direct, encerra o run e avisa que passou pra loja", async () => {
  const { deps, chamadas, passos, enviados } = montar();
  const r = await advance(fluxo("Já já alguém te responde."), dm, deps);
  assert.equal(r.status, "done");
  assert.equal(r.handoff, true);
  assert.equal(r.nodeId, "loja");
  assert.equal(r.directsSent, 1);
  assert.deepEqual(chamadas.map((c) => c.metodo), ["sendMessage"]);
  assert.ok(chamadas[0].metodo === "sendMessage" && chamadas[0].args.message === "Já já alguém te responde.");
  assert.deepEqual(enviados, ["handoff"]);
  assert.deepEqual(passos, [["gatilho", "next"], ["loja", "next"]]);
});

test("handoff sem texto não manda nada, mas passa pra loja", async () => {
  const { deps, chamadas } = montar();
  const r = await advance(fluxo(null), dm, deps);
  assert.deepEqual([r.status, r.handoff, r.directsSent], ["done", true, 0]);
  assert.deepEqual(chamadas, []);
});

test("handoff fora da janela de 24 h não manda o texto e ainda passa pra loja", async () => {
  const { deps, chamadas } = montar();
  const r = await advance(fluxo("Já já."), { ...dm, windowExpiresAt: "2026-10-06T11:00:00Z" }, deps);
  assert.deepEqual([r.status, r.handoff, r.directsSent], ["done", true, 0]);
  assert.deepEqual(chamadas, []);
});

test("handoff logo depois de um comentário usa a resposta privada", async () => {
  const { deps, chamadas } = montar();
  const base = fluxo("Já já.");
  const def: FlowDef = { ...base, nodes: base.nodes.map((n) => (n.type === "trigger" ? { ...n, on: "comment" as const } : n)) };
  const r = await advance(def, { ...dm, sourceKind: "comment", comment: { platformPostId: "p", commentId: "c" }, conversationId: null, windowExpiresAt: "2026-10-13T12:00:00Z" }, deps);
  assert.equal(r.handoff, true);
  assert.deepEqual(chamadas.map((c) => c.metodo), ["privateReply"]);
});
