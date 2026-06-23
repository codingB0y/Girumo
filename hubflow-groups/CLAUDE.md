@AGENTS.md

# Contexto mínimo ativo — roteador de lanes

Esta pasta (`devzap-groups`) tem **duas lanes**. A engine é outra pasta (`devzap-engine`, com primer próprio).
Antes de agir, **identifique a lane pela tarefa e carregue só o primer dela** — não carregue as duas, não
recarregue o projeto inteiro.

- **Frontend + UI** — telas, navegação, landing, componentes, visual, design system (`src/app/(app)/*`,
  `src/app/page.tsx`, `src/components/*`, `src/app/globals.css`, libs de cliente).
  → leia `docs/context/frontend-ui.md`.
- **Banco / API** — endpoints, persistência, auth, regra de negócio do servidor, contratos
  (`src/app/api/*`, `src/lib/*-store.ts`, `business-health.ts`, `auth.ts`, `middleware.ts`).
  → leia `docs/context/db-api.md`.

Se a tarefa for **ambígua** entre as duas, pergunte qual lane antes de mexer.

## Feature nova → roteiro (responda ANTES de codar)
Quando o pedido for uma **aplicação/feature nova** (não um ajuste pontual numa lane), NÃO comece a codar.
Primeiro devolva um **mapa de lanes** curto, nesta ordem:
1. **Espinha** — a feature precisa de dado/contrato novo?
   - Sim (quase sempre) → espinha = **Banco/API**: define o contrato primeiro (rota + store + shape em `system/API_CONTRACTS.md`).
   - Só visual (tela/UX, sem dado novo) → **Frontend+UI**. · Só comportamento de WhatsApp (sem dado novo no app) → **Engine** (`devzap-engine`).
2. **Lanes tocadas** — liste quais das 3 entram (Banco/API · Frontend+UI · Engine) e, em 1 linha, o que cada uma faz.
3. **Ordem** — **contrato primeiro** (Banco/API) → Engine e Frontend+UI consomem **em paralelo**. Feature visual-pura ou engine-pura pula etapas.
4. **Próxima lane** — termine dizendo, explícito: *"comece pela lane X (abra o chat dela); quando ela publicar o contrato, abra a lane Y e peça Z"*. Registre o handoff em `system/NEXT.md` (bloco `HANDOFF →`).
**Regra de ouro:** nenhuma lane inventa contrato. Banco/API publica em `API_CONTRACTS.md`; as outras tratam como somente-leitura. Isso é o que mantém tudo conectado sem retrabalho.

## Fronteiras
- **Contrato de API só a lane Banco/API muda** (e atualiza `system/API_CONTRACTS.md`). Frontend trata endpoint como somente-leitura.
- **Design system é da lane Frontend+UI**; Banco/API entrega dado, não pinta tela.
- Tarefa que **cruza** as duas lanes → faça a parte de uma, registre o handoff em `system/NEXT.md`, e abra a outra lane noutro chat.
- Estado atual e pendências: sempre em `system/NEXT.md`.
</content>
