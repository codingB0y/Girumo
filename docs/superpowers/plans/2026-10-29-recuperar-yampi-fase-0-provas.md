# Recuperar (Yampi) — Fase 0: provas antes de código de produto — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Nesta fase, executar com `superpowers:executing-plans`, numa sessão só.** As tarefas 1 a 5 são código com teste e caberiam em subagentes, mas as 6 a 11 são ao vivo, com o Igor do lado, e dependem do mesmo ambiente (as janelas dele, o túnel aberto, a instância de teste de pé). Subagente novo não herda nada disso.

**Goal:** Responder com evidência colhida na hora — não de memória nem de documentação — as perguntas da seção 8 da spec (o que a Yampi manda de fato e o que a Evolution devolve no privado), decidir por escrito se o automático liga (go/no-go) e deixar fixtures sem dado pessoal para os planos 3, 4, 6 e 7.

**Architecture:** Ferramentas descartáveis em Node, sem dependência, em `infra/scripts/fase0-recuperar/`. Um servidor local atrás de um túnel temporário do cloudflared recebe os avisos reais da Yampi e da Evolution; duas CLIs finas chamam a API da Yampi (credencial da piloto) e a Evolution de produção (só uma instância de teste isolada); um redator mascara tudo — default-deny, preservando formato e igualdade — antes de a sessão ler qualquer coisa ou de algo ir para o repo público. O bruto fica numa pasta fora do git e é apagado no fim.

**Tech Stack:** Node 24 (`node:test`, `fetch`, `node:http`, `node:crypto`), Windows PowerShell 5.1, `cloudflared` (quick tunnel), Evolution API 2.3.7, API v2 da Yampi (`https://api.dooki.com.br/v2/{alias}`).

**Spec:** `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` — §8 (as provas e o go/no-go), "Restrições externas" (o que a pesquisa de 29/10 afirma e esta fase confere), §1.5–1.6 (o que depende do resultado). Índice dos planos: `docs/superpowers/plans/2026-10-29-recuperar-yampi-00-indice.md`. Precedente de resultado escrito: `docs/superpowers/plans/_prova-comunidade-resultado.md`.

## Global Constraints

Do índice dos planos (valem para o que esta fase toca; a lista é a do índice, copiada):

- TypeScript strict, imports com `@/`, arquivos em `kebab-case`, sem `any` sem justificativa. Nomes de domínio seguem o código (em português, como `reconciliarConexoes`).
- Store com service-role filtra `.eq('tenant_id', …)` sempre: o RLS não protege esse caminho.
- Migração: arquivo novo em `apps/web/supabase/migrations/` + linha no fim de `deploy/supabase/apply-order.txt`; o CI aplica em dev no PR e em prod no merge; baseline com `npm run schema:baseline` (credencial de dev) no mesmo PR; idempotente (`if not exists`); `security definer` sempre com `set search_path`; RLS ligado; policy no padrão `auth.uid()` + `memberships` (`app.has_membership`, `app.user_tenant_ids`), nunca GUC. Nunca DDL à mão.
- Função nova: conferir `has_function_privilege` de `anon`, `authenticated` e `public` (o event trigger `ensure_anon_revoked` cobre `anon`/`public`; `authenticated` nasce com EXECUTE pelo default privilege).
- `hubflow-engine/DECISIONS.md` é vinculante: nada de "digitando", marcar como lida, texto girado, troca de aparelho, proxy.
- O número dos grupos nunca manda DM; o número do atendimento nunca posta em grupo (trava com teste mutante).
- Tipos: rodar os dois `tsc` (web e worker); lint e `tsx --test` não checam tipo.
- Antes do push: `verify-local.ps1` (secrets + build).
- Texto de tela em português do Brasil, design G2 (fonte base 14 px; 12 px só em contador; verde ácido só em Postar/AO VIVO/LOTOU).
- Commit com prefixo semântico em inglês e a linha `Co-Authored-By` do assistente.

Desta lista, esta fase só toca em: `DECISIONS.md`, a regra de que o número dos grupos nunca manda DM, o commit e o gate do push. Não há migração, store, tipo do app nem tela. **Desvio consciente do gate:** este trabalho não toca código do app (só `.mjs`, `.ps1`, fixtures e markdown), o `node_modules` do checkout principal está vazio e o C: tem ~8 GB livres (`npm ci` + build local é o ENOSPC da nota de disco cheio). O gate local desta fase é: testes da fase + `scan-secrets.ps1` + `redigir.mjs conferir`; o `verify` do CI roda o resto antes do merge.

Específicas da Fase 0 (spec §8 e "Restrições externas"; pedidos do Igor de 29/10):

- **Nenhum dado pessoal sai da máquina do Igor.** O payload da Yampi tem nome, CPF, telefone e endereço de cliente real: captura só em servidor Node local, atrás de túnel temporário do cloudflared. Nunca request bin de terceiro (webhook.site e similares) e nunca colar payload em chat, issue ou PR.
- **O bruto fica em `C:\Users\Igor\fase0-recuperar-bruto\`** (`FASE0_BRUTO`): fora de qualquer repositório git (a ferramenta recusa o contrário) e fora de Desktop/OneDrive. No repo entra só fixture redigida, com dado pessoal trocado por dado falso do mesmo formato.
- **A sessão só lê `redigido/` e a saída das ferramentas**, que não imprimem telefone, e-mail, documento, token nem segredo.
- **Credencial só em variável de ambiente**, digitada pelo Igor sem eco (`credenciais.ps1`): nunca em arquivo, comando, chat ou commit. O `secret_key` do aviso da Yampi só existe na memória do servidor de captura.
- **Evolution de produção, instância isolada:** nome `fase0-recuperar-<data>`, sem linha em `instances` no banco da Girumo, webhook apontando para o túnel (não para o app), apagada no fim. As ferramentas recusam qualquer outro nome, porque a chave usada é a global.
- **Volume e ritmo do chip de teste:** no máximo 6 mensagens enviadas pela API na fase inteira (3 previstas + até 3 de reforço), com pelo menos 40 s entre elas (a ferramenta recusa antes); nada de grupo; nada de "digitando", "marcar como lida" ou texto girado. Pareamento por código, nunca QR por imagem. O chip tem que poder ser perdido.
- **Só se envia para os celulares do Igor** (rótulos `B` e `C`). A única exceção é o número com DDD 00, que não existe, e só depois de `whatsappNumbers` confirmar `exists: false`.
- **Sem DDL, sem migração, sem tocar em `.env*`.** Chamada real a API só pelas ferramentas desta fase, com o Igor presente.
- **Comandos entregues ao Igor:** Windows PowerShell 5.1 (sem `&&`/`||`, `curl.exe` com `.exe`, blocos marcados `powershell`). Nos comandos de repositório, `git -C $wt` ou `Set-Location $wt`: o cwd reseta.
- **Um PR = uma coisa:** ferramentas num PR (tarefa 5), resultado e fixtures em outro (tarefa 11). O PR do resultado passa de ~10 arquivos porque a maior parte é fixture (dado), e o corpo do PR diz isso.

## Review Focus

As cinco coisas que mais provavelmente morderiam quem usa isto e que a spec não pede por escrito. Cada uma tem o teste na tarefa dona (a quinta é operação, com verificação no fim).

1. **Cliente de verdade chegando no túnel** enquanto o aviso da loja piloto está de pé (o aviso é da loja inteira, não só do teste): a captura só grava aviso que contém o e-mail ou o telefone do teste; o resto vira uma linha sem corpo em `ignorados.log`, e a resposta é 200 igual (a Yampi conta falha). Teste: tarefa 1, `aviso da Yampi SEM marcador (cliente de verdade) nunca vai para o disco` + mutante B.
2. **Dado real sobrevivendo na fixture que vai para o repo público** — telefone escrito de outro jeito (com/sem 55, com/sem o 9º dígito, com máscara), e-mail em caixa diferente, alias dentro de URL, miniatura de foto em bytes, texto livre. Teste: tarefa 2, `nenhum valor real sobrevive, em nenhum formato`, `buffer serializado…` e `conferência: pega vazamento…`.
3. **A chave global da Evolution e a credencial do lojista apagando o que não é do teste** (instância `gr_<uuid>` de cliente, aviso de outra integração da loja): travas por prefixo da instância e por nome + id do aviso. Teste: tarefa 1, `trava: a chave global só mexe em instância de teste` e `trava: só apaga o aviso que a Fase 0 criou` + mutante A.
4. **A resposta chegar antes do ack, o 9º dígito, a Evolution trocando o `remoteJid` pelo `remoteJidAlt` antes de avisar, mensagem de grupo e eco do próprio chip misturados na amostra:** o veredito só conta respostas a envios nossos e sem confundir os casos. Teste: tarefa 4, `corrida: a resposta pode chegar antes do ack…` e `o 9º dígito não atrapalha…`.
5. **Túnel caindo no meio, aviso esquecido apontando para endereço morto, instância esquecida na VPS de produção, chip restringido durante a prova:** sem teste automático. Verificações de fim: `webhook-listar` sem entrada "da Fase 0" (tarefa 9), `apagar` com `instancias_com_esse_nome=0` e túnel respondendo `530` (tarefa 11), e o `estado` do chip registrado no resultado (tarefa 8).

## Antes de começar

**O que o Igor traz** (tudo digitado por ele, nada passa pela sessão):

- Credencial Yampi da loja piloto: alias, `User-Token` e `User-Secret-Key` (Yampi › Perfil › Credenciais de API).
- Chave da Evolution: `AUTHENTICATION_API_KEY` do recurso `evolution-api` no Coolify (Environment Variables). É a mesma que o app e o worker usam como `EVOLUTION_API_KEY`; na Vercel ela é Sensitive e não dá para ler. A URL, `https://wa.girumo.com.br`, o script já define (`EVOLUTION_API_URL`).
- Um **chip de teste** com WhatsApp que possa ser perdido (o precedente de 12/09 perdeu um número em minutos depois de parear), sem mensagem de ausência nem de saudação ligada.
- **Dois celulares com WhatsApp** que nunca conversaram com o chip: **B** (cliente "de verdade": é o telefone dos checkouts de teste e quem recebe o primeiro envio) e **C** (escreve primeiro para o chip, depois recebe resposta).
- Uma foto qualquer e um áudio curto, para mandar do B para o chip.
- Um produto barato da loja piloto (o Pix real de valor simbólico) e um navegador com janela anônima.
- Cerca de 2 a 3 horas. Há esperas de verdade: o lembrete de carrinho (~3 min ou mais) e o vencimento do Pix (30 min por padrão).

**Quem faz o quê.** Duas abas de PowerShell abertas pelo Igor no painel Terminal do app (ou duas janelas): **Aba A** só roda o servidor de captura; **Aba B** roda todo o resto. A sessão não digita nas abas dele: entrega um bloco de comando por passo, o Igor cola, e a sessão lê o resultado com `read_terminal`.

- Do Igor: `credenciais.ps1`, toda ferramenta que usa credencial ou lê o bruto (`captura`, `yampi`, `evolution`, `ligacao`, `redigir tudo` e `conferir`), e tudo que acontece nos celulares, no site da loja e no painel da Yampi.
- Da sessão: escrever e testar as ferramentas, dizer qual comando colar, ler a saída das abas (que não leva dado pessoal) e **a pasta `redigido/`** (pedir acesso só a ela, nunca à pasta-mãe), preencher o resultado, copiar as fixtures, commitar.

**Preâmbulo dos blocos.** O shell da sessão não guarda variável entre chamadas, então todo bloco que ela roda começa por estas duas linhas (omitidas nos blocos abaixo para não repeti-las 40 vezes):

```powershell
$principal = 'C:\Users\Igor\Desktop\HubFlow-platform'
$wt = Join-Path $principal '.claude\worktrees\fase0-recuperar'
```

Nas abas do Igor, `$wt` fica definido pelo bloco de abertura da tarefa 6.

**Pontos de parada** (o roteiro manda parar e falar com o Igor, não insistir):

1. `versao` diferente de `2.3.7`: o contrato desta fase foi lido na fonte dessa tag; reler a tag certa antes da tarefa 8.
2. `ping` com 401 ou 403: credencial errada (o token da Yampi muda quando o lojista troca a senha); refazer `credenciais.ps1`.
3. Pareamento recusado duas vezes ("não é possível conectar novos dispositivos"): chip novo demais. Trocar de chip; não insistir (o precedente de 15/09 mostrou que parte das "falhas" era QR vencido, por isso o código).
4. `estado` com `connectionStatus` diferente de `open` e `disconnectionReasonCode` 401/403: o WhatsApp restringiu ou baniu o chip. Parar os envios, registrar (é dado de risco, seção "Risco do chip" do resultado) e avisar o Igor. Nada de re-parear em loop.
5. `conferir` com qualquer `VAZAMENTO`: nada é commitado; corrige-se o redator com teste novo e roda-se `redigir tudo` de novo.
6. Veredito `NO-GO` ou `INCONCLUSIVO` depois de 2 rodadas de reforço: tarefa 10 manda avisar o Igor.
7. Se a Aba A fechar ou o túnel cair com o aviso da Yampi de pé: `yampi.mjs webhook-apagar`, subir a captura de novo e `webhook-criar` outra vez (URL e chave novas).

## Mapa de arquivos

```
infra/scripts/fase0-recuperar/
  comum.mjs         pasta do bruto (fora do git), marcadores, assinatura da Yampi, travas de nome
  captura.mjs       servidor local + túnel; recebe os avisos da Yampi e da Evolution
  redigir.mjs       tudo | achar | conferir: mascara o bruto e confere vazamento
  yampi.mjs         chamadas à API da Yampi
  evolution.mjs     chamadas à Evolution de produção (só a instância de teste)
  ligacao.mjs       veredito resposta <-> telefone (go/no-go)
  credenciais.ps1   pede as credenciais sem eco; só no ambiente da janela
  comum.test.mjs  captura.test.mjs  redigir.test.mjs  ligacao.test.mjs   (node:test)
apps/web/src/lib/yampi/__fixtures__/         fixtures redigidas da Yampi (diretório novo)
apps/web/src/lib/evolution/__fixtures__/     fixtures redigidas do 1:1 (junto das que já existem)
docs/superpowers/plans/_recuperar-fase-0-resultado.md
Fora do repo: C:\Users\Igor\fase0-recuperar-bruto\   (bruto, apagado no fim)
```

## Decisões deste plano

- **Onde ficam os scripts:** `infra/scripts/fase0-recuperar/`, como os `.mjs` de operação que já existem (`zernio-webhook.mjs`, `stripe-instagram-precos.mjs`: leem credencial do ambiente e não a imprimem). Entram no repo para o redator ser revisável antes de tocar em dado real e a captura poder ser repetida se a Yampi mudar o payload. Não entram no `npm test`. Remover a pasta quando o PR 7 estiver no ar.
- **Túnel:** `cloudflared tunnel --url` (quick tunnel, sem conta), iniciado pela própria `captura.mjs`: um processo só, e fechar a captura mata o endereço público. O servidor público só atende `/yampi/<token>`, `/evo/<token>`, `/img/<token>/teste.jpg?assinatura=…` e `/rejeita/<token>` (responde 401 de propósito, para a prova S11 do plano 6: o que a Yampi faz com um aviso cuja URL devolve erro); o resto é 404.
- **Variáveis:** `YAMPI_ALIAS`, `YAMPI_USER_TOKEN`, `YAMPI_USER_SECRET_KEY`; `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` (os nomes que o app e o worker já usam); da fase: `FASE0_BRUTO`, `FASE0_MARCADORES`, `FASE0_CELULARES`, `FASE0_LOJA_TERMOS`, `FASE0_FRASES`; opcionais: `FASE0_INSTANCIA`, `FASE0_PORTA` (8787), `FASE0_IMAGEM`, `FASE0_YAMPI_BASE` (só para teste local contra servidor falso).
- **Segredo do aviso da Yampi:** entregue pela `yampi.mjs` a uma segunda porta do servidor de captura, só em `127.0.0.1` (o túnel leva apenas a pública), e mantido só em memória.
- **Aviso criado na Yampi da piloto:** **apagar** ao fim da tarefa 9, antes de qualquer outra coisa. Aponta para um endereço que morre com a sessão (cada falha conta para as 30 que desativam o aviso), ocupa uma vaga do limite de avisos do plano da loja, e o PR 6 cria o dele, com a URL fixa de produção e um segredo selado, que este não consegue reaproveitar.
- **Papéis dos celulares:** B recebe primeiro e responde (o caso do Recuperar); C escreve primeiro e depois recebe (o caso da conversa "não identificada"). Uma amostra de "desconhecido que escreve primeiro" de verdade exigiria um terceiro número; fica registrado como não provado se o Igor não tiver.
- **Sem teste de schema nesta fase:** o `node_modules` do principal está vazio, então não dá para rodar `parseEvolutionWebhook` sobre as fixtures aqui. O plano 4 faz isso na conferência do começo dele (está dito no "Impacto" do resultado).

## Contrato lido na fonte e na doc (para conferir ao vivo)

**Evolution 2.3.7** — tag `2.3.7` sem `v` no GitHub (a imagem Docker é `v2.3.7`); o Swagger da stack não existe, então a fonte é `src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts`, mais os DTOs e rotas. A tarefa 8 confere cada item contra a instância real; o que divergir vira "diferente" no resultado.

- **Variáveis:** o app lê `EVOLUTION_API_URL` e `EVOLUTION_API_KEY` (`apps/web/src/lib/evolution/client.ts`, via `resolveSecret`); o worker, as mesmas duas em `apps/worker/src/env.ts`. A chave é a `AUTHENTICATION_API_KEY` do compose (`deploy/coolify/evolution.docker-compose.yml`). Cabeçalho `apikey`. O domínio público passa pelo gateway nginx, que fecha só `/manager`.
- **`POST /chat/whatsappNumbers/{inst}`** com `{numbers: string[]}` devolve `[{jid, exists, number, name?, lid?}]`. O `lid` é a **string literal `"lid"`**, uma flag, nunca o valor do LID (linhas 3576–3593 e 3668). Para número brasileiro ele tenta com e sem o 9º dígito (linhas 3600–3611) e devolve o JID que o WhatsApp tem. Ou seja: a spec supõe que a consulta "devolva o `@lid`"; a fonte diz que não.
- **Envio (`POST /message/sendText/{inst}`, `{number, text}`):** `sendMessageWithTyping` roda `whatsappNumber` por dentro (linha 2295), usa o JID achado e, se `exists` for `false`, lança 400 com `{jid, exists: false, number}` (linhas 2297–2299). A resposta é o `messageRaw` (`key {id, remoteJid, fromMe}`, `status: PENDING`, `message`, `messageTimestamp`…) e o mesmo objeto sai no evento `send.message` (linha 2545). O pré-check separado que a spec manda fazer duplica isso, e só serve para gravar o JID antes.
- **`messages.upsert`:** na linha 1478, se `key.remoteJid` é `@lid` **e** existe `key.remoteJidAlt`, a Evolution troca o `remoteJid` pelo telefone antes de avisar. Os campos de telefone ao lado são `remoteJidAlt` e `participantAlt`; `senderPn` não existe na 2.3.7 (o repo já lê `senderPn` por precaução em `relampago/upsert-message.ts`). Sem `remoteJidAlt`, fica `@lid`.
- **`messages.update`** (linhas 1613–1621): `{keyId, remoteJid, fromMe, participant, status, instanceId, messageId}`, com `status` em `ERROR`, `PENDING`, `SERVER_ACK`, `DELIVERY_ACK`, `READ`, `PLAYED`. Só sai se a mensagem existir no banco da Evolution (o compose liga `DATABASE_SAVE_DATA_NEW_MESSAGE`). O `remoteJid` aqui é o da Baileys, que pode ser `@lid` mesmo quando o `upsert` já veio trocado: casar por `keyId`, nunca por JID. O fixture de julho (`messages-update.json`) já mostra isso.
- **`POST /chat/getBase64FromMediaMessage/{inst}`** aceita `{message: {key: {id}}}` e busca a mensagem no banco (linhas 3837–3842); devolve `{mediaType, fileName, caption, size, mimetype, base64, buffer}`.
- **`POST /instance/create`** (`src/api/controllers/instance.controller.ts`) com `qrcode: true` e `number` chama `connectToWhatsapp(number)`, espera 5 s e devolve `qrcode.pairingCode` (linhas 153–157); sem `number` não há código. Os ajustes (`rejectCall`, `groupsIgnore`, `alwaysOnline`, `readMessages`, `readStatus`, `syncFullHistory`) valem `false` quando não informados (linhas 125–134). Também existem `GET /settings/find/{inst}`, `GET /instance/connectionState/{inst}`, `GET /instance/fetchInstances?instanceName=` (sem o nome devolve as instâncias de produção) e `DELETE /instance/logout|delete/{inst}`.
- **`date_time` do aviso** é hora de Brasília rotulada `Z` (medido em 01/10/2026): a captura grava `chegada`, o relógio do servidor.

**Yampi** (`docs.yampi.com.br`, páginas lidas em 29/10) — base `https://api.dooki.com.br/v2/{alias}`, cabeçalhos `User-Token` e `User-Secret-Key`.

- **Avisos:** `POST /webhooks` com `{name, url, events}` (os três obrigatórios) devolve 201 com `id`, `active`, `name`, `url` e `secret_key` de 40 caracteres; `include=events` acrescenta `events`, `disabled_at`, `created_at`. `GET /webhooks` (paginado), `GET /webhooks/{id}` e `DELETE /webhooks/{id}` (204). A criação é limitada pelo plano da loja. Resposta em até 5 s; 30 falhas desativam o aviso. Eventos: `order.created`, `order.paid`, `order.status.updated`, `transaction.payment.refused`, `cart.reminder` (a doc lista outros, de nota fiscal, cliente, produto e cashback, que não usamos). Envelope `{event, time, merchant {id, alias}, resource}`; `time` costuma vir `"AAAA-MM-DD HH:MM:SS"`, sem fuso, e as datas dentro de `resource` são objetos `{date, timezone_type, timezone}`. Assinatura em `X-Yampi-Hmac-SHA256`: base64 do HMAC-SHA256 **binário** do corpo cru.
- **Pedidos:** `GET /orders` aceita `include` (`items, customer, status, statuses, shipping_address, transactions…`) e os filtros `date` (`campo:início|fim`, com `created_at`, `updated_at`…), `payment_method[]` (`pix`, `billet`, `credit_card`, `deposit`), `status_id[]`; `limit` até 100. A doc diz que o endpoint devolve 400 "quando se usa a busca filtrada" e manda usar `/search/orders`, que **não** tem filtro de data nem de status: por isso a tarefa 7 testa três formas. `GET /orders/{id}` e `GET /orders/{id}/transactions` (esta traz `payment.data.is_pix` e `metadata` como lista de `{key, value}`; `pix_qr_code` e `pix_expiration_date` **não** estão no schema oficial). O pedido não lista `cart_token` nem `created_at` no nível de cima.
- **Carrinhos:** `GET /checkout/carts` com `include` (`customer, payment, address, items, transactions, search, metadata…`) e filtros `q`, `status` (`payment_refused`, `no_transaction`), `has_transactions`, `customersData`, `date`. Campos: `token`, `simulate_url`, `unauth_simulate_url`, `totalizers`, `total_transactions`, `last_transaction_status`. `created_at` e `updated_at` do carrinho só vêm em `include=search`. Paginação por `scroll_id`.
- **Status:** `GET /checkout/statuses` (id e alias, como `waiting_payment`).
- **Limites:** 60 req/min em `/{alias}/*`, 120 em `GET /orders`, 30 em produtos e SKUs. A doc não diz quais cabeçalhos de limite voltam nem qual código sai ao estourar: a tarefa 6 (`ping`) mede.

---


# PARTE A — Ferramentas (sem o Igor)

### Task 1: Peças comuns e servidor de captura

**Files:**
- Create: `infra/scripts/fase0-recuperar/comum.mjs`
- Create: `infra/scripts/fase0-recuperar/captura.mjs`
- Test: `infra/scripts/fase0-recuperar/comum.test.mjs`, `infra/scripts/fase0-recuperar/captura.test.mjs`

**Interfaces:**
- Consumes: nada.
- Produces (as outras tarefas usam estes nomes; não renomear):
  - `comum.mjs`: `PREFIXO_INSTANCIA`, `NOME_DO_AVISO`; `pedirEnv(nome, env?) → string` (lança se vazio); `prepararBruto(pasta) → string` e `dirBruto() → string` (recusam pasta dentro de repositório git; criam `eventos/`, `api/`, `redigido/`); `lerJson(arq, padrao?)`, `gravarJson(arq, obj)`, `lerEstado(bruto?)`, `mesclarEstado(patch, bruto?)`; `marcadores(env?) → string[]`, `temMarcador(texto, lista?) → boolean`, `celulares(env?) → Record<string, string>`; `veredictoAssinatura(corpo: Buffer, cabecalho, segredo) → "ok" | "so_hex" | "so_json_reserializado" | "invalido" | "sem_segredo" | "sem_cabecalho"`; `assertNomeDeTeste(nome)`, `nomeDaInstancia(env?)`, `assertAvisoNosso(aviso, idEsperado)`; `caminhoNoObjeto(obj, caminho)`, `lerEvento(bruto, seq)`, `eventosDaRota(bruto, "yampi" | "evo")`, `dormir(ms)`, `urlDoTunel(linha)`.
  - `captura.mjs`: `criarCaptura({ bruto, tokens, todos?, marcas?, imagem? }) → { publico, controle }` (dois `http.Server`, sem `listen`). Arquivos do bruto: `eventos/NNN-<rota>-<evento>.json` com `{ seq, rota, chegada, assinatura, cabecalhos, bodyRaw, body }`; `urls.json` (`yampi`, `evolution`, `rejeita`, `imagem`); `estado.json`; `ignorados.log`.

- [ ] **Step 1: Worktree novo a partir de `origin/main`** (regra de PR do CLAUDE.md: nunca `checkout -b` no principal)

