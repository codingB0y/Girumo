# HUBFLOW - Arquitetura de Migracao SaaS Multi-Tenant

## Objetivo

Migrar e reestruturar o SaaS HUBFLOW existente para uma arquitetura escalavel, simples e economica, sem recriar o sistema do zero, suportando inicialmente ate 100 clientes ativos.

A estrategia e evoluir o produto atual em fases, mantendo a engine Baileys separada do frontend e substituindo gradualmente persistencia local, autenticacao propria e billing manual por uma base multi-tenant Supabase-first, com Postgres/RLS, Supabase Auth, Supabase Storage, logs operacionais, Stripe e Redis opcional na engine.

## Stack Tecnologica Validada

- Frontend e API: Next.js 15 com App Router
- Linguagem: TypeScript
- Banco de dados: Supabase Postgres com Row Level Security (RLS)
- Autenticacao: Supabase Auth
- Cache, filas e rate limit: Redis opcional, inicialmente restrito a operacao da engine
- UI: Tailwind CSS + shadcn/ui
- Editor visual de funis: React Flow
- Pagamentos: Stripe
- Storage: Supabase Storage privado
- Logs: Supabase Postgres, com tabela `logs` e auditoria por tenant
- Engine WhatsApp: servico Node.js separado usando Baileys
- Deploy frontend/API: Vercel
- Deploy engine: VPS com Docker + Coolify
- Repositorio: GitHub

## Arquitetura Alvo

```txt
GitHub
   |
   v
Vercel - Next.js + API
   |
   v
Supabase
├── Postgres - multi-tenant + RLS
├── Auth
├── Storage
└── Logs
   |
   v
Stripe - billing + webhooks
   |
   v
Supabase - entitlements/plans

VPS - Coolify + Docker
└── Engine Baileys
    ├── sessions
    ├── workers
    ├── queues - Redis opcional
    └── webhooks
```

## Principios De Arquitetura

1. Nao recriar o sistema do zero.
2. Migrar em fatias pequenas e reversiveis.
3. Manter a engine desacoplada do frontend.
4. Usar `tenant_id` como chave obrigatoria de isolamento.
5. Aplicar RLS em todas as tabelas sensiveis.
6. Usar Redis apenas quando a operacao da engine justificar filas/locks externos; nao usar Redis como banco principal.
7. Usar Stripe como fonte de billing e entitlements.
8. Evitar overengineering para a meta inicial de ate 100 clientes.

## Multi-Tenant

O isolamento entre clientes sera feito por `tenant_id`.

Todas as tabelas de dominio devem possuir:

```txt
id
tenant_id
created_at
updated_at
```

Tabelas obrigatorias:

```txt
users
organizations
memberships
plans
subscriptions
instances
funnels
campaigns
messages
contacts
uploads
logs
```

Observacao: `organizations.id` pode ser tratado como o proprio `tenant_id`, mas as demais tabelas devem referenciar explicitamente `tenant_id`.

## Autenticacao Com Supabase Auth

Fluxo alvo:

```txt
Supabase Auth session
  |
  v
resolve user_id + tenant_id + role
  |
  v
API valida membership
  |
  v
Supabase Postgres executa queries sob RLS
  |
  v
RLS bloqueia acesso fora do tenant
```

Perfis:

- Owner
- Admin
- Operator

Recursos obrigatorios:

- Login
- Registro
- Recuperacao de senha
- Sessao persistente
- Convite de membros
- Troca de organizacao ativa, se um usuario pertencer a mais de um tenant

## Supabase Postgres Com RLS

Como a autenticacao alvo passa a ser Supabase Auth, a estrategia recomendada e combinar claims JWT/membership com funcoes auxiliares de RLS. Quando uma API server-side precisar executar operacoes privilegiadas, deve validar o tenant e aplicar contexto seguro antes da query.

```sql
set local app.current_user_id = '...';
set local app.current_tenant_id = '...';
set local app.current_role = 'owner';
```

As policies devem ler:

