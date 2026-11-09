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
/** O que `notifications` devolve na busca por aviso recente de comunidade: vazio = nunca avisada. */
let avisosRecentes: unknown[] = [];

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
    // Como o PostgREST: `purpose=eq.X` e `id=eq.X` recortam as linhas quando vêm na consulta.
    "GET /rest/v1/instances": (c) => ({
      status: 200,
      corpo: (instancias as Array<Record<string, unknown>>).filter((linha) =>
        (["purpose", "id"] as const).every((coluna) => {
          const filtro = c.url.searchParams.get(coluna);
          return filtro === null || filtro === `eq.${linha[coluna]}`;
        }),
      ),
    }),
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
    "GET /rest/v1/notifications": () => ({ status: 200, corpo: avisosRecentes }),
    "POST /rest/v1/notifications": () => ({ status: 201 }),
  };
}

function prepara(
  over: { instancias?: unknown[]; evolution?: Resposta; travaOcupada?: boolean; avisosRecentes?: unknown[] } = {},
): void {
  chamadas.length = 0;
  banco = bancoDaLoja(over.instancias);
  evolution = over.evolution ?? { status: 200, corpo: DA_EVOLUTION };
  travaOcupada = over.travaOcupada ?? false;
  avisosRecentes = over.avisosRecentes ?? [];
}

/**
 * Uma comunidade nativa nossa (pai, Avisos e um grupo vinculado) com 1.850 pessoas no Avisos, do
 * jeito que a Evolution 2.3.7 a descreve (ver communities/papel.ts).
 */
const COMUNIDADE_QUASE_CHEIA = [
  { id: "com1@g.us", subject: "Moda Sul Atacado · Comunidade 1", size: 2, isCommunity: true, participants: [NOS, SOCIA] },
  {
    id: "com1-av@g.us",
    subject: "Avisos",
    size: 1850,
    isCommunityAnnounce: true,
    linkedParent: "com1@g.us",
    participants: [NOS, SOCIA],
  },
  { id: "g5@g.us", subject: "Atacado 5", size: 990, linkedParent: "com1@g.us", participants: [NOS, SOCIA] },
];

test("recontagem regrava só membros e admins dos grupos que já estão no banco", async () => {
  prepara();

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true, depois: () => {} });

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

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true, depois: () => {} });

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

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true, depois: () => {} });

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

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true, depois: () => {} });

  assert.deepEqual(r, { ok: false, status: 409, error: "Nenhuma instancia conectada." });
  assert.equal(chamadas.filter((c) => !c.url.pathname.startsWith("/rest/v1/")).length, 0);
});

test("recontagem com comunidade a 1.850 pessoas no Avisos: um aviso no sino, com o nome da comunidade", async () => {
  prepara({ evolution: { status: 200, corpo: [...DA_EVOLUTION, ...COMUNIDADE_QUASE_CHEIA] } });

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true, depois: () => {} });

  assert.equal(r.ok, true);
  const [busca] = feitas("GET", "/rest/v1/notifications");
  // "Uma vez por semana" é por comunidade: a busca filtra a loja, o tipo, a comunidade (no href) e a semana.
  assert.equal(busca.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(busca.url.searchParams.get("type"), "eq.comunidade_quase_cheia");
  assert.equal(busca.url.searchParams.get("href"), "eq./painel/comunidades?comunidade=com1%40g.us");
  const desde = String(busca.url.searchParams.get("created_at"));
  assert.match(desde, /^gte\./);
  const haSeteDias = Date.now() - 7 * 24 * 60 * 60 * 1000;
  assert.ok(Math.abs(Date.parse(desde.slice(4)) - haSeteDias) < 60_000, desde);

  const avisos = feitas("POST", "/rest/v1/notifications");
  assert.equal(avisos.length, 1);
  const corpo = avisos[0].corpo as Record<string, unknown>;
  assert.equal(corpo.tenant_id, LOJA);
  assert.equal(corpo.type, "comunidade_quase_cheia");
  assert.equal(corpo.title, 'Comunidade "Moda Sul Atacado · Comunidade 1" quase cheia');
  assert.match(String(corpo.body), /^1\.850 de 2\.000 pessoas\./);
  assert.equal(corpo.href, "/painel/comunidades?comunidade=com1%40g.us");
  const [log] = feitas("POST", "/rest/v1/logs");
  assert.equal(((log.corpo as Record<string, unknown>).metadata as Record<string, unknown>).comunidades_avisadas, 1);
});

