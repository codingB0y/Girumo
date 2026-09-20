# Funil de disparos — prompts de sessão

Um prompt por PR. Cole inteiro na primeira mensagem de uma sessão nova do Claude Code
(desktop), na pasta `C:\Users\Igor\Desktop\HubFlow-platform`. Antes de colar, ajuste na
própria janela: **modelo Opus 5, esforço medium, fast mode desligado, conectores só
Supabase** (menu + → Conectores). O prompt também manda o Claude conferir isso e parar
se estiver diferente.

Referências que os dois prompts usam:

- Spec: `docs/superpowers/specs/2026-09-19-funil-de-disparos-design.md`
- Plano do PR 1: `docs/superpowers/plans/2026-09-19-funil-de-disparos-motor.md`
- Mockup aprovado: https://claude.ai/artifact/6aw3vfm7oFpX6ETEg3SBH8 (direção C +
  prévia de celular da B). Fontes locais dos artboards:
  `C:\Users\Igor\Desktop\girumo-design-refs\funil-mockup\` (`project/OpcaoC.dc.html`,
  `project/OpcaoB.dc.html`, `frag/*.body.html`).

---

## PR 1 · Motor

```text
# Funil de disparos · PR 1 · Motor

Você vai EXECUTAR um plano já escrito, revisado e aprovado. Não replaneje, não reabra
brainstorming, não reescreva o spec. Se algo no plano não bater com o código, pare,
diga o que não bate e proponha a menor correção.

## Arquivos de referência
- Spec: docs/superpowers/specs/2026-09-19-funil-de-disparos-design.md
- Plano: docs/superpowers/plans/2026-09-19-funil-de-disparos-motor.md
- Os dois ainda NÃO estão commitados: vivem no working tree do checkout principal
  (C:\Users\Igor\Desktop\HubFlow-platform). Depois de criar o worktree, copie os dois
  para o mesmo caminho dentro dele. A Task 7 do plano commita.
- Mockup aprovado (só contexto; a tela é o PR 2): https://claude.ai/artifact/6aw3vfm7oFpX6ETEg3SBH8

## Turno 1: só conferências, depois encerre o turno
1. mcp__ccd_connectors__session_connectors_status. Deve haver só Supabase ligado entre os
   conectores. Se sobrar outro, desligue com set_session_connector_enabled (um por um) e
   encerre o turno: a mudança vale a partir do próximo.
2. mcp__ccd_session_mgmt__get_session self: confirme model Opus 5 e effort medium.
   Se estiver diferente, diga qual é e pare. Você não pode trocar o seu próprio modelo
   nem esforço; eu troco na janela.
3. mcp__ccd_session_mgmt__list_sessions: se outra sessão estiver aberta nesta pasta,
   avise. O HEAD do git é compartilhado entre sessões; por isso todo trabalho vai em
   worktree.
4. Leia o plano inteiro e o spec. Responda com o checklist das 7 tarefas e pare.

## Turno 2 em diante: execução
- Skill obrigatória: superpowers:subagent-driven-development sobre o plano, um
  subagente por tarefa, revisão de spec e de qualidade entre tarefas.
- Worktree: EnterWorktree com nome funil-motor (base origin/main). Nunca checkout -b no
  checkout principal. Copie apps/web/.env.local do checkout principal para o worktree
  (vercel env pull omite as variáveis Sensitive). Não rode npm install no worktree:
  node_modules lá é junction para o checkout principal.
- Modelos por tarefa (parâmetro `model` do Agent). Nunca haiku: as tools deste projeto
  não cabem no contexto dele.
  - Task 1 (migração): implementador opus. As DDLs em DEV e PROD são passos MEUS:
    quando chegar no Step 4 e no Step 5, pare, me entregue o SQL pronto para colar no
    editor de cada projeto e espere eu confirmar "aplicado" antes de seguir. Não tente
    rodar DDL pelo MCP do Supabase: o classificador barra, e DDL só em dev deixa o gate
    de drift vermelho para todo mundo. npm run schema:baseline também é meu (precisa
    de credencial de prod); me avise quando for a hora.
  - Tasks 2 a 6: implementador sonnet.
  - Revisor de conformidade com o spec e revisor de qualidade de cada tarefa: opus.
  - Task 7 (quadro, gate local, PR): você mesmo, sem subagente. O move_card em prod
    também é meu: me dê o SQL.
- Regras do projeto (CLAUDE.md e memória valem por inteiro). As que mais mordem aqui:
  toda query em tabela com tenant_id filtra .eq('tenant_id'); migração nos DOIS bancos;
  antes do push rodar npx tsc --noEmit -p apps/web E -p apps/worker (lint e tsx --test
  não checam tipo) e infra/scripts/verify-local.ps1; comandos em PowerShell 5.1 (sem &&);
  conferir git diff --cached em chamada separada antes de commitar (outra sessão pode
  ter sujado o índice); PR revisado, CI verde, mergeado e branch apagada NESTA sessão.
- Não leia o projeto inteiro. Abra só o que a tarefa cita.

## Ao fim de CADA tarefa (obrigatório)
1. mcp__ccd_session_mgmt__get_usage self.
2. Uma linha: "Contexto: X% · tarefa N/7 concluída · commit <hash>".
3. Recomendação explícita, sempre: "continuar nesta sessão" ou "abrir sessão nova".
   Abrir sessão nova quando X > 60%, ou quando a próxima etapa for de outro PR. Nesse
   caso escreva o prompt de continuação completo: o que está feito (commits, worktree,
   branch), o que falta, e repita os blocos "Turno 1", "Modelos por tarefa" e "Ao fim de
   cada tarefa" deste prompt.

## Ao encerrar a sessão
- Comando de registro no grafo, em PowerShell:
  rag insert "decisão: funil de disparos v1 = roteiro puro que pré-preenche agendamentos comuns; copy genérica montada no cliente; etapa relâmpago abre a Oferta na promote_due_schedules com lid_map do histórico; rastreio por broadcasts.funnel_run_id; direção visual C + prévia de celular. Spec docs/superpowers/specs/2026-09-19-funil-de-disparos-design.md, plano PR1 docs/superpowers/plans/2026-09-19-funil-de-disparos-motor.md" --source decisao-2026-09-19
- "PRs que deixei abertos: ..." (ou "nenhum").
- Recomendação final: o PR 2 (tela) é SEMPRE sessão nova. Aponte o prompt dele em
  docs/superpowers/plans/2026-09-19-funil-de-disparos-prompts-sessao.md e diga se
  a Task 1 Step 1 encontrou coluna de segmento em organizations (o PR 2 precisa saber
  se o nicho grava em organizations.niche ou em coluna já existente).
```

---

## PR 2 · Tela (só depois do PR 1 mergeado)

```text
# Funil de disparos · PR 2 · Tela (sub-aba Funil)

O PR 1 (motor) já está em main: migração aplicada nos dois bancos, módulos puros em
apps/web/src/lib/funnels/, campos funnelTemplateId/funnelRunId na rota de mensagens,
modo rascunho (broadcastId) na rota de ofertas e chip do funil na Agenda. Este PR é
SÓ a tela. Nada de motor, nada de migração nova.

## Arquivos de referência
- Spec (seções 2, 3, 5 e 6): docs/superpowers/specs/2026-09-19-funil-de-disparos-design.md
- Interfaces prontas: apps/web/src/lib/funnels/{templates,render,api,agenda}.ts (leia os
  quatro; os tipos e funções de lá são o contrato).
- Mockup aprovado: https://claude.ai/artifact/6aw3vfm7oFpX6ETEg3SBH8. Direção C (Balcão
  editorial: coluna de 760 px, hero Aurora VIP escuro, seções 01/02/03 em Instrument
  Serif itálico, cards em duplo bisel, botão pílula com ícone aninhado) + a prévia de
  celular da direção B dentro de cada etapa aberta. Leia os fontes com a ferramenta
  Artifact (action read, path project/OpcaoC.dc.html e project/OpcaoB.dc.html) ou em
  C:\Users\Igor\Desktop\girumo-design-refs\funil-mockup\project\.
- Nicho da loja: gravar em organizations.niche OU na coluna que o PR 1 encontrou
  (ver descrição do PR 1). Nome da loja é organizations.name.
- Padrões de tela: apps/web/src/components/painel/messages/{messages-tab,schedule-composer,messages-agenda}.tsx
  e o design system do painel (memória painel-design-system-balcao; tokens em
  apps/web/src/app/globals.css). Uma foto por etapa (broadcasts tem um media_id só).

## Turno 1: só conferências, depois encerre o turno
1. mcp__ccd_connectors__session_connectors_status: só Supabase ligado; desligue o resto
   e encerre o turno.
2. mcp__ccd_session_mgmt__get_session self: Opus 5, effort medium. Diferente: diga e pare.
3. git fetch origin main; confirme que o PR 1 está em main (git log origin/main --oneline
   -20 deve mostrar "feat(funil)").
4. Responda com um resumo de 10 linhas do que a tela precisa fazer e pare.

## Turno 2: plano
- Skill superpowers:writing-plans, a partir da seção 5 do spec e do mockup. Salvar em
  docs/superpowers/plans/2026-09-19-funil-de-disparos-tela.md. Tarefas esperadas:
  store-fields (loja/nicho com leitura e gravação), funnel-hero, whatsapp-preview
  (componente puro, testável), funnel-step-card, funnel-tab (estado, confirmação em
  série com funnelRunId, tratamento de falha parcial, etapa no passado desmarcada,
  botão desabilitado com campo vazio), registro da sub-aba em messages-tab, teste de
  componente, E2E (escolher Live, preencher, confirmar, 4 linhas na Agenda com chip,
  a 3ª com oferta em rascunho ligada). Mobile-first: no celular a coluna é a tela.
- Me mostre o plano e espere aprovação antes de executar.

## Execução (após aprovação)
- superpowers:subagent-driven-development. Worktree EnterWorktree funil-tela (base
  origin/main). Copiar apps/web/.env.local do checkout principal. Sem npm install no
  worktree.
- Modelos (parâmetro `model` do Agent). Nunca haiku.
  - Componentes puros (whatsapp-preview, store-fields, testes): sonnet.
  - funnel-tab, funnel-step-card, funnel-hero, registro na aba, E2E: opus.
  - Revisores: opus.
- Verificação visual é obrigatória antes de fechar: preview_start do dev server,
  screenshot da sub-aba Funil no desktop e em 390 px (resize_window mobile), conferir
  console sem erro. Lembre que preview_start serve o checkout principal, não o worktree
  (memória finding-preview-serve-checkout-principal): faça o Playwright subir o servidor
  a partir do worktree, ou me peça para apontar o preview.
- Mesmas regras do projeto do PR 1: tenant_id, tsc dos dois apps, verify-local.ps1,
  PowerShell 5.1, git diff --cached separado, PR fechado nesta sessão, card do quadro
  (funil-de-disparos → no_ar_nao_verificado ao mergear; no_ar_verificado só com prova
  colhida na hora).

## Ao fim de CADA tarefa (obrigatório)
1. mcp__ccd_session_mgmt__get_usage self.
2. "Contexto: X% · tarefa N/M concluída · commit <hash>".
3. "continuar nesta sessão" ou "abrir sessão nova" (X > 60% → nova, com prompt de
   continuação completo).

## Ao encerrar
- rag insert "decisão: sub-aba Funil entregue (PR #N): ..." --source decisao-<data>
- "PRs que deixei abertos: ...".
- Recomendação final: se sobrou algo (Resultados por funil, cancelar funil inteiro,
  recorrência da Grade do dia), diga que é v2 e sessão nova; senão, encerrar.
```
