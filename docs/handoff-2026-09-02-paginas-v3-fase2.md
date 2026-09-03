# Handoff — Páginas v3, Fase 2 (direção editorial + migração v2→v3) · 02/09/2026

Sessão de 02/09/2026. A Fase 1 (PR #223) foi mergeada e **verificada em prod** nesta sessão;
a Fase 2 está implementada e aberta como **PR #225** (`feat/paginas-v3-fase2`), CI verde 7/7,
**aguardando o Igor aprovar as decisões D1–D6 antes do merge**. Este arquivo é o ponto de retomada.

## Onde as coisas estão

| O quê | Onde |
| --- | --- |
| PR da Fase 2 | https://github.com/codingB0y/Girumo/pull/225 (5 commits, base `main` = `56cfb037`) |
| Worktree | `C:/Users/Igor/Desktop/girumo-paginas-v3-f2` (junctions de `node_modules` → checkout principal; `.env.local` copiado com `NEXT_PUBLIC_LP_TEMPLATES_V3=on` e `NEXT_PUBLIC_LP_EDITOR_V2=on`) |
| Dev server do worktree | `.claude/launch.json` → "Girumo Paginas v3 F2 (worktree)" |
| Plano (decisões D1–D6, catálogo, waves) | `docs/superpowers/plans/2026-09-02-paginas-v3-fase2.md` |
| Handoff da Fase 1 | `docs/handoff-2026-09-02-paginas-v3.md` |
| Cards do quadro | `paginas-templates-secoes` = `no_ar_verificado` (prova de 02/09) · `paginas-v3-editorial` = `em_construcao` (blocker aponta o PR) |
| Memória do Claude Code | `paginas-v3-fase2-em-andamento`, `paginas-v3-fase1-shipped`, `finding-env-flag-caixa-alta-vercel` |

## O que aconteceu nesta sessão

1. **PR #223 mergeado** (squash `7c6ba02b`). A env `NEXT_PUBLIC_LP_TEMPLATES_V3` já existia na
   Vercel, mas com valor `"ON"`; `parseFlag` só aceitava `"on"` e a galeria ficou escondida em prod.
   **PR #224** (`56cfb037`) tornou o parse indiferente a caixa — não precisa mexer na Vercel.
2. **Prova em prod da Fase 1**: página `prova-v3-02-09-tzzk` (id `b177f002-b184-43e1-adce-ce920ddfa53d`)
   criada do modelo Evento ao vivo, publicada, lead capturado (`lp_captures 8479d8fb-36b1-4261-8d42-49d3f9d0e954`).
   Continua publicada com destino fictício `chat.whatsapp.com/PROVAV3…` — pausar/apagar quando não servir.
3. Worktree `girumo-paginas-v3` removido (junctions desarmadas, `node_modules` intacto).
4. **Fase 2 implementada** (commits `2dca38ee`, `7bdc4a2c`, `85bc51c6`, `36300f99` + handoff):
   - Direção `editorial` = pele do motor de seções via tokens (`editorialStyle`/`directionStyle` em
     `components/pages/templates/v3/tokens.ts`; Fraunces como display). Nenhum `if (direction)` em seção.
   - Templates `acesso-vip` (ordem da v2: hero → proof(video) → deliverables → gallery) e `lista-de-espera`.
     O card "Acesso VIP" da galeria virou template v3 (`GalleryPick = LpTemplateKey`).
   - Catálogo: seção `gallery` (grid, 2–6 fotos, legenda no `alt`) e variante `video` da `proof`
     (`ProofVideo = LpVideoRef & { name, detail?, quote }`). Editor v3 edita as duas.
   - `lib/pages/migrate-v2.ts` (`fromContentV2`, puro, 7 testes) + `planMigrationToV3` em `schema.ts` +
     `POST /api/pages/[id]/migrate` (escrita condicional por `updated_at`; guarda a PRIMEIRA v2 em
     `landing_pages.content_before_v3`; `published_version` NÃO sobe). Botão "Migrar para o modelo novo"
     na tela da página v2 (`app/painel/pages/[id]/page.tsx`).
   - **SQL `20260903090000_lp_v3_migracao.sql` JÁ APLICADO em dev e prod** pelo CLI. Não reaplicar.
     Baseline renovada (só `t|landing_pages` mudou), gate de drift limpo.
   - Miniaturas `public/lp-templates/*.jpg` regeradas SEM a barra "LOCAL DEV MODE" (o `DevModeBanner`
     agora se esconde em `/p/` e `/lp-preview`).
   - E2E `painel-paginas-v3.spec.ts` 8/8 local e no CI (inclui migração pelo botão + 409 para não-v2).

## Decisões tomadas SEM o Igor nesta sessão (reverter é barato — dizer se discordar)

- **D1** `gallery` entrou na Fase 2 (não na 3): as 3 páginas v2 de prod têm galeria de 3.
- **D2** `proof.video`: as 3 páginas v2 de prod têm prova em vídeo (Vimeo).
- **D3** migração explícita por página (botão + rota), cópia em coluna nova, sem script one-off.
- **D4** Fraunces como serifa da editorial.
- **D5** direção = tokens, não renderers.
- **D6** templates `acesso-vip`/`lista-de-espera`; criação v2 legada só com a flag v3 desligada.

## O que falta (nesta ordem)

1. Igor lê D1–D6 e o PR → `gh pr merge 225 --squash --delete-branch`.
2. Em prod, com a sessão do Igor: abrir `mega-store-9ypy` (rascunho) → "Migrar para o modelo novo" →
   conferir o preview; depois `mega-store-vcbm` e `mega-stock-n8aq` (publicadas) → abrir `/p/<slug>` no
   celular. Reversão manual, se precisar: `update landing_pages set content = content_before_v3,
   content_schema_version = 2, structure = 'conversion', visual_direction = 'premium' where id = …`.
3. `select public.move_card('paginas-v3-editorial','no_ar_verificado','<prova>','PR #225')` em prod.
4. Remover o worktree `girumo-paginas-v3-f2` (desarmar as DUAS junctions com `[IO.Directory]::Delete`
   ANTES de apagar — ver memória `finding-worktree-node-modules-junction`).
5. Fase 3: direção `vitrine` (masonry, carrossel com preço, regras do grupo), packs por nicho com as
   fotos reais da Mega Stock, thumbnails geradas no build. Remoção do código v2 (`form-v2`, `preview-v2`,
   `conversion-editorial`) só depois das 3 páginas migradas e 30 dias sem reversão.

## Armadilhas desta sessão

- `vercel env rm/add` é bloqueado pelo classificador do auto mode; conferir o VALOR da env com
  `vercel env pull` (Sensitive vem vazia).
- Clique por coordenada no Claude in Chrome não acertou os botões da galeria; `find` estava sobrecarregado.
  O que funcionou: `javascript_tool` com `button.click()` e `form_input` por ref.
- Screenshot do Browser pane após scroll vem em branco; usar Playwright do `node_modules` da raiz
  (`fullPage`) para conferir render.
- `autosave.test.ts` tem regex posicional sobre `[id]/page.tsx`: função nova com `await load()` logo
  depois de `changeStatus` quebra o teste — colocar antes.
- Os inserts no LightRAG de 01–02/09 ficaram `failed` (cota do Gemini). Lista de retry desta fase:
  `tools/lightrag/index-lists/paginas-v3-fase2-2026-09-02.txt`.

## Fecho da sessão da noite de 02/09 (Igor aprovou D1–D6)

- **PR #225 mergeado** (squash `b0c89d5f`) e branch remota apagada. O commit de docs que criou este
  arquivo ficou fora do squash (foi escrito depois do merge) e voltou por cherry-pick.
- **Migradas em prod pelo botão**, nesta ordem: `mega-store-9ypy` (rascunho, 23:53Z) e
  `mega-store-vcbm` (publicada, 00:02Z). As duas: `content_schema_version=3`, `structure=acesso-vip`,
  `visual_direction=editorial`, `content_before_v3` gravado, `published_version` intacto.
  Conferido em `/p/mega-store-vcbm`: h1 em Fraunces (antes `ui-serif`), galeria grid com as 3 fotos,
  prova em vídeo com facade, faixa de CTA. Logo, foto do hero, vídeo e galeria preservados.
- **`mega-stock-n8aq` NÃO foi migrada**: é de outro tenant (`a4cd4de5-…`, org
  `blaia1511.bm@gmail.com`) — a sessão do Igor recebe 404 nela, e é página publicada de cliente.
  Migrar exige a conta do cliente ou decisão explícita.
- Card `paginas-v3-editorial` → `no_ar_verificado` (prova acima). `prova-v3-02-09-tzzk` pausada.

### Armadilha nova: `window.confirm` congela a automação do Chrome

`migrateToV3()` abre um `window.confirm` nativo. Clicar o botão por `javascript_tool` trava o renderer
(CDP `Runtime.evaluate` estoura 45s e a aba fica inutilizável — foi preciso fechar duas abas).
O que funciona: `window.confirm = () => true` e disparar o clique com `setTimeout(…, 0)`, para o eval
retornar antes do handler rodar. Vale para qualquer botão do painel que confirme antes de agir.
