# Funil de anúncios no Resultados — design

**Data:** 10/10/2026 · **Status:** desenho aprovado pelo Igor em 4 partes + mockup
**Mockup:** https://claude.ai/artifact/SZzoKhxrY8zvLup3znoemi (Resultados › Anúncios, Detalhe do anúncio,
Lançar gasto, Celular, Mini-funil A/B, Integração do site, Vazio, Regras)
**Loja-piloto:** Moda kids do Sul atacado (`076cafce-4aa6-4203-8b60-3b68228e886f`), site próprio
`modakidsdosul.com.br/vip`

## Problema

O lojista anuncia no Meta, a pessoa se cadastra numa página com o WhatsApp, entra no grupo e um dia compra.
Hoje o Resultados não diz **qual campanha, conjunto ou anúncio trouxe quem comprou**. Medido em prod em
10/10/2026 na loja-piloto:

| O que | Valor |
|---|---|
| Páginas da Girumo (`/p/`) | nenhuma; o cadastro é num site próprio (Cloudflare, `POST /api/lead` do domínio dela) |
| Link `vip-atacado` (mestre, rotador) | 640 cliques em 30 dias |
| Entradas no grupo (`leads`) | 1.213 em 30 dias, **todas** com `source_campaign = null` |
| Contatos sem telefone | 0 de 1.214 |
| Telefone dos contatos | 970 com 12 dígitos (sem o nono), 244 com 13 |
| Pedidos | 32 (R$ 58,6 mil), 06 a 08/10, **todos com telefone**; só 11 com `lead_id` |

Onde a corrente quebra (código da `main`, `fb43af33`):

- `/r/[slug]` (`lib/links/short-link-click.ts`) grava `link_click_events` só com `tenant_id`,
  `tracked_link_id` e `campaign_group_id`. O grupo escolhido (`target.groupId`) não é gravado.
- O worker (`apps/worker/src/event-loop.ts`) cria o lead com `source_campaign = null`. Nada liga entrada
  a clique ou cadastro.
- O cadastro do site da loja nunca chega à Girumo.
- Venda só existe lançada à mão (`orders`, telefone presente).
- Não existe gasto de anúncio no banco.

## Decisões do Igor (10/10)

| Pergunta | Decisão |
|---|---|
| Como o anúncio leva ao grupo | Página com cadastro de WhatsApp (site próprio da loja) |
| Como o cadastro chega na Girumo | **Webhook** do servidor do site; a resposta devolve o link do grupo com `cid` (uma chamada só) |
| Gasto | **v1 com gasto digitado** por campanha; API do Meta na fase 2 |
| Onde calcular | **Na leitura** (função no banco), sem carimbar no worker |
| Páginas `/p/` da Girumo | Entram na mesma junção (origem); o degrau "foi pro grupo" delas fica pra depois |
| Visual | **Funil de verdade** (degraus que afinam), não barras |
| Mini-funil | **A** (deitado, na linha da tabela) no computador; **B** (cartão com funil em pé) no celular |
| Onde fica | **Aba nova "Anúncios"** no Resultados, ao lado da Visão geral |

## Abordagem

Atribuição **calculada na hora de ler**, pelo telefone:

1. O site manda o cadastro (telefone + `page_url` com UTMs + `fbc`/`fbp` + `event_id`) para a Girumo.
2. A Girumo grava em `site_captures` e responde o link `/r/<slug>?cid=<id do cadastro>`.
3. O `/r/` passa a gravar no clique o `cid` e o grupo escolhido.
4. Worker e pedidos não mudam.
5. `attribution_report(tenant, de, até)` junta cadastro ↔ contato ↔ pedido por uma **chave de telefone**
   e devolve o funil por campanha › conjunto › anúncio.

Por que na leitura e não carimbando no worker: vale para trás (os 32 pedidos e 1.214 contatos já casam
quando os cadastros chegarem), não toca o caminho de captura que capta 99% hoje, mudar a regra não exige
reprocessar, e os 21 pedidos sem `lead_id` (R$ 48,8 mil) casam pelo telefone do pedido.

Por que webhook e não só UTM no link: metade das entradas da loja não passa pelo link (1.213 entradas ×
640 cliques). Casar por horário atribuiria convites repassados a anúncios, com erro invisível. Pelo
telefone o casamento é verificável.

