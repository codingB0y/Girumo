import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import type { Resultado } from "@/lib/bling/sincronizar";

import { executarCron, type LojaParaSincronizar, type MotorDoCron } from "./executar";
import { GET } from "./route";

/**
 * Duas camadas. A rota, de ponta a ponta com o motor de verdade e um PostgREST de mentira
 * (a trava responde "ocupada", então cada loja é só uma chamada). E a fila de lojas
 * (`executar.ts`) com motor e relógio falsos: é lá que mora a conta do orçamento.
 */

// --- Rota: PostgREST de mentira ------------------------------------------------------------

type Chamada = { metodo: string; url: URL; corpo: unknown };
const banco: Chamada[] = [];
let lojasAtivas: Array<{ tenant_id: string; backfill_done_at: string | null }> = [];
let travaFalhaPara: string | null = null;
let listaFalha = false;

const ERRO_DE_BANCO = { code: "XX000", message: "banco fora do ar", details: null, hint: null };
const CRON_SECRET = "segredo-do-cron-com-mais-de-24-caracteres";

function responder(metodo: string, url: URL, corpo: unknown): [number, unknown] {
  const rota = `${metodo} ${url.pathname}`;
  // As lojas em "reconectar" sem alerta (o reenvio do e-mail, depois das lojas): nenhuma aqui.
  if (rota === "GET /rest/v1/bling_connections" && url.searchParams.get("status") === "eq.reconectar") return [200, []];
  if (rota === "GET /rest/v1/bling_connections") return listaFalha ? [500, ERRO_DE_BANCO] : [200, lojasAtivas];
  if (rota === "POST /rest/v1/rpc/bling_claim") {
    return (corpo as { p_tenant?: string }).p_tenant === travaFalhaPara ? [500, ERRO_DE_BANCO] : [200, false];
  }
  return [500, { message: `inesperado: ${rota}` }];
}

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const url = new URL(req.url ?? "/", "http://supabase.falso");
    const corpo: unknown = bruto ? JSON.parse(bruto) : undefined;
    banco.push({ metodo: req.method ?? "", url, corpo });
    const [status, resposta] = responder(req.method ?? "", url, corpo);
    res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(JSON.stringify(resposta));
  });
});

