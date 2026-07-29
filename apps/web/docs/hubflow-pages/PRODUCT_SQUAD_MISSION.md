# Missão Squad OS — HubFlow Pages: Revisão Product

**Squad:** product
**Prioridade:** 2 (alta)
**Status:** pending
**Origem:** Conversa Igor 2026-07-02

---

## Contexto

Foi proposta a criação de um módulo chamado **"HubFlow Pages"** — landing pages com templates prontos, integradas ao funil de captação WhatsApp existente. Lojista escolhe um template, preenche 5-7 campos, publica em `hubflow.com.br/p/{slug}`. Quem visita a página preenche nome + WhatsApp ANTES de ser adicionado ao grupo.

**Por que agora:** 80% dos lojistas brasileiros não sabem fazer LP. Quem tem LP converte 3-5x mais. Hoje a HubFlow entrega "link rastreado" — adicionar LP vira "stack completa de captação", diferenciando de Z-API/Blip/WPPConnect.

**Restrições firmes:**
- ❌ NÃO codar nada ainda
- ❌ NÃO definir pricing
- ❌ NÃO tocar landing page atual
- ❌ NÃO remover links rastreados — LP **complementa**, não substitui

---

## Briefing completo

Ler: [`apps/web/docs/hubflow-pages/BRIEFING.md`](./BRIEFING.md)

Resumo: schema proposto, 7 templates por gatilho psicológico, fluxo de lead em 3 etapas, decisões abertas por squad.

---

## O que o Product Squad precisa responder

Revisar e opinar (✅ concorda / ❌ discorda / 🤔 mais info):

### Decisão 1 — Lead Data First
Lead preenche nome + WhatsApp ANTES de ser redirecionado pro grupo. 1 clique extra, mas lead vale 100x mais porque você tem o telefone dele (não só "alguém clicou").
- **Recomendação briefing:** sim, obrigatório.
- **Validar:** público lojista vai aceitar esse friction? Vale considerar versão "fast" sem captura pra quem quer link direto?

### Decisão 2 — Templates por gatilho psicológico
Lista proposta (7 templates): promoção relâmpago, sorteio, catálogo, pré-venda, atacado, agendamento, última unidade.
- **Validar:** faz sentido pro público HubFlow? Faltou nicho? Sobrou nicho irrelevante?

### Decisão 3 — Anti-spam LGPD
Checkbox obrigatório: "Eu aceito ser adicionado ao grupo [nome] e receber mensagens sobre [tema]". Armazena `consent_at`.
- **Validar:** juridicamente suficiente? Precisa de texto longo de política? Quem é responsável jurídico?

### Decisão 4 — Editor = form simples (não drag-and-drop)
Lojista preenche 5-7 campos, preview ao vivo, publica em 2 minutos.
- **Validar:** público aceita ou quer mais controle? Vale drag-and-drop no plano top?

### Decisão 5 — Captura no Aha Moment
LP em draft > 48h → trigger no dashboard: "Sua página tá vazia. Publique pra começar."
- **Validar:** boa heurística ou vai irritar?

---

## Entregáveis do Product Squad

1. Resposta às 5 decisões acima (✅/❌/🤔 + justificativa)
2. Sugestões de ajuste no briefing
3. Riscos não cobertos
4. Personas impactadas (lojista vs lead final)
5. Ordem recomendada dos 7 templates (qual fazer primeiro?)

---

## Recursos

- Briefing: `apps/web/docs/hubflow-pages/BRIEFING.md`
- Decisão original registrada no grafo (kg_query: "HubFlow Pages" mode="local")
- Product Council anterior sobre painel: `apps/web/docs/audit/PANEL_AUDIT.md`

---

## Próximo passo

Após revisão do Product Squad, sincronizar com Backend Squad (viabilidade técnica) e Growth Squad (estratégia). Quando os 3 aprovarem, aí começa implementação.