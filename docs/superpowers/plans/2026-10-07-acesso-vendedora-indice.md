# Acesso da vendedora — índice dos planos e contrato entre PRs

**Spec:** `docs/superpowers/specs/2026-10-07-acesso-vendedora-design.md`
**Mockup:** https://claude.ai/artifact/UdVL13GDUZU9ggZo4pjGsC

Cada PR tem o próprio plano. Este arquivo fixa o que um PR **produz** e o seguinte **consome** — nomes,
assinaturas, tipos e caminhos. Um plano não inventa nome fora daqui; se precisar de algo novo que outro
PR use, o nome entra aqui primeiro.

| # | Plano | Branch | Depende de (mergeado em `main`) |
|---|---|---|---|
| 1 | `2026-10-07-acesso-vendedora-pr1-pedido-no-tenant-certo.md` | `fix/orders-tenant-da-rota` | — |
| 2 | `2026-10-07-acesso-vendedora-pr2-banco.md` | `feat/vendedora-banco` | — |
| 3 | `2026-10-07-acesso-vendedora-pr3-guard-de-modulo.md` | `feat/vendedora-guard` | 2 (aplicado em dev **e** prod) |
| 4 | `2026-10-07-acesso-vendedora-pr4-api-de-vendas.md` | `feat/vendas-api` | 1, 2, 3 |
| 5A | `2026-10-07-acesso-vendedora-pr5-tela-de-vendas.md` — Tasks 0–5 (tela, 8 arquivos) | `feat/vendas-tela` | 4 |
| 5B | idem — Tasks 6–9 (menu por módulo, casca e guarda, 10 arquivos) | `feat/vendedora-casca` | 5A |
| 5C | idem — Tasks 10–11 (upload por token assinado + E2E da vendedora, 4 arquivos) | `feat/vendedora-e2e` | 5B |
| 6 | `2026-10-07-acesso-vendedora-pr6-equipe.md` | `feat/equipe-vendedora` | 3 (para começar) · 5C (para mergear) |

O plano do PR 5 passou de 22 arquivos e foi cortado em três PRs (decidido em 08/10); cada um roda a
Task 0 e a Task 13 do plano (branch e card no começo; verificação, PR e quadro no fim), e o 5C roda
também a Task 12 (visual + mutante).

1 e 2 em paralelo. 5A–5C e 6 se **desenvolvem** em paralelo, mas o 6 **mergeia por último**: ele é o
interruptor que deixa o dono convidar vendedora, e convidar antes da tela, da casca e do upload existirem
deixaria a vendedora num painel quebrado. Toda branch nasce de `origin/main` atualizado, num worktree
próprio — **nunca** em cima de outra branch de feature (regra de PR do `CLAUDE.md`).

