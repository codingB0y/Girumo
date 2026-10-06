# Fluxos do Instagram — fase 2 — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** um comentário, um direct ou uma resposta a story com a palavra combinada vira, em menos de 5 segundos, um direct com o link do grupo; a loja conecta e desconecta a conta pelo painel, publica e pausa o fluxo, e vê na aba "Atendimentos" quem chamou e o que aconteceu.

**Architecture:** a Zernio é só transporte (`lib/ig/transport/*`: um tipo `Transport` com a implementação real e a falsa dos testes). O webhook dela (`POST /api/ig/webhook`) confere a assinatura HMAC do corpo cru, traduz o evento com zod e entrega ao motor (`lib/ig/engine/*`), que escolhe o fluxo no ar, grava o run (`ig_runs`, idempotente por `source_id`) e executa o primeiro passo **na mesma requisição**. A conexão da conta é OAuth hospedado pela Zernio com `state` assinado e confirmação pela API (nunca pelos ids da query). Nenhuma migração: as tabelas nasceram na fase 1.

**Tech Stack:** Next 15 (App Router, `apps/web`), React 19, TypeScript strict, zod 4, `node:crypto`, Supabase (dois bancos, service-role com filtro de tenant), `node:test` via tsx, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-02-instagram-fluxos-design.md` (leia §3, §5, §7, §8.1–8.3, §9, §10, §13, §14 e o Apêndice antes de começar). Plano da fase 1, já na `main`: `docs/superpowers/plans/2026-10-03-instagram-fluxos-fase1.md` (o código que esta fase estende está descrito lá).

## Global Constraints

- Toda query em tabela com `tenant_id` filtra `.eq("tenant_id", tenantId)`, inclusive update e delete. **Única exceção desta fase, documentada no código:** `getAccountByProviderId` em `ig-accounts.ts`, que o webhook usa para descobrir a loja a partir do id da conta na Zernio (índice único `ig_accounts_provider_account_uidx`).
- Stores são Supabase-only, começam com `import "server-only"` e usam `getSupabaseAdmin()` de `@/lib/supabase/server`. Teste de store: PostgREST falso em `node:http` (mesmo molde de `src/lib/stores/ig-flows.test.ts`).
- Rotas do painel: `export const runtime = "nodejs"; export const dynamic = "force-dynamic";`, liberação por `requireInstagram(req)` (`@/lib/ig/access`), escrita atrás de `assertPermission(ctx.role, ...)` (`@/lib/permissions`), erro `Response.json({ error }, { status })`, `catch (e) { if (e instanceof Response) return e; throw e; }`.
- `POST /api/ig/webhook` **não tem sessão**: entra em `PROVIDER_WEBHOOKS` (`src/lib/security/request-access-policy.ts`) e em `RATE_LIMITS` (`src/middleware.ts`), confere `X-Zernio-Signature` em tempo constante e responde 202 para tudo que não é nosso (conta desconhecida, loja sem liberação, evento de outro tipo). Nunca vira oráculo.
- Segredos: `ZERNIO_API_KEY` e `ZERNIO_WEBHOOK_SECRET` só no servidor, nunca `NEXT_PUBLIC_`, nunca em log, nunca no chat, nunca em commit. Em dev ficam em `apps/web/.env.local`; em produção na Vercel (Production e Preview, marcadas Sensitive).
- Corpo de requisição validado com zod (`z.strictObject` nas rotas do painel; `z.object`, que descarta campos extras, nos eventos da Zernio, cujo contrato cresce sem aviso).
- Dados pessoais: guardar só id escopado do Instagram, `@`, palavra que casou, datas e estado. **Nunca** o texto do comentário ou do direct, nem quem comentou sem casar palavra. Retenção de 90 dias (`purgeOldRuns`).
- Regras da Meta no motor: **uma** resposta privada por comentário, dentro de 7 dias; o primeiro direct depois de comentário é texto puro; direct na conversa só com `conversationId` (só quem veio por direct ou story tem um nesta fase); mensagem até 1000 bytes (já validado na fase 1); 750 respostas privadas por hora por conta (teto nosso: 700).
- A Zernio espera **2xx em até 5 segundos**; o transporte usa timeout de 4 s e todo envio leva `Idempotency-Key` (`<run.id>:<node.id>`), então um reenvio nunca manda duas vezes.
- Interface em PT-BR, vocabulário do atacado: "direct", "atendimentos", "pessoas", "fluxo". **Nunca "lead".** Sem emoji. Direção D como na fase 1 (tokens `bg-paper-0`, `border-line-200`, `text-volt-950`, `text-slate-600`, `pn-chip`, `pn-skeleton`; `npm run painel:check` barra `bg-acid` fora do Postar).
- Nome acessível é contrato de teste: `aria-label`, `role="group"`, `aria-pressed`, `role="switch"`, `role="tab"`/`aria-selected`. Renomear exige atualizar o teste no mesmo PR.
- Um PR por assunto, fechado na mesma sessão (revisar → CI verde → mergear → apagar a branch). Este plano são **4 PRs** (F–I); cada um termina com "Gate" e "Entrega". Commits em inglês com prefixo semântico.
- Nesta fase o motor executa só **receitas de um direct** (gatilho → direct/convite). Esperar resposta, "segue a loja?", lembrete e desvio por clique ficam na fase 3: um fluxo com esses blocos **não publica** (issue `fase_seguinte`, Task 12). O modelo e o editor da fase 1 continuam aceitando montar esses blocos no rascunho.

## Antes de começar (uma vez)

- [ ] `git fetch origin main` e confirme que `docs/superpowers/plans/2026-10-03-instagram-fluxos-fase1.md` e `apps/web/src/lib/ig/flow/types.ts` existem em `origin/main` (fase 1 inteira mergeada em 05/10/2026).
- [ ] Trabalhe no worktree da própria sessão. A cada PR: `git fetch origin main` e `git switch -c <branch> origin/main`. PR empilhado + squash vira CONFLICTING: só abra o PR seguinte depois do merge do anterior, sempre a partir de `origin/main`.
- [ ] Dependências: `Test-Path apps/web/node_modules/next`. Se faltar, `npm ci --workspace apps/web --include-workspace-root`.
- [ ] Segredos em dev: em `apps/web/.env.local` do worktree, `ZERNIO_API_KEY=<chave>` (o Igor fornece fora do chat; ela já existe no `.env.local` do worktree `.claude/worktrees/ig-fluxos`, copie de lá) e `ZERNIO_WEBHOOK_SECRET=<32 bytes aleatórios em hex>` (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`). Em produção, o Igor cadastra as duas na Vercel antes do PR H ser mergeado (Production e Preview, Sensitive).
- [ ] Comandos do gate, da raiz do repositório (rode todos antes de cada push):

```bash
npm --workspace apps/web test
npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json
npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json
npm --workspace apps/web run lint
npm --workspace apps/web run painel:check
npm --workspace apps/web run brand:check
npm run scan:secrets
```

Antes do push, o gate completo (inclui o build): `pwsh -File infra/scripts/verify-local.ps1`.

- [ ] Um teste só: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/transport/zernio.test.ts`.
- [ ] Quadro (prod `nidoatbxaylrkcgbszns`): ao começar o PR F, atualize os cards. SQL (rode com `npx supabase --workdir <pasta vazia> db query --linked -f arquivo.sql` depois de `npx supabase --workdir <pasta vazia> link --project-ref nidoatbxaylrkcgbszns --yes`; se o classificador recusar, peça ao Igor):

```sql
select public.move_card('ig-oauth-conexao', 'em_construcao', 'Fase 2 em implementação (plano docs/superpowers/plans/2026-10-06-instagram-fluxos-fase2.md): PR F conecta a conta pela Zernio.', 'plano fase 2');
select public.move_card('ig-webhook-receiver', 'em_construcao', 'Fase 2: PR G assinatura e eventos, PR H rota do webhook.', 'plano fase 2');
select public.move_card('ig-comentario-dm', 'em_construcao', 'Fase 2: PR H motor das receitas de um direct.', 'plano fase 2');
select public.move_card('ig-dm-resposta', 'em_construcao', 'Fase 2: PR H gatilho de direct e story.', 'plano fase 2');
update public.board_features set blocker = 'Fase 2 em implementação: F conexão, G webhook (assinatura, eventos, escolha do fluxo, store de runs), H motor + rota + publicar/pausar, I aba Atendimentos.', updated_at = now() where key in ('ig-oauth-conexao', 'ig-webhook-receiver', 'ig-comentario-dm', 'ig-dm-resposta', 'ig-keyword-matcher');
```

## Contrato da Zernio usado nesta fase (conferido no OpenAPI em 02/10 e nos eventos da prova)

| Uso | Chamada | Resposta |
|---|---|---|
| Perfil do tenant | `POST /v1/profiles { name }` | `201 { profile: { _id } }`; nome repetido: `409` com `details.existingProfileId` |
| Conectar | `GET /v1/connect/instagram?profileId=&redirect_url=&scopes=comments,messaging` | `{ authUrl }`. A Zernio hospeda a tela e volta para `redirect_url` com `connected=instagram&profileId=&accountId=&username=` (sucesso) ou `error=&platform=` (falha; `oauth_denied` = a pessoa cancelou) |
| Contas do perfil | `GET /v1/accounts?profileId=&platform=instagram` | `{ accounts: [{ _id, username, isActive, needsReconnection, ... }] }` |
| Desconectar | `DELETE /v1/accounts/{accountId}` | 2xx; 404 se já não existe |
| Resposta privada | `POST /v1/inbox/comments/{postId}/{commentId}/private-reply { accountId, message }` | 2xx; `400` com `details.privateReplyConsumed: true` quando a única resposta do comentário já foi gasta (**nunca repetir**) |
| Resposta pública | `POST /v1/inbox/comments/{postId} { accountId, message, commentId }` | 2xx |
| Direct na conversa | `POST /v1/inbox/conversations/{conversationId}/messages { accountId, message }` | 2xx |
| Webhook | `POST /v1/webhooks/settings { name, url, secret, events }` | criado uma vez, à mão (Task 16) |

Autenticação `Authorization: Bearer <chave>`; reenvio seguro por `Idempotency-Key` (24 h; mesma chave + mesmo corpo replica a resposta). Erro: `{ error, type, code, details?, platformError? }`; 502 = a plataforma falhou (passageiro); 429 e 503 respeitam `Retry-After`.

**Eventos** (envelope `{ id, event, timestamp, ... }`; `id` é a chave de dedupe da Zernio, também em `X-Zernio-Event-Id`; assinatura `X-Zernio-Signature` = HMAC-SHA256 hex do corpo cru; até 7 tentativas com espera crescente quando não recebe 2xx em 5 s):

- `comment.received`: `comment.{ id, platformPostId, platform, text, author.{ id, username?, isOwnAccount? }, createdAt, isReply }`, `post.{ platformPostId }`, `account.{ accountId }`.
- `message.received`: `message.{ platformMessageId, platform, direction, text, sender.{ id, username? }, sentAt }`, `conversation.{ id, participantId }`, `account.{ accountId }`, `metadata.{ storyReply.{ storyId }?, quotedMessageId?, postbackPayload? }?`.
- `account.connected`: `account.{ accountId, profileId, platform, username }`.
- `account.disconnected`: `account.{ accountId, disconnectionType, reason }`.
- `comment.author.id` e `message.sender.id` (= `conversation.participantId`) são o mesmo id da pessoa (IGSID).

A listagem de contas **não traz** o id escopado do Instagram da própria loja; `ig_accounts.ig_user_id` (obrigatório e único) recebe `zernio:<accountId>`. O motor reconhece comentário da própria conta por `comment.author.isOwnAccount`, não por esse campo.

## Mapa de arquivos

| Arquivo | Responsabilidade | PR |
|---|---|---|
| `src/lib/ig/transport/types.ts` | `Transport`, `ZernioError`, tipos de envio | F |
| `src/lib/ig/transport/zernio.ts` (+ `.test.ts`) | cliente real (`fetch` injetável) | F |
| `src/lib/ig/transport/fake.ts` | transporte falso dos testes | F |
| `src/lib/ig/transport/erros.ts` (+ `.test.ts`) | erro da Zernio → frase para o lojista | F |
| `src/lib/ig/segredos.ts` | leitura das duas variáveis | F |
| `src/lib/ig/connect/state.ts` (+ `.test.ts`) | `state` assinado (HMAC, 10 min, tenant, perfil) | F |
| `src/lib/stores/ig-accounts.ts` (+ `.test.ts`) | upsert, busca por id da Zernio, status | F |
| `src/lib/stores/ig-flows.ts` | `pauseLiveFlows`, `setFlowStatus`, `publishFlow` com conta, `listLiveFlows` com versão | F, H |
| `src/app/api/ig/connect/route.ts`, `connect/callback/route.ts`, `account/route.ts` | conectar, voltar, desconectar | F |
| `src/components/painel/instagram/lista.tsx` | conta: conectar/desconectar, aviso do teto | F, I |
| `src/lib/ig/transport/signature.ts` (+ `.test.ts`) | `X-Zernio-Signature` | G |
| `src/lib/ig/webhook/events.ts` (+ `.test.ts`) | zod dos 4 eventos | G |
| `src/lib/ig/engine/select-flow.ts` (+ `.test.ts`) | qual fluxo no ar atende o evento | G |
| `src/lib/stores/ig-runs.ts` (+ `.test.ts`) | runs e passos | G |
| `src/lib/security/request-access-policy.ts`, `src/middleware.ts` | rota do webhook sem sessão, com teto | G |
| `src/lib/ig/flow/fase.ts` (+ `.test.ts`), `validate.ts` | blocos que ainda não rodam | H |
| `src/lib/ig/engine/link.ts` (+ `.test.ts`) | link do convite com `?ig=<ref>` | H |
| `src/lib/ig/engine/advance.ts` (+ `.test.ts`) | executa o run | H |
| `src/lib/ig/engine/handle-event.ts` (+ `.test.ts`) | evento → run → `advance` | H |
| `src/app/api/ig/webhook/route.ts` | a rota | H |
| `src/app/api/ig/flows/[id]/publish/route.ts`, `[id]/status/route.ts` | publicar com conta; pausar/retomar | H |
| `src/components/painel/instagram/use-fluxo.ts`, `editor.tsx` | interruptor "No ar"; abas | H, I |
| `src/app/api/ig/flows/[id]/runs/route.ts` | atendimentos do fluxo | I |
| `src/components/painel/instagram/atendimentos.tsx` | a aba | I |
| `src/app/api/ig/status/route.ts`, `casca-context.tsx` | `startedLastHour` | I |

---

## PR F — transporte e conexão da conta

Branch: `feat/ig-connect`. Entrega: a loja clica "Conectar Instagram", autoriza na Zernio, volta com a conta gravada e ativa; "Desconectar" apaga na Zernio, marca `disconnected` e pausa os fluxos no ar.

### Task 1: transporte — tipos, erro e cliente da Zernio

**Files:**
- Create: `apps/web/src/lib/ig/transport/types.ts`
- Create: `apps/web/src/lib/ig/transport/zernio.ts`
- Test: `apps/web/src/lib/ig/transport/zernio.test.ts`

**Interfaces:**
- Produces: `Transport` (7 métodos), `ZernioError` (`status`, `type`, `code`, `details`, `privateReplyConsumed`, `transient`), `createZernioTransport({ apiKey, fetchImpl?, baseUrl? })`, tipos `PrivateReplyInput`, `PublicReplyInput`, `ConversationMessageInput`, `ZernioAccount`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ig/transport/zernio.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { ZernioError } from "./types";
import { createZernioTransport } from "./zernio";

type Pedido = { url: URL; metodo: string; headers: Record<string, string>; corpo: unknown };

function fetchFalso(respostas: Array<{ status: number; body: unknown }>) {
  const pedidos: Pedido[] = [];
  const fetchImpl = (async (entrada: string | URL | Request, init?: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    pedidos.push({ url: new URL(String(entrada)), metodo: init?.method ?? "GET", headers, corpo: init?.body ? JSON.parse(String(init.body)) : null });
    const r = respostas.shift() ?? { status: 200, body: {} };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { fetchImpl, pedidos };
}

test("todo pedido leva a chave no Authorization e o Idempotency-Key quando há", async () => {
  const { fetchImpl, pedidos } = fetchFalso([{ status: 200, body: { success: true } }]);
  const z = createZernioTransport({ apiKey: "chave-x", fetchImpl });
  await z.privateReply({ accountId: "c1", platformPostId: "p1", commentId: "k1", message: "oi", idempotencyKey: "run:no" });
  assert.equal(pedidos[0].url.toString(), "https://zernio.com/api/v1/inbox/comments/p1/k1/private-reply");
  assert.equal(pedidos[0].metodo, "POST");
  assert.equal(pedidos[0].headers.authorization, "Bearer chave-x");
  assert.equal(pedidos[0].headers["idempotency-key"], "run:no");
  assert.deepEqual(pedidos[0].corpo, { accountId: "c1", message: "oi" });
});

test("resposta pública e direct na conversa batem no caminho certo com o corpo certo", async () => {
  const { fetchImpl, pedidos } = fetchFalso([{ status: 200, body: {} }, { status: 200, body: {} }]);
  const z = createZernioTransport({ apiKey: "k", fetchImpl });
  await z.publicReply({ accountId: "c1", platformPostId: "p/1", commentId: "k1", message: "Te chamei", idempotencyKey: "a" });
  await z.sendMessage({ accountId: "c1", conversationId: "v1", message: "Link", idempotencyKey: "b" });
  assert.equal(pedidos[0].url.pathname, "/api/v1/inbox/comments/p%2F1");
  assert.deepEqual(pedidos[0].corpo, { accountId: "c1", message: "Te chamei", commentId: "k1" });
  assert.equal(pedidos[1].url.pathname, "/api/v1/inbox/conversations/v1/messages");
  assert.deepEqual(pedidos[1].corpo, { accountId: "c1", message: "Link" });
});

test("ensureProfile devolve o _id criado ou, no 409, o perfil que já existe", async () => {
  const { fetchImpl } = fetchFalso([
    { status: 201, body: { profile: { _id: "novo" } } },
    { status: 409, body: { error: "dup", type: "invalid_request_error", code: "duplicate", details: { existingProfileId: "velho" } } },
  ]);
  const z = createZernioTransport({ apiKey: "k", fetchImpl });
  assert.equal(await z.ensureProfile("tenant-1"), "novo");
  assert.equal(await z.ensureProfile("tenant-1"), "velho");
});

test("connectUrl pede só comentário e mensagem; listAccounts filtra o perfil e a plataforma", async () => {
  const { fetchImpl, pedidos } = fetchFalso([
    { status: 200, body: { authUrl: "https://zernio.com/x" } },
    { status: 200, body: { accounts: [{ _id: "c1", username: "loja", isActive: true, needsReconnection: false, platform: "instagram" }] } },
  ]);
  const z = createZernioTransport({ apiKey: "k", fetchImpl });
  assert.equal(await z.connectUrl("perfil", "https://app/x?state=s"), "https://zernio.com/x");
  assert.equal(pedidos[0].url.pathname, "/api/v1/connect/instagram");
  assert.deepEqual(Object.fromEntries(pedidos[0].url.searchParams), { profileId: "perfil", redirect_url: "https://app/x?state=s", scopes: "comments,messaging" });
  assert.deepEqual(await z.listAccounts("perfil"), [{ id: "c1", username: "loja", isActive: true, needsReconnection: false }]);
  assert.deepEqual(Object.fromEntries(pedidos[1].url.searchParams), { profileId: "perfil", platform: "instagram" });
});

test("erro vira ZernioError com o envelope, e privateReplyConsumed é lido de details", async () => {
  const { fetchImpl } = fetchFalso([{ status: 400, body: { error: "spent", type: "invalid_request_error", code: "private_reply_consumed", details: { privateReplyConsumed: true } } }]);
  const z = createZernioTransport({ apiKey: "k", fetchImpl });
  await assert.rejects(
    () => z.privateReply({ accountId: "c", platformPostId: "p", commentId: "k", message: "m", idempotencyKey: "i" }),
    (e: unknown) => e instanceof ZernioError && e.status === 400 && e.code === "private_reply_consumed" && e.privateReplyConsumed && !e.transient,
  );
});

test("sem chave não sai pedido nenhum; rede fora vira erro passageiro; 404 ao apagar conta é sucesso", async () => {
  const { fetchImpl, pedidos } = fetchFalso([]);
  await assert.rejects(() => createZernioTransport({ apiKey: "", fetchImpl }).listAccounts("p"), (e: unknown) => e instanceof ZernioError && e.code === "zernio_api_key_missing");
  assert.equal(pedidos.length, 0);
  const caiu = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
  await assert.rejects(() => createZernioTransport({ apiKey: "k", fetchImpl: caiu }).listAccounts("p"), (e: unknown) => e instanceof ZernioError && e.status === 0 && e.transient);
  const { fetchImpl: f404 } = fetchFalso([{ status: 404, body: { error: "no", type: "not_found", code: "account_not_found" } }]);
  await createZernioTransport({ apiKey: "k", fetchImpl: f404 }).deleteAccount("sumiu");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/transport/zernio.test.ts`
Expected: FAIL (módulo `./types` / `./zernio` não existe).

- [ ] **Step 3: Write the types**

