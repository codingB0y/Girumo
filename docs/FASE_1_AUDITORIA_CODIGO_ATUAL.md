# Fase 1 - Auditoria Do Codigo Atual

## Objetivo Da Fase

Auditar o estado atual do HUBFLOW antes de iniciar refatoracao, banco, Stripe, engine multi-instancia ou deploy. Esta fase nao implementa novas funcionalidades; ela identifica o que existe, onde estao os riscos e qual caminho tecnico deve guiar a migracao.

## Resumo Executivo

O projeto atual ja possui uma base funcional, mas ainda esta em formato de MVP/PoC. O frontend/API vive em `hubflow-groups` e a engine Baileys vive em `hubflow-engine`. A maior parte do dominio operacional ainda usa arquivos locais em `hubflow-groups/data`, enquanto contas e billing possuem uma base parcial em Prisma/PostgreSQL.

Para virar SaaS multi-tenant com isolamento forte, o sistema precisa migrar de:

```txt
cookie proprio + file-store + token global da engine + sessao Baileys local
```

para:

```txt
Supabase Auth + Supabase Postgres com RLS + Supabase Storage + Stripe + engine multi-instancia por tenant_id, com Redis opcional na engine
```

O maior risco imediato nao e falta de feature; e higiene de seguranca e persistencia. Existem milhares de arquivos de sessao Baileys rastreados pelo Git, alem de dados operacionais locais tambem rastreados.

## Estrutura Encontrada

Raiz do repositorio:

```txt
HubFlow-platform/
  api/
  docs/
  hubflow-engine/
  hubflow-groups/
  node_modules/
  package.json
```

### `hubflow-groups`

Aplicacao web atual.

Stack encontrada:

- Next.js `16.2.9`
- React `19.2.4`
- TypeScript
- Tailwind CSS v4
- Prisma `6.19.3`
- bcryptjs
- lucide-react

Observacao: o objetivo definido fala em Next.js 15, mas o app atual esta em Next.js 16.

Scripts:

```txt
npm run dev
npm run build
npm run start
npm run lint
npm run db:migrate
npm run db:seed
npm run db:studio
```

### `hubflow-engine`

Engine WhatsApp atual.

Stack encontrada:

- Node.js
- Express `5.2.1`
- Baileys `7.0.0-rc13`
- Pino
- qrcode-terminal

Script:

```txt
npm start
```

## Inventario De Rotas

### Paginas principais

O app possui rotas de painel em `src/app/(app)`, incluindo:

- dashboard
- acquisition
- campaigns
- campanhas
- crescer
- groups
- hoje
- indicacao
- leads
- links
- reports
- schedules
- settings
- templates

Tambem existem:

- `/login`
- `/signup`
- `/r/[slug]`

### APIs existentes

Foram encontradas rotas API para:

- activity
- ad-campaigns
- auth/login
- auth/logout
- auth/signup
- broadcasts
- campanhas
- dispatch
- dispatch/ack
- dispatch/pending
- groups
- groups/grow/ack
- groups/grow/pending
- leads
- links
- media
- optout
- orders
- plans
- referrals
- schedules
- session
- subscription
- templates
- welcome

Essas rotas sao uma boa base funcional para migracao incremental, mas hoje misturam logica de produto, persistencia local e contrato com engine.

## Persistencia Atual

### File-store operacional

O dominio operacional usa arquivos em `hubflow-groups/data`.

Arquivos identificados:

```txt
activity.json
ad-campaigns.json
broadcasts.json
campanhas.json
clicks.ndjson
group-grow.json
groups.json
leads.ndjson
leads.ndjson.bak
links.json
optout.json
orders.ndjson
referral-config.json
referrals.json
schedules.json
session.json
templates.json
welcome.json
```

Ha 22 arquivos de dados rastreados pelo Git em `hubflow-groups/data`.

Impacto:

- Nao escala em Vercel.
- Nao e multi-tenant.
- Nao tem RLS.
- Risco de concorrencia em escrita.
- Dificulta backup, auditoria e historico.
- Mistura dado de runtime com codigo-fonte.

### Prisma/PostgreSQL parcial

Existe schema Prisma em `hubflow-groups/prisma/schema.prisma`.

Modelos atuais:

- Account
- Plan
- Subscription
- Invoice

Esse schema representa uma tentativa inicial de contas/billing. Ele nao atende ainda ao modelo alvo porque:

- Usa `Account` como tenant, mas nao possui `organizations`/`memberships`.
- Nao possui roles Owner/Admin/Operator.
- Nao possui RLS.
- Esta orientado a Asaas/manual, nao Stripe.
- Nao cobre dominio operacional: instancias, funis, campanhas, mensagens, contatos, uploads e logs.

## Autenticacao Atual

A autenticacao atual usa cookie proprio assinado por HMAC:

```txt
dz_session
```

Caracteristicas:

- Sessao manual via `signSession` e `verifySession`.
- Defaults locais para `APP_PASSWORD`, `ENGINE_TOKEN` e `AUTH_SECRET`.
- Middleware bloqueia rotas por cookie ou por `x-engine-token`.
- Comentario no proprio codigo indica que nao e multi-tenant real.

Riscos:

- Nao atende Supabase Auth.
- Nao possui recuperacao de senha robusta.
- Nao possui convite de membros.
- Nao possui roles.
- Nao possui troca de organizacao ativa.
- `ENGINE_TOKEN` global cria superficie ampla de acesso.

## Billing Atual

Existe billing parcial com:

- Plan
- Subscription
- Invoice

O fluxo atual cria assinatura/fatura manual no banco. A documentacao interna menciona Asaas em algumas partes, mas o alvo atual e Stripe.

Lacunas:

- Stripe Checkout nao existe.
- Stripe Customer Portal nao existe.
- Webhooks Stripe nao existem.
- Entitlements por plano nao existem.
- Bloqueio automatico por plano ainda nao esta consolidado.
- FREE/Essencial/Growth/Performance Max ainda nao estao modelados no codigo.

## Engine Atual

A engine atual e um PoC funcional com Baileys.

Caracteristicas encontradas:

- Express inicial simples.
- Baileys com `useMultiFileAuthState("auth")`.
- QR code no terminal.
- Sessao persistida em `hubflow-engine/auth`.
- Polling contra APIs do app.
- Token compartilhado via `x-engine-token`.
- Fila anti-ban local.
- Heartbeat em `/api/session`.
- Consumo de `/api/dispatch/pending`.
- Ack em `/api/dispatch/ack`.
- Sync de grupos em `/api/groups`.
- Suporte a grow jobs.

Limites atuais:

- Single-session.
- Nao possui `tenant_id`.
- Nao possui `instance_id`.
- Sessao em pasta local fixa `auth`.
- Sem fila/locks externos para operacao multi-instancia.
- Sem comando/evento idempotente.
- Sem isolamento entre clientes.
- Sem separacao formal entre workers, queues, sessions, webhooks e API.

## Riscos Criticos

### P0 - Sessoes Baileys rastreadas no Git

Foram encontrados 25.761 arquivos rastreados em `hubflow-engine/auth`.

Impacto:

- Exposicao de credenciais/sessoes WhatsApp.
- Risco operacional direto para numero conectado.
- Repositorio pesado e instavel.
- Mudancas constantes no working tree.
- Deploy pode carregar dados de runtime indevidos.

Recomendacao:

- Remover `hubflow-engine/auth` do Git.
- Adicionar `hubflow-engine/auth/` no `.gitignore`.
- Rotacionar/desconectar sessoes expostas.
- Definir estrategia segura de persistencia por instancia.

### P0 - Dados operacionais rastreados no Git

Foram encontrados dados de runtime em `hubflow-groups/data`.

Impacto:

- Dados de clientes/campanhas/leads podem ir para versionamento.
- Sem isolamento multi-tenant.
- Incompativel com Vercel em producao.

Recomendacao:

- Remover `hubflow-groups/data` do Git.
- Manter apenas seeds/samples sanitizados, se necessario.
- Migrar dados canonicos para Supabase Postgres.

### P0 - Ausencia de RLS

O projeto ainda nao possui Supabase Postgres com RLS para o dominio principal.

Impacto:

- Isolamento depende do codigo de API.
- Um bug de filtro pode vazar dados entre tenants.
- Nao atende a regra obrigatoria de isolamento total.

Recomendacao:

- Criar migrations com `tenant_id`.
- Ativar RLS em todas as tabelas sensiveis.
- Criar policies baseadas em Supabase Auth, memberships e `tenant_id`.

### P1 - Auth propria nao atende SaaS multi-tenant

Impacto:

- Sem memberships.
- Sem roles.
- Sem convites.
- Sem recuperacao de senha completa.
- Sem modelo nativo de organizacao.

Recomendacao:

- Migrar para Supabase Auth.
- Criar `users`, `organizations`, `memberships`.
- Resolver `tenant_id` ativo em toda request.

### P1 - Engine acoplada por token global

Impacto:

- Um unico token da acesso a varias rotas da engine.
- Sem escopo por tenant/instancia.
- Dificil auditar comandos.

Recomendacao:

- Substituir polling direto por comandos/eventos idempotentes via Supabase ou Redis opcional.
- Comandos/eventos devem carregar `tenant_id`, `instance_id` e idempotency key.
- API interna deve validar assinatura e escopo.

### P1 - Billing antigo desalinhado com Stripe

Impacto:

- Modelo atual nao reflete Stripe.
- Planos alvo FREE/Essencial/Growth/Performance Max ainda nao existem.
- Bloqueio por plano ainda nao e fonte de verdade.

Recomendacao:

- Criar `plans` e `subscriptions` orientados a Stripe.
- Guardar `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id`.
- Implementar webhooks idempotentes.

## Gargalos Para 100 Clientes

1. File-store local nao suporta concorrencia real nem deploy serverless.
2. Engine single-session impede multiplas instancias por cliente.
3. Sessao Baileys em disco local sem particionamento por tenant impede isolamento.
4. Sem Redis, filas e locks ficam presos ao processo.
5. Sem RLS, isolamento fica fragil.
6. Sem plano/entitlements centralizados, bloqueio por assinatura fica inconsistente.
7. Sem logs estruturados por tenant, suporte e auditoria ficam cegos.

## O Que Pode Ser Reaproveitado

Reaproveitavel:

- Estrutura visual do painel atual.
- Rotas e contratos de produto como referencia.
- Conceitos de campanhas, grupos, links, leads, broadcasts e schedules.
- Fila anti-ban da engine como base operacional.
- Logica de claim/ack como conceito.
- Documentacao em `hubflow-groups/system`.

Deve ser substituido:

- File-store como persistencia principal.
- Auth propria por cookie assinado.
- Billing manual/Asaas por Stripe.
- `ENGINE_TOKEN` global.
- Sessao Baileys unica em `auth`.

Deve ser removido do Git:

- `hubflow-engine/auth/`
- `hubflow-groups/data/`
- builds e caches locais se estiverem rastreados.

