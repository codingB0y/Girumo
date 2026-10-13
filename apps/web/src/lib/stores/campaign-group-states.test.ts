import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";

import type { EstadoRow } from "@/lib/groups/estado";
import { listCampaignGroupStates } from "./campaign-group-states";

/**
 * O cliente real do Supabase contra um PostgREST de mentira (o desenho de
 * `leads.test.ts`): prova, sem banco, que a RPC leva a loja e a campanha no corpo
 * — o service-role passa por cima do RLS, e `p_tenant` é o que isola — e que RPC
 * que falha é erro, nunca campanha vazia.
 */

type Pedido = { metodo: string; caminho: string; corpo: unknown };
type Resposta = { status: number; corpo?: unknown };

const pedidos: Pedido[] = [];
let responder: () => Resposta = () => ({ status: 200, corpo: [] });

const postgrest = createServer((req, res) => {
  let bruto = "";
  req.on("data", (parte: Buffer) => (bruto += parte));
  req.on("end", () => {
    pedidos.push({
      metodo: req.method ?? "",
      caminho: new URL(req.url ?? "/", "http://postgrest.falso").pathname,
      corpo: bruto ? JSON.parse(bruto) : undefined,
    });
    const { status, corpo } = responder();
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

const linha = (over: Partial<EstadoRow> & Pick<EstadoRow, "posicao" | "whatsapp_group_id" | "estado">): EstadoRow => ({
  group_id: `id-${over.posicao}`,
  name: `Moda Kids ${over.posicao}`,
  members: 300,
  capacity: 1024,
  is_admin: true,
  invite_url: `https://chat.whatsapp.com/CONVITE${over.posicao}`,
  lotado_em: null,
  lotado_por: null,
  reaberto_em: null,
  aviso_lotou_em: null,
  pode_reabrir: false,
  na_regra_menos_enchendo: false,
  na_regra_lotados: false,
  na_regra_com_gente: false,
  ...over,
});

test("lê os estados pela RPC, com a loja e a campanha no corpo, na ordem do pool", async () => {
  pedidos.length = 0;
  responder = () => ({
    status: 200,
    corpo: [
      linha({ posicao: 1, whatsapp_group_id: "g1@g.us", estado: "lotado", lotado_em: "2026-10-09T12:00:00+00:00", lotado_por: "auto" }),
      linha({ posicao: 2, whatsapp_group_id: "g2@g.us", estado: "enchendo", na_regra_com_gente: true }),
    ],
  });

  const estados = await listCampaignGroupStates("loja-a", "camp-1");

  assert.equal(pedidos.length, 1);
  assert.equal(pedidos[0].metodo, "POST");
  assert.equal(pedidos[0].caminho, "/rest/v1/rpc/campaign_group_states");
  // Mutante: sem `p_tenant` (ou com o tenant errado) a RPC lê a campanha de outra loja.
  assert.deepEqual(pedidos[0].corpo, { p_tenant: "loja-a", p_campaign: "camp-1" });
  assert.deepEqual(
    estados.map((e) => [e.posicao, e.whatsappGroupId, e.estado, e.lotadoPor]),
    [
      [1, "g1@g.us", "lotado", "auto"],
      [2, "g2@g.us", "enchendo", null],
    ],
  );
});

test("RPC que falha é erro, nunca uma campanha vazia", async () => {
  // PR 1 não aplicado no banco: a RPC não existe (PGRST202). Devolver [] aqui faria
  // todo link mestre dizer "campanha não está aberta" em silêncio.
  responder = () => ({
    status: 404,
    corpo: {
      code: "PGRST202",
      message: "Could not find the function public.campaign_group_states(p_campaign, p_tenant) in the schema cache",
      details: null,
      hint: null,
    },
  });
  await assert.rejects(listCampaignGroupStates("loja-a", "camp-1"), /campaign_group_states/);
});
