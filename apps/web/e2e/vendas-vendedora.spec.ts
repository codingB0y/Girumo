import { randomBytes, randomInt } from "node:crypto";

import { expect, request as novoRequest, test, type Page, type Response as RespostaPw } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { MENSAGEM_BLOQUEIO } from "../src/lib/auth/modulos";
import { BASE_URL, ESTADO_LOGADO } from "./caminhos";
import { entrar, TEM_CREDENCIAIS } from "./sessao-helpers";

/**
 * A vendedora de ponta a ponta (spec 2026-10-07 §7): entra → só vê Vendas →
 * registra venda com dois produtos → a venda aparece em Minhas vendas → a API do
 * dono responde 403 para ela. O dono libera Postar → a API de postar responde
 * na hora, o upload de mídia funciona sem acesso dela ao banco, e Disparos
 * aparece no menu ao recarregar, sem relogar.
 *
 * Usuário próprio, criado por execução: logout ou troca de módulo de um run não
 * derruba outro (local e CI dividem o banco de dev). Entra na loja de QA (a do
 * usuário E2E) como `seller` e sai no afterAll levando pedidos, contato criado
 * pela venda, mídia, membership e usuário. Resto de execução que morreu no meio
 * é varrido no começo da próxima (mais de uma hora de idade). A senha é
 * aleatória e morre com o usuário: se cair no trace de uma falha, não abre nada.
 *
 * Depende da loja de QA ter ao menos uma campanha: sem ela Disparos mostra o
 * "Falta um passo" no lugar do compositor (mesma premissa de painel-vitrine-disparos).
 */

const URL_SUPABASE = process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const CHAVE_SERVICE_ROLE = process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const TEM_BANCO = Boolean(URL_SUPABASE && CHAVE_SERVICE_ROLE);

const PREFIXO = "e2e-vendedora-";
const UMA_HORA_MS = 3_600_000;
/** `MEDIA_BUCKET` de src/lib/media-mime.ts. */
const BUCKET = "uploads";
const CLIENTE = "Cliente E2E Vendedora";
const DESKTOP = { width: 1280, height: 900 };
const CELULAR = { width: 390, height: 844 };
/**
 * 403 que não é o guard de módulo: o DevModeBanner (NEXT_PUBLIC_APP_ENV=development, que é
 * o que o CI sobe) lista as lojas para o admin de plataforma em toda página, inclusive o
 * /login — e responde 403 a qualquer outro usuário, o de QA também.
 */
const FORA_DO_GUARD = new Set(["/api/admin/tenants/list"]);
/** PNG 1×1: o menor arquivo que o `register` aceita como imagem. */
const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

type Vendedora = { userId: string; email: string; senha: string; tenantId: string; criadaEm: string; telefone: string };

function bancoDeDev(): SupabaseClient {
  return createClient(URL_SUPABASE, CHAVE_SERVICE_ROLE, { auth: { autoRefreshToken: false, persistSession: false } });
}

/** A loja em que o usuário de QA cai ao logar: é nela que a vendedora entra. */
async function lojaDeQa(): Promise<string> {
  const api = await novoRequest.newContext({ baseURL: BASE_URL, storageState: ESTADO_LOGADO });
  try {
    const res = await api.get("/api/auth/me");
    if (!res.ok()) throw new Error(`GET /api/auth/me do usuário de QA respondeu ${res.status()}`);
    const me = (await res.json()) as { tenantId?: string | null };
    if (!me.tenantId) throw new Error("o usuário de QA não tem loja");
    return me.tenantId;
  } finally {
    await api.dispose();
  }
}

