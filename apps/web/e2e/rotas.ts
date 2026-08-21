import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * O Playwright transpila estes arquivos para CJS (o package.json nao e
 * "type": "module"), entao `import.meta.url` nao existe aqui. A raiz sai de
 * subir a partir do cwd ate achar src/app, o que funciona tanto rodando de
 * apps/web quanto da raiz do monorepo via workspace.
 */
function acharAppDir(): string {
  let atual = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    const candidato = path.join(atual, "src", "app");
    if (existsSync(path.join(candidato, "painel"))) return candidato;
    const acima = path.join(atual, "apps", "web", "src", "app");
    if (existsSync(path.join(acima, "painel"))) return acima;
    atual = path.dirname(atual);
  }
  throw new Error(`Nao achei src/app subindo a partir de ${process.cwd()}`);
}

const APP_DIR = acharAppDir();

/**
 * As rotas saem do filesystem, nao de uma lista escrita a mao: rota nova entra
 * no smoke sozinha. Lista manual envelhece e a rota nova nasce sem cobertura —
 * que e exatamente como um buraco de QA comeca.
 */
function coletarRotas(relativeDir: string): string[] {
  const rotas: string[] = [];

  const walk = (absoluteDir: string, urlPath: string) => {
    let entries: string[];
    try {
      entries = readdirSync(absoluteDir);
    } catch {
      return;
    }

    if (entries.includes("page.tsx")) rotas.push(urlPath || "/");

    for (const entry of entries) {
      const absolute = path.join(absoluteDir, entry);
      if (!statSync(absolute).isDirectory()) continue;
      // Rota dinamica precisa de um id que exista; fica fora do smoke generico.
      if (entry.startsWith("[") || entry.startsWith("(") || entry.startsWith("@")) continue;
      walk(absolute, `${urlPath}/${entry}`);
    }
  };

  walk(path.join(APP_DIR, relativeDir), `/${relativeDir}`);

  // Lista vazia passaria como suite verde sem testar nada — o pior desfecho
  // possivel para um smoke. Melhor estourar aqui.
  if (rotas.length === 0) {
    throw new Error(`Nenhuma rota encontrada em ${relativeDir}; a varredura quebrou.`);
  }

  return rotas.sort();
}

/** Toda rota estatica sob /painel — as que o middleware protege. */
export const ROTAS_DO_PAINEL = coletarRotas("painel");

/**
 * Toda rota estatica sob /admin — o painel de PLATAFORMA.
 *
 * Ficou fora do smoke ate 21/08/2026: eram 13 telas com zero cobertura, e
 * `page.tsx` quebrado ali passava inteiro pelo CI. E a superficie mais sensivel
 * do produto (billing, tenants, impersonation), entao era o pior lugar possivel
 * para nao ter teste.
 *
 * Ao contrario de /painel, estas rotas NAO sao exercidas logadas: o usuario de
 * QA e um lojista comum e nao esta em `platform_admins`. Promove-lo destruiria
 * os testes H1 de seguranca-impersonation.spec.ts, que dependem exatamente dele
 * NAO ser admin. Por isso a cobertura aqui e de gate (quem nao pode, nao entra),
 * nao de renderizacao.
 */
export const ROTAS_DO_ADMIN = coletarRotas("admin");

/** Publicas: tem que responder sem sessao nenhuma. */
export const ROTAS_PUBLICAS = ["/", "/login", "/signup"];
