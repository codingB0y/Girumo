# Acesso da vendedora — design

**Data:** 07/10/2026 · **Status:** aprovado pelo Igor (desenho + mockup)
**Mockup:** https://claude.ai/artifact/UdVL13GDUZU9ggZo4pjGsC (Registrar venda, Área não liberada,
Configurações › Equipe, Barra de cima por papel)

## Problema

O dono quer dar à vendedora um acesso ao painel **só para registrar venda**, e liberar outras funções
(postar nos grupos, etc.) uma a uma. Hoje não existe isso:

- `memberships.role` é `owner | admin | operator` (enum `member_role`), com matriz fixa em
  `lib/permissions.ts`. Não há permissão por módulo.
- "Registrar pedido" em Contatos grava **um valor total** (`orders.value`). Não guarda produto,
  quantidade, nem quem registrou.
- Pra registrar, hoje é preciso ver a lista inteira de contatos — a base de clientes da loja.

## Decisões do Igor (07/10)

| Pergunta | Decisão |
|---|---|
| O que ela vê em Contatos | **Só busca por número.** Nunca a lista. |
| Faturamento | **Só as vendas dela** no mês. O caixa da loja fica com dono/admin. |
| Correção de venda | **Ela, até 24h** depois de registrar; depois só dono/admin. |
| Plano | **Conta como membro normal** (`team_members:invite`, sem preço novo). |

## Abordagem

**Papel novo `seller` + lista de módulos liberados por membro.** A restrição vale só para esse papel:
owner/admin/operator continuam exatamente como hoje.

| Descartada | Por que não |
|---|---|
| Módulos por membro para todos os papéis | Mexe no acesso de todo membro existente; ninguém pediu. |
| Papéis fixos (`vendedora`, `vendedora+postagem`…) | Cada combinação nova vira papel novo; contradiz "o dono libera". |
| Só esconder o menu | A vendedora chamaria a API direto. 64 das 128 rotas resolvem o tenant fora do `getTenantContext`. |

## 1. Modelo de acesso

### Módulos da v1

| Módulo | Para a vendedora | Páginas | Rotas de API (método) |
|---|---|---|---|
| `vendas` | **sempre ligado** | `/painel/vendas` | `GET /api/vendas/contato` · `GET, POST /api/vendas` · `PATCH, DELETE /api/vendas/*` |
| `postar` | o dono marca | `/painel/disparos` | `GET /api/campanhas` · `GET /api/groups` · `GET /api/disparos` · `GET /api/session` · `GET /api/library` · `POST /api/campanhas/*/messages` · `POST /api/media/prepare` · `POST /api/media/register` |
| *(base)* | sempre | — | `GET /api/auth/me` |

`*` casa exatamente um segmento. As rotas de `postar` são as que `painel/disparos/page.tsx`,
`folha-postar.tsx`, `message-composer.tsx` (upload) e `copy-picker.tsx` chamam hoje.

Liberar outro módulo depois (Grupos, Relâmpago…) = uma entrada no mapa + teste. Não entra agora
porque cada módulo puxa dependência de API que precisa ser medida rota a rota.

### Onde o bloqueio acontece

Um módulo só, `lib/auth/modulos.ts`:

```ts
export type Modulo = "vendas" | "postar";
export function podeAcessar(
  acesso: { role: TenantRole; modules: readonly Modulo[] },
  pathname: string,
  method: string,
): boolean; // role !== "seller" → true; seller → base ∪ vendas ∪ modules, senão false
export function paginaLiberada(acesso, pathname): boolean; // mesmo mapa, lado das páginas
```

**Fechado por padrão:** para `seller`, rota que não está no mapa = 403, inclusive rota criada amanhã por
quem não sabe que a vendedora existe.

O guard roda **onde a membership é lida**, porque é ali que existe `role` e `req`:

1. `getTenantContext(req)` (`lib/supabase/tenant-context.ts`) — passa a selecionar `role, modules` e,
   se `!podeAcessar(...)`, lança `new Response("Área não liberada para o seu acesso.", { status: 403 })`.
   Cobre `getRouteTenantContext`, `requireInstagram`, `resolveBulkCampaign`, `/api/auth/me` etc.
