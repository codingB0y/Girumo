# Link da bio — prompt para começar a implementação num chat novo

Cole o bloco "Prompt de início" inteiro na primeira mensagem de uma sessão nova do Claude Code (desktop), na pasta
`C:\Users\Igor\Desktop\HubFlow-platform`. Antes de colar, ajuste na própria janela: **modelo Opus 5.5, esforço
medium, fast mode desligado, conectores só Supabase** (menu + → Conectores). O prompt manda o Claude conferir isso e
parar se estiver diferente.

## Tudo o que a série usa

| O quê | Onde |
|---|---|
| Spec (contratos no §9, PRs no §12, prova no §13, decisões no §14) | `docs/superpowers/specs/2026-10-19-link-da-bio-design.md` |
| Índice (ordem, dependências, regras comuns) | `docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md` |
| Planos (um por PR, com o código dentro) | `docs/superpowers/plans/2026-10-19-link-da-bio-pr*.md` |
| Mockup navegável (privado) | https://claude.ai/artifact/AU7UMh4kNjtRqRYnyrjE5z — 4 modelos públicos + editor no celular e no computador |
| Fonte do mockup (fora do repo: tem foto e CNPJ da loja-piloto) | `C:\Users\Igor\Desktop\girumo-design-refs\link-da-bio\` — `project/Main.dc.html` (CSS e marcação dos 4 modelos), `project/Editor.dc.html` (painel), `paletas.json`, `interage.cjs` (checagens) |
| Card do quadro (prod) | `link-da-bio` |

Ordem dos PRs (detalhe no índice): **1 banco** e **2 Parte 1** (não depende do banco) → **2 Parte 2** → **3a**
render + Etiqueta → **4a** rota pública (Partes 1 e 2) → **4b** toque → **5** API do painel → **6a** painel Links
(Partes 1 e 2) → **3b** outros modelos → **6b** Aparência, Perfil, Divulgar + menu → **7** Pixel/GA4.

---

## Prompt de início

```text
# Link da bio · execução da série de PRs

Você vai EXECUTAR planos já escritos, revisados e cruzados entre si. Não replaneje, não reabra brainstorming,
não reescreva a spec. Se algo num plano não bater com o código de main, pare, diga o que não bate e proponha a
menor correção (e anote no PR).

## Referências
- Índice da série (ordem, dependências, regras): docs/superpowers/plans/2026-10-19-link-da-bio-00-indice.md
- Spec: docs/superpowers/specs/2026-10-19-link-da-bio-design.md (§9 = contratos: nomes fixos; §14 = decisões)
- Plano do PR da vez: docs/superpowers/plans/2026-10-19-link-da-bio-pr<N>-*.md (cada um termina com
  "Interface com os outros PRs": é o contrato com os vizinhos)
- Mockup (referência visual): https://claude.ai/artifact/AU7UMh4kNjtRqRYnyrjE5z. Fonte local:
  C:\Users\Igor\Desktop\girumo-design-refs\link-da-bio\project\ (Main.dc.html, Editor.dc.html) e paletas.json.
  Tem foto e CNPJ da loja-piloto: NUNCA copie dado de cliente para o repo (é público); testes usam dado fictício.
- Se os documentos ainda não estiverem em main, leia da branch: git fetch origin docs/link-da-bio e
  git show origin/docs/link-da-bio:<caminho>.

## Turno 1: só conferências, depois encerre o turno
1. mcp__ccd_connectors__session_connectors_status: só o Supabase ligado entre os conectores. Sobrou outro:
   desligue com set_session_connector_enabled (um por um) e encerre o turno.
2. mcp__ccd_session_mgmt__get_session self: confirme Opus 5.5 e esforço medium. Diferente: diga qual é e pare.
3. mcp__ccd_session_mgmt__list_sessions: avise se outra sessão estiver aberta nesta pasta (o HEAD do git é
   compartilhado; todo trabalho vai em worktree).
4. Confira em main o que já entrou: git fetch origin main e git log origin/main --oneline --grep "link-da-bio"
   (e o card: select status, blocker from public.board_features where key = 'link-da-bio' em prod).
5. Leia o índice e o plano do próximo PR. Responda com: PRs já em main, o próximo PR (ou os dois que podem ir
   em paralelo), e o checklist das tarefas dele. Pare.

