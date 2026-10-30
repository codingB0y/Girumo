# Recuperar (Yampi) — PR 5 · Cobrança e casca — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vender e liberar o add-on Recuperar (R$ 127/mês) e dar ao módulo a casca no painel: assinatura Stripe separada que liga `tenant_settings.recuperar_enabled`, `requireRecuperar`, liberação manual no admin, "Recuperar" na barra de cima com o contador de "precisa de você", tela Ativar, estado "liberado, falta configurar" e acesso por papel.

**Architecture:** O add-on repete o molde do Instagram (assinatura separada com `metadata.addon`; o webhook liga/desliga a flag pelo estado ATUAL do Stripe), mas generalizando o tratamento de add-on no webhook (`AddonId`) em vez de copiá-lo. A casca lê `GET /api/recuperar/status` (liberado + contador) uma vez por sessão do painel, com polling de 30 s só quando liberado; barra, Mais, guarda de página e a porta do módulo decidem tudo a partir desse estado e do papel. Sem migração: a flag e o guard vêm do PR 1a; a confirmação de privacidade fica em `logs`.

**Tech Stack:** Next 15 (route handlers, client components), TypeScript strict, Supabase (service-role + `.eq('tenant_id')`), Stripe SDK 22 (Checkout, webhook), Zod 4, `node:test` via `tsx`, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-recuperar-yampi-design.md` (seções 3 "Cobrança e liberação", 4 "Telas", 5 "Acesso"). Contrato comum: `docs/superpowers/plans/2026-10-29-recuperar-yampi-00-indice.md`. Molde: `docs/superpowers/specs/2026-10-07-instagram-assinatura-design.md`.

**Comandos usados abaixo** (PowerShell 5.1: um por linha, sem `&&`):
`T` = `npm --workspace apps/web exec tsx -- --import ./src/test/server-only-shim.mjs --test` (caminhos relativos a `apps/web`) ·
`TSC` = `npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json` (e de novo com `tsconfig.e2e.json`) ·
`LINT` = `npm --workspace apps/web run lint`.

## Decisões deste plano (o que o contrato não fixava)

1. **Sem migração.** A confirmação de privacidade vai para `logs` (`event = recuperar.aviso.confirmado`, com texto e versão no `metadata`): `logs` já é a trilha de auditoria do admin e do Stripe e não achei rotina do repo que a apague. Descartada: `tenant_settings.recuperar_aviso_confirmado_em timestamptz` (1 migração; conflita na baseline com os PRs 1b e 2, que também refazem `npm run schema:baseline`). Se o Igor preferir coluna, é um PR à parte.
2. **Só Checkout hospedado.** Sem o "Autorizar cobrança" no cartão salvo que o Instagram tem. Acrescentar quando o checkout atrapalhar a conversão.
3. **A venda só abre com `STRIPE_PRICE_RECUPERAR` na Vercel.** Sem ela a oferta diz "indisponível" e o checkout responde 503. É a chave de liberação deste PR: mergear não vende nada.
4. **Plano "ativo" = `active` ou `trialing`**, como o Instagram (spec do Instagram §2).
5. **Barra de cima: Recuperar só a partir de 1280 px.** Entre 1024 e 1279 px a barra de seis itens já é a que enche o espaço (loja escondida e número só em ponto, `painel-vitrine.css` bloco `@media (min-width: 1024px)`); um sétimo item estoura. Nessa faixa o item mora no Mais, que ganha um ponto quando há quem precise de você. O e2e mede; se 1280 px estourar, trocar `xl` por `2xl` nas duas classes (T10, passo 4).
6. **Rotas do módulo** (contrato para os PRs 7–10): `/painel/recuperar` (Hoje; neste PR mostra "falta configurar"), `/conversas`, `/automatico`, `/scripts`, `/ajustes`. A vendedora alcança só a raiz e `/conversas`; página nova fica fechada para ela por padrão (`PAGINAS_EXATAS`).
7. **Painel de preço em papel, não Volt:** a barra de cima é a única peça Volt do G2; o mockup usa Volt no painel de preço.
8. **Textos:** "número do atendimento" (o mockup diz "da recuperação"); o FAQ do número não promete segurança (`DECISIONS.md`, "Ressalva permanente") e diz que a conexão é não oficial; saiu "sem limite de casos" (o ritmo limita 20→60 conversas novas por dia). Tudo isto e o texto de privacidade ficam para revisão do Igor.
9. **Admin libera à mão sem Stripe** (loja piloto); essa liberação não desliga com o plano (igual ao Instagram à mão). Desligar à mão é recusado se houver assinatura viva no Stripe.

## Antes de começar

- [ ] Worktree novo a partir de `origin/main` (CLAUDE.md global), um por PR: `feat/recuperar-cobranca` (5a) e, depois do merge dele, `feat/recuperar-casca` (5b). Defasagem: `git fetch origin main` e `git log HEAD..origin/main --oneline` com no máximo ~20 linhas.
- [ ] PR 1a em `main` e migrado nos DOIS bancos (dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`). Conferir só-leitura, com `supabase db query --linked` (técnica da memória "SQL nos 2 bancos"):
  - `select column_name from information_schema.columns where table_schema='public' and table_name='tenant_settings' and column_name in ('recuperar_enabled','rastreio_enabled');` → 2 linhas.
  - `select pg_get_constraintdef(oid) from pg_constraint where conname='memberships_modules_validos';` → contém `recuperar`.
  - `select column_name from information_schema.columns where table_schema='public' and table_name='private_conversations' and column_name in ('tenant_id','status');` → 2 linhas; e `select indexdef from pg_indexes where tablename='private_conversations';` → algum índice que comece por `tenant_id`. Sem ele a contagem da T6 varre a tabela a cada 30 s por aba aberta: é correção do 1a, não deste PR.
  - `select tgname from pg_trigger where tgrelid='public.tenant_settings'::regclass and not tgisinternal;` → um trigger que proteja `recuperar_enabled` (como `tenant_settings_guard_instagram_flag`). Quem prova o efeito é o teste da T2; sem o guard, qualquer membro liga o add-on pago pelo PostgREST.
- [ ] Ler `apps/web/AGENTS.md`: o Next deste repo difere do que se conhece. Copiar o padrão dos arquivos do Instagram citados nas tarefas; o que não existir lá, conferir em `node_modules/next/dist/docs/`.

## Global Constraints

Do índice (valem para todo plano):

- TypeScript strict, imports com `@/`, arquivos em `kebab-case`, sem `any` sem justificativa. Nomes de domínio seguem o código (em português, como `reconciliarConexoes`).
- Store com service-role filtra `.eq('tenant_id', …)` sempre: o RLS não protege esse caminho.
- Migração: arquivo novo em `apps/web/supabase/migrations/` + linha no fim de `deploy/supabase/apply-order.txt`; o CI aplica em dev no PR e em prod no merge; baseline com `npm run schema:baseline` (credencial de dev) no mesmo PR; idempotente (`if not exists`); `security definer` sempre com `set search_path`; RLS ligado; policy no padrão `auth.uid()` + `memberships` (`app.has_membership`, `app.user_tenant_ids`), nunca GUC. Nunca DDL à mão. **(Este PR não tem migração.)**
- Função nova: conferir `has_function_privilege` de `anon`, `authenticated` e `public` (o event trigger `ensure_anon_revoked` cobre `anon`/`public`; `authenticated` nasce com EXECUTE pelo default privilege). **(Este PR não cria função SQL.)**
- `hubflow-engine/DECISIONS.md` é vinculante: nada de "digitando", marcar como lida, texto girado, troca de aparelho, proxy.
- O número dos grupos nunca manda DM; o número do atendimento nunca posta em grupo (trava com teste mutante).
- Tipos: rodar os dois `tsc` (web e worker); lint e `tsx --test` não checam tipo.
- Antes do push: `verify-local.ps1` (secrets + build).
- Texto de tela em português do Brasil, design G2 (fonte base 14 px; 12 px só em contador; verde ácido só em Postar/AO VIVO/LOTOU).
- Commit com prefixo semântico em inglês e a linha `Co-Authored-By` do assistente.

Deste PR:

- Rota de usuário nova fica atrás de `getTenantContext`; a de cobrança também atrás de `assertBillingRole` (dono e admin); a do admin atrás de `getAdminContext`. Valores e preço vêm do servidor; o cliente nunca manda preço.
- `npm --workspace apps/web run brand:check` precisa passar: a palavra "hubflow" não aparece em `src/app` nem `src/components`.
- Texto de tela: "número do atendimento", nunca "número da recuperação"; nenhum texto promete que o número não será restringido.
- Vendedora é fechado por padrão: o que não está em `lib/auth/modulos.ts` é 403 (rota) e bloqueio (página).
- Commit: `git commit -m "<mensagem>" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"`.

## Review Focus

As cinco falhas que o spec implica, nenhuma óbvia nos testes de caminho feliz, da mais provável à mais cara. Cada uma tem o teste que a prende na tarefa dona:

1. **Lojista paga e volta ao painel antes do webhook liberar (`?assinado=1`).** Espera ver "Pagamento recebido. Liberando o Recuperar da loja…" e o módulo abrir sozinho, não a oferta de novo. → T9, e2e "ao voltar pago…".
2. **`GET /api/recuperar/status` falha (banco, rede) para quem já paga.** Espera erro com "Tentar de novo"; nunca a oferta de Ativar nem o item sumindo da barra. → T6 (500, não `enabled: false`), T8 (mantém o último estado), T9 (e2e).
3. **Assinatura viva do Recuperar contada como plano.** Bloquearia o checkout do plano, entraria no funil de venda e no aviso de fim de teste. Espera: add-on nunca é plano. → T3.
4. **Membro da loja liga `recuperar_enabled` direto no PostgREST.** Add-on pago de graça. Espera: recusa `42501` e a flag continua falsa. → T2.
5. **Admin desliga à mão uma loja com assinatura viva no Stripe.** O próximo evento do Stripe religa e o admin acha que desligou. Espera: 409 explicando. → T7.

## Estrutura de arquivos

| Arquivo | Responsabilidade | Tarefa |
|---|---|---|
| `lib/auth/modulos.ts` (mod) | módulo `recuperar`: páginas da vendedora, rota do status | T1, T6 |
| `lib/painel/configuracoes.ts` (mod) | rótulo e descrição na Equipe | T1 |
| `lib/stores/tenant-settings.ts` (mod) | `recuperarEnabled`, `setRecuperarEnabled` | T2 |
| `lib/stores/tenant-settings-recuperar.integration.test.ts` | prova do guard da flag (banco de dev) | T2 |
| `lib/billing/stripe-webhook.ts` (mod), `app/api/billing/webhook/route.ts` (mod) | `AddonId`; add-on genérico no webhook | T3 |
| `lib/billing/checkout-session.ts` (mod), `lib/billing/instagram-contexto.ts` (mod) | `temPlanoVivo` ignora todo add-on; `addonNoStripe(…, addon)` | T3 |
| `lib/recuperar/aviso.ts` | texto de privacidade e seu registro em `logs` | T4 |
| `lib/billing/recuperar-addon.ts`, `lib/billing/recuperar-contexto.ts` | preço, metadata, params do checkout, bloqueio; leitura no servidor | T5 |
| `app/api/billing/recuperar/oferta/route.ts`, `…/checkout/route.ts` | oferta e checkout | T5 |
| `lib/recuperar/rotas.test.ts` | harness de Supabase falso para as rotas do módulo | T5, T6 |
| `lib/recuperar/access.ts`, `lib/recuperar/precisa-de-voce.ts`, `app/api/recuperar/status/route.ts` | `requireRecuperar`; contador; status | T6 |
| `lib/recuperar/rotas-guardadas.test.ts` | toda rota do módulo exige o add-on, menos o status | T6 |
| `lib/recuperar/liberacao-admin.ts`, `app/api/admin/tenants/[id]/recuperar/route.ts` | regra e rota da liberação manual | T7 |
| `components/admin/tenant-recuperar.tsx`, `app/admin/tenants/[id]/page.tsx` (mod) | bloco do admin | T7 |
| `lib/painel/casca.ts` (mod), `components/painel/casca-context.tsx` (mod), `lib/painel-nav.ts` (mod) | estado do Recuperar na casca; `liberacoes` | T8, T10 |
| `components/painel/recuperar/*`, `app/painel/recuperar/{layout,page}.tsx` | porta do módulo, Ativar, "falta configurar" | T9 |
| `components/painel/{barra-de-cima,menu-mais,lista-dos-modulos}.tsx` (mod) | item, contador, ponto no Mais | T10 |
| `e2e/recuperar-mocks.ts`, `e2e/painel-recuperar-{ativar,barra}.spec.ts`, `e2e/conteudo-esperado.ts` (mod) | prova de tela | T9, T10 |
| `.env.example`, `infra/scripts/stripe-recuperar-preco.mjs`, `deploy/stripe/setup.md` (mod) | preço no Stripe e variável | T5, T11 |

