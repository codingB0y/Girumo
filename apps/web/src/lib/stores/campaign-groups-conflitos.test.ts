import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import { lerConflitoGrupo } from "@/lib/campaigns/conflito-grupo";
import {
  appendGroupId,
  createCampaignGroup,
  listarConflitos,
  removeGroupId,
  reordenarCampanha,
} from "./campaign-groups";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (desenho de
 * `campaign-activity.test.ts`): prova, sem banco, que as RPCs do PR 6 levam a loja no corpo e
 * que a mensagem do trigger chega inteira até a rota — é ela que vira o 409.
 */

type Pedido = { metodo: string; caminho: string; corpo: unknown };

const pedidos: Pedido[] = [];
let resposta: { status: number; corpo: unknown } = { status: 200, corpo: [] };

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => {
    bruto += parte.toString("utf8");
  });
  req.on("end", () => {
    pedidos.push({
      metodo: req.method ?? "",
      caminho: new URL(req.url ?? "/", "http://postgrest.falso").pathname,
      corpo: bruto ? JSON.parse(bruto) : null,
    });
    res.statusCode = resposta.status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(resposta.corpo));
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

function responder(status: number, corpo: unknown) {
  pedidos.length = 0;
  resposta = { status, corpo };
}

const A1 = "6a7e0000-0000-4000-8000-0000000000a1";
// 409 é o que o PostgREST devolve para unique_violation (23505). Não usar 503/520: o
// postgrest-js repete com espera.
const RECUSA = {
  code: "23505",
  details: null,
  hint: null,
  message: `grupo_em_outra_campanha:120363001@g.us:${A1}`,
};

test("listarConflitos chama a RPC com a loja e devolve o formato do contrato", async () => {
  responder(200, [
    {
      whatsapp_group_id: "g3@g.us",
      name: "Grupo VIP",
      campanhas: [
        { id: "a2", name: "Check A2", slug: "check-a2", posicao: 2 },
        { id: "a4", name: "Check A4", slug: "check-a4", posicao: "3" },
      ],
    },
    {
      whatsapp_group_id: "g8@g.us",
      name: null,
      campanhas: [
        { id: "a2", name: "Check A2", slug: "check-a2", posicao: 1 },
        { id: "a4", name: "Check A4", slug: "check-a4", posicao: 1 },
      ],
    },
  ]);

  assert.deepEqual(await listarConflitos("loja-a"), [
    {
      whatsappGroupId: "g3@g.us",
      nome: "Grupo VIP",
      campanhas: [
        { id: "a2", name: "Check A2", slug: "check-a2", posicao: 2 },
        { id: "a4", name: "Check A4", slug: "check-a4", posicao: 3 },
      ],
    },
    {
      whatsappGroupId: "g8@g.us",
      nome: "g8@g.us",
      campanhas: [
        { id: "a2", name: "Check A2", slug: "check-a2", posicao: 1 },
        { id: "a4", name: "Check A4", slug: "check-a4", posicao: 1 },
      ],
    },
  ]);
  assert.equal(pedidos[0].metodo, "POST");
  assert.equal(pedidos[0].caminho, "/rest/v1/rpc/grupos_em_mais_de_uma_campanha");
  // Mutante: sem p_tenant a RPC nem existe com essa assinatura; com outro tenant, lista outra loja.
  assert.deepEqual(pedidos[0].corpo, { p_tenant: "loja-a" });
});

test("reordenarCampanha manda os quatro parâmetros e só é true quando a RPC diz true", async () => {
  responder(200, true);
  assert.equal(await reordenarCampanha("loja-a", A1, ["g1", "g2"], ["g2", "g1"]), true);
  assert.equal(pedidos[0].caminho, "/rest/v1/rpc/reordenar_campanha");
  assert.deepEqual(pedidos[0].corpo, {
    p_tenant: "loja-a",
    p_campanha: A1,
    p_esperado: ["g1", "g2"],
    p_nova: ["g2", "g1"],
  });

  responder(200, false);
  assert.equal(await reordenarCampanha("loja-a", A1, ["g1"], ["g1"]), false);
});

test("removeGroupId tira o grupo pela RPC atômica, com a loja", async () => {
  responder(200, {});
  await removeGroupId("loja-a", A1, "g9@g.us");
  assert.equal(pedidos[0].caminho, "/rest/v1/rpc/campaign_group_remove_group_id");
  assert.deepEqual(pedidos[0].corpo, { p_tenant_id: "loja-a", p_id: A1, p_whatsapp_group_id: "g9@g.us" });
});

test("a recusa do trigger chega inteira na rota, no insert e no append", async () => {
  responder(409, RECUSA);
  const noInsert = await createCampaignGroup("loja-a", {
    name: "Nova",
    slug: "nova",
    group_ids: ["120363001@g.us"],
  }).then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(noInsert instanceof Error);
  assert.deepEqual(lerConflitoGrupo(noInsert.message), { jid: "120363001@g.us", campanhaId: A1 });
  assert.equal(pedidos[0].caminho, "/rest/v1/campaign_groups");
  const linha = Array.isArray(pedidos[0].corpo) ? pedidos[0].corpo[0] : pedidos[0].corpo;
  assert.equal((linha as { tenant_id?: string }).tenant_id, "loja-a");

  responder(409, RECUSA);
  const noAppend = await appendGroupId("loja-a", A1, "120363001@g.us").then(
    () => null,
    (e: unknown) => e,
  );
  assert.ok(noAppend instanceof Error);
  assert.deepEqual(lerConflitoGrupo(noAppend.message), { jid: "120363001@g.us", campanhaId: A1 });
});

test("erro da RPC de conflitos sobe — a rota responde 500, nunca uma lista vazia", async () => {
  responder(404, {
    code: "PGRST202",
    details: null,
    hint: null,
    message: "Could not find the function public.grupos_em_mais_de_uma_campanha(p_tenant) in the schema cache",
  });
  await assert.rejects(listarConflitos("loja-a"), /grupos_em_mais_de_uma_campanha/);
});
