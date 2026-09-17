# Prova de Comunidade — Resultado (Task 0.2)

**Data:** 2026-09-12
**Decisão:** CANCELAR tasks 1.x e 2.3 — Fase 2 entregue só-leitura.

## O que foi montado

- Fork da Evolution 2.3.7 com as rotas `/community/create` e `/community/linkGroup` (Task 0.1, commit `6d189fc1` em `codingB0y/evolution-girumo-community-test`, branch `girumo/community`).
- Instância separada no Coolify (servidor `girumo-engine`, mesmo VPS da produção mas resource isolado): app `prova-comunidade` + Postgres `prova-comunidade-db`, domínio `http://wrhd5wam4cl70z6lqf79qrdf.169.58.78.233.sslip.io`.
- Build e deploy OK. `GET /` respondeu `{"status":200,"message":"Welcome to the Evolution API, it is working!","version":"2.3.7"}`.

## O que aconteceu ao vincular o número

1. `POST /instance/create` — `200`, instância `prova-comunidade` criada em modo `connecting`.
2. Primeira tentativa: chip de teste descartável. O WhatsApp recusou o vínculo do aparelho com `"não é possível conectar novos aparelhos, tente novamente mais tarde"` — bloqueio do próprio WhatsApp no pareamento, antes de qualquer rota nossa ser exercitada. Provavelmente relacionado à idade/histórico recente do chip.
3. Segunda tentativa, a pedido do Igor: um número de WhatsApp **Business** dele, não conectado a nenhuma instância Evolution/Baileys no momento. `GET /instance/connect` → QR válido → escaneado → `GET /instance/connectionState` foi a `"state":"open"` (vínculo bem-sucedido).
4. Minutos depois, **antes de qualquer grupo ser criado ou de qualquer rota `/community/*` ser chamada**, o número foi banido pelo WhatsApp. `GET /instance/connectionState` confirmou `"state":"close"`.

Nenhuma chamada às rotas `/community/create` ou `/community/linkGroup` chegou a ser feita — o número morreu antes de existir qualquer grupo pra vincular.

## Por que isso conta como "cancelar" — há um 403 literal no registro

**Correção de 2026-09-15.** A versão anterior desta seção dizia que nenhuma saída da tabela de decisão bateu literalmente e que eu tratava o banimento como *equivalente* ao 403. **Isso estava errado.** Ao ler o registro da instância via `GET /instance/fetchInstances`, o 403 está gravado explicitamente:

```json
"disconnectionReasonCode": 403,
"disconnectionObject": {
  "error": { "data": { "reason": "403", "location": "lla" },
    "output": { "statusCode": 403,
      "payload": { "statusCode": 403, "error": "Forbidden", "message": "Connection Failure" } } },
  "date": "2026-09-12T18:44:33.343Z" }
```

`403` é `DisconnectReason.forbidden` do Baileys. A tabela de decisão do plano (Task 0.2 Step 8) previa `403` como uma das três saídas, e é exatamente essa que ocorreu — não precisa de analogia nenhuma.

Uma ressalva honesta sobre o enquadramento: o plano provavelmente imaginava um 403 vindo de uma chamada a `/community/*`. O 403 que aconteceu foi na **camada de conexão** — o WhatsApp proibiu a conta inteira. Isso é igual ou pior que o caso previsto, então a consequência é a mesma.

Ruling (registrado no ledger SDD, `.superpowers/sdd/2026-09-04-gestao-de-comunidade-fase-0-2/progress.md`): a integração via Baileys/Evolution carrega risco real e demonstrado de ação do WhatsApp contra a conta — não é seguro construir sobre isso os botões de escrita (criar comunidade e vincular grupo pelo WhatsApp) sem antes entender esse risco com mais profundidade, fora do escopo deste plano.

## Consequência prática