Caminhos de `lib/`, `app/`, `components/` e `e2e/` são relativos a `apps/web/src` (e `apps/web/e2e`).

## Ordem e ondas

Cada tarefa tem `Files` e `Depends-on`. Só entram na mesma onda tarefas com arquivos disjuntos e sem dependência; implementadores não commitam, o controller commita por tarefa, em ordem, depois que a onda fecha. Tarefa que precisar de arquivo fora do seu `Files` para de rodar em paralelo.

- **Dois PRs** (CLAUDE.md: passou de ~10 arquivos, são dois PRs; o índice já conta com eles): **5a = T1–T7** (cobrança, flag, admin, status), **5b = T8–T11** (casca), o 5b de `origin/main` depois do merge do 5a. Cada metade fecha verde sozinha; 5a já deixa a Equipe oferecer o módulo e o admin liberar a loja piloto, sem tela nova. Os PRs 4 (Resposta 1:1) e 7 dependem do 5a (`requireRecuperar`, `ROTAS.recuperar`); o 7 também do 5b.
- Ondas do 5a: Onda 1: T1, T2, T4. Onda 2: T3. Onda 3: T5, T7. Onda 4: T6. Fechamento: T11, Steps 2, 4 e 5 (o Step 1 também, porque o preço é do 5a; a prova do Step 3 espera a tela do 5b).
- Ondas do 5b: Onda 1: T8. Onda 2: T9. Onda 3: T10. Fechamento: T11 inteira (Steps 1–5; o Step 3 é a prova no Stripe de teste, que passa pela tela Ativar).

---

## Tarefas

### Task 1: Módulo `recuperar` no mapa de acesso e na Equipe

**Files:**
- Modify: `apps/web/src/lib/auth/modulos.ts`, `apps/web/src/lib/auth/modulos.test.ts`
- Modify: `apps/web/src/lib/painel/configuracoes.ts`, `apps/web/src/lib/painel/configuracoes.test.ts`

**Depends-on:** nenhuma (o CHECK de `memberships.modules` já vem do 1a).

**Interfaces:**
- Produces: `MODULOS_OPCIONAIS = ["postar", "recuperar"]` (a ordem decide a ordem em `modulosDoAcesso`); `Modulo` ganha `"recuperar"`; `PAGINAS.recuperar = ["/painel/recuperar/conversas"]` (prefixo); `PAGINAS_EXATAS: Readonly<Partial<Record<Modulo, readonly string[]>>> = { recuperar: ["/painel/recuperar"] }` (caminho exato); `ROTAS.recuperar = []` (a rota do status entra na T6, junto do `route.ts`: `modulos-rotas.test.ts` exige `route.ts` real para todo padrão); `ROTULO_DO_MODULO.recuperar`, `DESCRICAO_DO_MODULO.recuperar`.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `modulos.test.ts`:

```ts
const COM_RECUPERAR: Acesso = { role: "seller", modules: ["recuperar"] };

test("recuperar: a raiz e Conversas são da vendedora; o resto do módulo, inclusive página nova, fica fechado", () => {
  for (const aberta of ["/painel/recuperar", "/painel/recuperar/", "/painel/recuperar/conversas", "/painel/recuperar/conversas/abc"]) {
    assert.equal(paginaLiberada(COM_RECUPERAR, aberta), true, aberta);
  }
  for (const fechada of ["/painel/recuperar/automatico", "/painel/recuperar/scripts", "/painel/recuperar/ajustes", "/painel/recuperar/pagina-nova", "/painel/recuperarx", "/painel/recuperar/../contatos", "/painel/recuperar//conversas"]) {
    assert.equal(paginaLiberada(COM_RECUPERAR, fechada), false, fechada);
  }
  for (const sem of [SO_VENDAS, COM_POSTAR]) assert.equal(paginaLiberada(sem, "/painel/recuperar"), false);
  assert.equal(paginaLiberada({ role: "operator", modules: [] }, "/painel/recuperar/ajustes"), true);
});

test("recuperar: entra em modulosDoAcesso e parseModulos na ordem do contrato; rastreio ainda não é opcional aqui", () => {
  assert.deepEqual(modulosDoAcesso({ role: "seller", modules: ["recuperar", "postar"] }), ["vendas", "postar", "recuperar"]);
  assert.deepEqual(parseModulos(["recuperar", "postar", "recuperar", "rastreio"]), ["postar", "recuperar"]);
});
```

Em `configuracoes.test.ts` (importar `MODULOS_NA_TELA`, `ROTULO_DO_MODULO`, `DESCRICAO_DO_MODULO`):

```ts
test("Equipe: o módulo recuperar tem rótulo, descrição e chip", () => {
  assert.deepEqual(MODULOS_NA_TELA, ["vendas", "postar", "recuperar"]);
  assert.equal(ROTULO_DO_MODULO.recuperar, "Atender no Recuperar");
  assert.equal(DESCRICAO_DO_MODULO.recuperar, "Vê quem respondeu e conversa com as clientes pelo WhatsApp do atendimento, com os scripts prontos. Só funciona com o Recuperar ativo na loja.");
  assert.deepEqual(chipsDoAcesso("seller", ["recuperar", "postar"]), ["Registrar vendas", "Postar nos grupos", "Atender no Recuperar"]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `T src/lib/auth/modulos.test.ts src/lib/painel/configuracoes.test.ts`
Expected: FAIL nos três testes novos (`paginaLiberada` devolve `false` para `/painel/recuperar`; `MODULOS_NA_TELA` sem `recuperar`).

- [ ] **Step 3: Implementar**

`modulos.ts`: `MODULOS_OPCIONAIS = ["postar", "recuperar"] as const`; `ROTAS.recuperar: []` com comentário de duas linhas ("rotas da vendedora entram junto da rota real; cobrança, Automático, Scripts e Ajustes nunca"); `PAGINAS.recuperar` e `PAGINAS_EXATAS` como em Interfaces; em `paginaLiberada`, além do teste por prefixo já existente, liberar quando o caminho tem exatamente os mesmos segmentos de uma entrada de `PAGINAS_EXATAS[modulo]` (a barra final já sai normalizada por `segmentos`; dot segments e vazios continuam recusados antes). `configuracoes.ts`: os dois textos do teste.

- [ ] **Step 4: Rodar e ver passar**

Run: `T src/lib/auth/modulos.test.ts src/lib/painel/configuracoes.test.ts src/lib/auth/modulos-rotas.test.ts src/lib/auth/memberships-allowlist.test.ts`
Expected: PASS (`# fail 0`). Depois `TSC`: sem saída.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/auth apps/web/src/lib/painel/configuracoes.ts apps/web/src/lib/painel/configuracoes.test.ts
git commit -m "feat(recuperar): recuperar module in the seller access map and team labels" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 2: Flag `recuperarEnabled` no store e a prova do guard

**Files:**
- Modify: `apps/web/src/lib/stores/tenant-settings.ts`
- Create: `apps/web/src/lib/stores/tenant-settings-recuperar.integration.test.ts`

**Depends-on:** PR 1a (coluna `recuperar_enabled` e o guard).

**Interfaces:**
- Produces: `TenantSettings.recuperarEnabled: boolean` (padrão `false`); `setRecuperarEnabled(tenantId: string, enabled: boolean): Promise<void>` (lança `Error(message)` do banco, como `setInstagramEnabled`).

- [ ] **Step 1: Escrever o teste de integração que falha**

Molde: `order-items.integration.test.ts` (`pular()` com `E2E_TENANT_ID` e a trava contra prod, `criarPessoa` com login real, `before`/`after` com loja descartável: organização + dona + `memberships` `owner`; limpeza apaga a organização e os usuários). Dois testes:

```ts
test("membro da loja não liga recuperar_enabled pelo PostgREST: o guard do banco recusa e a flag fica falsa", async () => {
  if (pular()) return;
  await setRecuperarEnabled(loja, false); // garante a linha
  const { error } = await getSupabaseAnonForToken(dona.token).from("tenant_settings").update({ recuperar_enabled: true }).eq("tenant_id", loja);
  assert.ok(error === null || error.code === "42501", `erro inesperado: ${error?.message}`);
  assert.equal((await getTenantSettings(loja)).recuperarEnabled, false);
});

test("o servidor liga e desliga a flag, e a leitura devolve o valor", async () => {
  if (pular()) return;
  await setRecuperarEnabled(loja, true);
  assert.equal((await getTenantSettings(loja)).recuperarEnabled, true);
  await setRecuperarEnabled(loja, false);
  assert.equal((await getTenantSettings(loja)).recuperarEnabled, false);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run (PowerShell): `$env:E2E_TENANT_ID = "local"`, com `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` do banco de DEV no ambiente (de `apps/web/.env.local`; nunca os de prod, o teste se recusa), e então `T src/lib/stores/tenant-settings-recuperar.integration.test.ts`
Expected: FAIL com `setRecuperarEnabled is not a function`. Depois do Step 3, se o primeiro teste falhar na última asserção (a flag virou `true` pelo `update` do membro), o guard do 1a não existe: parar e avisar o Igor, não contornar.

- [ ] **Step 3: Implementar em `tenant-settings.ts`**

`recuperarEnabled` no tipo e em `toSettings` (`row?.recuperar_enabled ?? false`); `RECUPERAR_COLUMNS = "recuperar_enabled"`. Escada de colunas: o que hoje é `ALL_COLUMNS` passa a se chamar `PRE_RECUPERAR_COLUMNS`, e `ALL_COLUMNS = ${PRE_RECUPERAR_COLUMNS}, ${RECUPERAR_COLUMNS}`; em `getTenantSettings` e `updateTenantSettings` entra um degrau `ALL → PRE_RECUPERAR → PRE_INSTAGRAM → …` (coluna faltando no banco não pode derrubar o `instagram_enabled` de todo mundo). `setRecuperarEnabled` é gêmea de `setInstagramEnabled` (upsert `{ tenant_id, recuperar_enabled, updated_at }` com `onConflict: "tenant_id"`), com o mesmo aviso de que só o servidor chama.

- [ ] **Step 4: Rodar e ver passar**

Run: o comando do Step 2. Expected: PASS, 2 testes. Depois `TSC` (as duas vezes).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/stores/tenant-settings.ts apps/web/src/lib/stores/tenant-settings-recuperar.integration.test.ts
git commit -m "feat(recuperar): recuperar_enabled in tenant settings, with the flag guard proof" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 3: Add-on genérico no webhook do Stripe

**Files:**
- Modify: `apps/web/src/lib/billing/stripe-webhook.ts`, `apps/web/src/lib/billing/stripe-webhook.test.ts`
- Modify: `apps/web/src/app/api/billing/webhook/route.ts`
- Modify: `apps/web/src/lib/billing/checkout-session.ts`, `apps/web/src/lib/billing/checkout-session.test.ts`
- Modify: `apps/web/src/lib/billing/instagram-contexto.ts`

**Depends-on:** T2 (`setRecuperarEnabled`).

**Interfaces:**
- Produces: `type AddonId = "instagram" | "recuperar"`; `addonDe(metadata: Stripe.Metadata | null | undefined): AddonId | null`; `isAddon(metadata): boolean`; em `WebhookStore`, `addonState(input: { addon: AddonId; tenantId: string; customerId: string }): Promise<{ live: boolean; customerOk: boolean; vivas: number } & StoreResult>` e `setAddonEnabled(input: { addon: AddonId; tenantId: string; enabled: boolean }): Promise<StoreResult>` (substituem `instagramAddonState` e `setInstagramEnabled`); `addonNoStripe(customerId: string, tenantId: string, addon: AddonId = "instagram"): Promise<AddonNoStripe>`. Sai `isInstagramAddon` (sem outros usos depois desta tarefa).

- [ ] **Step 1: Escrever os testes que falham**

Em `stripe-webhook.test.ts`, ajustar o fake: `FakeOptions.instagramError` vira `addonError`; `instagramAddonState()` vira `addonState()` (mesma resposta); `setInstagramEnabled(input)` vira `setAddonEnabled({ addon, tenantId, enabled })`, que devolve `{ error: options.addonError }` se houver e senão empurra `{ tenantId, enabled }` em `instagram` ou em um novo array `recuperar` conforme o `addon`; `makeStore` devolve `recuperar`. Os testes antigos do Instagram não mudam, salvo o nome da opção no teste "falha ao ligar o Instagram…" (`addonError`). Novos, depois do helper `const recuperar = (over: Partial<Stripe.Subscription> = {}) => makeSubscription({ id: "sub_rc", metadata: { tenant_id: TENANT, addon: "recuperar" }, ...over })`:

```ts
test("add-on Recuperar ativo liga o Recuperar, não toca o Instagram nem a linha do plano", async () => {
  const f = makeStore();
  const res = await handleStripeEvent(makeEvent({ data: { object: recuperar() } } as Partial<Stripe.Event>), f.store);
  assert.equal(res.status, 200);
  assert.deepEqual(f.recuperar, [{ tenantId: TENANT, enabled: true }]);
  assert.deepEqual(f.instagram, []);
  assert.equal(f.upserts.length, 0);
});