2. `resolveSessionTenantId(req)` (`lib/session-tenant.ts`) — idem, mas devolve `null` (contrato atual:
   as rotas transformam `null` em lista vazia ou 403 próprio).

Rotas que **leem `memberships` por conta própria** furam isso. Hoje, fora de admin/auth/cron/convite:
`api/agents/copy`, `api/notifications/alerts`, `api/testimonials`, `lib/stores/orders.ts` (`getTenantId`)
e `lib/session.ts` (`getSessionTenantId`, sem chamador). As três rotas passam a usar
`resolveSessionTenantId`; os dois `lib/` saem (ver §5).

**Teste estrutural (o que segura o futuro):** varre `src/**/*.{ts,tsx}` e falha se `.from("memberships")`
aparecer fora de uma allowlist explícita com motivo — `tenant-context.ts`, `session-tenant.ts`,
`api/members/**`, `lib/auth/accept-pending-invite.ts`, `api/auth/{login,signup,oauth-complete}`,
`api/cron/emails`, `api/admin/**`, `app/admin/**`. Tenant de sessão só nasce nos dois resolvedores
guardados.

Segundo teste estrutural: cada padrão de rota do mapa corresponde a um `route.ts` existente com aquele
método exportado. Um typo no mapa não pode deixar o módulo mudo sem ninguém ver.

### Duas camadas, sem misturar

- **Rota** (o mapa acima): quais endpoints a vendedora alcança.
- **Ação** (`permissions.ts`): o que cada papel faz dentro do endpoint. `seller` entra na matriz só em
  uma ação nova, `message:send` (`owner, admin, operator, seller`), usada pelo
  `POST /api/campanhas/[slug]/messages` no lugar de `campaign:edit`. Editar/criar/apagar campanha
  continua fora — e a rota de edição nem está no mapa.

### `TenantRole` único

Hoje declarado em três lugares (`permissions.ts:1`, `tenant-context.ts:7`, `member-removal.ts:13`).
Passa a viver só em `permissions.ts` com `"seller"`; os outros importam.

### RLS — a vendedora não lê nada direto do banco

**Corrigido em 07/10 na revisão do plano do PR 2.** A primeira versão deste spec dizia que a vendedora não
tinha caminho `authenticated` ao banco. Tem: o cliente de browser guarda o access token dela, a anon key é
pública, `authenticated` mantém SELECT em `public`, e `app.user_tenant_ids()`
(`20260713100000_rls_standardization.sql:32-43`) **não filtra papel** — só `user_id` + `accepted_at`. Com o
próprio token ela leria pelo PostgREST `leads`, `orders` e as outras ~34 tabelas protegidas da loja inteira,
passando por cima do guard da API e da decisão "só busca por número".

Correção (PR 2, mesma migração B): os helpers de leitura que **não** filtram papel (`app.user_tenant_ids()`,
`app.has_membership(...)` e qualquer outro que a Task 1 do PR 2 achar em prod com `pg_get_functiondef`)
ganham `and m.role <> 'seller'`. Os que já listam papéis (`user_admin_tenant_ids`,
`user_operator_tenant_ids`, `has_role`) já a excluem. Efeito: zero acesso `authenticated` para `seller`;
tudo dela passa por rota service-role + guard. Nenhuma vendedora existe hoje, então ninguém atual perde
acesso. O corpo vem de `pg_get_functiondef` **de prod** (as funções foram aplicadas à mão; o repo pode
divergir), e o `create or replace` re-aplica revoke/grant depois (não preserva ACL em dev).

Consequências a conferir nos PRs seguintes:
- Realtime (`postgres_changes` respeita RLS): a casca da vendedora não recebe evento — e não deve assinar canal.
- Upload de mídia do módulo `postar`: precisa ser por URL assinada emitida pela API (service-role). Se alguma
  policy de `storage.objects` usar `user_tenant_ids()`, o upload da vendedora quebra — o PR 2 confere
  `select polname, pg_get_expr(polqual, polrelid) from pg_policy where polrelid = 'storage.objects'::regclass`.