```powershell
$principal = 'C:\Users\Igor\Desktop\HubFlow-platform'
$wt = Join-Path $principal '.claude\worktrees\fase0-recuperar'
git -C $principal fetch origin main
git -C $principal worktree add $wt -b chore/recuperar-fase-0-provas origin/main
git -C $wt log HEAD..origin/main --oneline
node --version
```

Esperado: `Preparing worktree (new branch 'chore/recuperar-fase-0-provas')`; o `log` sem nenhuma linha (defasagem 0; passou de ~20, atualizar a branch antes de escrever); `node` em `v22` ou maior. Sem junction de `node_modules`: nenhuma ferramenta desta fase tem dependência.

- [ ] **Step 2: Escrever os testes (vermelhos)** — `comum.test.mjs` e `captura.test.mjs`

```javascript
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  assertAvisoNosso,
  assertNomeDeTeste,
  caminhoNoObjeto,
  celulares,
  nomeDaInstancia,
  prepararBruto,
  temMarcador,
  urlDoTunel,
  veredictoAssinatura,
} from "./comum.mjs";

const SEGREDO = "segredo-de-teste-da-fase-0";
const assinar = (dados, formato = "base64") => createHmac("sha256", SEGREDO).update(dados).digest(formato);

test("assinatura da Yampi: base64 do HMAC do corpo cru", () => {
  const corpo = Buffer.from('{"event":"order.paid","nome":"João/ç"}');
  assert.equal(veredictoAssinatura(corpo, assinar(corpo), SEGREDO), "ok");
  assert.equal(veredictoAssinatura(corpo, assinar(corpo), "outro-segredo"), "invalido");
  assert.equal(veredictoAssinatura(corpo, undefined, SEGREDO), "sem_cabecalho");
  assert.equal(veredictoAssinatura(corpo, assinar(corpo), null), "sem_segredo");
});

test("assinatura: diagnostica as variantes que a doc não deixa claras", () => {
  const corpo = Buffer.from('{ "event": "order.paid" }');
  assert.equal(veredictoAssinatura(corpo, assinar(corpo, "hex"), SEGREDO), "so_hex");
  const reserializado = JSON.stringify(JSON.parse(corpo.toString()));
  assert.equal(veredictoAssinatura(corpo, assinar(reserializado), SEGREDO), "so_json_reserializado");
});

test("marcador: e-mail sem diferença de caixa e telefone em qualquer formatação", () => {
  assert.equal(temMarcador('{"email":"Dono@Real.com"}', ["dono@real.com"]), true);
  assert.equal(temMarcador('{"formated_number":"(21) 98765-4321"}', ["987654321"]), true);
  assert.equal(temMarcador('{"email":"outra@pessoa.com","phone":"11988887777"}', ["dono@real.com", "987654321"]), false);
});

test("trava: a chave global só mexe em instância de teste", () => {
  assert.equal(assertNomeDeTeste("fase0-recuperar-20261029"), "fase0-recuperar-20261029");
  assert.throws(() => assertNomeDeTeste("gr_3f1a2b4c-0000-0000-0000-000000000000"), /não é instância de teste/);
  assert.throws(() => assertNomeDeTeste("fase0-recuperar-"), /não é instância de teste/);
  assert.throws(() => nomeDaInstancia({ FASE0_INSTANCIA: "producao" }), /não é instância de teste/);
  assert.match(nomeDaInstancia({}), /^fase0-recuperar-\d{8}$/);
});

test("trava: só apaga o aviso que a Fase 0 criou", () => {
  assert.doesNotThrow(() => assertAvisoNosso({ id: 7, name: "girumo-fase0-recuperar" }, "7"));
  assert.throws(() => assertAvisoNosso({ id: 7, name: "bling-pedidos" }, 7), /não é o que a Fase 0 criou/);
  assert.throws(() => assertAvisoNosso({ id: 8, name: "girumo-fase0-recuperar" }, 7), /não é o que a Fase 0 criou/);
  assert.throws(() => assertAvisoNosso(null, 7), /não é o que a Fase 0 criou/);
});

test("pasta do bruto: cria as subpastas e recusa repositório git", () => {
  const fora = mkdtempSync(join(tmpdir(), "fase0-"));
  assert.ok(prepararBruto(join(fora, "bruto")).endsWith("bruto"));
  mkdirSync(join(fora, ".git"));
  assert.throws(() => prepararBruto(join(fora, "bruto2")), /dentro de um repositório git/);
});

test("auxiliares: caminho no objeto, URL do túnel e celulares", () => {
  assert.equal(caminhoNoObjeto({ a: { b: [{ c: 1 }] } }, "a.b[0].c"), 1);
  assert.equal(caminhoNoObjeto({ a: null }, "a.b.c"), undefined);
  assert.equal(urlDoTunel("|  https://exemplo-teste-um.trycloudflare.com  |"), "https://exemplo-teste-um.trycloudflare.com");
  assert.equal(urlDoTunel("sem url aqui"), null);
  assert.deepEqual(celulares({ FASE0_CELULARES: "chip=5511999990001, B=5511999990002,ruim=123" }), { CHIP: "5511999990001", B: "5511999990002" });
});
```

```javascript
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { criarCaptura } from "./captura.mjs";
import { prepararBruto } from "./comum.mjs";

const ouvir = (servidor) => new Promise((ok) => servidor.listen(0, "127.0.0.1", () => ok(servidor.address().port)));
const SEGREDO = "segredo-de-teste-da-fase-0";

// `t.after` fecha os servidores mesmo quando uma asserção falha; sem isso um teste vermelho penduraria o runner
async function subir(t) {
  const bruto = prepararBruto(mkdtempSync(join(tmpdir(), "fase0-")));
  writeFileSync(join(bruto, "teste.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const { publico, controle } = criarCaptura({ bruto, tokens: { caminho: "tok", imagem: "img" }, marcas: ["dono@real.com"] });
  const [pp, pc] = [await ouvir(publico), await ouvir(controle)];
  t.after(() => Promise.all([publico, controle].map((s) => new Promise((ok) => { s.close(ok); s.closeAllConnections(); }))));
  return { bruto, pp, pc };
}
const postar = (porta, caminho, corpo, cabecalhos = {}) =>
  fetch(`http://127.0.0.1:${porta}${caminho}`, { method: "POST", body: corpo, headers: { "content-type": "application/json", ...cabecalhos } });

test("aviso da Yampi com marcador é gravado, com o veredito da assinatura", async (t) => {
  const { bruto, pp, pc } = await subir(t);
  await fetch(`http://127.0.0.1:${pc}/segredo`, { method: "POST", body: JSON.stringify({ segredo: SEGREDO }) });
  const corpo = JSON.stringify({ event: "order.created", resource: { customer: { data: { email: "DONO@real.com" } } } });
  const assinatura = createHmac("sha256", SEGREDO).update(corpo).digest("base64");
  const r = await postar(pp, "/yampi/tok", corpo, { "x-yampi-hmac-sha256": assinatura });
  assert.equal(r.status, 200);
  const arquivos = readdirSync(join(bruto, "eventos"));
  assert.deepEqual(arquivos, ["001-yampi-order.created.json"]);
  const salvo = JSON.parse(readFileSync(join(bruto, "eventos", arquivos[0]), "utf8"));
  assert.equal(salvo.assinatura, "ok");
  assert.equal(salvo.body.event, "order.created");
});

test("aviso da Yampi SEM marcador (cliente de verdade) nunca vai para o disco", async (t) => {
  const { bruto, pp } = await subir(t);
  const corpo = JSON.stringify({ event: "cart.reminder", resource: { customer: { data: { name: "Fulana Cliente", email: "fulana@cliente.com" } } } });
  const r = await postar(pp, "/yampi/tok", corpo);
  assert.equal(r.status, 200); // a Yampi não pode contar falha
  assert.deepEqual(readdirSync(join(bruto, "eventos")), []);
  const log = readFileSync(join(bruto, "ignorados.log"), "utf8");
  assert.match(log, /cart\.reminder/);
  assert.ok(!/fulana/i.test(log), "o log de ignorados não pode guardar dado do corpo");
});

test("rota /rejeita responde 401 e registra a chamada sem guardar o corpo (prova S11 do plano 6)", async (t) => {
  const { bruto, pp } = await subir(t);
  const r = await postar(pp, "/rejeita/tok", JSON.stringify({ event: "order.paid", detalhe: "nao-guardar" }));
  assert.equal(r.status, 401);
  const log = readFileSync(join(bruto, "ignorados.log"), "utf8");
  assert.match(log, /rejeita/);
  assert.ok(!/nao-guardar/.test(log));
  assert.deepEqual(readdirSync(join(bruto, "eventos")), []);
});

test("aviso da Evolution é sempre gravado; caminho errado dá 404; imagem exige a assinatura", async (t) => {
  const { bruto, pp } = await subir(t);
  const evo = JSON.stringify({ event: "messages.upsert", data: { key: { remoteJid: "5511999990002@s.whatsapp.net" } } });
  assert.equal((await postar(pp, "/evo/tok", evo)).status, 200);
  assert.deepEqual(readdirSync(join(bruto, "eventos")), ["001-evo-messages.upsert.json"]);
  assert.equal((await postar(pp, "/evo/errado", evo)).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${pp}/img/tok/teste.jpg`)).status, 404);
  const img = await fetch(`http://127.0.0.1:${pp}/img/tok/teste.jpg?assinatura=img`);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get("content-type"), "image/jpeg");
  assert.ok(existsSync(join(bruto, "teste.jpg")));
});
```

- [ ] **Step 3: Rodar e ver falhar**

```powershell
Set-Location $wt
node --test 'infra/scripts/fase0-recuperar/*.test.mjs'
```

Esperado: falha com `ERR_MODULE_NOT_FOUND` (`comum.mjs` e `captura.mjs` não existem).

- [ ] **Step 4: Criar `comum.mjs` e `captura.mjs`**

Três decisões que não saem do nome das funções:

- O servidor só grava aviso da Yampi se o corpo contém um marcador (e-mail ou telefone do teste). O resto é cliente de verdade: vira uma linha em `ignorados.log` com hora, nome do evento e tamanho, **sem corpo**, e a resposta é 200 igual, porque a Yampi conta cada falha para as 30 que desativam o aviso.
- O segredo do aviso entra por uma segunda porta (`FASE0_PORTA + 1`), só em `127.0.0.1`: o túnel só leva a porta pública.
- `chegada` é o relógio do servidor. O `date_time` da Evolution é hora de Brasília rotulada `Z` (medido em 01/10/2026), então não serve como hora do fato.

```javascript
// infra/scripts/fase0-recuperar/comum.mjs
// Peças comuns das ferramentas da Fase 0 do Recuperar (descartáveis; ver o plano da Fase 0).
// Regra de ouro: credencial só no ambiente; bruto só fora de qualquer repositório git.
import { createHmac, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const PREFIXO_INSTANCIA = "fase0-recuperar-";
export const NOME_DO_AVISO = "girumo-fase0-recuperar";
const SUBPASTAS = ["eventos", "api", "redigido"];

export function pedirEnv(nome, env = process.env) {
  const valor = env[nome]?.trim();
  if (!valor) throw new Error(`${nome} ausente no ambiente (rode credenciais.ps1 na janela do Igor).`);
  return valor;
}

/** Cria as subpastas e recusa uma pasta que esteja dentro de um repositório git. */
export function prepararBruto(pasta) {
  const bruto = resolve(pasta);
  for (let d = bruto; ; d = dirname(d)) {
    if (existsSync(join(d, ".git"))) throw new Error("FASE0_BRUTO está dentro de um repositório git. Use uma pasta fora do repo.");
    if (dirname(d) === d) break;
  }
  for (const sub of SUBPASTAS) mkdirSync(join(bruto, sub), { recursive: true });
  return bruto;
}
export const dirBruto = () => prepararBruto(pedirEnv("FASE0_BRUTO"));

export const lerJson = (arq, padrao = null) => (existsSync(arq) ? JSON.parse(readFileSync(arq, "utf8")) : padrao);
export const gravarJson = (arq, obj) => writeFileSync(arq, JSON.stringify(obj, null, 2));
export const lerEstado = (bruto = dirBruto()) => lerJson(join(bruto, "estado.json"), {});
export const mesclarEstado = (patch, bruto = dirBruto()) => gravarJson(join(bruto, "estado.json"), { ...lerEstado(bruto), ...patch });

export const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
export const urlDoTunel = (linha) => String(linha).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/)?.[0] ?? null;

/** Identifica o que é do teste: e-mail e telefone que o Igor usa nos checkouts de teste. */
export const marcadores = (env = process.env) => (env.FASE0_MARCADORES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export function temMarcador(texto, lista = marcadores()) {
  const baixo = String(texto).toLowerCase();
  const digitos = String(texto).replace(/\D/g, "");
  return lista.some((m) => baixo.includes(m.toLowerCase()) || (/^\d{6,}$/.test(m) && digitos.includes(m)));
}

/** FASE0_CELULARES="CHIP=55629...,B=55629...,C=55629..." (só dígitos, com 55). */
export function celulares(env = process.env) {
  const mapa = {};
  for (const par of (env.FASE0_CELULARES ?? "").split(",")) {
    const [rotulo, numero] = par.split("=").map((s) => s?.trim());
    if (rotulo && /^55\d{10,11}$/.test(numero ?? "")) mapa[rotulo.toUpperCase()] = numero;
  }
  return mapa;
}

/** Veredito da assinatura da Yampi: base64(HMAC-SHA256(corpo cru, segredo)). */
export function veredictoAssinatura(corpo, cabecalho, segredo) {
  if (!segredo) return "sem_segredo";
  if (!cabecalho) return "sem_cabecalho";
  const igual = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
  const mac = (dados, formato) => createHmac("sha256", segredo).update(dados).digest(formato);
  if (igual(mac(corpo, "base64"), cabecalho)) return "ok";
  if (igual(mac(corpo, "hex"), cabecalho)) return "so_hex";
  try {
    const reserializado = JSON.stringify(JSON.parse(corpo.toString("utf8")));
    if (igual(mac(reserializado, "base64"), cabecalho)) return "so_json_reserializado";
  } catch {
    // corpo que não é JSON: sem variante a tentar
  }
  return "invalido";
}

/** Trava: a chave global da Evolution só mexe em instância de teste desta fase. */
export function assertNomeDeTeste(nome) {
  if (typeof nome !== "string" || !nome.startsWith(PREFIXO_INSTANCIA) || nome.length < PREFIXO_INSTANCIA.length + 4) {
    throw new Error(`Recusado: "${nome}" não é instância de teste (prefixo ${PREFIXO_INSTANCIA}).`);
  }
  return nome;
}
export function nomeDaInstancia(env = process.env) {
  const hoje = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return assertNomeDeTeste(env.FASE0_INSTANCIA?.trim() || `${PREFIXO_INSTANCIA}${hoje}`);
}

/** Trava: só apaga o aviso que esta fase criou (a loja pode ter avisos de outras integrações). */
export function assertAvisoNosso(aviso, idEsperado) {
  if (!aviso || aviso.name !== NOME_DO_AVISO || String(aviso.id) !== String(idEsperado)) {
    throw new Error("Recusado: esse aviso não é o que a Fase 0 criou.");
  }
}

export function caminhoNoObjeto(obj, caminho) {
  return caminho
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function lerEvento(bruto, seq) {
  const prefixo = `${String(seq).padStart(3, "0")}-`;
  const nome = readdirSync(join(bruto, "eventos")).find((n) => n.startsWith(prefixo));
  if (!nome) throw new Error(`Evento ${seq} não encontrado em eventos/.`);
  return lerJson(join(bruto, "eventos", nome));
}

export function eventosDaRota(bruto, rota) {
  return readdirSync(join(bruto, "eventos"))
    .filter((n) => n.includes(`-${rota}-`))
    .sort()
    .map((n) => lerJson(join(bruto, "eventos", n)));
}
```

```javascript
// infra/scripts/fase0-recuperar/captura.mjs
// Servidor local que recebe os avisos da Yampi e da Evolution, atrás de um túnel temporário do cloudflared.
//   node infra/scripts/fase0-recuperar/captura.mjs              sobe servidor + túnel
//   node infra/scripts/fase0-recuperar/captura.mjs --sem-tunel  só local (teste)
//   node infra/scripts/fase0-recuperar/captura.mjs --todos      grava avisos da Yampi sem marcador (só com ordem do Igor)
// Aviso da Yampi sem marcador (e-mail ou telefone do teste) é de cliente de verdade: nunca vai para o disco.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { appendFileSync, createReadStream, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { dirBruto, gravarJson, marcadores, temMarcador, urlDoTunel, veredictoAssinatura } from "./comum.mjs";

const LIMITE_CORPO = 2 * 1024 * 1024;
const CABECALHOS_GUARDADOS = ["content-type", "user-agent", "x-yampi-hmac-sha256"];

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    const partes = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > LIMITE_CORPO) {
        falha(new Error("corpo grande demais"));
        req.destroy();
      } else partes.push(c);
    });
    req.on("end", () => ok(Buffer.concat(partes)));
    req.on("error", falha);
  });
}

/** Monta os dois servidores (sem ouvir porta): o público, atrás do túnel, e o de controle, só em 127.0.0.1. */
export function criarCaptura({ bruto, tokens, todos = false, marcas = [], imagem = join(bruto, "teste.jpg") }) {
  let segredo = null;
  let seq = readdirSync(join(bruto, "eventos")).length;
  let ignorados = 0;

  const publico = createServer(async (req, res) => {
    const url = new URL(req.url, "http://local");
    const [, rota, tok, arquivo] = url.pathname.split("/");
    if (tok !== tokens.caminho || !["yampi", "evo", "img", "rejeita"].includes(rota)) return void res.writeHead(404).end();

    if (rota === "rejeita") {
      // endereço que sempre recusa (401), como o de produção faz com aviso sem assinatura: prova se a Yampi aceita criar o aviso assim
      const corpo = await lerCorpo(req).catch(() => Buffer.alloc(0));
      appendFileSync(join(bruto, "ignorados.log"), `${new Date().toISOString()}\trejeita\t${corpo.length}\t-\n`);
      console.log("rota /rejeita chamada (a Yampi bateu aqui); respondi 401");
      return void res.writeHead(401, { "content-type": "application/json" }).end('{"error":"unauthorized"}');
    }

    if (rota === "img") {
      // imita URL assinada: sem o parâmetro certo não serve
      if (arquivo !== "teste.jpg" || url.searchParams.get("assinatura") !== tokens.imagem || !existsSync(imagem)) return void res.writeHead(404).end();
      console.log("imagem servida (GET /img): quem baixou foi a Evolution, pela URL com assinatura");
      res.writeHead(200, { "content-type": "image/jpeg" });
      return void createReadStream(imagem).pipe(res);
    }
    if (req.method !== "POST") return void res.writeHead(405).end();

    const corpo = await lerCorpo(req).catch(() => null);
    if (!corpo) return void res.writeHead(413).end();
    const texto = corpo.toString("utf8");
    let json = null;
    try {
      json = JSON.parse(texto);
    } catch {
      // corpo que não é JSON fica só no bodyRaw
    }
    const evento = typeof json?.event === "string" ? json.event : "desconhecido";
    const assinatura = rota === "yampi" ? veredictoAssinatura(corpo, req.headers["x-yampi-hmac-sha256"], segredo) : "n/a";
    const chegada = new Date().toISOString(); // a hora do fato; o date_time da Evolution é hora de Brasília rotulada Z

    if (rota === "yampi" && !todos && !temMarcador(texto, marcas)) {
      ignorados++;
      appendFileSync(join(bruto, "ignorados.log"), `${chegada}\t${evento}\t${corpo.length}\t${assinatura}\n`);
    } else {
      seq++;
      const nome = `${String(seq).padStart(3, "0")}-${rota}-${evento.replace(/[^a-z0-9._-]/gi, "_")}.json`;
      const cabecalhos = Object.fromEntries(CABECALHOS_GUARDADOS.filter((h) => req.headers[h]).map((h) => [h, req.headers[h]]));
      gravarJson(join(bruto, "eventos", nome), { seq, rota, chegada, assinatura, cabecalhos, bodyRaw: texto, body: json });
      console.log(`#${String(seq).padStart(3, "0")} ${rota} ${evento} assinatura=${assinatura} ${corpo.length} B`);
    }
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}'); // sempre 2xx: a Yampi conta falha
  });

  const controle = createServer(async (req, res) => {
    if (req.method === "POST" && req.url === "/segredo") {
      const dados = JSON.parse((await lerCorpo(req)).toString("utf8"));
      segredo = String(dados.segredo);
      return void res.writeHead(204).end();
    }
    if (req.method === "GET" && req.url === "/estado") {
      return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ salvos: seq, ignorados, temSegredo: Boolean(segredo) }));
    }
    res.writeHead(404).end();
  });

  return { publico, controle };
}

