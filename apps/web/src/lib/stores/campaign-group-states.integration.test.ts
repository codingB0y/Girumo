import assert from "node:assert/strict";
import { after, before, test } from "node:test";

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
 * Roda em DUAS lojas descartáveis criadas aqui e apagadas no fim (cascata de `organizations`),
 * nunca nos grupos do tenant de QA: os `*.integration.test.ts` rodam em paralelo, e o de
 * ofertas relâmpago pega qualquer grupo do tenant de QA, como as telas dos outros PRs que
 * batem no mesmo dev. A segunda loja é o "outro tenant" das chamadas que têm que dar
 * `nao_encontrado` — uma loja que existe, não um UUID solto.
 *
 * Cada teste monta a própria campanha com cinco grupos de capacidade 100 (limiar 95) e JID
 * sorteado por execução.
 */

// E2E_TENANT_ID só liga o teste (como nos irmãos); os dados vão para as lojas descartáveis.
const LIGADO = Boolean(process.env.E2E_TENANT_ID);
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = crypto.randomUUID().slice(0, 8);

let loja = "";
let outraLoja = "";

async function criarLoja(sufixo: string): Promise<string> {
  const { data, error } = await getSupabaseAdmin()
    .from("organizations")
    .insert({ name: `pg4 ${RUN} ${sufixo}`, slug: `pg4-${RUN}-${sufixo}` })
    .select("id")
    .single();
  if (error) throw new Error(`organizations: ${error.message}`);
  return data.id as string;
}

before(async () => {
  if (!LIGADO || EM_PRODUCAO) return;
  loja = await criarLoja("a");
  outraLoja = await criarLoja("b");
});

after(async () => {
  // organizations leva groups e campaign_groups junto (on delete cascade). Tenta as duas,
  // mesmo que a primeira falhe: parar no primeiro erro deixaria loja vazando no dev.
  const falhas: string[] = [];
  for (const id of [loja, outraLoja].filter(Boolean)) {
    const { error } = await getSupabaseAdmin().from("organizations").delete().eq("id", id);
    if (error) falhas.push(`${id}: ${error.message}`);
  }
  if (falhas.length) throw new Error(`limpeza incompleta:\n${falhas.join("\n")}`);
});

function pular(): boolean {
  if (EM_PRODUCAO) {
    console.log("SUPABASE_URL é de produção — teste de integração pulado");
    return true;
  }
  if (!LIGADO) {
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
        tenant_id: loja,
        whatsapp_group_id: jid[g.chave],
        name: `pg4 ${RUN} ${nome} ${g.chave}`,
        members: g.membros,
        capacity: 100,
        is_admin: g.admin,
        invite_url: `https://chat.whatsapp.com/pg4${RUN}${g.chave}`,
        // Base conferida: sem ela apply_group_members_delta não soma nada.
        admins_counted_at: contadoEm,
        admins_ours: g.admin ? 1 : 0,
        // Dois admins: fora de groups_sem_backup_idx, que dispararia o alerta de proteção da loja.
        admins_total: 2,
      })),
    )
    .select("id, whatsapp_group_id");
  if (error) throw new Error(error.message);
  const idPorJid = new Map((grupos ?? []).map((g) => [g.whatsapp_group_id as string, g.id as string]));
  const id = Object.fromEntries(POOL.map((g) => [g.chave, idPorJid.get(jid[g.chave]) ?? ""])) as Record<Chave, string>;

  const { data: campanha, error: erroCampanha } = await supabase
    .from("campaign_groups")
    .insert({
      tenant_id: loja,
      name: `pg4 ${RUN} ${nome}`,
      slug: `pg4-${RUN}-${nome}`,
      group_ids: POOL.map((g) => jid[g.chave]),
    })
    .select("id")
    .single();
  if (erroCampanha) throw new Error(erroCampanha.message);
  return { campanhaId: campanha!.id as string, jid, id };
}

