# IG Connect — PRD

> **Status:** aguardando aprovação do Igor.
> **Pré-requisito:** [`docs/contexts/ig-connect-fase0.md`](contexts/ig-connect-fase0.md) — validação
> técnica, veredito **GO com condição**. Este documento assume as decisões de lá (rota
> *Instagram API with Instagram Login*, 3 escopos, limites da plataforma).
> **Data:** 16/08/2026

---

## 1. Problema e oportunidade

Nossos clientes pagam ManyChat (US$29–39/mês ≈ R$160–210) para uma única coisa: alguém comenta
"EU QUERO" num post → recebe uma DM com o link do grupo VIP. **O link de destino já é nosso.** O
ManyChat é um intermediário caro para o gatilho, e nada mais.

Trazer o gatilho pra dentro:

- **mata a última ferramenta externa do funil** — hoje o lojista opera Girumo + ManyChat;
- **vira diferencial de categoria** — DevZapp, Joinzapp, SendFlow e Meu Grupo VIP não têm Instagram
  nativo (ver `PROJECT_CONTEXT.md` §Marketing);
- **é upsell de margem ~100%** — a API de mensagem do Instagram não cobra por mensagem (Fase 0 §7).

## 2. Decisões de produto (Igor, 16/08/2026)

| Decisão | Valor |
|---|---|
| Nome no painel | **"Instagram"** (item de sidebar). Nome interno/código: `ig-connect`. |
| Preço | **Add-on R$97/mês**, disponível em qualquer plano (R$197/R$297/R$497). |
| Beta | **Mega Stock primeiro** (dogfood). Expansão caso a caso depois, respeitando o teto de ~25 testadores. |

---

## 3. Escopo

### 3.1 Dentro do MVP

**Fluxo A — comentário com palavra-chave**
Post/reel do lojista → alguém comenta a palavra configurada → *private reply* (DM) com mensagem
configurável + link rastreado.

**Fluxo B — DM com palavra-chave**
Alguém manda DM contendo a palavra configurada (vinda de story, bio ou anúncio Click-to-DM) →
resposta automática com a mesma mensagem + link.

**Regras de produto (não negociáveis)**
1. **Só respondemos a ação iniciada pela pessoa.** Nunca DM fria. (É proibido pela Meta e é a nossa
   regra durável de anti-ban.)
2. **Porteiro de 1 mensagem.** Uma resposta, imediata, e acabou. A qualificação acontece no
   WhatsApp — não construímos árvore de conversa na DM.
3. **O destino é sempre um link rastreado existente** do tenant, com `?src=igdm` anexado.
4. **UI em PT-BR, vocabulário do atacado.** revendedor/cliente/grupo cheio. **Nunca "lead"** na
   interface (é palavra banida — `PROJECT_CONTEXT.md` §Marketing).

### 3.2 Fora do MVP (explícito, pra não virar escopo por osmose)

Sem IA · sem fluxo multi-etapas ou árvore de decisão · sem broadcasting/DM em massa · sem publicar
post pelo painel (`instagram_business_content_publish` **não** será pedido) · sem inbox unificada ·
sem responder o comentário publicamente (só a DM privada) · sem responder Stories/mentions ·
sem múltiplas contas IG por tenant (1 conta por tenant no MVP) · sem continuar a conversa quando a
pessoa responde a DM.

### 3.3 Fronteira com a engine de WhatsApp

**Zero.** O IG Connect vive inteiramente em `apps/web`. Não toca `hubflow-engine/` (núcleo anti-ban).
A ligação entre os dois mundos é a URL do `/r/[slug]` — texto, dentro de uma mensagem.

---

## 4. Arquitetura

### 4.1 Fluxo ponta a ponta (Fluxo A)

```
pessoa comenta "EU QUERO"
        │
        ▼
Meta → POST /api/ig/webhook          (X-Hub-Signature-256)
        │
        ├─ valida assinatura sobre o BODY CRU
        ├─ resolve tenant por entry[].id → ig_accounts.ig_user_id
        ├─ INSERT ig_events (unique em source_id)  ← idempotência
        └─ responde 200  ......................... < 1s, folga de 19s
        │
        ▼  after()  (executa depois do flush, mesma invocação)
   casa palavra-chave → monta texto + link → POST /<IG_ID>/messages
        │                                     recipient: { comment_id }
        ▼
   UPDATE ig_events (status, error_code)
        │
        ▼
pessoa recebe DM → clica → GET /r/<slug>?src=igdm
        │
        ▼
  [fluxo que JÁ EXISTE] resolveClickTarget → grupo aberto do pool
   → link_click_events → Pixel "Lead" → convite do WhatsApp
        │
        ▼
   engine detecta entrada no grupo → boas-vindas → campanhas
```

