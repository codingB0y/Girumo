import { defineConfig, devices } from "@playwright/test";
import { ESTADO_LOGADO } from "./e2e/caminhos";

/**
 * Smoke E2E do painel.
 *
 * Existe por causa de 19/08/2026: dois bugs serios passaram por CI, teste
 * unitario e revisao, e so apareceram no uso real. Um deles (#114) era um
 * componente que nenhuma pagina importava — a feature nao estava na tela.
 *
 * O alvo padrao e o dev server local, que desde 11/08 aponta para o Supabase de
 * dev (`HUBFLOW_USE_SUPABASE=1`). Rodar contra preview da Vercel nao funciona:
 * preview nao recebe env de Supabase, entao login nao existe la.
 *
 * O relatorio HTML e a prova exigida pelo quadro para mover card para
 * `no_ar_verificado` — ele carrega screenshot de cada rota conferida.
 */
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const usaServidorExterno = Boolean(process.env.E2E_BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-results",
  // Login em serie: os testes compartilham o mesmo tenant de dev, e convite
  // criado por um teste apareceria na lista do outro.
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "e2e-report", open: "never" }],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    // Loga uma vez e grava o estado; os specs autenticados dependem deste passo.
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], storageState: ESTADO_LOGADO },
      dependencies: ["setup"],
    },
  ],
  webServer: usaServidorExterno
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
