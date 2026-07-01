# Objetivo

Auditar e melhorar a experiência completa do HubFlow (Landing, Login, Cadastro) focando em:
- Aumentar percepção de valor e clareza
- Melhorar conversão
- Otimizar performance percebida
- Manter consistência com branding

Preservar arquitetura. Modificar somente o necessário.

# Plano

## Fase 1 — Landing Page (5 itens)
1. Remover vídeo de fundo (neural_network_loop.mp4)
2. Remover animação `dz-float` do ProductFrame
3. Surfaçar número real no social proof ("127 lojistas")
4. Suavizar FAQ com animação de abertura
5. CTA sticky mobile: usar `<Link>` + feedback tátil

## Fase 2 — AuthShell (3 itens)
6. Reescrever copy — eliminar jargão técnico
7. Corrigir acentuação
8. Reescrever rodapé do card com linguagem acessível

## Fase 3 — Login (1 item)
9. Ajustar checklist do AuthShell com copy para lojistas

## Fase 4 — Signup (2 itens)
10. Alinhar promessa LP↔Signup ("7 dias grátis, sem cartão")
11. Melhorar context box com copy motivacional

## Fase 5 — Performance (2 itens)
12. Verificar e remover assets pesados não utilizados
13. Garantir lazy-load em imagens abaixo do fold

**Total: 13 itens**

---

# Checklist

## Fase 1 — Landing Page
- [x] 1. Remover vídeo de fundo do hero
- [x] 2. ~~Remover `dz-float` do ProductFrame~~ — DESCARTADO (usuário quer manter)
- [x] 3. Social proof — surfaçar "127 lojistas"
- [x] 4. FAQ — animação suave de abertura (grid-rows trick)
- [x] 5. CTA sticky mobile — `<Link>` + `active:scale-[0.97]`

## Fase 2 — AuthShell
- [x] 6. Reescrever copy (eliminar jargão: tenant, engine, RLS, Postgres)
- [x] 7. Corrigir acentuação ("organizacao" → "organização")
- [x] 8. Rodapé acessível (feito junto com item 6)

## Fase 3 — Login
- [x] 9. Checklist customizada para quem volta (não "crie conta")

## Fase 4 — Signup
- [x] 10. Alinhar promessa "7 dias grátis — sem cartão, sem compromisso"
- [x] 11. Rodapé motivacional: "Seus dados ficam protegidos. Cancele quando quiser."

## Fase 5 — Performance
- [x] 12. Deletado `neural_network_loop.mp4` (2.6MB não usado)
- [x] 13. Lazy-load confirmado (Next.js Image sem `priority` = lazy por padrão)

**Progresso: 13/13 concluídos (1 descartado)**

---

# Decisões

| # | Decisão | Motivo |
|---|---------|--------|
| 1 | Remover `neural_network_loop.mp4` | LCP killer + posicionamento errado (AI genérica vs. ferramenta WhatsApp para lojistas) |
| 2 | Manter `dz-float` | Decisão do usuário — quer manter a animação do mockup |
| 4 | FAQ: `grid-rows-[0fr]→[1fr]` | `<details>` nativo não anima height; grid-rows resolve sem JS |
| 5 | CTA mobile: `<Link>` + `active:scale` | Client-side nav mais rápida + feedback tátil visual |
| 6 | Eliminar "tenant", "engine", "RLS", "Postgres" | Público é lojista, não dev. Jargão gera confusão |
| 9 | Login: checklist ≠ signup | Quem volta já tem conta — mostrar benefícios de uso |
| 10 | Signup: "7 dias grátis, sem cartão" | LP promete isso; signup precisa confirmar pra não gerar hesitação |
| 11 | Rodapé: "Cancele quando quiser" | Reduz medo de compromisso — mais útil que jargão de infra |

---

# Arquivos alterados (4 arquivos + 1 asset deletado)

