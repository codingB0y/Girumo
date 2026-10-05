import { strict as assert } from "node:assert";
import { test } from "node:test";
import { renomearSlugCampanha, validarSlug, type RenomearDeps } from "./rename-slug";

type Link = { tenant_id: string; campaign_group_id: string | null; slug: string; metadata: Record<string, unknown> };

/** Stores em memória com o único invariante que importa aqui: slug de link é único global. */
function fakeDeps(opts: { links: Link[]; failCreateAlias?: boolean }) {
  const campaign = { id: "c1", tenant_id: "t1", name: "Varejo", slug: "moda-sul-varejo" };
  const links = opts.links;
  const deps = {
    getCampaign: async (t: string, id: string) => (t === campaign.tenant_id && id === campaign.id ? { ...campaign } : null),
    updateCampaign: async (_t: string, _id: string, patch: { slug?: string }) => {
      if (patch.slug) campaign.slug = patch.slug;
      return { ...campaign };
    },
    getLinkBySlug: async (slug: string) => links.find((l) => l.slug === slug) ?? null,
    renameLink: async (t: string, cid: string, from: string, to: string) => {
      const l = links.find((x) => x.tenant_id === t && x.campaign_group_id === cid && x.slug === from);
      if (!l) return false;
      if (links.some((x) => x.slug === to)) throw new Error("duplicate key value violates unique constraint");
      l.slug = to;
      return true;
    },
    createLink: async (t: string, input: { slug: string; campaign_group_id?: string; metadata?: Record<string, unknown> }) => {
      if (opts.failCreateAlias && input.metadata?.alias) throw new Error("boom");
      if (links.some((x) => x.slug === input.slug)) throw new Error("duplicate key value violates unique constraint");
      links.push({ tenant_id: t, campaign_group_id: input.campaign_group_id ?? null, slug: input.slug, metadata: input.metadata ?? {} });
    },
    deleteLinkBySlug: async (t: string, slug: string) => {
      const i = links.findIndex((x) => x.tenant_id === t && x.slug === slug);
      if (i < 0) return false;
      links.splice(i, 1);
      return true;
    },
  };
  return { campaign, links, deps: deps as unknown as RenomearDeps };
}

const master = (): Link => ({ tenant_id: "t1", campaign_group_id: "c1", slug: "moda-sul-varejo", metadata: { master: true } });

test("validarSlug aceita minúsculas, números e hífen; recusa o resto", () => {
  assert.deepEqual(validarSlug(" GruposVarejo "), { ok: true, slug: "gruposvarejo" });
  assert.equal(validarSlug("grupos-varejo-2").ok, true);
  for (const ruim of ["ab", "grupos varejo", "promoção", "-grupos", "grupos-", "a--b", "api", "x".repeat(61)]) {
    assert.equal(validarSlug(ruim).ok, false, ruim);
  }
});

test("troca o slug e o antigo vira apelido da mesma campanha", async () => {
  const f = fakeDeps({ links: [master()] });
  const r = await renomearSlugCampanha("t1", "c1", "gruposvarejo", f.deps);
  assert.deepEqual(r, { ok: true, slug: "gruposvarejo" });
  assert.equal(f.campaign.slug, "gruposvarejo");
  const porSlug = new Map(f.links.map((l) => [l.slug, l]));
  assert.equal(porSlug.get("gruposvarejo")?.metadata.master, true);
  assert.equal(porSlug.get("moda-sul-varejo")?.campaign_group_id, "c1");
  assert.equal(porSlug.get("moda-sul-varejo")?.metadata.alias, true);
});

test("slug de outra conta é 409 e nada muda", async () => {
  const f = fakeDeps({ links: [master(), { tenant_id: "t2", campaign_group_id: "x", slug: "gruposvarejo", metadata: { alias: true } }] });
  const r = await renomearSlugCampanha("t1", "c1", "gruposvarejo", f.deps);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.status, 409);
  assert.equal(f.campaign.slug, "moda-sul-varejo");
});

test("voltar pro slug antigo reaproveita o próprio apelido", async () => {
  const f = fakeDeps({ links: [master()] });
  await renomearSlugCampanha("t1", "c1", "gruposvarejo", f.deps);
  const r = await renomearSlugCampanha("t1", "c1", "moda-sul-varejo", f.deps);
  assert.deepEqual(r, { ok: true, slug: "moda-sul-varejo" });
  const porSlug = new Map(f.links.map((l) => [l.slug, l]));
  assert.equal(porSlug.get("moda-sul-varejo")?.metadata.master, true);
  assert.equal(porSlug.get("gruposvarejo")?.metadata.alias, true);
  assert.equal(f.links.length, 2);
});

test("falha ao criar o apelido desfaz tudo — link e campanha voltam pro slug antigo", async () => {
  const f = fakeDeps({ links: [master()], failCreateAlias: true });
  await assert.rejects(renomearSlugCampanha("t1", "c1", "gruposvarejo", f.deps), /boom/);
  assert.equal(f.campaign.slug, "moda-sul-varejo");
  assert.deepEqual(f.links.map((l) => l.slug), ["moda-sul-varejo"]);
});

test("campanha sem link mestre ganha um no slug novo", async () => {
  const f = fakeDeps({ links: [] });
  const r = await renomearSlugCampanha("t1", "c1", "gruposvarejo", f.deps);
  assert.equal(r.ok, true);
  assert.deepEqual(f.links.map((l) => [l.slug, l.metadata.master]), [["gruposvarejo", true]]);
});