### 4.2 Decisão: processamento assíncrono com `after()`, não com cron

O webhook tem **20s** de teto (Fase 0 §3.6) e não pode chamar a API de envio no caminho crítico.
As opções:

| Opção | Veredito |
|---|---|
| Chamar a Graph API dentro do handler | ❌ Coloca a latência da Meta dentro do nosso SLA de 20s. Um timeout deles vira reenvio deles, vira DM duplicada. |
| Fila em tabela + cron | ❌ **Inviável.** Estamos no plano **Hobby** da Vercel: cron **só diário**. A DM chegaria no dia seguinte. |
| Worker (`apps/worker`) | ❌ Excesso. O worker existe e está vivo, mas adiciona um salto de rede e um ponto de falha para uma tarefa de ~300ms. |
| **`after()` do Next 15** | ✅ **Escolhido.** Roda depois do response ser enviado, na mesma invocação. Resposta em <1s, envio fora do caminho crítico, sem infra nova. |

**Risco aceito:** se a invocação morrer entre o `200` e o `after()`, a DM não sai e o evento fica
`queued`. Mitigação: uma varredura de `ig_events` presos entra no cron diário já existente, e o
painel mostra o estado real. Perda esperada: rara e visível — não silenciosa.

### 4.3 Multi-tenant

O tenant **não** vem da URL nem de header: sai de `entry[].id` (o IG User ID da conta conectada) →
`ig_accounts.ig_user_id` → `tenant_id`. Daí pra frente **toda** query filtra `.eq('tenant_id', …)`,
conforme `CLAUDE.md` §Isolamento — o service-role bypassa RLS, então o filtro é a proteção real.

`ig_accounts.ig_user_id` é **globalmente único** (índice único sem `tenant_id`): a mesma conta do
Instagram não pode ser reivindicada por dois tenants, senão o roteamento fica ambíguo.

### 4.4 Segurança

| Superfície | Proteção |
|---|---|
| `POST /api/ig/webhook` | HMAC-SHA256 do body cru vs `X-Hub-Signature-256`, comparação em tempo constante (`timingSafeEqual`). Sem sessão. |
| `GET /api/ig/webhook` | Compara `hub.verify_token` com `IG_WEBHOOK_VERIFY_TOKEN`, devolve `hub.challenge` cru. |
| `GET /api/ig/oauth/start` | Rota de usuário logado. Gera `state` = HMAC(tenant_id + nonce + exp), TTL 10min. |
| `GET /api/ig/oauth/callback` | Valida `state` (assinatura + expiração + tenant da sessão). Cookie `dz_session` é `sameSite: "lax"` — navegação top-level vinda do instagram.com carrega o cookie, então o callback é rota autenticada normal. |
| Token de acesso IG | **Cifrado em repouso** (AES-256-GCM, chave em `IG_TOKEN_ENC_KEY`). Nunca sai do servidor, nunca vai pro cliente, nunca aparece em log. |
| Rate limit | Entrada nova em `RATE_LIMITS` do middleware para `/api/ig/webhook`. |

⚠️ **Achado de integração (importante).** `classifyRequest()`
(`apps/web/src/lib/security/request-access-policy.ts`) casa webhooks por **path + método exatos**
(`PROVIDER_WEBHOOKS`). Hoje só existe `POST /api/webhooks/evolution`. O handshake do Instagram é um
**GET** — se só adicionarmos o POST, o handshake cai no gate de sessão e devolve **401**, e a
assinatura do webhook **nunca conclui**. Precisamos das **duas** entradas:

```ts
const PROVIDER_WEBHOOKS = new Set([
  "POST /api/webhooks/evolution",
  "GET /api/ig/webhook",   // handshake hub.challenge
  "POST /api/ig/webhook",  // notificações
]);
```

(É o mesmo tipo de armadilha que já nos custou 401 em toda execução de um cron novo fora da
allowlist. Vai coberto por teste em `request-access-policy.test.ts`.)

---

## 5. Schema Supabase