test("Recuperar decide pelo estado atual no Stripe: active atrasado depois do fim desliga; deleted de duplicada com outra viva mantém", async () => {
  const atrasado = makeStore({ addonLive: false });
  await handleStripeEvent(makeEvent({ type: "customer.subscription.updated", data: { object: recuperar({ status: "active" }) } } as Partial<Stripe.Event>), atrasado.store);
  assert.deepEqual(atrasado.recuperar, [{ tenantId: TENANT, enabled: false }]);
  const duplicada = makeStore({ addonLive: true });
  await handleStripeEvent(makeEvent({ type: "customer.subscription.deleted", data: { object: recuperar({ status: "canceled" }) } } as Partial<Stripe.Event>), duplicada.store);
  assert.deepEqual(duplicada.recuperar, [{ tenantId: TENANT, enabled: true }]);
});

test("Recuperar com customer de outra loja, ou sem tenant_id, não liga nada", async () => {
  const outro = makeStore({ addonCustomerOk: false });
  await handleStripeEvent(makeEvent({ data: { object: recuperar() } } as Partial<Stripe.Event>), outro.store);
  assert.deepEqual(outro.recuperar, []);
  assert.ok(outro.logs.some((l) => l.event === "stripe.addon.customer_mismatch"));
  const sem = makeStore();
  await handleStripeEvent(makeEvent({ data: { object: recuperar({ metadata: { addon: "recuperar" } }) } } as Partial<Stripe.Event>), sem.store);
  assert.deepEqual(sem.recuperar, []);
  assert.ok(sem.logs.some((l) => l.event === "stripe.addon.missing_metadata"));
});

test("Recuperar nunca é plano: checkout, fatura e fim de teste não entram no funil nem no e-mail do plano", async () => {
  const checkout = makeStore({ subscription: recuperar() });
  await handleStripeEvent(makeCheckoutEvent("paid"), checkout.store);
  assert.deepEqual(checkout.recuperar, [{ tenantId: TENANT, enabled: true }]);
  assert.deepEqual([checkout.upserts.length, checkout.funnelEvents.length], [0, 0]);
  const fatura = makeStore();
  const invoice = { id: "in_rc", amount_paid: 12700, billing_reason: "subscription_create", parent: { subscription_details: { metadata: { tenant_id: TENANT, addon: "recuperar" } } } };
  await handleStripeEvent({ id: "evt_inv_rc", type: "invoice.paid", created: 1_700_000_000, data: { object: invoice } } as unknown as Stripe.Event, fatura.store);
  assert.equal(fatura.funnelEvents.length, 0);
  const teste = makeStore({ subscription: recuperar({ status: "trialing" }) });
  const ev = { id: "evt_tw_rc", type: "customer.subscription.trial_will_end", created: 1_700_000_000, data: { object: recuperar({ status: "trialing" }) } } as unknown as Stripe.Event;
  assert.equal((await handleStripeEvent(ev, teste.store)).status, 200);
  assert.deepEqual([teste.cancels.length, teste.emails.length, teste.upserts.length], [0, 0, 0]);
});

test("convite do Instagram só vale para o Instagram; falha ao ligar o Recuperar devolve 5xx sem marcador; duplicada grita no log", async () => {
  const convite = makeStore();
  await handleStripeEvent(makeEvent({ data: { object: recuperar({ metadata: { tenant_id: TENANT, addon: "recuperar", invite_id: "0b8e4f2a-1c3d-4e5f-8a9b-0c1d2e3f4a5b" } }) } } as Partial<Stripe.Event>), convite.store);
  assert.deepEqual(convite.invitesUsed, []);
  const falha = makeStore({ addonError: "banco fora" });
  assert.equal((await handleStripeEvent(makeEvent({ data: { object: recuperar() } } as Partial<Stripe.Event>), falha.store)).status, 500);
  assert.equal(falha.processedEvents.size, 0);
  const dupla = makeStore({ addonVivas: 2 });
  await handleStripeEvent(makeEvent({ data: { object: recuperar() } } as Partial<Stripe.Event>), dupla.store);
  assert.ok(dupla.logs.some((l) => l.event === "stripe.addon.duplicado" && l.level === "error"));
});

test("addonDe reconhece só os add-ons conhecidos", () => {
  assert.equal(addonDe({ addon: "recuperar" }), "recuperar");
  assert.equal(addonDe({ addon: "instagram" }), "instagram");
  for (const nao of [{ addon: "outro" }, {}, null, undefined]) assert.equal(addonDe(nao), null);
  assert.equal(isAddon({ addon: "recuperar" }), true);
});
```

Em `checkout-session.test.ts`, ao lado de `addon(status)`: `const recuperarSub = (status): Sub => ({ status, metadata: { addon: "recuperar" } })` e

```ts
assert.equal(temPlanoVivo([recuperarSub("active"), plano("canceled")]), false);
assert.equal(temPlanoVivo([recuperarSub("active"), plano("active")]), true);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `T src/lib/billing/stripe-webhook.test.ts src/lib/billing/checkout-session.test.ts`
Expected: FAIL — `store.instagramAddonState is not a function` nos testes de add-on (antigos e novos) e `addonDe is not a function`.

- [ ] **Step 3: Implementar**

`stripe-webhook.ts`: `AddonId`, `addonDe`, `isAddon` (apaga `isInstagramAddon`). `handleInstagramAddon` vira `handleAddon(addon: AddonId, subscription, store)`: mesma lógica, chamando `store.addonState({ addon, … })` e `store.setAddonEnabled({ addon, … })`; textos dos logs montados com o nome do add-on (`{ instagram: "Instagram", recuperar: "Recuperar" }`) mantendo literalmente as frases de hoje para o Instagram e `event: stripe.addon.${addon}` no log final; o convite (`markInstagramInviteUsed`) só roda quando `addon === "instagram"`. Os quatro pontos que testam `isInstagramAddon` (`handleCheckoutSession`, `handleStripeEvent`, `handleInvoicePaid`, `handleTrialWillEnd`) passam a usar `addonDe`/`isAddon`: qualquer add-on desvia do `upsertSubscription`, do funil e do aviso de teste do plano.

`webhook/route.ts`: `addonState` conta assinaturas com `addonDe(s.metadata) === addon` (mesmos status vivos de hoje); `setAddonEnabled` chama `setRecuperarEnabled` para `recuperar` e, para `instagram`, o que já faz (inclusive `pauseLiveFlows`/`stopActiveRuns` ao desligar); `cancelAddonSubscriptions` troca `isInstagramAddon` por `isAddon` nas duas linhas (plano vivo = assinatura que NÃO é add-on; cancela todo add-on) e o comentário do contrato em `WebhookStore` acompanha. `checkout-session.ts`: `temPlanoVivo` usa `isAddon` ("os add-ons são outra assinatura de propósito e não contam"). `instagram-contexto.ts`: `addonNoStripe` filtra por `s.metadata.addon !== addon` com o parâmetro novo; chamadores atuais não mudam.

- [ ] **Step 4: Rodar e ver passar**

Run: `T src/lib/billing/stripe-webhook.test.ts src/lib/billing/checkout-session.test.ts src/lib/billing/instagram-oferta.test.ts`
Expected: PASS, incluindo os 11 testes antigos de add-on do Instagram. Depois `TSC` (as duas vezes) e `LINT`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/billing apps/web/src/app/api/billing/webhook/route.ts
git commit -m "feat(billing): treat any add-on subscription as non-plan; Recuperar flag in the Stripe webhook" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 4: Texto de privacidade e seu registro

**Files:**
- Create: `apps/web/src/lib/recuperar/aviso.ts`, `apps/web/src/lib/recuperar/aviso.test.ts`

**Depends-on:** nenhuma.

**Interfaces:**
- Produces (sem `server-only`, o cliente importa só o texto; as funções recebem o `SupabaseClient`, como `trial-claims.ts`):
  - `AVISO_DE_PRIVACIDADE = { versao: "2026-10-29", texto: "Confirmo que o site da loja ou a política de privacidade avisa que a loja pode falar com a cliente pelo WhatsApp sobre o pedido e o carrinho dela." } as const` (**texto para revisão do Igor**; mudar o texto exige mudar a versão)
  - `EVENTO_AVISO = "recuperar.aviso.confirmado"`; `type OrigemDoAviso = "checkout" | "admin"`
  - `registrarAviso(supabase: SupabaseClient, i: { tenantId: string; userId: string; origem: OrigemDoAviso }): Promise<{ error: string | null }>`
  - `avisoConfirmadoEm(supabase: SupabaseClient, tenantId: string): Promise<{ em: string | null; error: string | null }>` (a confirmação mais recente da loja)

- [ ] **Step 1: Escrever os testes que falham**

`fakeLogs()`: cliente de mentira com `from("logs")` que registra `insert(...)` (e devolve `{ error }` configurável) e, na leitura, a cadeia `select().eq().eq().order().limit().maybeSingle()` registrando cada filtro e devolvendo `{ data, error }` configurável.

```ts
test("registrarAviso grava em logs, com a loja, quem confirmou e o texto que ele viu", async () => {
  const f = fakeLogs();
  assert.deepEqual(await registrarAviso(f.client, { tenantId: "T", userId: "U", origem: "checkout" }), { error: null });
  assert.deepEqual(f.inserts, [{ tenant_id: "T", actor_user_id: "U", level: "info", event: "recuperar.aviso.confirmado", message: "Lojista confirmou o aviso de privacidade do Recuperar.", metadata: { versao: "2026-10-29", texto: AVISO_DE_PRIVACIDADE.texto, origem: "checkout" } }]);
});

test("registrarAviso devolve o erro do banco (quem chama bloqueia a cobrança)", async () => {
  const f = fakeLogs({ erroDoInsert: "banco fora" });
  assert.deepEqual(await registrarAviso(f.client, { tenantId: "T", userId: "U", origem: "admin" }), { error: "banco fora" });
});

test("avisoConfirmadoEm lê a confirmação mais recente, só da loja e só do evento", async () => {
  const f = fakeLogs({ linha: { created_at: "2026-10-29T14:03:00.000Z" } });
  assert.deepEqual(await avisoConfirmadoEm(f.client, "T"), { em: "2026-10-29T14:03:00.000Z", error: null });
  assert.deepEqual(f.filtros, [["eq", "tenant_id", "T"], ["eq", "event", "recuperar.aviso.confirmado"]]);
  assert.deepEqual(f.ordem, { coluna: "created_at", crescente: false, limite: 1 });
  assert.deepEqual(await avisoConfirmadoEm(fakeLogs({ linha: null }).client, "T"), { em: null, error: null });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `T src/lib/recuperar/aviso.test.ts`
Expected: FAIL (`registrarAviso is not a function`).

- [ ] **Step 3: Implementar `aviso.ts`** com as assinaturas de Interfaces. `registrarAviso` faz um `insert` em `logs` com o objeto exato do teste. `avisoConfirmadoEm` lê `created_at` filtrando `tenant_id` e `event`, ordenando por `created_at` desc, `limit(1)`, `maybeSingle()`.

- [ ] **Step 4: Rodar e ver passar**

Run: `T src/lib/recuperar/aviso.test.ts` → PASS. `TSC`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/recuperar
git commit -m "feat(recuperar): privacy notice text and its record in logs" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 5: Oferta e checkout do Recuperar

**Files:**
- Create: `apps/web/src/lib/billing/recuperar-addon.ts`, `apps/web/src/lib/billing/recuperar-addon.test.ts`, `apps/web/src/lib/billing/recuperar-contexto.ts`
- Create: `apps/web/src/app/api/billing/recuperar/oferta/route.ts`, `apps/web/src/app/api/billing/recuperar/checkout/route.ts`
- Create: `apps/web/src/lib/recuperar/rotas.test.ts`
- Create: `infra/scripts/stripe-recuperar-preco.mjs`; Modify: `apps/web/.env.example`

**Depends-on:** T1, T2, T3, T4.

**Interfaces:**
- Produces (`recuperar-addon.ts`, puro, importável pelo cliente): `RECUPERAR_MENSAL_CENTS = 12_700`; `precoRecuperar(): string | null` (lê `STRIPE_PRICE_RECUPERAR` com `trim`; vazio ou ausente = `null`); `metadataRecuperar(tenantId: string): { tenant_id: string; addon: "recuperar" }`; `checkoutRecuperarParams(i: { customerId: string; precoId: string; appUrl: string; tenantId: string }): Stripe.Checkout.SessionCreateParams`; `type BloqueioDoRecuperar = "sem_plano" | "ja_assinado"`; `bloqueioDoRecuperar(i: { planoStatus: string | null; recuperarAtivo: boolean }): BloqueioDoRecuperar | null`.
- Produces (`recuperar-contexto.ts`, `server-only`): `contextoDoRecuperar(tenantId: string): Promise<{ bloqueio: BloqueioDoRecuperar | null; precoId: string | null }>` (lê `subscriptions.status` com `.eq("tenant_id")` e `getTenantSettings`).
- Produces (rotas): `GET /api/billing/recuperar/oferta` → `{ bloqueio, configurado: boolean, podeCobrar: boolean }`; `POST /api/billing/recuperar/checkout` com corpo `{ avisoConfirmado: true }` → `{ url }`.

- [ ] **Step 1: Escrever os testes que falham**

`recuperar-addon.test.ts`:

```ts
test("preço mensal fixo e id vindo do ambiente, sem espaço", () => {
  assert.equal(RECUPERAR_MENSAL_CENTS, 12_700);
  const antes = process.env.STRIPE_PRICE_RECUPERAR;
  try {
    process.env.STRIPE_PRICE_RECUPERAR = " price_rc\n";
    assert.equal(precoRecuperar(), "price_rc");
    process.env.STRIPE_PRICE_RECUPERAR = "  ";
    assert.equal(precoRecuperar(), null);
    delete process.env.STRIPE_PRICE_RECUPERAR;
    assert.equal(precoRecuperar(), null);
  } finally {
    if (antes === undefined) delete process.env.STRIPE_PRICE_RECUPERAR; else process.env.STRIPE_PRICE_RECUPERAR = antes;
  }
});

