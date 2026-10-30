# Rastreio do pedido — prompt para começar a implementação num chat novo

Cole o bloco "Prompt de início" inteiro na primeira mensagem de uma sessão nova do Claude Code (desktop), na pasta
`C:\Users\Igor\Desktop\HubFlow-platform`. Antes de colar, ajuste na própria janela: **modelo Opus 5.5, esforço
medium, fast mode desligado, conectores só Supabase** (menu + → Conectores). O prompt manda o Claude conferir isso e
parar se estiver diferente.

## Tudo o que a série usa

| O quê | Onde |
|---|---|
| Spec (regras no §1, dados no §2, PRs no §9, Fase 0 no §10) | `docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md` |
| Índice (ordem, contrato entre PRs, contrato da base, regras comuns) | `docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md` |
| Planos (um por PR) | `docs/superpowers/plans/2026-10-29-rastreio-pedidos-pr*.md` |
| Base comum (conexão Yampi e número do atendimento) | spec e planos do Recuperar: `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` e `docs/superpowers/plans/2026-10-29-recuperar-yampi-*.md` (PRs "comum": 1a, 2a, 2b, 3, 4, 6, 6b; o cartão da Yampi no 6c) |
| Mockup navegável (privado) | https://claude.ai/artifact/MWC77x1LE213aFpNFQ7Z8c |
| Fonte do mockup (fora do repo: tem o nome da loja-piloto) | `C:\Users\Igor\Desktop\girumo-design-refs\rastreio-pedidos\project\` |
| Card do quadro (prod) | `rastreio-pedidos` |

Ordem (detalhe no índice; vários PRs são divididos em Partes, cada Parte um PR): **B·1a** (base) → **1** banco →
**2** pedidos (a Parte 1 logo; a Parte 2 depois de **B·6** e **B·6b**, a conexão Yampi) → **3** página, **4** e-mail e
**6** painel (podem ir em paralelo; a Parte 2 do 3 espera a Parte 1 do 4; o 6 usa os cartões do B·2b e do B·6c) →
**5** WhatsApp (depois do 4, da Parte 2 do 3 e de B·3, B·4) → **7** privacidade e prova. O **8** (Melhor Envio:
entregue e não entregue) vem logo depois do 4 se as provas 4 e 5 da Fase 0 pedirem; o plano dele é escrito com o
resultado delas. Nenhuma loja ganha
`rastreio_enabled` antes do B·2a em `main` e do redeploy do worker.

---

## Prompt de início

```text
# Rastreio do pedido · execução da série de PRs

Você vai EXECUTAR planos já escritos e cruzados entre si. Não replaneje, não reabra brainstorming, não reescreva
a spec. Se algo num plano não bater com o código de main, pare, diga o que não bate e proponha a menor correção
(e anote no PR).

## Referências
- Índice da série (ordem, contrato, regras): docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md
- Spec: docs/superpowers/specs/2026-10-29-rastreio-pedidos-design.md
- Plano do PR da vez: docs/superpowers/plans/2026-10-29-rastreio-pedidos-pr<N>-*.md (cada um termina com
  "Interface com os outros PRs": é o contrato com os vizinhos)
- A base comum (conexão Yampi, número do atendimento) vem dos planos do Recuperar
  (docs/superpowers/plans/2026-10-29-recuperar-yampi-*.md). O índice do Rastreio lista, em "Contrato da base", os
  nomes que o Rastreio consome: confira em main que existem; se a base mudou um nome, troque no plano e no código
  no mesmo PR e anote.
- Mockup: https://claude.ai/artifact/MWC77x1LE213aFpNFQ7Z8c. Fonte local:
  C:\Users\Igor\Desktop\girumo-design-refs\rastreio-pedidos\project\. Tem o nome da loja-piloto: NUNCA copie
  dado de cliente para o repo (é público); testes usam dado inventado ("Loja Exemplo", CPF gerado no teste).