## 1. Regras de atribuição

**Pessoa = chave de telefone** (`phone_key`): DDD + últimos 8 dígitos, depois de tirar tudo que não é
dígito, zeros à esquerda e o `55` do país (quando sobram ≥ 12 dígitos). Resolve o nono dígito.
Exemplos que dão a mesma chave `6299998888`: `(62) 99999-8888`, `556299998888`, `+55 62 99999-8888`,
`5562 9999-8888`. Menos de 10 dígitos → chave nula (não casa nada).
Colisão conhecida: fixo `XXXX-XXXX` e celular `9XXXX-XXXX` com os mesmos 8 finais no mesmo DDD. Raro; aceito.

**Uma regra: vale o último cadastro da pessoa antes do evento.**

| Evento | Cadastro que leva o crédito |
|---|---|
| Entrada no grupo (`leads.entered_at`) | o último com a mesma chave em `[entered_at − 7 dias, entered_at]` |
| Pedido (`orders.created_at`) | o último com a mesma chave em `[created_at − 90 dias, created_at]` |

- Janelas são constantes nomeadas (`JANELA_ENTRADA = 7 dias`, `JANELA_VENDA = 90 dias`) dentro da função.
- Uma conversão nunca conta para dois cadastros.
- **Já era membro:** cadastro feito por quem tem lead com `entered_at` anterior ao cadastro. Não conta
  como entrada; os pedidos depois do cadastro contam normalmente (regra da tabela).
- **O período escolhe os cadastros (coorte).** "30 dias" = cadastros com `created_at` nos últimos 30 dias
  (fuso `America/Sao_Paulo`), acompanhados até agora. Cada degrau cabe no anterior. A tela avisa que o
  período recente ainda está vendendo.
- **Fora dos anúncios** é por data do evento: entradas do período sem cadastro na janela de 7 dias, e
  pedidos do período sem cadastro na janela de 90. Não fecha soma com a Visão geral (coorte × data do
  evento) e a tela não promete isso.

**Hierarquia:** `utm_campaign` › `utm_term` (conjunto) › `utm_content` (anúncio), com `utm_source` só no
bloco "por onde" (Instagram, Facebook, outros). Cadastro sem `utm_campaign` vai para a linha "(sem UTM)".
Valor vazio vira nulo; valores são comparados exatamente como chegaram (renomear anúncio no Meta divide o
histórico: limite aceito e avisado na tela de integração).

Parâmetros que a tela de integração manda colar no anúncio:

```
utm_source={{site_source_name}}&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}
```

**Degraus por linha:**

| Degrau | Conta |
|---|---|
| Cadastros | cadastros da coorte (eventos; o reenvio do mesmo `event_id` não duplica) |
| Foram pro grupo | cadastros da coorte com pelo menos um clique com aquele `capture_id` |
| Entraram | entradas cujo cadastro creditado é da linha |
| Já eram membros | cadastros da linha feitos por quem já estava no grupo |
| Compraram | chaves distintas com pedido creditado à linha |
| Pedidos / Vendido | contagem e soma de `orders.value` creditados à linha |
| Gasto | `ad_spend` da campanha, proporcional aos dias do lançamento que caem no período |

Soma das linhas pode passar do total em "Compraram" quando a mesma pessoa comprou por dois anúncios
(cada pedido vai para um só, a pessoa conta nos dois). O total é calculado direto, não somado.

**Gasto proporcional:** lançamento de R$ 1.620 de 11/09 a 10/10 (30 dias) num filtro de 7 dias que pega 7
desses dias entra como 1.620 × 7/30. Custo por cadastro/entrada/comprador e retorno (vendido ÷ gasto) só
na linha de campanha e no total; conjunto e anúncio mostram "—".

## 2. Dados

