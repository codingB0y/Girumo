import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getSupabaseAdmin, getSupabaseAnonForToken } from "@/lib/supabase/server";

/**
 * Banco do Recuperar (migração 20261030140000_recuperar_banco, PR 1b) contra o Supabase de DEV, no job
 * e2e, em duas lojas descartáveis criadas aqui e apagadas no fim (a cascata de organizations leva casos,
 * scripts, depoimentos, ajustes, instância, conversa e mensagens) e três pessoas com login de verdade: a
 * dona, uma vendedora sem módulo e uma vendedora com o módulo `recuperar`. A loja de QA não é tocada;
 * E2E_TENANT_ID é só a chave de ligar. O catálogo (RLS, ACL, gatilhos, bucket) é do
 * infra/tests/recuperar-banco-check.sql, que também roda em prod. Aqui: o que o store do PR 7 vai pisar
 * pelo PostgREST (o `code` e a constraint de cada recusa), o que um JWT lê (as quatro tabelas da própria
 * loja, nunca pela vendedora) e o que ele NÃO consegue (escrever, ler com a anon key, chamar a limpeza),
 * a limpeza dos casos vencidos com mensagens ligadas e o bucket privado dos depoimentos.
 */

const LIGADO = Boolean(process.env.E2E_TENANT_ID);
// Estas linhas criam usuário e loja: apontado para produção, o teste não roda.
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);
const DIA = 86_400_000;
const BUCKET = "recuperar-depoimentos";
const STATUS_DA_SPEC = [
  "agendado", "em_sequencia", "respondeu", "recuperado", "virou_pedido",
  "parado", "perdido", "sem_whatsapp", "nao_quer", "controle",
] as const;
const TABELAS = ["recovery_settings", "recovery_cases", "recovery_scripts", "recovery_testimonials"] as const;

type Tabela = (typeof TABELAS)[number];
type Linha = Record<string, unknown>;
type Erro = { code?: string; message: string } | null;
type Pessoa = { id: string; token: string };

const db = () => getSupabaseAdmin();
const usuarios: string[] = []; // ids de auth criados; apagados no after()
const objetos: string[] = []; // caminhos no bucket; apagados no after()
let loja = "";
let vizinha = "";
let conversaDaLoja = ""; // criada na primeira mensagemDoCaso
let dona: Pessoa = { id: "", token: "" };
let vendedora: Pessoa = { id: "", token: "" };
let vendedoraComModulo: Pessoa = { id: "", token: "" };

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

/** Insert pelo service-role; devolve o erro cru para os testes lerem code e message. */
async function inserir(tabela: string, linha: Linha): Promise<{ data: Linha | null; error: Erro }> {
  const { data, error } = await db().from(tabela).insert(linha).select().single();
  return {
    data: (data as Linha | null) ?? null,
    error: error ? { code: error.code, message: error.message } : null,
  };
}

/** O store do PR 7 lê o code e o nome da constraint na mensagem: os dois têm de bater. */
function recusado(erro: Erro, code: string, trecho: string): void {
  assert.equal(erro?.code, code, `esperava ${code} em ${trecho}, veio ${JSON.stringify(erro)}`);
  assert.match(erro?.message ?? "", new RegExp(trecho), `a mensagem não cita ${trecho}`);
}

/** Linhas de `tenant` que o PostgREST devolve a este JWT (caminho authenticated, com RLS). */
async function visiveis(token: string, tabela: Tabela, tenant: string): Promise<number> {
  const { count, error } = await getSupabaseAnonForToken(token).from(tabela)
    .select("tenant_id", { count: "exact", head: true }).eq("tenant_id", tenant);
  if (error) throw new Error(`${tabela}: ${error.code} ${error.message}`);
  return count ?? 0;
}

const caso = (extra: Linha = {}): Linha => ({
  tenant_id: loja, kind: "pix", yampi_id: `y-${randomUUID().slice(0, 8)}`,
  phone: "5511900000001", total_cents: 15_000, status: "em_sequencia", ...extra,
});
const script = (extra: Linha = {}): Linha => ({
  tenant_id: loja, key: `pix.${randomUUID().slice(0, 6)}`, kind: "pix",
  use: "automatico", title: "Pix", variants: ["a", "b"], ...extra,
});
const depoimento = (extra: Linha = {}): Linha => ({
  tenant_id: loja, storage_path: `${loja}/${randomUUID().slice(0, 6)}.jpg`,
  caption: "Amei", label: "Ana", authorized_by: dona.id, ...extra,
});

