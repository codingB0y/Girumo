# Teto de posts por grupo por dia

Data: 24/10/2026. Número e comportamento aprovados pelo Igor no chat.

## Por quê

Em 23/10 o WhatsApp restringiu o número de uma loja por 24 h ("atividade pode caracterizar spam"),
com o volume dentro dos tetos por número. Os sinais foram @todos em 7 de 8 posts e saídas voluntárias
logo depois de cada post. O #525 (`20261023120000_antiban_saidas_e_todos.sql`) já cuida dos dois: o
orçamento de 2 @todos por dia e o disjuntor que pausa a loja quando muita gente sai.

Falta a terceira alavanca: **quantas vezes o mesmo grupo recebe post no mesmo dia**. Hoje não existe
limite por grupo. Os únicos tetos são por número (por minuto, hora e dia), e eles não impedem que o
mesmo grupo receba 8 posts no dia.

Dados de prod dos últimos 30 dias (a única loja com volume; posts por grupo no dia × saídas voluntárias
no dia):

| Posts por grupo no dia | Dias | Saídas no dia |
|---|---|---|
| 1 a 2 | 9 | 21 a 83 |
| 3 a 5 | 7 | 47 a 119 |
| 7 a 8 | 4 (09, 13, 15 e 23/10) | 76 a 141 |

Mediana de 3 posts por grupo por dia, p90 de 7, máximo de 8. Ressalva: quase todo post tinha @todos,
então os dados não separam o efeito da frequência do efeito do @todos. E só enxergamos o que sai pelo
Girumo.

## Objetivo

Nenhum grupo recebe do Girumo mais de **4 posts no mesmo dia** (dia de Brasília). Quando um grupo já
chegou em 4, o post segue para os outros grupos e esse fica de fora, com o motivo visível.

Sucesso, medido duas semanas depois do PR 1 no ar:

- nenhum grupo-dia acima de 4 em `engine_commands` com status `done`;
- saídas por dia nos dias de mais posts abaixo das 105 a 141 de antes;
- nenhuma restrição nova.

## Não-objetivos

- Teto configurável por loja, por plano ou por grupo. É um número só, igual ao orçamento de @todos.
- Guardar para amanhã o post que ficou de fora. Oferta de atacado vence no dia.
- Contar posts feitos direto no celular, fora do Girumo. Não temos como ver.
- Mexer nos tetos por número, no disjuntor de saídas ou no orçamento de @todos.
- Rodízio de números ou teto por número.
- Mostrar a contagem no compositor de agendamento. A regra vale para agendados, mas na hora do envio, e
  a contagem de agora não diz nada sobre a de daqui a 6 horas.

## Anti-objetivos

O trabalho falha, mesmo funcionando, se:

- um grupo ficar sem o post **sem aparecer o motivo** em lugar nenhum;
- a regra (o 4, o que conta, o dia) existir em duas cópias, uma em SQL e outra em TypeScript;
- algo ficar acumulado e sair junto no dia seguinte;
- o post inteiro for bloqueado porque **alguns** grupos chegaram no teto.

## A regra (decidida)

1. **Teto = 4.** Vive numa função do banco, `app.posts_por_grupo_dia()`, `immutable`, devolvendo 4, no
   mesmo molde de `app.mention_all_daily_budget()`.
2. **Dia = data em `America/Sao_Paulo`.** Zera à meia-noite de Brasília.
3. **O que conta:** cada comando de envio (`send_message`, `send_media`, `send_poll`) da loja para aquele
   grupo (`payload->>'jid'`) criado no dia (`created_at`), com status `queued`, `processing` ou `done`.
   - `canceled` e `failed` não contam: não chegaram no grupo.
   - `queued` conta porque vai sair. Se depois for cancelado (disjuntor, tolerância de 15 min), deixa de
     contar sozinho.
   - A origem não importa: post agora, agendado, recorrente, etapa de funil, reenvio da mesma oferta,
     aviso ao lotar. Cada rodada de um post gera um comando por grupo, então 1 rodada = 1 post no grupo.
   - A conta é **por loja e grupo**, não por número: dois números da loja no mesmo grupo somam.
