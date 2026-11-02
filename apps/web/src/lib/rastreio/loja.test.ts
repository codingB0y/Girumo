import assert from "node:assert/strict";
import { test } from "node:test";
import { documentoPadrao } from "@/lib/bio/documento";
import { lojaDoRastreio, type DepsLoja } from "@/lib/rastreio/loja";
import { MATRIZ_PADRAO, type RastreioConfig } from "@/lib/rastreio/tipos";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import type { CustomDomain } from "@/lib/stores/custom-domains";

const CONFIG: RastreioConfig = {
  tenantId: "loja-a", publicSlug: "loja-teste", matrix: MATRIZ_PADRAO, notifyStoreOnProblem: true,
  vipLinkId: "link-vip", storeWhatsapp: "5511900000000", importedAt: null, sweepCursor: null,
};

function bio(): PaginaBio {
  const documento = { ...documentoPadrao({ nome: "Loja da Bio", campanhaId: null }), paleta: "marca", cores: { fundo: "#111111", botao: "#C0FFEE" } };
  return { documento } as PaginaBio;
}
const dominio = (status: CustomDomain["status"]) => ({ hostname: "loja.exemplo.com.br", status }) as CustomDomain;

function fakes(o: { config?: RastreioConfig | null; dominio?: CustomDomain | null; bio?: PaginaBio | null; storeName?: string }) {
  const chamadas: string[] = [];
  const deps: DepsLoja = {
    lerConfig: async () => { chamadas.push("config"); return o.config === undefined ? CONFIG : o.config; },
    dominio: async () => { chamadas.push("dominio"); return o.dominio ?? null; },
    perfil: async () => { chamadas.push("perfil"); return { storeName: o.storeName ?? "", niche: null }; },
    bio: async () => { chamadas.push("bio"); return o.bio ?? null; },
  };
  return { deps, chamadas };
}

test("junta nome e cor da bio, domínio ativo e a config", async () => {
  const { deps } = fakes({ dominio: dominio("active"), bio: bio(), storeName: "Outro Nome" });
  assert.deepEqual(await lojaDoRastreio("loja-a", deps), {
    tenantId: "loja-a", nome: "Loja da Bio", publicSlug: "loja-teste", dominio: "loja.exemplo.com.br",
    corPrimaria: "#C0FFEE", storeWhatsapp: "5511900000000", vipLinkId: "link-vip",
  });
});

test("sem bio: nome legível da organização, domínio pendente não vale", async () => {
  const { deps } = fakes({ dominio: dominio("pending"), storeName: "maria.loja@exemplo.com" });
  const loja = await lojaDoRastreio("loja-a", deps);
  assert.equal(loja?.nome, "Maria loja");
  assert.equal(loja?.dominio, null);
  assert.equal(loja?.corPrimaria, null);
});

test("nome vazio usa o slug", async () => {
  const { deps } = fakes({ storeName: "  " });
  assert.equal((await lojaDoRastreio("loja-a", deps))?.nome, "loja-teste");
});

test("Rastreio nunca ligado: null, sem tocar nos outros três", async () => {
  const { deps, chamadas } = fakes({ config: null });
  assert.equal(await lojaDoRastreio("loja-a", deps), null);
  assert.deepEqual(chamadas, ["config"]);
});
