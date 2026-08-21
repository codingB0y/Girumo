import { defineConfig, globalIgnores } from "eslint/config";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = defineConfig([
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "nextjs-claude-code-starter/**",
    // Artefatos do Playwright. O trace viewer traz bundles minificados que
    // rendem centenas de warnings; sem isto, rodar os E2E antes do lint deixa
    // o lint vermelho por lixo de execucao.
    "e2e-report/**",
    "e2e-results/**",
  ]),
]);

export default eslintConfig;
