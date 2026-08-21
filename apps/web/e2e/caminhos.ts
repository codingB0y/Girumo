import path from "node:path";

/**
 * Sem import de @playwright/test: este arquivo e lido tambem pelo
 * playwright.config.ts, e importar `test` fora de um spec quebra o runner.
 */
export const ESTADO_LOGADO = path.join(process.cwd(), "e2e-results", ".auth", "usuario.json");

/** Alvo dos testes: dev server local, ou o que E2E_BASE_URL apontar. */
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
