# Páginas v3 — Fase 2: direção "editorial" no motor de seções + migração v2→v3

**Data:** 02/09/2026 · **Branch:** `feat/paginas-v3-fase2` (worktree `C:/Users/Igor/Desktop/girumo-paginas-v3-f2`)
**Origem:** handoff `docs/handoff-2026-09-02-paginas-v3.md` (Fase 1 = PR #223, mergeado 02/09). Card do quadro:
`paginas-templates-secoes` (prova em prod pendente da flag). Fase 2 abre card próprio: `paginas-v3-editorial`.

## Decisões travadas (herdadas — não reabrir)

1. Sem reordenar seções; liga/desliga + variante. Ordem vem do template.
2. Editorial v2 ("Acesso VIP") ficou intacta na Fase 1. **Nesta fase ela vira direção `editorial` do motor
   v3** e as 3 páginas v2 de prod migram para v3 (`mega-store-vcbm`, `mega-stock-n8aq` publicadas;
   `mega-store-9ypy` rascunho — todas com prova em vídeo e galeria de 3 fotos).
3. Contagem regressiva só com `ends_at` real. Sem "vagas limitadas".
4. Prints de WhatsApp com selo "print enviado pela loja".
5. Flag `NEXT_PUBLIC_LP_TEMPLATES_V3=on` segue gate só da galeria.
6. Spec 14/07 §15: migração **preserva cópia da configuração anterior** para reversão e não muda URL,
   leads, UTMs, pixels.

## Decisões desta fase (tomadas em 02/09 sem o Igor — reverter é barato, dizer se discordar)

- **D1. `gallery` entra agora, não na Fase 3.** As 3 páginas v2 têm galeria; migrar sem a seção apaga
  conteúdo publicado. Fase 2 traz só a variante `grid` (2–6 fotos, legenda opcional). `masonry`/carrossel
  com preço continuam na Fase 3 (direção `vitrine`).
- **D2. `proof` ganha variante `video`** (`LpVideoRef` + nome/detalhe/frase) pelo mesmo motivo: as 3 páginas
  usam vídeo. Reaproveita o player de `sections/video-proof.tsx`.
- **D3. Migração é explícita, por página, pelo próprio editor**: botão "Migrar para o modelo novo" na tela
  da página v2 → `POST /api/pages/[id]/migrate` (tenant-filtrado). Sem script one-off com credencial de
  prod. A cópia anterior vai para `landing_pages.content_before_v3` (nova coluna jsonb) +
  `migrated_to_v3_at`. Reversão = SQL manual (3 páginas), documentada na migração.
- **D4. Fonte display da editorial: Fraunces** (`next/font/google`, self-hosted, CSP igual), pesos 500–700.
  A v2 usava `font-serif` genérico; a composição de referência (Instituto Milano / Srta Executiva) pede uma
  serifa de verdade. Corpo continua Plex Sans.
- **D5. Direção = tokens, não renderers novos.** Os 11 renderers da Fase 1 já pintam por `--lp-*`. A
  editorial entra como `editorialStyle(palette)` (papel/tinta/vinho da v2 + `--lp-display-weight`,
  `--lp-display-tracking`) e as classes `T.*` passam a ler peso/tracking por var. Nenhum `if (direction)`
  dentro de seção.
- **D6. Templates novos:** `acesso-vip` (mesma ordem da v2: hero → proof(video) → deliverables(checklist) →
  gallery(grid) → cta_band → faq desligada) e `lista-de-espera` (hero → urgency(date_badge) → why_free →
  deliverables(checklist) → gallery(grid, desligada) → after_signup → cta_band). O card "Acesso VIP" da
  galeria deixa de ser caso especial (`GalleryPick` = `LpTemplateKey`); a criação v2 legada só existe com a
  flag v3 desligada.

## Catálogo — o que muda

| type | variantes (novo em **negrito**) | data |
| --- | --- | --- |
| proof | prints · cards · **video** | + `video?: LpVideoRef`, `video_name`, `video_detail?`, `video_quote` |
| **gallery** | **grid** | `title`, `items[LpMediaRef]` 2–6 (`alt` = legenda) |

Limites novos em `V3_MAX`: `gallery: 6`, `gallery_min: 2`. Erros: `gallery.items[i]`, `proof.video`.

## Adaptador v2→v3 (`lib/pages/migrate-v2.ts`, puro)

```
fromContentV2(v2) → LpContentV3 {
  template: "acesso-vip", direction: "editorial",
  store_name, logo, brand_color, cta,
  sections (ordem do template acesso-vip):
    hero(form)        ← badge, headline, description, media: v2.hero
    proof(video|cards)← v2.proof: kind video → variant video (name, detail = `${store} · ${city}`, quote)
                        kind photo → variant cards (1 card); null → enabled:false
    deliverables      ← v2.benefits → checklist {title, description}; 0 itens → enabled:false
    gallery(grid)     ← v2.gallery (2–6; se <2 → enabled:false)
    cta_band          ← enabled:true, title = "Entre no grupo e receba o link"
    faq               ← enabled:false, 1 item de exemplo
}
```

Todos os limites v2 cabem nos v3 (72≤90, 180≤200, 40≤60, 90≤120, 180=180). Títulos de seção que não
existem na v2 ganham copy padrão editável. **Invariante testada:** `validateContentV3(fromContentV2(x))`
é `[]` para toda v2 válida (fixture + as 3 shapes reais de prod).

## Rota de migração (`app/api/pages/[id]/migrate/route.ts`)

POST, sessão do tenant, carrega a página **com `.eq('tenant_id')`**, recusa se não for v2 ou se já tiver
`content_before_v3`. Grava numa única `update`: `content` (v3), `content_schema_version=3`,
`structure='acesso-vip'`, `visual_direction='editorial'`, `model_version=1`, `content_before_v3` (v2
original), `migrated_to_v3_at=now()`. Não toca `status`, `published_version`, `slug`, pixels, campanha.
Devolve a página normalizada; o cliente recarrega e cai no editor v3.

## Waves (Files disjuntos por wave; implementadores não commitam)

**Wave 0 — domínio (eu, bloqueia o resto)**
`lib/pages/sections.ts` (gallery, proof video, limites) · `lib/pages/content-v3.ts` (validação/sanitize das
duas) · `lib/pages/templates-v3.ts` (`acesso-vip`, `lista-de-espera`) · `lib/pages/migrate-v2.ts` + teste ·
`lib/pages/content-v3.test.ts` (casos novos) · `components/pages/templates/v3/tokens.ts` (`editorialStyle`,
vars de peso/tracking) · `sections-page.tsx` (escolhe tokens + fonte pela `content.direction`).

**Wave 1 — render (paralelo, 2 tarefas)**
- 1a `templates/v3/sections/gallery.tsx` (novo) + registro em `sections-page.tsx` (só o `case`).
- 1b `templates/v3/sections/proof.tsx` (variante video; extrai o embed de `sections/video-proof.tsx` para
  `sections/video-embed.tsx` compartilhado).

**Wave 2 — editor + rota (paralelo, 3 tarefas)**
- 2a `components/pages/editor/v3/section-fields.tsx` (campos de gallery e proof.video) ·
  `lib/pages/editor-v3.ts` (helpers de lista de mídia).
- 2b `app/api/pages/[id]/migrate/route.ts` (novo) · `lib/pages/store.ts` (`migratePageToV3`) ·
  `lib/pages/schema.ts` (tipo `content_before_v3`).
- 2c `components/pages/editor/v3/template-gallery.tsx` (sem caso especial) · `app/painel/pages/nova/page.tsx`
  · `app/painel/pages/[id]/page.tsx` (botão "Migrar para o modelo novo" no ramo v2) ·
  `app/lp-preview/page.tsx` (novos modelos aparecem sozinhos via `TEMPLATE_KEYS`; conferir).

**Wave 3 — persistência e infra (eu)**
Migração `apps/web/supabase/migrations/20260903090000_lp_v3_migracao.sql` (`content_before_v3 jsonb`,
`migrated_to_v3_at timestamptz`, idempotente, rollback comentado) + `deploy/supabase/apply-order.txt`.
Aplicar nos DOIS bancos pelo CLI (`supabase db query --linked -f`), `npm run schema:baseline`, advisor.
Thumbnail `public/lp-templates/lista-de-espera.jpg` (Playwright em `/lp-preview?modelo=lista-de-espera`);
`acesso-vip.jpg` regravado do render v3.

**Wave 4 — prova**
`npm run web:lint`, `tsc` dos dois lados, `npm --workspace apps/web test`, E2E: `painel-paginas-v3.spec.ts`
ganha (a) criar página do modelo `acesso-vip` e (b) migrar uma página v2 semeada → abre no editor v3 e
`content_before_v3` preenchido. `verify-local.ps1` antes do push. PR → CI → merge → `move_card`.
Em prod, com sessão do Igor: migrar `mega-store-9ypy` (rascunho) primeiro, conferir preview, depois as 2
publicadas; captura de lead numa migrada = prova para `no_ar_verificado`.

## Fora desta fase

Direção `vitrine`, masonry/carrossel com preço, regras do grupo, packs por nicho com fotos reais,
thumbnails no build (Fase 3). Remoção do código v2 (`form-v2`, `preview-v2`, `conversion-editorial`) só
depois que as 3 páginas estiverem migradas e sem reversão por 30 dias.