**Atenção no 5C:** a Task 10 troca o upload de mídia de *todo mundo* (dono incluído, vídeo grande
incluído — ver #301) para token assinado emitido no `/api/media/prepare`. Motivo: o PR 2 tira a
vendedora de `app.has_membership`, que é o que as policies de `storage.objects` usam. Antes do merge,
provar em preview que o dono continua subindo foto e vídeo; depois do merge, provar em prod.

## Regras que valem para os seis

- Código, identificadores e commits em inglês; texto de tela e de erro em pt-BR. Commits com prefixo
  semântico e terminando em `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Em `apps/web`:
  - unit: `npx tsx --import ./src/test/server-only-shim.mjs --test <arquivo>`
  - tipos (os **dois**; lint e tsx não checam tipo): `npx tsc --noEmit -p tsconfig.json` e `npx tsc --noEmit -p tsconfig.e2e.json`
  - lint: `npm run lint` · suíte: `npm test`
- Antes do push: `infra/scripts/verify-local.ps1` (secrets + build) — é o gate real; o `verify` do CI é
  pulado na `main`.
- Nunca `git add -A`. `git diff --cached --stat` numa chamada separada antes de cada commit.
- Store Supabase: **sempre** `.eq("tenant_id", tenantId)` — o service-role ignora RLS.
- Ao **começar** cada PR, mover o card no quadro de prod; ao terminar, `move_card` com prova +
  `update ... set blocker = null`:
  ```sql
  select public.move_card('acesso-vendedora', 'em_construcao', 'PR N começou: <o quê>', '<branch>');
  ```
  DML em prod passa pelo Igor (o classificador barra). O plano lista o SQL; não pular.
- Fechar o loop na mesma sessão: revisar → CI verde → mergear → apagar branch. Ao encerrar:
  "PRs que deixei abertos: …".

## Contrato

### PR 1 → PR 4

`apps/web/src/lib/stores/orders.ts`
```ts
export async function addOrder(tenantId: string, input: {
  phone?: string; leadId?: string; group?: string; campaignId?: string; value: number;
}): Promise<Order>;
/** true só se uma linha foi apagada. */
export async function removeOrder(tenantId: string, id: string): Promise<boolean>;
```
`getTenantId()` local some. `lib/session.ts` perde `getSessionTenantId` (sem chamador).
`POST /api/orders` recusa `leadId` que não é do tenant: 400 `{ error: "Contato não encontrado." }`.

### PR 2 → PR 3, 4, 6

Banco (dev e prod):
- `public.member_role` ganha `'seller'`.
- `public.memberships.modules text[] not null default '{}'` com
  `check (modules <@ array['postar']::text[] and (role = 'seller' or modules = '{}'))`
  (constraint `memberships_modules_validos`).
- `public.orders.created_by uuid null references auth.users(id) on delete set null` + índice
  `orders_tenant_created_by_idx (tenant_id, created_by, created_at desc)`.
- `public.order_items (id, tenant_id, order_id, position, name, quantity, unit_price, created_at)`,
  RLS ligado, select no padrão de `orders` (`tenant_id = any (app.user_tenant_ids())`), escrita só
  service-role.
- Helpers de leitura do RLS que não filtram papel (`app.user_tenant_ids()`, `app.has_membership(...)`
  e outros achados em prod) passam a excluir `seller` (`and m.role <> 'seller'`): a vendedora não tem
  acesso `authenticated` a nada. Ver spec §1 "RLS".
- RPCs (`security invoker`, `set search_path = ''`, execute só `service_role`):
  ```sql
  public.create_order_with_items(
    p_tenant_id uuid, p_created_by uuid, p_lead_id uuid, p_phone text,
    p_group_name text, p_campaign_id uuid, p_items jsonb
  ) returns public.orders
  public.replace_order_items(
    p_tenant_id uuid, p_order_id uuid, p_items jsonb, p_only_author uuid
  ) returns public.orders
  ```
  `p_items`: `[{ "name": text, "quantity": int, "unit_price": numeric }]`, 1..50 itens, na ordem
  (vira `position`). Erros com `raise exception` e estas mensagens exatas, que a API traduz:
  `itens_invalidos` (vazio, > 50, campo fora do limite), `total_zero` (soma ≤ 0),
  `pedido_nao_encontrado`, `fora_da_janela` (com `p_only_author`: não é o autor ou passou de 24h).

### PR 3 → PR 4, 5, 6

`apps/web/src/lib/permissions.ts`
```ts
export type TenantRole = "owner" | "admin" | "operator" | "seller";
// Action ganha "message:send": ["owner", "admin", "operator", "seller"]. seller não entra em nenhuma outra.
```
`tenant-context.ts` e `member-removal.ts` passam a importar `TenantRole` daqui.

`apps/web/src/lib/auth/modulos.ts` (sem `server-only`: o cliente usa)
```ts
export const MODULOS_OPCIONAIS = ["postar"] as const;
export type ModuloOpcional = (typeof MODULOS_OPCIONAIS)[number];
export type Modulo = "vendas" | ModuloOpcional;
export type Acesso = { role: TenantRole; modules: readonly ModuloOpcional[] };

/** Filtra para os módulos opcionais conhecidos, sem repetição. Lixo vira []. */
export function parseModulos(raw: unknown): ModuloOpcional[];
/** seller → ["vendas", ...modules]; outros papéis → []. */
export function modulosDoAcesso(acesso: Acesso): Modulo[];
/** Papel ≠ seller → true. seller → rota da base ou de um módulo liberado, com o método certo. */
export function podeAcessar(acesso: Acesso, pathname: string, method: string): boolean;
/** Mesmo princípio para páginas do /painel. */
export function paginaLiberada(acesso: Acesso, pathname: string): boolean;
/** Para o teste estrutural cruzar com os route.ts reais. */
export const ROTAS: Readonly<Record<Modulo | "base", ReadonlyArray<{ padrao: string; metodos: readonly string[] }>>>;
export const PAGINAS: Readonly<Record<Modulo, readonly string[]>>;
export const MENSAGEM_BLOQUEIO = "Área não liberada para o seu acesso.";
```
Mapa da v1 (o `*` casa exatamente um segmento):
- `base`: `GET /api/auth/me`
- `vendas`: `GET /api/vendas/contato` · `GET, POST /api/vendas` · `PATCH, DELETE /api/vendas/*` — páginas `/painel/vendas`
- `postar`: `GET /api/campanhas` · `GET /api/groups` · `GET /api/disparos` · `GET /api/session` ·
  `GET /api/library` · `POST /api/campanhas/*/messages` · `POST /api/media/prepare` ·
  `POST /api/media/register` — páginas `/painel/disparos`

Contextos:
```ts
// lib/supabase/tenant-context.ts
export type TenantContext = { authUserId: string; email: string | null; tenantId: string;
  role: TenantRole; modules: ModuloOpcional[] };
// lança new Response(MENSAGEM_BLOQUEIO, { status: 403 }) quando !podeAcessar

// lib/route-tenant-context.ts
export type RouteTenantContext = { tenantId: string; actor: "engine" | "user";
  role: TenantRole | null; authUserId: string | null; modules: ModuloOpcional[] };
// engine: authUserId null, modules []

// lib/session-tenant.ts — bloqueado → null
export async function findMembershipTenantId(authUserId: string, req: Request): Promise<string | null>;
export async function resolveSessionTenantId(req: Request): Promise<string | null>;
// findMembershipTenantId lê x-tenant-id, método e path do req. Chamadores: resolveSessionTenantId,
// api/subscription, lib/media-auth.ts (upload do módulo postar), api/agents/copy, api/testimonials.
```

`lib/permissions.ts` também produz, para o PR 6:
```ts
/** Papel convidável; desconhecido ou ausente → null (a rota responde 400 "Função inválida."). */
export function parseInviteRole(raw: unknown): TenantRole | null; // INVITABLE_ROLES nunca inclui "owner"
// PR 3: aceita "admin" | "operator". PR 6: acrescenta "seller".
```

Teste estrutural do PR 3 (`lib/auth/memberships-allowlist.test.ts`): a allowlist inclui
`lib/stores/orders.ts` e `lib/session.ts` com motivo "sai no PR 1", e o teste falha se uma entrada não
cobre nenhuma leitura. **Quem mergear por último entre PR 1 e PR 3 apaga essas duas entradas.**
`api/notifications/alerts` é cron (`CRON_SECRET`) e fica na allowlist. `lib/auth/modulos-rotas.test.ts`
tem `PENDENTES_DO_PR_4` com as três rotas `/api/vendas*`; o PR 4 esvazia o conjunto.
`GET /api/auth/me` → `{ userId, email, tenantId, tenantName, role, modules }`.

`components/painel/role-provider.tsx` → `useRole()` ganha `modules: ModuloOpcional[]` e
`acesso: Acesso | null` (null até carregar).

### PR 4 → PR 5

`apps/web/src/lib/vendas/telefone.ts` (puro)
```ts
/** Dígitos → variantes com/sem 55 e com/sem 9º dígito. null se < 10 dígitos nacionais. */
export function variantesDoTelefone(entrada: string): string[] | null;
/** "55" + DDD + número como digitado (com o 9 se veio com 9). null se inválido. */
export function telefoneCanonico(entrada: string): string | null;
```

Tipos de resposta (`apps/web/src/lib/vendas/tipos.ts`, sem `server-only`):
```ts
export type ItemDeVenda = { nome: string; quantidade: number; valorUnitario: number };
export type ContatoDaVenda = { id: string; nome: string | null; telefone: string };
export type BuscaDeContato = { contato: ContatoDaVenda | null; optout: boolean };
export type VendaDoMes = {
  id: string; cliente: string | null; telefone: string; total: number; criadaEm: string;
  itens: ItemDeVenda[]; editavel: boolean;
};
export type VendasDoMes = { mes: string; total: number; quantidade: number; truncado: boolean;
  vendas: VendaDoMes[] };
```

Rotas:
- `GET /api/vendas/contato?telefone=` → `200 BuscaDeContato` · `400 { error }` · `429 { error }`.
  Número em opt-out → `{ contato: null, optout: true }` mesmo que o lead exista: a tela não oferece
  "cadastrar", e a venda é gravada sem lead.
- `POST /api/vendas` body `{ leadId?, telefone?, nome?, itens: [{ nome, quantidade, valorUnitario: string | number }] }`
  → `201 VendaDoMes` · `400 { error }` · `429 { error }`. Item com valor 0 é válido (brinde); só o total
  da venda precisa ser > 0.
- `GET /api/vendas?mes=YYYY-MM` (default mês corrente em Brasília) → `200 VendasDoMes`
- `PATCH /api/vendas/[id]` body `{ itens }` → `200 VendaDoMes` · `400 { error }` · `403 { error }` · `404`
- `DELETE /api/vendas/[id]` → `200 { ok: true }` · `403 { error }` · `404`

### PR 3 → PR 6

`api/members`:
- `POST` body `{ email, role: "admin" | "operator" | "seller", modules?: ModuloOpcional[] }`; papel
  desconhecido → 400 (o PR 3 já tira o `normalizeRole` permissivo; o PR 6 aceita `seller`).
- `PATCH` body `{ id, modules: ModuloOpcional[] }` → `200 { id, modules }`.
- `GET` devolve `modules` por membro.

## Pendências que só o Igor executa

| Quando | O quê |
|---|---|
| PR 2 | Aplicar as duas migrações em dev e em prod (DDL — o classificador barra) e rodar o advisor |
| Todo PR | `move_card` ao começar e ao terminar (DML em prod) |
| Antes do PR 4 | Medições do §9 do spec (quantos leads têm telefone, policy de `orders`) |
| Todo PR | push, merge e checks (ver `feedback-comandos-de-merge-ao-final`) |
