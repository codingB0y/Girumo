# Fase 2 - Plano De Migracao

## Objetivo Da Fase

Definir o caminho tecnico para migrar o HUBFLOW atual para uma arquitetura SaaS multi-tenant com Next.js App Router, TypeScript, Supabase Postgres com RLS, Supabase Auth, Supabase Storage, React Flow, Tailwind, shadcn/ui, Stripe e engine Baileys separada em VPS/Coolify/Docker. Redis fica opcional e restrito a filas/locks da engine quando necessario.

Esta fase ainda nao implementa a refatoracao. Ela fixa o desenho alvo, a ordem de execucao e os criterios de aceitacao para que as proximas fases sejam incrementais, auditaveis e sem overengineering.

## Decisoes Arquiteturais

### Decisao 1 - Manter Monorepo Simples

Estrutura alvo:

```txt
HubFlow-platform/
  apps/
    web/
  hubflow-engine/
  packages/
    shared/
  infra/
    migrations/
    rls/
    seeds/
    scripts/
  docs/
```

Motivo:

- Separa claramente frontend/API, engine, contratos compartilhados e infra.
- Mantem simplicidade para ate 100 clientes.
- Evita criar backend separado antes da necessidade real.

### Decisao 2 - Next.js Como BFF E API Principal

O Next.js App Router sera responsavel por:

- UI.
- API do produto.
- Sessao com Supabase Auth.
- Validacao de tenant ativo.
- Chamadas ao Supabase Postgres respeitando RLS.
- Stripe Checkout, Portal e Webhooks.
- Registro/enfileiramento de comandos para a engine via Supabase ou Redis opcional.

Nao criar NestJS nesta fase.

### Decisao 3 - Supabase Postgres Com RLS Como Barreira De Isolamento

O isolamento entre clientes nao deve depender apenas de filtros no codigo.

Todas as tabelas de dominio devem possuir `tenant_id` e policies RLS.

Como a autenticacao alvo e Supabase Auth, a estrategia recomendada e usar claims autenticadas, memberships e funcoes auxiliares para RLS. Em rotas server-side, qualquer uso de chave privilegiada deve validar explicitamente usuario, tenant e role antes de operar.

```sql
set local app.current_user_id = '<user_id>';
set local app.current_tenant_id = '<tenant_id>';
set local app.current_role = '<role>';
```

Policies usam:

```sql
current_setting('app.current_user_id', true)
current_setting('app.current_tenant_id', true)
current_setting('app.current_role', true)
```

### Decisao 4 - Redis Opcional Para Operacao, Nao Para Dados Canonicos

Redis pode ser usado pela engine para:

- filas;
- locks;
- rate limit;
- cache curto;
- idempotencia;
- status efemero da engine.

Supabase Postgres continua sendo a fonte da verdade.

### Decisao 5 - Stripe Como Fonte De Billing

Stripe sera a fonte de assinatura e eventos de billing.

O banco local mantem uma copia normalizada para autorizacao rapida:

- plano atual;
- status da assinatura;
- limites;
- ids Stripe;
- data de renovacao/cancelamento.

Webhooks Stripe devem atualizar `subscriptions`, `plans`/entitlements e `logs` no Supabase.

Planos finais:

- FREE
- Essencial
- Growth
- Performance Max

### Decisao 6 - Engine Continua Separada

A engine nao acessa UI, auth de usuario final ou billing diretamente.

Ela consome comandos e publica eventos.

```txt
Next.js API
  |
  v
Supabase command table ou Redis Queue opcional
  |
  v
Engine Baileys
  |
  v
Eventos/acks
  |
  v
Next.js API ou worker de ingestao
  |
  v
Supabase Postgres
```

## Estrutura De Pastas Alvo

```txt
apps/
  web/
    app/
      (auth)/
      (app)/
      api/
    components/
      ui/
    features/
      auth/
      billing/
      campaigns/
      contacts/
      funnels/
      instances/
      messages/
      tenants/
      uploads/
    lib/
      auth/
      supabase/
      rls/
      queue/
      stripe/
      tenant/
      validation/

hubflow-engine/
  api/
  events/
  queues/
  sessions/
  workers/
  webhooks/
  services/
  config/

packages/
  shared/
    contracts/
    types/
    constants/

infra/
  migrations/
  rls/
  seeds/
  scripts/
```

## Modelo De Dados Alvo

### Convencoes

Todas as tabelas de dominio devem seguir:

