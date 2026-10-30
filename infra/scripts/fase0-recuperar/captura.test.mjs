import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { criarCaptura } from "./captura.mjs";
import { prepararBruto } from "./comum.mjs";

const ouvir = (servidor) => new Promise((ok) => servidor.listen(0, "127.0.0.1", () => ok(servidor.address().port)));
const SEGREDO = "segredo-de-teste-da-fase-0";

// `t.after` fecha os servidores mesmo quando uma asserção falha; sem isso um teste vermelho penduraria o runner
async function subir(t) {
  const bruto = prepararBruto(mkdtempSync(join(tmpdir(), "fase0-")));
  writeFileSync(join(bruto, "teste.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const { publico, controle } = criarCaptura({ bruto, tokens: { caminho: "tok", imagem: "img" }, marcas: ["dono@real.com"] });
  const [pp, pc] = [await ouvir(publico), await ouvir(controle)];
  t.after(() => Promise.all([publico, controle].map((s) => new Promise((ok) => { s.close(ok); s.closeAllConnections(); }))));
  return { bruto, pp, pc };
}
const postar = (porta, caminho, corpo, cabecalhos = {}) =>
  fetch(`http://127.0.0.1:${porta}${caminho}`, { method: "POST", body: corpo, headers: { "content-type": "application/json", ...cabecalhos } });

test("aviso da Yampi com marcador é gravado, com o veredito da assinatura", async (t) => {
  const { bruto, pp, pc } = await subir(t);
  await fetch(`http://127.0.0.1:${pc}/segredo`, { method: "POST", body: JSON.stringify({ segredo: SEGREDO }) });
  const corpo = JSON.stringify({ event: "order.created", resource: { customer: { data: { email: "DONO@real.com" } } } });
  const assinatura = createHmac("sha256", SEGREDO).update(corpo).digest("base64");
  const r = await postar(pp, "/yampi/tok", corpo, { "x-yampi-hmac-sha256": assinatura });
  assert.equal(r.status, 200);
  const arquivos = readdirSync(join(bruto, "eventos"));
  assert.deepEqual(arquivos, ["001-yampi-order.created.json"]);
  const salvo = JSON.parse(readFileSync(join(bruto, "eventos", arquivos[0]), "utf8"));
  assert.equal(salvo.assinatura, "ok");
  assert.equal(salvo.body.event, "order.created");
});

test("aviso da Yampi SEM marcador (cliente de verdade) nunca vai para o disco", async (t) => {
  const { bruto, pp } = await subir(t);
  const corpo = JSON.stringify({ event: "cart.reminder", resource: { customer: { data: { name: "Fulana Cliente", email: "fulana@cliente.com" } } } });
  const r = await postar(pp, "/yampi/tok", corpo);
  assert.equal(r.status, 200); // a Yampi não pode contar falha
  assert.deepEqual(readdirSync(join(bruto, "eventos")), []);
  const log = readFileSync(join(bruto, "ignorados.log"), "utf8");
  assert.match(log, /cart\.reminder/);
  assert.ok(!/fulana/i.test(log), "o log de ignorados não pode guardar dado do corpo");
});

test("rota /rejeita responde 401 e registra a chamada sem guardar o corpo (prova S11 do plano 6)", async (t) => {
  const { bruto, pp } = await subir(t);
  const r = await postar(pp, "/rejeita/tok", JSON.stringify({ event: "order.paid", detalhe: "nao-guardar" }));
  assert.equal(r.status, 401);
  const log = readFileSync(join(bruto, "ignorados.log"), "utf8");
  assert.match(log, /rejeita/);
  assert.ok(!/nao-guardar/.test(log));
  assert.deepEqual(readdirSync(join(bruto, "eventos")), []);
});

test("aviso da Evolution é sempre gravado; caminho errado dá 404; imagem exige a assinatura", async (t) => {
  const { bruto, pp } = await subir(t);
  const evo = JSON.stringify({ event: "messages.upsert", data: { key: { remoteJid: "5511999990002@s.whatsapp.net" } } });
  assert.equal((await postar(pp, "/evo/tok", evo)).status, 200);
  assert.deepEqual(readdirSync(join(bruto, "eventos")), ["001-evo-messages.upsert.json"]);
  assert.equal((await postar(pp, "/evo/errado", evo)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${pp}/img/tok/teste.jpg`)).status, 404);
  const img = await fetch(`http://127.0.0.1:${pp}/img/tok/teste.jpg?assinatura=img`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/jpeg");
  assert.ok(existsSync(join(bruto, "teste.jpg")));
});
