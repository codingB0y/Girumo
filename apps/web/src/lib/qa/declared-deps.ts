import { builtinModules } from "node:module";

/**
 * Pacotes que o codigo importa mas o `package.json` de apps/web nao declara.
 *
 * Existe por causa de 21/08/2026: nenhum deploy subiu por ~4h porque
 * `playwright.config.ts` importava `dotenv` sem a dependencia declarada em
 * apps/web. `dotenv` estava no `package.json` da RAIZ do monorepo, entao local e
 * CI resolviam por hoisting e ficavam verdes; a Vercel builda com Root Directory
 * em apps/web, enxerga so o package.json de la, e quebrava.
 *
 * Essa assimetria e o problema: um build que roda da raiz **nunca** vai flagrar
 * dependencia nao declarada, porque o hoisting sempre a encontra. Nao adianta
 * esperar do `next build` — a checagem tem que ser sobre o texto do codigo
 * contra o texto do package.json, que e o que este modulo faz.
 */

/** Node builtin, com ou sem o prefixo `node:` (`fs` e `node:fs` sao o mesmo). */
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((m) => `node:${m}`)]);

/** Nome que o npm aceita: minusculo, sem espaco, escopo opcional. */
const NOME_NPM = /^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/;

/**
 * Resolvidos pelo BUNDLER, nao por node_modules.
 *
 * `server-only` e `client-only` sao marcadores de fronteira do Next: nao existem
 * em node_modules, ninguem depende deles (`npm ls server-only` volta vazio) e
 * ainda assim `import "server-only"` aparece em dezenas de arquivos de
 * `src/lib`. A prova de que resolvem e o build de producao subir com eles.
 *
 * Sem esta lista o gate acusaria os dois e a "correcao" seria declarar uma
 * dependencia que nao existe — trocando um alarme falso por um package.json
 * mentiroso.
 */
const RESOLVIDOS_PELO_BUNDLER = new Set(["server-only", "client-only"]);

export type ArquivoDeCodigo = { path: string; content: string };

export type PacoteNaoDeclarado = {
  pacote: string;
  /** Um arquivo onde ele aparece — o suficiente para achar e corrigir. */
  exemplo: string;
};

/**
 * Comentario que contenha `from "x"` viraria um pacote fantasma chamado `x`.
 * Aconteceu de verdade na primeira versao desta varredura, com o comentario que
 * documenta o regex de `component-reachability.ts`. Tirar comentario antes de
 * casar e o que separa "importa" de "fala sobre importar".
 *
 * String com `//` dentro (uma URL, tipicamente) e o caso que uma remocao ingenua
 * estraga, entao a varredura anda caractere a caractere e respeita aspas.
 */
export function semComentarios(codigo: string): string {
  let saida = "";
  let i = 0;
  let aspas: string | null = null;

  while (i < codigo.length) {
    const c = codigo[i];
    const proximo = codigo[i + 1];

    if (aspas) {
      saida += c;
      if (c === "\\") {
        saida += proximo ?? "";
        i += 2;
        continue;
      }
      if (c === aspas) aspas = null;
      i += 1;
      continue;
    }

    if (c === '"' || c === "'" || c === "`") {
      aspas = c;
      saida += c;
      i += 1;
      continue;
    }

    if (c === "/" && proximo === "/") {
      while (i < codigo.length && codigo[i] !== "\n") i += 1;
      continue;
    }

    if (c === "/" && proximo === "*") {
      i += 2;
      while (i < codigo.length && !(codigo[i] === "*" && codigo[i + 1] === "/")) i += 1;
      i += 2;
      // Preserva a quebra de linha logica; sem isso duas instrucoes coladas
      // poderiam virar uma so.
      saida += " ";
      continue;
    }

    saida += c;
    i += 1;
  }

  return saida;
}

const IMPORT_PATTERN = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

/**
 * O nome do PACOTE por tras do specifier: `next/font/google` -> `next`,
 * `@supabase/supabase-js/dist` -> `@supabase/supabase-js`.
 *
 * Devolve null para o que nao e pacote de node_modules: caminho relativo, o
 * alias `@/` do projeto e builtin do Node.
 */
export function nomeDoPacote(specifier: string): string | null {
  if (!specifier) return null;
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  if (specifier.startsWith("@/")) return null;
  if (BUILTINS.has(specifier)) return null;
  if (RESOLVIDOS_PELO_BUNDLER.has(specifier)) return null;

  const partes = specifier.split("/");
  // Escopo consome dois segmentos; `@scope` sozinho nao e pacote valido.
  const nome = specifier.startsWith("@")
    ? partes.length >= 2
      ? `${partes[0]}/${partes[1]}`
      : null
    : partes[0] || null;

  // Ultimo filtro: o regex de import casa dentro de template literal e de
  // codigo-em-string, e sem isto sai "pacote" chamado `,` ou `, () => {`. Nome
  // que npm nao aceitaria nao e dependencia — e ruido de parsing.
  return nome && NOME_NPM.test(nome) ? nome : null;
}

/** Todo pacote externo importado, com um arquivo de exemplo para cada. */
export function pacotesImportados(arquivos: ArquivoDeCodigo[]): Map<string, string> {
  const encontrados = new Map<string, string>();

  for (const arquivo of arquivos) {
    const codigo = semComentarios(arquivo.content);
    for (const casamento of codigo.matchAll(IMPORT_PATTERN)) {
      const pacote = nomeDoPacote(casamento[1]);
      if (!pacote) continue;
      if (!encontrados.has(pacote)) encontrados.set(pacote, arquivo.path);
    }
  }

  return encontrados;
}

/**
 * O gate. Ordenado por nome para a mensagem de falha ser estavel entre runs —
 * lista que muda de ordem sozinha atrapalha na hora de comparar duas execucoes.
 */
export function pacotesNaoDeclarados(args: {
  arquivos: ArquivoDeCodigo[];
  declarados: Iterable<string>;
}): PacoteNaoDeclarado[] {
  const declarados = new Set(args.declarados);

  return [...pacotesImportados(args.arquivos)]
    .filter(([pacote]) => !declarados.has(pacote))
    .map(([pacote, exemplo]) => ({ pacote, exemplo }))
    .sort((a, b) => a.pacote.localeCompare(b.pacote));
}