test("bloqueios: sem plano vivo, add-on já ativo", () => {
  assert.equal(bloqueioDoRecuperar({ planoStatus: null, recuperarAtivo: false }), "sem_plano");
  for (const ruim of ["canceled", "past_due", "unpaid", "free"]) assert.equal(bloqueioDoRecuperar({ planoStatus: ruim, recuperarAtivo: false }), "sem_plano", ruim);
  assert.equal(bloqueioDoRecuperar({ planoStatus: "active", recuperarAtivo: true }), "ja_assinado");
  assert.equal(bloqueioDoRecuperar({ planoStatus: "trialing", recuperarAtivo: false }), null);
  assert.equal(bloqueioDoRecuperar({ planoStatus: "active", recuperarAtivo: false }), null);
});

test("checkout: uma linha mensal, sem implantação nem cupom, metadata na sessão e na assinatura, volta pro módulo", () => {
  const p = checkoutRecuperarParams({ customerId: "cus_1", precoId: "price_rc", appUrl: "https://app", tenantId: "loja-a" });
  assert.equal(p.mode, "subscription");
  assert.equal(p.customer, "cus_1");
  assert.deepEqual(p.line_items, [{ price: "price_rc", quantity: 1 }]);
  assert.equal("discounts" in p, false);
  assert.deepEqual(p.metadata, { tenant_id: "loja-a", addon: "recuperar" });
  assert.deepEqual(p.subscription_data?.metadata, { tenant_id: "loja-a", addon: "recuperar" });
  assert.equal(p.client_reference_id, "loja-a");
  assert.equal(p.success_url, "https://app/painel/recuperar?assinado=1");
  assert.equal(p.cancel_url, "https://app/painel/recuperar");
  assert.equal(p.payment_method_types?.[0], "card");
});
```

`rotas.test.ts` (novo): copiar o harness de `app/api/vendas/routes.test.ts` (servidor HTTP falso para GoTrue e PostgREST, a função que responde, variáveis de ambiente do `before`, rotas importadas com `await import()` dentro do `before`), renomeando para os nomes usados nos testes abaixo: `vistos` (a lista de pedidos ao PostgREST, o `seen` de lá), `pedidosA(caminho)` (os de um caminho, o `requestsTo` de lá) e `chamar(método, caminho, token, corpo?)` (o `call` de lá). `USERS`: `token-dono` (owner), `token-admin` (admin), `token-operador` (operator), `token-vendedora` (seller, `modules: []`), `token-vendedora-recuperar` (seller, `modules: ["recuperar"]`), todos na `LOJA`, e a membership devolvendo o `modules` do usuário. O banco falso responde `/rest/v1/tenant_settings` com `recuperar_enabled: ligado`, `/rest/v1/subscriptions` com `[{ status: plano }]` (ou `[]`), `/rest/v1/logs` com 201; `ligado`, `plano` e `process.env.STRIPE_PRICE_RECUPERAR` são ajustados por caso, e `beforeEach` zera o que foi visto. Casos (nenhum chega ao Stripe):

| Quem, estado | Resposta |
|---|---|
| `GET oferta`: dono, sem plano, sem preço | 200 `{ bloqueio: "sem_plano", configurado: false, podeCobrar: true }` |
| `GET oferta`: admin, plano `active`, preço definido | 200 `{ bloqueio: null, configurado: true, podeCobrar: true }` |
| `GET oferta`: operador, plano `trialing`, preço definido | 200 `{ bloqueio: null, configurado: true, podeCobrar: false }` |
| `GET oferta`: dono, plano `active`, flag ligada | 200 com `bloqueio: "ja_assinado"` |
| `GET oferta`: vendedora com o módulo `recuperar`; sem login | 403 com `MENSAGEM_BLOQUEIO`; 401 |
| `POST checkout`: operador | 403, texto `Sem permissao para billing.` |
| `POST checkout`: vendedora com o módulo | 403 com `MENSAGEM_BLOQUEIO` (a rota não está no mapa dela) |
| `POST checkout`: dono com corpo `{}`, `{ avisoConfirmado: false }` ou JSON inválido | 400 `{ error: "Confirme o aviso de privacidade para ativar." }` |
| `POST checkout`: dono, `avisoConfirmado: true`, sem plano | 409 `{ error: "Assine um plano primeiro." }` |
| `POST checkout`: plano `active`, flag ligada | 409 `{ error: "O Recuperar já está ativo nesta loja." }` |
| `POST checkout`: plano `active`, flag desligada, sem `STRIPE_PRICE_RECUPERAR` | 503 `{ error: "Assinatura do Recuperar indisponível no momento." }` |

E em todos os casos de `POST checkout` acima: `pedidosA("/rest/v1/logs").length === 0` (a confirmação só é registrada quando a cobrança vai seguir).

- [ ] **Step 2: Rodar e ver falhar**

Run: `T src/lib/billing/recuperar-addon.test.ts src/lib/recuperar/rotas.test.ts`
Expected: FAIL — módulos e rotas inexistentes.

- [ ] **Step 3: Implementar**

`recuperar-addon.ts` e `recuperar-contexto.ts` como em Interfaces (`checkoutRecuperarParams` espelha `checkoutInstagramParams` sem implantação, cupom e convite). Rota `oferta`: `getTenantContext`; `contextoDoRecuperar`; `podeCobrar = ctx.role === "owner" || ctx.role === "admin"`; erro inesperado 500 `{ error: "Não deu pra carregar a oferta." }`. Rota `checkout` (molde: `api/billing/instagram/checkout/route.ts`), nesta ordem: `getTenantContext` → `assertBillingRole` → corpo `z.strictObject({ avisoConfirmado: z.literal(true) })` (falha = 400 acima) → `contextoDoRecuperar` (409/409/503 acima) → `resolveTenantCustomerId` → `addonNoStripe(customerId, tenantId, "recuperar")` (viva = 409 `{ error: "O Recuperar já está assinado. Pode levar alguns segundos para liberar." }`; fatura pendente = `{ url }` dela) → `registrarAviso(getSupabaseAdmin(), { tenantId, userId: ctx.authUserId, origem: "checkout" })` (erro = 500 `{ error: "Não deu pra registrar a confirmação. Tente de novo." }`, sem criar sessão) → `stripe.checkout.sessions.create(checkoutRecuperarParams(…))` → `{ url }`; erro inesperado 500 `{ error: "Não deu pra abrir o pagamento. Tente de novo." }`.

`stripe-recuperar-preco.mjs`: cópia do script do Instagram com um único preço `{ env: "STRIPE_PRICE_RECUPERAR", lookup: "recuperar_mensal", produto: "Recuperar", valor: 12700, recorrente: true }` e `metadata[addon]=recuperar` no produto e no preço. `.env.example`, depois da linha do Instagram: `# Add-on Recuperar (R$ 127/mes, sem implementacao). Mesma conta Stripe dos planos. Sem esta variavel a venda fica fechada.` e `STRIPE_PRICE_RECUPERAR=price_xxx`.

- [ ] **Step 4: Rodar e ver passar**

Run: `T src/lib/billing/recuperar-addon.test.ts src/lib/recuperar/rotas.test.ts`
Expected: PASS. Depois `TSC` (as duas vezes) e `LINT`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/billing apps/web/src/app/api/billing/recuperar apps/web/src/lib/recuperar apps/web/.env.example infra/scripts/stripe-recuperar-preco.mjs
git commit -m "feat(billing): Recuperar offer and checkout routes" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 6: `requireRecuperar` e o status do módulo

**Files:**
- Create: `apps/web/src/lib/recuperar/access.ts`, `apps/web/src/lib/recuperar/precisa-de-voce.ts`
- Create: `apps/web/src/app/api/recuperar/status/route.ts`, `apps/web/src/lib/recuperar/rotas-guardadas.test.ts`
- Modify: `apps/web/src/lib/auth/modulos.ts`, `apps/web/src/lib/auth/modulos.test.ts`, `apps/web/src/lib/recuperar/rotas.test.ts`

**Depends-on:** T1, T2, T5 (o arquivo `rotas.test.ts`).

**Interfaces:**
- Produces: `requireRecuperar(req: Request): Promise<TenantContext>` (molde `lib/ig/access.ts`; lança `Response` 403 `{ error: "O Recuperar não está liberado para esta loja.", code: "recuperar_disabled" }`); `contarPrecisaDeVoce(tenantId: string): Promise<number>` (conversas da loja com `status = precisa_de_voce`, `select("*", { count: "exact", head: true })` com `.eq("tenant_id")` e `.eq("status")`; erro lança); `GET /api/recuperar/status` → `{ enabled: boolean; precisaDeVoce: number }`, aberta a toda loja logada (NÃO usa `requireRecuperar`: precisa responder `enabled: false` à loja sem o add-on); `ROTAS.recuperar = [{ padrao: "/api/recuperar/status", metodos: ["GET"] }]`.

- [ ] **Step 1: Escrever os testes que falham**

Em `rotas.test.ts`: o banco falso ganha duas variáveis de caso, `precisam` (número) e `contagemFalha` (booleano; `beforeEach` as zera): `/rest/v1/private_conversations` responde ao HEAD com `contentRange: "*/<precisam>"`, ou com 500 `{ message: "falha" }` se `contagemFalha`. `statusGet` é o `GET` de `app/api/recuperar/status/route`, importado no `before` ao lado das rotas da T5. Casos:

