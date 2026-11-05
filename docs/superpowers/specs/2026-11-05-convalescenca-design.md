# Convalescença: o número que o WhatsApp derrubou volta devagar

Data: 05/11/2026. Pedido do Igor depois da segunda restrição da loja piloto ("faz a convalescença").

## Por quê

A loja piloto teve o número derrubado pelo WhatsApp (`connection.update` `close` 401, "atividade pode
caracterizar spam") em 23/10, 03/11 e 05/11/2026. Nas três vezes o lojista pareou de novo assim que a
restrição de 24 h acabou e os posts voltaram no ritmo de sempre no mesmo dia. Em 05/11: reconectou às
10:59 do dia 04, postou para 35 grupos às 08:00 do dia 05 e caiu de novo às 10:59.

Depois de uma restrição o WhatsApp observa o número de perto, e o volume normal logo na volta é o que
renova a punição. Nada no Girumo sabia que o número tinha sido derrubado: o claim via `connected` e
aplicava os tetos de veterano. O Job 3 do cron só alerta desconexão; o disjuntor de saídas e o teto por
grupo não olham a queda.

## Regra

- **Derrubada** = `close` com `statusReason` 401 (loggedOut) ou 403 (forbidden). 428/408/515 são quedas
  passageiras que voltam sozinhas e não contam.
- O webhook guarda a hora do **primeiro** 401 do episódio em `instances.metadata.lastLoggedOutAt`. O
  pareamento emite outro 401 segundos antes do `open` (05/11: 401 às 10:59, 401 às 13:46, `open` às
  13:49); se ele apagasse a hora real, a convalescença não começaria.
- Quando a sessão **abre** com a hora guardada há **30 min ou mais**, o webhook chama
  `public.iniciar_convalescenca(tenant, instance, logout_at)`. Em prod (60 dias) o 401 do pareamento é
  seguido de `open` em 0 a 15 min; as derrubadas reais voltaram em 104 min a 3 dias. Chip diferente do
  que caiu não entra: é outro número na mesma vaga, e a convalescença não é dele.
- A RPC registra em `app.convalescenca`: posts pausados até **derrubada + 48 h** e ritmo reduzido até
  **derrubada + 14 dias**. As janelas contam da queda, não da volta: quem voltou depois de 48 h não
  fica pausado, só reduzido; derrubada com mais de 14 dias não faz nada (o número voltou de uma
  ausência, e o aquecimento de `record_send` cuida disso). Cancela a fila do número com o motivo,
  notifica (`antiban_convalescenca`) e grava em `logs`. Idempotente por derrubada: a mesma hora não
  notifica duas vezes; uma derrubada mais nova reinicia as janelas.
- `app.instance_caps` devolve o perfil **`convalescente`** enquanto `perfil_ate > now()`: 4/min, um post
  por hora (`per_hour` = grupos com gente), dois posts por dia (`per_day` = 2 × grupos), pisos de 10 e
  20, nunca acima do perfil de base (novo/veterano). `instance_health` e a tela do número leem daqui.
- `app.claim_send_commands` não pega comando de número com posts pausados, e o cancelamento por
  tolerância diz o motivo. Como no disjuntor, a pausa **não é retenção**: o que for agendado durante ela
  é cancelado pela tolerância de 15 min com o motivo, em vez de sair tudo junto quando a pausa acabar.

## O que a loja vê

Notificação "Número em convalescença" com as datas; na tela do número, o chip "Número em convalescença"
com o ritmo e o tom de atenção (não risco: o sistema recuou de propósito). Post agendado que cair na
pausa fecha com "o WhatsApp derrubou este número e o anti-ban pausou os posts até …".

## Fora deste PR

- Chip novo na mesma vaga (o que a loja piloto fez em 05/11 às 13:49): hoje herda o aquecimento graduado
  do chip antigo e posta como veterano no dia 1. Precisa de regra própria (reiniciar o aquecimento).
- Alerta operacional para o dono da plataforma quando um número é derrubado.

## Arquivos

`apps/web/supabase/migrations/20261105130000_convalescenca.sql` (travas de md5 em `claim_send_commands`
e `instance_caps`), `infra/tests/convalescenca-check.sql`, `apps/web/src/app/api/webhooks/evolution/route.ts`,
`apps/web/src/lib/stores/instance-health.ts`, `apps/web/src/lib/instance-health.ts`,
`apps/web/src/components/painel/conectar/vitrine/numero-saude-vitrine.tsx`.
