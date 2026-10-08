import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getSupabaseAdmin, getSupabaseAnonForToken } from "@/lib/supabase/server";

/**
 * Contra o Supabase de DEV, numa loja descartável criada aqui e apagada no fim
 * (organização + dona + vendedora, com login de verdade). A loja de QA não é
 * tocada; E2E_TENANT_ID é só a chave de ligar — o CI o define no passo de
 * integração.
 *
 * 1. As RPCs da venda com itens (`create_order_with_items`, `replace_order_items`,
 *    migração 20261007120100): limites dos itens, soma, janela de 24h da autora e
 *    atomicidade estão no SQL — PostgREST falso não os alcança. As mensagens de
 *    erro são contrato com a API de vendas (PR 4), que as traduz.
 * 2. O RLS da vendedora (spec §1, "RLS"): o JWT dela fica no browser e a anon key
 *    é pública. Com ele, o PostgREST não pode devolver nada da loja; com o da dona,
 *    devolve. Tirar `and m.role <> 'seller'` de um helper de leitura derruba o
 *    teste de RLS.
 */

const LIGADO = Boolean(process.env.E2E_TENANT_ID);
// Estas linhas criam usuário e loja: apontado para produção, o teste não roda.
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);
const HORA_MS = 3_600_000;

type Pessoa = { id: string; token: string };
type Pedido = {
  id: string;
  tenant_id: string;
  created_by: string | null;
  phone: string;
  group_name: string | null;
  value: number | string;
};
type Resultado = { pedido: Pedido | null; erro: string | null };
type ItemSalvo = { position: number; name: string; quantity: number; unit_price: number | string };
type Tabela = "organizations" | "leads" | "orders" | "order_items";

const usuarios: string[] = [];
let loja = "";
let dona: Pessoa = { id: "", token: "" };
let vendedora: Pessoa = { id: "", token: "" };

