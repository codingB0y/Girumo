# Contexto mínimo ativo — como trabalhar o DevZap em chats separados

Regra: **nunca carregar o projeto inteiro num chat.** Cada chat opera UMA lane, carrega só o
primer dela e mexe só nos arquivos da sua área. Contexto pequeno, barato, sem um chat pisando no outro.

## As 3 lanes

| Lane | Pasta | Primer | Manda em |
|---|---|---|---|
| **Frontend + UI** | `devzap-groups` | [frontend-ui.md](frontend-ui.md) | Telas, navegação, landing, componentes, visual, design system |
| **Banco / API** | `devzap-groups` | [db-api.md](db-api.md) | Endpoints, persistência, auth, regra de negócio servidor, contratos |
| **Engine** | `devzap-engine` | `devzap-engine/CLAUDE.md` (auto-carrega) | Baileys, captura, disparo, anti-ban |

## Como abrir cada chat

**Engine** (pasta `devzap-engine`): abra uma **janela nova** do VS Code nessa pasta. O primer
(`CLAUDE.md`) **carrega sozinho** — só descreva a tarefa.

**Frontend+UI e Banco/API** (ambas em `devzap-groups`): abra um **chat novo** (mesma janela basta).
O `CLAUDE.md` raiz **carrega sozinho** e funciona como roteador: descreva a tarefa e ele identifica a
lane e puxa o primer certo (`frontend-ui.md` ou `db-api.md`). Se a tarefa for ambígua, ele pergunta a lane.
Você não precisa digitar "leia o primer".

> Por que o roteador: as duas lanes dividem a mesma pasta, então o auto-load não distingue a lane sozinho.
> O `CLAUDE.md` raiz resolve isso roteando pela tarefa. A engine, por ser outra pasta, auto-carrega direto.

## Fronteiras (o que evita colisão entre chats)
- **Contrato de API é da lane Banco/API.** Quem muda contrato atualiza `system/API_CONTRACTS.md`.
  Frontend+UI (consome) e Engine (consome) tratam endpoints como **somente leitura**.
- **Design system é da lane Frontend+UI.** Banco/API entrega dado, não pinta tela.
- Tarefa que cruza lanes → faça a parte de uma, registre handoff em `system/NEXT.md`, abra a outra noutro chat.

## Fontes de verdade compartilhadas (todas as lanes podem LER)
`system/NEXT.md` (estado/pendências) · `system/API_CONTRACTS.md` · `system/DB_SCHEMA.md` ·
`system/PROJECT_RULES.md` · `system/COMPETITIVE.md` · `docs/PROJECT_CONTEXT.md` · `docs/CHANGELOG.md`.
</content>
