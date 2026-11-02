import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { POST as RotaPost } from "./route";

/**
 * POST /api/instances/[id]/actions contra um Supabase + Evolution de mentira (desenho de
 * `../route.test.ts`). O número do atendimento (`purpose = 'privado'`) só pareia com o add-on do
 * Recuperar/Rastreio; desconectar sempre vale, e o número dos grupos nem consulta o add-on.
 */

type Chamada = { metodo: string; url: URL; corpo: unknown };

type Mundo = {
  instancia: Record<string, unknown>;
  settings: unknown[];
};

const GRUPOS_EM_QR = {
  id: "inst-g",
  tenant_id: "loja-a",
  name: "WhatsApp",
  phone: null,
  purpose: "grupos",
  status: "qr",
  qr_code: null,
  provider: "evolution",
  provider_instance_id: "gr_inst-g",
  last_seen_at: null,
  connected_at: null,
  metadata: {},
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
};

const ATENDIMENTO_EM_QR = {
  ...GRUPOS_EM_QR,
  id: "inst-p",
  name: "Atendimento",
  purpose: "privado",
  provider_instance_id: "gr_inst-p",
};

const chamadas: Chamada[] = [];
let mundo: Mundo;

/** Zera o histórico e monta o mundo: uma instância e as linhas de `tenant_settings` da loja. */
function prepara(parcial: { instancia: Record<string, unknown>; settings?: unknown[] }): void {
  chamadas.length = 0;
  mundo = { instancia: parcial.instancia, settings: parcial.settings ?? [] };
}

const servidor = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte.toString("utf8")));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
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
  const { pathname } = url;
  if (pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
  if (pathname === "/rest/v1/memberships") {
    return { status: 200, corpo: [{ tenant_id: "loja-a", role: "owner", modules: [] }] };
  }
  if (pathname === "/rest/v1/instances" && metodo === "GET") return { status: 200, corpo: [mundo.instancia] };
  if (pathname === "/rest/v1/tenant_settings") return { status: 200, corpo: mundo.settings };
  if (pathname === "/rest/v1/rpc/update_instance_status") return { status: 200, corpo: null };
  if (pathname === "/rest/v1/logs" && metodo === "POST") return { status: 201 };
  // Evolution (mesmo servidor).
  if (metodo === "DELETE" && pathname.startsWith("/instance/logout/")) return { status: 200, corpo: {} };
  if (metodo === "GET" && pathname.startsWith("/instance/connect/")) return { status: 200, corpo: { code: "2@qr-falso" } };
  if (metodo === "GET" && pathname.startsWith("/instance/connectionState/")) {
    return { status: 200, corpo: { instance: { state: "close" } } };
  }
  return { status: 500, corpo: { message: `inesperado: ${metodo} ${pathname}` } };
}

let POST: typeof RotaPost;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  const origem = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_URL = origem;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  process.env.EVOLUTION_API_URL = origem;
  process.env.EVOLUTION_API_KEY = "chave-da-evolution-falsa";
  ({ POST } = await import("./route"));
});

after(() => {
  servidor.close();
});

function pedir(corpo: unknown): Request {
  return new Request("http://girumo.test/api/instances/x/actions", {
    method: "POST",
    headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-a", "content-type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

test("número do atendimento sem add-on não pareia: 403 e a Evolution não é chamada", async () => {
  prepara({ instancia: ATENDIMENTO_EM_QR, settings: [{ recuperar_enabled: false, rastreio_enabled: false }] });
  const res = await POST(pedir({ action: "refresh_qr" }), { params: Promise.resolve({ id: "inst-p" }) });
  assert.equal(res.status, 403);
  assert.equal(((await res.json()) as { code: string }).code, "privado_sem_addon");
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/instance/")).length, 0);
});

test("sem add-on, desconectar o número do atendimento continua valendo", async () => {
  prepara({ instancia: { ...ATENDIMENTO_EM_QR, status: "connected" }, settings: [] });
  const res = await POST(pedir({ action: "disconnect" }), { params: Promise.resolve({ id: "inst-p" }) });
  assert.equal(res.status, 200);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 1);
});

test("com o add-on, o número do atendimento gera QR como qualquer número", async () => {
  prepara({ instancia: ATENDIMENTO_EM_QR, settings: [{ recuperar_enabled: false, rastreio_enabled: true }] });
  const res = await POST(pedir({ action: "refresh_qr" }), { params: Promise.resolve({ id: "inst-p" }) });
  assert.equal(res.status, 200);
  assert.equal(feitas("GET", "/instance/connect/gr_inst-p").length, 1);
});

test("número dos grupos não consulta o add-on", async () => {
  prepara({ instancia: GRUPOS_EM_QR, settings: [{ recuperar_enabled: false, rastreio_enabled: false }] });
  const res = await POST(pedir({ action: "refresh_qr" }), { params: Promise.resolve({ id: "inst-g" }) });
  assert.equal(res.status, 200);
  assert.equal(feitas("GET", "/rest/v1/tenant_settings").length, 0);
});
