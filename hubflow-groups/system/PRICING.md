# Precificação DevZap Groups (estratégia — Pricing Analyst, 2026-06-22)

## Preços DEFINIDOS por Igor (2026-06-22) — mais baixos que a recomendação do analista
| Plano | R$/mês | O que tem |
|---|---|---|
| Essencial | **197** | 1 número, até 3 grupos, anti-ban+aquecimento, disparo+agendamento, boas-vindas+modelos, funil básico |
| **Growth ⭐** | **297** | Tudo + grupos ilimitados + ATRAIR (anúncio Meta+indicação) + MEDIR completo (recompra/atividade/pedidos) + suporte WhatsApp |
| Performance Max | **497** | Tudo do Growth + a gente opera setup e ofertas com você (DFY) + revisão estratégica mensal 1:1 + prioridade |

Destaque = Growth (297), o do meio. Value metric: flat por número de WhatsApp (1 número/conta hoje).

## ⚠️ Implicação honesta destes preços (trade-off)
Com ticket médio ~R$250-300, **R$7-8k MRR ≈ 25-30 clientes** (não 7-8). Isso SÓ funciona como **SELF-SERVICE**
(o cliente opera sozinho) — porque a R$197-497 NÃO cabe operar feito-para-você no teto de 30min/dia/cliente
(25 clientes × 30min = 12h/dia, inviável). Ou seja, com estes preços o modelo vira:
- Essencial/Growth = SELF-SERVICE (escalável, churn é o risco — precisa de bom onboarding no app).
- Performance Max (497) = único DFY, e poucos (cabem no tempo).
A recomendação original do analista (DFY R$997, ~7-8 clientes) foi REJEITADA por Igor em favor de preço
de entrada acessível (mais clientes, ticket menor). Decisão consciente. Acompanhar churn de perto.

## Recomendação original do analista (rejeitada, mantida p/ referência)
DFY R$497/997/1497 + setup; ~7-8 clientes de ticket alto = R$7-8k MRR cabendo no teto de tempo.

## Setup / garantia / fidelidade
- **Setup fee SIM** (R$997-1.500) nos planos DFY: filtra curioso, paga o trabalho pesado inicial.
- **NÃO oferecer trial grátis** (valor só aparece pós-setup). Em vez disso: **GARANTIA DE RESULTADO 30 dias**
  (não trouxe revendedora nova / não disparou com número protegido → devolve a mensalidade).
- **Sem fidelidade** (cancela quando quiser). **Plano anual** = 2 meses grátis (trava churn + caixa).

## Ancoragem vs alternativas do cliente
- Fazer manual = "grátis" mas risco de perder o número (catástrofe). 
- Ferramenta tipo DevZapp = R$147-697/mês (só dispara, não traz gente nem opera).
- Gestor de tráfego = R$800-2.000/mês (traz clique, não converte no grupo nem cuida de recompra).
- R$997 fica ABAIXO de "gestor + ferramenta separados" e ACIMA de "ferramentinha" = pacote completo mais barato.

## Caminho até R$7-8k MRR
2 clientes → 4 → 6 → **7-8 clientes** (mix 997/1497). ~3,5-4h/dia no pico (cabe no teto). 
TETO OPERACIONAL = 8 clientes DFY enquanto for 1 número/conta. Próximo gargalo de escala = MULTI-NÚMERO
(quando existir: vira flat + R$/número adicional, e abre self-service barato R$197-297 como funil de baixo).

## Riscos
- Churn por não-resultado → DFY garante ativação + garantia 30d + check-in mensal (MEDIR).
- "Sua ferramenta me derrubou" → comunicar anti-ban como REDUÇÃO de risco, nunca "ban zero".
- Custo de operar engine por cliente → teto duro de 8 clientes; padronizar templates.

> Landing (src/app/page.tsx) já exibe os 3 planos com Performance destacado, garantia 30d e CTA → WhatsApp.
> Igor: trocar o WHATSAPP placeholder em src/app/page.tsx pelo número real de vendas.
