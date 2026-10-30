import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getSupabaseAdmin, getSupabaseAnonForToken } from "@/lib/supabase/server";

/**
 * Base comum do Recuperar e do Rastreio (migração 20261030120000_base_comum_yampi_privado, PR 1a)
 * contra o Supabase de DEV, no job e2e, em duas lojas descartáveis criadas aqui e apagadas no fim (a
 * cascata de organizations leva instâncias, conversas, mensagens, comandos, conexão, avisos e listas)
 * e uma dona e uma vendedora com login de verdade. A loja de QA não é tocada; E2E_TENANT_ID é só a
 * chave de ligar. O catálogo (RLS, ACL, gatilhos) é do infra/tests/base-comum-yampi-privado-check.sql,
 * que também roda em prod. Aqui: o que as stores dos PRs 2, 3, 4, 5 e 6 vão pisar pelo PostgREST, o que
 * um JWT da loja lê (as cinco private_* da própria loja, nunca pela vendedora) e o que ele NÃO consegue
 * (ler as tabelas da Yampi, escrever em qualquer uma, ligar o add-on).
 */

const LIGADO = Boolean(process.env.E2E_TENANT_ID);
// Estas linhas criam usuário e loja: apontado para produção, o teste não roda.
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);
const DIA_MS = 86_400_000;
const TABELAS_DA_YAMPI = ["yampi_connections", "yampi_events"] as const;
const TABELAS_DO_NUMERO = [
  "private_conversations", "private_messages", "private_number_state", "private_signals", "private_optouts",
] as const;
const TABELAS = [...TABELAS_DA_YAMPI, ...TABELAS_DO_NUMERO] as const;
/** Forma do selar() (v1.<iv 12 B>.<tag 16 B>.<cifra>, base64url), sem segredo nenhum dentro. */
const SELADO = `v1.${"A".repeat(16)}.${"A".repeat(22)}.AAAA`;

type Erro = { code: string; message: string };
type Pessoa = { id: string; token: string };

const usuarios: string[] = [];
let loja = "";
let vizinha = "";
let numeroGrupos = "";
let numeroLoja = "";
let numeroVizinha = "";
let conexaoLoja = "";
let dona: Pessoa = { id: "", token: "" };
let vendedora: Pessoa = { id: "", token: "" };

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

const db = () => getSupabaseAdmin();
const ha = (dias: number) => new Date(Date.now() - dias * DIA_MS).toISOString();

/** insert(...).select().single(); erro vira exceção com o nome da tabela. */
async function inserir<T>(tabela: string, linha: Record<string, unknown>): Promise<T> {
  const { data, error } = await db().from(tabela).insert(linha).select().single();
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return data as T;
}

/** O erro do PostgREST ao inserir; null = gravou. */
async function erroAoInserir(tabela: string, linha: Record<string, unknown>): Promise<Erro | null> {
  const { error } = await db().from(tabela).insert(linha);
  return error ? { code: error.code, message: error.message } : null;
}

/** Linha da loja com esse id existe? */
async function existe(tabela: string, id: string): Promise<boolean> {
  const { data, error } = await db().from(tabela).select("id").eq("tenant_id", loja).eq("id", id).maybeSingle();
  if (error) throw new Error(`${tabela}: ${error.message}`);
  return data !== null;
}