```ts
test("status: sem login → 401, e nada é lido", async () => {
  const res = await statusGet(chamar("GET", "/api/recuperar/status", null));
  assert.equal(res.status, 401);
  assert.equal(vistos.length, 0);
});

test("status: loja sem o add-on responde desligado e não conta conversa nenhuma", async () => {
  ligado = false;
  const res = await statusGet(chamar("GET", "/api/recuperar/status", "token-dono"));
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { enabled: false, precisaDeVoce: 0 });
  assert.equal(pedidosA("/rest/v1/private_conversations").length, 0);
});

test("status: loja com o add-on conta só as conversas dela que precisam de resposta", async () => {
  ligado = true; precisam = 3;
  const res = await statusGet(chamar("GET", "/api/recuperar/status", "token-dono"));
  assert.deepEqual(await res.json(), { enabled: true, precisaDeVoce: 3 });
  const [conta] = pedidosA("/rest/v1/private_conversations");
  assert.equal(conta.method, "HEAD");
  assert.match(conta.prefer, /count=exact/);
  assert.equal(conta.url.searchParams.get("tenant_id"), `eq.${LOJA}`);
  assert.equal(conta.url.searchParams.get("status"), "eq.precisa_de_voce");
});

test("status: erro na contagem é 500, nunca enabled false", async () => {
  ligado = true; contagemFalha = true;
  const res = await statusGet(chamar("GET", "/api/recuperar/status", "token-dono"));
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { error: "Não deu pra ler o Recuperar." });
});

test("status: vendedora com o módulo lê; sem o módulo recebe a frase do guard", async () => {
  ligado = true;
  assert.equal((await statusGet(chamar("GET", "/api/recuperar/status", "token-vendedora-recuperar"))).status, 200);
  const bloqueada = await statusGet(chamar("GET", "/api/recuperar/status", "token-vendedora"));
  assert.equal(bloqueada.status, 403);
  assert.equal(await bloqueada.text(), MENSAGEM_BLOQUEIO);
});

test("requireRecuperar: 403 com o código fixo quando desligado; devolve o contexto quando ligado", async () => {
  ligado = false;
  const erro = await requireRecuperar(chamar("GET", "/api/recuperar/x", "token-dono")).catch((e: unknown) => e);
  assert.ok(erro instanceof Response);
  assert.equal(erro.status, 403);
  assert.deepEqual(await erro.json(), { error: "O Recuperar não está liberado para esta loja.", code: "recuperar_disabled" });
  ligado = true;
  assert.equal((await requireRecuperar(chamar("GET", "/api/recuperar/x", "token-dono"))).tenantId, LOJA);
});
```

`rotas-guardadas.test.ts` (estrutural, mesmo padrão de `memberships-allowlist.test.ts`; normalizar `\` para `/`): lista todo `route.ts` sob `app/api/recuperar/`; a única isenta é `status/route.ts`.

```ts
const SEM_GUARDA = new Set(["status/route.ts"]);
test("toda rota do módulo exige o add-on, menos o status", () => {
  const sem = rotas.filter((r) => !SEM_GUARDA.has(r) && !fonte(r).includes("requireRecuperar("));
  assert.deepEqual(sem, [], "rota do Recuperar sem requireRecuperar(req): sem isso a loja desligada continua usando o módulo");
});
test("o status responde à loja sem o add-on: não chama requireRecuperar e existe", () => {
  assert.ok(rotas.includes("status/route.ts"));
  assert.equal(fonte("status/route.ts").includes("requireRecuperar("), false);
});
```

Em `modulos.test.ts`, um teste: `podeAcessar(COM_RECUPERAR, "/api/recuperar/status", "GET") === true`; `false` para `SO_VENDAS` e `COM_POSTAR`; `false` para `POST` no mesmo caminho, para `/api/recuperar`, `/api/recuperar/status/x`, `/api/billing/recuperar/checkout`, `/api/billing/recuperar/oferta` e `/api/admin/tenants/x/recuperar` (vendedora com o módulo: cobrança e admin nunca).

- [ ] **Step 2: Rodar e ver falhar**

Run: `T src/lib/recuperar/rotas.test.ts src/lib/recuperar/rotas-guardadas.test.ts src/lib/auth/modulos.test.ts`
Expected: FAIL (rota e `requireRecuperar` inexistentes; `rotas-guardadas` falha por não achar `status/route.ts`).

- [ ] **Step 3: Implementar**

`access.ts` (`import "server-only"`, mesma forma de `ig/access.ts`, lendo `getTenantSettings(ctx.tenantId).recuperarEnabled`); `precisa-de-voce.ts` (`import "server-only"`, `getSupabaseAdmin()`); rota `status` (molde `api/ig/status/route.ts`: `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `getTenantContext`; `Response` lançada é devolvida; erro inesperado vira 500 `{ error: "Não deu pra ler o Recuperar." }` com `console.error`); `ROTAS.recuperar` em `modulos.ts` com o comentário atualizado ("Hoje e Conversas entram aqui nos PRs 7 e 8; cobrança, Automático, Scripts e Ajustes nunca").

- [ ] **Step 4: Rodar e ver passar**

Run: `T "src/lib/recuperar/*.test.ts" src/lib/auth/modulos.test.ts src/lib/auth/modulos-rotas.test.ts`
Expected: PASS. Depois `TSC` (as duas vezes) e `LINT`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/recuperar apps/web/src/lib/auth apps/web/src/app/api/recuperar
git commit -m "feat(recuperar): requireRecuperar and the status route" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 7: Liberação manual no admin

**Files:**
- Create: `apps/web/src/lib/recuperar/liberacao-admin.ts`, `apps/web/src/lib/recuperar/liberacao-admin.test.ts`
- Create: `apps/web/src/app/api/admin/tenants/[id]/recuperar/route.ts`, `apps/web/src/components/admin/tenant-recuperar.tsx`
- Modify: `apps/web/src/app/admin/tenants/[id]/page.tsx`

**Depends-on:** T2, T3, T4.

**Interfaces:**
- Produces: `decidirLiberacao(p: { acao: "ligar" | "desligar"; avisoConfirmado: boolean; assinaturaNoStripe: boolean }): { ok: true } | { ok: false; status: 400 | 409; error: string }`; `POST /api/admin/tenants/[id]/recuperar` com `{ acao, avisoConfirmado? }` → `{ success: true, message }`; `TenantRecuperar({ tenantId, ligado, avisoEm }: { tenantId: string; ligado: boolean; avisoEm: string | null })`.

- [ ] **Step 1: Escrever os testes que falham**

```ts
test("ligar exige a confirmação do aviso de privacidade; com assinatura no Stripe é permitido", () => {
  assert.deepEqual(decidirLiberacao({ acao: "ligar", avisoConfirmado: false, assinaturaNoStripe: false }), { ok: false, status: 400, error: "Confirme que o lojista foi avisado do texto de privacidade." });
  assert.deepEqual(decidirLiberacao({ acao: "ligar", avisoConfirmado: true, assinaturaNoStripe: false }), { ok: true });
  assert.deepEqual(decidirLiberacao({ acao: "ligar", avisoConfirmado: true, assinaturaNoStripe: true }), { ok: true });
});

test("desligar uma loja com assinatura viva no Stripe é recusado; sem assinatura passa", () => {
  assert.deepEqual(decidirLiberacao({ acao: "desligar", avisoConfirmado: false, assinaturaNoStripe: true }), { ok: false, status: 409, error: "Esta loja tem assinatura do Recuperar viva no Stripe. Desligar aqui não para a cobrança e o próximo evento do Stripe liga de novo: cancele a assinatura no Dashboard do Stripe." });
  assert.deepEqual(decidirLiberacao({ acao: "desligar", avisoConfirmado: false, assinaturaNoStripe: false }), { ok: true });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `T src/lib/recuperar/liberacao-admin.test.ts` → FAIL (`decidirLiberacao is not a function`).

- [ ] **Step 3: Implementar**

`liberacao-admin.ts` com as mensagens do teste. Rota (molde `instagram-invite/route.ts` e `courtesy/route.ts`), nesta ordem: `getAdminContext` (401) → `id` com a regex de UUID (404 `Tenant não encontrado.`) → corpo `{ acao: "ligar" | "desligar", avisoConfirmado?: boolean }` (400 `Corpo inválido.`) → a loja existe em `organizations` (404) → para `desligar`, `customerDaLoja(id)` e `addonNoStripe(customerId, id, "recuperar")` (`viva` vira `assinaturaNoStripe`; sem customer = `false`) → `decidirLiberacao` (devolve `{ error }` com o status dela) → para `ligar`, `registrarAviso(getSupabaseAdmin(), { tenantId: id, userId: admin.authUserId, origem: "admin" })` (erro = 500) → `setRecuperarEnabled(id, acao === "ligar")` → linha de auditoria em `logs` (`level: "warn"`, `event: "admin.recuperar.ligar"` ou `"admin.recuperar.desligar"`, `actor_user_id`, `metadata: { admin_email }`; falha vira `console.error`, não derruba a resposta) → `{ success: true, message }` com `message` = `"Recuperar liberado para a loja. Sem cobrança."` ou `"Recuperar desligado. As telas voltam a mostrar a oferta; os dados ficam guardados."`.

`TenantRecuperar` (molde visual `tenant-instagram-invite.tsx`; `router.refresh()` depois do sucesso como `tenant-plan-grant.tsx`): título "Recuperar (Yampi)"; linha de estado "Liberado." ou "Desligado." mais, quando houver `avisoEm`, " Aviso de privacidade confirmado em dd/mm/aaaa hh:mm." (fuso de Brasília); texto de apoio "Liberar aqui não cobra e não passa pelo Stripe: serve para a loja piloto. Se a loja tiver assinatura do Recuperar no Stripe, desligar aqui é recusado."; quando desligado, o texto `AVISO_DE_PRIVACIDADE.texto` em citação, a caixa "O lojista confirmou o texto acima." e o botão "Liberar o Recuperar" (desabilitado sem a caixa); quando ligado, o botão "Desligar o Recuperar"; resultado em `role="status"`, erro em vermelho como os outros blocos.

`page.tsx`: ler `getTenantSettings(id)` e `avisoConfirmadoEm(supabase, id)` dentro de `try`; falha entra em `falhas` como `"Recuperar"` e o bloco não é desenhado; senão `<TenantRecuperar tenantId={org.id} ligado={…} avisoEm={…} />` logo depois de `<TenantInstagramInvite … />`.

- [ ] **Step 4: Rodar e ver passar**

Run: `T src/lib/recuperar/liberacao-admin.test.ts` → PASS. `TSC` (as duas vezes), `LINT`, `npm --workspace apps/web run brand:check`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/recuperar apps/web/src/app/api/admin apps/web/src/components/admin apps/web/src/app/admin
git commit -m "feat(admin): turn Recuperar on and off by hand for a tenant" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 8: Estado do Recuperar na casca

**Files:**
- Modify: `apps/web/src/lib/painel/casca.ts`, `apps/web/src/lib/painel/casca.test.ts`
- Modify: `apps/web/src/components/painel/casca-context.tsx`
- Modify: `apps/web/src/lib/painel-nav.ts` (só o tipo `Liberacao`), `apps/web/src/lib/painel-nav.test.ts` (só as constantes)

**Depends-on:** T1 (e o contrato da rota da T6).

**Interfaces:**
- Produces (`lib/painel/casca.ts`): `type RecuperarNaCasca = { enabled: boolean; precisaDeVoce: number }`; `lerStatusDoRecuperar(raw: unknown): RecuperarNaCasca | null`; `type LeituraDaCasca = { perguntouInstagram: boolean; instagram: { enabled: boolean } | null; perguntouRecuperar: boolean; recuperar: RecuperarNaCasca | null; recuperarFalhou: boolean }`; `liberacoesDaCasca(i: LeituraDaCasca): Liberacoes | null`. `Liberacao = "instagram" | "recuperar"` (em `painel-nav.ts`).
- Produces (`useCasca()`): `recuperar: RecuperarNaCasca | null`, `recuperarFalhou: boolean`, `recarregarRecuperar: () => void`; `liberacoes` agora `{ instagram, recuperar }`.

- [ ] **Step 1: Escrever os testes que falham**

Em `casca.test.ts`:

```ts
const LIGADO = { enabled: true, precisaDeVoce: 4 };
const base = { perguntouInstagram: true, instagram: { enabled: true }, perguntouRecuperar: true, recuperar: LIGADO, recuperarFalhou: false };

test("lerStatusDoRecuperar aceita o corpo da rota e descarta lixo", () => {
  assert.deepEqual(lerStatusDoRecuperar({ enabled: true, precisaDeVoce: 4 }), LIGADO);
  assert.deepEqual(lerStatusDoRecuperar({ enabled: false, precisaDeVoce: 9 }), { enabled: false, precisaDeVoce: 0 });
  assert.deepEqual(lerStatusDoRecuperar({ enabled: true }), { enabled: true, precisaDeVoce: 0 });
  assert.deepEqual(lerStatusDoRecuperar({ enabled: true, precisaDeVoce: -3 }), { enabled: true, precisaDeVoce: 0 });
  assert.deepEqual(lerStatusDoRecuperar({ enabled: true, precisaDeVoce: 2.9 }), { enabled: true, precisaDeVoce: 2 });
  for (const lixo of [null, undefined, "sim", 3, [], { enabled: "sim" }, { precisaDeVoce: 2 }]) assert.equal(lerStatusDoRecuperar(lixo), null, JSON.stringify(lixo));
});

