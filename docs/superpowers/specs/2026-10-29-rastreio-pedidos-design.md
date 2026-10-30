# Rastreio do pedido — página por CPF e avisos automáticos — design

**Data:** 29/10/2026 · **Status:** escrito depois do mockup aprovado pelo Igor (29/10), revisado pela checagem de
construtor; conexão da Yampi decidida (token na piloto); Melhor Envio logo depois do e-mail, para entregue e não
entregue, se a Fase 0 pedir (30/10); cobrança em aberto, sem travar a v1 (ligada pelo admin)
**Mockup:** https://claude.ai/artifact/MWC77x1LE213aFpNFQ7Z8c (busca, pedido, problema, WhatsApp, e-mail,
Integrações › Yampi, Configurações › Rastreio de pedidos, Vendas › Entregas, como funciona)
**Card do quadro:** `rastreio-pedidos` (prod, `nao_existe`)
**Pesquisa com fontes:** repo privado `girumo-notas`, `docs/superpowers/specs/2026-10-29-rastreio-pedidos-pesquisa.md`
**Depende de:** spec do Recuperar (`docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md`, branch
`docs/recuperar-spec`, commit 6655d66d; planos em `docs/superpowers/plans/2026-10-29-recuperar-yampi-*.md`, com o
contrato da base na seção "Contrato comum" do índice, commit 7225b674), que desenha a **base comum** — conexão com a Yampi (`yampi_connections`,
`yampi_events`, webhook `?c=<id>`) e a **base do privado** (um número `instances.purpose = 'privado'` por loja, comum
aos dois módulos — na tela, **"número do atendimento"** —, `private_conversations`, `private_messages` com módulo,
`key.id` e status, `private_number_state` com o horário do número, `private_signals`, `private_optouts`, trava no
claim e no sender, `valid_until`, as flags `recuperar_enabled` e `rastreio_enabled`). Este documento só especifica o
que é do Rastreio e o que ele pede dessa base (§0).

## Problema

A compradora da loja pergunta "cadê meu pedido?" no WhatsApp da loja, um por um. A Yampi manda e-mail de status, mas
não manda WhatsApp, e a página de rastreio dela só aceita código dos Correios. O lojista responde à mão.

Pedido do Igor (29/10): integrar Yampi e Melhor Envio para a compradora (1) acompanhar o pedido numa página da loja
buscando pelo CPF e (2) receber sozinha os avisos de cada etapa (pago, despachado, entregue...) por WhatsApp, e-mail e
no site.

## Decisões do Igor (29/10)

| Pergunta | Decisão |
|---|---|
| De onde vem o pedido | **Yampi** como base; Melhor Envio só complementa (recomendação da pesquisa; mockup aprovado) |
| Melhor Envio (30/10) | **Logo depois do e-mail (PR 8), só para os marcos entregue, não entregue e pausado**, se as provas 4 e 5 da Fase 0 pedirem (§10). Antes estava na fase 3; o Igor perguntou por que não direto no Melhor Envio, e a resposta foi: base continua a Yampi, mas sem o Melhor Envio os avisos de entregue e problema dependem da lojista atualizar a Yampi à mão |
| WhatsApp ao comprador | **API não oficial (Evolution)** — "USAR API NAO OFICIAL". Antes ele tinha escolhido a oficial via Zernio; trocou no mesmo dia |
| Número | **Número de privado separado** do número dos grupos (premissa dita a ele) e **um chip só para Rastreio e Recuperar** (decidido pelo Igor na sessão do Recuperar, 29/10). Na tela: "número do atendimento" |
| Telas | Mockup aprovado em 29/10 e ajustado à troca de API (sem botões, um link por mensagem, "parar avisos" na página) |
| Conexão da Yampi na v1 | **Token da conta colado** (alias + token + chave, guardados cifrados) já na piloto — "Token na piloto". O pedido de Parceiro Tech corre em paralelo; é a mesma escolha do spec do Recuperar |

Regra durável afetada: [nunca DM] — a exceção vale só para o número de privado e só para aviso de pedido (§1.4).

## O que a pesquisa mudou no pedido

1. **A Yampi é o ponto onde tudo se encontra.** O webhook dela já traz CPF/CNPJ, e-mail, celular, status e o código de
   rastreio, venha a etiqueta de onde vier: o app do Melhor Envio da Yampi devolve o código quando a etiqueta vira
   "Postado"; o Bling devolve se "Sincronizar rastreamento automaticamente" estiver ligado; o lojista pode digitar.
2. **O Melhor Envio não serve de base, mas é o único caminho automático para "entregue".** Ele só conhece o que saiu
   com etiqueta dele, e só a partir da etiqueta (não sabe de pagamento, separação, cancelamento nem retirada na loja);
   o webhook dele não dispara para etiqueta criada pelo site ou por outro app (Yampi, Bling), mesmo na mesma conta; e
   só dá marcos (postado, entregue, não entregue, pausado). Em compensação, na pesquisa não apareceu nenhum caminho que
   marque "entregue" na Yampi sozinho: sem o Melhor Envio, os avisos de entregue e problema dependem de a lojista
   atualizar o status à mão. Por isso ele entra logo depois do e-mail, só para esses marcos (PR 8, §3.6), se as provas
   4 e 5 da Fase 0 pedirem.