- **Tasks 1.x (Fase 1 — endurecer a peça na Evolution) e 2.3 (Cliente HTTP da Evolution): CANCELADAS.**
- **Fase 2 segue, mas só-leitura**: a Task 2.2 (store de comunidades) já foi desenhada pra esse cenário — grava só no banco, sem chamar a Evolution (ver o próprio texto da Task 2.2: "esta task entrega um store completo e testável sozinho, que já resolve a gaveta lógica e os 76 órfãos mesmo que a Fase 0 tenha terminado em 403"). Tasks 2.1, 2.4 e 2.5 não têm dependência direta do resultado desta task e seguem normalmente; a Task 2.5 Step 5 simplesmente não ganha o botão "Criar no WhatsApp" (condicional a Fase 0 ter passado, que não é o caso).
- O fork da Evolution (`evolution-girumo-community-test`) e as rotas da Task 0.1 ficam prontos e testados no nível de build, mas sem validação end-to-end contra o WhatsApp real — retomar exige entender a causa do banimento antes.

## Tentativas adicionais (2026-09-15) — e a retratação do "padrão de 3 falhas"

Após o banimento, o Igor pediu para tentar de novo — primeiro pedindo explicitamente o número de PRODUÇÃO (`62998191314`), que eu recusei (ver alerta do plano). Depois de reconfirmação, ele apontou que esse número aparece em `/admin/configuracoes` com status **"Desconectado"** — configurado para o tenant, mas sem sessão ativa (o que remove o risco de derrubar sessão viva via `440 connectionReplaced`). Seguiram-se mais tentativas, todas terminando em `"não é possível conectar novos dispositivos no momento"`.

**Eu escrevi aqui que isso era um "placar de 3 tentativas, 2 números, 3 bloqueios" e que o padrão não era específico de um número, indicando restrição ativa do WhatsApp. Retrato essa conclusão — ela era artefato da minha própria ferramenta, não dado sobre o WhatsApp.** O que a investigação de 2026-09-15 encontrou:

1. **A instância estava presa à sessão banida.** `fetchInstances` mostrava `connectionStatus: "connecting"` com `ownerJid: "556291215471@s.whatsapp.net"` e `profileName: "Virei Moda Growth"` — as credenciais do número que tomou o 403 em 12/09. Uma instância nesse estado não inicia pareamento novo; `GET /instance/connect` tenta retomar a sessão morta.
2. **Depois de `DELETE /instance/logout` + `DELETE /instance/delete` + `POST /instance/create`, o QR passou a ser vivo e rotativo** — 3 QRs distintos numa janela de 110s (maior que o `qrTimeout` de 60s do Baileys), confirmando socket ativo. O `code` da instância nova (`2@pR8BO…`) é diferente do que a instância velha servia (`2@qPgml6…`).
3. **Entregar QR como PNG no chat é estruturalmente furado.** O QR expira em ~60s; o ciclo decodificar → enviar arquivo → abrir → navegar no WhatsApp → escanear passa disso com folga. Mesmo com instância saudável, o QR chega morto. O caminho robusto é `GET /instance/connect/{inst}?number=<telefone>`, que devolve `pairingCode` (código digitado em "Vincular com número de telefone") — sem transferir imagem e com TTL maior.

Ou seja: **o número nunca foi a variável** naquelas tentativas, mas não porque o WhatsApp esteja bloqueando tudo — e sim porque nenhuma delas chegou a apresentar um QR válido. Nível de certeza: itens 1 e 2 são medidos e reproduzíveis; que *todos* os QR dos 3 dias estivessem vencidos é a explicação mais provável, mas não provei QR por QR.

**Dado real que resta: exatamente um.** O 403 (`DisconnectReason.forbidden`) em `556291215471`, num pareamento que funcionou de verdade — houve sync de histórico (`recv 3 chats, 3 contacts, 2 msgs, is latest: true`) e troca real de mensagens nos logs do container antes da queda. As demais "falhas" não são evidência de nada.

**A decisão não muda:** cancelar tasks 1.x e 2.3, Fase 2 só-leitura. Mas agora ela se apoia no 403 literal do plano, não num padrão inexistente. O risco de banimento de conta é real e demonstrado uma vez; retomar o teste exige um número genuinamente descartável e o fluxo de `pairingCode` em vez de QR por imagem.

## Infra de teste

A pedido do Igor, a infra do Coolify (`prova-comunidade` + `prova-comunidade-db`) **fica em pé por enquanto** — ele pediu análise da conta pro WhatsApp e pode querer retomar o teste se ela for liberada. Desligar fica pendente até essa resposta.
