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

### Resultado da execução (29/07/2026, 18:43–18:48 UTC)

**Etapa 1 executada em produção. Os 7 critérios passaram.**

| # | Observação | Resultado |
| --- | --- | --- |
| 1 | `engine_events` | `add` em `TESTE AUTOMAÇAO`, `processed` às 18:43:33 |
| 2 | `leads` | lead `556281980074` criado às 18:43:32 |
| 3 | `automation_runs` | run criado, `dedupe_key = lead:f69f0d07…:1a0d0737…` |
| 4 | passo `wait` | `current_step 0 → 1`, `next_step_at` 18:48:34 (+5 min exatos), lease devolvida |
| 5 | passo `message` | `current_step 1 → 2` → `done` às 18:48:40 |
| 6 | `engine_commands` | `send_message`, `dedupe_key = auto:bcea3378…:1`, destino `…@g.us`, texto do template |
| 7 | `automations` | `total_runs = 1`, `last_run_at` preenchido |

`attempts = 0` no run inteiro — nenhum retry, nenhuma lease vencida. O item 6 prova a
garantia anti-DM com dado real de produção, não com fixture.

Como previsto, o comando ficou `queued` com `attempts = 0` e `claimed_at` nulo, e nenhuma
mensagem chegou no grupo. Lead, run e comando do teste foram apagados depois.

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

## Incidente do fan-out — aconteceu de verdade em 29/07

O risco de fan-out não era hipotético: **ele já tinha disparado em produção** algumas horas
antes deste teste, e só foi descoberto na limpeza.

Entre **16:24 e 16:27 UTC** uma automação `group_stalled` ("Reativação de grupo parado")
esteve habilitada. A varredura casou **os 193 grupos do tenant** e gerou 193 comandos
`send_message`. A automação foi apagada depois; os runs foram junto por cascade, mas os
comandos **não** — ficaram `queued` na fila.

| Destino | Comandos | Pessoas alcançadas |
| --- | --- | --- |
| Grupos onde o lojista é admin | 89 | 10.004 |
| **Grupos onde é só membro** | **104** | **30.931** |

Entre os 104: `Networking JF 🚀` (1.876), `Rede IC&B Networking Pró` (1.721),
`COMUNIDADE VEM DANÇAR AN` (1.660) — comunidades de terceiros que receberiam uma mensagem
de venda de reposição no instante em que a etapa 2 destravasse. Os 193 comandos órfãos
foram apagados em 29/07 18:54 UTC.

### As duas causas, e o que foi corrigido

**1. As varreduras não filtravam `is_admin`.** `lead-capture.ts` recusa grupo não-admin de
propósito ("melhor não capturar do que capturar grupo errado"), mas `automation-scans.ts`
contradizia essa política justamente na ponta que envia — e mandar propaganda para o grupo
de um terceiro é pior do que capturar lead dele.
→ Corrigido: as três varreduras agora ignoram grupo onde não somos admin. `is_admin` nulo
conta como não-admin.

**2. O proxy do `group_stalled` degenera para "todos".** A condição é "nenhum lead novo há
7 dias". Com o tenant em 0 leads — que era o caso, porque todo `add` caía em grupo
não-admin — *todo* grupo parece parado e o filtro deixa de filtrar. Foi isso que produziu
193 e não um subconjunto.
→ Corrigido: `group_stalled` não dispara enquanto o tenant não tiver ao menos um lead. Sem
nenhum lead não há como distinguir "parado" de "nunca começou".

### O que continua valendo

`weekly_recurring` segue fanando para todos os grupos-admin do tenant (89 hoje, não 193).
Isso é por desenho — não existe um jeito de escolher subconjunto —, mas continua sendo
uma rajada. Trate como decisão pendente antes de destravar a etapa 2.
