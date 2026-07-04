# Landing copy — clareza em 5s + remoção de promessas falsas

**Data:** 2026-07-04 · **Lane:** Frontend+UI · **Branch:** `feat/landing-copy-honest-clarity`
**Escopo:** copy da landing (`/`) + micro-ajustes estruturais. Zero redesign visual — layout, tokens e animações intactos.

## Problema

1. **Clareza:** tráfego frio (Meta/Google) não entende o que o produto faz nos primeiros 5 segundos.
   O hero atual vende duas features de uma vez e exige decodificação ("link rastreado", "campanhas", "painel com IA").
2. **Honestidade:** a página promete features que não existem e exibe prova social inventada:
   - "painel com IA que agenda, posta e gerencia" (hero + OG description)
   - "a IA configura por você" (ticker + card de features + FAQ + mechanism)
   - "127 lojistas · avaliação 4.9" (hero) **e `aggregateRating` no JSON-LD** — rating fake em
     structured data é risco de penalidade manual do Google, além de desonesto.

## Decisões (Q&A com Igor, 2026-07-04)

| Pergunta | Decisão |
|---|---|
| Dimensão da melhoria | Copy/mensagem |
| Sintoma | Visitante não entende o produto em 5s |
| Mensagem-líder | A esteira completa — vender o resultado, não uma feature |
| Tráfego principal | Anúncio frio (Meta/Google) |
| Escopo | Página toda + microestrutura, sem redesign |
| IA visível ao cliente | **Não existe** → remover TODA menção a IA |
| Abordagem | A — resultado + mecanismo na cara ("o fluxo que vende" fica como motivo, não como hero) |

## Auditoria de alegações

| Alegação | Status | Ação |
|---|---|---|
| Grupo lotou → próximo nasce sozinho | ✅ confirmada | manter/usar mais |
| Biblioteca de copys e criativos | ✅ confirmada | manter/usar mais |
| Modelos de página/site de captação no SaaS | ✅ confirmada | usar mais (subutilizada) |
| Tracking do anúncio até a venda | ✅ confirmada | manter/usar mais |
| IA que agenda/configura/monta | ❌ falsa | **remover em 5 arquivos** |
| 127 lojistas · avaliação 4.9 (+ JSON-LD) | ❌ fake | **remover, inclusive `aggregateRating`** |
| "Funil reativa quem sumiu, no automático" (compare) | ❓ não confirmada | substituir por alegação confirmada |
| "% de conversão" por copy na biblioteca (features) | ❓ métrica inventada | trocar por rótulos neutros |
| Teste 7 dias grátis / sem cartão / garantia 30 dias | ⏳ pendente Igor | mantidas (já estavam no ar); **Igor confirma depois** |

## Arquitetura da mensagem

- **Headline** = resultado na língua do lojista. **Sub** = o que o produto É, numa frase, sem jargão.
- **Faixa 3 passos** (novo, único elemento estrutural): divulgue o link → monte a oferta → poste em todos.
- Cada seção seguinte prova um elo da esteira. "O fluxo" permanece como motivo verbal (CTA final, footer).
- Fatos de produto no lugar de prova social fake: `conecta em 2 min · sem cartão · cancele quando quiser`.

## Mudanças por arquivo

### `apps/web/src/app/page.tsx`
- **H1:** "Um link lota o grupo. / Um clique posta em todos." → **"Grupos de WhatsApp cheios. / Sua oferta em todos. Num clique."**
- **Sub:** → "O HubFlow te dá a página pronta que enche seu grupo sozinho, a oferta montada com copys e
  criativos da biblioteca — e publica em todos os grupos de uma vez, mostrando de onde veio cada venda."
- **Linha de prova:** remove "127 lojistas · avaliação 4.9"; vira "conecta em 2 min · sem cartão · cancele quando quiser".
- **Faixa 3 passos** (nova seção server-only entre hero e ticker, Tailwind existente, sem JS):
  1. Divulgue seu link — a página de captação lota o grupo; lotou, o próximo nasce sozinho.
  2. Monte a oferta — copys, criativos e modelos prontos; agende uma vez.
  3. Poste em todos num clique — e veja no painel qual grupo virou venda.
- **Ticker:** sai "a IA configura por você" e "copys e criativos que convertem"; entram itens confirmados
  (biblioteca, modelos de página, tracking à venda, "agendou → postou").
- **OG_TITLE/OG_DESC/metadata.description:** mesma mensagem nova, sem IA.
- **JSON_LD_SOFTWARE:** remover `aggregateRating` inteiro.

### `apps/web/src/components/landing/v2/mechanism.tsx`
- Ato 01: "Sem configuração técnica — a IA preenche o resto." → "…gera um link rastreado exclusivo e uma
  página de captação com a sua marca. Sem programador, sem configuração técnica." (IA sai; entra LP confirmada)
- Atos 02 e 03: mantidos (tracking e auto-criação confirmados).

### `apps/web/src/components/landing/v2/compare.tsx`
- Par 4 (não confirmado) substituído por par confirmado:
  - SEM: "Cliente sumiu e ninguém chama de volta" → "Página de captação? Só pagando programador e hospedagem"
  - COM: "Funil reativa quem sumiu, no automático" → "Modelos prontos: sua página de captação no ar em minutos"
- Calculadora mantida (premissa declarada, honesta).

### `apps/web/src/components/landing/v2/features.tsx`
- Card 3 (biblioteca): "testados em quem vende todo dia" e "% de conversão" inventados → linha neutra
  ("prontos pra vender no grupo") e rótulos de categoria ("urgência · oferta", "recompra · pós-venda").
- **Card 6 (IA) substituído** por card de leads rastreados (feature confirmada): título "Cada lead com
  nome e origem", mock com 3 leads (nome · origem · status/compra). Import `Sparkles` → `Users`.

### `apps/web/src/components/landing/v2/faq.tsx`
- Item 2: "a IA sugere as configurações" sai → modelos prontos (página/mensagem/criativo).
- **Novo item:** "Preciso de site ou programador pra captar leads?" → modelos prontos, publica no domínio
  HubFlow, link já sai rastreado. (Também alimenta o JSON-LD FAQPage.)
- Demais itens mantidos (item "É seguro pro meu número?" já respeita a regra sem-medo-de-ban).

### Sem mudança
`pricing.tsx` (sem alegações falsas) · `lp-showcase.tsx` (tudo confirmado) · `nav.tsx` · `group-wall.tsx` · `footer`.

## Recomendações fora de escopo (decisão do Igor)

1. **Planos não mencionam páginas de captação nem tracking** — os dois diferenciais confirmados não
   aparecem em nenhum plano do pricing. Decidir em quais planos entram e atualizar a matriz.
2. Confirmar: `teste 7 dias grátis`, `sem cartão`, `garantia de 30 dias` (mantidos por já estarem no ar).
3. Substituir prova social fake por prova real quando existir (depoimento com nome, número real de lojistas).

## Validação

`npm run web:lint` + `npm run web:build` limpos. Conferência visual manual (dev server) fica a critério do Igor —
mudanças são de texto/markup estático, sem novo JS de cliente.

## Plano de implementação

Ordem: page.tsx → mechanism → compare → features → faq → lint/build → commit atômico.
(writing-plans formal dispensado por autorização explícita do usuário em 2026-07-04 — "continue até terminar tudo".)
