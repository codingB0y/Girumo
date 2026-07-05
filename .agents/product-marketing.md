# Product Marketing Context — HubFlow

*Last updated: 2026-07-05 · V1 auto-draft (revisar lacunas marcadas com ❓)*

## Product Overview
**One-liner:** O WhatsApp da sua loja de atacado no automático — feito por atacadista, pra atacadista.
**What it does:** SaaS que enche e gerencia grupos de WhatsApp para atacadistas de roupa. Da página de captação
que lota o grupo → à publicação de ofertas em todos os grupos de uma vez → ao rastreio de qual grupo/anúncio virou venda.
É a produtização do método que os fundadores usaram na própria distribuidora (Mega Stock).
**Product category:** automação/gestão de grupos de WhatsApp (a prateleira) — **nichada em atacado de roupa** (o diferencial).
**Product type:** SaaS multi-tenant (Next.js + Supabase + Stripe).
**Business model:** assinatura mensal. Planos atuais na landing: Essencial R$197 · Growth R$297 · Performance Max R$497.
❓ Confirmar se esses são os preços/planos vigentes e se há trial/garantia (landing cita "7 dias grátis", "garantia 30 dias" — pendente confirmar).

## Target Audience
**Target companies:** atacadistas, distribuidoras e fabricantes de roupa que vendem por grupos de WhatsApp — polos
Feira da 44 (Goiânia), Brás (SP), Moda Center Santa Cruz do Capibaribe (PE) e afins. Do lojista solo ao galpão com equipe.
**Decision-maker:** o **dono da loja/atacado** (geralmente decide e usa — compra de 1 pessoa, não comitê).
**Primary use case:** vender mais todo dia enchendo e operando dezenas/centenas de grupos de WhatsApp sem fazer na mão.
**Jobs to be done:**
- Encher o grupo de revendedores no automático (captação → entrada) sem link morto quando lota.
- Postar a novidade/oferta em TODOS os grupos de uma vez, no horário certo.
- Saber de qual grupo/anúncio veio cada venda e cada revendedor.
- Rodar evento/bazar pontual que vende muito em poucos dias.
**Papéis (não confundir na copy):** o **usuário** = lojista/atacadista ("você"). Quem entra no grupo = **cliente / revendedor(a) / sacoleira** (o cliente do lojista).

## Personas
B2C/SMB — comprador único. Persona formal de B2B não se aplica. Perfil dominante: dono(a) de atacado de roupa, pé-no-chão,
já vende por WhatsApp na mão ou com ADM/estagiário, cético a "guru" e a promessa mirabolante.

## Problems & Pain Points
**Core problem:** postar a mesma oferta grupo por grupo, na mão, todo dia — e mesmo assim perder venda.
**Why alternatives fall short:**
- Ferramentas genéricas (DevZapp/Joinzapp/SendFlow/Meu Grupo VIP) são feitas pra **infoprodutor/lançamento**, não pro atacado.
- Fazer na mão (ou com ADM/estagiário) não escala e esquece/atrasa post.
- Grupo lota → link morre → lead vai pro concorrente.
**What it costs them:** horas por dia; vendas perdidas por grupo cheio; não saber onde investir (sem origem da venda).
**Emotional tension:** cansaço do repetitivo, medo de esquecer/perder venda, sensação de "escravo do WhatsApp".

## Competitive Landscape
**Direct:** DevZapp, Joinzapp, SendFlow, Meu Grupo VIP — todos posicionados pra lançamento/infoproduto; falham no fit e na
linguagem do atacado (falam "perpétuo/faturamento/afiliado/Hotmart", não "grade/novidade/revenda"). Feature-parity — o que
falta neles é o nicho.
**Secondary:** postar na mão / ADM humano — falha em escala e consistência.
**Indirect:** só Instagram/loja física sem operação de grupo — falha em recorrência e no relacionamento direto com o revendedor.
> ⚠️ NÃO copiar deles: ângulo "medo de ban/anti-hack" (proibido pela regra FRONTEND-UI) nem superlativo vazio ("#1", "líder").

## Differentiation
**Key differentiators:**
- **Founder-market fit (moat):** nasceu de um atacado real (Mega Stock: R$5k→R$350k/mês com método de grupos VIP).
- **Nichado no atacado de roupa** — os genéricos não podem cravar o nicho sem perder o resto do mercado; nós podemos.
- **Método + ferramenta** (VISÃO / roadmap): o playbook validado será entregue dentro do produto (onboarding/templates/scripts). ⚠️ **AINDA NÃO EXISTE no SaaS** (será construído). Na landing atual, usar o método como **origem/prova** (o que gerou o case), NÃO como feature entregue. Não vender "compre e receba o método" até existir.
- **Esteira completa rastreada até a venda** (captação → grupo → oferta → origem da venda).
**Por que melhor:** fala a língua do lojista, resolve a rotina de atacado (não o evento de lançamento) e prova com caso real.
> ⚠️ NÃO usar como diferencial isolado: auto-criação de grupo, reposição, deep link — Meu Grupo VIP tem igual. O diferencial é o pacote (nicho + método + esteira + história).

