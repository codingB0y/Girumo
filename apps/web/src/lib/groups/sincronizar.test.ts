import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { sincronizarGrupos as SincronizarGrupos } from "./sincronizar";

/**
 * O sync inteiro contra três serviços de mentira num servidor só: o PostgREST
 * (`/rest/v1`), a Evolution (`/group/fetchAllGroups`) e o Upstash da trava por
 * número (`/upstash`). O que sai daqui é o que sai em produção; só a rede é trocada.
 */

type Chamada = { metodo: string; url: URL; corpo: unknown; prefer: string };
type Resposta = { status: number; corpo?: unknown };

const LOJA = "loja-a";
const chamadas: Chamada[] = [];
let banco: Record<string, (c: Chamada) => Resposta> = {};
let evolution: Resposta = { status: 200, corpo: [] };
/** `true` = outro sync deste número segura a trava (o SET NX não grava). */
let travaOcupada = false;

/** `set … nx` só grava se ninguém segura; `del` apaga. */
function resultadoDaTrava(comando: unknown[]): unknown {
  return String(comando[0]).toLowerCase() === "set" ? (travaOcupada ? null : "OK") : 1;
}

/** Os comandos que chegaram ao Upstash, na ordem — com ou sem pipeline. */
function comandosDaTrava(): string[] {
  return chamadas
    .filter((c) => c.url.pathname.startsWith("/upstash"))
    .flatMap((c) =>
      c.url.pathname.endsWith("/pipeline")
        ? (c.corpo as unknown[][]).map((cmd) => String(cmd[0]).toLowerCase())
        : [String((c.corpo as unknown[])[0]).toLowerCase()],
    );
}

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
    const responder = (status: number, corpo?: unknown) => {
      if (corpo !== undefined) res.setHeader("Content-Type", "application/json");
      res.statusCode = status;
      res.end(corpo === undefined ? undefined : JSON.stringify(corpo));
    };

    if (chamada.url.pathname.startsWith("/upstash")) {
      // Upstash REST: o comando chega como array no corpo (ou lista deles, em
      // /pipeline). Com `Upstash-Encoding: base64`, string volta em base64.
      const base64 = req.headers["upstash-encoding"] === "base64";
      const codificar = (v: unknown) => (base64 && typeof v === "string" ? Buffer.from(v).toString("base64") : v);
      if (chamada.url.pathname.endsWith("/pipeline")) {
        return responder(
          200,
          (chamada.corpo as unknown[][]).map((cmd) => ({ result: codificar(resultadoDaTrava(cmd)) })),
        );
      }
      return responder(200, { result: codificar(resultadoDaTrava(chamada.corpo as unknown[])) });
    }
    if (chamada.url.pathname.startsWith("/group/fetchAllGroups/")) {
      return responder(evolution.status, evolution.corpo);
    }
    const tabela = banco[`${chamada.metodo} ${chamada.url.pathname}`];
    if (tabela) {
      const { status, corpo } = tabela(chamada);
      return responder(status, corpo);
    }
    // Chamada que ninguém previu vira 500, para aparecer.
    return responder(500, { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` });
  });
});

let sincronizarGrupos: typeof SincronizarGrupos;

before(async () => {
  await new Promise<void>((pronto) => servidor.listen(0, "127.0.0.1", pronto));
  const { port } = servidor.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.EVOLUTION_API_URL = base;
  process.env.EVOLUTION_API_KEY = "chave-da-evolution-falsa";
  // A trava lê o Upstash na importação: o env vem antes do import dinâmico.
  process.env.UPSTASH_REDIS_REST_URL = `${base}/upstash`;
  process.env.UPSTASH_REDIS_REST_TOKEN = "token-do-upstash-falso";
  ({ sincronizarGrupos } = await import("./sincronizar"));
});

after(() => {
  servidor.close();
});

const feitas = (metodo: string, caminho: string) =>
  chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);

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

const NOS = { id: "5511999990000@s.whatsapp.net", phoneNumber: "5511999990000@s.whatsapp.net", admin: "superadmin" };
const SOCIA = { id: "88888@lid", phoneNumber: "5511888880000@s.whatsapp.net", admin: "admin" };

/** O que a Evolution devolve: dois grupos que já temos, um novo e um de terceiro. */
const DA_EVOLUTION = [
  { id: "g1@g.us", subject: "Moda Kids 1", size: 980, participants: [NOS, SOCIA] },
  // Payload truncado (evolution-api#2124): só o "self". O banco tem 500.
  { id: "g2@g.us", subject: "Moda Kids 2", size: 1, participants: [NOS] },
  // Somos admin, mas o grupo nunca foi importado.
  { id: "g3@g.us", subject: "Grupo novo", size: 40, participants: [NOS] },
  // Não somos admin.
  { id: "g4@g.us", subject: "Grupo de terceiro", size: 300, participants: [{ ...NOS, admin: null }, SOCIA] },
];

/** `listMemberCounts`: o que já está gravado. */
const CONTAGENS = [
  { whatsapp_group_id: "g1@g.us", members: 900 },
  { whatsapp_group_id: "g2@g.us", members: 500 },
  { whatsapp_group_id: "g4@g.us", members: 290 },
];

/** `listGroups` (backfill de convite do modo completo): o g3 já gravado, sem convite. */
const GRUPOS_DO_BANCO = [
  { id: "row-1", tenant_id: LOJA, whatsapp_group_id: "g1@g.us", is_admin: true, invite_url: "https://chat.whatsapp.com/AAA", metadata: {} },
  { id: "row-2", tenant_id: LOJA, whatsapp_group_id: "g2@g.us", is_admin: true, invite_url: "https://chat.whatsapp.com/BBB", metadata: {} },
  { id: "row-3", tenant_id: LOJA, whatsapp_group_id: "g3@g.us", is_admin: true, invite_url: null, metadata: {} },
];

function bancoDaLoja(instancias: unknown[] = [INSTANCIA]): Record<string, (c: Chamada) => Resposta> {
  return {
    "GET /rest/v1/instances": () => ({ status: 200, corpo: instancias }),
    "GET /rest/v1/groups": (c) =>
      c.url.searchParams.get("select") === "whatsapp_group_id,members"
        ? { status: 200, corpo: CONTAGENS }
        : { status: 200, corpo: GRUPOS_DO_BANCO },
    "POST /rest/v1/groups": (c) => ({
      status: 201,
      corpo: (c.corpo as unknown[]).map((_, i) => ({ id: `row-${i}` })),
    }),
    "DELETE /rest/v1/groups": () => ({ status: 200, corpo: [{ id: "row-4" }] }),
    "GET /rest/v1/group_bulk_jobs": () => ({ status: 200, corpo: [] }),
    "POST /rest/v1/group_bulk_jobs": () => ({ status: 201, corpo: [{ id: "bulk-1" }] }),
    "POST /rest/v1/funnel_events": () => ({ status: 201 }),
    "POST /rest/v1/logs": () => ({ status: 201 }),
  };
}

function prepara(over: { instancias?: unknown[]; evolution?: Resposta; travaOcupada?: boolean } = {}): void {
  chamadas.length = 0;
  banco = bancoDaLoja(over.instancias);
  evolution = over.evolution ?? { status: 200, corpo: DA_EVOLUTION };
  travaOcupada = over.travaOcupada ?? false;
}

test("recontagem regrava só membros e admins dos grupos que já estão no banco", async () => {
  prepara();

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true });

  assert.deepEqual(r, { ok: true, synced: 1, admin: 1, semBackup: 0, ignorados: 1, removidos: 0 });

  const upserts = feitas("POST", "/rest/v1/groups");
  assert.equal(upserts.length, 1);
  const [upsert] = upserts;
  assert.equal(upsert.url.searchParams.get("on_conflict"), "tenant_id,whatsapp_group_id");
  assert.match(upsert.prefer, /resolution=merge-duplicates/);
  const linhas = upsert.corpo as Array<Record<string, unknown>>;
  // Mutante: mandar o payload do Sincronizar (is_admin, comunidade) — recontar não decide nada disso.
  for (const linha of linhas) {
    assert.deepEqual(Object.keys(linha).sort(), [
      "admins_counted_at",
      "admins_ours",
      "admins_total",
      "members",
      "name",
      "tenant_id",
      "whatsapp_group_id",
    ]);
    assert.equal(linha.tenant_id, LOJA);
    assert.equal(typeof linha.admins_counted_at, "string");
  }
  assert.deepEqual(
    linhas.map((l) => [l.whatsapp_group_id, l.name, l.members, l.admins_total, l.admins_ours]),
    // O g2 veio truncado (só o "self"): fica fora da recontagem inteira, porque
    // os admins e o nome dele sairiam desse payload truncado.
    [["g1@g.us", "Moda Kids 1", 980, 2, 1]],
  );

  // Mutantes: herdar do Sincronizar a fila de convite, o apagar de não-admin, o
  // grupo novo, o marco de funil ou a leitura da loja inteira.
  assert.equal(chamadas.filter((c) => c.metodo === "DELETE").length, 0);
  assert.equal(feitas("GET", "/rest/v1/group_bulk_jobs").length, 0);
  assert.equal(feitas("POST", "/rest/v1/group_bulk_jobs").length, 0);
  assert.equal(feitas("POST", "/rest/v1/funnel_events").length, 0);
  assert.equal(feitas("GET", "/rest/v1/groups").length, 1);

  // O service-role passa por cima do RLS: toda leitura filtra a loja.
  for (const c of chamadas.filter((c) => c.metodo === "GET" && c.url.pathname.startsWith("/rest/v1/"))) {
    assert.equal(c.url.searchParams.get("tenant_id"), `eq.${LOJA}`, c.url.pathname);
  }
  const fetches = feitas("GET", "/group/fetchAllGroups/gr_inst-1");
  assert.equal(fetches.length, 1);
  assert.equal(fetches[0].url.searchParams.get("getParticipants"), "true");
  assert.deepEqual(comandosDaTrava(), ["set", "del"]);
  const [log] = feitas("POST", "/rest/v1/logs");
  assert.equal((log.corpo as Record<string, unknown>).event, "groups.recounted");
});

test("com outro sync do mesmo número rodando, a recontagem desiste sem tocar na Evolution", async () => {
  prepara({ travaOcupada: true });

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true });

  assert.deepEqual(r, {
    ok: false,
    status: 409,
    error: "Os grupos deste numero ja estao sendo sincronizados. Aguarde um minuto e atualize a pagina.",
  });
  // O incidente de 06/10 (#397): a segunda chamada pesada na mesma instância entra
  // na fila da Evolution atrás da primeira, e as duas estouram o tempo.
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/group/")).length, 0);
  assert.equal(feitas("POST", "/rest/v1/groups").length, 0);
  // Quem não pegou a trava não a solta: o `del` apagaria a do sync que está rodando.
  assert.deepEqual(comandosDaTrava(), ["set"]);
});

test("Evolution fora: a trava é liberada e a falha fica registrada como recontagem", async () => {
  prepara({ evolution: { status: 500, corpo: { message: "Internal Server Error" } } });

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true });

  assert.deepEqual(r, { ok: false, status: 502, error: "Erro ao sincronizar grupos." });
  assert.deepEqual(comandosDaTrava(), ["set", "del"]);
  const [log] = feitas("POST", "/rest/v1/logs");
  const corpo = log.corpo as Record<string, unknown>;
  assert.equal(corpo.event, "groups.recount_failed");
  assert.equal(corpo.tenant_id, LOJA);
  assert.equal(corpo.level, "error");
});

test("sem número conectado, 409 sem tocar na trava nem na Evolution", async () => {
  prepara({ instancias: [{ ...INSTANCIA, status: "disconnected" }] });

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true });

  assert.deepEqual(r, { ok: false, status: 409, error: "Nenhuma instancia conectada." });
  assert.equal(chamadas.filter((c) => !c.url.pathname.startsWith("/rest/v1/")).length, 0);
});

test("o Sincronizar do painel continua igual: importa o novo, apaga o de terceiro e pede o convite que falta", async () => {
  prepara();
  const depois: Array<() => Promise<void>> = [];

  const r = await sincronizarGrupos(LOJA, {
    somenteContagem: false,
    actorUserId: "usuario-1",
    depois: (tarefa) => {
      depois.push(tarefa);
    },
  });

  // O g2 (truncado, só o "self") não entra no `semBackup`: o 1/1 dele é o
  // artefato do payload, não a falta de admin reserva. Só o g3 conta.
  assert.deepEqual(r, { ok: true, synced: 3, admin: 3, semBackup: 1, ignorados: 1, removidos: 1 });
  const upserts = feitas("POST", "/rest/v1/groups");
  const linhas = upserts.flatMap((u) => u.corpo as Array<Record<string, unknown>>);
  assert.deepEqual(
    linhas
      .map((l) => [l.whatsapp_group_id, l.members, l.is_admin, l.name])
      .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    [
      ["g1@g.us", 980, true, "Moda Kids 1"],
      ["g2@g.us", 500, true, "Moda Kids 2"],
      ["g3@g.us", 40, true, "Grupo novo"],
    ],
  );
  const ADMINS = ["admins_counted_at", "admins_ours", "admins_total"];
  const linha = (jid: string) => linhas.find((l) => l.whatsapp_group_id === jid) ?? {};
  // Mutante: gravar o 1/1 do payload truncado — o g2 viraria "sem admin reserva"
  // (risco do número, e-mail "N grupos dependem só do seu número").
  for (const coluna of ADMINS) assert.equal(coluna in linha("g2@g.us"), false, coluna);
  assert.deepEqual([linha("g1@g.us").admins_total, linha("g1@g.us").admins_ours], [2, 1]);
  assert.deepEqual([linha("g3@g.us").admins_total, linha("g3@g.us").admins_ours], [1, 1]);
  // Mutante: g2 no mesmo upsert dos outros. O PostgREST grava a união das chaves
  // do lote (o `columns` que o postgrest-js monta) e linha sem a chave vira NULL,
  // o que apagaria a última contagem boa em vez de preservá-la.
  for (const u of upserts) {
    const temG2 = (u.corpo as Array<Record<string, unknown>>).some((l) => l.whatsapp_group_id === "g2@g.us");
    const colunas = String(u.url.searchParams.get("columns")).split(",");
    for (const coluna of ADMINS) assert.equal(colunas.includes(`"${coluna}"`), !temG2, `${coluna} em ${colunas}`);
    assert.equal(u.url.searchParams.get("on_conflict"), "tenant_id,whatsapp_group_id");
  }
  const [apagar] = chamadas.filter((c) => c.metodo === "DELETE");
  assert.equal(apagar.url.pathname, "/rest/v1/groups");
  assert.equal(apagar.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.match(String(apagar.url.searchParams.get("whatsapp_group_id")), /^in\.\("?g4@g\.us"?\)$/);
  const [convites] = feitas("POST", "/rest/v1/group_bulk_jobs");
  assert.deepEqual(
    (convites.corpo as Array<Record<string, unknown>>).map((j) => [j.action, j.whatsapp_group_id]),
    [["check_invite", "g3@g.us"]],
  );
  // Participantes e comunidades ficam para depois da resposta, como antes.
  assert.equal(depois.length, 1);
  const [log] = feitas("POST", "/rest/v1/logs");
  const corpo = log.corpo as Record<string, unknown>;
  assert.equal(corpo.event, "groups.synced");
  assert.equal(corpo.actor_user_id, "usuario-1");
  const metadata = corpo.metadata as Record<string, unknown>;
  assert.equal(metadata.sem_backup, 1);
  assert.equal(metadata.protegidos, 1);
  assert.deepEqual(comandosDaTrava(), ["set", "del"]);
});
