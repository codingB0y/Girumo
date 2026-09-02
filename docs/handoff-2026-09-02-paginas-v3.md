# Handoff — Páginas v3 (seções liga/desliga + direção "impacto") · 02/09/2026

Sessão de 01–02/09/2026. Board de referências aprovado pelo Igor → Fase 1 implementada e
aberta como **PR #223** (`feat/paginas-v3-secoes`). Este arquivo é o ponto de retomada.

## Onde as coisas estão

| O quê | Onde |
| --- | --- |
| Board de referências (17 páginas, diagnóstico, proposta) | Artifact `https://claude.ai/code/artifact/f381c2e4-9a07-4f87-93c5-78b6de9d8e9f` |
| Plano da Fase 1 (decisões travadas, catálogo, waves) | `docs/superpowers/plans/2026-09-01-paginas-v3-fase1.md` |
| Decisão no grafo | `kg_insert_text` source `decisao-2026-09-01` |
| Worktree do PR | `C:/Users/Igor/Desktop/girumo-paginas-v3` (junctions de `node_modules` → checkout principal; `.env.local` copiado, com `NEXT_PUBLIC_LP_TEMPLATES_V3=on`) |
| Dev server do worktree | `.claude/launch.json` → "Girumo Paginas v3 (worktree)" (porta automática) |
| Card do quadro | `paginas-templates-secoes` em `em_construcao`, blocker com o passo a passo |
| Memória | `paginas-v3-fase1-shipped`, `paginas-design-review-2026-09-01`, `finding-screenshot-fullpage-cta-fixo-artefato` |

## O que foi entregue (3 commits no PR)

1. `e969a447` domínio v3 (`sections.ts`, `content-v3.ts`, `templates-v3.ts`, paleta escura,
   render por `schema_version`, render-context ampliado) + render da direção impacto
   (`components/pages/templates/v3/**`) + fix do observer do CTA fixo.
2. `3aae4e37` editor v3 (`components/pages/editor/v3/**`, `preview-frame.tsx` compartilhado,
   ramos v3 em `nova` e `[id]`), POST grava dimensões, migração
   `20260902090000_lp_v3_secoes.sql`, thumbnails em `public/lp-templates/`.
3. `1cfc3b1d` E2E `painel-paginas-v3.spec.ts` (5/5), picker legado esconde templates v3,
   baseline de schema renovada.

**Banco:** migração JÁ APLICADA em dev e prod (CLI linkado). Não reaplicar. Gate de drift limpo.

## O que falta (nesta ordem)

1. `gh pr checks 223` verde → revisar → `gh pr merge 223 --squash --delete-branch`.
2. Vercel: `NEXT_PUBLIC_LP_TEMPLATES_V3=on` + redeploy (manual do Igor; sem isso a galeria não aparece).
3. Prova em prod: criar uma página v3 (Evento ao vivo), publicar, abrir no celular, capturar um
   lead de teste → `select public.move_card('paginas-templates-secoes','no_ar_verificado','<prova>','PR #223')`.
   Enquanto isso: `no_ar_nao_verificado` logo após o merge.
4. Igor manda 10–15 fotos reais (Mega Stock) → viram exemplo dos packs (Fase 3).
5. Remover o worktree quando o PR fechar: desarmar as DUAS junctions com
   `[IO.Directory]::Delete(...)` ANTES de apagar a pasta (ver memória
   `finding-worktree-node-modules-junction`).

## Decisões travadas (não reabrir sem o Igor)

- Sem reordenar seções (liga/desliga + variante resolve; spec 14/07 continua).
- Direção escura primeiro; editorial v2 intacta, migra na Fase 2.
- Contagem regressiva só com `ends_at` real; sem "vagas limitadas" (depende da capacidade do grupo).
- Prints de WhatsApp liberados com aviso no editor e selo "print enviado pela loja".
- Packs de exemplo: atacado de moda, semijoias, lançador.

## Fase 2 e 3 (próximas sessões)

- **Fase 2** — rebuild da editorial no motor de seções: direção `editorial` em
  `templates/v3/tokens.ts` (papel + serifa, mas com a composição do Instituto Milano / Srta
  Executiva), templates `acesso-vip` e `lista-de-espera`, adaptador v2→v3 e migração das
  páginas v2 existentes (são 3 em prod).
- **Fase 3** — direção `vitrine` (masonry, carrossel com preço, regras do grupo), seção
  `gallery` no catálogo, packs por nicho com fotos reais, thumbnails geradas no build.

## Armadilhas desta sessão

- Bash: heredoc engole `\\` e o cwd muda entre chamadas — usar path absoluto e scripts em arquivo.
- Arquivos do repo são CRLF: patch por string precisa normalizar `\r\n`.
- `kg_query` (LightRAG) devolveu `None` o dia inteiro; `kg_insert_text` funciona. Fallback:
  `graphify query`.
- Screenshot `fullPage` desenha o CTA fixo escondido abaixo da dobra (parece bug, não é).
- Playwright não clica em `input.sr-only`: clicar no `<label>` pai (pista do interruptor).