3. **"Saiu para entrega" não existe em fonte oficial.** Correios só liberam o rastreio ao dono do contrato. Até a
   fase 4, a página leva ao histórico completo da transportadora.
4. **E-mail já existe três vezes** (Yampi a cada status, Melhor Envio a cada movimentação, Bling com logística). O
   e-mail da Girumo é opcional por etapa, e a tela avisa para desligar o do Melhor Envio. O buraco de verdade é o
   WhatsApp e a página com a cara da loja.
5. **CPF sozinho não é segredo** (vazamento de 2021, ~10⁹ combinações). A busca pede **CPF ou CNPJ + os 4 últimos
   dígitos do celular do pedido**; o caminho principal é o link no aviso.

## §0. O que o Rastreio pede da base comum

| Base (spec do Recuperar) | O Rastreio precisa |
|---|---|
| Webhook único da loja (`?c=<id>`), `yampi_events` (inbox, 30 dias) e o processador com `CONSUMIDORES` | a entrada `rastreio` em `CONSUMIDORES` assina `order.created`, `order.paid` e `order.status.updated` e chama `registrarPedidoDaYampi(e.tenantId, e.recurso, "aviso")`; a retentativa de evento parado é do cron comum `/api/cron/yampi` |
| Cliente da API da Yampi (`yampiGet`, `YampiErro` com `retryAfterMs`, 401 marca a conexão) | a importação de 30 dias e a varredura de pedidos por `updated_at` (cursor próprio no cron do Rastreio, §3.2: a base não varre pedidos) |
| Um número `privado` por loja; DM só sai dele e só com a flag do módulo ligada | `rastreio_enabled` (criada no banco comum) libera o módulo `rastreio`; o número segue mandando aviso se o Recuperar for desligado |
| Comando de DM com módulo de origem, prioridade e `valid_until` | prioridade do aviso de pedido abaixo do Pix e acima do carrinho; validade de 24 h |
| `private_messages` (módulo, texto, `key.id`, status, código de erro) + `messages.update` consumido | guardar o id da `private_messages` no aviso e ler status e erro por ele (`statusDosDms`); nenhuma coluna nova na `private_messages` (o módulo `rastreio` basta para a etiqueta em Conversas) |
| `whatsappNumbers` antes do 1º envio; barreira com `optouts` por `phone_key()` e `private_optouts` (SAIR, vale para os dois módulos) | igual; número sem WhatsApp devolve falha que o Rastreio converte em e-mail |
| Teto, intervalo, horário e pausa **do número**, divididos entre os dois módulos (jitter permitido; sem texto girado nem "digitando", por `hubflow-engine/DECISIONS.md`; pausa de proteção vale para o número inteiro) | volume baixo (1 a 4 avisos por pedido); no teto, depois do Pix e antes do carrinho; "conversa nova" = 1ª mensagem do pedido para telefone que nunca escreveu |
| Cartão do número do atendimento (estado, aquecimento, ritmo, horário, conectar) | o Rastreio mostra o mesmo cartão nas Configurações dele; o horário é do número e muda por qualquer um dos dois módulos |
| Conectar o número de privado "exige um add-on que use o privado" | `rastreio_enabled` conta como módulo que usa o privado (ligado pelo admin na v1, §Pendências 1) |

Quem for construído primeiro faz a base (PR "base" no §9). O Rastreio não reespecifica nada disso.

## 1. Regras

### 1.1 Etapas (Yampi → Girumo)

| Status na Yampi | Etapa | Aviso padrão (WhatsApp / e-mail) |
|---|---|---|
| `waiting_payment`, `authorized`, `created` | `aguardando_pagamento` | — / — |
| `paid` | `confirmado` | desligado / desligado (a Yampi já manda e-mail) |
| `handling_products`, `invoiced`, `ready_for_shipping` | `separando` | — / — |
| `on_carriage` **com** `track_code` (ou `track_code` novo em qualquer status depois de pago) | `enviado` | ligado / ligado |
| `ready_for_pickup` | `retirada` | ligado / ligado |
| `shipment_exception` | `problema` | ligado / ligado (+ aviso à loja, §1.5) |
| `delivered` ou `delivered = true` | `entregue` | ligado / desligado |
| `refused`, `cancelled` | `cancelado` | — / — |

- Alias desconhecido: mantém a etapa anterior e registra em `logs` (sem dado pessoal).
- `on_carriage` sem código: continua `separando`; o pedido aparece em "Sem código há +2 dias". O aviso "enviado" só
  sai com código.
- Etapa não anda para trás por aviso atrasado:
  `aguardando_pagamento < confirmado < separando < enviado < retirada|problema < entregue`; `cancelado` vale sempre;
  `problema` e `retirada` podem voltar a `enviado`.
- Linha do tempo (`events`): pedido ao vivo carimba cada etapa com a hora em que a Girumo viu. Pedido importado usa o
  histórico de status da Yampi (`include=statuses`) se trouxer data (Fase 0 confere); senão mostra só a etapa atual,
  sem datas inventadas.

**Marcos do Melhor Envio (PR 8, só com o Melhor Envio conectado):**

| Status da etiqueta no Melhor Envio | Etapa |
|---|---|
| `delivered` | `entregue` |
| `undelivered` | `problema` |
| `paused` ("exige ação do destinatário") | `problema` |
| os outros (`generated`, `posted`, …) | não mexem: o "enviado" vem da Yampi, com o código |