```ts
// apps/web/src/lib/ig/transport/types.ts
/**
 * O que o motor pede ao transporte. Duas implementações desde o primeiro dia:
 * a da Zernio (`zernio.ts`) e a falsa dos testes (`fake.ts`). Trocar de
 * fornecedor é escrever outra implementação deste tipo.
 */
export type PrivateReplyInput = { accountId: string; platformPostId: string; commentId: string; message: string; idempotencyKey: string };
export type PublicReplyInput = { accountId: string; platformPostId: string; commentId: string; message: string; idempotencyKey: string };
export type ConversationMessageInput = { accountId: string; conversationId: string; message: string; idempotencyKey: string };
export type ZernioAccount = { id: string; username: string; isActive: boolean; needsReconnection: boolean };

export type Transport = {
  /** Garante o perfil da loja na Zernio e devolve o id (cria, ou reaproveita no 409). */
  ensureProfile(name: string): Promise<string>;
  /** URL da Zernio para onde o navegador da loja vai autorizar. */
  connectUrl(profileId: string, redirectUrl: string): Promise<string>;
  listAccounts(profileId: string): Promise<ZernioAccount[]>;
  deleteAccount(accountId: string): Promise<void>;
  privateReply(input: PrivateReplyInput): Promise<void>;
  publicReply(input: PublicReplyInput): Promise<void>;
  sendMessage(input: ConversationMessageInput): Promise<void>;
};

/** Envelope de erro da Zernio (`{ error, type, code, details }`). `status` 0 = rede ou timeout. */
export class ZernioError extends Error {
  constructor(
    readonly status: number,
    readonly type: string,
    readonly code: string,
    readonly details: Record<string, unknown> | null,
    message: string,
  ) {
    super(message);
    this.name = "ZernioError";
  }

  /** A única resposta privada deste comentário já saiu: tratar como enviado, nunca repetir. */
  get privateReplyConsumed(): boolean {
    return this.details?.privateReplyConsumed === true;
  }

  /** Vale deixar a Zernio reenviar o evento (rede, timeout, 429, 5xx). */
  get transient(): boolean {
    return this.status === 0 || this.status === 429 || this.status >= 500;
  }
}
```

- [ ] **Step 4: Write the client**

```ts
// apps/web/src/lib/ig/transport/zernio.ts
import "server-only";

import { ZernioError, type ConversationMessageInput, type PrivateReplyInput, type PublicReplyInput, type Transport, type ZernioAccount } from "./types";

const BASE_URL = "https://zernio.com/api";
/** A Zernio espera nosso 2xx em 5 s; o envio dela tem que caber antes disso. */
const TIMEOUT_MS = 4_000;

type Chamada = { method: "GET" | "POST" | "DELETE"; path: string; query?: Record<string, string>; body?: unknown; idempotencyKey?: string };

export function createZernioTransport(deps: { apiKey: string; fetchImpl?: typeof fetch; baseUrl?: string }): Transport {
  const doFetch = deps.fetchImpl ?? fetch;
  const base = (deps.baseUrl ?? BASE_URL).replace(/\/+$/, "");

  async function call<T>(c: Chamada): Promise<T> {
    if (!deps.apiKey) throw new ZernioError(0, "config_error", "zernio_api_key_missing", null, "ZERNIO_API_KEY ausente.");
    const url = new URL(`${base}/${c.path}`);
    for (const [k, v] of Object.entries(c.query ?? {})) url.searchParams.set(k, v);
    const headers: Record<string, string> = { Authorization: `Bearer ${deps.apiKey}`, Accept: "application/json" };
    if (c.body !== undefined) headers["Content-Type"] = "application/json";
    if (c.idempotencyKey) headers["Idempotency-Key"] = c.idempotencyKey;
    let res: Response;
    try {
      res = await doFetch(url, { method: c.method, headers, body: c.body === undefined ? undefined : JSON.stringify(c.body), signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      // Nunca inclui a URL nem a chave na mensagem.
      throw new ZernioError(0, "network_error", "network_error", null, e instanceof Error ? e.message : "rede");
    }
    const texto = await res.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const env = (json ?? {}) as { error?: string; type?: string; code?: string; details?: Record<string, unknown> };
      throw new ZernioError(res.status, env.type ?? "api_error", env.code ?? `http_${res.status}`, env.details ?? null, env.error ?? `Zernio respondeu ${res.status}.`);
    }
    return json as T;
  }

  const seg = encodeURIComponent;

  return {
    async ensureProfile(name) {
      try {
        const r = await call<{ profile?: { _id?: string } }>({ method: "POST", path: "v1/profiles", body: { name } });
        if (!r.profile?._id) throw new ZernioError(502, "api_error", "profile_without_id", null, "Perfil sem id.");
        return r.profile._id;
      } catch (e) {
        const existente = e instanceof ZernioError && e.status === 409 ? e.details?.existingProfileId : undefined;
        if (typeof existente === "string" && existente) return existente;
        throw e;
      }
    },
    async connectUrl(profileId, redirectUrl) {
      const r = await call<{ authUrl?: string }>({ method: "GET", path: "v1/connect/instagram", query: { profileId, redirect_url: redirectUrl, scopes: "comments,messaging" } });
      if (!r.authUrl) throw new ZernioError(502, "api_error", "auth_url_missing", null, "Resposta sem authUrl.");
      return r.authUrl;
    },
    async listAccounts(profileId) {
      const r = await call<{ accounts?: Array<{ _id: string; username?: string; isActive?: boolean; needsReconnection?: boolean }> }>({ method: "GET", path: "v1/accounts", query: { profileId, platform: "instagram" } });
      return (r.accounts ?? []).map<ZernioAccount>((a) => ({ id: a._id, username: a.username ?? "", isActive: a.isActive === true, needsReconnection: a.needsReconnection === true }));
    },
    async deleteAccount(accountId) {
      try {
        await call({ method: "DELETE", path: `v1/accounts/${seg(accountId)}` });
      } catch (e) {
        if (!(e instanceof ZernioError) || e.status !== 404) throw e;
      }
    },
    async privateReply(i: PrivateReplyInput) {
      await call({ method: "POST", path: `v1/inbox/comments/${seg(i.platformPostId)}/${seg(i.commentId)}/private-reply`, body: { accountId: i.accountId, message: i.message }, idempotencyKey: i.idempotencyKey });
    },
    async publicReply(i: PublicReplyInput) {
      await call({ method: "POST", path: `v1/inbox/comments/${seg(i.platformPostId)}`, body: { accountId: i.accountId, message: i.message, commentId: i.commentId }, idempotencyKey: i.idempotencyKey });
    },
    async sendMessage(i: ConversationMessageInput) {
      await call({ method: "POST", path: `v1/inbox/conversations/${seg(i.conversationId)}/messages`, body: { accountId: i.accountId, message: i.message }, idempotencyKey: i.idempotencyKey });
    },
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/transport/zernio.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/ig/transport/types.ts apps/web/src/lib/ig/transport/zernio.ts apps/web/src/lib/ig/transport/zernio.test.ts
git commit -m "feat(ig): Zernio transport with typed errors and idempotent sends"
```

### Task 2: transporte falso, segredos e tradução de erro para o lojista

**Files:**
- Create: `apps/web/src/lib/ig/transport/fake.ts`
- Create: `apps/web/src/lib/ig/transport/erros.ts`
- Create: `apps/web/src/lib/ig/segredos.ts`
- Test: `apps/web/src/lib/ig/transport/erros.test.ts`

**Interfaces:**
- Consumes: `Transport`, `ZernioError`, `ZernioAccount` (Task 1); `resolveSecret` de `@/lib/runtime-secrets`.
- Produces: `createFakeTransport({ falhar?, contas? })` → `{ transport, chamadas }`; `mensagemParaLojista(e: ZernioError): string`; `traduzErro(code: string | null): string`; `zernioApiKey()`, `zernioWebhookSecret()`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ig/transport/erros.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { mensagemParaLojista, traduzErro } from "./erros";
import { ZernioError } from "./types";

test("cartão, limite e rede têm frase própria; o resto cita o código sem vazar detalhe", () => {
  assert.match(mensagemParaLojista(new ZernioError(402, "permission_error", "payment_required", null, "x")), /cartão/i);
  assert.match(mensagemParaLojista(new ZernioError(429, "rate_limit_error", "rate_limited", null, "x")), /limite/i);
  assert.match(mensagemParaLojista(new ZernioError(0, "network_error", "network_error", null, "ECONNRESET")), /não respondeu/i);
  const outra = mensagemParaLojista(new ZernioError(400, "invalid_request_error", "missing_required_field", null, "details leak"));
  assert.match(outra, /missing_required_field/);
  assert.doesNotMatch(outra, /leak/);
});

