# Missão Squad OS — HubFlow Pages: Revisão Growth

**Squad:** growth
**Prioridade:** 2 (alta)
**Status:** pending
**Origem:** Conversa Igor 2026-07-02

---

## Contexto

Proposta de criar módulo **HubFlow Pages** — landing pages com templates prontos. Cada LP publicada vira página indexada no Google (SEO compounding), captura lead com dados ricos (UTMs + pixels), prepara o terreno pra crescimento via ads pagos.

**Restrições firmes:**
- ❌ NÃO codar nada ainda
- ❌ NÃO definir pricing
- ❌ NÃO tocar landing page atual

---

## Briefing completo

Ler: [`apps/web/docs/hubflow-pages/BRIEFING.md`](./BRIEFING.md)

---

## O que o Growth Squad precisa avaliar

### Estratégia 1 — SEO automático de LPs
Cada LP publicada gera:
- Sitemap entry automática
- OpenGraph tags com foto do cliente
- Schema.org (`Product`, `LocalBusiness`, `Offer`)
- robots.txt permission
- **Validar:** impacto real? Risco de canibalização com landing atual da HubFlow? Como evitar conteúdo thin?

### Estratégia 2 — Biblioteca de Copy por nicho
Lojista escolhe entre textos prontos por nicho (roupa, salão, restaurante, atacado) e só edita.
- **Validar:** quais nichos cobertos primeiro? Quantos textos por nicho? Como captar e evoluir?

### Estratégia 3 — Aha Moment trigger
LP em `draft` há mais de 48h → mostra no dashboard: "Sua página tá vazia. Publique pra começar."
- **Validar:** boa heurística? Outros canais de reativação (email, notificação)?

### Estratégia 4 — Onboarding das LPs
Cliente novo da HubFlow — qual o caminho até publicar a 1ª LP?
- Sugestões: tour in-app, email drip, modelo pré-configurado por nicho
- **Validar:** qual fluxo ativa mais rápido? Métrica de "ativação" = LP publicada?

### Estratégia 5 — Tracking server-side = confiabilidade
Pixel client-side perde ~30% dos eventos (AdBlock, Safari ITP). Cliente que paga anúncio no Meta perde leads e desconfia.
- CAPI/GA4 MP/TikTok Events cobrem essa perda
- **Validar:** vale comunicar como diferencial? Como provar ROI pro cliente?

### Estratégia 6 — Funil de aquisição de HubFlow
Cliente publica LP → atrai leads pro próprio grupo → LP indexada no Google com link pra HubFlow → mais tráfego orgânico pra HubFlow → mais signups.
- **Validar:** dimensão real do PLG? Quanto tempo pra SEO compounding?

---

## Entregáveis do Growth Squad

1. Resposta às 6 estratégias (✅/❌/🤔 + sugestão)
2. North Star Metric proposta pro módulo HubFlow Pages
3. Funil de ativação mapeado (passos + gatilhos + métricas)
4. Canais de reativação priorizados
5. Plano de lançamento (beta vs GA vs waitlist)
6. Mensagem de comunicação interna (como anunciar pro cliente existente)

---

## Recursos

- Briefing: `apps/web/docs/hubflow-pages/BRIEFING.md`
- Auditoria anterior do painel: `apps/web/docs/audit/PANEL_AUDIT.md` (pode ter insights)
- Métricas de negócio: conversar com Data Squad

---

## Próximo passo

Sincronizar com Product Squad (templates prioritários) e Backend Squad (viabilidade do tracking). Após 3 aprovações, plano de lançamento completo.