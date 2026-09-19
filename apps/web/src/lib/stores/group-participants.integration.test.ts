import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { listarParticipantesDosGrupos } from "./group-participants";

/**
 * Contra o Supabase de DEV. O defeito que este teste mata (achado em produção
 * em 17/09: `listarParticipantesDosGrupos` sem `.range()`) é o PostgREST
 * truncando em 1000 linhas SEM erro — um teste unitário com array em memória
 * nunca passaria de 1000 itens sem alguém escrever isso de propósito, e é
 * fácil não perceber que o teto existe até um grupo grande de verdade estourar.
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
const GRUPO_A = "pagtest-a@g.us";
const GRUPO_B = "pagtest-b@g.us";
const TOTAL_A = 1200;
const TOTAL_B = 500;

function pular(): boolean {
  if (!TENANT) {
    console.log("E2E_TENANT_ID ausente — teste de integração pulado");
    return true;
  }
  return false;
}

function linhas(whatsappGroupId: string, quantidade: number, offset: number) {
  return Array.from({ length: quantidade }, (_, i) => ({
    tenant_id: TENANT,
    whatsapp_group_id: whatsappGroupId,
    participant_lid: `pagtest-${offset + i}@lid`,
    phone: null,
    is_admin: false,
  }));
}

before(async () => {
  if (!TENANT) return;
  const supabase = getSupabaseAdmin();

  // Acima do teto de 1000 do PostgREST, espalhado em dois grupos — é a forma
  // real do bug: nenhum dos dois grupos sozinho precisa passar de 1000 para o
  // TOTAL da campanha passar, e foi assim que 1981 + 567 sumiu em produção.
  await supabase.from("group_participants").insert(linhas(GRUPO_A, TOTAL_A, 0));
  await supabase.from("group_participants").insert(linhas(GRUPO_B, TOTAL_B, TOTAL_A));
});

after(async () => {
  if (!TENANT) return;
  await getSupabaseAdmin()
    .from("group_participants")
    .delete()
    .eq("tenant_id", TENANT)
    .in("whatsapp_group_id", [GRUPO_A, GRUPO_B]);
});

test("mais de 1000 linhas entre dois grupos vêm todas, não só a primeira página", async (t) => {
  if (pular()) return t.skip();

  const rows = await listarParticipantesDosGrupos(TENANT, [GRUPO_A, GRUPO_B]);

  assert.equal(rows.length, TOTAL_A + TOTAL_B);
  assert.equal(rows.filter((r) => r.whatsappGroupId === GRUPO_A).length, TOTAL_A);
  assert.equal(rows.filter((r) => r.whatsappGroupId === GRUPO_B).length, TOTAL_B);
});

test("grupo sozinho acima de 1000 também pagina até o fim", async (t) => {
  if (pular()) return t.skip();

  const rows = await listarParticipantesDosGrupos(TENANT, [GRUPO_A]);

  assert.equal(rows.length, TOTAL_A);
});