- A etiqueta é casada com o pedido pelo **código de rastreio** que a Yampi já gravou (`tracking_code`); a Fase 0 (prova
  5) confere se esse código é o `tracking` ou o `self_tracking` do Melhor Envio. Pedido sem código não é consultado.
- O marco grava pelo mesmo caminho do pedido da Yampi: a etapa não volta (um `paused` depois de `entregue` não muda
  nada) e o aviso é um por etapa e canal. Se a Yampi também marcar `delivered`, a etapa já é `entregue` e nada se repete.
- A Fase 0 confere em etiquetas reais o que o `paused` cobre; se for "aguardando retirada na agência", ele continua
  `problema` (a compradora precisa agir e a loja é avisada), nunca `retirada` (que é retirada na loja).

### 1.2 Quando avisar

- Só etapa nova vista **com o Rastreio ligado** (`rastreio_enabled`), em pedido atualizado nos últimos 3 dias e em
  loja com plano ativo (`tenantGrantsPlan`). A importação inicial (30 dias) enche a página e o painel sem aviso. A
  varredura do cron avisa como o aviso da Yampi (ela existe para cobrir aviso perdido; a janela de 3 dias segura
  pedido velho). Loja com Yampi conectada só para o Recuperar: o Rastreio não grava nada.
- Marco do Melhor Envio avisa como o da Yampi, com a janela de 3 dias contada da data do marco na etiqueta (a Fase 0
  confere o campo; `delivered_at` no entregue). A primeira passada depois de conectar o Melhor Envio só grava, sem
  aviso, como a importação.
- Um aviso por pedido × etapa × canal: `unique (order_id, etapa, channel)` em `tracking_notices`.
- A matriz da loja decide os canais por etapa; o padrão é a coluna acima.
- Pedido com "parar avisos" (`notices_stopped_at`) não recebe mais nada. "Parar avisos" é por pedido e **não** grava
  em `optouts` (lista LGPD da loja, que também barra captura de lead e evento do Meta).
- Telefone em `optouts` da loja (por `phone_key()`) ou em `private_optouts` (mandou SAIR no número de privado) não
  recebe WhatsApp — a barreira é da base; e-mail continua.
- WhatsApp que falha (número sem WhatsApp, inválido, comando vencido em 24 h) vira e-mail no lugar, se a compradora
  tem e-mail e o e-mail daquela etapa ainda não saiu ("WhatsApp falhou · e-mail enviado" no mockup). Com o número do
  atendimento caído, a DM espera na fila e só vence no fim das 24 h; por isso o e-mail no lugar pode chegar até 24 h
  depois (nas etapas com e-mail ligado na matriz, o e-mail já saiu na hora).

### 1.3 Busca

- Entrada: **CPF ou CNPJ** (11 ou 14 dígitos, dígitos verificadores conferidos) + 4 últimos dígitos do celular.
- Casa por `doc_hmac` (HMAC-SHA256 dos dígitos com `RASTREIO_DOC_PEPPER`) + `phone_last4`, na loja da página, pedidos
  dos últimos 90 dias.
- Resultado: **lista** dos pedidos que casaram (mais novo primeiro: nº, data, etapa) → toque abre o pedido. Um só →
  abre direto.
- Resposta igual para "não achei" e "não confere": "Não encontramos pedido com esses dados. Confira o CPF/CNPJ e o
  celular." A consulta roda sempre, inclusive com documento inválido.
- Limite **na própria rota** (`checkRateLimit` direto, por IP e loja): 5 buscas/min e 20/h. Estourou: mesma tela com
  "Muitas tentativas, tente daqui a pouco". (Entrada em `RATE_LIMITS` não vale: o middleware sai em `surfaceForPath`
  antes do limitador.)
- **A página aberta pelo link do aviso mostra só aquele pedido.** A lista de outros pedidos aparece só depois da
  busca com documento + celular; um link vazado não abre o histórico.
- A tela mostra só: nº do pedido, data, etapas, transportadora/serviço, código, link de histórico. Nunca endereço,
  itens, valores, e-mail, telefone, nome completo ou documento.

### 1.4 WhatsApp

- Sai **só** pelo número do atendimento da loja (o `privado` da base), com `rastreio_enabled` ligado. O número dos
  grupos não manda privado.
- Texto fixo por etapa (sem variação), um link só (a página do pedido), sem promoção, sem convite de grupo, sem `@`.
  Modelos:
  - enviado: "Oi, {primeiro nome}! Seu pedido nº {nº} da {loja} foi enviado ({serviço}). Código de rastreio:
    {código}. Acompanhe aqui: {link}"
  - retirada: "Seu pedido nº {nº} da {loja} está pronto para retirada. Detalhes: {link}" (a Yampi não traz o local de
    retirada; a página manda combinar com a loja)
  - problema: "A transportadora não conseguiu entregar o pedido nº {nº} da {loja}. A loja já foi avisada e vai falar
    com você. Detalhes: {link}"
  - entregue: "Seu pedido nº {nº} da {loja} foi entregue. Se alguma peça não estiver certa, fale com a loja: {número
    da loja}" (sem link; se a loja não cadastrou número, termina em "fale com a loja.")
  - confirmado (desligado por padrão): "Recebemos o pagamento do pedido nº {nº} da {loja}. Acompanhe: {link}"