## Objections
| Objeção | Resposta |
|---|---|
| "É seguro pro meu número?" | Envio em ritmo humano, espaçado; operação saudável. (Sem discurso de medo.) |
| "É difícil de usar?" | Se usa WhatsApp, usa o HubFlow; modelos prontos, quase não configura. |
| "Perco meus contatos se cancelar?" | Número, grupos e contatos são seus. Sem fidelidade. |
| "Mais um custo/mensalidade" | Enquadrar com o case: o método paga a ferramenta (vender mais todo dia). |
| "É pra infoprodutor, não pra mim" | Ao contrário — foi feito por atacadista de roupa, pra atacado. |
**Anti-persona:** infoprodutor/lançador digital, afiliado, agência de tráfego — público dos concorrentes, NÃO o nosso.

## Switching Dynamics
**Push:** cansaço de postar na mão em dezenas de grupos; perder venda por grupo cheio/atraso.
**Pull:** método validado + ferramenta que executa; feito pra atacado; case real de quem viveu isso.
**Habit:** ADM/estagiário postando manualmente; "sempre fiz assim".
**Anxiety:** medo de banimento, curva de aprendizado, perder contatos, "é mais uma mensalidade que não vou usar".

## Customer Language
**Como descrevem o problema (verbatim VOC):**
- "sem precisar ficar entrando contato por contato"
- "para não se perder nas atividades diárias"
**Como descrevem o desejo:**
- "vender mais", "vender todos os dias", "lotar os grupos", "lucrar mais com a revenda"
**Voz do próprio atacadista com o revendedor (amostra real, IG da Mega Stock):** "peças premium **pra revenda**", "**Lucre 3x mais**", "Sua loja como destaque", "**Faça seu pedido**", "arrase nas vendas". Tom direto, benefício na cara — instrutivo pro registro (mas lembrar: HubFlow→atacadista é relação de ferramenta, não de venda de peça).
**Words to use:** atacado, loja, cliente, revendedor(a), revenda, novidade, grade, peça, pedido, fornecedor, catálogo, grupo cheio/lotado, vender todo dia, evento/bazar.
**Words to avoid:** lançamento, perpétuo, escalar/7-8-9 dígitos, lead, gestor de tráfego, afiliado, IA (não existe user-facing), "medo de ban", superlativo ("#1", "líder"), "método secreto"/tom de guru.
**Glossary:**
| Termo | Significado |
|---|---|
| revendedor(a)/sacoleira | cliente do atacadista que revende as peças |
| grade | conjunto de peças (tamanhos/variações) vendido junto |
| evento/bazar | venda pontual intensiva (ex.: 2 dias, +20k peças) |

## Brand Voice
**Tom:** pé-no-chão, direto, de atacadista pra atacadista. Trincheira, não guru.
**Estilo:** conversa de dono de loja; zero jargão de marketing digital.
**Personalidade:** prático · honesto · vivido (viemos do balcão) · sem hype · confiável.

## Proof Points
**Métricas (case fundador — Mega Stock / Mega Infantil Atacado):**
- R$5k → R$350k/mês
- 12 mil+ pessoas em 50+ grupos de WhatsApp (revendedores/lojistas/sacoleiras)
- +20 mil peças vendidas em evento de 2 dias
- Galpão de 800m² (Perimetral, Goiânia · polo da 44) · equipe de vendas · **Instagram 105,2K seguidores** (@megainfantilatacado)
- ReclameAqui: **sem reclamações relevantes** ("sem reputação definida", ~0 no período) — reputação limpa, seguro featurar publicamente.
**Evidência disponível:** vídeo do evento (filas/galpão cheio), fotos galpão/fachada/equipe, prints de grupos.
> ⚠️ PRIVACIDADE: prints de folha de pagamento/pró-labore NÃO vão pra copy pública (LGPD — dado pessoal). Usar só o fato agregado ("folha de +R$21k/mês, galpão 800m²") como porte, sem o documento.
**Value themes:**
| Tema | Prova |
|---|---|
| "Vende mais todo dia" | case 5k→350k; evento 20k peças/2 dias |
| "Aguenta a operação de verdade" | 12k pessoas em 50+ grupos geridos |
| "Feito por quem viveu" | galpão, equipe, IG, história do fundador |
**Depoimentos de clientes do HubFlow:** NÃO há ainda — única prova é o case Mega Stock (fundador). Implicação: a landing se apoia 100% na história fundadora; toda a força de prova precisa vir dela bem contada. Colher depoimento de cliente assim que houver (é a lacuna nº1 de credibilidade de terceiros).

## Goals
❓ **Business goal primário:** (ex.: X assinantes / MRR até quando?) — confirmar com Igor.
**Conversion action:** criar conta / começar campanha grátis (CTA atual da landing) — ❓ confirmar se é signup direto, trial ou WhatsApp comercial.
❓ **Métricas atuais do HubFlow** (assinantes, MRR, conversão da landing) — preencher.
