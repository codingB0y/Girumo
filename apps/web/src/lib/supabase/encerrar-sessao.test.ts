import assert from "node:assert/strict";
import test from "node:test";

import { encerrarSessaoDoAparelho, type Aparelho } from "./encerrar-sessao";

function aparelho(sobrescrever: Partial<Aparelho> = {}) {
  const dados = new Map<string, string>([
    ["hubflow_active_tenant_id", "loja-1"],
    ["sb-abcd-auth-token", JSON.stringify({ access_token: "jwt-do-dono" })],
    ["sb-abcd-auth-token-code-verifier", "v"],
    ["tema", "claro"],
  ]);
  const eventos: string[] = [];
  const armazem = {
    get length() {
      return dados.size;
    },
    key: (i: number) => [...dados.keys()][i] ?? null,
    getItem: (k: string) => dados.get(k) ?? null,
    removeItem: (k: string) => void dados.delete(k),
  };
  const base: Aparelho = {
    esquecerLoja: () => {
      eventos.push("loja");
      dados.delete("hubflow_active_tenant_id");
    },
    auth: () => ({
      stopAutoRefresh: async () => void eventos.push("refresh"),
      admin: { signOut: async (jwt, escopo) => void eventos.push(`revoga:${jwt}:${escopo}`) },
    }),
    armazenamento: () => armazem,
    logout: async () => {
      eventos.push(`logout:${[...dados.keys()].join(",")}`);
      return { ok: true };
    },
    limiteMs: 50,
  };
  return { aparelho: { ...base, ...sobrescrever }, dados, eventos };
}

test("limpa tudo localmente antes do logout e devolve true quando o servidor confirma", async () => {
  const { aparelho: a, dados, eventos } = aparelho();
  assert.equal(await encerrarSessaoDoAparelho(a), true);
  assert.deepEqual([...dados.keys()], ["tema"]);
  // o logout já encontra o aparelho limpo: só sobrou o que não é sessão
  assert.deepEqual(eventos, ["loja", "refresh", "revoga:jwt-do-dono:global", "logout:tema"]);
});

test("logout recusado devolve false, mas a sessão local já foi embora", async () => {
  const { aparelho: a, dados } = aparelho({ logout: async () => ({ ok: false }) });
  assert.equal(await encerrarSessaoDoAparelho(a), false);
  assert.deepEqual([...dados.keys()], ["tema"]);
});

test("logout que não responde vira false no teto", async () => {
  const { aparelho: a } = aparelho({ logout: () => new Promise(() => {}), limiteMs: 10 });
  assert.equal(await encerrarSessaoDoAparelho(a), false);
});

test("sem rede: logout rejeitado e revogação rejeitada não estouram", async () => {
  const { aparelho: a, dados } = aparelho({
    auth: () => ({
      stopAutoRefresh: async () => undefined,
      admin: { signOut: () => Promise.reject(new Error("offline")) },
    }),
    logout: () => Promise.reject(new TypeError("Failed to fetch")),
  });
  assert.equal(await encerrarSessaoDoAparelho(a), false);
  assert.deepEqual([...dados.keys()], ["tema"]);
});

test("espera a revogação terminar antes de responder (a navegação não pode abortá-la)", async () => {
  let revogou = false;
  const { aparelho: a } = aparelho({
    auth: () => ({
      stopAutoRefresh: async () => undefined,
      admin: { signOut: () => new Promise((r) => setTimeout(() => r((revogou = true)), 20)) },
    }),
    limiteMs: 200,
  });
  assert.equal(await encerrarSessaoDoAparelho(a), true);
  assert.equal(revogou, true);
});

test("sessão regravada por um refresh em voo durante o logout também some", async () => {
  const { aparelho: a, dados } = aparelho({
    logout: async () => {
      dados.set("sb-abcd-auth-token", JSON.stringify({ access_token: "renovado" }));
      return { ok: true };
    },
  });
  assert.equal(await encerrarSessaoDoAparelho(a), true);
  assert.deepEqual([...dados.keys()], ["tema"]);
});

test("cliente supabase indisponível não impede a limpeza nem o logout", async () => {
  const { aparelho: a, dados, eventos } = aparelho({
    auth: () => {
      throw new Error("Variavel publica obrigatoria ausente");
    },
  });
  assert.equal(await encerrarSessaoDoAparelho(a), true);
  assert.deepEqual([...dados.keys()], ["tema"]);
  assert.ok(!eventos.some((e) => e.startsWith("revoga")));
});
