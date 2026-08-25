# Prompt para a próxima sessão

Copie o bloco abaixo inteiro como primeira mensagem.

---

Contexto: continuo a auditoria do HubFlow. O relatório está em
`docs/audits/2026-08-22-audit-skills.md`. LEIA ELE PRIMEIRO — cada achado já tem
arquivo:linha ou o SQL. NÃO refaça a auditoria.

Já fechados, não refazer:
* B.1 → PR #135 · C.1+C.2+C.8+D.1 → PR #136 · D.4+B.2 → PR #137
* A.2+B.4 → PR #138 · **D.3 → PR #139** (merge c8279e43) · **C.3 → PR #140** (merge 51dbb82a)

Estado ao encerrar 24/08: 0 PRs abertos, main em `51dbb82a`, suíte E2E 100/100,
unit 552/552.

## Tarefa: PR 7 — C.5 + C.6 + C.7 (checkout e configuração do Stripe)

Três achados MEDIUM, todos no mesmo módulo, todos verificados como AINDA ABERTOS
em 24/08:

* **C.5** — `apps/web/src/app/api/billing/checkout/route.ts:43` chama
  `stripe.customers.create` sem procurar customer existente e sem
  `idempotencyKey` (conferido: 0 ocorrências no arquivo). Cada checkout
  abandonado cria um Customer novo no Stripe.
* **C.6** — `apps/web/src/lib/security-guards.ts:35,40` casa só `sk_test_` /
  `sk_live_` por `startsWith`. Uma **restricted key** (`rk_live_`, `rk_test_`) —
  que é o formato recomendado pelo Stripe — passa batida pelos dois guards.
  Casar por `_test_` / `_live_`, não pelo prefixo `sk_`.
* **C.7** — `apps/web/src/lib/billing/stripe.ts:21` faz
  `new Stripe(requireEnv("STRIPE_SECRET_KEY"))` sem `apiVersion`. Com o SDK em
  `^22.2.3`, um update troca a versão da API sem ninguém decidir.

Escopo: SÓ esses três. NÃO mexer em `stripe-webhook.ts` (acabou de ser mexido no
#140) nem em `entitlements.ts` (ver bloqueado abaixo).

Checklist esperado:
1. Card no quadro ao COMEÇAR (criar se não existir)
2. Testes primeiro — `security-guards` e o resolver de price têm teste unitário
   viável; o checkout depende do SDK, então isolar o que dá
3. **VALIDAR POR MUTANTE**: para o C.6, provar que o teste fica vermelho se o
   guard voltar a casar só `sk_`
4. `apiVersion` pinada na versão que a conta usa hoje — conferir no dashboard
   antes de chutar
5. Antes do push, rodar os DOIS typechecks (ver armadilha abaixo)

## Bloqueados — não pegar sem destravar antes

* **`billing-tenant-sem-plano-e-ilimitado`** (card no quadro) — o mais grave que
  resta. `getTenantLimits` (`entitlements.ts:10-17`) filtra
  `.in("status", ["free","trialing","active"])`; sem linha devolve `{}`, e em
  `capability-limits.ts:69` limite `undefined` vira `{kind:"allow"}`. Quem não
  paga fica **sem teto nenhum**. Trava numa decisão do Igor: 2 das 21 orgs de
  produção estão nesse estado e passariam a ter limite de um dia para o outro.
  **Perguntar antes de codar.**
* **D.2** (13 telas de `/admin`) — precisa de um SEGUNDO usuário de E2E que seja
  admin. O `qa-user@girumo.test` é não-admin de propósito e
  `admin-gate.spec.ts` + os 6 testes H1 de `seguranca-impersonation.spec.ts`
  dependem disso. Só o Igor pode criar.
* **`billing-stripe-ligar-de-verdade`** (card no quadro) — a conta Stripe ainda
  não passou pela verificação de identidade, então só opera em test mode. Os
  produtos criados em test NÃO existem em live. Nada a fazer até aprovar.

## Ainda abertos, sem bloqueio

* **D.5** (MEDIUM) — `lib/analytics/funnel-events.ts:67-69,86-89`, `select` sem
  `limit`: acima de 1000 eventos o funil conta errado sem sinal de erro. Fix é
  agregar no banco com `group by` via RPC.
* **A.4** (MEDIUM) — `plans` servida sem filtro de tenant. **Cuidado:** a
  memória `finding-plans-e-catalogo-global` já concluiu que `plans` É catálogo
  global de propósito e filtrar quebraria o checkout dos 21. O fix aqui é
  `unique(code)` + comentário, NÃO adicionar `.eq("tenant_id")`.
* **B.3** (MEDIUM) — 12 tabelas do Squad OS só existem em prod. Já tem card com
  prazo 30/09 e allowlist no gate de drift.
* **`qa-squad-os-api-mascara-erro`** — `/api/squad-os/*` responde `[]` com status
  200 quando a consulta falha (`agents/route.ts:19` e irmãos). Nenhuma defesa do
  E2E pega isso. Depende do B.3 ser decidido antes.
* LOW: A.3, B.5, função órfã `increment_automation_runs`,
  `auth_leaked_password_protection`, policy `lp_templates_read`.

## Regras

Dois bancos (dev `wfjuwogxaupyadwhvoxy`, prod `nidoatbxaylrkcgbszns`), toda
migração nos DOIS · ordem real em `deploy/supabase/apply-order.txt` ·
PowerShell 5.1 (sem `&&`/`||`) · nunca `git add -A`, conferir `git diff --cached`
· um PR = uma coisa · fechar o loop na mesma sessão · `no_ar_verificado` só com
prova colhida na hora · **não mergear sem eu autorizar**.

## Armadilhas registradas (custaram tempo nesta sessão)

* **`npm run web:lint` e `npm test` NÃO checam tipo.** O eslint não olha tipo e o
  `tsx --test` transpila e descarta. Declarei "552/552 verde, lint limpo" com o
  código sem compilar e o CI voltou vermelho em 3 jobs. Antes do push:
  ```
  npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.json
  npm --workspace apps/web exec tsc -- --noEmit --project tsconfig.e2e.json
  ```
  São dois porque o tsconfig do build ignora `e2e/**` e `playwright.config.ts`.
  `pwsh` NÃO existe nesta máquina (só PowerShell 5.1), então `verify-local.ps1`
  não roda direto.
* **`vercel env pull` não devolve valores neste projeto** — 38 de 53 vêm vazias,
  incluindo as que obviamente funcionam. "Vazio no pull" não prova nada; rodar o
  controle com uma var conhecida antes de concluir. Só o dashboard mostra.
* **`move_card` NÃO limpa o campo `blocker`** — limpar com `update` explícito.
* **`painel-cartao-compartilhavel.spec.ts`** pode falhar por meta suja em dev —
  não re-rodar por reflexo, ver memória `finding-e2e-meta-suja-armadilha-permanente`.
* **`--grep` do Playwright com `/painel/...`** quebra no Git Bash por conversão
  de path: usar `MSYS_NO_PATHCONV=1` na frente.
* Rodar `npm run schema:baseline` se mexer no schema de prod, senão o gate de
  drift fica verde por desatualização.

Antes de escrever código:
* `git fetch origin main; git log HEAD..origin/main --oneline | Measure-Object -Line`
* `gh pr list`
* mover o card em prod: `select public.move_card('<key>','em_construcao','<motivo>','<ref>');`

Comece me apresentando o checklist do PR 7 antes de mexer em qualquer arquivo.
