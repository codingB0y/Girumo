# Missão Squad OS — HubFlow Pages: Revisão Backend/Tech

**Squad:** backend
**Prioridade:** 2 (alta)
**Status:** pending
**Origem:** Conversa Igor 2026-07-02

---

## Contexto

Proposta de criar módulo **HubFlow Pages** — landing pages com templates prontos para captação via WhatsApp. Lojista publica em `hubflow.com.br/p/{slug}`. Lead preenche nome+telefone antes de entrar no grupo. Tracking server-side via CAPI/GA4/TikTok.

**Restrições firmes:**
- ❌ NÃO codar nada ainda
- ❌ NÃO definir pricing
- ❌ NÃO tocar landing page atual
- ❌ LPs complementam links rastreados existentes (não removem)

---

## Briefing completo

Ler: [`apps/web/docs/hubflow-pages/BRIEFING.md`](./BRIEFING.md)

---

## O que o Backend Squad precisa validar

### Decisão técnica 1 — Render das LPs
Next.js Route Handler `/p/[slug]` com ISR (Incremental Static Regeneration).
- Cada LP publicada vira página estática na Edge.
- Edições do lojista invalidam via tag de cache.
- Draft = SSR em tempo real.
- **Validar:** viável na stack atual? Limites de ISR fazem sentido? Rota colide com `/painel`?

### Decisão técnica 2 — Schema Supabase
Proposta:
- `landing_page_templates` (templates do time HubFlow)
- `landing_pages` (instâncias publicadas pelos clientes)
- `leads` (com UTMs, fbclid, gclid, ttclid)
- `tracking_events` (log server-side)
- **Validar:** RLS necessário? Quais policies? Sobra coluna no schema atual?

### Decisão técnica 3 — Tracking server-side
- **CAPI (Meta)**: envia eventos de lead via Conversions API
- **GA4 Measurement Protocol**: envia page_view + lead events
- **TikTok Events API**: idem
- Fila por cron ou fila em tempo real?
- **Validar:** complexidade real? Falta credencial? Qual stack pra fila?

### Decisão técnica 4 — Custom domain
Vercel Domains API + middleware.
- Cliente tem `promo.marialoja.com.br` apontando pra HubFlow.
- Middleware identifica tenant pelo domínio.
- **Validar:** viável no plano Vercel atual? Custo? Limites?

### Decisão técnica 5 — Performance mobile
3G/4G de lojista brasileiro. LCP < 2s.
- **Validar:** estratégia de lazy load de pixel? SSR vs SSG tradeoff? Tamanho máximo de JS?

### Decisão técnica 6 — LGPD / privacidade
- Consentimento de lead armazenado
- IP hash (sem armazenar IP puro)
- Direito de exclusão do lead
- **Validar:** o que muda no Supabase RLS? Precisa de edge function?

### Decisão técnica 7 — Integração com WhatsApp
Hoje: clicar no link → entrar no grupo via Evolution API.
Amanhã com LP: lead preenche form → entra na fila de adição ao grupo.
- **Validar:** reusar `add-participant` existente? Criar endpoint novo? Risco de Meta ban?

---

## Entregáveis do Backend Squad

1. Validação técnica das 7 decisões (✅/❌/🤔 + justificativa + alternativa se houver)
2. Estimativa de esforço por sprint (1 sprint = 1 semana)
3. Dependências externas (A API key foi rejeitada. Confira a chave no setup ou solicite uma nova.Google/TikTok APIs)
4. Riscos técnicos não cobertos no briefing
5. Schema refinado com RLS policies propostas
6. Diagrama de fluxo de dados (lead → DB → WhatsApp → tracking)

---

## Recursos

- Stack: Next.js 15 + Supabase + Tailwind
- Edge Functions já integradas (`apps/web/supabase/functions/`)
- Evolution API já integrada pra WhatsApp
- Schema atual em `apps/web/docs/audit/` (se houver)
- Arquitetura de tracking existente: `apps/web/src/lib/analytics/` (verificar)

---

## Próximo passo

Sincronizar com Product Squad (escopo) e Growth Squad (tracking/métricas). Quando os 3 aprovarem, plano de implementação completo.