test("liberacoesDaCasca espera as respostas que o acesso precisa antes de decidir", () => {
  assert.equal(liberacoesDaCasca({ ...base, recuperar: null }), null);
  assert.equal(liberacoesDaCasca({ ...base, instagram: null }), null);
  assert.deepEqual(liberacoesDaCasca(base), { instagram: true, recuperar: true });
});

test("liberacoesDaCasca: Recuperar que falhou não trava o Instagram; falha depois de um estado conhecido mantém o estado", () => {
  assert.deepEqual(liberacoesDaCasca({ ...base, recuperar: null, recuperarFalhou: true }), { instagram: true, recuperar: false });
  assert.deepEqual(liberacoesDaCasca({ ...base, recuperarFalhou: true }), { instagram: true, recuperar: true });
});

test("liberacoesDaCasca: a vendedora só pergunta o que o acesso dela alcança", () => {
  const vendedora = { ...base, perguntouInstagram: false, instagram: null };
  assert.deepEqual(liberacoesDaCasca(vendedora), { instagram: false, recuperar: true });
  assert.equal(liberacoesDaCasca({ ...vendedora, perguntouRecuperar: false, recuperar: null }), null);
});
```

Em `painel-nav.test.ts`, `COM_INSTAGRAM` vira `{ instagram: true, recuperar: false }` e os literais `{ instagram: false }` / `{ instagram: true }` ganham `recuperar: false` (tipo `Liberacoes` agora exige as duas chaves).

- [ ] **Step 2: Rodar e ver falhar**

Run: `T src/lib/painel/casca.test.ts src/lib/painel-nav.test.ts`
Expected: FAIL (`lerStatusDoRecuperar is not a function`).

- [ ] **Step 3: Implementar**

`casca.ts`: as duas funções e os tipos, conforme os testes (regras: `lerStatusDoRecuperar` exige `enabled` booleano; contagem = `Math.max(0, Math.trunc(Number(x)))` com lixo e NaN virando 0, e 0 quando desligado; `liberacoesDaCasca` devolve `null` se nada foi perguntado, `null` enquanto faltar resposta pedida — resposta do Recuperar que falhou conta como respondida — e senão `{ instagram: instagram?.enabled ?? false, recuperar: recuperar?.enabled ?? false }`). `painel-nav.ts`: `export type Liberacao = "instagram" | "recuperar"`.

`casca-context.tsx`: estados `recuperar` e `recuperarFalhou`; `perguntaRecuperar = carregado && acesso !== null && podeAcessar(acesso, "/api/recuperar/status", "GET")` (dono, admin e operador sempre; vendedora só com o módulo; papel desconhecido nunca); `buscarRecuperar` (`useCallback`): `fetch("/api/recuperar/status", { cache: "no-store" })`, resposta válida grava `recuperar` e zera `recuperarFalhou`, qualquer outra coisa (rede, não-2xx, corpo inválido) só marca `recuperarFalhou` e NÃO apaga o estado anterior; um `useEffect` chama `buscarRecuperar` quando `perguntaRecuperar` vira verdadeiro; `useRecarga(buscarRecuperar, 30_000, perguntaRecuperar && recuperar?.enabled === true)` (import de `@/components/painel/home/ao-vivo/use-recarga`; aba escondida não busca). O valor do contexto passa a expor `recuperar`, `recuperarFalhou`, `recarregarRecuperar` (= `buscarRecuperar`) e `liberacoes: liberacoesDaCasca({ perguntouInstagram: pergunta, instagram, perguntouRecuperar: perguntaRecuperar, recuperar, recuperarFalhou })`; o valor padrão do `createContext` ganha os três campos novos.

- [ ] **Step 4: Rodar e ver passar**

Run: `T src/lib/painel/casca.test.ts src/lib/painel-nav.test.ts` → PASS (os testes antigos de nav seguem verdes: nenhum item novo ainda). `TSC` (as duas vezes), `LINT`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/painel apps/web/src/lib/painel-nav.ts apps/web/src/lib/painel-nav.test.ts apps/web/src/components/painel/casca-context.tsx
git commit -m "feat(painel): Recuperar state in the shell context" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 9: Porta do módulo, Ativar e "falta configurar"

**Files:**
- Create: `apps/web/src/app/painel/recuperar/layout.tsx`, `apps/web/src/app/painel/recuperar/page.tsx`
- Create: `apps/web/src/components/painel/recuperar/porta-do-recuperar.tsx`, `ativar.tsx`, `ativar-conteudo.ts`, `ativar-conteudo.test.ts`, `pago-falta-configurar.tsx`
- Create: `apps/web/e2e/recuperar-mocks.ts`, `apps/web/e2e/painel-recuperar-ativar.spec.ts`
- Modify: `apps/web/e2e/conteudo-esperado.ts`

**Depends-on:** T4 (texto de privacidade), T5 (`RECUPERAR_MENSAL_CENTS`), T8 (estado na casca). A rota do status (T6) entra só por contrato: o e2e a simula.

**Interfaces:**
- Consumes: `useCasca()` (`recuperar`, `recuperarFalhou`, `recarregarRecuperar`), `useRole()` (`acesso`), `acessoRestrito`, `ErroDeCarga`, `useToast`, `AVISO_DE_PRIVACIDADE`, `RECUPERAR_MENSAL_CENTS`, `formatarReais` (de `@/lib/billing/instagram-preco`).
- Produces: `PortaDoRecuperar({ children })` (client); `AtivarRecuperar()` (client, sem props); `PagoFaltaConfigurar()`; de `ativar-conteudo.ts`: `BENEFICIOS: { titulo: string; texto: string }[]`, `INCLUI: string[]`, `RODAPE_DO_PRECO: string`, `PERGUNTAS: { pergunta: string; resposta: string }[]`.

**Textos** (todos para revisão do Igor), em `ativar-conteudo.ts`:

| Constante | Conteúdo |
|---|---|
| `BENEFICIOS` | "Pix pendente" — "Manda o código pronto pra copiar e lembra antes de vencer." · "Carrinho abandonado" — "Pergunta o que travou e, depois, mostra depoimento de cliente de verdade." · "Conversas com scripts" — "Quem responde cai num chat aqui dentro, com texto pronto pra frete, grade, pedido mínimo e troca." · "Número do atendimento" — "O Recuperar fala por um chip só dele. Seus grupos ficam no número deles." |
| `INCLUI` | "Inclui o número do atendimento, sem ocupar vaga de celular do seu plano" · "Pix, carrinho e conversas no mesmo lugar" · "Cancele quando quiser, sem multa" |
| `RODAPE_DO_PRECO` | "Precisa de: loja na Yampi e um chip de WhatsApp só pra isso. Se recuperar um pedido de R$ 500 no mês, o Recuperar já se pagou quase 4 vezes." |
| `PERGUNTAS` (5) | "É seguro pro meu número?" — "O Recuperar usa a mesma conexão não oficial dos seus grupos, e as regras do WhatsApp não permitem mensagem automática por esse tipo de conexão. Nenhum controle garante que um número não seja restringido. Por isso ele fala por um número só dele, separado do número dos grupos: se esse chip for restringido, seus grupos não são afetados. E manda devagar: intervalo sorteado, só em horário comercial, poucas mensagens por cliente, e pausa sozinho quando clientes reclamam." · "Preciso deixar o celular do chip ligado?" — "Não. O número fica conectado na Girumo. Só abra o WhatsApp no celular dele pelo menos uma vez a cada 14 dias." · "E se eu não quiser mensagem automática?" — "Deixe o automático desligado (ele já começa desligado). Os casos caem na fila de hoje e você manda pelo chat, com os scripts prontos." · "Minha vendedora pode atender?" — "Pode. Libere o Recuperar pra ela em Configurações › Equipe." · "Funciona com outra plataforma além da Yampi?" — "Por enquanto, só com a Yampi." |

- [ ] **Step 1: Escrever os testes que falham**

`ativar-conteudo.test.ts`:

```ts
const TUDO = [...BENEFICIOS.flatMap((b) => [b.titulo, b.texto]), ...INCLUI, RODAPE_DO_PRECO, ...PERGUNTAS.flatMap((p) => [p.pergunta, p.resposta])].join("\n");

test("a tela fala em número do atendimento, nunca em número da recuperação", () => {
  assert.match(TUDO, /número do atendimento/i);
  assert.doesNotMatch(TUDO, /n[úu]mero da recupera[çc][ãa]o|chip da recupera[çc][ãa]o/i);
});

test("nenhum texto promete que o número não será restringido, e a resposta de segurança diz que a conexão é não oficial", () => {
  assert.doesNotMatch(TUDO, /100% seguro|sem risco|garantid|nunca (é|foi|será) (banid|bloquead|restring)/i);
  const seguro = PERGUNTAS.find((p) => /seguro/i.test(p.pergunta));
  assert.ok(seguro && /Nenhum controle garante/.test(seguro.resposta) && /não oficial/.test(seguro.resposta));
});

test("os quatro benefícios do mockup, na ordem, e o cancelamento sem multa", () => {
  assert.deepEqual(BENEFICIOS.map((b) => b.titulo), ["Pix pendente", "Carrinho abandonado", "Conversas com scripts", "Número do atendimento"]);
  assert.equal(PERGUNTAS.length, 5);
  assert.ok(INCLUI.includes("Cancele quando quiser, sem multa"));
});
```

`e2e/recuperar-mocks.ts`: `type EstadoMock = { status: { enabled: boolean; precisaDeVoce: number } | 500; oferta: { bloqueio: "sem_plano" | "ja_assinado" | null; configurado: boolean; podeCobrar: boolean } }`; `OFERTA_NORMAL = { bloqueio: null, configurado: true, podeCobrar: true }`; `moca(page: Page, estado: EstadoMock): Promise<void>` registra `page.route("**/api/recuperar/status", …)` (500 → `{ status: 500, json: { error: "x" } }`, senão `json: estado.status`) e `page.route("**/api/billing/recuperar/oferta", …)` lendo `estado` a cada requisição (o teste muda o objeto no meio do caminho).

`painel-recuperar-ativar.spec.ts` (dono de QA; `test.beforeEach(() => exigeCredenciais())`; imports: `expect`, `test` do Playwright, `exigeCredenciais` de `./sessao-helpers`, `AVISO_DE_PRIVACIDADE` de `../src/lib/recuperar/aviso`, `moca`, `OFERTA_NORMAL` e `EstadoMock` de `./recuperar-mocks`):

```ts
test("sem o add-on: oferta com preço e o que inclui; só deixa ativar depois da confirmação", async ({ page }) => {
  await moca(page, { status: { enabled: false, precisaDeVoce: 0 }, oferta: OFERTA_NORMAL });
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1, name: "Recupere o carrinho e o Pix que ficaram pra trás" })).toBeVisible();
  await expect(page.getByText("R$ 127,00")).toBeVisible();
  for (const t of ["Pix pendente", "Carrinho abandonado", "Conversas com scripts", "Número do atendimento"]) await expect(page.getByText(t, { exact: true })).toBeVisible();
  const ativar = page.getByRole("button", { name: "Ativar Recuperar" });
  await expect(ativar).toBeDisabled();
  await page.getByLabel(AVISO_DE_PRIVACIDADE.texto).check();
  await expect(ativar).toBeEnabled();
});

test("ao voltar pago, espera o webhook e abre o módulo sozinho", async ({ page }) => {
  const estado = { status: { enabled: false, precisaDeVoce: 0 }, oferta: OFERTA_NORMAL } as EstadoMock;
  await moca(page, estado);
  let corpo: unknown = null;
  await page.route("**/api/billing/recuperar/checkout", (rota) => { corpo = rota.request().postDataJSON(); return rota.fulfill({ json: { url: "/painel/recuperar?assinado=1" } }); });
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await page.getByLabel(AVISO_DE_PRIVACIDADE.texto).check();
  await page.getByRole("button", { name: "Ativar Recuperar" }).click();
  await expect(page.getByText("Pagamento recebido. Liberando o Recuperar da loja…")).toBeVisible();
  expect(corpo).toEqual({ avisoConfirmado: true });
  estado.status = { enabled: true, precisaDeVoce: 0 };
  await expect(page.getByText("Liberado para a sua loja. Falta configurar.")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { level: 1, name: "Recupere o carrinho e o Pix que ficaram pra trás" })).toHaveCount(0);
});

