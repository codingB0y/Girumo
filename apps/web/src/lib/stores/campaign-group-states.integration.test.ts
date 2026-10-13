import assert from "node:assert/strict";
import { after, test } from "node:test";

import type { EstadoGrupo } from "@/lib/groups/estado";
import { getSupabaseAdmin } from "@/lib/supabase/server";
import { listCampaignGroupStates, marcarGrupoLotado, reabrirGrupo } from "./campaign-group-states";
import { applyMemberCountDelta } from "./groups";

/**
 * Contra o Supabase de DEV (job e2e do CI). Estado, "enchendo agora", regras de destino, a
 * marca automática e as ações manuais vivem em SQL (spec §4): nenhum fake alcança. É este
 * teste que reprova quando alguém troca a regra, a ordem ou o `where` no banco
 * (pattern-teste-de-integracao-mata-mutante).
 *
 * Cada teste monta a própria campanha com cinco grupos de capacidade 100 (limiar 95) e JID
 * sorteado por execução: o banco de dev é de todos os PRs ao mesmo tempo.
 */

const TENANT = process.env.E2E_TENANT_ID ?? "";
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = crypto.randomUUID().slice(0, 8);

const campanhaIds: string[] = [];
const grupoIds: string[] = [];

after(async () => {
  if (!TENANT || EM_PRODUCAO) return;
  const supabase = getSupabaseAdmin();
  if (campanhaIds.length) {
    await supabase.from("campaign_groups").delete().eq("tenant_id", TENANT).in("id", campanhaIds);
  }
  if (grupoIds.length) await supabase.from("groups").delete().eq("tenant_id", TENANT).in("id", grupoIds);
});

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

/** Ordem do pool = ordem desta lista. Capacidade 100 em todos: o limiar é 95. */
const POOL = [
  { chave: "enche", membros: 50, admin: true },
  { chave: "fila", membros: 10, admin: true },
  { chave: "cheio", membros: 96, admin: true },
  { chave: "vazio", membros: 1, admin: true },
  { chave: "semadmin", membros: 30, admin: false },
] as const;
type Chave = (typeof POOL)[number]["chave"];
type Cenario = { campanhaId: string; jid: Record<Chave, string>; id: Record<Chave, string> };

async function cenario(nome: string): Promise<Cenario> {
  const supabase = getSupabaseAdmin();
  const contadoEm = new Date().toISOString();
  const jid = Object.fromEntries(
    POOL.map((g) => [g.chave, `pg4-${RUN}-${nome}-${g.chave}@g.us`]),
  ) as Record<Chave, string>;

  const { data: grupos, error } = await supabase
    .from("groups")
    .insert(
      POOL.map((g) => ({
        tenant_id: TENANT,
        whatsapp_group_id: jid[g.chave],
        name: `pg4 ${RUN} ${nome} ${g.chave}`,
        members: g.membros,
        capacity: 100,
        is_admin: g.admin,
        invite_url: `https://chat.whatsapp.com/pg4${RUN}${g.chave}`,
        // Base conferida: sem ela apply_group_members_delta não soma nada.
        admins_counted_at: contadoEm,
        admins_ours: g.admin ? 1 : 0,
        // Dois admins: fora de groups_sem_backup_idx, que alertaria o tenant de QA.
        admins_total: 2,
      })),
    )
    .select("id, whatsapp_group_id");
  if (error) throw new Error(error.message);
  const idPorJid = new Map((grupos ?? []).map((g) => [g.whatsapp_group_id as string, g.id as string]));
  grupoIds.push(...idPorJid.values());
  const id = Object.fromEntries(POOL.map((g) => [g.chave, idPorJid.get(jid[g.chave]) ?? ""])) as Record<Chave, string>;

  const { data: campanha, error: erroCampanha } = await supabase
    .from("campaign_groups")
    .insert({
      tenant_id: TENANT,
      name: `pg4 ${RUN} ${nome}`,
      slug: `pg4-${RUN}-${nome}`,
      group_ids: POOL.map((g) => jid[g.chave]),
    })
    .select("id")
    .single();
  if (erroCampanha) throw new Error(erroCampanha.message);
  campanhaIds.push(campanha!.id as string);
  return { campanhaId: campanha!.id as string, jid, id };
}

async function estados(c: Cenario): Promise<Record<Chave, EstadoGrupo>> {
  const lista = await listCampaignGroupStates(TENANT, c.campanhaId);
  const porChave = {} as Record<Chave, EstadoGrupo>;
  for (const g of POOL) {
    const estado = lista.find((e) => e.groupId === c.id[g.chave]);
    if (!estado) throw new Error(`grupo ${g.chave} sumiu dos estados`);
    porChave[g.chave] = estado;
  }
  return porChave;
}

