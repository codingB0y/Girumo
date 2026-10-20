import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { getSupabaseAdmin } from "@/lib/supabase/server";
import { applyMemberCountDelta } from "./groups";

/**
 * Contra o Supabase de DEV (job e2e do CI). O aviso ao lotar (spec 2026-10-10 D10, §5.6) é a
 * costura de três peças do banco — `apply_group_members_delta` mexe em `members`, o trigger
 * `groups_marca_lotado` grava a marca e `enviar_avisos_lotou` (o worker chama a cada 30 s)
 * posta o aviso — e teste unitário nenhum alcança a costura.
 *
 * Roda numa loja descartável criada aqui e apagada no fim (cascata de `organizations`), nunca
 * nos grupos do tenant de QA: os `*.integration.test.ts` rodam em paralelo e o de ofertas
 * relâmpago pega qualquer grupo do QA. A loja tem assinatura 'active': sem plano a varredura
 * marca sem enviar (C17, 20261020120000) e o teste do admin não teria o que conferir.
 *
 * A loja não tem número conectado: o disparo nasce `failed` "Nenhum número conectado". O teste
 * confere que ele EXISTE, com nome, texto e destino certos — nunca o status.
 *
 * `enviar_avisos_lotou` varre o banco inteiro (e o worker de dev, se estiver no ar, chama a
 * mesma função): o teste confere as linhas da loja dele, nunca o número que a chamada devolve.
 */

// E2E_TENANT_ID só liga o teste (como nos irmãos); os dados vão para a loja descartável.
const LIGADO = Boolean(process.env.E2E_TENANT_ID);
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
// Chaves só deste run: o banco de dev é de todos os PRs ao mesmo tempo.
const RUN = crypto.randomUUID().slice(0, 8);
const HORA_MS = 3_600_000;
const TEXTO = `Grupo lotado! (teste ${RUN})`;
// Limiar de lotado = 95% da capacidade: com 10, é 9,5. Nove membros fica abaixo; +1 cruza.
const CAPACIDADE = 10;

let loja = "";

before(async () => {
  if (!LIGADO || EM_PRODUCAO) return;
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("organizations")
    .insert({ name: `aviso ${RUN}`, slug: `aviso-${RUN}` })
    .select("id")
    .single();
  if (error) throw new Error(`organizations: ${error.message}`);
  loja = data.id as string;

  // plans é catálogo global: qualquer plano serve, quem concede é o status.
  const { data: plano, error: erroPlano } = await supabase.from("plans").select("id").limit(1).single();
  if (erroPlano) throw new Error(`plans: ${erroPlano.message}`);
  const { error: erroAssinatura } = await supabase
    .from("subscriptions")
    .insert({ tenant_id: loja, plan_id: plano!.id, status: "active" });
  if (erroAssinatura) throw new Error(`subscriptions: ${erroAssinatura.message}`);
});

