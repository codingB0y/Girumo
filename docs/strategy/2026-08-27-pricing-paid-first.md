# Análise: Free Trial × Freemium × Paid-Only — HubFlow

> **Data:** 27/08/2026 · **Status:** ✅ DECIDIDA pelo Igor em 27/08/2026 — em aplicação
> **Método:** workflow multi-agente (Pricing Analyst, Growth Hacker, Trend Researcher, Financial Analyst → 2 Reality Checkers adversariais → síntese Business Strategist). 7 agentes, ~940k tokens, 52 tool calls.
> **Registrado:** grafo (`analise-pricing-2026-08-27`) + memória (`analise-pricing-paid-first-2026-08-27`)

## Fatos verificados (prod, 27/08/2026)

- Planos: FREE R$0 (1 funil, 250 contatos, **0 campanhas**, 1 instância) · Essencial R$197 (10 campanhas, 1 instância) · Growth R$297 (50 campanhas, 3 instâncias) · Operação R$497 (500 campanhas, 10 instâncias). Stripe live desde 25/08.
- Base: **23 organizações, 20 em `subs_free`, 1 assinatura ativa** — pré-PMF.
- FREE com `campaigns: 0` → usuário free toma **402 na primeira campanha** (nunca experimenta a feature principal).
- Bug pendente: tenant **sem** subscription cai em caminho sem limites (ilimitado por acidente).
- Decisão já registrada no grafo: "7 dias grátis" removido da landing em favor de **garantia incondicional de 30 dias**.
- Landing também vende pacote de implementação "Growth" R$5.497 único (colide de nome com o plano Growth R$297).

---

## DECISÃO RECOMENDADA

**Paid-first híbrido: matar o plano FREE, vender pago desde o dia 1 com garantia de 30 dias + Pix, e manter como único componente gratuito um modo demonstração de custo marginal zero (sandbox com dados simulados, SEM instância WhatsApp conectada) + CTA "agendar demonstração" que captura o WhatsApp do lead. Sem free trial, sem freemium.**

É a única posição que sobreviveu aos dois red teams:

- **Red team contra "ter algo grátis"** refutou freemium/trial: custo do free não é zero (R$28/signup no mês 1, 85% suporte), infra quebra em ~200 frees, ICP pouco técnico vira fila de CS não paga, free sem onboarding é quem mais viola a disciplina anti-ban (Evolution/Baileys não-oficial — ban do número destrói o negócio do lojista e vira boca-a-boca negativo), e 20 frees já demonstraram conversão ~zero. **Mas admitiu:** sandbox sem instância conectada é o único free defensável.
- **Red team contra "nada grátis"** refutou o paid-only absoluto: a premissa de 5% de compra direta no paywall não tem nenhum dado interno; toda a categoria BR de ticket comparável dá trial sem cartão; e paid-only puro faz todo visitante que não paga sumir sem virar lead — a matéria-prima exata do founder-led sales. **Mas propôs:** paid-FIRST com porta de prova de custo zero.

### Catálogo recomendado

| Plano | Preço | Mudança |
|---|---|---|
| ~~FREE~~ | — | **Remover** do catálogo/signup; vira demo sandbox sem instância. Migrar as 20 orgs free com oferta de 30d de Essencial + call; sem conversão em 60d → arquivar instância (libera RAM) |
| **Starter (novo)** | R$97/mês | 1 instância, 1.000 contatos, 2 funis — degrau psicológico padrão da categoria (Grupzap R$97, Astron R$97, ZapResponde R$99, Umbler R$69); elimina o salto free→197, o maior da categoria |
| Essencial | R$197/mês | Manter (mediana exata da categoria); testar R$237 em coorte NOVA depois, nunca na base |
| Growth | R$297/mês | Manter |
| Operação | R$497/mês | Manter |

**Value metric:** campanhas **ilimitadas** em todos os planos pagos (teto anti-abuso invisível) — limitar campanha é taxar o hábito que gera retenção; tiers escalam por **contatos + instâncias** (únicos limites que escalam com o valor recebido; instância também escala com custo de infra). Capture ratio atual: 0,14-0,33% do faturamento do cliente — headroom enorme; expansão vem do cliente crescendo, não de aperto de preço.

**Garantia de 30 dias:** posicionar agressivamente — "o dobro do padrão do mercado (14 dias) — e pague no Pix" (nenhum global aceita boleto; os análogos diretos SendFlow/DevZapp nem trial dão). Internamente amarrada a SLA de ativação: call D1 (conectar WhatsApp + importar grupos, feita pelo fundador), 1ª campanha real até D7. Garantia sem ativação = máquina de refund.

**High-ticket R$5.497:** manter como oferta separada (validado pelo teto do SendFlow R$5.000/semestre), com 3 correções: renomear (ex. "Implementação Método Grupo VIP" — hoje colide com o plano Growth), qualificação explícita na landing ("fatura R$60k+/mês? Aplique"), e embutir 3 meses de Operação com conversão automática em assinatura R$497/mês no mês 4 (vira canal de aquisição de contas Operação em vez de one-off ≈ 11 meses de Growth que não recorrem).

