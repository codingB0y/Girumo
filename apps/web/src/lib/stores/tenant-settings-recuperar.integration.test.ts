import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";

import { getSupabaseAdmin, getSupabaseAnonForToken } from "@/lib/supabase/server";
import { getTenantSettings, setRecuperarEnabled } from "@/lib/stores/tenant-settings";

/**
 * Contra o Supabase de DEV, numa loja descartável criada aqui e apagada no fim
 * (organização + dona com login de verdade). E2E_TENANT_ID é só a chave de
 * ligar — o CI o define no passo de integração.
 *
 * 1. Um membro da loja não liga `recuperar_enabled` pelo PostgREST: a dona tem o
 *    JWT no browser e a anon key é pública, então o token dela não pode ligar o
 *    add-on pago por conta própria. A recusa vem da revogação de escrita
 *    (migração 20261004120000: `authenticated` não tem INSERT/UPDATE/DELETE em
 *    `public`), que barra o update com 42501 antes de o trigger rodar. O trigger
 *    `tenant_settings_guard_recuperar_rastreio_flags` (migração 20261030120000)
 *    fica como defesa em profundidade, caso um grant por coluna volte a existir;
 *    este teste não o isola.
 * 2. O caminho do servidor (`setRecuperarEnabled`, service-role) liga e desliga, e
 *    `getTenantSettings` devolve o valor — o contrato que o webhook do Stripe e o
 *    guard de acesso consomem.
 */

const LIGADO = Boolean(process.env.E2E_TENANT_ID);
// Estas linhas criam usuário e loja: apontado para produção, o teste não roda.
const EM_PRODUCAO = (process.env.SUPABASE_URL ?? "").includes("nidoatbxaylrkcgbszns");
const RUN = randomUUID().slice(0, 8);

type Pessoa = { id: string; token: string };

const usuarios: string[] = [];
let loja = "";
let dona: Pessoa = { id: "", token: "" };

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

/** Usuário de auth novo + login por senha no GoTrue: devolve o id e o JWT dele. */
async function criarPessoa(apelido: string): Promise<Pessoa> {
  const email = `recuptest-${RUN}-${apelido}@exemplo.invalid`;
  // Gerada aqui e descartada com o usuário no after().
  const password = `${randomUUID()}-Aa1!`;
  const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
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

before(async () => {
  if (pular()) return;
  // Sem a anon key não há login, e o teste do guard não provaria nada.
  if (!process.env.SUPABASE_ANON_KEY) throw new Error("integração ligada sem SUPABASE_ANON_KEY");
  const supabase = getSupabaseAdmin();

  const { data: org, error: erroLoja } = await supabase
    .from("organizations")
    .insert({ name: `recuptest ${RUN}`, slug: `recuptest-${RUN}` })
    .select("id")
    .single();
  if (erroLoja) throw new Error(erroLoja.message);
  loja = org!.id as string;

  dona = await criarPessoa("dona");

  const { error: erroMembro } = await supabase
    .from("memberships")
    .insert({ tenant_id: loja, user_id: dona.id, role: "owner", accepted_at: new Date().toISOString() });
  if (erroMembro) throw new Error(erroMembro.message);
});

after(async () => {
  if (pular()) return;
  const supabase = getSupabaseAdmin();
  // Tenta tudo, mesmo que um passo falhe: parar no primeiro erro deixaria usuários vazando.
  const falhas: string[] = [];
  const tentar = async (rotulo: string, passo: () => PromiseLike<{ error: { message: string } | null }>) => {
    try {
      const { error } = await passo();
      if (error) falhas.push(`${rotulo}: ${error.message}`);
    } catch (e) {
      falhas.push(`${rotulo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  // A loja leva junto memberships e tenant_settings (on delete cascade).
  if (loja) await tentar("organizations", () => supabase.from("organizations").delete().eq("tenant_id", loja));
  for (const id of usuarios) await tentar(`deleteUser ${id}`, () => supabase.auth.admin.deleteUser(id));
  if (falhas.length) throw new Error(`limpeza incompleta:\n${falhas.join("\n")}`);
});

test("membro da loja não liga recuperar_enabled pelo PostgREST: o guard do banco recusa e a flag fica falsa", async () => {
  if (pular()) return;
  await setRecuperarEnabled(loja, false); // garante a linha
  const { error } = await getSupabaseAnonForToken(dona.token)
    .from("tenant_settings")
    .update({ recuperar_enabled: true })
    .eq("tenant_id", loja);
  // `error === null` é aceito porque o PostgREST pode filtrar o update (RLS) sem
  // devolver erro. Quem segura o resultado é a asserção seguinte: a flag segue falsa.
  assert.ok(error === null || error.code === "42501", `erro inesperado: ${error?.message}`);
  assert.equal((await getTenantSettings(loja)).recuperarEnabled, false);
});

test("o servidor liga e desliga a flag, e a leitura devolve o valor", async () => {
  if (pular()) return;
  await setRecuperarEnabled(loja, true);
  assert.equal((await getTenantSettings(loja)).recuperarEnabled, true);
  await setRecuperarEnabled(loja, false);
  assert.equal((await getTenantSettings(loja)).recuperarEnabled, false);
});
