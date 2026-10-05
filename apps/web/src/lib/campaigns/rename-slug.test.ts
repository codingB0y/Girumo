import { strict as assert } from "node:assert";
import { test } from "node:test";
import { renomearSlugCampanha, validarSlug, type RenomearDeps } from "./rename-slug";

type Link = { id: string; tenant_id: string; campaign_group_id: string | null; slug: string; metadata: Record<string, unknown> };
type Falha = "createLink" | "updateCampaign" | "setLinkMetadata";

/**
 * Stores em memória com o invariante que importa aqui: slug de link é único
 * global. `falhar` faz um passo estourar; `livres` registra todo slug que
 * chegou a ficar sem dono no meio do caminho.
 */
function fakeDeps(opts: { links: Link[]; falhar?: Falha }) {
  const campaign = { id: "c1", tenant_id: "t1", name: "Varejo", slug: "moda-sul-varejo" };
  const links = opts.links;
  let seq = links.length;
  const livres: string[] = [];
  const boom = (passo: Falha) => {
    if (opts.falhar === passo) throw new Error("boom");
  };
  const deps = {
    getCampaign: async (t: string, id: string) => (t === campaign.tenant_id && id === campaign.id ? { ...campaign } : null),
    updateCampaign: async (_t: string, _id: string, patch: { slug?: string }) => {
      boom("updateCampaign");
      if (patch.slug) campaign.slug = patch.slug;
      return { ...campaign };
    },
    getLinkBySlug: async (slug: string) => links.find((l) => l.slug === slug) ?? null,
    createLink: async (t: string, input: { slug: string; campaign_group_id?: string; metadata?: Record<string, unknown> }) => {
      boom("createLink");
      if (links.some((x) => x.slug === input.slug)) throw new Error("duplicate key value violates unique constraint");
      links.push({ id: `l${++seq}`, tenant_id: t, campaign_group_id: input.campaign_group_id ?? null, slug: input.slug, metadata: input.metadata ?? {} });
    },
    setLinkMetadata: async (t: string, id: string, metadata: Record<string, unknown>) => {
      boom("setLinkMetadata");
      const l = links.find((x) => x.tenant_id === t && x.id === id);
      if (l) l.metadata = metadata;
    },
    deleteLinkBySlug: async (t: string, slug: string) => {
      const i = links.findIndex((x) => x.tenant_id === t && x.slug === slug);
      if (i < 0) return false;
      livres.push(slug);
      links.splice(i, 1);
      return true;
    },
  };
  return { campaign, links, livres, deps: deps as unknown as RenomearDeps };
}

const master = (): Link => ({ id: "l0", tenant_id: "t1", campaign_group_id: "c1", slug: "moda-sul-varejo", metadata: { master: true } });
const papel = (links: Link[], slug: string) => {
  const m = links.find((l) => l.slug === slug)?.metadata;
  return m?.master ? "master" : m?.alias ? "alias" : undefined;
};

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
  assert.equal(papel(f.links, "gruposvarejo"), "master");
  assert.equal(papel(f.links, "moda-sul-varejo"), "alias");
  assert.ok(f.links.every((l) => l.campaign_group_id === "c1"));
  assert.deepEqual(f.livres, []);
});

test("slug de outra conta é 409 e nada muda", async () => {
  const f = fakeDeps({ links: [master(), { id: "x1", tenant_id: "t2", campaign_group_id: "x", slug: "gruposvarejo", metadata: { alias: true } }] });
  const r = await renomearSlugCampanha("t1", "c1", "gruposvarejo", f.deps);
  assert.equal(!r.ok && r.status, 409);
  assert.equal(f.campaign.slug, "moda-sul-varejo");
  assert.equal(f.links.length, 2);
});

test("voltar pro slug antigo só troca os papéis — nenhum slug fica livre", async () => {
  const f = fakeDeps({ links: [master()] });
  await renomearSlugCampanha("t1", "c1", "gruposvarejo", f.deps);
  const r = await renomearSlugCampanha("t1", "c1", "moda-sul-varejo", f.deps);
  assert.deepEqual(r, { ok: true, slug: "moda-sul-varejo" });
  assert.equal(papel(f.links, "moda-sul-varejo"), "master");
  assert.equal(papel(f.links, "gruposvarejo"), "alias");
  assert.equal(f.links.length, 2);
  assert.deepEqual(f.livres, []);
});

test("falha ao gravar a campanha apaga só o link novo; o antigo nunca sai do ar", async () => {
  const f = fakeDeps({ links: [master()], falhar: "updateCampaign" });
  await assert.rejects(renomearSlugCampanha("t1", "c1", "gruposvarejo", f.deps), /boom/);
  assert.equal(f.campaign.slug, "moda-sul-varejo");
  assert.deepEqual(f.links.map((l) => [l.slug, papel(f.links, l.slug)]), [["moda-sul-varejo", "master"]]);
  assert.deepEqual(f.livres, ["gruposvarejo"]);
});

test("falha ao criar o link novo não mexe em nada", async () => {
  const f = fakeDeps({ links: [master()], falhar: "createLink" });
  await assert.rejects(renomearSlugCampanha("t1", "c1", "gruposvarejo", f.deps), /boom/);
  assert.equal(f.campaign.slug, "moda-sul-varejo");
  assert.equal(f.links.length, 1);
});

test("falha ao marcar o apelido não quebra a troca: os dois slugs seguem abrindo a campanha", async () => {
  const f = fakeDeps({ links: [master()], falhar: "setLinkMetadata" });
  const r = await renomearSlugCampanha("t1", "c1", "gruposvarejo", f.deps);
  assert.equal(r.ok, true);
  assert.equal(f.campaign.slug, "gruposvarejo");
  assert.deepEqual(f.links.map((l) => l.slug).sort(), ["gruposvarejo", "moda-sul-varejo"]);
  assert.ok(f.links.every((l) => l.campaign_group_id === "c1"));
});

test("campanha sem link mestre ganha um no slug novo", async () => {
  const f = fakeDeps({ links: [] });
  const r = await renomearSlugCampanha("t1", "c1", "gruposvarejo", f.deps);
  assert.equal(r.ok, true);
  assert.deepEqual(f.links.map((l) => [l.slug, papel(f.links, l.slug)]), [["gruposvarejo", "master"]]);
});
