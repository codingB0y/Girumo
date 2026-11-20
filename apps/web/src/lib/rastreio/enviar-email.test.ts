import assert from "node:assert/strict";
import { test } from "node:test";

import { enviarAvisoPorEmail, enviarEmailsPendentes, proximaTentativa, type DepsDoEnvio } from "./enviar-email";
import type { LojaDoRastreio } from "./loja";
import type { AvisoParaEnviar, PedidoInterno } from "./tipos";

const LOJA: LojaDoRastreio = { tenantId: "t-1", nome: "Loja Exemplo", publicSlug: "loja-exemplo", dominio: null, corPrimaria: "#BE185D", storeWhatsapp: "5511999990000", vipLinkId: null };
const PEDIDO: PedidoInterno = { id: "p-1", numero: "1532", orderCreatedAt: "2026-10-20T13:00:00.000Z", etapa: "enviado", etapaAt: "2026-10-21T13:14:00.000Z", events: [], shipmentService: "Correios SEDEX", trackingCode: "AB123456789BR", trackingUrl: null, linkToken: "0123456789abcdef0123456789abcdef", noticesStoppedAt: null, tenantId: "t-1", externalId: "9001", statusRaw: "on_carriage", buyerFirstName: "Maria", buyerPhone: "5511987654321", buyerEmailEnc: "cifrado" };
const AGORA = new Date("2026-10-29T12:00:00.000Z");
const AVISO: AvisoParaEnviar = { id: "a-1", orderId: "p-1", etapa: "enviado", canal: "email", attempts: 0, resends: 2, messageId: null };

function montar(extra: Partial<DepsDoEnvio> = {}) {
  const marcas: Array<{ id: string; patch: Parameters<DepsDoEnvio["marcar"]>[2] }> = [];
  const enviados: Array<Parameters<DepsDoEnvio["enviar"]>[0]> = [];
  const convites: Array<string | null> = [];
  const deps: DepsDoEnvio = {
    ligado: async () => true, aviso: async () => AVISO, vencidos: async () => [AVISO],
    pedido: async () => PEDIDO, emailDoPedido: () => "maria@exemplo.test", loja: async () => LOJA,
    convite: async (_l, telefone) => { convites.push(telefone); return null; },
    enviar: async (o) => { enviados.push(o); return true; },
    marcar: async (_t, id, patch) => { marcas.push({ id, patch }); },
    agora: () => AGORA,
    ...extra,
  };
  return { deps, marcas, enviados, convites };
}

test("envia com kind rastreio, o nome da loja no remetente e a chave com resends; marca enviado", async () => {
  const { deps, marcas, enviados } = montar({ convite: async () => ({ url: "https://www.girumo.com.br/r/vip-exemplo" }) });
  assert.equal(await enviarAvisoPorEmail("t-1", "a-1", deps), true);
  const e = enviados[0];
  assert.deepEqual([e.to, e.kind, e.tenantId, e.fromName, e.idempotencyKey, e.subject], ["maria@exemplo.test", "rastreio", "t-1", "Loja Exemplo", "rastreio:a-1:2", "Seu pedido nº 1532 foi enviado"]);
  assert.ok(e.html.includes("https://www.girumo.com.br/r/vip-exemplo") && typeof e.text === "string" && e.text.length > 0);
  assert.deepEqual(marcas, [{ id: "a-1", patch: { status: "enviado", sentAt: "2026-10-29T12:00:00.000Z", error: null } }]);
});

test("o convite é decidido com o telefone do pedido", async () => {
  const { deps, convites } = montar();
  await enviarAvisoPorEmail("t-1", "a-1", deps);
  assert.deepEqual(convites, ["5511987654321"]);
});

const PULADOS: Array<[string, Partial<DepsDoEnvio>, string]> = [
  ["loja com o rastreio desligado", { ligado: async () => false }, "rastreio_desligado"],
  ["pedido que sumiu", { pedido: async () => null }, "pedido_nao_encontrado"],
  ["pedido com avisos parados", { pedido: async () => ({ ...PEDIDO, noticesStoppedAt: "2026-10-29T10:00:00.000Z" }) }, "avisos_parados"],
  ["pedido sem e-mail legível", { emailDoPedido: () => null }, "sem_email"],
  ["loja sem config", { loja: async () => null }, "sem_config"],
];
for (const [nome, extra, motivo] of PULADOS) {
  test(`${nome}: marca pulado e não chama o provedor`, async () => {
    const { deps, marcas, enviados } = montar(extra);
    assert.equal(await enviarAvisoPorEmail("t-1", "a-1", deps), false);
    assert.deepEqual(enviados, []);
    assert.deepEqual(marcas, [{ id: "a-1", patch: { status: "pulado", error: motivo } }]);
  });
}