/** Usuário de auth novo + login por senha no GoTrue: devolve o id e o JWT dele. */
async function criarPessoa(apelido: string): Promise<Pessoa> {
  const email = `privtest-${RUN}-${apelido}@exemplo.invalid`;
  // Gerada aqui e descartada com o usuário no after().
  const password = `${randomUUID()}-Aa1!`;
  const { data, error } = await db().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
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

/**
 * Linhas de `tenant` que o PostgREST devolve a este JWT (caminho authenticated, com RLS); erro vira exceção
 * com o code. Molde do PR 1b.
 */
async function visiveis(token: string, tabela: (typeof TABELAS_DO_NUMERO)[number], tenant: string): Promise<number> {
  const { count, error } = await getSupabaseAnonForToken(token).from(tabela)
    .select("tenant_id", { count: "exact", head: true }).eq("tenant_id", tenant);
  if (error) throw new Error(`${tabela}: ${error.code} ${error.message}`);
  return count ?? 0;
}

function recusa(erro: Erro | null, code: "23505" | "23514", nome: string): void {
  assert.equal(erro?.code, code, `esperava ${code} em ${nome}, veio ${JSON.stringify(erro)}`);
  assert.match(erro?.message ?? "", new RegExp(`"${nome}"`));
}

before(async () => {
  if (pular()) return;
  // Sem a anon key não há login, e o teste de RLS não provaria nada.
  if (!process.env.SUPABASE_ANON_KEY) throw new Error("integração ligada sem SUPABASE_ANON_KEY");

  const { data, error } = await db().from("organizations").insert([
    { name: `privtest ${RUN}`, slug: `privtest-${RUN}` },
    { name: `privtest vizinha ${RUN}`, slug: `privtest-vizinha-${RUN}` },
  ]).select("id");
  if (error) throw new Error(`organizations: ${error.message}`);
  // insert(...).select("id") devolve na ordem do envio.
  [loja, vizinha] = (data as { id: string }[]).map((o) => o.id);

  // Sem purpose: o padrão 'grupos' é o que o teste de instances confere.
  numeroGrupos = (await inserir<{ id: string }>("instances", { tenant_id: loja, name: `privtest grupos ${RUN}` })).id;
  numeroLoja = (await inserir<{ id: string }>("instances",
    { tenant_id: loja, name: `privtest privado ${RUN}`, purpose: "privado" })).id;
  numeroVizinha = (await inserir<{ id: string }>("instances",
    { tenant_id: vizinha, name: `privtest privado vizinha ${RUN}`, purpose: "privado" })).id;
  conexaoLoja = (await inserir<{ id: string }>("yampi_connections", {
    tenant_id: loja, alias: `privtest-${RUN}`, user_token: SELADO, user_secret_key: SELADO, webhook_secret: SELADO,
  })).id;

  dona = await criarPessoa("dona");
  vendedora = await criarPessoa("vendedora");
  const aceito = new Date().toISOString();
  // modules fica no padrão ('{}'): o teste de módulos é quem o muda.
  const { error: erroMembros } = await db().from("memberships").insert([
    { tenant_id: loja, user_id: dona.id, role: "owner", accepted_at: aceito },
    { tenant_id: loja, user_id: vendedora.id, role: "seller", accepted_at: aceito },
  ]);
  if (erroMembros) throw new Error(`memberships: ${erroMembros.message}`);
});

after(async () => {
  if (pular()) return;
  const ids = [loja, vizinha].filter(Boolean);
  // Tenta tudo, mesmo que um passo falhe: parar no primeiro erro deixaria usuários vazando.
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
  // organizations leva o resto junto (on delete cascade).
  for (const id of ids) await tentar(`organizations ${id}`, () => db().from("organizations").delete().eq("id", id));
  for (const tabela of [...TABELAS, "engine_commands", "instances"]) {
    await tentar(tabela, () => db().from(tabela).select("tenant_id", { count: "exact", head: true })
      .in("tenant_id", ids));
  }
  for (const id of usuarios) await tentar(`deleteUser ${id}`, () => db().auth.admin.deleteUser(id));
  if (falhas.length) throw new Error(`limpeza incompleta:\n${falhas.join("\n")}`);
});

test("RLS: a dona lê as cinco private_* da própria loja; a vendedora e a outra loja não aparecem; as da Yampi dão 42501", { skip: pular() }, async () => {
  // Uma linha de cada tabela do número nas duas lojas, com telefones que nenhum outro teste usa. O estado do
  // número da loja fica no número dos grupos: o teste de private_number_state cria o do numeroLoja.
  for (const [tenant, numero, ritmo] of [[loja, numeroLoja, numeroGrupos], [vizinha, numeroVizinha, numeroVizinha]] as const) {
    const c = await inserir<{ id: string }>("private_conversations", { tenant_id: tenant, instance_id: numero, phone: "5562955550001" });
    await inserir("private_messages", { tenant_id: tenant, conversation_id: c.id, direction: "entrada", author: "cliente", text: "oi" });
    await inserir("private_number_state", { tenant_id: tenant, instance_id: ritmo });
    await inserir("private_signals", { tenant_id: tenant, instance_id: numero, kind: "recusa" });
    await inserir("private_optouts", { tenant_id: tenant, phone: "5562955550002" });
  }
  for (const tabela of TABELAS_DO_NUMERO) {
    assert.ok((await visiveis(dona.token, tabela, loja)) > 0, `a dona não viu ${tabela}: o controle falhou e o teste não prova nada`);
    assert.equal(await visiveis(dona.token, tabela, vizinha), 0, `a dona leu ${tabela} da vizinha`);
    assert.equal(await visiveis(vendedora.token, tabela, loja), 0, `a vendedora leu ${tabela} direto do banco`);
  }
  for (const [quem, pessoa] of [["dona", dona], ["vendedora", vendedora]] as const) {
    for (const tabela of TABELAS_DA_YAMPI) {
      const { error } = await getSupabaseAnonForToken(pessoa.token).from(tabela).select("tenant_id").eq("tenant_id", loja);
      assert.equal(error?.code, "42501", `${quem} em ${tabela}: ${JSON.stringify(error)}`);
    }
  }
});

test("authenticated não escreve: insert, update e delete pelo JWT da dona dão 42501 nas sete tabelas", { skip: pular() }, async () => {
  const jwt = getSupabaseAnonForToken(dona.token);
  for (const t of TABELAS) {
    assert.equal((await jwt.from(t).insert({ tenant_id: loja })).error?.code, "42501", `insert em ${t}`);
    assert.equal((await jwt.from(t).update({ tenant_id: loja }).eq("tenant_id", loja)).error?.code, "42501", `update em ${t}`);
    assert.equal((await jwt.from(t).delete().eq("tenant_id", loja)).error?.code, "42501", `delete em ${t}`);
  }
});

test("instances.purpose: padrão grupos; uma privado por loja; valor fora da lista recusado", { skip: pular() }, async () => {
  const { data } = await db().from("instances").select("purpose").eq("tenant_id", loja).eq("id", numeroGrupos).single();
  assert.equal((data as { purpose: string } | null)?.purpose, "grupos");
  recusa(await erroAoInserir("instances", { tenant_id: loja, name: `privtest 2 ${RUN}`, purpose: "privado" }),
    "23505", "instances_one_privado_per_tenant");
  recusa(await erroAoInserir("instances", { tenant_id: loja, name: `privtest x ${RUN}`, purpose: "outro" }),
    "23514", "instances_purpose_check");
  // A vizinha tem a privado dela (before): o índice é por loja.
});

test("memberships.modules: a vendedora recebe recuperar e rastreio; módulo fora da lista é recusado", { skip: pular() }, async () => {
  const mudar = (modules: string[]) =>
    db().from("memberships").update({ modules }).eq("tenant_id", loja).eq("user_id", vendedora.id);
  assert.equal((await mudar(["postar", "recuperar", "rastreio"])).error, null);
  // Ter o módulo não abre a leitura direta: o RLS é avaliado a cada requisição, então o mesmo JWT já vale.
  for (const tabela of TABELAS_DO_NUMERO) {
    assert.equal(await visiveis(vendedora.token, tabela, loja), 0,
      `a vendedora com recuperar e rastreio leu ${tabela} direto do banco`);
  }
  recusa((await mudar(["recuperar", "vendas"])).error, "23514", "memberships_modules_validos");
  assert.equal((await mudar([])).error, null);
});

test("tenant_settings: as duas flags nascem desligadas, a dona não liga pelo PostgREST e o servidor liga", { skip: pular() }, async () => {
  const flags = "recuperar_enabled, rastreio_enabled";
  const nova = await db().from("tenant_settings").insert({ tenant_id: loja }).select(flags).single();
  assert.deepEqual(nova.data, { recuperar_enabled: false, rastreio_enabled: false });
  for (const flag of ["recuperar_enabled", "rastreio_enabled"] as const) {
    const { error } = await getSupabaseAnonForToken(dona.token).from("tenant_settings")
      .update({ [flag]: true }).eq("tenant_id", loja);
    assert.equal(error?.code, "42501", `a dona mudou ${flag}: ${JSON.stringify(error)}`);
  }
  const lida = await db().from("tenant_settings").select(flags).eq("tenant_id", loja).single();
  assert.deepEqual(lida.data, { recuperar_enabled: false, rastreio_enabled: false });
  const ligada = await db().from("tenant_settings").update({ recuperar_enabled: true, rastreio_enabled: true })
    .eq("tenant_id", loja).select(flags).single();
  assert.deepEqual(ligada.data, { recuperar_enabled: true, rastreio_enabled: true });
});

test("private_conversations: phone_key sem 55 e sem nono dígito; uma conversa por número e telefone e por número e lid", { skip: pular() }, async () => {
  const conversa = (tenant: string, numero: string, campos: Record<string, unknown>) =>
    ({ tenant_id: tenant, instance_id: numero, ...campos });
  const a = await inserir<{ phone_key: string }>("private_conversations", conversa(loja, numeroLoja, { phone: "5562999998888" }));
  assert.equal(a.phone_key, "6299998888");
  recusa(await erroAoInserir("private_conversations", conversa(loja, numeroLoja, { phone: "556299998888" })),
    "23505", "private_conversations_telefone_unique");
  assert.equal(await erroAoInserir("private_conversations", conversa(vizinha, numeroVizinha, { phone: "5562999998888" })), null);
  const semTelefone = await inserir<{ phone_key: string | null }>("private_conversations",
    conversa(loja, numeroLoja, { lid: `${RUN}@lid` }));
  assert.equal(semTelefone.phone_key, null);
  recusa(await erroAoInserir("private_conversations", conversa(loja, numeroLoja, { lid: `${RUN}@lid` })),
    "23505", "private_conversations_lid_unique");
  recusa(await erroAoInserir("private_conversations", conversa(loja, numeroLoja, {})),
    "23514", "private_conversations_tem_contato");
  recusa(await erroAoInserir("private_conversations", conversa(loja, numeroLoja, { phone: "+55 62 98888-0000" })),
    "23514", "private_conversations_phone_check");
});

test("private_messages: valores do contrato, o que a Girumo manda vem completo, uma linha por parte e por id do WhatsApp", { skip: pular() }, async () => {
  const c = await inserir<{ id: string }>("private_conversations", { tenant_id: loja, instance_id: numeroLoja, phone: "5562977776666" });
  const cv = await inserir<{ id: string }>("private_conversations", { tenant_id: vizinha, instance_id: numeroVizinha, phone: "5562977776666" });
  const saida = (tenant: string, conversa: string, campos: Record<string, unknown> = {}) => ({
    tenant_id: tenant, conversation_id: conversa, module: "recuperar", direction: "saida", author: "automatico",
    text: "Oi", phone: "5562977776666", priority: "pix", status: "na_fila",
    dedupe_key: `caso:${RUN}:pix.p1`, part_index: 0, ...campos,
  });
  assert.equal(await erroAoInserir("private_messages", saida(loja, c.id)), null);
  recusa(await erroAoInserir("private_messages", saida(loja, c.id)), "23505", "private_messages_dedupe_unique");
  // A chave é da linha: a parte 2 do mesmo passo grava a sua.
  recusa(await erroAoInserir("private_messages", saida(loja, c.id, { part_index: 1 })), "23505", "private_messages_dedupe_unique");
  assert.equal(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: `caso:${RUN}:pix.p1:1`, part_index: 1 })), null);
  assert.equal(await erroAoInserir("private_messages", saida(vizinha, cv.id)), null, "a mesma chave em outra loja");
  for (let i = 0; i < 2; i++) {
    assert.equal(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: null })), null, "sem chave não colide");
  }
  recusa(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: null, part_index: 3 })),
    "23514", "private_messages_part_index_check");
  for (const [campo, valor] of [["module", "outro"], ["status", "vencida"], ["priority", "urgente"],
                                ["author", "robo"], ["kind", "video"]] as const) {
    recusa(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: null, [campo]: valor })),
      "23514", `private_messages_${campo}_check`);
  }
  recusa(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: null, text: "x".repeat(4097) })),
    "23514", "private_messages_text_check");
  recusa(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: null, author: "cliente" })),
    "23514", "private_messages_direcao_do_autor");
  recusa(await erroAoInserir("private_messages", saida(loja, c.id, { dedupe_key: null, priority: null })),
    "23514", "private_messages_envio_completo");
  // A resposta da cliente chega sem módulo, prioridade, status e telefone.
  const entrada = { tenant_id: loja, conversation_id: c.id, direction: "entrada", author: "cliente",
    text: "quero", provider_message_id: `wa-${RUN}` };
  assert.equal(await erroAoInserir("private_messages", entrada), null);
  recusa(await erroAoInserir("private_messages", entrada), "23505", "private_messages_provider_unique");
  assert.equal(await erroAoInserir("private_messages", { ...entrada, tenant_id: vizinha, conversation_id: cv.id }), null);
});