async function criarVendedora(banco: SupabaseClient, tenantId: string): Promise<Vendedora> {
  const email = `${PREFIXO}${Date.now()}-${randomBytes(3).toString("hex")}@girumo.test`;
  const senha = randomBytes(24).toString("base64url");
  const { data, error } = await banco.auth.admin.createUser({ email, password: senha, email_confirm: true });
  if (error || !data.user) throw new Error(`createUser: ${error?.message ?? "sem usuário"}`);
  const userId = data.user.id;
  const { error: erroMembro } = await banco.from("memberships").insert({
    tenant_id: tenantId,
    user_id: userId,
    role: "seller",
    invited_email: email,
    accepted_at: new Date().toISOString(),
  });
  if (erroMembro) {
    await banco.auth.admin.deleteUser(userId);
    throw new Error(`membership seller: ${erroMembro.message}`);
  }
  // DDD 11 + 9 + oito dígitos sorteados: número que nenhum contato da loja de QA tem.
  const telefone = `119${String(randomInt(100_000_000)).padStart(8, "0")}`;
  // `created_at` do Auth (relógio do banco): é o corte da limpeza de contatos.
  return { userId, email, senha, tenantId, criadaEm: data.user.created_at, telefone };
}

/**
 * Tudo que a vendedora deixou, e por fim o usuário. Lê as chaves antes de apagar
 * qualquer coisa: se uma etapa falha, as linhas que apontam para o resto ainda
 * existem e a próxima varredura recomeça do zero, sem contato nem objeto órfão.
 */
async function limparVendedora(banco: SupabaseClient, userId: string, criadaEm: string): Promise<void> {
  const { data: membros, error: erroMembros } = await banco.from("memberships").select("tenant_id").eq("user_id", userId);
  if (erroMembros) throw new Error(`memberships da vendedora: ${erroMembros.message}`);
  for (const { tenant_id: tenantId } of (membros ?? []) as { tenant_id: string }[]) {
    const { data: pedidos, error: erroPedidos } = await banco
      .from("orders")
      .select("lead_id")
      .eq("tenant_id", tenantId)
      .eq("created_by", userId);
    if (erroPedidos) throw new Error(`pedidos da vendedora: ${erroPedidos.message}`);
    const leads = [
      ...new Set(((pedidos ?? []) as { lead_id: string | null }[]).map((p) => p.lead_id).filter((id): id is string => id !== null)),
    ];
    const { data: midias, error: erroMidias } = await banco
      .from("uploads")
      .select("metadata")
      .eq("tenant_id", tenantId)
      .eq("created_by", userId);
    if (erroMidias) throw new Error(`mídias da vendedora: ${erroMidias.message}`);
    const caminhos = ((midias ?? []) as { metadata: { storage_path?: string } | null }[])
      .map((m) => m.metadata?.storage_path)
      .filter((c): c is string => Boolean(c));

    if (leads.length > 0) {
      // Só o contato que a venda criou: número que já existia na loja antes do teste fica.
      const { error } = await banco.from("leads").delete().eq("tenant_id", tenantId).in("id", leads).gte("created_at", criadaEm);
      if (error) throw new Error(`contatos da venda: ${error.message}`);
    }
    if (caminhos.length > 0) {
      const { error } = await banco.storage.from(BUCKET).remove(caminhos);
      if (error) throw new Error(`objetos da vendedora: ${error.message}`);
    }
    const { error: erroApagarPedidos } = await banco.from("orders").delete().eq("tenant_id", tenantId).eq("created_by", userId);
    if (erroApagarPedidos) throw new Error(`apagar pedidos da vendedora: ${erroApagarPedidos.message}`);
    const { error: erroApagarMidias } = await banco.from("uploads").delete().eq("tenant_id", tenantId).eq("created_by", userId);
    if (erroApagarMidias) throw new Error(`apagar mídias da vendedora: ${erroApagarMidias.message}`);
    const { error: erroMembro } = await banco.from("memberships").delete().eq("tenant_id", tenantId).eq("user_id", userId);
    if (erroMembro) throw new Error(`membership da vendedora: ${erroMembro.message}`);
  }
  const { error } = await banco.auth.admin.deleteUser(userId);
  if (error) throw new Error(`deleteUser: ${error.message}`);
}