**Anual à vista no Pix = 2 meses off** — único desconto legítimo (resolve caixa e inadimplência de uma vez). Nunca descontar sem contrapartida.

### Pré-requisitos técnicos (ordem importa — sem eles o paid-first é ficção)

1. **P0:** fechar bug tenant-sem-subscription-ilimitado + as **3 portas de conta-sem-plano** (signup, /login com Google também cria conta, convite) — senão remover o FREE cria grátis ilimitado não instrumentado
2. UI pro `invite_url` (hoje só via PATCH /api/groups — gap de ativação que fabrica refund)
3. **Vercel Pro** (~R$110/mês) — Hobby com billing live viola ToS; obrigação, não otimização
4. Instrumentar funil por coorte: WhatsApp conectado, 1ª campanha, refund — o dado que decide toda revisão futura

---

## Análise de custo (Financial Analyst — premissas explícitas no run)

| Item | Valor |
|---|---|
| Custo de 1 tenant FREE, mês 1 | **R$27,95** (infra R$1,70 + suporte R$26,25 — 85% é CS, não servidor) |
| Custo de 1 tenant FREE, regime | R$10,45/mês |
| Instância Evolution conectada | ~225MB RAM ≈ R$1,50/mês (VPS ~R$5-6,70/GB efetivo) |
| 50 frees | ~R$630/mês — infra aguenta |
| 200 frees | **infra quebra** (Vercel Hobby + VPS única): R$450-550/mês infra + ~meio headcount CS |
| 1.000 frees | R$12-15k/mês (multi-VPS + 1,5-2 CS) por receita direta zero |
| Trial 14d, custo/trial | ~R$27; breakeven de conversão 0,8% (LTV) / 16,2% (payback 1 mês) — custo NÃO é o argumento contra trial |
| Refund na garantia | ~R$50 all-in/estorno (Stripe não devolve taxas: cartão 3,99%+R$0,39, Pix 1,19%; boleto manual) → ~R$5/venda a 10% de refund |
| Por 100 signups | Trial: R$2.700 → ~10 clientes (R$270/cliente) · Garantia: ~R$60 → ~4,5 clientes (R$13/cliente) |
| LTV margem (churn 5%, margem 85%) | Essencial R$3.349 · Growth R$5.049 · Operação R$8.449 |
| Teto de CAC | **R$500** até observar 3 meses de churn real; depois R$1.000 (payback ≤6m). LTV varia 2,3x entre churn 3% e 7% — churn real é DESCONHECIDO (n=1) |

**Estatística decisiva:** com o tráfego atual, n=25 trials tem IC95% de ±13pp — trial self-serve não responde nada em 90 dias. O que gera aprendizado por real gasto é venda concierge founder-led (15-20 onboardings ≈ R$500-1.500 no total).

## Benchmark de concorrentes (verificado 27/08)

| Player | Preço | Trial/Free | Garantia |
|---|---|---|---|
| **SendFlow** (análogo mais direto — grupos) | R$1.500-5.000/semestre | ❌ nenhum | 14 dias |
| **Grupzap** (estrutura mais próxima) | R$97/197/497 | trial 7d sem cartão | 14 dias |
| **DevZapp** (grupos VIP) | R$197/447/697 | ❌ | ❌ |
| BotConversa | R$199/297 | trial sem cartão | devolução 100% |
| Umbler Talk | R$69-129/atendente | trial 7d | — |
| Low-ticket (ZapVoice, ZapResponde, WhatsGW) | R$30-99 | trial 2-7d | — |
| Astron Members (adjacente) | R$97+ | trial 15d | — |
| Global (Wati, Respond.io, Interakt) | US$28-79 | trial 7-14d sem cartão, **zero freemium** | — |
| **ManyChat** | US$39+ | free **cortado de 1.000 → 25 contatos em mar/2026** | — |

Padrão que o lojista espera: testar 7d sem cartão OU garantia 14d; entrada R$69-99; plano principal R$197-297. HubFlow acerta o preço (R$197 = mediana) e supera a garantia (30 vs 14). O anti-padrão era o FREE que bloqueia a feature principal — nenhum concorrente faz isso.

## Gatilhos que REABREM a discussão do trial (decisão reversível por desenho)

Medidos por coorte de 30 dias; qualquer um dispara o piloto de **trial 14d SEM cartão como A/B** (nunca como default):

1. Refund >15% em qualquer coorte
2. <60% dos compradores com 1ª campanha real enviada em ≤14 dias
3. Compra direta no paywall <2% após ≥30 conversas de venda documentadas

## GTM 2026 — Brasil, SaaS sem clientes (rankeado esforço×impacto)

