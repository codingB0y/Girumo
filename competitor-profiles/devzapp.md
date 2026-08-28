# DevZapp — Competitor Profile

**URL**: https://www.devzapp.com.br (pricing vivo em `/grupos-v3`)
**Generated**: 2026-08-27
**Depth**: quick scan (screenshot do usuário + fetch da página viva + benchmark do doc de pricing 27/08)

---

## At a Glance

| Campo | Valor |
|---|---|
| Categoria | Automação de grupos de WhatsApp (grupos VIP / lançamentos) |
| ICP aparente | Infoprodutor / lançador (copy: "Lançamentos", "aprovação de leads", "escalar com segurança") |
| Tiers | Smart R$197 · Diamond R$447 (⭐ "O MAIS ESCOLHIDO") · Black R$697 — mensal, "assinatura recorrente" |
| Trial / Garantia / Anual | ❌ / ❌ / ❌ (nada mencionado na página) |
| Value metric | **Celulares conectados + links de redirecionamento** (grupos e mensagens ilimitados) |

## Pricing (verificado 27/08/2026)

| | Smart R$197 | Diamond R$447 | Black R$697 |
|---|---|---|---|
| Celulares conectados | 1 | 2 | **2** (não sobe!) |
| Links de redirecionamento | 1 | 4 (screenshot; fetch da página retornou 10 — divergência não resolvida) | 8 |
| Agendamentos recorrentes | **80** | — (sem teto exibido) | — |
| Mensagens / agendamentos avulsos | ilimitado | ilimitado | ilimitado |
| Grupos | ilimitado | ilimitado | ilimitado |
| Contatos / leads | não medido | não medido | não medido |
| Features de operação | Dashboard | + monitoramento entrada/saída, comentários em comunidades, blacklist/whitelist, contatos duplicados, aviso de inatividade/desconexão | + criação automática de grupos, aprovação de leads, monitoramento de leads em tempo real, acesso à API |
| Serviço | Suporte 09h–22h | Suporte VIP 08h–22h + treinamento gravado | **Grupo VIP no WhatsApp com especialistas 24/7, "atuação conjunta"** |

**Histórico (inferência, confiança média):** um PDF de planos antigo (Scribd) mostra Smart a **R$147 com teto de 40 grupos** e Diamond com teto de 110 grupos. A página viva hoje vende "grupos ilimitados" e limita celulares+links. Ou seja: eles **testaram medir por grupos e abandonaram**, subindo a entrada 147→197 na mesma jogada.

## Leituras estratégicas

1. **Celular conectado é tratado como unidade de custo E de risco.** Cap duro em 2 até no plano de R$697. Cada número = instância (RAM) + superfície de ban + carga de suporte; o cap contém o passivo deles, não só segmenta preço.
2. **"Mensagens ilimitadas" é table stakes; o estrangulamento monetizado é a porta de entrada** (link de redirecionamento 1→4→8).
3. **Só a automação sempre-ligada é medida no tier de entrada** (80 agendamentos *recorrentes*; avulso ilimitado).
4. **Acima de ~R$450 vende-se proximidade, não software.** Black ≈ Diamond em software; o delta real é grupo VIP 24/7 + atuação conjunta.
5. **Plumbing virou bullet de venda**: "aviso de inatividade e desconexão", "monitoramento de entrada e saída", "contatos duplicados" estampados na pricing page.
6. **Zero redução de fricção** (sem trial, sem garantia) — sustentável pro ICP de lançamento; é exatamente a cunha da garantia 30d+Pix do HubFlow.

## Comparativo com HubFlow (catálogo 27/08 + decisão paid-first)

| Eixo | DevZapp | HubFlow |
|---|---|---|
| Entrada | R$197 (1 celular) | Essencial R$197 (1 instância) · Starter R$97 planejado (dias 31–60) |
| Meio | R$447 · 2 celulares | Growth R$297 · **3 instâncias**, 10k contatos |
| Topo | R$697 · **2 celulares** + serviço 24/7 | Operação R$497 · **10 instâncias**, 100k contatos |
| R$ efetivo por celular no topo | ~R$348 | **~R$50** (7x mais barato) |
| Value metric | celulares + links | contatos + instâncias (campanhas ilimitadas por decisão) |
| Contatos | não mede | mede (PR #164 — value metric real) |
| Garantia/trial | nada | garantia 30d + Pix |
| Serviço recorrente no topo | sim (grupo VIP 24/7) | não (gap entre Operação R$497 e high-ticket R$5.497) |

## Raw Data Sources

- Screenshot da pricing page fornecido pelo usuário (27/08/2026) — fonte primária
- Fetch de https://www.devzapp.com.br/grupos-v3 (27/08/2026)
- Benchmark verificado em docs/strategy/2026-08-27-pricing-paid-first.md (mesma data)
- Versão antiga dos planos: PDF "Planos e Recursos do Devzapp" no Scribd (data desconhecida) — base da inferência grupos→celulares