- Teste de integração no PR 2: com o JWT de uma membership `seller`, `select` em `leads`/`orders`/`order_items`
  via PostgREST devolve 0 linhas; com owner, devolve.

### Página

Nenhuma página de `/painel` busca dado no servidor (conferido em 07/10): tudo vem pela API. O bloqueio de
página é só experiência:

- Vendedora em `/painel` → `router.replace("/painel/vendas")`.
- Vendedora em página fora de `paginaLiberada` → tela "Essa área não foi liberada pra você" (mockup).
- Menu: `NavItem` ganha `modulo?: Modulo`. Novo item `VENDAS` (`/painel/vendas`, `grupo: "vender"`,
  `modulo: "vendas"`), `DISPAROS` ganha `modulo: "postar"`. Para `seller`: aparece só item com módulo
  liberado. Para os outros papéis: tudo como hoje, e `VENDAS` não aparece (v1).
- Filtrar em todos os consumidores: `barra-de-cima.tsx:129`, `lista-dos-modulos.tsx:30`,
  `barra-mobile.tsx:87/113` (hoje não chama `liberado`), botão **Postar** (barra e mobile).
- Casca da vendedora não dispara as chamadas que dariam 403 (sininho, sinal do Relâmpago,
  `/api/ig/status`, avatar → Configurações vira só "Sair"). Enquanto `/api/auth/me` não responde
  (`carregado = false`), a barra não desenha módulos — `can()` devolve `true` com `role` nulo e isso
  faria o menu do dono piscar para a vendedora.

## 2. Dados

Duas migrações (o `add value` de enum não pode ser usado na mesma transação em que nasce):

**`…_member_role_seller.sql`**

```sql
alter type public.member_role add value if not exists 'seller';
```

**`…_acesso_vendedora.sql`**

```sql
alter table public.memberships
  add column if not exists modules text[] not null default '{}';
alter table public.memberships
  add constraint memberships_modules_validos
  check (modules <@ array['postar']::text[] and (role = 'seller' or modules = '{}'));

alter table public.orders
  add column if not exists created_by uuid references auth.users(id) on delete set null;
create index if not exists orders_tenant_created_by_idx
  on public.orders (tenant_id, created_by, created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  position smallint not null default 0,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  quantity integer not null check (quantity between 1 and 9999),
  unit_price numeric(12,2) not null check (unit_price between 0 and 999999.99),
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id, position);
alter table public.order_items enable row level security;
-- policy de select espelhando a de public.orders (padrão auth.uid() + memberships);
-- escrita só por service-role.
```

`vendas` não é gravado: para `seller` é implícito. `modules` guarda só os extras.

**RPCs** (`security invoker`, `set search_path = ''`, `revoke execute ... from public, anon, authenticated`,
`grant execute ... to service_role` — o default privilege concede `authenticated` em função nova):

- `create_order_with_items(p_tenant_id, p_created_by, p_lead_id, p_phone, p_group_name, p_campaign_id, p_items jsonb) returns public.orders`
  — valida 1..50 itens, calcula `value = round(sum(quantity * unit_price), 2)`, exige `value > 0`, insere
  pedido + itens na mesma transação.
- `replace_order_items(p_tenant_id, p_order_id, p_items jsonb, p_only_author uuid) returns public.orders`
  — com `p_only_author` não nulo, só altera se `created_by = p_only_author and created_at > now() - interval '24 hours'`,
  senão `raise exception 'fora_da_janela'` (a rota traduz em 403). Troca os itens e recalcula `value`.

**`orders.value` continua sendo o total.** Resultados, caixa do mês, `painel-metrics` e atribuição por
campanha não mudam. Pedido antigo (sem itens) aparece como "Pedido sem itens".

Migração nos **dois bancos** + baseline do gate de drift no mesmo PR. Antes de escrever: conferir por SQL
em dev e prod se algum objeto já existe e olhar as branches abertas.

## 3. API

Validação com `zod` (já dependência; padrão de `api/ig/flows/[id]/status`). Valor em reais aceita
`"149,90"` e passa por `parseValorDoPedido` — a mesma função do cliente e da rota de pedidos.

