# Ciclo de Vida das Conexões da Engine

## Objetivo

Eliminar corridas entre sockets Baileys antigos e novos, garantir limpeza determinística dos recursos de cada conexão e recuperar comandos interrompidos sem enviar mensagens duplicadas deliberadamente.

Esta especificação amplia o desenho anterior do watchdog. O watchdog continua detectando conexões zumbis, mas a recuperação passa a ser responsabilidade de um controlador único de sessão.

## Problemas confirmados

- O watchdog pode parar antes de `sock.end()` concluir. Se o encerramento rejeitar, travar ou não emitir `close`, a engine pode permanecer ligada a um socket morto.
- Uma falha na inicialização assíncrona pode deixar o socket registrado como atual, sem timers, worker ou watchdog ativos.
- Funções de inicialização alteram caches globais antes de confirmar que o socket ainda é o atual.
- Listeners de sockets substituídos podem continuar registrando atividade, leads, recibos e boas-vindas.
- O worker atual usa booleanos compartilhados. Um loop antigo pode voltar a executar depois de `stop()` seguido de `start()`.
- Um comando reivindicado não possui lease nem recuperação. Se a engine cair, ele pode permanecer indefinidamente em `processing`.

## Abordagem escolhida

Adotar um controlador de sessão por geração. Cada socket pertence a uma sessão imutável que concentra estado, cancelamento e recursos. Esta abordagem corrige a propriedade dos recursos sem exigir a reescrita completa da engine como uma máquina de estados distribuída.

Adicionar guards pontuais foi descartado porque preservaria o estado global e as mesmas classes de corrida. Uma máquina de estados completa foi descartada por exceder o escopo necessário.

## Arquitetura

### `ConnectionSessionController`

O controlador é a única autoridade para:

- criar e substituir a sessão atual;
- verificar se uma sessão ou socket ainda é atual;
- iniciar a preparação e o commit de uma conexão aberta;
- invalidar uma sessão por close, watchdog, falha de inicialização ou shutdown;
- cancelar recursos da geração invalidada;
- serializar o agendamento de reconexões.

O controlador mantém no máximo uma sessão atual e um timer de reconexão.

### `ConnectionSession`

Cada sessão contém:

- geração monotônica;
- socket associado;
- estado `connecting`, `initializing`, `ready`, `closing` ou `closed`;
- `AbortController` próprio;
- referências aos timers, watchdog, listeners e execução do worker;
- métodos idempotentes de validação, ativação e limpeza.

Substituir a sessão atual aborta imediatamente a anterior. Nenhum recurso usa um booleano global para representar duas gerações diferentes.

## Inicialização em duas fases

### Preparação

Ao receber `connection === "open"`, a sessão muda para `initializing`. A preparação busca os dados necessários em estruturas locais:

- estado da sessão no painel;
- configuração de boas-vindas;
- lista de opt-out;
- grupos e grupos administrados;
- payload de sincronização dos grupos.

As funções de leitura retornam snapshots. Elas não alteram `welcomeCfg`, `optOutDigits`, `adminGroupIds`, `groupNames`, `lastGroupsPayload` nem outros caches compartilhados.

### Commit

Depois de cada operação assíncrona, a sessão confirma que ainda é a geração atual e que não foi abortada. O commit publica os snapshots de forma síncrona e então:

- define a sessão como `ready`;
- anexa o watchdog;
- inicia heartbeat e dispatch;
- inicia o worker vinculado à geração;
- executa os primeiros polls.

Se a preparação falhar, a sessão é invalidada, seus recursos são limpos, o socket é encerrado com timeout e uma única reconexão é agendada. Nenhuma rejeição escapa do listener de eventos.

## Isolamento dos eventos

Todos os listeners registrados no socket pertencem à sessão. Antes de ler ou alterar estado compartilhado, executar efeito externo ou continuar após um `await`, o listener verifica se a sessão está ativa.

Isto se aplica a:

- `messages.update`;
- `messages.upsert`;
- `connection.update`;
- `group-participants.update`;
- callbacks dos timers;
- sincronização de grupos;
- captura de leads;
- boas-vindas;
- polling de dispatch e crescimento;
- chamadas do worker.

Ao encerrar, a sessão aborta tarefas cooperativas, remove listeners registrados por ela, cancela timers e impede novos efeitos. Operações externas já aceitas não podem ser desfeitas, mas seu resultado não é publicado por uma geração obsoleta.

## Recuperação pelo watchdog

O watchdog não encerra diretamente a responsabilidade pelo socket. Ele solicita `forceReconnect(generation, reason)` ao controlador.

O controlador:

1. confirma que a geração ainda é atual;
2. invalida a sessão para bloquear novos efeitos;
3. tenta `sock.end()`;
4. aplica timeout configurável ao encerramento;
5. limpa os recursos mesmo que `sock.end()` rejeite ou nunca conclua;
6. agenda uma única reconexão usando a política de backoff existente.