async function estados(c: Cenario): Promise<Record<Chave, EstadoGrupo>> {
  const lista = await listCampaignGroupStates(loja, c.campanhaId);
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

  const lista = await listCampaignGroupStates(loja, c.campanhaId);
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

  // A campanha não existe para outra loja (que existe de verdade, não um UUID solto).
  assert.equal((await listCampaignGroupStates(outraLoja, c.campanhaId)).length, 0);
});

test("reabrir: travado acima de 95%, liberado abaixo, e o reaberto passa na frente da ordem", async () => {
  if (pular()) return;
  const c = await cenario("reabrir");

  assert.equal(await reabrirGrupo(loja, c.id.cheio), "ainda_cheio");
  let e = await estados(c);
  assert.equal(e.cheio.estado, "lotado", "ainda_cheio não muda nada");
  assert.equal(e.cheio.reabertoEm, null);

  // Saíram 10: a marca não sai sozinha (D1), mas agora dá para reabrir.
  await applyMemberCountDelta(loja, c.jid.cheio, -10);
  e = await estados(c);
  assert.equal(e.cheio.membros, 86);
  assert.equal(e.cheio.estado, "lotado");
  assert.equal(e.cheio.podeReabrir, true);

  assert.equal(await reabrirGrupo(loja, c.id.cheio), "ok");
  e = await estados(c);
  // Posição 3 vence a posição 1: reaberto tem prioridade (D3).
  assert.equal(e.cheio.estado, "enchendo");
  assert.equal(e.enche.estado, "fila");
  assert.notEqual(e.cheio.reabertoEm, null);
  assert.equal(e.cheio.lotadoEm, null);
  assert.equal(e.cheio.lotadoPor, null);

  assert.equal(await reabrirGrupo(loja, c.id.cheio), "nao_lotado");
});

test("a marca automática entra ao cruzar 95% subindo e não sai descendo", async () => {
  if (pular()) return;
  const c = await cenario("cruza");

  await applyMemberCountDelta(loja, c.jid.enche, 44); // 50 → 94
  let e = await estados(c);
  assert.equal(e.enche.estado, "enchendo");

  await applyMemberCountDelta(loja, c.jid.enche, 1); // 94 → 95: cruzou
  e = await estados(c);
  assert.equal(e.enche.estado, "lotado");
  assert.equal(e.enche.lotadoPor, "auto");
  assert.equal(e.fila.estado, "enchendo", "o link passa para o próximo da ordem");

  await applyMemberCountDelta(loja, c.jid.enche, -5); // 95 → 90
  e = await estados(c);
  assert.equal(e.enche.estado, "lotado", "descer não tira a marca (D1)");
  assert.equal(e.enche.podeReabrir, true);

  // Reaberto que volta a lotar perde a prioridade: reaberto_em limpo pelo trigger.
  assert.equal(await reabrirGrupo(loja, c.id.enche), "ok");
  await applyMemberCountDelta(loja, c.jid.enche, 5); // 90 → 95
  e = await estados(c);
  assert.equal(e.enche.estado, "lotado");
  assert.equal(e.enche.reabertoEm, null);
});

