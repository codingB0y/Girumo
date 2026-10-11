import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { ackGrow, evaluateAutoGrow } from "./group-grow-store";

/**
 * O auto-grow no modo Supabase contra um PostgREST de mentira (o desenho de
 * `stores/leads.test.ts`): prova, sem banco, o que o PR 2 do "postar por grupo"
 * muda — o grupo criado nasce com a contagem conferida, e a marca de lotado
 * chega do banco até o `hasHeadroom`.
 */

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let tabelas: Record<string, (c: Chamada) => Resposta> = {};

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://postgrest.falso"),
      corpo: bruto ? JSON.parse(bruto) : undefined,
    };
    chamadas.push(chamada);
    const tabela = tabelas[`${chamada.metodo} ${chamada.url.pathname}`];
    const { status, corpo } = tabela
      ? tabela(chamada)
      : { status: 500, corpo: { message: `inesperado: ${chamada.metodo} ${chamada.url.pathname}` } };
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

const feitas = (metodo: string, caminho: string) =>
  chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);

const JOB = {
  id: "job-1",
  tenant_id: "loja-a",
  campaign_group_id: "camp-1",
  campaign_slug: "moda-kids",
  seq: 21,
  subject: "Moda Kids 21",
  description: null,
  media_id: null,
  announce: true,
  member_add_mode: "admin_add",
  status: "created",
  attempts: 1,
  whatsapp_group_id: "g21@g.us",
  invite_url: "https://chat.whatsapp.com/NOVO21",
  error: null,
  created_at: "2026-10-10T12:00:00+00:00",
  running_since: null,
  last_ack_at: null,
  updated_at: "2026-10-10T12:01:00+00:00",
};

const ACK_CRIADO = {
  id: "job-1",
  status: "created" as const,
  whatsappGroupId: "g21@g.us",
  members: 1,
  inviteLink: "https://chat.whatsapp.com/NOVO21",
};

function ackComGrupos(gruposNoBanco: unknown[]): Record<string, (c: Chamada) => Resposta> {
  return {
    "PATCH /rest/v1/group_grow_jobs": () => ({ status: 200, corpo: JOB }),
    "GET /rest/v1/groups": () => ({ status: 200, corpo: gruposNoBanco }),
    "POST /rest/v1/groups": (c) => ({ status: 201, corpo: c.corpo }),
    "PATCH /rest/v1/groups": (c) => ({ status: 200, corpo: c.corpo }),
    "POST /rest/v1/rpc/campaign_group_append_group_id": () => ({ status: 204 }),
  };
}

test("grupo criado pelo auto-grow nasce contado: um admin, o nosso, conferido agora", async () => {
  chamadas.length = 0;
  tabelas = ackComGrupos([]);
  const antes = Date.now();

  await ackGrow("loja-a", ACK_CRIADO);

  const [insert] = feitas("POST", "/rest/v1/groups");
  const [linha] = insert.corpo as Array<Record<string, unknown>>;
  assert.equal(linha.tenant_id, "loja-a");
  assert.equal(linha.whatsapp_group_id, "g21@g.us");
  assert.equal(linha.is_admin, true);
  // Mutante: sem o carimbo, `apply_group_members_delta` ignora o grupo e ele nunca lota sozinho.
  assert.ok(Date.parse(String(linha.admins_counted_at)) >= antes - 1000);
  // Mutante: carimbo com 0/0 — um admin promovido depois somaria 1 e o grupo seguiria "sem reserva".
  assert.equal(linha.admins_total, 1);
  assert.equal(linha.admins_ours, 1);
});

test("ack reentregue: o grupo que já existe também ganha o carimbo, filtrado pela loja", async () => {
  chamadas.length = 0;
  tabelas = ackComGrupos([
    { id: "row-21", tenant_id: "loja-a", whatsapp_group_id: "g21@g.us", name: "Moda Kids 21", members: 1, capacity: 1024 },
  ]);

  await ackGrow("loja-a", ACK_CRIADO);

  assert.equal(feitas("POST", "/rest/v1/groups").length, 0);
  const [update] = feitas("PATCH", "/rest/v1/groups");
  assert.equal(update.url.searchParams.get("tenant_id"), "eq.loja-a");
  assert.equal(update.url.searchParams.get("id"), "eq.row-21");
  const corpo = update.corpo as Record<string, unknown>;
  assert.equal(corpo.admins_total, 1);
  assert.equal(corpo.admins_ours, 1);
  assert.equal(typeof corpo.admins_counted_at, "string");
});

const CAMPANHA = {
  id: "camp-1",
  tenant_id: "loja-a",
  name: "Moda Kids",
  slug: "moda-kids",
  group_ids: ["g1@g.us"],
  auto_grow: true,
  grow_template: { subjectPattern: "Moda Kids {n}" },
  metadata: {},
  whatsapp_community_jid: null,
  created_at: "2026-10-01T00:00:00+00:00",
  updated_at: "2026-10-01T00:00:00+00:00",
};

const GRUPO_ABERTO = {
  id: "row-1",
  tenant_id: "loja-a",
  whatsapp_group_id: "g1@g.us",
  name: "Moda Kids 1",
  members: 500,
  capacity: 1024,
  invite_url: "https://chat.whatsapp.com/AAA",
  is_admin: true,
  lotado_em: null,
};

function avaliacaoCom(grupo: Record<string, unknown>): Record<string, (c: Chamada) => Resposta> {
  return {
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [CAMPANHA] }),
    "GET /rest/v1/groups": () => ({ status: 200, corpo: [grupo] }),
    // Nenhum job em voo e nenhum seq anterior: o próximo é max(0, 1) + 1 = 2.
    "GET /rest/v1/group_grow_jobs": () => ({ status: 200, corpo: [] }),
    "POST /rest/v1/group_grow_jobs": (c) => ({
      status: 201,
      corpo: { ...JOB, ...(c.corpo as Record<string, unknown>), status: "queued" },
    }),
  };
}

test("pool cujo único grupo aberto foi marcado lotado (500 de 1024) enfileira o próximo", async () => {
  chamadas.length = 0;
  tabelas = avaliacaoCom({ ...GRUPO_ABERTO, lotado_em: "2026-10-09T12:00:00+00:00" });

  await evaluateAutoGrow("loja-a");

  const enfileirados = feitas("POST", "/rest/v1/group_grow_jobs");
  // Mutante: não levar `lotado_em` do banco até o `hasHeadroom` — 500 de 1024 parece folga.
  assert.equal(enfileirados.length, 1);
  assert.equal((enfileirados[0].corpo as Record<string, unknown>).subject, "Moda Kids 2");
});

test("o mesmo grupo sem a marca ainda é folga: nada enfileirado", async () => {
  chamadas.length = 0;
  tabelas = avaliacaoCom(GRUPO_ABERTO);

  await evaluateAutoGrow("loja-a");

  assert.equal(feitas("POST", "/rest/v1/group_grow_jobs").length, 0);
});