/** Resto de execução que morreu antes do afterAll. Mais de uma hora: não pega um run vivo em paralelo. */
async function limparVendedorasVelhas(banco: SupabaseClient): Promise<void> {
  // ponytail: uma página de 1000 — o banco de dev tem dezenas de usuários; paginar quando passar disso.
  const { data, error } = await banco.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`listUsers: ${error.message}`);
  const corte = Date.now() - UMA_HORA_MS;
  for (const user of data.users) {
    if (user.email?.startsWith(PREFIXO) && Date.parse(user.created_at) < corte) {
      try {
        await limparVendedora(banco, user.id, user.created_at);
      } catch (erro) {
        throw new Error(`varredura da vendedora ${user.id} (${user.email}): ${(erro as Error).message}`, { cause: erro });
      }
    }
  }
}

async function entrarComoVendedora(page: Page, vendedora: Vendedora): Promise<void> {
  // `next=/painel` de propósito: quem leva para Vendas é a guarda da página.
  await entrar(page, { email: vendedora.email, senha: vendedora.senha }, "/painel");
  await page.waitForURL((url) => url.pathname === "/painel/vendas", { timeout: 30_000 });
}

test.describe("vendedora: só o que o dono liberou", () => {
  test.describe.configure({ mode: "serial", timeout: 90_000 });
  test.skip(
    !TEM_CREDENCIAIS || !TEM_BANCO,
    "Precisa do usuário de QA (E2E_EMAIL/E2E_PASSWORD) e da service role de dev (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY).",
  );

  let banco: SupabaseClient;
  let vendedora: Vendedora | undefined;
  let page: Page;
  /** 403 que a casca ou a tela dela receberam: tem que ficar vazio (spec §1). */
  const proibidas: string[] = [];
  /** Websocket de Realtime aberto: a RLS não entrega nada a ela, então não pode assinar. */
  const realtime: string[] = [];

  function ela(): Vendedora {
    if (!vendedora) throw new Error("o beforeAll não criou a vendedora");
    return vendedora;
  }

  test.beforeAll(async ({ browser }) => {
    banco = bancoDeDev();
    await limparVendedorasVelhas(banco);
    vendedora = await criarVendedora(banco, await lojaDeQa());
    const contexto = await browser.newContext({ baseURL: BASE_URL, viewport: DESKTOP });
    page = await contexto.newPage();
    // `page.request` não emite "response": os 403 de propósito do teste da API não entram aqui.
    page.on("response", (resposta) => {
      const url = new URL(resposta.url());
      if (resposta.status() === 403 && url.pathname.startsWith("/api/") && !FORA_DO_GUARD.has(url.pathname)) {
        proibidas.push(`${resposta.request().method()} ${url.pathname}`);
      }
    });
    page.on("websocket", (ws) => {
      // Sem a query: ela carrega a apikey.
      if (ws.url().includes("/realtime/")) realtime.push(ws.url().split("?")[0]);
    });
    await entrarComoVendedora(page, vendedora);
  });

  // A `page` é do contexto dela, criado à mão: o screenshot/trace das fixtures não a cobre.
  test.afterEach(async () => {
    const testInfo = test.info();
    if (testInfo.status === testInfo.expectedStatus) return;
    await testInfo.attach("proibidas", { body: JSON.stringify(proibidas, null, 2), contentType: "application/json" });
    if (page && !page.isClosed()) {
      await testInfo.attach("tela-da-vendedora", { body: await page.screenshot(), contentType: "image/png" });
    }
  });

  test.afterAll(async () => {
    await page?.context().close();
    if (vendedora) await limparVendedora(banco, vendedora.userId, vendedora.criadaEm);
  });

  test("entra direto em Vendas e a casca só mostra o que é dela", async () => {
    await expect(page).toHaveURL(/\/painel\/vendas$/);
    const barra = page.getByTestId("painel-barra");
    const modulos = barra.getByRole("navigation", { name: "Módulos" });
    await expect(modulos.getByRole("link")).toHaveText(["Vendas"]);
    await expect(modulos.getByRole("link", { name: "Vendas" })).toHaveAttribute("aria-current", "page");
    await expect(barra.getByText("Vendedora", { exact: true })).toBeVisible();
    await expect(barra.getByRole("button", { name: "Sair", exact: true })).toBeVisible();
    await expect(modulos.getByRole("button", { name: "Mais" })).toHaveCount(0);
    await expect(barra.getByTestId("painel-postar-barra")).toHaveCount(0);
    await expect(barra.getByRole("button", { name: /^Notificações/ })).toHaveCount(0);
    await expect(barra.getByRole("link", { name: /seu número$/ })).toHaveCount(0);
    await expect(barra.getByRole("link", { name: /Configurações da loja$/ })).toHaveCount(0);

    await page.setViewportSize(CELULAR);
    const baixo = page.getByTestId("painel-mobile-nav");
    await expect(baixo.getByRole("link")).toHaveText(["Vendas"]);
    await expect(baixo.getByTestId("painel-postar")).toHaveCount(0);
    await expect(baixo.getByRole("button", { name: "Mais" })).toHaveCount(0);
    await page.setViewportSize(DESKTOP);
  });

  test("registra venda com dois produtos e ela aparece em Minhas vendas", async () => {
    const t = ela().telefone;
    await page.getByLabel("WhatsApp do cliente").fill(`(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    // exact: o `role="status"` da página repete a frase com ponto final, só para leitor de tela.
    await expect(page.getByText("Nenhum cliente com esse número", { exact: true })).toBeVisible();
    await page.getByLabel(/Nome do cliente/).fill(CLIENTE);

    const produto1 = page.getByRole("group", { name: "Produto 1" });
    await produto1.getByLabel("Nome do produto").fill("Vestido E2E");
    await produto1.getByLabel("Qtd").fill("2");
    await produto1.getByLabel("Valor un. (R$)").fill("119,90");
    await page.getByRole("button", { name: "Adicionar produto" }).click();
    const produto2 = page.getByRole("group", { name: "Produto 2" });
    await produto2.getByLabel("Nome do produto").fill("Cropped E2E");
    await produto2.getByLabel("Valor un. (R$)").fill("49,90");
    await expect(page.getByTestId("vendas-total")).toHaveText(/R\$\s289,70/);

    await page.getByRole("button", { name: /^Registrar venda · R\$\s289,70$/ }).click();
    const confirmacao = page.getByTestId("venda-registrada");
    await expect(confirmacao).toContainText("Venda registrada");
    await expect(confirmacao).toContainText(CLIENTE);

    const minhas = page.getByRole("region", { name: /^Minhas vendas/ });
    const linha = minhas.getByRole("listitem").filter({ hasText: CLIENTE });
    await expect(linha).toContainText("Vestido E2E ×2 · Cropped E2E ×1");
    await expect(linha).toContainText(/R\$\s289,70/);
    await expect(linha.getByRole("button", { name: `Corrigir venda de ${CLIENTE}` })).toBeVisible();

    // A prova visual do quadro: vai para o e2e-report (local e artefato do CI).
    await test.info().attach("vendas-1280", { body: await page.screenshot(), contentType: "image/png" });
    await page.setViewportSize(CELULAR);
    await page.evaluate(() => window.scrollTo(0, 0));
    await test.info().attach("vendas-390-topo", { body: await page.screenshot(), contentType: "image/png" });
    await minhas.scrollIntoViewIfNeeded();
    await test.info().attach("vendas-390-minhas", { body: await page.screenshot(), contentType: "image/png" });
    await page.setViewportSize(DESKTOP);
  });

  test("as rotas do dono respondem 403 para ela; as de vendas, 200", async () => {
    // O contraste: a sessão vale (200), então o 403 é o guard, não falta de login.
    expect((await page.request.get("/api/vendas")).status()).toBe(200);
    const pedidos = await page.request.get("/api/orders");
    expect(pedidos.status()).toBe(403);
    // O texto do guard de módulo: um 403 de outra origem (permissão de papel, CSRF) não passa.
    expect(await pedidos.text()).toBe(MENSAGEM_BLOQUEIO);
    // Sem `postar`, nem o upload pelo cookie (findMembershipTenantId com guard, PR 3).
    const preparo = await page.request.post("/api/media/prepare", { data: { mime: "image/png", kind: "media" } });
    expect(preparo.status()).toBe(403);
    // Funil de anúncios (spec 2026-10-10 §7): rota nova, fora do mapa da vendedora.
    const anuncios = await page.request.get("/api/resultados/anuncios");
    expect(anuncios.status()).toBe(403);
    expect(await anuncios.text()).toBe(MENSAGEM_BLOQUEIO);
    // Gaveta "Ver quem" (spec 2026-10-10 §7): nomes e telefones de compradores, fora do mapa dela.
    const pessoas = await page.request.get("/api/resultados/anuncios/pessoas");
    expect(pessoas.status()).toBe(403);
    expect(await pessoas.text()).toBe(MENSAGEM_BLOQUEIO);
    // Gasto de anúncio (funil de anúncios, PR 7): dado de caixa, fora do mapa dela em todo verbo.
    const gasto = await page.request.get("/api/anuncios/gasto");
    expect(gasto.status()).toBe(403);
    expect(await gasto.text()).toBe(MENSAGEM_BLOQUEIO);
    const lancar = await page.request.post("/api/anuncios/gasto", {
      data: { utm_campaign: "C1", amount: 100, starts_on: "2026-10-01", ends_on: "2026-10-10" },
    });
    expect(lancar.status()).toBe(403);
    expect(await lancar.text()).toBe(MENSAGEM_BLOQUEIO);
    const editar = await page.request.patch("/api/anuncios/gasto/00000000-0000-4000-8000-000000000000", {
      data: { utm_campaign: "C1", amount: 100, starts_on: "2026-10-01", ends_on: "2026-10-10" },
    });
    expect(editar.status()).toBe(403);
    expect(await editar.text()).toBe(MENSAGEM_BLOQUEIO);
    const apagar = await page.request.delete("/api/anuncios/gasto/00000000-0000-4000-8000-000000000000");
    expect(apagar.status()).toBe(403);
    expect(await apagar.text()).toBe(MENSAGEM_BLOQUEIO);
  });

  test("as rotas da integração do site respondem 403 para ela", async () => {
    // Mapa de módulos fechado por padrão (lib/auth/modulos.ts): rota nova que
    // ninguém pôs no mapa já nasce fora do acesso dela.
    const leitura = await page.request.get("/api/integracoes/site");
    expect(leitura.status(), "GET /api/integracoes/site").toBe(403);
    expect(await leitura.text()).toBe(MENSAGEM_BLOQUEIO);
    // O corpo é válido (uuid zerado) para o 403 vir do guard e não de uma validação.
    const chave = await page.request.post("/api/integracoes/site/chave", {
      data: { tracked_link_id: "00000000-0000-0000-0000-000000000000" },
    });
    expect(chave.status(), "POST /api/integracoes/site/chave").toBe(403);
    expect(await chave.text()).toBe(MENSAGEM_BLOQUEIO);
    // Só o status no /teste: um 403 de outra camada (CSRF, papel) também prova que ela não passa,
    // como no `/api/media/prepare` do teste vizinho.
    const teste = await page.request.post("/api/integracoes/site/teste");
    expect(teste.status(), "POST /api/integracoes/site/teste").toBe(403);
  });

  test("página fora do acesso mostra o bloqueio e volta para Vendas", async () => {
    await page.goto("/painel/contatos");
    await expect(page.getByRole("heading", { name: "Essa área não foi liberada pra você" })).toBeVisible();
    await expect(page.getByTestId("contatos-lista")).toHaveCount(0);
    await page.getByRole("link", { name: "Voltar pra Vendas" }).click();
    await expect(page).toHaveURL(/\/painel\/vendas$/);
  });

  test("dono libera Postar: a API responde na hora, o upload funciona e Disparos aparece ao recarregar", async () => {
    const v = ela();
    const { error } = await banco.from("memberships").update({ modules: ["postar"] }).eq("tenant_id", v.tenantId).eq("user_id", v.userId);
    expect(error).toBeNull();

    // Sem recarregar nem relogar: o guard lê `modules` a cada chamada (spec §6).
    expect((await page.request.get("/api/campanhas")).status()).toBe(200);

    await page.reload();
    const barra = page.getByTestId("painel-barra");
    await expect(barra.getByRole("navigation", { name: "Módulos" }).getByRole("link")).toHaveText(["Vendas", "Disparos"]);
    await expect(barra.getByTestId("painel-postar-barra")).toBeVisible();

    // O upload de verdade, pelo navegador dela: token assinado no prepare, sem a RLS de
    // storage.objects (que exclui a vendedora desde o PR 2). Sem o Task 10, o toast de erro.
    await page.goto("/painel/disparos");
    // O h1 só aparece depois que as campanhas chegaram (antes é o esqueleto), então daqui
    // em diante `semCampanha` já é o dado real. O cartão "Falta um passo pra postar"
    // também aparece sem WhatsApp conectado, com campanha e compositor: o que derruba o
    // compositor é só o passo da campanha pendente.
    await expect(page.getByRole("heading", { level: 1, name: "Disparos" })).toBeVisible({ timeout: 20_000 });
    await expect(
      page.getByRole("listitem").filter({ hasText: "Criar uma campanha com grupos" }).getByRole("link", { name: "Criar campanha" }),
      'a loja de QA precisa de ao menos uma campanha: sem ela Disparos mostra "Falta um passo pra postar" no lugar do compositor',
    ).toHaveCount(0);
    await expect(page.getByPlaceholder("Digite sua mensagem...")).toBeVisible({ timeout: 20_000 });

    // Cada etapa do upload com o status dela: a falha aponta qual das três quebrou. As
    // esperas nascem antes da escolha do arquivo e são lidas em ordem — com prepare falho,
    // o erro é o do prepare, não o timeout do PUT que nunca saiu.
    const ehPost = (caminho: string) => (r: RespostaPw) => r.request().method() === "POST" && new URL(r.url()).pathname === caminho;
    const preparo = page.waitForResponse(ehPost("/api/media/prepare"), { timeout: 20_000 });
    // `uploadToSignedUrl` (storage-js): PUT em /storage/v1/object/upload/sign/<bucket>/<path>?token=…
    const envio = page.waitForResponse(
      (r) => r.request().method() === "PUT" && r.url().includes("/storage/v1/object/upload/sign/"),
      { timeout: 20_000 },
    );
    const registro = page.waitForResponse(ehPost("/api/media/register"), { timeout: 20_000 });
    // Quem sobra esperando depois de uma etapa falha não vira rejeição solta.
    for (const espera of [preparo, envio, registro]) espera.catch(() => {});
    const escolha = page.waitForEvent("filechooser");
    await page.getByRole("button", { name: "Imagem", exact: true }).click();
    await (await escolha).setFiles({ name: "e2e-vendedora.png", mimeType: "image/png", buffer: PNG_1X1 });
    expect((await preparo).status(), "prepare (POST /api/media/prepare)").toBe(200);
    const put = await envio;
    expect(put.ok(), `upload assinado (PUT no Storage) respondeu ${put.status()}`).toBe(true);
    expect((await registro).status(), "register (POST /api/media/register)").toBe(201);
    await expect(page.getByRole("button", { name: "Remover mídia" })).toBeVisible({ timeout: 20_000 });
  });

  test("a casca dela não chamou rota fora do acesso nem abriu Realtime", async () => {
    expect(proibidas, "chamadas que o guard recusou durante a navegação dela").toEqual([]);
    expect(realtime, "canal de Realtime aberto para a vendedora").toEqual([]);
  });
});