test("marcar à mão: ok, depois ja_lotado; outro tenant ou grupo inexistente é nao_encontrado", async () => {
  if (pular()) return;
  const c = await cenario("marcar");

  // Review Focus 1: o tenant está no `where` do SELECT e do UPDATE dos dois RPCs. Cada chamada
  // de outra loja (que existe) mira um alvo em que SÓ o `where` do tenant a segura.
  // marcar: o alvo está aberto, então sem o tenant no UPDATE a chamada marcaria e devolveria "ok".
  assert.equal(await marcarGrupoLotado(outraLoja, c.id.enche), "nao_encontrado");
  // reabrir um lotado ACIMA do limiar: o UPDATE não casa de qualquer jeito (96 não é < 95), então
  // só o tenant do SELECT a segura; sem ele a resposta seria "ainda_cheio".
  assert.equal(await reabrirGrupo(outraLoja, c.id.cheio), "nao_encontrado");
  assert.equal(await marcarGrupoLotado(loja, crypto.randomUUID()), "nao_encontrado");
  let e = await estados(c);
  assert.equal(e.enche.estado, "enchendo", "a chamada de outra loja não marcou nada");
  assert.equal(e.enche.lotadoPor, null);

  assert.equal(await marcarGrupoLotado(loja, c.id.enche), "ok");

  // reabrir um lotado ABAIXO do limiar (50 de 100): é o único alvo em que o UPDATE casaria, então
  // é aqui que o tenant do UPDATE de reabrir_grupo precisa estar — sem ele a loja errada reabre.
  assert.equal(await reabrirGrupo(outraLoja, c.id.enche), "nao_encontrado");
  e = await estados(c);
  assert.equal(e.enche.estado, "lotado", "a chamada de outra loja não reabriu nada");
  assert.equal(e.enche.lotadoPor, "manual");
  assert.equal(e.enche.reabertoEm, null);

  assert.equal(await marcarGrupoLotado(loja, c.id.enche), "ja_lotado");

  e = await estados(c);
  assert.equal(e.enche.estado, "lotado");
  assert.equal(e.enche.lotadoPor, "manual");
  assert.equal(e.enche.podeReabrir, true, "50 de 100: marcado à mão abaixo do limiar reabre");
  assert.equal(e.enche.naRegra.menos_enchendo, true, "lotado entra no atalho padrão");
  assert.equal(e.fila.estado, "enchendo");
});

test("grupo pai e Avisos de comunidade ficam fora do pool: nem estado, nem regra, nem link", async () => {
  if (pular()) return;
  const supabase = getSupabaseAdmin();
  const contadoEm = new Date().toISOString();
  const comunidade = `pg4-${RUN}-estrutura-pai@g.us`;
  // Os dois primeiros estão na frente do pool e disponíveis: se contassem, o Avisos seria o
  // "enchendo" (o link mandaria gente para ele) e o pai entraria nas regras como fila.
  const linhas = [
    { chave: "avisos", membros: 900, papel: "announce" },
    { chave: "pai", membros: 900, papel: "parent" },
    { chave: "comum", membros: 50, papel: null },
  ] as const;
  const jid = (chave: string) => (chave === "pai" ? comunidade : `pg4-${RUN}-estrutura-${chave}@g.us`);

  const { error } = await supabase.from("groups").insert(
    linhas.map((g) => ({
      tenant_id: loja,
      whatsapp_group_id: jid(g.chave),
      name: `pg4 ${RUN} estrutura ${g.chave}`,
      members: g.membros,
      capacity: 1000,
      is_admin: true,
      invite_url: `https://chat.whatsapp.com/pg4${RUN}estrutura${g.chave}`,
      admins_counted_at: contadoEm,
      admins_ours: 1,
      admins_total: 2,
      community_role: g.papel,
      community_jid: g.papel ? comunidade : null,
    })),
  );
  if (error) throw new Error(error.message);
  const { data: campanha, error: erroCampanha } = await supabase
    .from("campaign_groups")
    .insert({
      tenant_id: loja,
      name: `pg4 ${RUN} estrutura`,
      slug: `pg4-${RUN}-estrutura`,
      group_ids: linhas.map((g) => jid(g.chave)),
    })
    .select("id")
    .single();
  if (erroCampanha) throw new Error(erroCampanha.message);

  const lista = await listCampaignGroupStates(loja, campanha!.id as string);

  // O pai não recebe mensagem e o Avisos fala com a comunidade inteira: os dois só por escolha
  // explícita ("Enviar pelo Avisos" ou lista marcada), nunca por regra nem pelo link.
  assert.deepEqual(
    lista.map((g) => g.whatsappGroupId),
    [jid("comum")],
  );
  assert.equal(lista[0].estado, "enchendo", "o link manda para o grupo comum, não para o Avisos");
});
