/**
 * Lint da casca "Vitrine Aberta" (regras 1 e 9 da spec
 * docs/superpowers/specs/2026-09-07-painel-vitrine-aberta-design.md), só para o
 * painel do cliente e a entrada (login, cadastro, callback). Roda em
 * scripts/check-painel-vitrine.ts (CI) e nos testes.
 *
 * Proxy estático: "Acid em fundo no máximo duas vezes por tela" vira "por
 * arquivo". Variantes de estado (hover:, focus:...) do mesmo elemento não
 * contam; variantes de tamanho e tema (md:, dark:) contam, porque são fundos.
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
  [/\brounded-(?:[trbles]{1,2}-)?(?:2xl|3xl)\b/g, "raio acima de 12px; use rounded-xl"],
  [/\bbackdrop-blur(?:-[\w[\]]+)?\b/g, "vidro/blur"],
  [/\bblur-\[/g, "blob desfocado"],
  [/\bbg-gradient-to-\w+\b|(?:linear|radial|conic)-gradient\(/g, "gradiente"],
  [/\bSparkles\b/g, "ícone Sparkles"],
  [/confetti/gi, "confete"],
  [/(?<![\w-])italic\b/g, "itálico editorial"],
  [/\bfont-editorial\b/g, "fonte editorial"],
  [/\b(?:purple|violet)-\d{2,3}\b/g, "roxo"],
];

const ACID_BG = /(?<![\w-])((?:[\w-]+:)*)bg-acid(?:-\d{2,3})?\b/g;
const STATE_VARIANTS = new Set(["hover", "focus", "focus-visible", "focus-within", "active", "disabled", "group-hover"]);

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split(/\r?\n/).length;
}

function isStateVariant(prefixes: string): boolean {
  return prefixes.split(":").some((variant) => STATE_VARIANTS.has(variant));
}

const SKELETON = /\bpn-skeleton\b/;
const ANUNCIADO = /role="status"|aria-hidden/;

export function lintPainelSource(relativeFile: string, source: string): string[] {
  const findings: string[] = [];
  for (const [pattern, why] of FORBIDDEN) {
    for (const match of source.matchAll(pattern)) {
      findings.push(`${relativeFile}:${lineAt(source, match.index)}: ${match[0]} (${why})`);
    }
  }
  const acid = [...source.matchAll(ACID_BG)].filter((match) => !isStateVariant(match[1])).length;
  if (acid > MAX_ACID_BG_PER_FILE) {
    findings.push(`${relativeFile}: ${acid} fundos Acid (máximo ${MAX_ACID_BG_PER_FILE} por arquivo)`);
  }
  // Esqueleto sem `role="status"` não avisa a quem não vê que a tela está
  // esperando resposta; sem `aria-hidden` num placeholder decorativo, o leitor
  // encontra uma caixa muda. Proxy POR ARQUIVO, igual ao dos fundos Acid: não
  // pega um esqueleto anunciado e outro mudo no mesmo arquivo, mas pega o caso
  // que aparece de verdade — tela nova com esqueleto que ninguém marcou.
  // Só .tsx: no CSS `.pn-skeleton` é a definição da classe, não um uso.
  if (relativeFile.endsWith(".tsx") && SKELETON.test(source) && !ANUNCIADO.test(source)) {
    findings.push(`${relativeFile}: pn-skeleton sem role="status" nem aria-hidden`);
  }
  return findings;
}

/**
 * globals.css mistura a casca antiga (`.pn-*`) com landing e marketing, que
 * seguem outras regras. Mantém só os blocos cujo seletor tem `.pn-`, trocando o
 * resto por linhas em branco pra preservar a numeração.
 */
export function onlyPnBlocks(css: string): string {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (block, selector: string) =>
    selector.includes(".pn-") ? block : block.replace(/[^\r\n]/g, " "),
  );
}
