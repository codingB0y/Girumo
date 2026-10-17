import assert from "node:assert/strict";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type Stripe from "stripe";

import { encerrarLoja } from "./encerrar-loja";

/**
 * O supabase-js de verdade contra um PostgREST falso (padrão de
 * `lib/stores/leads.test.ts`): a query que sai é a de produção, só a rede é
 * trocada. É o que prova o `tenant_id` em cada escrita — o service-role passa
 * por cima do RLS, então sem o filtro o encerramento de uma loja apagaria os
 * agendamentos de todas.
 *
 * O Stripe é um objeto falso com só o que o encerramento usa: `list` (iterável
 * assíncrono, como o `ApiListPromise` do SDK) e `cancel`.
 */

type Pedido = { metodo: string; tabela: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const LOJA = "11111111-1111-4111-8111-111111111111";
const pedidos: Pedido[] = [];
let responder: (p: Pedido) => Resposta = () => ({ status: 500 });

function lerCorpo(req: IncomingMessage): Promise<unknown> {
  return new Promise((pronto) => {
    let bruto = "";
    req.on("data", (pedaco) => {
      bruto += pedaco;
    });
    req.on("end", () => pronto(bruto ? JSON.parse(bruto) : undefined));
  });
}

const postgrest = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  const pedido: Pedido = {
    metodo: req.method ?? "",
    tabela: url.pathname.replace("/rest/v1/", ""),
    url,
    corpo: await lerCorpo(req),
  };
  pedidos.push(pedido);
  const { status, corpo } = responder(pedido);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(corpo ?? (status >= 400 ? { message: `falha em ${pedido.tabela}` } : [])));
});

let supabase: SupabaseClient;

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  supabase = createClient(`http://127.0.0.1:${port}`, "chave-do-postgrest-falso", {
    auth: { autoRefreshToken: false, persistSession: false },
  });
});

after(() => {
  postgrest.close();
});

beforeEach(() => {
  pedidos.length = 0;
});

/** Loja com customer no Stripe, 2 agendamentos pendentes e 3 envios na fila. */
function lojaComTudo(customer: string | null = "cus_loja") {
  return (p: Pedido): Resposta => {
    if (p.tabela === "organizations") return { status: 200, corpo: { stripe_customer_id: customer } };
    if (p.tabela === "schedules") return { status: 200, corpo: [{ id: "ag-1" }, { id: "ag-2" }] };
    if (p.tabela === "engine_commands") return { status: 200, corpo: [{ id: "c-1" }, { id: "c-2" }, { id: "c-3" }] };
    return { status: 404 };
  };
}

function stripeFalso(assinaturas: Array<{ id: string; status: Stripe.Subscription.Status }>, falha?: string) {
  const listagens: unknown[] = [];
  const canceladas: string[] = [];
  let criacoes = 0;
  const stripe = {
    subscriptions: {
      list: (params: unknown) => {
        listagens.push(params);
        return (async function* () {
          yield* assinaturas;
        })();
      },
      cancel: async (id: string) => {
        if (falha) throw new Error(falha);
        canceladas.push(id);
        return { id, status: "canceled" };
      },
    },
  } as unknown as Stripe;
  const fabrica = () => {
    criacoes += 1;
    return stripe;
  };
  return { fabrica, listagens, canceladas, criacoes: () => criacoes };
}

/** Os filtros da query, sem `select`. */
function filtros(url: URL): Record<string, string> {
  return Object.fromEntries([...url.searchParams].filter(([chave]) => chave !== "select"));
}

