# Fan-out lento e irregular, agendamento sem horário cravado

Data: 05/11/2026. Pedido do Igor depois da segunda restrição da loja piloto ("faz o fan-out").

## Por quê

Com o teto por grupo (`2026-10-24-teto-posts-por-grupo-design.md`, revisto para 2) e a convalescença
(`2026-11-05-convalescenca-design.md`), sobraram dois sinais de robô no ritmo da própria mensagem:

- **Fan-out em metralhadora.** O post para 35 grupos saía em ~3 min: 3 a 7 s entre mensagens, decidido
  em `app.record_send`. Em 23/10 foram 288 envios com pico de 101/h. Um admin humano postando em 35
  grupos leva de 20 s a 1 min por grupo. O número do Igor, que nunca caiu, posta num grupo só.
- **Horário cravado.** Os agendados saíam no segundo zero (10:00:00, 11:00:00, 12:00:00), em lotes de 8
  a 26 agendamentos de uma vez. Gente não acerta o segundo zero.

## Regra

- `app.lote_minimo()` = 10. O **lote em curso** de um número = envios dos últimos 15 min + comandos de
  envio `queued`/`processing` dele (o comando que acabou de sair ainda está `processing`: `record_send`
  roda antes do `complete`).
- Em lote, `record_send` libera a próxima mensagem em **20 a 60 s** (uniforme); fora de lote, 3 a 7 s
  como antes. Um post de 35 grupos passa a levar ~23 min. Os tetos por minuto, hora e dia seguem valendo
  por cima; o worker continua sem decidir ritmo nenhum (o gate é o `next_send_allowed_at` do claim).
- `app.atraso_do_agendamento(id, scheduled_at)`: 0 a 7 min, determinístico por ocorrência (hash do id +
  epoch do horário, independente do fuso): o housekeeping roda a cada 30 s e vê sempre o mesmo atraso;
  o recorrente muda de atraso a cada dia porque o horário muda. `app.promote_due_schedules` só promove
  quando `scheduled_at + atraso <= now()`. "Perdeu a hora" continua contado do `scheduled_at` (15 min):
  o atraso gasta parte da folga, nunca passa dela.
- A tela promete o mesmo ritmo: `etaDisparo` e "termina por volta de" usam 45 s por mensagem num post de
  10 grupos ou mais e 6 s abaixo disso, sempre arredondando para cima.

## Fora deste PR

- Variar também o horário do "Postar agora": é um humano clicando, já é irregular.
- Pausas longas no meio do lote ("foi atender alguém"): o uniforme de 20 a 60 s já é irregular o bastante
  para começar; medir saídas por post depois de uma semana antes de mexer de novo.

## Arquivos

`apps/web/supabase/migrations/20261105140000_fanout_lento_e_jitter.sql` (travas de md5 em `record_send` e
`promote_due_schedules`), `infra/tests/fanout-lento-e-jitter-check.sql`, `apps/web/src/lib/campaigns/dispatch-eta.ts`,
`apps/web/src/lib/painel/ao-vivo/postando.ts`, `apps/worker/src/env.ts` (comentários),
`apps/web/src/components/painel/conectar/vitrine/numero-saude-vitrine.tsx` (texto do ritmo).
