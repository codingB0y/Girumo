# Add-on "celular adicional" — desenho da proposta

> **Data:** 28/08/2026 · **Status:** ✅ APROVADA pelo Igor em 28/08/2026 — R$ 97/celular/mês, via
> subscription item. Nenhum código escrito ainda; implementação em PR separado.
> **Origem:** análise competitiva DevZapp (27/08, `competitor-profiles/devzapp.md`) + decisão
> paid-first (`2026-08-27-pricing-paid-first.md`).

## Por que existe esta proposta

O value metric da categoria é **celular conectado**, não "campanha" nem "contato". A DevZapp cobra
~R$348/celular no topo da tabela dela. Nós entregávamos celular a ~R$50 no Operação — vendendo a
unidade que o mercado precifica caro pelo preço de encanamento.

## 1. Preço: R$ 97/celular/mês (aprovado)

Racional, do mais fraco ao mais forte:

- **Custo direto ≈ R$ 1,50/mês** por instância (RAM/Evolution). Serve de piso, não de âncora — preço
  não é custo.
- **Risco de ban.** Cada celular a mais é um número que pode ser banido pelo WhatsApp. O custo real
  não é a instância: é reprovisionar, reconectar e segurar a mão do lojista quando cai.
- **Suporte.** O alerta de desconexão (`/api/cron/emails`, job 3) dispara **por instância**. Dobrar
  celulares dobra a superfície de incidente por conta.
- **Ancoragem externa.** 3,6× mais barato que a DevZapp no topo. Defensável na conversa de venda sem
  virar leilão de preço.

## 2. Novos limites de plano (decidido em 28/08)

O Igor decidiu no mesmo dia rebaixar os celulares inclusos — mais fundo do que a proposta original
deste documento, que sugeria 5 no Operação:

| Plano | Preço/mês | Celulares | Preço por celular | Antes |
|---|---|---|---|---|
| Essencial | R$ 197 | 1 | R$ 197,00 | 1 |
| Growth | R$ 297 | 2 | R$ 148,50 | 3 |
| Operação | R$ 497 | 2 | R$ 248,50 | 10 |

Três consequências que valem registrar:

- **O celular deixa de diferenciar Growth e Operação.** Os dois passam a incluir 2. O Operação vira
  explicitamente um plano de **serviço** (setup assistido, revisão 1:1, prioridade), não de volume.
  A landing precisa deixar isso claro, senão o comprador do Operação se sente lesado ao descobrir.
- **O add-on passa a ter mercado.** A R$ 97, ele é mais barato que o preço marginal de qualquer
  plano — então crescer em celular vira compra de extra, não upgrade forçado.
- **Arbitragem saudável.** Essencial (R$ 197) + 1 add-on (R$ 97) = R$ 294, praticamente o Growth
  (R$ 297) — mas o Growth entrega grupos ilimitados e página com a marca. O Growth ganha a
  comparação sozinho, sem precisar de trava artificial.

**Ninguém é desligado retroativamente.** `assertPlanLimit` só roda em `instances:create`
(`entitlements.ts:77`): quem já tem 3 instâncias mantém as 3 e apenas não cria a próxima.

## 3. Mecânica no Stripe

Hoje o checkout cria **uma linha só**:

```ts
// apps/web/src/app/api/billing/checkout/route.ts:113
line_items: [{ price: priceId, quantity: 1 }],
```

O add-on vira um **segundo subscription item** na mesma assinatura, com `quantity` = número de
celulares extras. Um único `price` recorrente novo no Stripe (R$ 97/mês), reaproveitado por todos os
planos — quantidade, não catálogo. Alterar quantidade usa proration nativa do Stripe.

## 4. O bloqueio de verdade: o teto é global, não por assinatura

Este é o achado que decide o tamanho do trabalho. Hoje o limite efetivo é resolvido assim:

```ts
// apps/web/src/lib/billing/entitlements.ts:47
.select("status, metadata, current_period_end, plans(limits)")
...
return tenantLimitsFrom({ subscription: { limits: plan?.limits ?? null } });
```

`plans.limits` é **catálogo global** (uma linha por plano, org sentinela). `tenantLimitsFrom` recebe
um único termo e devolve o que veio do plano — não existe lugar onde um extra por-tenant entre.

**Consequência:** vender o add-on mexendo em `plans.limits` aumentaria o teto de *todos* os tenants
do mesmo plano. O add-on exige que o limite efetivo passe a ser uma **soma de dois termos**:

```
limite_efetivo.whatsapp_instances = plans.limits.whatsapp_instances + extras_da_assinatura
```

Caminho de menor risco: `subscriptions.metadata` já existe e já é lido nesse mesmo select (para
`stripe_status`). Guardar ali `extra_whatsapp_instances`, escrito pelo webhook do Stripe a partir da
quantity do subscription item, evita migração de schema nos dois bancos. O ponto de leitura é único
(`tenantLimitsFrom`), então o enforcement em `instances:create` passa a valer sem tocar nos call-sites.

## 5. Regra de coorte: vale para todos

O add-on é **aditivo** e não redefine plano: cliente antigo e novo compram o mesmo extra pelo mesmo
preço, sem grandfathering.

O rebaixamento da seção 2 é outra história — esse **é** mudança de limite de plano existente. Como
`plans.limits` é global, aplicar o novo valor muda o teto de quem já assina. Duas coisas seguram o
risco: ninguém é desligado (seção 2) e a base é pré-PMF (23 orgs, 1 assinatura ativa em 27/08). O
custo de fazer agora é quase zero e só cresce.

> ⚠️ **Não verificado:** a consulta que mostraria em qual plano está a assinatura ativa e quantas
> instâncias ela usa foi bloqueada pelo classificador de permissões nesta sessão. O SQL de
> conferência está em `limites-1-2-2.sql` (última query) e precisa ser rodado antes de aplicar.

## Sequência sugerida

1. ✅ Aprovar preço e mecânica (este documento).
2. Aplicar os novos limites 1/2/2 — `plan-codes.ts` + `plans.limits` nos dois bancos
   (`limites-1-2-2.sql`) + merchandising na landing.
3. PR — limite efetivo vira soma (`tenantLimitsFrom` + `subscriptions.metadata`), sem UI e sem
   Stripe. Testável isoladamente, não muda comportamento com extras = 0.
4. PR — price no Stripe + subscription item no checkout/portal + webhook escrevendo a quantity.
5. PR — UI de "adicionar celular" no painel de assinatura.