Migração: `apps/web/supabase/migrations/20260816120000_ig_connect.sql`.
**Aplicar nos DOIS bancos** (dev `wfju…` e prod `nido…`) e registrar em
`deploy/supabase/apply-order.txt` — a pasta de migrações não é retrato do schema (`CLAUDE.md`).
Antes de escrever: conferir por SQL se algum objeto `ig_*` já existe.

### 5.1 `ig_accounts` — a conta do Instagram conectada

```sql
create table if not exists public.ig_accounts (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references organizations(id) on delete cascade,

  -- IG User ID da conta profissional. É por ele que o webhook descobre o tenant,
  -- então é único GLOBALMENTE: uma conta não pode pertencer a dois lojistas.
  ig_user_id        text not null,
  username          text not null default '',

  -- Token cifrado (AES-256-GCM). Nunca em claro, nunca no cliente.
  access_token_enc  text not null,
  token_expires_at  timestamptz not null,     -- ~60d; refresh no dia ~50
  last_refresh_at   timestamptz,

  -- Espelho de GET /me/subscribed_apps. "conectado" != "escutando": sem o
  -- POST /me/subscribed_apps a conta autoriza e nenhum evento chega.
  webhook_subscribed boolean not null default false,

  --   active     = funcionando
  --   expired    = token venceu / refresh falhou (lojista precisa reconectar)
  --   revoked    = lojista desconectou no Instagram
  --   disconnected = lojista desconectou aqui
  status            text not null default 'active'
                      check (status in ('active','expired','revoked','disconnected')),
  last_error        text,

  connected_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create unique index if not exists ig_accounts_ig_user_uidx on public.ig_accounts (ig_user_id);
create unique index if not exists ig_accounts_tenant_uidx  on public.ig_accounts (tenant_id);
```

> `ig_accounts_tenant_uidx` fixa "1 conta por tenant" no MVP. Quando abrirmos multi-conta, cai o índice.

### 5.2 `ig_triggers` — o gatilho (palavra + mensagem + link)

```sql
create table if not exists public.ig_triggers (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references organizations(id) on delete cascade,
  ig_account_id uuid not null references ig_accounts(id) on delete cascade,

  name          text not null,

  -- Palavras que disparam. Casamento: normalizado (lower + sem acento) e por
  -- SUBSTRING de palavra inteira — quem comenta escreve "eu quero!!! 😍".
  keywords      text[] not null default '{}',

  -- 'comment' = Fluxo A · 'dm' = Fluxo B · 'both' = os dois
  source        text not null default 'both' check (source in ('comment','dm','both')),

  -- Mensagem da DM. Máx 1000 BYTES em UTF-8 (limite da Meta) — validar em bytes.
  message       text not null,

  -- Link rastreado que vai no fim da mensagem. FK pro que já existe.
  tracked_link_id uuid references tracked_links(id) on delete set null,

  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists ig_triggers_tenant_idx on public.ig_triggers (tenant_id, enabled);
```

### 5.3 `ig_events` — atendimentos (log + idempotência)

```sql
create table if not exists public.ig_events (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references organizations(id) on delete cascade,
  ig_account_id uuid not null references ig_accounts(id) on delete cascade,
  trigger_id    uuid references ig_triggers(id) on delete set null,

  kind          text not null check (kind in ('comment','dm')),

  -- comment_id ou message mid. É a CHAVE DE IDEMPOTÊNCIA: a Meta reenvia
  -- notificação, e private reply só pode ser enviada UMA vez por comentário
  -- (segunda tentativa = erro subcode 2534014). O unique é o que garante isso.
  source_id     text not null,

  -- IGSID: identificador escopado ao app, não reidentificável fora dele (LGPD).
  ig_user_id    text not null,
  username      text,

  -- Só a palavra que casou, NUNCA o texto integral do comentário/DM (LGPD §6 da Fase 0).
  matched_keyword text,

  status        text not null default 'queued'
                  check (status in ('queued','sent','skipped','failed')),
  skip_reason   text,        -- 'no-match' | 'self' | 'reply-to-comment' | 'duplicate' | 'disabled'
  error_code    text,        -- código da Meta, cru
  error_message text,

  created_at    timestamptz not null default now(),
  sent_at       timestamptz
);

create unique index if not exists ig_events_source_uidx on public.ig_events (source_id);
create index if not exists ig_events_tenant_idx on public.ig_events (tenant_id, created_at desc);
create index if not exists ig_events_stuck_idx  on public.ig_events (created_at) where status = 'queued';
```

