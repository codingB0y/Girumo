# Assistente de ofertas: PR 4, tela (plano em duas etapas)

**Goal:** `/painel/assistente`, onde a lojista escreve o pedido, vê a proposta, edita cada post e agenda um a um ou
todos de uma vez.

**Índice:** `docs/superpowers/plans/2026-11-04-assistente-ofertas-00-indice.md`. **Depende de:** PR 3 em `main`.

Este plano tem **duas etapas**, porque tela nova no Girumo começa por mockup (nota `feedback-mockup-antes-de-programar`):

1. **Etapa A (mockup):** artifact de Design com os estados abaixo, no celular (390) e no computador (1440), no padrão
   denso do painel (nota `feedback-painel-denso-estilo-devzapp`, menu em cima estilo Bling). O Igor aprova.
2. **Etapa B (plano de código):** escrito **depois** do mockup aprovado, no formato dos PRs 1 a 3 (TDD por tarefa,
   código dentro do plano), como `2026-11-04-assistente-ofertas-pr4-tela-codigo.md`. Não escrever código de tela antes disso.

## O que o mockup precisa mostrar

- **Vazio:** caixa do pedido com 3 exemplos clicáveis ("posts da semana para a campanha X", "o que repetir da semana
  passada", "lançamento de sexta"). Contador "10 pedidos por hora".
- **Pensando:** 10 a 40 s de espera. Mostrar etapas fixas ("lendo campanhas", "olhando vendas", "escrevendo"),
  porque a API não transmite progresso nesta versão. Botão de cancelar (aborta o `fetch`).
- **Proposta:** lista por dia. Cada post mostra campanha (seletor), data e hora (editável), texto (editável, contador
  de 500), motivo (em cinza) e as ações "Agendar" e "Descartar". No topo: resumo do assistente e "Agendar todos".
- **Erros:** 422 ("não consegui montar, tente explicar de outro jeito", com a `resposta` do assistente se vier), 429
  (quando libera), 504/502 (tentar de novo), post recusado no agendamento (mensagem da API ao lado do post, sem
  derrubar os outros).
- **Agendado:** o post vira linha "agendado para qui 10:00 · ver na agenda" com link para a campanha.

## Contratos que a Etapa B vai usar (já existem)

- `POST /api/agents/assistente` → contrato em `apps/web/system/API_CONTRACTS.md` (PR 3).
- Agendar cada post: `POST /api/campanhas/{slug}/messages` com `{ body: texto, scheduledAt: quando, mentionAll: false }`.
  É a mesma rota que a tela de campanhas usa. Ela já cobra plano (`assertPlanLimit`), valida a data e barra a
  vendedora. **Nunca** mandar `mentionAll: true` (orçamento de @todos zerado no #571).
- Antes de enviar, revalidar no cliente com `checkProposal` de `proposal.ts` (a lojista pode ter editado o horário
  para fora da janela). O servidor de campanhas continua sendo quem decide.
- Item no menu em `src/lib/painel-nav.ts`, só para loja liberada. A página checa `isEnabledFor` no servidor e
  responde `notFound()` para quem não está na lista. Esconder o item não basta.

## Fora deste PR

- Streaming de progresso (exige `agent.stream` e resposta em SSE: avaliar depois do PR 5).
- Histórico de pedidos anteriores (exige tabela, portanto migração).
- Foto ou vídeo no post: a proposta é só texto nesta versão. A lojista adiciona mídia na agenda depois.