```txt
id uuid primary key
tenant_id uuid not null
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Enums recomendados:

```sql
role: owner | admin | operator
subscription_status: free | trialing | active | past_due | canceled | unpaid
instance_status: pending | qr | connected | disconnected | blocked | error
campaign_status: draft | queued | running | paused | sent | failed | canceled
message_direction: inbound | outbound
message_status: queued | sending | sent | delivered | read | failed
upload_kind: media | document | avatar | campaign
log_level: debug | info | warn | error
```

### `users`

Representa o usuario da aplicacao.

Campos:

```txt
id
tenant_id
name
email
image
created_at
updated_at
```

Observacao: usando Supabase Auth, o usuario autenticado vive em `auth.users`. O dominio do produto deve manter `users` ou `profiles` com relacao clara ao usuario autenticado e ao tenant ativo.

### `organizations`

Representa o cliente/tenant.

Campos:

```txt
id
tenant_id
name
slug
status
created_at
updated_at
```

Regra:

- `organizations.id` pode ser igual a `tenant_id`.
- Owner inicial e criado no registro.

### `memberships`

Liga usuario a organizacao.

Campos:

```txt
id
tenant_id
user_id
role
invited_by
invited_email
accepted_at
created_at
updated_at
```

Regras:

- Um usuario pode pertencer a mais de uma organizacao.
- Apenas Owner/Admin pode convidar.
- Apenas Owner pode transferir ownership e alterar billing.

### `plans`

Catalogo local dos planos.

Campos:

```txt
id
tenant_id
code
name
stripe_price_id
limits jsonb
active
created_at
updated_at
```

Nota: por ser catalogo global, pode-se usar um `tenant_id` reservado do sistema ou tratar como tabela sem tenant com policy publica de leitura. Para aderir a regra do projeto, manter `tenant_id` e documentar `system_tenant_id`.

Planos:

- FREE
- Essencial
- Growth
- Performance Max

### `subscriptions`

Assinatura do tenant.

Campos:

```txt
id
tenant_id
plan_id
stripe_customer_id
stripe_subscription_id
stripe_price_id
status
current_period_start
current_period_end
cancel_at_period_end
canceled_at
metadata jsonb
created_at
updated_at
```

Regras:

- Um tenant tem uma assinatura vigente.
- Webhooks Stripe atualizam esta tabela.
- API consulta esta tabela para aplicar limites.

### `instances`

Instancias WhatsApp.

Campos:

```txt
id
tenant_id
name
phone
status
qr_code
last_seen_at
connected_at
disconnected_at
engine_node
metadata jsonb
created_at
updated_at
```

Regras:

- FREE: 1 instancia.
- Essencial: 1 instancia com limites de entrada.
- Growth: multiplas instancias conforme limite.
- Performance Max: limite alto ou ilimitado operacionalmente.

### `funnels`

Funis visuais com React Flow.

Campos:

```txt
id
tenant_id
name
description
nodes jsonb
edges jsonb
status
created_at
updated_at
```

Regra:

- React Flow representa o desenho.
- A execucao de mensagens/campanhas fica no backend/engine.

### `campaigns`

Campanhas de envio.

Campos:

```txt
id
tenant_id
instance_id
funnel_id
name
status
audience jsonb
content jsonb
scheduled_at
started_at
finished_at
stats jsonb
created_at
updated_at
```

### `messages`

Mensagens enviadas/recebidas.

Campos:

```txt
id
tenant_id
instance_id
campaign_id
contact_id
direction
status
external_message_id
body
payload jsonb
sent_at
delivered_at
read_at
failed_at
created_at
updated_at
```

### `contacts`

Contatos do tenant.

Campos:

```txt
id
tenant_id
name
phone
email
tags text[]
attributes jsonb
opt_out_at
created_at
updated_at
```

Regras:

- Unico por `tenant_id + phone`, quando phone existir.
- Limites por plano sao aplicados aqui.

### `uploads`

Arquivos privados.

Campos:

```txt
id
tenant_id
kind
bucket
path
mime_type
size
created_by
metadata jsonb
created_at
updated_at
```

Path:

```txt
uploads/<tenant_id>/<kind>/<file>
```

### `logs`

Logs e auditoria.

Campos:

```txt
id
tenant_id
actor_user_id
instance_id
level
event
message
metadata jsonb
created_at
updated_at
```

## RLS - Modelo Base

### Funcao De Contexto

Criar funcoes auxiliares:

```sql
create or replace function app.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_tenant_id', true), '')::uuid
$$;

create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('app.current_user_id', true), '')::uuid
$$;

create or replace function app.current_role()
returns text
language sql
stable
as $$
  select nullif(current_setting('app.current_role', true), '')