- Rodapé de todo modelo com link: "Aviso automático de pedido · para parar, use o link acima".
- Enfileira pelo produtor de DM da base com módulo `rastreio`, prioridade do aviso de pedido e `valid_until` = 24 h;
  guarda o id da `private_messages` em `tracking_notices.message_id`; lê o status por ele.
- Resposta da compradora: tratada pela base (seção "Resposta" do Recuperar: SAIR vira `private_optouts`). Com o
  Recuperar ligado, a resposta aparece em Conversas com o aviso no histórico. Loja **só com o Rastreio**: a base não
  guarda o texto (não há tela para ler), então a resposta automática é a "mensagem de ausência" do WhatsApp Business,
  ligada pelo lojista no celular do chip ("Este número só envia avisos de pedido da {loja}. Para falar com a loja:
  {número da loja}"). Ao ativar o Recuperar, o passo de ativação dele manda **desligar** essa mensagem, senão ela
  responde também a cliente da recuperação.

### 1.5 Avisos para a loja (sininho)

| Tipo | Quando | Também por e-mail |
|---|---|---|
| `rastreio_problema` | etapa `problema`, sempre (o texto à compradora diz "A loja já foi avisada") | só com "Me avisar por e-mail quando houver problema" ligado (padrão) |
| `rastreio_melhor_envio` | o Melhor Envio recusou a renovação da conexão (PR 8): "Reconecte o Melhor Envio para os avisos de entrega" | não |

Reconexão da Yampi e queda do número de privado são avisos da base. Dedupe por select antes do insert, como os outros
alertas (`notifications` não tem helper; insert direto).

## 2. Dados

Uma migração (`apps/web/supabase/migrations/<data>_rastreio_pedidos.sql` + linha no `deploy/supabase/apply-order.txt`).
Tabelas só do servidor (molde `bling_*`): RLS ligado, sem policy, `revoke all ... from anon, authenticated`, grants a
`service_role`. Toda store com `.eq('tenant_id', ...)`.

### 2.1 `tracking_orders`

`id` (uuid PK), `tenant_id`, `source` (`yampi`), `external_id`, `numero`, `order_created_at`, `status_raw`, `etapa`
(CHECK com as 8 do §1.1), `etapa_at`, `events jsonb` (`[{etapa, at}]`), `shipment_service`, `tracking_code`,
`tracking_url`, `buyer_first_name`, `buyer_phone` (canônico `55` + DDD + número, `telefoneCanonico`), `phone_key`
(gerada com `public.phone_key`), `phone_last4`, `buyer_email_enc` (`selar`, AAD
`rastreio:<tenant>:yampi:<external_id>:email` — o `id` só existe depois do upsert),
`doc_hmac`, `link_token` (único, 32 hex de `gen_random_bytes(16)`), `notices_stopped_at`, `purge_after`,
`created_at`, `updated_at`.

`unique (tenant_id, source, external_id)`; índices `(tenant_id, doc_hmac)`, `(tenant_id, etapa, etapa_at desc)`,
`(link_token)`.

### 2.2 `tracking_notices`

`id`, `tenant_id`, `order_id` (FK cascade), `etapa`, `channel` (`whatsapp` | `email`), `status` (`pendente` |
`enviando` | `enviado` | `entregue` | `lido` | `falhou` | `pulado`), `message_id` (`private_messages` da base, só
WhatsApp, `on delete set null`), `error`, `attempts`, `resends` (reenvio manual; entra nas chaves de idempotência),
`next_try_at`, `sent_at`, `created_at`, `updated_at`.
`unique (order_id, etapa, channel)`; índice de fila `(status, next_try_at) where status in ('pendente','enviando')`.

### 2.3 `tracking_settings`

`tenant_id` (PK), `public_slug` (único; padrão = slug do nome da loja), `matrix jsonb` (etapa → `{whatsapp, email}`,
padrão do §1.1), `notify_store_on_problem` (padrão true), `vip_link_id` (`tracked_links`, nulo = sem convite),
`store_whatsapp` (**sem padrão**; validado pela regra de `lib/bio/conferir.ts`, que recusa o número que posta nos
grupos; vazio = botão "Falar com a loja" escondido), `imported_at` (nulo = importação de 30 dias pendente),
`sweep_cursor` (varredura por `updated_at`, §3.2), `updated_at`.

Flag: `tenant_settings.rastreio_enabled` nasce no **banco comum** (B·1a do Recuperar, junto com `recuperar_enabled`,
porque a trava do número lê as duas), com trigger de guarda igual ao `instagram_enabled` (só o servidor escreve). O
Rastreio acrescenta `Liberacao = "rastreio"` em `painel-nav.ts`.

### 2.4 `melhorenvio_connections` (PR 8, migração própria)

Uma linha por loja (`tenant_id` único): `access_token` e `refresh_token` selados (secret-box, AAD
`melhorenvio:<tenant>:<campo>`), `expires_at`, `refresh_expires_at`, `status` (`ativa` · `reautorizar` ·
`desconectada`), `first_pass_at` (nulo = primeira passada, sem aviso, ainda não feita), `last_check_at`, `last_error`,
`created_at`, `updated_at`. Mesmo molde de `bling_connections`. Em `tracking_orders`, a coluna `carrier_checked_at`
(última consulta do pedido no Melhor Envio) espalha as consultas.

## 3. Fluxos

### 3.1 Ligar o Rastreio

Com a Yampi conectada (base) e `rastreio_enabled` ligado: cria `tracking_settings` com os padrões e importa os pedidos
dos últimos 30 dias pela API da Yampi (sem aviso). Sem Yampi conectada, a tela de Configurações › Rastreio leva à
conexão (Integrações › Yampi).

### 3.2 Gravar pedidos

Consumidor dos eventos `order.*` da inbox da base (logo depois do webhook, em `after()`) + cron `GET
/api/cron/rastreio` a cada 5 min (`vercel.json`, `classifyRequest`, `isCronAuthorized`) que: liga loja nova
(config + importação); faz a varredura de pedidos por `updated_at` com cursor próprio (a base não varre pedidos; o
cron comum `/api/cron/yampi` só reprocessa evento parado e recria o aviso da Yampi); manda os
e-mails pendentes; converte WhatsApp vencido/falho em e-mail; apaga o que passou do `purge_after` (uma vez por dia).

Upsert em `tracking_orders` por `(tenant_id, 'yampi', external_id)`: calcula etapa (§1.1), acrescenta em `events` se
mudou, normaliza telefone, `phone_last4`, `doc_hmac`, cifra e-mail, guarda só o primeiro nome. Se a etapa mudou e passa
no §1.2: cria as linhas de `tracking_notices` dos canais ligados (`on conflict do nothing`) e, se virou `problema`, o
aviso à loja. `purge_after` = 90 dias depois de `entregue`/`cancelado`.

### 3.3 Mandar e-mail

Logo após criar o aviso (`after()`) e no cron (retentativa): `sendEmail` com `kind: "rastreio"` (novo em `EmailKind`),
`idempotencyKey` = `rastreio:<id do aviso>:<resends>`, remetente com o nome da loja (`fromName` opcional novo em `sendEmail`, endereço do
`RESEND_FROM_EMAIL`). Layout próprio com a cara da loja (`lib/rastreio/email.ts`; o `layout()` de `templates.ts` é da
Girumo e privado). Rodapé com "Parar avisos" (link da página) e "Enviado pela Girumo em nome de <loja>". Convite do
grupo VIP só aqui e na página, se configurado e a compradora não estiver no grupo (por `phone_key` nos leads da loja).

### 3.4 Mandar WhatsApp

Para cada aviso `whatsapp` pendente: monta o texto do §1.4 e enfileira pelo produtor de DM da base (módulo
`rastreio`, telefone canônico, prioridade, `valid_until` 24 h); guarda `message_id`; status `enviando`. O status volta
pela base: enviado/entregue/lido → atualiza; falhou ou vencido → `falhou` + e-mail no lugar (§1.2).

### 3.5 Página pública

- Host da Girumo: `GET/POST /rastreio/[slug]` (busca e lista), `GET /rastreio/[slug]/[token]` (pedido),
  `POST /rastreio/[slug]/[token]/parar`. Domínio do lojista: `/rastreio`, `/rastreio/[token]`,
  `/rastreio/[token]/parar`.
- HTML do servidor no molde de `lib/bio/rota-publica.ts`: `x-nonce`, `x-robots-tag: noindex`,
  `cache-control: private, no-store`; um script mínimo com nonce só para "Copiar".
- Registros: entrada `/rastreio/:path*` no `matcher` do `middleware.ts`; `NonceSurface "rastreio"` em `csp.ts`
  (nonce + `strict-dynamic`, sem terceiros; teste em `csp.test.ts`); `disallow "/rastreio/"` no `robots.ts` e em
  `brand-routes.test.ts`; `customHostRoute` com o tipo novo e `/rastreio` em `ROOT_RESERVED` (`host.ts`,
  `host.test.ts`). Limite na rota (§1.3).
- Loja: pelo `public_slug` no host da Girumo; pelo dono do domínio (`getActiveDomainTenant`) no domínio do lojista.
  Loja sem `rastreio_enabled` = 404.
- O link dos avisos usa o domínio do lojista se estiver ativo; senão o host público do link da bio
  (`www.girumo.com.br/rastreio/<slug>/<token>`; `app.` e o apex respondem 308 para o `www`, como na bio).
  Pedido purgado = "Pedido não encontrado" com a busca.
- Cor da loja: a do link da bio, se existir; senão neutra.

### 3.6 Marcos do Melhor Envio (PR 8)

- **Conectar:** a lojista autoriza o app da Girumo na conta dela do Melhor Envio (OAuth, escopos só de leitura
  `orders-read` e `shipping-tracking`), no molde da conexão do Bling (`/api/integracoes/bling/conectar` e `/retorno`,
  `lib/bling/oauth.ts`). `User-Agent` com o e-mail técnico, como a API exige.
- **Consultar:** no cron do Rastreio, a cada 30 min, por loja com o Melhor Envio `ativa`: os pedidos em `enviado` ou
  `problema`, com código, enviados há menos de 30 dias e não consultados há 30 min (`carrier_checked_at`) → busca a
  etiqueta pelo código → marco do §1.1 → grava pelo mesmo caminho do pedido (RPC do PR 1) → avisos do §1.2. Sem
  webhook: ele não dispara para etiqueta criada pelo app da Yampi, pelo Bling ou pelo site. A forma de busca (por
  código ou listando por status) a Fase 0 decide.
- **Volume:** baixo (dezenas de pedidos a caminho por loja), dentro de 250 requisições por minuto por conta. Se crescer
  acima do normal, avisar o Melhor Envio (termo 17.3).
- **Chave:** o acesso vale 30 dias e a renovação 45; o cron renova antes de vencer. Renovação recusada → `reautorizar`,
  sininho `rastreio_melhor_envio` uma vez, e a loja segue só com a Yampi.
- **E-mail repetido:** o Melhor Envio manda e-mail a cada movimentação (ligado por padrão); a tela do Rastreio já
  avisa para desligar (Gerenciar › Configurações no Melhor Envio).

## 4. API (resumo)

| Rota | Quem | Faz |
|---|---|---|
| `GET /api/cron/rastreio` | cron | liga loja nova, varredura por `updated_at`, e-mails, fallback, purge; com o PR 8, os marcos do Melhor Envio |
| `GET /api/integracoes/melhor-envio/conectar` · `GET …/retorno` · `POST …/desconectar` (PR 8) | `settings:connection` | OAuth do Melhor Envio (com `state`), troca do código pela chave, desconectar |
| `GET/PATCH /api/rastreio/config` | `settings:connection` | matriz, convite, slug, número da loja |
| `GET/POST /api/rastreio/entregas` | `settings:connection` | lista + números do topo, filtros; busca por nº/nome/documento só por `POST` (CPF fora da query string e do log) |
| `POST /api/rastreio/entregas/[id]/reenviar` | `settings:connection` | recria o aviso da etapa atual nos canais ligados |
| `GET /api/rastreio/saude` | `settings:connection` | "X de Y enviados com código em 7 dias" + mais antigo sem código, para o cartão da Yampi |
| páginas `/rastreio/...` | público, limitado | §3.5 |

Contratos em `system/API_CONTRACTS.md` no PR do banco.

## 5. Telas (ver mockup)

- **Integrações › Yampi**: o cartão é da base; o Rastreio acrescenta o bloco "Código de rastreio nos pedidos enviados"
  (medidor de 7 dias, pedido mais antigo sem código, dica do Bling). Texto correto do que a Girumo faz na loja: lê os
  pedidos e cria o aviso (webhook) de pedido novo; não muda pedido, produto nem preço.
- **Configurações › Rastreio de pedidos** (porta nova em `lib/painel/configuracoes.ts` / `PORTAS`): o cartão do
  número do atendimento (da base: estado, aquecimento, ritmo, horário do número, conectar); avisos automáticos (matriz
  etapa × canal, "Ver mensagem", alerta de e-mail repetido, "Me avisar por e-mail quando houver problema"); página de rastreio
  (link, copiar, abrir, número da loja, convite do VIP + link de campanha). Com o PR 8 no ar e o Melhor Envio
  desconectado, uma linha junto da matriz: "Para avisar 'entregue' e 'não entregue' sozinho, conecte o Melhor Envio".
- **Integrações › Melhor Envio** (PR 8): cartão no molde do cartão do Bling (conectar, estado, reconectar, desconectar) com
  "X entregas confirmadas pelo Melhor Envio em 7 dias". Sem tela nova no mockup: repete o padrão dos cartões que já
  existem.
- **Vendas › Entregas**: a página Vendas não tem abas hoje; ganha a barra "Registrar venda | Entregas". Números do topo,
  filtros, busca, tabela densa. **Só dono e admin na v1** (a vendedora tem promessa de "nunca a lista de contatos").
- **Página da compradora**: busca (CPF ou CNPJ + celular), lista quando há mais de um, pedido, problema, "não quero
  mais avisos". A lista "Outros pedidos" do mockup só aparece vindo da busca.
- **E-mail** e **WhatsApp**: como no mockup (WhatsApp sem botões, texto fixo).

## 6. Erros e bordas

| Caso | Comportamento |
|---|---|
| Webhook duplicado ou fora de ordem | upsert + etapa que não volta; aviso único por chave |
| Pedido sem documento, sem celular ou sem e-mail | grava; a busca não acha sem documento/celular; canal sem contato não gera aviso |
| Número do atendimento caído ou restrito | as DMs falham ou vencem pela base (em até 24 h) → e-mail no lugar |
| Loja com Bling e Yampi | o Rastreio lê só a Yampi; `orders` (vendas do funil) segue só pelo Bling |
| Loja desliga o Rastreio | página 404, cron pula a loja; dados ficam até o `purge_after` |
| Pedido de PJ | busca por CNPJ; primeiro nome vem do nome do contato ou fica em branco ("Olá!") |
| Etiqueta não achada no Melhor Envio (comprada fora dele ou em outra conta) | nada muda; o pedido segue só pela Yampi |
| Melhor Envio recusa a renovação da chave | conexão `reautorizar`, sininho uma vez; a loja segue só com a Yampi |

## 7. Segurança e LGPD

- Documento nunca em texto: só `doc_hmac` com pepper em env (`RASTREIO_DOC_PEPPER`, nos dois ambientes). Trocar o
  pepper exige reimportar.
- E-mail cifrado (secret-box), aberto só para mandar. Telefone em texto como no resto da Girumo. Só o primeiro nome.
- Apagar 90 dias depois da última etapa.
- Página: resposta genérica, limite na rota, nada de endereço/itens/valores/documento, link com token de 128 bits que
  abre um pedido só, `noindex`, `no-store`.
- Multi-tenant: `.eq('tenant_id')` em toda store; tabelas sem acesso de `anon`/`authenticated`.
- Base legal: execução do contrato de compra (LGPD art. 7º V); a loja é controladora, a Girumo operadora. Atualizar
  `/privacidade` (dados do pedido para aviso de entrega; Yampi como fonte).
- "Falar com a loja" nunca aponta para o número que posta nos grupos (`conferir.ts`).
- Melhor Envio (PR 8): chaves seladas (secret-box), `state` no OAuth contra CSRF, escopos só de leitura; a Girumo nunca
  compra nem altera etiqueta (o termo 22.4 proíbe revender etiqueta).

## 8. Testes

- Puros: etapa por status (tabela inteira + ordem que não volta), documento (CPF e CNPJ: normalização, dígitos, HMAC),
  montagem das mensagens (um link só, sem `@`, texto fixo), escolha de canal (matriz, parar avisos, fallback).
- Store com PostgREST falso: upsert do pedido, aviso único, filtro de tenant.
- Integração contra o banco dev (job e2e): `unique (order_id, etapa, channel)` segura reenvio; purge.
- Rotas: busca (genérica, limite por minuto e por hora, lista), página por token (um pedido só), parar avisos.
- E2E: busca → lista → pedido → parar avisos, com loja QA e pedido semeado; registros de rota (CSP com nonce, robots).
- Mutantes que os testes têm de matar: aviso duplicado no reenvio; etapa voltando; busca que diferencia "não achei" de
  "não confere"; página por token listando outros pedidos; "parar avisos" gravando em `optouts`.
- Melhor Envio (PR 8): marco → etapa (tabela inteira do §1.1), casamento pelo código, primeira passada sem aviso,
  janela de 3 dias pela data do marco, renovação e `reautorizar`. Mutantes: etiqueta de outro pedido (código
  diferente) mudando a etapa; `paused` depois de `entregue` voltando a etapa.

## 9. PRs (um por coisa, ≤ ~10 arquivos)

0. **Base** — PRs do spec do Recuperar marcados "comum": **1a** banco comum (`yampi_connections`, `yampi_events`, o
   número `privado` por loja, `private_conversations`, `private_messages`, `private_number_state`, `private_signals`,
   `private_optouts`, campos do DM no `engine_commands`, as flags `recuperar_enabled` e `rastreio_enabled`, CHECK dos
   módulos), **2a** número do atendimento: seletores, **2b** conectar e cartão, **3** envio de DM, **4** resposta e
   status, **6** Yampi: aviso e processador, **6b** cliente da API, 401 e cron (o cartão da Yampi, que o painel do
   Rastreio usa, é do **6c**). Quem chegar primeiro faz.
1. **Banco do Rastreio** — `tracking_orders`, `tracking_notices`, `tracking_settings`, RPCs; tipos e stores;
   `API_CONTRACTS.md`; baseline; `infra/tests/rastreio-check.sql`. Depende do 1a (a flag mora lá).
2. **Pedidos** — etapas (puro), documento, consumidor da inbox, importação de 30 dias, cron do Rastreio.
3. **Página pública** — rotas, render, registros, limite, lista, parar avisos.
4. **E-mail** — layout da loja, `kind: "rastreio"`, `fromName`, envio dos avisos que o PR 2 cria, retentativa, e-mail
   de problema à loja.
5. **WhatsApp** — enfileirar pela base, ler status, fallback para e-mail.
6. **Painel** — Configurações › Rastreio de pedidos, Vendas › Entregas, bloco de saúde no cartão da Yampi, sininho,
   flag e menu.
7. **Privacidade e prova** — `/privacidade`, roteiro de prova em prod, card.
8. **Melhor Envio** — conexão (OAuth no molde do Bling), consulta dos marcos no cron do Rastreio (§3.6), entregue, não
   entregue e pausado, cartão em Integrações, sininho de reconexão. Só com as provas 4 e 5 da Fase 0; o plano dele é
   escrito com o resultado delas.

Ordem: B·1a → 1 → (B·6, B·6b) → 2 → (3, 4, 6) → 5; o 5 espera também B·3 e B·4; o 6 usa os cartões do B·2b e
do B·6c. O **8 vem logo depois do 4** (e-mail), se a Fase 0 pedir; ele e o 5 mexem no `cron.ts` do Rastreio, então
um de cada vez. Nenhuma loja ganha `rastreio_enabled` antes do B·2a em `main` e do redeploy do worker (regra da base: o
worker antigo escolheria o número do atendimento para o auto-grow e as ações em massa). Página e e-mail podem
ir ao ar antes do WhatsApp. O PR 1 pode sair antes da Fase 0. Implementação em outro chat, PR a PR (índice em
`docs/superpowers/plans/2026-10-29-rastreio-pedidos-00-indice.md`).

## 10. Fase 0 (antes do código) e roteiro do Igor

Provas, sem código de produto (a 1 é a mesma do Recuperar):

1. **Payload real da Yampi** da piloto: `customer` (cpf/cnpj, `type`, nome, e-mail, telefone), `track_code`, aliases
   de status, `include=statuses` com data, assinatura. Contar quantos pedidos são PJ ou vêm sem documento.
2. **Código de rastreio chegando à Yampi**: nos pedidos enviados dos últimos 30 dias, quantos têm `track_code`.
   Critério: **≥ 80%** com código (ou causa conhecida e consertável: ligar a sincronização do Bling ou usar o app do
   Melhor Envio da Yampi). Abaixo disso, o aviso "enviado" fica desligado até consertar; página e demais etapas valem.
3. **Base do privado** provada pela base (chip de teste, envio, status por id, número sem WhatsApp).
4. **"Entregue" chegando à Yampi**: nos pedidos da piloto enviados entre 15 e 45 dias atrás, quantos chegaram a
   `delivered` (ou `delivered = true`) na Yampi. Sai do mesmo levantamento da prova 1. Critério: **abaixo de 80%** → o
   PR 8 (Melhor Envio) entra logo depois do e-mail, se a prova 5 passar; 80% ou mais → o PR 8 fica para depois.
5. **O Melhor Envio enxerga as etiquetas da piloto**: com o app de teste da Girumo autorizado só para leitura na conta
   do Melhor Envio da piloto (no sandbox, se der para reproduzir), conferir: (a) se ele lista as etiquetas criadas
   pelo app da Yampi, pelo Bling e pelo site; (b) se acha a etiqueta pelo código que está na Yampi, e se esse código é
   o `tracking` ou o `self_tracking`; (c) qual campo traz a data de cada marco; (d) o que o `paused` cobre em etiquetas
   reais. Sem (a) ou (b), o PR 8 não anda: entregue e problema ficam com a lojista (ou com um serviço pago de rastreio,
   fase 4).

Roteiro do Igor para a piloto: o chip do número do atendimento (o mesmo do Recuperar); alias, token e chave da Yampi
(Perfil › Credenciais de API; trocar a senha da Yampi troca o token); desligar o e-mail de rastreio do Melhor Envio
(ou deixar o nosso desligado); com o Recuperar desligado, a mensagem de ausência no WhatsApp Business do chip (§1.4);
link da página no menu da loja Yampi e na bio; `RASTREIO_DOC_PEPPER` na Vercel (os dois ambientes). Para as provas
4 e 5 e o PR 8: criar o app da Girumo no Melhor Envio (Integrações › Área Dev; produção exige conta PF verificada, com
documento e selfie), pôr `MELHORENVIO_CLIENT_ID` e `MELHORENVIO_CLIENT_SECRET` na Vercel (os dois ambientes) e
autorizar o app na conta da piloto.

## Decisões tomadas por mim (conferir)

- Base comum = a do spec do Recuperar (número de privado dentro de `instances` com trava no worker), no lugar do
  primeiro desenho deste documento (número fora de `instances`).
- Busca por **CPF ou CNPJ** + 4 dígitos do celular; link do aviso abre um pedido só; lista só pela busca.
- Texto fixo por etapa (§1.4); convite do VIP só na página e no e-mail.
- Matriz padrão do §1.1 (confirmado desligado; entregue só WhatsApp).
- `store_whatsapp` sem padrão e validado contra o número dos grupos.
- `public_slug` próprio do rastreio (não depende do link da bio).
- Retenção de 90 dias; critério de 80% na Fase 0.
- Entregas só para dono e admin na v1; na linha com problema, o botão "Chamar compradora" usa o telefone do pedido
  (a loja é a controladora e só dono/admin veem).
- Loja só com o Recuperar: o Rastreio não grava pedido.
- Ajustes da revisão dos planos (29/10): o WhatsApp da retirada diz "Detalhes: {link}" (não há local de retirada nos
  dados); o sininho do problema sai sempre e o "me avisar" vale só para o e-mail à loja; a varredura avisa dentro dos
  3 dias; pedido importado sem histórico datado não ganha data inventada; quem mandou SAIR (ou está em `optouts`)
  recebe o aviso por e-mail no lugar do WhatsApp; a busca de Entregas vai por `POST`.
- Melhor Envio (30/10): `paused` vira `problema`; a etiqueta casa com o pedido pelo código de rastreio; consulta a
  cada 30 min, só de pedidos a caminho; a primeira passada depois de conectar não avisa; critério de 80% de "entregue"
  na Yampi para decidir se o PR 8 entra; cartão no padrão dos que já existem, sem tela nova no mockup.

## Pendências do Igor

1. **Como cobra**: Rastreio (página + e-mail) dentro do plano e o WhatsApp pelo add-on do número de privado; ou tudo
   como add-on. Sem decisão, a v1 é ligada pelo admin, sem cobrança, e os avisos só saem para loja com plano ativo
   (`tenantGrantsPlan`). Só precisa de resposta antes de abrir para outras lojas.

## Fora da v1

Do Melhor Envio, tudo além dos marcos do PR 8 (a API não dá o histórico completo); "saiu para entrega" e "aguardando
retirada" por serviço pago de rastreio (fase 4), Bling como
fonte para loja sem Yampi (fase 5), app oficial da Yampi (OAuth), vendedora em Entregas, Yampi alimentando `orders`
(vendas do funil), escrever o rastreio de volta na Yampi (`POST /orders/{id}/tracking`).
