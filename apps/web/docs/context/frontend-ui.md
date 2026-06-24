# Lane: Frontend + UI

**Pasta:** `devzap-groups` · **Foco:** tudo que o lojista vê e faz — telas, navegação, landing, composição,
fetch/estado de cliente **e** o visual/design system. (Antes eram duas lanes; fundidas: "o quê mostra" + "como parece".)
Stack: Next.js 16 (App Router) + React 19 + Tailwind 4.

## Você MEXE em
- `src/app/(app)/**/page.tsx` + `layout.tsx` — telas do painel (hoje, crescer, dashboard, campanhas, groups,
  acquisition, indicacao, links, leads, campaigns, templates, schedules, reports, settings).
- `src/app/page.tsx` (landing) · `src/app/login/page.tsx`.
- `src/components/*` — comportamento **e** visual: sidebar, mobile-nav, topbar, connection-banner,
  daily-checklist, onboarding-checklist, funnel-visual, health-card, stat-card, campanha-selector,
  links-client, toast, **e os primitivos `ui/*`** (button, card, input, badge).
- `src/app/globals.css` — design tokens (paleta `brand-*` violeta, sombras em camadas, gradientes, `.dz-rise`).
- Cliente: `src/lib/use-campanhas.ts`, `src/lib/active-campanha.ts`, `src/lib/utils.ts` (cn).

## Você LÊ, mas NÃO edita
- `src/app/api/*`, `src/lib/*-store.ts`, `business-health.ts`, `auth.ts`, `middleware.ts` → lane **Banco/API**. Trate como API pronta.
- `devzap-engine/*` → lane **Engine** (outra pasta).
- Contrato dos endpoints: `system/API_CONTRACTS.md`.

## Convenções (invioláveis)
- Server Components por padrão; `"use client"` só com estado/efeito/evento.
- ⚠️ Next 16 tem breaking changes vs. treino — ao usar API nova do Next, leia `node_modules/next/dist/docs/` antes (ver `AGENTS.md`).
- Mobile-first, premium-leve (não dark full). **Identidade fixa:** violeta (`brand-*`) = marca/ação;
  **verde só para sucesso/crescimento** (semântico). Não invente cor fora dos tokens.
- Primitivo `ui/*` propaga pra todas as telas — mudou um, confira que não quebra nenhuma. Build limpo.
- Acessibilidade: foco visível, contraste, `aria-*` em ícone-botão.
- Marketing: **nada de "medo de ban"** em copy/visual de landing (regra durável).
- Toda tela responde "tô crescendo? / vendendo mais? / o que faço agora?". Linguagem de lojista leigo, sem jargão.

## Carregue ao iniciar (mínimo)
Este primer + `system/NEXT.md` + a(s) tela(s)/componente(s) que vai tocar. Não precisa de stores nem da engine.

## Fronteira / handoff
Precisa de um dado que a API não devolve? **Não crie store/rota aqui.** Anote o contrato desejado em
`system/NEXT.md` e passe pra lane **Banco/API**. Mudança na engine → outra pasta (`devzap-engine`).
</content>
