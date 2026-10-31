import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { AppClient } from "./app-client.js";
import { makeBulkDeps } from "./bulk-deps.js";
import type { EvolutionGroups } from "./evolution-groups.js";
import { makeGrowDeps } from "./grow-deps.js";

/**
 * O `instanceFor` REAL do auto-grow e das ações em massa contra um Supabase falso que, como o
 * PostgREST, devolve só as colunas que o `select` pediu. `pickSendInstance` falha fechado em linha
 * sem `purpose`: se alguém tirar `purpose` de um dos dois `select`, o auto-grow ou a ação em massa
 * para em silêncio. Este teste é o que acusa isso. Telefones inventados (repositório público).
 */

// O número do atendimento: conectado e mais antigo, o que o desempate de antes escolheria.
const ATENDIMENTO = {
  id: "inst-p",
  status: "connected",
  provider_instance_id: "gr_p",
  created_at: "2026-07-01T00:00:00Z",
  phone: "5562988880002",
  purpose: "privado",
};
const GRUPOS = {
  id: "inst-g",
  status: "connected",
  provider_instance_id: "gr_g",
  created_at: "2026-08-01T00:00:00Z",
  phone: "556299990001",
  purpose: "grupos",
};
const LINHAS: Array<Record<string, unknown>> = [ATENDIMENTO, GRUPOS];

/** `from("instances").select(cols).eq(...)`: linhas projetadas nas colunas de `cols`. */
const supabaseFalso = {
  from() {
    return {
      select(cols: string) {
        const colunas = cols.split(",").map((c) => c.trim());
        return {
          async eq() {
            const data = LINHAS.map((linha) => Object.fromEntries(colunas.map((c) => [c, linha[c]])));
            return { data, error: null };
          },
        };
      },
    };
  },
} as unknown as SupabaseClient;

const app = {} as AppClient;
const groups = {} as EvolutionGroups;

test("auto-grow: o instanceFor real escolhe o número dos grupos, não o do atendimento mais antigo", async () => {
  const escolhida = await makeGrowDeps(supabaseFalso, app, groups).instanceFor("t");
  assert.equal(escolhida?.name, "gr_g");
  assert.equal(escolhida?.ownerPhone, "556299990001");
});

test("ações em massa: o instanceFor real escolhe o número dos grupos, não o do atendimento mais antigo", async () => {
  assert.equal(await makeBulkDeps(supabaseFalso, app, groups).instanceFor("t"), "gr_g");
});
