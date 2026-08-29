import { expect, type Page, test } from "@playwright/test";
import { BASE_URL, ESTADO_LOGADO } from "./caminhos";

export const CREDENCIAIS = {
  email: process.env.E2E_EMAIL ?? "",
  senha: process.env.E2E_PASSWORD ?? "",
};

export const TEM_CREDENCIAIS = Boolean(CREDENCIAIS.email && CREDENCIAIS.senha);

/** Sessao gravada pelo auth.setup.ts e reusada pelos specs autenticados. */
export { ESTADO_LOGADO };

/**
 * Marca a suite como skip quando nao ha credencial no ambiente, em vez de
 * falhar. Sem isso, quem clona o repo ve CI vermelho por falta de segredo e
 * aprende a ignorar a suite — que e como suite de teste morre.
 */
export function exigeCredenciais() {
  test.skip(
    !TEM_CREDENCIAIS,
    "Defina E2E_EMAIL e E2E_PASSWORD (usuario do Supabase de dev) para rodar os testes autenticados.",
  );
}

/**
 * Credenciais do SEGUNDO usuario: o admin de plataforma, usado so pela
 * cobertura de renderizacao de /admin (D.2 da auditoria de 22/08/2026).
 *
 * Ele precisa existir em `public.platform_admins` do Supabase de DEV — a
 * autorizacao e por identidade (`admin-guard.ts:36`), nunca por e-mail. E existe
 * so em dev: replicar em prod seria criar uma conta de super-admin permanente
 * cuja senha vive num secret de CI.
 */
export const CREDENCIAIS_ADMIN = {
  email: process.env.E2E_ADMIN_EMAIL ?? "",
  senha: process.env.E2E_ADMIN_PASSWORD ?? "",
};

export const TEM_CREDENCIAIS_ADMIN = Boolean(CREDENCIAIS_ADMIN.email && CREDENCIAIS_ADMIN.senha);

export function exigeCredenciaisAdmin() {
  test.skip(
    !TEM_CREDENCIAIS_ADMIN,
    "Defina E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD (usuario de dev presente em platform_admins) " +
      "para rodar a cobertura de renderizacao de /admin.",
  );
}

/**
 * Login pela tela real, para os specs que precisam da sessao NASCENDO ali —
 * o de ciclo de sessao, por exemplo, que derruba a sessao no meio. Os demais
 * reusam o estado do setup e nao chamam isto.
 */
export async function entrar(page: Page, destino = "/painel") {
  await page.goto(`/login?next=${encodeURIComponent(destino)}`);
  await page.getByPlaceholder("voce@email.com").fill(CREDENCIAIS.email);
  await page.getByPlaceholder("Sua senha").fill(CREDENCIAIS.senha);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
  await expect(page.locator(".pn-root")).toBeVisible();
}

/**
 * Erro de runtime do Next aparece como overlay/texto na pagina; sem checar
 * isso, "a rota respondeu 200" convive com a tela quebrada.
 */
export async function semErroDeRuntime(page: Page) {
  await expect(page.getByText("Application error")).toHaveCount(0);
  await expect(page.getByText("Unhandled Runtime Error")).toHaveCount(0);
}

/**
 * Coleta respostas 5xx da propria app durante a navegacao.
 *
 * `pageerror` so pega excecao de JS: uma rota de API que devolve 500 e cujo
 * chamador degrada em silencio nao levanta nada, e a tela passa no teste
 * quebrada por dentro. Foi assim que o GET /api/notifications ficou dando 500
 * em todo carregamento do /painel sem ninguem notar (21/08/2026).
 */
const TOLERADAS = [
  // /painel/conectar provisiona a instancia na Evolution ao montar quando o
  // tenant ainda nao tem uma. Nem o CI nem a maquina local alcancam a Evolution,
  // entao o POST devolve 502 — ambiente, nao regressao. Se um dia o ambiente de
  // teste ganhar uma Evolution (ou um mock), apague esta entrada.
  { metodo: "POST", rota: "/api/instances", status: 502 },
  // Mesma causa, outro gatilho: com a instancia CONECTADA, /painel/conectar
  // importa os grupos ao montar. Sem Evolution no ambiente, 502. So aparece em
  // ambiente que tenha numero conectado — em dev vazio esta linha nunca e usada.
  { metodo: "POST", rota: "/api/groups/sync", status: 502 },
];

export function coletarFalhasDeApi(page: Page): string[] {
  const falhas: string[] = [];

  page.on("response", (resposta) => {
    if (resposta.status() < 500) return;

    // So o que a propria app serve — 5xx de terceiro nao e regressao nossa.
    // Ancorado no baseURL, e nao em page.url(), que ainda e about:blank quando
    // chega a resposta do primeiro documento.
    if (!resposta.url().startsWith(BASE_URL)) return;

    const url = new URL(resposta.url());
    const metodo = resposta.request().method();

    // Toleradas: dependem de servico externo que nao existe no ambiente de
    // teste. A lista e por (metodo, rota, status) de proposito — tolerar "5xx
    // nessa rota" esconderia o proximo bug de verdade nela.
    const tolerada = TOLERADAS.some(
      (t) => t.metodo === metodo && t.rota === url.pathname && t.status === resposta.status(),
    );
    if (tolerada) return;

    falhas.push(`${resposta.status()} ${metodo} ${url.pathname}${url.search}`);
  });

  return falhas;
}

/**
 * Arma a espera pelo fetch que o shell do painel faz ao montar.
 *
 * Precisa ser chamado ANTES do `goto`. Sem uma ancora assim, `networkidle`
 * sozinho nao serve: em dev ha uma pausa de mais de 500ms entre o `load` e a
 * hidratacao, e o Playwright chama esse silencio de "rede ociosa" — o teste
 * termina antes de a app ter pedido qualquer dado, e passa por isso.
 *
 * Resolve com null se a chamada nao vier (o sino saiu do shell, por exemplo),
 * para virar tempo perdido e nao vermelho falso.
 */
export function esperarShellBuscarDados(page: Page): Promise<unknown> {
  return page
    .waitForResponse((r) => new URL(r.url()).pathname === "/api/notifications", {
      timeout: 15_000,
    })
    .catch(() => null);
}
