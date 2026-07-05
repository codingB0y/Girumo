# FRONTEND_AUDIT.md — Auditoria de Frontend (UX · UI · Componentização · Performance)

> **Natureza:** diagnóstico somente-leitura. Nenhum código alterado. Data: 2026-07-03.
> **Escopo lido:** `app/layout.tsx`, `app/globals.css` (785 linhas, parcial+grep), `components/ui/button.tsx`,
> `components/sidebar.tsx` × `components/painel/sidebar.tsx`, + grep de padrões em ~155 `.tsx`.
> Complementa o [AUDIT_REPORT.md](AUDIT_REPORT.md) §8 (módulos) e o `TASK_PROGRESS.md` (histórico da landing v2).
> **Lighthouse:** análise **estática** dos fatores (não rodei o CLI — exige build de produção; ver §7 e a
> oferta de rodar o real).
> **Veredito:** o **polish e o design tokens são de bom nível**, mas há **duplicação estrutural cara** (dois
> painéis inteiros — EN legado × PT atual), o app é **client-heavy demais** (107/155 `.tsx` com `"use client"`)
> e há **dois vocabulários de token** convivendo. Nada quebra a UX; o custo é manutenção e performance.

## Placar por área

| Área | Nota | Resumo |
|---|---|---|
| UX (polish) | 🟢 Bom | Command palette, confetti, toasts realtime, sparkline, empty states, onboarding |
| UI / Design tokens | 🟠 Médio | Tokens bem pensados, mas **2 vocabulários** (`brand-*` × `iris/breu`) |
| Hierarquia / IA | 🟠 Médio | **Dois shells paralelos** (`(app)` EN × `painel` PT) |
| Componentização | 🟠 Médio | DS de 5 primitivos p/ 90 componentes; muita UI ad-hoc |
| Código duplicado | 🔴 Alto | Shell triplicado + ~5 componentes de landing mortos |
| Performance | 🔴 Alto | 107 client components; 5 fontes globais; TBT provável alto na landing |
| Responsividade | 🟢 Bom | mobile-nav dedicado, canvas gated no mobile, CTA fixo, LP mobile-first |
| Acessibilidade | 🟢 Bom | focus-visible rings, `lang=pt-BR`, `alt`, `noindex` no admin |

---

## 1. UX  🟢 (com 1 ressalva)

Nível de acabamento alto para um SaaS deste porte: command palette
([painel/command-palette.tsx](apps/web/src/components/painel/command-palette.tsx)), confetti no 1º disparo,
realtime-toasts, sparkline, animated-number, empty-states, onboarding-wizard, daily-checklist. Feedback e
microinterações consistentes.

🟡 **FE-9 — `scroll-behavior: smooth` global × ScrollTrigger.** [globals.css:41](apps/web/src/app/globals.css)
força smooth em todo o site; a landing v2 precisa desligar isso via JS durante os FX
(workaround em `landing-fx.tsx`, ver `TASK_PROGRESS.md`). Funciona, mas é frágil — um refactor da landing que
esqueça o workaround reintroduz "scrolls fantasmas".

---

## 2. UI / Design tokens  🟠

- 🟢 `components/ui/` traz `button/card/badge/input/skeleton` com `variants`/`sizes` tipados e
  **`focus-visible:ring`** ([button.tsx:29](apps/web/src/components/ui/button.tsx)) — acessível e coeso.
- 🟠 **FE-1 — dois vocabulários de token coexistem** em `globals.css`:
  - `@theme inline` (linhas 3-32): paleta **`brand-*`** com íris **#7c5cff**.
  - bloco em [globals.css:186-200](apps/web/src/app/globals.css): **`iris/breu/bruma/aco/alerta`** com íris
    **#6a4bf0**.
  Os componentes reais usam **`iris/breu/...`** (ex.: [button.tsx:7](apps/web/src/components/ui/button.tsx)),
  então `brand-*` está órfão/divergente — e as duas íris **não são a mesma cor**. Fonte de inconsistência
  visual e confusão de qual token usar.
