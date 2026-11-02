import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";

import {
  avisosEnviando,
  avisosParaEnviar,
  criarAvisos,
  marcarAviso,
  reabrirAvisos,
} from "./rastreio-avisos";

/** O cliente real do Supabase contra um PostgREST de mentira (molde de `bling-pedidos.test.ts`). */

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

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([chave]) => chave !== "select"));
const COLUNAS = "id,order_id,etapa,channel,attempts,resends,message_id";
const LINHA = { id: "n-1", order_id: "o-1", etapa: "enviado", channel: "email", attempts: 1, resends: 0, message_id: null };
const AVISO = { id: "n-1", orderId: "o-1", etapa: "enviado", canal: "email", attempts: 1, resends: 0, messageId: null };

test("criarAvisos pede ignore-duplicates e devolve só os criados agora", async () => {
  // Imita o ignore-duplicates: guarda as chaves e devolve só as linhas novas.
  const vistas = new Set<string>();
  let seq = 0;
  responder = ({ corpo, prefer }) => {
    assert.match(prefer, /resolution=ignore-duplicates/);
    const novas = (corpo as { order_id: string; etapa: string; channel: string }[]).filter((l) => {
      const chave = `${l.order_id}|${l.etapa}|${l.channel}`;
      if (vistas.has(chave)) return false;
      vistas.add(chave);
      return true;
    });
    return { status: 201, corpo: novas.map((l) => ({ id: `n-${++seq}`, channel: l.channel })) };
  };

  assert.deepEqual(await criarAvisos("loja-a", "o-1", "enviado", ["whatsapp", "email"]), [
    { id: "n-1", canal: "whatsapp" },
    { id: "n-2", canal: "email" },
  ]);
  const [{ metodo, url, prefer, corpo }] = chamadas;
  assert.deepEqual([metodo, url.pathname], ["POST", "/rest/v1/tracking_notices"]);
  assert.equal(url.searchParams.get("on_conflict"), "order_id,etapa,channel");
  assert.match(prefer, /return=representation/);
  assert.deepEqual(corpo, [
    { tenant_id: "loja-a", order_id: "o-1", etapa: "enviado", channel: "whatsapp" },
    { tenant_id: "loja-a", order_id: "o-1", etapa: "enviado", channel: "email" },
  ]);

  // A mesma chamada de novo: nada criado.
  assert.deepEqual(await criarAvisos("loja-a", "o-1", "enviado", ["whatsapp", "email"]), []);

  // Sem canais, sem requisição.
  chamadas.length = 0;
  assert.deepEqual(await criarAvisos("loja-a", "o-1", "enviado", []), []);
  assert.equal(chamadas.length, 0);
});

test("avisosParaEnviar: pendentes da loja e do canal, sem espera ou vencidos, os mais velhos primeiro", async () => {
  responder = () => ({ status: 200, corpo: [LINHA] });

  assert.deepEqual(await avisosParaEnviar("loja-a", "email", 10, new Date("2026-10-29T15:00:00.000Z")), [AVISO]);

  const [{ url }] = chamadas;
  assert.equal(url.pathname, "/rest/v1/tracking_notices");
  assert.equal(url.searchParams.get("select"), COLUNAS);
  assert.deepEqual(filtros(url), {
    tenant_id: "eq.loja-a",
    channel: "eq.email",
    status: "eq.pendente",
    or: "(next_try_at.is.null,next_try_at.lte.2026-10-29T15:00:00.000Z)",
    order: "created_at.asc",
    limit: "10",
  });
});

test("avisosEnviando: os enviando da loja e do canal", async () => {
  responder = () => ({ status: 200, corpo: [{ ...LINHA, channel: "whatsapp", message_id: "m-1" }] });

  assert.deepEqual(await avisosEnviando("loja-a", "whatsapp", 50), [{ ...AVISO, canal: "whatsapp", messageId: "m-1" }]);

  assert.deepEqual(filtros(chamadas[0].url), {
    tenant_id: "eq.loja-a",
    channel: "eq.whatsapp",
    status: "eq.enviando",
    order: "updated_at.asc",
    limit: "50",
  });
});

