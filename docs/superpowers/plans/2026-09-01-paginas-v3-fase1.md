# Páginas v3 — Fase 1: motor de seções + direção "Impacto"

**Data:** 01/09/2026 · **Branch:** `feat/paginas-v3-secoes` (worktree `C:/Users/Igor/Desktop/girumo-paginas-v3`)
**Origem:** board de referências aprovado pelo Igor (Artifact `f381c2e4…`), decisão registrada no grafo
(`decisao-2026-09-01`). Card do quadro: `paginas-templates-secoes` (em_construcao).

## Decisões travadas (não reabrir)

1. Conteúdo v3 = `sections[{type, variant, enabled, data}]`. A ORDEM vem do template; o lojista só
   liga/desliga e troca variante. Sem reordenar, sem arrastar, sem fonte, sem espaçamento (spec 14/07).
2. Fase 1 entrega a direção **`impacto`** (escura, acento = cor da marca) com dois templates:
   `evento-ao-vivo` e `promo-relampago`. A editorial v2 ("Acesso VIP") continua exatamente como está —
   **nenhuma migração de conteúdo v2 nesta fase**. O render escolhe por `schema_version` (2 = editorial,
   3 = seções, resto = básico).
3. Contagem regressiva só com `ends_at` real gravado na página. Sem "vagas limitadas" (depende da
   capacidade do grupo — fase depois).
4. Prova em print de WhatsApp: liberado, com aviso no editor e selo "print enviado pela loja" na página.
5. Flag de rollout: `NEXT_PUBLIC_LP_TEMPLATES_V3=on` (mesmo padrão da v2). Gate só na criação
   (galeria de modelos). Render público e edição de página já v3 não dependem da flag.
6. `hero.media` é opcional na v3 (texto grande sobre fundo escuro se sustenta) — remove a barreira do
   upload no "salvar rascunho". Foto continua sendo o caminho recomendado no editor.
7. Dimensões gravadas na captura: `structure` = chave do template, `visual_direction` = direção,
   `model_version` = 1. Exige DDL (checks `structure = 'conversion'` e `visual_direction = 'premium'`
   em prod) — ver Wave 3.

## Catálogo de seções (Fase 1)

| type | obrigatória | variantes | data |
| --- | --- | --- | --- |
| hero | sim (form dentro) | `form` | badge?, headline, highlight?, description, media? |
| urgency | não | `top_bar` · `date_badge` · `countdown` | label, ends_at? (obrigatório em countdown), note? |
| deliverables | não | `checklist` · `photo_cards` · `numbers` | title, items[{title, description?, media?}] ≤6 (numbers ≤4) |
| audience | não | `pain_cards` · `for_not_for` | title, items[] ≤6, not_items[] ≤4 |
| proof | não | `prints` · `cards` | title, prints[LpMediaRef] ≤6, cards[{name, store, city, quote}] ≤3 |
| about | não | `single` | title, name, role?, text ≤400, media? |
| schedule | não | `days` · `steps` · `rules` | title, items[{label, title, description?}] ≤6 |
| why_free | não | `card` | title, text ≤300 |
| after_signup | não | `notice` | title, text ≤300 |
| cta_band | não | `band` | title, note? (usa o `cta` global) |
| faq | não | `accordion` | title, items[{q, a}] ≤6 |

Rodapé não é seção (spec §8.1). `cta` é global (hero, faixa e CTA fixo repetem a MESMA frase).
Erros de validação usam o caminho `<type>.<campo>` (ex.: `hero.headline`, `faq.items[1].a`) para o
editor pendurar no input certo (`errorField`).

## Templates (presets)

- **evento-ao-vivo** (lançador/mentoria): hero(form) · urgency(date_badge) · schedule(days) ·
  deliverables(checklist) · audience(pain_cards) · proof(prints) · about · after_signup · cta_band · faq.
- **promo-relampago** (loja em liquidação): hero(form) · urgency(countdown) · deliverables(checklist) ·
  about · proof(cards, desligada) · cta_band · faq(desligada).

Cada template traz conteúdo de exemplo (textos reais do nicho, mídia nula → placeholder no preview).

## Waves

**Wave 0 — domínio (feito primeiro, bloqueia o resto)**
`lib/pages/sections.ts` (tipos + catálogo + limites) · `lib/pages/content-v3.ts` (validate/sanitize,
reordena pela ordem do template, descarta tipo desconhecido, pula validação de seção desligada,
`contentDimensions`) · `lib/pages/templates-v3.ts` (presets + exemplos) · `palette.ts`
(`deriveDarkPalette`) · `render.ts` (`isLpContentV3`, kind `sections`) · `schema.ts`
(`parseContentInput` v3, `noticeTextFor`, tipos `LpStructure`/`LpVisualDirection` ampliados) ·
`render-context-core.ts` (aceita structure `^[a-z0-9-]{3,40}$` e direções conhecidas) · testes.

**Wave 1 — render público**
`components/pages/templates/v3/`: `tokens.ts` (vars da direção impacto), `primitives.tsx`,
`sections-page.tsx` (estrutura), `sections/*.tsx` (11 renderers), `footer.tsx`. Ajustes:
`lead-form-fields.tsx` (cores via CSS vars com fallback = editorial), `sticky-cta.tsx` (bug: usar a
ÚLTIMA entry do IntersectionObserver + rootMargin; cor via var). `p/[slug]/page.tsx` ganha o ramo v3;
`/lp-preview?modelo=` renderiza os exemplos (dev-only). Fonte display: Bricolage Grotesque via
`next/font/google` (self-hosted, CSP ok). Corpo continua IBM Plex Sans (layout raiz).

**Wave 2 — editor**
`lib/pages/editor-v3.ts` (estado + helpers) · `components/pages/editor/v3/`: `template-gallery.tsx`,
`form-v3.tsx` (identidade → seções com switch + variante + campos → captação → rastreamento),
`section-fields.tsx`, `preview-frame.tsx` (shell do iframe extraído do preview-v2), `preview-v3.tsx`,
`new-page-v3.tsx`, `edit-page-v3.tsx` (autosave próprio, expõe `flush` por ref) ·
`editor-preview/page.tsx` aceita `content` v3 · `nova/page.tsx` e `[id]/page.tsx` ganham o ramo v3 ·
`flags.ts` (`isLpTemplatesV3Enabled`).

**Wave 3 — persistência e infra**
`api/pages/route.ts` + `store.ts`: gravar `structure`/`visual_direction`/`model_version` a partir do
conteúdo (v3). Migração `apps/web/supabase/migrations/20260902090000_lp_v3_secoes.sql` (widen dos
checks + seed do template `evento-ao-vivo`, idempotente) + `deploy/supabase/apply-order.txt`. Aplicar
nos DOIS bancos pelo CLI (`supabase db query --linked -f`), depois `npm run schema:baseline`.
Thumbnails reais em `apps/web/public/lp-templates/*.jpg` (Playwright a partir de `/lp-preview`).

**Wave 4 — prova**
`npm run web:lint`, `tsc` dos dois lados, `npm --workspace apps/web test`, build, screenshots desktop
e mobile dos dois templates (fold + inteira), captura de teste em dev. PR → CI verde → merge →
`move_card('paginas-templates-secoes', 'no_ar_nao_verificado', …)`; verificado só com prova em prod.

## Itens manuais do Igor

- Fotos reais de exemplo (Mega Stock) para os packs — não bloqueia a Fase 1.
- Ligar `NEXT_PUBLIC_LP_TEMPLATES_V3=on` na Vercel após o merge (e redeploy).
- Se o CLI linkado falhar, rodar o SQL da Wave 3 nos dois bancos.