/**
 * Fixture mínima da 1a: uma `instances` (`purpose: "privado"`), uma `private_conversations` e uma
 * `private_messages` de saída do Recuperar ligada ao caso e ao script, com `variant: 2`. As colunas que a
 * migração do PR 1a exige em mensagem de `automatico` (module, priority, status, phone) vão preenchidas.
 * Devolve o id da mensagem.
 */
async function mensagemDoCaso(casoId: string, scriptId: string): Promise<string> {
  if (!conversaDaLoja) {
    const numero = await inserir("instances", { tenant_id: loja, name: `recuptest privado ${RUN}`, purpose: "privado" });
    if (numero.error) throw new Error(`instances: ${numero.error.message}`);
    const conversa = await inserir("private_conversations",
      { tenant_id: loja, instance_id: numero.data?.id, phone: "5511900000002" });
    if (conversa.error) throw new Error(`private_conversations: ${conversa.error.message}`);
    conversaDaLoja = String(conversa.data?.id);
  }
  const mensagem = await inserir("private_messages", {
    tenant_id: loja, conversation_id: conversaDaLoja, module: "recuperar", direction: "saida", author: "automatico",
    priority: "pix", status: "na_fila", phone: "5511900000002", text: "oi",
    case_id: casoId, script_id: scriptId, step_key: "p1", variant: 2,
  });
  if (mensagem.error) throw new Error(`private_messages: ${mensagem.error.message}`);
  return String(mensagem.data?.id);
}

/** Usuário de auth novo + login por senha no GoTrue: devolve o id e o JWT dele. */
async function criarPessoa(apelido: string): Promise<Pessoa> {
  const email = `recuptest-${RUN}-${apelido}@exemplo.invalid`;
  // Gerada aqui e descartada com o usuário no after().
  const password = `${randomUUID()}-Aa1!`;
  const { data, error } = await db().auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser ${apelido}: ${error?.message ?? "sem usuário"}`);
  usuarios.push(data.user.id);

  // O mesmo caminho do passo de integração do CI (curl em /auth/v1/token).
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const resposta = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: process.env.SUPABASE_ANON_KEY ?? "", "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!resposta.ok) throw new Error(`login de ${apelido}: ${resposta.status} ${await resposta.text()}`);
  const { access_token: token } = (await resposta.json()) as { access_token: string };
  return { id: data.user.id, token };
}

/** Uma linha de cada tabela na loja: o controle de que a dona vê o que as vendedoras não veem. */
async function semear(tenant: string): Promise<void> {
  const linhas: Array<[Tabela, Linha]> = [
    ["recovery_settings", { tenant_id: tenant }],
    ["recovery_cases", { tenant_id: tenant, kind: "pix", yampi_id: "semente", phone: "5511900000002",
      total_cents: 15_000, status: "em_sequencia" }],
    ["recovery_scripts", { tenant_id: tenant, key: "carrinho.c1", kind: "carrinho", use: "automatico",
      title: "Carrinho C1", variants: ["a"] }],
    ["recovery_testimonials", { tenant_id: tenant, storage_path: `${tenant}/semente-${RUN}.jpg`,
      caption: "Amei", label: "Ana", authorized_by: dona.id }],
  ];
  for (const [tabela, linha] of linhas) {
    const { error } = await inserir(tabela, linha);
    if (error) throw new Error(`semear ${tabela}: ${error.code} ${error.message}`);
  }
}

before(async () => {
  if (pular()) return;
  // Sem a anon key não há login, e o teste de RLS não provaria nada.
  if (!process.env.SUPABASE_ANON_KEY) throw new Error("integração ligada sem SUPABASE_ANON_KEY");

  const { data, error } = await db().from("organizations").insert([
    { name: `recuptest ${RUN}`, slug: `recuptest-${RUN}` },
    { name: `recuptest vizinha ${RUN}`, slug: `recuptest-vizinha-${RUN}` },
  ]).select("id");
  if (error) throw new Error(`organizations: ${error.message}`);
  // insert(...).select("id") devolve na ordem do envio.
  [loja, vizinha] = (data as { id: string }[]).map((o) => o.id);

  dona = await criarPessoa("dona");
  vendedora = await criarPessoa("vendedora");
  vendedoraComModulo = await criarPessoa("vendedora-modulo");
  const aceito = new Date().toISOString();
  const { error: erroMembros } = await db().from("memberships").insert([
    { tenant_id: loja, user_id: dona.id, role: "owner", accepted_at: aceito },
    { tenant_id: loja, user_id: vendedora.id, role: "seller", accepted_at: aceito },
    // O CHECK de memberships.modules aceitar `recuperar` é do PR 1a.
    { tenant_id: loja, user_id: vendedoraComModulo.id, role: "seller", modules: ["recuperar"], accepted_at: aceito },
  ]);
  if (erroMembros) throw new Error(`memberships: ${erroMembros.message}`);

  await semear(loja);
  await semear(vizinha);
});

after(async () => {
  if (pular()) return;
  const ids = [loja, vizinha].filter(Boolean);
  // Tenta tudo, mesmo que um passo falhe: parar no primeiro erro deixaria usuários e arquivos vazando.
  const falhas: string[] = [];
  const tentar = async (
    rotulo: string,
    passo: () => PromiseLike<{ error: { message: string } | null; count?: number | null }>,
  ) => {
    try {
      const { error, count } = await passo();
      if (error) falhas.push(`${rotulo}: ${error.message}`);
      else if (count) falhas.push(`${rotulo}: ${count} linha(s) sobraram depois da cascata`);
    } catch (e) {
      falhas.push(`${rotulo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  if (objetos.length) await tentar("storage", () => db().storage.from(BUCKET).remove(objetos));
  // organizations leva o resto junto (on delete cascade).
  for (const id of ids) await tentar(`organizations ${id}`, () => db().from("organizations").delete().eq("id", id));
  for (const tabela of [...TABELAS, "instances"]) {
    await tentar(tabela, () => db().from(tabela).select("tenant_id", { count: "exact", head: true }).in("tenant_id", ids));
  }
  for (const id of usuarios) await tentar(`deleteUser ${id}`, () => db().auth.admin.deleteUser(id));
  if (falhas.length) throw new Error(`limpeza incompleta:\n${falhas.join("\n")}`);
});