after(async () => {
  // organizations leva assinatura, grupos, campanhas e disparos junto (on delete cascade).
  if (!loja) return;
  const { error } = await getSupabaseAdmin().from("organizations").delete().eq("id", loja);
  if (error) throw new Error(`limpeza incompleta: ${loja}: ${error.message}`);
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

type GrupoDeTeste = {
  jid: string;
  nome: string;
  isAdmin: boolean;
  papel: "announce" | null;
  comunidade: string | null;
};
type LinhaDoGrupo = { lotado_em: string | null; lotado_por: string | null; aviso_lotou_em: string | null };
type Aviso = { name: string; message: string; group_ids: string[] };

function grupoDeTeste(
  chave: string,
  opcoes: { isAdmin?: boolean; papel?: "announce"; comunidade?: string } = {},
): GrupoDeTeste {
  return {
    jid: `avisotest-${RUN}-${chave}@g.us`,
    nome: `Aviso E2E ${RUN} ${chave}`,
    isAdmin: opcoes.isAdmin ?? true,
    papel: opcoes.papel ?? null,
    comunidade: opcoes.comunidade ?? null,
  };
}

/**
 * Campanha e grupos deste cenário na loja descartável. Os grupos nascem com 9 de 10, abaixo do
 * limiar, e com `admins_counted_at`: sem ele `apply_group_members_delta` não soma
 * (20260901190000_apply_group_members_delta.sql). Dois admins: fora de `groups_sem_backup_idx`,
 * que acenderia o alerta de proteção da loja.
 */
async function campanhaCom(
  aviso: { texto: string | null; desde: string | null },
  grupos: GrupoDeTeste[],
): Promise<string> {
  const supabase = getSupabaseAdmin();
  const contadoEm = new Date().toISOString();
  const { error: erroGrupos } = await supabase.from("groups").insert(
    grupos.map((g) => ({
      tenant_id: loja,
      whatsapp_group_id: g.jid,
      name: g.nome,
      members: CAPACIDADE - 1,
      capacity: CAPACIDADE,
      is_admin: g.isAdmin,
      admins_counted_at: contadoEm,
      admins_ours: g.isAdmin ? 1 : 0,
      admins_total: 2,
      community_role: g.papel,
      community_jid: g.comunidade,
    })),
  );
  if (erroGrupos) throw new Error(erroGrupos.message);

  const { data: campanha, error } = await supabase
    .from("campaign_groups")
    .insert({
      tenant_id: loja,
      name: `aviso ${RUN} ${grupos[0]!.nome}`,
      slug: `aviso-${RUN}-${crypto.randomUUID().slice(0, 4)}`,
      group_ids: grupos.map((g) => g.jid),
      aviso_ao_lotar: aviso.texto,
      aviso_ao_lotar_desde: aviso.desde,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return campanha!.id as string;
}

/**
 * Uma varredura como a do worker. Limite alto de propósito: grupos reais do dev lotados na
 * última hora vêm antes na ordem (lotado_em) e não podem tirar a vez destes (o worker usa 20).
 */
async function varrer() {
  const { data, error } = await getSupabaseAdmin().rpc("enviar_avisos_lotou", { p_limit: 1000 });
  if (error) throw new Error(error.message);
  assert.equal(typeof data, "number");
}

async function linhaDoGrupo(jid: string): Promise<LinhaDoGrupo> {
  const { data, error } = await getSupabaseAdmin()
    .from("groups")
    .select("lotado_em, lotado_por, aviso_lotou_em")
    .eq("tenant_id", loja)
    .eq("whatsapp_group_id", jid)
    .single();
  if (error) throw new Error(error.message);
  return data as LinhaDoGrupo;
}

async function avisosDa(campanhaId: string): Promise<Aviso[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("broadcasts")
    .select("name, message, group_ids")
    .eq("tenant_id", loja)
    .eq("campaign_group_id", campanhaId);
  if (error) throw new Error(error.message);
  return (data ?? []) as Aviso[];
}

test("grupo que lota com o aviso ligado recebe um aviso, uma vez só", async () => {
  if (pular()) return;
  const depois = grupoDeTeste("depois");
  // Ligado há uma hora: a ordem contra o now() do banco não depende do relógio desta máquina.
  const campanhaId = await campanhaCom({ texto: TEXTO, desde: new Date(Date.now() - HORA_MS).toISOString() }, [depois]);

  // Um membro entra pelo mesmo caminho do webhook: a RPC de delta, que dispara o trigger.
  await applyMemberCountDelta(loja, depois.jid, 1);
  const marcado = await linhaDoGrupo(depois.jid);
  assert.ok(marcado.lotado_em, "cruzar 95% subindo tem que gravar lotado_em (trigger do PR 1)");
  assert.equal(marcado.lotado_por, "auto");

  await varrer();
  const avisos = await avisosDa(campanhaId);
  assert.equal(avisos.length, 1);
  assert.equal(avisos[0]!.name, `Aviso ao lotar · ${depois.nome}`);
  assert.equal(avisos[0]!.message, TEXTO);
  assert.deepEqual(avisos[0]!.group_ids, [depois.jid]);
  assert.ok((await linhaDoGrupo(depois.jid)).aviso_lotou_em, "aviso_lotou_em marca o grupo como avisado");

  await varrer();
  assert.equal((await avisosDa(campanhaId)).length, 1, "a segunda varredura não repete");
});

test("lotado antes de ligar o aviso nunca recebe; sem admin é marcado sem receber", async () => {
  if (pular()) return;
  const antes = grupoDeTeste("antes");
  const semAdmin = grupoDeTeste("sem-admin", { isAdmin: false });
  const campanhaId = await campanhaCom({ texto: null, desde: null }, [antes, semAdmin]);

  await applyMemberCountDelta(loja, antes.jid, 1);
  const lotouEm = (await linhaDoGrupo(antes.jid)).lotado_em;
  assert.ok(lotouEm, "o grupo tem que ter lotado antes de o aviso ser ligado");

  // Liga o aviso depois da marca, como a tela faz (PATCH grava desde = agora). +1 ms sobre o
  // carimbo do banco: o Date corta os microssegundos, então fica estritamente depois.
  const desde = new Date(Date.parse(lotouEm) + 1).toISOString();
  const { error } = await getSupabaseAdmin()
    .from("campaign_groups")
    .update({ aviso_ao_lotar: TEXTO, aviso_ao_lotar_desde: desde })
    .eq("tenant_id", loja)
    .eq("id", campanhaId);
  if (error) throw new Error(error.message);

  await applyMemberCountDelta(loja, semAdmin.jid, 1);
  const semAdminLotouEm = (await linhaDoGrupo(semAdmin.jid)).lotado_em;
  // Pré-condição: sem isto o grupo sem admin ficaria de fora pela data, e o teste passaria
  // sem provar o filtro de is_admin.
  assert.ok(
    semAdminLotouEm && Date.parse(semAdminLotouEm) >= Date.parse(desde),
    "o sem-admin lotou depois de ligar",
  );

  await varrer();
  assert.equal((await avisosDa(campanhaId)).length, 0);
  assert.equal((await linhaDoGrupo(antes.jid)).aviso_lotou_em, null, "fora da janela do aviso: nem marcado");
  // Contrato §1: sem admin o WhatsApp recusaria — o banco marca sem enviar, para não voltar a
  // cada 30 s.
  assert.notEqual((await linhaDoGrupo(semAdmin.jid)).aviso_lotou_em, null, "sem admin: marcado sem disparo");
});

test("Avisos de comunidade que lota não recebe aviso nem marca; o grupo comum ao lado recebe", async () => {
  if (pular()) return;
  const comunidade = `avisotest-${RUN}-pai@g.us`;
  // O comum vem primeiro só para o nome da campanha; os dois lotam na mesma varredura.
  const comum = grupoDeTeste("comum");
  const avisos = grupoDeTeste("avisos", { papel: "announce", comunidade });
  const campanhaId = await campanhaCom(
    { texto: TEXTO, desde: new Date(Date.now() - HORA_MS).toISOString() },
    [comum, avisos],
  );

  await applyMemberCountDelta(loja, comum.jid, 1);
  await applyMemberCountDelta(loja, avisos.jid, 1);
  // Pré-condição: o trigger não olha community_role, então o Avisos lota — é o caminho perigoso.
  assert.ok((await linhaDoGrupo(avisos.jid)).lotado_em, "o Avisos tem que ter lotado na janela");

  await varrer();
  const disparos = await avisosDa(campanhaId);
  assert.deepEqual(
    disparos.map((d) => d.group_ids),
    [[comum.jid]],
    "o Avisos fala com a comunidade inteira: nunca recebe o aviso",
  );
  assert.equal((await linhaDoGrupo(avisos.jid)).aviso_lotou_em, null, "estrutura nem é marcada");
  assert.notEqual((await linhaDoGrupo(comum.jid)).aviso_lotou_em, null);
});
