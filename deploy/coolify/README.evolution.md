# GIRUMO — Evolution API v2 no Coolify (F1 da migração)

> Rebrand: identificadores desta stack usam `girumo*`. O `instanceName` na
> Evolution segue o formato `gr_<instances.id>` (contrato consumido na F2).

Sobe a stack **Evolution API v2** (WhatsApp) em VPS/Coolify. Substitui a engine
Baileys (`engine.docker-compose.yml`) a partir da F5. Enquanto isso, as duas
convivem: a Evolution é a nova via, o Baileys congela como fallback.

## Arquivos

```txt
deploy/coolify/evolution.docker-compose.yml   # Evolution + Postgres 16 + Redis 7
deploy/coolify/evolution.env.example          # template de env (server-only)
```

> O `worker.docker-compose.yml` (loop anti-ban + envio) NÃO existe ainda — nasce
> na **F4**, junto com `apps/worker/`. Referenciar imagem inexistente agora seria
> artefato quebrado.

## Passo a passo (infra — feito por você na VPS/Coolify)

1. **DNS:** aponte `wa.seudominio.com` para o IP da VPS.
2. **Segredos:** gere a chave global:
   ```bash
   openssl rand -hex 32   # AUTHENTICATION_API_KEY
   openssl rand -hex 24   # EVOLUTION_DB_PASSWORD
   ```
3. **Coolify → novo recurso → Docker Compose**, cole
   `evolution.docker-compose.yml`.
4. **Env vars** do app Coolify: copie de `evolution.env.example` e preencha
   (`SERVER_URL=https://wa.seudominio.com`, `AUTHENTICATION_API_KEY`,
   `EVOLUTION_DB_PASSWORD`, ...).