## Turno 2 em diante: execução
- Skill obrigatória: superpowers:subagent-driven-development sobre o plano, um subagente por tarefa, revisão de
  conformidade com a spec e de qualidade entre tarefas. Paralelo só entre PRs/partes com arquivos disjuntos e sem
  dependência (regra de waves): o índice diz quais (ex.: PR 1 e PR 2 Parte 1; PR 5 enquanto 3a/4a andam).
- Worktree por PR/parte a partir de origin/main (EnterWorktree, nome = branch do plano). Nunca checkout -b no
  checkout principal. node_modules por DUAS junctions (raiz e apps/web), como na seção "Ambiente do worktree" do
  índice; npm ci só se o node_modules do checkout principal estiver vazio (o disco C: vive quase cheio).
  Não existe .env.local com credencial de dev nesta máquina: o e2e contra o dev roda no CI (E2E_SUPABASE_*);
  localmente só se essas variáveis estiverem no ambiente. Não tente "consertar" isso copiando segredo.
- Modelos por tarefa (parâmetro model do Agent; nunca haiku):
  - opus: migração (PR 1), núcleo (PR 2), renderizador e modelos (3a, 3b), rotas públicas (4a, 4b) e toda revisão.
  - sonnet: tarefas de tela e de rota do painel (5, 6a, 6b, 7) quando o plano trouxer o código pronto.
- Banco: migração é aplicada pelo CI (migrate-dev no PR, migrate-prod no merge). NUNCA rode DDL à mão nem pelo MCP.
  A baseline segue o plano do PR 1 (assinaturas no commit da migração, conferidas em dev pelo MCP do Supabase,
  só leitura; o job drift do CI confirma).
- Regras que mais mordem (CLAUDE.md e memória valem por inteiro): .eq('tenant_id') em toda query de tabela com
  tenant_id; nenhum atributo style= no HTML público (CSP com nonce); id de link e alvo de contagem em uuid
  minúsculo; /bio/* nunca servido em app.girumo.com.br; antes do push, infra/scripts/verify-local.ps1 (os dois tsc
  e o build) — lint e tsx --test não checam tipo; PowerShell 5.1 (sem &&); conferir git diff --cached em chamada
  separada antes de commitar.
- Revisão de segurança (agente Security Engineer) antes de mergear os PRs 4a, 4b, 5 e 7.
- Fechamento de CADA PR nesta sessão: revisar → CI verde → mergear (gh pr merge <N> --squash --delete-branch
  --repo codingB0y/Girumo) → apagar a branch → reescrever o blocker do card em prod e, quando o status mudar,
  select public.move_card('link-da-bio', '<status>', '<motivo>', '<PR #N>'). Se o classificador barrar merge ou
  SQL em prod, siga com o próximo PR e me entregue no fim os comandos em ordem.
- no_ar_verificado só com a prova do §13 da spec, colhida na hora.
- Não leia o projeto inteiro. Abra só o que a tarefa cita.

## Ao fim de CADA tarefa (obrigatório)
1. mcp__ccd_session_mgmt__get_usage self.
2. Uma linha: "Contexto: X% · PR <N> · tarefa <k>/<total> concluída · commit <hash>".
3. Recomendação explícita: "continuar nesta sessão" ou "abrir sessão nova". Sessão nova quando X > 60%: escreva o
   prompt de continuação completo (o que está em main, worktrees e branches abertas, o próximo PR) e repita os
   blocos "Turno 1", "Turno 2" e "Ao fim de CADA tarefa" deste prompt.

## Ao encerrar a sessão
- Registro no grafo, em PowerShell (na raiz do checkout principal):
  .\tools\lightrag\.venv\Scripts\rag.exe insert "decisão: link da bio — <o que entrou nesta sessão: PRs, números, desvios do plano>" --source decisao-<AAAA-MM-DD>-link-da-bio
- "PRs que deixei abertos: #N (motivo)" — ou "nenhum".
- Próximo PR da série e o prompt de continuação.
```

---

## Prompt de continuação (quando a sessão anterior não deixou um)

```text
# Link da bio · continuação da série

Continue a execução da série "Link da bio" a partir do primeiro PR do índice que ainda não está em main.
Use exatamente as regras do prompt de início em
docs/superpowers/plans/2026-10-19-link-da-bio-prompts-sessao.md (leia o bloco "Prompt de início" inteiro e siga
os turnos dele: Turno 1 só conferências, depois execução).
```