test("quem não cobra, sem plano e preço fechado veem o motivo e nenhum botão de ativar", async ({ page }) => {
  const estado = { status: { enabled: false, precisaDeVoce: 0 }, oferta: { ...OFERTA_NORMAL, podeCobrar: false } } as EstadoMock;
  await moca(page, estado);
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await expect(page.getByText("Só o dono ou um admin da loja pode ativar.")).toBeVisible();
  estado.oferta = { bloqueio: "sem_plano", configurado: true, podeCobrar: true };
  await page.reload({ waitUntil: "load" });
  await expect(page.getByText("Assine um plano primeiro. O Recuperar é um add-on do plano da loja.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver os planos" })).toHaveAttribute("href", "/painel/configuracoes");
  estado.oferta = { bloqueio: null, configurado: false, podeCobrar: true };
  await page.reload({ waitUntil: "load" });
  await expect(page.getByText("Assinatura do Recuperar indisponível no momento. Fale com a Girumo.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ativar Recuperar" })).toHaveCount(0);
});

test("o status falhou: erro com tentar de novo, nunca a oferta; ao voltar, abre o módulo", async ({ page }) => {
  const estado = { status: 500, oferta: OFERTA_NORMAL } as EstadoMock;
  await moca(page, estado);
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await expect(page.getByText("Não deu para carregar o Recuperar.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Recupere o carrinho/ })).toHaveCount(0);
  estado.status = { enabled: true, precisaDeVoce: 0 };
  await page.getByRole("button", { name: "Tentar de novo" }).click();
  await expect(page.getByText("Liberado para a sua loja. Falta configurar.")).toBeVisible();
});

test("liberado: título, os quatro passos na ordem e nenhuma ação", async ({ page }) => {
  await moca(page, { status: { enabled: true, precisaDeVoce: 0 }, oferta: OFERTA_NORMAL });
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1, name: "Recuperar" })).toBeVisible();
  const passos = page.getByRole("list", { name: "Passos da configuração" }).getByRole("listitem");
  await expect(passos).toHaveText(["Conectar a Yampi", "Conectar o número do atendimento", "Definir como a loja assina as mensagens", "Testar no seu WhatsApp e ligar"]);
  await expect(page.getByRole("button", { name: /Ativar Recuperar|Conectar|Testar no seu WhatsApp/ })).toHaveCount(0);
});
```

Em `conteudo-esperado.ts`, entrada nova depois de `/painel/instagram/assinar`:

```ts
"/painel/recuperar": {
  // Desligado (a loja de QA) mostra a oferta; ligado, "falta configurar". O <h1> "Recuperar" monta antes do GET do status, então não serve de âncora.
  ancora: /Recupere o carrinho e o Pix que ficaram pra trás|Falta configurar/,
  semLista: "Casca do módulo: oferta de ativar ou o estado de configuração; ainda não há lista.",
},
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `T src/components/painel/recuperar/ativar-conteudo.test.ts` → FAIL (módulo inexistente).
Run (PowerShell, com `$env:E2E_EMAIL`/`$env:E2E_PASSWORD` do `qa-user@girumo.test`): `npm run web:e2e -- e2e/painel-recuperar-ativar.spec.ts` → FAIL (rota inexistente). Sem as credenciais o spec fica Skipped, e isso não é verde: a prova então é o job `e2e` do PR.

- [ ] **Step 3: Implementar**

- `layout.tsx` (servidor): `export const metadata = { title: "Recuperar — Girumo" }` e `<PortaDoRecuperar>{children}</PortaDoRecuperar>`. `page.tsx` (servidor): `<PagoFaltaConfigurar />` (o PR 7 troca por Hoje).
- `PortaDoRecuperar`: `recuperar === null` → `recuperarFalhou` ? `<ErroDeCarga titulo="Não deu para carregar o Recuperar." aoTentarDeNovo={recarregarRecuperar} />` : esqueleto (`role="status"`, `aria-label="Carregando o Recuperar"`, classe `pn-skeleton`); `!recuperar.enabled` → para `acessoRestrito(acesso)` um bloco neutro com `<h1>Recuperar</h1>` e "O Recuperar não está ativo nesta loja. Quem ativa é o dono ou um admin da loja." (sem buscar nada: a vendedora levaria 403 na oferta), senão `<Suspense fallback={null}><AtivarRecuperar /></Suspense>` (`useSearchParams` exige o Suspense); `enabled` → `children`.
- `AtivarRecuperar` (molde `components/painel/instagram/assinar.tsx` e `oferta.tsx`): busca `GET /api/billing/recuperar/oferta` (falha: "Não deu pra carregar a oferta." + "Tentar de novo"); estrutura do mockup (eyebrow "Recuperar · add-on pra quem vende na Yampi"; `<h1>` "Recupere o carrinho e o Pix que ficaram pra trás"; lead "A Yampi avisa a Girumo na hora. A mensagem sai no WhatsApp com o seu jeito de falar, e para sozinha quando a cliente responde ou paga."; os quatro `BENEFICIOS`; `<aside aria-label="Preço">` em papel, com "Por loja, além do seu plano", "R$ 127,00" (de `formatarReais(RECUPERAR_MENSAL_CENTS)`) e "/mês", `INCLUI`, o bloco de ação e `RODAPE_DO_PRECO`; seção "Perguntas de quem já vende" com `PERGUNTAS` em `<details>`). Botão de ação em cobalt (`bg-cobalt-500 text-paper-0`), alvo mínimo 44 px, texto base 14 px. **Bloco de ação, primeiro que casar:** (1) `?assinado=1` ou `bloqueio === "ja_assinado"` → `role="status"` "Pagamento recebido. Liberando o Recuperar da loja…" e `setInterval(recarregarRecuperar, 3000)` enquanto montado; (2) `!configurado` → "Assinatura do Recuperar indisponível no momento. Fale com a Girumo."; (3) `bloqueio === "sem_plano"` → "Assine um plano primeiro. O Recuperar é um add-on do plano da loja." e link "Ver os planos" para `/painel/configuracoes`; (4) `!podeCobrar` → "Só o dono ou um admin da loja pode ativar."; (5) caixa de seleção rotulada com `AVISO_DE_PRIVACIDADE.texto` + botão "Ativar Recuperar" (desabilitado sem a caixa; ocupado "Abrindo o pagamento…") que faz `POST /api/billing/recuperar/checkout` com `{ avisoConfirmado: true }` e `window.location.assign(url)`; erro vira `toast(error ?? "Não deu pra abrir o pagamento. Tente de novo.", "error")`; rede, "Sem conexão. Tente de novo.". Nota abaixo do botão: "A cobrança só acontece quando você confirma no pagamento. Cancele quando quiser em Configurações › Plano."
- `PagoFaltaConfigurar`: `<h1>` "Recuperar"; "Liberado para a sua loja. Falta configurar."; `<ol aria-label="Passos da configuração">` com "Conectar a Yampi", "Conectar o número do atendimento", "Definir como a loja assina as mensagens", "Testar no seu WhatsApp e ligar"; e "A configuração guiada ainda está sendo construída. Cada passo abre aqui quando estiver pronto."

- [ ] **Step 4: Rodar e ver passar**

Run: `T src/components/painel/recuperar/ativar-conteudo.test.ts` → PASS. `TSC` (as duas vezes), `LINT`, `npm --workspace apps/web run brand:check`. Run: `npm run web:e2e -- e2e/painel-recuperar-ativar.spec.ts e2e/painel-rotas.spec.ts` → PASS (o smoke de rotas já pega `/painel/recuperar` pelo filesystem).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/app/painel/recuperar apps/web/src/components/painel/recuperar apps/web/e2e
git commit -m "feat(painel): Recuperar page gate, Ativar and paid-not-configured states" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 10: Recuperar na barra de cima, no Mais e na vendedora

**Files:**
- Modify: `apps/web/src/lib/painel-nav.ts`, `apps/web/src/lib/painel-nav.test.ts`
- Modify: `apps/web/src/components/painel/barra-de-cima.tsx`, `menu-mais.tsx`, `lista-dos-modulos.tsx`
- Create: `apps/web/e2e/painel-recuperar-barra.spec.ts`

**Depends-on:** T8, T9 (o teste de nav exige `app/painel/recuperar/page.tsx`).

**Interfaces:**
- Consumes: `useCasca()` (`recuperar`, `liberacoes`), `RecuperarNaCasca`, `numero` (`@/lib/painel/grupos`).
- Produces (`painel-nav.ts`): `NavItem.comOferta?: Liberacao` ("add-on com oferta: dono, admin e operador veem o item no Mais mesmo desligado, e ele abre a oferta; a vendedora só com o add-on ligado"); item `RECUPERAR` (`href "/painel/recuperar"`, `label "Recuperar"`, ícone `ShoppingCart`, `grupo "vender"`, `modulo "recuperar"`, `comOferta "recuperar"`, sem `requer`) em `NAV_GROUPS` logo depois de `FUNIS`; `NAV_BARRA_COM_RECUPERAR` = Início, Campanhas, Disparos, Relâmpago, Recuperar, Grupos, Contatos; `linhaDoRecuperar(recuperar: RecuperarNaCasca | null): Record<string, string>`.

- [ ] **Step 1: Escrever os testes que falham**

No fim de `painel-nav.test.ts` (reusa `item`, `visiveis`, `DONO`, `OPERADOR`, `VENDEDORA`, `DESCONHECIDO`):

```ts
const COM_RECUPERAR = { instagram: false, recuperar: true };
const VENDEDORA_RECUPERA: Acesso = { role: "seller", modules: ["recuperar"] };

test("Recuperar: em Vender, do módulo recuperar, com oferta, fora das barras fixas", () => {
  const r = item("/painel/recuperar");
  assert.deepEqual([r.label, r.grupo, r.modulo, r.comOferta, r.requer], ["Recuperar", "vender", "recuperar", "recuperar", undefined]);
  for (const barra of [NAV_BARRA_DESKTOP, NAV_BARRA_ESQUERDA, NAV_BARRA_DIREITA, NAV_MOBILE_PRIMARY]) assert.ok(!barra.includes(r));
  assert.deepEqual(NAV_BARRA_COM_RECUPERAR.map((i) => i.href), ["/painel", "/painel/campanhas", "/painel/disparos", "/painel/relampago", "/painel/recuperar", "/painel/grupos", "/painel/contatos"]);
});

test("Recuperar: dono, admin e operador veem no Mais mesmo desligado; a barra só traz ligado, depois do Relâmpago", () => {
  for (const acesso of [DONO, OPERADOR]) {
    assert.ok(visiveis(acesso).includes("/painel/recuperar"));
    assert.ok(!itensDaBarra(acesso, { instagram: false, recuperar: false }).some((i) => i.href === "/painel/recuperar"));
    assert.deepEqual(itensDaBarra(acesso, COM_RECUPERAR).map((i) => i.href).slice(3, 6), ["/painel/relampago", "/painel/recuperar", "/painel/grupos"]);
  }
});

test("Recuperar: a vendedora vê só com o módulo E o add-on ligado; sem acesso conhecido, nada", () => {
  const r = item("/painel/recuperar");
  assert.equal(visivelNoMenu(r, VENDEDORA_RECUPERA, COM_RECUPERAR), true);
  assert.equal(visivelNoMenu(r, VENDEDORA_RECUPERA, { instagram: false, recuperar: false }), false);
  assert.equal(visivelNoMenu(r, VENDEDORA_RECUPERA, null), false);
  assert.equal(visivelNoMenu(r, VENDEDORA, COM_RECUPERAR), false);
  assert.equal(visivelNoMenu(r, null, COM_RECUPERAR), false);
  assert.equal(visivelNoMenu(r, DESCONHECIDO, COM_RECUPERAR), false);
  assert.deepEqual(itensDaBarra(VENDEDORA_RECUPERA, COM_RECUPERAR).map((i) => i.href), ["/painel/vendas", "/painel/recuperar"]);
});

test("Recuperar: a guarda deixa a vendedora na raiz e em Conversas e fecha o resto do módulo", () => {
  assert.equal(destinoDaPagina(VENDEDORA_RECUPERA, "/painel/recuperar"), "mostrar");
  assert.equal(destinoDaPagina(VENDEDORA_RECUPERA, "/painel/recuperar/conversas"), "mostrar");
  for (const p of ["automatico", "scripts", "ajustes"]) assert.equal(destinoDaPagina(VENDEDORA_RECUPERA, `/painel/recuperar/${p}`), "bloquear", p);
  assert.equal(destinoDaPagina(VENDEDORA, "/painel/recuperar"), "bloquear");
});

test("linhaDoRecuperar: o Mais diz quantos esperam; desligado não diz nada", () => {
  assert.deepEqual(linhaDoRecuperar(null), {});
  assert.deepEqual(linhaDoRecuperar({ enabled: false, precisaDeVoce: 0 }), {});
  assert.deepEqual(linhaDoRecuperar({ enabled: true, precisaDeVoce: 0 }), { "/painel/recuperar": "Recuperar · ninguém esperando" });
  assert.deepEqual(linhaDoRecuperar({ enabled: true, precisaDeVoce: 1 }), { "/painel/recuperar": "Recuperar · 1 precisa de você" });
  assert.deepEqual(linhaDoRecuperar({ enabled: true, precisaDeVoce: 12 }), { "/painel/recuperar": "Recuperar · 12 precisam de você" });
});
```