$$;
```

### Policy Padrao

Para tabelas com `tenant_id`:

```sql
alter table <table_name> enable row level security;

create policy tenant_select on <table_name>
for select
using (tenant_id = app.current_tenant_id());

create policy tenant_insert on <table_name>
for insert
with check (tenant_id = app.current_tenant_id());

create policy tenant_update on <table_name>
for update
using (tenant_id = app.current_tenant_id())
with check (tenant_id = app.current_tenant_id());

create policy tenant_delete on <table_name>
for delete
using (
  tenant_id = app.current_tenant_id()
  and app.current_role() in ('owner', 'admin')
);
```

### Regras De Role

Owner:

- billing;
- usuarios/memberships;
- instancias;
- campanhas;
- contatos;
- uploads;
- logs.

Admin:

- instancias;
- campanhas;
- contatos;
- uploads;
- leitura de logs;
- sem alteracao de billing/ownership.

Operator:

- campanhas;
- contatos;
- mensagens;
- leitura limitada;
- sem billing;
- sem gestao de membros.

## Supabase Auth

### Estrategia Recomendada

Usar Supabase Auth como autenticacao principal, mantendo o dominio multi-tenant em tabelas proprias:

- `users` ou `profiles` vinculado a `auth.users`;
- `organizations`;
- `memberships`;
- convites;
- roles Owner/Admin/Operator.

Sessao deve carregar o minimo:

```ts
type SessionUser = {
  id: string;
  email: string;
  name?: string;
  activeTenantId: string;
  role: "owner" | "admin" | "operator";
};
```

### Tenant Context

Criar uma camada unica:

```txt
getTenantContext()
```

Responsabilidades:

- validar sessao;
- resolver usuario;
- resolver tenant ativo;
- validar membership;
- retornar role;
- bloquear usuario sem tenant;
- fornecer contexto para RLS.

### Query Com RLS

Toda query sensivel deve respeitar RLS. Em rotas server-side, quando houver operacao com permissao elevada, validar antes:

```txt
user_id autenticado
tenant_id ativo
membership ativa
role autorizada
```

Nenhuma rota deve consultar tabelas multi-tenant sem contexto.

## Redis Opcional

### Chaves E Filas

Padrao de nomes, caso Redis seja adotado para a engine:

```txt
queue:engine:commands
queue:engine:events
lock:tenant:<tenant_id>:instance:<instance_id>:send
rate:tenant:<tenant_id>:instance:<instance_id>
idem:stripe:<event_id>
idem:engine:<event_id>
status:instance:<instance_id>
```

### Comando Para Engine

```json
{
  "command_id": "uuid",
  "tenant_id": "uuid",
  "instance_id": "uuid",
  "type": "send_message",
  "payload": {},
  "created_at": "iso-date"
}
```

Tipos iniciais:

```txt
connect_instance
disconnect_instance
refresh_qr
send_message
sync_groups
sync_contacts
run_campaign
stop_campaign
```

### Evento Da Engine

```json
{
  "event_id": "uuid",
  "tenant_id": "uuid",
  "instance_id": "uuid",
  "type": "message_received",
  "payload": {},
  "created_at": "iso-date"
}
```

Tipos iniciais:

```txt
qr_generated
instance_connected
instance_disconnected
message_received
message_sent
message_failed
campaign_progress
sync_completed
engine_error
```

## Stripe

### Produtos E Planos

FREE:

- 1 instancia WhatsApp.
- limite baixo de contatos.
- sem campanhas avancadas.

Essencial:

- 1 instancia WhatsApp.
- contatos e campanhas com limites de entrada.
- recursos principais de operacao.

Growth:

- multiplas instancias conforme limite.
- campanhas.
- funis.
- contatos ampliados.

Performance Max:

- limites altos ou ilimitados operacionalmente.
- prioridade.
- recursos completos.

### Webhooks Obrigatorios

```txt
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.payment_succeeded
invoice.payment_failed
```

### Idempotencia

Todo evento Stripe deve gerar registro:

```txt
idem:stripe:<event_id>
```

E tambem log persistente em `logs`.

### Bloqueio Por Plano

Criar camada:

```txt
assertPlanLimit(tenant_id, capability)
```

Capabilities iniciais:

```txt
instances:create
contacts:create
campaigns:create
campaigns:send
funnels:create
uploads:create
```

## Storage

Usar bucket privado.

Layout:

```txt
uploads/
  <tenant_id>/
    media/
    documents/
    avatars/
    campaigns/