4. **Onde a regra roda:** em `app.enqueue_broadcast`, que é a única porta de entrada dos envios (rota de
   postar via `lib/stores/broadcasts.ts`, agendamento via `lib/stores/schedules.ts` e
   `app.promote_due_schedules`, aviso ao lotar via `public.enviar_avisos_lotou`). Depois de
   `jids := app.alvos_do_disparo(b)`, os grupos se dividem em dois: os abaixo do teto recebem o comando de
   sempre; os que já estão em 4 ficam de fora.
5. **Grupo de fora não some:** recebe na mesma rodada um comando já `canceled`, com
   `payload.foraDoTeto = true` e `error` = "Não enviado: este grupo já recebeu 4 posts hoje (limite do
   anti-ban). Volta à meia-noite." Mesmo formato de `dedupe_key`, mesmo `instance_id`. Como é `canceled`,
   não conta no teto, não é pego pelo claim, não entra no orçamento de @todos (que exige `claimed_at`) e
   não é tocado pelo disjuntor nem pela tolerância (que só mexem em `queued`).
   **Uma exceção conferida no código:** `app.promote_due_schedules` (corpo de
   `20261017123000_sem_plano_nao_dispara_sozinho.sql`) monta `v_alvos` da oferta relâmpago com todos os
   comandos da rodada, sem olhar status. Sem mudança, o grupo de fora ganharia uma oferta relâmpago de
   uma mensagem que não recebeu e teria a oferta anterior fechada. Essa função também troca de corpo
   (trava de md5 própria): `v_alvos` passa a ignorar comando com `payload.foraDoTeto`.
6. **Todos de fora:** nenhum comando de envio sai. Os grupos recebem as linhas `canceled` com
   `foraDoTeto` do item 5, numa rodada nova (`run_id` novo, `running_since = now()`), e o post vira `failed`
   com `total` = número de grupos de fora, `sent = 0` e o erro "Nenhum grupo recebeu: todos já tinham 4
   posts hoje. O limite volta à meia-noite." Assim cada grupo mostra "limite do dia" na coluna do post,
   em vez de "—" ou das células da rodada de ontem de um recorrente. `reconcile_broadcast_progress` só
   olha posts `queued`/`running`, então não reescreve esse `failed`.
   - **A tela de postar mostra o erro.** Hoje a rota de postar (`POST /api/campanhas/[slug]/messages`)
     devolve 201 mesmo quando o fan-out volta `failed`, e `folha-postar.tsx` mostra "Postado" e fecha. O
     defeito já existe (sem número conectado, sem grupo na regra), mas o teto o torna comum. A rota passa a
     responder 422 com `{ error: <erro do post> }` quando o post volta `failed`. Os compositores já
     mostram `body.error` quando a resposta não é ok. Conferir os outros chamadores da rota antes.
   - **Agendado ou recorrente cortado inteiro avisa o lojista.** Ninguém está olhando a tela na hora do
     envio. Em `app.promote_due_schedules`, quando o post volta `failed` e a rodada tem linha com
     `foraDoTeto`, entra uma notificação: título "Post agendado não saiu", texto "O post agendado
     "{nome}" não saiu: todos os grupos já tinham recebido 4 posts hoje. O limite volta à meia-noite.",
     link para a página de disparos. Corte parcial não notifica, porque é o comportamento normal.
7. **Corrida:** dois posts da mesma loja enfileirados juntos não podem ler os dois "3" e passar para 5.
   `app.enqueue_broadcast` pega `pg_advisory_xact_lock` por loja antes de contar (no molde de
   `avaliar_disjuntor_saidas`).
8. **Uma fonte só:** a contagem vive em `app.posts_hoje_por_grupo(p_tenant uuid)`, que devolve
   `(jid text, posts integer)` para todo grupo da loja com post no dia. O `enqueue_broadcast` usa essa
   função, e a leitura para a tela usa um wrapper `public.posts_hoje_por_grupo(p_tenant uuid)` que devolve
   `{ teto, grupos: { jid: posts } }` e só pode ser executado pelo `service_role`. O TypeScript nunca
   recalcula nem guarda o 4.

