# Domínio próprio do lojista para os links de grupo — design

**Data:** 04/10/2026 · **Status:** aprovado (modo autônomo, recomendações aceitas pelo Igor de antemão)

## Problema

Todo link que o lojista compartilha sai no host do Girumo: `app.girumo.com.br/r/vip`. O lojista
quer o link no endereço dele — `links.sualoja.com.br/r/vip` — sem a marca de terceiro no meio do
anúncio ou da bio.

## Decisão

O lojista conecta **um subdomínio** dele (ex.: `links.sualoja.com.br`). O Girumo adiciona esse host
ao projeto Vercel `girumo` pela API de Domínios da Vercel, que emite o certificado sozinha. O
mesmo deploy passa a responder no host do lojista, e o middleware restringe o que o host serve.

Abordagens descartadas:

| Abordagem | Por que não |
|---|---|
| Encaminhamento de URL no provedor do lojista | Um redirecionamento manual por link, perde rotação de grupo, cookie de "grupo lembrado" e Pixel. Não é "no endereço dele". |
| Cloudflare for SaaS (custom hostnames) na frente da Vercel | Mais um proxy (a Vercel desaconselha), plano pago extra, e o problema do momento cabe na API da Vercel. Reavaliar acima de ~1000 domínios. |

## Formato do link

`https://<host do lojista>/r/<slug>` (e `/c/<slug>` para comunidade, `/p/<slug>` para página).
Só a **origem** muda. Nada de `/<slug>` sem prefixo: exigiria um 308 extra em todo clique de anúncio
(ou reescrita com CSP e cookie de caminho próprios). Se lojista pedir link "pelado", adicionar o
308 depois.

## Posse do domínio (segurança)

O risco real não é um tenant digitar o domínio de outro: é o **CNAME pendurado**. O lojista B remove
o domínio do Girumo mas deixa o CNAME apontado para a Vercel; o tenant A cadastra o mesmo host e
passa a servir os grupos dele no endereço de B (subdomain takeover clássico).

Por isso a ativação exige **prova de posse por TXT, gerada por cadastro**:

```
_girumo-verify.links.sualoja.com.br  TXT  girumo-verify=<token aleatório de 32 hex>
```

Nenhuma chamada à Vercel acontece antes do TXT bater — o projeto não vira depósito de domínio
alheio. O token é novo a cada cadastro, então o TXT velho de B não serve para A.

## Fluxo

1. **Cadastrar** (`POST /api/dominio`, owner/admin): normaliza o host (aceita URL colada), valida,
   recusa host do próprio Girumo, IP e domínio de 2 rótulos (`loja.com` é raiz). Grava a linha
   `pending` com o token. Um domínio por conta; trocar = remover e cadastrar de novo.
2. **Instruções** (`GET /api/dominio`): dois registros — `CNAME <host> → cname.vercel-dns.com` e o TXT
   acima — e o aviso de deixar a nuvem cinza no Cloudflare.
3. **Verificar** (`POST /api/dominio/verificar`, owner/admin), em ordem, parando no primeiro problema:
   1. TXT de posse (`node:dns/promises`). Falhou → `problema = "txt"`.
   2. Domínio no projeto Vercel: `GET` e, se 404, `POST /v10/projects/:id/domains`. 409 → `"em-uso"`
      (domínio preso a outro projeto Vercel).
   3. `verified = false` → `POST .../verify`; continuando falso → `"vercel-verificacao"` com os
      desafios da Vercel devolvidos na resposta (caso raro: raiz do lojista em outra conta Vercel).
   4. `GET /v6/domains/:host/config` com `misconfigured = true` → `"dns"` (CNAME ainda não chegou).
   5. Tudo certo → `status = active`, `verified_at`.
   Falha de rede ou 5xx da Vercel → `"vercel-erro"`. Verificar **só promove**: domínio ativo não é
   reverificado (TXT apagado depois da ativação não derruba links no ar).
4. **Remover** (`DELETE /api/dominio`, owner/admin): tira do projeto Vercel (404 é sucesso) e apaga a
   linha. Falha na Vercel é logada e a linha sai mesmo assim: domínio no projeto sem dono no banco
   responde 404 em tudo, e um novo cadastro ainda precisa provar posse.

## O que o host do lojista serve

O middleware passa a rodar em **todo** path de host que não é do Girumo (entrada nova no `matcher`
com `missing: [{ type: "host", value: <padrão first-party> }]`; o Next ancora `^…$` e tira a porta).