## Estrutura Alvo Recomendada

```txt
HubFlow-platform/
  apps/
    web/
      app/
      components/
      features/
      lib/
  hubflow-engine/
    api/
    events/
    queues/
    sessions/
    workers/
    webhooks/
  packages/
    shared/
      contracts/
      types/
  infra/
    migrations/
    rls/
    seeds/
    scripts/
  docs/
```

## Criterios De Pronto Para Avancar Para Fase 2

Antes de iniciar a Fase 2, precisamos aceitar estas decisoes:

- Stack final: Next.js App Router, TypeScript, Supabase Postgres com RLS, Supabase Auth, Supabase Storage, React Flow, Tailwind, shadcn/ui e Stripe.
- Banco alvo: Supabase Postgres com RLS.
- Auth alvo: Supabase Auth.
- Filas/cache: Redis opcional para a engine.
- Billing: Stripe.
- Engine: servico separado, fora da Vercel.
- Multi-tenant obrigatorio via `tenant_id`.

Tambem precisamos tratar como pre-requisito da Fase 2:

- Planejar remocao segura de `hubflow-engine/auth` do Git.
- Planejar remocao segura de `hubflow-groups/data` do Git.
- Definir se dados atuais serao migrados ou descartados.
- Definir provedor do PostgreSQL.
- Definir provedor do Redis.
- Definir deploy da engine.

## Proxima Fase

Fase 2 - Plano de Migracao:

- Desenhar schema Supabase Postgres completo.
- Desenhar policies RLS.
- Definir Supabase Auth/session.
- Definir tenant context.
- Definir comandos/eventos da engine e decidir se Redis entra agora ou depois.
- Definir Stripe products/prices/webhooks.
- Definir ordem de refatoracao incremental.

## Politica De Registro De Alteracoes

A partir desta auditoria, toda alteracao relevante de arquitetura, seguranca, persistencia, autenticacao, billing, engine, deploy ou isolamento multi-tenant deve ser registrada neste documento.

O registro deve conter:

```txt
data
fase
area afetada
tipo de alteracao
resumo
impacto
arquivos principais
decisao/resultados
```

Exemplos de alteracoes que devem ser registradas:

- mudanca de stack;
- criacao ou remocao de tabelas;
- alteracao em policies RLS;
- troca de autenticacao;
- alteracao no contrato API/engine;
- mudanca no fluxo Stripe;
- remocao de dados sensiveis do Git;
- mudanca de deploy;
- nova dependencia estrutural;
- alteracao em limites de plano;
- refatoracao grande de pastas.

Alteracoes pequenas de UI, texto, estilo ou ajustes locais sem impacto arquitetural nao precisam ser registradas aqui.

## Registro De Alteracoes Pos-Auditoria

### 2026-06-23 - Fase 2 - Planejamento De Migracao

Area afetada:

- arquitetura;
- banco;
- autenticacao;
- Redis;
- Stripe;
- engine;
- deploy.

Tipo de alteracao:

- documentacao arquitetural.

Resumo:

- criado o plano de migracao da Fase 2 com schema alvo, estrategia RLS, NextAuth.js, tenant context, Redis queues, contrato da engine, Stripe e ordem de migracao.

Impacto:

- estabelece o roteiro para sair do MVP atual baseado em file-store, auth propria e engine single-session para uma arquitetura SaaS multi-tenant com PostgreSQL RLS, Redis, NextAuth.js, Stripe e engine desacoplada.

Arquivos principais:

- `docs/FASE_2_PLANO_DE_MIGRACAO.md`

Decisao/resultados:

- manter monorepo simples;
- usar Next.js como BFF/API principal;
- usar PostgreSQL com RLS como barreira real de isolamento;
- usar Redis para operacao, filas, locks e idempotencia;
- usar Stripe como fonte de billing;
- manter engine Baileys separada e orientada a comandos/eventos por `tenant_id` e `instance_id`.

### 2026-06-23 - Etapa De Higiene - Bloqueio De Runtime Data No Git

Area afetada:

- seguranca;
- engine;
- persistencia local;
- controle de versao;
- deploy.

Tipo de alteracao:

- ajuste de `.gitignore`.

Resumo:

- adicionadas regras para impedir novo versionamento de `hubflow-engine/auth/`, `hubflow-engine/engine-state.json` e `hubflow-groups/data/`.

Impacto:

- reduz o risco de novas sessoes Baileys, credenciais operacionais e dados locais serem adicionados ao Git;
- prepara a remocao segura dos arquivos ja rastreados no indice do repositorio;
- nao remove arquivos locais do disco.

Arquivos principais:

- `.gitignore`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- runtime data da engine e file-store operacional nao devem fazer parte do codigo-fonte;
- o proximo passo e remover esses arquivos do indice Git com `git rm --cached`, preservando os arquivos locais.

### 2026-06-23 - Etapa De Higiene - Remocao De Runtime Data Do Indice Git

Area afetada:

- seguranca;
- engine;
- persistencia local;
- controle de versao;
- deploy.

Tipo de alteracao:

- remocao de arquivos do indice Git, preservando arquivos locais.

Resumo:

- removidos do rastreamento do Git os diretorios `hubflow-engine/auth` e `hubflow-groups/data` com `git rm --cached -r`;
- os arquivos continuam existindo localmente no disco;
- as regras de `.gitignore` impedem que voltem a ser adicionados acidentalmente.

Impacto:

- elimina do indice atual 25.761 arquivos de sessao/autenticacao Baileys;
- elimina do indice atual 22 arquivos de dados operacionais locais;
- reduz risco de vazamento de sessoes, credenciais operacionais, leads, campanhas e dados de runtime em commits futuros;
- deixa o working tree com muitas delecoes staged, que devem ser commitadas junto com `.gitignore` e docs para efetivar a limpeza no repositorio.

Arquivos principais:

- `.gitignore`
- `hubflow-engine/auth/`
- `hubflow-groups/data/`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `git ls-files hubflow-engine/auth` retornou `0`;
- `git ls-files hubflow-groups/data` retornou `0`;
- `Test-Path hubflow-engine/auth` retornou `True`;
- `Test-Path hubflow-groups/data` retornou `True`;
- os dados foram removidos apenas do indice Git, nao do disco local.

### 2026-06-24 - Fase 3 - Scaffold Da Estrutura Alvo

Area afetada:

- arquitetura;
- organizacao do repositorio;
- frontend;
- engine;
- infra;
- pacotes compartilhados.

Tipo de alteracao:

- criacao de estrutura de diretorios e documentacao de refatoracao.

Resumo:

- criado o scaffold da estrutura alvo com `apps/`, `packages/` e `infra/`;
- adicionados READMEs de orientacao e arquivos `.gitkeep`;
- criado o documento `docs/FASE_3_REFATORACAO.md`;
- nenhum codigo runtime foi movido nesta etapa.

Impacto:

- estabelece o destino fisico da migracao sem quebrar o app atual em `hubflow-groups` nem a engine atual em `hubflow-engine`;
- permite mover web e engine em etapas separadas, com validacao propria;
- reduz risco de refatoracao grande demais em um unico passo.

Arquivos principais:

- `apps/README.md`
- `apps/web/.gitkeep`
- `packages/README.md`
- `packages/shared/constants/.gitkeep`
- `packages/shared/contracts/.gitkeep`
- `packages/shared/types/.gitkeep`
- `infra/README.md`
- `infra/migrations/.gitkeep`
- `infra/rls/.gitkeep`
- `infra/scripts/.gitkeep`
- `infra/seeds/.gitkeep`
- `docs/FASE_3_REFATORACAO.md`

Decisao/resultados:

- `hubflow-groups` permanece como app funcional atual ate a movimentacao controlada para `apps/web`;
- `hubflow-engine` permanece como engine funcional atual e sera reestruturada no proprio diretorio;
- proximos passos devem evitar mover `node_modules`, `.next`, caches e dados locais.

### 2026-06-24 - Fase 3 - Remocao Da Pasta Alvo Duplicada `engine/`

Area afetada:

- arquitetura;
- organizacao do repositorio;
- engine.

Tipo de alteracao:

- ajuste de decisao arquitetural e documentacao.

Resumo:

- a pasta vazia `engine/`, criada como scaffold futuro, foi removida para evitar duplicidade com `hubflow-engine`;
- a engine oficial permanece em `hubflow-engine`;
- documentos foram ajustados para tratar `hubflow-engine` como fonte da verdade da engine nesta fase.

Impacto:

- reduz confusao operacional;
- evita duas pastas com responsabilidade aparente de engine;
- mantem a migracao mais incremental e alinhada ao sistema existente.

Arquivos principais:

- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`
- `docs/FASE_2_PLANO_DE_MIGRACAO.md`
- `docs/FASE_3_REFATORACAO.md`
- `docs/ARQUITETURA_MIGRACAO_HUBFLOW.md`

Decisao/resultados:

- nao recriar `engine/` por enquanto;
- reestruturar a engine dentro de `hubflow-engine`;
- qualquer renomeacao futura de `hubflow-engine` deve ser uma etapa explicita, com validacao de start da engine.

### 2026-06-24 - Fase 3 - Movimentacao Do App Web Para `apps/web`

Area afetada:

- frontend;
- API Next.js;
- organizacao do repositorio;
- deploy;
- scripts.

Tipo de alteracao:

- movimentacao de arquivos rastreados.

Resumo:

- movidos os arquivos rastreados do app atual de `hubflow-groups` para `apps/web`;
- a movimentacao foi feita somente para arquivos rastreados pelo Git;
- `hubflow-groups/data`, `hubflow-groups/node_modules` e `hubflow-groups/.next` permaneceram fora de `apps/web`;
- adicionada regra `apps/web/data/` ao `.gitignore`.

Impacto:

- `apps/web` passa a ser a nova localizacao do app Next.js;
- `hubflow-groups` deixa de conter os arquivos rastreados do app, mas ainda pode existir localmente com runtime data/caches ignorados;
- scripts, comandos de build e deploy devem passar a usar `apps/web` como working directory;
- validacao de build/lint ainda depende de dependencias instaladas no novo caminho.

Arquivos principais:

- `apps/web/package.json`
- `apps/web/src/`
- `apps/web/prisma/`
- `apps/web/public/`
- `.gitignore`
- `docs/FASE_3_REFATORACAO.md`

Decisao/resultados:

- `Test-Path apps/web/package.json` retornou `True`;
- `Test-Path apps/web/src/app/page.tsx` retornou `True`;
- `Test-Path apps/web/data` retornou `False`;
- `Test-Path apps/web/node_modules` retornou `False`;
- `Test-Path apps/web/.next` retornou `False`;
- `Test-Path hubflow-groups/data` retornou `True`;
- `Test-Path hubflow-groups/node_modules` retornou `True`;
- `Test-Path hubflow-groups/.next` retornou `True`.

### 2026-06-24 - Fase 3 - Scripts De Workspace Na Raiz

Area afetada:

- organizacao do repositorio;
- scripts;
- frontend;
- engine.

Tipo de alteracao:

- ajuste de `package.json` raiz.

Resumo:

- configurado `package.json` raiz como pacote privado `hubflow-platform`;
- adicionados workspaces `apps/web` e `hubflow-engine`;
- adicionados scripts de conveniencia para web e engine.

Impacto:

- comandos passam a poder ser executados da raiz usando `npm run web:dev`, `npm run web:build`, `npm run web:lint` e `npm run engine:start`;
- facilita operacao do monorepo sem mover a engine atual;
- nao instala dependencias nem altera runtime diretamente.

Arquivos principais:

- `package.json`

Decisao/resultados:

- `apps/web` e `hubflow-engine` sao os workspaces ativos nesta fase;
- a dependencia raiz existente foi preservada para evitar churn desnecessario ate revisao posterior.

### 2026-06-24 - Decisao Arquitetural - Stack Final, Planos E Deploy

Area afetada:

- arquitetura;
- billing;
- banco;
- autenticacao;
- deploy;
- engine;
- repositorio.

Tipo de alteracao:

- decisao arquitetural.

Resumo:

- definidos os planos finais como `FREE`, `Essencial`, `Growth` e `Performance Max`;
- definido GitHub como repositorio remoto;
- definido deploy do frontend/API Next.js na Vercel;
- definido backend via API Routes do Next.js;
- definido PostgreSQL com Auth, Storage e RLS como base de dados/isolamento;
- definido Stripe como billing;
- definido deploy da engine em VPS com Docker + Coolify;
- Prisma foi descartado como stack alvo.

Impacto:

- documentos e proximas implementacoes devem usar os planos finais, nao `PRO/PREMIUM`;
- a engine continua desacoplada e sera preparada para processo long-running fora da Vercel;
- qualquer codigo Prisma existente passa a ser legado temporario;
- migrations devem ser SQL em `infra/migrations`;
- policies RLS devem ficar em `infra/rls`;
- acesso ao banco deve ser feito por camada PostgreSQL/RLS, nao por Prisma.

Arquivos principais:

- `docs/ARQUITETURA_MIGRACAO_HUBFLOW.md`
- `docs/FASE_2_PLANO_DE_MIGRACAO.md`
- `docs/FASE_3_REFATORACAO.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- planos finais: `FREE`, `Essencial`, `Growth`, `Performance Max`;
- web/API: Vercel com Next.js App Router;
- backend: API Routes;
- banco/auth/storage/RLS: PostgreSQL + Auth + Storage + RLS;
- billing: Stripe;
- engine: VPS + Docker + Coolify;
- repositorio: GitHub;
- Prisma: nao usar como alvo; remover o legado em etapa propria.

### 2026-06-24 - Decisao Arquitetural - Arquitetura Supabase-First

Area afetada:

- arquitetura;
- banco;
- autenticacao;
- storage;
- logs;
- billing;
- engine;
- deploy.

Tipo de alteracao:

- ajuste de decisao arquitetural.

Resumo:

- consolidada a arquitetura alvo com GitHub -> Vercel -> Supabase -> Stripe -> Supabase entitlements/plans;
- Supabase passa a ser a plataforma alvo para Postgres multi-tenant com RLS, Auth, Storage e Logs;
- Stripe continua como fonte de billing e webhooks, mas o estado operacional de planos/entitlements fica no Supabase;
- Engine Baileys permanece separada em VPS com Coolify + Docker;
- Redis deixa de ser dependencia obrigatoria inicial e passa a ser opcional para filas, locks e workers da engine.

Impacto:

- documentos e proximas implementacoes devem priorizar Supabase Auth em vez de NextAuth.js;
- migrations devem continuar em SQL, sem Prisma;
- RLS deve ser desenhado para Supabase Postgres;
- Storage deve usar buckets privados do Supabase por `tenant_id`;
- filas da engine podem comecar por tabelas/comandos no Supabase e evoluir para Redis se o volume justificar;
- qualquer referencia a Redis obrigatorio deve ser tratada como legado do plano anterior.

Arquivos principais:

- `docs/ARQUITETURA_MIGRACAO_HUBFLOW.md`
- `docs/FASE_2_PLANO_DE_MIGRACAO.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- arquitetura alvo validada:

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

- Supabase Auth substitui NextAuth.js como alvo atual;
- Redis e opcional, nao pre-requisito da primeira versao multi-tenant;
- `hubflow-engine` continua sendo a pasta oficial da engine;
- Prisma permanece descartado como alvo.

### 2026-06-24 - Fase 4 - Fundacao Supabase Postgres, RLS E Storage

Area afetada:

- banco;
- multi-tenant;
- RLS;
- storage;
- billing;
- engine;
- auditoria.

Tipo de alteracao:

- criacao de schema SQL, policies RLS, seed de planos e policies de storage.

Resumo:

- criada a migration base com tabelas obrigatorias `users`, `organizations`, `memberships`, `plans`, `subscriptions`, `instances`, `funnels`, `campaigns`, `messages`, `contacts`, `uploads` e `logs`;
- adicionadas tabelas auxiliares `engine_commands` e `engine_events` para permitir comandos/eventos da engine sem Redis inicialmente;
- criada camada RLS baseada em Supabase Auth, `memberships`, `tenant_id` e roles Owner/Admin/Operator;
- criado seed dos planos finais `FREE`, `Essencial`, `Growth` e `Performance Max`;
- criado bucket privado `uploads` com policies por primeiro segmento do path como `tenant_id`;
- documentada a Fase 4 em arquivo proprio.

Impacto:

- a base multi-tenant passa a ter um schema alvo aplicavel no Supabase;
- todas as tabelas de dominio possuem `id`, `tenant_id`, `created_at` e `updated_at`;
- isolamento entre tenants deixa de depender apenas do codigo da API;
- Redis pode continuar adiado enquanto a engine usa comandos/eventos persistidos no Supabase;
- Prisma nao participa da nova fundacao de banco.

Arquivos principais:

- `docs/FASE_4_BANCO.md`
- `infra/migrations/202606240001_base_schema.sql`
- `infra/rls/202606240002_rls_policies.sql`
- `infra/seeds/202606240003_seed_plans.sql`
- `infra/rls/202606240004_storage_policies.sql`
- `infra/README.md`

Decisao/resultados:

- `organizations.id` e o identificador do tenant;
- `organizations.tenant_id` existe e deve ser igual a `organizations.id`;
- `users` referencia `auth.users` e representa perfil por tenant;
- `memberships` referencia `auth.users` e controla roles;
- `plans` usa tenant de sistema `00000000-0000-0000-0000-000000000001`;
- bootstrap seguro permite criar organizacao e primeiro owner associado ao criador;
- storage privado usa bucket `uploads` e path `<tenant_id>/<kind>/<file>`.

### 2026-06-24 - Fase 5 - Fundacao Stripe Com Supabase Entitlements

Area afetada:

- billing;
- Stripe;
- Supabase;
- autenticacao;
- multi-tenant;
- seguranca;
- planos.

Tipo de alteracao:

- criacao de camada server-side de billing, rotas Stripe e helpers de entitlements.

Resumo:

- instaladas as dependencias oficiais `stripe` e `@supabase/supabase-js`;
- criado cliente Supabase server-side com anon token validado e service role restrita ao backend;
- criado tenant context baseado em `Authorization: Bearer <supabase_access_token>` e `x-tenant-id`;
- criadas rotas `POST /api/billing/checkout`, `POST /api/billing/portal` e `POST /api/billing/webhook`;
- criado helper `assertPlanLimit(tenantId, capability)` para bloqueio automatico por plano;
- atualizado `.env.example` para Supabase Auth/Storage/Postgres e Stripe;
- documentada a Fase 5 em arquivo proprio.

Impacto:

- o novo billing deixa de depender de Prisma;
- Stripe passa a sincronizar assinaturas para `subscriptions` no Supabase;
- `plans.limits` passa a ser a base local de entitlements;
- billing fica restrito a Owner/Admin;
- webhook Stripe valida assinatura antes de alterar estado;
- rotas legadas `/api/plans` e `/api/subscription` continuam existindo temporariamente, mas devem ser substituidas pela UI nova em etapa seguinte.

Arquivos principais:

- `docs/FASE_5_STRIPE.md`
- `apps/web/src/lib/billing/stripe.ts`
- `apps/web/src/lib/billing/plans.ts`
- `apps/web/src/lib/billing/entitlements.ts`
- `apps/web/src/lib/supabase/server.ts`
- `apps/web/src/lib/supabase/tenant-context.ts`
- `apps/web/src/app/api/billing/checkout/route.ts`
- `apps/web/src/app/api/billing/portal/route.ts`
- `apps/web/src/app/api/billing/webhook/route.ts`
- `apps/web/.env.example`
- `apps/web/package.json`
- `apps/web/package-lock.json`

Decisao/resultados:

- Stripe Checkout atende planos pagos `ESSENCIAL`, `GROWTH` e `PERFORMANCE_MAX`;
- plano `FREE` permanece sem Stripe Price ID e deve ser tratado como fallback/local entitlement;
- Supabase e a fonte local para autorizacao de plano;
- service role nao deve ser exposta ao cliente;
- validacao TypeScript com `tsc --noEmit --project tsconfig.json` em `apps/web` passou.

### 2026-06-24 - Fase 6 - Engine Com Comandos/Eventos Supabase

Area afetada:

- engine;
- filas;
- Supabase;
- multi-tenant;
- deploy;
- observabilidade.

Tipo de alteracao:

- criacao de worker de comandos/eventos, RPCs de fila e preparacao Docker.

Resumo:

- adicionada migration `app.claim_engine_commands`, `app.complete_engine_command` e `app.record_engine_event`;
- criado worker `hubflow-engine/queues/supabase-command-worker.js`;
- integrado o worker ao `hubflow-engine/index.js`, iniciando quando o WhatsApp conecta e parando quando a conexao fecha;
- adicionado healthcheck `GET /health` com status do WhatsApp e do worker Supabase;
- criados diretorios alvo `api`, `events`, `queues`, `sessions`, `workers` e `webhooks` dentro de `hubflow-engine`;
- adicionados `.env.example`, `Dockerfile` e `.dockerignore` para deploy em VPS/Coolify;
- atualizada documentacao da Fase 6.

Impacto:

- a engine passa a ter uma primeira via multi-tenant via `engine_commands` e `engine_events`;
- Redis permanece opcional;
- comandos podem ser processados com claim atomico usando `for update skip locked`;
- `hubflow-engine` permanece como engine oficial;
- a sessao Baileys ainda e legada em `auth/`, mas o caminho futuro `sessions/<tenant_id>/<instance_id>` foi reservado;
- comandos suportados nesta fatia: `send_message` e `refresh_status`.

Arquivos principais:

- `docs/FASE_6_ENGINE.md`
- `infra/migrations/202606240005_engine_rpc.sql`
- `hubflow-engine/index.js`
- `hubflow-engine/config/env.js`
- `hubflow-engine/queues/supabase-command-worker.js`
- `hubflow-engine/.env.example`
- `hubflow-engine/Dockerfile`
- `hubflow-engine/.dockerignore`
- `hubflow-engine/.gitignore`

Decisao/resultados:

- comandos da engine devem entrar por Supabase nesta primeira versao;
- worker usa `SUPABASE_SERVICE_ROLE_KEY` apenas no processo da VPS;
- endpoints publicos da engine nao devem receber comandos operacionais;
- validacao de sintaxe `node --check` passou para `index.js`, `queues/supabase-command-worker.js` e `config/env.js`.

### 2026-06-24 - Fase 7 - Artefatos De Deploy Vercel, Supabase E Coolify

Area afetada:

- deploy;
- Vercel;
- Supabase;
- Stripe;
- engine;
- Coolify;
- scripts;
- Prisma legado.

Tipo de alteracao:

- criacao de configuracoes e scripts de deploy.

Resumo:

- criado `vercel.json` apontando install/build/output para `apps/web`;
- criados scripts PowerShell e shell para aplicar SQL Supabase em ordem;
- criado compose de deploy da engine para Coolify/VPS;
- criado `.env.example` do deploy Coolify;
- adicionados scripts raiz `supabase:apply:ps` e `engine:docker:build`;
- scripts Prisma do app web foram renomeados para `legacy:prisma:*`, deixando claro que nao sao o caminho alvo;
- configurado `ENGINE_STATE_FILE` para persistir estado operacional da engine em volume Docker.

Impacto:

- deploy da web fica orientado a Vercel com monorepo simples;
- banco passa a ter fluxo de aplicacao SQL sem Prisma;
- engine passa a ter artefato Docker/Coolify com volumes para auth, sessions e state;
- Stripe webhook fica documentado como `https://app.seudominio.com/api/billing/webhook`;
- o build final ainda pode ficar bloqueado pelas rotas Prisma legadas ate substituicao completa por Supabase.