## Como o lojista vê

### No histórico (PR 1)

A coluna "Post das HH:MM" da tabela de grupos da campanha (`GET /api/disparos/[id]/grupos`) ganha um
estado novo, `fora_do_teto`, com o rótulo **"limite do dia"** (sem o número: o TypeScript não guarda o 4, item 8), separado de "Cancelado".
`listBroadcastDeliveries` passa a ler `payload->>foraDoTeto`; `estadoDaEntrega` em `lib/painel/entrega.ts`
recebe essa marca. O estado novo entra em todo lugar que enumera `EstadoDaEntrega` ou lê
`resumoDaEntrega`: os registros exaustivos de `entrega.tsx`, as legendas de `postando.ts` e `abas.ts` e
a `visao-geral.tsx`. Os de fora aparecem com o próprio rótulo, sem somar aos cancelados.

O status do post não muda de regra: `reconcile_broadcast_progress` continua igual, então um post com
grupos de fora termina `sent`, com `sent` menor que `total` (`total` inclui os de fora). "Entregue 30 de
36" é a leitura certa: 6 grupos não receberam, e o motivo está na linha de cada um.

### No compositor (PR 2)

Uma linha logo acima do botão de postar, nos três lugares que postam agora: `folha-postar.tsx`, a aba
Posts da campanha (`messages-tab.tsx`) e a vitrine (`disparos-vitrine.tsx`). A linha usa a mesma lista de
grupos que o botão conta ("Postar em N grupos") e o teto que vem do servidor.

| Situação dos grupos escolhidos | Linha |
|---|---|
| Nenhum recebeu post hoje | nenhuma linha |
| Maior contagem entre 1 e 3 | "Hoje: até {max} de {teto} posts nestes grupos." |
| Alguns já em {teto} | "{k} de {n} grupos já receberam {teto} posts hoje e vão ficar de fora." (cor de aviso) |
| Todos já em {teto} | "Todos estes grupos já receberam {teto} posts hoje. O post não vai sair; o limite volta à meia-noite." (cor de erro) |

O botão continua habilitado nos quatro casos: a contagem pode estar velha, e quem decide é o banco na
hora de enfileirar. A linha é lida quando o compositor abre e de novo depois de cada post enviado dali.

Endpoint: `GET /api/groups/posts-hoje` (mesmo namespace das rotas de grupos que já existem) → `{ teto: number, grupos: Record<string, number> }`, só com os
grupos que receberam algo hoje. Mesmo contexto de loja (`getRouteTenantContext`) e mesma permissão da rota
que posta, para a vendedora com o módulo de postar também ver. Sem banco (`USE_SUPABASE` falso), responde
501 e a linha não aparece. O contrato entra em `system/API_CONTRACTS.md`.

## Banco

- Migração nova em `apps/web/supabase/migrations/` + linha no fim de `deploy/supabase/apply-order.txt`.
  Aplicada pelo CI (`migrate-dev` no PR, `migrate-prod` no merge); nunca à mão.
- Cria `app.posts_por_grupo_dia()`, `app.posts_hoje_por_grupo(uuid)` e o wrapper
  `public.posts_hoje_por_grupo(uuid)`. O wrapper muda a baseline: `npm run schema:baseline` com as
  credenciais de dev depois do `migrate-dev`.
- Troca dois corpos (assinaturas iguais), cada um com sua trava de md5 no padrão das migrações
  anteriores: só passa com o corpo conhecido do repo ou com o desta migração.
  - `app.enqueue_broadcast`: corpo de `20261015120000_documento_no_disparo.sql` (md5 normalizado
    `2aa6376d6675983311f5e6d998d89a03` no repo).
  - `app.promote_due_schedules`: corpo de `20261017123000_sem_plano_nao_dispara_sozinho.sql` (filtro de
    `v_alvos` e notificação do item 6).
  Se o banco tiver outro corpo, a trava levanta exceção no `migrate-dev` do PR, e é ali que a divergência
  aparece. Não precisa de acesso ao banco para escrever a migração.
- `security definer` sempre com `set search_path`; `revoke ... from public, anon, authenticated` e
  `grant execute ... to service_role` explícitos em toda função (o `create or replace` não preserva ACL em
  todo banco).
