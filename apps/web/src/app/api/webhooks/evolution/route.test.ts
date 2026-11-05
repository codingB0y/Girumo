import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { WorkStore } from "next/dist/server/app-render/work-async-storage.external";

import type { POST as Post } from "./route";

/**
 * O receiver da Evolution contra um PostgREST de mentira (o desenho de
 * `groups/recount/route.test.ts`), só no caminho da Oferta Relâmpago.
 *
 * Erro do banco ao capturar o comentário precisa virar 5xx: devolver 200 diz à
 * Evolution que deu certo e o comentário some sem rastro. A reentrega que o 5xx
 * provoca é segura — o índice único da mensagem a transforma em no-op.
 */

// O Next lê este global uma vez, quando carrega: antes do import (dinâmico, no `before`).
// Sem ele o `revalidateTag` do link da bio não tem escopo de requisição onde registrar a tag.
(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage = AsyncLocalStorage;

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
  purpose: "grupos",
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

/** O número do atendimento da mesma loja, com o MESMO chip do `INSTANCIA`. */
const ATENDIMENTO = {
  ...INSTANCIA,
  id: "inst-p",
  provider_instance_id: "gr_inst-p",
  purpose: "privado",
  phone: "5511999990000",
};

const JANELA = {
  offer_id: "oferta-1",
  group_id: "grupo-1",
  opened_at: "2026-10-16T12:00:00+00:00",
  lid_map: {},
  flash_offers: { keyword: "eu quero", status: "open" },
};

const ERRO_DO_BANCO: Resposta = { status: 500, corpo: { code: "XX000", message: "banco fora" } };

let respostas: Record<string, Resposta | ((c: Chamada) => Resposta)> = {};

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
    const resposta = respostas[`${chamada.metodo} ${chamada.url.pathname}`] ?? respostas["*"] ?? {
      status: 500,
      corpo: { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` },
    };
    const { status, corpo } = typeof resposta === "function" ? resposta(chamada) : resposta;
    if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
  });
});

let POST: typeof Post;
let naRequisicao: (escopo: WorkStore, fn: () => Promise<Response>) => Promise<Response>;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  // A conferência do número do atendimento pode chamar a Evolution (logout): o mesmo servidor responde.
  process.env.EVOLUTION_API_URL = `http://127.0.0.1:${port}`;
  process.env.EVOLUTION_API_KEY = "chave-da-evolution-falsa";
  process.env.EVOLUTION_WEBHOOK_SECRET = SEGREDO;
  const { workAsyncStorage } = await import("next/dist/server/app-render/work-async-storage.external");
  naRequisicao = (escopo, fn) => workAsyncStorage.run(escopo, fn);
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

/** `connection.update` como a Evolution manda; `wuid` só vem quando a conexão abre. */
const conexao = (state: string, wuid?: string, instancia = "gr_inst-1", statusReason?: number) =>
  new Request("http://girumo.test/api/webhooks/evolution", {
    method: "POST",
    headers: { "content-type": "application/json", "x-evolution-webhook-secret": SEGREDO },
    body: JSON.stringify({
      event: "connection.update",
      instance: instancia,
      date_time: "2026-10-20T09:01:00.000Z",
      data: { state, ...(wuid ? { wuid } : {}), ...(statusReason !== undefined ? { statusReason } : {}) },
    }),
  });

/** Escopo de requisição falso: o `revalidateTag` do Next só pede `incrementalCache` e registra a tag nele. */
const novoEscopo = () => ({ incrementalCache: {} }) as unknown as WorkStore;

function cenarioConexao() {
  chamadas.length = 0;
  respostas = {
    "GET /rest/v1/instances": { status: 200, corpo: [INSTANCIA] },
    "POST /rest/v1/rpc/update_instance_status": { status: 200, corpo: null },
    "POST /rest/v1/funnel_events": { status: 201 },
    "POST /rest/v1/rpc/record_engine_event": { status: 200, corpo: [{ is_new: true }] },
    "POST /rest/v1/engine_events": { status: 201 },
  };
}

test("conectar com número diferente do gravado invalida o link da bio da loja", async () => {
  cenarioConexao();
  const escopo = novoEscopo();

  const res = await naRequisicao(escopo, () => POST(conexao("open", "5511988887777@s.whatsapp.net")));

  assert.equal(res.status, 200, JSON.stringify(chamadas.map((c) => `${c.metodo} ${c.url.pathname}`)));
  assert.ok(escopo.pendingRevalidatedTags?.includes(`bio-loja:${LOJA}`), `tags: ${escopo.pendingRevalidatedTags}`);
});

test("reconectar com o mesmo número não invalida (connection.update chega em rajada)", async () => {
  cenarioConexao();
  const escopo = novoEscopo();

  const res = await naRequisicao(escopo, () => POST(conexao("open", "5511999990000@s.whatsapp.net")));

  assert.equal(res.status, 200);
  assert.equal(escopo.pendingRevalidatedTags, undefined);
});

test("queda sem wuid (telefone nulo) não invalida", async () => {
  cenarioConexao();
  const escopo = novoEscopo();

  const res = await naRequisicao(escopo, () => POST(conexao("close")));

  assert.equal(res.status, 200);
  assert.equal(escopo.pendingRevalidatedTags, undefined);
});

// Convalescença (05/11/2026): a sessão que o WhatsApp derrubou (401) e que volta horas depois.
const MEU_CHIP = "5511999990000@s.whatsapp.net";
const horasAtras = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

function cenarioDerrubada(lastLoggedOutAt: string | null) {
  cenarioConexao();
  respostas["GET /rest/v1/instances"] = {
    status: 200,
    corpo: [{ ...INSTANCIA, metadata: lastLoggedOutAt ? { lastLoggedOutAt } : {} }],
  };
  respostas["POST /rest/v1/rpc/iniciar_convalescenca"] = {
    status: 200,
    corpo: { iniciada: true, posts_pausados_ate: horasAtras(-22), perfil_ate: horasAtras(-312), cancelados: 0 },
  };
}

const metadataGravado = () =>
  chamadas
    .filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/rpc/update_instance_status")
    .map((c) => (c.corpo as { target_metadata: Record<string, unknown> }).target_metadata);

const iniciouConvalescenca = () =>
  chamadas
    .filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/rpc/iniciar_convalescenca")
    .map((c) => c.corpo);

test("queda 401 guarda a hora da derrubada; queda passageira (428) não", async () => {
  cenarioDerrubada(null);
  let res = await naRequisicao(novoEscopo(), () => POST(conexao("close", undefined, "gr_inst-1", 401)));
  assert.equal(res.status, 200);
  const [derrubada] = metadataGravado();
  assert.equal(derrubada.lastDisconnectReason, 401);
  assert.equal(typeof derrubada.lastLoggedOutAt, "string");
  assert.ok(Math.abs(Date.now() - new Date(derrubada.lastLoggedOutAt as string).getTime()) < 60_000);

  cenarioDerrubada(null);
  res = await naRequisicao(novoEscopo(), () => POST(conexao("close", undefined, "gr_inst-1", 428)));
  assert.equal(res.status, 200);
  const [passageira] = metadataGravado();
  assert.equal(passageira.lastDisconnectReason, 428);
  assert.equal("lastLoggedOutAt" in passageira, false, "428 não pode mexer na hora da derrubada");
});

test("o segundo 401 do mesmo episódio não move a hora (o pareamento emite outro 401 antes de abrir)", async () => {
  const primeiro = horasAtras(3);
  cenarioDerrubada(primeiro);

  const res = await naRequisicao(novoEscopo(), () => POST(conexao("close", undefined, "gr_inst-1", 401)));

  assert.equal(res.status, 200);
  assert.equal("lastLoggedOutAt" in metadataGravado()[0], false, `metadata: ${JSON.stringify(metadataGravado())}`);
});

test("abrir 30 min ou mais depois da derrubada inicia a convalescença e esquece a hora", async () => {
  const derrubadaEm = horasAtras(3);
  cenarioDerrubada(derrubadaEm);

  const res = await naRequisicao(novoEscopo(), () => POST(conexao("open", MEU_CHIP)));

  assert.equal(res.status, 200);
  assert.deepEqual(iniciouConvalescenca(), [{ p_tenant: LOJA, p_instance: "inst-1", p_logout_at: derrubadaEm }]);
  assert.equal(metadataGravado()[0].lastLoggedOutAt, null);
});

test("abrir minutos depois do 401 é pareamento: não inicia, mas esquece a hora", async () => {
  cenarioDerrubada(new Date(Date.now() - 2 * 60_000).toISOString());

  const res = await naRequisicao(novoEscopo(), () => POST(conexao("open", MEU_CHIP)));

  assert.equal(res.status, 200);
  assert.equal(iniciouConvalescenca().length, 0);
  assert.equal(metadataGravado()[0].lastLoggedOutAt, null);
});

test("chip diferente do que caiu não entra em convalescença (é outro número na mesma vaga)", async () => {
  cenarioDerrubada(horasAtras(3));

  const res = await naRequisicao(novoEscopo(), () => POST(conexao("open", "5511988887777@s.whatsapp.net")));

  assert.equal(res.status, 200);
  assert.equal(iniciouConvalescenca().length, 0);
  assert.equal(metadataGravado()[0].lastLoggedOutAt, null);
});

test("erro do banco na convalescença não derruba o webhook e guarda a hora para a próxima abertura", async () => {
  const derrubadaEm = horasAtras(3);
  cenarioDerrubada(derrubadaEm);
  respostas["POST /rest/v1/rpc/iniciar_convalescenca"] = ERRO_DO_BANCO;

  const res = await naRequisicao(novoEscopo(), () => POST(conexao("open", MEU_CHIP)));

  assert.equal(res.status, 200);
  assert.equal(iniciouConvalescenca().length, 1);
  assert.equal(metadataGravado()[0].lastLoggedOutAt, derrubadaEm);
});

// Disjuntor do anti-ban (23/10/2026): só a saída voluntária faz o banco recontar.
const saida = (autor: string) =>
  new Request("http://girumo.test/api/webhooks/evolution", {
    method: "POST",
    headers: { "content-type": "application/json", "x-evolution-webhook-secret": SEGREDO },
    body: JSON.stringify({
      event: "group-participants.update",
      instance: "gr_inst-1",
      date_time: "2026-10-23T10:01:00.000Z",
      data: {
        id: "120363000000000001@g.us",
        action: "remove",
        author: autor,
        participants: [{ id: "100000000000001@lid", phoneNumber: null, admin: null }],
      },
    }),
  });

function cenarioSaida() {
  chamadas.length = 0;
  respostas = {
    "GET /rest/v1/instances": { status: 200, corpo: [INSTANCIA] },
    "POST /rest/v1/rpc/record_engine_event": { status: 200, corpo: [{ is_new: true }] },
    "POST /rest/v1/rpc/avaliar_disjuntor_saidas": { status: 200, corpo: { aberto: false, saidas: 3, limite: 30 } },
    "*": { status: 200, corpo: [] },
  };
}

const avaliouDisjuntor = () =>
  chamadas.filter((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/rpc/avaliar_disjuntor_saidas");

test("saída voluntária faz o banco avaliar o disjuntor da loja", async () => {
  cenarioSaida();

  const res = await POST(saida("100000000000001@lid"));

  assert.equal(res.status, 200);
  assert.deepEqual(
    avaliouDisjuntor().map((c) => c.corpo),
    [{ p_tenant: LOJA }],
  );
});

test("remoção por admin não avalia o disjuntor", async () => {
  cenarioSaida();

  const res = await POST(saida("200000000000002@lid"));

  assert.equal(res.status, 200);
  assert.equal(avaliouDisjuntor().length, 0);
});

test("erro do banco no disjuntor não derruba o webhook", async () => {
  cenarioSaida();
  respostas["POST /rest/v1/rpc/avaliar_disjuntor_saidas"] = ERRO_DO_BANCO;

  const res = await POST(saida("100000000000001@lid"));

  assert.equal(res.status, 200);
  assert.equal(avaliouDisjuntor().length, 1);
});

// Número do atendimento (`purpose = 'privado'`): fora da sincronização de grupos, e nunca com o chip dos grupos.
const webhook = (corpo: unknown) =>
  new Request("http://girumo.test/api/webhooks/evolution", {
    method: "POST",
    headers: { "content-type": "application/json", "x-evolution-webhook-secret": SEGREDO },
    body: JSON.stringify(corpo),
  });

const feitas = (metodo: string, caminho: string) =>
  chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);

/** Com `provider_instance_id=eq.X` a lista devolve só aquela; sem, são os dois números da loja. */
const listaDeInstancias = (c: Chamada): Resposta => {
  const alvo = c.url.searchParams.get("provider_instance_id");
  const todas = [ATENDIMENTO, INSTANCIA];
  return { status: 200, corpo: alvo ? todas.filter((i) => alvo === `eq.${i.provider_instance_id}`) : todas };
};

function cenarioDoisNumeros() {
  cenarioConexao();
  respostas["GET /rest/v1/instances"] = listaDeInstancias;
  respostas["POST /rest/v1/notifications"] = { status: 201 };
  respostas["DELETE /instance/logout/gr_inst-p"] = { status: 200, corpo: {} };
}

test("evento de grupo no número do atendimento é ignorado: não grava, não importa grupo, não conta saída", async () => {
  for (const evento of [
    { event: "groups.upsert", data: [{ id: "120363000000000009@g.us", subject: "Grupo do atendimento" }] },
    { event: "group-participants.update", data: { id: "120363000000000001@g.us", action: "remove", author: "1@lid", participants: [{ id: "1@lid" }] } },
  ]) {
    chamadas.length = 0;
    respostas = { "GET /rest/v1/instances": { status: 200, corpo: [ATENDIMENTO] } };
    const res = await POST(webhook({ ...evento, instance: "gr_inst-p", date_time: "2026-10-30T10:00:00.000Z" }));
    assert.equal(res.status, 200, evento.event);
    assert.deepEqual(await res.json(), { received: true, ignored: true });
    // Mutante: sem o ramo, o evento vira engine_events (lead no worker), grupo importado e disjuntor avaliado.
    assert.deepEqual(chamadas.map((c) => `${c.metodo} ${c.url.pathname}`), ["GET /rest/v1/instances"], evento.event);
  }
});

test("o número do atendimento conectando com o chip dos grupos é recusado na hora", async () => {
  cenarioDoisNumeros();
  const res = await POST(conexao("open", "5511999990000@s.whatsapp.net", "gr_inst-p"));
  assert.equal(res.status, 200);
  const rpc = feitas("POST", "/rest/v1/rpc/update_instance_status").map((c) => c.corpo as Record<string, unknown>);
  assert.deepEqual(rpc.map((r) => [r.target_instance_id, r.target_status]), [["inst-p", "connected"], ["inst-p", "disconnected"]]);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 1);
});

test("o número dos grupos conectando com o chip do atendimento derruba o do atendimento, nunca o dos grupos", async () => {
  cenarioDoisNumeros();
  const res = await POST(conexao("open", "5511999990000@s.whatsapp.net", "gr_inst-1"));
  assert.equal(res.status, 200);
  const rpc = feitas("POST", "/rest/v1/rpc/update_instance_status").map((c) => c.corpo as Record<string, unknown>);
  assert.deepEqual(rpc.map((r) => [r.target_instance_id, r.target_status]), [["inst-1", "connected"], ["inst-p", "disconnected"]]);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-p").length, 1);
  assert.equal(feitas("DELETE", "/instance/logout/gr_inst-1").length, 0);
});

test("o marco qr_connected é só do número dos grupos: o do atendimento conectando não ativa a loja", async () => {
  // Cada número com o seu chip (sem recusa) e o mesmo telefone do banco (sem invalidar a bio): sobra só o marco.
  const proprio = { ...ATENDIMENTO, phone: "5511977776666" };
  const doisNumeros = () => {
    cenarioDoisNumeros();
    respostas["GET /rest/v1/instances"] = (c) => {
      const alvo = c.url.searchParams.get("provider_instance_id");
      const todas = [proprio, INSTANCIA];
      return { status: 200, corpo: alvo ? todas.filter((i) => alvo === `eq.${i.provider_instance_id}`) : todas };
    };
    respostas["POST /rest/v1/private_number_state"] = { status: 201 };
  };

  doisNumeros();
  const res = await POST(conexao("open", "5511977776666@s.whatsapp.net", "gr_inst-p"));
  assert.equal(res.status, 200);
  assert.equal(feitas("POST", "/rest/v1/rpc/update_instance_status").length, 1);
  // Mutante: sem o guarda `purpose === "grupos"` o upsert sai e a loja que só pareou o atendimento vira "ativada".
  assert.equal(feitas("POST", "/rest/v1/funnel_events").length, 0);

  // Contraprova: o mesmo evento no número dos grupos grava o marco (upsert que preserva a 1a vez).
  doisNumeros();
  assert.equal((await POST(conexao("open", "5511999990000@s.whatsapp.net", "gr_inst-1"))).status, 200);
  const [marco] = feitas("POST", "/rest/v1/funnel_events");
  const linha = marco.corpo as Record<string, unknown>;
  assert.deepEqual([linha.tenant_id, linha.event_name], [LOJA, "qr_connected"]);
  assert.match(marco.url.search, /on_conflict=tenant_id%2Cevent_name/);
});
