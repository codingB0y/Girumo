# Teste ponta a ponta do executor de automações

Roteiro para validar em produção a cadeia que o smoke SQL (`infra/tests/automation-runs-smoke.sql`)
não alcança: **entrada real no grupo → lead → run → comando de envio → mensagem no WhatsApp**.

Queries de acompanhamento: `infra/tests/automation-e2e-observacao.sql`.

---

## Achado que define o escopo deste teste

**A última perna da cadeia não existe em produção hoje.** Nada consome `engine_commands`.

Evidências (produção, 29/07/2026):

| Sinal | Estado |
| --- | --- |
| `engine_commands` | 3 linhas, todas `queued`, criadas em **25/06** — 34 dias paradas |
| `attempts` dessas linhas | `0`, `claimed_at` nulo → o claim **nunca rodou** |
| Comandos já concluídos na história da tabela | **nenhum** |
| Único consumidor no repo | `hubflow-engine/queues/supabase-command-worker.js` (Baileys) |
| `instances.provider` em produção | `evolution` em **todas** as instâncias; `engine_node` nulo |

Ou seja: o consumidor que existe é o da engine Baileys, e a produção roda Evolution.
O comentário em `apps/web/src/lib/evolution/client.ts` ("vai para `engine_commands` e é
consumido pelo worker, que aplica o anti-ban") descreve uma intenção de projeto que
**não tem implementação ativa** no caminho Evolution.

Isso **não é regressão do executor** — é uma lacuna anterior a ele. Mas significa que o
teste ponta a ponta completo é impossível hoje, e por isso ele está dividido em duas etapas.

Efeito colateral útil: **a etapa 1 é segura justamente porque a última perna está morta.**
Nenhuma mensagem real sai, aconteça o que acontecer com os runs.

---

## Etapa 1 — executável hoje (valida todo o contrato do executor)

Cobre: webhook → `engine_events` → lead-capture → `automation_runs` → `engine_commands`.
Termina exatamente onde termina a responsabilidade do executor.

### Pré-requisitos

- Worker (`apps/worker`) de pé. Confirmado vivo em 29/07: último evento processado
  há ~1 min, 309 eventos em 24 h. Bloco 0 do SQL confirma no momento do teste.
- Instância conectada. Hoje: tenant `9888373f-…`, número `556298191314`, `connected`.
- **Um grupo de teste onde o número conectado seja admin**, com só os seus números.

> Por que admin: `lead-capture.ts` ignora de propósito grupos onde não somos admin
> ("melhor não capturar do que capturar grupo errado" — LGPD + base suja). É exatamente
> por isso que a produção tem 97 eventos `add` e **0 leads**: todos caíram em grupos
> não-admin. O comportamento está correto; o teste só precisa respeitá-lo.

### Passos

1. **Crie o grupo de teste** no WhatsApp pelo número conectado (assim você já é admin).
   Não convide ninguém além dos seus próprios números.
2. **Sincronize os grupos** no painel, para o grupo entrar em `groups`.
   Confirme com o bloco 0b do SQL: precisa vir `is_admin = true`.
3. **Confira o que já está ligado** (bloco 0c). Se houver automação `weekly_recurring`
   habilitada, **desligue antes** — ver a seção de risco abaixo.
4. **Ligue a automação** em `/painel/automacoes`: template **"Boas-vindas no grupo"**
   (trigger `lead_entered`, passos `wait 5min` → `message`).
   Só esse template. Não ligue mais nada.
5. **Entre no grupo com um segundo número seu.** Esse é o disparo.
6. **Acompanhe** com os blocos 1 → 4 do SQL. A sequência leva ~5–6 min por causa do
   passo `wait`; o tick do worker é de 3 s, então cada transição é quase imediata
   depois que `next_step_at` vence.
7. **Limpe** (bloco 6) e **desligue a automação**.

### Critério de aprovação

| # | Observação | Esperado |
| --- | --- | --- |
| 1 | `engine_events` | linha `group-participants.update`, `action = add`, `processed` |
| 2 | `leads` | um lead novo do número que entrou |
| 3 | `automation_runs` | run criado, `dedupe_key = lead:<lead>:<automacao>` |
| 4 | run após 1º tick | `current_step = 1`, `next_step_at` ~5 min à frente |
| 5 | run após o `wait` | `current_step = 2`, depois `status = done` |
| 6 | `engine_commands` | `send_message`, `dedupe_key = auto:<run>:1`, **`jid` terminando em `@g.us`** |
| 7 | `automations.total_runs` | incrementou em 1 |

O item 6 é o mais importante: prova a decisão anti-DM ponta a ponta, com dado real
em vez de fixture.

### O que a etapa 1 NÃO prova

Que a mensagem chega. O comando fica `queued` para sempre. Isso é o resultado
esperado hoje — não registre como falha.

---

## Etapa 2 — bloqueada (mensagem real)

Precisa de um consumidor de `engine_commands` no caminho Evolution. Não existe. As opções,
sem recomendação até alguém decidir o desenho:

- **a)** Consumidor novo (no `apps/worker` ou serviço próprio) que faça
  `claim_engine_commands` → `POST` de envio na Evolution API → `complete_engine_command`.
  Precisa reimplementar o anti-ban, que hoje vive em memória na engine Baileys
  (`queue.enqueue` em `hubflow-engine/index.js`).
- **b)** Ligar a engine Baileys de volta como consumidor. Ela já implementa `send_message`
  e o anti-ban, mas envia pelo socket Baileys dela — não pela instância Evolution.
  Só faz sentido se a produção voltar para Baileys.

Enquanto isso não existir, **nenhuma automação envia nada** — o que também quer dizer
que o risco de fan-out abaixo está adormecido, não resolvido.

---

## Risco a vigiar: fan-out do `weekly_recurring`

`automation-scans.ts` dispara **um run por grupo sincronizado** do tenant. Com 193 grupos
em produção, ligar esse template gera 193 runs → 193 comandos de uma vez.

Hoje isso não envia nada (etapa 2 bloqueada). **No dia em que o consumidor existir, isso
vira 193 mensagens.** Não ligue esse template junto com o teste, e trate essa decisão
como pendente antes de destravar a etapa 2.
