import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { POST as Post } from "./route";

/**
 * O receiver da Evolution contra um PostgREST de mentira (o desenho de
 * `groups/recount/route.test.ts`), só no caminho da Oferta Relâmpago.
 *
 * Erro do banco ao capturar o comentário precisa virar 5xx: devolver 200 diz à
 * Evolution que deu certo e o comentário some sem rastro. A reentrega que o 5xx
 * provoca é segura — o índice único da mensagem a transforma em no-op.
 */

const LOJA = "5b7e3c1a-2d4f-4a6b-8c9d-0e1f2a3b4c5d";
const SEGREDO = "segredo-do-webhook-de-teste";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];

const INSTANCIA = {
  id: "inst-1",
  tenant_id: LOJA,
  name: "Número 1",
  phone: "5511999990000",
  status: "connected",
  qr_code: null,
  provider: "evolution",
  provider_instance_id: "gr_inst-1",
  last_seen_at: null,
  connected_at: null,
  metadata: {},
  created_at: "2026-09-01T00:00:00+00:00",
  updated_at: "2026-09-01T00:00:00+00:00",
};

const JANELA = {
  offer_id: "oferta-1",
  group_id: "grupo-1",
  opened_at: "2026-10-16T12:00:00+00:00",
  lid_map: {},
  flash_offers: { keyword: "eu quero", status: "open" },
};

const ERRO_DO_BANCO: Resposta = { status: 500, corpo: { code: "XX000", message: "banco fora" } };

let respostas: Record<string, Resposta> = {};

const servidor = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const { status, corpo } = respostas[`${chamada.metodo} ${chamada.url.pathname}`] ?? {
      status: 500,
      corpo: { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` },
    };
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

let POST: typeof Post;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.EVOLUTION_WEBHOOK_SECRET = SEGREDO;
  ({ POST } = await import("./route"));
});

after(() => {
  servidor.close();
});

function cenario(janela: Resposta, entrada: Resposta) {
  chamadas.length = 0;
  respostas = {
    "GET /rest/v1/instances": { status: 200, corpo: [INSTANCIA] },
    "GET /rest/v1/flash_offer_groups": janela,
    "POST /rest/v1/flash_offer_entries": entrada,
  };
}

const comentario = () =>
  new Request("http://girumo.test/api/webhooks/evolution", {
    method: "POST",
    headers: { "content-type": "application/json", "x-evolution-webhook-secret": SEGREDO },
    body: JSON.stringify({
      event: "messages.upsert",
      instance: "gr_inst-1",
      date_time: "2026-10-16T09:01:00.000Z",
      data: {
        key: {
          remoteJid: "120363000000000001@g.us",
          id: "MSG-1",
          fromMe: false,
          participant: "100000000000001@lid",
        },
        pushName: "Ana",
        message: { conversation: "eu quero" },
        messageTimestamp: Math.floor(Date.parse("2026-10-16T12:01:00Z") / 1000),
      },
    }),
  });

const gravouEntrada = () =>
  chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/flash_offer_entries");

test("comentário capturado volta 200 e grava a entrada presa à loja, sem telefone inventado", async () => {
  cenario({ status: 200, corpo: [JANELA] }, { status: 201 });

  const res = await POST(comentario());

  assert.equal(res.status, 200);
  const [insert] = gravouEntrada();
  const linha = insert.corpo as Record<string, unknown>;
  assert.equal(linha.tenant_id, LOJA);
  assert.equal(linha.participant_jid, "100000000000001@lid");
  // LID fora do mapa fica sem telefone: os dígitos dele não são número.
  assert.equal(linha.phone, null);
});

test("reentrega (23505) continua 200: o índice único é que deduplica", async () => {
  cenario({ status: 200, corpo: [JANELA] }, { status: 409, corpo: { code: "23505", message: "duplicate key" } });

  const res = await POST(comentario());

  assert.equal(res.status, 200);
});

test("erro do banco ao gravar o comentário não vira 200", async () => {
  cenario({ status: 200, corpo: [JANELA] }, ERRO_DO_BANCO);

  // Mutante: o try/catch que engolia o erro e devolvia { received: true }.
  // Sem catch na rota, o Next responde 500 — igual a qualquer erro de banco aqui.
  await assert.rejects(POST(comentario()));
  assert.equal(gravouEntrada().length, 1);
});

test("erro do banco ao procurar a janela não vira 'sem oferta aberta'", async () => {
  cenario(ERRO_DO_BANCO, { status: 201 });

  await assert.rejects(POST(comentario()));
  assert.equal(gravouEntrada().length, 0);
});