test("marcarAviso grava só o que veio e soma a tentativa lida", async () => {
  responder = ({ metodo }) => (metodo === "GET" ? { status: 200, corpo: [{ attempts: 2 }] } : { status: 200, corpo: [{ id: "n-1" }] });

  await marcarAviso("loja-a", "n-1", { status: "falhou", error: "x", nextTryAt: "2026-10-29T16:00:00.000Z", somarTentativa: true });

  const [leitura, escrita] = chamadas;
  assert.equal(leitura.metodo, "GET");
  assert.equal(leitura.url.searchParams.get("select"), "attempts");
  assert.deepEqual(filtros(leitura.url), { tenant_id: "eq.loja-a", id: "eq.n-1" });
  assert.equal(escrita.metodo, "PATCH");
  assert.deepEqual(filtros(escrita.url), { tenant_id: "eq.loja-a", id: "eq.n-1" });
  const { updated_at: carimbo, ...resto } = escrita.corpo as Record<string, unknown>;
  assert.deepEqual(resto, { status: "falhou", error: "x", next_try_at: "2026-10-29T16:00:00.000Z", attempts: 3 });
  assert.match(carimbo as string, ISO);

  // Sem somarTentativa: nenhuma leitura.
  chamadas.length = 0;
  await marcarAviso("loja-a", "n-1", { status: "enviado", messageId: "m-1", sentAt: "2026-10-29T15:00:00.000Z" });
  assert.deepEqual(chamadas.map((c) => c.metodo), ["PATCH"]);
  const corpo = { ...(chamadas[0].corpo as Record<string, unknown>), updated_at: undefined };
  assert.deepEqual(JSON.parse(JSON.stringify(corpo)), { status: "enviado", message_id: "m-1", sent_at: "2026-10-29T15:00:00.000Z" });

  responder = () => ({ status: 200, corpo: [] });
  await assert.rejects(marcarAviso("loja-a", "n-1", { status: "pulado" }), /aviso não encontrado/);
});

test("reabrirAvisos reabre uma vez o que existe e cria o que falta", async () => {
  let resends = 0;
  responder = ({ metodo, url }) => {
    if (metodo === "GET") return { status: 200, corpo: [{ id: "n-1", channel: "whatsapp", resends }] };
    if (metodo === "PATCH") return { status: 200, corpo: url.searchParams.get("resends") === `eq.${resends}` ? [{ id: "n-1" }] : [] };
    return { status: 201, corpo: [{ id: "n-2", channel: "email" }] };
  };

  assert.equal(await reabrirAvisos("loja-a", "o-1", "enviado", ["whatsapp", "email"]), 2);

  const [leitura, reabertura, criacao] = chamadas;
  assert.deepEqual(filtros(leitura.url), { tenant_id: "eq.loja-a", order_id: "eq.o-1", etapa: "eq.enviado", channel: "in.(whatsapp,email)" });
  assert.deepEqual(filtros(reabertura.url), { tenant_id: "eq.loja-a", id: "eq.n-1", resends: "eq.0", status: "not.in.(pendente,enviando)" });
  const { updated_at: carimbo, ...resto } = reabertura.corpo as Record<string, unknown>;
  assert.deepEqual(resto, { status: "pendente", resends: 1, attempts: 0, message_id: null, error: null, next_try_at: null, sent_at: null });
  assert.match(carimbo as string, ISO);
  assert.deepEqual(criacao.corpo, [{ tenant_id: "loja-a", order_id: "o-1", etapa: "enviado", channel: "email" }]);

  // Segundo clique concorrente: o resends já mudou, o PATCH não acha a linha e ela não conta.
  chamadas.length = 0;
  resends = 1;
  responder = ({ metodo }) => {
    if (metodo === "GET") return { status: 200, corpo: [{ id: "n-1", channel: "whatsapp", resends: 0 }] };
    return { status: 200, corpo: [] };
  };
  assert.equal(await reabrirAvisos("loja-a", "o-1", "enviado", ["whatsapp"]), 0);
  assert.equal(chamadas.filter((c) => c.metodo === "POST").length, 0);

  chamadas.length = 0;
  assert.equal(await reabrirAvisos("loja-a", "o-1", "enviado", []), 0);
  assert.equal(chamadas.length, 0);
});