test("o provedor recusa: soma a tentativa e agenda a próxima; a espera cresce e a 5ª falha desiste", async () => {
  const recusa = (attempts: number) => montar({ enviar: async () => false, aviso: async () => ({ ...AVISO, attempts }) });
  const segunda = recusa(1);
  assert.equal(await enviarAvisoPorEmail("t-1", "a-1", segunda.deps), false);
  assert.deepEqual(segunda.marcas, [{ id: "a-1", patch: { status: "pendente", somarTentativa: true, nextTryAt: "2026-10-29T12:30:00.000Z", error: "recusado_pelo_provedor" } }]);
  const quinta = recusa(4);
  await enviarAvisoPorEmail("t-1", "a-1", quinta.deps);
  assert.deepEqual(quinta.marcas, [{ id: "a-1", patch: { status: "falhou", somarTentativa: true, nextTryAt: null, error: "recusado_pelo_provedor" } }]);
  assert.deepEqual([1, 2, 3, 4].map((n) => proximaTentativa(n, AGORA)?.toISOString()), ["2026-10-29T12:05:00.000Z", "2026-10-29T12:30:00.000Z", "2026-10-29T14:00:00.000Z", "2026-10-29T18:00:00.000Z"]);
  assert.equal(proximaTentativa(5, AGORA), null);
});

test("o provedor explode: agenda a próxima com erro_ao_enviar e o log não leva o endereço", async (t) => {
  const erros: string[] = [];
  t.mock.method(console, "error", (...a: unknown[]) => erros.push(a.map(String).join(" ")));
  const { deps, marcas } = montar({ enviar: async () => { throw new Error("resend fora do ar"); } });
  assert.equal(await enviarAvisoPorEmail("t-1", "a-1", deps), false);
  assert.deepEqual(marcas, [{ id: "a-1", patch: { status: "pendente", somarTentativa: true, nextTryAt: "2026-10-29T12:05:00.000Z", error: "erro_ao_enviar" } }]);
  assert.equal(erros.length, 1);
  assert.ok(erros[0].includes("a-1") && !erros[0].includes("maria@exemplo.test") && !erros[0].includes("Maria"));
});

test("nunca lança: provedor e banco explodem; aviso que já saiu não faz nada", async (t) => {
  t.mock.method(console, "error", () => undefined);
  const quebrado = montar({ enviar: async () => { throw new Error("resend fora do ar"); }, marcar: async () => { throw new Error("banco fora do ar"); } });
  assert.equal(await enviarAvisoPorEmail("t-1", "a-1", quebrado.deps), false);
  const semLeitura = montar({ aviso: async () => { throw new Error("banco fora do ar"); } });
  assert.equal(await enviarAvisoPorEmail("t-1", "a-1", semLeitura.deps), false);
  const { deps, marcas, enviados } = montar({ aviso: async () => null });
  assert.equal(await enviarAvisoPorEmail("t-1", "a-9", deps), false);
  assert.deepEqual([...enviados, ...marcas], []);
});

test("enviarEmailsPendentes lê com limite e agora, uma falha não para os outros, devolve quantos saíram", async () => {
  let n = 0;
  let lido: unknown;
  const { deps, marcas } = montar({
    vencidos: async (_t, limite, agora) => { lido = [limite, agora.toISOString()]; return [AVISO, { ...AVISO, id: "a-2" }]; },
    enviar: async () => (n += 1) === 2,
  });
  assert.equal(await enviarEmailsPendentes("t-1", AGORA, undefined, deps), 1);
  assert.deepEqual(lido, [20, "2026-10-29T12:00:00.000Z"]);
  assert.deepEqual(marcas.map((m) => [m.id, m.patch.status]), [["a-1", "pendente"], ["a-2", "enviado"]]);
});

test("enviarEmailsPendentes: a leitura que falha sobe para o cron contar", async () => {
  const { deps } = montar({ vencidos: async () => { throw new Error("banco fora do ar"); } });
  await assert.rejects(enviarEmailsPendentes("t-1", AGORA, undefined, deps), /banco fora do ar/);
});
