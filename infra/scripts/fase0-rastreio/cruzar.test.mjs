// infra/scripts/fase0-rastreio/cruzar.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { codigosEnviadosNaJanela, cruzar, indexar, linhasDoResultado, normalizarCodigo, resumirEtiquetas, veredito } from "./cruzar.mjs";

const AGORA = Date.parse("2026-11-20T12:00:00Z"); // janela: 2026-10-06 a 2026-11-05
const pedido = (dia, track_code) => ({ created_at: { date: `${dia} 10:00:00.000000`, timezone: "America/Sao_Paulo" }, track_code });

test("normaliza caixa e espaços; vazio vira null", () => {
  assert.equal(normalizarCodigo(" aa 123456789br "), "AA123456789BR");
  assert.equal(normalizarCodigo(""), null);
  assert.equal(normalizarCodigo(null), null);
});

test("só códigos de pedidos criados na janela de 45 a 15 dias, sem repetir", () => {
  const r = codigosEnviadosNaJanela([
    pedido("2026-10-06", "AA111111111BR"), // primeiro dia da janela
    pedido("2026-11-05", "aa111111111br"), // último dia, mesmo código
    pedido("2026-11-06", "AA222222222BR"), // depois da janela
    pedido("2026-10-05", "AA333333333BR"), // antes da janela
    pedido("2026-10-20", null), // na janela, sem código
    { track_code: "AA444444444BR" }, // sem data
  ], AGORA);
  assert.deepEqual(r.codigos, ["AA111111111BR"]);
  assert.deepEqual([r.inicio, r.fim], ["2026-10-06", "2026-11-05"]);
  assert.deepEqual([r.baixados, r.semData, r.naJanela, r.comCodigo], [6, 1, 3, 2]);
  assert.deepEqual([r.maisAntigo, r.maisNovo], ["2026-10-05", "2026-11-06"]);
});

test("acha pelo tracking e pelo self_tracking; o resto fica faltando", () => {
  const indice = indexar([
    { tracking: "AA111111111BR", self_tracking: null },
    { tracking: "ME2211111", self_tracking: "aa222222222br" },
  ]);
  const r = cruzar(["AA111111111BR", "AA222222222BR", "AA999999999BR"], indice);
  assert.deepEqual([r.achadasTracking, r.achadasSelf], [1, 1]);
  assert.deepEqual(r.faltando, ["AA999999999BR"]);
});

test("o resumo das etiquetas só tem contagens e nomes de campo, nunca valores", () => {
  const r = resumirEtiquetas([
    { status: "delivered", tracking: "AA111111111BR", to: { name: "Fulana Teste", document: "11144477735" }, created_at: "2026-10-10 09:00:00", posted_at: "2026-10-11 09:00:00", delivered_at: "2026-10-14 15:00:00", paused_at: null },
    { status: "paused", tracking: "AA222222222BR", to: { name: "Beltrana" }, created_at: "2026-10-12 09:00:00", posted_at: "2026-10-13 09:00:00", motivo_inventado: "Destinatario ausente" },
  ]);
  assert.equal(r.listadas, 2);
  assert.deepEqual(r.porStatus, { delivered: 1, paused: 1 });
  assert.deepEqual(r.datasPorStatus.delivered, { created_at: 1, posted_at: 1, delivered_at: 1 });
  assert.ok(r.chavesEmProblema.includes("motivo_inventado"));
  assert.equal(r.maisAntiga, "2026-10-10");
  const texto = JSON.stringify(r);
  for (const valor of ["Fulana", "Beltrana", "11144477735", "AA111111111BR", "Destinatario"]) assert.ok(!texto.includes(valor), valor);
});

test("nome de campo fora do formato de chave vira `outro`, para um valor nunca sair como chave", () => {
  const r = resumirEtiquetas([{ status: "paused", "AA555555555BR": true, "Rua das Flores 10": 1 }]);
  const texto = JSON.stringify(r);
  for (const valor of ["AA555555555BR", "Rua das Flores"]) assert.ok(!texto.includes(valor), valor);
  assert.ok(r.chaves.includes("outro"));
});

test("veredito: 80% ou mais passa; nenhuma achada não passa; entre os dois, o Igor decide", () => {
  assert.equal(veredito({ codigos: 10, achadas: 8, listadas: 50 }), "PASSA");
  assert.equal(veredito({ codigos: 10, achadas: 7, listadas: 50 }), "DECIDIR");
  assert.equal(veredito({ codigos: 10, achadas: 0, listadas: 50 }), "NAO_PASSA");
  assert.equal(veredito({ codigos: 10, achadas: 0, listadas: 0 }), "NAO_PASSA");
  assert.equal(veredito({ codigos: 0, achadas: 0, listadas: 50 }), "SEM_CODIGOS");
});

test("as linhas do resultado levam a cobertura e o veredito", () => {
  const texto = linhasDoResultado({
    variante: "plana", inicio: "2026-10-06", fim: "2026-11-05", baixados: 120, semData: 0, naJanela: 40, comCodigo: 12,
    maisAntigo: "2026-10-06", maisNovo: "2026-11-05", codigos: 10, listadas: 50, paginas: 4, maisAntiga: "2026-08-30",
    achadasTracking: 7, achadasSelf: 1, achadasNaBusca: 0, buscados: 2, porStatus: { delivered: 30, posted: 20 },
    datasPorStatus: { delivered: { delivered_at: 30 } }, chavesEmProblema: [], veredito: "PASSA",
  });
  assert.match(texto, /\| M3 \| Códigos da Yampi achados no Melhor Envio \| 8 de 10 \(80%\)/);
  assert.match(texto, /\| M7 \| Veredito da prova 5 \| PASSA \|/);
});