```

Regras:

- gravar metadados em `uploads`;
- path sempre contem `tenant_id`;
- download por URL assinada;
- API valida membership antes de gerar URL.

## Engine Baileys

### Estrutura Interna

```txt
hubflow-engine/
  api/
    health
    internal
  sessions/
    manager
    storage
  queues/
    command-consumer
    event-producer
  workers/
    connection-worker
    message-worker
    campaign-worker
    sync-worker
  events/
    handlers
  services/
    baileys
    rate-limit
    logger
  webhooks/
```

### Regras

- Uma sessao por `instance_id`.
- Toda sessao pertence a um `tenant_id`.
- Sessao nao deve ficar versionada no Git.
- QR code deve ser publicado como evento e persistido no status da instancia.
- Reconnect automatico por instancia.
- Rate limit por `tenant_id + instance_id`.
- Logs sempre com `tenant_id` e `instance_id`.

## Ordem De Migracao

### Etapa 2.1 - Higiene De Repositorio

Objetivo:

- impedir que runtime data continue indo para Git.

Tarefas:

- adicionar `hubflow-engine/auth/` ao `.gitignore`;
- manter `apps/web/data/` e dados runtime legados fora do indice Git;
- preparar remocao dos arquivos rastreados com `git rm --cached`;
- criar samples sanitizados se necessario;
- documentar rotacao/desconexao das sessoes Baileys expostas.

Nao apagar arquivos locais sem confirmacao.

### Etapa 2.2 - Infra Supabase

Objetivo:

- criar fundacao Supabase multi-tenant.

Tarefas:

- criar migrations base;
- criar schemas/funcoes auxiliares;
- criar tabelas obrigatorias;
- ativar RLS;
- criar policies;
- criar seeds FREE/Essencial/Growth/Performance Max.

### Etapa 2.3 - Supabase Auth E Tenant Context

Objetivo:

- substituir auth propria por Supabase Auth.

Tarefas:

- configurar Supabase Auth;
- criar `users`/`profiles` vinculado a `auth.users`;
- criar registro/login/recuperacao;
- criar convites;
- criar memberships;
- criar `getTenantContext()`;
- aplicar contexto RLS nas queries.

Observacao:

- Prisma nao faz parte da stack alvo.
- O schema Prisma legado foi removido do caminho operacional e deve permanecer substituido por migrations SQL e acesso Supabase Postgres com RLS.

### Etapa 2.4 - Migracao Do File-Store

Objetivo:

- mover dados operacionais para Supabase Postgres.

Ordem recomendada:

1. contacts;
2. uploads;
3. instances;
4. campaigns;
5. messages;
6. funnels;
7. logs.

### Etapa 2.5 - Stripe

Objetivo:

- ativar monetizacao e bloqueio por plano.

Tarefas:

- criar checkout;
- criar portal;
- criar webhook;
- mapear Stripe Price IDs para `plans`;
- aplicar `assertPlanLimit`;
- bloquear criacao/envio acima do plano.

### Etapa 2.6 - Engine E Filas

Objetivo:

- tirar engine do polling direto e preparar multi-instancia.

Tarefas:

- definir fila por Supabase command/event tables ou Redis opcional;
- configurar Redis apenas se for necessario para throughput, locks ou workers;
- criar comandos e eventos idempotentes;
- refatorar `hubflow-engine` para `tenant_id + instance_id`;
- criar storage de sessoes;
- criar status/QR por instancia;
- criar workers separados.

Deploy alvo da engine:

- VPS;
- Docker;
- Coolify;
- processo long-running;
- health check;
- consumo de comandos via Supabase ou Redis opcional.

### Etapa 2.7 - UI E React Flow

Objetivo:

- evoluir painel com shadcn/ui e funis visuais.

Tarefas:

- introduzir shadcn/ui;
- padronizar componentes;
- criar editor de funis com React Flow;
- persistir nodes/edges em `funnels`;
- conectar campanhas a funis.

## Criterios De Aceite Da Fase 2

Esta fase sera considerada concluida quando:

- schema alvo estiver documentado;
- RLS base estiver documentado;
- Supabase Auth e tenant context estiverem definidos;
- estrategia de comandos/eventos da engine estiver definida;
- contrato engine estiver definido;
- Stripe estiver definido;
- ordem de migracao estiver clara;
- riscos da Fase 1 estiverem conectados a tarefas da Fase 2.

## Saida Para A Fase 3

A Fase 3 deve comecar pela refatoracao controlada, mas antes dela e recomendado executar a Etapa 2.1 de higiene do repositorio, porque as sessoes Baileys e dados locais versionados sao bloqueadores de seguranca e deploy.