### Busca — `GET /api/vendas/contato?telefone=`

- Normaliza para dígitos e gera as **variantes**: com e sem `55`, com e sem o 9º dígito
  (`lib/vendas/telefone.ts`). O banco grava só dígitos (`upsert_lead`), sem normalizar `55` nem 9º
  dígito — então o mesmo cliente pode estar como `5511987654321` ou `11987654321`.
- `select id, name, phone from leads where tenant_id = $1 and phone in (variantes)`, mais recente
  primeiro, 1 resultado.
- Responde `{ contato: { id, nome, telefone } | null, optout: boolean }`. Nunca lista.
- Menos de 10 dígitos → 400 "Digite o número com DDD."
- Rate limit `vendas-busca:${authUserId}` 30/min → 429. Segura varredura da base por tentativa.

### Registrar — `POST /api/vendas`

```ts
z.strictObject({
  leadId: z.uuid().optional(),
  telefone: z.string().max(30).optional(),
  nome: z.string().trim().max(80).optional(),
  itens: z.array(z.strictObject({
    nome: z.string().trim().min(1).max(120),
    quantidade: z.number().int().min(1).max(9999),
    valorUnitario: z.union([z.string(), z.number()]),
  })).min(1).max(50),
}) // + refine: leadId ou telefone
```

- `leadId` informado → precisa ser do tenant (`getLeadAttribution(tenantId, leadId)`); senão 400.
  (A `POST /api/orders` atual não confere isso — corrigir junto, §5.)
- Sem `leadId` → cria/acha o lead pelo telefone (upsert por `(tenant_id, phone)`), `name` = `nome`,
  sem grupo de origem. Número em opt-out → registra o pedido **sem** lead.
- Grava via `create_order_with_items` com `created_by = authUserId`.
- O resto do que `POST /api/orders` faz hoje sai num helper compartilhado
  `lib/orders/registrar.ts` usado pelas duas rotas: atribuição de campanha pelo lead, lead →
  `comprou`, marco `first_order`.
- Rate limit `vendas-registro:${tenantId}` 60/min.
- `RouteTenantContext` passa a expor `authUserId` (hoje só `tenantId, actor, role`).

### Minhas vendas — `GET /api/vendas?mes=YYYY-MM`

Pedidos com `created_by = authUserId` no mês (fuso de Brasília), com itens embutidos
(`order_items(name, quantity, unit_price, position)`), mais recentes primeiro, `limit 1000`, e a soma.
Se `count` exato > linhas devolvidas, `truncado: true` e a tela diz que o total é parcial (o PostgREST
corta em 1000 sem erro). Cada linha vem com `editavel` calculado no servidor.

Para qualquer papel a rota devolve **as vendas de quem chamou** — o dono não usa essa tela na v1.

### Corrigir / apagar — `PATCH /api/vendas/[id]` · `DELETE /api/vendas/[id]`

- `seller`: só as próprias, até 24h (PATCH via `p_only_author`; DELETE com
  `.eq("created_by", authUserId).gt("created_at", agora - 24h)` e `select("id")` para saber se apagou).
  Nada alterado → 403 "Passou de 24 horas: só o dono da loja corrige."
- owner/admin/operator: qualquer pedido do tenant (mesmo poder que já têm em `DELETE /api/orders`).

### Equipe — `api/members`

- `POST`: `{ email, role: "admin" | "operator" | "seller", modules?: ["postar"] }`. **Papel desconhecido
  → 400.** Hoje `normalizeRole` (`route.ts:19-22`) converte silenciosamente em `operator`. Isso daria
  **mais** acesso à vendedora se a tela chegasse antes do backend. `modules` só com `seller`.
- `PATCH` (novo): `{ id, modules }` — só para membership `seller`, owner/admin
  (`assertBillingRole`). Registra o evento `membership.modules_changed` no mesmo log de
  `membership.removed`. Vale na próxima chamada dela, porque o guard lê `modules` a cada request.