5. **Domínio + HTTPS:** aponte o domínio do serviço `evolution` para a porta
   **8080**. Coolify emite o certificado (Let's Encrypt).
6. **Deploy.** Aguarde os 3 containers ficarem `healthy`.

## Hardening (checklist de segurança)

- [ ] Imagem **pinada** (`v2.3.7`), nunca `:latest`. Confirme a tag no Docker Hub.
- [ ] Postgres e Redis **sem porta no host** (só rede interna `girumo-net`) — já é
      o default do compose (sem `ports:`).
- [ ] `AUTHENTICATION_API_KEY` >= 32 bytes, igual ao `EVOLUTION_API_KEY` da Vercel.
- [ ] **Manager UI bloqueada:** no proxy do Coolify, negue `/manager` e
      `/manager/*` (ou restrinja por IP). O painel do Girumo não usa o manager.
- [ ] Firewall da VPS: expor só 80/443 (e 22 restrito). Nada de 5432/6379/8080
      direto no host.

## Smoke test (número descartável)

Use um chip que possa levar ban. `$KEY` = `AUTHENTICATION_API_KEY`.

```bash
BASE=https://wa.seudominio.com
KEY=<AUTHENTICATION_API_KEY>

# 1. Criar instância (instanceName no formato do Girumo: hf_<uuid>)
curl -sS -X POST "$BASE/instance/create" \
  -H "apikey: $KEY" -H "Content-Type: application/json" \
  -d '{"instanceName":"gr_smoke-test","integration":"WHATSAPP-BAILEYS","qrcode":true}'

# 2. Pegar o QR (base64) e escanear no WhatsApp
curl -sS "$BASE/instance/connect/gr_smoke-test" -H "apikey: $KEY"

# 3. Conferir estado da conexão
curl -sS "$BASE/instance/connectionState/gr_smoke-test" -H "apikey: $KEY"

# 4. Limpar
curl -sS -X DELETE "$BASE/instance/delete/gr_smoke-test" -H "apikey: $KEY"
```

## Capturar fixtures de webhook (entrega principal da F1)

Os payloads reais alimentam os schemas zod da **F2** e os testes da **F4**.

1. Crie um endpoint temporário em https://webhook.site (copie a URL).
2. Configure o webhook **por instância** apontando pra ela, escutando os eventos
   que o Girumo usa:
   ```bash
   curl -sS -X POST "$BASE/webhook/set/gr_smoke-test" \
     -H "apikey: $KEY" -H "Content-Type: application/json" \
     -d '{
       "webhook": {
         "enabled": true,
         "url": "https://webhook.site/<seu-id>",
         "byEvents": false,
         "base64": false,
         "events": [
           "QRCODE_UPDATED","CONNECTION_UPDATE","GROUP_PARTICIPANTS_UPDATE",
           "GROUPS_UPSERT","MESSAGES_UPDATE"
         ]
       }
     }'
   ```
3. Gere cada evento (conectar, entrar/sair de grupo, receber msg) e **salve o JSON
   cru** de cada um em:
   ```txt
   apps/web/src/lib/evolution/__fixtures__/<evento>.json
   ```
   Ex.: `group-participants-update.add.json`, `connection-update.open.json`,
   `qrcode-updated.json`, `messages-update.json`, `groups-upsert.json`.
   Inclua ao menos um participante `@lid` (sem telefone real) — é o caso de borda
   crítico do worker.

## Contratos reais da API (verificados na F1 contra a v2.3.7)

Achados empíricos — não confie na doc, estes foram testados na stack no ar:

- **`webhook/set` exige `"enabled": true`** no objeto `webhook`. Sem ele: HTTP 400
  `webhook requires property "enabled"`.
- **`MESSAGES_UPDATE` NÃO dispara em mensagem nova.** Ele dispara em mudança de
  **status** (entregue/lida) — que é justamente o que o delivery-tracker (F4)
  precisa. Mensagem recebida é `MESSAGES_UPSERT`, evento que o Girumo não usa
  (decisão: conteúdo inbound não alimenta LLM).
  Para gerar um `MESSAGES_UPDATE`: envie via `POST /message/sendText/{instance}`
  e aguarde a entrega.
- **`pairingCode` só é emitido se o `number` for informado na CRIAÇÃO** da
  instância. Chamar `connect?number=...` numa instância que já subiu em modo QR
  retorna `null`.
- **O campo `event` do payload NÃO usa o nome configurado.** Configura-se
  `CONNECTION_UPDATE` mas chega `connection.update`. Mapa real:
  `QRCODE_UPDATED→qrcode.updated`, `CONNECTION_UPDATE→connection.update`,
  `GROUPS_UPSERT→groups.upsert`, `MESSAGES_UPDATE→messages.update`,
  `GROUP_PARTICIPANTS_UPDATE→group-participants.update`.
  A discriminated union do zod (F2) deve usar os valores da direita.
- **Envelope comum a todo evento:** `event`, `instance`, `data`, `destination`,
  `date_time`, `sender`, `server_url`, `apikey`.
- **⚠️ O payload inclui `apikey`** (token da instância). Nunca logar o payload
  cru; as fixtures do repo estão redigidas.
- **`@lid` é real e frequente:** participantes aparecem como `<digitos>@lid`
  (sem telefone) misturados com `<numero>@s.whatsapp.net`. Presente em 4 das 6
  fixtures capturadas — `normalizeParticipant` (F3) precisa tratar os dois.
- **QR pelo terminal é inviável na prática:** expira em ~20s e tem ~230 chars.
  Use a UI em `/manager` para o pareamento manual (e bloqueie-a depois — ver
  hardening).

## Rede interna para o worker (F4)

O worker vai falar com a Evolution pela rede docker interna, não pelo HTTPS
público:

```txt
EVOLUTION_API_URL (Vercel)  = https://wa.seudominio.com
EVOLUTION_API_URL (worker)  = http://evolution:8080   # rede girumo-net
```

## Definition of done (F1)

- [ ] 3 containers `healthy` no Coolify.
- [ ] Smoke test: instância criada, QR escaneado, `connectionState = open`.
- [ ] Manager UI inacessível de fora.
- [ ] Fixtures de webhook salvas em `apps/web/src/lib/evolution/__fixtures__/`.