**Retenção:** varredura no cron diário apaga `ig_events` com mais de **90 dias**.

### 5.4 RLS

As três tabelas: `enable row level security` + policy de isolamento por `tenant_id`, no mesmo
padrão de `group_grow_jobs`. Defesa em profundidade — a proteção real continua sendo o
`.eq('tenant_id')` nas stores (`CLAUDE.md`).

Rodar o **advisor de segurança do Supabase** depois de aplicar.

---

## 6. Rotas de API

Todas em `apps/web/src/app/api/ig/…`, seguindo o padrão de `route.ts` do repositório.
Contrato a publicar em `apps/web/system/API_CONTRACTS.md` (lane Banco/API).

| Rota | Método | Acesso | O que faz |
|---|---|---|---|
| `/api/ig/webhook` | `GET` | **webhook** | Handshake: valida `hub.verify_token`, devolve `hub.challenge` cru. |
| `/api/ig/webhook` | `POST` | **webhook** | Valida HMAC do body cru → resolve tenant → grava `ig_events` → `200` → `after()` processa. |
| `/api/ig/oauth/start` | `GET` | user | Monta a URL do `instagram.com/oauth/authorize` com `state` assinado; redireciona. |
| `/api/ig/oauth/callback` | `GET` | user | Valida `state` → troca `code` → long-lived token → cifra e grava → `POST /me/subscribed_apps` → redireciona pro painel. |
| `/api/ig/account` | `GET`/`DELETE` | user | Estado da conta conectada (sem token) / desconectar. |
| `/api/ig/triggers` | `GET`/`POST` | user | Lista / cria gatilho. |
| `/api/ig/triggers/[id]` | `PATCH`/`DELETE` | user | Edita / apaga. |
| `/api/ig/events` | `GET` | user | Últimos atendimentos, paginado. |
| `/api/ig/data-deletion` | `POST` | **webhook** | Callback de deleção da Meta. Devolve **JSON** `{ url, confirmation_code }` — HTML reprova no review (Fase 0 §5.1). |

Refresh de token: entra no cron diário existente (`/api/cron/emails` ou rota irmã) — renova o que
vence em ≤10 dias, marca `expired` no que falhar, e notifica o lojista.

### Stores

`apps/web/src/lib/stores/ig-accounts.ts`, `ig-triggers.ts`, `ig-events.ts` — mesmo formato dos
demais em `lib/stores/`, **sempre** com `.eq('tenant_id', …)`.

### Cliente da Graph API

`apps/web/src/lib/ig/client.ts` — versão da API vinda de env (`IG_GRAPH_VERSION`, default `v25.0`),
nunca hardcoded (risco R4 da Fase 0). Erros da Meta propagados com `error_code` cru.

### Matcher

`apps/web/src/lib/ig/match-keyword.ts` — função pura, sem I/O, 100% testável:
normaliza (lower + `NFD` sem diacrítico), casa por palavra inteira, devolve a keyword que casou.
É o coração da feature e onde os bugs moram. **TDD aqui.**

---

## 7. UI do painel

Rota: `apps/web/src/app/painel/instagram/page.tsx`. Item na sidebar: **"Instagram"**.
Reaproveitar os componentes existentes do painel (mesmos de `campanhas`/`grupos`) — nada de
design system novo.