Arquivos principais:

- `vercel.json`
- `docs/FASE_7_DEPLOY.md`
- `infra/scripts/apply-supabase-sql.ps1`
- `infra/scripts/apply-supabase-sql.sh`
- `deploy/coolify/engine.docker-compose.yml`
- `deploy/coolify/.env.example`
- `package.json`
- `apps/web/package.json`
- `hubflow-engine/index.js`
- `hubflow-engine/.env.example`

Decisao/resultados:

- Vercel deve executar build do app em `apps/web`;
- Supabase deve receber migrations SQL em ordem documentada;
- Coolify deve subir `hubflow-engine` via Docker;
- Prisma permanece apenas como legado temporario, nao como script principal;
- validacao JSON de `vercel.json`, `package.json` e `apps/web/package.json` passou;
- `node --check index.js` passou apos ajuste de `ENGINE_STATE_FILE`.

### 2026-06-24 - Fase 8 - Checklist De Producao

Area afetada:

- producao;
- seguranca;
- deploy;
- multi-tenant;
- Supabase;
- Stripe;
- engine;
- observabilidade.

Tipo de alteracao:

- documentacao operacional e checklist de liberacao.

Resumo:

- criado checklist de producao com bloqueadores P0, GitHub, Vercel, Supabase, Stripe, Engine, multi-tenant e observabilidade;
- separado o que esta preparado do que ainda bloqueia producao;
- documentado que producao nao deve ser liberada enquanto Prisma ainda for dependencia operacional do build ou enquanto RLS/auth/Stripe/engine nao forem validados em ambiente real.

Impacto:

- a sequencia de entrega passa a ter um criterio objetivo de pronto para producao;
- evita promover o MVP atual antes de corrigir os riscos de isolamento, secrets, billing e engine;
- deixa claro que os artefatos foram preparados, mas ainda precisam de aplicacao/teste em servicos reais.

Arquivos principais:

