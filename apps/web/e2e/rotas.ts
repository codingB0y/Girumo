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

/**
 * Os PADROES dinamicos (`/painel/pages/[id]`) — o complemento de `coletarRotas`.
 *
 * Existe desde 21/08/2026: a varredura estatica pulava `[id]` por precisar de um
 * id que exista, e o efeito era que as telas de DETALHE — editor de pagina,
 * campanha, cliente no /admin — nao tinham teste nenhum. Sao exatamente as telas
 * onde o produto acontece.
 *
 * Devolve o padrao, nao a URL: quem sabe transformar `[id]` num id que existe e
 * o fixture (ver `fixtures-dinamicas.ts`). A lista sair do filesystem e o que
 * faz o mecanismo valer para tela dinamica FUTURA: rota nova aparece aqui
 * sozinha e, sem fixture registrado, a suite falha — em vez de continuar verde
 * sem cobrir nada, que e como este buraco nasceu.
 *
 * Serve tambem de prova de existencia da rota: um teste que so batesse na URL
 * nao distinguiria "guard barrou" de "rota nao existe" (as duas dao o mesmo
 * redirect), entao quem garante que o arquivo esta la e a varredura, nao o HTTP.
 */
function coletarRotasDinamicas(relativeDir: string): string[] {
  const rotas: string[] = [];

  const walk = (absoluteDir: string, urlPath: string, temDinamico: boolean) => {
    let entries: string[];
    try {
      entries = readdirSync(absoluteDir);
    } catch {
      return;
    }

    if (temDinamico && entries.includes("page.tsx")) rotas.push(urlPath);

    for (const entry of entries) {
      const absolute = path.join(absoluteDir, entry);
      if (!statSync(absolute).isDirectory()) continue;
      // Route group e slot nao viram segmento de URL; a estatica ja os ignora.
      if (entry.startsWith("(") || entry.startsWith("@")) continue;
      walk(absolute, `${urlPath}/${entry}`, temDinamico || entry.startsWith("["));
    }
  };

  walk(path.join(APP_DIR, relativeDir), `/${relativeDir}`, false);

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

/**
 * Padroes dinamicos sob /painel — cobertos com fixture e sessao real.
 */
export const ROTAS_DINAMICAS_DO_PAINEL = coletarRotasDinamicas("painel");

/**
 * Padroes dinamicos sob /admin. Cobertura de GATE, pelo mesmo motivo das
 * estaticas: o usuario de QA e lojista comum, e promove-lo a admin quebraria os
 * seis testes H1 de `seguranca-impersonation.spec.ts`.
 *
 * `/admin/tenants/[id]` e a tela de detalhe de UM cliente — a mais sensivel do
 * conjunto — e ate 21/08/2026 nenhum teste a tocava. O `requireAdmin` vive no
 * layout de /admin, entao ele barra antes do lookup do tenant: um id qualquer
 * exercita o guard sem depender de fixture nenhum.
 */
export const ROTAS_DINAMICAS_DO_ADMIN = coletarRotasDinamicas("admin");