- `GET`: devolve `modules`.
- Limite do plano: o `assertPlanLimit(..., "team_members:invite")` de hoje, sem mudança.

### `GET /api/auth/me`

Passa a devolver `modules`. `RoleProvider` expõe `modules` e um `acesso` pronto para `paginaLiberada`.

## 4. Telas (ver mockup)

- **`/painel/vendas`** (celular primeiro): busca por número → cartão do cliente ou "Nenhum cliente com
  esse número" com nome opcional → linhas de produto (nome · qtd · valor un. · subtotal, remover;
  "Adicionar produto") → total ao vivo → **Registrar venda · R$ X**. Depois: confirmação + "Registrar outra
  venda". Embaixo: **Minhas vendas · mês**, total do mês e lista com **Corrigir** (até 24h) ou **Fechada**.
  Nome do produto: texto livre com `<datalist>` dos nomes que ela já usou (vindos das vendas do mês).
- **Área não liberada** — página fora do acesso dela.
- **Configurações › Equipe** — convite com **Função** usando os mesmos nomes da lista
  (`papelEmPortugues`): Administração / Atendimento / Vendedora; Vendedora abre os módulos (Registrar
  vendas travado ligado; Postar nos grupos). Linha da vendedora com chips dos módulos e **Editar acesso**.
  Fora (decidido na revisão do plano): contador "N de M vagas" (o teto depende de plano + extras; o
  limite já chega como 402 no convite), "Reenviar" e um "Remover" novo (a remoção que existe fica).
- **Barra** — vendedora vê só Vendas (+ Disparos e o botão Postar se liberado) e o chip "Vendedora".

Inputs com `font-size: 16px` (sem zoom no iOS), alvos ≥ 44px, `<label>` em todo campo, erro com
`role="alert"`.

## 5. Correções que entram junto

| Onde | Problema | Correção |
|---|---|---|
| `lib/stores/orders.ts` `addOrder`/`removeOrder` | Tenant = primeira membership da sessão. Vendedora com loja própria + convidada registraria na loja **errada**. Mesmo bug já corrigido no `listOrdersByTenant`. | Recebem `tenantId` da rota. `getTenantId()` local sai. |
| `api/orders` `DELETE` | Não chama `getRouteTenantContext`; `removeOrder` devolve `true` mesmo sem apagar nada. | Contexto da rota + 404 quando 0 linhas. |
| `api/orders` `POST` | Aceita `leadId` de qualquer tenant (grava `lead_id` alheio). | Conferir o lead no tenant. |
| `lib/session.ts` `getSessionTenantId` | Sem chamador; lê `memberships` sem guard. | Remover. |
| `api/members` `normalizeRole` | Papel desconhecido vira `operator`. | 400. |

## 6. Erros e bordas

- Mudança de acesso pelo dono → vale na próxima chamada (sem cache de módulo).
- Vendedora removida → `getTenantContext` não acha membership → 403, como hoje.
- Vendedora em duas lojas → `x-tenant-id` escolhe; o guard usa `role/modules` da membership escolhida.
- Contatos capturados em regime LID podem não ter `phone`: a busca não acha e a venda cria um contato novo
  com telefone. **Medir em prod antes do PR 4** (§9). Se a maioria não tiver telefone, avisar na tela
  ("cliente novo") é o comportamento correto, não bug.
- Item com valor 0 é aceito (brinde); a venda inteira precisa somar > 0.
- Venda duplicada por clique duplo: botão desabilita enquanto salva (mesmo padrão do `RegistroDePedido`).

## 7. Testes

- `modulos.test.ts` — tabela: `seller` × rota × método (liberada, fora do mapa, método errado, módulo
  desligado); papéis não-`seller` sempre `true`.