- Os documentos do Rastreio estão em main (PR #537 e o ajuste do contrato da base). Os do Recuperar, se ainda não
  estiverem, leia da branch dele: git fetch origin docs/recuperar-spec e
  git show origin/docs/recuperar-spec:<caminho>.

## Turno 1: só conferências, depois encerre o turno
1. mcp__ccd_connectors__session_connectors_status: só o Supabase ligado entre os conectores. Sobrou outro:
   desligue com set_session_connector_enabled (um por um) e encerre o turno.
2. mcp__ccd_session_mgmt__get_session self: confirme Opus 5.5 e esforço medium. Diferente: diga qual é e pare.
3. mcp__ccd_session_mgmt__list_sessions: avise se outra sessão estiver aberta nesta pasta (o HEAD do git é
   compartilhado; todo trabalho vai em worktree) e se a sessão do Recuperar estiver executando a base agora
   (quem chegar primeiro faz a base; os dois não fazem o mesmo PR).
4. Confira em main o que já entrou: git fetch origin main; git log origin/main --oneline --grep "rastreio";
   git log origin/main --oneline --grep "recuperar\|yampi\|privado" (base). E o card:
   select status, blocker from public.board_features where key = 'rastreio-pedidos' (prod).
5. Confira a Fase 0 do spec (§10; a prova da Yampi é a mesma do Recuperar,
   docs/superpowers/plans/2026-10-29-recuperar-yampi-fase-0-provas.md): a Parte 2 do PR 2 só começa com o payload
   real da Yampi provado; a Parte 1 (núcleo puro) não espera. As provas 4 ("entregue" chegando à Yampi) e 5 (o
   Melhor Envio enxerga as etiquetas da piloto) decidem se o PR 8 entra logo depois do 4; sem o resultado delas, o
   PR 8 não tem plano e não começa.
6. Leia o índice e o plano do próximo PR. Responda com: o que da base e da série já está em main, o próximo PR
   (ou os que podem ir em paralelo), e o checklist das tarefas dele. Pare.

## Turno 2 em diante: execução
- Skill obrigatória: superpowers:subagent-driven-development sobre o plano, um subagente por tarefa, revisão de
  conformidade com a spec e de qualidade entre tarefas. Paralelo só entre PRs/partes com arquivos disjuntos e sem
  dependência (regra de waves): o índice diz quais (3, 4 e 6 depois do 2).
- Worktree por PR/parte a partir de origin/main (EnterWorktree, nome = branch do plano). Nunca checkout -b no
  checkout principal. node_modules por DUAS junctions (raiz e apps/web), como na seção "Ambiente do worktree" do
  índice; npm ci só se o node_modules do checkout principal estiver vazio (o disco C: vive quase cheio).
  Não existe .env.local com credencial de dev nesta máquina: o e2e e os *.integration.test.ts rodam no CI.
  Não tente "consertar" isso copiando segredo.
- Modelos por tarefa (parâmetro model do Agent; nunca haiku):
  - opus: banco e RPC (PR 1), pedidos e cron (PR 2), página pública (PR 3), WhatsApp (PR 5) e toda revisão.
  - sonnet: e-mail (PR 4) e telas do painel (PR 6) quando o plano trouxer assinaturas e testes prontos.
- Banco: migração é aplicada pelo CI (migrate-dev no PR, migrate-prod no merge). NUNCA rode DDL à mão nem pelo
  MCP. A baseline segue o plano do PR 1; o job drift do CI confirma.
- Regras que mais mordem (CLAUDE.md e memória valem por inteiro): .eq('tenant_id') em toda query de tabela com
  tenant_id; CPF/CNPJ nunca em texto nem em log; nenhum atributo style= no HTML público (CSP com nonce); GET de
  página pública nunca muda nada ("parar avisos" só por POST); nenhuma loja ganha rastreio_enabled (nem pelo
  admin do PR 6) antes do B·2a em main e do redeploy do worker no Coolify; antes do push,
  infra/scripts/verify-local.ps1 (os dois tsc e o build) — lint e tsx --test não checam tipo; PowerShell 5.1
  (sem &&); conferir git diff --cached em chamada separada antes de commitar.
- Revisão de segurança (agente Security Engineer) antes de mergear os PRs 1, 3, 4 · Parte 1 e 5.
- Fechamento de CADA PR nesta sessão: revisar → CI verde → mergear (gh pr merge <N> --squash --delete-branch
  --repo codingB0y/Girumo) → apagar a branch → reescrever o blocker do card em prod e, quando o status mudar,
  select public.move_card('rastreio-pedidos', '<status>', '<motivo>', '<PR #N>'). Se o classificador barrar merge
  ou SQL em prod, siga com o próximo PR e me entregue no fim os comandos em ordem.
- no_ar_verificado só com a prova do plano do PR 7, colhida na hora.
- Não leia o projeto inteiro. Abra só o que a tarefa cita.

## Ao fim de CADA tarefa (obrigatório)
1. mcp__ccd_session_mgmt__get_usage self.
2. Uma linha: "Contexto: X% · PR <N> · tarefa <k>/<total> concluída · commit <hash>".
3. Recomendação explícita: "continuar nesta sessão" ou "abrir sessão nova". Sessão nova quando X > 60%: escreva o
   prompt de continuação completo (o que está em main, worktrees e branches abertas, o próximo PR) e repita os
   blocos "Turno 1", "Turno 2" e "Ao fim de CADA tarefa" deste prompt.

## Ao encerrar a sessão
- Registro no grafo, em PowerShell (na raiz do checkout principal):
  .\tools\lightrag\.venv\Scripts\rag.exe insert "decisão: rastreio do pedido — <o que entrou nesta sessão: PRs, números, desvios do plano>" --source decisao-<AAAA-MM-DD>-rastreio-pedidos
- "PRs que deixei abertos: #N (motivo)" — ou "nenhum".
- Próximo PR da série e o prompt de continuação.
```

---

## Prompt de continuação (quando a sessão anterior não deixou um)

```text
# Rastreio do pedido · continuação da série

Continue a execução da série "Rastreio do pedido" a partir do primeiro PR do índice que ainda não está em main.
Use exatamente as regras do prompt de início em
docs/superpowers/plans/2026-10-29-rastreio-pedidos-prompts-sessao.md (leia o bloco "Prompt de início" inteiro e
siga os turnos dele: Turno 1 só conferências, depois execução).
```