test("comunidade já avisada nesta semana não ganha outro aviso; sem comunidade perto do teto, o sino nem é consultado", async () => {
  prepara({
    evolution: { status: 200, corpo: [...DA_EVOLUTION, ...COMUNIDADE_QUASE_CHEIA] },
    avisosRecentes: [{ id: "aviso-de-ontem" }],
  });
  const r = await sincronizarGrupos(LOJA, { somenteContagem: false, depois: () => {} });
  assert.equal(r.ok, true);
  assert.equal(feitas("GET", "/rest/v1/notifications").length, 1);
  assert.equal(feitas("POST", "/rest/v1/notifications").length, 0);
  const [log] = feitas("POST", "/rest/v1/logs");
  assert.equal(((log.corpo as Record<string, unknown>).metadata as Record<string, unknown>).comunidades_avisadas, 0);

  // A loja sem comunidade perto do teto (os grupos de sempre) não gera leitura nenhuma a mais.
  prepara();
  await sincronizarGrupos(LOJA, { somenteContagem: false, depois: () => {} });
  assert.equal(chamadas.filter((c) => c.url.pathname === "/rest/v1/notifications").length, 0);
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

test("depois do Sincronizar, quem entrou desde o último sync vira lead mesmo sem o aviso da Evolution", async () => {
  const CLIENTE = { id: "77777@lid", phoneNumber: "5562977770001@s.whatsapp.net", admin: null };
  const OUTRA = { id: "66666@lid", phoneNumber: "5562966660001@s.whatsapp.net", admin: null };
  prepara({
    evolution: {
      status: 200,
      corpo: [
        // g1 já tinha o NOS gravado: o CLIENTE é novo; a SOCIA é admin.
        { id: "g1@g.us", subject: "Moda Kids 1", size: 3, participants: [NOS, SOCIA, CLIENTE] },
        // g3 nunca teve participante gravado: primeira leitura, ninguém vira lead.
        { id: "g3@g.us", subject: "Grupo novo", size: 2, participants: [NOS, OUTRA] },
      ],
    },
  });
  banco["GET /rest/v1/group_participants"] = () => ({
    status: 200,
    corpo: [{ whatsapp_group_id: "g1@g.us", participant_lid: NOS.id, phone: NOS.phoneNumber }],
  });
  banco["GET /rest/v1/optouts"] = () => ({ status: 200, corpo: [] });
  banco["POST /rest/v1/group_participants"] = () => ({ status: 201 });
  banco["POST /rest/v1/rpc/upsert_lead"] = () => ({ status: 200, corpo: { id: "lead-1" } });
  const depois: Array<() => Promise<void>> = [];

  await sincronizarGrupos(LOJA, { somenteContagem: false, depois: (t) => void depois.push(t) });
  for (const tarefa of depois) await tarefa();

  const leads = feitas("POST", "/rest/v1/rpc/upsert_lead").map((c) => c.corpo as Record<string, unknown>);
  assert.deepEqual(leads, [
    {
      target_tenant_id: LOJA,
      target_phone: CLIENTE.phoneNumber,
      target_name: null,
      target_source_group_id: "g1@g.us",
      target_source_group_name: "Moda Kids 1",
      target_source_campaign: null,
    },
  ]);
  // Mutante: ler os participantes depois de gravar — todo mundo já estaria "visto".
  const leitura = chamadas.findIndex((c) => c.metodo === "GET" && c.url.pathname === "/rest/v1/group_participants");
  const gravacao = chamadas.findIndex((c) => c.metodo === "POST" && c.url.pathname === "/rest/v1/group_participants");
  assert.ok(leitura >= 0 && leitura < gravacao, `${leitura} < ${gravacao}`);
  assert.equal(
    chamadas[leitura].url.searchParams.get("tenant_id"),
    `eq.${LOJA}`,
  );
});

/**
 * O PostgREST falso dos participantes como o Postgres de verdade se comporta:
 * sem `order`, cada página sai numa ordem diferente, e o `offset` pula e repete
 * linhas. Com `order`, as páginas são estáveis.
 */
function participantesPaginados(linhas: Array<Record<string, string>>): (c: Chamada) => Resposta {
  let chamada = 0;
  return (c) => {
    chamada += 1;
    const offset = Number(c.url.searchParams.get("offset") ?? 0);
    const limit = Number(c.url.searchParams.get("limit") ?? linhas.length);
    const ordenado = c.url.searchParams.has("order");
    const vez = [...linhas].sort((a, b) =>
      ordenado
        ? `${a.whatsapp_group_id}${a.participant_lid}`.localeCompare(`${b.whatsapp_group_id}${b.participant_lid}`)
        : // ordem de "heap" diferente a cada página
          ((a.participant_lid.length + chamada * Number(a.participant_lid.slice(1, 5))) % 7) -
          ((b.participant_lid.length + chamada * Number(b.participant_lid.slice(1, 5))) % 7),
    );
    return { status: 200, corpo: vez.slice(offset, offset + limit) };
  };
}

test("com mais de mil participantes já gravados, o sync só cria lead para quem é novo", async () => {
  const antigos = Array.from({ length: 1500 }, (_, i) => ({
    id: `1${String(i).padStart(4, "0")}@lid`,
    phoneNumber: `55629${String(10000000 + i)}@s.whatsapp.net`,
    admin: null,
  }));
  const NOVA = { id: "99999@lid", phoneNumber: "5562988887777@s.whatsapp.net", admin: null };
  prepara({
    evolution: {
      status: 200,
      corpo: [{ id: "g1@g.us", subject: "Moda Kids 1", size: 1502, participants: [NOS, ...antigos, NOVA] }],
    },
  });
  banco["GET /rest/v1/group_participants"] = participantesPaginados(
    [NOS, ...antigos].map((p) => ({ whatsapp_group_id: "g1@g.us", participant_lid: p.id, phone: p.phoneNumber })),
  );
  banco["GET /rest/v1/optouts"] = () => ({ status: 200, corpo: [] });
  banco["POST /rest/v1/group_participants"] = () => ({ status: 201 });
  banco["POST /rest/v1/rpc/upsert_lead"] = () => ({ status: 200, corpo: { id: "lead-1" } });
  const depois: Array<() => Promise<void>> = [];

  await sincronizarGrupos(LOJA, { somenteContagem: false, depois: (t) => void depois.push(t) });
  for (const tarefa of depois) await tarefa();

  // Mutante: tirar o `.order()` de listarParticipantesDosGrupos — antigos pulados viram lead.
  const leads = feitas("POST", "/rest/v1/rpc/upsert_lead").map((c) => (c.corpo as Record<string, unknown>).target_phone);
  assert.deepEqual(leads, [NOVA.phoneNumber]);
});

test("sync que acha novos demais não cria lead nenhum e deixa aviso", async () => {
  const novos = Array.from({ length: 301 }, (_, i) => ({
    id: `2${String(i).padStart(4, "0")}@lid`,
    phoneNumber: `55629${String(20000000 + i)}@s.whatsapp.net`,
    admin: null,
  }));
  prepara({
    evolution: { status: 200, corpo: [{ id: "g1@g.us", subject: "Moda Kids 1", size: 302, participants: [NOS, ...novos] }] },
  });
  banco["GET /rest/v1/group_participants"] = () => ({
    status: 200,
    corpo: [{ whatsapp_group_id: "g1@g.us", participant_lid: NOS.id, phone: NOS.phoneNumber }],
  });
  banco["GET /rest/v1/optouts"] = () => ({ status: 200, corpo: [] });
  banco["POST /rest/v1/group_participants"] = () => ({ status: 201 });
  banco["POST /rest/v1/rpc/upsert_lead"] = () => ({ status: 200, corpo: { id: "lead-1" } });
  const depois: Array<() => Promise<void>> = [];

  await sincronizarGrupos(LOJA, { somenteContagem: false, depois: (t) => void depois.push(t) });
  for (const tarefa of depois) await tarefa();

  assert.equal(feitas("POST", "/rest/v1/rpc/upsert_lead").length, 0);
  const avisos = feitas("POST", "/rest/v1/logs").filter(
    (c) => (c.corpo as Record<string, unknown>).event === "groups.sync_leads_skipped",
  );
  assert.equal(avisos.length, 1);
  assert.equal((avisos[0].corpo as Record<string, unknown>).tenant_id, LOJA);
  // Os participantes seguem gravados: a trava barra o lead, não o sync.
  assert.equal(feitas("POST", "/rest/v1/group_participants").length, 1);
});

test("a recontagem diária cria o lead de quem entrou sem aviso, só nos grupos que já estão no banco", async () => {
  const CLIENTE = { id: "77777@lid", phoneNumber: "5562977770001@s.whatsapp.net", admin: null };
  prepara({
    evolution: {
      status: 200,
      corpo: [
        { id: "g1@g.us", subject: "Moda Kids 1", size: 3, participants: [NOS, SOCIA, CLIENTE] },
        // g3 não está em CONTAGENS: a recontagem não importa grupo novo, nem os participantes dele.
        { id: "g3@g.us", subject: "Grupo novo", size: 2, participants: [NOS, CLIENTE] },
      ],
    },
  });
  banco["GET /rest/v1/group_participants"] = () => ({
    status: 200,
    corpo: [{ whatsapp_group_id: "g1@g.us", participant_lid: NOS.id, phone: NOS.phoneNumber }],
  });
  banco["GET /rest/v1/optouts"] = () => ({ status: 200, corpo: [] });
  banco["POST /rest/v1/group_participants"] = () => ({ status: 201 });
  banco["POST /rest/v1/rpc/upsert_lead"] = () => ({ status: 200, corpo: { id: "lead-1" } });
  const depois: Array<() => Promise<void>> = [];

  await sincronizarGrupos(LOJA, { somenteContagem: true, depois: (t) => void depois.push(t) });
  for (const tarefa of depois) await tarefa();

  const leads = feitas("POST", "/rest/v1/rpc/upsert_lead").map((c) => c.corpo as Record<string, unknown>);
  assert.deepEqual(
    leads.map((l) => [l.target_phone, l.target_source_group_id]),
    [[CLIENTE.phoneNumber, "g1@g.us"]],
  );
  // Mutante: gravar os participantes de todos os grupos lidos — g3 entraria na base sem o lojista importar.
  const gravados = feitas("POST", "/rest/v1/group_participants").flatMap(
    (c) => c.corpo as Array<Record<string, unknown>>,
  );
  assert.deepEqual([...new Set(gravados.map((r) => r.whatsapp_group_id))], ["g1@g.us"]);
  // Recontagem não espelha comunidade.
  assert.equal(chamadas.some((c) => c.url.pathname.includes("communit")), false);
});

const ATENDIMENTO = {
  ...INSTANCIA,
  id: "inst-p",
  phone: "5511977770000",
  provider_instance_id: "gr_inst-p",
  purpose: "privado",
};

test("o Sincronizar sem número escolhido usa o dos grupos, nunca o do atendimento", async () => {
  prepara({ instancias: [ATENDIMENTO, INSTANCIA] });

  const r = await sincronizarGrupos(LOJA, { somenteContagem: true, depois: () => {} });

  assert.equal(r.ok, true);
  // Mutante: listInstances no lugar de listGroupInstances — o atendimento vem primeiro: o Sincronizar falha (409) ou usa o número errado.
  assert.equal(feitas("GET", "/group/fetchAllGroups/gr_inst-p").length, 0);
  assert.equal(feitas("GET", "/group/fetchAllGroups/gr_inst-1").length, 1);
});

test("pedir o Sincronizar com o id do número do atendimento é 409, sem trava nem Evolution", async () => {
  prepara({ instancias: [ATENDIMENTO, INSTANCIA] });

  const r = await sincronizarGrupos(LOJA, { somenteContagem: false, instanceId: "inst-p" });

  assert.deepEqual(r, { ok: false, status: 409, error: "Esse é o número do atendimento: ele não sincroniza grupos." });
  assert.deepEqual(comandosDaTrava(), []);
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/group/")).length, 0);
});