Um evento `close` tardio é idempotente e não interfere na geração seguinte.

## Worker vinculado à geração

Cada `start()` cria uma execução com identificador e `AbortSignal` próprios. O loop, o sleep e cada etapa do comando verificam essa execução. `stop()` aborta o loop atual; iniciar outra geração não reativa loops antigos.

O worker valida a geração:

- antes de reivindicar comandos;
- depois de cada RPC;
- antes de um efeito externo;
- depois do efeito externo;
- antes de atualizar instância, evento ou conclusão.

## Lease e recuperação de comandos

Será criado o enum `public.engine_command_failure_kind` com os valores `retryable`, `permanent` e `uncertain`. `engine_commands` receberá estes campos:

- `lease_token uuid`;
- `lease_expires_at timestamptz`;
- `attempt_count integer not null default 0`;
- `max_attempts integer not null default 3`;
- `effect_started_at timestamptz`;
- `failure_kind public.engine_command_failure_kind`.

O valor inicial do lease será 60 segundos e poderá ser configurado na engine. Operações que possam ultrapassá-lo renovarão o lease enquanto a execução continuar ativa.

O RPC de claim seleciona comandos `queued` disponíveis e também recupera leases expirados que ainda possam ser repetidos com segurança. Ele incrementa `attempt_count`, cria um novo `lease_token` e define a expiração em uma única transação com `FOR UPDATE SKIP LOCKED`.

Conclusão, falha, renovação e marcação de início do efeito exigem `command_id`, `lease_token` e estado esperado. Um dono antigo do lease não pode modificar um comando reivindicado novamente.

### Política de repetição

- Interrupção antes de `effect_started_at`: o lease expirado retorna o comando para `queued` enquanto houver tentativas.
- Interrupção depois de `effect_started_at`, sem confirmação final: o comando vira `failed` com resultado `uncertain` e não é reenviado automaticamente.
- Tentativas esgotadas: o comando vira `failed` definitivamente.
- Falhas conhecidas antes do efeito podem usar backoff por `available_at`.

Esta política privilegia evitar mensagens duplicadas. O WhatsApp não oferece idempotência suficiente para garantir exatamente uma entrega se o processo cair entre o envio e a conclusão no banco.

## Observabilidade

Logs do ciclo de vida e do worker incluirão, quando aplicável:

- geração;
- estado da sessão;
- `command_id`;
- tentativa;
- motivo da invalidação ou falha;
- resultado normal, repetível ou incerto.

A implementação emitirá logs estruturados e eventos `record_engine_event` para reconexões, falhas de inicialização, recuperações do watchdog, leases expirados, requeues, tentativas esgotadas e resultados incertos. A configuração de alertas externos consumirá esses eventos e permanecerá registrada no checklist de produção até ser comprovada no ambiente.

## Migração e compatibilidade

O deploy seguirá esta ordem:

1. aplicar migração aditiva com novos campos e RPCs compatíveis;
2. publicar a engine que usa leases;
3. ativar a recuperação de leases expirados;
4. remover compatibilidade antiga apenas em uma mudança posterior.

A recuperação deve ser idempotente. Na ativação, comandos antigos em `processing`, que não possuem lease nem informação sobre início do efeito, serão marcados como `failed/uncertain`; não serão reenfileirados automaticamente.

## Testes

Os testes usarão sockets, relógios, sleeps e RPCs falsos para comprovar:

- socket antigo não altera caches nem executa efeitos após reconexão;
- falha de inicialização limpa recursos e agenda uma reconexão;
- watchdog recupera mesmo quando `sock.end()` rejeita ou trava;
- close tardio não afeta a sessão atual;
- `stop()` seguido de `start()` nunca mantém dois loops;
- troca de geração cancela trabalho antes do efeito externo;
- lease expirado antes do efeito volta à fila;
- interrupção após início do efeito resulta em `uncertain`;
- tentativas esgotadas resultam em falha definitiva;
- lease antigo não conclui comando reivindicado novamente;
- shutdown não deixa listeners, timers ou promessas controladas pendentes.

## Critérios de aceite

- Testes focados do ciclo de vida e do worker passam deterministicamente.
- Suíte completa da engine permanece verde.
- Verificação sintática do Node passa.
- Migrações e RPCs são validados em banco de teste.
- TypeScript e build da aplicação web passam.
- O diff recebe revisão de arquitetura e qualidade.
- O checklist de produção só é atualizado depois das evidências acima.

## Fora de escopo

- Garantia de entrega exatamente uma vez pelo WhatsApp.
- Reescrita completa da engine ou da fila anti-ban.
- Painel visual novo para comandos incertos; inicialmente será adotado procedimento operacional documentado.
- Alterações em campanhas, funis ou regras de boas-vindas que não sejam necessárias para isolamento por geração.