- `docs/FASE_8_CHECKLIST_PRODUCAO.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- producao ainda nao esta liberada;
- os principais bloqueadores sao Prisma legado, Supabase Auth na UI, migrations aplicadas no Supabase real, testes RLS, Stripe webhook real e validacao da engine em VPS/Coolify.

### 2026-06-24 - Pos-Fase 8 - Remocao Do Prisma Operacional Do App Web

Area afetada:

- frontend/API;
- autenticacao;
- billing;
- Supabase;
- build;
- documentacao interna.

Tipo de alteracao:

- substituicao de rotas legadas Prisma por Supabase e remocao de dependencias/arquivos Prisma.

Resumo:

- `/api/auth/signup` passou a criar usuario Supabase Auth, organizacao, profile, membership Owner e assinatura FREE;
- `/api/auth/login` passou a validar Supabase Auth;
- `/api/plans` passou a ler catalogo de planos do Supabase;
- `/api/subscription` passou a consultar assinatura do tenant no Supabase e desativou o fluxo manual legado de troca de plano;
- `src/lib/db.ts` e `apps/web/prisma/*` foram removidos;
- dependencias `prisma` e `@prisma/client` foram removidas do app web;
- documentos internos antigos em `apps/web/system` foram marcados como legado.

Impacto:

- o app web deixa de depender de `prisma generate` para build;
- o build final do Next.js passou;
- o cookie `dz_session` permanece temporariamente como compatibilidade do middleware, agora contendo `auth.users.id`;
- a UI ainda precisa ser migrada para armazenar/usar a sessao Supabase de forma nativa;
- a validacao real ainda depende de um projeto Supabase configurado com migrations aplicadas.

Arquivos principais:

- `apps/web/src/app/api/auth/signup/route.ts`
- `apps/web/src/app/api/auth/login/route.ts`
- `apps/web/src/app/api/plans/route.ts`
- `apps/web/src/app/api/subscription/route.ts`
- `apps/web/package.json`
- `apps/web/package-lock.json`
- `apps/web/system/DB_SCHEMA.md`
- `apps/web/system/API_CONTRACTS.md`
- `apps/web/system/NEXT.md`
- `docs/FASE_7_DEPLOY.md`
- `docs/FASE_8_CHECKLIST_PRODUCAO.md`

Decisao/resultados:

- Prisma nao e mais dependencia operacional do app web;
- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou;
- producao ainda exige validar Supabase Auth/RLS/Stripe em ambiente real.

### 2026-06-24 - Pos-Fase 8 - Sessao Supabase No Cliente Web

Area afetada:

- frontend;
- autenticacao;
- Supabase Auth;
- middleware;
- logout.

Tipo de alteracao:

- adicao de cliente Supabase browser e persistencia de sessao na UI.

Resumo:

- criado `apps/web/src/lib/supabase/client.ts`;
- login e signup passaram a persistir `accessToken` e `refreshToken` no Supabase client do browser;
- logout passou a chamar `supabase.auth.signOut()` antes de limpar o cookie legado;
- cookie `dz_session` permanece como compatibilidade temporaria do middleware atual.

Impacto:

- o navegador passa a ter sessao Supabase nativa apos login/cadastro;
- futuras chamadas autenticadas podem usar `Authorization: Bearer <access_token>`;
- reduz dependencia exclusiva do cookie legado;
- ainda falta trocar o middleware para validacao Supabase server-side/SSR completa.

Arquivos principais:

- `apps/web/src/lib/supabase/client.ts`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/app/signup/page.tsx`
- `apps/web/src/components/sidebar.tsx`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou;
- o warning restante do build e sobre file-store legado em `media-store.ts`, nao sobre auth.

### 2026-06-24 - Pos-Fase 8 - Migracao De Midia Para Supabase Storage

Area afetada:

- storage;
- uploads;
- Supabase;
- API web;
- engine;
- Vercel.

Tipo de alteracao:

- substituicao de file-store de midia por Supabase Storage privado.

Resumo:

- `media-store.ts` deixou de gravar arquivos em `data/media`;
- upload de midia passou a gravar no bucket privado `uploads`;
- metadados passaram a ser registrados na tabela `uploads`;
- `POST /api/media` passou a resolver o tenant do usuario autenticado antes de salvar;
- `GET /api/media/[id]` continua servindo bytes para navegador/engine, mas agora baixa do Supabase Storage;
- ids de midia passaram a codificar o path privado do objeto, sem expor path com barras na URL.

Impacto:

- remove dependencia de runtime local para midias;
- aproxima uploads do modelo multi-tenant final;
- melhora compatibilidade com Vercel;
- midias antigas em `data/media` nao sao mais lidas por essa rota e devem ser migradas se forem necessarias.

Arquivos principais:

- `apps/web/src/lib/media-store.ts`
- `apps/web/src/app/api/media/route.ts`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- bucket alvo: `uploads`;
- objeto salvo em `<tenant_id>/media/<uuid.ext>`;
- metadado salvo em `uploads/<tenant_id>/media/<uuid.ext>`;
- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou;
- warning de build sobre file-store legado foi removido; resta apenas aviso de convencao `middleware` do Next 16.

### 2026-06-24 - Pos-Fase 8 - Migracao De Middleware Para Proxy Next.js

Area afetada:

- frontend/API;
- autenticacao;
- Next.js;
- deploy Vercel.

Tipo de alteracao:

- atualizacao de convencao de arquivo Next.js.

Resumo:

- `apps/web/src/middleware.ts` foi substituido por `apps/web/src/proxy.ts`;
- a funcao exportada passou de `middleware` para `proxy`;
- regras de protecao de rotas, token da engine e cookie transicional foram preservadas.

Impacto:

- remove o warning de build do Next.js 16 sobre convencao `middleware`;
- mantem comportamento atual de autenticacao enquanto a migracao Supabase server-side completa nao termina;
- deixa o deploy Vercel mais limpo.

Arquivos principais:

- `apps/web/src/proxy.ts`
- `apps/web/src/middleware.ts`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou sem warnings.

### 2026-06-24 - Pos-Fase 8 - Indice Unificado De Deploy

Area afetada:

- deploy;
- documentacao operacional;
- runbook online.

Tipo de alteracao:

- melhoria de navegacao dos guias de publicacao.

Resumo:

- criado `deploy/README.md` como indice dos guias GitHub, Supabase, Stripe, Vercel, Coolify, E2E e Go/No-Go;
- runbook online passou a referenciar o indice logo no preflight;
- indice reforca stack atual e status `NO-GO` ate validacao real.

Impacto:

- reduz dispersao da documentacao de deploy;
- facilita seguir a ordem correta para publicar online;
- deixa claro que o ambiente so deve ir para cliente pago depois do E2E e Go/No-Go.

Arquivos principais:

- `deploy/README.md`
- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- alteracao documental, sem impacto de runtime.

### 2026-06-24 - Pos-Fase 8 - Config Vercel Por Root Directory Apps Web

Area afetada:

- Vercel;
- deploy do app web;
- documentacao operacional;
- scripts de preflight.

Tipo de alteracao:

- correcao de configuracao de monorepo para Vercel.

Resumo:

- criado `apps/web/vercel.json` com comandos relativos ao app web;
- removido `vercel.json` da raiz para evitar detecao de Next.js no `package.json` errado;
- documentacao passou a orientar Root Directory `apps/web`;
- comandos esperados na Vercel passaram a ser `npm install`, `npm run build` e output `.next`;
- `verify-local.ps1` passou a validar `apps/web/vercel.json`.

Impacto:

- deploy preview passa a usar o `package.json` correto do app Next.js;
- elimina ambiguidade entre repo root e app root;
- reduz risco de `cd apps/web` duplicado ou detecao de framework no diretorio errado.

Arquivos principais:

- `apps/web/vercel.json`
- `vercel.json`
- `deploy/vercel/README.md`
- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `infra/scripts/verify-local.ps1`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- ajuste feito apos log Vercel indicar `No Next.js version detected` no root do repo.

### 2026-06-24 - Pos-Fase 8 - Diagnostico De PSQL No Apply Supabase

Area afetada:

- Supabase;
- scripts de deploy;
- DX operacional em Windows.

Tipo de alteracao:

- melhoria de erro operacional.

Resumo:

- `infra/scripts/apply-supabase-sql.ps1` passou a verificar se `psql` existe no PATH antes de aplicar migrations;
- quando `psql` nao esta instalado, o script informa as duas opcoes: instalar PostgreSQL client ou aplicar os SQLs pelo Supabase SQL Editor;
- chamada ao binario passou a usar o caminho resolvido por `Get-Command`.

Impacto:

- evita erro confuso de PowerShell durante setup do Supabase;
- facilita continuar o deploy online mesmo sem cliente PostgreSQL instalado localmente;
- nao altera schema nem runtime do app.

Arquivos principais:

- `infra/scripts/apply-supabase-sql.ps1`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- ajuste feito apos falha local por ausencia de `psql` no Windows.

### 2026-06-24 - Pos-Fase 8 - Alinhamento Final Para Next.js 15

Area afetada:

- app web;
- dependencias;
- middleware de autenticacao;
- lint/build;
- scripts de verificacao;
- documentacao de arquitetura.

Tipo de alteracao:

- alinhamento da stack instalada com a arquitetura alvo.

Resumo:

- `apps/web` foi alterado de Next.js 16 para Next.js 15;
- `eslint-config-next` foi alinhado para a mesma linha de versao;
- protecao de borda voltou de `proxy.ts` para `middleware.ts`, compativel com Next.js 15;
- `eslint.config.mjs` passou a usar `FlatCompat` para consumir presets Next.js 15 com ESLint 9;
- avisos de hooks nos paineis de auditoria, billing, instancias e membros foram resolvidos com `useCallback`;
- `infra/scripts/verify-local.ps1` passou a resolver `tsc` via `npm exec`, evitando fragilidade com dependencias hoistadas;
- arquitetura e Fase 3 foram atualizadas para refletir que Next.js 15 agora e decisao implementada.

Impacto:

- Vercel passa a buildar o app dentro da versao pedida originalmente;
- middleware de autenticacao fica ativo no padrao esperado do Next.js 15;
- `apps/web/package-lock.json` foi regravado para evitar reinstalar Next.js 16 no install da Vercel;
- lint fica sem warnings do produto ativo.

Arquivos principais:

- `apps/web/package.json`
- `apps/web/package-lock.json`
- `package-lock.json`
- `apps/web/src/middleware.ts`
- `apps/web/src/proxy.ts`
- `apps/web/eslint.config.mjs`
- `apps/web/tsconfig.json`
- `apps/web/src/components/audit-log-panel.tsx`
- `apps/web/src/components/billing-panel.tsx`
- `apps/web/src/components/instances-panel.tsx`
- `apps/web/src/components/members-panel.tsx`
- `infra/scripts/verify-local.ps1`
- `docs/ARQUITETURA_MIGRACAO_HUBFLOW.md`
- `docs/FASE_3_REFATORACAO.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run lint` passou sem warnings do produto ativo;
- `npm run verify:local` passou;
- build reportou `Next.js 15.5.19` e `Middleware` ativo;
- `npm audit` reportou 2 vulnerabilidades moderadas em dependencias, mas a consulta detalhada foi bloqueada por risco de envio de metadados ao registry externo;
- Go/No-Go passou a exigir auditoria de dependencias em ambiente autorizado antes de liberar producao.

### 2026-06-24 - Pos-Fase 8 - Rebrand HUBFLOW E CTA Comercial Online

Area afetada:

- branding;
- landing page;
- navegacao;
- healthcheck;
- envs de producao;
- documentacao Vercel.

Tipo de alteracao:

- remocao de referencias antigas de marca e parametrizacao de CTA comercial.

Resumo:

- removidas referencias ativas a `DevZap Groups` e `DevZapp` no app web;
- substituido subtitulo legado `VIP Growth OS` por `WhatsApp Growth OS`;
- removido telefone fixo de exemplo da landing;
- criado `NEXT_PUBLIC_SALES_WHATSAPP_URL` para configurar CTA comercial em producao;
- CTA principal da landing usa `/signup` como fallback quando a URL comercial nao estiver definida;
- healthcheck passou a reportar `salesWhatsappUrl` como check informativo, sem bloquear deploy.

Impacto:

- app publicado deixa de expor marca ou telefone legado;
- producao pode apontar o CTA para WhatsApp comercial real sem alterar codigo;
- ambiente de homologacao continua funcional mesmo sem URL comercial configurada;
- healthcheck ajuda a detectar configuracao comercial pendente antes do go-live.

Arquivos principais:

- `apps/web/src/app/page.tsx`
- `apps/web/src/components/mobile-nav.tsx`
- `apps/web/src/components/sidebar.tsx`
- `apps/web/src/components/auth-shell.tsx`
- `apps/web/src/lib/campanhas-store.ts`
- `apps/web/src/app/(app)/groups/page.tsx`
- `apps/web/src/app/api/health/route.ts`
- `apps/web/.env.example`
- `deploy/vercel/.env.production.example`
- `deploy/vercel/README.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run verify:local` passou;
- busca por marcas antigas em codigo ativo nao encontrou referencias de produto legado;
- `NEXT_PUBLIC_SALES_WHATSAPP_URL` ficou opcional para nao travar preview/deploy.

### 2026-06-24 - Pos-Fase 8 - Checklist E2E E Go/No-Go Online

Area afetada:

- deploy;
- validacao online;
- checklist producao;
- documentacao operacional.

Tipo de alteracao:

- consolidacao de criterios finais para liberar ambiente online.

Resumo:

- criado roteiro E2E online com healthchecks, registro, RLS, storage, Stripe, engine e auditoria;
- criado documento Go/No-Go com status inicial `NO-GO` ate validacao real de dominios, credenciais e webhooks;
- Fase 8 passou a referenciar os documentos antes do primeiro cliente pago;
- runbook online passou a apontar para os guias detalhados de E2E e Go/No-Go.

Impacto:

- reduziu risco de liberar producao sem validar isolamento multi-tenant;
- deixou explicito que o codigo esta preparado, mas o ambiente real ainda precisa de validacao externa;
- criou uma sequencia objetiva para validar Vercel, Supabase, Stripe e Coolify/VPS.

Arquivos principais:

- `deploy/e2e/README.md`
- `deploy/GO_NO_GO.md`
- `docs/FASE_8_CHECKLIST_PRODUCAO.md`
- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- status de producao permanece `NO-GO` ate execucao real do E2E online;
- os novos guias nao alteram runtime, apenas reduzem ambiguidade operacional.

### 2026-06-24 - Pos-Fase 8 - Verify Online Valida Paginas Publicas

Area afetada:

- deploy;
- verificacao online;
- branding;
- documentacao operacional.

Tipo de alteracao:

- ampliacao do script de smoke test online.

Resumo:

- `infra/scripts/verify-online.ps1` passou a validar landing, login, signup e recuperacao de senha;
- script detecta referencias legadas na landing como `DevZap`, `DevZapp`, `VIP Growth OS` e telefone fixo de exemplo;
- adicionado parametro `-SkipPublicPages` para validar apenas healthchecks quando necessario;
- guias de E2E, Fase 8 e runbook online foram atualizados.

Impacto:

- erros simples de roteamento publico em Vercel passam a ser detectados antes do teste manual;
- reduz risco de publicar marca/telefone legado no dominio final;
- mantem alternativa rapida para validar apenas `/api/health` e `/health`.

Arquivos principais:

- `infra/scripts/verify-online.ps1`
- `deploy/e2e/README.md`
- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `docs/FASE_8_CHECKLIST_PRODUCAO.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- validacao online segue dependente de URLs reais;
- parametro `-SkipPublicPages` evita falso bloqueio em janelas de manutencao do frontend publico.

### 2026-06-24 - Pos-Fase 8 - Rebrand Runtime Da Engine HUBFLOW

Area afetada:

- engine Baileys;
- logs operacionais;
- health/status publico da engine;
- documentacao da engine.

Tipo de alteracao:

- remocao de marca legada em runtime da engine.

Resumo:

- endpoint raiz da engine passou a responder `HUBFLOW Engine online`;
- log de inicializacao passou a usar `HUBFLOW Engine`;
- identificador `browser` do Baileys passou de marca legada para `HUBFLOW`;
- README/CLAUDE locais da engine foram atualizados mecanicamente para a marca atual.

Impacto:

- deploy da engine em Coolify/VPS nao expõe mais marca antiga no endpoint raiz;
- logs de producao ficam alinhados ao produto atual;
- reduz confusao operacional entre engine antiga e arquitetura HUBFLOW.

Arquivos principais:

- `hubflow-engine/index.js`
- `hubflow-engine/README.md`
- `hubflow-engine/CLAUDE.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `agent-orchestrator` dentro de `hubflow-engine` nao foi alterado por parecer subprojeto/ruido separado;
- exemplos de telefone em documentacao de fase permanecem apenas como placeholders tecnicos.

### 2026-06-24 - Pos-Fase 8 - Engine Atualiza Status Da Instancia No Banco

Area afetada:

- engine Baileys;
- Supabase/PostgreSQL;
- RPCs da engine;
- instancias WhatsApp;
- observabilidade.

Tipo de alteracao:

- sincronizacao direta de status da engine para `instances`.

Resumo:

- criada RPC `app.update_instance_status`;
- worker Supabase da engine passou a atualizar `instances.status`, `last_seen_at`, `connected_at`, `disconnected_at`, `qr_code`, `engine_node` e `metadata`;
- comando `refresh_status` agora grava evento e tambem reflete status conectado na instancia;
- falhas de comando passam a marcar a instancia como `error` com `last_error` em metadata;
- `docs/FASE_6_ENGINE.md` foi atualizado.

Impacto:

- UI/API nao precisam depender apenas de eventos brutos para status operacional;
- prepara leitura direta de QR/status por tenant e instancia;
- multi-socket completo ainda permanece como etapa posterior da engine.

Arquivos principais:

- `infra/migrations/202606240005_engine_rpc.sql`
- `hubflow-engine/queues/supabase-command-worker.js`
- `docs/FASE_6_ENGINE.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `node --check hubflow-engine/queues/supabase-command-worker.js` passou;
- `tsc --noEmit --project tsconfig.json` passou;
- `npm run build` em `apps/web` passou;
- houve um panic intermitente do Turbopack ao chamar build via `npm --prefix apps/web run build`, mas a repeticao pelo diretorio do app passou sem erro.

### 2026-06-24 - Pos-Fase 8 - UI De Instancias WhatsApp

Area afetada:

- app web;
- instancias WhatsApp;
- engine command queue;
- billing por plano.

Tipo de alteracao:

- exposicao visual do fluxo multi-instancia preparado na API.

Resumo:

- criado componente `InstancesPanel`;
- tela de Configuracoes passou a listar instancias do tenant;
- Owner/Admin podem criar nova instancia respeitando limite do plano;
- a UI pode enviar comando `refresh_status` para a engine via `/api/engine/commands`;
- status exibido vem de `instances.status`.

Impacto:

- o usuario passa a operar instancias pelo app, nao apenas por API;
- prepara o fluxo de QR/status por instancia;
- ainda depende da evolucao da engine para sockets dedicados por `tenant_id + instance_id`.

Arquivos principais:

- `apps/web/src/components/instances-panel.tsx`
- `apps/web/src/app/(app)/settings/page.tsx`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm run build` em `apps/web` passou.

### 2026-06-24 - Pos-Fase 8 - Runbook De Deploy Atualizado

Area afetada:

- deploy;
- documentacao operacional;
- Vercel;
- Supabase;
- Coolify/VPS.

Tipo de alteracao:

- atualizacao de runbook e checklist.

Resumo:

- `docs/FASE_7_DEPLOY.md` passou a citar `infra/scripts/verify-local.ps1`;
- variavel `ENGINE_INTERNAL_TOKEN` foi substituida por `ENGINE_TOKEN`;
- ordem de SQL passou a incluir `202606240006_membership_invites.sql`;
- bloqueadores antigos de UI auth/billing foram removidos da lista, pois ja ha implementacao local;
- checklist de producao passou a exigir `npm run verify:local`.

Impacto:

- reduz chance de configurar deploy com variaveis obsoletas;
- runbook fica alinhado com o estado atual da migracao;
- pendencias restantes ficam mais precisas: Supabase real, RLS real, Stripe real, recovery redirect e engine em VPS.

Arquivos principais:

- `docs/FASE_7_DEPLOY.md`
- `docs/FASE_8_CHECKLIST_PRODUCAO.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- documentacao alinhada ao estado local validado por `npm run verify:local`.

### 2026-06-24 - Pos-Fase 8 - Vercel Build Sem `npm --prefix`

Area afetada:

- deploy Vercel;
- Next.js/Turbopack;
- verificação local.

Tipo de alteracao:

- ajuste de comando de build/install no `vercel.json`.

Resumo:

- `vercel.json` deixou de usar `npm --prefix apps/web`;
- comandos passaram para `cd apps/web && npm install` e `cd apps/web && npm run build`;
- docs de deploy foram atualizados.

Impacto:

- evita o panic intermitente do Turbopack observado localmente com `npm --prefix`;
- aproxima o build da forma que passou de maneira estavel no workspace;
- reduz risco de falha espuria no deploy Vercel.

Arquivos principais:

- `vercel.json`
- `docs/FASE_7_DEPLOY.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `vercel.json` parseou corretamente;
- `npm run verify:local` passou com sucesso.

### 2026-06-24 - Pos-Fase 8 - Auditoria Consultavel Por Tenant

Area afetada:

- observabilidade;
- auditoria;
- API web;
- Supabase/PostgreSQL;
- tela de Configuracoes.

Tipo de alteracao:

- correcao de escrita de logs e exposicao de leitura segura.

Resumo:

- inserts em `logs` passaram a usar `actor_user_id`, alinhado ao schema real;
- criada rota `GET /api/logs`, restrita a Owner/Admin via `getTenantContext`;
- criada UI `AuditLogPanel` em Configuracoes;
- painel mostra eventos recentes, nivel, mensagem e data;
- logs continuam isolados por `tenant_id`.

Impacto:

- auditoria deixa de ser apenas tabela de backend e passa a ser consultavel pelo tenant;
- evita falha runtime causada por coluna inexistente `user_id` em `logs`;
- reforca rastreabilidade de convites, instancias, billing e eventos futuros.

Arquivos principais:

- `apps/web/src/app/api/logs/route.ts`
- `apps/web/src/components/audit-log-panel.tsx`
- `apps/web/src/app/(app)/settings/page.tsx`
- `apps/web/src/app/api/instances/route.ts`
- `apps/web/src/app/api/members/route.ts`
- `apps/web/src/app/api/members/accept/route.ts`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run verify:local` passou com sucesso.

### 2026-06-24 - Pos-Fase 8 - Scan De Secrets No Preflight

Area afetada:

- seguranca;
- GitHub;
- preflight local;
- checklist de producao.

Tipo de alteracao:

- criacao de scan simples de secrets e inclusao no gate local.

Resumo:

- criado `infra/scripts/scan-secrets.ps1`;
- criado script raiz `npm run scan:secrets`;
- `npm run verify:local` passou a executar o scan;
- checklist de producao passou a exigir scan antes de push/deploy;
- placeholders em docs/templates sao ignorados para evitar falso positivo.

Impacto:

- reduz risco de enviar secrets reais para GitHub;
- fortalece preflight antes de Vercel/Coolify;
- mantem o scan simples e local, sem adicionar dependencia externa.

Arquivos principais:

- `infra/scripts/scan-secrets.ps1`
- `infra/scripts/verify-local.ps1`
- `package.json`
- `docs/FASE_8_CHECKLIST_PRODUCAO.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run scan:secrets` passou;
- `npm run verify:local` passou com sucesso.

### 2026-06-24 - Pos-Fase 8 - Guia GitHub Para Deploy Online

Area afetada:

- GitHub;
- preflight;
- seguranca;
- deploy Vercel/Coolify.

Tipo de alteracao:

- criacao de guia operacional para preparar o repositorio.

Resumo:

- criado `deploy/github/README.md`;
- guia cobre `verify:local`, `scan:secrets`, runtime data fora do Git, branch protegida e cuidados com secrets;
- runbook online e Fase 7 passaram a apontar para o guia.

Impacto:

- reduz risco de conectar Vercel a um repo com dados runtime ou secrets;
- explicita que sessoes Baileys versionadas exigem rotacao/desconexao;
- organiza a fase anterior ao deploy online.

Arquivos principais:

- `deploy/github/README.md`
- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `docs/FASE_7_DEPLOY.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run scan:secrets` passou.

### 2026-06-24 - Pos-Fase 8 - Guia Vercel E Checker De Env

Area afetada:

- Vercel;
- GitHub deploy;
- variaveis de ambiente;
- scripts operacionais.

Tipo de alteracao:

- criacao de guia Vercel e validador de templates `.env`.

Resumo:

- criado `deploy/vercel/README.md`;
- criado `infra/scripts/check-env-template.ps1`;
- adicionados scripts `check:env:vercel` e `check:env:coolify`;
- runbook online e Fase 7 passaram a apontar para o guia Vercel e o script.

Impacto:

- reduz chance de deploy Vercel sem env obrigatoria;
- tambem valida envs esperadas da engine no Coolify;
- facilita conferir templates antes de copiar valores reais.

Arquivos principais:

- `deploy/vercel/README.md`
- `infra/scripts/check-env-template.ps1`
- `package.json`
- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `docs/FASE_7_DEPLOY.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run check:env:vercel` passou;
- `npm run check:env:coolify` passou;
- `npm run verify:local` passou com sucesso.

### 2026-06-24 - Pos-Fase 8 - Verify Local Inclui Env Templates

Area afetada:

- scripts operacionais;
- deploy Vercel;
- deploy Coolify;
- preflight.

Tipo de alteracao:

- fortalecimento do comando unico de validacao local.

Resumo:

- `infra/scripts/verify-local.ps1` passou a executar `check-env-template.ps1`;
- templates de Vercel e Coolify agora sao validados dentro de `npm run verify:local`;
- preflight local cobre JSON, env templates, TypeScript, build web e sintaxe da engine.

Impacto:

- reduz risco de alterar template de deploy e quebrar uma env obrigatoria sem perceber;
- `npm run verify:local` fica como gate principal antes de publicar online.

Arquivos principais:

- `infra/scripts/verify-local.ps1`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run verify:local` passou com sucesso.

### 2026-06-24 - Pos-Fase 8 - Guia Supabase/Auth Online

Area afetada:

- Supabase;
- Auth;
- Storage;
- RLS;
- deploy online.

Tipo de alteracao:

- criacao de guia especifico para configurar Supabase em producao/teste online.

Resumo:

- criado `deploy/supabase/README.md`;
- guia cobre criacao do projeto, aplicacao SQL, Auth URL Configuration, Storage privado e smoke check RLS;
- runbook online passou a apontar para o guia;
- Fase 7 passou a listar o novo artefato.

Impacto:

- reduz risco de esquecer redirect URL de recuperacao de senha;
- deixa explicito que RLS nao deve ser desativado para contornar bug;
- concentra a validacao de tenant A/B e bucket privado `uploads`.

Arquivos principais:

- `deploy/supabase/README.md`
- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `docs/FASE_7_DEPLOY.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run verify:local` passou com sucesso.

### 2026-06-24 - Pos-Fase 8 - Guia Coolify/VPS Da Engine

Area afetada:

- engine Baileys;
- deploy Coolify/VPS;
- Docker;
- observabilidade online.

Tipo de alteracao:

- criacao de guia especifico para publicar a engine.

Resumo:

- criado `deploy/coolify/README.md`;
- guia cobre envs, volumes persistentes, healthcheck, fluxo de comandos, validacao E2E e falhas comuns;
- Dockerfile da engine passou a instalar `wget` explicitamente para healthcheck do compose;
- runbook online e Fase 7 passaram a apontar para o guia.

Impacto:

- reduz risco de subir a engine sem volumes persistentes;
- facilita diagnostico de `supabaseWorker: false`, falha de comando e sessao perdida;
- prepara Go/No-Go da engine via `npm run verify:online`.

Arquivos principais:

- `deploy/coolify/README.md`
- `hubflow-engine/Dockerfile`
- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `docs/FASE_7_DEPLOY.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run verify:local` passou com sucesso.

### 2026-06-24 - Pos-Fase 8 - Script De Verificacao Online

Area afetada:

- deploy online;
- Vercel;
- Coolify/VPS;
- observabilidade;
- checklist de producao.

Tipo de alteracao:

- criacao de smoke test online por URL.

Resumo:

- criado `infra/scripts/verify-online.ps1`;
- criado script raiz `npm run verify:online`;
- o script valida `GET /api/health` do app web;
- opcionalmente valida `GET /health` da engine;
- runbook e checklist passaram a citar o novo comando.

Impacto:

- apos deploy, fica possivel validar app e engine sem abrir painel manualmente;
- falhas de `status: degraded` passam a imprimir os `checks` do app;
- ajuda a decidir Go/No-Go antes de primeiro cliente pago.

Arquivos principais:

- `infra/scripts/verify-online.ps1`
- `package.json`
- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `docs/FASE_7_DEPLOY.md`
- `docs/FASE_8_CHECKLIST_PRODUCAO.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- sintaxe do script PowerShell validada;
- `npm run verify:local` passou com sucesso.

### 2026-06-24 - Pos-Fase 8 - Guia Stripe Online

Area afetada:

- Stripe;
- billing;
- deploy online;
- runbook.

Tipo de alteracao:

- criacao de checklist especifico para configurar Stripe em producao/teste online.

Resumo:

- criado `deploy/stripe/setup.md`;
- runbook online passou a apontar para o guia Stripe;
- Fase 5 passou a registrar status atual pos-Fase 8 e o setup online;
- Fase 7 passou a listar o novo artefato.

Impacto:

- reduz chance de webhook ou Price ID ser configurado errado;
- deixa claro como validar checkout, portal, cancelamento/downgrade e evento `stripe.subscription.synced`;
- separa setup Stripe do runbook geral.

Arquivos principais:

- `deploy/stripe/setup.md`
- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `docs/FASE_5_STRIPE.md`
- `docs/FASE_7_DEPLOY.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run verify:local` passou com sucesso.

### 2026-06-24 - Pos-Fase 8 - Templates Online De Vercel E Supabase

Area afetada:

- deploy Vercel;
- Supabase;
- runbook online;
- configuracao de producao.

Tipo de alteracao:

- criacao de templates especificos para publicacao online.

Resumo:

- criado `deploy/vercel/.env.production.example`;
- criado `deploy/supabase/apply-order.md`;
- runbook online passou a apontar para os templates;
- Fase 7 passou a listar os novos artefatos.

Impacto:

- reduz risco de misturar `.env.local` com envs online;
- deixa a ordem de SQL do Supabase mais facil de executar fora do contexto do agente;
- facilita copiar variaveis corretas para Vercel e Coolify.

Arquivos principais:

- `deploy/vercel/.env.production.example`
- `deploy/supabase/apply-order.md`
- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `docs/FASE_7_DEPLOY.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run verify:local` passou com sucesso.

### 2026-06-24 - Pos-Fase 8 - Healthcheck Online Mais Estrito

Area afetada:

- observabilidade;
- deploy Vercel;
- Supabase;
- Stripe;
- Storage.

Tipo de alteracao:

- ampliacao do endpoint publico de saude.

Resumo:

- `/api/health` passou a validar envs publicas e privadas essenciais;
- healthcheck passou a validar Price IDs dos planos pagos;
- healthcheck passou a contar planos seedados no banco;
- healthcheck passou a validar bucket privado `uploads`;
- runbook online passou a explicar como interpretar `checks`.

Impacto:

- Vercel deploy fica mais facil de diagnosticar;
- erros comuns de configuracao Stripe/Supabase aparecem antes do primeiro cliente;
- endpoint continua sem expor valores de secrets.

Arquivos principais:

- `apps/web/src/app/api/health/route.ts`
- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run verify:local` passou com sucesso.

### 2026-06-24 - Pos-Fase 8 - Runbook Online Por Fases

Area afetada:

- deploy online;
- Vercel;
- Supabase;
- Stripe;
- Coolify/VPS;
- checklist de producao.

Tipo de alteracao:

- criacao de roteiro operacional para colocar o HUBFLOW online.

Resumo:

- criado `docs/DEPLOY_ONLINE_RUNBOOK.md`;
- o runbook organiza a publicacao em fases: preflight, Supabase, Auth, Stripe, Vercel, Coolify/VPS, E2E minimo e Go/No-Go;
- `docs/FASE_7_DEPLOY.md` passou a apontar para o novo runbook e ajustou a ordem recomendada;
- `docs/FASE_8_CHECKLIST_PRODUCAO.md` passou a incluir a migration `202606240006_membership_invites.sql` na ordem SQL.

Impacto:

- foco operacional volta para rodar online, nao apenas localmente;
- reduz ambiguidade sobre qual servico configurar primeiro;
- explicita os pontos que ainda dependem de credenciais e ambiente real.

Arquivos principais:

- `docs/DEPLOY_ONLINE_RUNBOOK.md`
- `docs/FASE_7_DEPLOY.md`
- `docs/FASE_8_CHECKLIST_PRODUCAO.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- documentacao online criada e alinhada ao estado atual da arquitetura.

### 2026-06-24 - Pos-Fase 8 - Price IDs Stripe Por Env Ou Banco

Area afetada:

- Stripe;
- billing;
- API web;
- planos.

Tipo de alteracao:

- correcao de compatibilidade entre seed SQL e envs de producao.

Resumo:

- `GET /api/plans` passou a preencher `stripe_price_id` usando env quando o banco estiver nulo;
- `POST /api/billing/checkout` passou a aceitar `plans.stripe_price_id` do banco ou fallback via env;
- isso evita que o checkout fique desabilitado na UI quando o seed inicial ainda nao gravou Price IDs no banco.

Impacto:

- deploy online pode configurar Price IDs somente por env na Vercel;
- banco pode continuar com catalogo neutro/seedado;
- checkout fica operacional assim que os envs Stripe estiverem configurados.

Arquivos principais:

- `apps/web/src/app/api/plans/route.ts`
- `apps/web/src/app/api/billing/checkout/route.ts`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `npm run verify:local` passou com sucesso.

### 2026-06-24 - Pos-Fase 8 - Upload De Midia Com Bearer Auth

Area afetada:

- API web;
- Supabase Auth;
- Supabase Storage;
- entitlements;
- multi-tenant.

Tipo de alteracao:

- alinhamento de autenticacao da rota de upload com o padrao novo.

Resumo:

- `POST /api/media` passou a aceitar `Authorization: Bearer <token>` e `x-tenant-id`;
- fallback por cookie legado foi mantido temporariamente;
- erros gerados por `assertUploadLimit` agora preservam o status original, incluindo `402`.

Impacto:

- clientes autenticados via Supabase conseguem fazer upload sem depender do cookie legado;
- limite de storage por plano passa a responder com o codigo correto;
- reduz mais uma dependencia operacional do auth legado.

Arquivos principais:

- `apps/web/src/app/api/media/route.ts`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm run build` em `apps/web` passou.

### 2026-06-24 - Pos-Fase 8 - API Multi-Instancia WhatsApp

Area afetada:

- API web;
- engine Baileys desacoplada;
- Supabase/PostgreSQL;
- billing entitlements;
- multi-tenant.

Tipo de alteracao:

- criacao de superficie web para instancias WhatsApp por tenant.

Resumo:

- criada rota `GET /api/instances` para listar instancias do tenant autenticado;
- criada rota `POST /api/instances` para Owner/Admin criar instancia;
- criacao valida `instances:create` contra limites do plano;
- nova instancia nasce com status `pending`;
- evento `instance.created` e registrado em `logs`.

Impacto:

- prepara o fluxo multi-instancia sem acoplar frontend diretamente a Baileys;
- plano FREE/Essencial/Growth/Performance Max pode limitar quantidade de instancias;
- engine passa a ter registros formais no banco para consumir por comandos/eventos.

Arquivos principais:

- `apps/web/src/app/api/instances/route.ts`
- `apps/web/src/lib/billing/entitlements.ts`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou sem warnings.

### 2026-06-24 - Pos-Fase 8 - Ajuste De RLS Para Insercao De Usuarios

Area afetada:

- Supabase/PostgreSQL;
- RLS;
- multi-tenant;
- smoke check de banco.

Tipo de alteracao:

- endurecimento de policy RLS e criacao de roteiro de validacao.

Resumo:

- `users_insert_self_or_admin` passou a exigir membership no tenant quando o proprio usuario insere perfil;
- policy inicial de owner em `memberships` passou a qualificar explicitamente `memberships.tenant_id` no subselect de organizacao;
- criado `infra/tests/rls-smoke-check.sql` para validar isolamento entre dois usuarios/tenants no Supabase real;
- `docs/FASE_4_BANCO.md` foi atualizado com a migration RPC da engine e o smoke check RLS.

Impacto:

- reduz risco de um usuario autenticado criar linha de perfil em tenant sem membership;
- deixa o teste operacional de isolamento mais claro antes de producao;
- mantem a API server-side com service role como caminho controlado para signup/convites.

Arquivos principais:

- `infra/rls/202606240002_rls_policies.sql`
- `infra/tests/rls-smoke-check.sql`
- `docs/FASE_4_BANCO.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- alteracao SQL revisada localmente;
- execucao real depende do Supabase com usuarios/tenants de teste.

### 2026-06-24 - Pos-Fase 8 - Env Examples Alinhados Com Stack Atual

Area afetada:

- deploy Vercel;
- deploy Coolify/VPS;
- engine Baileys;
- compatibilidade temporaria de stores locais.

Tipo de alteracao:

- correcao de configuracao exemplo.

Resumo:

- `apps/web/.env.example` removeu `APP_PASSWORD` e `ENGINE_INTERNAL_TOKEN`;
- `ENGINE_TOKEN` ficou como token compartilhado entre web e engine;
- `HUBFLOW_DATA_DIR` passou a apontar para `./data`, compativel com `apps/web`;
- `hubflow-engine/.env.example` deixou claro que `APP_URL` e para callbacks legados durante a transicao;
- `deploy/coolify/.env.example` passou a incluir `ENGINE_STATE_FILE`.

Impacto:

- reduz risco de configurar producao com variaveis legadas;
- evita apontar runtime local para `hubflow-groups/data` depois da reorganizacao para `apps/web`;
- deixa Vercel/Coolify mais alinhados com a arquitetura atual.

Arquivos principais:

- `apps/web/.env.example`
- `hubflow-engine/.env.example`
- `deploy/coolify/.env.example`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- busca por `APP_PASSWORD|ENGINE_INTERNAL_TOKEN|hubflow-groups/data|devzap-engine` nos envs/codigo ativo nao retornou ocorrencias;
- `hubflow-engine/package.json` e `hubflow-engine/package-lock.json` parsearam corretamente.

### 2026-06-24 - Pos-Fase 8 - Fundacao De Convites De Membros

Area afetada:

- Supabase/PostgreSQL;
- memberships;
- API web;
- billing entitlements;
- multi-tenant.

Tipo de alteracao:

- implementacao inicial de convite/aceite de membros.

Resumo:

- criada migration `202606240006_membership_invites.sql`;
- `memberships.user_id` passou a aceitar nulo para convites pendentes;
- criado indice unico para convite pendente por `tenant_id + invited_email`;
- `assertPlanLimit` passou a contar `memberships` para `team_members:invite`;
- criada rota `GET /api/members` para listar membros/convites do tenant;
- criada rota `POST /api/members` para Owner/Admin convidar `admin` ou `operator`;
- criada rota `POST /api/members/accept` para o usuario autenticado aceitar convite pelo proprio e-mail;
- criada UI `MembersPanel` em Configuracoes para listar membros/convites e criar convites;
- aceite cria/atualiza perfil em `users` e registra evento em `logs`.

Impacto:

- requisito de convite de membros passa a ter base operacional;
- convites respeitam limite `team_members` do plano;
- fluxo ainda nao envia e-mail transacional; a entrega do link/ID do convite fica para integracao posterior.

Arquivos principais:

- `infra/migrations/202606240006_membership_invites.sql`
- `infra/scripts/apply-supabase-sql.ps1`
- `infra/scripts/apply-supabase-sql.sh`
- `apps/web/src/lib/billing/entitlements.ts`
- `apps/web/src/app/api/members/route.ts`
- `apps/web/src/app/api/members/accept/route.ts`
- `apps/web/src/components/members-panel.tsx`
- `apps/web/src/app/(app)/settings/page.tsx`
- `docs/FASE_4_BANCO.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou apos criacao das rotas;
- envio real de e-mail de convite permanece pendente de provedor transacional.

### 2026-06-24 - Pos-Fase 8 - Recuperacao De Senha Com Supabase Auth

Area afetada:

- autenticacao;
- Supabase Auth;
- proxy publico;
- UX de login.

Tipo de alteracao:

- implementacao do fluxo de recuperacao de senha.

Resumo:

- criada pagina `/forgot-password` para solicitar link de recuperacao pelo Supabase Auth;
- criada pagina `/reset-password` para definir nova senha apos abrir o link de recovery;
- login ganhou link "Esqueci minha senha";
- proxy passou a liberar `forgot-password` e `reset-password` sem sessao.

Impacto:

- requisito de recuperacao de senha passa a ter implementacao real;
- fluxo depende das configuracoes de e-mail/redirect URL no Supabase Auth;
- nao adiciona backend customizado nem Prisma.

Arquivos principais:

- `apps/web/src/app/forgot-password/page.tsx`
- `apps/web/src/app/reset-password/page.tsx`
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/proxy.ts`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou sem warnings.

### 2026-06-24 - Pos-Fase 8 - Alinhamento De Nome Da Engine E Remocao De APP_PASSWORD

Area afetada:

- app web;
- engine Baileys;
- configuracao operacional;
- documentacao da engine.

Tipo de alteracao:

- higiene de nomenclatura e remocao de fallback legado.

Resumo:

- removido `APP_PASSWORD` morto de `apps/web/src/lib/auth.ts`;
- referencias ativas a `devzap-engine` foram substituidas por `hubflow-engine`;
- `hubflow-engine/package.json` e `package-lock.json` passaram a usar o nome `hubflow-engine`;
- documentacao `hubflow-engine/DECISIONS.md` foi alinhada com o nome oficial da engine.

Impacto:

- reduz ambiguidade entre o produto antigo DevZap e o SaaS HUBFLOW;
- evita que deploy/runbook aponte para o nome errado da engine;
- elimina uma variavel de auth legada que nao faz parte da arquitetura Supabase Auth.

Arquivos principais:

- `apps/web/src/lib/auth.ts`
- `apps/web/src/app/(app)/settings/page.tsx`
- `hubflow-engine/package.json`
- `hubflow-engine/package-lock.json`
- `hubflow-engine/DECISIONS.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- busca por `devzap-engine|APP_PASSWORD` no codigo ativo nao retornou ocorrencias;
- `tsc --noEmit --project tsconfig.json` passou;
- `node --check hubflow-engine/index.js` passou.

### 2026-06-24 - Pos-Fase 8 - Health Check Publico Do App Web

Area afetada:

- observabilidade;
- deploy Vercel;
- proxy Next.js;
- Supabase/Stripe env readiness.

Tipo de alteracao:

- criacao de endpoint de saude operacional.

Resumo:

- criada rota `GET /api/health`;
- rota valida presenca das variaveis essenciais de Supabase, Stripe e engine token;
- rota tenta consultar `plans` no Supabase quando envs de banco estao presentes;
- proxy passou a liberar `/api/health` sem cookie para uso por monitoramento externo.

Impacto:

- Vercel/monitoramento externo passam a ter um endpoint padrao de health check;
- falhas de env ou banco aparecem como `degraded` com HTTP 503;
- nao expõe segredos, apenas booleans de prontidao.

Arquivos principais:

- `apps/web/src/app/api/health/route.ts`
- `apps/web/src/proxy.ts`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou sem warnings.

### 2026-06-24 - Pos-Fase 8 - Subscription API Aceita Supabase Bearer Auth

Area afetada:

- API web;
- Supabase Auth;
- contexto multi-tenant;
- billing.

Tipo de alteracao:

- alinhamento da rota de assinatura com o novo padrao auth/tenant.

Resumo:

- `GET /api/subscription` passou a aceitar `Authorization: Bearer <token>` e `x-tenant-id`;
- a rota usa `getTenantContext` quando recebe Bearer Auth;
- fallback por cookie legado `dz_session` foi mantido para compatibilidade temporaria.

Impacto:

- UI de billing e rotas novas nao precisam depender do cookie legado para consultar assinatura;
- isolamento por membership/tenant_id fica centralizado na mesma camada usada por checkout/portal;
- reduz mais uma dependencia operacional do auth legado.

Arquivos principais:

- `apps/web/src/app/api/subscription/route.ts`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou sem warnings.

### 2026-06-24 - Pos-Fase 8 - Billing Conectado Na UI E Tenant Ativo No Cliente

Area afetada:

- Supabase Auth;
- tenant ativo no cliente;
- Stripe checkout/portal;
- tela de configuracoes;
- documentacao operacional.

Tipo de alteracao:

- conexao da UI com o fluxo Stripe ja criado na API.

Resumo:

- criado helper client `authenticatedFetch` para anexar `Authorization: Bearer <token>` e `x-tenant-id`;
- login/signup passaram a persistir o `tenantId` retornado pela API no navegador;
- logout passou a limpar o tenant ativo;
- criada a UI `BillingPanel` em Configuracoes para listar planos, mostrar assinatura atual, abrir checkout e portal Stripe;
- comentarios legados do codigo ativo foram ajustados para Supabase/PostgreSQL com RLS, removendo orientacao antiga para Prisma.

Impacto:

- fluxo de assinatura deixa de ser apenas API e fica acessivel ao usuario autenticado;
- rotas novas podem depender de Supabase Auth + tenant_id sem reimplementar headers em cada componente;
- reduz risco de futuras implementacoes seguirem documentacao/comentarios antigos de Prisma.

Arquivos principais:

- `apps/web/src/lib/supabase/client.ts`
- `apps/web/src/components/billing-panel.tsx`
- `apps/web/src/components/sidebar.tsx`
- `apps/web/src/app/(app)/settings/page.tsx`
- `apps/web/src/lib/auth.ts`
- `apps/web/src/lib/session.ts`
- `apps/web/src/lib/json-collection.ts`
- `apps/web/src/lib/store.ts`
- `apps/web/src/lib/mock-data.ts`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou sem warnings.

### 2026-06-24 - Pos-Fase 8 - API Web Para Comandos Da Engine

Area afetada:

- API web;
- engine;
- Supabase;
- multi-tenant;
- seguranca.

Tipo de alteracao:

- criacao de rota autenticada para enfileirar comandos da engine.

Resumo:

- criada rota `POST /api/engine/commands`;
- rota valida Supabase Auth via `Authorization: Bearer <access_token>`;
- rota valida `x-tenant-id`, membership aceita e instancia pertencente ao tenant;
- comandos sao inseridos em `engine_commands`;
- tipos permitidos nesta fatia: `send_message` e `refresh_status`.

Impacto:

- UI/backend passa a ter um caminho oficial para acionar a engine sem chamar endpoint publico na VPS;
- reforca isolamento por `tenant_id` e `instance_id`;
- prepara substituicao gradual do fluxo legado `/api/dispatch/pending`;
- ainda falta adaptar as telas de campanhas para usar essa rota de forma completa.

Arquivos principais:

- `apps/web/src/app/api/engine/commands/route.ts`
- `docs/FASE_6_ENGINE.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou sem warnings.

### 2026-06-24 - Pos-Fase 8 - Limite De Upload Por Plano

Area afetada:

- billing;
- entitlements;
- uploads;
- Supabase Storage;
- API web.

Tipo de alteracao:

- aplicacao de bloqueio por plano em upload de midia.

Resumo:

- criado helper `assertUploadLimit(tenantId, nextBytes)`;
- `POST /api/media` passou a validar `plans.limits.uploads_mb` antes de salvar arquivo;
- limite considera a soma atual de `uploads.size` do tenant mais o tamanho do novo arquivo;
- documentacao Stripe/entitlements foi atualizada.

Impacto:

- uploads passam a respeitar o plano contratado;
- evita uso ilimitado de storage por tenant;
- reforca Supabase como fonte de entitlements locais.

Arquivos principais:

- `apps/web/src/lib/billing/entitlements.ts`
- `apps/web/src/app/api/media/route.ts`
- `docs/FASE_5_STRIPE.md`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou sem warnings.

### 2026-06-24 - Pos-Fase 8 - Ajuste Do Proxy Para Stripe Webhook E Bearer Auth

Area afetada:

- proxy Next.js;
- Stripe;
- Supabase Auth;
- API web;
- seguranca.

Tipo de alteracao:

- correcao de fluxo de autenticacao em borda.

Resumo:

- `POST /api/billing/webhook` passou a atravessar o proxy sem cookie, deixando a rota validar `stripe-signature`;
- requests API com `Authorization: Bearer <token>` passaram a atravessar o proxy para validacao Supabase na rota;
- cookie `dz_session` continua valido para compatibilidade temporaria.

Impacto:

- webhook Stripe nao fica bloqueado indevidamente pelo proxy;
- rotas novas baseadas em Supabase Auth conseguem operar sem depender exclusivamente do cookie legado;
- mantem validacao sensivel dentro das rotas corretas.

Arquivos principais:

- `apps/web/src/proxy.ts`
- `docs/FASE_1_AUDITORIA_CODIGO_ATUAL.md`

Decisao/resultados:

- `tsc --noEmit --project tsconfig.json` passou;
- `npm --prefix apps/web run build` passou sem warnings.
