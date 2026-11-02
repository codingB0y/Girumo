import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, mock, test } from "node:test";

import type * as Numero from "./numero";

/**
 * O número do atendimento contra dois serviços de mentira num servidor só: o PostgREST (`/rest/v1`)
 * e a Evolution (`/instance/logout`). O que sai daqui é o que sai em produção; só a rede é trocada.
 * Telefones são inventados (repo público).
 */

type Chamada = { metodo: string; url: URL; corpo: unknown; prefer: string };
type Resposta = { status: number; corpo?: unknown };

const LOJA = "loja-a";
const chamadas: Chamada[] = [];
let banco: Record<string, Resposta | ((c: Chamada) => Resposta)> = {};

const servidor = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
      prefer: String(req.headers.prefer ?? ""),
    };
    chamadas.push(chamada);
    const tabela = banco[`${chamada.metodo} ${chamada.url.pathname}`];
    // Chamada que ninguém previu vira 500, para aparecer.
    const { status, corpo } = tabela
      ? typeof tabela === "function"
        ? tabela(chamada)
        : tabela
      : { status: 500, corpo: { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` } };
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

let numeroDoAtendimento: typeof Numero.numeroDoAtendimento;
let privadoLiberado: typeof Numero.privadoLiberado;
let pausaDoNumero: typeof Numero.pausaDoNumero;
let conferirNumeroDoAtendimento: typeof Numero.conferirNumeroDoAtendimento;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.EVOLUTION_API_URL = base;
  process.env.EVOLUTION_API_KEY = "chave-da-evolution-falsa";
  ({ numeroDoAtendimento, privadoLiberado, pausaDoNumero, conferirNumeroDoAtendimento } = await import("./numero"));
});

after(() => {
  servidor.close();
});

const feitas = (metodo: string, caminho: string) =>
  chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);

const BASE = {
  tenant_id: LOJA,
  qr_code: null,
  provider: "evolution",
  last_seen_at: null,
  connected_at: null,
  created_at: "2026-10-01T00:00:00+00:00",
  updated_at: "2026-10-01T00:00:00+00:00",
};
const GRUPOS = {
  ...BASE,
  id: "inst-g",
  name: "Número dos grupos",
  phone: "556299990001",
  purpose: "grupos",
  status: "connected",
  provider_instance_id: "gr_inst-g",
  metadata: {},
};
const ATENDIMENTO = {
  ...BASE,
  id: "inst-p",
  name: "Número do atendimento",
  phone: "5562988880002",
  purpose: "privado",
  status: "connected",
  provider_instance_id: "gr_inst-p",
  metadata: {},
};
/** Sem o 55 e com o 9: a mesma chave `6299990001` do `GRUPOS`. */
const MESMO_CHIP = { ...ATENDIMENTO, phone: "62999990001" };

function prepara(over: {
  instancias?: Array<Record<string, unknown>>;
  settings?: Record<string, boolean> | null | "erro";
  estado?: unknown[];
  logout?: Resposta;
} = {}): void {
  chamadas.length = 0;
  const { instancias = [], settings = null, estado = [], logout = { status: 200 } } = over;
  banco = {
    // Como o PostgREST: `purpose=eq.X` recorta as linhas quando vem na consulta.
    "GET /rest/v1/instances": (c) => {
      const purpose = c.url.searchParams.get("purpose");
      return { status: 200, corpo: instancias.filter((i) => purpose === null || purpose === `eq.${i.purpose}`) };
    },
    "GET /rest/v1/tenant_settings": () =>
      settings === "erro"
        ? { status: 500, corpo: { message: "fora" } }
        : { status: 200, corpo: settings ? [settings] : [] },
    "GET /rest/v1/private_number_state": { status: 200, corpo: estado },
    "POST /rest/v1/private_number_state": { status: 201 },
    "POST /rest/v1/rpc/update_instance_status": { status: 200 },
    "POST /rest/v1/notifications": { status: 201 },
    "DELETE /instance/logout/gr_inst-p": logout,
  };
}

test("numeroDoAtendimento devolve o número da loja no formato do contrato", async () => {
  prepara({ instancias: [ATENDIMENTO] });
  assert.deepEqual(await numeroDoAtendimento(LOJA), {
    instanceId: "inst-p", instanceName: "gr_inst-p", status: "connected", phone: "5562988880002",
  });
  const [leitura] = feitas("GET", "/rest/v1/instances");
  assert.equal(leitura.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(leitura.url.searchParams.get("purpose"), "eq.privado");
});

test("sem número do atendimento, numeroDoAtendimento é null", async () => {
  prepara({ instancias: [] });
  assert.equal(await numeroDoAtendimento(LOJA), null);
});

test("privadoLiberado: o Recuperar ou o Rastreio liberam; nenhum dos dois, ou loja sem linha, não", async () => {
  const casos: [Record<string, boolean> | null, boolean][] = [
    [{ recuperar_enabled: true, rastreio_enabled: false }, true],
    [{ recuperar_enabled: false, rastreio_enabled: true }, true],
    [{ recuperar_enabled: false, rastreio_enabled: false }, false],
    [null, false],
  ];
  for (const [linha, esperado] of casos) {
    prepara({ settings: linha });
    assert.equal(await privadoLiberado(LOJA), esperado, JSON.stringify(linha));
    assert.equal(feitas("GET", "/rest/v1/tenant_settings")[0].url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  }
});

test("privadoLiberado lança se a leitura falha (quem chama decide fechado)", async () => {
  prepara({ settings: "erro" });
  await assert.rejects(privadoLiberado(LOJA));
});

test("pausaDoNumero lê a pausa do número da loja", async () => {
  prepara({ estado: [{ paused_until: "2026-10-30T17:30:00+00:00" }] });
  assert.equal(await pausaDoNumero(LOJA, "inst-p"), "2026-10-30T17:30:00+00:00");
  const [leitura] = feitas("GET", "/rest/v1/private_number_state");
  assert.equal(leitura.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(leitura.url.searchParams.get("instance_id"), "eq.inst-p");
  prepara({ estado: [] });
  assert.equal(await pausaDoNumero(LOJA, "inst-p"), null);
});

test("chip dos grupos no número do atendimento, com o 9 e o 55 diferentes: recusa, avisa no sino e desconecta", async () => {
  prepara({ instancias: [MESMO_CHIP, GRUPOS] });
  assert.equal(await conferirNumeroDoAtendimento(LOJA), "recusado");
  const atualizacoes = feitas("POST", "/rest/v1/rpc/update_instance_status").map((c) => c.corpo as Record<string, unknown>);
  assert.equal(atualizacoes.length, 1);
  assert.equal(atualizacoes[0].target_tenant_id, LOJA);
  assert.equal(atualizacoes[0].target_instance_id, "inst-p"); // o dos grupos nunca é tocado
  assert.equal(atualizacoes[0].target_status, "disconnected");
  assert.deepEqual(atualizacoes[0].target_metadata, { privado_recusado: "numero_dos_grupos" });
  const [aviso] = feitas("POST", "/rest/v1/notifications").map((c) => c.corpo as Record<string, unknown>);
  assert.equal(aviso.tenant_id, LOJA);
  assert.equal(aviso.type, "privado_recusado");
  assert.equal(aviso.href, "/painel/conectar");
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 1);
  assert.equal(feitas("POST", "/rest/v1/private_number_state").length, 0);
});

test("recusa repetida não avisa de novo no sino", async () => {
  prepara({ instancias: [{ ...MESMO_CHIP, metadata: { privado_recusado: "numero_dos_grupos" } }, GRUPOS] });
  assert.equal(await conferirNumeroDoAtendimento(LOJA), "recusado");
  assert.equal(feitas("POST", "/rest/v1/notifications").length, 0);
});

test("Evolution fora no logout não desfaz a recusa, e o log não leva o telefone", async () => {
  prepara({ instancias: [MESMO_CHIP, GRUPOS], logout: { status: 500, corpo: { message: "fora" } } });
  const aviso = mock.method(console, "warn", () => {});
  try {
    assert.equal(await conferirNumeroDoAtendimento(LOJA), "recusado");
  } finally {
    aviso.mock.restore();
  }
  assert.equal(feitas("POST", "/rest/v1/rpc/update_instance_status").length, 1);
  assert.equal(aviso.mock.callCount(), 1);
  const texto = aviso.mock.calls[0].arguments.map(String).join(" ");
  assert.match(texto, /inst-p/);
  assert.doesNotMatch(texto, /99990001/);
});

test("aviso no sino falhando não deixa a sessão do chip repetido aberta na Evolution", async () => {
  prepara({ instancias: [MESMO_CHIP, GRUPOS] });
  banco["POST /rest/v1/notifications"] = { status: 500, corpo: { message: "fora" } };
  await assert.rejects(conferirNumeroDoAtendimento(LOJA));
  assert.equal(feitas("POST", "/rest/v1/rpc/update_instance_status").length, 1);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 1);
});

test("chip próprio: cria o estado do número sem reiniciar a rampa de quem já tinha", async () => {
  prepara({ instancias: [ATENDIMENTO, GRUPOS] });
  assert.equal(await conferirNumeroDoAtendimento(LOJA), "ok");
  const [estado] = feitas("POST", "/rest/v1/private_number_state");
  assert.equal(estado.url.searchParams.get("on_conflict"), "instance_id");
  assert.match(estado.prefer, /resolution=ignore-duplicates/);
  const linha = ([] as Record<string, unknown>[]).concat(estado.corpo as Record<string, unknown>)[0];
  assert.equal(linha.tenant_id, LOJA);
  assert.equal(linha.instance_id, "inst-p");
  assert.equal(typeof linha.ramp_started_at, "string");
  assert.equal(linha.healthy_since, linha.ramp_started_at);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 0);
  assert.equal(feitas("POST", "/rest/v1/rpc/update_instance_status").length, 0);
});

test("chip próprio depois de uma recusa limpa a marca da recusa", async () => {
  prepara({ instancias: [{ ...ATENDIMENTO, metadata: { privado_recusado: "numero_dos_grupos" } }, GRUPOS] });
  assert.equal(await conferirNumeroDoAtendimento(LOJA), "ok");
  const [rpc] = feitas("POST", "/rest/v1/rpc/update_instance_status").map((c) => c.corpo as Record<string, unknown>);
  assert.equal(rpc.target_status, "connected");
  assert.deepEqual(rpc.target_metadata, { privado_recusado: null });
});

test("loja sem número do atendimento: uma leitura só, nada mais", async () => {
  prepara({ instancias: [GRUPOS] });
  assert.equal(await conferirNumeroDoAtendimento(LOJA), "sem_numero");
  assert.equal(chamadas.length, 1);
});

test("número do atendimento fora do ar, ou aberto sem telefone: nada a fazer", async () => {
  for (const atendimento of [{ ...MESMO_CHIP, status: "qr" }, { ...ATENDIMENTO, phone: null }]) {
    prepara({ instancias: [atendimento, GRUPOS] });
    assert.equal(await conferirNumeroDoAtendimento(LOJA), "nada_a_fazer");
    assert.equal(chamadas.length, 1);
  }
});