Uma migração, nos **dois** bancos (dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`), entrada em
`deploy/supabase/apply-order.txt`, `create … if not exists`, RLS ligado, depois advisor de segurança e
baseline do gate de drift. Conferido em prod em 10/10: nenhum destes objetos existe; os PRs abertos
(#403, #415, #416) não tocam neles.

```sql
-- Chave de telefone: DDD + últimos 8 dígitos (regra §1).
create or replace function public.phone_key(p text) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case when length(d) >= 10 then left(d, 2) || right(d, 8) end
  from (
    select case when length(x) >= 12 and left(x, 2) = '55' then substr(x, 3) else x end as d
    from (select regexp_replace(regexp_replace(coalesce(p, ''), '\D', '', 'g'), '^0+', '') as x) a
  ) b
$$;

create table if not exists public.site_integrations (
  tenant_id       uuid primary key references public.organizations(id) on delete cascade,
  key_hash        text not null unique,      -- sha256 hex da chave; a chave inteira nunca é guardada
  key_last4       text not null,
  tracked_link_id uuid not null references public.tracked_links(id) on delete restrict,
  created_at      timestamptz not null default now(),
  rotated_at      timestamptz,
  last_used_at    timestamptz
);

create table if not exists public.site_captures (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.organizations(id) on delete cascade,
  whatsapp        text not null,             -- +55DDDNÚMERO, de normalizeWhatsappBR
  phone_key       text generated always as (public.phone_key(whatsapp)) stored,
  event_id        text not null,
  tracked_link_id uuid references public.tracked_links(id) on delete set null,
  page_url        text,
  utm_source text, utm_medium text, utm_campaign text, utm_content text, utm_term text,
  fbclid text, fbc text, fbp text,
  created_at      timestamptz not null default now(),
  unique (tenant_id, event_id)
);
create index if not exists site_captures_tenant_key_idx on public.site_captures (tenant_id, phone_key, created_at desc);
create index if not exists site_captures_tenant_created_idx on public.site_captures (tenant_id, created_at);

create table if not exists public.ad_spend (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.organizations(id) on delete cascade,
  utm_campaign text not null check (char_length(utm_campaign) between 1 and 200),
  starts_on    date not null,
  ends_on      date not null check (ends_on >= starts_on),
  amount       numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  created_by   uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists ad_spend_tenant_idx on public.ad_spend (tenant_id, starts_on);

alter table public.link_click_events
  add column if not exists capture_id uuid references public.site_captures(id) on delete set null,
  add column if not exists whatsapp_group_id text;   -- o que resolveClickTarget devolve em groupId
create index if not exists link_click_events_capture_idx on public.link_click_events (capture_id) where capture_id is not null;

-- Junção pela chave nas tabelas que já existem.
create index if not exists leads_tenant_phone_key_idx  on public.leads  (tenant_id, public.phone_key(phone));
create index if not exists orders_tenant_phone_key_idx on public.orders (tenant_id, public.phone_key(phone));
create index if not exists lp_contacts_tenant_phone_key_idx on public.lp_contacts (tenant_id, public.phone_key(whatsapp));
```

**RLS e privilégios:**

- `site_integrations`, `site_captures`, `ad_spend`: RLS ligado. `authenticated` só `select`, com policy no
  padrão que funciona (`app.has_membership(tenant_id)`, ver CLAUDE.md "RLS não é uniforme"). Escrita só pelo
  `service_role` (as rotas usam `getSupabaseAdmin` e filtram `.eq('tenant_id', …)`; o filtro é a proteção).
  Nenhum grant de escrita a `authenticated`.
- `site_integrations` nem `select` para `authenticated`: o hash não tem por que sair do servidor.
- `ad_spend` também sem `select` para `authenticated` (sem policy): gasto é dado de caixa e só owner/admin
  lê, pela rota com `ads:manage` (§3). `has_membership` deixaria qualquer operador ler pelo PostgREST.
  Decidido na revisão final do PR 1 (10/10).
- `anon` fica sem nada: o event trigger `ensure_anon_revoked` cobre tabela nova; conferir depois.
- `attribution_report`: `security definer` + `set search_path = ''`; `revoke execute … from public, anon,
  authenticated`; `grant execute … to service_role`. Função nova nasce chamável por `authenticated`
  (default privilege): revogar explicitamente e conferir com `has_function_privilege`.
- `phone_key` é pura; pode ficar executável.

### `attribution_report(p_tenant uuid, p_de date, p_ate date) returns jsonb`

Lê `site_captures` ∪ (`lp_captures` ⨝ `lp_contacts.whatsapp`, com `fonte = 'pagina'`), `link_click_events`,
`leads`, `orders` (telefone do pedido; se vazio, o do lead por `lead_id`) e `ad_spend`, **todas filtradas por
`tenant_id = p_tenant`**. Agrega no banco (sem o teto de 1000 linhas do PostgREST). Formato:

```json
{
  "periodo": { "de": "2026-09-11", "ate": "2026-10-10" },
  "total":   { "cadastros": 612, "foram": 571, "entraram": 498, "ja_membros": 34,
               "compradores": 46, "pedidos": 58, "vendido": 21760.00, "gasto": 2840.00 },
  "linhas":  [ { "nivel": "campanha", "campanha": "VIP Atacado — Goiânia", "conjunto": null, "anuncio": null,
                 "cadastros": 371, "foram": 348, "entraram": 304, "ja_membros": 20,
                 "compradores": 31, "pedidos": 39, "vendido": 14980.00, "gasto": 1620.00 } ],
  "por_origem": [ { "origem": "ig", "cadastros": 356, "vendido": 12420.00 } ],
  "por_dia":    [ { "dia": "2026-09-11", "cadastros": 12, "entraram": 10 } ],
  "fora":       { "entradas_sem_cadastro": 715, "pedidos_sem_origem": 7, "vendido_sem_origem": 4120.00 }
}
```

- `linhas` traz os três níveis já agregados (campanha; campanha+conjunto; campanha+conjunto+anúncio);
  `gasto` só no nível campanha (nulo nos outros).
- `p_de > p_ate`, intervalo > 400 dias ou tenant inexistente: `raise exception` com mensagem; a rota
  traduz para 400.
- Performance: alvo < 500 ms na loja-piloto. Medir com `explain analyze` em prod antes do merge (ver §9).

## 3. API

### `POST /api/integracoes/cadastro` (servidor do site → Girumo)

- **Pública com teto:** `POST /api/integracoes/cadastro` → `public-rate-limited` em
  `lib/security/request-access-policy.ts` **e** entrada em `RATE_LIMITS` do `middleware.ts` (sem a entrada o
  teto é fail-open, ver comentário lá). Teto por IP folgado (120/min: o IP é do Cloudflare, compartilhado);
  dentro do handler, teto por chave com `checkRateLimit("site-key:<tenant>", 60, 60_000)` → 429.
- **Auth:** `Authorization: Bearer gk_live_<43 chars base64url>` (32 bytes aleatórios). Busca por
  `key_hash = sha256(chave)`; sem linha → 401 sem detalhe. Atualiza `last_used_at` em `after()`.
- **Corpo** (zod, `.strict()`):
  - `whatsapp`: string ≤ 40 → `normalizeWhatsappBR`; nulo → **422** `{ "error": "numero" }`.
  - `page_url`: URL http(s) ≤ 2048. UTMs (`utm_source/medium/campaign/content/term`) e `fbclid` lidos dela
    no servidor, cada um aparado e cortado em 200; vazio vira nulo.
  - `event_id`: 8–100 chars `[A-Za-z0-9_-]`.
  - `fbc`, `fbp`: opcionais, `^fb\.\d\.\d+\.[A-Za-z0-9_.-]{1,200}$`.
  - Campo desconhecido → 400.
- **Grava** `site_captures` com `tracked_link_id` da integração. Conflito em `(tenant_id, event_id)` → **200**
  com o mesmo `redirect` (o site reenvia no segundo toque). Novo → **201**.
- **Resposta:** `{ "redirect": "<origem>/r/<slug>?cid=<uuid>", "capture_id": "<uuid>" }`. A origem é a do
  link da loja: domínio próprio verificado quando houver (mesma regra do `/r/` em domínio próprio), senão a
  origem do app.
- **Nunca** guarda IP nem user-agent.
- Erros 5xx não vazam mensagem de banco.

### `/r/[slug]?cid=` (mudança em `short-link-click.ts`)

- `cid` só é aceito se for uuid **e** existir em `site_captures` com o mesmo `tenant_id` do link (uma
  consulta filtrada por tenant). Caso contrário é ignorado em silêncio.
- `recordTrackedLinkClick` passa a receber `{ captureId, whatsappGroupId }` e grava as colunas novas.
  `whatsappGroupId = target.groupId ?? null`.
- Continua: só humano grava; `Promise.allSettled`; o redirecionamento nunca espera nem quebra por isso.

### `GET /api/resultados/anuncios?de=YYYY-MM-DD&ate=YYYY-MM-DD`

- `getRouteTenantContext(req, { allowEngine: false })`; chama `attribution_report` pelo `getSupabaseAdmin`
  com o `tenantId` do contexto (nunca do query string).
- Valida datas (formato, `de ≤ ate`, ≤ 400 dias) → 400. Default: últimos 30 dias em `America/Sao_Paulo`.
- Fora do mapa da vendedora (`lib/auth/modulos.ts` é fechado por padrão: nada a fazer além de não incluir).

### Gasto — `GET/POST /api/anuncios/gasto`, `PATCH/DELETE /api/anuncios/gasto/[id]`

- Ação nova em `lib/permissions.ts`: `"ads:manage": ["owner", "admin"]`; `assertPermission` em todo verbo
  que escreve. GET também exige `ads:manage` (gasto é dado de caixa).
- Corpo validado com os mesmos limites do `check` da tabela; `utm_campaign` aparado.
- Toda query com `.eq('tenant_id', tenantId)`, inclusive PATCH/DELETE por id.

### Integração — `GET /api/integracoes/site`, `POST /api/integracoes/site/chave`

- `settings:connection` (owner/admin).
- GET: `{ ativa, key_last4, link: { id, slug }, last_used_at, recebidos_30d, ultimos: [ { hora, telefone_mascarado, anuncio, situacao } ] }`.
  Telefone sempre mascarado no servidor (`(62) 9••••-4821`).
- POST `/chave` com `{ tracked_link_id }`: confere que o link é da loja, gera chave nova, grava hash +
  last4 (upsert por tenant, `rotated_at = now()`), devolve a chave **uma vez**. A anterior para na hora.
- `situacao` dos últimos: "Entrou no grupo às HH:MM" / "Foi pro grupo, ainda não entrou" / "Já era do grupo"
  / "Comprou · R$ X", pela mesma regra de §1.

## 4. Telas (ver mockup)

- **Resultados › aba Anúncios** (nova; a Visão geral não muda):
  - Faixa com 3 números: gasto lançado (com "lançar"), vendido, retorno.
  - Aviso amarelo de período recente.
  - **Funil** em degraus que afinam: largura `30% + 70% × n/cadastros`; o fundo de cada degrau fecha na
    largura do próximo.
    - À esquerda, a passagem do degrau; à direita, o custo de cada um.
    - Bico verde com o vendido e o retorno; nota de "já eram membros".
  - Gráfico por dia (cadastros × entraram), com anotação de início de campanha quando houver gasto
    lançado começando no dia.
  - Bloco "por onde" (Instagram/Facebook/outros).
  - Tabela campanha › conjunto › anúncio (abre e fecha), colunas:
    - Nome.
    - **Mini-funil A**: 4 degraus deitados, altura relativa aos cadastros da própria linha, taxa de compra
      na ponta, número de cada degrau no `title` e em texto para leitor de tela.
    - Gasto, Cadastros, Compraram, Vendido, Retorno.
  - "Ver quem" no anúncio abre a gaveta.
  - Bloco "fora dos anúncios".
  - Link "Como cada número é contado".
- **Gaveta do anúncio:** funil em pé pequeno; "por onde"; quem comprou (nome do WhatsApp, telefone
  mascarado, grupo, datas, total), "Ver os N em Contatos"; "Entraram e ainda não compraram" com link para
  Contatos filtrado.
- **Celular (< 768 px):** faixa rolável, funil em pé com o texto dentro dos degraus, **mini-funil B** (um
  cartão por campanha, funil em pé com bico em R$, retorno / taxa / custo por comprador), "Ver N conjuntos".
- **Lançar gasto:** diálogo com campanha (lista dos `utm_campaign` já recebidos), valor, de/até; lista de
  lançamentos com editar/excluir.
- **Configurações › Integrações › Site próprio:**
  - Situação (recebendo / último há N min).
  - Chave mascarada + "Gerar outra chave" (avisa que desliga a atual).
  - Link de destino.
  - Parâmetros de URL com "Copiar".
  - "Para quem programa o site" (envio e resposta).
  - "Enviar cadastro de teste".
  - Últimos 5 cadastros com situação.
- **Vazio:** sem nenhum cadastro com origem → "Tenho site próprio" / "Usar uma página da Girumo".
- Tema G2 (`#F3F5F7`, cartões brancos raio 12, números Manrope, dado em Plex Mono, base 14 / legenda 13).
  Acid só onde já é (Postar). Funil em tons de cobalt; bico em verde de sucesso.

## 5. Mudança no site da loja-piloto (fora deste repo)

O Igor pede/faz no projeto do site. Dentro da função `POST /api/lead` do Cloudflare, depois de validar o
número e antes de redirecionar:

```js
// ponytail: um tiro, 2 s; falhou → destino de sempre. A pessoa nunca fica fora do grupo.
const destinoPadrao = "https://<origem>/r/vip-atacado";
let destino = destinoPadrao;
try {
  const r = await fetch("https://<app>/api/integracoes/cadastro", {
    method: "POST",
    headers: { "authorization": `Bearer ${env.GIRUMO_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ whatsapp, page_url, event_id, fbc: cookie("_fbc"), fbp: cookie("_fbp") }),
    signal: AbortSignal.timeout(2000),
  });
  if (r.status === 201 || r.status === 200) destino = (await r.json()).redirect;
  else if (r.status === 422) return redirecionarComErroDeNumero();
} catch { /* fica no padrão */ }
return Response.redirect(destino, 303);
```

`GIRUMO_KEY` vai como secret da função, nunca no HTML.

## 6. Erros e bordas

| Caso | Comportamento |
|---|---|
| Girumo fora / lenta | O site manda pro link padrão em 2 s; perde-se só o degrau "foi pro grupo" daquela pessoa |
| Mesmo `event_id` de novo | 200, mesmo `redirect`, nada gravado |
| `cid` adulterado, de outra loja ou apagado | Ignorado; clique gravado sem `capture_id` |
| Chave trocada sem atualizar o site | 401; o site cai no link padrão (fail-safe); a tela de integração mostra "último há N h" |
| Contato `@lid` sem telefone | Não casa; vai para "fora dos anúncios" |
| Pessoa sai e volta ao grupo | Vale o `entered_at` do lead (o primeiro); o retorno conta como "já era membro" |
| Pedido sem telefone e sem lead | Não casa; "vendas sem origem" |
| Campanha renomeada no Meta | Duas linhas; avisado na integração |
| Gasto lançado para nome que nunca chegou | Aparece como linha de campanha só com gasto (cadastros 0) |
| Falha da consulta | A aba mostra erro com "Tentar de novo"; nunca zeros (mesmo padrão `carga` da Vitrine) |
| Loja sem nenhum cadastro com origem | Tela Vazio |

## 7. Segurança

- Tabelas novas com `tenant_id` e RLS; toda store filtra `.eq('tenant_id', …)` (service-role bypassa RLS).
- Chave: 32 bytes de `crypto.getRandomValues`, só o sha256 no banco, comparação por igualdade do hash
  (sem compare de string da chave), mostrada uma vez, troca invalida a anterior.
- Endpoint público com teto no middleware + teto por chave; corpo `.strict()`; tamanho máximo de corpo 8 KB.
- Nenhum IP, user-agent ou corpo cru é guardado; logs sem telefone.
- Telefone sai mascarado em toda resposta de lista (integração, gaveta mostra o nome do WhatsApp e o
  telefone mascarado; o número inteiro continua só em Contatos).
- `attribution_report` só pelo `service_role`; a rota sempre passa o tenant do contexto.
- Vendedora não alcança nenhuma rota nova (mapa fechado); gasto e chave exigem owner/admin.
- Advisor de segurança do Supabase depois da migração nos dois bancos.

## 8. Testes

- **Unidade** (vitest):
  - leitura de UTMs do `page_url` (vazio, repetido, acentos, > 200);
  - schema do corpo (campo extra, `event_id` inválido, `fbc` inválido);
  - hash e last4 da chave;
  - máscara de telefone;
  - geometria do funil grande e do mini-funil (larguras, insets, bico, linha com 0 compras);
  - proporção do gasto;
  - datas do período em `America/Sao_Paulo`.
- **Store com PostgREST falso** (técnica registrada): insert com conflito de `event_id` devolve o mesmo
  `capture_id`; `cid` de outro tenant é recusado.
- **Integração no banco de dev** (job e2e): fixture com uma loja e os casos da §1 (Maria; nono dígito;
  já era membro; janelas de 7 e 90 dias exatas; sem origem; sem UTM; mesma pessoa por dois anúncios;
  gasto proporcional) contra `attribution_report`. Mais uma loja com **1.500 leads** para provar que nada
  corta em 1000. E um teste de isolamento: dados de outra loja nunca entram no relatório.
- **Privilégio:** `has_function_privilege('authenticated', 'public.attribution_report(uuid,date,date)', 'execute')`
  falso nos dois bancos.
- **E2E** (Playwright, CI): gerar chave → `POST /api/integracoes/cadastro` → seguir `redirect` → clique
  gravado com `capture_id` → aba Anúncios mostra o funil com o cadastro. Vendedora recebe 403 nas rotas novas.
- **Prova em prod** (card do quadro): depois da mudança no site da loja-piloto, um cadastro real aparece na
  integração e na aba, e o funil da loja bate com SQL direto.

## 9. Medições antes do plano (prod, leitura) — feitas em 10/10/2026

1. `app.upsert_lead`: no conflito atualiza só `last_seen_at`, `also_in` e `updated_at`; **`entered_at` é o da
   primeira entrada** e não muda na volta. Regra de §6 confirmada.
2. Volume: maior loja com 2.820 contatos; 4.141 contatos e 38 pedidos no banco inteiro; 1.678 cliques. A
   função junta milhares de linhas com índice por `phone_key`: `explain analyze` dispensado; o teste de
   integração com 1.500 contatos cobre o teto de 1000.
3. Loja-piloto tem domínio próprio **ativo**: `links.modakidsdosul.com.br`. O `redirect` sai nele, na raiz
   (`/vip-atacado?cid=`); o middleware reescreve para `/r/` preservando a query.
4. `lp_captures`: 7 cadastros no total, em 2 lojas. A união com as páginas `/p/` é barata.
5. Policies de referência: `leads`/`orders` leem por `app.user_tenant_ids()`, que já exclui a vendedora;
   as tabelas novas usam `app.has_membership(tenant_id)` (mesma exclusão).

## 10. PRs (um por coisa)

| # | Conteúdo | Arquivos (aprox.) |
|---|---|---|
| 1 | Migração (§2) + `apply-order` + baseline do drift + teste de integração da função + teste de privilégio | 5 |
| 2 | `POST /api/integracoes/cadastro` + stores `site-integrations`/`site-captures` + política de acesso + `RATE_LIMITS` + `POST /api/integracoes/site/chave` | 9 |
| 3 | Tela Configurações › Integrações › Site próprio + `GET /api/integracoes/site` | 5 |
| 4 | `/r/?cid=` em `short-link-click.ts` + `recordTrackedLinkClick` + testes | 4 |
| 5 | `GET /api/resultados/anuncios` + aba Anúncios: faixa, funil, gráfico, por onde, fora, vazio | 9 |
| 6 | Tabela com mini-funil A + gaveta do anúncio + cartões B no celular | 7 |
| 7 | Gasto: `ads:manage`, rotas, diálogo, ligação na faixa | 6 |
| 8 | Card `funil-anuncios` no quadro (prod): `move_card` a cada etapa; `no_ar_verificado` só com a prova de §8 | SQL |

A DDL do PR 1 é aplicada pelo Igor nos dois bancos (o classificador nega `apply_migration`).

## Fora da v1 (fase 2)

- Gasto, impressões e cliques por anúncio pela **API de Marketing do Meta** (sem revisão do app enquanto
  a loja for testadora; revisão para abrir a todos).
- **CAPI "entrou no grupo"** com `fbc`/`fbp` do cadastro: o `/r/` já envia CAPI por campanha
  (`readIntegracoes(campaign.metadata).meta`, com `capi_token`); a fase 2 reaproveita o token e manda o
  evento quando o worker cria o lead casado.
- Degrau "foi pro grupo" nas páginas `/p/` (passar o `cid` no redirect de `lib/pages/schema.ts`).
- UTM em clique direto no `/r/` sem cadastro (casamento estimado; recusado como fonte de origem).
