# DECISIONS.md — Decisões do Product Council

**Data:** 2026-07-01

---

## Decisão 1: Sidebar reduzida para 5+1 itens

**Contexto:** Sidebar atual tem 8 itens com sobreposição conceitual (Mensagens/Campanhas/Disparos).

**Decisão:** Sidebar será:
- Início, Campanhas, Grupos, Contatos, Resultados
- Bottom: Configurações

**Motivo:** Lojista 30+ não quer aprender a diferença entre "campanha" e "disparo". Menos = melhor.

**Risco:** Funcionalidade de Disparos e Mensagens precisa ser absorvida dentro de Campanhas sem perder acessibilidade.

**Status:** ✅ Aprovado pelo council

---

## Decisão 2: Resultados como item principal da sidebar

**Contexto:** Tela de Resultados (funil real) existe em `/painel/resultados` mas não tem link na sidebar.

**Decisão:** Adicionar como 5º item. É a tela que comprova ROI.

**Motivo:** Se o lojista não vê resultado, não renova. Esconder essa tela é esconder o motivo de pagar.

**Status:** ✅ Aprovado — implementação imediata

---

## Decisão 3: Dashboard com dados reais, sem estado fake

**Contexto:** Dashboard usa `setTimeout` + dados hardcoded. Primeira impressão é fake.

**Decisão:** Substituir por queries Supabase reais. Se não tem dado, mostrar empty state progressivo (onboarding).

**Motivo:** Dados fake destroem confiança. Lojista pensa "isso nem funciona".

**Status:** ✅ Aprovado — prioridade P0

---

## Decisão 4: Indicações sai da sidebar principal

**Contexto:** Indicação é growth do HubFlow, não valor pro lojista.

**Decisão:** Mover para banner no Dashboard (após ter dados reais) ou dentro de Configurações.

**Motivo:** Cada item na sidebar tem custo cognitivo. Indicação não ajuda o lojista a vender mais.

**Risco:** Pode reduzir indicações se ficar escondido demais. Mitigação: banner contextual no momento certo (lojista satisfeito após ver resultados positivos).

**Status:** ✅ Aprovado com ressalva

---

## Decisão 5: Não implementar features de hype

**Contexto:** Muitos SaaS inflam o produto com IA, chat, CRM, automações.

**Decisão:** NÃO adicionar: IA generativa, chat interno, CRM com pipeline, automações condicionais, analytics avançado, integrações múltiplas.

**Motivo:** Público quer resultado rápido com zero complexidade. Cada feature nova é mais coisa pra aprender. Foco em fazer bem: campanha → grupo → contato → venda.

**Status:** ✅ Aprovado — revisitar apenas se dados de mercado mudarem

---

## Decisão 6: Alertas operacionais são prioridade do próximo ciclo

**Contexto:** Infraestrutura de notificações existe (NotificationBell + Supabase Realtime). Falta lógica de triggers.

**Decisão:** Próximo ciclo implementa 3 alertas: grupo quase cheio, campanha sem link, campanha parada há 3 dias.

**Motivo:** Alertas criam motivo pra voltar ao painel + evitam perda de receita pro lojista.

**Status:** ✅ Aprovado para próximo ciclo

---

## Decisão 7: Remover páginas órfãs

**Contexto:** `/painel/ds`, `/painel/biblioteca`, `/painel/agenda` existem nas rotas mas não estão na sidebar.

**Decisão:**
- `/painel/ds` → remover (dev tool)
- `/painel/biblioteca` → avaliar se tem uso; se não, remover
- `/painel/agenda` → avaliar se tem uso; se não, remover ou incorporar em Campanhas como scheduling

**Status:** ⏳ Pendente validação de uso

---

## Decisão 8: Monetização via gating no ponto de uso

**Contexto:** Plano fica escondido em Configurações. Upgrade path não é claro.

**Decisão:** No próximo ciclo, implementar limites visíveis no ponto de uso:
- "Você atingiu 3/3 campanhas do plano Starter. Upgrade pra criar mais."
- "Grupo cheio e limite de grupos atingido. Upgrade libera +5 grupos."

**Motivo:** Lojista precisa sentir a limitação no momento que quer fazer algo, não num menu perdido.

**Risco:** Se mal implementado, frustra. Mitigar com copy amigável e ação de 1 clique.

**Status:** ✅ Aprovado para ciclo de monetização (após melhorias de base)
