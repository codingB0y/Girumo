import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import { lerContato, lerContatosPorIds, paginaDaLista, recalcularListas, salvarContato } from "./bling-contatos";

/** O cliente real do Supabase contra um PostgREST de mentira (molde de `site-captures.test.ts`). */

type Chamada = { metodo: string; url: URL; prefer: string; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500, corpo: { message: "sem resposta" } });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      prefer: String(req.headers.prefer ?? ""),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  chamadas.length = 0;
});

const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([chave]) => chave !== "select"));

const HASHES = { ph: ["a1", "b2"], fn: "c3", external_id: "d4" };
const LINHA = {
  bling_contact_id: "555",
  name: "Maria Silva",
  person_type: "F",
  phone: "5562999998888",
  phone_key: "6299998888",
  meta_hashes: HASHES,
  lista: "comprador",
  fetched_at: "2026-10-13T15:00:00+00:00",
};
const CONTATO = {
  blingContactId: 555,
  name: "Maria Silva",
  personType: "F",
  phone: "5562999998888",
  phoneKey: "6299998888",
  metaHashes: HASHES,
  lista: "comprador",
  fetchedAt: "2026-10-13T15:00:00+00:00",
};

test("salvar contato: upsert por (loja, contato), carimba fetched_at e nunca escreve phone_key nem lista", async () => {
  responder = () => ({ status: 201, corpo: LINHA });

  const salvo = await salvarContato("loja-a", {
    blingContactId: 555,
    name: "Maria Silva",
    personType: "F",
    phone: "5562999998888",
    metaHashes: HASHES,
  });

  // Devolve a phone_key que o banco gerou.
  assert.deepEqual(salvo, CONTATO);
  const [{ metodo, url, prefer, corpo }] = chamadas;
  assert.deepEqual([metodo, url.pathname], ["POST", "/rest/v1/bling_contacts"]);
  assert.equal(url.searchParams.get("on_conflict"), "tenant_id,bling_contact_id");
  assert.match(prefer, /resolution=merge-duplicates/);
  const gravado = { ...(corpo as Record<string, unknown>) };
  assert.match(String(gravado.fetched_at), /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(
    { ...gravado, fetched_at: "agora" },
    {
      tenant_id: "loja-a",
      bling_contact_id: 555,
      name: "Maria Silva",
      person_type: "F",
      phone: "5562999998888",
      meta_hashes: HASHES,
      fetched_at: "agora",
    },
  );
});

test("erro ao salvar o contato sobe com a mensagem", async () => {
  responder = () => ({ status: 400, corpo: { message: "violates check constraint" } });
  await assert.rejects(
    salvarContato("loja-a", { blingContactId: 1, name: null, personType: null, phone: null, metaHashes: {} }),
    /check constraint/,
  );
});

test("ler contato: filtra loja e id; ausente é null; hashes tortos viram {}", async () => {
  responder = () => ({ status: 200, corpo: [LINHA] });
  assert.deepEqual(await lerContato("loja-a", 555), CONTATO);
  assert.deepEqual(filtros(chamadas[0].url), { tenant_id: "eq.loja-a", bling_contact_id: "eq.555", limit: "1" });

  responder = () => ({ status: 200, corpo: [] });
  assert.equal(await lerContato("loja-a", 556), null);

  // Hash fora do formato não vai pro Meta nem pro CSV.
  responder = () => ({ status: 200, corpo: [{ ...LINHA, meta_hashes: { em: "nao-e-lista" } }] });
  assert.deepEqual((await lerContato("loja-a", 555))?.metaHashes, {});
});

test("recalcular listas: rpc com o contato, ou null para a loja toda; devolve quantos mudaram", async () => {
  responder = () => ({ status: 200, corpo: 3 });

  assert.equal(await recalcularListas("loja-a", 555), 3);
  assert.equal(await recalcularListas("loja-a"), 3);

  assert.deepEqual(
    chamadas.map((c) => [c.metodo, c.url.pathname, c.corpo]),
    [
      ["POST", "/rest/v1/rpc/bling_recompute_lists", { p_tenant: "loja-a", p_contact: 555 }],
      ["POST", "/rest/v1/rpc/bling_recompute_lists", { p_tenant: "loja-a", p_contact: null }],
    ],
  );
});

test("erro no recálculo sobe com a mensagem", async () => {
  responder = () => ({ status: 500, corpo: { message: "deadlock detected" } });
  await assert.rejects(recalcularListas("loja-a"), /deadlock/);
});

test("contatos por ids: lista vazia não vai ao banco; senão in() na loja", async () => {
  assert.deepEqual(await lerContatosPorIds("loja-a", []), []);
  assert.equal(chamadas.length, 0);

  responder = () => ({ status: 200, corpo: [LINHA] });
  assert.deepEqual(await lerContatosPorIds("loja-a", [555, 777]), [CONTATO]);
  assert.deepEqual(filtros(chamadas[0].url), { tenant_id: "eq.loja-a", bling_contact_id: "in.(555,777)" });
});

test("página da lista: por bling_contact_id depois do último, na ordem, com o tamanho pedido", async () => {
  responder = () => ({ status: 200, corpo: [LINHA] });

  assert.deepEqual(await paginaDaLista("loja-a", "comprador", 100, 1000), [CONTATO]);

  assert.deepEqual(filtros(chamadas[0].url), {
    tenant_id: "eq.loja-a",
    lista: "eq.comprador",
    bling_contact_id: "gt.100",
    order: "bling_contact_id.asc",
    limit: "1000",
  });
});