test("yampi: credencial só selada, ativa tem credencial, uma conexão por loja, aviso não repete", { skip: pular() }, async () => {
  const { data } = await db().from("yampi_connections").select("status").eq("tenant_id", loja).single();
  assert.equal((data as { status: string } | null)?.status, "ativa");
  recusa(await erroAoInserir("yampi_connections", { tenant_id: loja, alias: "outra", status: "desconectada" }),
    "23505", "yampi_connections_tenant_id_key");
  recusa(await erroAoInserir("yampi_connections", { tenant_id: vizinha, alias: "v", user_token: "tok_texto_aberto", user_secret_key: SELADO }),
    "23514", "yampi_connections_segredos_selados");
  recusa(await erroAoInserir("yampi_connections", { tenant_id: vizinha, alias: "v" }),
    "23514", "yampi_connections_ativa_tem_credencial");
  assert.equal(await erroAoInserir("yampi_connections", { tenant_id: vizinha, alias: "v", status: "desconectada" }), null);
  const aviso = { tenant_id: loja, connection_id: conexaoLoja, event: "order.paid", resource_id: "1",
    dedupe_key: `order.paid:1:${RUN}`, payload: {} };
  assert.equal(await erroAoInserir("yampi_events", aviso), null);
  recusa(await erroAoInserir("yampi_events", aviso), "23505", "yampi_events_dedupe_unique");
});

