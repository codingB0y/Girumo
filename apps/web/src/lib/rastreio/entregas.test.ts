import assert from "node:assert/strict";
import { test } from "node:test";
import {
  corDoMedidor, diasSemCodigo, linhaDeEntrega, novidadeDaLinha, parseFiltroDeEntregas, resumoDosAvisos, rotuloDaSituacao,
  type AvisoDoPedido, type PedidoDaLista,
} from "@/lib/rastreio/entregas";

const agora = new Date("2026-10-29T15:00:00Z");
const pedido = (extra: Partial<PedidoDaLista> = {}): PedidoDaLista => ({
  id: "ped-1", numero: "1001", buyerFirstName: "Ana", buyerPhone: "5511987654321", etapa: "separando", etapaAt: "2026-10-25T15:00:00Z",
  trackingCode: null, statusRaw: "invoiced", linkToken: "0".repeat(32), ...extra,
});

test("filtro desconhecido volta para todos", () => {
  assert.equal(parseFiltroDeEntregas("problema"), "problema");
  assert.equal(parseFiltroDeEntregas("hack"), "todos");
  assert.equal(parseFiltroDeEntregas(null), "todos");
});

test("sem código: faturado, sem código e parado há 2 dias ou mais", () => {
  assert.equal(diasSemCodigo(pedido(), agora), 4);
  assert.equal(diasSemCodigo(pedido({ statusRaw: "handling_products" }), agora), null);
  assert.equal(diasSemCodigo(pedido({ trackingCode: "AB123456789BR" }), agora), null);
  assert.equal(diasSemCodigo(pedido({ etapaAt: "2026-10-28T15:00:00Z" }), agora), null);
  assert.equal(diasSemCodigo(pedido({ etapa: "enviado" }), agora), null);
});

test("situação por etapa", () => {
  assert.deepEqual(rotuloDaSituacao({ etapa: "enviado", semCodigoHaDias: null }), { texto: "A caminho", tom: "neutro" });
  assert.equal(rotuloDaSituacao({ etapa: "retirada", semCodigoHaDias: null }).texto, "Pronto para retirada");
  assert.deepEqual(rotuloDaSituacao({ etapa: "problema", semCodigoHaDias: null }), { texto: "Problema na entrega", tom: "risco" });
  assert.deepEqual(rotuloDaSituacao({ etapa: "entregue", semCodigoHaDias: null }), { texto: "Entregue", tom: "ok" });
  assert.deepEqual(rotuloDaSituacao({ etapa: "separando", semCodigoHaDias: 4 }), { texto: "Sem código há 4 dias", tom: "atencao" });
  assert.deepEqual(rotuloDaSituacao({ etapa: "separando", semCodigoHaDias: null }), { texto: "Em separação", tom: "neutro" });
});

test("novidade usa o dia de Brasília", () => {
  assert.equal(novidadeDaLinha({ etapa: "enviado", etapaAt: "2026-10-22T01:30:00Z" }), "Postado · 21/10");
  const etapaAt = "2026-10-27T15:00:00Z";
  assert.equal(novidadeDaLinha({ etapa: "problema", etapaAt }), "Falha na entrega · 27/10");
  assert.equal(novidadeDaLinha({ etapa: "retirada", etapaAt }), "Na agência · 27/10");
  assert.equal(novidadeDaLinha({ etapa: "entregue", etapaAt }), "Entregue · 27/10");
  assert.equal(novidadeDaLinha({ etapa: "separando", etapaAt }), "Em separação · 27/10");
});

test("resumo dos avisos, WhatsApp primeiro", () => {
  assert.deepEqual(resumoDosAvisos([{ canal: "email", status: "enviado" }, { canal: "whatsapp", status: "lido" }]),
    [{ texto: "WhatsApp lido", falhou: false }, { texto: "e-mail enviado", falhou: false }]);
  assert.deepEqual(resumoDosAvisos([{ canal: "whatsapp", status: "falhou" }, { canal: "email", status: "enviado" }]),
    [{ texto: "WhatsApp falhou", falhou: true }, { texto: "e-mail enviado", falhou: false }]);
  assert.deepEqual(resumoDosAvisos([{ canal: "whatsapp", status: "entregue" }]), [{ texto: "WhatsApp entregue", falhou: false }]);
  assert.deepEqual(resumoDosAvisos([{ canal: "whatsapp", status: "pendente" }, { canal: "email", status: "enviando" }]),
    [{ texto: "WhatsApp na fila", falhou: false }, { texto: "e-mail na fila", falhou: false }]);
  const nenhum = [{ texto: "nenhum ainda", falhou: false }];
  assert.deepEqual(resumoDosAvisos([{ canal: "whatsapp", status: "pulado" }]), nenhum);
  assert.deepEqual(resumoDosAvisos([]), nenhum);
});

test("linha: telefone só no problema, avisos só da etapa atual", () => {
  const avisos: AvisoDoPedido[] = [
    { orderId: "ped-1", etapa: "enviado", canal: "whatsapp", status: "lido" },
    { orderId: "ped-1", etapa: "problema", canal: "whatsapp", status: "falhou" },
    { orderId: "outro", etapa: "problema", canal: "email", status: "enviado" },
  ];
  const l = linhaDeEntrega(pedido({ etapa: "problema" }), avisos, "https://x/y", agora);
  assert.equal(l.telefone, "5511987654321");
  assert.deepEqual(l.avisos, [{ texto: "WhatsApp falhou", falhou: true }]);
  assert.equal(l.podeReenviar, true);
  assert.equal(linhaDeEntrega(pedido({ etapa: "enviado" }), avisos, null, agora).telefone, null);
  assert.equal(linhaDeEntrega(pedido({ etapa: "separando" }), avisos, null, agora).podeReenviar, false);
});

test("medidor", () => {
  assert.equal(corDoMedidor(14, 15), "ok");
  assert.equal(corDoMedidor(4, 5), "ok");
  assert.equal(corDoMedidor(11, 15), "atencao");
  assert.equal(corDoMedidor(0, 0), "ok");
});
