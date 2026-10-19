import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { POST as RotaPost } from "./route";

/**
 * A rota do Padronizar contra um Supabase de mentira (desenho de
 * `app/api/orders/route.test.ts`): sessão, membership, campanha, estados,
 * conflitos, reordenação, fila e molde saem como em produção; só a rede é
 * trocada. O que se prova aqui é a ORDEM das escritas e o que NÃO acontece
 * quando a lista mudou.
 */

let POST: typeof RotaPost;

const CAMPANHA_ID = "3c2b1a09-8f7e-4d6c-9b5a-4f3e2d1c0b9a";

type Chamada = { metodo: string; url: URL; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const chamadas: Chamada[] = [];
let responder: (chamada: Chamada) => Resposta = () => ({ status: 500 });

const supabase = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    const chamada: Chamada = {
      metodo: req.method ?? "",
      url: new URL(req.url ?? "/", "http://supabase.falso"),
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
  await new Promise<void>((pronto) => supabase.listen(0, "127.0.0.1", pronto));
  const { port } = supabase.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
  process.env.SUPABASE_ANON_KEY = "chave-anon-falsa";
  ({ POST } = await import("./route"));
});

after(() => {
  supabase.close();
});

const ESPERADO = ["g1@g.us", "g2@g.us", "g3@g.us", "g4@g.us", "g5@g.us", "orfao@g.us"];
const ORDEM = ["g2@g.us", "g1@g.us", "g3@g.us", "g4@g.us", "g5@g.us"];

const CAMPANHA = {
  id: CAMPANHA_ID,
  tenant_id: "loja-b",
  name: "Moda Kids do Sul",
  slug: "moda-kids",
  group_ids: ESPERADO,
  auto_grow: true,
  grow_template: { subjectPattern: "Ofertas {n}", desc: "Bazar", mediaId: "m1" },
  metadata: {},
  whatsapp_community_jid: null as string | null,
  created_at: "2026-09-01T00:00:00+00:00",
  updated_at: "2026-09-01T00:00:00+00:00",
};

/** Linha `EstadoRow` (contrato §1), com o que cada teste precisa mudar. */
function linha(over: Record<string, unknown>): Record<string, unknown> {
  return {
    posicao: 1,
    group_id: "grp-x",
    whatsapp_group_id: "gx@g.us",
    name: "Grupo",
    members: 10,
    capacity: 1024,
    is_admin: true,
    invite_url: "https://chat.whatsapp.com/AAA111",
    lotado_em: null,
    lotado_por: null,
    reaberto_em: null,
    aviso_lotou_em: null,
    estado: "fila",
    pode_reabrir: false,
    na_regra_menos_enchendo: true,
    na_regra_lotados: false,
    na_regra_com_gente: true,
    ...over,
  };
}

const ESTADOS = [
  linha({ posicao: 1, group_id: "grp-1", whatsapp_group_id: "g1@g.us", name: "Moda Kids do Sul 1", members: 1000, estado: "lotado", lotado_em: "2026-10-01T00:00:00+00:00", lotado_por: "auto" }),
  linha({ posicao: 2, group_id: "grp-2", whatsapp_group_id: "g2@g.us", name: "Kids Sul #3", members: 990, estado: "lotado", lotado_em: "2026-10-02T00:00:00+00:00", lotado_por: "auto" }),
  linha({ posicao: 3, group_id: "grp-3", whatsapp_group_id: "g3@g.us", name: "Moda Kids do Sul 3", members: 958, estado: "enchendo" }),
  linha({ posicao: 4, group_id: "grp-4", whatsapp_group_id: "g4@g.us", name: "Grupo antigo", members: 412, is_admin: false }),
  linha({ posicao: 5, group_id: "grp-5", whatsapp_group_id: "g5@g.us", name: "Grupo 19", members: 1, estado: "vazio" }),
];

/** g2 também está no "Saldão Outubro": entra na ordem, não é renomeado. */
const CONFLITOS = [
  {
    whatsapp_group_id: "g2@g.us",
    name: "Kids Sul #3",
    campanhas: [
      { id: CAMPANHA_ID, name: "Moda Kids do Sul", slug: "moda-kids", posicao: 2 },
      { id: "outra", name: "Saldão Outubro", slug: "saldao", posicao: 1 },
    ],
  },
];