`e2e/painel-recuperar-barra.spec.ts` (`exigeCredenciais()`; `fechaBannerDev` copiada do `painel-vitrine-casca.spec.ts`; `moca` de `recuperar-mocks.ts`; `LIGADO = { enabled: true, precisaDeVoce: 12 }`):

```ts
for (const largura of [1024, 1280]) {
  test(`${largura} px: com o Recuperar ligado a barra não rola de lado`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 800 });
    await moca(page, { status: LIGADO, oferta: OFERTA_NORMAL });
    await page.goto("/painel/grupos", { waitUntil: "load" });
    await expect(page.getByTestId("painel-barra")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(largura);
  });
}

test("1024 px: o item vai pro Mais, que ganha o ponto e a linha com a contagem", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await moca(page, { status: LIGADO, oferta: OFERTA_NORMAL });
  await page.goto("/painel/grupos", { waitUntil: "load" });
  await fechaBannerDev(page);
  const barra = page.getByTestId("painel-barra");
  await expect(barra.getByRole("link", { name: /^Recuperar/ })).toBeHidden();
  const mais = barra.getByRole("button", { name: /^Mais.*12 precisam de você no Recuperar/ });
  await mais.click();
  await expect(page.getByTestId("painel-menu-mais").getByRole("link", { name: /Recuperar · 12 precisam de você/ })).toBeVisible();
});

test("1280 px: o item entra na barra com o contador e o Mais perde o ponto; na página dele só ele acende", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await moca(page, { status: LIGADO, oferta: OFERTA_NORMAL });
  await page.goto("/painel/recuperar", { waitUntil: "load" });
  await fechaBannerDev(page);
  const barra = page.getByTestId("painel-barra");
  const item = barra.getByRole("link", { name: /^Recuperar\s*12\s*precisam de você$/ });
  await expect(item).toBeVisible();
  await expect(item).toHaveAttribute("aria-current", "page");
  await expect(barra.getByRole("button", { name: /^Mais/ })).not.toHaveClass(/pn-barra__item--ativo/);
  await expect(barra.getByRole("button", { name: /precisam de você no Recuperar/ })).toHaveCount(0);
});

test("desligado: fora da barra, no Mais, e abre a oferta", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await moca(page, { status: { enabled: false, precisaDeVoce: 0 }, oferta: OFERTA_NORMAL });
  await page.goto("/painel/grupos", { waitUntil: "load" });
  await fechaBannerDev(page);
  const barra = page.getByTestId("painel-barra");
  await expect(barra.getByRole("link", { name: /^Recuperar/ })).toHaveCount(0);
  await barra.getByRole("button", { name: "Mais" }).click();
  await page.getByTestId("painel-menu-mais").getByRole("link", { name: "Recuperar" }).click();
  await expect(page).toHaveURL(/\/painel\/recuperar$/);
  await expect(page.getByRole("heading", { level: 1, name: "Recupere o carrinho e o Pix que ficaram pra trás" })).toBeVisible();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `T src/lib/painel-nav.test.ts` → FAIL (`NAV_BARRA_COM_RECUPERAR` e `linhaDoRecuperar` inexistentes; `item("/painel/recuperar")` indefinido).

- [ ] **Step 3: Implementar**

`painel-nav.ts`: o item, `comOferta`, `NAV_BARRA_COM_RECUPERAR`, `linhaDoRecuperar` (textos dos testes). `visivelNoMenu`: no ramo da vendedora, além do que já exige, `item.comOferta` só vale com `liberacoes?.[item.comOferta] === true`; dono, admin e operador seguem a regra de antes (o item aparece sempre). `itensDaBarra`: base = `NAV_ALL` para acesso restrito; senão `liberacoes?.recuperar ? NAV_BARRA_COM_RECUPERAR : NAV_BARRA_DESKTOP`; depois o `filter(visivelNoMenu)` de sempre.

`barra-de-cima.tsx` (`NavDaBarra`): o link do Recuperar leva `max-xl:hidden` quando `!acessoRestrito(acesso)` (a vendedora não tem Mais para acolhê-lo) e, para o item `/painel/recuperar` com `recuperar` conhecido, um `SinalDoRecuperar` igual ao do Relâmpago: `pn-barra__contador` com `numero(n)` e `sr-only` " precisa de você" / " precisam de você" (nada se `n <= 0`). `menu-mais.tsx`: se `recuperar?.enabled && recuperar.precisaDeVoce > 0`, o botão Mais leva `<span className="xl:hidden">` com um ponto `pn-barra__ponto` absoluto no canto (`absolute right-1.5 top-3`, `aria-hidden`) e um `sr-only` ", N precisam de você no Recuperar" (ponto, não número: o botão não pode crescer a 1024 px); `SO_NO_MAIS` continua igual, mas `noMais` ignora o item cujo `comOferta` está ligado em `liberacoes` (ele mora na barra e é ele que acende). Lacuna aceita: entre 1024 e 1279 px, ligado e na página do módulo, nada acende. `lista-dos-modulos.tsx`: `linhas = { ...(dados ? resumo(dados) : {}), ...linhaDoRecuperar(recuperar) }`.

- [ ] **Step 4: Rodar e ver passar**

Run: `T src/lib/painel-nav.test.ts` → PASS (inclui "toda rota do menu existe" com a página da T9). `TSC` (as duas vezes), `LINT`. Run: `npm run web:e2e -- e2e/painel-recuperar-barra.spec.ts e2e/painel-vitrine-casca.spec.ts` → PASS. Se o teste de 1280 px estourar a rolagem, trocar `max-xl:hidden` por `max-2xl:hidden` e `xl:hidden` por `2xl:hidden` no mesmo commit, ajustando no teste só o `largura` do caso "o item entra na barra" para 1536.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/painel-nav.ts apps/web/src/lib/painel-nav.test.ts apps/web/src/components/painel apps/web/e2e/painel-recuperar-barra.spec.ts
git commit -m "feat(painel): Recuperar in the top bar and the Mais menu" -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>"
```

### Task 11: Verificação final, prova no Stripe de teste e fechamento

**Files:**
- Modify: `deploy/stripe/setup.md`

**Depends-on:** T1–T10.

- [ ] **Step 1: Documentar o add-on em `deploy/stripe/setup.md`**

Em "Limites conhecidos": "Cancelar o plano cancela também o add-on Recuperar no Stripe, e o Recuperar desliga quando o add-on cai. Recuperar liberado à mão pelo admin (sem assinatura) NÃO desliga com o plano: desligar à mão em /admin/tenants/[id]." Seção nova "## Add-on Recuperar": criar o preço uma vez por modo com `node infra/scripts/stripe-recuperar-preco.mjs` (com `STRIPE_SECRET_KEY` do modo no ambiente), copiar `STRIPE_PRICE_RECUPERAR=price_…` para a Vercel (Production e Preview) e o `.env.local`; "sem a variável a venda fica fechada (oferta indisponível, checkout 503)"; os eventos do webhook são os mesmos 8 já listados.

- [ ] **Step 2: Rodar tudo**

Run: `npm test` (raiz) → verde. `TSC` com `tsconfig.json` e com `tsconfig.e2e.json` → sem saída. `npm --workspace apps/worker exec tsc -- --noEmit` → sem saída (o worker não foi tocado). `LINT`. `npm --workspace apps/web run brand:check`. `npm run verify:local` → termina em "Verificacao local concluida com sucesso."

- [ ] **Step 3: Prova no Stripe em modo teste (manual, com o Igor)**

Com chaves de TESTE: `node infra/scripts/stripe-recuperar-preco.mjs`; `STRIPE_PRICE_RECUPERAR` e `STRIPE_WEBHOOK_SECRET` (do `stripe listen --forward-to localhost:3000/api/billing/webhook`) no `apps/web/.env.local`; app local contra o banco de DEV, dono de uma loja com plano ativo. Conferir, nesta ordem:
1. `/painel/recuperar` mostra a oferta; o botão só habilita com a caixa de privacidade marcada.
2. Pagar com `4242 4242 4242 4242`: volta com "Pagamento recebido. Liberando…" e em até ~10 s abre "Liberado para a sua loja. Falta configurar."
3. `select recuperar_enabled from tenant_settings where tenant_id = '<loja>'` → `true`; `select created_at, metadata from logs where event = 'recuperar.aviso.confirmado' order by created_at desc limit 1` → texto e versão.
4. Segundo clique no checkout (outra aba) → 409 "já está assinado".
5. Cancelar a assinatura do add-on no Dashboard de teste: a flag volta a `false` e a página volta a mostrar a oferta.
6. Assinar de novo e então cancelar o PLANO no Dashboard de teste: o webhook cancela o add-on junto e a flag volta a `false`.
7. No admin da loja: com assinatura viva, "Desligar o Recuperar" responde 409; sem assinatura, liga (com a caixa de confirmação) e desliga.

- [ ] **Step 4: Push, CI e merge**

Run: `git push -u origin <branch do 5a ou do 5b>` (sugestão: `feat/recuperar-cobranca` e `feat/recuperar-casca`), abrir o PR (descrição com o que é do 5a ou do 5b e a lista das Pendências abaixo), `gh pr checks <N>` até tudo verde (os jobs `e2e` e `integração` são a prova das T2, T9 e T10), `gh pr update-branch <N>` se a base andou, e então `gh pr merge <N> --squash --delete-branch`. Fechar o loop na mesma sessão (CLAUDE.md: "Regra de PR").

- [ ] **Step 5: Fechamento**

- Quadro (o card `recuperar-yampi` foi aberto antes do PR 1a): `select public.move_card('recuperar-yampi', 'em_construcao', 'PR 5 em main: cobrança e casca; falta Fase 0 e PRs 3, 4, 6 a 11', 'PR #<N>');` em prod.
- Decisão no grafo: `kg_insert_text` (MCP LightRAG), `source` `decisao-<AAAA-MM-DD>-recuperar-cobranca`, texto: "Recuperar — add-on Stripe separado (metadata.addon=recuperar, STRIPE_PRICE_RECUPERAR, R$ 127/mês, só Checkout); confirmação de privacidade registrada em logs (recuperar.aviso.confirmado), sem coluna; Recuperar entra na barra só a partir de 1280 px; vendedora alcança só a raiz e /conversas". Se o MCP não responder, entregar ao Igor o `rag insert` equivalente (`.\tools\lightrag\.venv\Scripts\rag.exe insert "<texto>" --source <source>`).
- **Pendências do Igor antes de vender:** rodar o script de preço em modo live; `STRIPE_PRICE_RECUPERAR` na Vercel; revisar o texto de privacidade, o FAQ de segurança do número e o texto da página Ativar; decidir se mantém o painel de preço em papel (o mockup o faz em Volt).
- Reportar ao encerrar: **"PRs que deixei abertos: …"** ou "nenhum".

---

## Cobertura do spec e lacunas

- **Cobertura do spec:** §3 (Stripe separado, `metadata.addon`, `STRIPE_PRICE_RECUPERAR`, sem implantação, plano ativo, webhook liga/desliga, `requireRecuperar` 403 `recuperar_disabled`, admin liga/desliga à mão, desligado mostra Ativar, confirmação de privacidade) → T3, T4, T5, T6, T7, T9. §4 (barra com contador sem rolagem a 1024 px, senão Mais; sem o add-on em Mais › Vender abrindo Ativar; Ativar com preço e o que inclui; "pago, falta configurar") → T8–T10. §5 (tabela de papéis) → T1, T5 (operador sem cobrança), T6, T9, T10. §1.4 "add-on desligado para tudo": neste PR só a flag muda; quem lê é `requireRecuperar` (T6, com teste estrutural) e as barreiras dos PRs 3 e 7 (ver Lacunas).
- **Lacunas deixadas de propósito:** contador na barra inferior do celular (vendedora) fica para o PR 8; parar casos e cancelar `na_fila` ao desligar é do PR 7 (agendador) e do PR 3 (o claim lê a flag): os dois PRs precisam de um teste que prove "flag desligada não envia"; cobrança no cartão salvo; "Cancelar" dentro do módulo (o cancelamento é o portal do Stripe em Configurações › Plano).