O gargalo é **aquisição, não conversão**. Não traduz do playbook gringo: cold email (3-5% resposta vs 40-60% no WhatsApp), PLG puro pra SMB pouco técnica, LinkedIn (ICP não vive lá), SEO/AEO agora.

1. **Founder-led sales via WhatsApp 1:1 na rede Mega Stock** — 30 warm intros; conversão sales-assisted 15-25% vs 3-5% self-serve; única fonte de aprendizado de objeção/churn pré-PMF
2. **Case Mega Stock como método nomeado** (ex. "Método Grupo VIP") no Instagram PESSOAL do fundador, 3x/semana, Reels com números reais — categoria "mentora de dona de loja" (Fernanda Rolin, Camila Brandão, Hotmart) já provou que o ICP paga por método nesse formato
3. **Fornecedores do Brás/Bom Retiro como afiliados** (20-30% recorrente 1º ano) — cada fornecedor é lista viva de centenas de lojistas; canal que a categoria (que mira infoprodutor) ignora; indefensável sem relacionamento físico
4. **Venda presencial no Brás** — playbook ZAX (700+ fornecedores porta-a-porta, R$32M captados)
5. **Mentoras/micro-influencers de lojista (10-100k) como afiliadas** — não comprar a Ruama Melo (1M, cara demais pra fase)
6. **Fenim** (800+ marcas, 20 mil lojistas) — visitar antes de pagar estande; o case é a palestra
7. **Indicação estruturada** (1 mês off pra cada lado)

Fora até 10 pagantes: tráfego pago, SEO/AEO, freemium.

## Plano 30/60/90

- **Dias 1-30:** P0s técnicos (semana 1) → remover FREE + demo sandbox + landing "garantia 30d, o dobro do mercado, pague no Pix" → 30 mensagens WhatsApp 1:1 → migrar 20 orgs free → 3 posts/semana. **Meta: 3 pagantes, 100% com campanha real ≤D7.**
- **Dias 31-60:** Starter R$97 no ar; renomear high-ticket + qualificação + 3 meses de Operação embutidos; venda presencial; 1ª parceria fornecedor + 1ª mentora afiliada; case nº 2 publicado. **Meta: 6-7 pagantes; refund coorte 1 medido; ≥10 conversas/semana.**
- **Dias 61-90:** indicação estruturada; avaliar Fenim; testar R$237 em coorte nova; **revisão formal com ≥30 conversas + 2 coortes** → dobrar no canal vencedor OU gatilho disparado → A/B de trial. **Meta: 10 pagantes; churn observado; decisão registrada no grafo.**

### Métricas da fase (não-vaidade)

Conversas WhatsApp iniciadas/semana (≥10) · demos do fundador (≥3/sem) · demo→pagante (≥20%) · ativação ≤14d (≥60%) · refund/coorte (≤10%) · captura de lead no sandbox (≥30% deixam WhatsApp) · churn mensal a partir da coorte 1 (>7% com n≥5 = congelar CAC>R$500) · high-ticket: ≥2 aplicações qualificadas e ≥1 fechamento em 90d.

## Riscos principais

1. **Máquina de refund** (garantia 2x mais longa + gaps de ativação conhecidos) → SLA D1/D7 + UI do invite_url antes de escalar; refund >15% = parar aquisição e consertar onboarding
2. **Enforcement vazado** (bug tenant + 3 portas) → P0 semana 1
3. **Fricção máxima da categoria** (todos dão trial sem cartão) → contra-narrativa garantia+Pix + fallback pré-comprometido (A/B de trial)
4. **Ban de WhatsApp** em conta mal onboardada → onboarding concierge obrigatório na fase atual
5. **Gargalo do fundador** (~50 clientes máx no concierge) → documentar cada onboarding desde o nº 1; o playbook do high-ticket é o protótipo do onboarding escalável

## Fontes principais

Benchmarks: [ChartMogul/ProductLed via Userpilot](https://userpilot.com/blog/saas-average-conversion-rate) · [First Page Sage](https://firstpagesage.com/seo-blog/saas-free-trial-conversion-rate-benchmarks) · [daydream](https://withdaydream.com/library/insights/freemium-conversion-rate) · [PulseRevOps](https://pulserevops.com/revenue-architecture/ra0248) · [QuickSprout (garantia vs trial)](https://www.quicksprout.com/what-converts-better-free-trial-versus-money-back-guarantee) · [Stripe refunds](https://docs.stripe.com/refunds). Concorrentes: sendflow.com.br · grupzap.com · devzapp.com.br · botconversa.chat · wati.io · respond.io · manychat (corte do free: chatbot.com/blog/manychat-pricing). GTM: [Bessemer founder's playbook](https://www.bvp.com/atlas/the-founders-playbook-for-scaling-to-1-million-arr) · [ZAX/Exame](https://exame.com/insight/zax-startup-que-digitaliza-o-atacado-do-bras-capta-r-32-milhoes/p) · fenim.com.br.
