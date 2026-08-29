# Checagem mensal de citação em IA

**Criado:** 29/08/2026 · **Cadência:** 1×/mês · **Custo:** ~10 min
**Plano de origem:** [`2026-08-28-seo-organico.md`](./2026-08-28-seo-organico.md) — item 1 da Fase 2

---

## Por que isto existe

O plano mede sucesso por três sinais. Dois viraram código nesta sessão:

| Sinal | Onde vive | PR |
|---|---|---|
| Clique em `wa.me` com página de origem | `acquisition_events` | #176 |
| Signup com origem de primeiro contato | `funnel_events.metadata.origin` | #180 |
| **Citação em resposta de IA** | **este documento** | — |

O terceiro não tem API. Nenhum dos assistentes expõe "você foi citado em X% das
respostas sobre este tema", e não existe ferramenta confiável que meça isso em
português para um nicho deste tamanho. A alternativa honesta é perguntar e
anotar — é manual de propósito, não por falta de tentativa de automatizar.

**Sem este registro, o marco de 180 dias do plano não é verificável.** Daqui a
seis meses a pergunta "a gente aparece quando alguém pergunta pra IA?" só teria
resposta de memória, que é o mesmo que não ter resposta.

---

## Procedimento

Uma vez por mês, em **sessão anônima** (conta logada carrega histórico e
personalização, e a resposta deixa de representar o que um estranho veria).

Perguntar, **exatamente assim**, em ChatGPT, Claude, Perplexity e Gemini:

1. `melhores ferramentas para grupo VIP de WhatsApp`
2. `como encher grupo de WhatsApp de revendedores`
3. `ferramenta para postar a mesma oferta em vários grupos de WhatsApp`
4. `sistema para atacado de roupa vender por grupo de WhatsApp`

Não reformular entre os assistentes: a comparação mês a mês só vale se a
pergunta for a mesma. Se um termo novo entrar na lista, ele começa uma coluna
nova — não substitui a antiga.

### O que anotar

Para cada par (pergunta × assistente), uma de três respostas:

- **`citado`** — a Girumo aparece na resposta, nomeada
- **`concorrente`** — a resposta nomeia ferramentas, mas nenhuma é a Girumo
  (anotar **quais**: é a lista de quem já ocupa o lugar)
- **`nenhuma`** — a resposta é genérica e não nomeia ferramenta alguma

`nenhuma` é o estado mais comum no começo e é **informação boa**: significa que
o espaço está vago, não que perdemos. A transição que interessa observar é
`nenhuma → concorrente`, porque é quando a vaga começa a ser preenchida — e é o
sinal de que o custo de entrar sobe a partir dali.

---

## Registro

Uma linha por checagem. Não apagar linhas antigas: a série é o dado.

| Data | Pergunta | ChatGPT | Claude | Perplexity | Gemini | Concorrentes nomeados |
|---|---|---|---|---|---|---|
| _(primeira checagem pendente)_ | | | | | | |

---

## Quando isto muda o plano

- **Duas checagens seguidas com `concorrente`** na mesma pergunta → há uma
  página do concorrente respondendo aquilo. Vale ler essa página e decidir se
  entramos com uma melhor ou se o termo não é nosso.
- **Primeira aparição de `citado`** → anotar **qual** página nossa a IA usou
  como fonte. É o formato que funcionou, e é ele que deve ser repetido no resto
  do portfólio de 22 páginas.
- **12 meses sem sair de `nenhuma`** em nenhuma pergunta → o canal não está
  respondendo. Reabrir a decisão de investir 8-20h/mês nele, conforme o
  critério de reversão do plano.
