import { randomBytes } from "node:crypto";

import { expect, request as novoRequest, test, type Locator, type Page } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { MENSAGEM_BLOQUEIO } from "../src/lib/auth/modulos";
import type { CartaoBling } from "../src/lib/bling/cartao";
import { BASE_URL, ESTADO_LOGADO } from "./caminhos";

/**
 * Configurações › Integrações › Bling (integração Bling, PR 9).
 *
 * O CI não tem as variáveis do Bling: o GET responde `disponivel: false` sem tocar no banco
 * e o cartão só diz "indisponível". O teste lê a resposta que a PRÓPRIA tela pediu e cobra o
 * cartão daquele estado — numa máquina com as variáveis o cartão vira o de conectar, e o
 * teste continua medindo a mesma coisa: a porta ligada na Vitrine e o cartão de acordo com a
 * rota. Só lê: conectar abriria o OAuth do Bling, que o CI não alcança.
 */

const URL_SUPABASE = process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const CHAVE_SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const CHAVE_ANON =
  process.env.E2E_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const TEM_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICE_ROLE && CHAVE_ANON);

const PREFIXO = "e2e-bling-vendedora-";
const UMA_HORA_MS = 3_600_000;
const SEM_SESSAO = { auth: { autoRefreshToken: false, persistSession: false } };