```sql
current_setting('app.current_tenant_id', true)
current_setting('app.current_user_id', true)
current_setting('app.current_role', true)
```

Regra geral:

- Owner pode administrar o tenant inteiro.
- Admin pode operar recursos do tenant, exceto billing/ownership sensivel.
- Operator pode operar funis, contatos, campanhas e mensagens conforme permissao.
- Nenhum usuario pode ler ou escrever dados de outro `tenant_id`.

## Redis Opcional

Redis pode ser usado na engine quando houver necessidade operacional de:

- Filas da engine
- Rate limit por tenant e por instancia
- Locks de envio
- Idempotencia de webhooks Stripe e eventos da engine
- Cache curto de plano, limites e status
- Debounce de eventos Baileys
- Health/status em tempo real da engine

Redis nao deve armazenar dados canonicos de negocio. A fonte da verdade continua sendo Supabase Postgres.

## Stripe

Planos alvo:

### FREE

- 1 instancia WhatsApp
- Limite de contatos
- Sem campanhas avancadas

### Essencial

- 1 instancia WhatsApp
- contatos e campanhas com limites de entrada
- recursos principais de operacao

### Growth

- Multiplas instancias
- Campanhas
- Limites maiores

### Performance Max

- Recursos ilimitados ou limites operacionais altos
- Prioridade operacional

Recursos obrigatorios:

- Stripe Checkout
- Stripe Customer Portal
- Webhooks
- Registro local de assinatura em `subscriptions`
- Bloqueio automatico por plano
- Entitlements por tenant

Eventos Stripe devem ser idempotentes e registrados em logs.

## Engine Baileys

A engine permanece separada do frontend.

Estrutura alvo:

```txt
hubflow-engine/
  sessions/
  queues/
  events/
  workers/
  webhooks/
  api/
```

Responsabilidades da engine:

- Conexao WhatsApp
- Gerenciamento de sessoes
- QR code
- Reconnect automatico
- Status de conexao
- Envio
- Recebimento
- Sincronizacao
- Filas
- Logs
- Rate limit operacional

Responsabilidades que nao pertencem a engine:

- Autenticacao de usuario final
- Billing
- Decisao de plano
- UI
- Regras de negocio de alto nivel fora do envio/sync

Comunicacao segura:

```txt
Frontend
  |
  v
API Next.js
  |
  v
Supabase command table ou Redis Queue opcional
  |
  v
Engine
```

Todo comando para a engine deve conter:

```txt
tenant_id
instance_id
command_id
type
payload
created_at
```

Todo evento vindo da engine deve conter:

```txt
tenant_id
instance_id
event_id
type
payload
created_at
```

Eventos e comandos devem ser idempotentes.

## Storage

Arquivos devem ficar em storage privado, separados por tenant:

```txt
uploads/
  tenant-id/
    media/
    documents/
    avatars/
    campaigns/
```

Regras:

- Upload privado por padrao.
- Acesso sempre validado por `tenant_id`.
- URLs assinadas para download/preview quando necessario.
- Metadados registrados na tabela `uploads`.

## React Flow

React Flow sera usado para o editor visual de funis.

Regra importante: React Flow deve representar o desenho do funil, nao executar a regra de negocio diretamente.

Modelo recomendado:

- `funnels`: metadados do funil
- `funnels.nodes`: JSON validado dos nos
- `funnels.edges`: JSON validado das conexoes
- Execucao real fica no backend/engine conforme eventos e campanhas

## Observabilidade

Adicionar:

- Logs estruturados
- Auditoria por tenant
- Monitoramento de engine
- Health checks
- Error tracking
- Registro de webhooks Stripe
- Registro de comandos/eventos da engine

Tabela `logs` deve armazenar pelo menos:

```txt
id
tenant_id
actor_user_id
instance_id
level
event
message
metadata
created_at
updated_at
```

## Deploy

### Web/API

- Deploy na Vercel.
- Variaveis de ambiente por ambiente.
- Build com Next.js 15.
- Conexao Supabase adequada para serverless.

