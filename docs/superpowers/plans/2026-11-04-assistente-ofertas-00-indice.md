# Assistente de ofertas: índice da série

**O quê:** a lojista escreve um pedido ("monta os posts da semana da coleção de verão pros grupos VIP") e recebe uma
**proposta** de posts (campanha, dia e hora, texto, motivo), que ela revisa e agenda pelo painel. É a primeira
orquestração de agente com LangChain/LangGraph no Girumo.

**Card do quadro:** `assistente-ofertas` (criar como `em_construcao` ao começar o PR 1).
**Origem:** aula de 03/11/2026 sobre orquestração de agentes (sessão na nuvem) e este plano, de 04/11.

## Decisões de desenho (valem para a série inteira)

1. **TypeScript, dentro do `apps/web`.** LangChain.js 1.x (`createAgent`, que roda sobre o LangGraph). Nada de
   serviço Python à parte.
2. **Um agente com 4 ferramentas, não um supervisor com subagentes.** A aula mostrou o padrão supervisor, mas com 4
   ferramentas ele só acrescenta custo e latência. Dividir em subagentes quando passar de cerca de 8 ferramentas ou
   quando dois papéis pedirem instruções conflitantes. A estrutura (`createReadTools`, `createProposeTool`) já deixa
   essa troca barata.
3. **O agente só propõe.** A única ferramenta "de ação" é `propor_semana`, que valida e devolve a proposta para a rota.
   Ela não grava nada no banco e não posta. Quem agenda é a lojista, pelo mesmo endpoint que o painel já usa
   (`POST /api/campanhas/[slug]/messages`), com `mentionAll: false`. Isso respeita o anti-ban (`hubflow-engine/DECISIONS.md`,
   orçamento de @todos zerado no #571) e mantém os limites de plano no caminho de sempre.
4. **O `tenantId` vem só da config da execução** (`config.configurable.tenantId`), montada no servidor por
   `buildRunConfig`. Nenhuma ferramenta aceita tenant como argumento. Conferido em 03/11 com o pacote real: o modelo
   pede `tenantId: "OUTRA-LOJA"` e a ferramenta continua vendo a loja da sessão. Toda query segue com
   `.eq('tenant_id')`.
5. **Sem migração na série.** Sem checkpointer, sem tabela de conversa: a proposta vive na resposta HTTP e na tela.
   Se um dia precisar de memória de conversa, o `PostgresSaver.setup()` **não** pode rodar em produção (é DDL fora do
   CI). O SQL dele vira migração em `apply-order.txt`, com RLS.
6. **Sem dado de pessoa no prompt.** As ferramentas devolvem agregados: campanha, contagem, soma. Nunca telefone, nome
   de cliente ou JID de grupo.
7. **Liberado por loja.** `ASSISTENTE_OFERTAS_TENANTS` (ids separados por vírgula, ou `*`). Vazio = desligado, e a rota
   responde 404. A vendedora (`seller`) fica de fora automaticamente: `podeAcessar` nega rota que não está nos módulos
   dela.
8. **Teto de gasto:** 10 pedidos por hora por loja (`checkRateLimit`), `recursionLimit` 16, timeout de 50 s e
   `maxTokens` 4096.
9. **Rastreamento:** LangSmith **desligado** em preview e produção (`LANGSMITH_TRACING` nunca setado na Vercel),
   porque mandaria pedido e textos para fora do país. Em dev local, só com loja de teste.

## Versões fixadas

`langchain@1.5.18`, `@langchain/core@1.2.18`, `@langchain/anthropic@1.5.12`, instaladas com `-E` (exatas). São as
últimas com mais de duas semanas em 04/11/2026. As versões 1.6.x saíram em 22/10 e 03/11. O `@langchain/langgraph`
vem como dependência do `langchain` (no teste resolveu para 1.6.0) e fica fixado pelo `package-lock.json`. Atualizar
só em PR próprio.

Conferido em 04/11 com essas versões, numa pasta isolada com `tsc` strict: todos os blocos de código dos planos 1 a 3
compilam e os 23 testes passam (`run-config`, `model`, `read-tools`, `proposal`, `agent`, `handler`). Os arquivos de
store (PR 2) e a rota (PR 3) não puderam ser compilados lá, porque dependem do repo: conferir no worktree.

## Ordem e dependências

| PR | O quê | Depende de | Plano |
|---|---|---|---|
| 1 | Fundação: dependências, `run-config.ts`, `model.ts`, `ScriptedChatModel` para teste | — | `2026-11-04-assistente-ofertas-pr1-fundacao.md` |
| 2 | Ferramentas de leitura e as duas funções de store que faltam | 1 | `2026-11-04-assistente-ofertas-pr2-leitura.md` |
| 3 | Proposta (regras), `propor_semana`, agente, rota `POST /api/agents/assistente`, contrato | 2 | `2026-11-04-assistente-ofertas-pr3-agente-e-rota.md` |
| 4 | Tela `/painel/assistente`: **mockup primeiro**, depois o plano de código | 3 | `2026-11-04-assistente-ofertas-pr4-tela.md` |
| 5 | Avaliação com pedidos fictícios, ligar para a piloto, prova, card | 4 | `2026-11-04-assistente-ofertas-pr5-avaliacao-e-prova.md` |

Um implementador, em sequência. Os PRs 1 a 3 não mudam nada visível: a rota nasce desligada (lista vazia = 404).

## Decisões em aberto (para o Igor)

- **D1. Posts por campanha por dia.** O padrão do plano é **no máximo 2** (`MAX_POSTS_PER_CAMPAIGN_PER_DAY`). Depois das
  restrições da Moda kids (23/10 e 03/11), o plano escolheu o lado conservador. Mudar é trocar uma constante.
- **D2. Janela de horário.** O padrão é **8h às 21h, horário de Brasília** (`POST_HOURS_BR`).
- **D3. Modelo.** Começa com `claude-sonnet-5-5`. O PR 5 mede se o `claude-haiku-5-5` acerta as regras com a mesma
  frequência. Se acertar, troca (é bem mais barato).

## O que vale em todos os planos

- Antes de cada PR: `git fetch origin main`, worktree novo a partir de `origin/main`, conferir que o PR anterior está
  em `main`.
- Código e commits em inglês. Mensagens ao usuário e à IA em português.
- Gate antes do push: os dois `tsc`, `npm test` e o build (`infra/scripts/verify-local.ps1` no PC; na nuvem,
  `npx tsc --noEmit -p apps/web` + `npm test -w apps/web` + `npm run build -w apps/web`).
- **Nenhum teste chama a Anthropic.** O CI não tem chave nem deve gastar. Todo teste de agente usa o
  `ScriptedChatModel` do PR 1. Só o script do PR 5 chama a API, e roda à mão.
- `docs/superpowers/plans/.impeccable/` é cache de hook: nunca commitar.

## Fechamento de cada PR

Revisar → CI verde → mergear → apagar a branch, na mesma sessão (CLAUDE.md, "Regra de PR"). Atualizar o `blocker` do
card `assistente-ofertas` em prod a cada PR (`move_card` para o mesmo status não grava evento nem limpa o `blocker`).
Revisão de segurança antes de mergear o PR 3 (tenant, injeção de prompt, custo).