test("cancela no Stripe toda assinatura viva do customer da loja (plano e add-on), e só as vivas", async () => {
  responder = lojaComTudo();
  const stripe = stripeFalso([
    { id: "sub_plano", status: "active" },
    { id: "sub_addon", status: "past_due" },
    { id: "sub_teste", status: "trialing" },
    { id: "sub_inadimplente", status: "unpaid" },
    { id: "sub_incompleta", status: "incomplete" },
    { id: "sub_pausada", status: "paused" },
    { id: "sub_velha", status: "canceled" },
    { id: "sub_expirada", status: "incomplete_expired" },
  ]);

  const resultado = await encerrarLoja({ supabase, stripe: stripe.fabrica, tenantId: LOJA });

  assert.deepEqual(resultado, { error: null, assinaturas: 6, agendamentos: 2, envios: 3 });
  // Mutante: listar sem `status: "all"` esconde `past_due`/`unpaid`, que ainda cobram.
  assert.deepEqual(stripe.listagens, [{ customer: "cus_loja", status: "all", limit: 100 }]);
  assert.deepEqual(stripe.canceladas, [
    "sub_plano",
    "sub_addon",
    "sub_teste",
    "sub_inadimplente",
    "sub_incompleta",
    "sub_pausada",
  ]);
});

test("cada leitura e escrita no banco filtra pela loja", async () => {
  responder = lojaComTudo();
  await encerrarLoja({ supabase, stripe: stripeFalso([]).fabrica, tenantId: LOJA });

  const [org, agendamentos, envios] = pedidos;
  assert.equal(pedidos.length, 3);

  assert.equal(org.metodo, "GET");
  assert.equal(org.tabela, "organizations");
  assert.deepEqual(filtros(org.url), { id: `eq.${LOJA}`, tenant_id: `eq.${LOJA}` });

  // Pendente nunca virou fila; o que já está rodando não volta atrás.
  assert.equal(agendamentos.metodo, "DELETE");
  assert.equal(agendamentos.tabela, "schedules");
  assert.deepEqual(filtros(agendamentos.url), { tenant_id: `eq.${LOJA}`, status: "eq.pending" });

  // Só `queued`: `processing` já saiu para o WhatsApp.
  assert.equal(envios.metodo, "PATCH");
  assert.equal(envios.tabela, "engine_commands");
  assert.deepEqual(filtros(envios.url), { tenant_id: `eq.${LOJA}`, status: "eq.queued" });
  assert.deepEqual(envios.corpo, { status: "canceled" });
});

test("o Stripe falha: devolve o erro e não mexe nos agendamentos nem na fila", async () => {
  responder = lojaComTudo();
  const stripe = stripeFalso([{ id: "sub_plano", status: "active" }], "Stripe fora do ar");

  const resultado = await encerrarLoja({ supabase, stripe: stripe.fabrica, tenantId: LOJA });

  assert.match(String(resultado.error), /Stripe fora do ar/);
  // Quem chamou (apagar a conta) vai desistir; a loja fica inteira, como estava.
  assert.deepEqual(
    pedidos.map((p) => p.tabela),
    ["organizations"],
  );
});

test("loja sem customer no Stripe: não chega a criar o cliente do Stripe e encerra o resto", async () => {
  responder = lojaComTudo(null);
  const stripe = stripeFalso([]);

  const resultado = await encerrarLoja({ supabase, stripe: stripe.fabrica, tenantId: LOJA });

  assert.deepEqual(resultado, { error: null, assinaturas: 0, agendamentos: 2, envios: 3 });
  // Dev sem STRIPE_SECRET_KEY: `getStripe()` lançaria e travaria quem nunca assinou.
  assert.equal(stripe.criacoes(), 0);
});

test("falha ao ler a loja vira erro, sem chamar o Stripe", async () => {
  responder = (p) => (p.tabela === "organizations" ? { status: 500 } : lojaComTudo()(p));
  const stripe = stripeFalso([{ id: "sub_plano", status: "active" }]);

  const resultado = await encerrarLoja({ supabase, stripe: stripe.fabrica, tenantId: LOJA });

  assert.notEqual(resultado.error, null);
  assert.equal(stripe.criacoes(), 0);
  assert.equal(pedidos.length, 1);
});

test("falha ao cancelar agendamentos ou fila vira erro, nunca sucesso calado", async () => {
  for (const tabela of ["schedules", "engine_commands"]) {
    responder = (p) => (p.tabela === tabela ? { status: 500 } : lojaComTudo()(p));
    const resultado = await encerrarLoja({ supabase, stripe: stripeFalso([]).fabrica, tenantId: LOJA });
    assert.match(String(resultado.error), new RegExp(`falha em ${tabela}`), tabela);
  }
});
