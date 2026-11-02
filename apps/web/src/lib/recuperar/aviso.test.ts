import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { AVISO_DE_PRIVACIDADE, avisoConfirmadoEm, registrarAviso } from "./aviso";

type Opcoes = {
  erroDoInsert?: string;
  linha?: { created_at: string } | null;
  erroDaLeitura?: string;
};

/**
 * Fake do encadeamento que `aviso.ts` usa, e so dele: `from("logs")` com
 * `insert(...)` e com `select().eq().eq().order().limit().maybeSingle()`. Registra cada
 * filtro: o service-role ignora RLS, entao `.eq("tenant_id")` SAO o isolamento entre lojas.
 */
function fakeLogs(opcoes: Opcoes = {}) {
  const tabelas: string[] = [];
  const inserts: Record<string, unknown>[] = [];
  const filtros: [op: "eq", coluna: string, valor: unknown][] = [];
  let ordem: { coluna: string; crescente: boolean; limite: number | null } | null = null;

  const leitura = {
    select: () => leitura,
    eq: (coluna: string, valor: unknown) => {
      filtros.push(["eq", coluna, valor]);
      return leitura;
    },
    order: (coluna: string, o: { ascending: boolean }) => {
      ordem = { coluna, crescente: o.ascending, limite: null };
      return leitura;
    },
    limit: (n: number) => {
      if (ordem) ordem.limite = n;
      return leitura;
    },
    maybeSingle: async () =>
      opcoes.erroDaLeitura
        ? { data: null, error: { message: opcoes.erroDaLeitura } }
        : { data: opcoes.linha ?? null, error: null },
  };

  const client = {
    from(tabela: string) {
      tabelas.push(tabela);
      return {
        insert: async (linha: Record<string, unknown>) => {
          inserts.push(linha);
          return { error: opcoes.erroDoInsert ? { message: opcoes.erroDoInsert } : null };
        },
        select: leitura.select,
      };
    },
  } as unknown as SupabaseClient;

  return {
    client,
    tabelas,
    inserts,
    filtros,
    get ordem() {
      return ordem;
    },
  };
}

test("registrarAviso grava em logs, com a loja, quem confirmou e o texto que ele viu", async () => {
  const f = fakeLogs();
  assert.deepEqual(await registrarAviso(f.client, { tenantId: "T", userId: "U", origem: "checkout" }), { error: null });
  assert.deepEqual(f.tabelas, ["logs"]);
  assert.deepEqual(f.inserts, [
    {
      tenant_id: "T",
      actor_user_id: "U",
      level: "info",
      event: "recuperar.aviso.confirmado",
      message: "Lojista confirmou o aviso de privacidade do Recuperar.",
      metadata: { versao: "2026-10-29", texto: AVISO_DE_PRIVACIDADE.texto, origem: "checkout" },
    },
  ]);
});

test("registrarAviso devolve o erro do banco (quem chama bloqueia a cobrança)", async () => {
  const f = fakeLogs({ erroDoInsert: "banco fora" });
  assert.deepEqual(await registrarAviso(f.client, { tenantId: "T", userId: "U", origem: "admin" }), { error: "banco fora" });
});

test("avisoConfirmadoEm lê a confirmação mais recente, só da loja e só do evento", async () => {
  const f = fakeLogs({ linha: { created_at: "2026-10-29T14:03:00.000Z" } });
  assert.deepEqual(await avisoConfirmadoEm(f.client, "T"), { em: "2026-10-29T14:03:00.000Z", error: null });
  assert.deepEqual(f.tabelas, ["logs"]);
  assert.deepEqual(f.filtros, [
    ["eq", "tenant_id", "T"],
    ["eq", "event", "recuperar.aviso.confirmado"],
  ]);
  assert.deepEqual(f.ordem, { coluna: "created_at", crescente: false, limite: 1 });
  assert.deepEqual(await avisoConfirmadoEm(fakeLogs({ linha: null }).client, "T"), { em: null, error: null });
});

test("avisoConfirmadoEm devolve o erro do banco sem inventar uma confirmação", async () => {
  const f = fakeLogs({ erroDaLeitura: "banco fora" });
  assert.deepEqual(await avisoConfirmadoEm(f.client, "T"), { em: null, error: "banco fora" });
});