test("RLS: a dona lê as quatro tabelas da loja; as duas vendedoras leem zero; a vizinha não aparece", { skip: pular() }, async () => {
  for (const t of TABELAS) {
    assert.ok((await visiveis(dona.token, t, loja)) > 0, `a dona não viu ${t}: o controle falhou e o teste não prova nada`);
    assert.equal(await visiveis(vendedora.token, t, loja), 0, `a vendedora leu ${t} direto do banco`);
    assert.equal(await visiveis(vendedoraComModulo.token, t, loja), 0, `o módulo recuperar abriu ${t} pelo PostgREST`);
    assert.equal(await visiveis(dona.token, t, vizinha), 0, `a dona leu ${t} da vizinha`);
  }
});

test("authenticated só lê: escrever pelo JWT da dona, ler com a anon key e chamar a limpeza dão 42501", { skip: pular() }, async () => {
  const jwtDona = getSupabaseAnonForToken(dona.token);
  const anon = getSupabaseAnonForToken(process.env.SUPABASE_ANON_KEY ?? "");
  for (const t of TABELAS) {
    assert.equal((await jwtDona.from(t).insert({ tenant_id: loja })).error?.code, "42501", `insert em ${t}`);
    assert.equal((await jwtDona.from(t).update({ updated_at: new Date().toISOString() }).eq("tenant_id", loja)).error?.code, "42501", `update em ${t}`);
    assert.equal((await jwtDona.from(t).delete().eq("tenant_id", loja)).error?.code, "42501", `delete em ${t}`);
    assert.equal((await anon.from(t).select("tenant_id")).error?.code, "42501", `anon leu ${t}`);
  }
  assert.equal((await jwtDona.rpc("limpar_dados_vencidos_recuperar")).error?.code, "42501");
  assert.equal((await anon.rpc("limpar_dados_vencidos_recuperar")).error?.code, "42501");
});

