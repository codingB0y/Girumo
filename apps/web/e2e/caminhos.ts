import path from "node:path";

/**
 * Sem import de @playwright/test: este arquivo e lido tambem pelo
 * playwright.config.ts, e importar `test` fora de um spec quebra o runner.
 *
 * Fora de `e2e-results`: aquela pasta sobe como artefato publico no CI, e o
 * estado logado e a sessao inteira (refresh_token incluso). Antes so nao subia
 * porque o upload-artifact ignora pasta oculta por padrao.
 */
export const ESTADO_LOGADO = path.join(process.cwd(), "playwright", ".auth", "usuario.json");

/**
 * Estado do SEGUNDO usuario: o admin de plataforma.
 *
 * Sao dois arquivos e nao um porque os dois papeis sao mutuamente exclusivos no
 * que provam. `admin-gate.spec.ts` e `seguranca-impersonation.spec.ts` dependem
 * do usuario de QA NAO ser admin; a cobertura de renderizacao de /admin depende
 * de um que SEJA. Promover o primeiro destruiria os testes de vazamento.
 */
export const ESTADO_ADMIN = path.join(process.cwd(), "playwright", ".auth", "admin.json");

/** Alvo dos testes: dev server local, ou o que E2E_BASE_URL apontar. */
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
