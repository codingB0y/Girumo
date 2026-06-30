# Notas do design-sync — HubFlow

## Contexto da decisão
- `apps/web` é o **único** ativo no escopo desta sync (Fundação Direção B: tokens + fontes + logo).
- Os primitivos `apps/web/src/components/ui/*` (button, card, input, badge, skeleton) NÃO foram
  sincronizados — estão na marca antiga (violeta V3 `#7c5cff`, slate). Sincronizá-los ensinaria a
  marca errada ao agente. Decisão do usuário: sincronizar só a fundação por ora.
- Repo não é uma lib publicada (sem `dist/`, sem `package.json` `exports`) — o converter roda em
  **modo synth-entry** via `--entry apps/web/.ds-entry.tsx` (arquivo gitignored que reexporta só
  `Logo`/`LogoSymbol`). Sem essa entrada explícita, o synth tenta empacotar TODO `src/` (49
  arquivos) e quebra em `server-only`/`tailwindcss`/`fs` (módulos server-only do Next).

## Config / paths (gotchas)
- Monorepo hoisted: `react`/`react-dom` só existem no `node_modules` da RAIZ, não em
  `apps/web/node_modules`. Sempre usar `--node-modules ./node_modules` (raiz), nunca
  `apps/web/node_modules`.
- `node_modules/hubflow-web` é o symlink do workspace → `PKG_DIR` resolve para `apps/web`. Todo
  path em `.design-sync/config.json` (`srcDir`, `tsconfig`, `cssEntry`, `componentSrcMap`) é
  **relativo a `apps/web`**, não à raiz do repo.
- `cssEntry` é bound a `PKG_DIR` (apps/web) por segurança no converter — por isso o CSS compilado
  vive em `apps/web/.ds-styles.css` (gitignored), não em `.design-sync/`.

## Pipeline do CSS (Direção B)
- Fonte: `.design-sync/ds-input.css` (entrada Tailwind v4) + `.design-sync/ds-safelist.html`
  (força geração das classes da paleta mesmo sem uso real ainda).
- **Crítico**: `@import "tailwindcss/utilities.css" layer(utilities) source(none)` — sem o
  `source(none)`, o Tailwind escaneia o repo INTEIRO e gera ~46 utilitárias órfãs referenciando
  vars que não existem no tema (`[TOKENS_MISSING]`), poluindo o styles.css entregue ao agente.
  Com `source(none)` + `@source` explícito (logo.tsx + previews/ + safelist.html), o CSS final
  fica enxuto (~8KB) e limpo.
- Comando: `./.ds-sync/node_modules/.bin/tailwindcss -i .design-sync/ds-input.css -o apps/web/.ds-styles.css`
  (Tailwind CLI instalado isolado em `.ds-sync/node_modules`, não no app).
- Fontes: NÃO empacotadas como `.woff2` — usamos `@import` remoto do Google Fonts dentro do CSS
  (mesmo padrão do app real). Validate reporta `[FONT_REMOTE]` — informativo, não bloqueia.

## Render-check
- Playwright/Chromium NUNCA foi instalado nesta máquina para este sync (usuário optou por pular
  o download de ~200MB). Verificação foi 100% visual humana via `.review.html` servido localmente
  (`node .ds-sync/storybook/http-serve.mjs ./ds-bundle`). Usuário aprovou os 4 cells (Logo
  claro/escuro, LogoSymbol íris/branco).
- Se uma re-sync futura quiser o render-check automático, ainda precisa instalar Playwright —
  nada foi cacheado.

## Re-sync risks (o que pode ficar obsoleto)
- **Churn benigno (re-sync 2026-06-30):** o driver acusou `Logo`/`LogoSymbol` como `changed` e
  `upload.any:true`, mas `renderHashes` + `styleSha` + conteúdo de `prompt.md`/`.d.ts` eram
  IDÊNTICOS à âncora; só `bundleSha12`/`sourceKey`/`auxSha` divergiram (bytes — provável CRLF/LF
  ou não-determinismo do esbuild). Fonte git-idêntica desde `2cdd3be1`. Usuário optou por NÃO
  re-ancorar. Logo: diffs "changed" só por esses 3 hashes, com renderHash/styleSha iguais, são
  ruído — não exigem re-verificação visual. Re-ancorar (subir com `--no-render-check`) zera o ruído.
- Se o `apps/web/src/app/globals.css` (`@theme`) mudar os valores de Breu/Íris/Bruma, o
  `.design-sync/ds-input.css` (cópia paralela dos tokens) PRECISA ser atualizado manualmente —
  não há link automático entre os dois. Mesmo risco para `apps/web/src/components/landing/logo.tsx`
  vs. qualquer ajuste visual no símbolo.
- Os previews autorais (`.design-sync/previews/Logo.tsx`, `LogoSymbol.tsx`) importam de
  `'hubflow-web'` (o nome do pacote synth) — se `cfg.pkg`/`globalName` mudar, os previews quebram.
- `apps/web/.ds-entry.tsx` e `apps/web/.ds-styles.css` são gitignored e recriados a cada sync —
  se outra pessoa clonar o repo e rodar a sync sem ler estas notas, vai faltar o entry e o
  converter volta a tentar empacotar todo `src/`.
- Quando o app migrar `ui/*` pra Direção B (tarefa futura mencionada mas não feita), essa é a
  hora de expandir o escopo desta sync para incluir Button/Card/Input/Badge — hoje eles foram
  deliberadamente excluídos por estarem na marca errada.

## Comandos para re-sync
```sh
# 1. Recompilar CSS da marca (se tokens mudaram)
./.ds-sync/node_modules/.bin/tailwindcss -i .design-sync/ds-input.css -o apps/web/.ds-styles.css

# 2. Rebuild do bundle
node .ds-sync/package-build.mjs --config .design-sync/config.json --node-modules ./node_modules \
  --entry apps/web/.ds-entry.tsx --out ./ds-bundle

# 3. Validar (sem Playwright instalado nesta máquina)
node .ds-sync/package-validate.mjs ./ds-bundle --no-render-check
```