test("phone_key: telefone com e sem 55 e 9º dígito gera a mesma chave, e a busca por ela acha os dois", { skip: pular() }, async () => {
  const a = await inserir("recovery_cases", caso({ yampi_id: "pk-a", phone: "5511900000001" }));
  const b = await inserir("recovery_cases", caso({ yampi_id: "pk-b", kind: "carrinho", phone: "1100000001" }));
  assert.equal(a.error, null);
  assert.equal(b.error, null);
  assert.equal(a.data?.phone_key, "1100000001");
  assert.equal(b.data?.phone_key, "1100000001");
  const { data } = await db().from("recovery_cases").select("yampi_id").eq("tenant_id", loja).eq("phone_key", "1100000001");
  assert.deepEqual((data ?? []).map((r) => r.yampi_id).sort(), ["pk-a", "pk-b"]);
});

test("único: (loja, tipo, id da Yampi), chave do script e caminho do depoimento; o mesmo id em outro tipo ou outra loja passa", { skip: pular() }, async () => {
  assert.equal((await inserir("recovery_cases", caso({ yampi_id: "dup-1" }))).error, null);
  recusado((await inserir("recovery_cases", caso({ yampi_id: "dup-1" }))).error, "23505", "recovery_cases_tenant_kind_yampi_key");
  assert.equal((await inserir("recovery_cases", caso({ yampi_id: "dup-1", kind: "carrinho" }))).error, null);
  assert.equal((await inserir("recovery_cases", { ...caso({ yampi_id: "dup-1" }), tenant_id: vizinha })).error, null);
  const s = script({ key: "pix.dup" });
  const d = depoimento();
  assert.equal((await inserir("recovery_scripts", s)).error, null);
  recusado((await inserir("recovery_scripts", s)).error, "23505", "recovery_scripts_tenant_key_key");
  assert.equal((await inserir("recovery_testimonials", d)).error, null);
  recusado((await inserir("recovery_testimonials", d)).error, "23505", "recovery_testimonials_storage_path_key");
});