async function main() {
  const todos = process.argv.includes("--todos");
  const semTunel = process.argv.includes("--sem-tunel");
  const marcas = marcadores();
  if (!todos && marcas.length === 0) {
    console.error("FASE0_MARCADORES vazio: sem marcador o servidor não grava aviso da Yampi. Rode credenciais.ps1 ou use --todos.");
    process.exit(2);
  }
  const bruto = dirBruto();
  const porta = Number(process.env.FASE0_PORTA ?? 8787);
  const tokens = { caminho: randomBytes(12).toString("hex"), imagem: randomBytes(24).toString("hex") };
  const imagem = process.env.FASE0_IMAGEM || join(bruto, "teste.jpg");
  const { publico, controle } = criarCaptura({ bruto, tokens, todos, marcas, imagem });
  await new Promise((ok) => publico.listen(porta, "127.0.0.1", ok));
  await new Promise((ok) => controle.listen(porta + 1, "127.0.0.1", ok)); // não passa pelo túnel

  const anunciar = (base) => {
    gravarJson(join(bruto, "urls.json"), {
      publica: base,
      yampi: `${base}/yampi/${tokens.caminho}`,
      evolution: `${base}/evo/${tokens.caminho}`,
      rejeita: `${base}/rejeita/${tokens.caminho}`,
      imagem: `${base}/img/${tokens.caminho}/teste.jpg?assinatura=${tokens.imagem}`,
    });
    console.log(`Captura no ar em ${base} (URLs completas só em urls.json). Marcadores: ${marcas.length}. Modo: ${todos ? "TODOS" : "só marcadores"}.`);
  };
  if (semTunel) return anunciar(`http://127.0.0.1:${porta}`);

  const tunel = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${porta}`], { stdio: ["ignore", "ignore", "pipe"] });
  let anunciado = false;
  tunel.stderr.on("data", (dados) => {
    const url = !anunciado && urlDoTunel(dados);
    if (url) {
      anunciado = true;
      anunciar(url);
    }
  });
  tunel.on("error", () => {
    console.error("cloudflared não encontrado. Instale: winget install --id Cloudflare.cloudflared -e (e abra um terminal novo).");
    process.exit(1);
  });
  tunel.on("exit", (codigo) => {
    console.error(`cloudflared saiu (${codigo}). Encerrando: o endereço público morreu.`);
    process.exit(1);
  });
  process.on("SIGINT", () => {
    tunel.kill();
    process.exit(0);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
```

- [ ] **Step 5: Rodar e ver passar**

```powershell
node --test 'infra/scripts/fase0-recuperar/*.test.mjs'
```

Esperado: `ℹ tests 11`, `ℹ pass 11`, `ℹ fail 0`.

- [ ] **Step 6: Commit**

```powershell
git -C $wt add infra/scripts/fase0-recuperar
git -C $wt diff --cached --stat
git -C $wt commit -m "chore(recuperar): phase 0 capture server and shared helpers" -m "Co-Authored-By: <assistente em uso, como o lembrete de atribuição da sessão indicar> <noreply@anthropic.com>"
```

Esperado no `--stat`: só os 4 arquivos de `infra/scripts/fase0-recuperar/`.

- [ ] **Step 7: Mutantes — provar que as duas travas mais perigosas têm teste que morde**

Mutante A (tira a checagem do prefixo da instância) e mutante B (grava aviso da Yampi sem marcador):

```powershell
Set-Location $wt
$f = "$wt\infra\scripts\fase0-recuperar\comum.mjs"
$novo = (Get-Content $f -Raw -Encoding UTF8) -replace '!nome\.startsWith\(PREFIXO_INSTANCIA\) \|\| ', ''
[System.IO.File]::WriteAllText($f, $novo, (New-Object System.Text.UTF8Encoding $false))
node --test 'infra/scripts/fase0-recuperar/comum.test.mjs'
git -C $wt checkout -- infra/scripts/fase0-recuperar/comum.mjs

$f = "$wt\infra\scripts\fase0-recuperar\captura.mjs"
$novo = (Get-Content $f -Raw -Encoding UTF8) -replace '!todos && !temMarcador\(texto, marcas\)', 'false'
[System.IO.File]::WriteAllText($f, $novo, (New-Object System.Text.UTF8Encoding $false))
node --test 'infra/scripts/fase0-recuperar/captura.test.mjs'
git -C $wt checkout -- infra/scripts/fase0-recuperar/captura.mjs
git -C $wt status --short
```

Esperado: o primeiro `node --test` termina com `✖ trava: a chave global só mexe em instância de teste` e `ℹ fail 1`; o segundo, com `✖ aviso da Yampi SEM marcador (cliente de verdade) nunca vai para o disco` e `ℹ fail 1`; o `status --short` final, vazio (os dois arquivos voltaram). Se algum mutante passar verde, o teste não protege a trava: corrigir o teste antes de seguir.

---

### Task 2: Redator e conferência de vazamento

**Files:**
- Create: `infra/scripts/fase0-recuperar/redigir.mjs`
- Test: `infra/scripts/fase0-recuperar/redigir.test.mjs`

**Interfaces:**
- Consumes: de `comum.mjs`, `celulares`, `dirBruto`, `gravarJson`, `lerJson`, `marcadores`.
- Produces:
  - `variantesDeTelefone(real13, falso13) → [original, falso][]`
  - `conhecidosDoAmbiente(env?, urls?, instancia?) → [original, falso][]` (do mais longo ao mais curto)
  - `criarRedator({ sal, conhecidos, frases }) → { valor(x), data(iso), originais() }`
  - `problemas(conteudo, { conhecidos, originais }) → string[]` (descrições sem o valor)
  - CLI: `tudo` (lê `eventos/` e `api/`, grava `redigido/<mesmo nome>` com só o `body` do aviso, `redigido/api-<nome>`, `redigido/_indice.txt`, `mapa.json` e `sal.txt` no bruto), `achar <regex>` (imprime `arquivo  caminho = valor` do que está em `redigido/`), `conferir <arquivo|pasta>...` (sai com 1 se achar dado real).

- [ ] **Step 1: Escrever os testes (vermelhos)**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { conhecidosDoAmbiente, criarRedator, problemas, variantesDeTelefone } from "./redigir.mjs";

const ENV = {
  YAMPI_ALIAS: "lojinha-real",
  FASE0_CELULARES: "CHIP=5521911112222,B=5521987654321",
  FASE0_MARCADORES: "dono@real.com,987654321",
  FASE0_LOJA_TERMOS: "Lojinha Real",
  FASE0_INSTANCIA: "fase0-recuperar-20261029",
};
const URLS = { publica: "https://abc-def-123.trycloudflare.com", yampi: "https://abc-def-123.trycloudflare.com/yampi/0123456789abcdef01234567" };
const EMV = "00020126580014br.gov.bcb.pix0136123e4567-e89b-12d3-a456-4266141740005204000053039865802BR5913LOJINHA REAL6009SAO PAULO62070503***6304ABCD";

const ORDEM = {
  event: "order.created",
  time: "2026-10-29 23:50:00",
  merchant: { id: 4455, alias: "lojinha-real" },
  resource: {
    id: 987654,
    number: 1234,
    created_at: { date: "2026-10-29 23:50:00.000000", timezone_type: 3, timezone: "America/Sao_Paulo" },
    customer: {
      data: {
        name: "Maria da Silva",
        email: "DONO@real.com",
        cpf: "123.456.789-09",
        outro_cpf: "987.654.321-00",
        phone: { area_code: "21", number: "987654321", full_number: "21987654321", formated_number: "(21) 98765-4321" },
        apelido: "joaozinho",
      },
    },
    status: { data: { alias: "waiting_payment", name: "Aguardando pagamento" } },
    transactions: {
      data: [
        {
          payment: { data: { alias: "pix" } },
          metadata: [
            { key: "pix_qr_code", value: EMV },
            { key: "pix_expiration_date", value: "2026-10-30 00:20:00" },
          ],
        },
      ],
    },
    cpf_do_cliente: "12345678909",
    token: "AbCdEf1234567890XyZ",
    cart_token: "AbCdEf1234567890XyZ",
    unauth_simulate_url: "https://lojinha-real.yampi.io/cart/AbCdEf1234567890XyZ?customerToken=abcDEF123456&utm_source=x",
    site: "https://www.lojinhareal.com.br/r/xyz123",
    foto: "A".repeat(400),
  },
};

const redator = () => criarRedator({ sal: "sal-de-teste", conhecidos: conhecidosDoAmbiente(ENV, URLS), frases: ["SAIR"] });

test("nenhum valor real sobrevive, em nenhum formato", () => {
  const red = redator();
  const saida = JSON.stringify(red.valor(ORDEM));
  for (const real of ["lojinha-real", "lojinhareal", "Maria", "Silva", "dono@real.com", "987654321", "98765-4321", "123.456.789-09", "joaozinho", "AbCdEf1234567890XyZ", "abcDEF123456"]) {
    assert.ok(!saida.toLowerCase().includes(real.toLowerCase()), `vazou: ${real}`);
  }
  assert.deepEqual(problemas(saida, { conhecidos: conhecidosDoAmbiente(ENV, URLS), originais: red.originais() }), []);
});

test("telefone: cada forma de escrever vira o falso correspondente; DDI e 9º dígito se mantêm", () => {
  const fone = redator().valor(ORDEM).resource.customer.data.phone;
  assert.equal(fone.area_code, "11");
  assert.equal(fone.number, "999990002");
  assert.equal(fone.full_number, "11999990002");
  assert.equal(fone.formated_number.replace(/\D/g, "").length, 11); // sem lista de formatos: máscara cega mantém o formato
  assert.deepEqual(variantesDeTelefone("5521987654321", "5511999990002").slice(0, 3), [
    ["5521987654321", "5511999990002"],
    ["21987654321", "11999990002"],
    ["987654321", "999990002"],
  ]);
});

test("vocabulário fica legível; texto desconhecido é mascarado (default-deny)", () => {
  const r = redator().valor(ORDEM).resource;
  assert.equal(r.status.data.alias, "waiting_payment");
  assert.equal(r.transactions.data[0].payment.data.alias, "pix");
  assert.equal(r.transactions.data[0].metadata[0].key, "pix_qr_code");
  assert.notEqual(r.customer.data.apelido, "joaozinho");
  assert.equal(r.customer.data.apelido.length, "joaozinho".length);
  assert.equal(redator().valor({ conversation: "SAIR" }).conversation, "SAIR");
  assert.notEqual(redator().valor({ conversation: "quem é você?" }).conversation, "quem é você?");
});

test("Pix: o início do formato EMV e o tamanho ficam; o resto não", () => {
  const codigo = redator().valor(ORDEM).resource.transactions.data[0].metadata[0].value;
  assert.ok(codigo.startsWith("000201"));
  assert.equal(codigo.length, EMV.length);
  assert.ok(!codigo.includes("br.gov.bcb.pix"));
});

test("datas: tudo desloca junto, então os intervalos continuam valendo (inclusive virando o dia)", () => {
  const r = redator().valor(ORDEM).resource;
  const [criado, vence] = [r.created_at.date, r.transactions.data[0].metadata[1].value].map((s) => Date.parse(`${s.replace(" ", "T").slice(0, 19)}Z`));
  assert.equal(vence - criado, 30 * 60_000);
  assert.notEqual(r.created_at.date.slice(0, 10), "2026-10-29");
  assert.equal(r.created_at.timezone, "America/Sao_Paulo");
});

test("igualdade se preserva: mesmo original, mesmo falso; originais diferentes, falsos diferentes", () => {
  const r = redator().valor(ORDEM).resource;
  assert.equal(r.token, r.cart_token);
  assert.notEqual(r.customer.data.cpf, r.customer.data.outro_cpf);
  assert.match(r.customer.data.cpf, /^\d{3}\.\d{3}\.\d{3}-\d{2}$/);
  assert.notEqual(r.token, "AbCdEf1234567890XyZ");
});

test("URL: a rota e as chaves da consulta ficam; loja, token e domínio próprio saem", () => {
  const r = redator().valor(ORDEM).resource;
  assert.match(r.unauth_simulate_url, /^https:\/\/loja-exemplo\.yampi\.io\/cart\/[A-Za-z0-9]+\?customerToken=[A-Za-z0-9]+&utm_source=\w$/);
  assert.match(r.site, /^https:\/\/loja-exemplo\.example\/r\/[a-z0-9]+$/);
});

test("JID mantém o domínio; telefone conhecido vira o falso; segredos e blobs somem", () => {
  const red = redator();
  assert.match(red.valor({ k: "12345678901234@lid" }).k, /^\d{14}@lid$/);
  assert.equal(red.valor({ k: "5521987654321@s.whatsapp.net" }).k, "5511999990002@s.whatsapp.net");
  assert.equal(red.valor({ sender: "5521911112222:12@s.whatsapp.net" }).sender, "5511999990001:12@s.whatsapp.net");
  assert.equal(red.valor({ apikey: "abc123def456" }).apikey, "REDACTED-INSTANCE-TOKEN");
  assert.equal(red.valor({ secret_key: "abc123def456abc123def456" }).secret_key, "REDACTED");
  assert.equal(red.valor(ORDEM).resource.foto, "[REDIGIDO len=400]");
});

test("buffer serializado (miniatura da foto) não passa, nem como array nem como objeto de bytes", () => {
  const bytes = Array.from({ length: 40 }, (_, i) => (i * 7) % 256);
  const objeto = Object.fromEntries(bytes.map((b, i) => [String(i), b]));
  const r = redator().valor({ jpegThumbnail: objeto, mediaKey: { type: "Buffer", data: bytes }, pequeno: [1, 2, 3] });
  assert.equal(r.jpegThumbnail, "[REDIGIDO bytes len=40]");
  assert.equal(r.mediaKey.data, "[REDIGIDO bytes len=40]");
  assert.deepEqual(r.pequeno, [1, 2, 3]); // array curto de números (não é blob) segue
});

test("cabeçalho da assinatura: continua base64 de 44 caracteres e deixa de ser o real", () => {
  const real = "k3Jx9mQ2vT8nLp0aZcYd4HfRgU6sWbEoIt1NqXvMeA8=";
  const h = redator().valor({ "x-yampi-hmac-sha256": real, "content-type": "application/json" });
  assert.match(h["x-yampi-hmac-sha256"], /^[A-Za-z0-9+/]{43}=$/);
  assert.notEqual(h["x-yampi-hmac-sha256"], real);
  assert.equal(h["content-type"], "application/json");
});

test("números: epoch desloca junto, dinheiro passa, documento numérico é mascarado", () => {
  const r = redator().valor({ a: 1761746591, b: 1761746651, total: 12.5, quantity: 2, cpf: 12345678909, id: 987654 });
  assert.equal(r.b - r.a, 60);
  assert.notEqual(r.a, 1761746591);
  assert.equal(r.total, 12.5);
  assert.equal(r.quantity, 2);
  assert.notEqual(r.cpf, 12345678909);
  assert.equal(r.id, 987654);
});

test("conferência: pega vazamento que a máscara deixaria passar", () => {
  const conhecidos = conhecidosDoAmbiente(ENV, URLS);
  assert.ok(problemas('{"loja":"https://Lojinha-Real.yampi.io/x"}', { conhecidos }).length > 0);
  assert.ok(problemas('{"telefone":"5521987654321"}', { conhecidos }).length > 0);
  assert.ok(problemas('{"email":"alguem@gmail.com"}', { conhecidos }).length > 0);
  assert.ok(problemas('{"d":"https://abc-def-123.trycloudflare.com/x"}', { conhecidos }).length > 0);
  assert.ok(problemas('{"v":"Maria da Silva"}', { originais: ["Maria da Silva"] }).length > 0);
  assert.deepEqual(problemas('{"email":"cliente.teste@example.com","jid":"5511999990002@s.whatsapp.net","x":"1@lid"}', { conhecidos }), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
node --test 'infra/scripts/fase0-recuperar/redigir.test.mjs'
```

Esperado: `ERR_MODULE_NOT_FOUND` (`redigir.mjs` não existe).

- [ ] **Step 3: Criar `redigir.mjs`**

Regras que o teste fixa e a implementação segue:

1. **Default-deny:** toda folha de texto é mascarada, salvo vocabulário (nome de evento, alias de status, tipos de mensagem, valores de chaves como `type` e `status`) e as frases de teste exatas de `FASE0_FRASES`. Chave de pessoa (`name`, `pushName`, `street`, `text`, `conversation`, `caption`…) nunca é vocabulário.
2. **Máscara que preserva o formato:** dígito vira dígito, letra vira letra (mesma caixa), pontuação e espaço ficam. É determinística por original, com um sal que só existe em `sal.txt` dentro do bruto: a igualdade se preserva (o `token` do carrinho continua igual ao do pedido) e quem tem o repo não reverte.
3. **Valores conhecidos primeiro:** alias, tokens, termos da loja, e-mail do teste, telefones em todas as formas (com e sem 55, com e sem o 9º dígito, só o número) e o endereço do túnel viram falsos fixos em qualquer lugar do texto. Telefones falsos seguem a convenção das fixtures que já existem: chip `5511999990001`, B `5511999990002`, C `5511999990003`.
4. **Datas:** todas deslocadas pelo mesmo número de dias (intervalos e virada de dia valem); hora e fuso ficam. Epoch em segundos desloca igual.
5. **Pix copia e cola:** só o início (`000201`) e o tamanho ficam.
6. **URL:** host desconhecido vira `loja-exemplo.example`; rotas conhecidas e chaves da consulta ficam; o resto é mascarado.
7. **Blobs:** buffer serializado (array ou objeto com mais de 32 posições de bytes) e string com mais de 300 caracteres viram `[REDIGIDO …]` (a miniatura de uma foto do celular de teste não pode passar como número solto).
8. **`conferir`** procura: valor conhecido, qualquer original mascarado (≥ 6 caracteres), e-mail ou JID fora de `example.com`/`s.whatsapp.net`, JWT, endereço do túnel e chave com cara de segredo. Não imprime o que achou (só 2 letras e o tamanho).

```javascript
// infra/scripts/fase0-recuperar/redigir.mjs
// Transforma o bruto em material que a sessão pode ler e que, depois de conferido, pode ir para o repo público.
//   node infra/scripts/fase0-recuperar/redigir.mjs tudo                        eventos/ e api/ -> redigido/ (+ _indice.txt, mapa.json)
//   node infra/scripts/fase0-recuperar/redigir.mjs achar <regex>               procura "caminho = valor" em redigido/
//   node infra/scripts/fase0-recuperar/redigir.mjs conferir <arquivo|pasta>... sai com 1 se sobrar dado real
// Regra: toda folha de texto é MASCARADA, salvo vocabulário conhecido. A máscara mantém o formato (dígito vira dígito, letra
// vira letra, pontuação fica) e dá o mesmo resultado para o mesmo original, então igualdade e comprimento se preservam.
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { celulares, dirBruto, gravarJson, lerJson, marcadores } from "./comum.mjs";

const FALSO_DA_LOJA = "loja-exemplo";
const FALSOS_TELEFONE = { CHIP: "5511999990001", B: "5511999990002", C: "5511999990003" };
const PALAVRAS = new Set(["pix", "billet", "boleto", "paid", "authorized", "created", "refused", "cancelled", "canceled", "approved", "pending", "failed", "true", "false", "null", "brl", "store", "delivered", "invoiced", "image", "video", "audio", "document", "conversation", "notify", "append", "android", "ios", "web", "unknown", "open", "close", "connecting", "read", "played", "error"]);
const CHAVES_DE_VOCABULARIO = /^(event|timezone|currency|type|kind|status|alias|payment_alias|last_transaction_status|messageType|mediaType|mimetype|source|state|reason|action|integration)$/i;
const CHAVES_DE_PESSOA = /(^|_)(name|nome|pushname|street|address|neighborhood|city|complement|text|conversation|caption|title|description|notes?)$/i;
const CHAVES_SECRETAS = /^(apikey|api_key|secret|secret_key|webhook_secret|password|senha|authorization|access_token|refresh_token|customertoken)$/i;
const CHAVES_NUMERICAS_DE_PESSOA = /^(cpf|cnpj|zipcode|zip|cep|phone|telefone|celular|area_code|ddd)$/i;
const HOST_SEGURO = /(^|\.)(example\.com|example|yampi\.io|yampi\.com\.br|dooki\.com\.br|whatsapp\.net|whatsapp\.com|girumo\.com\.br)$/i;
const ROTAS = /^(r|c|p|api|v\d|cart|carrinho|checkout|pedido|pedidos|order|orders|recover|recuperar|simulate|unauth|pay|pix|track|rastreio|purchase)$/i;
const RE_JID = /^([\d-]+)(:\d+)?@(lid|hosted\.lid|s\.whatsapp\.net|c\.us|g\.us|broadcast)$/;
const RE_DATA = /^(\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?|\d{2}\/\d{2}\/\d{4}( \d{2}:\d{2}(:\d{2})?)?)$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PECA_INI = "";
const PECA_FIM = "";
const MS_DIA = 86_400_000;

/** Pares [original, falso] para cada forma de escrever um telefone (com/sem 55, com/sem o 9º dígito, só o número). */
export function variantesDeTelefone(real, falso) {
  const formas = (n) => ({
    com9: n.length === 13 ? n : `${n.slice(0, 4)}9${n.slice(4)}`,
    sem9: n.length === 12 ? n : n.slice(0, 4) + n.slice(5),
  });
  const [r, f] = [formas(real), formas(falso)];
  return ["com9", "sem9"].flatMap((k) => [
    [r[k], f[k]],
    [r[k].slice(2), f[k].slice(2)],
    [r[k].slice(4), f[k].slice(4)],
  ]);
}

/** Tudo que é real e sabemos de antemão: vira um falso fixo em qualquer lugar do texto. Os mais longos vêm primeiro. */
export function conhecidosDoAmbiente(env = process.env, urls = {}, instancia = env.FASE0_INSTANCIA) {
  const lista = [];
  const add = (original, falso) => original && String(original).length >= 3 && lista.push([String(original), falso]);
  add(env.YAMPI_ALIAS, FALSO_DA_LOJA);
  for (const nome of ["YAMPI_USER_TOKEN", "YAMPI_USER_SECRET_KEY", "EVOLUTION_API_KEY"]) add(env[nome], "REDACTED-SEGREDO");
  for (const termo of (env.FASE0_LOJA_TERMOS ?? "").split(",")) add(termo.trim(), "Loja Exemplo");
  for (const m of marcadores(env)) if (m.includes("@")) add(m, "cliente.teste@example.com");
  for (const [rotulo, numero] of Object.entries(celulares(env))) {
    for (const [original, falso] of variantesDeTelefone(numero, FALSOS_TELEFONE[rotulo] ?? "5511999990009")) add(original, falso);
  }
  if (urls.publica) add(new URL(urls.publica).host, "tunel.example");
  for (const url of [urls.yampi, urls.evolution, urls.imagem]) {
    for (const trecho of String(url ?? "").split(/[/?=]/).filter((t) => t.length >= 16)) add(trecho, "TOKEN");
  }
  add(instancia, "gr_smoke-test");
  return lista.sort((a, b) => b[0].length - a[0].length);
}

const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function deslocarDatas(texto, dias) {
  const mover = (a, m, d) => new Date(Date.UTC(+a, +m - 1, +d) - dias * MS_DIA);
  return texto
    .replace(/(\d{4})-(\d{2})-(\d{2})/, (_, a, m, d) => mover(a, m, d).toISOString().slice(0, 10))
    .replace(/(\d{2})\/(\d{2})\/(\d{4})/, (_, d, m, a) => {
      const x = mover(a, m, d);
      return `${String(x.getUTCDate()).padStart(2, "0")}/${String(x.getUTCMonth() + 1).padStart(2, "0")}/${x.getUTCFullYear()}`;
    });
}

export function criarRedator({ sal, conhecidos = [], frases = [] }) {
  const originais = new Set();
  const dias = 30 + (parseInt(createHmac("sha256", sal).update("dias").digest("hex").slice(0, 6), 16) % 300);

  const bytes = (texto, n) => {
    const blocos = [];
    for (let i = 0; blocos.length * 32 < n; i++) blocos.push(createHmac("sha256", sal).update(`${i}:${texto}`).digest());
    return Buffer.concat(blocos);
  };
  const fpm = (texto) => {
    const b = bytes(texto, texto.length);
    let i = 0;
    return texto.replace(/[\p{L}\p{Nd}]/gu, (c) => {
      const r = b[i++];
      return /\p{Nd}/u.test(c) ? String(r % 10) : String.fromCharCode((/\p{Lu}/u.test(c) ? 65 : 97) + (r % 26));
    });
  };

  // conhecidos viram "peças" opacas, que nem a máscara nem as regras de formato tocam; voltam como o falso no fim
  const guardar = (texto) => {
    const pecas = [];
    let saida = texto;
    for (const [de, para] of conhecidos) {
      saida = saida.replace(new RegExp(escapar(de), "gi"), () => {
        pecas.push(para);
        return PECA_INI + String.fromCharCode(0xe100 + pecas.length - 1) + PECA_FIM;
      });
    }
    return { saida, pecas };
  };
  const devolver = (texto, pecas) => texto.replace(/(.)/g, (_, c) => pecas[c.charCodeAt(0) - 0xe100]);
  const mascararTexto = (texto) => {
    const { saida, pecas } = guardar(texto);
    return devolver(fpm(saida), pecas);
  };
  const temConhecido = (texto) => guardar(texto).pecas.length > 0;

  const mascararJid = (m) => {
    const [, usuario, aparelho = "", dominio] = m;
    const { saida, pecas } = guardar(usuario);
    const novo = pecas.length ? devolver(saida, pecas) : /^55\d{10,11}$/.test(usuario) ? `55${fpm(usuario.slice(2))}` : fpm(usuario);
    return `${novo}${aparelho}@${dominio}`;
  };

  const mascararUrl = (texto) => {
    let u;
    try {
      u = new URL(texto);
    } catch {
      return null;
    }
    const { saida, pecas } = guardar(u.hostname);
    const host = devolver(saida, pecas);
    const caminho = u.pathname.split("/").map((s) => (s === "" || ROTAS.test(s) ? s : mascararTexto(s))).join("/");
    const consulta = [...u.searchParams].map(([k, v]) => `${k}=${mascararTexto(v)}`).join("&");
    return `${u.protocol}//${HOST_SEGURO.test(host) ? host : `${FALSO_DA_LOJA}.example`}${caminho}${consulta ? `?${consulta}` : ""}`;
  };

  const ehVocabulario = (s) =>
    PALAVRAS.has(s.toLowerCase()) ||
    /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/.test(s) ||
    /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/.test(s) ||
    /^[a-z]+([A-Z][a-z]+)*Message$/.test(s) ||
    /^(image|audio|video|application|text)\/[\w.+-]+(;.*)?$/.test(s);

  const texto = (s, chave) => {
    if (/^apikey$/i.test(chave)) return "REDACTED-INSTANCE-TOKEN";
    if (CHAVES_SECRETAS.test(chave)) return "REDACTED";
    if (/^area_code$/i.test(chave)) return "11";
    if (s.length <= 2 || frases.includes(s.trim())) return s;
    const jid = RE_JID.exec(s);
    if (jid) return mascararJid(jid);
    if (/^000201/.test(s)) return s.slice(0, 6) + fpm(s.slice(6)); // Pix copia e cola: mantém só o início do formato EMV
    if (s.length > 300) return `[REDIGIDO len=${s.length}]`;
    if (/^https?:\/\//i.test(s)) return mascararUrl(s) ?? mascararTexto(s);
    if (RE_DATA.test(s)) return deslocarDatas(s, dias);
    if (RE_EMAIL.test(s) && !temConhecido(s)) {
      const arroba = s.lastIndexOf("@");
      return `${fpm(s.slice(0, arroba))}@example.com`;
    }
    const pessoa = CHAVES_DE_PESSOA.test(chave);
    const mantem = !temConhecido(s) && !pessoa && (CHAVES_DE_VOCABULARIO.test(chave) ? /^[A-Za-z][\w.:/-]{0,59}$/.test(s) : ehVocabulario(s));
    return mantem ? s : mascararTexto(s);
  };

  const numero = (n, chave) => {
    if (!Number.isInteger(n)) return n; // dinheiro e fracionários passam
    if (n >= 1.4e9 && n <= 2.2e9) return n - dias * 86_400; // epoch em segundos
    if (String(Math.abs(n)).length >= 10 || CHAVES_NUMERICAS_DE_PESSOA.test(chave)) return Number(fpm(String(Math.abs(n))).replace(/^0+/, "") || "1");
    return n;
  };

  // buffer serializado (miniatura da foto, chaves de mídia): array de bytes ou objeto {"0":255,"1":216,...}
  const tamanhoDeBytes = (x) => {
    const chaves = Array.isArray(x) ? x : x && typeof x === "object" ? Object.keys(x) : [];
    const eBytes = Array.isArray(x) ? x.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) : chaves.every((k) => /^\d+$/.test(k));
    return chaves.length > 32 && eBytes ? chaves.length : 0;
  };

  const valor = (x, chave = "") => {
    const bytesLen = tamanhoDeBytes(x);
    if (bytesLen) return `[REDIGIDO bytes len=${bytesLen}]`;
    if (Array.isArray(x)) return x.map((v) => valor(v, chave));
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, valor(v, k)]));
    if (typeof x === "number") return numero(x, chave);
    if (typeof x !== "string") return x;
    const saida = texto(x, chave);
    if (saida !== x && x.length >= 6) originais.add(x);
    return saida;
  };

  return { valor, data: (iso) => deslocarDatas(String(iso), dias), originais: () => [...originais] };
}

/** Procura dado real em um texto. Devolve descrições SEM o valor (só o começo e o tamanho). */
export function problemas(conteudo, { conhecidos = [], originais = [] } = {}) {
  const achados = [];
  const baixo = conteudo.toLowerCase();
  const dica = (v) => `${v.slice(0, 2)}…(${v.length} caracteres)`;
  for (const [de] of conhecidos) if (baixo.includes(de.toLowerCase())) achados.push(`valor conhecido presente: ${dica(de)}`);
  for (const o of originais) {
    if (o.length >= 6 && (conteudo.includes(o) || conteudo.includes(JSON.stringify(o).slice(1, -1)))) achados.push(`valor original presente: ${dica(o)}`);
  }
  for (const m of conteudo.matchAll(/[\w.+-]+@([\w-]+(?:\.[\w-]+)+)/g)) {
    if (!/^(example\.com|s\.whatsapp\.net|c\.us|g\.us)$/i.test(m[1])) achados.push(`e-mail ou JID fora do padrão: ${dica(m[0])}`);
  }
  if (/eyJ[\w-]{8,}\.[\w-]{8,}/.test(conteudo)) achados.push("token JWT");
  if (/trycloudflare\.com/.test(conteudo)) achados.push("endereço do túnel");
  if (new RegExp("(sk|rk)_(live|test)_|whsec_").test(conteudo)) achados.push("chave com cara de segredo");
  return achados;
}

function* folhas(x, caminho = "") {
  if (Array.isArray(x)) for (const [i, v] of x.entries()) yield* folhas(v, `${caminho}[${i}]`);
  else if (x && typeof x === "object") for (const [k, v] of Object.entries(x)) yield* folhas(v, caminho ? `${caminho}.${k}` : k);
  else yield [caminho, x];
}

function arquivosDe(caminhos) {
  return caminhos.flatMap((c) =>
    statSync(c).isDirectory() ? arquivosDe(readdirSync(c).map((n) => join(c, n))) : /\.(json|md|mjs)$/.test(c) ? [c] : [],
  );
}

function obterSal(bruto) {
  const arq = join(bruto, "sal.txt");
  if (!existsSync(arq)) writeFileSync(arq, randomBytes(16).toString("hex"));
  return readFileSync(arq, "utf8").trim();
}

function contexto(bruto) {
  const urls = lerJson(join(bruto, "urls.json"), {});
  return { urls, conhecidos: conhecidosDoAmbiente(process.env, urls) };
}

function tudo() {
  const bruto = dirBruto();
  const { conhecidos } = contexto(bruto);
  const frases = (process.env.FASE0_FRASES ?? "").split("|").map((s) => s.trim()).filter(Boolean);
  const red = criarRedator({ sal: obterSal(bruto), conhecidos, frases });
  const indice = [];
  let maiorCorpo = 0;
  for (const nome of readdirSync(join(bruto, "eventos")).sort()) {
    const ev = lerJson(join(bruto, "eventos", nome));
    gravarJson(join(bruto, "redigido", nome), red.valor(ev.body));
    // os cabeçalhos do aviso da Yampi (a assinatura tem o formato base64 de 44 caracteres; a máscara mantém o formato)
    if (ev.rota === "yampi") gravarJson(join(bruto, "redigido", nome.replace(/\.json$/, ".cabecalhos.json")), red.valor(ev.cabecalhos ?? {}));
    maiorCorpo = Math.max(maiorCorpo, ev.bodyRaw?.length ?? 0);
    indice.push([String(ev.seq).padStart(3, "0"), ev.rota, ev.body?.event ?? "?", red.data(ev.chegada), `assinatura=${ev.assinatura}`, `${ev.bodyRaw?.length ?? 0} B`].join("\t"));
  }
  for (const nome of readdirSync(join(bruto, "api")).sort()) gravarJson(join(bruto, "redigido", `api-${nome}`), red.valor(lerJson(join(bruto, "api", nome))));
  writeFileSync(join(bruto, "redigido", "_indice.txt"), `${indice.join("\n")}\n`);
  gravarJson(join(bruto, "mapa.json"), { originais: red.originais() });
  console.log(`redigidos: ${indice.length} avisos e ${readdirSync(join(bruto, "api")).length} respostas de API. Índice em redigido/_indice.txt. Maior corpo de aviso: ${maiorCorpo} B.`);
}

function achar(expressao) {
  const pasta = join(dirBruto(), "redigido");
  const re = new RegExp(expressao, "i");
  for (const nome of readdirSync(pasta).filter((n) => n.endsWith(".json"))) {
    for (const [caminho, valor] of folhas(lerJson(join(pasta, nome)))) {
      const linha = `${caminho} = ${valor}`;
      if (re.test(linha)) console.log(`${nome}  ${linha.slice(0, 160)}`);
    }
  }
}

function conferir(caminhos) {
  const bruto = dirBruto();
  const { conhecidos } = contexto(bruto);
  const originais = lerJson(join(bruto, "mapa.json"), { originais: [] }).originais;
  let ruins = 0;
  const arquivos = arquivosDe(caminhos);
  for (const arq of arquivos) {
    for (const achado of problemas(readFileSync(arq, "utf8"), { conhecidos, originais })) {
      ruins++;
      console.log(`VAZAMENTO ${arq}: ${achado}`);
    }
  }
  console.log(ruins ? `${ruins} problema(s) em ${arquivos.length} arquivo(s). NÃO commitar.` : `ok: ${arquivos.length} arquivo(s) sem dado real.`);
  process.exit(ruins ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [comando, ...args] = process.argv.slice(2);
  if (comando === "tudo") tudo();
  else if (comando === "achar" && args[0]) achar(args[0]);
  else if (comando === "conferir" && args.length) conferir(args);
  else console.error("uso: redigir.mjs tudo | achar <regex> | conferir <arquivo|pasta>...");
}
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
node --test 'infra/scripts/fase0-recuperar/*.test.mjs'
```

Esperado: `ℹ tests 23`, `ℹ pass 23`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```powershell
git -C $wt add infra/scripts/fase0-recuperar/redigir.mjs infra/scripts/fase0-recuperar/redigir.test.mjs
git -C $wt diff --cached --stat
git -C $wt commit -m "chore(recuperar): phase 0 redactor with leak check" -m "Co-Authored-By: <assistente em uso> <noreply@anthropic.com>"
```

---

### Task 3: CLIs da Yampi e da Evolution e o script de credenciais

**Files:**
- Create: `infra/scripts/fase0-recuperar/yampi.mjs`
- Create: `infra/scripts/fase0-recuperar/evolution.mjs`
- Create: `infra/scripts/fase0-recuperar/credenciais.ps1`

**Interfaces:**
- Consumes: de `comum.mjs`, quase tudo (`pedirEnv`, `dirBruto`, `lerEvento`, `eventosDaRota`, `temMarcador`, `celulares`, `nomeDaInstancia`, `assertAvisoNosso`, `NOME_DO_AVISO`, `lerEstado`, `mesclarEstado`, `gravarJson`, `lerJson`, `caminhoNoObjeto`, `dormir`).
- Produces: as duas CLIs (cada comando imprime só contagens, status e classificações, nunca dado pessoal ou segredo) e os arquivos `api/*.json` que o redator e as fixtures usam.
  - `yampi.mjs`: `ping` (`GET /checkout/statuses`: http, ms, aliases de status e cabeçalhos de limite; grava `api/limite-cabecalhos.json`); `credenciais-formato` (tamanho e classe de caracteres do token e da chave, nunca o valor; grava `api/credenciais-formato.json`); `erro-401` (chama com credencial inventada e grava `api/erro-401.json`); `prova-401` (S11 do plano 6: cria um aviso cuja URL é a rota `/rejeita` do servidor de captura, que responde 401, espera 5 s e apaga); `webhook-criar [eventos]` (`POST /webhooks {name, url, events}`; entrega o `secret_key` ao servidor de captura e **não** o grava nem imprime; grava `api/webhook-criado.json` sem a chave; se a entrega falhar, apaga o aviso que acabou de criar); `webhook-listar [sufixo]` (`GET /webhooks?include=events`; só o host da URL; marca `<- da Fase 0`; com sufixo, grava só o nosso em `api/webhooks-lista-<sufixo>.json`); `webhook-desativar` (tentativa de `PUT` com `active: false`, que a doc não lista no corpo); `webhook-apagar` (confere nome e id com `assertAvisoNosso` e só então `DELETE`); `pedido <seq>` (`GET /orders/{id}?include=customer,items,transactions,status,statuses,shipping_address` e `GET /orders/{id}/transactions`; só grava resposta com marcador); `pedidos-1` (`GET /orders?limit=1`, a leitura barata do teste de conexão do plano 6; só grava se o pedido mais novo for do teste); `pedidos-pix` (três variantes da listagem: filtros planos, `filters[...]` e sem filtro, até 12 páginas de 100; baixa tudo mas só **grava e comenta** o que é do teste); `carrinhos` (idem para `/checkout/carts`, últimos 3 dias e sem filtro, `include=customer,items,transactions,payment,search`; imprime `total_transactions`, `last_transaction_status` e se há `unauth_simulate_url`/`simulate_url` no carrinho de teste); `copiar-link <seq> <caminho>` (copia a URL do campo para a área de transferência sem imprimir).
  - `evolution.mjs`: `versao` (`GET /`), `criar` (`POST /instance/create` com `number` do chip, para sair o código de pareamento; imprime o código e os ajustes padrão em booleano; **não** imprime nem grava o token da instância), `conectar` (`GET /instance/connect/{inst}?number=`), `webhook` (`POST /webhook/set/{inst}` para o túnel, eventos `QRCODE_UPDATED`, `CONNECTION_UPDATE`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE`, `SEND_MESSAGE`), `estado` (conexão e `disconnectionReasonCode`), `config` (`GET /settings/find/{inst}`), `numeros <rótulo>...` (`POST /chat/whatsappNumbers/{inst}`; rótulos `B`, `C`, `B-SEM9`, `C-SEM9`, `invalido`), `texto <B|C> "<texto>" [--jid]` e `imagem <B|C> "<legenda>"` (recusam o rótulo `CHIP`, exigem 40 s desde o último envio e registram `{keyId, para, jid, em}` em `estado.json`; com `--jid`, o `number` do envio é o JID que o `whatsappNumbers` devolveu, a forma que o plano 3 pretende usar), `texto-invalido`, `midia <imagem|audio>` (`POST /chat/getBase64FromMediaMessage/{inst}` com `{message: {key: {id}}}`), `apagar` (logout + delete + confere com `fetchInstances?instanceName=`, nunca sem o nome).
  - `credenciais.ps1`: pede cada valor sem eco; `-SoCaptura` pede só os marcadores.
  - `FASE0_YAMPI_BASE` troca a base da API da Yampi **só** para testar a cola contra um servidor falso local.

- [ ] **Step 1: Criar `yampi.mjs`, `evolution.mjs` e `credenciais.ps1`**

O `.ps1` é **ASCII puro de propósito**: o PowerShell 5.1 lê `.ps1` sem BOM como ANSI e estragaria acentos (inclusive a frase de teste `quem e voce?` que o redator compara).

```javascript
// infra/scripts/fase0-recuperar/yampi.mjs
// Chamadas à API da Yampi com a credencial do lojista da piloto (só do ambiente). Não imprime token, segredo, telefone nem e-mail.
//   node infra/scripts/fase0-recuperar/yampi.mjs <comando>
//   ping | credenciais-formato | erro-401 | prova-401 | webhook-criar [evento,evento] | webhook-listar [sufixo] | webhook-desativar | webhook-apagar
//   pedido <seq> | pedidos-1 | pedidos-pix | carrinhos | copiar-link <seq> <caminho.do.campo>
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { NOME_DO_AVISO, assertAvisoNosso, caminhoNoObjeto, dirBruto, dormir, gravarJson, lerEstado, lerEvento, lerJson, mesclarEstado, pedirEnv, temMarcador } from "./comum.mjs";

const BASE = process.env.FASE0_YAMPI_BASE ?? "https://api.dooki.com.br/v2";
const EVENTOS = ["cart.reminder", "order.created", "order.paid", "order.status.updated", "transaction.payment.refused"];
const INCLUDE_PEDIDO = "customer,items,transactions,status,statuses,shipping_address";
const UM_DIA = 864e5;

async function api(metodo, caminho, { consulta = {}, corpo } = {}) {
  const url = new URL(`${BASE}/${pedirEnv("YAMPI_ALIAS")}${caminho}`);
  for (const [chave, valor] of Object.entries(consulta)) url.searchParams.append(chave, String(valor));
  const inicio = Date.now();
  const r = await fetch(url, {
    method: metodo,
    headers: {
      "User-Token": pedirEnv("YAMPI_USER_TOKEN"),
      "User-Secret-Key": pedirEnv("YAMPI_USER_SECRET_KEY"),
      Accept: "application/json",
      ...(corpo ? { "Content-Type": "application/json" } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // resposta que não é JSON fica só em `texto`
  }
  await dormir(1100); // ~55 req/min: a doc fala em 60/min por rota
  const limiteObj = Object.fromEntries([...r.headers].filter(([k]) => /rate|limit|retry|remaining/i.test(k)));
  const limite = Object.entries(limiteObj).map(([k, v]) => `${k}=${v}`);
  return { status: r.status, json, texto, ms: Date.now() - inicio, limite, limiteObj };
}
const dados = (r) => (Array.isArray(r.json?.data) ? r.json.data : r.json?.data ? [r.json.data] : []);
const erro = (r) => `http=${r.status} ${String(r.json?.message ?? r.texto).slice(0, 160)}`;
const hostDe = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "?";
  }
};
const dia = (data) => data.toISOString().slice(0, 10);

async function ping() {
  const r = await api("GET", "/checkout/statuses");
  console.log(`ping http=${r.status} ms=${r.ms} status_de_pedido=[${dados(r).map((s) => s.alias).join(",")}]`);
  console.log(`cabeçalhos de limite: ${r.limite.join(" ") || "nenhum"}`);
  gravarJson(join(dirBruto(), "api", "limite-cabecalhos.json"), r.limiteObj);
}

// Só o formato das credenciais (tamanho e classe de caracteres), nunca o valor.
function credenciaisFormato() {
  const forma = (nome) => {
    const v = pedirEnv(nome);
    return { tamanho: v.length, soImprimivelAscii: /^[\x21-\x7e]+$/.test(v), temArroba: v.includes("@") };
  };
  const saida = { userToken: forma("YAMPI_USER_TOKEN"), userSecretKey: forma("YAMPI_USER_SECRET_KEY") };
  gravarJson(join(dirBruto(), "api", "credenciais-formato.json"), saida);
  console.log(`credenciais-formato ${JSON.stringify(saida)}`);
}

// Credencial errada de propósito (valores inventados): como a API responde a um 401.
async function erro401() {
  const r = await fetch(`${BASE}/${pedirEnv("YAMPI_ALIAS")}/checkout/statuses`, {
    headers: { "User-Token": "invalido-fase0", "User-Secret-Key": "invalido-fase0", Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  const texto = await r.text();
  let corpo = texto;
  try {
    corpo = JSON.parse(texto);
  } catch {
    // corpo que não é JSON fica como texto
  }
  gravarJson(join(dirBruto(), "api", "erro-401.json"), { status: r.status, corpo });
  console.log(`erro-401 http=${r.status} (esperado 401)`);
  await dormir(1100);
}

// S11 do plano 6: o endpoint de produção recusa (401) aviso sem assinatura. A Yampi aceita criar um aviso cuja URL responde 401?
async function prova401() {
  const urls = lerJson(join(dirBruto(), "urls.json"));
  if (!urls?.rejeita) throw new Error("Suba a captura antes (urls.json sem a rota /rejeita).");
  const r = await api("POST", "/webhooks", { corpo: { name: NOME_DO_AVISO, url: urls.rejeita, events: ["order.paid"] } });
  const aviso = dados(r)[0];
  console.log(`prova-401 criar http=${r.status} ${aviso?.id ? `id=${aviso.id}` : erro(r)}`);
  if (!aviso?.id) return;
  await dormir(5000); // tempo para uma chamada de teste da Yampi, se existir, bater na rota /rejeita
  assertAvisoNosso(aviso, aviso.id);
  const d = await api("DELETE", `/webhooks/${aviso.id}`);
  console.log(`prova-401 apagar http=${d.status} (esperado 204). Veja na Aba A se a rota /rejeita foi chamada na criação.`);
}

async function entregarSegredo(segredo) {
  const porta = Number(process.env.FASE0_PORTA ?? 8787) + 1;
  const r = await fetch(`http://127.0.0.1:${porta}/segredo`, { method: "POST", body: JSON.stringify({ segredo }) });
  if (r.status !== 204) throw new Error(`o servidor de captura recusou o segredo (${r.status})`);
}

async function webhookCriar(lista) {
  const bruto = dirBruto();
  const urls = lerJson(join(bruto, "urls.json"));
  if (!urls?.yampi) throw new Error("Suba a captura antes (urls.json ausente).");
  const eventos = lista ? lista.split(",") : EVENTOS;
  const r = await api("POST", "/webhooks", { corpo: { name: NOME_DO_AVISO, url: urls.yampi, events: eventos } });
  const aviso = dados(r)[0];
  if (![200, 201].includes(r.status) || !aviso?.id) {
    console.log(`webhook-criar ${erro(r)}`);
    process.exit(1);
  }
  try {
    await entregarSegredo(aviso.secret_key);
  } catch (e) {
    await api("DELETE", `/webhooks/${aviso.id}`);
    console.log(`webhook-criar: ${e.message}. O aviso foi apagado.`);
    process.exit(1);
  }
  const { secret_key: _segredo, ...semSegredo } = aviso; // a chave nunca vai para o disco
  gravarJson(join(bruto, "api", "webhook-criado.json"), { status: r.status, data: semSegredo });
  mesclarEstado({ yampiWebhookId: aviso.id }, bruto);
  console.log(`webhook-criar http=${r.status} id=${aviso.id} active=${aviso.active} eventos=${eventos.length} secret_key=${String(aviso.secret_key).length} caracteres (entregue ao servidor local, não gravada)`);
}

async function webhookListar(sufixo) {
  const r = await api("GET", "/webhooks", { consulta: { include: "events", limit: 100 } });
  if (r.status !== 200) return console.log(`webhook-listar ${erro(r)}`);
  // com sufixo, grava só o NOSSO aviso (a loja pode ter avisos de outras integrações)
  if (sufixo) gravarJson(join(dirBruto(), "api", `webhooks-lista-${sufixo}.json`), { ...r.json, data: dados(r).filter((w) => w.name === NOME_DO_AVISO) });
  for (const w of dados(r)) {
    console.log(`${w.id}  ${w.name}  active=${w.active}  disabled_at=${w.disabled_at ? "sim" : "não"}  eventos=${w.events?.data?.length ?? "?"}  host=${hostDe(w.url)}${w.name === NOME_DO_AVISO ? "  <- da Fase 0" : ""}`);
  }
}

// A doc não lista `active` no corpo do PUT: é uma tentativa. Se continuar `true`, não há como desativar por API.
async function webhookDesativar() {
  const bruto = dirBruto();
  const id = lerEstado(bruto).yampiWebhookId;
  const urls = lerJson(join(bruto, "urls.json"));
  if (!id || !urls?.yampi) throw new Error("estado.json não tem aviso criado por esta fase.");
  assertAvisoNosso(dados(await api("GET", `/webhooks/${id}`))[0], id);
  const r = await api("PUT", `/webhooks/${id}`, { corpo: { name: NOME_DO_AVISO, url: urls.yampi, events: EVENTOS, active: false } });
  console.log(`webhook-desativar http=${r.status} active_depois=${dados(r)[0]?.active ?? "?"}`);
}

async function webhookApagar() {
  const id = lerEstado().yampiWebhookId;
  if (!id) throw new Error("estado.json não tem aviso criado por esta fase.");
  assertAvisoNosso(dados(await api("GET", `/webhooks/${id}`))[0], id);
  const r = await api("DELETE", `/webhooks/${id}`);
  console.log(`webhook-apagar http=${r.status} (esperado 204)`);
  if (r.status === 204) mesclarEstado({ yampiWebhookId: null });
}

async function pedido(seq) {
  const bruto = dirBruto();
  const id = lerEvento(bruto, seq).body?.resource?.id;
  if (!id) throw new Error("o aviso não tem resource.id");
  const nome = String(seq).padStart(3, "0");
  for (const [sufixo, caminho, consulta] of [["", `/orders/${id}`, { include: INCLUDE_PEDIDO }], ["-transacoes", `/orders/${id}/transactions`, {}]]) {
    const r = await api("GET", caminho, { consulta });
    const meu = r.status === 200 && temMarcador(r.texto);
    if (meu) gravarJson(join(bruto, "api", `pedido-seq${nome}${sufixo}.json`), r.json);
    console.log(`pedido ${seq}${sufixo} http=${r.status} ms=${r.ms} ${meu ? `gravado status=${dados(r)[0]?.status?.data?.alias ?? "-"}` : "NÃO gravado (sem marcador)"}`);
  }
}

// A leitura barata do teste de conexão do plano 6 (`GET /orders?limit=1`). Só grava se o pedido mais novo for do teste.
async function pedidos1() {
  const r = await api("GET", "/orders", { consulta: { limit: 1, include: "customer,transactions,status" } });
  const meu = r.status === 200 && temMarcador(r.texto);
  if (meu) gravarJson(join(dirBruto(), "api", "pedidos-1.json"), r.json);
  console.log(`pedidos-1 http=${r.status} ms=${r.ms} ${meu ? "gravado (o pedido mais novo é do teste)" : "NÃO gravado: o pedido mais novo não é do teste; criar outro pedido de teste e repetir"}`);
}

async function paginar(caminho, consulta) {
  const itens = [];
  let total = null;
  for (let pagina = 1; pagina <= 12; pagina++) {
    const r = await api("GET", caminho, { consulta: { ...consulta, limit: 100, page: pagina } });
    if (r.status !== 200) return { status: r.status, itens, total, falha: erro(r) };
    itens.push(...dados(r));
    total = r.json?.meta?.pagination?.total ?? total;
    if (pagina >= (r.json?.meta?.pagination?.total_pages ?? 1)) break;
  }
  return { status: 200, itens, total, falha: null };
}

// Baixa a lista, mas só grava e comenta o que for do teste: o resto é cliente de verdade e fica só na memória.
async function variantes(nome, caminho, lista, resumo) {
  const bruto = dirBruto();
  for (const [rotulo, consulta] of lista) {
    const r = await paginar(caminho, consulta);
    const meus = r.itens.filter((item) => temMarcador(JSON.stringify(item)));
    console.log(`${nome} variante=${rotulo} http=${r.status} total=${r.total ?? "?"} baixados=${r.itens.length} do_teste=${meus.length}${r.falha ? ` ${r.falha}` : ""}`);
    if (meus.length) gravarJson(join(bruto, "api", `${nome}-${rotulo}.json`), { data: meus, meta: { total: r.total, baixados: r.itens.length } });
    for (const item of meus) console.log(`  ${resumo(item)}`);
  }
}

async function pedidosPix() {
  const agora = new Date();
  const periodo = `created_at:${dia(new Date(agora - UM_DIA))}|${dia(agora)}`;
  const aguardando = dados(await api("GET", "/checkout/statuses")).find((s) => s.alias === "waiting_payment")?.id;
  const inc = { include: "customer,transactions,status" };
  await variantes(
    "lista-pedidos",
    "/orders",
    [
      ["plana", { ...inc, date: periodo, "payment_method[]": "pix", ...(aguardando ? { "status_id[]": aguardando } : {}) }],
      ["filters", { ...inc, "filters[date]": periodo, "filters[payment_method][]": "pix", ...(aguardando ? { "filters[status_id][]": aguardando } : {}) }],
      ["sem-filtro", inc],
    ],
    (p) => `pedido de teste: status=${p.status?.data?.alias ?? "-"} pix=${JSON.stringify(p.transactions ?? {}).includes('"is_pix":true')}`,
  );
}

async function carrinhos() {
  const agora = new Date();
  const inc = { include: "customer,items,transactions,payment,search" };
  await variantes(
    "lista-carrinhos",
    "/checkout/carts",
    [
      ["tres-dias", { ...inc, date: `created_at:${dia(new Date(agora - 3 * UM_DIA))}|${dia(agora)}` }],
      ["sem-filtro", inc],
    ],
    (c) => `carrinho de teste: total_transactions=${c.total_transactions} last_transaction_status=${c.last_transaction_status ?? "-"} unauth_simulate_url=${Boolean(c.unauth_simulate_url)} simulate_url=${Boolean(c.simulate_url)}`,
  );
}

function copiarLink(seq, caminho) {
  const url = caminhoNoObjeto(lerEvento(dirBruto(), seq).body, caminho);
  if (typeof url !== "string" || !/^https:\/\//.test(url)) throw new Error(`${caminho} não é uma URL https neste aviso`);
  spawnSync("clip", { input: url });
  console.log(`link copiado para a área de transferência (${url.length} caracteres; não impresso).`);
}

const [comando, a, b] = process.argv.slice(2);
const comandos = {
  ping,
  "credenciais-formato": credenciaisFormato,
  "erro-401": erro401,
  "prova-401": prova401,
  "webhook-criar": () => webhookCriar(a),
  "webhook-listar": () => webhookListar(a),
  "webhook-desativar": webhookDesativar,
  "webhook-apagar": webhookApagar,
  pedido: () => pedido(a),
  "pedidos-1": pedidos1,
  "pedidos-pix": pedidosPix,
  carrinhos,
  "copiar-link": () => copiarLink(a, b),
};
if (!comandos[comando]) {
  console.error(`uso: yampi.mjs ${Object.keys(comandos).join(" | ")}`);
  process.exit(2);
}
try {
  await comandos[comando]();
} catch (e) {
  console.error(`erro: ${e.message}`);
  process.exit(1);
}
```

```javascript
// infra/scripts/fase0-recuperar/evolution.mjs
// Chamadas à Evolution de PRODUÇÃO, só para a instância de teste fase0-recuperar-<data>. Usa a chave global do ambiente e não a imprime.
//   node infra/scripts/fase0-recuperar/evolution.mjs <comando>
//   versao | criar | conectar | webhook | estado | config | numeros <rótulo>... | texto <B|C> "<texto>" [--jid] | texto-invalido | imagem <B|C> "<legenda>" | midia <imagem|audio> | apagar
import { join } from "node:path";
import { celulares, dirBruto, eventosDaRota, gravarJson, lerEstado, lerJson, mesclarEstado, nomeDaInstancia, pedirEnv } from "./comum.mjs";

const EVENTOS = ["QRCODE_UPDATED", "CONNECTION_UPDATE", "MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE"];
const INTERVALO_MINIMO_MS = 40_000; // a spec sorteia 40 a 120 s entre envios do número; a prova nunca fica abaixo disso
const NUMERO_QUE_NAO_EXISTE = "5500999990000"; // DDD 00 não existe: ninguém recebe a mensagem

const enc = encodeURIComponent;
const tipoDoJid = (jid) => (String(jid).endsWith("@lid") ? "@lid" : String(jid).endsWith("@s.whatsapp.net") ? "@s.whatsapp.net" : "outro");

async function evo(metodo, caminho, corpo) {
  const base = pedirEnv("EVOLUTION_API_URL").replace(/\/+$/, "");
  const r = await fetch(`${base}${caminho}`, {
    method: metodo,
    headers: { apikey: pedirEnv("EVOLUTION_API_KEY"), ...(corpo ? { "Content-Type": "application/json" } : {}) },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  const texto = await r.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    // resposta que não é JSON fica só em `texto`
  }
  return { status: r.status, json, texto };
}

/** B, C, B-SEM9 (JID sem o 9º dígito) ou invalido. O CHIP nunca é destino. */
function numeroDe(rotulo) {
  if (rotulo.toLowerCase() === "invalido") return NUMERO_QUE_NAO_EXISTE;
  const [base, variante] = rotulo.toUpperCase().split("-");
  const numero = base === "CHIP" ? undefined : celulares()[base];
  if (!numero) throw new Error(`rótulo desconhecido: ${rotulo} (use B, C, B-SEM9, C-SEM9 ou invalido)`);
  return variante === "SEM9" && numero.length === 13 ? numero.slice(0, 4) + numero.slice(5) : numero;
}

function exigirIntervalo() {
  const ultimo = lerEstado().ultimoEnvio;
  const falta = ultimo ? INTERVALO_MINIMO_MS - (Date.now() - Date.parse(ultimo)) : 0;
  if (falta > 0) throw new Error(`Espere mais ${Math.ceil(falta / 1000)} s: o ritmo mínimo entre envios é de ${INTERVALO_MINIMO_MS / 1000} s.`);
}

function registrarEnvio(rotulo, resposta, arquivo) {
  const bruto = dirBruto();
  gravarJson(join(bruto, "api", arquivo), resposta.json);
  const key = resposta.json?.key;
  if (!key?.id) return;
  const em = new Date().toISOString();
  mesclarEstado({ ultimoEnvio: em, enviados: [...(lerEstado(bruto).enviados ?? []), { keyId: key.id, para: rotulo, jid: key.remoteJid, em }] }, bruto);
}

function resumoDoEnvio(nome, r, numero) {
  const key = r.json?.key;
  console.log(
    `${nome} http=${r.status} key.id=${key?.id ? `${key.id.length} caracteres` : "ausente"} key.remoteJid=${tipoDoJid(key?.remoteJid)} key.remoteJidAlt=${key?.remoteJidAlt ? tipoDoJid(key.remoteJidAlt) : "ausente"} igual_ao_destino=${String(key?.remoteJid).split("@")[0] === numero} status=${r.json?.status ?? "-"}`,
  );
}

async function versao() {
  const r = await evo("GET", "/");
  console.log(`versao http=${r.status} version=${r.json?.version ?? "?"} (a fonte lida é a 2.3.7)`);
}

async function criar() {
  const instancia = nomeDaInstancia();
  const chip = celulares().CHIP;
  if (!chip) throw new Error("FASE0_CELULARES precisa do CHIP=55... (o código de pareamento sai para esse número).");
  const r = await evo("POST", "/instance/create", { instanceName: instancia, integration: "WHATSAPP-BAILEYS", qrcode: true, number: chip });
  const ajustes = Object.fromEntries(Object.entries(r.json?.settings ?? {}).filter(([, v]) => typeof v === "boolean"));
  console.log(`criar http=${r.status} instancia=${instancia} pairingCode=${r.json?.qrcode?.pairingCode ?? "(ausente: rode conectar)"}`);
  console.log(`ajustes que o app também recebe por padrão: ${JSON.stringify(ajustes)}`);
}

async function conectar() {
  const r = await evo("GET", `/instance/connect/${enc(nomeDaInstancia())}?number=${celulares().CHIP}`);
  console.log(`conectar http=${r.status} pairingCode=${r.json?.pairingCode ?? "(ausente)"} count=${r.json?.count ?? "-"}`);
}

async function webhook() {
  const urls = lerJson(join(dirBruto(), "urls.json"));
  if (!urls?.evolution) throw new Error("Suba a captura antes (urls.json ausente).");
  const r = await evo("POST", `/webhook/set/${enc(nomeDaInstancia())}`, {
    webhook: { enabled: true, url: urls.evolution, byEvents: false, base64: false, events: EVENTOS },
  });
  console.log(`webhook http=${r.status} eventos=${EVENTOS.join(",")}`);
}

async function estado() {
  const instancia = nomeDaInstancia();
  const [conexao, lista] = [await evo("GET", `/instance/connectionState/${enc(instancia)}`), await evo("GET", `/instance/fetchInstances?instanceName=${enc(instancia)}`)];
  const i = Array.isArray(lista.json) ? lista.json[0] : lista.json;
  console.log(`estado conexao=${conexao.json?.instance?.state ?? conexao.status} connectionStatus=${i?.connectionStatus ?? "-"} dono_conectado=${Boolean(i?.ownerJid)} disconnectionReasonCode=${i?.disconnectionReasonCode ?? "-"} disconnectionAt=${i?.disconnectionAt ?? "-"}`);
}

async function config() {
  const r = await evo("GET", `/settings/find/${enc(nomeDaInstancia())}`);
  const ajustes = Object.fromEntries(Object.entries(r.json ?? {}).filter(([, v]) => typeof v === "boolean"));
  console.log(`config http=${r.status} ${JSON.stringify(ajustes)}`);
}

async function numeros(rotulos) {
  const lista = rotulos.map(numeroDe);
  const r = await evo("POST", `/chat/whatsappNumbers/${enc(nomeDaInstancia())}`, { numbers: lista });
  gravarJson(join(dirBruto(), "api", `numeros-${Date.now()}.json`), r.json);
  console.log(`numeros http=${r.status}`);
  (Array.isArray(r.json) ? r.json : []).forEach((x, i) => {
    const usuario = String(x.jid).split("@")[0];
    console.log(`  ${rotulos[i]} exists=${x.exists} jid=${tipoDoJid(x.jid)} (${usuario.length} dígitos; enviado com ${lista[i].length}) jid_igual_ao_enviado=${usuario === lista[i]} lid=${x.lid ?? "-"} nome_presente=${Boolean(x.name)}`);
  });
}

// Com --jid, o `number` do envio é o JID que o whatsappNumbers devolveu (a forma que o plano 3 pretende usar); sem, são os dígitos.
async function texto(rotulo, mensagem, comJid) {
  const alvo = String(rotulo).toUpperCase();
  if (!["B", "C"].includes(alvo) || !mensagem) throw new Error('uso: texto <B|C> "<texto>" [--jid]');
  exigirIntervalo();
  const instancia = nomeDaInstancia();
  const numero = numeroDe(alvo);
  let destino = numero;
  if (comJid) {
    const achado = await evo("POST", `/chat/whatsappNumbers/${enc(instancia)}`, { numbers: [numero] });
    const item = Array.isArray(achado.json) ? achado.json[0] : null;
    if (!item?.exists || !item.jid) throw new Error("whatsappNumbers não achou o número; nada foi enviado");
    destino = item.jid;
  }
  const r = await evo("POST", `/message/sendText/${enc(instancia)}`, { number: destino, text: mensagem });
  registrarEnvio(alvo, r, `envio-texto-${Date.now()}.json`);
  resumoDoEnvio(comJid ? "texto (number=jid)" : "texto", r, numero);
}

async function textoInvalido() {
  const instancia = nomeDaInstancia();
  const antes = await evo("POST", `/chat/whatsappNumbers/${enc(instancia)}`, { numbers: [NUMERO_QUE_NAO_EXISTE] });
  if (antes.json?.[0]?.exists !== false) throw new Error("abortado: o número inventado não voltou como inexistente");
  const r = await evo("POST", `/message/sendText/${enc(instancia)}`, { number: NUMERO_QUE_NAO_EXISTE, text: "Teste da Fase 0 (numero que nao existe)" });
  gravarJson(join(dirBruto(), "api", "envio-numero-inexistente.json"), { status: r.status, corpo: r.json ?? r.texto });
  console.log(`texto-invalido http=${r.status} chaves=${Object.keys(r.json ?? {}).join(",")}`);
}

async function imagem(rotulo, legenda) {
  const alvo = String(rotulo).toUpperCase();
  if (!["B", "C"].includes(alvo) || !legenda) throw new Error('uso: imagem <B|C> "<legenda>"');
  exigirIntervalo();
  const urls = lerJson(join(dirBruto(), "urls.json"));
  if (!urls?.imagem) throw new Error("Suba a captura antes (urls.json ausente).");
  const numero = numeroDe(alvo);
  const r = await evo("POST", `/message/sendMedia/${enc(nomeDaInstancia())}`, {
    number: numero,
    mediatype: "image",
    mimetype: "image/jpeg",
    caption: legenda,
    fileName: "teste.jpg",
    media: urls.imagem,
  });
  registrarEnvio(alvo, r, `envio-imagem-${Date.now()}.json`);
  resumoDoEnvio("imagem", r, numero);
}

async function midia(tipo) {
  const bruto = dirBruto();
  const chave = tipo === "audio" ? "audioMessage" : "imageMessage";
  const recebida = eventosDaRota(bruto, "evo").reverse().find((e) => e.body?.event === "messages.upsert" && !e.body.data?.key?.fromMe && e.body.data?.message?.[chave]);
  if (!recebida) throw new Error(`nenhuma ${chave} recebida ainda`);
  const r = await evo("POST", `/chat/getBase64FromMediaMessage/${enc(nomeDaInstancia())}`, { message: { key: { id: recebida.body.data.key.id } } });
  gravarJson(join(bruto, "api", `base64-${tipo}.json`), r.json);
  const base64 = String(r.json?.base64 ?? "");
  const magic = Buffer.from(base64.slice(0, 16), "base64").subarray(0, 4).toString("hex");
  console.log(`midia ${tipo} http=${r.status} mediaType=${r.json?.mediaType} mimetype=${r.json?.mimetype} base64=${base64.length} caracteres magic=${magic}`);
}

async function apagar() {
  const instancia = nomeDaInstancia();
  const saida = await evo("DELETE", `/instance/logout/${enc(instancia)}`);
  const apagada = await evo("DELETE", `/instance/delete/${enc(instancia)}`);
  const lista = await evo("GET", `/instance/fetchInstances?instanceName=${enc(instancia)}`); // nunca sem o nome: sem ele devolve as instâncias de produção
  const sobrou = Array.isArray(lista.json) ? lista.json.length : 0;
  console.log(`apagar logout=${saida.status} delete=${apagada.status} instancias_com_esse_nome=${sobrou}`);
  if (sobrou) process.exit(1);
}

const [comando, a, ...resto] = process.argv.slice(2);
const comandos = {
  versao,
  criar,
  conectar,
  webhook,
  estado,
  config,
  numeros: () => numeros([a, ...resto].filter(Boolean)),
  texto: () => texto(a, resto.filter((x) => x !== "--jid").join(" "), resto.includes("--jid")),
  "texto-invalido": textoInvalido,
  imagem: () => imagem(a, resto.join(" ")),
  midia: () => midia(a),
  apagar,
};
if (!comandos[comando]) {
  console.error(`uso: evolution.mjs ${Object.keys(comandos).join(" | ")}`);
  process.exit(2);
}
try {
  await comandos[comando]();
} catch (e) {
  console.error(`erro: ${e.message}`);
  process.exit(1);
}
```

```powershell
# infra/scripts/fase0-recuperar/credenciais.ps1
# Rode NA JANELA DO IGOR (nunca por ferramenta do Claude). Pede cada valor sem eco e guarda so no ambiente desta janela:
# nada vai para arquivo, e o historico do PowerShell guarda este comando, nao o que voce digita.
# ASCII de proposito: o PowerShell 5.1 le .ps1 sem BOM como ANSI e estragaria os acentos.
#   & .\infra\scripts\fase0-recuperar\credenciais.ps1               tudo (aba de comandos)
#   & .\infra\scripts\fase0-recuperar\credenciais.ps1 -SoCaptura    so os marcadores (aba do servidor de captura; sem credencial)
param([switch]$SoCaptura)

function Pedir-Texto([string]$Nome, [string]$Dica, [string]$Padrao = '') {
  $texto = Read-Host -Prompt "$Nome ($Dica)"
  if ([string]::IsNullOrWhiteSpace($texto)) { $texto = $Padrao }
  if ([string]::IsNullOrWhiteSpace($texto)) { throw "$Nome vazio" }
  Set-Item -Path "Env:$Nome" -Value $texto.Trim()
}

function Pedir-Segredo([string]$Nome, [string]$Dica) {
  $seguro = Read-Host -Prompt "$Nome ($Dica)" -AsSecureString
  $texto = [System.Net.NetworkCredential]::new('', $seguro).Password
  if ([string]::IsNullOrWhiteSpace($texto)) { throw "$Nome vazio" }
  Set-Item -Path "Env:$Nome" -Value $texto.Trim()
}

$env:FASE0_BRUTO = Join-Path $env:USERPROFILE 'fase0-recuperar-bruto'
New-Item -ItemType Directory -Force $env:FASE0_BRUTO | Out-Null
$env:EVOLUTION_API_URL = 'https://wa.girumo.com.br'
$env:FASE0_FRASES = 'Ola, teste da Fase 0|Oi, recebi sim|quem e voce?|SAIR|Teste 1 da Fase 0|Teste 2 da Fase 0|Teste de imagem da Fase 0|Teste do celular do chip|Teste da Fase 0 (numero que nao existe)'

Pedir-Texto 'FASE0_MARCADORES' 'e-mail dos checkouts de teste e os 9 digitos do telefone B (sem 55 nem DDD), separados por virgula'
if (-not $SoCaptura) {
  Pedir-Texto 'FASE0_CELULARES' 'CHIP=55...,B=55...,C=55...  so digitos, com 55'
  Pedir-Texto 'FASE0_LOJA_TERMOS' 'nome da loja e do dominio, separados por virgula' 'sem-termos'
  Pedir-Texto 'YAMPI_ALIAS' 'alias da loja piloto'
  Pedir-Segredo 'YAMPI_USER_TOKEN' 'Yampi > Perfil > Credenciais de API'
  Pedir-Segredo 'YAMPI_USER_SECRET_KEY' 'idem'
  Pedir-Segredo 'EVOLUTION_API_KEY' 'AUTHENTICATION_API_KEY do recurso evolution-api no Coolify'
}

Get-ChildItem Env: | Where-Object { $_.Name -match '^(FASE0_|YAMPI_|EVOLUTION_)' } | ForEach-Object { '{0,-22} {1} caracteres' -f $_.Name, $_.Value.Length }
```

- [ ] **Step 2: Conferir sintaxe, mensagens de uso e o `.ps1`**

```powershell
Set-Location $wt
node --check infra/scripts/fase0-recuperar/yampi.mjs
node --check infra/scripts/fase0-recuperar/evolution.mjs
node infra/scripts/fase0-recuperar/yampi.mjs
node infra/scripts/fase0-recuperar/evolution.mjs texto B "x"
$erros = $null
[System.Management.Automation.Language.Parser]::ParseFile("$wt\infra\scripts\fase0-recuperar\credenciais.ps1", [ref]$null, [ref]$erros) | Out-Null
"erros de sintaxe no .ps1: $($erros.Count)"
"bytes nao-ASCII no .ps1: $(@([System.IO.File]::ReadAllBytes("$wt\infra\scripts\fase0-recuperar\credenciais.ps1") | Where-Object { $_ -gt 127 }).Count)"
```

Esperado: os dois `--check` sem saída; `uso: yampi.mjs ping | webhook-criar | webhook-listar | webhook-apagar | pedido | pedidos-pix | carrinhos | copiar-link`; `erro: FASE0_BRUTO ausente no ambiente (rode credenciais.ps1 na janela do Igor).`; `erros de sintaxe no .ps1: 0`; `bytes nao-ASCII no .ps1: 0`.

- [ ] **Step 3: Commit**

```powershell
git -C $wt add infra/scripts/fase0-recuperar
git -C $wt diff --cached --stat
git -C $wt commit -m "chore(recuperar): phase 0 Yampi and Evolution call tools" -m "Co-Authored-By: <assistente em uso> <noreply@anthropic.com>"
```

---

### Task 4: Veredito da ligação resposta ↔ telefone (go/no-go)

**Files:**
- Create: `infra/scripts/fase0-recuperar/ligacao.mjs`
- Test: `infra/scripts/fase0-recuperar/ligacao.test.mjs`

**Interfaces:**
- Consumes: de `comum.mjs`, `celulares`, `dirBruto`, `eventosDaRota`, `lerEstado`; de `estado.json`, `enviados: { keyId, para, jid, em }[]`.
- Produces: `classificar({ eventos, enviados, celulares }) → { linhas, amostras, orfas, veredito, ecoDoEnvio, peloCelular, updatesCasados, entregas }` e a CLI (`node infra/scripts/fase0-recuperar/ligacao.mjs`), que imprime uma linha por resposta e termina em `VEREDITO: GO | NO-GO | INCONCLUSIVO`. Sai com 0 só em `GO`.

Cada resposta 1:1 recebida cai em uma destas ligações:

- `telefone_direto`: o `remoteJid` já é o telefone (a Evolution 2.3.7 troca o `@lid` pelo `remoteJidAlt` antes de avisar, quando ele existe — `whatsapp.baileys.service.ts`, linha 1478).
- `lid_com_telefone_ao_lado`: `@lid` e o telefone em `remoteJidAlt` ou `senderPn`.
- `lid_aprendido_no_update`: `@lid` igual ao `remoteJid` do `messages.update` de uma mensagem nossa — casa pelo `keyId`, e mostra se o ack chegou antes da resposta.
- `lid_aprendido_no_envio`: `@lid` igual ao `key.remoteJid` que o envio devolveu.
- `lid_orfao`: nenhuma das anteriores. **Sem ligação determinística.**

Regra do veredito: só contam respostas a envios nossos. Menos de 3 amostras = `INCONCLUSIVO`; alguma órfã = `NO-GO`; senão `GO`.

O que vem "ao lado" do `remoteJid` sai em `alt=` (`telefone`, `lid` ou `-`), e isso dá o **caso do plano 4 (E1)**: **A** = `via=telefone_direto` com `alt=-` ou `alt=telefone` (o telefone chegou no `remoteJid`); **B** = `via=telefone_direto` com `alt=lid` (o telefone no `remoteJid` e o LID ao lado); **C** = `via=lid_*` (só `@lid`, e a ligação vem do ack ou do envio). Para cada mensagem enviada, a CLI também imprime os status do `messages.update` que casaram por `keyId` (`status_vistos`, com `SERVER_ACK` se vier) e o `fromMe` deles, e a conta `messages.update de mensagens nossas: x/y` — `0/y` com `y > 0` quer dizer que o `keyId` do update **não** é o `key.id` do envio (ponto de parada para o plano 4).

- [ ] **Step 1: Escrever os testes (vermelhos)**

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { classificar } from "./ligacao.mjs";

const FONES = { CHIP: "5511999990001", B: "5511999990002", C: "5511999990003" };
const T = (s) => `2026-10-29T17:00:${String(s).padStart(2, "0")}.000Z`;
const upsert = (seq, s, key, message = { conversation: "x" }) => ({ seq, chegada: T(s), body: { event: "messages.upsert", data: { key: { id: `R${seq}`, fromMe: false, ...key }, message } } });
const update = (seq, s, d) => ({ seq, chegada: T(s), body: { event: "messages.update", data: d } });
const ENVIADOS = [
  { keyId: "K1", para: "B", jid: "5511999990002@s.whatsapp.net", em: T(1) },
  { keyId: "K2", para: "C", jid: "5511999990003@s.whatsapp.net", em: T(2) },
];

test("GO: as três formas determinísticas ligam a resposta ao telefone", () => {
  const r = classificar({
    celulares: FONES,
    enviados: ENVIADOS,
    eventos: [
      update(10, 5, { keyId: "K1", remoteJid: "222222@lid", status: "DELIVERY_ACK" }),
      upsert(11, 9, { remoteJid: "5511999990002@s.whatsapp.net" }),
      upsert(12, 10, { remoteJid: "333333@lid", remoteJidAlt: "5511999990003@s.whatsapp.net" }),
      upsert(13, 11, { remoteJid: "222222@lid" }),
    ],
  });
  assert.deepEqual(r.linhas.map((l) => [l.rotulo, l.via]), [["B", "telefone_direto"], ["C", "lid_com_telefone_ao_lado"], ["B", "lid_aprendido_no_update"]]);
  assert.equal(r.veredito, "GO");
  assert.equal(r.linhas[2].ackAntes, true);
});

test("NO-GO: uma resposta em @lid sem nenhuma ligação reprova o automático", () => {
  const r = classificar({
    celulares: FONES,
    enviados: ENVIADOS,
    eventos: [upsert(1, 9, { remoteJid: "5511999990002@s.whatsapp.net" }), upsert(2, 10, { remoteJid: "5511999990003@s.whatsapp.net" }), upsert(3, 11, { remoteJid: "999999@lid" })],
  });
  assert.equal(r.orfas, 1);
  assert.equal(r.veredito, "NO-GO");
});

test("INCONCLUSIVO com menos de 3 respostas a envios nossos", () => {
  const r = classificar({ celulares: FONES, enviados: ENVIADOS, eventos: [upsert(1, 9, { remoteJid: "5511999990002@s.whatsapp.net" })] });
  assert.equal(r.veredito, "INCONCLUSIVO");
});

test("corrida: a resposta pode chegar antes do ack (ackAntes=false) e ainda assim ligar", () => {
  const r = classificar({
    celulares: FONES,
    enviados: ENVIADOS,
    eventos: [upsert(1, 4, { remoteJid: "222222@lid" }), update(2, 6, { keyId: "K1", remoteJid: "222222@lid", status: "DELIVERY_ACK" })],
  });
  assert.equal(r.linhas[0].via, "lid_aprendido_no_update");
  assert.equal(r.linhas[0].ackAntes, false);
});

test("o 9º dígito não atrapalha, e mensagem de grupo e do próprio chip não entram na conta", () => {
  const r = classificar({
    celulares: FONES,
    enviados: ENVIADOS,
    eventos: [
      upsert(1, 9, { remoteJid: "551199990002@s.whatsapp.net" }), // JID sem o 9
      upsert(2, 9, { remoteJid: "120363000000000000@g.us" }),
      { seq: 3, chegada: T(9), body: { event: "messages.upsert", data: { key: { id: "K1", fromMe: true, remoteJid: "5511999990002@s.whatsapp.net" }, message: {} } } },
      { seq: 4, chegada: T(9), body: { event: "messages.upsert", data: { key: { id: "OUTRO", fromMe: true, remoteJid: "5511999990002@s.whatsapp.net" }, message: {} } } },
    ],
  });
  assert.equal(r.linhas.length, 1);
  assert.equal(r.linhas[0].rotulo, "B");
  assert.equal(r.ecoDoEnvio, "1/2");
  assert.equal(r.peloCelular, 1);
});

test("tempos, status vistos e fromMe do update saem do key.id; update que não casa aparece na conta", () => {
  const r = classificar({
    celulares: FONES,
    enviados: ENVIADOS,
    eventos: [
      update(1, 2, { keyId: "K1", status: "SERVER_ACK", fromMe: true }),
      update(2, 3, { keyId: "K1", status: "DELIVERY_ACK", fromMe: true }),
      update(3, 20, { keyId: "K1", status: "READ", fromMe: true }),
      update(4, 21, { keyId: "OUTRO-ID", status: "READ", fromMe: true }),
    ],
  });
  assert.deepEqual(r.entregas[0], { para: "B", entregaS: 2, leituraS: 19, statuses: ["SERVER_ACK", "DELIVERY_ACK", "READ"], fromMe: [true] });
  assert.equal(r.entregas[1].entregaS, null);
  assert.equal(r.updatesCasados, "3/4");
});

test("o que vem ao lado do remoteJid é classificado: telefone, lid (caso B do plano 4) ou nada", () => {
  const r = classificar({
    celulares: FONES,
    enviados: ENVIADOS,
    eventos: [
      upsert(1, 9, { remoteJid: "5511999990002@s.whatsapp.net", remoteJidAlt: "5511999990002@s.whatsapp.net" }),
      upsert(2, 10, { remoteJid: "5511999990002@s.whatsapp.net", remoteJidAlt: "777777@lid" }),
      upsert(3, 11, { remoteJid: "5511999990002@s.whatsapp.net" }),
    ],
  });
  assert.deepEqual(r.linhas.map((l) => l.altTipo), ["telefone", "lid", "-"]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
node --test 'infra/scripts/fase0-recuperar/ligacao.test.mjs'
```

Esperado: `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Criar `ligacao.mjs`**

```javascript
// infra/scripts/fase0-recuperar/ligacao.mjs
// Go/no-go do automático: dá para ligar a resposta de uma cliente ao telefone para o qual escrevemos?
// Lê o bruto e imprime só classificações (nenhum telefone, JID ou texto).
//   node infra/scripts/fase0-recuperar/ligacao.mjs
import { pathToFileURL } from "node:url";
import { celulares, dirBruto, eventosDaRota, lerEstado } from "./comum.mjs";

const ultimos8 = (s) => String(s ?? "").replace(/\D/g, "").slice(-8); // ignora o 55 e o 9º dígito
const telefoneDoJid = (jid) => /^(\d+)(?::\d+)?@s\.whatsapp\.net$/.exec(jid ?? "")?.[1] ?? null;
const segundos = (de, ate) => (Date.parse(ate) - Date.parse(de)) / 1000;

/**
 * Cada resposta 1:1 recebida cai numa destas ligações:
 *   telefone_direto            remoteJid já vem como telefone (a Evolution troca o @lid pelo remoteJidAlt quando ele existe)
 *   lid_com_telefone_ao_lado   remoteJid em @lid e o telefone vem em remoteJidAlt/senderPn
 *   lid_aprendido_no_update    @lid igual ao remoteJid do messages.update de uma mensagem nossa (casa pelo key.id)
 *   lid_aprendido_no_envio     @lid igual ao key.remoteJid devolvido pelo envio
 *   lid_orfao                  nenhuma das anteriores: sem ligação determinística
 */
export function classificar({ eventos, enviados, celulares: fones }) {
  const alvos = Object.entries(fones).filter(([rotulo]) => rotulo !== "CHIP");
  const rotuloDe = (telefone) => (telefone ? (alvos.find(([, n]) => ultimos8(n) === ultimos8(telefone))?.[0] ?? null) : null);
  const todos = eventos.map((e) => ({ seq: e.seq, chegada: e.chegada, evento: e.body?.event, d: e.body?.data }));
  const atualizacoes = todos.filter((x) => x.evento === "messages.update" && x.d);
  const idsEnviados = new Set(enviados.map((e) => e.keyId));
  const primeiroEnvio = enviados.map((e) => e.em).sort()[0] ?? null;
  const upserts = todos.filter((x) => x.evento === "messages.upsert" && x.d?.key && !String(x.d.key.remoteJid).endsWith("@g.us"));

  const linhas = upserts
    .filter((x) => !x.d.key.fromMe)
    .map(({ seq, chegada, d }) => {
      const { remoteJid: jid, remoteJidAlt, senderPn, addressingMode } = d.key;
      const alt = remoteJidAlt ?? senderPn ?? null;
      // o que vem "ao lado": o LID (caso B do plano 4), o telefone (a Evolution trocou o remoteJid por ele) ou nada
      const altTipo = !alt ? "-" : String(alt).endsWith("@lid") ? "lid" : String(alt).endsWith("@s.whatsapp.net") ? "telefone" : "outro";
      let via;
      let rotulo = rotuloDe(telefoneDoJid(jid));
      let ackAntes = null;
      if (rotulo) via = "telefone_direto";
      else if (String(jid).endsWith("@lid")) {
        rotulo = rotuloDe(telefoneDoJid(alt));
        if (rotulo) via = "lid_com_telefone_ao_lado";
        else {
          const upd = atualizacoes.find((u) => u.d.remoteJid === jid && idsEnviados.has(u.d.keyId));
          const envio = enviados.find((e) => e.jid === jid);
          if (upd) {
            rotulo = enviados.find((e) => e.keyId === upd.d.keyId).para;
            via = "lid_aprendido_no_update";
            ackAntes = upd.chegada <= chegada;
          } else if (envio) {
            rotulo = envio.para;
            via = "lid_aprendido_no_envio";
          } else via = "lid_orfao";
        }
      } else via = "outro_jid";
      const respondeAEnvio = rotulo ? enviados.some((e) => e.para === rotulo && e.em <= chegada) : primeiroEnvio !== null && primeiroEnvio <= chegada;
      return {
        seq,
        rotulo: rotulo ?? "?",
        via,
        respondeAEnvio,
        ackAntes,
        altTipo,
        addressingMode: addressingMode ?? "-",
        chavesDaKey: Object.keys(d.key).sort().join(","),
        tipo: Object.keys(d.message ?? {}).find((k) => k !== "messageContextInfo") ?? "?",
      };
    });

  const amostras = linhas.filter((l) => l.respondeAEnvio);
  const orfas = amostras.filter((l) => l.via === "lid_orfao" || l.via === "outro_jid");
  const veredito = amostras.length < 3 ? "INCONCLUSIVO" : orfas.length ? "NO-GO" : "GO";

  const proprios = upserts.filter((x) => x.d.key.fromMe);
  const entregas = enviados.map((e) => {
    const deles = atualizacoes.filter((u) => u.d.keyId === e.keyId);
    const quando = (status) => deles.find((u) => u.d.status === status)?.chegada;
    const [entrega, leitura] = [quando("DELIVERY_ACK"), quando("READ")];
    return {
      para: e.para,
      entregaS: entrega ? segundos(e.em, entrega) : null,
      leituraS: leitura ? segundos(e.em, leitura) : null,
      statuses: [...new Set(deles.map((u) => u.d.status))],
      fromMe: [...new Set(deles.map((u) => u.d.fromMe))],
    };
  });
  return {
    linhas,
    amostras: amostras.length,
    orfas: orfas.length,
    veredito,
    ecoDoEnvio: `${proprios.filter((x) => idsEnviados.has(x.d.key.id)).length}/${enviados.length}`,
    peloCelular: proprios.filter((x) => !idsEnviados.has(x.d.key.id)).length,
    // se o keyId do update não casa com o key.id do envio, isto sai 0 de N: o status por mensagem não funcionaria
    updatesCasados: `${atualizacoes.filter((u) => idsEnviados.has(u.d.keyId)).length}/${atualizacoes.length}`,
    entregas,
  };
}

function main() {
  const bruto = dirBruto();
  const r = classificar({ eventos: eventosDaRota(bruto, "evo"), enviados: lerEstado(bruto).enviados ?? [], celulares: celulares() });
  for (const l of r.linhas) {
    console.log(`#${String(l.seq).padStart(3, "0")} ${l.rotulo} via=${l.via} responde_a_envio=${l.respondeAEnvio} ack_antes=${l.ackAntes} alt=${l.altTipo} addressingMode=${l.addressingMode} tipo=${l.tipo} key=[${l.chavesDaKey}]`);
  }
  for (const e of r.entregas) {
    console.log(`envio para ${e.para}: entrega=${e.entregaS ?? "sem DELIVERY_ACK"} s, leitura=${e.leituraS ?? "sem READ"} s, status_vistos=[${e.statuses.join(",")}] fromMe_no_update=[${e.fromMe.join(",")}]`);
  }
  console.log(`messages.update de mensagens nossas (casados por keyId): ${r.updatesCasados}`);
  console.log(`eco do envio como messages.upsert fromMe: ${r.ecoDoEnvio} | mensagens "pelo celular": ${r.peloCelular}`);
  console.log(`VEREDITO: ${r.veredito} (${r.amostras} respostas a envios nossos, ${r.orfas} sem ligação determinística)`);
  process.exit(r.veredito === "GO" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Rodar tudo e ver passar**

```powershell
node --test 'infra/scripts/fase0-recuperar/*.test.mjs'
```

Esperado: `ℹ tests 30`, `ℹ pass 30`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```powershell
git -C $wt add infra/scripts/fase0-recuperar/ligacao.mjs infra/scripts/fase0-recuperar/ligacao.test.mjs
git -C $wt diff --cached --stat
git -C $wt commit -m "chore(recuperar): phase 0 reply-to-phone linking verdict" -m "Co-Authored-By: <assistente em uso> <noreply@anthropic.com>"
```

---

### Task 5: PR das ferramentas — revisão de segurança antes de tocar em dado real

**Files:** nenhum arquivo novo (revisão, correções que a revisão pedir, PR e merge).

**Interfaces:**
- Consumes: os 11 arquivos das tarefas 1 a 4, em `chore/recuperar-fase-0-provas`.
- Produces: as ferramentas em `main`; um worktree limpo, em branch nova, para as tarefas 6 a 11.

- [ ] **Step 1: Revisão de segurança independente**

Despachar o agente **Security Engineer** só com o diff e as perguntas (sem dizer o que a sessão concluiu):

> Revise `git -C C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\fase0-recuperar diff origin/main...HEAD` (pasta `infra/scripts/fase0-recuperar/`). Contexto: ferramentas descartáveis que vão ler payloads reais da Yampi (nome, CPF, telefone, endereço de cliente) e falar com a Evolution de produção usando a chave global. Responda por severidade (CRITICAL/HIGH/MEDIUM/LOW): (1) o redator deixa passar dado real em algum formato? (2) alguma ferramenta imprime ou grava credencial, telefone, e-mail, `secret_key` ou token da instância? (3) as travas (prefixo da instância, nome + id do aviso, marcador de aviso, rótulos B/C) podem ser contornadas? (4) o servidor de captura expõe algo pelo túnel além do pretendido? (5) comandos que o roteiro manda o Igor colar no PowerShell vazam segredo para o histórico?

Esperado: relatório sem CRITICAL/HIGH. Com CRITICAL/HIGH: corrigir com teste novo, repetir o Step 4 da tarefa que mexeu e voltar a este passo.

- [ ] **Step 2: Gate local deste PR**

```powershell
Set-Location $wt
node --test 'infra/scripts/fase0-recuperar/*.test.mjs'
powershell -ExecutionPolicy Bypass -File infra/scripts/scan-secrets.ps1
```

Esperado: `ℹ pass 30` e `Scan de secrets OK.`

- [ ] **Step 3: Push, PR e CI**

O corpo do PR termina com a linha de atribuição de PR que a sessão recebeu: acrescentá-la dentro do texto abaixo, logo antes do `'@`.

```powershell
git -C $wt push -u origin chore/recuperar-fase-0-provas
$corpo = @'
## O que é
Ferramentas descartáveis da Fase 0 do Recuperar (spec de 29/10, seção 8): servidor de captura atrás de túnel temporário, CLIs da Yampi e da Evolution de teste, redator de dado pessoal com conferência de vazamento e veredito do go/no-go. Sem dependência; fora do `npm test`; sai da árvore quando o PR 7 estiver no ar.

## Por que antes da prova
O redator vai tocar dado real de cliente, então entra revisado (Security Engineer, sem CRITICAL/HIGH) e testado antes disso. Resultado e fixtures vêm em outro PR.

## Teste
`node --test 'infra/scripts/fase0-recuperar/*.test.mjs'` -> 30 testes. Dois mutantes (tirar a trava de prefixo da instância; gravar aviso sem marcador) derrubam um teste cada.

Gate local: scan de secrets + testes da fase. Sem build web local de propósito (não toca código do app; `node_modules` do principal vazio e disco apertado): o `verify` do CI cobre o resto.

PRs que deixei abertos: nenhum além deste.
'@
$corpo | Set-Content (Join-Path $env:TEMP 'pr-fase0a.md') -Encoding UTF8
gh pr create --repo codingB0y/Girumo --base main --head chore/recuperar-fase-0-provas --title "chore(recuperar): phase 0 proof tools" --body-file (Join-Path $env:TEMP 'pr-fase0a.md')
```

Esperado: a URL do PR. Depois:

```powershell
gh pr checks chore/recuperar-fase-0-provas --repo codingB0y/Girumo --watch
```

Esperado: todos os checks verdes (o `main` não tem proteção, então o merge é à mão, no verde, e **nunca** `--auto`).

- [ ] **Step 4: Mergear e deixar o worktree pronto para a parte ao vivo**

```powershell
gh pr merge chore/recuperar-fase-0-provas --repo codingB0y/Girumo --squash
git -C $wt fetch origin main
git -C $wt switch -c chore/recuperar-fase-0-resultado origin/main
git -C $principal branch -D chore/recuperar-fase-0-provas
git -C $principal push origin --delete chore/recuperar-fase-0-provas
git -C $wt status --short
git -C $wt log --oneline -1
```

Esperado: `status --short` vazio; o `log` mostra o commit de squash do PR das ferramentas (a pasta `infra/scripts/fase0-recuperar/` continua igual). Se o remoto já apagou a branch, o último `push --delete` reclama de `remote ref does not exist`: ignorar. Correções de ferramenta que a parte ao vivo pedir vão para esta branch nova, como `fix(recuperar): …`.

---


# PARTE B — Provas ao vivo (com o Igor)

Saída "esperada" é o que as ferramentas imprimem; se vier outra coisa, vale o ponto de parada correspondente de "Antes de começar". Os números de aviso nos comandos (`1`, `2`…) são os da primeira coluna de `redigido/_indice.txt`: ajustar quando o índice mostrar outra ordem. `ligacao.mjs` sai com código 1 enquanto o veredito não for GO; no meio da prova isso é normal.

### Task 6: Ambiente da captura e esqueleto do resultado

**Files:**
- Create: `docs/superpowers/plans/_recuperar-fase-0-resultado.md` (esqueleto; é commitado só na tarefa 11)

**Interfaces:**
- Consumes: as ferramentas já em `main` (tarefa 5).
- Produces: captura no ar (`urls.json` no bruto), credenciais no ambiente da Aba B, imagem de teste, acesso da sessão a `redigido/`, o esqueleto do resultado que as tarefas 7 a 10 preenchem.

- [ ] **Step 1: Instalar o cloudflared** (Igor, qualquer aba)

```powershell
winget install --id Cloudflare.cloudflared -e
```

Esperado: instalação concluída. Fechar as abas e abrir novas (o PATH só vale em aba nova); `cloudflared --version` imprime `cloudflared version 2026.…`.

- [ ] **Step 2: Abrir as duas abas e entrar com as credenciais** (Igor)

Aba A (só captura; pede só os marcadores):

```powershell
$wt = 'C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\fase0-recuperar'
Set-Location $wt
& .\infra\scripts\fase0-recuperar\credenciais.ps1 -SoCaptura
```

Aba B (todo o resto; pede tudo):

```powershell
$wt = 'C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\fase0-recuperar'
Set-Location $wt
& .\infra\scripts\fase0-recuperar\credenciais.ps1
```

`FASE0_MARCADORES` é o e-mail de teste e os **9 dígitos do telefone B, sem 55 nem DDD**, separados por vírgula (ex.: `meu.teste.fase0@gmail.com,912345678`); é o que identifica um aviso como "do teste". `FASE0_CELULARES` é `CHIP=55…,B=55…,C=55…` (só dígitos, com 55). `FASE0_LOJA_TERMOS`: nome da loja e do domínio. Os segredos são digitados sem eco.

Esperado (a sessão lê só esta lista, que traz nomes e tamanhos): na Aba A, `EVOLUTION_API_URL`, `FASE0_BRUTO`, `FASE0_FRASES`, `FASE0_MARCADORES`; na Aba B, esses e mais `FASE0_CELULARES`, `FASE0_LOJA_TERMOS`, `YAMPI_ALIAS`, `YAMPI_USER_TOKEN`, `YAMPI_USER_SECRET_KEY`, `EVOLUTION_API_KEY`, cada um com `N caracteres`.

- [ ] **Step 3: Gerar a imagem de teste** (Aba B; é a "foto do depoimento" do passo da imagem por URL)

```powershell
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 800, 600
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(255, 241, 245, 249))
$fonte = New-Object System.Drawing.Font('Arial', 48, [System.Drawing.FontStyle]::Bold)
$g.DrawString('Teste Fase 0', $fonte, [System.Drawing.Brushes]::Black, 150, 240)
$bmp.Save((Join-Path $env:FASE0_BRUTO 'teste.jpg'), [System.Drawing.Imaging.ImageFormat]::Jpeg)
$g.Dispose(); $bmp.Dispose()
(Get-Item (Join-Path $env:FASE0_BRUTO 'teste.jpg')).Length
```

Esperado: um número perto de `17000` (bytes).

- [ ] **Step 4: Subir a captura** (Aba A; fica aberta até a tarefa 11)

```powershell
node infra/scripts/fase0-recuperar/captura.mjs
```

Esperado: `Captura no ar em https://<palavras>.trycloudflare.com (URLs completas só em urls.json). Marcadores: 2. Modo: só marcadores.` Se imprimir `cloudflared não encontrado`, abrir aba nova e repetir; se imprimir `FASE0_MARCADORES vazio`, refazer o Step 2.

- [ ] **Step 5: Provar o túnel por fora e a recusa de token errado** (Aba B)

```powershell
$u = Get-Content (Join-Path $env:FASE0_BRUTO 'urls.json') -Raw | ConvertFrom-Json
curl.exe -s -o NUL -w "%{http_code}`n" "$($u.publica)/yampi/caminho-errado"
Invoke-RestMethod http://127.0.0.1:8788/estado
```

Esperado: `404` (o túnel chega no nosso servidor, que recusa o token errado) e `salvos 0`, `ignorados 0`, `temSegredo False`. Se o `curl.exe` não conectar, esperar 15 s (o DNS do quick tunnel demora) e repetir até 3 vezes; depois, fechar a Aba A e subir a captura de novo (endereço novo).

- [ ] **Step 6: Voo de teste: versão da Evolution e credencial da Yampi** (Aba B)

```powershell
node infra/scripts/fase0-recuperar/evolution.mjs versao
node infra/scripts/fase0-recuperar/yampi.mjs ping
node infra/scripts/fase0-recuperar/yampi.mjs credenciais-formato
node infra/scripts/fase0-recuperar/yampi.mjs erro-401
```

Esperado: `versao http=200 version=2.3.7 (a fonte lida é a 2.3.7)`; `ping http=200 ms=… status_de_pedido=[…waiting_payment…]` e a linha `cabeçalhos de limite: …` (guardar: é a resposta de Y16; sai também em `api/limite-cabecalhos.json`); `credenciais-formato {"userToken":{"tamanho":…,"soImprimivelAscii":true,"temArroba":false},"userSecretKey":{…}}` (só tamanho e classe, nunca o valor); `erro-401 http=401 (esperado 401)` (a chamada usa credencial inventada). Os três últimos são o Y21 e já viram fixtures. Pontos de parada 1 e 2 valem aqui.

- [ ] **Step 7: Dar à sessão acesso só ao `redigido/`**

A sessão pede acesso ao diretório `C:\Users\Igor\fase0-recuperar-bruto\redigido` (a ferramenta de pedir diretório, com esse caminho exato, nunca a pasta-mãe) e o Igor aprova. A pasta existe porque a captura a criou no Step 4.

- [ ] **Step 8: Criar o esqueleto do resultado**

Criar `docs/superpowers/plans/_recuperar-fase-0-resultado.md` no worktree (`$wt`) com o conteúdo abaixo. Cada célula vazia é um passo que falta; as tarefas 7 a 10 as preenchem **assim que a resposta sai**, não no fim.

```markdown
# Recuperar — Fase 0 — Resultado

**Data:** AAAA-MM-DD · **Evolution medida:** (o que `versao` devolveu) · **Veredito do automático:** GO, NO-GO ou INCONCLUSIVO

> Sem dado pessoal: nada de nome da loja, alias, telefone, e-mail, documento nem URL com token. A evidência aponta para o comando que a produziu e para a fixture.
> "Resultado": `confirmado` (a hipótese bateu), `diferente` (escrever o que é) ou `não provado` (escrever por quê).
> Lido por: planos 3, 4 e 6 (conferência no começo de cada um) e 7 a 11 (a escrever com este resultado).

## 1. Yampi

| ID | Pergunta | Hipótese (spec ou doc) | Resultado | Evidência | Planos |
|---|---|---|---|---|---|
| Y1 | Formato do telefone no aviso | `customer.data.phone` com `area_code` e `number`; `full_number` às vezes sem o 55 | | | 6, 7 |
| Y2 | Link do carrinho que abre sem login | `unauth_simulate_url` abre sem logar; `simulate_url` entra logado (nunca mandar); `spreadsheet.data.purchase_url` a conferir | | | 7 (e 9) |
| Y3 | Link do pedido sem login, como reserva quando não vem o código Pix | algum campo de URL do pedido, sem token do cliente | | | 7 |
| Y4 | Onde mora o código Pix (EMV `000201…`) e a validade | `transactions.data[0].metadata[]` com `pix_qr_code` e `pix_expiration_date`; a doc oficial também cita um campo `pix` no pedido | | | 6, 7 |
| Y5 | Fuso de `time` e de `pix_expiration_date` | `time` sem fuso, em hora de Brasília | | | 6, 7 |
| Y6 | `cart_token` no pedido | o pedido traz `cart_token` igual ao `token` do carrinho | | | 7 (e 9) |
| Y7 | Pedido feito no admin da Yampi é distinguível? | não sabemos | | | 7 |
| Y8 | Criar e apagar o aviso por API com a credencial do lojista | `POST /webhooks` devolve 201 e `secret_key` de 40 caracteres; `DELETE` devolve 204; a criação é limitada pelo plano da loja | | | 6 |
| Y9 | Assinatura `X-Yampi-Hmac-SHA256` | base64 do HMAC-SHA256 do corpo cru com o `secret_key` | | | 6 |
| Y10 | Listagem da reconciliação: Pix aguardando nas últimas 24 h | `GET /orders` com `date`, `payment_method` e `status_id`; a doc manda a busca filtrada para `/search/orders` e a serialização dos filtros é ambígua | | | 6, 7 |
| Y11 | Listagem da reconciliação: carrinhos das últimas 72 h | `GET /checkout/carts` com filtro `date` (início e fim) e `include`; paginação por `scroll_id` | | | 6 (e 9) |
| Y12 | Como saber que o carrinho virou pedido | `total_transactions` e `last_transaction_status` no carrinho, ou `order.created` com o `cart_token` | | | 7 (e 9) |
| Y13 | `cart.reminder`: quanto depois da última atividade; precisa de celular? | cerca de 3 min depois; candidato, reconferir antes de mandar | | | 7 (e 9) |
| Y14 | Pix que vence: chega algum aviso? o pedido segue aguardando? | nenhum aviso; segue `waiting_payment`; validade padrão de 30 min | | | 7 |
| Y15 | Ordem e repetição dos avisos do mesmo pedido | sem garantia (ordem e reenvio não são documentados) | | | 6, 7 |
| Y16 | Cabeçalhos de limite e limite real | cerca de 60 req/min; a spec manda olhar `X-RateLimit-Remaining` | | | 6 |
| Y17 | `transaction.payment.refused` (se der) | existe; traz `error_message` e `error_code` | | | 6, 7 |
| Y18 | Criar o aviso por API faz a Yampi chamar o nosso endereço? Ela aceita criar um aviso cuja URL responde 401? (o endereço de produção recusa aviso sem assinatura) | plano 6, S11: a criação não depende de um endereço que responda 2xx | | | 6 |
| Y19 | Maior corpo de aviso observado | plano 6, S10: abaixo de 1 MiB | | | 6 |
| Y20 | Como a listagem mostra um aviso desativado; dá para desativar por API? | plano 6, S4: `active: false` ou `disabled_at` preenchido; a doc não lista `active` no corpo do `PUT` | | | 6 |
| Y21 | Leitura barata (`GET /orders?limit=1`), resposta a credencial errada e formato das credenciais | plano 6, S5 a S8: 200 com `data` em lista; 401; token e chave em ASCII imprimível, sem `@` | | | 6 |

## 2. WhatsApp (Evolution)

| ID | Pergunta | Hipótese (spec ou fonte da 2.3.7) | Resultado | Evidência | Planos |
|---|---|---|---|---|---|
| W1 | Versão da Evolution em produção | 2.3.7 | | | 3, 4 |
| W2 | `whatsappNumbers`: 9º dígito e `@lid` | spec: devolve o JID certo e talvez o `@lid`. Fonte: item `{jid, exists, number, name?, lid?}` em que `lid` é só a flag `"lid"`, nunca o valor | | | 3, 4 |
| W3 | Envio a número sem WhatsApp | fonte: o envio chama `whatsappNumber` por dentro e responde 400 com `{jid, exists: false, number}`; o pré-check separado da spec só serviria para gravar o JID | | | 3 |
| W4 | Resposta do envio: `key.id` e `key.remoteJid` | `key.id` do WhatsApp; `remoteJid` no telefone (o JID que o `whatsappNumbers` achou) | | | 3, 4 |
| W5 | `messages.upsert` da resposta de quem nunca falou com o número | fonte: com `remoteJidAlt`, a Evolution troca o `remoteJid` pelo telefone antes de avisar; sem ele, fica `@lid`. `senderPn` não existe na 2.3.7 | | | 4 |
| W6 | `messages.update` (entregue e lida) | `keyId` igual ao `key.id` do envio; `remoteJid` pode vir em `@lid` | | | 4 |
| W7 | Imagem com legenda por URL com assinatura | `POST /message/sendMedia` com `media` = URL | | | 3 |
| W8 | Mídia recebida em base64 | `POST /chat/getBase64FromMediaMessage` com `{message: {key: {id}}}` | | | 4 (e 8) |
| W9 | Formato do erro de envio | o 400 do item W3; o 463 não se provoca, tratar pelo código quando aparecer | | | 3, 4 |
| W10 | Ajustes padrão da instância criada pelo caminho do app | fonte: `rejectCall`, `groupsIgnore`, `alwaysOnline`, `readMessages`, `readStatus`, `syncFullHistory` todos `false` | | | 2, 3 |
| W11 | O envio pela API volta como `messages.upsert` com `fromMe`? e o que se digita no celular do chip? | a spec manda tratar `fromMe` que não saiu da Girumo como "pelo celular" | | | 4 |
| W12 | Quem escreve primeiro: em que JID chega | a spec manda abrir conversa "não identificada" se não casar | | | 4 |
| W13 | Tempos de entrega e leitura; o `DELIVERY_ACK` chega? | a pausa por taxa de entrega (§1.6) depende disso | | | 4 |
| W14 | `date_time` da Evolution × hora de chegada | hora de Brasília rotulada `Z` (medido em 01/10) | | | 4 |
| W15 | Estado do chip no fim da prova | sem restrição | | | 3, 4 |
| W16 | Cada envio gera `SERVER_ACK` no `messages.update`? Qual o `fromMe` do update? | plano 4, E3 e E4: `SERVER_ACK` primeiro e `fromMe: true` | | | 4 |
| W17 | Enviar com `number` = JID (forma do plano 3) funciona? Aparece "digitando…" no celular de quem recebe? | plano 3, E3 e E6: aceita JID; sem `delay` no corpo não sai "digitando" | | | 3 |
| W18 | `key.remoteJidAlt` na resposta do envio; e o caso A, B ou C da resposta | plano 3, E8; plano 4, E1 | | | 3, 4 |

## 3. Regra de casar a resposta (para o plano 4)

**CASO_DA_FASE_0** (definição do plano 4, E1: **A** = o telefone chega no `remoteJid`; **B** = telefone no `remoteJid` e o LID em `remoteJidAlt`; **C** = só `@lid`): …

Marcar o que ocorreu na prova (com a contagem) e escrever a regra que o plano 4 implementa, nesta ordem de prioridade:

1. `remoteJid` em `@s.whatsapp.net`: casar por `app.phone_key`. Ocorreu: …
2. `@lid` com `remoteJidAlt` ou `senderPn`: casar pelo telefone ao lado e guardar o `lid` visto. Ocorreu: …
3. `@lid` sem telefone, mas igual ao `remoteJid` do `messages.update` de uma mensagem nossa: aprender o `lid` no primeiro ack (casa por `keyId` = `provider_message_id`); resposta que chega antes do ack fica "não identificada" e é religada quando o ack chega. Ocorreu: …
4. `@lid` órfão: não há ligação determinística (NO-GO). Ocorreu: …

## 4. Go/no-go do automático

Veredito: …  ·  Saída final do `ligacao.mjs` (só classificações): …

## 5. O que muda em cada plano

- **Plano 3 (envio de DM)** — alimentado por W2, W3, W4, W7, W9, W10, W17 e W18 (as suposições E1 a E8 dele): …
- **Plano 4 (resposta 1:1 e status)** — alimentado por W5, W6, W8, W11 a W14, W16, W18 e pela seção 3 (o `CASO_DA_FASE_0` e as suposições E1 a E5 dele). Primeira tarefa dele: rodar `parseEvolutionWebhook` sobre as fixtures `messages-upsert.privado-*` (a Fase 0 não tem `node_modules`) e ajustar o schema se falhar: …
- **Plano 6 (conexão Yampi)** — alimentado por Y1, Y8 a Y11, Y15, Y16 e Y18 a Y21 (as suposições S1 a S12 dele): …
- **Plano 7 (Pix automático)** — alimentado por Y1 a Y7, Y12 a Y14, Y17 e pelo veredito: …
- **Outros (2, 9 a 11)**: …

## 6. Risco do chip

Pareou sem recusa? Quantas mensagens saíram pela API? O estado final (`estado`)? Houve restrição ou queda (códigos 401/403)? …

## 7. Decisões e limpeza

- Aviso da Yampi da piloto: apagado em … (motivo na seção "Decisões deste plano").
- Instância de teste da Evolution: apagada em … (`apagar`: `instancias_com_esse_nome=0`).
- Bruto, sal e mapa: apagados em … Variáveis de ambiente das abas: limpas.
- Pedidos de teste na Yampi: …
- Ferramentas: remover `infra/scripts/fase0-recuperar/` quando o PR 7 estiver no ar.

## 8. Onde cada suposição dos planos 3, 4 e 6 é respondida

Os planos 3, 4 e 6 abrem com uma conferência da Fase 0 (E1 a E8, E1 a E5 e S1 a S12). Esta tabela diz em que linha deste documento ou em que fixture cada uma se resolve.

| Plano | Suposição | Onde |
|---|---|---|
| 3 | E1 `whatsappNumbers` devolve o JID com ou sem o 9º dígito | W2 |
| 3 | E2 o `lid` do `whatsappNumbers` é só a flag | W2 |
| 3 | E3 envio com `number` = JID; `key.id` igual ao `keyId` do update | W17, W4, W6 |
| 3 | E4 imagem por URL com assinatura | W7 |
| 3 | E5 número sem WhatsApp = 400 com `exists: false` | W3 |
| 3 | E6 sem `delay` não sai "digitando" | W17 |
| 3 | E7 restrição por 429, `rate-overlimit` ou 463 | W9 (não se provoca) |
| 3 | E8 o `@lid` da cliente no envio | W18 |
| 4 | E1 casos A, B ou C da resposta | W5, W18 e a seção 3 |
| 4 | E2 texto em `message.conversation`, legenda em `imageMessage.caption` | W5, W8 |
| 4 | E3 update com `keyId`, `fromMe: true` e `DELIVERY_ACK`/`READ` | W6, W16 |
| 4 | E4 `SERVER_ACK` a cada envio | W16 |
| 4 | E5 o envio pela API não volta como `upsert`; o digitado no celular volta com `fromMe` | W11 |
| 6 | S1, S9 envelope e alias do aviso | fixtures `aviso-*.json` |
| 6 | S2, S12 cabeçalho da assinatura e HMAC recalculado | `cabecalhos-do-aviso.json`, Y9 |
| 6 | S3 criação devolve `data.id` e `data.secret_key` e ecoa os eventos | Y8 |
| 6 | S4 a listagem distingue ativo de desativado | Y20 |
| 6 | S5 a S8 limite, leitura barata, 401 e formato das credenciais | Y16, Y21 |
| 6 | S10, S10b corpo abaixo de 1 MiB | Y19 |
| 6 | S11 a criação não chama (ou aceita 401) o endereço | Y18 |
```

---

### Task 7: Prova da Yampi — aviso, carrinho, links, Pix pendente, listagens e pagamento

**Files:** nenhum arquivo versionado. Preenche as linhas Y1 a Y16, Y18, Y19 e Y21 do resultado (Y17 e Y20 vêm na tarefa 9).

**Interfaces:**
- Consumes: captura no ar e credenciais (tarefa 6); `yampi.mjs`, `redigir.mjs`.
- Produces: no bruto, os avisos reais (`eventos/`) e as respostas da API (`api/`); no resultado, as respostas de Y1 a Y7, Y9 a Y13, Y15, Y16, Y18, Y19 e Y21; um pedido Pix **pendente** (O2) deixado para vencer, cuja hora de criação (T_O2) a tarefa 9 usa.

O roteiro do Igor na loja usa sempre o **e-mail e o telefone B de teste** (são os marcadores). Anotar a hora de relógio (Brasília) de cada ação.

- [ ] **Step 1: Provar o S11 e criar o aviso na Yampi** (Aba B)

Primeiro a prova do plano 6 (S11): o endereço de produção do plano 6 recusa com 401 qualquer aviso sem assinatura, então a pergunta é se a Yampi aceita **criar** um aviso apontando para um endereço assim. A ferramenta cria um aviso cuja URL é a rota `/rejeita` do nosso servidor (que responde 401), espera 5 s e apaga:

```powershell
node infra/scripts/fase0-recuperar/yampi.mjs prova-401
```

Esperado: `prova-401 criar http=201 id=<n>` e `prova-401 apagar http=204 (esperado 204)`; na Aba A, a linha `rota /rejeita chamada (a Yampi bateu aqui); respondi 401` **se** a Yampi testar o endereço na criação. Y18 = (a) a criação com URL que responde 401 deu 201 ou foi recusada, e (b) a Yampi chamou o endereço na criação ou não. Se a criação for recusada (`http=400/422`), o plano 6 precisa de um endereço que aceite a verificação: dizer isso em Y18. Depois, o aviso de verdade:

```powershell
node infra/scripts/fase0-recuperar/yampi.mjs webhook-criar
Invoke-RestMethod http://127.0.0.1:8788/estado
Get-Content (Join-Path $env:FASE0_BRUTO 'ignorados.log') -ErrorAction SilentlyContinue
```

Esperado: `webhook-criar http=201 id=<n> active=true eventos=5 secret_key=40 caracteres (entregue ao servidor local, não gravada)` e `temSegredo True`. O `ignorados.log` mostra só as linhas de hora, nome do evento e tamanho (sem corpo, sem dado pessoal): se aparecer uma chamada logo depois do `webhook-criar`, a Yampi testa o endereço também aqui (Y18). Isso responde Y8 (criação). Se `http=400/403/422`, ler a mensagem: se falar em limite do plano ou permissão, Y8 = "criação por API barrada: <mensagem>" e o resto segue pelo caminho manual: o Igor cria o aviso no painel da Yampi com a URL do campo `yampi` de `urls.json` e os 5 eventos, e, se o painel mostrar a chave secreta, entrega ao servidor sem eco:

```powershell
$s = Read-Host 'chave secreta do aviso' -AsSecureString
$chave = [System.Net.NetworkCredential]::new('', $s).Password
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8788/segredo -Body (@{ segredo = $chave } | ConvertTo-Json)
```

(Nesse caminho o `webhook-apagar` não acha o id; o Igor apaga o aviso pelo painel na tarefa 9.) Qualquer outro erro: parar.

- [ ] **Step 2: S1 — carrinho abandonado** (Igor)

1. Janela anônima, site da loja piloto, **2 peças** no carrinho.
2. Ir ao checkout, preencher o **e-mail de teste e o telefone B** (nome pode ser inventado). Não escolher forma de pagamento, não pagar.
3. Anotar a hora em que saiu (T_saída) e fechar a janela.
4. Esperar. Esperado na Aba A, em poucos minutos: `#001 yampi cart.reminder assinatura=ok … B`. Esperar até 15 min.

Se a `assinatura` vier diferente de `ok`, anotar o valor (`so_hex`, `so_json_reserializado` ou `invalido`): é a resposta de Y9 e o plano 6 não pode confiar na regra da doc. `sem_segredo` não é resposta de Y9: o segredo não chegou ao servidor, então repetir o Step 1. Se não vier nada em 15 min, o Igor confere no painel da Yampi (carrinho abandonado) se o lembrete está ligado e em quanto tempo: Y13 = "não disparou em 15 min" com essa configuração, e o resto da tarefa segue pelas listagens (o carrinho existe na API).

- [ ] **Step 3: Ler o carrinho** (Aba B; a sessão lê a saída e `redigido/`)

```powershell
node infra/scripts/fase0-recuperar/redigir.mjs tudo
Get-Content (Join-Path $env:FASE0_BRUTO 'redigido\_indice.txt')
node infra/scripts/fase0-recuperar/redigir.mjs achar 'phone|updated_at|created_at|  time = '
```

Esperado: `redigidos: 1 avisos e 4 respostas de API…` (as 4 são `limite-cabecalhos`, `credenciais-formato`, `erro-401` e `webhook-criado`), a linha `001	yampi	cart.reminder	…	assinatura=ok	… B` no índice e as linhas `resource.customer.data.phone.…`. Responder:

- **Y1:** quais campos o telefone tem, tamanhos (`full_number` com 10/11/13 dígitos? vem o 55?), se há campo formatado.
- **Y13:** atraso = (hora de chegada do índice, em UTC, menos 3 h) menos T_saída. Os dias estão deslocados, mas hora do dia e fuso ficam.
- **Y5 (parte):** `time` do envelope × hora de chegada: se `time` ≈ chegada − 3 h, é hora de Brasília.

- [ ] **Step 4: S2 — links do carrinho** (Aba B + Igor)

```powershell
node infra/scripts/fase0-recuperar/redigir.mjs achar 'https?://'
```

A saída lista os campos de URL do `cart.reminder` já mascarados (a sessão vê host-classe, rota e nomes de parâmetro). Para cada candidato, na ordem **`unauth_simulate_url`, `purchase_url` (se existir), `simulate_url`** (este por último, só para confirmar que loga), o Igor copia e abre:

```powershell
node infra/scripts/fase0-recuperar/yampi.mjs copiar-link 1 resource.unauth_simulate_url
```

Esperado: `link copiado para a área de transferência (N caracteres; não impresso).` O Igor cola numa **janela anônima nova** e responde: (a) abriu o carrinho com as 2 peças? (b) pediu login ou cadastro? (c) apareceu logado como ele? Fechar a janela a cada teste. Registrar em Y2 a resposta por campo, com data e hora do teste. Se **nenhum** abrir o carrinho sem login, Y2 = "nenhum link seguro": consequência na seção 5 do resultado (o link só vai pelo chat manual).

- [ ] **Step 5: S3 — o mesmo carrinho vira pedido com Pix** (Igor)

Na janela anônima, abrir o link que funcionou, seguir o checkout com o mesmo e-mail e telefone B e escolher **Pix**. Parar na tela do Pix (o QR aparece). **Não pagar.** Anotar T_pedido. Esperado na Aba A: `#002 yampi order.created assinatura=ok …` (pode vir também um `order.status.updated`). Se o link não abriu o carrinho, refazer as 2 peças e o checkout do zero: Y6 fica "não aplicável: pedido sem passar pelo carrinho do lembrete".

- [ ] **Step 6: Ler o pedido Pix** (Aba B + sessão)

```powershell
node infra/scripts/fase0-recuperar/redigir.mjs tudo
Get-Content (Join-Path $env:FASE0_BRUTO 'redigido\_indice.txt')
node infra/scripts/fase0-recuperar/redigir.mjs achar '= 000201'
node infra/scripts/fase0-recuperar/redigir.mjs achar 'pix|alias = |is_pix'
node infra/scripts/fase0-recuperar/redigir.mjs achar 'token|https?://'
```

A sessão também lê `redigido/002-yampi-order.created.json`. Responder:

- **Y4:** o caminho exato que contém o EMV (a primeira busca mostra o caminho e o início `000201`), o tamanho, onde está `pix_expiration_date` e o formato dela; se existe também um campo `pix` no pedido.
- **Y5:** `pix_expiration_date` menos `time` (esperado +30 min se o mesmo fuso) e `time` × chegada, como no Step 3. Se `pix_expiration_date` tiver `Z` ou `-03:00`, o fuso vem escrito.
- **Y6:** o valor mascarado de `resource.token` do `cart.reminder` (arquivo `001-…`) aparece em algum campo do pedido? (a máscara é igual para o mesmo original) Procurar com `achar '<valor mascarado>'`. Se aparecer, Y6 = confirmado e o caminho do campo é o do resultado.
- **Y3:** os campos de URL do pedido (terceira busca). Para cada um, `copiar-link 2 <caminho>` e o mesmo teste em janela anônima do Step 4: é um link do pedido sem login embutido?
- **Y15:** a ordem de chegada de `order.created` e `order.status.updated` no índice.

- [ ] **Step 7: S4 — as listagens com o Pix ainda pendente** (Aba B)

```powershell
node infra/scripts/fase0-recuperar/yampi.mjs pedido 2
node infra/scripts/fase0-recuperar/yampi.mjs pedidos-1
node infra/scripts/fase0-recuperar/yampi.mjs pedidos-pix
node infra/scripts/fase0-recuperar/yampi.mjs carrinhos
```

Esperado (formas): `pedido 2 http=200 … gravado status=waiting_payment` e `pedido 2-transacoes http=200 … gravado`; `pedidos-1 http=200 … gravado (o pedido mais novo é do teste)` (a leitura barata do teste de conexão do plano 6, Y21; se vier `NÃO gravado`, um cliente de verdade comprou no meio: repetir logo em seguida); três linhas `lista-pedidos variante=… http=… total=… baixados=… do_teste=…` (cada uma seguida de `pedido de teste: status=waiting_payment pix=true` quando `do_teste=1`); duas linhas `lista-carrinhos variante=…` com a linha `carrinho de teste: total_transactions=… last_transaction_status=… unauth_simulate_url=… simulate_url=…`. Como ler:

- **Y10:** a variante que serve é a primeira com `http=200`, `do_teste=1` **e** `total` menor que o da `sem-filtro` (prova que o servidor filtrou). Se `plana` e `filters` derem 400 ou o mesmo `total` da `sem-filtro`, a reconciliação lista sem filtro e filtra no cliente por data e status; anotar `baixados` (volume das últimas páginas) e quantas páginas de 100 foram.
- **Y11:** idem para `tres-dias`, com `do_teste=1`.
- **Y12:** a linha do carrinho de teste: o carrinho que acabou de virar pedido mostra `total_transactions` ≥ 1 ou `last_transaction_status` preenchido? Se sim, a API responde "virou pedido" sem depender do `cart_token`.
- Rodar `redigir.mjs tudo` e ler `redigido/api-pedido-seq002*.json`: o código Pix também vem pela API (`achar '= 000201'` de novo)? Anotar em Y4.

- [ ] **Step 8: S5 — pagar o Pix** (Igor)

Pagar o Pix do pedido (valor simbólico). Esperado na Aba A: `#003 yampi order.paid …` e `#004 yampi order.status.updated …`. Rodar `redigir.mjs tudo` e ler o índice: Y15 completo (ordem, repetição). Confirmar que `order.paid` chegou com `assinatura=ok`.

- [ ] **Step 9: Deixar um segundo Pix vencer** (Igor)

Fazer outro pedido com Pix na loja, **sem pagar**, e anotar T_O2. A tarefa 9 mede o que acontece depois do vencimento; esse tempo corre enquanto a tarefa 8 (WhatsApp) é feita.

- [ ] **Step 10: Preencher o resultado**

Preencher as linhas Y1 a Y7 (parte), Y9 a Y13, Y15 e Y16 do esqueleto, cada uma com Resultado e Evidência (comando e arquivo redigido). Não commitar.

---

### Task 8: Prova do WhatsApp — pareamento, envio, resposta, status, mídia e erro

**Files:** nenhum arquivo versionado. Preenche W1 a W18 e a seção 3 do resultado.

**Interfaces:**
- Consumes: captura no ar e credenciais; `evolution.mjs`, `ligacao.mjs`, `redigir.mjs`.
- Produces: a instância `fase0-recuperar-<data>` na Evolution de produção (apagada na tarefa 11), os eventos 1:1 reais no bruto, o veredito `GO | NO-GO | INCONCLUSIVO`.

Papéis: **B** nunca falou com o chip (recebe primeiro e responde); **C** escreve primeiro. Com `FASE0_FRASES` as mensagens abaixo são mantidas legíveis no redigido, então o Igor digita **exatamente** o texto indicado.

- [ ] **Step 1: Criar a instância e parear por código** (Aba B; Igor no celular do chip)

O Igor deixa o WhatsApp do chip na tela de digitar o código (Aparelhos conectados › Conectar um aparelho › **Conectar com número de telefone**) e só então a Aba B roda:

```powershell
node infra/scripts/fase0-recuperar/evolution.mjs criar
node infra/scripts/fase0-recuperar/evolution.mjs webhook
```

Esperado: `criar http=201 instancia=fase0-recuperar-AAAAMMDD pairingCode=XXXX-XXXX`, a linha `ajustes que o app também recebe por padrão: {…}` e `webhook http=201 eventos=QRCODE_UPDATED,CONNECTION_UPDATE,MESSAGES_UPSERT,MESSAGES_UPDATE,SEND_MESSAGE`. O Igor digita o código no chip. Se vier `pairingCode=(ausente: rode conectar)`, rodar `evolution.mjs conectar` e digitar o código que ele imprimir. Pontos de parada 3 e 4 valem daqui em diante.

- [ ] **Step 2: Conferir a conexão e os ajustes** (Aba B)

```powershell
node infra/scripts/fase0-recuperar/evolution.mjs estado
node infra/scripts/fase0-recuperar/evolution.mjs config
```

Esperado: `estado conexao=open connectionStatus=open dono_conectado=true disconnectionReasonCode=- …` e `config http=200 {"rejectCall":false,…,"readMessages":false,…}`. **W10:** se algum ajuste vier `true` (principalmente `readMessages`), é achado: o plano 2 precisa criar a instância de privado com ele `false` (marcar como lida é proibido por `DECISIONS.md`). Na Aba A devem ter aparecido `connection.update` e `qrcode.updated`.

- [ ] **Step 3: W2/W3 — `whatsappNumbers`** (Aba B)

```powershell
node infra/scripts/fase0-recuperar/evolution.mjs numeros B B-SEM9 C C-SEM9 invalido
```

Esperado (formas): `numeros http=200` e uma linha por rótulo com `exists=…`, `jid=@s.whatsapp.net` ou `@lid`, o número de dígitos do JID × o enviado, `jid_igual_ao_enviado=…`, `lid=…`. Registrar em W2: o JID devolvido para `B` e `B-SEM9` é o mesmo? (o 9º dígito resolve para o JID real?) vem `@lid` ou só a flag `lid`? `invalido` deve vir `exists=false`.

- [ ] **Step 4: W12 — C escreve primeiro** (Igor)

No celular C, abrir conversa com o número do chip e mandar **`Ola, teste da Fase 0`**. Esperado na Aba A: `#… evo messages.upsert assinatura=n/a …`.

- [ ] **Step 5: W4 — primeiro envio, para B** (Aba B)

```powershell
node infra/scripts/fase0-recuperar/evolution.mjs texto B "Teste 1 da Fase 0"
```

Esperado: `texto http=201 key.id=<n> caracteres key.remoteJid=@s.whatsapp.net key.remoteJidAlt=ausente igual_ao_destino=true status=PENDING` (ou `@lid`, `key.remoteJidAlt` presente, `false`: o que for é achado, W4 e W18). O Igor olha o celular B **enquanto a mensagem chega** e anota se apareceu "digitando…" antes dela (esperado: não; é W17/E6, porque o corpo não leva `delay`). O Igor, no celular B, abre a mensagem (ticks azuis; se os recibos de leitura do B estiverem desligados, o `READ` não chega, e isso vai para W13). Esperar 60 s e rodar:

```powershell
node infra/scripts/fase0-recuperar/ligacao.mjs
```

Esperado: a linha `envio para B: entrega=<s> s, leitura=<s> s, status_vistos=[SERVER_ACK,DELIVERY_ACK,READ] fromMe_no_update=[true]` (W13 e W16: se faltar `SERVER_ACK`, o plano 4 precisa de outro gatilho para a taxa de entrega), `messages.update de mensagens nossas (casados por keyId): x/y` (W6: `x` zero com `y` maior que zero quer dizer que o `keyId` do update **não** é o `key.id` do envio, e é ponto de parada para o plano 4), a de C do Step 4 com `responde_a_envio=false` e `VEREDITO: INCONCLUSIVO` (normal até haver 3 respostas). Na Aba A: `messages.update` e `send.message`.

- [ ] **Step 6: W5/W6 — B responde** (Igor)

No celular B, responder **`Oi, recebi sim`**. Rodar `ligacao.mjs` de novo. Esperado: uma linha nova de B com `via=…` (a ligação), `ack_antes=…`, `alt=…` (o que veio ao lado: `telefone`, `lid` ou `-`), `addressingMode=…` e `key=[…]` (nomes dos campos da `key`). Anotar em W5 o `via`, o `alt` e o `addressingMode`, e na seção 3 o **`CASO_DA_FASE_0`**: A (`via=telefone_direto` e `alt=-` ou `telefone`), B (`via=telefone_direto` e `alt=lid`) ou C (`via=lid_*`).

- [ ] **Step 7: W8 — B manda foto e áudio** (Igor + Aba B)

No celular B, mandar **uma foto** e **um áudio curto** (gravado na hora) para o chip. Depois:

```powershell
node infra/scripts/fase0-recuperar/evolution.mjs midia imagem
node infra/scripts/fase0-recuperar/evolution.mjs midia audio
```

Esperado: `midia imagem http=201 mediaType=imageMessage mimetype=image/jpeg base64=<n> caracteres magic=ffd8ffe0` (ou `ffd8ffe1`) e `midia audio … mimetype=audio/ogg; codecs=opus … magic=4f676753`. Se o `http` for 400, o `message.key.id` sozinho não bastou: anotar o corpo do erro (`api/base64-*.json`) e tentar com a mensagem inteira antes de concluir W8.

- [ ] **Step 8: Segundo envio, agora para C, com o `number` em forma de JID** (Aba B; esperar ≥ 40 s desde o envio anterior)

```powershell
node infra/scripts/fase0-recuperar/evolution.mjs texto C "Teste 2 da Fase 0" --jid
```

Esperado: `texto (number=jid) http=201 key.id=… key.remoteJid=… key.remoteJidAlt=… status=PENDING`. É a forma que o plano 3 pretende usar (o `number` do envio é o JID que o `whatsappNumbers` devolveu); o primeiro envio, para B, foi com os dígitos. Se a Evolution recusar o JID no `number`, W17 = "só aceita dígitos" e o plano 3 manda dígitos. No celular C, ler e responder **`quem e voce?`**. Rodar `ligacao.mjs`.

- [ ] **Step 9: W7 — imagem com legenda por URL com assinatura, para B** (Aba B; ≥ 40 s depois)

```powershell
node infra/scripts/fase0-recuperar/evolution.mjs imagem B "Teste de imagem da Fase 0"
```

Esperado: `imagem http=201 key.id=… status=PENDING`; na Aba A, a linha `imagem servida (GET /img): quem baixou foi a Evolution, pela URL com assinatura`. O Igor confirma no celular B: a imagem "Teste Fase 0" chegou, com a legenda. No celular B, responder **`SAIR`**. Rodar `ligacao.mjs`.

- [ ] **Step 10: W9 — número que não existe** (Aba B)

```powershell
node infra/scripts/fase0-recuperar/evolution.mjs texto-invalido
```

Esperado: `texto-invalido http=400 chaves=…` (corpo em `api/envio-numero-inexistente.json`). Ninguém recebe mensagem: o número tem DDD 00 e a ferramenta só envia depois de `whatsappNumbers` dar `exists:false`.

- [ ] **Step 11: W11 — "pelo celular"** (Igor)

No próprio WhatsApp do chip (o aplicativo, não a API), abrir a conversa com B e digitar **`Teste do celular do chip`**. Rodar `ligacao.mjs`: a linha `eco do envio como messages.upsert fromMe: x/y | mensagens "pelo celular": z` responde W11 (x/y: quantos envios pela API voltaram como upsert `fromMe`; z: a digitada no celular).

- [ ] **Step 12: Veredito e rodadas de reforço**

```powershell
node infra/scripts/fase0-recuperar/ligacao.mjs
node infra/scripts/fase0-recuperar/evolution.mjs estado
```

Esperado: a última linha `VEREDITO: GO (… respostas a envios nossos, 0 sem ligação determinística)` e `estado` ainda `open`. Se vier `INCONCLUSIVO` (menos de 3 respostas a envios nossos), fazer uma rodada de reforço — `texto B "Teste 1 da Fase 0"` (≥ 40 s depois do anterior), B responde `Oi, recebi sim` — e rodar o `ligacao` de novo; no máximo 2 rodadas (o teto de 6 envios da fase). Se vier `NO-GO`, **parar de enviar**: a tarefa 10 explica o que fazer. Rodar `redigir.mjs tudo` e ler os `messages.*` em `redigido/` para W5, W6, W11, W12 e W14 (`date_time` do envelope × a hora de chegada do índice).

- [ ] **Step 13: Preencher o resultado**

Preencher W1 a W18 e a seção 3 (o `CASO_DA_FASE_0` e qual das quatro ligações ocorreu, quantas vezes). Se o chip caiu ou restringiu durante a prova, W15 e a seção 6 dizem quando, depois de quantas mensagens e com que código.

---

### Task 9: Yampi, parte 2 — Pix vencido, pedido do admin e fim do aviso

**Files:** nenhum arquivo versionado. Preenche Y7, Y14, Y17, Y19 e Y20 do resultado.

**Interfaces:**
- Consumes: T_O2 (tarefa 7, Step 9) e a captura no ar.
- Produces: o aviso da Yampi **apagado** e confirmado; as respostas de Y7, Y14 e Y17.

- [ ] **Step 1: Y14 — o que aconteceu com o Pix que venceu** (Aba B; só depois de 35 min de T_O2, ou da validade medida em Y4 mais 5 min)

```powershell
node infra/scripts/fase0-recuperar/redigir.mjs tudo
Get-Content (Join-Path $env:FASE0_BRUTO 'redigido\_indice.txt')
node infra/scripts/fase0-recuperar/yampi.mjs pedido <seq do order.created do segundo Pix>
```

Esperado: o `pedido … gravado status=…` mostra o estado depois do vencimento. Responder Y14: chegou algum aviso depois do vencimento (linhas no índice com hora de chegada maior que `pix_expiration_date` do O2)? O pedido continua `waiting_payment`? A validade real foi `pix_expiration_date − time` (30 min?).

- [ ] **Step 2: Y7 — pedido feito no admin** (Igor)

No painel da Yampi, criar um pedido manual para o cliente de teste (e-mail de teste), 1 peça, pagamento Pix, e anotar a hora. Esperado na Aba A: `#… yampi order.created assinatura=ok …`. Depois:

```powershell
node infra/scripts/fase0-recuperar/redigir.mjs tudo
$red = Join-Path $env:FASE0_BRUTO 'redigido'
Compare-Object (Get-Content "$red\002-yampi-order.created.json") (Get-Content "$red\<arquivo do pedido do admin>.json") | Select-Object -First 80
```

A máscara é igual para o mesmo original, então as linhas que sobram na comparação são diferenças de verdade (ids, datas, campos que só existem de um lado). Y7 = "distinguível por `<campo>`" ou "indistinguível: só mudam ids e datas".

- [ ] **Step 3: Y17 — pagamento recusado (só se der)**

Só se o Igor tiver um jeito seguro e sem custo de recusar um pagamento (cartão de teste do gateway). Se tiver, fazer um pedido recusado e conferir `transaction.payment.refused` com `assinatura=ok`. Se não, Y17 = `não provado: sem como recusar um pagamento sem custo`.

- [ ] **Step 4: Y20 e o fim do aviso — listar, tentar desativar, listar de novo, apagar** (Aba B; decisão do plano: apagar)

```powershell
node infra/scripts/fase0-recuperar/yampi.mjs webhook-listar ativo
node infra/scripts/fase0-recuperar/yampi.mjs webhook-desativar
node infra/scripts/fase0-recuperar/yampi.mjs webhook-listar desativado
node infra/scripts/fase0-recuperar/yampi.mjs webhook-apagar
node infra/scripts/fase0-recuperar/yampi.mjs webhook-listar
```

Esperado: a primeira lista mostra uma linha `… girumo-fase0-recuperar  active=true  disabled_at=não … <- da Fase 0` (o aviso nunca falhou nem foi desativado: a captura respondeu 200 a tudo; se vier `active=false` ou `disabled_at=sim` aqui, o aviso caiu durante a prova: anotar em Y8/Y9 por quê). O `webhook-desativar` é uma **tentativa** (`PUT` com `active: false`, que a doc não lista no corpo): `active_depois=false` e a segunda lista com `active=false` e `disabled_at=sim` dão, pela primeira vez, a forma real de um aviso desativado (Y20, fixture `webhooks-lista-desativado.json`); `active_depois=true` ou `http=400/422` quer dizer que não dá para desativar por API, e Y20 = "forma de aviso desativado só pela doc (`active`/`disabled_at`); sem fixture" (o plano 6 espera uma listagem com um ativo e um desativado e precisa ser avisado). Depois, `webhook-apagar http=204 (esperado 204)` e a última lista **sem nenhuma** linha `<- da Fase 0`. A partir daqui a Yampi não manda mais nada ao túnel.

- [ ] **Step 5: Pedidos de teste na loja**

O Igor cancela no painel da Yampi os pedidos sem pagamento (o Pix vencido e o do admin) e decide o do Pix pago (estornar ou manter). A sessão não faz nada aqui; só anota o combinado na seção 7 do resultado.

- [ ] **Step 6: Preencher o resultado**

Y7, Y14, Y17, Y20 e as observações de Y8/Y9 desta tarefa. Y19 (maior corpo de aviso) sai do `redigir.mjs tudo` ("Maior corpo de aviso: N B") rodado depois do último aviso; os planos 6 esperam menos de 1 MiB.

---

### Task 10: Veredito e resultado

**Files:**
- Modify: `docs/superpowers/plans/_recuperar-fase-0-resultado.md`

**Interfaces:**
- Consumes: as linhas já preenchidas (tarefas 7 a 9) e a saída final de `ligacao.mjs`.
- Produces: o resultado completo e conferido, com o veredito escrito e o que cada plano muda.

- [ ] **Step 1: Escrever o veredito (seção 4) com esta tabela**

| Resultado de `ligacao.mjs` | Decisão |
|---|---|
| `GO`: 3 ou mais respostas a envios nossos, nenhuma órfã | o automático pode ligar; os planos 3, 4 e 7 seguem com a regra da seção 3 |
| `NO-GO`: alguma resposta em `@lid` sem ligação | **parar e avisar o Igor** (mensagem abaixo). O automático não liga: sem casar a resposta, o caso não para quando ela responde e o SAIR não é garantido (spec §3). O que segue sem o automático (modo manual: fila + chat com a conversa "não identificada" e o botão de vincular) é decisão dele, não desta fase |
| `INCONCLUSIVO` depois de 2 rodadas de reforço | tratar como `NO-GO` e dizer na mensagem que a amostra foi pequena |

Se o veredito for `NO-GO` ou `INCONCLUSIVO`, a sessão **para por aí** quanto ao produto, manda esta mensagem ao Igor (completando os números) e segue só com a limpeza da tarefa 11:

> Fase 0: **NO-GO do automático.** Das N respostas a mensagens nossas, K chegaram em `@lid` sem telefone e sem ligação por `messages.update` nem pelo retorno do envio. Sem isso o caso não para quando ela responde e o SAIR não é garantido. Detalhe e evidência em `docs/superpowers/plans/_recuperar-fase-0-resultado.md`. Os PRs 7 a 11 esperam a sua decisão; o resto da Fase 0 (Yampi) está respondido e não depende disso.

- [ ] **Step 2: Aplicar as consequências da Yampi (seção 5) com esta tabela**

| Achado | Consequência para os planos |
|---|---|
| Aviso criado por API (201 + `secret_key`) | plano 6 conecta como a spec |
| Criação barrada (limite do plano ou permissão) | plano 6 muda o passo 3 de "Conectar a Yampi": guia o lojista a criar o aviso no painel e colar a chave; o `secret_key` entra no formulário |
| HMAC fora da regra da doc | plano 6 não pode confiar na assinatura até resolver; usar a variante que `veredictoAssinatura` indicou |
| Código Pix não vem no aviso nem na API | P1 do plano 7 vai com o link do pedido (a spec já prevê) |
| Nenhum link abre o carrinho sem login | o link só vai pelo chat manual; a C2 e a resposta com link do plano 9 ficam sem link automático; avisar o Igor |
| `cart_token` ausente no pedido | "carrinho virou pedido" passa a depender de `total_transactions`/`last_transaction_status` ou de casar por telefone e período (plano 7/9) |
| Pix vencido sem aviso e pedido segue `waiting_payment` | confirma o P-venceu da spec; o agendador precisa do vencimento calculado, não de evento |
| Listagem só funciona sem filtro | a reconciliação (plano 6) pagina e filtra no cliente; o custo em chamadas entra no orçamento de ~60 req/min |
| `prova-401`: a Yampi recusou criar aviso com URL que responde 401, ou chamou o endereço esperando 2xx | o plano 6 precisa de um endereço que aceite a verificação da criação (S11 falha: é ponto de parada dele); levar ao Igor |
| Não dá para desativar aviso por API | a fixture de aviso desativado não existe; o S4b do plano 6 pula e o `active`/`disabled_at` fica pela doc (anotar em Y20) |
| Cabeçalhos de limite ausentes ou com outro nome | o plano 6 não pode ler `x-ratelimit-remaining` (S5 dele): conta as próprias chamadas por minuto |

- [ ] **Step 3: Preencher "O que muda em cada plano" (seção 5), "Risco do chip" (seção 6) e a data e a versão do cabeçalho**

Para cada plano (3, 4, 6, 7), escrever as mudanças concretas (campo, caminho, regra) ou `nada muda`. Cada mudança cita o ID da linha de onde vem.

- [ ] **Step 4: Conferir que o resultado não tem dado pessoal** (Aba B)

```powershell
node infra/scripts/fase0-recuperar/redigir.mjs conferir "$wt\docs\superpowers\plans\_recuperar-fase-0-resultado.md"
```

Esperado: `ok: 1 arquivo(s) sem dado real.` Qualquer `VAZAMENTO`: reescrever o trecho sem o valor (referenciar pelo ID da fixture) e repetir.

---


### Task 11: Fixtures, limpeza e PR do resultado

**Files:**
- Create: `apps/web/src/lib/yampi/__fixtures__/` (16 a 18 arquivos, conforme Y17 e Y20; diretório novo)
- Create: `apps/web/src/lib/evolution/__fixtures__/` (17 arquivos novos, junto das 7 que já existem)
- Create: `docs/superpowers/plans/_recuperar-fase-0-resultado.md`
- Modify (só se a prova mostrou defeito): `infra/scripts/fase0-recuperar/*`, como `fix(recuperar): …`

**Interfaces:**
- Consumes: `redigido/` completo, o resultado preenchido (tarefa 10).
- Produces: as fixtures com **estes nomes** (os planos 3, 4, 6 e 7 se referem a elas por nome; os planos 4 e 6 já fixaram os nomes das suas, e os de baixo são os deles; se a Fase 0 precisar de outro nome, renomear com `git mv` e registrar a troca na seção 8 do resultado), o PR do resultado mergeado, o ambiente limpo.

Fixtures da Yampi (`apps/web/src/lib/yampi/__fixtures__/`), com a origem em `redigido/`. As 12 primeiras são as que o plano 6 abre na Task 1 dele:

- `aviso-cart-reminder.json` ← o `cart.reminder` do S1.
- `aviso-order-created.json` ← o 1º `order.created` (Pix pendente, S3).
- `aviso-order-paid.json` ← o `order.paid` do S5.
- `aviso-order-status-updated.json` ← o 1º `order.status.updated` do S3 ou do S5, o que trouxer `waiting_payment` → `paid`.
- `cabecalhos-do-aviso.json` ← `NNN-yampi-order.created.cabecalhos.json` (os cabeçalhos do mesmo `order.created`; a assinatura continua com o formato base64 de 44 caracteres, mas já não é a real: o corpo mudou).
- `webhook-criado.json` ← `api-webhook-criado.json`.
- `webhooks-lista.json` ← `api-webhooks-lista-ativo.json`.
- `webhooks-lista-desativado.json` ← `api-webhooks-lista-desativado.json`, só se a tentativa de desativar deu `active=false` (Y20). A Fase 0 só consegue os dois estados em arquivos separados do mesmo aviso (o mesmo id não está ativo e desativado ao mesmo tempo): o plano 6 lê os dois (S4 e S4b), e isso vai no resultado.
- `pedidos-1.json` ← `api-pedidos-1.json`.
- `erro-401.json` ← `api-erro-401.json`.
- `limite-cabecalhos.json` ← `api-limite-cabecalhos.json`.
- `credenciais-formato.json` ← `api-credenciais-formato.json`.

Mais as do plano 7:

- `aviso-order-created-admin.json` ← o `order.created` do pedido do admin (Y7).
- `aviso-transaction-payment-refused.json` ← só se Y17 foi provado.
- `pedido-detalhe.json` ← `api-pedido-seqNNN.json` do Pix do S3.
- `pedido-transacoes.json` ← `api-pedido-seqNNN-transacoes.json` do mesmo pedido.
- `pedidos-pix-lista.json` ← `api-lista-pedidos-<variante que serve>.json` (`plana`, `filters` ou `sem-filtro`, conforme Y10).
- `carrinhos-lista.json` ← `api-lista-carrinhos-<variante>.json` (Y11).

Fixtures da Evolution (`apps/web/src/lib/evolution/__fixtures__/`). Achar a origem com `redigir.mjs achar '<padrão>'` (as frases de teste ficam legíveis). As cinco primeiras são as que o plano 4 abre na Task 1 dele:

- `messages-upsert.privado-resposta.json` ← `achar 'conversation = Oi, recebi sim'` (o arquivo `*-evo-messages.upsert.json`).
- `messages-upsert.privado-celular.json` ← `achar 'conversation = Teste do celular do chip'`.
- `messages-upsert.privado-imagem.json` ← o `messages.upsert` com `imageMessage` (não o envio da imagem).
- `messages-update.privado-entregue.json` ← `achar 'status = DELIVERY_ACK'` (o primeiro).
- `messages-update.privado-lida.json` ← `achar 'status = READ'` (o primeiro).

Mais as extras (planos 3 e 4):

- `messages-update.privado-servidor.json` ← `achar 'status = SERVER_ACK'` (o primeiro; é o E4 do plano 4).
- `messages-upsert.privado-primeiro-contato.json` ← `achar 'conversation = Ola, teste da Fase 0'` (C, antes de qualquer envio).
- `messages-upsert.privado-recusa.json` ← `achar 'conversation = quem e voce'`.
- `messages-upsert.privado-sair.json` ← `achar 'conversation = SAIR'`.
- `messages-upsert.privado-audio.json` ← o `messages.upsert` com `audioMessage`.
- `send-message.privado.json` ← o arquivo `*-evo-send.message.json` do primeiro envio.
- `whatsapp-numbers.privado.json` ← `api-numeros-*.json` do Step 3 da tarefa 8 (o com 5 itens).
- `send-text.privado.json` ← `api-envio-texto-*.json` (o primeiro).
- `send-text.privado-sem-whatsapp.json` ← `api-envio-numero-inexistente.json`.
- `send-media.privado.json` ← `api-envio-imagem-*.json`.
- `get-base64.privado-imagem.json` ← `api-base64-imagem.json` (o `base64` já vem como `[REDIGIDO len=…]`).
- `get-base64.privado-audio.json` ← `api-base64-audio.json`.

Os valores falsos que a máscara põe (`5511999990001` o chip, `5511999990002` o B, `5511999990003` o C) seguem a convenção das fixtures antigas. O plano 4 troca depois os que quiser pelos dele (`5511987650001`, `100000000000777@lid`, "Ana Teste"); isso é com ele.

- [ ] **Step 1: Redigir tudo de novo, com a captura completa** (Aba B)

```powershell
node infra/scripts/fase0-recuperar/redigir.mjs tudo
Get-ChildItem (Join-Path $env:FASE0_BRUTO 'redigido') | Select-Object Name, Length | Format-Table -AutoSize
```

Esperado: `redigidos: N avisos e M respostas de API. … Maior corpo de aviso: N B.` (o maior corpo é o Y19) e a lista de arquivos de `redigido/` (a sessão lê a lista e escolhe as origens da tabela acima).

- [ ] **Step 2: Copiar as fixtures** (Aba B; a sessão entrega o bloco com os nomes de origem reais)

```powershell
$wt = 'C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\fase0-recuperar'
$red = Join-Path $env:FASE0_BRUTO 'redigido'
$yampi = "$wt\apps\web\src\lib\yampi\__fixtures__"
$evo = "$wt\apps\web\src\lib\evolution\__fixtures__"
New-Item -ItemType Directory -Force $yampi | Out-Null
function Pegar([string]$Origem, [string]$Destino) { Copy-Item (Join-Path $red $Origem) $Destino -ErrorAction Stop }
Pegar '001-yampi-cart.reminder.json' "$yampi\aviso-cart-reminder.json"
Pegar '002-yampi-order.created.cabecalhos.json' "$yampi\cabecalhos-do-aviso.json"
# … uma linha Pegar por fixture das duas listas acima, com a origem lida do índice
```

Esperado: nenhum erro (`-ErrorAction Stop` para na primeira origem que não existir). `Copy-Item` copia os bytes como estão, em UTF-8 sem BOM; **não** regravar fixture por `Set-Content`/`ConvertTo-Json` do PowerShell 5.1, que põe BOM e quebra o `JSON.parse` dos testes dos planos 4 e 6.

- [ ] **Step 3: Validar o JSON e conferir vazamento — fixtures e resultado** (Aba B)

```powershell
Get-ChildItem "$yampi\*.json", "$evo\*privado*.json" | ForEach-Object { Get-Content $_.FullName -Raw | ConvertFrom-Json | Out-Null }
node infra/scripts/fase0-recuperar/redigir.mjs conferir $yampi $evo "$wt\docs\superpowers\plans\_recuperar-fase-0-resultado.md"
```

Esperado: o `ConvertFrom-Json` sem nenhum erro; `ok: N arquivo(s) sem dado real.` (o `conferir` também varre as 7 fixtures antigas da Evolution, que já eram limpas). **Qualquer `VAZAMENTO` é ponto de parada 5.**

- [ ] **Step 4: Conferência humana** (Igor)

O Igor abre `aviso-order-created.json`, `aviso-cart-reminder.json` e `messages-upsert.privado-imagem.json` e procura a olho o que a máquina não sabe que é dele. Depois responde, quando o comando perguntar, o **nome, o CPF e o CEP** que usou nos checkouts de teste e o do endereço da loja (a pergunta é `Read-Host`, então nada disso vai para o histórico do PowerShell):

```powershell
$termos = (Read-Host 'nome, CPF e CEP dos testes, separados por virgula') -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }
Select-String -Path "$yampi\*.json", "$evo\*privado*.json" -Pattern $termos -SimpleMatch | Measure-Object
```

Esperado: `Count : 0`. Se achar, é ponto de parada 5.

- [ ] **Step 5: Commit local — fixtures e resultado em commits separados**

```powershell
git -C $wt add apps/web/src/lib/yampi apps/web/src/lib/evolution
git -C $wt diff --cached --stat
git -C $wt commit -m "test(recuperar): redacted real Yampi and Evolution 1:1 payload fixtures" -m "Co-Authored-By: <assistente em uso> <noreply@anthropic.com>"
git -C $wt add docs/superpowers/plans/_recuperar-fase-0-resultado.md
git -C $wt diff --cached --stat
git -C $wt commit -m "docs(recuperar): phase 0 result and go/no-go" -m "Co-Authored-By: <assistente em uso> <noreply@anthropic.com>"
git -C $wt status --short
```

Esperado: o `--stat` do primeiro commit lista só arquivos em `__fixtures__/`; o do segundo, só o resultado; `status --short` vazio. (Se a prova mostrou defeito de ferramenta, o conserto entra num `fix(recuperar): …` antes desses dois.)

- [ ] **Step 6: Revisão independente das fixtures e do resultado**

Despachar o agente **Security Engineer** com o diff e as perguntas:

> Revise `git -C C:\Users\Igor\Desktop\HubFlow-platform\.claude\worktrees\fase0-recuperar diff origin/main...HEAD`. São fixtures de payloads reais da Yampi e da Evolution já redigidas, mais um documento de resultado, para um repositório público. Procure por severidade: dado que pareça pessoal ou real (nome, CPF/CNPJ, telefone, e-mail, endereço, CEP, texto livre de cliente), identificador da loja (alias, domínio, nome), URL com token, segredo ou credencial, código Pix inteiro, miniatura de foto em bytes. Diga em que arquivo e caminho (sem copiar o valor).

Esperado: nada CRITICAL/HIGH. Se achar, voltar ao Step 1 (o bruto ainda existe), corrigir o redator com teste, regerar e recommitar.

- [ ] **Step 7: Limpeza** (só depois do Step 6 limpo, porque a partir daqui o bruto some)

Aba B, ainda com o ambiente carregado:

```powershell
$u = Get-Content (Join-Path $env:FASE0_BRUTO 'urls.json') -Raw | ConvertFrom-Json
$publica = $u.publica
node infra/scripts/fase0-recuperar/evolution.mjs estado
node infra/scripts/fase0-recuperar/evolution.mjs apagar
node infra/scripts/fase0-recuperar/yampi.mjs webhook-listar
```

Esperado: `estado` (registrar o final no resultado, seção 6, e commitar a correção se mudar); `apagar logout=200 delete=200 instancias_com_esse_nome=0`; `webhook-listar` sem nenhuma linha `<- da Fase 0`. Conferir no celular do chip, em Aparelhos conectados, que não sobrou aparelho vinculado.

Aba A: `Ctrl+C` (encerra a captura e o cloudflared). Aba B:

```powershell
curl.exe -s -o NUL -w "%{http_code}`n" "$publica/yampi/x"
Remove-Item -Recurse -Force $env:FASE0_BRUTO
Test-Path $env:FASE0_BRUTO
Remove-Item Env:YAMPI_*, Env:EVOLUTION_*, Env:FASE0_* -ErrorAction SilentlyContinue
Set-Clipboard -Value $null
```

Esperado: `530` (o túnel morreu) e `False` (bruto, sal, mapa e `urls.json` foram juntos). Fechar as duas abas. Depois, preencher as horas da seção 7 do resultado e amendar o commit do resultado antes do push (`git -C $wt add docs/superpowers/plans/_recuperar-fase-0-resultado.md` e `git -C $wt commit --amend --no-edit`). Só horas e datas entram aqui, porque o `conferir` já não tem o bruto; o `scan-secrets` do Step 8 ainda roda sobre o arquivo.

- [ ] **Step 8: Gate local, PR, CI e merge**

```powershell
Set-Location $wt
node --test 'infra/scripts/fase0-recuperar/*.test.mjs'
powershell -ExecutionPolicy Bypass -File infra/scripts/scan-secrets.ps1
git -C $wt log origin/main..HEAD --oneline
git -C $wt push -u origin chore/recuperar-fase-0-resultado
```

Esperado: `ℹ pass 30`; `Scan de secrets OK.`; os 2 (ou 3) commits; push feito. Abrir o PR com `gh pr create --repo codingB0y/Girumo --base main --head chore/recuperar-fase-0-resultado --title "docs(recuperar): phase 0 result, go/no-go and redacted fixtures" --body-file <arquivo>`, corpo com: o que foi provado, o veredito, "as fixtures (mais de trinta) são dado, por isso passa de ~10 arquivos; todas passaram por `conferir` e pela revisão do Security Engineer; nenhum payload cru entra no repo", o gate local desta fase (e o porquê do desvio do `verify-local`), a linha de atribuição de PR da sessão e **"PRs que deixei abertos: nenhum além deste"**. Depois:

```powershell
gh pr checks chore/recuperar-fase-0-resultado --repo codingB0y/Girumo --watch
gh pr merge chore/recuperar-fase-0-resultado --repo codingB0y/Girumo --squash
git -C $principal worktree remove $wt
git -C $principal branch -D chore/recuperar-fase-0-resultado
git -C $principal push origin --delete chore/recuperar-fase-0-resultado
```

Esperado: checks verdes antes do merge (`main` sem proteção: nunca auto-merge); worktree removido (não há junction para desarmar). O último comando reclama de `remote ref does not exist` se o GitHub já apagou a branch: ignorar.

- [ ] **Step 9: Encerrar a sessão**

1. **Quadro:** se o card `recuperar-yampi` existir, entregar ao Igor este SQL (a sessão não roda UPDATE em produção) e não criar card aqui — abrir o card é do PR 1a:

```sql
select key, status, blocker from public.board_features where key = 'recuperar-yampi';
update public.board_features
   set blocker = 'Fase 0 feita em AAAA-MM-DD: veredito do automatico <GO|NO-GO>. Resultado em docs/superpowers/plans/_recuperar-fase-0-resultado.md'
 where key = 'recuperar-yampi';
```

2. **Grafo:** o `rag insert` e o atalho para abrir, em PowerShell:

```powershell
.\tools\lightrag\.venv\Scripts\rag.exe insert "decisão: Fase 0 do Recuperar (AAAA-MM-DD): veredito do automático <GO|NO-GO>; regra de casar a resposta: <uma linha>; aviso da Yampi da piloto apagado; resultado em docs/superpowers/plans/_recuperar-fase-0-resultado.md" --source decisao-AAAA-MM-DD-recuperar-fase-0
.\tools\lightrag\.venv\Scripts\rag.exe shell
```

3. **Aviso final ao Igor:** o veredito em uma linha, o que muda nos planos 3, 4, 6 e 7 (uma linha por plano), o que ele precisa fazer na loja (cancelar os pedidos de teste) e **"PRs que deixei abertos: nenhum"**.

---

## Cobertura da spec (conferência do plano)

| Pedido (spec §8 e "Restrições externas") | Onde |
|---|---|
| Capturar `cart.reminder`, `order.created` com Pix, `order.paid`, `order.status.updated` (e `payment.refused` se der) | Tarefa 7 (Steps 2, 5, 8) e 9 (Step 3) |
| Formato do telefone | Y1, Tarefa 7 Step 3 |
| Link do carrinho sem login (nunca `simulate_url`) e link do pedido como reserva | Y2 e Y3, Tarefa 7 Steps 4 e 6 |
| Código EMV do Pix, validade e fuso | Y4 e Y5, Tarefa 7 Step 6 |
| `cart_token` | Y6, Tarefa 7 Step 6 e Y12 no Step 7 |
| Pedido do admin distinguível | Y7, Tarefa 9 Step 2 |
| Criar e apagar o aviso por API; assinatura | Y8 e Y9, Tarefa 7 Step 1 e Tarefa 9 Step 4 |
| Listagens da reconciliação (Pix 24 h, carrinhos 72 h) | Y10 e Y11, Tarefa 7 Step 7 |
| `whatsappNumbers` (9º dígito, `@lid`) | W2, Tarefa 8 Step 3 |
| Resposta do envio (`key.id`, `remoteJid`) | W4, Tarefa 8 Step 5 |
| Resposta 1:1 de quem nunca falou (`remoteJid`, `remoteJidAlt`, `senderPn`) | W5, Tarefa 8 Step 6 |
| `messages.update` entregue e lida | W6, W13 e W16, Tarefa 8 Step 5 |
| Imagem por URL assinada; mídia recebida em base64; erro de envio | W7, W8, W9; Tarefa 8 Steps 9, 7, 10 |
| Go/no-go do automático | Tarefa 8 Step 12 e Tarefa 10 |
| Fixtures redigidas e arquivo de resultado | Tarefa 11 e Tarefa 6 Step 8 |
| O que os planos 3, 4 e 6 conferem no começo (E1 a E8, E1 a E5, S1 a S12) | Seção 8 do resultado; fixtures com os nomes que eles esperam (Tarefa 11) |
| Privacidade (túnel local, bruto fora do git, fixture com dado falso, credencial só em ambiente) | Global Constraints; Tarefas 1, 2, 6 e 11 |
| Fim: apagar a instância, decidir o aviso, apagar os brutos | Tarefa 9 Step 4 e Tarefa 11 Step 7 |
