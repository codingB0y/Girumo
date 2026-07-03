# Engine Connection Watchdog Design

## Objetivo

Detectar sockets Baileys que permanecem aparentando conexão, mas deixaram de transportar dados, e acionar o fluxo de reconexão existente sem criar loops agressivos ou interferência entre sockets antigos e novos.

## Estratégia

O `ConnectionWatchdog` existente permanece responsável pelos pings: envia presença a cada 45 segundos, aplica timeout de 15 segundos e considera a conexão morta após três falhas consecutivas. Um sucesso entre falhas zera o contador.

Uma nova camada de ciclo de vida, no mesmo módulo, controla qual socket é o ativo. Ela inicia o watchdog apenas após `connection === "open"`, substitui e encerra qualquer watchdog anterior, ignora callbacks atrasados de sockets substituídos e para no evento `close` ou no shutdown do processo.

## Fluxo de recuperação

1. O Baileys informa conexão aberta.
2. A engine registra o socket como atual e anexa o watchdog.
3. Pings bem-sucedidos mantêm a conexão sem efeitos adicionais.
4. Três falhas consecutivas fazem o watchdog encerrar somente o socket ainda ativo.
5. O evento `connection === "close"` executa a limpeza e usa o backoff já existente para reconectar.
6. Um evento tardio de socket antigo não pode parar nem encerrar a conexão nova.

## Limites de responsabilidade

- O watchdog não cria sockets nem chama `start()` diretamente.
- O watchdog não altera o backoff, credenciais, QR, workers ou limites anti-ban.
- O Coolify continua verificando `/health/live`; readiness continua sinalizando a disponibilidade funcional.
- Nenhuma dependência nova será adicionada.

## Tratamento de erros

Falhas de ping são registradas sem lançar exceções para o processo. O encerramento por watchdog usa um erro identificável e deixa o handler de `close` decidir entre logout e reconexão. Chamadas repetidas de stop e detach são idempotentes.

## Testes e verificação

- Um ping bem-sucedido zera falhas anteriores.
- Três falhas consecutivas disparam recuperação uma única vez.
- Trocar o socket para o novo watchdog para o anterior.
- Callback atrasado do socket antigo não encerra o socket novo.
- Close de socket antigo não para o watchdog atual.
- Shutdown para o watchdog ativo.
- Suíte completa da engine, sintaxe Node e gate local permanecem verdes.

## Fora de escopo

- Métricas e alertas externos do watchdog.
- Configuração dinâmica dos intervalos.
- Mudança na política de reconexão do Baileys.