function pular(): boolean {
  if (EM_PRODUCAO) {
    console.log("SUPABASE_URL é de produção — teste de integração pulado");
    return true;
  }
  if (!LIGADO) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

/** Usuário de auth novo + login por senha no GoTrue: devolve o id e o JWT dele. */
async function criarPessoa(apelido: string): Promise<Pessoa> {
  const email = `vendtest-${RUN}-${apelido}@exemplo.invalid`;
  // Gerada aqui e descartada com o usuário no after().
  const password = `${randomUUID()}-Aa1!`;
  const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser ${apelido}: ${error?.message ?? "sem usuário"}`);
  usuarios.push(data.user.id);

  // O mesmo caminho do passo de integração do CI (curl em /auth/v1/token).
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const resposta = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_ANON_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!resposta.ok) throw new Error(`login de ${apelido}: ${resposta.status} ${await resposta.text()}`);
  const { access_token: token } = (await resposta.json()) as { access_token: string };
  return { id: data.user.id, token };
}

before(async () => {
  if (pular()) return;
  // Sem a anon key não há login, e o teste de RLS não provaria nada.
  if (!process.env.SUPABASE_ANON_KEY) throw new Error("integração ligada sem SUPABASE_ANON_KEY");
  const supabase = getSupabaseAdmin();

  const { data: org, error: erroLoja } = await supabase
    .from("organizations")
    .insert({ name: `vendtest ${RUN}`, slug: `vendtest-${RUN}` })
    .select("id")
    .single();
  if (erroLoja) throw new Error(erroLoja.message);
  loja = org!.id as string;

  dona = await criarPessoa("dona");
  vendedora = await criarPessoa("vendedora");

  const aceito = new Date().toISOString();
  const { error: erroMembros } = await supabase.from("memberships").insert([
    { tenant_id: loja, user_id: dona.id, role: "owner", accepted_at: aceito },
    { tenant_id: loja, user_id: vendedora.id, role: "seller", accepted_at: aceito },
  ]);
  if (erroMembros) throw new Error(erroMembros.message);

  // Um contato, para o teste de RLS ter o que (não) ler em leads.
  const { error: erroContato } = await supabase.from("leads").insert({
    tenant_id: loja,
    phone: null,
    name: "Cliente teste",
    source_group_id: `vendtest-${RUN}@g.us`,
    entered_at: "2020-01-01T00:00:00.000Z",
  });
  if (erroContato) throw new Error(erroContato.message);
});

after(async () => {
  if (pular()) return;
  const supabase = getSupabaseAdmin();
  // A loja leva junto memberships, leads, orders e order_items (on delete cascade).
  if (loja) {
    const { error } = await supabase.from("organizations").delete().eq("tenant_id", loja);
    if (error) throw new Error(error.message);
  }
  for (const id of usuarios) {
    const { error } = await supabase.auth.admin.deleteUser(id);
    if (error) throw new Error(error.message);
  }
});

async function criar(itens: unknown): Promise<Resultado> {
  const { data, error } = await getSupabaseAdmin().rpc("create_order_with_items", {
    p_tenant_id: loja,
    p_created_by: vendedora.id,
    p_lead_id: null,
    p_phone: "+55 (11) 90000-0000",
    p_group_name: "  VIP teste  ",
    p_campaign_id: null,
    p_items: itens,
  });
  return { pedido: (data ?? null) as Pedido | null, erro: error?.message ?? null };
}

async function trocar(
  pedidoId: string,
  itens: unknown,
  soAutora: string | null,
  tenantId: string = loja,
): Promise<Resultado> {
  const { data, error } = await getSupabaseAdmin().rpc("replace_order_items", {
    p_tenant_id: tenantId,
    p_order_id: pedidoId,
    p_items: itens,
    p_only_author: soAutora,
  });
  return { pedido: (data ?? null) as Pedido | null, erro: error?.message ?? null };
}

/** [position, name, quantity, unit_price] na ordem gravada. */
async function itensDo(pedidoId: string): Promise<Array<[number, string, number, number]>> {
  const { data, error } = await getSupabaseAdmin()
    .from("order_items")
    .select("position, name, quantity, unit_price")
    .eq("tenant_id", loja)
    .eq("order_id", pedidoId)
    .order("position");
  if (error) throw new Error(error.message);
  return ((data ?? []) as ItemSalvo[]).map((i) => [i.position, i.name, i.quantity, Number(i.unit_price)]);
}

async function valorDo(pedidoId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("orders")
    .select("value")
    .eq("tenant_id", loja)
    .eq("id", pedidoId)
    .single();
  if (error) throw new Error(error.message);
  return Number(data!.value);
}

async function pedidosDaLoja(): Promise<number> {
  const { count, error } = await getSupabaseAdmin()
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", loja);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Pedido válido de um item (Blusa · 1 · R$ 50), ponto de partida das correções. */
async function pedidoDeUmItem(): Promise<Pedido> {
  const { pedido, erro } = await criar([{ name: "Blusa", quantity: 1, unit_price: 50 }]);
  assert.equal(erro, null);
  return pedido!;
}

/** Linhas da loja que o PostgREST devolve para este JWT (caminho `authenticated`, com RLS). */
async function linhasVisiveis(token: string, tabela: Tabela): Promise<number> {
  const { data, error } = await getSupabaseAnonForToken(token).from(tabela).select("id").eq("tenant_id", loja);
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return (data ?? []).length;
}

const OUTROS_ITENS = [{ name: "Vestido", quantity: 1, unit_price: 99 }];

test("registra pedido e itens juntos: total = soma de quantidade × preço, na ordem enviada, nome aparado", async () => {
  if (pular()) return;
  const { pedido, erro } = await criar([
    { name: "  Blusa  ", quantity: 2, unit_price: 49.9 },
    { name: "Saia", quantity: 1, unit_price: 89.95 },
    // Brinde: item de valor zero é aceito; só a venda inteira precisa somar > 0.
    { name: "Brinde", quantity: 1, unit_price: 0 },
  ]);
  assert.equal(erro, null);
  assert.equal(Number(pedido!.value), 189.75);
  assert.equal(pedido!.tenant_id, loja);
  assert.equal(pedido!.created_by, vendedora.id);
  assert.equal(pedido!.phone, "5511900000000", "o telefone é gravado só com dígitos, como no addOrder");
  assert.equal(pedido!.group_name, "VIP teste");
  assert.deepEqual(await itensDo(pedido!.id), [
    [0, "Blusa", 2, 49.9],
    [1, "Saia", 1, 89.95],
    [2, "Brinde", 1, 0],
  ]);
});

test("50 itens é o teto e passa", async () => {
  if (pular()) return;
  const { pedido, erro } = await criar(
    Array.from({ length: 50 }, (_, i) => ({ name: `Peça ${i + 1}`, quantity: 1, unit_price: 1 })),
  );
  assert.equal(erro, null);
  assert.equal(Number(pedido!.value), 50);
  const itens = await itensDo(pedido!.id);
  assert.deepEqual(itens.map(([posicao]) => posicao), Array.from({ length: 50 }, (_, i) => i));
});

test("item fora do limite: itens_invalidos, e nenhum pedido sem itens fica para trás", async () => {
  if (pular()) return;
  const valido = { name: "Blusa", quantity: 1, unit_price: 10 };
  const casos: Array<[string, unknown]> = [
    ["lista vazia", []],
    ["51 itens", Array.from({ length: 51 }, () => valido)],
    ["nome só com espaço", [{ ...valido, name: "   " }]],
    ["nome com 121 letras", [{ ...valido, name: "a".repeat(121) }]],
    ["item sem nome", [{ quantity: 1, unit_price: 10 }]],
    ["quantidade 0", [{ ...valido, quantity: 0 }]],
    ["quantidade 10000", [{ ...valido, quantity: 10000 }]],
    ["quantidade quebrada", [{ ...valido, quantity: 1.5 }]],
    ["preço negativo", [{ ...valido, unit_price: -1 }]],
    ["preço acima de 999999,99", [{ ...valido, unit_price: 1000000 }]],
    ["preço como texto", [{ ...valido, unit_price: "10" }]],
    ["segundo item inválido depois de um válido", [valido, { ...valido, quantity: 0 }]],
    [
      "soma acima do teto de orders.value (numeric(12,2))",
      [
        { name: "a", quantity: 9999, unit_price: 999999.99 },
        { name: "b", quantity: 9999, unit_price: 999999.99 },
      ],
    ],
  ];
  const antes = await pedidosDaLoja();
  for (const [caso, itens] of casos) {
    const { erro } = await criar(itens);
    assert.equal(erro, "itens_invalidos", caso);
  }
  assert.equal(await pedidosDaLoja(), antes, "item inválido não pode deixar pedido órfão");
});

test("soma zero: total_zero, sem pedido órfão", async () => {
  if (pular()) return;
  const antes = await pedidosDaLoja();
  const { erro } = await criar([{ name: "Brinde", quantity: 2, unit_price: 0 }]);
  assert.equal(erro, "total_zero");
  assert.equal(await pedidosDaLoja(), antes);
});

test("a autora corrige dentro de 24h: troca os itens e recalcula o total", async () => {
  if (pular()) return;
  const pedido = await pedidoDeUmItem();
  const { pedido: corrigido, erro } = await trocar(
    pedido.id,
    [
      { name: "Vestido", quantity: 3, unit_price: 120 },
      { name: "Cinto", quantity: 1, unit_price: 15.5 },
    ],
    vendedora.id,
  );
  assert.equal(erro, null);
  assert.equal(corrigido!.id, pedido.id);
  assert.equal(Number(corrigido!.value), 375.5);
  assert.deepEqual(await itensDo(pedido.id), [
    [0, "Vestido", 3, 120],
    [1, "Cinto", 1, 15.5],
  ]);
});

test("quem não é a autora não corrige: fora_da_janela, e nada muda", async () => {
  if (pular()) return;
  const pedido = await pedidoDeUmItem();
  // Outra vendedora: a API passa o authUserId de quem chama como p_only_author.
  const { erro } = await trocar(pedido.id, OUTROS_ITENS, randomUUID());
  assert.equal(erro, "fora_da_janela");
  assert.deepEqual(await itensDo(pedido.id), [[0, "Blusa", 1, 50]]);
  assert.equal(await valorDo(pedido.id), 50);
});

test("passou de 24h: a autora não corrige mais; sem p_only_author (dono/admin) corrige", async () => {
  if (pular()) return;
  const pedido = await pedidoDeUmItem();
  const { error } = await getSupabaseAdmin()
    .from("orders")
    .update({ created_at: new Date(Date.now() - 25 * HORA_MS).toISOString() })
    .eq("tenant_id", loja)
    .eq("id", pedido.id);
  if (error) throw new Error(error.message);

  assert.equal((await trocar(pedido.id, OUTROS_ITENS, vendedora.id)).erro, "fora_da_janela");
  assert.deepEqual(await itensDo(pedido.id), [[0, "Blusa", 1, 50]]);

  const dono = await trocar(pedido.id, OUTROS_ITENS, null);
  assert.equal(dono.erro, null);
  assert.equal(Number(dono.pedido!.value), 99);
  assert.deepEqual(await itensDo(pedido.id), [[0, "Vestido", 1, 99]]);
});

test("pedido de outra loja ou que não existe: pedido_nao_encontrado", async () => {
  if (pular()) return;
  const pedido = await pedidoDeUmItem();
  // O service-role passa por cima do RLS: é o p_tenant_id que isola.
  assert.equal((await trocar(pedido.id, OUTROS_ITENS, null, randomUUID())).erro, "pedido_nao_encontrado");
  assert.equal((await trocar(randomUUID(), OUTROS_ITENS, null)).erro, "pedido_nao_encontrado");
  assert.deepEqual(await itensDo(pedido.id), [[0, "Blusa", 1, 50]]);
});

test("correção com item inválido ou soma zero: erro, e itens e total antigos ficam", async () => {
  if (pular()) return;
  const pedido = await pedidoDeUmItem();
  assert.equal((await trocar(pedido.id, [], vendedora.id)).erro, "itens_invalidos");
  assert.equal(
    (await trocar(pedido.id, [{ name: "Brinde", quantity: 1, unit_price: 0 }], vendedora.id)).erro,
    "total_zero",
  );
  assert.deepEqual(await itensDo(pedido.id), [[0, "Blusa", 1, 50]]);
  assert.equal(await valorDo(pedido.id), 50);
});

test("apagar o pedido apaga os itens (on delete cascade)", async () => {
  if (pular()) return;
  const pedido = await pedidoDeUmItem();
  assert.equal((await itensDo(pedido.id)).length, 1);
  const { error } = await getSupabaseAdmin().from("orders").delete().eq("tenant_id", loja).eq("id", pedido.id);
  if (error) throw new Error(error.message);
  assert.deepEqual(await itensDo(pedido.id), []);
});

test("RLS: com o JWT da vendedora o PostgREST não devolve nada da loja; com o da dona, devolve", async () => {
  if (pular()) return;
  const { erro } = await criar([{ name: "Blusa", quantity: 1, unit_price: 50 }]);
  assert.equal(erro, null);
  // organizations passa por app.has_membership(); leads, orders e order_items, por app.user_tenant_ids().
  const tabelas: Tabela[] = ["organizations", "leads", "orders", "order_items"];
  for (const tabela of tabelas) {
    assert.ok(
      (await linhasVisiveis(dona.token, tabela)) > 0,
      `a dona não viu ${tabela}: o controle falhou e o teste não prova nada`,
    );
    assert.equal(await linhasVisiveis(vendedora.token, tabela), 0, `a vendedora leu ${tabela} direto do banco`);
  }
});