test("private_optouts: um por loja e telefone, com e sem 55 e nono dígito", { skip: pular() }, async () => {
  const o = await inserir<{ phone_key: string }>("private_optouts", { tenant_id: loja, phone: "5562988887777", module: "recuperar" });
  assert.equal(o.phone_key, "6288887777");
  recusa(await erroAoInserir("private_optouts", { tenant_id: loja, phone: "6288887777" }), "23505", "private_optouts_telefone_unique");
  assert.equal(await erroAoInserir("private_optouts", { tenant_id: vizinha, phone: "5562988887777" }), null);
  recusa(await erroAoInserir("private_optouts", { tenant_id: loja, phone: "5562911112222", module: "outro" }),
    "23514", "private_optouts_module_check");
});

test("private_number_state e private_signals: 9h–21h por padrão, fora de 8–22 ou invertido recusado, sinal só sair ou recusa", { skip: pular() }, async () => {
  const s = await inserir<{ horario_inicio: number; horario_fim: number }>("private_number_state",
    { instance_id: numeroLoja, tenant_id: loja });
  assert.deepEqual([s.horario_inicio, s.horario_fim], [9, 21]);
  const mudar = (campos: Record<string, unknown>) =>
    db().from("private_number_state").update(campos).eq("tenant_id", loja).eq("instance_id", numeroLoja);
  assert.equal((await mudar({ horario_inicio: 8, horario_fim: 22 })).error, null);
  recusa((await mudar({ horario_fim: 23 })).error, "23514", "private_number_state_horario_fim_check");
  recusa((await mudar({ horario_inicio: 21, horario_fim: 9 })).error, "23514", "private_number_state_horario");
  recusa((await mudar({ pause_reason: "manual" })).error, "23514", "private_number_state_pause_reason_check");
  assert.equal(await erroAoInserir("private_signals", { tenant_id: loja, instance_id: numeroLoja, kind: "sair", message_ref: `wa-${RUN}` }), null);
  recusa(await erroAoInserir("private_signals", { tenant_id: loja, instance_id: numeroLoja, kind: "spam" }),
    "23514", "private_signals_kind_check");
});

