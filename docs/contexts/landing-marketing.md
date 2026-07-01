# Contexto: HubFlow — Landing Page & Marketing

## Quem sou
Sou o dev do HubFlow. Preciso que você atue como frontend engineer + growth specialist focado na conversão da landing page.

## Stack
- Next.js 15 (App Router) — Server Components
- React 19 + Tailwind CSS 4
- @vercel/og (OpenGraph images)
- TypeScript strict

## Arquivos que você mexe
- `src/app/page.tsx` — landing page principal
- `src/app/layout.tsx` — layout root (meta tags, fonts)
- `src/app/robots.ts`, `src/app/sitemap.ts` — SEO
- `src/components/landing/` — todos os componentes da LP
- `src/app/r/` — redirect/referral links
- `docs/marketing/` — guias e templates
- `apps/web/docs/marketing/` — guias de design

## O que a landing já tem
- Hero com vídeo de fundo (neural_network_loop.mp4)
- Seção de features (6 features com ícones)
- Social proof (depoimentos, números)
- Pricing com 3 planos (Essencial, Growth, Performance Max)
- FAQ com schema.org (FAQPage)
- JSON-LD SoftwareApplication
- CTA principal → WhatsApp de vendas
- CTA secundário → /signup
- Componentes interativos: Reveal, Tilt, SpotlightCard, ProductFrame
- Logo, FlowVisual, WhatsAppIcon customizados
- OpenGraph e Twitter Cards configurados

## Design system (tokens)
- Cores: breu (dark), bruma (light bg), iris (primary purple), aco (gray text), sucesso, alerta, atencao
- Fonts: font-display (headings), font-data (monospace/stats)
- Gradients: hf-gradient, shadow-iris

## Decisões já tomadas
- LP é server component (SSR completo pra SEO)
- Interatividade via client components isolados (Reveal, Tilt)
- CTA principal vai pro WhatsApp de vendas (não checkout direto)
- Pricing mostra preços mas redireciona pra signup → checkout
- Mobile-first, dark hero + white body

## Estado atual
- LP completa e no ar
- SEO: robots.ts, sitemap.ts, JSON-LD implementados
- Faltam: A/B testing, analytics de scroll/click, blog/conteúdo, cases de sucesso reais, otimização de Core Web Vitals

## Regras
- Performance primeiro: sem JS desnecessário na LP, images otimizadas
- Sem dependências extras (já tem lucide-react, não adicionar mais icon libs)
- Acessibilidade: contraste, alt text, semantic HTML
- Copy em português brasileiro, tom direto e confiante
