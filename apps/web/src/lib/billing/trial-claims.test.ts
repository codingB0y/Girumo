import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { claimCardFingerprint, claimTrial } from "./trial-claims";

/** `data` = a linha que a query casa (null = nenhuma). O fake molda o formato (ver abaixo). */
type Resposta = { data: unknown; error: { message: string; code?: string } | null };
type Filtro = [op: "eq" | "is", coluna: string, valor: unknown];
type Chamada = { tabela: string; update: Record<string, unknown> | null; filtros: Filtro[] };

const VAZIO: Resposta = { data: null, error: null };
const FILTRO_TENANT: Filtro[] = [
  ["eq", "id", "T"],
  ["eq", "tenant_id", "T"],
];

/**
 * Fake do encadeamento que as reservas usam, e so dele. A N-esima chamada a `from()`
 * recebe a N-esima resposta. Registra `.eq()` e `.is()` de cada chamada: o
 * service-role ignora RLS, entao esses filtros SAO o isolamento entre tenants — sem
 * eles o update gravaria o teste em toda organizacao com a coluna nula.
 *
 * O formato de `data` segue o PostgREST, porque o código decide por ele:
 * - `.maybeSingle()` → a linha ou null;
 * - cadeia aguardada direto (o `then`) → array: `[]` quando nada casou, `[linha]` quando casou;
 * - update sem `.select()` → null, porque não pediu a linha de volta.
 * Um fake que devolvesse a linha crua em qualquer caso deixava passar um `claimTrial`
 * sem `.maybeSingle()`: em produção o `[]` é truthy e toda reserva viraria `won`.
 */
function fakeSupabase(respostas: Resposta[]) {
  const chamadas: Chamada[] = [];
  const client = {
    from(tabela: string) {
      const chamada: Chamada = { tabela, update: null, filtros: [] };
      const indice = chamadas.push(chamada) - 1;
      let selecionou = false;
      const resposta = (unica: boolean): Resposta => {
        const { data: linha, error } = respostas[indice] ?? VAZIO;
        if (error) return { data: null, error };
        if (chamada.update && !selecionou) return { data: null, error: null };
        if (unica) return { data: linha ?? null, error: null };
        return { data: linha == null ? [] : [linha], error: null };
      };
      const cadeia = {
        update: (valores: Record<string, unknown>) => {
          chamada.update = valores;
          return cadeia;
        },
        select: () => {
          selecionou = true;
          return cadeia;
        },
        eq: (coluna: string, valor: unknown) => {
          chamada.filtros.push(["eq", coluna, valor]);
          return cadeia;
        },
        is: (coluna: string, valor: unknown) => {
          chamada.filtros.push(["is", coluna, valor]);
          return cadeia;
        },
        maybeSingle: async () => resposta(true),
        then: (ok: (r: Resposta) => unknown, falha?: (e: unknown) => unknown) =>
          Promise.resolve(resposta(false)).then(ok, falha),
      };
      return cadeia;
    },
  } as unknown as SupabaseClient;

  return { client, chamadas };
}

// --- claimTrial ---

test("claimTrial: o update filtra pelo tenant e só casa coluna vazia; a releitura também filtra", async () => {
  const { client, chamadas } = fakeSupabase([VAZIO, { data: { trial_subscription_id: "sub_B" }, error: null }]);
  await claimTrial(client, { tenantId: "T", subscriptionId: "sub_A" });

  assert.equal(chamadas.length, 2);
  assert.deepEqual(chamadas[0], {
    tabela: "organizations",
    update: { trial_subscription_id: "sub_A" },
    filtros: [...FILTRO_TENANT, ["is", "trial_subscription_id", null]],
  });
  assert.deepEqual(chamadas[1], { tabela: "organizations", update: null, filtros: FILTRO_TENANT });
});

test("claimTrial: update casou → won, sem releitura", async () => {
  const { client, chamadas } = fakeSupabase([{ data: { trial_subscription_id: "sub_A" }, error: null }]);
  const r = await claimTrial(client, { tenantId: "T", subscriptionId: "sub_A" });

  assert.deepEqual(r, { outcome: "won", winnerId: "sub_A", error: null });
  assert.equal(chamadas.length, 1);
});