test("limpar_dados_vencidos_comuns: aviso com mais de 30 dias e conversa parada há 180 dias somem; o resto fica", { skip: pular() }, async () => {
  const evento = (dias: number, k: string) => ({ tenant_id: loja, connection_id: conexaoLoja, event: "cart.reminder",
    dedupe_key: `${k}:${RUN}`, payload: {}, received_at: ha(dias) });
  const eventoVelho = await inserir<{ id: string }>("yampi_events", evento(31, "velho"));
  const eventoNovo = await inserir<{ id: string }>("yampi_events", evento(29, "novo"));
  const conversa = (fone: string, campos: Record<string, unknown>) =>
    inserir<{ id: string }>("private_conversations", { tenant_id: loja, instance_id: numeroLoja, phone: fone, ...campos });
  // A limpeza é global e outros runs do CI a chamam em paralelo contra este mesmo banco: parada e respondeu
  // nascem novas (uma limpeza alheia não as apaga antes da mensagem e do comando entrarem) e só envelhecem
  // logo antes do rpc daqui.
  const parada = await conversa("5562900000001", {});
  const msgParada = await inserir<{ id: string }>("private_messages", { tenant_id: loja, conversation_id: parada.id,
    direction: "entrada", author: "cliente", text: "oi" });
  const comando = await inserir<{ id: string }>("engine_commands", { tenant_id: loja, instance_id: numeroLoja,
    type: "dm_text", status: "canceled", payload: {}, private_message_id: msgParada.id, dm_module: "recuperar",
    valid_until: ha(180) });
  // last_message_at ficou para trás, mas a cliente escreveu ontem.
  const respondeu = await conversa("5562900000002", {});
  const msgOntem = await inserir<{ id: string }>("private_messages", { tenant_id: loja, conversation_id: respondeu.id,
    direction: "entrada", author: "cliente", text: "e aí?", created_at: ha(1) });
  // Loja só com o Rastreio: a resposta não vira mensagem, só last_inbound_at.
  const escreveu = await conversa("5562900000003", { created_at: ha(200), last_message_at: ha(181), last_inbound_at: ha(2) });
  const vaziaVelha = await conversa("5562900000004", { created_at: ha(181) });
  const vaziaNova = await conversa("5562900000005", {});
  const saiu = await inserir<{ id: string }>("private_optouts", { tenant_id: loja, phone: "5562900000001", at: ha(400) });

  // Envelhece na ordem mensagem, depois conversas: uma limpeza alheia só enxerga o estado final esperado.
  const { error: erroMsg } = await db().from("private_messages").update({ created_at: ha(181) })
    .eq("tenant_id", loja).eq("id", msgParada.id);
  assert.equal(erroMsg, null, `envelhecer msgParada: ${JSON.stringify(erroMsg)}`);
  for (const id of [parada.id, respondeu.id]) {
    const { error: erroConversa } = await db().from("private_conversations")
      .update({ created_at: ha(200), last_message_at: ha(181) }).eq("tenant_id", loja).eq("id", id);
    assert.equal(erroConversa, null, `envelhecer conversa ${id}: ${JSON.stringify(erroConversa)}`);
  }

  const { data: apagados, error } = await db().rpc("limpar_dados_vencidos_comuns");
  assert.equal(error, null);
  // Só o tipo: a limpeza é global, e outro run do CI pode ter apagado antes as linhas daqui.
  assert.ok(Number.isInteger(apagados));

  assert.equal(await existe("yampi_events", eventoVelho.id), false);
  assert.equal(await existe("yampi_events", eventoNovo.id), true);
  assert.equal(await existe("private_conversations", parada.id), false);
  assert.equal(await existe("private_messages", msgParada.id), false, "as mensagens vão junto com a conversa");
  const { data: cmd } = await db().from("engine_commands").select("private_message_id")
    .eq("tenant_id", loja).eq("id", comando.id).single();
  assert.equal((cmd as { private_message_id: string | null } | null)?.private_message_id, null, "o comando fica, sem a mensagem");
  assert.equal(await existe("private_conversations", respondeu.id), true);
  assert.equal(await existe("private_messages", msgOntem.id), true);
  assert.equal(await existe("private_conversations", escreveu.id), true);
  assert.equal(await existe("private_conversations", vaziaVelha.id), false);
  assert.equal(await existe("private_conversations", vaziaNova.id), true);
  assert.equal(await existe("private_optouts", saiu.id), true, "SAIR não vence");
});
