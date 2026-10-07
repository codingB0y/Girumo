# Assinatura do add-on Instagram — design

> **Status:** aprovado em conversa pelo Igor em 07/10/2026 (partes 1, 2 e 3).
> **Substitui** o §12 ("Cobrança (fase 4)") de `docs/superpowers/specs/2026-10-02-instagram-fluxos-design.md`.
> Fluxos do Instagram: fases 1 e 2 no ar e provadas em produção (07/10).

---

## 1. O que é

A loja assina o Instagram pelo painel e é liberada sozinha, sem SQL. Para vender com desconto,
o admin gera um **link nominal** que dá de 0% a 100% de desconto **na implementação**; a
mensalidade é sempre cheia.

## 2. Decisões

| Decisão | Valor | Quem / quando |
|---|---|---|
| Preço | **Implementação R$ 497,00 (única) + R$ 297,00/mês** | Igor, 07/10 (substitui R$ 200 de ativação do spec de 02/10) |
| Desconto | Só na implementação, de 0% a 100%, escolhido no admin | Igor, 07/10 |
| Link | **Nominal**: uma loja, uso único, validade de 7 dias, revogável | Igor, 07/10 |
| Cobrança | **Assinatura separada** só do Instagram (não é item da assinatura do plano) | Igor, 07/10 |
| Quem pode assinar | Só loja com plano **ativo ou em teste grátis** | Igor, 07/10 |
| Entradas | Painel (`/painel/instagram`, preço cheio) e link nominal (mesma página, com desconto) | Igor, 07/10 |
| Cartão já salvo | Cobra **só depois do clique** "Autorizar cobrança", com o valor na tela | Igor, 07/10 |

## 3. Stripe

**Produtos e preços** (criados uma vez, nos modos test e live):

| Produto | Preço | Variável |
|---|---|---|
| Instagram | R$ 297,00 / mês, recorrente | `STRIPE_PRICE_INSTAGRAM` |
| Implementação Instagram | R$ 497,00, único | `STRIPE_PRICE_INSTAGRAM_IMPLANTACAO` |

**Desconto:** um cupom da Stripe por convite, `percent_off` = desconto do convite,
`duration: once`, `applies_to.products = [Implementação Instagram]`, `max_redemptions: 1`.
A fatura mostra "Implementação R$ 497,00 · desconto N% · total". Convite sem desconto (0%) não cria
cupom.

**A assinatura do Instagram:**
- item recorrente `STRIPE_PRICE_INSTAGRAM`;
- implementação como `add_invoice_items` (`STRIPE_PRICE_INSTAGRAM_IMPLANTACAO`) na primeira fatura;
- cupom do convite, quando houver, em `discounts`;
- `metadata = { tenant_id, addon: "instagram", invite_id? }` na assinatura (e na sessão de
  checkout, em `subscription_data.metadata`);
- sem teste grátis: cobra no dia e renova todo mês nesse dia;
- mesmo `customer` da loja (`organizations.stripe_customer_id`, via `tenant-customer.ts`).

## 4. A página de assinar

`/painel/instagram/assinar` (dentro da casca do painel, exige login). Com `?convite=<token>`,
aplica o desconto do convite.

**Mostra**
- Implementação ~~R$ 497,00~~ **R$ X** (sem desconto: R$ 497,00, sem o valor riscado);
- Mensalidade **R$ 297,00/mês**, renova todo dia D;
- **Total hoje: R$ (X + 297,00)**.

**Ações**
1. **Cartão salvo** (a loja tem método de pagamento padrão no customer da Stripe): "Cobrar
   R$ total no Visa final 4242" + botão **"Autorizar cobrança"**. O clique chama
   `POST /api/billing/instagram/assinar` → `subscriptions.create` com o cartão padrão,
   `payment_behavior: "default_incomplete"`, `Idempotency-Key` por convite (ou por loja + dia
   sem convite).
   - Pago na hora: volta para `/painel/instagram?assinado=1`.
   - Banco pede confirmação (3D Secure) ou recusou: devolve a `hosted_invoice_url` da primeira
     fatura e o navegador vai para a página de pagamento da Stripe, que confirma e volta.
   - Link "usar outro cartão" leva para a ação 2.
2. **Sem cartão salvo** (ou "usar outro cartão"): `POST /api/billing/instagram/checkout` cria um
   Checkout hospedado (`mode: "subscription"`, as duas linhas, o cupom) e devolve `{ url }`,
   igual ao checkout do plano.

**Bloqueios** (validados no servidor, nas duas rotas)
- Loja sem plano ativo ou em teste: "Assine um plano primeiro" + botão do plano. 409.
- Loja que já tem o add-on ativo: volta para `/painel/instagram`. 409.
- Convite de outra loja: "Este convite é de outra loja." Não oferece o preço cheio no lugar. 403.
- Convite vencido, revogado ou usado: "Este convite expirou. Fale com a Girumo." e mostra o preço
  cheio como alternativa.
- Só dono ou admin da loja assina (`assertPermission`, mesma permissão de cobrança do plano).

**Oferta no painel:** em `/painel/instagram`, a loja **sem** `instagram_enabled` vê a oferta
com o preço e o botão "Assinar o Instagram" (vai para `/painel/instagram/assinar`), no lugar do
aviso neutro "não está liberado".

## 5. Convite nominal (admin)