- Estrutural 1 — allowlist de `.from("memberships")`.
- Estrutural 2 — mapa de módulos × `route.ts` reais × métodos exportados.
- `telefone.test.ts` — variantes (com/sem 55, com/sem 9º dígito, lixo, < 10 dígitos).
- Rotas `api/vendas/*` com PostgREST falso (padrão do #340): validação, lead de outro tenant, opt-out,
  janela de 24h, 429.
- Integração no job e2e (banco real): `create_order_with_items` e `replace_order_items` — limites, soma,
  `fora_da_janela`, atomicidade (item inválido não deixa pedido órfão).
- E2E: vendedora entra → só vê Vendas → registra venda com 2 itens → aparece em Minhas vendas →
  `GET /api/orders` dá 403. Dono libera Postar → a API de postar responde na hora; Disparos aparece no
  menu ao recarregar a página (o `RoleProvider` lê `/api/auth/me` uma vez), sem relogar.
- Rodar o mutante: tirar o guard do `getTenantContext` tem que derrubar o E2E e o teste da rota.

## 8. PRs (um por coisa)

| # | PR | Depende de |
|---|---|---|
| 1 | `fix(orders)`: tenant da rota em `addOrder`/`removeOrder`, `DELETE` autenticado, `leadId` do tenant, remove `getSessionTenantId` | — |
| 2 | `feat(db)`: `seller`, `modules`, `created_by`, `order_items`, RPCs — dev + prod + baseline | — |
| 3 | `feat(auth)`: `modulos.ts`, guard nos 2 resolvedores, `TenantRole` único, `message:send`, `normalizeRole` estrito, `/api/auth/me` + `RoleProvider` com `modules`, migração das 3 rotas, testes estruturais | 2 |
| 4 | `feat(vendas)` API: `lib/vendas/telefone.ts`, store de vendas, `lib/orders/registrar.ts`, `api/vendas/*` | 1, 2, 3 |
| 5A | `feat(vendas)` tela: `/painel/vendas` | 4 |
| 5B | `feat(vendedora)` casca: item de menu com `modulo`, filtro nos consumidores do menu, casca sem chamada proibida, guarda de página | 5A |
| 5C | `feat(vendedora)` upload de mídia por token assinado (todo mundo) + E2E da vendedora | 5B |
| 6 | `feat(equipe)`: convite com função e módulos, `PATCH /api/members`, aba Equipe — **mergeia por último** | 3 · 5C |

O PR 4 do desenho original virou 4 (API) + 5A/5B/5C (tela, casca, upload + E2E) por passar de 10
arquivos. 5A–5C e 6 se desenvolvem em paralelo (arquivos disjuntos), mas o 6 mergeia por último: até ele
entrar ninguém consegue convidar vendedora, então 3, 4 e 5A–5C entram no escuro, sem flag.

Planos: `docs/superpowers/plans/2026-10-07-acesso-vendedora-pr{1..6}-*.md`.

## 9. Medições pendentes (prod, antes do plano fechar)

```sql
select json_build_object(
  'role_type',  (select udt_name from information_schema.columns
                 where table_schema='public' and table_name='memberships' and column_name='role'),
  'role_dist',  (select json_agg(json_build_object('role', role::text, 'n', n))
                 from (select role, count(*) n from public.memberships group by role) r),
  'orders_cols',(select json_agg(column_name) from information_schema.columns
                 where table_schema='public' and table_name='orders'),
  'orders_pol', (select json_agg(polname || ': ' || pg_get_expr(polqual, polrelid))
                 from pg_policy where polrelid = 'public.orders'::regclass),
  'leads_phone',(select json_build_object('total', count(*),
                 'com_phone', count(*) filter (where coalesce(phone,'') ~ '^\d{10,13}$'),
                 'com_55',    count(*) filter (where phone ~ '^55\d{10,11}$'))
                 from public.leads),
  'order_items',to_regclass('public.order_items') is not null
) as r;
```

Dev (07/10): `role` é `member_role`; `orders` = `id, tenant_id, phone, lead_id, group_name, value,
created_at, campaign_id`; `order_items` não existe; 51/51 leads com telefone.

## Fora da v1

- Itens no "Registrar pedido" do dono em Contatos.
- Relatório "vendas por vendedora" / comissão.
- Catálogo de produtos (nome é texto livre).
- Outros módulos (Grupos, Campanhas, Relâmpago, Contatos completo).
- Trocar o papel de um membro existente (só os módulos da vendedora são editáveis).