### Engine

- Deploy separado da Vercel.
- Precisa de processo long-running.
- Precisa de storage/volume privado para sessoes ou persistencia controlada.
- Deve expor health check.
- Deve consumir comandos via Supabase ou Redis opcional, conforme decisao da etapa de engine.

## Auditoria Do Estado Atual

Achados principais:

1. O frontend atual esta em `hubflow-groups`.
2. A engine atual esta em `hubflow-engine`.
3. O app atual usa Next.js 16, nao Next.js 15.
4. O operacional ainda usa arquivos JSON/NDJSON em `hubflow-groups/data`.
5. Existe Prisma/PostgreSQL parcial para contas e billing.
6. A autenticacao atual usa cookie assinado proprio.
7. A engine atual e single-session com Baileys.
8. As sessoes Baileys estao em `hubflow-engine/auth`.
9. Arquivos sensiveis e dados operacionais aparecem versionados no Git.
10. Stripe ainda nao esta implementado.

Risco mais urgente:

- Remover sessoes e credenciais Baileys do Git.
- Remover dados operacionais locais do Git.
- Rotacionar qualquer segredo exposto.
- Ajustar `.gitignore`.

## Fases De Entrega

### Fase 1 - Auditoria Do Codigo Atual

- Mapear estrutura atual.
- Identificar stack real.
- Identificar gargalos.
- Identificar dados sensiveis versionados.
- Definir arquitetura alvo.

Status: concluida em auditoria inicial.

### Fase 2 - Plano De Migracao

- Definir estrutura final de pastas.
- Definir schema Supabase Postgres.
- Definir policies RLS.
- Definir fluxo Supabase Auth.
- Definir se a engine usa tabela/fila no Supabase ou Redis opcional.
- Definir contrato API/engine.
- Definir estrategia Stripe.

### Fase 3 - Refatoracao

- Reorganizar projeto.
- Migrar para Next.js 15, se essa decisao for mantida.
- Introduzir TypeScript padronizado.
- Introduzir Tailwind + shadcn/ui.
- Criar camada de tenant context.
- Remover dependencia de file-store nas rotas principais.

### Fase 4 - Banco

- Criar migrations.
- Criar RLS.
- Criar seeds de planos.
- Migrar dados operacionais selecionados.
- Criar testes basicos de isolamento multi-tenant.

### Fase 5 - Stripe

- Criar produtos/precos.
- Implementar checkout.
- Implementar portal.
- Implementar webhooks.
- Implementar bloqueios por plano.

### Fase 6 - Engine

- Refatorar para multi-instancia.
- Criar filas/comandos da engine.
- Criar comandos/eventos.
- Criar QR/status por instancia.
- Criar reconnect automatico.
- Criar rate limit por tenant/instancia.

### Fase 7 - Deploy

- Configurar Vercel.
- Configurar banco.
- Configurar Redis apenas se necessario para filas/locks da engine.
- Configurar engine.
- Criar scripts automaticos.
- Criar health checks.

### Fase 8 - Checklist Producao

- RLS validado.
- Secrets fora do Git.
- Stripe webhooks idempotentes.
- Engine com logs e reconnect.
- Backups configurados.
- Error tracking ativo.
- Rate limit ativo.
- Plano FREE/Essencial/Growth/Performance Max aplicado.
- Teste multi-tenant aprovado.

## Decisoes Pendentes

1. Confirmar se o nome tecnico sera padronizado como `hubflow`.
2. Confirmar se Next.js 15 sera obrigatorio ou se Next.js 16 atual sera mantido.
3. Confirmar projeto Supabase e ambientes.
4. Confirmar se Redis sera usado agora ou adiado.
5. Confirmar VPS/Coolify de deploy da engine.
6. Confirmar se dados atuais em `data/*.json` serao migrados ou descartados.
7. Confirmar precos e limites finais dos planos FREE, Essencial, Growth e Performance Max.