- 🟡 **FE-8 — escala de radius colapsada:** `--radius-xl` e `--radius-2xl` são ambos `0.5rem`
  ([globals.css:30-31](apps/web/src/app/globals.css)) — perde-se um degrau de hierarquia de canto.
- `globals.css` tem **785 linhas** e **54 utilities `.lp-*`** da landing — CSS de página específico morando no
  global (carregado em todo request, inclusive painel/admin que não usam `.lp-*`).

---

## 3. Hierarquia / Arquitetura de informação  🟠

Root `layout.tsx` (5 fontes + `DevModeBanner` + `ImpersonateBanner` **globais**, aplicados a **toda** página,
inclusive landing e LPs públicas `/p`) → 3 sub-layouts: `painel/` (PT, atual), `admin/`, `(app)/` (EN, legado).

🟠 **FE-2 — dois shells de produto paralelos.** `(app)/*` (hoje, groups, leads, settings — inglês) e
`painel/*` (campanhas, grupos, contatos — português) são **navegações duplicadas** que podem divergir: um fix
de UX num painel não chega no outro. Confirmado no nível de componente pelas sidebars quase idênticas
([components/sidebar.tsx:10-24](apps/web/src/components/sidebar.tsx) → rotas `/hoje /groups /leads` vs
[painel/sidebar.tsx:19-26](apps/web/src/components/painel/sidebar.tsx) → `/painel/*`).

---

## 4. Componentização & Código duplicado  🔴

- 🔴 **FE-3 — shell duplicado/triplicado:**
  `sidebar.tsx` (`components/`, `admin/`, `painel/`), `topbar.tsx` (3×), `mobile-nav.tsx` (2×),
  `stat-card.tsx` (2×), `pricing.tsx` (landing antiga × `landing/v2`). As versões `components/*` servem o
  `(app)` legado; as `painel/*`, o atual. É a duplicação da §3 materializada em código.
- 🟠 **FE-4 — ~5 componentes de landing mortos** (0 imports, confirmado por grep):
  `landing/flow-visual`, `landing/product-frame`, `landing/testimonial-card`, `landing/bento-card`,
  `landing/pricing`. Peso morto no repo (tree-shaking tira do bundle, mas polui e confunde). Alinhado ao que
  o `TASK_PROGRESS.md` já previa limpar.
- 🟠 **FE-5 — design system subutilizado:** 5 primitivos em `ui/` para **90 componentes** → a maior parte da UI
  é markup Tailwind ad-hoc (cards/botões reconstruídos inline por página), o que reespalha as mesmas classes e
  dificulta mudança de tema. Oportunidade de extrair `PageHeader`, `Section`, `DataTable`, `StatCard` único.

---

## 5. Performance  🔴

- 🔴 **FE-6 — client-heavy:** **107 de ~155 `.tsx` têm `"use client"`**. Muitos são listas/cards/painéis que
  poderiam ser **Server Components** (dados no server, zero JS no cliente). Isso infla o bundle e o **TBT**, e
  anula boa parte do RSC/streaming do Next 15.
- 🟠 **FE-7 — 5 famílias de fonte no root** ([layout.tsx:2-49](apps/web/src/app/layout.tsx)): Bricolage
  Grotesque, IBM Plex Sans, IBM Plex Mono, Instrument Serif, Space Grotesk (vários pesos cada). A v2.1 trocou
  Instrument→Space nos headings (`TASK_PROGRESS.md`), então **Instrument Serif é provável peso morto**; e
  painel/admin só usam Plex Sans/Mono, mas as 5 são declaradas globalmente. `display:swap` está correto (evita
  FOIT), mas é fonte demais para o LCP da landing.
