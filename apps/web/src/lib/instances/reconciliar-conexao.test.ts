import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { Instance } from "@/lib/stores/instances";

import type { reconciliarConexoes as Reconciliar } from "./reconciliar-conexao";

/**
 * `reconciliarConexoes` contra um Supabase + Evolution de mentira. Promover um número que o banco dizia
 * fora do ar pode trazer o chip repetido do atendimento no ar sem `connection.update` nenhum: a
 * conferência do número do atendimento tem de rodar também aqui.
 */

type Chamada = { metodo: string; url: URL; corpo: unknown };

const GRUPOS: Instance = {
  id: "inst-g",
  tenant_id: "loja-a",
  name: "WhatsApp",
  phone: "5511999990000",
  purpose: "grupos",
  status: "connected",
  qr_code: null,
  provider: "evolution",
  provider_instance_id: "gr_inst-g",
  last_seen_at: null,
  connected_at: "2026-09-01T00:00:00Z",
  metadata: {},
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const ATENDIMENTO: Instance = {
  ...GRUPOS,
  id: "inst-p",
  name: "Atendimento",
  purpose: "privado",
  provider_instance_id: "gr_inst-p",
};

const chamadas: Chamada[] = [];
let lista: Instance[] = [];

/** Zera o histórico; `lista` é o que o banco devolve para `GET /rest/v1/instances` (a leitura da conferência). */
function prepara(mundo: { lista: Instance[] }): void {
  chamadas.length = 0;
  lista = mundo.lista;
}

const servidor = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte.toString("utf8")));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = responder(chamada);
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(corpo ?? null));
  });
});

function responder({ metodo, url }: Chamada): { status: number; corpo?: unknown } {
  const rota = `${metodo} ${url.pathname}`;
  // Evolution: a sessão do número do atendimento está aberta com o chip dos grupos.
  if (rota === "GET /instance/connectionState/gr_inst-p") return { status: 200, corpo: { instance: { state: "open" } } };
  if (rota === "GET /instance/connectionState/gr_inst-g") return { status: 200, corpo: { instance: { state: "open" } } };
  if (rota === "GET /instance/fetchInstances") return { status: 200, corpo: [{ ownerJid: "5511999990000@s.whatsapp.net" }] };
  if (rota === "DELETE /instance/logout/gr_inst-p") return { status: 200, corpo: {} };
  // PostgREST.
  if (rota === "POST /rest/v1/rpc/update_instance_status") return { status: 200, corpo: null };
  if (rota === "POST /rest/v1/funnel_events") return { status: 201 };
  if (rota === "POST /rest/v1/notifications") return { status: 201 };
  if (rota === "GET /rest/v1/instances") return { status: 200, corpo: lista };
  return { status: 500, corpo: { message: `inesperado: ${rota}` } };
}

let reconciliarConexoes: typeof Reconciliar;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  const origem = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_URL = origem;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.EVOLUTION_API_URL = origem;
  process.env.EVOLUTION_API_KEY = "chave-da-evolution-falsa";
  ({ reconciliarConexoes } = await import("./reconciliar-conexao"));
});

after(() => {
  servidor.close();
});

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

test("promover o número do atendimento com o chip dos grupos recusa na mesma volta", async () => {
  prepara({ lista: [{ ...ATENDIMENTO, status: "connected" }, GRUPOS] });
  await reconciliarConexoes([{ ...ATENDIMENTO, status: "qr" }]);
  const rpc = feitas("POST", "/rest/v1/rpc/update_instance_status").map((c) => c.corpo as Record<string, unknown>);
  // Mutante: sem a conferência depois de promover, o connection.update perdido deixava o chip repetido no ar.
  assert.deepEqual(rpc.map((r) => [r.target_instance_id, r.target_status]), [["inst-p", "connected"], ["inst-p", "disconnected"]]);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 1);
});

test("promover o número dos grupos com o número do atendimento já no ar com o mesmo chip derruba o do atendimento", async () => {
  // O caminho real de hoje: o Conectar e o Início só reconciliam os números dos grupos.
  prepara({ lista: [{ ...ATENDIMENTO, status: "connected" }, { ...GRUPOS, status: "connected" }] });
  await reconciliarConexoes([{ ...GRUPOS, status: "qr" }]);
  const rpc = feitas("POST", "/rest/v1/rpc/update_instance_status").map((c) => c.corpo as Record<string, unknown>);
  // Mutante: conferir só quando o promovido é o do atendimento deixa este caminho sem checagem nenhuma.
  assert.deepEqual(rpc.map((r) => [r.target_instance_id, r.target_status]), [["inst-g", "connected"], ["inst-p", "disconnected"]]);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 1);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-g").length, 0);
});

test("promover o número dos grupos numa loja sem número do atendimento não mexe em mais nada", async () => {
  prepara({ lista: [{ ...GRUPOS, status: "connected" }] });
  await reconciliarConexoes([{ ...GRUPOS, status: "qr" }]);
  assert.equal(feitas("POST", "/rest/v1/rpc/update_instance_status").length, 1);
  assert.equal(chamadas.filter((c) => c.metodo === "DELETE").length, 0);
});