type Tabelas = Record<string, (chamada: Chamada) => Resposta>;

/** Dono logado por Bearer na `loja-b`; o resto responde por "MÉTODO /caminho". */
function banco(over: Tabelas = {}): (chamada: Chamada) => Resposta {
  const tabelas: Tabelas = {
    "GET /rest/v1/campaign_groups": () => ({ status: 200, corpo: [CAMPANHA] }),
    "GET /rest/v1/group_grow_jobs": () => ({ status: 200, corpo: [] }),
    "POST /rest/v1/rpc/campaign_group_states": () => ({ status: 200, corpo: ESTADOS }),
    "POST /rest/v1/rpc/grupos_em_mais_de_uma_campanha": () => ({ status: 200, corpo: CONFLITOS }),
    "POST /rest/v1/rpc/reordenar_campanha": () => ({ status: 200, corpo: true }),
    "POST /rest/v1/group_bulk_jobs": (c) => ({
      status: 201,
      corpo: (c.corpo as unknown[]).map((_, i) => ({ id: `job-${i}` })),
    }),
    "PATCH /rest/v1/campaign_groups": () => ({ status: 200, corpo: [CAMPANHA] }),
    ...over,
  };
  return (chamada) => {
    const { metodo, url } = chamada;
    if (url.pathname === "/auth/v1/user") return { status: 200, corpo: { id: "usuario-1", email: "dono@loja.test" } };
    if (url.pathname === "/rest/v1/memberships") return { status: 200, corpo: [{ tenant_id: "loja-b", role: "owner", modules: [] }] };
    const tabela = tabelas[`${metodo} ${url.pathname}`];
    return tabela ? tabela(chamada) : { status: 500, corpo: { message: `inesperado: ${metodo} ${url.pathname}` } };
  };
}

