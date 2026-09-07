/**
 * Lint da casca "Vitrine Aberta" (regras 1 e 9 da spec
 * docs/superpowers/specs/2026-09-07-painel-vitrine-aberta-design.md), só para o
 * painel do cliente e a entrada (login, cadastro, callback). Roda em
 * scripts/check-painel-vitrine.ts (CI) e nos testes.
 *
 * Proxy estático: "Acid em fundo no máximo duas vezes por tela" vira "por
 * arquivo", sem contar variantes de estado (hover:, focus:) do mesmo elemento.
 */
export const PAINEL_ROOTS = [
  "src/app/painel",
  "src/app/painel-vitrine.css",
  "src/components/painel",
  "src/components/auth-shell.tsx",
  "src/app/login",
  "src/app/signup",
  "src/app/auth",
];

const MAX_ACID_BG_PER_FILE = 2;

const FORBIDDEN: ReadonlyArray<readonly [RegExp, string]> = [
  [/\brounded-(?:2xl|3xl)\b/g, "raio acima de 12px; use rounded-xl"],
  [/\bbackdrop-blur(?:-[\w[\]]+)?\b/g, "vidro/blur"],
  [/\bblur-\[/g, "blob desfocado"],
  [/\bbg-gradient-to-\w+\b|(?:linear|radial|conic)-gradient\(/g, "gradiente"],
  [/\bSparkles\b/g, "ícone Sparkles"],
  [/confetti/gi, "confete"],
  [/(?<![\w-])italic\b/g, "itálico editorial"],
  [/\bfont-editorial\b/g, "fonte editorial"],
  [/\b(?:purple|violet)-\d{2,3}\b/g, "roxo"],
];

const ACID_BG = /(?<![\w:-])bg-acid(?:-\d{2,3})?\b/g;

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split(/\r?\n/).length;
}

export function lintPainelSource(relativeFile: string, source: string): string[] {
  const findings: string[] = [];
  for (const [pattern, why] of FORBIDDEN) {
    for (const match of source.matchAll(pattern)) {
      findings.push(`${relativeFile}:${lineAt(source, match.index)}: ${match[0]} (${why})`);
    }
  }
  const acid = [...source.matchAll(ACID_BG)].length;
  if (acid > MAX_ACID_BG_PER_FILE) {
    findings.push(`${relativeFile}: ${acid} fundos Acid (máximo ${MAX_ACID_BG_PER_FILE} por arquivo)`);
  }
  return findings;
}