| Path no host do lojista | Resposta |
|---|---|
| `/r/*`, `/c/*`, `/p/*` | fluxo de hoje (CSP com nonce) + checagem de tenant no handler |
| `/api/p/*` | passa direto (lead, track e mídia das LPs — mesmo comportamento de hoje, que já pula o middleware) |
| qualquer outro (`/`, `/login`, `/painel`, `/api/*`…) | 404 |

`/_next/static`, `/_next/image` e arquivos com ponto continuam fora do matcher (assets das LPs).

**Checagem de tenant** (`hostServesTenant`): host first-party → serve; host do lojista → só serve se
existir linha `active` com esse host **e** o `tenant_id` dela for o do link/página. Erro de banco →
não serve (404). Sem isso `links.lojaA.com.br/r/<slug-de-B>` abriria o grupo de B no endereço de A.

Host first-party = `girumo.com.br`, `hubflow.com.br`, `*.vercel.app` e `localhost`/`127.0.0.1`
(com subdomínios). O padrão mora em `lib/custom-domains/hostname.ts`; o `matcher` precisa do mesmo
texto literal (o Next exige config estática) e um teste compara os dois.

## Dados

`public.custom_domains` — `id`, `tenant_id` (FK `organizations`, **unique**: um por conta),
`hostname` (minúsculo por check; **único só entre ativos**, índice parcial), `verification_token`, `status` (`pending|active`),
`last_error`, `checked_at`, `verified_at`, `created_at`.

Por que o host não é único na tabela inteira: com unique global, quem cadastrasse primeiro o
subdomínio de outra loja (sem conseguir provar posse) travaria o dono de verdade. Pendentes podem
coexistir; só um vira ativo, e só quem tem o TXT chega lá. Se dois tenants provarem posse (o mesmo
dono com duas contas), o segundo a ativar fica `pending` com `em-uso`.

RLS ligado com leitura por
`app.has_membership(tenant_id)`; escrita só do servidor (revoke de `authenticated`), no padrão das
migrações de 03/10.

## Painel

- **Configurações → Conexão**: cartão "Domínio próprio" abaixo do número. Vazio → campo + "Conectar".
  Pendente → os dois registros com botão de copiar, último problema em linguagem de lojista,
  "Verificar agora" e "Remover". Ativo → etiqueta "Ativo" e exemplo do link. Só owner/admin vê os
  botões (`settings:connection`). O cartão não aparece enquanto `VERCEL_API_TOKEN` não existir.
- **Links copiáveis de campanha** (lista, detalhe e criação) passam a usar a origem do domínio
  quando ele está `active` (`useLinkOrigin`). Enquanto a consulta não volta a origem fica vazia —
  os builders já devolvem `null` para origem vazia, então nunca se copia o link do host errado.
- Fora do escopo: link de página (`/p/`) no painel continua no host do Girumo (a página **funciona**
  no domínio do lojista, inclusive o redirecionamento de "lotado"). Adicionar quando pedirem.

## Configuração

- `VERCEL_API_TOKEN` (servidor, Sensitive na Vercel) — token com escopo no time do projeto.
- Id do projeto (`prj_OqpJ680p1Q5LWE2cGjiOg1cnuJPq`) e do time (`team_2H4HYmKVySM4jMf2MCOAdm3E`) são
  constantes no código: não são segredo e não mudam.

## Fora do escopo (YAGNI)

Domínio raiz (registro A), mais de um domínio por conta, link sem `/r/`, re-verificação periódica
(cron), cobrança/limite por plano, cache da consulta de host (é uma query indexada por clique, só no
host do lojista).

## Testes

Unitários (`tsx --test`): normalização/validação do host e padrão first-party; decisão de rota no
host do lojista; cliente Vercel com `fetch` falso; orquestração da verificação com dependências
injetadas; store com PostgREST falso; `hostServesTenant`; igualdade do padrão no `matcher`.

## Entrega

- **PR 1 — servidor**: migração, libs, store, middleware, checagem em `/r` `/c` `/p`, rotas `/api/dominio`.
  Dormente até existir token e linha ativa.
- **PR 2 — painel**: cartão em Configurações e origem dos links de campanha.
- Pendências do Igor no fim: DDL nos dois bancos, baseline do gate de drift, `VERCEL_API_TOKEN` na
  Vercel, card do quadro.