test("claimTrial: nada casou e a dona é esta assinatura → same (retry do mesmo evento)", async () => {
  const { client } = fakeSupabase([VAZIO, { data: { trial_subscription_id: "sub_A" }, error: null }]);
  const r = await claimTrial(client, { tenantId: "T", subscriptionId: "sub_A" });

  assert.deepEqual(r, { outcome: "same", winnerId: "sub_A", error: null });
});

test("claimTrial: nada casou e a dona é outra → lost com o id da vencedora", async () => {
  const { client } = fakeSupabase([VAZIO, { data: { trial_subscription_id: "sub_B" }, error: null }]);
  const r = await claimTrial(client, { tenantId: "T", subscriptionId: "sub_A" });

  assert.deepEqual(r, { outcome: "lost", winnerId: "sub_B", error: null });
});

test("claimTrial: sem linha da organização → erro, para o Stripe reenviar", async () => {
  const { client } = fakeSupabase([VAZIO, VAZIO]);
  const r = await claimTrial(client, { tenantId: "T", subscriptionId: "sub_A" });

  assert.equal(r.winnerId, null);
  assert.match(r.error ?? "", /organizacao T nao encontrada/);
});

test("claimTrial: erro no update → erro, sem releitura", async () => {
  const { client, chamadas } = fakeSupabase([{ data: null, error: { message: "update fora do ar" } }]);
  const r = await claimTrial(client, { tenantId: "T", subscriptionId: "sub_A" });

  assert.deepEqual(r, { outcome: "lost", winnerId: null, error: "update fora do ar" });
  assert.equal(chamadas.length, 1);
});

test("claimTrial: erro na releitura → erro", async () => {
  const { client } = fakeSupabase([VAZIO, { data: null, error: { message: "leitura fora do ar" } }]);
  const r = await claimTrial(client, { tenantId: "T", subscriptionId: "sub_A" });

  assert.deepEqual(r, { outcome: "lost", winnerId: null, error: "leitura fora do ar" });
});

// --- claimCardFingerprint ---

test("claimCardFingerprint: o update filtra pelo tenant e só casa coluna vazia", async () => {
  const { client, chamadas } = fakeSupabase([VAZIO]);
  await claimCardFingerprint(client, { tenantId: "T", fingerprint: "fp_1" });

  assert.deepEqual(chamadas, [
    {
      tabela: "organizations",
      update: { trial_card_fingerprint: "fp_1" },
      filtros: [...FILTRO_TENANT, ["is", "trial_card_fingerprint", null]],
    },
  ]);
});

test("claimCardFingerprint: gravou → ok", async () => {
  const { client } = fakeSupabase([VAZIO]);
  assert.deepEqual(await claimCardFingerprint(client, { tenantId: "T", fingerprint: "fp_1" }), {
    outcome: "ok",
    error: null,
  });
});

test("claimCardFingerprint: zero linhas casadas (retry da mesma conta) → ok, não taken", async () => {
  // Sem `.select()` o PostgREST devolve o mesmo vazio para "gravou" e "nada casou":
  // o código não pode — e não precisa — distinguir. Quem nega é só o índice único.
  const { client } = fakeSupabase([{ data: null, error: null }]);
  assert.deepEqual(await claimCardFingerprint(client, { tenantId: "T", fingerprint: "fp_1" }), {
    outcome: "ok",
    error: null,
  });
});

test("claimCardFingerprint: 23505 → taken, sem erro (é a trava, não falha)", async () => {
  const { client } = fakeSupabase([
    { data: null, error: { message: "duplicate key value violates unique constraint", code: "23505" } },
  ]);
  assert.deepEqual(await claimCardFingerprint(client, { tenantId: "T", fingerprint: "fp_1" }), {
    outcome: "taken",
    error: null,
  });
});

test("claimCardFingerprint: qualquer outro erro → erro", async () => {
  const { client } = fakeSupabase([{ data: null, error: { message: "statement timeout", code: "57014" } }]);
  assert.deepEqual(await claimCardFingerprint(client, { tenantId: "T", fingerprint: "fp_1" }), {
    outcome: "ok",
    error: "statement timeout",
  });
});