test("CHECKs: o banco recusa o que a spec proíbe, com o code e a constraint que o store do PR 7 lê", { skip: pular() }, async () => {
  const recusas: Array<[Tabela, Linha, string, string]> = [
    ["recovery_cases", caso({ kind: "boleto" }), "23514", "recovery_cases_kind_check"],
    ["recovery_cases", caso({ status: "pago" }), "23514", "recovery_cases_status_check"],
    ["recovery_cases", caso({ phone: "(11) 90000-0001" }), "23514", "recovery_cases_phone_check"],
    ["recovery_cases", caso({ jid: "123456789012345@lid" }), "23514", "recovery_cases_jid_check"],
    ["recovery_cases", caso({ jid: "120363000000000000@g.us" }), "23514", "recovery_cases_jid_check"],
    ["recovery_cases", caso({ total_cents: 0 }), "23514", "recovery_cases_total_check"],
    ["recovery_cases", caso({ items: Array.from({ length: 31 }, (_, i) => ({ nome: `p${i}` })) }), "23514", "recovery_cases_items_check"],
    ["recovery_cases", caso({ link: "https://seguro.loja.test/c/abc?customerToken=xyz" }), "23514", "recovery_cases_link_check"],
    ["recovery_cases", caso({ link: "http://seguro.loja.test/c/abc" }), "23514", "recovery_cases_link_check"],
    ["recovery_cases", caso({ pix_code: "0".repeat(2049) }), "23514", "recovery_cases_tamanhos_check"],
    ["recovery_cases", caso({ step: "P1" }), "23514", "recovery_cases_step_check"],
    ["recovery_cases", caso({ stop_reason: "Pago por outro" }), "23514", "recovery_cases_stop_reason_check"],
    ["recovery_cases", caso({ recovered_cents: 0 }), "23514", "recovery_cases_recovered_cents_check"],
    ["recovery_cases", caso({ status: "agendado" }), "23514", "recovery_cases_agendado_check"], // sem next_step_at
    ["recovery_cases", caso({ status: "recuperado" }), "23514", "recovery_cases_recuperado_check"], // sem recovered_at e recovered_cents
    ["recovery_cases", caso({ status: "controle" }), "23514", "recovery_cases_controle_check"], // control false
    ["recovery_scripts", script({ variants: [] }), "23514", "recovery_scripts_variants_check"],
    ["recovery_scripts", script({ variants: ["a", "b", "c", "d"] }), "23514", "recovery_scripts_variants_check"],
    ["recovery_scripts", script({ fixed_variant: 3 }), "23514", "recovery_scripts_fixed_check"], // a base tem 2 versões
    ["recovery_scripts", script({ use: "chat", kind: "geral" }), "23514", "recovery_scripts_chat_check"],
    ["recovery_scripts", script({ kind: "geral" }), "23514", "recovery_scripts_automatico_check"],
    ["recovery_scripts", script({ key: "Pix.P1" }), "23514", "recovery_scripts_key_check"],
    ["recovery_scripts", script({ kind: "boleto" }), "23514", "recovery_scripts_kind_check"],
    // 1 versão: com 2, `use` fora da lista também quebraria o chat_check (o Postgres reporta o primeiro por nome).
    ["recovery_scripts", script({ use: "manual", variants: ["a"] }), "23514", "recovery_scripts_use_check"],
    ["recovery_scripts", script({ title: "   " }), "23514", "recovery_scripts_title_check"],
    ["recovery_testimonials", depoimento({ authorized_by: null }), "23502", "authorized_by"],
    ["recovery_testimonials", depoimento({ storage_path: `${vizinha}/f.jpg` }), "23514", "recovery_testimonials_path_check"],
    ["recovery_testimonials", depoimento({ storage_path: `${loja}/../${vizinha}/f.jpg` }), "23514", "recovery_testimonials_path_check"],
    ["recovery_testimonials", depoimento({ storage_path: `${loja}/f.gif` }), "23514", "recovery_testimonials_path_check"],
    ["recovery_testimonials", depoimento({ caption: "x".repeat(301) }), "23514", "recovery_testimonials_caption_check"],
    ["recovery_testimonials", depoimento({ label: "  " }), "23514", "recovery_testimonials_label_check"],
    ["recovery_testimonials", depoimento({ sends: -1 }), "23514", "recovery_testimonials_contadores_check"],
  ];
  for (const [tabela, linha, code, trecho] of recusas) recusado((await inserir(tabela, linha)).error, code, trecho);

  const ajustes: Array<[Linha, string]> = [ // a linha da loja já existe (semear): update
    [{ pix_espera_p1_min: 4 }, "recovery_settings_pix_p1_check"],
    [{ pix_lembrete_antes_min: 15 }, "recovery_settings_pix_lembrete_check"],
    [{ carrinho_espera_c1: "amanha" }, "recovery_settings_carrinho_c1_check"],
    [{ carrinho_c2_dias: 3 }, "recovery_settings_carrinho_c2_check"],
    [{ cupom: "" }, "recovery_settings_textos_check"],
    [{ pedido_minimo_cents: 0 }, "recovery_settings_pedido_minimo_check"],
    [{ numeros_ignorados: ["(85) 99999-0000"] }, "recovery_settings_numeros_check"],
  ];
  for (const [campos, constraint] of ajustes) {
    recusado((await db().from("recovery_settings").update(campos).eq("tenant_id", loja)).error, "23514", constraint);
  }
});

test("padrões e vocabulário: os ajustes nascem no padrão da ativação; os 10 status e os scripts válidos passam", { skip: pular() }, async () => {
  const { data } = await db().from("recovery_settings").select("*").eq("tenant_id", loja).single();
  const esperado = {
    automatico: false, pix_ligado: true, carrinho_ligado: false, controle: true, responder_com_link: true,
    pix_espera_p1_min: 3, pix_lembrete_antes_min: 10, carrinho_espera_c1: "dia_seguinte_10h", carrinho_c2_dias: 1,
    carrinho_c3_ligado: false, numeros_ignorados: [],
  };
  assert.deepEqual(Object.fromEntries(Object.keys(esperado).map((k) => [k, (data as Linha)[k]])), esperado);
  for (const status of STATUS_DA_SPEC) {
    const agora = new Date().toISOString();
    const { error } = await inserir("recovery_cases", caso({
      status, next_step_at: agora, recovered_at: agora, recovered_cents: 15_000, control: status === "controle",
    }));
    assert.equal(error, null, status);
  }
  assert.equal((await inserir("recovery_cases", caso({ link: "https://seguro.loja.test/c/abc?utm=x", jid: "5511900000001@s.whatsapp.net" }))).error, null);
  assert.equal((await inserir("recovery_scripts", script({ key: "chat.frete", use: "chat", kind: "geral", variants: ["a"] }))).error, null);
  assert.equal((await inserir("recovery_scripts", script({ variants: ["a", "b", "c"], fixed_variant: 3 }))).error, null);
});