test("o dono vê o cartão do Bling na porta Integrações, no estado que a rota devolve", async ({ page }) => {
  const leitura = page.waitForResponse(
    (r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/integracoes/bling",
    { timeout: 30_000 },
  );
  await page.goto("/painel/configuracoes?secao=integracoes", { waitUntil: "load" });

  const resposta = await leitura;
  expect(resposta.status(), "GET /api/integracoes/bling do dono").toBe(200);
  const cartao = (await resposta.json()) as { disponivel?: unknown; conexao?: unknown };

  const bling = page.getByRole("region", { name: /^Bling/ });
  await expect(bling).toBeVisible({ timeout: 30_000 });
  await expect(bling).not.toContainText("Não deu para carregar");
  if (cartao.disponivel === false) {
    await expect(bling.getByRole("heading", { name: "Bling", exact: true })).toBeVisible();
    await expect(bling).toContainText("Integração com o Bling indisponível no momento.");
    await expect(bling.getByRole("button")).toHaveCount(0);
  } else if (cartao.conexao === null) {
    await expect(bling.getByRole("button", { name: "Conectar Bling" })).toBeVisible();
  } else {
    await expect(bling.getByRole("heading", { name: /^Bling · / })).toBeVisible();
  }
});

/** A versão (o hash do conteúdo) das situações que o GET falso devolve. */
const VERSAO = "3f0c9a1b2d4e5f60";
const RECARREGUE = "As situações do Bling mudaram desde que você abriu os ajustes. Recarregue a página e confira quais contam como venda.";

/** Uma loja conectada que nunca escolheu as situações (Atendido marcado pelo padrão), sem campanha com pixel. */
const CONECTADA: CartaoBling = {
  disponivel: true,
  conexao: {
    status: "ativa",
    empresa: "Loja do e2e",
    conectada_em: "2026-10-13T12:00:00.000Z",
    ultima_venda_em: null,
    ultimo_aviso_em: null,
    tempo_real: "sem_dados",
    pausada_ate: null,
    ultimo_erro: null,
  },
  historico: { lidos: 0, concluido: true },
  ajustes: {
    situacoes: [
      { id: 6, nome: "Em aberto", base: 6, conta: false, bloqueada: false },
      { id: 9, nome: "Atendido", base: 9, conta: true, bloqueada: false },
      { id: 12, nome: "Cancelado", base: 12, conta: false, bloqueada: true },
    ],
    situacoes_versao: VERSAO,
    high_value: 1500,
    meta_enabled: true,
    pixel: { escolhido: null, opcoes: [] },
    canais: [{ id: 200000001, pedidos: 42, exemplos: ["1532", "1530"], ultimo_pedido_em: "2026-10-18", fora_do_meta: false }],
  },
  numeros_30d: {
    vendas: 0,
    vendido: 0,
    com_origem: { anuncio: 0, grupo: 0 },
    sem_origem: 0,
    meta: { enviado: 0, fora_da_janela: 0, sem_pixel: 0, sem_dados: 0, desligado: 0, erro: 0 },
    pendentes: 0,
    falhas: 0,
  },
  listas: { alto_valor: 0, comprador: 0, lead: 0 },
  ultimas: [],
};

/**
 * O Salvar dos ajustes (prova R3): as situações só vão quando a dona mexe nas caixas, com a versão das que ela viu,
 * e o 409 da rota (a lista mudou no meio) aparece no formulário. GET e PATCH falsos: o CI não tem o Bling.
 */
test("Salvar dos ajustes: sem mexer nas caixas as situações não vão; mexendo, vão com a versão, e o 409 aparece no formulário", async ({ page }) => {
  const corpos: unknown[] = [];
  let respostaDoSalvar: { status: number; corpo: unknown } = { status: 200, corpo: { ok: true } };
  await page.route("**/api/integracoes/bling", (rota) => {
    const salvar = rota.request().method() === "PATCH";
    if (salvar) corpos.push(rota.request().postDataJSON());
    const { status, corpo } = salvar ? respostaDoSalvar : { status: 200, corpo: CONECTADA };
    return rota.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  });
  await page.goto("/painel/configuracoes?secao=integracoes", { waitUntil: "load" });
  const bling = page.getByRole("region", { name: /^Bling/ });

  // Só o valor alto: as situações marcadas não vão (gravá-las congelaria o padrão).
  await bling.getByRole("button", { name: "Ajustar" }).click({ timeout: 30_000 });
  await bling.getByLabel("Valor alto em reais").fill("2.000,00");
  await bling.getByRole("button", { name: "Salvar ajustes" }).click();
  await expect.poll(() => corpos.length).toBe(1);
  expect(corpos[0]).toEqual({ high_value: 2000, meta_enabled: true, meta_campaign_id: null });

  // Mexeu nas caixas: as marcadas vão com a versão vista; a rota responde que a lista mudou.
  respostaDoSalvar = { status: 409, corpo: { error: RECARREGUE } };
  await bling.getByRole("button", { name: "Ajustar" }).click();
  await bling.getByText("Em aberto", { exact: true }).click();
  await expect(bling.getByRole("checkbox", { name: "Em aberto" })).toBeChecked();
  await bling.getByRole("button", { name: "Salvar ajustes" }).click();
  await expect.poll(() => corpos.length).toBe(2);
  expect(corpos[1]).toEqual({ sale_situation_ids: [6, 9], situacoes_versao: VERSAO, high_value: 1500, meta_enabled: true, meta_campaign_id: null });
  await expect(bling.getByText(RECARREGUE)).toBeVisible();
});

/** O canal de venda que já manda a compra ao Meta (a Yampi): marcado, o id vai no Salvar; o resumo diz quantos ficaram fora. */
test("canal de venda fora do Meta: marcar o canal manda o id no Salvar, e o resumo conta o canal fora", async ({ page }) => {
  const corpos: unknown[] = [];
  let cartao = CONECTADA;
  await page.route("**/api/integracoes/bling", (rota) => {
    const salvar = rota.request().method() === "PATCH";
    if (salvar) corpos.push(rota.request().postDataJSON());
    return rota.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(salvar ? { ok: true } : cartao) });
  });
  await page.goto("/painel/configuracoes?secao=integracoes", { waitUntil: "load" });
  const bling = page.getByRole("region", { name: /^Bling/ });

  await bling.getByRole("button", { name: "Ajustar" }).click({ timeout: 30_000 });
  await expect(bling.getByText("42 pedidos · último em 18/10 · nº 1532, 1530", { exact: true })).toBeVisible();
  cartao = { ...CONECTADA, ajustes: { ...CONECTADA.ajustes!, canais: [{ ...CONECTADA.ajustes!.canais[0], fora_do_meta: true }] } };
  await bling.getByText("Canal 200000001", { exact: true }).click();
  await expect(bling.getByRole("checkbox", { name: "Canal 200000001" })).toBeChecked();
  await bling.getByRole("button", { name: "Salvar ajustes" }).click();
  await expect.poll(() => corpos.length).toBe(1);
  expect(corpos[0]).toEqual({ high_value: 1500, meta_enabled: true, meta_campaign_id: null, meta_skip_store_ids: [200000001] });
  await expect(bling.getByText("ligado · sem pixel escolhido · 1 canal fora", { exact: true })).toBeVisible();
});