| # | Arquivo | Mudanças |
|---|---------|----------|
| 1 | `apps/web/src/app/page.tsx` | Removido `<video>`, social proof "127 lojistas", FAQ animado, CTA mobile com Link |
| 2 | `apps/web/src/components/auth-shell.tsx` | Copy sem jargão, checklist lojista, rodapé acessível, acentuação |
| 3 | `apps/web/src/app/login/page.tsx` | Checklist customizada para quem volta |
| 4 | `apps/web/src/app/signup/page.tsx` | "7 dias grátis" alinhado com LP, copy motivacional |
| 5 | `apps/web/public/neural_network_loop.mp4` | **DELETADO** (2.6MB) |

---

# Ganho esperado

| # | Métrica | Antes | Depois |
|---|---------|-------|--------|
| 1 | LCP (hero) | ~3-4s (vídeo 2.6MB bloqueando) | ~1-1.5s (grid CSS + Image otimizada) |
| 2 | Conversão signup | Promessa desalinhada LP↔Signup | Consistente ("7 dias grátis, sem cartão") |
| 3 | Confiança auth | Jargão técnico (tenant, engine, RLS) | Linguagem de lojista |
| 4 | UX mobile | Hard nav `<a>` sem feedback | Client-side `<Link>` + active:scale |
| 5 | Bundle deploy | +2.6MB de vídeo não utilizado | Eliminado |
| 6 | Credibilidade | "lojistas já automatizam" (genérico) | "127 lojistas já automatizam" (específico) |
| 7 | Polimento | FAQ abre seco, sem transição | Animação suave CSS-only |

---

# Oportunidades fora do escopo (não implementadas)

- [ ] Adicionar fotos/avatares reais nos depoimentos
- [ ] Comprimir `painel-home.png` (4.3MB fonte, mas Next.js otimiza em runtime)
- [ ] Transição visual dark→light entre LP e Login (requeriria AuthShell dark)

---

# Sprint 2 — Novas funcionalidades

## Fase 6 — OAuth Social (Google)
14. Configurar Supabase Google OAuth provider (backend)
15. Adicionar botão "Entrar com Google" no Login
16. Adicionar botão "Criar conta com Google" no Signup

## Fase 7 — Página /forgot-password
17. Criar página `/forgot-password` com formulário de e-mail
18. Criar API route para envio de reset (Supabase `resetPasswordForEmail`)
19. Linkar corretamente do Login

## Fase 8 — Indicador de progresso signup → onboarding
20. Criar componente de stepper/progress
21. Integrar no Signup (step 1) e Onboarding (steps 2-3)

## Checklist Sprint 2

- [x] 14. Supabase Google OAuth — API routes (`/api/auth/google` + `/api/auth/callback`)
- [x] 15. Botão "Entrar com Google" no Login
- [x] 16. Botão "Criar conta com Google" no Signup
- [x] 17. Página `/forgot-password` — melhorada com estado de sucesso, checklist, UX polida
- [x] 18. API route reset password — já existia via Supabase client-side (mantido)
- [x] 19. Link Login → forgot-password — já existia (confirmado funcional)
- [x] 20. Componente `SignupProgress` (stepper 3 passos)
- [x] 21. Integrado no Signup (step 1) e Onboarding (step 2)

**Sprint 2: 8/8 concluídos ✓ Build OK**

## Arquivos alterados Sprint 2

| # | Arquivo | Tipo | Mudança |
|---|---------|------|--------|
| 1 | `apps/web/src/app/api/auth/google/route.ts` | NOVO | Inicia fluxo OAuth Google via Supabase |
| 2 | `apps/web/src/app/api/auth/callback/route.ts` | NOVO | Callback OAuth — troca code, cria org se novo, seta cookie |
| 3 | `apps/web/src/app/login/page.tsx` | EDITADO | Botão Google + GoogleIcon + divider |
| 4 | `apps/web/src/app/signup/page.tsx` | EDITADO | Botão Google + GoogleIcon + divider + SignupProgress |
| 5 | `apps/web/src/app/forgot-password/page.tsx` | EDITADO | UX melhorada: estado de sucesso, checklist, validação |
| 6 | `apps/web/src/components/signup-progress.tsx` | NOVO | Stepper visual 3 passos (criar conta → conectar → disparar) |
| 7 | `apps/web/src/app/(app)/onboarding/page.tsx` | EDITADO | SignupProgress integrado (step 2) |
