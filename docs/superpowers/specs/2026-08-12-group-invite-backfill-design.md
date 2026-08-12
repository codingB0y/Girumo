# Backfill automático do convite dos grupos

**Data:** 12/08/2026
**Status:** aprovado, pronto pra plano de implementação
**Lane espinha:** Banco/API · **Depois:** Frontend+UI · **Engine:** não entra

## Problema

O `invite_url` dos grupos é o destino final do link mestre `/r/<slug>` e o insumo do
auto-grow. Em produção ele está vazio em **todos** os grupos:

| medida | prod (12/08) |
|---|---|
| grupos | 194 |
| com `invite_url` | **0** |
| `is_admin = true` | 90 |
| em zona de lotação (≥90%) | 11 |
| lotado **e** admin | 1 |
| jobs em `group_grow_jobs` | 0 |

A UI de digitação existe (PR #86) e o auto-grow está completo (PR #90). Ambos estão
corretos e **inertes** — não por bug, por falta desse dado. Preencher 90 grupos à mão é
trabalho que a máquina pode fazer: o WhatsApp entrega o código de convite de qualquer
grupo onde a conta é admin.

## Decisão de arquitetura

### Onde a busca mora: web app, não worker, não engine

O projeto tem **duas** integrações de WhatsApp, e isso não é óbvio no código:

- **Evolution** — `/api/groups/sync` chama `fetchAllGroups()`. **É o caminho vivo:** foi ele
  que produziu os 194 grupos, com `is_admin` calculado por `isAdminGroup()`. Instância
  `b9f62617` está `connected`.
- **Engine (Baileys)** — `hubflow-engine`, posta em `/api/groups` só grupos admin. Tem
  `sock.groupInviteCode` provado em produção no caminho de criação do auto-grow
  (`index.js:556`), e tem o `group-guard` com bucket `invite: 10/10min`.

Foi tentador construir na engine, porque a chamada já está escrita e o rate limiter já
existe. **Está errado:** o `group-guard` é objeto em memória de processo, e a engine não é
a conexão viva em produção. Construir lá seria feature em cima da integração errada.

O worker (`apps/worker`) seria o lar natural de um drip lento — já tem
`SCAN_INTERVAL_MS` e um modo dry-run elegante. Mas `buildSendDeps` desliga o caminho
Evolution sem `EVOLUTION_API_URL`/`EVOLUTION_API_KEY`, envs que estão pendentes no Coolify
desde 10/08 e já mantêm o executor de automações ocioso. Código posto lá nasce dark.

**O web app é o único lugar que funciona hoje**, com as mesmas credenciais que já
produziram os 194 grupos, e a infra de cron já existe (`/api/cron/emails`).

### O agendador é o rate limiter

10 grupos por execução, uma execução a cada 10 minutos = **10/10min**, a política escolhida
pelo Igor (mesmo número do bucket `invite` do `group-guard`, por isso deliberadamente).

Isso dispensa tabela de bucket e dispensa estado em memória. É durável por construção:
se o processo morrer no meio, o Vercel continua chamando na cadência certa — nenhuma
rajada escapa depois de um deploy, que é exatamente a falha que um bucket em RAM tem.
Os 90 grupos ficam prontos em **~90 minutos**, sem ninguém olhando.

`groupInviteCode` é **leitura** — busca o código que já existe, não envia convite a
ninguém. Ainda assim adotamos o limite conservador: o WhatsApp não documenta esse teto e
o custo de errar é a conta do lojista.

### Nenhuma migração

`syncGroupsFromProvider` faz upsert de exatamente 4 colunas
(`whatsapp_group_id`, `name`, `members`, `is_admin`). `invite_url` e `metadata` **sobrevivem
ao sync** — é a não-destrutividade entregue no PR #82. Então:

- o convite vai em `groups.invite_url` (coluna existente)
- o marcador de falha vai em `groups.metadata.inviteFetch` (jsonb existente)

## Componentes

### 1. `lib/evolution/client.ts` → `fetchInviteCode`

```
GET /group/inviteCode/{instance}?groupJid=<jid>
→ 200 { inviteUrl: "https://chat.whatsapp.com/<code>", inviteCode: "<code>" }
```

Confirmado no fonte da Evolution **2.3.7** (a versão pinada em
`deploy/coolify/evolution.docker-compose.yml`), em
`src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts:4483`, e o parâmetro
`groupJid` em `GroupJid` (`src/api/dto/group.dto.ts:23`).

Assinatura: `fetchInviteCode(instanceName: string, groupJid: string): Promise<string | null>`.

Usa o `request()` que já existe no client (header `apikey`, timeout, `EvolutionError`).
A resposta passa pelo `normalizeInviteUrl()` de `lib/groups/invite-url.ts` **antes** de sair
da função — nome e URL vindos de terceiro não entram no banco sem validação, e aquele
helper já aceita as formas legítimas e recusa o resto.

**Contrato de falha, explícito porque a classificação depende dele:**

- **Lança `EvolutionError`** (que carrega `status` e `detail`) em qualquer falha de HTTP.
  A função **não** engole o erro — se engolisse, o chamador perderia a única informação
  que distingue permanente de transitório.
- **Retorna `null`** apenas no caso `200` com corpo sem convite válido.

Ou seja: `null` significa "a Evolution respondeu e não havia convite utilizável";
exceção significa "a chamada não completou". São situações diferentes e o chamador trata
cada uma de um jeito.

### 2. `lib/groups/invite-backfill.ts` — puro, testável sem rede

**`selectBackfillCandidates(groups, limit)`**

Filtra `is_admin && !invite_url && !metadata.inviteFetch?.failed`.
Ordena por `members` **desc**.

A ordenação por membros é o que faz os 11 grupos em zona de lotação virem primeiro, sem
nenhum código de prioridade especial — os que mais precisam de link são os mais cheios.

**`classifyInviteFailure({ status, detail })` → `"permanent" | "transient"`**

Aqui está a parte não-óbvia. A Evolution **achata toda falha de grupo num 404
`No invite code`**:

```ts
catch (error) {
  throw new NotFoundException('No invite code', error.toString());
}
```

Então num 404 o status não informa nada — a causa real vive no `detail`, que o
`safeDetail()` do nosso client já extrai (truncado em 200 chars). Mas o status **importa**
nos outros casos (rede, 5xx), então a função recebe os dois e decide nesta ordem:

| condição | veredito |
|---|---|
| `status === 0` (timeout/rede: não chegou na Evolution) | **transitório** |
| `status >= 500` | **transitório** |
| `detail` contém `403`, `forbidden`, `not-authorized` | permanente (não sou admin) |
| `detail` contém `locked` | permanente (grupo travado) |
| `detail` contém `gone` | permanente (convite revogado) |
| qualquer outro caso | permanente **visível** (ver abaixo) |

A ordem não é decorativa: status vem antes de detail porque um 5xx da Evolution pode
carregar qualquer texto, e tratá-lo como permanente por causa de uma palavra no corpo
mataria um grupo bom.

### 3. `app/api/cron/group-invites/route.ts`

Autenticação de cron idêntica à de `/api/cron/emails` (seguir o mecanismo de lá, não
inventar outro).

Por tenant com instância `connected`: pega até **10** candidatos, busca **em série**
(nunca em paralelo — paralelismo é o oposto de rate limit), grava um a um.
Responde `{ filled, failed, remaining }` pro log.

Instância que não está `connected` faz o tenant ser pulado inteiro, sem gastar chamada.

### 4. `vercel.json` — cron a cada 10 minutos

## Tratamento de erro

| Situação | Ação |
|---|---|
| Evolution fora do ar, timeout, 5xx | **transitório** — não marca, tenta no próximo cron |
| detail com `403`/`locked`/`gone` | **permanente** — grava motivo, sai da fila |
| resposta sem convite válido | permanente, motivo explícito |
| detail não reconhecido | permanente, motivo = o detail truncado |
| instância não `connected` | pula o tenant, sem chamada |

Uma falha nunca aborta os outros nove do lote.

`metadata.inviteFetch = { failed: true, reason: string, at: ISO }`.

### O refinamento que o 404-pra-tudo exige

A escolha foi "marcar e nunca mais tentar sozinho", pra o cron não bater eternamente num
grupo impossível. Com a Evolution achatando tudo em 404, isso tem um custo: uma oscilação
passageira do lado do WhatsApp marcaria um grupo **bom** como impossível para sempre.

Por isso o painel ganha, ao lado do motivo, um **"buscar de novo"** que limpa
`metadata.inviteFetch` e devolve o grupo à fila. A regra "nunca tenta sozinho" é
preservada ao pé da letra; o resgate custa um clique em vez de colar link à mão.

## Testes

`invite-backfill.test.ts` (puro, `node:test` + `tsx --test`, como o resto do projeto):

- seleção ignora grupo não-admin
- seleção ignora grupo que já tem `invite_url`
- seleção ignora grupo marcado como falho
- seleção respeita o `limit`
- seleção ordena por `members` desc (o grupo mais cheio vem primeiro)
- classificação: cada linha da tabela acima → permanente/transitório
- classificação: **5xx cujo corpo contém `locked` é transitório** — trava o regressão da
  ordem status-antes-de-detail, que é a única parte da função onde é fácil errar
- classificação: `detail` vazio ou nulo não quebra (cai em permanente visível)

`client`: fixture de resposta boa; resposta sem `inviteCode`; resposta cujo `inviteUrl`
**não** é do WhatsApp (tem que ser recusada — é o caso que protege o `/r/<slug>` de virar
funil furado).

## Multi-tenant

Toda query carrega `.eq('tenant_id')` explícito. O service-role bypassa RLS, então esse
filtro **é** a proteção — não é redundância.

## Fora de escopo

- **Re-busca periódica.** Convite pode ser revogado; detectar isso é outro problema
  (precisa de sinal, não de varredura). Aqui só preenchemos o que está vazio.
- **Grupos onde não somos admin.** Sem admin não há código a buscar. Continuam com o
  input manual do PR #86.
- **Mexer no worker ou na engine.** Quando as envs da Evolution entrarem no Coolify,
  vale reavaliar se o drip migra pro worker; hoje seria ship de código inerte.