/** O motor releu as situações com o formulário aberto: "Pago" (filha de Atendido) chegou, marcada pelo padrão. */
const COM_PAGO: CartaoBling = {
  ...CONECTADA,
  historico: { lidos: 300, concluido: false },
  ajustes: {
    ...CONECTADA.ajustes!,
    situacoes: [...CONECTADA.ajustes!.situacoes, { id: 30, nome: "Pago", base: 9, conta: true, bloqueada: false }],
    situacoes_versao: "9e8d7c6b5a493827",
  },
};

/**
 * Abre "Ajustar" com o histórico importando (a recarga de fundo de 60 s ligada) e a lista sem "Pago"; a recarga traz a
 * lista com ele. O relógio da página é falso: a recarga dispara na hora. Devolve os corpos do PATCH, que responde `salvo`.
 */
async function abrirERecarregar(page: Page, salvo: { status: number; corpo: unknown }): Promise<{ bling: Locator; corpos: unknown[] }> {
  let cartao: CartaoBling = { ...CONECTADA, historico: { lidos: 300, concluido: false } };
  const corpos: unknown[] = [];
  await page.clock.install();
  await page.route("**/api/integracoes/bling", (rota) => {
    const salvar = rota.request().method() === "PATCH";
    if (salvar) corpos.push(rota.request().postDataJSON());
    const { status, corpo } = salvar ? salvo : { status: 200, corpo: cartao };
    return rota.fulfill({ status, contentType: "application/json", body: JSON.stringify(corpo) });
  });
  await page.goto("/painel/configuracoes?secao=integracoes", { waitUntil: "load" });
  const bling = page.getByRole("region", { name: /^Bling/ });
  await bling.getByRole("button", { name: "Ajustar" }).click({ timeout: 30_000 });
  await expect(bling.getByRole("button", { name: "Salvar ajustes" })).toBeVisible();

  cartao = COM_PAGO;
  const recarga = page.waitForResponse((r) => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/integracoes/bling");
  await page.clock.fastForward(60_000);
  await recarga;
  // O resumo, fora do formulário, já é o do cartão novo; o formulário aberto não ganha a caixa "Pago".
  await expect(bling.getByText("Atendido, Pago", { exact: true })).toBeVisible();
  await expect(bling.getByRole("checkbox", { name: "Pago" })).toHaveCount(0);
  return { bling, corpos };
}

/**
 * A recarga de fundo com o formulário aberto (prova R4): o formulário guarda a lista e a versão de quando abriu. Antes,
 * a recarga trocava a lista e a versão por baixo das caixas marcadas: o Salvar sem mexer congelava o padrão de antes do
 * "Pago" (a venda em "Pago" virava pedido) e o que mexeu ia com a versão nova, sem o 409.
 */
test("recarga de fundo com o formulário aberto: sem mexer nas caixas, as situações não vão", async ({ page }) => {
  const { bling, corpos } = await abrirERecarregar(page, { status: 200, corpo: { ok: true } });
  await bling.getByRole("button", { name: "Salvar ajustes" }).click();
  await expect.poll(() => corpos.length).toBe(1);
  expect(corpos[0]).toEqual({ high_value: 1500, meta_enabled: true, meta_campaign_id: null });
});

test("recarga de fundo com o formulário aberto: mexendo, as marcadas vão com a versão vista e o 409 aparece", async ({ page }) => {
  const { bling, corpos } = await abrirERecarregar(page, { status: 409, corpo: { error: RECARREGUE } });
  await bling.getByText("Em aberto", { exact: true }).click();
  await expect(bling.getByRole("checkbox", { name: "Em aberto" })).toBeChecked();
  await bling.getByRole("button", { name: "Salvar ajustes" }).click();
  await expect.poll(() => corpos.length).toBe(1);
  expect(corpos[0]).toEqual({ sale_situation_ids: [6, 9], situacoes_versao: VERSAO, high_value: 1500, meta_enabled: true, meta_campaign_id: null });
  await expect(bling.getByText(RECARREGUE)).toBeVisible();
});

/** Usuário de execução que morreu antes do afterAll. Mais de uma hora: não pega um run vivo em paralelo. */
async function limparVendedorasVelhas(banco: SupabaseClient): Promise<void> {
  // ponytail: uma página de 1000 — o banco de dev tem dezenas de usuários; paginar quando passar disso.
  const { data, error } = await banco.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const corte = Date.now() - UMA_HORA_MS;
  for (const user of data.users) {
    if (user.email?.startsWith(PREFIXO) && Date.parse(user.created_at) < corte) await apagarVendedora(banco, user.id);
  }
}

/** Ela não cria nada além da membership: some a membership, some o usuário. */
async function apagarVendedora(banco: SupabaseClient, userId: string): Promise<void> {
  const { error } = await banco.from("memberships").delete().eq("user_id", userId);
  if (error) throw new Error(`membership da vendedora ${userId}: ${error.message}`);
  const { error: erroUsuario } = await banco.auth.admin.deleteUser(userId);
  if (erroUsuario) throw new Error(`deleteUser ${userId}: ${erroUsuario.message}`);
}

/**
 * A vendedora: o Bling não está no mapa dela (`lib/auth/modulos.ts`, fechado por padrão) e o
 * guard de módulo recusa antes da rota. Usuário próprio por execução, na loja de QA, com
 * login pela API de Auth (Bearer, como o painel chama): sem tela de login, o teste fica rápido.
 */
test.describe("vendedora no Bling", () => {
  test.skip(
    !TEM_BANCO,
    "Precisa do Supabase de dev: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_ANON_KEY (ou os E2E_*).",
  );

  let banco: SupabaseClient;
  let userId: string | undefined;
  let token = "";

  test.beforeAll(async () => {
    banco = createClient(URL_SUPABASE, CHAVE_SERVICE_ROLE, SEM_SESSAO);
    await limparVendedorasVelhas(banco);

    // A loja em que o usuário de QA cai ao logar: é nela que a vendedora entra.
    const qa = await novoRequest.newContext({ baseURL: BASE_URL, storageState: ESTADO_LOGADO });
    let tenantId: string | null | undefined;
    try {
      const me = await qa.get("/api/auth/me");
      if (!me.ok()) throw new Error(`GET /api/auth/me do usuário de QA respondeu ${me.status()}`);
      tenantId = ((await me.json()) as { tenantId?: string | null }).tenantId;
    } finally {
      await qa.dispose();
    }
    if (!tenantId) throw new Error("o usuário de QA não tem loja");

    const email = `${PREFIXO}${Date.now()}-${randomBytes(3).toString("hex")}@girumo.test`;
    // Aleatória e morre com o usuário: se cair num trace de falha, não abre nada.
    const senha = randomBytes(24).toString("base64url");
    const { data, error } = await banco.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "sem usuário"}`);
    userId = data.user.id;
    const { error: erroMembro } = await banco.from("memberships").insert({
      tenant_id: tenantId,
      user_id: userId,
      role: "seller",
      invited_email: email,
      accepted_at: new Date().toISOString(),
    });
    if (erroMembro) throw new Error(`membership seller: ${erroMembro.message}`);

    const { data: login, error: erroLogin } = await createClient(URL_SUPABASE, CHAVE_ANON, SEM_SESSAO).auth.signInWithPassword({
      email,
      password: senha,
    });
    if (erroLogin || !login.session) throw new Error(`login da vendedora: ${erroLogin?.message ?? "sem sessão"}`);
    token = login.session.access_token;
  });

  test.afterAll(async () => {
    if (userId) await apagarVendedora(banco, userId);
  });

  test("GET /api/integracoes/bling responde 403 para ela", async () => {
    // Contexto sem o estado do dono: quem fala é só o Bearer dela.
    const api = await novoRequest.newContext({ baseURL: BASE_URL });
    try {
      const res = await api.get("/api/integracoes/bling", { headers: { authorization: `Bearer ${token}` } });
      expect(res.status(), "GET /api/integracoes/bling da vendedora").toBe(403);
      // O texto do guard de módulo: um 403 de outra camada não prova que o mapa dela a barra.
      expect(await res.text()).toBe(MENSAGEM_BLOQUEIO);
    } finally {
      await api.dispose();
    }
  });
});
