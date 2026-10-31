import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { criarCaptura } from "./captura.mjs";
import { gravarJson, prepararBruto } from "./comum.mjs";

// A CLI roda de verdade, contra uma Yampi falsa local (FASE0_YAMPI_BASE) e o servidor de controle da captura.
const CLI = fileURLToPath(new URL("./yampi.mjs", import.meta.url));
const ouvir = (s) => new Promise((ok) => s.listen(0, "127.0.0.1", () => ok(s.address().port)));
const rodar = (args, env) =>
  new Promise((ok) => execFile(process.execPath, [CLI, ...args], { env: { ...process.env, ...env } }, (erro, stdout, stderr) => ok({ codigo: erro?.code ?? 0, saida: stdout + stderr })));
const estado = async (pc) => (await fetch(`http://127.0.0.1:${pc}/estado`)).json();

async function montar(t, responder) {
  const bruto = prepararBruto(mkdtempSync(join(tmpdir(), "fase0-")));
  const { controle } = criarCaptura({ bruto, tokens: { caminho: "tok", imagem: "img" }, marcas: ["dono@real.com"] });
  const yampi = createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const r = responder(req.method, url.pathname, url);
    res.writeHead(r.status ?? 200, { "content-type": "application/json" }).end(JSON.stringify(r.json ?? {}));
  });
  const [pc, py] = [await ouvir(controle), await ouvir(yampi)];
  t.after(() => Promise.all([controle, yampi].map((s) => new Promise((ok) => { s.close(ok); s.closeAllConnections(); }))));
  gravarJson(join(bruto, "urls.json"), { yampi: "https://tunel.example/yampi/tok" });
  const env = {
    FASE0_BRUTO: bruto,
    FASE0_PORTA: String(pc - 1), // a CLI entrega o segredo em FASE0_PORTA + 1
    FASE0_YAMPI_BASE: `http://127.0.0.1:${py}`,
    YAMPI_ALIAS: "lojinha-real",
    YAMPI_USER_TOKEN: "token-de-teste",
    YAMPI_USER_SECRET_KEY: "chave-de-teste",
    FASE0_MARCADORES: "dono@real.com,987654321",
  };
  return { bruto, pc, env };
}

test("webhook-criar entrega o segredo só ao servidor local e grava um marcador do mesmo tamanho", async (t) => {
  const segredo = "x9".repeat(20);
  const { bruto, pc, env } = await montar(t, (metodo, caminho) =>
    metodo === "POST" && caminho.endsWith("/webhooks") ? { status: 201, json: { data: { id: 7, name: "girumo-fase0-recuperar", active: true, secret_key: segredo } } } : { status: 404 },
  );
  const r = await rodar(["webhook-criar"], env);
  assert.equal(r.codigo, 0, r.saida);
  assert.ok(!r.saida.includes(segredo));
  const criado = readFileSync(join(bruto, "api", "webhook-criado.json"), "utf8");
  assert.equal(JSON.parse(criado).data.secret_key.length, 40); // S3 do plano 6 confere string de 16+
  assert.ok(!criado.includes(segredo));
  assert.equal((await estado(pc)).temSegredo, true);
});

test("webhook-criar sem secret_key na resposta não entrega nada: a assinatura sai sem_segredo, não invalido", async (t) => {
  const { bruto, pc, env } = await montar(t, (metodo) => (metodo === "POST" ? { status: 201, json: { data: { id: 8, name: "girumo-fase0-recuperar", active: true } } } : { status: 404 }));
  const r = await rodar(["webhook-criar"], env);
  assert.match(r.saida, /sem secret_key/);
  assert.equal((await estado(pc)).temSegredo, false);
  assert.equal(JSON.parse(readFileSync(join(bruto, "estado.json"), "utf8")).yampiWebhookId, 8);
});

test("atualizados (Y26): sem filtro e 4 variantes por forma, com fim hoje e amanhã e janela de hora estreita", async (t) => {
  const filtros = [];
  const { bruto, env } = await montar(t, (metodo, caminho, url) => {
    if (!caminho.endsWith("/orders")) return { status: 404 };
    filtros.push(url.searchParams.get("date") ?? url.searchParams.get("filters[date]") ?? "-");
    return { json: { data: [], meta: { pagination: { total: 0, total_pages: 1 } } } };
  });
  const r = await rodar(["atualizados"], env);
  assert.equal(r.codigo, 0, r.saida);
  const dia = (n) => new Date(Date.now() - 3 * 36e5 - n * 864e5).toISOString().slice(0, 10); // dia de Brasília, n dias atrás
  assert.equal(filtros.length, 9);
  for (const esperado of [`updated_at:${dia(2)}|${dia(-1)}`, `updated_at:${dia(0)} 00:00:00|${dia(0)} 00:00:01`]) {
    assert.equal(filtros.filter((f) => f === esperado).length, 2, esperado); // uma na forma plana, outra em filters[]
  }
  const arquivos = readdirSync(join(bruto, "api"));
  for (const rotulo of ["sem-filtro", "plana-ate-hoje", "plana-ate-amanha", "plana-hora-dia", "plana-hora-estreita", "filters-ate-hoje", "filters-ate-amanha", "filters-hora-dia", "filters-hora-estreita"]) {
    assert.ok(arquivos.includes(`atualizados-${rotulo}.json`), rotulo);
  }
});

test("pedidos-pix baixa a lista mas só grava o pedido da cliente de teste (o telefone B no Pix da loja não conta)", async (t) => {
  const pedidos = [
    { id: 1, customer: { data: { email: "fulana@cliente.com" } }, transactions: { data: [{ metadata: [{ value: "000201...0114+5521987654321" }] }] } },
    { id: 2, customer: { data: { email: "DONO@real.com" } } },
  ];
  const { bruto, env } = await montar(t, (metodo, caminho) => {
    if (caminho.endsWith("/checkout/statuses")) return { json: { data: [{ id: 3, alias: "waiting_payment" }] } };
    if (caminho.endsWith("/orders")) return { json: { data: pedidos, meta: { pagination: { total: 2, total_pages: 1 } } } };
    return { status: 404 };
  });
  const r = await rodar(["pedidos-pix"], env);
  assert.equal(r.codigo, 0, r.saida);
  assert.ok(!/fulana/i.test(r.saida));
  for (const nome of readdirSync(join(bruto, "api"))) assert.ok(!/fulana/i.test(readFileSync(join(bruto, "api", nome), "utf8")), `${nome} guardou cliente de verdade`);
  assert.deepEqual(JSON.parse(readFileSync(join(bruto, "api", "lista-pedidos-plana.json"), "utf8")).data.map((p) => p.id), [2]);
});