test("limpeza: apaga fechado e `respondeu` parados há mais de 180 dias e guarda o resto; a mensagem do caso apagado fica sem caso e sem perder a versão", { skip: pular() }, async () => {
  const velho = (dias: number) => new Date(Date.now() - dias * DIA).toISOString();
  const cenario: Array<[string, number]> = [ // [status, dias sem mudar]; os três primeiros somem, os quatro últimos ficam
    ["perdido", 181], ["recuperado", 400], ["respondeu", 181], ["parado", 179], ["respondeu", 10], ["agendado", 181], ["em_sequencia", 181],
  ];
  const ids: string[] = [];
  for (const [i, [status, dias]] of cenario.entries()) {
    const { data, error } = await inserir("recovery_cases", caso({
      yampi_id: `lp-${i}`, status, updated_at: velho(dias),
      next_step_at: velho(dias), recovered_at: velho(dias), recovered_cents: 15_000,
    }));
    assert.equal(error, null, `${status} ${dias}d`);
    ids.push(String(data?.id));
  }
  const usado = (await inserir("recovery_scripts", script({ key: "pix.limpeza" }))).data;
  const mensagem = await mensagemDoCaso(ids[0], String(usado?.id)); // ligada ao `perdido` de 181 dias, variant 2
  const mudarMensagem = (campos: Linha) => db().from("private_messages").update(campos).eq("id", mensagem);
  recusado((await mudarMensagem({ variant: 4 })).error, "23514", "private_messages_variant_check");
  recusado((await mudarMensagem({ step_key: "P1" })).error, "23514", "private_messages_step_key_check");

  const { data: n, error } = await db().rpc("limpar_dados_vencidos_recuperar");
  assert.equal(error, null);
  assert.ok(Number(n) >= 3, `devolveu ${n}`); // outras lojas de dev podem ter vencidos
  const { data: restam } = await db().from("recovery_cases").select("yampi_id").eq("tenant_id", loja).like("yampi_id", "lp-%");
  assert.deepEqual((restam ?? []).map((r) => r.yampi_id).sort(), ["lp-3", "lp-4", "lp-5", "lp-6"]);
  const lida = async () => (await db().from("private_messages").select("case_id, script_id, variant").eq("id", mensagem).single()).data;
  assert.deepEqual(await lida(), { case_id: null, script_id: usado?.id, variant: 2 });
  assert.equal((await db().from("recovery_scripts").delete().eq("id", String(usado?.id))).error, null); // script usado: set null, não falha
  assert.deepEqual(await lida(), { case_id: null, script_id: null, variant: 2 });
});

test("bucket recuperar-depoimentos: privado, 512 KiB, só jpeg/png/webp; a dona não lista, não baixa e não assina", { skip: pular() }, async () => {
  const { data: bucket, error } = await db().storage.getBucket(BUCKET);
  assert.equal(error, null);
  assert.equal(bucket?.public, false);
  assert.equal(bucket?.file_size_limit, 524_288);
  assert.deepEqual([...(bucket?.allowed_mime_types ?? [])].sort(), ["image/jpeg", "image/png", "image/webp"]);
  const caminho = `${loja}/bucket-${RUN}.png`;
  objetos.push(caminho);
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  assert.equal((await db().storage.from(BUCKET).upload(caminho, bytes, { contentType: "image/png" })).error, null);
  assert.ok((await db().storage.from(BUCKET).upload(`${loja}/x-${RUN}.gif`, bytes, { contentType: "image/gif" })).error, "gif passou");
  assert.equal((await db().storage.from(BUCKET).createSignedUrl(caminho, 60)).error, null, "o service-role assina");
  const comoDona = getSupabaseAnonForToken(dona.token).storage.from(BUCKET);
  assert.ok((await comoDona.download(caminho)).error, "a dona baixou");
  assert.ok((await comoDona.createSignedUrl(caminho, 60)).error, "a dona assinou");
  assert.deepEqual((await comoDona.list(loja)).data ?? [], [], "a dona listou");
});