### Estado 1 — não conectado
Card único: o que a feature faz, em uma frase de atacadista ("quem comentar a palavra que você
escolher recebe o link do grupo na DM, na hora"), e o botão **Conectar Instagram**.
Pré-requisito visível: "sua conta precisa ser Profissional (Business ou Criador)" + link do como
fazer. Durante o beta, o aviso do convite de testador.

### Estado 2 — conectado
- **Cabeçalho:** @usuário, foto, badge de status. Dois estados distintos, de propósito:
  `Conectado` × `Conectado, mas não está escutando` (`webhook_subscribed = false`) —
  esconder isso é o bug nº1 da integração (Fase 0 §2).
- **Gatilhos:** lista + botão criar. Formulário com 4 campos:
  1. Nome (ex.: "Grupo VIP")
  2. Palavras (chips: `EU QUERO`, `GRUPO VIP`, `QUERO`)
  3. Mensagem (textarea com **contador em bytes**, teto 1000 — emoji custa 4)
  4. Link (select dos `tracked_links` do tenant; `?src=igdm` anexado automaticamente)
  + toggle Comentário / DM / os dois, + liga/desliga.
  **Preview da DM** renderizado ao lado, com a mensagem final + link.
- **Últimos atendimentos:** tabela (quando · @quem · palavra · comentário/DM · status). Contador do
  mês no topo. Falha mostra motivo em PT-BR, não código cru.

### Cópia (regras)
"revendedor"/"cliente", nunca "lead". "Atendimentos", não "conversões". Erros traduzidos:
`2534014` → "esse comentário já foi respondido antes".

---

## 8. Feature flag

Por tenant, em `tenant_settings` (tabela e store já existem): chave `ig_connect_enabled` (boolean,
default `false`).

- `false` → item "Instagram" **não aparece** na sidebar; rotas `/api/ig/*` de usuário devolvem
  `403`; o webhook segue funcionando (a Meta não sabe de flag) mas grava `skipped/disabled`.
- Ligado manualmente por tenant durante o beta. Depois do App Review, vira derivado do add-on no
  billing.

Env necessárias (todas em `.env.example`, nenhuma commitada):

```
INSTAGRAM_APP_ID
INSTAGRAM_APP_SECRET
IG_WEBHOOK_VERIFY_TOKEN
IG_TOKEN_ENC_KEY          # 32 bytes base64
IG_GRAPH_VERSION=v25.0
IG_OAUTH_REDIRECT_URI
```

---

## 9. Telemetria

Reaproveitar o funil admin existente (`funnel_events`), sem tabela nova de métrica:

| Evento | Quando |
|---|---|
| `ig_account_connected` / `ig_account_expired` | OAuth concluído / refresh falhou |
| `ig_trigger_created` | gatilho criado |
| `ig_reply_sent` | DM entregue (dimensões: `kind`, `trigger_id`) |
| `ig_reply_failed` | falha (dimensão: `error_code`) |

O clique já é medido: o `/r/[slug]` grava `link_click_events`, e `?src=igdm` separa a origem
Instagram do resto sem código novo. **A métrica que importa** — comentário → DM → clique → grupo —
sai da junção de `ig_events` com `link_click_events`.

Admin (`/admin`): quantos tenants com IG conectado, atendimentos/dia, taxa de falha por
`error_code`. Uma tela só, no fim.

---

## 10. Guia manual do Igor — criar o app na Meta

> Isto é **trabalho seu**, não do código. Faça o passo 0 hoje: ele roda em paralelo e é
> pré-requisito de tudo.

**Passo 0 — Business Verification (COMEÇAR JÁ)**
`business.facebook.com` → Configurações do Negócio → **Central de Segurança** → *Verificação do
negócio*. Enviar CNPJ, comprovante de endereço e comprovante de vínculo. Leva dias/semanas e
**bloqueia** o App Review. Fazer antes de qualquer coisa.

**Passo 1 — Criar o app**
`developers.facebook.com` → *Meus Apps* → **Criar app** → caso de uso **"Outro"** → tipo
**Empresa** → vincular ao Business Manager do passo 0.

**Passo 2 — Adicionar o produto Instagram**
Painel do app → **Adicionar produto** → **Instagram** → escolher **"API com login do Instagram"**.
⚠️ **Não** escolher "API com login do Facebook" — é a outra rota, exige Página vinculada.

**Passo 3 — Anotar as credenciais**
*Instagram → Configuração da API* → copiar **ID do app do Instagram** e **Chave secreta do app do
Instagram**. Mandar pra mim por canal seguro (**nunca** por commit, print no chat ou arquivo no
repo). Viram `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET`.

**Passo 4 — URI de redirecionamento do OAuth**
*Instagram → Configuração da API → Configurar login do negócio* → **URIs de redirecionamento OAuth
válidos**, adicionar os dois:
```
https://<dominio-de-prod>/api/ig/oauth/callback
http://localhost:3000/api/ig/oauth/callback
```

**Passo 5 — Webhooks**
Mesma tela → **Webhooks** → *URL de retorno*: `https://<dominio-de-prod>/api/ig/webhook` ·
*Token de verificação*: string aleatória longa (vira `IG_WEBHOOK_VERIFY_TOKEN`).
Clicar **Verificar e salvar** — só funciona com a rota já no ar. Depois, **Assinar** os campos:
✅ `comments` · ✅ `messages`. Nenhum outro.

**Passo 6 — Permissões**
*Revisão do app → Permissões e recursos*. Pedir **Acesso avançado** de:
`instagram_business_basic` · `instagram_business_manage_messages` ·
`instagram_business_manage_comments`.
⚠️ **Não** pedir `instagram_business_content_publish` — não usamos, e é mais um ciclo de review.

**Passo 7 — URLs obrigatórias**
*Configurações → Básico*: Política de Privacidade, Termos de Serviço, e **URL de retorno de
exclusão de dados** = `https://<dominio-de-prod>/api/ig/data-deletion`. Categoria: *Business*.
Ícone 1024×1024.

**Passo 8 — Convidar a conta de teste (beta)**
*Funções → Funções → Testadores do Instagram* → **Adicionar** → `@megainfantilatacado`.
Aceitar em `instagram.com` → *Editar perfil* → *Apps e sites* → *Convites de testador*.

---

## 11. Plano de sprints — 1 item por PR

Base: `main`. Branch: `feat/ig-connect`. Cada PR fecha na mesma sessão (`CLAUDE.md` §Regra de PR).

| # | PR | Entrega | Critério de saída |
|---|---|---|---|
| **S0** | *(sem código)* | Igor: Business Verification + app criado (§10 passos 0–4) | `INSTAGRAM_APP_ID`/`SECRET` em mãos |
| **S1** | `feat(ig): schema` | Migração `ig_accounts`/`ig_triggers`/`ig_events` + RLS + `apply-order.txt` | Aplicada **nos 2 bancos**; advisor de segurança limpo |
| **S2** | `feat(ig): oauth connect` | `/api/ig/oauth/start` + `/callback`, `state` assinado, cripto do token, `subscribed_apps` | Conta da Mega Stock conectada em dev; `webhook_subscribed = true` |
| **S3** | `feat(ig): webhook receiver` | `GET`+`POST /api/ig/webhook`, HMAC sobre body cru, `PROVIDER_WEBHOOKS` (§4.4), rate limit, idempotência | Handshake verde no App Dashboard; teste de assinatura inválida → 401; teste do 401 do GET sem allowlist |
| **S4** | `feat(ig): keyword matcher` | `match-keyword.ts` puro + testes (acento, emoji, caixa, palavra dentro de palavra) | Cobertura ≥80% no módulo (TDD) |
| **S5** | `feat(ig): comment→dm` | Fluxo A: private reply via `after()`, filtros self/`parent_id`, `?src=igdm` | Comentário real na Mega Stock → DM em <5s |
| **S6** | `feat(ig): dm→reply` | Fluxo B: `messages`, filtro `is_self` | DM real → resposta em <5s |
| **S7** | `feat(ig): painel` | `/painel/instagram`: conectar, CRUD de gatilho, atendimentos, contador de bytes | Igor cria um gatilho ponta a ponta sem tocar em SQL |
| **S8** | `feat(ig): flag + refresh + retenção` | `ig_connect_enabled`, refresh no cron, varredura de presos, purga 90d, `funnel_events` | Flag off esconde tudo; token renovado em teste |
| **S9** | `docs(ig): app review` | Fase 3: roteiro do screencast, justificativas, política de privacidade + deleção | Submissão enviada |

**S1→S4 podem ir em paralelo com S2/S3** (schema e matcher não dependem de OAuth).
**S5 depende de S2+S3+S4.**

---

## 12. Riscos herdados da Fase 0 (resumo)

**R1 (🔴)** — App Review pode reprovar pelo enquadramento do caso de uso. Mitigação: narrar como
atendimento, nunca como captação. **É o caminho crítico do projeto, não o código.**
**R2 (🟠)** — teto de ~25 testadores + convite manual. **R3 (🟠)** — token de 60 dias expira em
silêncio. **R4 (🟠)** — Meta muda a plataforma. Detalhe e mitigações: Fase 0 §8.

**NO-GO parcial mantido:** não anunciar nem vender o "+ Instagram" pra base antes da aprovação do
App Review.

---

## 13. O que preciso de você pra seguir

1. **Aprovar este PRD** (ou apontar o que muda).
2. **Começar a Business Verification hoje** (§10 passo 0) — é o gargalo real.
3. Confirmar o **domínio de produção** que vai nas URLs do app Meta.

Com o "ok", começo por **S1 + S4** (schema e matcher), que não dependem de nada seu.