function padronizar(corpo: unknown): Promise<Response> {
  return POST(
    new Request("http://girumo.test/api/campanhas/moda-kids/grupos/padronizar", {
      method: "POST",
      headers: { authorization: "Bearer token-falso", "x-tenant-id": "loja-b", "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
    { params: Promise.resolve({ slug: "moda-kids" }) },
  );
}

function feitas(metodo: string, caminho: string): Chamada[] {
  return chamadas.filter((c) => c.metodo === metodo && c.url.pathname === caminho);
}

const escritas = () => [
  ...feitas("POST", "/rest/v1/rpc/reordenar_campanha"),
  ...feitas("POST", "/rest/v1/group_bulk_jobs"),
  ...feitas("PATCH", "/rest/v1/campaign_groups"),
];

test("salva a ordem, enfileira um renome por grupo que muda num lote só e grava o molde", async () => {
  chamadas.length = 0;
  responder = banco();

  const res = await padronizar({ base: "  Moda Kids do Sul ", ordem: ORDEM, esperado: ESPERADO });

  assert.equal(res.status, 201);
  const resposta = (await res.json()) as { batchId: string; renomes: number };
  assert.equal(resposta.renomes, 2);

  // A campanha é a da loja da sessão.
  const [campanha] = feitas("GET", "/rest/v1/campaign_groups");
  assert.equal(campanha?.url.searchParams.get("tenant_id"), "eq.loja-b");
  assert.equal(campanha?.url.searchParams.get("slug"), "eq.moda-kids");

  // A ordem gravada é a da tela com o órfão (sem linha em groups) no fim.
  const [reordena] = feitas("POST", "/rest/v1/rpc/reordenar_campanha");
  assert.deepEqual(reordena?.corpo, {
    p_tenant: "loja-b",
    p_campanha: CAMPANHA_ID,
    p_esperado: ESPERADO,
    p_nova: [...ORDEM, "orfao@g.us"],
  });

  // g1 (posição 2) e g5 (posição 5) mudam; g2 em conflito, g3 já certo e g4 sem
  // admin ficam de fora.
  const [fila] = feitas("POST", "/rest/v1/group_bulk_jobs");
  const jobs = fila?.corpo as Array<Record<string, unknown>>;
  assert.deepEqual(
    jobs.map((j) => [j.group_id, j.whatsapp_group_id, j.subject]),
    [
      ["grp-1", "g1@g.us", "Moda Kids do Sul 2"],
      ["grp-5", "g5@g.us", "Moda Kids do Sul 5"],
    ],
  );
  for (const job of jobs) {
    assert.equal(job.action, "set_subject");
    assert.equal(job.tenant_id, "loja-b");
    assert.equal(job.campaign_group_id, CAMPANHA_ID);
    assert.equal(job.batch_id, resposta.batchId);
  }

  // Molde mesclado, com a data do Padronizar.
  const [molde] = feitas("PATCH", "/rest/v1/campaign_groups");
  assert.equal(molde?.url.searchParams.get("tenant_id"), "eq.loja-b");
  const template = (molde?.corpo as { grow_template: Record<string, unknown> }).grow_template;
  assert.equal(template.subjectPattern, "Moda Kids do Sul {n}");
  assert.equal(template.desc, "Bazar");
  assert.equal(template.mediaId, "m1");
  assert.equal(Number.isNaN(Date.parse(String(template.padronizadoEm))), false);

  // Reordenar ANTES de enfileirar: renome sem ordem salva numeraria grupos que
  // o link não segue.
  assert.ok(chamadas.indexOf(reordena!) < chamadas.indexOf(fila!));
});

test("lista mudou no meio (reordenar devolve false): 409 e nada enfileirado nem gravado", async () => {
  chamadas.length = 0;
  responder = banco({ "POST /rest/v1/rpc/reordenar_campanha": () => ({ status: 200, corpo: false }) });

  const res = await padronizar({ base: "Moda Kids do Sul", ordem: ORDEM, esperado: ESPERADO });

  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: "A lista de grupos mudou. Recarregue a página." });
  assert.equal(feitas("POST", "/rest/v1/group_bulk_jobs").length, 0);
  assert.equal(feitas("PATCH", "/rest/v1/campaign_groups").length, 0);
});

test("grupo novo nascendo agora: 409 sem reordenar — ele nasceria com o nome antigo", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/group_grow_jobs": () => ({ status: 200, corpo: [{ campaign_group_id: CAMPANHA_ID }] }),
  });

  const res = await padronizar({ base: "Moda Kids do Sul", ordem: ORDEM, esperado: ESPERADO });

  assert.equal(res.status, 409);
  assert.match(((await res.json()) as { error: string }).error, /grupo novo/);
  assert.equal(escritas().length, 0);
  const [voo] = feitas("GET", "/rest/v1/group_grow_jobs");
  assert.equal(voo?.url.searchParams.get("tenant_id"), "eq.loja-b");
});

test("base inválida responde 400 sem tocar estado, conflito nem fila", async () => {
  chamadas.length = 0;
  responder = banco();

  const res = await padronizar({ base: "   ", ordem: ORDEM, esperado: ESPERADO });

  assert.equal(res.status, 400);
  assert.deepEqual(await res.json(), { error: "Escreva o nome base." });
  assert.equal(chamadas.filter((c) => c.url.pathname.startsWith("/rest/v1/rpc/")).length, 0);
  assert.equal(escritas().length, 0);
});

test("ordem com grupo de fora da campanha responde 400", async () => {
  chamadas.length = 0;
  responder = banco();

  const res = await padronizar({ base: "Moda Kids do Sul", ordem: [...ORDEM, "intruso@g.us"], esperado: ESPERADO });

  assert.equal(res.status, 400);
  assert.equal(escritas().length, 0);
});

test("comunidade nativa do WhatsApp responde 409 — a ordem dela vem do sync", async () => {
  chamadas.length = 0;
  responder = banco({
    "GET /rest/v1/campaign_groups": () => ({
      status: 200,
      corpo: [{ ...CAMPANHA, whatsapp_community_jid: "120363999999999999@g.us" }],
    }),
  });

  const res = await padronizar({ base: "Moda Kids do Sul", ordem: ORDEM, esperado: ESPERADO });

  assert.equal(res.status, 409);
  assert.equal(escritas().length, 0);
});