test("códigos gravados no run viram frase curta; desconhecido mostra o código", () => {
  assert.equal(traduzErro(null), "");
  assert.match(traduzErro("window_expired"), /janela/i);
  assert.match(traduzErro("platform_api_error"), /Instagram recusou/i);
  assert.match(traduzErro("no_conversation"), /responder/i);
  assert.match(traduzErro("qualquer_coisa"), /qualquer_coisa/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/transport/erros.test.ts`
Expected: FAIL (módulo `./erros` não existe).

- [ ] **Step 3: Write the three modules**

```ts
// apps/web/src/lib/ig/transport/erros.ts
import type { ZernioError } from "./types";

/** Código gravado em `ig_runs.error_code` → frase da aba Atendimentos. Sem dado pessoal. */
const POR_CODIGO: Record<string, string> = {
  window_expired: "A janela de envio fechou antes de mandar.",
  platform_api_error: "O Instagram recusou o envio.",
  rate_limited: "Limite de envios por hora. Tenta de novo sozinho.",
  payment_required: "A Zernio pede cartão cadastrado pra enviar.",
  network_error: "A Zernio não respondeu a tempo.",
  no_conversation: "Precisa que a pessoa responda antes do próximo direct.",
  unsupported_node: "Este bloco só roda na próxima fase.",
  cycle: "O fluxo deu voltas demais e parou.",
  account_inactive: "A conta do Instagram não está conectada.",
};

export function traduzErro(code: string | null): string {
  if (!code) return "";
  return POR_CODIGO[code] ?? `A Zernio recusou (código ${code}).`;
}

/** Para as rotas do painel (conectar, desconectar, retomar). Nunca repete `details` nem `message` da Zernio. */
export function mensagemParaLojista(e: ZernioError): string {
  if (e.status === 402 || e.code === "payment_required" || e.code === "platform_account_limit") return "A Zernio pede cartão cadastrado antes de conectar mais contas. Fale com a Girumo.";
  if (e.status === 429) return "Limite de chamadas na Zernio. Espere um minuto e tente de novo.";
  if (e.status === 0) return "A Zernio não respondeu. Tente de novo.";
  if (e.status >= 500) return "A Zernio está fora do ar. Tente de novo em alguns minutos.";
  return `A Zernio recusou (código ${e.code}).`;
}
```

```ts
// apps/web/src/lib/ig/transport/fake.ts
import type { ConversationMessageInput, PrivateReplyInput, PublicReplyInput, Transport, ZernioAccount, ZernioError } from "./types";

export type Chamada =
  | { metodo: "ensureProfile"; args: string }
  | { metodo: "connectUrl"; args: { profileId: string; redirectUrl: string } }
  | { metodo: "listAccounts"; args: string }
  | { metodo: "deleteAccount"; args: string }
  | { metodo: "privateReply"; args: PrivateReplyInput }
  | { metodo: "publicReply"; args: PublicReplyInput }
  | { metodo: "sendMessage"; args: ConversationMessageInput };

/**
 * Transporte dos testes: grava cada chamada e, por método, lança o erro
 * combinado em `falhar` (uma vez por chamada, sempre). Sem "server-only" de
 * propósito: os testes do motor importam daqui.
 */
export function createFakeTransport(opts: { falhar?: Partial<Record<Chamada["metodo"], ZernioError>>; contas?: ZernioAccount[] } = {}) {
  const chamadas: Chamada[] = [];
  const registra = (c: Chamada) => {
    chamadas.push(c);
    const erro = opts.falhar?.[c.metodo];
    if (erro) throw erro;
  };
  const transport: Transport = {
    async ensureProfile(name) {
      registra({ metodo: "ensureProfile", args: name });
      return "perfil-falso";
    },
    async connectUrl(profileId, redirectUrl) {
      registra({ metodo: "connectUrl", args: { profileId, redirectUrl } });
      return "https://zernio.falso/autorizar";
    },
    async listAccounts(profileId) {
      registra({ metodo: "listAccounts", args: profileId });
      return opts.contas ?? [];
    },
    async deleteAccount(accountId) {
      registra({ metodo: "deleteAccount", args: accountId });
    },
    async privateReply(i) {
      registra({ metodo: "privateReply", args: i });
    },
    async publicReply(i) {
      registra({ metodo: "publicReply", args: i });
    },
    async sendMessage(i) {
      registra({ metodo: "sendMessage", args: i });
    },
  };
  return { transport, chamadas };
}
```

```ts
// apps/web/src/lib/ig/segredos.ts
import "server-only";

import { resolveSecret } from "@/lib/runtime-secrets";

/** Vazia = Zernio não configurada; o transporte recusa antes de sair pedido. */
export function zernioApiKey(): string {
  return process.env.ZERNIO_API_KEY?.trim() ?? "";
}

/** Assina o webhook da Zernio e o `state` da conexão. Em produção, obrigatória. */
export function zernioWebhookSecret(): string {
  return resolveSecret("ZERNIO_WEBHOOK_SECRET", process.env.ZERNIO_WEBHOOK_SECRET, process.env.NODE_ENV, "dev-zernio-webhook-secret");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/transport/erros.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/transport/fake.ts apps/web/src/lib/ig/transport/erros.ts apps/web/src/lib/ig/transport/erros.test.ts apps/web/src/lib/ig/segredos.ts
git commit -m "feat(ig): fake transport, secret readers and shop-facing Zernio error messages"
```

### Task 3: `state` assinado da conexão

**Files:**
- Create: `apps/web/src/lib/ig/connect/state.ts`
- Test: `apps/web/src/lib/ig/connect/state.test.ts`

**Interfaces:**
- Produces: `emitirEstado(tenantId, profileId, segredo, agora?) → string`; `lerEstado(token, segredo, agora?) → Estado | null`; `type Estado = { tenantId; profileId; exp; nonce }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ig/connect/state.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { emitirEstado, lerEstado } from "./state";

const SEG = "segredo-de-teste";

test("o estado volta inteiro dentro de 10 minutos e morre depois", () => {
  const t0 = Date.parse("2026-10-06T12:00:00Z");
  const token = emitirEstado("loja-a", "perfil-1", SEG, t0);
  const lido = lerEstado(token, SEG, t0 + 9 * 60_000);
  assert.equal(lido?.tenantId, "loja-a");
  assert.equal(lido?.profileId, "perfil-1");
  assert.equal(lerEstado(token, SEG, t0 + 11 * 60_000), null);
});

test("assinatura errada, segredo diferente, token torto ou vazio não passam", () => {
  const t0 = Date.now();
  const token = emitirEstado("loja-a", "perfil-1", SEG, t0);
  const [corpo, sig] = token.split(".");
  assert.equal(lerEstado(`${corpo}.${sig.slice(0, -2)}xx`, SEG, t0), null);
  assert.equal(lerEstado(token, "outro", t0), null);
  assert.equal(lerEstado(corpo, SEG, t0), null);
  assert.equal(lerEstado(null, SEG, t0), null);
  assert.equal(lerEstado(token, "", t0), null);
});

test("corpo trocado por outro tenant com a mesma assinatura é recusado", () => {
  const t0 = Date.now();
  const sig = emitirEstado("loja-a", "p", SEG, t0).split(".")[1];
  const corpoFalso = Buffer.from(JSON.stringify({ tenantId: "loja-b", profileId: "p", exp: t0 + 60_000, nonce: "n" })).toString("base64url");
  assert.equal(lerEstado(`${corpoFalso}.${sig}`, SEG, t0), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/connect/state.test.ts`
Expected: FAIL (módulo `./state` não existe).

- [ ] **Step 3: Write the module**

```ts
// apps/web/src/lib/ig/connect/state.ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * O `state` que vai na `redirect_url` da Zernio e volta no callback. Assinado
 * com HMAC e separado por domínio (mesmo molde de pages/render-context-core),
 * vale 10 minutos e carrega a loja e o perfil: o callback confere a loja da
 * sessão contra ele e NUNCA confia nos ids que a Zernio põe na query.
 */
const DOMINIO = "ig-connect-state";
const VALIDADE_MS = 10 * 60_000;

export type Estado = { tenantId: string; profileId: string; exp: number; nonce: string };

function assina(corpo: string, segredo: string): Buffer {
  return createHmac("sha256", segredo).update(DOMINIO).update(".").update(corpo).digest();
}

export function emitirEstado(tenantId: string, profileId: string, segredo: string, agora = Date.now()): string {
  if (!segredo) throw new Error("Segredo do estado ausente.");
  const estado: Estado = { tenantId, profileId, exp: agora + VALIDADE_MS, nonce: randomBytes(8).toString("hex") };
  const corpo = Buffer.from(JSON.stringify(estado)).toString("base64url");
  return `${corpo}.${assina(corpo, segredo).toString("base64url")}`;
}

export function lerEstado(token: string | null, segredo: string, agora = Date.now()): Estado | null {
  if (!token || !segredo) return null;
  const [corpo, sig, sobra] = token.split(".");
  if (!corpo || !sig || sobra !== undefined) return null;
  const esperada = assina(corpo, segredo);
  const recebida = Buffer.from(sig, "base64url");
  if (recebida.length !== esperada.length || !timingSafeEqual(recebida, esperada)) return null;
  try {
    const e = JSON.parse(Buffer.from(corpo, "base64url").toString("utf8")) as Partial<Estado>;
    if (typeof e.tenantId !== "string" || typeof e.profileId !== "string" || typeof e.exp !== "number" || typeof e.nonce !== "string") return null;
    if (e.exp < agora) return null;
    return { tenantId: e.tenantId, profileId: e.profileId, exp: e.exp, nonce: e.nonce };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/connect/state.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/connect/state.ts apps/web/src/lib/ig/connect/state.test.ts
git commit -m "feat(ig): signed connect state (HMAC, 10 min, tenant and profile)"
```

### Task 4: store `ig-accounts` (upsert, busca pelo id da Zernio, status) e `pauseLiveFlows`

**Files:**
- Modify: `apps/web/src/lib/stores/ig-accounts.ts` (arquivo inteiro abaixo)
- Modify: `apps/web/src/lib/stores/ig-flows.ts` (acrescenta `pauseLiveFlows` no fim)
- Test: `apps/web/src/lib/stores/ig-accounts.test.ts`

**Interfaces:**
- Produces: `AccountStatus`, `IgAccount` (ganha `provider_profile_id`), `IgAccountComLoja`, `upsertAccount(tenantId, { providerAccountId, providerProfileId, username }) → IgAccount | null`, `getAccountByProviderId(providerAccountId) → IgAccountComLoja | null`, `setAccountStatus(tenantId, status, lastError) → void`, `pauseLiveFlows(tenantId) → void`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/stores/ig-accounts.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { getAccountByProviderId, setAccountStatus, upsertAccount } from "./ig-accounts";
import { pauseLiveFlows } from "./ig-flows";

type Pedido = { metodo: string; url: URL; prefer: string; corpo: unknown };
const pedidos: Pedido[] = [];
let proxima: { status: number; body: unknown } | null = null;

const linha = { id: "a1", tenant_id: "loja-a", username: "vireimoda", status: "active", provider: "zernio", provider_account_id: "z1", provider_profile_id: "p1", connected_at: "2026-10-06T00:00:00Z" };

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, prefer: String(req.headers.prefer ?? ""), corpo: bruto ? JSON.parse(bruto) : null });
    res.setHeader("Content-Type", "application/json");
    if (proxima) { res.statusCode = proxima.status; res.end(JSON.stringify(proxima.body)); proxima = null; return; }
    const objeto = String(req.headers.accept ?? "").includes("pgrst.object");
    res.end(JSON.stringify(objeto ? linha : [linha]));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select"));

test("conectar grava uma conta por loja, sem token, com o id da Zernio no ig_user_id", async () => {
  pedidos.length = 0;
  const conta = await upsertAccount("loja-a", { providerAccountId: "z1", providerProfileId: "p1", username: "vireimoda" });
  assert.equal(conta?.id, "a1");
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/ig_accounts"]);
  assert.equal(pedidos[0].url.searchParams.get("on_conflict"), "tenant_id");
  assert.match(pedidos[0].prefer, /resolution=merge-duplicates/);
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.equal(corpo.tenant_id, "loja-a");
  assert.equal(corpo.provider_account_id, "z1");
  assert.equal(corpo.ig_user_id, "zernio:z1");
  assert.equal(corpo.status, "active");
  assert.ok(!("access_token_enc" in corpo));
  assert.ok(!pedidos[0].url.searchParams.get("select")?.includes("access_token_enc"));
});

test("a mesma conta da Zernio em outra loja (23505) volta null em vez de estourar", async () => {
  pedidos.length = 0;
  proxima = { status: 409, body: { code: "23505", message: "duplicate key value violates unique constraint", details: null, hint: null } };
  assert.equal(await upsertAccount("loja-b", { providerAccountId: "z1", providerProfileId: "p2", username: "vireimoda" }), null);
});

test("o webhook acha a loja pelo id da conta na Zernio (única leitura sem tenant)", async () => {
  pedidos.length = 0;
  const conta = await getAccountByProviderId("z1");
  assert.equal(conta?.tenant_id, "loja-a");
  assert.deepEqual(filtros(pedidos[0].url), { provider_account_id: "eq.z1" });
  assert.ok(pedidos[0].url.searchParams.get("select")?.includes("tenant_id"));
});

test("mudar o estado da conta e pausar os fluxos no ar filtram a loja", async () => {
  pedidos.length = 0;
  await setAccountStatus("loja-a", "disconnected", null);
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a" });
  assert.deepEqual(Object.keys(pedidos[0].corpo as object).sort(), ["last_error", "status", "updated_at"]);
  await pauseLiveFlows("loja-a");
  assert.deepEqual([pedidos[1].metodo, pedidos[1].url.pathname], ["PATCH", "/rest/v1/ig_flows"]);
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", status: "eq.live" });
  assert.equal((pedidos[1].corpo as { status: string }).status, "paused");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/stores/ig-accounts.test.ts`
Expected: FAIL (`upsertAccount` não é exportado).

- [ ] **Step 3: Rewrite `ig-accounts.ts`**

```ts
// apps/web/src/lib/stores/ig-accounts.ts
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

export type AccountStatus = "active" | "expired" | "revoked" | "disconnected";

export type IgAccount = {
  id: string;
  username: string;
  status: AccountStatus;
  provider: "zernio" | "meta";
  provider_account_id: string | null;
  provider_profile_id: string | null;
  connected_at: string;
};
export type IgAccountComLoja = IgAccount & { tenant_id: string };

/** NUNCA seleciona `access_token_enc`. */
const COLS = "id, username, status, provider, provider_account_id, provider_profile_id, connected_at";

/** A conta do Instagram da loja. */
export async function getAccount(tenantId: string): Promise<IgAccount | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_accounts").select(COLS).eq("tenant_id", tenantId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as IgAccount | null) ?? null;
}

export type NovaConta = { providerAccountId: string; providerProfileId: string; username: string };

/**
 * Uma conta por loja (índice único em tenant_id): conectar de novo regrava a
 * linha. `null` = esta conta da Zernio já está em outra loja (índice único em
 * provider_account_id, ou em ig_user_id).
 */
export async function upsertAccount(tenantId: string, input: NovaConta): Promise<IgAccount | null> {
  const agora = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("ig_accounts")
    .upsert(
      {
        tenant_id: tenantId,
        provider: "zernio",
        provider_account_id: input.providerAccountId,
        provider_profile_id: input.providerProfileId,
        // A listagem da Zernio não expõe o id escopado do Instagram da loja; a
        // coluna é obrigatória e única, então leva o id da conta na Zernio.
        ig_user_id: `zernio:${input.providerAccountId}`,
        username: input.username,
        status: "active",
        last_error: null,
        webhook_subscribed: true,
        connected_at: agora,
        updated_at: agora,
      },
      { onConflict: "tenant_id" },
    )
    .select(COLS)
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  return data as unknown as IgAccount;
}

/**
 * Só o webhook usa: a Zernio manda o id da conta, não a loja. É a ÚNICA leitura
 * deste módulo sem `tenant_id`; o índice único em provider_account_id garante
 * no máximo uma linha, e quem chama trata `null` como "não é nosso" (202).
 */
export async function getAccountByProviderId(providerAccountId: string): Promise<IgAccountComLoja | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_accounts").select(`tenant_id, ${COLS}`).eq("provider_account_id", providerAccountId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as IgAccountComLoja | null) ?? null;
}

export async function setAccountStatus(tenantId: string, status: AccountStatus, lastError: string | null): Promise<void> {
  const { error } = await getSupabaseAdmin().from("ig_accounts").update({ status, last_error: lastError, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Append `pauseLiveFlows` to `ig-flows.ts`**

No fim de `apps/web/src/lib/stores/ig-flows.ts`:

```ts
/** Ao desconectar a conta: nada fica no ar sem conta. */
export async function pauseLiveFlows(tenantId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("ig_flows").update({ status: "paused", updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("status", "live");
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 5: Run the tests**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/stores/ig-accounts.test.ts src/lib/stores/ig-flows.test.ts`
Expected: PASS (os 4 novos e os da fase 1 continuam verdes; `getAccount` em `ig-flows.test.ts` não muda de contrato).

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/stores/ig-accounts.ts apps/web/src/lib/stores/ig-accounts.test.ts apps/web/src/lib/stores/ig-flows.ts
git commit -m "feat(ig): account store upsert, lookup by provider id, status, pause live flows"
```

### Task 5: rotas conectar, voltar e desconectar

**Files:**
- Create: `apps/web/src/app/api/ig/connect/route.ts`
- Create: `apps/web/src/app/api/ig/connect/callback/route.ts`
- Create: `apps/web/src/app/api/ig/account/route.ts`
- Modify: `apps/web/.env.example` (depois da linha `EVOLUTION_WEBHOOK_SECRET=`)

**Interfaces:**
- Consumes: `requireInstagram` (`@/lib/ig/access`), `assertPermission` (`@/lib/permissions`, ações `campaign:edit` e `campaign:delete`), `getAppUrl` (`@/lib/environment`), `createZernioTransport`, `ZernioError`, `mensagemParaLojista`, `zernioApiKey`, `zernioWebhookSecret`, `emitirEstado`/`lerEstado`, `getAccount`/`upsertAccount`/`setAccountStatus`, `pauseLiveFlows`.
- Produces: `POST /api/ig/connect → 200 { authUrl }`; `GET /api/ig/connect/callback?state=… → 303 /painel/instagram?conectado=1 | ?erro=estado|cancelado|conta|outra_loja|zernio`; `DELETE /api/ig/account → 204`.

Sem teste unitário de rota (o repositório não testa handlers); a cobertura é o transporte (Task 1), o estado (Task 3), a store (Task 4) e a prova em produção (Gate F).

- [ ] **Step 1: `POST /api/ig/connect`**

```ts
// apps/web/src/app/api/ig/connect/route.ts
import { getAppUrl } from "@/lib/environment";
import { requireInstagram } from "@/lib/ig/access";
import { emitirEstado } from "@/lib/ig/connect/state";
import { zernioApiKey, zernioWebhookSecret } from "@/lib/ig/segredos";
import { mensagemParaLojista } from "@/lib/ig/transport/erros";
import { ZernioError } from "@/lib/ig/transport/types";
import { createZernioTransport } from "@/lib/ig/transport/zernio";
import { assertPermission } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/ig/connect — devolve a URL da Zernio pra onde o navegador da loja vai.
// O perfil na Zernio leva o id da loja como nome (409 = já existe, reaproveita).
export async function POST(req: Request) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:edit");
    const zernio = createZernioTransport({ apiKey: zernioApiKey() });
    const profileId = await zernio.ensureProfile(ctx.tenantId);
    const estado = emitirEstado(ctx.tenantId, profileId, zernioWebhookSecret());
    const volta = `${getAppUrl()}/api/ig/connect/callback?state=${encodeURIComponent(estado)}`;
    const authUrl = await zernio.connectUrl(profileId, volta);
    return Response.json({ authUrl });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof ZernioError) return Response.json({ error: mensagemParaLojista(e) }, { status: e.status === 0 ? 503 : 502 });
    throw e;
  }
}
```

- [ ] **Step 2: `GET /api/ig/connect/callback`**

```ts
// apps/web/src/app/api/ig/connect/callback/route.ts
import { getAppUrl } from "@/lib/environment";
import { requireInstagram } from "@/lib/ig/access";
import { lerEstado } from "@/lib/ig/connect/state";
import { zernioApiKey, zernioWebhookSecret } from "@/lib/ig/segredos";
import { ZernioError } from "@/lib/ig/transport/types";
import { createZernioTransport } from "@/lib/ig/transport/zernio";
import { assertPermission } from "@/lib/permissions";
import { upsertAccount } from "@/lib/stores/ig-accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Erro = "estado" | "cancelado" | "conta" | "outra_loja" | "zernio";

// GET /api/ig/connect/callback — a volta da Zernio. Confere o `state` contra a
// loja da sessão e IGNORA os ids da query: pergunta à Zernio qual conta entrou
// no perfil. Sempre termina num 303 pra lista, com `conectado=1` ou `erro=`.
export async function GET(req: Request) {
  const query = new URL(req.url).searchParams;
  const lista = `${getAppUrl()}/painel/instagram`;
  const volta = (resultado: "conectado=1" | `erro=${Erro}`) => Response.redirect(`${lista}?${resultado}`, 303);
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:edit");
    const estado = lerEstado(query.get("state"), zernioWebhookSecret());
    if (!estado || estado.tenantId !== ctx.tenantId) return volta("erro=estado");
    if (query.get("error")) return volta(query.get("error") === "oauth_denied" ? "erro=cancelado" : "erro=zernio");

    const contas = await createZernioTransport({ apiKey: zernioApiKey() }).listAccounts(estado.profileId);
    const dica = query.get("accountId");
    // A query só dá a dica de qual; a lista do perfil é quem vale.
    const conta = contas.find((c) => c.id === dica) ?? (contas.length === 1 ? contas[0] : null);
    if (!conta) return volta("erro=conta");
    const gravada = await upsertAccount(ctx.tenantId, { providerAccountId: conta.id, providerProfileId: estado.profileId, username: conta.username });
    if (!gravada) return volta("erro=outra_loja");
    return volta("conectado=1");
  } catch (e) {
    if (e instanceof Response) return e.status === 401 ? Response.redirect(`${getAppUrl()}/login`, 303) : e;
    if (e instanceof ZernioError) return volta("erro=zernio");
    throw e;
  }
}
```

- [ ] **Step 3: `DELETE /api/ig/account`**

```ts
// apps/web/src/app/api/ig/account/route.ts
import { requireInstagram } from "@/lib/ig/access";
import { zernioApiKey } from "@/lib/ig/segredos";
import { mensagemParaLojista } from "@/lib/ig/transport/erros";
import { ZernioError } from "@/lib/ig/transport/types";
import { createZernioTransport } from "@/lib/ig/transport/zernio";
import { assertPermission } from "@/lib/permissions";
import { getAccount, setAccountStatus } from "@/lib/stores/ig-accounts";
import { pauseLiveFlows } from "@/lib/stores/ig-flows";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// DELETE /api/ig/account — apaga na Zernio, marca `disconnected` e pausa os fluxos no ar.
// Só dono e admin (mesma permissão de apagar campanha).
export async function DELETE(req: Request) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:delete");
    const conta = await getAccount(ctx.tenantId);
    if (!conta) return Response.json({ error: "Nenhuma conta conectada." }, { status: 404 });
    if (conta.provider_account_id) await createZernioTransport({ apiKey: zernioApiKey() }).deleteAccount(conta.provider_account_id);
    await setAccountStatus(ctx.tenantId, "disconnected", null);
    await pauseLiveFlows(ctx.tenantId);
    return new Response(null, { status: 204 });
  } catch (e) {
    if (e instanceof Response) return e;
    if (e instanceof ZernioError) return Response.json({ error: mensagemParaLojista(e) }, { status: e.status === 0 ? 503 : 502 });
    throw e;
  }
}
```

- [ ] **Step 4: `.env.example`**

Depois de `EVOLUTION_WEBHOOK_SECRET=gere-32-bytes-aleatorios`:

```
# Zernio (Fluxos do Instagram). Server-only: NUNCA prefixar com NEXT_PUBLIC_.
ZERNIO_API_KEY=cole-a-chave-da-zernio
ZERNIO_WEBHOOK_SECRET=gere-32-bytes-aleatorios
```

- [ ] **Step 5: Type-check and lint**

Run: `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json` e `npm --workspace apps/web run lint`
Expected: limpos.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/app/api/ig/connect/route.ts apps/web/src/app/api/ig/connect/callback/route.ts apps/web/src/app/api/ig/account/route.ts apps/web/.env.example
git commit -m "feat(ig): connect, callback and disconnect routes via Zernio"
```

### Task 6: a conta na lista (conectar e desconectar)

**Files:**
- Create: `apps/web/src/components/painel/instagram/conta.tsx`
- Modify: `apps/web/src/components/painel/instagram/lista.tsx` (cabeçalho)
- Modify: `apps/web/e2e/painel-instagram.spec.ts` (um teste a mais)

**Interfaces:**
- Consumes: `useCasca().instagram` (`StatusInstagram`), `useCasca().recarregarInstagram`, `useToast`, `useConfirmacao` (`@/components/painel/confirmacao`), `useRouter`/`useSearchParams` (`next/navigation`).
- Produces: `<ContaDoInstagram />` (sem props; lê a casca).

- [ ] **Step 1: Write the component**

```tsx
// apps/web/src/components/painel/instagram/conta.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useCasca } from "@/components/painel/casca-context";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useToast } from "@/components/toast";

const ERROS: Record<string, string> = {
  estado: "A conexão demorou demais. Tente de novo.",
  cancelado: "Você cancelou a conexão.",
  conta: "Não achei a conta do Instagram que você autorizou. Tente de novo.",
  outra_loja: "Esta conta do Instagram já está conectada em outra loja.",
  zernio: "A Zernio não respondeu. Tente de novo.",
};

function textoDaConta(account: { username: string; status: string } | null): string {
  if (!account) return "Nenhuma conta do Instagram conectada ainda.";
  if (account.status === "active") return `@${account.username} conectada.`;
  if (account.status === "disconnected") return `@${account.username} foi desconectada.`;
  return `A conexão com @${account.username} caiu. Conecte de novo.`;
}

/** Estado da conta e os botões "Conectar Instagram" / "Desconectar". Lê `conectado`/`erro` da volta do callback uma vez e limpa a URL. */
export function ContaDoInstagram() {
  const { instagram, recarregarInstagram } = useCasca();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const [ocupado, setOcupado] = useState(false);

  const conectado = params.get("conectado");
  const erro = params.get("erro");
  useEffect(() => {
    if (!conectado && !erro) return;
    if (conectado) toast("Instagram conectado.", "success");
    if (erro) toast(ERROS[erro] ?? ERROS.zernio, "error");
    recarregarInstagram();
    router.replace("/painel/instagram");
  }, [conectado, erro, toast, recarregarInstagram, router]);

  if (!instagram) return null;
  const ativa = instagram.account?.status === "active";

  const conectar = async () => {
    setOcupado(true);
    try {
      const r = await fetch("/api/ig/connect", { method: "POST" });
      const corpo = (await r.json().catch(() => null)) as { authUrl?: string; error?: string } | null;
      if (!r.ok || !corpo?.authUrl) {
        toast(corpo?.error ?? "Não deu pra começar a conexão. Tente de novo.", "error");
        return;
      }
      window.location.assign(corpo.authUrl);
    } catch {
      toast("Sem conexão. Tente de novo.", "error");
    } finally {
      setOcupado(false);
    }
  };

  const desconectar = async () => {
    const ok = await pedirConfirmacao({ titulo: "Desconectar o Instagram?", texto: "Os fluxos no ar ficam pausados até você conectar de novo.", rotulo: "Desconectar", destrutivo: true });
    if (!ok) return;
    setOcupado(true);
    try {
      const r = await fetch("/api/ig/account", { method: "DELETE" });
      if (!r.ok) {
        const corpo = (await r.json().catch(() => null)) as { error?: string } | null;
        toast(corpo?.error ?? "Não deu pra desconectar. Tente de novo.", "error");
        return;
      }
      toast("Instagram desconectado.", "success");
      recarregarInstagram();
    } catch {
      toast("Sem conexão. Tente de novo.", "error");
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-13 text-slate-600">{textoDaConta(instagram.account)}</p>
      {ativa ? (
        <button type="button" onClick={() => void desconectar()} disabled={ocupado} className="h-8 rounded-[var(--radius-control)] border border-line-200 px-2.5 text-13 text-slate-600 hover:text-volt-950 disabled:opacity-50">
          Desconectar
        </button>
      ) : (
        <button type="button" onClick={() => void conectar()} disabled={ocupado} className="h-8 rounded-[var(--radius-control)] bg-cobalt-500 px-2.5 text-13 font-medium text-canvas-100 disabled:opacity-50">
          Conectar Instagram
        </button>
      )}
      {folhaDeConfirmacao}
    </div>
  );
}
```

- [ ] **Step 2: Use it in the list header**

Em `lista.tsx`, importe `import { ContaDoInstagram } from "./conta";` e troque o parágrafo da conta:

```tsx
          <p className="mt-1 text-13 text-slate-600">Fluxos que respondem comentário e direct com o convite do grupo.</p>
          <div className="mt-2"><ContaDoInstagram /></div>
```

(remova o `<p>` que mostrava `@username` / "Nenhuma conta do Instagram conectada ainda.").

- [ ] **Step 3: e2e**

Em `apps/web/e2e/painel-instagram.spec.ts`, dentro do `describe`, depois do teste existente:

```ts
  test("a lista mostra o estado da conta e o botão de conectar ou desconectar", async ({ page }) => {
    const status = await page.request.get("/api/ig/status");
    const liberado = status.ok() && ((await status.json()) as { enabled?: boolean }).enabled === true;
    test.skip(!liberado, "A loja de QA nao tem instagram_enabled; libere em tenant_settings para rodar.");
    await page.goto("/painel/instagram", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("button", { name: /^(Conectar Instagram|Desconectar)$/ })).toBeVisible();
    await semErroDeRuntime(page);
  });
```

- [ ] **Step 4: Gate local**

Run: os sete comandos do gate. `painel:check` conta `bg-acid`: este arquivo não usa.
Expected: tudo verde.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/painel/instagram/conta.tsx apps/web/src/components/painel/instagram/lista.tsx apps/web/e2e/painel-instagram.spec.ts
git commit -m "feat(ig): connect and disconnect the Instagram account from the flows list"
```

### Gate F e Entrega

- [ ] `pwsh -File infra/scripts/verify-local.ps1` verde.
- [ ] `git push -u origin feat/ig-connect` e abra o PR com o corpo:

```
PR F da fase 2 dos Fluxos do Instagram (docs/superpowers/plans/2026-10-06-instagram-fluxos-fase2.md, Tasks 1–6).

- Transporte da Zernio (`lib/ig/transport`): cliente com `Idempotency-Key`, erro tipado, transporte falso dos testes.
- Conexão da conta: `POST /api/ig/connect` (perfil por loja + `authUrl`), `GET /api/ig/connect/callback` (`state` assinado, conta confirmada pela API), `DELETE /api/ig/account` (apaga na Zernio, pausa os fluxos no ar).
- Lista: estado da conta, "Conectar Instagram" / "Desconectar".
- Variáveis novas: `ZERNIO_API_KEY`, `ZERNIO_WEBHOOK_SECRET` (`.env.example`). Em produção precisam estar na Vercel antes do merge.

Sem migração.
```

- [ ] **Prova em produção (antes de mergear o PR G):** com as variáveis na Vercel e o deploy do PR F no ar, entrar na VIREI MODA, clicar "Conectar Instagram", autorizar a `@vireimoda`, voltar com "Instagram conectado." e `@vireimoda conectada.` na lista. Conferir no banco de prod: `select username, status, provider_account_id, provider_profile_id from public.ig_accounts where tenant_id = '47c280cb-702a-445d-997e-8eea2f8fd173'`. Depois, na Zernio (dashboard), apagar a conta do perfil criado à mão em 02/10 (perfil `6abfcc339f096a6fa70a61f1`), pra ficar dentro das 2 contas grátis.
- [ ] Quadro: `select public.move_card('ig-oauth-conexao', 'no_ar_verificado', 'Conectou a @vireimoda pelo painel via Zernio.', '<data/hora + linha do ig_accounts>');`
- [ ] Mergear (`gh pr merge <N> --squash --delete-branch`) e só então abrir a branch do PR G a partir de `origin/main`.

---

## PR G — webhook: assinatura, eventos, escolha do fluxo e store de runs

Branch: `feat/ig-webhook-base`. Entrega: tudo que a rota do webhook (PR H) precisa, testado sem rede e sem banco: assinatura em tempo constante, os quatro eventos em zod, qual fluxo atende um evento, e a store de runs e passos. A rota em si entra com o motor (PR H), pra não existir endpoint no ar que recebe e descarta.

### Task 7: assinatura do webhook

**Files:**
- Create: `apps/web/src/lib/ig/transport/signature.ts`
- Test: `apps/web/src/lib/ig/transport/signature.test.ts`

**Interfaces:**
- Produces: `assinaturaConfere(corpoCru: string, recebida: string | null, segredo: string): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ig/transport/signature.test.ts
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { assinaturaConfere } from "./signature";

const SEG = "segredo";
const corpo = '{"id":"evt","event":"comment.received"}';
const boa = createHmac("sha256", SEG).update(corpo).digest("hex");

test("hex minúsculo, maiúsculo ou com espaço em volta: confere", () => {
  assert.equal(assinaturaConfere(corpo, boa, SEG), true);
  assert.equal(assinaturaConfere(corpo, boa.toUpperCase(), SEG), true);
  assert.equal(assinaturaConfere(corpo, ` ${boa} `, SEG), true);
});

test("corpo alterado, segredo errado, assinatura curta, não-hex ou ausente: não confere", () => {
  assert.equal(assinaturaConfere(`${corpo} `, boa, SEG), false);
  assert.equal(assinaturaConfere(corpo, boa, "outro"), false);
  assert.equal(assinaturaConfere(corpo, boa.slice(0, 60), SEG), false);
  assert.equal(assinaturaConfere(corpo, "zz".repeat(32), SEG), false);
  assert.equal(assinaturaConfere(corpo, null, SEG), false);
  assert.equal(assinaturaConfere(corpo, boa, ""), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/transport/signature.test.ts`
Expected: FAIL (módulo `./signature` não existe).

- [ ] **Step 3: Write the module**

```ts
// apps/web/src/lib/ig/transport/signature.ts
import { createHmac, timingSafeEqual } from "node:crypto";

const HEX_64 = /^[0-9a-f]{64}$/;

/** `X-Zernio-Signature` = HMAC-SHA256 do corpo cru em hex. Comparação em tempo constante. */
export function assinaturaConfere(corpoCru: string, recebida: string | null, segredo: string): boolean {
  if (!recebida || !segredo) return false;
  const hex = recebida.trim().toLowerCase();
  if (!HEX_64.test(hex)) return false;
  const esperada = createHmac("sha256", segredo).update(corpoCru).digest();
  const dada = Buffer.from(hex, "hex");
  return dada.length === esperada.length && timingSafeEqual(dada, esperada);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/transport/signature.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/transport/signature.ts apps/web/src/lib/ig/transport/signature.test.ts
git commit -m "feat(ig): constant-time Zernio webhook signature check"
```

### Task 8: os quatro eventos em zod

**Files:**
- Create: `apps/web/src/lib/ig/webhook/events.ts`
- Test: `apps/web/src/lib/ig/webhook/events.test.ts`

**Interfaces:**
- Produces: `lerEvento(json: unknown) → EventoZernio | null`; tipos `EventoZernio`, `ComentarioRecebido`, `MensagemRecebida`, `ContaConectada`, `ContaDesconectada`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ig/webhook/events.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { lerEvento } from "./events";

// Recortes dos eventos reais da prova de 02/10 na @vireimoda (campos extras de propósito).
const comentario = {
  id: "ada1a966-631d-49e2-8bd6-e72cba676476",
  event: "comment.received",
  comment: { id: "17946648792299352", postId: null, platformPostId: "17950540902266561", platform: "instagram", text: "Quero sem seguir", author: { id: "1808886413685415", username: "igortoled0", isOwnAccount: false, instagramProfile: { isFollower: true } }, createdAt: "2026-10-02T16:38:42.760Z", isReply: false, parentCommentId: null },
  post: { id: null, platformPostId: "17950540902266561", content: "texto do post", imageUrl: "https://x", permalink: "https://www.instagram.com/p/x/" },
  account: { id: "6abfccbe4b107da7a1e5f1e4", accountId: "6abfccbe4b107da7a1e5f1e4", platform: "instagram", username: "vireimoda" },
  timestamp: "2026-10-02T16:38:43.000Z",
};
const mensagem = {
  id: "a244c193-1d39-4bf5-815b-c766250da841",
  event: "message.received",
  message: { id: "6abfde54a6ee6cba2e762b79", conversationId: "6abfcccc4ed84fcf2a07792f", platform: "instagram", platformMessageId: "aWdfZAG1f", direction: "incoming", text: "Quero", attachments: [], sender: { id: "1808886413685415", name: "Igor Toledo", username: "igortoled0" }, sentAt: "2026-10-02T16:39:47.118Z", isRead: false, sentVia: null },
  conversation: { id: "6abfcccc4ed84fcf2a07792f", platformConversationId: "1808886413685415", participantId: "1808886413685415", participantUsername: "igortoled0", status: "active" },
  account: { id: "6abfccbe4b107da7a1e5f1e4", platform: "instagram", username: "vireimoda", profileId: "6abfcc339f096a6fa70a61f1", accountId: "6abfccbe4b107da7a1e5f1e4" },
  metadata: { storyReply: { storyId: "18310828933304552", storyUrl: "https://lookaside" } },
  timestamp: "2026-10-02T16:39:47.500Z",
};

test("comentário e direct entram com só o que o motor usa", () => {
  const c = lerEvento(comentario);
  assert.equal(c?.event, "comment.received");
  if (c?.event !== "comment.received") return;
  assert.deepEqual(c.comment.author, { id: "1808886413685415", username: "igortoled0", isOwnAccount: false });
  assert.equal(c.account.accountId, "6abfccbe4b107da7a1e5f1e4");
  assert.equal("post" in c, false, "o post inteiro (texto, foto) não passa");

  const m = lerEvento(mensagem);
  assert.equal(m?.event, "message.received");
  if (m?.event !== "message.received") return;
  assert.equal(m.message.text, "Quero");
  assert.equal(m.conversation.id, "6abfcccc4ed84fcf2a07792f");
  assert.equal(m.metadata?.storyReply?.storyId, "18310828933304552");
});

test("eventos de conta entram; outro tipo, corpo torto ou campo obrigatório faltando viram null", () => {
  assert.equal(lerEvento({ id: "1", event: "account.connected", account: { accountId: "z1", profileId: "p", platform: "instagram", username: "u" }, timestamp: "t" })?.event, "account.connected");
  const d = lerEvento({ id: "1", event: "account.disconnected", account: { accountId: "z1", profileId: "p", platform: "instagram", username: "u", disconnectionType: "unintentional", reason: "token" }, timestamp: "t" });
  assert.equal(d?.event === "account.disconnected" ? d.account.reason : null, "token");
  assert.equal(lerEvento({ ...mensagem, event: "message.sent" }), null);
  assert.equal(lerEvento("texto"), null);
  assert.equal(lerEvento(null), null);
  assert.equal(lerEvento({ ...comentario, comment: { ...comentario.comment, id: "" } }), null);
  assert.equal(lerEvento({ ...mensagem, account: {} }), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/webhook/events.test.ts`
Expected: FAIL (módulo `./events` não existe).

- [ ] **Step 3: Write the module**

```ts
// apps/web/src/lib/ig/webhook/events.ts
import { z } from "zod";

/**
 * Só o que o motor lê. `z.object` descarta o resto (o contrato da Zernio
 * cresce sem aviso) e, por LGPD, nada do que fica aqui é o texto do post,
 * foto ou nome da pessoa: `text` do comentário/direct é lido para casar a
 * palavra e NUNCA gravado.
 */
const conta = z.object({ accountId: z.string().min(1) });

const comentarioRecebido = z.object({
  id: z.string().min(1),
  event: z.literal("comment.received"),
  comment: z.object({
    id: z.string().min(1),
    platformPostId: z.string().min(1),
    platform: z.string(),
    text: z.string().default(""),
    author: z.object({ id: z.string().min(1), username: z.string().optional(), isOwnAccount: z.boolean().optional() }),
    createdAt: z.string(),
    isReply: z.boolean().default(false),
  }),
  account: conta,
  timestamp: z.string(),
});

const mensagemRecebida = z.object({
  id: z.string().min(1),
  event: z.literal("message.received"),
  message: z.object({
    platformMessageId: z.string().min(1),
    platform: z.string(),
    direction: z.enum(["incoming", "outgoing"]),
    text: z.string().nullable().default(null),
    sender: z.object({ id: z.string().min(1), username: z.string().optional() }),
    sentAt: z.string(),
  }),
  conversation: z.object({ id: z.string().min(1), participantId: z.string().min(1) }),
  account: conta,
  metadata: z
    .object({
      storyReply: z.object({ storyId: z.string() }).optional(),
      quotedMessageId: z.string().optional(),
      postbackPayload: z.string().optional(),
    })
    .optional(),
  timestamp: z.string(),
});

const contaConectada = z.object({
  id: z.string().min(1),
  event: z.literal("account.connected"),
  account: z.object({ accountId: z.string().min(1), username: z.string().optional() }),
  timestamp: z.string(),
});

const contaDesconectada = z.object({
  id: z.string().min(1),
  event: z.literal("account.disconnected"),
  account: z.object({ accountId: z.string().min(1), disconnectionType: z.string().optional(), reason: z.string().optional() }),
  timestamp: z.string(),
});

const eventoZernio = z.discriminatedUnion("event", [comentarioRecebido, mensagemRecebida, contaConectada, contaDesconectada]);

export type EventoZernio = z.infer<typeof eventoZernio>;
export type ComentarioRecebido = z.infer<typeof comentarioRecebido>;
export type MensagemRecebida = z.infer<typeof mensagemRecebida>;
export type ContaConectada = z.infer<typeof contaConectada>;
export type ContaDesconectada = z.infer<typeof contaDesconectada>;

/** `null` = não é nosso (outro tipo de evento) ou fora do contrato: a rota responde 202 e esquece. */
export function lerEvento(json: unknown): EventoZernio | null {
  const r = eventoZernio.safeParse(json);
  return r.success ? r.data : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/webhook/events.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/webhook/events.ts apps/web/src/lib/ig/webhook/events.test.ts
git commit -m "feat(ig): zod schemas for the four Zernio webhook events"
```

### Task 9: qual fluxo no ar atende o evento

**Files:**
- Create: `apps/web/src/lib/ig/engine/select-flow.ts`
- Test: `apps/web/src/lib/ig/engine/select-flow.test.ts`

**Interfaces:**
- Consumes: `matchKeyword` (`@/lib/ig/match-keyword`), `FlowDef`, `TriggerNode` (`@/lib/ig/flow/types`).
- Produces: `escolherFluxo(fluxos: readonly FluxoNoAr[], origem: Origem) → Escolha | null`; `FluxoNoAr = { id; version; published: FlowDef | null }`; `Origem = { kind: "comment"; postId; text } | { kind: "dm"; text } | { kind: "story"; text }`; `Escolha = { flowId; version; def; trigger; keyword: string | null }`.

Decisão registrada aqui: **resposta a story dispara sem precisar da palavra** quando o gatilho tem `storyReplies` ligado (a receita "Pediu no direct" promete "ou responde um story"). Se a resposta casa uma palavra, ela é gravada; se não, `keyword` é `null`. Comentário e direct comum sempre exigem a palavra.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ig/engine/select-flow.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import type { FlowDef, TriggerNode } from "@/lib/ig/flow/types";
import { escolherFluxo, type FluxoNoAr } from "./select-flow";

const fluxo = (id: string, trigger: Partial<TriggerNode>): FluxoNoAr => ({
  id,
  version: 1,
  published: { v: 1, nodes: [{ id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false, ...trigger }], edges: [] },
});

test("comentário: post específico ganha de qualquer post; depois a palavra mais longa", () => {
  const qualquer = fluxo("q", { keywords: ["quero", "eu quero"] });
  const doPost = fluxo("p", { keywords: ["quero"], postId: "post-1" });
  assert.equal(escolherFluxo([qualquer, doPost], { kind: "comment", postId: "post-1", text: "EU QUERO!" })?.flowId, "p");
  assert.equal(escolherFluxo([doPost, qualquer], { kind: "comment", postId: "post-2", text: "eu quero" })?.flowId, "q");
  assert.equal(escolherFluxo([qualquer], { kind: "comment", postId: "post-2", text: "eu quero" })?.keyword, "eu quero");
  assert.equal(escolherFluxo([qualquer], { kind: "comment", postId: "post-2", text: "quero" })?.keyword, "quero");
  assert.equal(escolherFluxo([qualquer], { kind: "comment", postId: "post-2", text: "nada a ver" }), null);
});

test("direct só casa gatilho de direct; comentário só gatilho de comentário", () => {
  const deComentario = fluxo("c", { on: "comment" });
  const deDirect = fluxo("d", { on: "dm", keywords: ["quero", "grupo"] });
  assert.equal(escolherFluxo([deComentario, deDirect], { kind: "dm", text: "grupo" })?.flowId, "d");
  assert.equal(escolherFluxo([deDirect], { kind: "comment", postId: "x", text: "quero" }), null);
  assert.equal(escolherFluxo([deComentario], { kind: "dm", text: "quero" }), null);
});

test("story só com storyReplies; dispara sem palavra, e a palavra conta quando casa", () => {
  const semStory = fluxo("s0", { on: "dm", storyReplies: false });
  const comStory = fluxo("s1", { on: "dm", storyReplies: true, keywords: ["quero"] });
  assert.equal(escolherFluxo([semStory], { kind: "story", text: "lindo" }), null);
  const semPalavra = escolherFluxo([comStory], { kind: "story", text: "lindo" });
  assert.equal(semPalavra?.flowId, "s1");
  assert.equal(semPalavra?.keyword, null);
  assert.equal(escolherFluxo([comStory], { kind: "story", text: "quero" })?.keyword, "quero");
});

test("fluxo sem grafo publicado ou sem gatilho é ignorado; empate fica com o primeiro", () => {
  const vazio: FluxoNoAr = { id: "v", version: 1, published: null };
  const semGatilho: FluxoNoAr = { id: "g", version: 1, published: { v: 1, nodes: [], edges: [] } };
  const a = fluxo("a", {});
  const b = fluxo("b", {});
  assert.equal(escolherFluxo([vazio, semGatilho, a, b], { kind: "comment", postId: "x", text: "quero" })?.flowId, "a");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/select-flow.test.ts`
Expected: FAIL (módulo `./select-flow` não existe).

- [ ] **Step 3: Write the module**

```ts
// apps/web/src/lib/ig/engine/select-flow.ts
import type { FlowDef, TriggerNode } from "@/lib/ig/flow/types";
import { matchKeyword } from "@/lib/ig/match-keyword";

export type FluxoNoAr = { id: string; version: number; published: FlowDef | null };
export type Origem = { kind: "comment"; postId: string; text: string } | { kind: "dm"; text: string } | { kind: "story"; text: string };
export type Escolha = { flowId: string; version: number; def: FlowDef; trigger: TriggerNode; keyword: string | null };

function gatilhoDe(def: FlowDef): TriggerNode | null {
  const n = def.nodes.find((x) => x.type === "trigger");
  return n && n.type === "trigger" ? n : null;
}

/**
 * Post específico ganha de "qualquer post"; depois a palavra mais longa;
 * empate fica com o primeiro da lista. Comentário e direct exigem a palavra;
 * resposta a story dispara sem ela (gatilho com `storyReplies`).
 */
export function escolherFluxo(fluxos: readonly FluxoNoAr[], origem: Origem): Escolha | null {
  let melhor: { escolha: Escolha; especifico: boolean } | null = null;
  for (const f of fluxos) {
    if (!f.published) continue;
    const t = gatilhoDe(f.published);
    if (!t) continue;
    if (origem.kind === "comment") {
      if (t.on !== "comment") continue;
      if (t.postId && t.postId !== origem.postId) continue;
    } else {
      if (t.on !== "dm") continue;
      if (origem.kind === "story" && !t.storyReplies) continue;
    }
    const keyword = matchKeyword(origem.text, t.keywords);
    if (!keyword && origem.kind !== "story") continue;
    const especifico = origem.kind === "comment" && t.postId !== null;
    const candidato = { escolha: { flowId: f.id, version: f.version, def: f.published, trigger: t, keyword }, especifico };
    const ganha =
      !melhor ||
      (candidato.especifico && !melhor.especifico) ||
      (candidato.especifico === melhor.especifico && (keyword?.length ?? 0) > (melhor.escolha.keyword?.length ?? 0));
    if (ganha) melhor = candidato;
  }
  return melhor?.escolha ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/select-flow.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/engine/select-flow.ts apps/web/src/lib/ig/engine/select-flow.test.ts
git commit -m "feat(ig): choose the live flow for a comment, direct or story reply"
```

### Task 10: store `ig-runs` (runs e passos)

**Files:**
- Create: `apps/web/src/lib/stores/ig-runs.ts`
- Test: `apps/web/src/lib/stores/ig-runs.test.ts`

**Interfaces:**
- Produces: `RunStatus`, `SourceKind`, `RunRow`, `NovoRun`, `RunPatch`; `createRun(tenantId, NovoRun) → RunRow | null`; `getRunBySourceId(tenantId, sourceId) → RunRow | null`; `updateRun(tenantId, id, RunPatch) → void`; `recordStep(tenantId, { flowId, runId, nodeId, out }) → void`; `countRunsStartedSince(tenantId, igAccountId, sinceIso) → number`; `hasRecentRun(tenantId, flowId, igUserId, sinceIso) → boolean`; `stopActiveRuns(tenantId, flowId?) → void`; `listRuns(tenantId, flowId, limit?) → RunRow[]`; `purgeOldRuns(tenantId, cutoffIso) → void`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/stores/ig-runs.test.ts
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { countRunsStartedSince, createRun, getRunBySourceId, hasRecentRun, listRuns, purgeOldRuns, recordStep, stopActiveRuns, updateRun } from "./ig-runs";

type Pedido = { metodo: string; url: URL; prefer: string; corpo: unknown };
const pedidos: Pedido[] = [];
let proxima: { status: number; body: unknown } | null = null;

const linha = { id: "r1", tenant_id: "loja-a", ig_account_id: "a1", flow_id: "f1", flow_version: 2, source_kind: "comment", source_id: "c1", ig_user_id: "u1", username: "igortoled0", matched_keyword: "quero", ref: "abcdefghijkl", status: "queued", node_id: null, waiting: null, wake_at: null, window_expires_at: "2026-10-13T00:00:00Z", clicked_at: null, error_code: null, error_message: null, started_at: "2026-10-06T00:00:00Z", updated_at: "2026-10-06T00:00:00Z", finished_at: null };

const postgrest = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://postgrest.falso");
  let bruto = "";
  req.on("data", (parte: Buffer) => { bruto += parte.toString("utf8"); });
  req.on("end", () => {
    pedidos.push({ metodo: req.method ?? "", url, prefer: String(req.headers.prefer ?? ""), corpo: bruto ? JSON.parse(bruto) : null });
    res.setHeader("Content-Type", "application/json");
    if (proxima) { res.statusCode = proxima.status; res.end(JSON.stringify(proxima.body)); proxima = null; return; }
    if (req.method === "HEAD") { res.setHeader("Content-Range", "0-0/3"); res.end(); return; }
    const objeto = String(req.headers.accept ?? "").includes("pgrst.object");
    res.end(JSON.stringify(objeto ? linha : [linha]));
  });
});

before(async () => {
  await new Promise<void>((pronto) => postgrest.listen(0, "127.0.0.1", pronto));
  const { port } = postgrest.address() as AddressInfo;
  process.env.SUPABASE_URL = `http://127.0.0.1:${port}`;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-do-postgrest-falso";
});
after(() => { postgrest.close(); });

const filtros = (url: URL) => Object.fromEntries([...url.searchParams].filter(([k]) => k !== "select"));
const novo = { igAccountId: "a1", flowId: "f1", flowVersion: 2, sourceKind: "comment" as const, sourceId: "c1", igUserId: "u1", username: "igortoled0", matchedKeyword: "quero", ref: "abcdefghijkl", windowExpiresAt: "2026-10-13T00:00:00Z" };

test("criar o run grava a loja e nasce na fila; reenvio (23505) volta null", async () => {
  pedidos.length = 0;
  const run = await createRun("loja-a", novo);
  assert.equal(run?.id, "r1");
  assert.deepEqual([pedidos[0].metodo, pedidos[0].url.pathname], ["POST", "/rest/v1/ig_runs"]);
  const corpo = pedidos[0].corpo as Record<string, unknown>;
  assert.equal(corpo.tenant_id, "loja-a");
  assert.equal(corpo.source_id, "c1");
  assert.equal(corpo.status, "queued");
  assert.equal(corpo.matched_keyword, "quero");
  proxima = { status: 409, body: { code: "23505", message: "duplicate key", details: null, hint: null } };
  assert.equal(await createRun("loja-a", novo), null);
});

test("ler por source_id, atualizar e gravar passo filtram a loja", async () => {
  pedidos.length = 0;
  await getRunBySourceId("loja-a", "c1");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", source_id: "eq.c1" });
  await updateRun("loja-a", "r1", { status: "done", node_id: "convite", finished_at: "2026-10-06T00:00:05Z" });
  assert.equal(pedidos[1].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", id: "eq.r1" });
  assert.deepEqual(Object.keys(pedidos[1].corpo as object).sort(), ["finished_at", "node_id", "status", "updated_at"]);
  await recordStep("loja-a", { flowId: "f1", runId: "r1", nodeId: "gatilho", out: "next" });
  assert.deepEqual([pedidos[2].metodo, pedidos[2].url.pathname], ["POST", "/rest/v1/ig_run_steps"]);
  assert.deepEqual(pedidos[2].corpo, { tenant_id: "loja-a", flow_id: "f1", run_id: "r1", node_id: "gatilho", out: "next" });
});

test("teto por conta conta com HEAD; entrada recente por pessoa e fluxo", async () => {
  pedidos.length = 0;
  assert.equal(await countRunsStartedSince("loja-a", "a1", "2026-10-06T00:00:00Z"), 3);
  assert.equal(pedidos[0].metodo, "HEAD");
  assert.match(pedidos[0].prefer, /count=exact/);
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", ig_account_id: "eq.a1", started_at: "gte.2026-10-06T00:00:00Z" });
  assert.equal(await hasRecentRun("loja-a", "f1", "u1", "2026-10-05T00:00:00Z"), true);
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", flow_id: "eq.f1", ig_user_id: "eq.u1", started_at: "gte.2026-10-05T00:00:00Z", limit: "1" });
});

test("parar runs ativos, listar do fluxo e apagar os velhos filtram a loja", async () => {
  pedidos.length = 0;
  await stopActiveRuns("loja-a", "f1");
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", status: "in.(queued,active)", flow_id: "eq.f1" });
  assert.equal((pedidos[0].corpo as { status: string }).status, "stopped");
  await stopActiveRuns("loja-a");
  assert.deepEqual(filtros(pedidos[1].url), { tenant_id: "eq.loja-a", status: "in.(queued,active)" });
  const lista = await listRuns("loja-a", "f1");
  assert.equal(lista.length, 1);
  assert.deepEqual(filtros(pedidos[2].url), { tenant_id: "eq.loja-a", flow_id: "eq.f1", order: "started_at.desc", limit: "50" });
  await purgeOldRuns("loja-a", "2026-07-08T00:00:00Z");
  assert.equal(pedidos[3].metodo, "DELETE");
  assert.deepEqual(filtros(pedidos[3].url), { tenant_id: "eq.loja-a", started_at: "lt.2026-07-08T00:00:00Z" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/stores/ig-runs.test.ts`
Expected: FAIL (módulo `./ig-runs` não existe).

- [ ] **Step 3: Write the store**

```ts
// apps/web/src/lib/stores/ig-runs.ts
import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/server";

export type RunStatus = "queued" | "active" | "done" | "stopped" | "failed";
export type SourceKind = "comment" | "dm" | "story";

export type RunRow = {
  id: string;
  tenant_id: string;
  ig_account_id: string | null;
  flow_id: string;
  flow_version: number;
  source_kind: SourceKind;
  source_id: string;
  ig_user_id: string;
  username: string | null;
  matched_keyword: string | null;
  ref: string;
  status: RunStatus;
  node_id: string | null;
  waiting: "reply" | "click" | null;
  wake_at: string | null;
  window_expires_at: string | null;
  clicked_at: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
};

const COLS =
  "id, tenant_id, ig_account_id, flow_id, flow_version, source_kind, source_id, ig_user_id, username, matched_keyword, ref, status, node_id, waiting, wake_at, window_expires_at, clicked_at, error_code, error_message, started_at, updated_at, finished_at";

export type NovoRun = {
  igAccountId: string;
  flowId: string;
  flowVersion: number;
  sourceKind: SourceKind;
  sourceId: string;
  igUserId: string;
  username: string | null;
  matchedKeyword: string | null;
  ref: string;
  windowExpiresAt: string;
};

export type RunPatch = Partial<Pick<RunRow, "status" | "node_id" | "waiting" | "wake_at" | "error_code" | "error_message" | "finished_at">>;

/** `null` = já existe run com este `source_id` (reenvio da Zernio): o índice único é a idempotência. */
export async function createRun(tenantId: string, input: NovoRun): Promise<RunRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_runs")
    .insert({
      tenant_id: tenantId,
      ig_account_id: input.igAccountId,
      flow_id: input.flowId,
      flow_version: input.flowVersion,
      source_kind: input.sourceKind,
      source_id: input.sourceId,
      ig_user_id: input.igUserId,
      username: input.username,
      matched_keyword: input.matchedKeyword,
      ref: input.ref,
      status: "queued",
      window_expires_at: input.windowExpiresAt,
    })
    .select(COLS)
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(error.message);
  }
  return data as unknown as RunRow;
}

export async function getRunBySourceId(tenantId: string, sourceId: string): Promise<RunRow | null> {
  const { data, error } = await getSupabaseAdmin().from("ig_runs").select(COLS).eq("tenant_id", tenantId).eq("source_id", sourceId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as RunRow | null) ?? null;
}

export async function updateRun(tenantId: string, id: string, patch: RunPatch): Promise<void> {
  const { error } = await getSupabaseAdmin().from("ig_runs").update({ ...patch, updated_at: new Date().toISOString() }).eq("tenant_id", tenantId).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Uma linha por transição: é de onde saem os números (fase 3). */
export async function recordStep(tenantId: string, input: { flowId: string; runId: string; nodeId: string; out: string }): Promise<void> {
  const { error } = await getSupabaseAdmin().from("ig_run_steps").insert({ tenant_id: tenantId, flow_id: input.flowId, run_id: input.runId, node_id: input.nodeId, out: input.out });
  if (error) throw new Error(error.message);
}

/** Teto por conta (a Meta permite 750 respostas privadas por hora). */
export async function countRunsStartedSince(tenantId: string, igAccountId: string, sinceIso: string): Promise<number> {
  const { count, error } = await getSupabaseAdmin().from("ig_runs").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId).eq("ig_account_id", igAccountId).gte("started_at", sinceIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Uma entrada por pessoa por fluxo a cada 24 h. */
export async function hasRecentRun(tenantId: string, flowId: string, igUserId: string, sinceIso: string): Promise<boolean> {
  const { data, error } = await getSupabaseAdmin().from("ig_runs").select("id").eq("tenant_id", tenantId).eq("flow_id", flowId).eq("ig_user_id", igUserId).gte("started_at", sinceIso).limit(1);
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

/** Fluxo pausado ou conta desconectada: o que estava andando para. */
export async function stopActiveRuns(tenantId: string, flowId?: string): Promise<void> {
  const agora = new Date().toISOString();
  let q = getSupabaseAdmin().from("ig_runs").update({ status: "stopped", finished_at: agora, updated_at: agora }).eq("tenant_id", tenantId).in("status", ["queued", "active"]);
  if (flowId) q = q.eq("flow_id", flowId);
  const { error } = await q;
  if (error) throw new Error(error.message);
}

export async function listRuns(tenantId: string, flowId: string, limit = 50): Promise<RunRow[]> {
  const { data, error } = await getSupabaseAdmin().from("ig_runs").select(COLS).eq("tenant_id", tenantId).eq("flow_id", flowId).order("started_at", { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RunRow[];
}

/** Retenção de 90 dias (LGPD). Os passos somem em cascata. */
export async function purgeOldRuns(tenantId: string, cutoffIso: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("ig_runs").delete().eq("tenant_id", tenantId).lt("started_at", cutoffIso);
  if (error) throw new Error(error.message);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/stores/ig-runs.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/ig-runs.ts apps/web/src/lib/stores/ig-runs.test.ts
git commit -m "feat(ig): runs and steps store with idempotent create and tenant filters"
```

### Task 11: a rota do webhook na política de acesso e no teto por IP

**Files:**
- Modify: `apps/web/src/lib/security/request-access-policy.ts:39`
- Modify: `apps/web/src/lib/security/request-access-policy.test.ts` (um teste a mais)
- Modify: `apps/web/src/middleware.ts:28`

- [ ] **Step 1: Write the failing test**

Em `request-access-policy.test.ts`, depois do teste "the Evolution webhook is session-less and rate limited":

```ts
test("the Zernio webhook is session-less, POST only, exact path only", () => {
  assert.equal(classifyRequest("/api/ig/webhook", "POST"), "webhook");
  assert.equal(classifyRequest("/api/ig/webhook", "GET"), "user");
  assert.equal(classifyRequest("/api/ig/webhook/replay", "POST"), "user");
  // O resto de /api/ig continua exigindo sessão.
  assert.equal(classifyRequest("/api/ig/flows", "POST"), "user");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/security/request-access-policy.test.ts`
Expected: FAIL (`/api/ig/webhook` POST classificado como `user`).

- [ ] **Step 3: Register the route**

`request-access-policy.ts`:

```ts
const PROVIDER_WEBHOOKS = new Set(["POST /api/webhooks/evolution", "POST /api/ig/webhook"]);
```

`middleware.ts`, dentro de `RATE_LIMITS`, logo depois de `"/api/webhooks/evolution": 300,`:

```ts
  // Webhook da Zernio (Instagram): mesmo raciocínio. O gate real é a assinatura
  // HMAC no handler; isto só barra flood ingênuo.
  "/api/ig/webhook": 300,
```

- [ ] **Step 4: Run the tests**

Run: `npm --workspace apps/web test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/security/request-access-policy.ts apps/web/src/lib/security/request-access-policy.test.ts apps/web/src/middleware.ts
git commit -m "feat(ig): allow the Zernio webhook path without session, rate limited by IP"
```

### Gate G e Entrega

- [ ] `pwsh -File infra/scripts/verify-local.ps1` verde.
- [ ] `git push -u origin feat/ig-webhook-base` e abra o PR:

```
PR G da fase 2 dos Fluxos do Instagram (docs/superpowers/plans/2026-10-06-instagram-fluxos-fase2.md, Tasks 7–11).

Base do webhook, sem a rota ainda (entra com o motor no PR H):
- assinatura `X-Zernio-Signature` em tempo constante;
- os quatro eventos (`comment.received`, `message.received`, `account.connected`, `account.disconnected`) em zod, descartando o que o motor não lê;
- escolha do fluxo no ar (post específico > qualquer post > palavra mais longa; story sem palavra);
- store `ig-runs` (criar idempotente por `source_id`, passos, teto por conta, entrada por pessoa, parar, listar, retenção);
- `POST /api/ig/webhook` liberado da sessão e com teto por IP.

Sem migração; nada observável no painel.
```

- [ ] Mergear e abrir a branch do PR H a partir de `origin/main`.

---

## PR H — motor, rota do webhook, publicar com conta, pausar e retomar

Branch: `feat/ig-engine`. Entrega: comentário, direct ou resposta a story com a palavra vira direct com o link em menos de 5 s; "Publicar" exige conta conectada e só aceita receitas de um direct; o interruptor "No ar" pausa e retoma.

### Task 12: blocos que ainda não rodam (`fase_seguinte`)

**Files:**
- Create: `apps/web/src/lib/ig/flow/fase.ts`
- Modify: `apps/web/src/lib/ig/flow/validate.ts:15-35` (`IssueCode`) e `:210-217` (`GRUPOS`)
- Test: `apps/web/src/lib/ig/flow/fase.test.ts`

**Interfaces:**
- Consumes: `FlowDef`, `Issue`, `RECIPES`.
- Produces: `foraDaFase(def: FlowDef): Issue[]`; `IssueCode` ganha `"fase_seguinte"` (grupo `regras`).

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ig/flow/fase.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { foraDaFase } from "./fase";
import { RECIPES } from "./recipes";
import { grupoDaIssue } from "./validate";

test("as receitas de um direct passam; a receita com espera, condição e lembrete não", () => {
  assert.deepEqual(foraDaFase(RECIPES.comment_invite.build()), []);
  assert.deepEqual(foraDaFase(RECIPES.dm_invite.build()), []);
  assert.deepEqual(foraDaFase(RECIPES.blank.build()), []);
  const issues = foraDaFase(RECIPES.comment_follow_invite.build());
  assert.ok(issues.length >= 4, "espera (2), condição, lembrete e desvio por clique");
  assert.ok(issues.every((i) => i.code === "fase_seguinte"));
  assert.deepEqual(issues.filter((i) => i.nodeId === "segue").length, 1);
  assert.equal(grupoDaIssue("fase_seguinte"), "regras");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/flow/fase.test.ts`
Expected: FAIL (módulo `./fase` não existe).

- [ ] **Step 3: Write the module and register the code**

```ts
// apps/web/src/lib/ig/flow/fase.ts
import type { FlowDef } from "./types";
import type { Issue } from "./validate";

/**
 * O que o motor só executa na fase 3: esperar resposta, "segue a loja?",
 * lembrete e desvio de quem não clicou. Dá pra montar no rascunho; não publica.
 */
export function foraDaFase(def: FlowDef): Issue[] {
  const issues: Issue[] = [];
  for (const n of def.nodes) {
    if (n.type === "message" && n.wait) issues.push({ code: "fase_seguinte", nodeId: n.id, text: "Esperar a resposta chega na próxima fase. Tire a espera ou use uma receita de um direct." });
    if (n.type === "condition") issues.push({ code: "fase_seguinte", nodeId: n.id, text: "“Segue a loja?” chega na próxima fase." });
    if (n.type === "invite" && n.remindAfterMinutes !== null) issues.push({ code: "fase_seguinte", nodeId: n.id, text: "O lembrete de quem não clicou chega na próxima fase." });
  }
  if (def.edges.some((e) => e.out === "clicked" || e.out === "not_clicked")) issues.push({ code: "fase_seguinte", nodeId: null, text: "Desvio por clique chega na próxima fase." });
  return issues;
}
```

Em `validate.ts`: acrescente `| "fase_seguinte"` ao fim de `IssueCode` (depois de `"sem_conta"`) e, em `GRUPOS`, na linha de `regras`:

```ts
  { chave: "regras", rotulo: "Regras do Instagram", codes: ["botao_no_primeiro_direct", "segundo_direct_sem_resposta", "condicao_cedo", "espera_longa", "fase_seguinte"] },
```

- [ ] **Step 4: Run the tests**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/flow/fase.test.ts src/lib/ig/flow/validate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/flow/fase.ts apps/web/src/lib/ig/flow/fase.test.ts apps/web/src/lib/ig/flow/validate.ts
git commit -m "feat(ig): flag flow blocks that only run in phase 3"
```

### Task 13: link do convite e `ref`

**Files:**
- Create: `apps/web/src/lib/ig/engine/link.ts`
- Test: `apps/web/src/lib/ig/engine/link.test.ts`

**Interfaces:**
- Consumes: `campaignLinkPath` (`@/lib/custom-domains/host`), `getAppUrl` (`@/lib/environment`), `getCustomDomain` (`@/lib/stores/custom-domains`).
- Produces: `novoRef(): string`; `montarLink(origem, slug, ref): string`; `linkDoConvite(tenantId, slug, ref): Promise<string>`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ig/engine/link.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { montarLink, novoRef } from "./link";

test("o ref é aleatório, sem dado pessoal e cabe no formato do /r", () => {
  const refs = new Set(Array.from({ length: 200 }, () => novoRef()));
  assert.equal(refs.size, 200);
  for (const r of refs) assert.match(r, /^[A-Za-z0-9_-]{10,24}$/);
});

test("no app o link é /r/<slug>?ig=; no domínio próprio é /<slug>?ig=", () => {
  assert.equal(montarLink("https://app.girumo.com.br", "vip-outono", "AbC_-123xyz9"), "https://app.girumo.com.br/r/vip-outono?ig=AbC_-123xyz9");
  assert.equal(montarLink("https://loja.exemplo.com.br", "vip-outono", "r1r1r1r1r1"), "https://loja.exemplo.com.br/vip-outono?ig=r1r1r1r1r1");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/link.test.ts`
Expected: FAIL (módulo `./link` não existe).

- [ ] **Step 3: Write the module**

```ts
// apps/web/src/lib/ig/engine/link.ts
import "server-only";

import { randomBytes } from "node:crypto";
import { campaignLinkPath } from "@/lib/custom-domains/host";
import { getAppUrl } from "@/lib/environment";
import { getCustomDomain } from "@/lib/stores/custom-domains";

/** Aleatório, sem dado pessoal; casa com `^[A-Za-z0-9_-]{10,24}$` (spec §8.5). */
export function novoRef(): string {
  return randomBytes(12).toString("base64url");
}

/** `<origem>/r/<slug>?ig=<ref>`; no domínio próprio ativo, `<origem>/<slug>?ig=<ref>`. */
export function montarLink(origem: string, slug: string, ref: string): string {
  return `${origem}${campaignLinkPath(origem, slug)}?ig=${encodeURIComponent(ref)}`;
}

export async function linkDoConvite(tenantId: string, slug: string, ref: string): Promise<string> {
  const dominio = await getCustomDomain(tenantId);
  const origem = dominio?.status === "active" ? `https://${dominio.hostname}` : getAppUrl();
  return montarLink(origem, slug, ref);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/link.test.ts`
Expected: PASS (2 testes). Se `loja.exemplo.com.br` for tratado como host próprio por `isFirstPartyHost`, leia `src/lib/custom-domains/host.ts` e troque o host do teste por um que não seja da Girumo.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/engine/link.ts apps/web/src/lib/ig/engine/link.test.ts
git commit -m "feat(ig): invite link with attribution ref"
```

### Task 14: `advance` — executa o run

**Files:**
- Create: `apps/web/src/lib/ig/engine/advance.ts`
- Test: `apps/web/src/lib/ig/engine/advance.test.ts`

**Interfaces:**
- Consumes: `FlowDef`, `FlowOut` (`@/lib/ig/flow/types`), `Transport`, `ZernioError`, `createFakeTransport`.
- Produces: `advance(def, run: RunState, deps: Deps): Promise<Resultado>`; `RunState = { id; flowId; ref; sourceKind; providerAccountId; comment: { platformPostId; commentId } | null; conversationId: string | null; windowExpiresAt: string; directsSent: number }`; `Deps = { transport; link(slug, ref); step(nodeId, out); now() }`; `Resultado = { status: "done" | "active" | "failed"; nodeId; waiting; errorCode; errorMessage; directsSent }`. **Lança** o `ZernioError` quando ele é passageiro (`transient`): quem chama devolve 500 e a Zernio reenvia.

Regras que o código abaixo cumpre (spec §8.2–8.3): resposta pública é ação do gatilho e só para quem comentou (falha dela não para o run); o primeiro direct de quem comentou é a resposta privada, os seguintes vão na conversa (que só quem veio por direct/story tem nesta fase); `privateReplyConsumed` = já enviado; `Idempotency-Key` = `<run>:<nó>`; nada depois de `windowExpiresAt`; um bloco no máximo 2 vezes; espera, condição e desvio por clique deixam o run `active` para a fase 3.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ig/engine/advance.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { RECIPES } from "@/lib/ig/flow/recipes";
import type { FlowDef, FlowOut } from "@/lib/ig/flow/types";
import { createFakeTransport } from "@/lib/ig/transport/fake";
import { ZernioError } from "@/lib/ig/transport/types";
import { advance, type Deps, type RunState } from "./advance";

const comConvite = (def: FlowDef, slug = "vip"): FlowDef => ({ ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: slug } : n)) });
const agora = () => new Date("2026-10-06T12:00:00Z");
const base: RunState = { id: "run-1", flowId: "f1", ref: "ref123456789", sourceKind: "comment", providerAccountId: "z1", comment: { platformPostId: "post", commentId: "com" }, conversationId: null, windowExpiresAt: "2026-10-13T12:00:00Z", directsSent: 0 };

function montar(opts: Parameters<typeof createFakeTransport>[0] = {}) {
  const { transport, chamadas } = createFakeTransport(opts);
  const passos: Array<[string, FlowOut]> = [];
  const deps: Deps = { transport, now: agora, link: async (slug, ref) => `https://app/r/${slug}?ig=${ref}`, step: async (n, o) => { passos.push([n, o]); } };
  return { deps, chamadas, passos };
}

test("comentou, entra no grupo: resposta pública, uma privada com o link no fim, run termina", async () => {
  const { deps, chamadas, passos } = montar();
  const r = await advance(comConvite(RECIPES.comment_invite.build()), base, deps);
  assert.equal(r.status, "done");
  assert.equal(r.directsSent, 1);
  assert.deepEqual(chamadas.map((c) => c.metodo), ["publicReply", "privateReply"]);
  const privada = chamadas[1];
  assert.ok(privada.metodo === "privateReply");
  assert.equal(privada.args.message, "Oi! Aqui está o link do grupo VIP:\nhttps://app/r/vip?ig=ref123456789");
  assert.equal(privada.args.idempotencyKey, "run-1:convite");
  assert.deepEqual(privada.args, { ...privada.args, accountId: "z1", platformPostId: "post", commentId: "com" });
  assert.deepEqual(passos, [["gatilho", "next"]]);
});

test("pediu no direct: nada de resposta pública; o direct vai na conversa", async () => {
  const { deps, chamadas } = montar();
  const def = comConvite({ ...RECIPES.dm_invite.build() });
  const r = await advance(def, { ...base, sourceKind: "dm", comment: null, conversationId: "conv-9", windowExpiresAt: "2026-10-07T12:00:00Z" }, deps);
  assert.equal(r.status, "done");
  assert.deepEqual(chamadas.map((c) => c.metodo), ["sendMessage"]);
  assert.ok(chamadas[0].metodo === "sendMessage" && chamadas[0].args.conversationId === "conv-9");
});

test("resposta privada já gasta (reenvio) conta como enviada; erro fixo marca falha com o código; passageiro estoura", async () => {
  const gasta = new ZernioError(400, "invalid_request_error", "private_reply_consumed", { privateReplyConsumed: true }, "spent");
  assert.equal((await advance(comConvite(RECIPES.comment_invite.build()), base, montar({ falhar: { privateReply: gasta } }).deps)).status, "done");

  const recusa = new ZernioError(400, "platform_error", "platform_api_error", null, "Meta disse não");
  const r = await advance(comConvite(RECIPES.comment_invite.build()), base, montar({ falhar: { privateReply: recusa } }).deps);
  assert.equal(r.status, "failed");
  assert.equal(r.errorCode, "platform_api_error");
  assert.equal(r.nodeId, "convite");

  const fora = new ZernioError(502, "platform_error", "platform_api_error", null, "upstream");
  await assert.rejects(() => advance(comConvite(RECIPES.comment_invite.build()), base, montar({ falhar: { privateReply: fora } }).deps), (e: unknown) => e instanceof ZernioError && e.transient);
});

test("a resposta pública falhar não para o run", async () => {
  const recusa = new ZernioError(400, "platform_error", "platform_api_error", null, "sem permissão de comentário");
  const { deps, chamadas } = montar({ falhar: { publicReply: recusa } });
  const r = await advance(comConvite(RECIPES.comment_invite.build()), base, deps);
  assert.equal(r.status, "done");
  assert.deepEqual(chamadas.map((c) => c.metodo), ["publicReply", "privateReply"]);
});

test("janela fechada: nada sai; segundo direct depois de comentário sem conversa: falha no_conversation", async () => {
  const { deps, chamadas } = montar();
  const vencido = await advance(comConvite(RECIPES.comment_invite.build()), { ...base, windowExpiresAt: "2026-10-06T11:59:59Z" }, deps);
  assert.equal(vencido.status, "failed");
  assert.equal(vencido.errorCode, "window_expired");
  assert.deepEqual(chamadas.map((c) => c.metodo), ["publicReply"]);

  const doisDirects: FlowDef = {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "comment", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "m1", type: "message", text: "Oi", button: null, wait: null },
      { id: "convite", type: "invite", text: "Link:", campaignSlug: "vip", remindAfterMinutes: null },
    ],
    edges: [{ from: "gatilho", out: "next", to: "m1" }, { from: "m1", out: "next", to: "convite" }],
  };
  const r = await advance(doisDirects, base, montar().deps);
  assert.equal(r.status, "failed");
  assert.equal(r.errorCode, "no_conversation");
  assert.equal(r.nodeId, "convite");
  assert.equal(r.directsSent, 1);
});

test("espera por resposta e desvio por clique deixam o run ativo pra fase 3; ciclo para em 2 visitas", async () => {
  const espera: FlowDef = {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "pede", type: "message", text: "Me responde", button: null, wait: { minutes: 60 } },
    ],
    edges: [{ from: "gatilho", out: "next", to: "pede" }],
  };
  const dm = { ...base, sourceKind: "dm" as const, comment: null, conversationId: "conv" };
  const r1 = await advance(espera, dm, montar().deps);
  assert.deepEqual([r1.status, r1.waiting, r1.nodeId], ["active", "reply", "pede"]);

  const lembrete = comConvite({ ...RECIPES.dm_invite.build(), nodes: RECIPES.dm_invite.build().nodes.map((n) => (n.type === "invite" ? { ...n, remindAfterMinutes: 60 } : n)) });
  const r2 = await advance(lembrete, dm, montar().deps);
  assert.deepEqual([r2.status, r2.waiting], ["active", "click"]);

  const ciclo: FlowDef = {
    v: 1,
    nodes: [
      { id: "gatilho", type: "trigger", on: "dm", keywords: ["quero"], postId: null, publicReply: null, storyReplies: false },
      { id: "a", type: "message", text: "A", button: null, wait: null },
      { id: "b", type: "message", text: "B", button: null, wait: null },
    ],
    edges: [{ from: "gatilho", out: "next", to: "a" }, { from: "a", out: "next", to: "b" }, { from: "b", out: "next", to: "a" }],
  };
  const { deps, chamadas } = montar();
  const r3 = await advance(ciclo, dm, deps);
  assert.equal(r3.status, "failed");
  assert.equal(r3.errorCode, "cycle");
  assert.equal(chamadas.length, 4, "a, b, a, b e para antes da terceira visita");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/advance.test.ts`
Expected: FAIL (módulo `./advance` não existe).

- [ ] **Step 3: Write the engine**

```ts
// apps/web/src/lib/ig/engine/advance.ts
import type { FlowDef, FlowOut } from "@/lib/ig/flow/types";
import { ZernioError, type Transport } from "@/lib/ig/transport/types";

export type RunState = {
  id: string;
  flowId: string;
  ref: string;
  sourceKind: "comment" | "dm" | "story";
  providerAccountId: string;
  /** Só quem veio por comentário: onde vão a resposta pública e a privada. */
  comment: { platformPostId: string; commentId: string } | null;
  /** Só quem veio por direct ou story. Depois de um comentário, só a fase 3 descobre (quando a pessoa responde). */
  conversationId: string | null;
  windowExpiresAt: string;
  /** Directs já enviados neste run: o primeiro depois de comentário é a resposta privada. */
  directsSent: number;
};

export type Resultado = {
  status: "done" | "active" | "failed";
  nodeId: string | null;
  waiting: "reply" | "click" | null;
  errorCode: string | null;
  errorMessage: string | null;
  directsSent: number;
};

export type Deps = {
  transport: Transport;
  link: (slug: string, ref: string) => Promise<string>;
  step: (nodeId: string, out: FlowOut) => Promise<void>;
  now: () => Date;
};

const MAX_VISITAS = 2;
const MAX_ERRO = 200;

type Envio = { ok: true } | { ok: false; code: string; message: string | null };

async function enviar(run: RunState, nodeId: string, texto: string, directsSent: number, transport: Transport): Promise<Envio> {
  const idempotencyKey = `${run.id}:${nodeId}`;
  try {
    if (run.sourceKind === "comment" && directsSent === 0) {
      if (!run.comment) return { ok: false, code: "no_comment", message: null };
      await transport.privateReply({ accountId: run.providerAccountId, platformPostId: run.comment.platformPostId, commentId: run.comment.commentId, message: texto, idempotencyKey });
      return { ok: true };
    }
    if (!run.conversationId) return { ok: false, code: "no_conversation", message: null };
    await transport.sendMessage({ accountId: run.providerAccountId, conversationId: run.conversationId, message: texto, idempotencyKey });
    return { ok: true };
  } catch (e) {
    if (!(e instanceof ZernioError)) throw e;
    // Reenvio da Zernio depois de a privada já ter saído: está enviado.
    if (e.privateReplyConsumed) return { ok: true };
    // Rede, 429, 5xx: quem chama devolve 500 e a Zernio tenta de novo (Idempotency-Key segura).
    if (e.transient) throw e;
    return { ok: false, code: e.code, message: e.message.slice(0, MAX_ERRO) };
  }
}

/**
 * Executa o run a partir do gatilho até parar: terminou, ficou esperando
 * (fase 3) ou falhou. Cada transição grava um passo. Lança o `ZernioError`
 * passageiro em vez de gravar falha.
 */
export async function advance(def: FlowDef, run: RunState, deps: Deps): Promise<Resultado> {
  const nos = new Map(def.nodes.map((n) => [n.id, n]));
  const proximo = (de: string, out: FlowOut) => def.edges.find((e) => e.from === de && e.out === out)?.to ?? null;
  const visitas = new Map<string, number>();
  let directsSent = run.directsSent;
  const falha = (nodeId: string | null, code: string, message: string | null): Resultado => ({ status: "failed", nodeId, waiting: null, errorCode: code, errorMessage: message, directsSent });
  const fim = (nodeId: string | null): Resultado => ({ status: "done", nodeId, waiting: null, errorCode: null, errorMessage: null, directsSent });
  const espera = (nodeId: string, waiting: "reply" | "click"): Resultado => ({ status: "active", nodeId, waiting, errorCode: null, errorMessage: null, directsSent });

  const gatilho = def.nodes.find((n) => n.type === "trigger");
  if (!gatilho || gatilho.type !== "trigger") return falha(null, "no_trigger", null);

  // Resposta pública: ação do gatilho, só para quem comentou. A privada é o que importa; a pública falhar não para o run.
  if (run.sourceKind === "comment" && run.comment && gatilho.publicReply) {
    try {
      await deps.transport.publicReply({ accountId: run.providerAccountId, platformPostId: run.comment.platformPostId, commentId: run.comment.commentId, message: gatilho.publicReply, idempotencyKey: `${run.id}:${gatilho.id}:public` });
    } catch (e) {
      if (!(e instanceof ZernioError)) throw e;
    }
  }

  await deps.step(gatilho.id, "next");
  let atualId = proximo(gatilho.id, "next");
  while (atualId) {
    const no = nos.get(atualId);
    if (!no) return falha(atualId, "missing_node", null);
    const vez = (visitas.get(no.id) ?? 0) + 1;
    visitas.set(no.id, vez);
    if (vez > MAX_VISITAS) return falha(no.id, "cycle", null);
    if (deps.now().getTime() > Date.parse(run.windowExpiresAt)) return falha(no.id, "window_expired", null);
    if (no.type === "trigger") return falha(no.id, "trigger_in_middle", null);
    if (no.type === "condition") return falha(no.id, "unsupported_node", null);

    const texto = no.type === "invite" && no.campaignSlug ? `${no.text}\n${await deps.link(no.campaignSlug, run.ref)}` : no.text;
    const envio = await enviar(run, no.id, texto, directsSent, deps.transport);
    if (!envio.ok) return falha(no.id, envio.code, envio.message);
    directsSent += 1;

    if (no.type === "message" && no.wait) return espera(no.id, "reply");
    if (no.type === "invite") {
      const temDesvio = proximo(no.id, "clicked") !== null || proximo(no.id, "not_clicked") !== null || no.remindAfterMinutes !== null;
      return temDesvio ? espera(no.id, "click") : fim(no.id);
    }
    await deps.step(no.id, "next");
    atualId = proximo(no.id, "next");
    if (!atualId) return fim(no.id);
  }
  return fim(gatilho.id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/advance.test.ts`
Expected: PASS (6 testes). No teste do ciclo, `chamadas.length` é 4 porque a→b→a→b envia 4 vezes e a terceira visita a `a` para.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/engine/advance.ts apps/web/src/lib/ig/engine/advance.test.ts
git commit -m "feat(ig): engine advance for one-direct recipes with Meta rules"
```

### Task 15: `tratarEvento` — do evento ao run

**Files:**
- Create: `apps/web/src/lib/ig/engine/handle-event.ts`
- Test: `apps/web/src/lib/ig/engine/handle-event.test.ts`

**Interfaces:**
- Consumes: `EventoZernio` (Task 8), `escolherFluxo`/`FluxoNoAr`/`Origem` (Task 9), `advance`/`RunState` (Task 14), tipos das stores (`IgAccountComLoja`, `AccountStatus`, `NovoRun`, `RunPatch`, `RunRow`), `ZernioError`.
- Produces: `tratarEvento(ev, amb: Ambiente): Promise<Desfecho>`; `Ambiente` (tudo injetado: transporte, relógio, `novoRef`, stores como funções); `Desfecho = { kind: "ignored"; reason } | { kind: "account"; tenantId } | { kind: "retry"; reason } | { kind: "handled"; tenantId; runId; status }`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/web/src/lib/ig/engine/handle-event.test.ts
import assert from "node:assert/strict";
import { test } from "node:test";
import { RECIPES } from "@/lib/ig/flow/recipes";
import { createFakeTransport } from "@/lib/ig/transport/fake";
import { ZernioError } from "@/lib/ig/transport/types";
import type { EventoZernio } from "@/lib/ig/webhook/events";
import type { RunRow } from "@/lib/stores/ig-runs";
import { tratarEvento, type Ambiente } from "./handle-event";

const T0 = new Date("2026-10-06T12:00:00Z");
const comentario: EventoZernio = { id: "e1", event: "comment.received", comment: { id: "c-1", platformPostId: "post-1", platform: "instagram", text: "quero", author: { id: "u1", username: "igortoled0", isOwnAccount: false }, createdAt: "2026-10-06T11:59:58Z", isReply: false }, account: { accountId: "z1" }, timestamp: "2026-10-06T11:59:59Z" };
const direct: EventoZernio = { id: "e2", event: "message.received", message: { platformMessageId: "m-1", platform: "instagram", direction: "incoming", text: "quero", sender: { id: "u1", username: "igortoled0" }, sentAt: "2026-10-06T11:59:58Z" }, conversation: { id: "conv-1", participantId: "u1" }, account: { accountId: "z1" }, timestamp: "2026-10-06T11:59:59Z" };

function ambiente(opts: { falhar?: Parameters<typeof createFakeTransport>[0]["falhar"]; conta?: Partial<{ status: string; tenant_id: string }> | null; liberada?: boolean; fluxos?: Ambiente["fluxosNoAr"]; recente?: boolean; iniciados?: number; existente?: RunRow | null } = {}) {
  const { transport, chamadas } = createFakeTransport({ falhar: opts.falhar });
  const criados: unknown[] = [];
  const patches: Array<[string, unknown]> = [];
  const estados: Array<[string, string, string | null]> = [];
  let proximoId = 1;
  const def = { ...RECIPES.comment_invite.build() };
  const live = { ...def, nodes: def.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) };
  const dmDef = RECIPES.dm_invite.build();
  const dmLive = { ...dmDef, nodes: dmDef.nodes.map((n) => (n.type === "invite" ? { ...n, campaignSlug: "vip" } : n)) };
  const amb: Ambiente = {
    transport,
    now: () => T0,
    novoRef: () => "ref-fixo-12345",
    contaPorIdDaZernio: async (id) => (opts.conta === null || id !== "z1" ? null : { id: "a1", tenant_id: "loja-a", username: "vireimoda", status: "active", provider: "zernio", provider_account_id: "z1", provider_profile_id: "p1", connected_at: "t", ...opts.conta } as never),
    mudarEstadoDaConta: async (t, s, e) => { estados.push([t, s, e]); },
    lojaLiberada: async () => opts.liberada ?? true,
    fluxosNoAr: opts.fluxos ?? (async () => [{ id: "f-c", version: 3, published: live }, { id: "f-d", version: 1, published: dmLive }]),
    runs: {
      criar: async (tenantId, novo) => {
        criados.push({ tenantId, ...novo });
        if (opts.existente !== undefined) return null;
        return { id: `run-${proximoId++}`, tenant_id: tenantId, ig_account_id: novo.igAccountId, flow_id: novo.flowId, flow_version: novo.flowVersion, source_kind: novo.sourceKind, source_id: novo.sourceId, ig_user_id: novo.igUserId, username: novo.username, matched_keyword: novo.matchedKeyword, ref: novo.ref, status: "queued", node_id: null, waiting: null, wake_at: null, window_expires_at: novo.windowExpiresAt, clicked_at: null, error_code: null, error_message: null, started_at: T0.toISOString(), updated_at: T0.toISOString(), finished_at: null };
      },
      porOrigem: async () => opts.existente ?? null,
      atualizar: async (_t, id, patch) => { patches.push([id, patch]); },
      passo: async () => {},
      iniciadosDesde: async () => opts.iniciados ?? 0,
      entradaRecente: async () => opts.recente ?? false,
    },
    link: async (_t, slug, ref) => `https://app/r/${slug}?ig=${ref}`,
  };
  return { amb, chamadas, criados, patches, estados };
}

test("comentário com a palavra vira run, resposta pública + privada com o link, e termina", async () => {
  const { amb, chamadas, criados, patches } = ambiente();
  const d = await tratarEvento(comentario, amb);
  assert.deepEqual(d, { kind: "handled", tenantId: "loja-a", runId: "run-1", status: "done" });
  assert.deepEqual(chamadas.map((c) => c.metodo), ["publicReply", "privateReply"]);
  const novo = criados[0] as Record<string, unknown>;
  assert.equal(novo.flowId, "f-c");
  assert.equal(novo.sourceId, "c-1");
  assert.equal(novo.matchedKeyword, "quero");
  assert.equal(novo.windowExpiresAt, "2026-10-13T11:59:58.000Z");
  assert.deepEqual(patches[0][1], { status: "done", node_id: "convite", waiting: null, error_code: null, error_message: null, finished_at: T0.toISOString() });
});

test("direct e story pegam o fluxo de direct; a janela é de 24 h", async () => {
  const { amb, chamadas, criados } = ambiente();
  await tratarEvento(direct, amb);
  assert.deepEqual(chamadas.map((c) => c.metodo), ["sendMessage"]);
  assert.equal((criados[0] as { sourceKind: string }).sourceKind, "dm");
  assert.equal((criados[0] as { windowExpiresAt: string }).windowExpiresAt, "2026-10-07T11:59:58.000Z");
  const story: EventoZernio = { ...direct, id: "e3", message: { ...direct.message, platformMessageId: "m-2", text: "lindo" }, metadata: { storyReply: { storyId: "s1" } } };
  await tratarEvento(story, amb);
  assert.equal((criados[1] as { sourceKind: string }).sourceKind, "story");
  assert.equal((criados[1] as { matchedKeyword: string | null }).matchedKeyword, null);
});

test("ignora: conta desconhecida, conta inativa, loja sem liberação, comentário da própria conta, resposta a comentário, sem palavra, direct de saída", async () => {
  assert.equal((await tratarEvento(comentario, ambiente({ conta: null }).amb)).kind, "ignored");
  assert.equal((await tratarEvento(comentario, ambiente({ conta: { status: "expired" } }).amb)).kind, "ignored");
  assert.equal((await tratarEvento(comentario, ambiente({ liberada: false }).amb)).kind, "ignored");
  assert.equal((await tratarEvento({ ...comentario, comment: { ...comentario.comment, author: { ...comentario.comment.author, isOwnAccount: true } } }, ambiente().amb)).kind, "ignored");
  assert.equal((await tratarEvento({ ...comentario, comment: { ...comentario.comment, isReply: true } }, ambiente().amb)).kind, "ignored");
  assert.equal((await tratarEvento({ ...comentario, comment: { ...comentario.comment, text: "lindo" } }, ambiente().amb)).kind, "ignored");
  assert.equal((await tratarEvento({ ...direct, message: { ...direct.message, direction: "outgoing" } }, ambiente().amb)).kind, "ignored");
});

test("proteções: entrada recente da pessoa e teto da conta não criam run", async () => {
  const a = ambiente({ recente: true });
  assert.deepEqual(await tratarEvento(comentario, a.amb), { kind: "ignored", reason: "24h" });
  assert.equal(a.criados.length, 0);
  const b = ambiente({ iniciados: 700 });
  assert.deepEqual(await tratarEvento(comentario, b.amb), { kind: "ignored", reason: "teto" });
});

test("reenvio: run existente recente é duplicado; na fila há mais de 2 min é retomado", async () => {
  const base: RunRow = { id: "run-velho", tenant_id: "loja-a", ig_account_id: "a1", flow_id: "f-c", flow_version: 3, source_kind: "comment", source_id: "c-1", ig_user_id: "u1", username: null, matched_keyword: "quero", ref: "r", status: "queued", node_id: null, waiting: null, wake_at: null, window_expires_at: "2026-10-13T11:59:58.000Z", clicked_at: null, error_code: null, error_message: null, started_at: "2026-10-06T11:59:30Z", updated_at: "2026-10-06T11:59:30Z", finished_at: null };
  assert.deepEqual(await tratarEvento(comentario, ambiente({ existente: base }).amb), { kind: "ignored", reason: "duplicado" });
  const antigo = ambiente({ existente: { ...base, started_at: "2026-10-06T11:57:00Z" } });
  assert.deepEqual(await tratarEvento(comentario, antigo.amb), { kind: "handled", tenantId: "loja-a", runId: "run-velho", status: "done" });
  assert.equal((await tratarEvento(comentario, ambiente({ existente: { ...base, status: "done", started_at: "2026-10-06T11:00:00Z" } }).amb)).kind, "ignored");
});

test("erro passageiro da Zernio pede reenvio e não grava falha; eventos de conta mudam o estado", async () => {
  const fora = new ZernioError(503, "api_error", "temporarily_unavailable", null, "x");
  const a = ambiente({ falhar: { privateReply: fora } });
  assert.deepEqual(await tratarEvento(comentario, a.amb), { kind: "retry", reason: "temporarily_unavailable" });
  assert.equal(a.patches.length, 0);

  const b = ambiente();
  await tratarEvento({ id: "e9", event: "account.disconnected", account: { accountId: "z1", reason: "token expirou" }, timestamp: "t" }, b.amb);
  await tratarEvento({ id: "e10", event: "account.connected", account: { accountId: "z1" }, timestamp: "t" }, b.amb);
  assert.deepEqual(b.estados, [["loja-a", "expired", "token expirou"], ["loja-a", "active", null]]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/handle-event.test.ts`
Expected: FAIL (módulo `./handle-event` não existe).

- [ ] **Step 3: Write the module**

```ts
// apps/web/src/lib/ig/engine/handle-event.ts
import type { FlowOut } from "@/lib/ig/flow/types";
import { ZernioError, type Transport } from "@/lib/ig/transport/types";
import type { ComentarioRecebido, EventoZernio, MensagemRecebida } from "@/lib/ig/webhook/events";
import type { AccountStatus, IgAccountComLoja } from "@/lib/stores/ig-accounts";
import type { NovoRun, RunPatch, RunRow, SourceKind } from "@/lib/stores/ig-runs";
import { advance, type RunState } from "./advance";
import { escolherFluxo, type FluxoNoAr, type Origem } from "./select-flow";

/** Tudo que o tratamento toca, injetado: a rota liga nas stores de verdade; o teste, em memória. */
export type Ambiente = {
  transport: Transport;
  now: () => Date;
  novoRef: () => string;
  contaPorIdDaZernio: (providerAccountId: string) => Promise<IgAccountComLoja | null>;
  mudarEstadoDaConta: (tenantId: string, status: AccountStatus, lastError: string | null) => Promise<void>;
  lojaLiberada: (tenantId: string) => Promise<boolean>;
  fluxosNoAr: (tenantId: string) => Promise<FluxoNoAr[]>;
  runs: {
    criar: (tenantId: string, novo: NovoRun) => Promise<RunRow | null>;
    porOrigem: (tenantId: string, sourceId: string) => Promise<RunRow | null>;
    atualizar: (tenantId: string, id: string, patch: RunPatch) => Promise<void>;
    passo: (tenantId: string, input: { flowId: string; runId: string; nodeId: string; out: FlowOut }) => Promise<void>;
    iniciadosDesde: (tenantId: string, igAccountId: string, sinceIso: string) => Promise<number>;
    entradaRecente: (tenantId: string, flowId: string, igUserId: string, sinceIso: string) => Promise<boolean>;
  };
  link: (tenantId: string, slug: string, ref: string) => Promise<string>;
};

export type Desfecho =
  | { kind: "ignored"; reason: string }
  | { kind: "account"; tenantId: string }
  | { kind: "retry"; reason: string }
  | { kind: "handled"; tenantId: string; runId: string; status: "done" | "active" | "failed" };

/** 750 por hora é o teto da Meta para resposta privada; paramos antes. */
const TETO_POR_HORA = 700;
const UMA_HORA_MS = 60 * 60_000;
const UM_DIA_MS = 24 * UMA_HORA_MS;
const SETE_DIAS_MS = 7 * UM_DIA_MS;
/** Run na fila há mais que isto pode ser reexecutado por um reenvio (spec §8.3). */
const RETOMADA_MS = 2 * 60_000;

type Entrada = {
  origem: Origem;
  sourceKind: SourceKind;
  sourceId: string;
  igUserId: string;
  username: string | null;
  comment: RunState["comment"];
  conversationId: string | null;
  windowExpiresAt: string;
};

const iso = (ms: number) => new Date(ms).toISOString();

function deComentario(ev: ComentarioRecebido): Entrada | null {
  const c = ev.comment;
  if (c.platform !== "instagram" || c.author.isOwnAccount || c.isReply) return null;
  return {
    origem: { kind: "comment", postId: c.platformPostId, text: c.text },
    sourceKind: "comment",
    sourceId: c.id,
    igUserId: c.author.id,
    username: c.author.username ?? null,
    comment: { platformPostId: c.platformPostId, commentId: c.id },
    conversationId: null,
    windowExpiresAt: iso(Date.parse(c.createdAt) + SETE_DIAS_MS),
  };
}

function deMensagem(ev: MensagemRecebida): Entrada | null {
  const m = ev.message;
  if (m.platform !== "instagram" || m.direction !== "incoming" || !m.text) return null;
  const story = ev.metadata?.storyReply !== undefined;
  return {
    origem: story ? { kind: "story", text: m.text } : { kind: "dm", text: m.text },
    sourceKind: story ? "story" : "dm",
    sourceId: m.platformMessageId,
    igUserId: m.sender.id,
    username: m.sender.username ?? null,
    comment: null,
    conversationId: ev.conversation.id,
    windowExpiresAt: iso(Date.parse(m.sentAt) + UM_DIA_MS),
  };
}

/**
 * Traduz o evento, acha a loja, escolhe o fluxo, aplica as proteções, grava o
 * run (idempotente por source_id) e executa o primeiro passo na mesma chamada.
 * Nada que não casa deixa rastro no banco.
 */
export async function tratarEvento(ev: EventoZernio, amb: Ambiente): Promise<Desfecho> {
  const conta = await amb.contaPorIdDaZernio(ev.account.accountId);
  if (!conta) return { kind: "ignored", reason: "conta desconhecida" };
  const tenantId = conta.tenant_id;

  if (ev.event === "account.connected") {
    await amb.mudarEstadoDaConta(tenantId, "active", null);
    return { kind: "account", tenantId };
  }
  if (ev.event === "account.disconnected") {
    await amb.mudarEstadoDaConta(tenantId, "expired", ev.account.reason ?? null);
    return { kind: "account", tenantId };
  }
  if (conta.status !== "active") return { kind: "ignored", reason: "conta inativa" };
  if (!(await amb.lojaLiberada(tenantId))) return { kind: "ignored", reason: "loja sem liberação" };

  // ponytail: na fase 3, um direct de quem tem run ativo esperando resposta avança o run em vez de abrir outro.
  const entrada = ev.event === "comment.received" ? deComentario(ev) : deMensagem(ev);
  if (!entrada) return { kind: "ignored", reason: "evento sem gatilho" };

  const escolha = escolherFluxo(await amb.fluxosNoAr(tenantId), entrada.origem);
  if (!escolha) return { kind: "ignored", reason: "sem fluxo" };

  const agora = amb.now();
  if (await amb.runs.entradaRecente(tenantId, escolha.flowId, entrada.igUserId, iso(agora.getTime() - UM_DIA_MS))) return { kind: "ignored", reason: "24h" };
  if ((await amb.runs.iniciadosDesde(tenantId, conta.id, iso(agora.getTime() - UMA_HORA_MS))) >= TETO_POR_HORA) return { kind: "ignored", reason: "teto" };

  let run = await amb.runs.criar(tenantId, {
    igAccountId: conta.id,
    flowId: escolha.flowId,
    flowVersion: escolha.version,
    sourceKind: entrada.sourceKind,
    sourceId: entrada.sourceId,
    igUserId: entrada.igUserId,
    username: entrada.username,
    matchedKeyword: escolha.keyword,
    ref: amb.novoRef(),
    windowExpiresAt: entrada.windowExpiresAt,
  });
  if (!run) {
    const existente = await amb.runs.porOrigem(tenantId, entrada.sourceId);
    const retomavel = existente !== null && existente.status === "queued" && agora.getTime() - Date.parse(existente.started_at) > RETOMADA_MS;
    if (!existente || !retomavel) return { kind: "ignored", reason: "duplicado" };
    run = existente;
  }

  const estado: RunState = {
    id: run.id,
    flowId: run.flow_id,
    ref: run.ref,
    sourceKind: run.source_kind,
    providerAccountId: ev.account.accountId,
    comment: entrada.comment,
    conversationId: entrada.conversationId,
    windowExpiresAt: run.window_expires_at ?? entrada.windowExpiresAt,
    directsSent: 0,
  };
  const runId = run.id;
  const flowId = run.flow_id;
  try {
    const r = await advance(escolha.def, estado, {
      transport: amb.transport,
      now: amb.now,
      link: (slug, ref) => amb.link(tenantId, slug, ref),
      step: (nodeId, out) => amb.runs.passo(tenantId, { flowId, runId, nodeId, out }),
    });
    await amb.runs.atualizar(tenantId, runId, {
      status: r.status,
      node_id: r.nodeId,
      waiting: r.waiting,
      error_code: r.errorCode,
      error_message: r.errorMessage,
      finished_at: r.status === "active" ? null : agora.toISOString(),
    });
    return { kind: "handled", tenantId, runId, status: r.status };
  } catch (e) {
    // O run fica `queued`: o reenvio da Zernio o retoma depois de 2 min.
    if (e instanceof ZernioError && e.transient) return { kind: "retry", reason: e.code };
    throw e;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/ig/engine/handle-event.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/engine/handle-event.ts apps/web/src/lib/ig/engine/handle-event.test.ts
git commit -m "feat(ig): translate Zernio events into runs and execute the first step"
```

### Task 16: a rota `POST /api/ig/webhook` e o webhook na Zernio

**Files:**
- Modify: `apps/web/src/lib/stores/ig-flows.ts:96-101` (`listLiveFlows` com `version`)
- Create: `apps/web/src/app/api/ig/webhook/route.ts`
- Create: `infra/scripts/zernio-webhook.mjs`

**Interfaces:**
- Consumes: tudo das Tasks 7, 8, 10, 13, 15; `getTenantSettings` (`@/lib/stores/tenant-settings`); `after` (`next/server`).
- Produces: `listLiveFlows(tenantId) → Pick<FlowRow, "id" | "published" | "version">[]`; a rota.

- [ ] **Step 1: `listLiveFlows` traz a versão**

```ts
/** Os fluxos no ar, com o grafo publicado e a versão: palavras em uso e escolha do fluxo pelo motor. */
export async function listLiveFlows(tenantId: string): Promise<Pick<FlowRow, "id" | "published" | "version">[]> {
  const { data, error } = await getSupabaseAdmin().from("ig_flows").select("id, published, version").eq("tenant_id", tenantId).eq("status", "live");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Pick<FlowRow, "id" | "published" | "version">[];
}
```

- [ ] **Step 2: A rota**

```ts
// apps/web/src/app/api/ig/webhook/route.ts
import { after } from "next/server";
import { tratarEvento, type Ambiente } from "@/lib/ig/engine/handle-event";
import { linkDoConvite, novoRef } from "@/lib/ig/engine/link";
import { zernioApiKey, zernioWebhookSecret } from "@/lib/ig/segredos";
import { assinaturaConfere } from "@/lib/ig/transport/signature";
import { createZernioTransport } from "@/lib/ig/transport/zernio";
import { lerEvento } from "@/lib/ig/webhook/events";
import { getAccountByProviderId, setAccountStatus } from "@/lib/stores/ig-accounts";
import { listLiveFlows } from "@/lib/stores/ig-flows";
import { countRunsStartedSince, createRun, getRunBySourceId, hasRecentRun, purgeOldRuns, recordStep, updateRun } from "@/lib/stores/ig-runs";
import { getTenantSettings } from "@/lib/stores/tenant-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RETENCAO_DIAS = 90;

function ambiente(): Ambiente {
  return {
    transport: createZernioTransport({ apiKey: zernioApiKey() }),
    now: () => new Date(),
    novoRef,
    contaPorIdDaZernio: getAccountByProviderId,
    mudarEstadoDaConta: setAccountStatus,
    lojaLiberada: async (tenantId) => (await getTenantSettings(tenantId)).instagramEnabled,
    fluxosNoAr: listLiveFlows,
    runs: { criar: createRun, porOrigem: getRunBySourceId, atualizar: updateRun, passo: recordStep, iniciadosDesde: countRunsStartedSince, entradaRecente: hasRecentRun },
    link: linkDoConvite,
  };
}

// POST /api/ig/webhook — sem sessão (PROVIDER_WEBHOOKS). Assinatura do corpo cru em
// tempo constante; evento em zod; 202 para tudo que não é nosso (o endpoint não
// vira oráculo); 500 só quando vale a Zernio reenviar.
export async function POST(req: Request) {
  const cru = await req.text();
  if (!assinaturaConfere(cru, req.headers.get("x-zernio-signature"), zernioWebhookSecret())) return new Response("Assinatura inválida.", { status: 401 });
  let json: unknown;
  try {
    json = JSON.parse(cru);
  } catch {
    return new Response("Corpo inválido.", { status: 400 });
  }
  const ev = lerEvento(json);
  if (!ev) return new Response(null, { status: 202 });

  const desfecho = await tratarEvento(ev, ambiente());
  if (desfecho.kind === "retry") return new Response("Tente de novo.", { status: 500 });
  if (desfecho.kind === "handled") {
    const { tenantId } = desfecho;
    // ponytail: retenção de 90 dias sem cron — uma limpeza por atendimento novo, depois da resposta.
    after(() => purgeOldRuns(tenantId, new Date(Date.now() - RETENCAO_DIAS * 86_400_000).toISOString()).catch(() => {}));
    return Response.json({ runId: desfecho.runId, status: desfecho.status });
  }
  return new Response(null, { status: 202 });
}
```

- [ ] **Step 3: O script do webhook na Zernio (uma vez por ambiente)**

```js
// infra/scripts/zernio-webhook.mjs
// Cria, lista ou apaga o webhook da Girumo na Zernio. Lê ZERNIO_API_KEY e ZERNIO_WEBHOOK_SECRET do ambiente; nunca imprime os dois.
//   node infra/scripts/zernio-webhook.mjs list
//   node infra/scripts/zernio-webhook.mjs create https://app.girumo.com.br/api/ig/webhook girumo-prod
//   node infra/scripts/zernio-webhook.mjs delete <webhookId>
const [acao, arg1, arg2] = process.argv.slice(2);
const chave = process.env.ZERNIO_API_KEY?.trim();
const segredo = process.env.ZERNIO_WEBHOOK_SECRET?.trim();
if (!chave) throw new Error("ZERNIO_API_KEY ausente no ambiente.");
const EVENTOS = ["comment.received", "message.received", "account.connected", "account.disconnected"];

async function zernio(method, path, body) {
  const r = await fetch(`https://zernio.com/api/${path}`, { method, headers: { Authorization: `Bearer ${chave}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const texto = await r.text();
  if (!r.ok) throw new Error(`${r.status} ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}

if (acao === "list") {
  const r = await zernio("GET", "v1/webhooks/settings");
  const lista = Array.isArray(r) ? r : r?.webhooks ?? r?.data ?? [];
  for (const w of lista) console.log(w._id, w.name, w.url, (w.events ?? []).join(","), w.isActive === false ? "(inativo)" : "");
} else if (acao === "create") {
  if (!segredo) throw new Error("ZERNIO_WEBHOOK_SECRET ausente no ambiente.");
  if (!arg1?.startsWith("https://")) throw new Error("Uso: create <url https> [nome]");
  const r = await zernio("POST", "v1/webhooks/settings", { name: arg2 ?? "girumo", url: arg1, secret: segredo, events: EVENTOS });
  console.log("criado:", r?._id ?? r?.webhook?._id ?? JSON.stringify(r).slice(0, 200));
} else if (acao === "delete") {
  if (!arg1) throw new Error("Uso: delete <webhookId>");
  await zernio("DELETE", `v1/webhooks/settings?webhookId=${encodeURIComponent(arg1)}`);
  console.log("apagado:", arg1);
} else {
  throw new Error("Ações: list | create <url> [nome] | delete <id>");
}
```

- [ ] **Step 4: Type-check, lint, tests**

Run: os sete comandos do gate.
Expected: verde (`ig-flows.test.ts` não cobre `listLiveFlows`; `keywordsInUse` aceita o campo a mais).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/ig-flows.ts apps/web/src/app/api/ig/webhook/route.ts infra/scripts/zernio-webhook.mjs
git commit -m "feat(ig): Zernio webhook route and the webhook setup script"
```

### Task 17: publicar com conta e só receitas de um direct; pausar e retomar

**Files:**
- Modify: `apps/web/src/lib/stores/ig-flows.ts:82-94` (`publishFlow` grava a conta) e acrescenta `setFlowStatus`
- Modify: `apps/web/src/lib/stores/ig-flows.test.ts` (teste de publicar)
- Modify: `apps/web/src/app/api/ig/flows/[id]/publish/route.ts`
- Create: `apps/web/src/app/api/ig/flows/[id]/status/route.ts`
- Modify: `apps/web/src/app/api/ig/account/route.ts` (para os runs ao desconectar)
- Modify: `apps/web/src/components/painel/instagram/use-fluxo.ts` (`mudarEstado`)
- Modify: `apps/web/src/components/painel/instagram/editor.tsx` (interruptor "No ar"; `foraDaFase` na lista do cliente)

**Interfaces:**
- Produces: `publishFlow(tenantId, id, def, fromVersion, igAccountId: string)`; `setFlowStatus(tenantId, id, status: "live" | "paused") → FlowRow | null`; `POST /api/ig/flows/[id]/status { status: "live" | "paused" } → { flow }`; `useFluxo().mudarEstado(status) → Promise<string | null>` (mensagem de erro ou `null`).

- [ ] **Step 1: Update the store test**

Em `ig-flows.test.ts`, no teste "publicar trava por loja, id e versão…", troque a chamada e a lista de chaves:

```ts
  await publishFlow("loja-a", "f1", { v: 1, nodes: [], edges: [] }, 3, "conta-1");
  ...
  assert.deepEqual(Object.keys(corpo).sort(), ["ig_account_id", "published", "published_at", "status", "updated_at", "version"]);
  assert.equal(corpo.ig_account_id, "conta-1");
```

e acrescente, no fim do arquivo:

```ts
test("pausar e retomar só mexem em fluxo publicado da loja", async () => {
  pedidos.length = 0;
  await setFlowStatus("loja-a", "f1", "paused");
  assert.equal(pedidos[0].metodo, "PATCH");
  assert.deepEqual(filtros(pedidos[0].url), { tenant_id: "eq.loja-a", id: "eq.f1", published: "not.is.null" });
  assert.deepEqual(Object.keys(pedidos[0].corpo as object).sort(), ["status", "updated_at"]);
});
```

(importe `setFlowStatus` junto dos outros).

- [ ] **Step 2: Run test to verify it fails**

Run: `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test src/lib/stores/ig-flows.test.ts`
Expected: FAIL (`setFlowStatus` não existe; chaves do corpo diferem).

- [ ] **Step 3: Store**

```ts
/** Publica: copia o rascunho, sobe a versão, prende a conta. Trava otimista pela versão. */
export async function publishFlow(tenantId: string, id: string, def: FlowDef, fromVersion: number, igAccountId: string): Promise<FlowRow | null> {
  const agora = new Date().toISOString();
  const { data, error } = await getSupabaseAdmin()
    .from("ig_flows")
    .update({ published: def, status: "live", version: fromVersion + 1, published_at: agora, updated_at: agora, ig_account_id: igAccountId })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .eq("version", fromVersion)
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as FlowRow | null) ?? null;
}

/** O interruptor "No ar". `null` = fluxo inexistente ou nunca publicado. */
export async function setFlowStatus(tenantId: string, id: string, status: "live" | "paused"): Promise<FlowRow | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("ig_flows")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("tenant_id", tenantId)
    .eq("id", id)
    .not("published", "is", null)
    .select(COLS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as FlowRow | null) ?? null;
}
```

- [ ] **Step 4: Publish route**

Em `publish/route.ts`, importe `import { foraDaFase } from "@/lib/ig/flow/fase";` e troque o trecho de validação até a publicação:

```ts
    const issues = [
      ...validateFlow(flow.draft, {
        campaignSlugs: campanhas.map((c) => c.slug).filter((s): s is string => typeof s === "string"),
        accountConnected: account?.status === "active",
        keywordsInUse: keywordsInUse(noAr, flow.id),
      }),
      ...foraDaFase(flow.draft),
    ];
    if (issues.length > 0 || !account) return Response.json({ issues }, { status: 409 });
    const publicado = await publishFlow(ctx.tenantId, id, flow.draft, flow.version, account.id);
```

Troque também o comentário do cabeçalho do arquivo por: `// Publica o rascunho: valida (inclusive a conta conectada e os blocos da fase 3), copia para published, sobe a versão e prende a conta.`

- [ ] **Step 5: Status route**

```ts
// apps/web/src/app/api/ig/flows/[id]/status/route.ts
import { z } from "zod";
import { requireInstagram } from "@/lib/ig/access";
import { isUuid } from "@/lib/ig/flow/body";
import { assertPermission } from "@/lib/permissions";
import { getAccount } from "@/lib/stores/ig-accounts";
import { getFlow, setFlowStatus } from "@/lib/stores/ig-flows";
import { stopActiveRuns } from "@/lib/stores/ig-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corpoSchema = z.strictObject({ status: z.enum(["live", "paused"]) });

// POST /api/ig/flows/[id]/status — o interruptor "No ar". Pausar para os runs em andamento;
// retomar exige a conta conectada.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireInstagram(req);
    assertPermission(ctx.role, "campaign:edit");
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    const parsed = corpoSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Corpo inválido." }, { status: 400 });
    const flow = await getFlow(ctx.tenantId, id);
    if (!flow) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    if (!flow.published) return Response.json({ error: "Publique o fluxo antes de ligar." }, { status: 409 });
    if (parsed.data.status === "live") {
      const conta = await getAccount(ctx.tenantId);
      if (conta?.status !== "active") return Response.json({ error: "Conecte o Instagram pra pôr no ar." }, { status: 409 });
    }
    const atualizado = await setFlowStatus(ctx.tenantId, id, parsed.data.status);
    if (!atualizado) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    if (parsed.data.status === "paused") await stopActiveRuns(ctx.tenantId, id);
    return Response.json({ flow: atualizado });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

- [ ] **Step 6: Disconnect stops runs**

Em `account/route.ts`, importe `import { stopActiveRuns } from "@/lib/stores/ig-runs";` e, logo depois de `await pauseLiveFlows(ctx.tenantId);`, acrescente `await stopActiveRuns(ctx.tenantId);`.

- [ ] **Step 7: Hook**

Em `use-fluxo.ts`, antes do `return` final:

```ts
  /** Interruptor "No ar". Devolve a mensagem de erro, ou `null` quando mudou. */
  const mudarEstado = useCallback(
    async (status: "live" | "paused"): Promise<string | null> => {
      try {
        const r = await fetch(`/api/ig/flows/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
        const corpo = (await r.json().catch(() => null)) as { flow?: FlowRow; error?: string } | null;
        if (!r.ok || !corpo?.flow) return corpo?.error ?? "Não deu pra mudar o estado. Tente de novo.";
        const novo = corpo.flow;
        setFlow((atual) => (atual ? { ...novo, name: atual.name, draft: atual.draft } : novo));
        return null;
      } catch {
        return "Sem conexão. Tente de novo.";
      }
    },
    [id],
  );
```

e inclua `mudarEstado` no objeto devolvido.

- [ ] **Step 8: Editor**

Em `editor.tsx`:

1. Importe `import { foraDaFase } from "@/lib/ig/flow/fase";` e `import { Interruptor } from "./interruptor";`.
2. Pegue `mudarEstado` de `useFluxo(id)`.
3. Em `issuesDoCliente`, troque o `validateFlow(...)` por `[...validateFlow(flow.draft, {...}), ...foraDaFase(flow.draft)]` (mesmos argumentos).
4. Depois de `<span className="ml-auto sm:ml-0"><ChipEstado status={flow.status} /></span>`, acrescente:

```tsx
        {flow.published && (
          <Interruptor
            ligado={flow.status === "live"}
            rotulo="No ar"
            desabilitado={publicando}
            aoMudar={(ligado) => {
              void mudarEstado(ligado ? "live" : "paused").then((erro) => {
                if (erro) toast(erro, "error");
                else toast(ligado ? "Fluxo no ar." : "Fluxo pausado.", "success");
              });
            }}
          />
        )}
```

- [ ] **Step 9: Gate local**

Run: os sete comandos do gate. O e2e da fase 1 continua valendo: a receita "Comentou, segue e entra no grupo" agora tem issues de `fase_seguinte` além de "Conecte o Instagram pra publicar." (a lista "Pra publicar" mostra as duas; o aviso do topo mostra a primeira, que continua sendo a de validação).
Expected: verde.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/lib/stores/ig-flows.ts apps/web/src/lib/stores/ig-flows.test.ts "apps/web/src/app/api/ig/flows/[id]/publish/route.ts" "apps/web/src/app/api/ig/flows/[id]/status/route.ts" apps/web/src/app/api/ig/account/route.ts apps/web/src/components/painel/instagram/use-fluxo.ts apps/web/src/components/painel/instagram/editor.tsx
git commit -m "feat(ig): publish binds the account and rejects phase 3 blocks; on-air switch pauses and resumes"
```

### Gate H e Entrega

- [ ] `pwsh -File infra/scripts/verify-local.ps1` verde.
- [ ] Antes do merge: `ZERNIO_API_KEY` e `ZERNIO_WEBHOOK_SECRET` cadastradas na Vercel (Production e Preview, Sensitive). Sem elas o webhook responde 401 a tudo e "Conectar" devolve 503.
- [ ] `git push -u origin feat/ig-engine` e abra o PR:

```
PR H da fase 2 dos Fluxos do Instagram (docs/superpowers/plans/2026-10-06-instagram-fluxos-fase2.md, Tasks 12–17).

- `POST /api/ig/webhook`: assinatura, evento em zod, run idempotente por `source_id`, primeiro passo na mesma requisição, 202 para o que não é nosso, 500 só quando vale reenvio.
- Motor (`lib/ig/engine`): receitas de um direct (resposta pública + privada depois de comentário; direct na conversa depois de direct/story), proteções (24 h por pessoa, 700/h por conta, janela, ciclo, `privateReplyConsumed`), retenção de 90 dias.
- Publicar exige conta conectada e recusa blocos da fase 3 (`fase_seguinte`); grava `ig_account_id`.
- Interruptor "No ar" (`POST /api/ig/flows/[id]/status`): pausar para os runs; desconectar também.
- `infra/scripts/zernio-webhook.mjs` para criar o webhook na Zernio (uma vez por ambiente).

Sem migração. Precisa de `ZERNIO_API_KEY` e `ZERNIO_WEBHOOK_SECRET` na Vercel.
```

- [ ] **Depois do merge e do deploy, o webhook na Zernio (uma vez; no PowerShell, lendo o `.env.local` do worktree sem imprimir nada):**

```powershell
Get-Content apps/web/.env.local | ForEach-Object { if ($_ -match '^(ZERNIO_API_KEY|ZERNIO_WEBHOOK_SECRET)=(.+)$') { Set-Item -Path "env:$($matches[1])" -Value $matches[2] } }
node infra/scripts/zernio-webhook.mjs create https://app.girumo.com.br/api/ig/webhook girumo-prod
node infra/scripts/zernio-webhook.mjs list
```

O `ZERNIO_WEBHOOK_SECRET` do `.env.local` tem que ser **o mesmo** cadastrado na Vercel.

- [ ] **Prova em produção (spec §16, "pronto quando"):** na VIREI MODA (conta conectada no Gate F), abrir o fluxo "Comentou, entra no grupo" (ou criar um), pôr `quero` nas palavras, escolher a campanha, "Publicar" (agora libera). Com `@igortoled0`, comentar `quero` num post da `@vireimoda`: em menos de 5 s chega a resposta pública no post e o direct com `…/r/<slug>?ig=<ref>`. Depois mandar `quero` no direct da `@vireimoda` por outra conta (ou apagar o run da pessoa) e receber o convite. Conferir:

```sql
select source_kind, matched_keyword, status, node_id, error_code, started_at, finished_at from public.ig_runs where tenant_id = '47c280cb-702a-445d-997e-8eea2f8fd173' order by started_at desc limit 5;
select node_id, "out", occurred_at from public.ig_run_steps where tenant_id = '47c280cb-702a-445d-997e-8eea2f8fd173' order by occurred_at desc limit 5;
```

- [ ] Quadro, com a prova:

```sql
select public.move_card('ig-webhook-receiver', 'no_ar_verificado', 'Webhook da Zernio assinado, run idempotente, primeiro passo na mesma requisição.', '<data/hora + linha do ig_runs>');
select public.move_card('ig-comentario-dm', 'no_ar_verificado', 'Comentário "quero" na @vireimoda virou resposta pública + direct com o link em < 5 s.', '<data/hora + linha do ig_runs>');
select public.move_card('ig-dm-resposta', 'no_ar_verificado', 'Direct "quero" na @vireimoda recebeu o convite.', '<data/hora + linha do ig_runs>');
select public.move_card('ig-keyword-matcher', 'no_ar_verificado', 'matchKeyword em produção dentro do motor (select-flow).', '<data/hora + linha do ig_runs>');
update public.board_features set blocker = null, updated_at = now() where key in ('ig-webhook-receiver', 'ig-comentario-dm', 'ig-dm-resposta', 'ig-keyword-matcher', 'ig-oauth-conexao');
```

- [ ] Mergear e abrir a branch do PR I a partir de `origin/main`.

---

## PR I — aba "Atendimentos" e o teto no painel

Branch: `feat/ig-atendimentos`. Entrega: no fluxo, a aba "Atendimentos" lista quem chamou (pessoa, de onde veio, quando, o que aconteceu, com o erro traduzido); a lista avisa quando a conta bateu no teto da hora.

### Task 18: `GET /api/ig/flows/[id]/runs` e o teto no status

**Files:**
- Create: `apps/web/src/lib/ig/limites.ts`
- Modify: `apps/web/src/lib/ig/engine/handle-event.ts` (usa a constante)
- Create: `apps/web/src/app/api/ig/flows/[id]/runs/route.ts`
- Modify: `apps/web/src/app/api/ig/status/route.ts`

**Interfaces:**
- Consumes: `listRuns`, `countRunsStartedSince` (Task 10), `traduzErro` (Task 2), `requireInstagram`, `isUuid`, `getFlow`, `getAccount`.
- Produces: `TETO_RUNS_POR_HORA = 700`; `GET /api/ig/flows/[id]/runs → { runs: Atendimento[] }` com `Atendimento = { id; username; igUserId; sourceKind; matchedKeyword; status; nodeId; errorCode; errorText; startedAt; finishedAt }`; `GET /api/ig/status` ganha `startedLastHour: number`.

- [ ] **Step 1: A constante compartilhada**

```ts
// apps/web/src/lib/ig/limites.ts
/** A Meta permite 750 respostas privadas por hora por conta; o motor para em 700 e o painel avisa. */
export const TETO_RUNS_POR_HORA = 700;
```

Em `handle-event.ts`, apague `const TETO_POR_HORA = 700;` e use `import { TETO_RUNS_POR_HORA } from "@/lib/ig/limites";` (troque o nome na comparação). Rode `handle-event.test.ts` de novo.

- [ ] **Step 2: A rota dos atendimentos**

```ts
// apps/web/src/app/api/ig/flows/[id]/runs/route.ts
import { requireInstagram } from "@/lib/ig/access";
import { isUuid } from "@/lib/ig/flow/body";
import { traduzErro } from "@/lib/ig/transport/erros";
import { getFlow } from "@/lib/stores/ig-flows";
import { listRuns, type RunRow } from "@/lib/stores/ig-runs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type Atendimento = {
  id: string;
  username: string | null;
  igUserId: string;
  sourceKind: RunRow["source_kind"];
  matchedKeyword: string | null;
  status: RunRow["status"];
  nodeId: string | null;
  errorCode: string | null;
  /** Já traduzido: a tela não conhece os códigos. */
  errorText: string;
  startedAt: string;
  finishedAt: string | null;
};

const paraTela = (r: RunRow): Atendimento => ({
  id: r.id,
  username: r.username,
  igUserId: r.ig_user_id,
  sourceKind: r.source_kind,
  matchedKeyword: r.matched_keyword,
  status: r.status,
  nodeId: r.node_id,
  errorCode: r.error_code,
  errorText: traduzErro(r.error_code),
  startedAt: r.started_at,
  finishedAt: r.finished_at,
});

// GET /api/ig/flows/[id]/runs — os últimos 50 atendimentos do fluxo. Leitura: qualquer papel da loja.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireInstagram(req);
    const { id } = await params;
    if (!isUuid(id)) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    const flow = await getFlow(ctx.tenantId, id);
    if (!flow) return Response.json({ error: "Fluxo não encontrado." }, { status: 404 });
    const runs = await listRuns(ctx.tenantId, id);
    return Response.json({ runs: runs.map(paraTela) });
  } catch (e) {
    if (e instanceof Response) return e;
    throw e;
  }
}
```

- [ ] **Step 3: O teto no status**

Em `status/route.ts`, importe `import { countRunsStartedSince } from "@/lib/stores/ig-runs";` e troque o retorno liberado:

```ts
    const [account, flows] = await Promise.all([getAccount(ctx.tenantId), listFlows(ctx.tenantId)]);
    const startedLastHour = account ? await countRunsStartedSince(ctx.tenantId, account.id, new Date(Date.now() - 3_600_000).toISOString()) : 0;
    return Response.json({
      enabled: true,
      account: account ? { username: account.username, status: account.status } : null,
      live: flows.filter((f) => f.status === "live").length,
      startedLastHour,
    });
```

- [ ] **Step 4: Type-check and tests**

Run: `npm --workspace apps/web test` e os dois `tsc`.
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/ig/limites.ts apps/web/src/lib/ig/engine/handle-event.ts "apps/web/src/app/api/ig/flows/[id]/runs/route.ts" apps/web/src/app/api/ig/status/route.ts
git commit -m "feat(ig): runs endpoint with translated errors; hourly cap in status"
```

### Task 19: a aba no editor, o aviso do teto na lista, e2e

**Files:**
- Create: `apps/web/src/components/painel/instagram/atendimentos.tsx`
- Modify: `apps/web/src/components/painel/instagram/editor.tsx` (abas)
- Modify: `apps/web/src/components/painel/casca-context.tsx` (`startedLastHour`)
- Modify: `apps/web/src/components/painel/instagram/lista.tsx` (aviso do teto)
- Modify: `apps/web/e2e/painel-instagram.spec.ts`

**Interfaces:**
- Consumes: `buscar` (`@/lib/painel/carregar`), `Carga` (`@/lib/painel/types`), `Atendimento` (Task 18, só o tipo), `TETO_RUNS_POR_HORA`, `StatusInstagram`.
- Produces: `<Atendimentos id />`; `StatusInstagram.startedLastHour: number`.

- [ ] **Step 1: O componente**

```tsx
// apps/web/src/components/painel/instagram/atendimentos.tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import type { Atendimento } from "@/app/api/ig/flows/[id]/runs/route";
import { buscar } from "@/lib/painel/carregar";
import type { Carga } from "@/lib/painel/types";

type Resposta = { runs: Atendimento[] };
const valida = (corpo: unknown): corpo is Resposta => !!corpo && typeof corpo === "object" && Array.isArray((corpo as Resposta).runs);

const ORIGEM: Record<Atendimento["sourceKind"], string> = { comment: "Comentário", dm: "Direct", story: "Story" };
const ESTADO: Record<Atendimento["status"], string> = { queued: "Na fila", active: "Esperando", done: "Enviado", stopped: "Parado", failed: "Falhou" };

function dataCurta(iso: string): string {
  const d = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, "0");
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)} ${dois(d.getHours())}:${dois(d.getMinutes())}`;
}

/** Quem chamou neste fluxo, do mais recente. Só o que o banco guarda: @, origem, palavra, estado. */
export function Atendimentos({ id }: { id: string }) {
  const [lista, setLista] = useState<Atendimento[]>([]);
  const [carga, setCarga] = useState<Carga>("carregando");
  const carregar = useCallback(() => buscar<Resposta>(`/api/ig/flows/${id}/runs`, valida, (r) => setLista(r.runs), setCarga), [id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  return (
    <section aria-label="Atendimentos" className="rounded-[10px] border border-line-200 bg-paper-0">
      {carga === "carregando" && <span role="status" aria-label="Carregando atendimentos" className="pn-skeleton m-5 block h-5 w-64 rounded-[var(--radius-chip)]" />}
      {carga === "erro" && (
        <p className="px-5 py-8 text-center text-13 text-slate-600">
          Não deu pra carregar os atendimentos.{" "}
          <button type="button" onClick={() => void carregar()} className="text-cobalt-500">Tentar de novo</button>
        </p>
      )}
      {carga === "ok" && lista.length === 0 && (
        <p className="px-5 py-8 text-center text-13 text-slate-600">Ninguém chamou ainda. Quando alguém comentar ou mandar a palavra, aparece aqui.</p>
      )}
      {carga === "ok" && lista.length > 0 && (
        <table className="w-full text-13">
          <thead>
            <tr className="border-b border-line-200 text-left text-12 text-slate-600">
              <th scope="col" className="px-5 py-2.5 font-medium">Pessoa</th>
              <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Veio de</th>
              <th scope="col" className="hidden px-3 py-2.5 font-medium sm:table-cell">Quando</th>
              <th scope="col" className="px-3 py-2.5 font-medium">O que aconteceu</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => (
              <tr key={a.id} className="border-b border-line-200 last:border-0">
                <td className="px-5 py-3 font-medium text-volt-950">{a.username ? `@${a.username}` : "Sem @"}</td>
                <td className="hidden px-3 py-3 text-slate-600 sm:table-cell">
                  {ORIGEM[a.sourceKind]}
                  {a.matchedKeyword ? ` · “${a.matchedKeyword}”` : ""}
                </td>
                <td className="hidden px-3 py-3 text-slate-600 sm:table-cell">{dataCurta(a.startedAt)}</td>
                <td className="px-3 py-3">
                  <span className={a.status === "failed" ? "text-danger-700" : a.status === "done" ? "text-success-700" : "text-slate-600"}>{ESTADO[a.status]}</span>
                  {a.status === "failed" && a.errorText && <span className="block text-12 text-slate-600">{a.errorText}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
```

- [ ] **Step 2: As abas no editor**

Em `editor.tsx`:

1. `import { Atendimentos } from "./atendimentos";` e `const ABAS = [["roteiro", "Roteiro"], ["atendimentos", "Atendimentos"]] as const;`.
2. Estado: `const [aba, setAba] = useState<(typeof ABAS)[number][0]>("roteiro");`.
3. Troque `<span className="flex h-11 items-center border-b-2 border-volt-950 text-13 font-medium text-volt-950">Roteiro</span>` por:

```tsx
        <div role="tablist" aria-label="Abas do fluxo" className="flex h-11 items-center gap-4">
          {ABAS.map(([chave, texto]) => (
            <button
              key={chave}
              type="button"
              role="tab"
              aria-selected={aba === chave}
              onClick={() => setAba(chave)}
              className={cn("flex h-11 items-center border-b-2 text-13", aba === chave ? "border-volt-950 font-medium text-volt-950" : "border-transparent text-slate-600 hover:text-volt-950")}
            >
              {texto}
            </button>
          ))}
        </div>
```

4. O bloco "Ver como" (`<div className="flex items-center gap-2">…</div>`) só aparece com `aba === "roteiro"`: envolva em `{aba === "roteiro" && ( … )}`.
5. O `<div className="grid flex-1 …">` do roteiro fica dentro de `{aba === "roteiro" ? ( … ) : ( <div className="flex-1 p-4 lg:p-6"><Atendimentos id={id} /></div> )}`.

- [ ] **Step 3: `startedLastHour` na casca e o aviso na lista**

Em `casca-context.tsx`: `StatusInstagram` ganha `startedLastHour: number;`; `DESLIGADO` ganha `startedLastHour: 0`; no `.then((raw) => …)` acrescente `startedLastHour: Number(raw.startedLastHour) || 0` ao objeto montado.

Em `lista.tsx`, importe `import { TETO_RUNS_POR_HORA } from "@/lib/ig/limites";` e, logo depois de `<div className="mt-2"><ContaDoInstagram /></div>`:

```tsx
          {instagram.startedLastHour >= TETO_RUNS_POR_HORA && (
            <p role="status" className="mt-2 text-13 font-medium text-warning-700">
              Teto de {TETO_RUNS_POR_HORA} pessoas por hora atingido. Quem comentar agora fica sem direct até a hora virar.
            </p>
          )}
```

- [ ] **Step 4: e2e**

No primeiro teste de `painel-instagram.spec.ts`, depois de `await expect(page.getByRole("heading", { name: "Roteiro" })).toBeVisible();` (a segunda ocorrência, após voltar pro passo a passo):

```ts
      await page.getByRole("tab", { name: "Atendimentos" }).click();
      await expect(page.getByRole("region", { name: "Atendimentos" })).toBeVisible();
      await expect(page.getByText(/Ninguém chamou ainda/)).toBeVisible();
      await page.getByRole("tab", { name: "Roteiro" }).click();
      await expect(page.getByRole("heading", { name: "Roteiro" })).toBeVisible();
```

- [ ] **Step 5: Gate local**

Run: os sete comandos do gate.
Expected: verde.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/components/painel/instagram/atendimentos.tsx apps/web/src/components/painel/instagram/editor.tsx apps/web/src/components/painel/casca-context.tsx apps/web/src/components/painel/instagram/lista.tsx apps/web/e2e/painel-instagram.spec.ts
git commit -m "feat(ig): Atendimentos tab in the flow editor and hourly cap notice"
```

### Task 20: Gate I, prova e quadro

- [ ] `pwsh -File infra/scripts/verify-local.ps1` verde.
- [ ] `git push -u origin feat/ig-atendimentos` e abra o PR:

```
PR I da fase 2 dos Fluxos do Instagram (docs/superpowers/plans/2026-10-06-instagram-fluxos-fase2.md, Tasks 18–20). Fecha a fase 2.

- Aba "Atendimentos" no fluxo (`GET /api/ig/flows/[id]/runs`): pessoa, de onde veio, quando, o que aconteceu, erro traduzido.
- `GET /api/ig/status` com `startedLastHour`; a lista avisa ao bater em 700/h.

Sem migração.
```

- [ ] **Prova em produção:** abrir o fluxo da VIREI MODA usado no Gate H, aba "Atendimentos", ver os atendimentos da prova (`@igortoled0`, Comentário · "quero", Enviado). Print.
- [ ] Quadro:

```sql
update public.board_features
   set blocker = 'Fase 2 no ar (06/10): conexão, webhook, motor de um direct, pausar/retomar, Atendimentos. Retenção de 90 dias roda no webhook (purgeOldRuns). Fase 3 (espera, segue a loja?, clique, lembrete, números) não começou.',
       updated_at = now()
 where key = 'ig-flag-refresh-retencao';
```

- [ ] Mergear. Encerrar a sessão com "PRs que deixei abertos: nenhum" e o `rag insert` da decisão (abaixo).

```powershell
rag insert "decisão 2026-10: Fluxos do Instagram fase 2 no ar via Zernio (plano docs/superpowers/plans/2026-10-06-instagram-fluxos-fase2.md): PR F conexão (perfil por loja, state assinado, conta confirmada pela API), PR G assinatura/eventos/escolha/runs, PR H webhook + motor de um direct + publicar com conta + interruptor, PR I Atendimentos. Decisões: story dispara sem palavra quando storyReplies está ligado; ig_user_id guarda zernio:<accountId>; blocos da fase 3 recebem issue fase_seguinte e não publicam; retenção de 90 dias no próprio webhook; run na fila há 2 min é retomado por reenvio." --source decisao-2026-10-instagram-fase2
```

## O que fica para as próximas fases (não faça agora)

- **Fase 3:** `message.received` de quem tem run `active` esperando resposta avança o run (`advance(run, "reply")`); para isso o run precisa guardar a conversa: **migração** com `ig_runs.conversation_id text` (gravar no primeiro `message.received` da pessoa; a resposta privada não devolve conversa). Condição "segue a loja?" por `GET /v1/accounts/{id}/follow-status/{userId}?refresh=true`. Clique atribuído em `handleShortLinkClick` (`?ig=<ref>`, dentro do `after()` que já existe). Relógio: `POST /api/ig/tick` em `ENGINE_ONLY`, chamado pelo worker. Números por passo a partir de `ig_run_steps`. Os passos gravados nesta fase já servem.
- **Fase 4:** cobrança (Stripe, R$ 297/mês + R$ 200 na primeira fatura) ligando `tenant_settings.instagram_enabled` sozinha; até lá a liberação é por SQL.
- **Fase 5:** mapa editável.
- Política de privacidade citando a Zernio como suboperadora dos directs (antes da venda).

## Auto-revisão do plano (feita em 06/10)

**Cobertura do spec (fase 2 em §16):**

| Spec | Onde |
|---|---|
| §5 transporte com duas implementações | Tasks 1–2 |
| §8.1 passos 1–4 (assinatura, tenant por `accountId`, tradução, run + primeiro passo na mesma requisição, 200/202/500) | Tasks 7, 8, 15, 16 |
| §8.1 "fluxo de post específico ganha; depois palavra mais longa" | Task 9 |
| §8.1 `account.connected` / `account.disconnected` | Task 15 |
| §8.2 resposta pública, direct (privada vs conversa), convite com `…?ig=<ref>`, passos, `Idempotency-Key` | Tasks 13, 14 |
| §8.3 24 h por pessoa, retomada após 2 min, `privateReplyConsumed`, teto 700/h, janela, ciclo, `error_code` cru, pausado para os runs | Tasks 10, 14, 15, 17, 18 |
| §9 conexão (perfil, `state`, callback ignora a query, desconectar pausa, `account.disconnected` → `expired`) | Tasks 3, 4, 5, 15 |
| §9 webhook único criado uma vez | Task 16 (script) |
| §10 abas "Roteiro" e "Atendimentos"; interruptor "no ar" | Tasks 17, 19 |
| §13 segurança (HMAC tempo constante, 202, `state` + sessão, chave só servidor, filtro de tenant, retenção) | Tasks 4, 5, 7, 10, 16 |
| §14 variáveis novas | Tasks 2, 5 |
| §15 testes (puros, stores com PostgREST falso, e2e, prova em produção) | cada Task; Gates F, H, I |
| Apêndice (contrato) | tabela no início deste plano |

Fora da fase 2 de propósito (§16): espera por resposta, "segue a loja?", clique, lembrete, números — bloqueados na publicação pela Task 12 e listados em "próximas fases".

**Placeholders:** nenhum "TBD"/"TODO"; todo passo de código tem o código; os `<data/hora + linha do ig_runs>` nos `move_card` são o que o executor preenche com a prova colhida na hora (o banco exige).

**Consistência de tipos:** `Transport` (Task 1) é o que `fake.ts` (2), `advance` (14), `tratarEvento` (15) e as rotas (5, 16) usam; `ZernioError.transient`/`privateReplyConsumed` são lidos em 14 e 15; `FluxoNoAr = { id; version; published }` (9) bate com `listLiveFlows` (16); `NovoRun`/`RunRow`/`RunPatch` (10) batem com `Ambiente.runs` (15) e com a rota (16); `RunState`/`Resultado` (14) batem com o uso em 15; `Atendimento` (18) é o que a aba (19) lê; `IssueCode` ganha `fase_seguinte` (12) antes de `foraDaFase` ser usado em 17; `publishFlow` muda de assinatura em 17 junto com o único chamador e o teste; `StatusInstagram.startedLastHour` (19) bate com a rota (18).
