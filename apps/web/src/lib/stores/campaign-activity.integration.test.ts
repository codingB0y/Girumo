import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { campaignActivity } from "./campaign-activity";

/**
 * Contra o Supabase de DEV. A Início conta os cliques da loja inteira com
 * `p_campaign` nulo; teste com PostgREST falso não alcança o SQL da função.
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);
// Em 2020: longe do "hoje" que as telas do tenant de E2E mostram.
const DIA = { de: new Date("2020-02-10T03:00:00Z"), ate: new Date("2020-02-11T03:00:00Z"), fatia: "day" as const };
const QUANDO = "2020-02-10T15:00:00Z";

const campanhas: string[] = [];
let linkId = "";

function pular(): boolean {
  if (EM_PRODUCAO) {
    console.log("SUPABASE_URL é de produção — teste de integração pulado");
    return true;
  }
  if (!TENANT) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

before(async () => {
  if (pular()) return;
  const supabase = getSupabaseAdmin();
  for (const sufixo of ["a", "b"]) {
    const { data, error } = await supabase
      .from("campaign_groups")
      .insert({ tenant_id: TENANT, name: `cliques-${RUN}-${sufixo}`, slug: `cliques-${RUN}-${sufixo}` })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    campanhas.push(data!.id as string);
  }
  const { data: link, error: el } = await supabase
    .from("tracked_links")
    .insert({ tenant_id: TENANT, slug: `cliques-${RUN}`, target_url: "https://example.com" })
    .select("id")
    .single();
  if (el) throw new Error(el.message);
  linkId = link!.id as string;
  // Um clique em cada campanha e um de link comum (sem campanha).
  const { error: ec } = await supabase.from("link_click_events").insert([
    { tenant_id: TENANT, tracked_link_id: linkId, campaign_group_id: campanhas[0], occurred_at: QUANDO },
    { tenant_id: TENANT, tracked_link_id: linkId, campaign_group_id: campanhas[1], occurred_at: QUANDO },
    { tenant_id: TENANT, tracked_link_id: linkId, campaign_group_id: null, occurred_at: QUANDO },
  ]);
  if (ec) throw new Error(ec.message);
});

after(async () => {
  if (pular()) return;
  const supabase = getSupabaseAdmin();
  // Os cliques caem junto com o link (on delete cascade).
  if (linkId) await supabase.from("tracked_links").delete().eq("tenant_id", TENANT).eq("id", linkId);
  if (campanhas.length) await supabase.from("campaign_groups").delete().eq("tenant_id", TENANT).in("id", campanhas);
});

test("com a campanha, conta só os cliques dela", async () => {
  if (pular()) return;
  const serie = await campaignActivity(TENANT, { id: campanhas[0], groupIds: [] }, DIA);
  assert.equal(serie.reduce((s, p) => s + p.cliques, 0), 1);
});

test("sem campanha (a loja inteira), conta os cliques de todas as campanhas e do link comum", async () => {
  if (pular()) return;
  const serie = await campaignActivity(TENANT, { id: null, groupIds: [] }, DIA);
  // >= e não ==: outro run em paralelo pode ter cliques do QA no mesmo dia de 2020.
  assert.ok(serie.reduce((s, p) => s + p.cliques, 0) >= 3);
});