- Conferência `infra/tests/teto-posts-por-grupo-check.sql`, em loja descartável e transação desfeita,
  provando:
  - 4 posts no mesmo grupo saem e o 5º fica de fora, com o comando `canceled` e `foraDoTeto`;
  - comando `canceled` ou `failed` não conta;
  - comando criado ontem (horário de Brasília) não conta;
  - dois números da mesma loja no mesmo grupo somam;
  - post com todos os grupos no teto vira `failed` com a mensagem certa, rodada nova e só linhas
    `foraDoTeto`;
  - post com parte dos grupos no teto sai para o resto;
  - oferta relâmpago de etapa de funil abre só nos grupos que receberam;
  - agendado cortado inteiro gera a notificação, e o cortado em parte não gera;
  - o aviso ao lotar segue a mesma regra.

## Como isso convive com o que já existe

- **Tetos por número, disjuntor e orçamento de @todos:** sem mudança. São travas independentes.
- **Disjuntor e tolerância cancelam comandos `queued`:** esses param de contar, então um post cancelado
  pelo disjuntor devolve a vaga do dia. É o comportamento certo, porque o post não chegou.
- **Post feito com o disjuntor aberto:** ainda é enfileirado e conta como `queued` até a tolerância de
  15 min cancelá-lo. Um 5º post nessa janela fica de fora, mesmo que os 4 anteriores vão ser cancelados
  e liberar a vaga. Aceito: o disjuntor já pausou a loja por 6 h, e checar o disjuntor no
  `enqueue_broadcast` é escopo de outro trabalho.
- **Reenviar a mesma oferta:** rodada nova, conta de novo.
- **Funil:** cada etapa é um post, então cada etapa conta.
- **Aviso ao lotar:** segue a regra sem exceção. Num dia em que o grupo que acabou de lotar já recebeu 4
  posts, o aviso fica de fora, e como `enviar_avisos_lotou` carimba `aviso_lotou_em` de qualquer jeito, ele
  não sai depois. Aceito: o link `/r/` já pula grupo lotado, e o aviso é uma mensagem só.

## Entrega em dois PRs

1. **Banco + histórico:** migração (as duas trocas de corpo), conferência SQL, baseline, estado
   `fora_do_teto` na entrega por grupo e a rota de postar respondendo 422 quando o post volta `failed`.
   Sozinho, ele já cumpre o objetivo e o anti-objetivo de não sumir em silêncio.
2. **Compositor:** endpoint `GET /api/groups/posts-hoje`, a linha nos três lugares, contrato em
   `API_CONTRACTS.md`.

O PR 2 depende do PR 1 em prod (o wrapper precisa existir). Card do quadro: `teto-posts-por-grupo`.

## Decisões minhas (não discutidas com o Igor)

- Contar por `created_at` do comando, e não por hora de entrega. Um post enfileirado às 23:58 que sai às
  00:01 conta no dia anterior. Raro, e evita uma segunda definição de "dia".
- Grupo de fora vira comando `canceled` com `payload.foraDoTeto`, em vez de coluna nova em `broadcasts`.
  Reaproveita a entrega por grupo que a tela já lê.
- `total` do post inclui os grupos de fora.
- Com todos de fora, as linhas `foraDoTeto` são gravadas mesmo assim, numa rodada nova.
- A rota de postar responde 422 quando o post volta `failed` (corrige também os casos antigos).
- Notificação só para agendado ou recorrente cortado inteiro.
- O disjuntor aberto não muda a conta do teto.
- Sem linha no compositor quando nenhum grupo recebeu post hoje, para não virar ruído.
- Botão de postar sempre habilitado; o banco decide.
- Aviso ao lotar sem exceção (acima).

## Fica para quem implementar

- Índice para a contagem do dia, se o plano de execução mostrar que precisa. A loja de mais volume cria
  cerca de 300 comandos por dia.
- Onde exatamente cada rótulo de estado da entrega é renderizado e o componente da linha do compositor.
- Estrutura dos testes, seguindo o TDD por tarefa do plano.