before(async () => {
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
beforeEach(() => {
  Object.assign(process.env, {
    CRON_SECRET,
    BLING_CLIENT_ID: "app-girumo",
    BLING_CLIENT_SECRET: "segredo-do-app",
    INTEGRATIONS_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  });
  banco.length = 0;
  lojasAtivas = [
    { tenant_id: "loja-a", backfill_done_at: null },
    { tenant_id: "loja-b", backfill_done_at: "2026-10-01T00:00:00+00:00" },
  ];
  travaFalhaPara = null;
  listaFalha = false;
});
after(() => {
  supabase.close();
});

function chamarCron(autorizacao: string | null = `Bearer ${CRON_SECRET}`): Promise<Response> {
  return GET(new Request("http://girumo.test/api/cron/bling", { headers: autorizacao === null ? {} : { authorization: autorizacao } }));
}

const travasPedidas = () =>
  banco.filter((c) => c.url.pathname === "/rest/v1/rpc/bling_claim").map((c) => c.corpo as { p_tenant: string; p_seconds: number });

// --- Rota: casos ---------------------------------------------------------------------------

test("cron sem o secret certo: 401 e nada roda", async () => {
  for (const autorizacao of [null, "Bearer outro-segredo-qualquer-com-24-chars", CRON_SECRET]) {
    assert.equal((await chamarCron(autorizacao)).status, 401, String(autorizacao));
  }
  delete process.env.CRON_SECRET;
  assert.equal((await chamarCron("Bearer ")).status, 401, "CRON_SECRET ausente nunca autoriza");
  assert.equal(banco.length, 0);
});

test("sem as variáveis do Bling: 200 pulado e nenhuma consulta ao banco", async () => {
  for (const variavel of ["BLING_CLIENT_ID", "BLING_CLIENT_SECRET", "INTEGRATIONS_ENCRYPTION_KEY"]) {
    const guardada = process.env[variavel];
    delete process.env[variavel];
    const resposta = await chamarCron();
    process.env[variavel] = guardada;
    assert.equal(resposta.status, 200, variavel);
    assert.deepEqual(await resposta.json(), { ok: true, pulado: "indisponivel" });
  }
  assert.equal(banco.length, 0);
});

test("lista as lojas ativas e roda cada uma com o motor de verdade; a resposta só conta", async () => {
  const resposta = await chamarCron();
  assert.equal(resposta.status, 200);
  const corpo: unknown = await resposta.json();
  assert.deepEqual(corpo, { ok: true, lojas: 2, adiadas: 0, processados: 0, falhas: 0, paradas: {} });
  assert.doesNotMatch(JSON.stringify(corpo), /loja-/);

  const [lista] = banco;
  assert.equal(`${lista.metodo} ${lista.url.pathname}`, "GET /rest/v1/bling_connections");
  assert.equal(lista.url.searchParams.get("status"), "eq.ativa");
  const travas = travasPedidas();
  assert.deepEqual(travas.map((t) => t.p_tenant), ["loja-a", "loja-b"]);
  // O histórico pendente (backfill_done_at nulo) chega ao motor como uma fatia maior.
  assert.ok(travas[0].p_seconds > travas[1].p_seconds, JSON.stringify(travas));
  // Depois das lojas: as paradas em reconectar cujo e-mail não saiu.
  const alertas = banco.at(-1);
  assert.equal(`${alertas?.metodo} ${alertas?.url.pathname}`, "GET /rest/v1/bling_connections");
  assert.deepEqual(
    [alertas?.url.searchParams.get("status"), alertas?.url.searchParams.get("reconnect_alerted_at"), alertas?.url.searchParams.get("select")],
    ["eq.reconectar", "is.null", "tenant_id"],
  );
});

test("loja cujo motor falha conta como falha, vai para o log com o id, e a próxima loja roda", async (t) => {
  t.mock.method(console, "error", () => {});
  const avisos = t.mock.method(console, "warn", () => {});
  travaFalhaPara = "loja-a";
  const resposta = await chamarCron();
  assert.equal(resposta.status, 200);
  assert.deepEqual(await resposta.json(), { ok: true, lojas: 2, adiadas: 0, processados: 0, falhas: 1, paradas: { erros: 1 } });
  assert.deepEqual(travasPedidas().map((t) => t.p_tenant), ["loja-a", "loja-b"]);
  assert.match(avisos.mock.calls.map((c) => String(c.arguments[0])).join("\n"), /loja-a/);
});

test("banco fora na listagem: 500, sem id de loja na resposta", async (t) => {
  t.mock.method(console, "error", () => {});
  listaFalha = true;
  const resposta = await chamarCron();
  assert.equal(resposta.status, 500);
  assert.doesNotMatch(await resposta.text(), /loja-|banco fora/);
  assert.equal(travasPedidas().length, 0);
});

// --- Fila de lojas: motor e relógio falsos ---------------------------------------------------

const INICIO = Date.parse("2026-10-13T15:00:00Z");
const S = 1_000;

type Opcoes = {
  lojas: LojaParaSincronizar[];
  /** Quanto o relógio anda em cada loja (padrão 1 s) e na listagem (padrão 0). */
  duracao?: Record<string, number>;
  listagem?: number;
  resultados?: Record<string, Partial<Resultado>>;
  /** Lojas em reconectar cujo e-mail não saiu. */
  semAlerta?: string[];
};

function motorFalso(opcoes: Opcoes) {
  let relogio = INICIO;
  const listadoEm: Date[] = [];
  const chamadas: Array<{ tenantId: string; gatilho: string; orcamentoMs: number; vidaMs: number }> = [];
  const eventos: string[] = [];
  const motor: MotorDoCron = {
    agora: () => relogio,
    listar: async (agora) => {
      listadoEm.push(agora);
      relogio += opcoes.listagem ?? 0;
      return opcoes.lojas;
    },
    sincronizar: async (tenantId, gatilho, orcamentoMs, vidaMs) => {
      chamadas.push({ tenantId, gatilho, orcamentoMs, vidaMs });
      eventos.push(`começa ${tenantId}`);
      await new Promise<void>((pronto) => setImmediate(pronto));
      relogio += opcoes.duracao?.[tenantId] ?? S;
      eventos.push(`termina ${tenantId}`);
      return { tenantId, trava: true, processados: 0, falhas: 0, varredura: 0, historico: 0, ...opcoes.resultados?.[tenantId] };
    },
    listarSemAlerta: async () => {
      eventos.push("lista alertas");
      return opcoes.semAlerta ?? [];
    },
    avisarReconectar: async (tenantId) => {
      eventos.push(`avisa ${tenantId}`);
    },
  };
  return { motor, chamadas, eventos, listadoEm };
}

const loja = (tenantId: string, historicoPendente = false): LojaParaSincronizar => ({ tenantId, historicoPendente });

test("cada loja recebe 60 s, ou 150 s com histórico pendente, uma depois da outra, como cron, e a vida que resta à função", async () => {
  const { motor, chamadas, eventos, listadoEm } = motorFalso({ lojas: [loja("a", true), loja("b"), loja("c")] });
  await executarCron(motor);
  assert.deepEqual(listadoEm, [new Date(INICIO)]);
  // A vida: os 300 s da função menos o que a rota já gastou (cada loja leva 1 s aqui).
  assert.deepEqual(chamadas, [
    { tenantId: "a", gatilho: "cron", orcamentoMs: 150 * S, vidaMs: 300 * S },
    { tenantId: "b", gatilho: "cron", orcamentoMs: 60 * S, vidaMs: 299 * S },
    { tenantId: "c", gatilho: "cron", orcamentoMs: 60 * S, vidaMs: 298 * S },
  ]);
  assert.deepEqual(eventos, ["começa a", "termina a", "começa b", "termina b", "começa c", "termina c", "lista alertas"]);
});

test("perto do fim a loja recebe o que sobra menos 5 s — e a listagem conta no relógio", async () => {
  // 270 s de orçamento: a listagem gasta 200 s, sobram 70 s para "a" (que teria 150 s).
  const { motor, chamadas } = motorFalso({
    lojas: [loja("a", true), loja("b"), loja("c")],
    listagem: 200 * S,
    duracao: { a: 20 * S, b: 30 * S },
  });
  await executarCron(motor);
  assert.deepEqual(
    chamadas.map((c) => [c.tenantId, c.orcamentoMs, c.vidaMs]),
    [["a", 65 * S, 100 * S], ["b", 45 * S, 80 * S], ["c", 15 * S, 50 * S]],
  );
});

test("com menos de 10 s sobrando não começa outra loja: ela fica para a próxima execução", async (t) => {
  const avisos = t.mock.method(console, "warn", () => {});
  // Depois de "a" sobram exatamente 10 s: "b" ainda entra, com 5 s; depois dela, 9,999 s — "c" fica.
  const { motor, chamadas } = motorFalso({
    lojas: [loja("a"), loja("b"), loja("c"), loja("d")],
    duracao: { a: 260 * S, b: 1 },
  });
  const resumo = await executarCron(motor);
  assert.deepEqual(chamadas.map((c) => [c.tenantId, c.orcamentoMs]), [["a", 60 * S], ["b", 5 * S]]);
  assert.equal(resumo.lojas, 2);
  assert.equal(resumo.adiadas, 2);
  assert.match(String(avisos.mock.calls.at(-1)?.arguments[0]), /2 loja/);
});

test("o resumo soma processados e falhas e conta as paradas por motivo; a linha da loja que falhou é do motor", async (t) => {
  const avisos = t.mock.method(console, "warn", () => {});
  const { motor } = motorFalso({
    lojas: [loja("a"), loja("b"), loja("c"), loja("d")],
    resultados: {
      a: { processados: 3, parou: "orcamento" },
      b: { processados: 1, falhas: 2, parou: "erros" },
      c: { trava: false },
      d: { processados: 5, parou: "orcamento" },
    },
  });
  assert.deepEqual(await executarCron(motor), {
    lojas: 4,
    adiadas: 0,
    processados: 9,
    falhas: 2,
    paradas: { orcamento: 2, erros: 1 },
  });
  // `sincronizarLoja` já escreve a linha de resumo da loja "b": repetir aqui duplicava o log.
  assert.equal(avisos.mock.callCount(), 0);
});

test("depois das lojas, com 10 s sobrando, reenvia o e-mail de reconectar das lojas que ficaram sem alerta", async () => {
  const { motor, eventos } = motorFalso({ lojas: [loja("a")], semAlerta: ["x", "y"] });
  await executarCron(motor);
  // Mutante: sem o reenvio, o e-mail que não saiu nunca mais saía, e a dona não sabia da queda.
  assert.deepEqual(eventos, ["começa a", "termina a", "lista alertas", "avisa x", "avisa y"]);
});

test("com menos de 10 s sobrando, os e-mails de reconectar ficam para a próxima execução", async () => {
  const { motor, eventos } = motorFalso({ lojas: [loja("a")], duracao: { a: 261 * S }, semAlerta: ["x"] });
  await executarCron(motor);
  assert.deepEqual(eventos, ["começa a", "termina a"]);
});

test("a lista dos alertas que falha não derruba o cron: o resumo das lojas sai e o log diz", async (t) => {
  const erros = t.mock.method(console, "error", () => {});
  const { motor } = motorFalso({ lojas: [loja("a")] });
  motor.listarSemAlerta = async () => {
    throw new Error("banco fora do ar");
  };
  const resumo = await executarCron(motor);
  assert.equal(resumo.lojas, 1);
  assert.match(String(erros.mock.calls[0]?.arguments[0]), /reconectar: banco fora do ar/);
});