Na tela da loja (`/admin/tenants/[id]`), bloco **"Convite do Instagram"**, ao lado de
"Conceder plano".

- **Gerar:** desconto de 0 a 100% (padrão 100%), prévia "Implementação R$ 497,00 → R$ X",
  validade de 7 dias. Devolve o link com botão "Copiar":
  `https://app.girumo.com.br/painel/instagram/assinar?convite=<token>`.
- **Um convite aberto por loja:** gerar outro revoga o anterior (e desativa o cupom dele na
  Stripe).
- **Revogar:** botão no convite aberto.
- **Histórico:** quem gerou, quando, desconto, validade, se foi usado (data e assinatura).
- **Auditoria:** gerar e revogar escrevem `logs` (`admin.instagram.invite`), como a cortesia.

**Token:** 32 bytes aleatórios em base64url. O banco guarda só o **SHA-256** do token
(`token_hash`); o link sai uma vez, na resposta de "Gerar". Comparação pelo hash, nunca pelo
token.

**Uso:** a página resolve o convite pelo hash e confere `tenant_id = loja da sessão`,
`revoked_at is null`, `used_at is null`, `expires_at > now()`. O convite vira **usado** quando o
webhook vê a assinatura com `metadata.invite_id` ativa (não no clique: pagamento recusado não
gasta o convite).

## 6. Dados

Uma migração nos **dois** bancos, registrada em `deploy/supabase/apply-order.txt`, baseline
regenerada no mesmo PR.

**`instagram_invites` (nova)**: `id uuid pk`, `tenant_id uuid not null` (fk organizations),
`token_hash text not null unique`, `discount_percent int not null check (0..100)`,
`stripe_coupon_id text`, `expires_at timestamptz not null`, `created_by uuid not null`,
`created_at timestamptz default now()`, `revoked_at timestamptz`, `used_at timestamptz`,
`stripe_subscription_id text`. Índice único parcial: um convite aberto por loja
(`where revoked_at is null and used_at is null`).

RLS ligado; policy de leitura `app.has_membership(tenant_id)`; escrita revogada de
`authenticated` (só o servidor escreve); `anon` sem privilégio (event trigger já cuida). Toda
query da store filtra `.eq("tenant_id", ...)`.

**`subscriptions`** não ganha linha para o add-on: a tabela tem `onConflict: tenant_id` e é do
plano. O estado do add-on é `tenant_settings.instagram_enabled` + a própria assinatura na Stripe.

## 7. Webhook

Em `src/lib/billing/stripe-webhook.ts`:

1. **Assinatura com `metadata.addon = "instagram"`** não passa por `upsertSubscription`. Em
   `customer.subscription.created|updated|deleted`:
   - status `active` ou `trialing` → `instagram_enabled = true`; se tem `invite_id`, marca o
     convite como usado (`used_at`, `stripe_subscription_id`), só se ainda aberto e da mesma loja;
   - status `canceled`, `unpaid`, `incomplete_expired` ou evento `deleted` →
     `instagram_enabled = false`, `pauseLiveFlows` e `stopActiveRuns`;
   - `past_due` e `incomplete` não mudam nada (a Stripe ainda tenta cobrar).
2. **Assinatura do plano** cancelada (`deleted`, ou `canceled`) → cancela na Stripe as assinaturas
   `addon=instagram` ativas do mesmo customer ("cancelou o plano, cai o add-on junto").
3. **Consertos que o spec de 02/10 já pedia:**
   - o item do plano é achado pelo preço (entre os preços de plano), não por `items.data[0]`;
   - `subscriptions.metadata` é **mesclado** (hoje é sobrescrito e apaga `manual_grant`).
4. `invoice.paid` do add-on não entra no funil do plano.

## 8. Segurança

| Superfície | Proteção |
|---|---|
| Rotas de assinar | `getTenantContext` + `assertPermission`; plano ativo conferido no servidor; valores calculados no servidor (o cliente nunca manda preço nem desconto) |
| Convite | token só no link, hash no banco, uma loja, uso único, 7 dias, revogável |
| Cartão salvo | cobrança só no POST disparado pelo clique; `Idempotency-Key`; nada de cobrança em GET |
| Admin | `getAdminContext` (tabela `platform_admins`), log de auditoria |
| Webhook | assinatura da Stripe já conferida pela rota atual; liga/desliga só pela loja de `metadata.tenant_id` conferida contra o customer |

## 9. Fora desta entrega

- Desconto na mensalidade, link aberto (multiuso), troca de cartão dentro da página (o portal da
  Stripe já faz).
- Política de privacidade citando a Zernio como suboperadora: **pendência antes da venda aberta**.

## 10. PRs

| PR | Entrega | Pronto quando |
|---|---|---|
| J | Webhook: add-on separado do plano, liga/desliga `instagram_enabled`, cancela junto com o plano; item do plano por preço; `metadata` mesclado | testes do webhook verdes, incluindo o `manual_grant` preservado |
| K | Migração `instagram_invites`, store, rotas e bloco do admin | admin gera, copia e revoga convite em produção |
| L | Página de assinar (cartão salvo e checkout), oferta em `/painel/instagram`, preços na Stripe e variáveis na Vercel | loja de teste assina com convite de 100% e o Instagram libera sozinho |
| M | Prova em produção e quadro | fatura com "desconto 100%", R$ 297,00 cobrados, liberado; cancelar desliga |

Um PR por vez, a partir de `origin/main`.