test("campanha nasce com estados, ordem e regras vindos do SQL", async () => {
  if (pular()) return;
  const c = await cenario("ordem");

  const lista = await listCampaignGroupStates(TENANT, c.campanhaId);
  assert.deepEqual(
    lista.map((g) => g.whatsappGroupId),
    POOL.map((g) => c.jid[g.chave]),
  );
  assert.deepEqual(
    lista.map((g) => g.posicao),
    [1, 2, 3, 4, 5],
  );
  // O primeiro disponível enche; o que já nasceu em 96/100 está lotado; 1 membro é vazio;
  // sem admin não é disponível, mas tem gente: fila.
  assert.deepEqual(
    lista.map((g) => g.estado),
    ["enchendo", "fila", "lotado", "vazio", "fila"],
  );
  // Regras: a única definição é app.grupo_na_regra. Sem admin, nenhuma regra pega.
  assert.deepEqual(
    lista.map((g) => g.naRegra),
    [
      { menos_enchendo: false, lotados: false, com_gente: true },
      { menos_enchendo: true, lotados: false, com_gente: true },
      { menos_enchendo: true, lotados: true, com_gente: true },
      { menos_enchendo: false, lotados: false, com_gente: false },
      { menos_enchendo: false, lotados: false, com_gente: false },
    ],
  );

  const e = await estados(c);
  // Descoberto já cheio: marcado no INSERT e sem aviso (aviso_lotou_em preenchido, spec §5.3).
  assert.equal(e.cheio.lotadoPor, "auto");
  assert.notEqual(e.cheio.lotadoEm, null);
  assert.notEqual(e.cheio.avisoLotouEm, null);
  assert.equal(e.cheio.podeReabrir, false);

  // A campanha não existe para outra loja.
  assert.equal((await listCampaignGroupStates(crypto.randomUUID(), c.campanhaId)).length, 0);
});

test("reabrir: travado acima de 95%, liberado abaixo, e o reaberto passa na frente da ordem", async () => {
  if (pular()) return;
  const c = await cenario("reabrir");

  assert.equal(await reabrirGrupo(TENANT, c.id.cheio), "ainda_cheio");
  let e = await estados(c);
  assert.equal(e.cheio.estado, "lotado", "ainda_cheio não muda nada");
  assert.equal(e.cheio.reabertoEm, null);

  // Saíram 10: a marca não sai sozinha (D1), mas agora dá para reabrir.
  await applyMemberCountDelta(TENANT, c.jid.cheio, -10);
  e = await estados(c);
  assert.equal(e.cheio.membros, 86);
  assert.equal(e.cheio.estado, "lotado");
  assert.equal(e.cheio.podeReabrir, true);

  assert.equal(await reabrirGrupo(TENANT, c.id.cheio), "ok");
  e = await estados(c);
  // Posição 3 vence a posição 1: reaberto tem prioridade (D3).
  assert.equal(e.cheio.estado, "enchendo");
  assert.equal(e.enche.estado, "fila");
  assert.notEqual(e.cheio.reabertoEm, null);
  assert.equal(e.cheio.lotadoEm, null);
  assert.equal(e.cheio.lotadoPor, null);

  assert.equal(await reabrirGrupo(TENANT, c.id.cheio), "nao_lotado");
});

test("a marca automática entra ao cruzar 95% subindo e não sai descendo", async () => {
  if (pular()) return;
  const c = await cenario("cruza");

  await applyMemberCountDelta(TENANT, c.jid.enche, 44); // 50 → 94
  let e = await estados(c);
  assert.equal(e.enche.estado, "enchendo");

  await applyMemberCountDelta(TENANT, c.jid.enche, 1); // 94 → 95: cruzou
  e = await estados(c);
  assert.equal(e.enche.estado, "lotado");
  assert.equal(e.enche.lotadoPor, "auto");
  assert.equal(e.fila.estado, "enchendo", "o link passa para o próximo da ordem");

  await applyMemberCountDelta(TENANT, c.jid.enche, -5); // 95 → 90
  e = await estados(c);
  assert.equal(e.enche.estado, "lotado", "descer não tira a marca (D1)");
  assert.equal(e.enche.podeReabrir, true);

  // Reaberto que volta a lotar perde a prioridade: reaberto_em limpo pelo trigger.
  assert.equal(await reabrirGrupo(TENANT, c.id.enche), "ok");
  await applyMemberCountDelta(TENANT, c.jid.enche, 5); // 90 → 95
  e = await estados(c);
  assert.equal(e.enche.estado, "lotado");
  assert.equal(e.enche.reabertoEm, null);
});

test("marcar à mão: ok, depois ja_lotado; outro tenant ou grupo inexistente é nao_encontrado", async () => {
  if (pular()) return;
  const c = await cenario("marcar");

  // Review Focus 1: o tenant está no `where` dos dois RPCs.
  assert.equal(await marcarGrupoLotado(crypto.randomUUID(), c.id.enche), "nao_encontrado");
  assert.equal(await reabrirGrupo(crypto.randomUUID(), c.id.cheio), "nao_encontrado");
  assert.equal(await marcarGrupoLotado(TENANT, crypto.randomUUID()), "nao_encontrado");

  assert.equal(await marcarGrupoLotado(TENANT, c.id.enche), "ok");
  assert.equal(await marcarGrupoLotado(TENANT, c.id.enche), "ja_lotado");

  const e = await estados(c);
  assert.equal(e.enche.estado, "lotado");
  assert.equal(e.enche.lotadoPor, "manual");
  assert.equal(e.enche.podeReabrir, true, "50 de 100: marcado à mão abaixo do limiar reabre");
  assert.equal(e.enche.naRegra.menos_enchendo, true, "lotado entra no atalho padrão");
  assert.equal(e.fila.estado, "enchendo");
});