- 🟡 **Imagens:** `next/image` só aparece nos componentes de landing **mortos**; os atuais usam `<img>`
  (`conectar` = QR data-url, ok; `basic.tsx` = foto do lojista, decisão consciente; `(app)/campaigns` = legado).
  Há poucas imagens raster (o visual é SVG/canvas), então o impacto é baixo — mas não há otimização onde
  existe.
- 🟢 **Bons hábitos já presentes:** GSAP importado **dinâmico** no client, canvas do hero **não monta** em
  mobile/reduced-motion/`deviceMemory≤2`, entrada do hero em CSS puro (`TASK_PROGRESS.md`). Isso protege o LCP
  mobile.

---

## 6. Responsividade  🟢

`mobile-nav` dedicado, `sidebar` `hidden lg:flex` ([painel/sidebar.tsx:48](apps/web/src/components/painel/sidebar.tsx)),
canvas gated no mobile, CTA fixo mobile na landing, LP `basic.tsx` mobile-first. Cobertura boa. 🟡 ressalva: o
`mobile-nav` também é duplicado ((app) × painel), mesmo problema da §4.

---

## 7. Lighthouse — análise estática (CLI não executado)

Não rodei o Lighthouse (exige `next build` de produção + CLI/Chrome headless). Projeção pelos sinais do código:

| Métrica | Projeção | Porquê |
|---|---|---|
| **LCP** | 🟠 Moderado | 5 fontes swap + hero com canvas; mitigado por GSAP dinâmico e canvas gated no mobile |
| **TBT / INP** | 🔴 Risco | 107 client components + GSAP + canvas na landing → muito JS de hidratação |
| **CLS** | 🟡 Vigiar | `DevModeBanner`/`ImpersonateBanner` hidratam **depois** e ficam no topo → podem empurrar o layout; fontes swap (mitigado pelo `size-adjust` do `next/font`) |
| **Acessibilidade** | 🟢 Bom | focus-visible rings, `lang=pt-BR`, `alt` presente, `robots:noindex` no admin |
| **Best Practices/SEO** | 🟢 Bom | metadata template, CSP/headers (audit geral), OG dinâmico |

→ **Posso rodar o Lighthouse real** (subo `next build && next start` + coleto o relatório) se você quiser o
número — só não fiz agora para não gastar o build sem seu ok.

---

## 8. Prioridades sugeridas (NÃO implementar sem aprovação)

| P | Item | Ação mínima | Ref. |
|---|---|---|---|
| P1 | Dois painéis | decidir **um** shell (deletar `(app)` EN ou promovê-lo) e remover o duplicado | FE-2, FE-3 |
| P1 | Tokens divergentes | unificar `brand-*` × `iris/breu` num só vocabulário/cor | FE-1 |
| P2 | Client-heavy | converter listas/cards estáticos em Server Components | FE-6 |
| P2 | Fontes | remover Instrument Serif se órfã; separar fontes da landing do painel | FE-7 |
| P2 | Componentes mortos | deletar os ~5 `landing/*` sem import | FE-4 |
| P3 | Design system | extrair `PageHeader/Section/StatCard/DataTable` únicos | FE-5 |
| P3 | Lighthouse | rodar o CLI real, atacar TBT (menos client) e CLS (reservar espaço dos banners) | §7 |

---

## 9. Resposta direta

O frontend **não tem um problema de gosto** — tokens, microinterações e responsividade estão bem feitos. Tem
um problema de **duas coisas mantidas onde deveria haver uma**: dois painéis (EN/PT), dois vocabulários de
token, shell triplicado. Isso não aparece pro usuário hoje, mas **dobra o custo de cada mudança** e é o vetor
nº 1 de UI inconsistente no futuro. O segundo eixo é **performance por excesso de client** — corrigível
incrementalmente movendo o que é estático para o servidor. O que eu faria primeiro é a **§FE-2/FE-3**
(consolidar o shell): reduz superfície, código morto e risco de divergência de uma vez.

*Fim do relatório. Diagnóstico apenas; nenhuma alteração aplicada.*
