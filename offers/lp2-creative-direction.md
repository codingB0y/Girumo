# /lp2 — Direção Criativa (Etapas 1-7, pré-implementação)

*2026-07-06 · Diretor criativo: brief de 8 etapas do Igor · Referência visual: designrocket.io (scrape + screenshot em `.firecrawl/designrocket-*`) · Insumos: `.agents/product-marketing.md`, `offers/landing-copy-v2.md`, `offers/hubflow-offer-critique.md`, `competitor-profiles/`, `customer-research/voc-atacadista.md`*

---

## ETAPA 1 — Diagnóstico

1. **Público principal:** dono(a) de atacado/distribuidora de roupa (44 Goiânia, Brás SP, Moda Center-PE) que já vende por grupos de WhatsApp. Decide sozinho, usa o próprio produto. Pé-no-chão, cético a guru.
2. **Situação de procura** *(hipótese nos gatilhos exatos)*: a operação passou do que dá pra fazer na mão — dezenas de grupos, ADM não dá conta, post atrasa, grupo lota e o link morre. Chega via anúncio frio (Meta/Google).
3. **Problema mais caro:** venda perdida — clique que bate em grupo lotado vai embora; grade postada tarde encalha. Secundário: horas diárias de copiar/colar.
4. **Alternativa atual:** fazer na mão / ADM ou estagiário / ferramenta de infoprodutor adaptada (DevZapp, Joinzapp, SendFlow, Meu Grupo VIP) / planilha + rezar.
5. **Resultado desejado (VOC, verbatim):** "vender mais", "vender todos os dias", "lotar os grupos", estoque girando, saber de onde veio o pedido.
6. **Objeções:** "é seguro pro meu número?" · "é difícil?" · "mais uma mensalidade" · "isso é coisa de infoprodutor" · "perco meus contatos se cancelar?" · "papo de guru".
7. **Diferencial verificável:** único nichado em atacado de moda; origem fundadora Mega Stock (R$5k→R$350k/mês, 12 mil revendedores em 50+ grupos, 20 mil peças em evento de 2 dias) com **prova real**: vídeo do bazar (Vimeo 1207228037), IG @megainfantilatacado 105k, ReclameAqui limpo; esteira completa com origem da venda rastreada.
8. **Ação principal:** criar conta (`/signup`). Secundária: WhatsApp comercial.

**Não afirmar (regras de honestidade):** IA user-facing (não existe) · método como entregável (é roadmap; na página = história/prova) · depoimentos de clientes HubFlow (não existem ainda) · avaliações/ratings (os antigos eram fake).

## ETAPA 2 — Clichês da categoria (observados nos 4 concorrentes)

| Clichê | Onde vimos | Veredito |
|---|---|---|
| Banner de evento/countdown fake | SendFlow (Hotmart FIRE), designrocket ("1h07m") | **BANIR** — urgência falsa queima o cético |
| Selo de garantia dourado estilo Hotmart | SendFlow, MeuGrupoVIP | **BANIR** — garantia vira tipografia, não selo |
| Superlativo sem prova ("LÍDER", "#1 do Brasil") | Joinzapp, MeuGrupoVIP | **BANIR** |
| Jargão de escala/lançamento ("10X", "7-8-9 dígitos") | Todos | **BANIR** |
| Emojis e CAPS de urgência | MeuGrupoVIP, Joinzapp | **BANIR** (brief: zero emoji) |
| Grid de depoimentos YouTube | SendFlow, MeuGrupoVIP | Substituir por **1 vídeo real integrado à narrativa** (bazar) |
| Mockup de celular com bolhas genéricas | Todos | Usável **se for a UI real** do produto, não bolha decorativa |
| Quadro "sem × com" | MeuGrupoVIP (bom) | **Manter funcional** — formato forte, reescrito no vocabulário do atacado |
| Preço com âncora riscada 6x | SendFlow, Joinzapp | Manter só a **âncora honesta** (anual 2 meses grátis), sem teatro |
| Dark + neon + partículas | categoria inteira + nossa `/` atual | Evitar a versão tosca; a direção usa dark **violáceo sofisticado** sem neon nem partícula |

## ETAPA 3 — Três direções criativas

### A) "A Janela da Loja" — operacional, orientada ao produto
- **Ideia central:** a página é uma vitrine noturna premium: cada seção abre uma *janela* real do produto (página de captação, disparo, origem do pedido) sobre fundo violeta-noite. O produto É o argumento.
- **Percepção:** "isso é ferramenta séria, de gente que opera — não curso".
- **Narrativa:** reconhecimento do nicho → a rotina que dói → a esteira funcionando janela a janela → a prova Mega Stock (vídeo) → objeções → preço ancorado → ação.
- **Composição:** hero centrado com display gigante (ref. designrocket) e UMA janela de produto dominante; depois alternância assimétrica janela-esquerda/texto-direita; densidade baixa, respiro grande.
- **Tipografia:** Archivo variable — display em Expanded Black (voz de manchete de comércio), corpo 400/500; Martian Mono em etiquetas/dados. Contraste de escala extremo (assinatura do reference). *(Revisado por ordem do Igor: zero herança tipográfica do Hub.)*
- **Cores (REVISADO — decisão de conversão, sem herança de marca):** carvão `#0C0D0B` base · branco-osso `#F2F1EA` display · corpo `#A8ABA0` · **verde-venda `#2FD46B` como ÚNICA cor de ação** (CTA = pedido = WhatsApp = dinheiro; hover `#4AE583`; verde profundo `#0F3D26` em tags) · linhas `rgba(242,241,234,.08)` · glow verde contido + grain fino. Racional: verde é o WhatsApp e o dinheiro do comerciante; categoria inteira é roxo/neon → verde quebra o pattern de guru; todo botão verde da página é literalmente "o botão de vender".
- **Tratamento das imagens do produto:** UI real em molduras 24px com glow iris sutil, browser-chrome mínimo; vídeo do bazar em janela 9:16 com etiqueta mono.
- **Elemento visual proprietário:** **a régua de pedidos** — fio horizontal onde "pedidos" pingam em verde (Marina S. · R$186 · origem: anúncio), aparece no hero e retorna na prova e no fechamento. É literalmente o que o produto entrega: pedido com origem.
- **Movimento:** janelas assentam (scale/settle), régua de pedidos pulsa pedidos em sequência, counters, reveals; sem partículas, sem parallax gratuito.
- **Riscos:** dark é o campo da categoria — exige sofisticação na execução pra não pattern-matchar com concorrente.
- **Adequação:** alta — cético compra vendo produto + prova. **Implementação:** média.

### B) "Do Balcão ao Painel" — editorial, narrativa de turno
- **Ideia central:** a página é um turno de trabalho do atacadista, com timestamps mono (05h58 a grade chega → 06h12 link no ar → 07h04 grupo lotado → 08h30 pedidos pingando → 18h00 origem no painel). Cada hora = uma seção.
- **Percepção:** "eles vivem a minha rotina".
- **Narrativa:** cronologia do dia; o vídeo do bazar é o clímax ("o dia em que o turno virou evento: 20 mil peças").
- **Composição:** blocos horizontais fortes, timestamps gigantes em mono como âncoras, alternância claro/escuro por período do dia.
- **Tipografia:** Plex Mono gigante para horas (proprietário) + Bricolage para títulos.
- **Cores:** madrugada→dia→noite em violetas e lavandas; verde nos momentos de venda.
- **Elemento proprietário:** o relógio de turno (timestamps navegáveis).
- **Movimento:** scroll avança o "dia"; luz da página muda sutilmente por seção.
- **Riscos:** leitura mais longa; tráfego frio de anúncio pode não ter paciência; CTA demora a aparecer com força.
- **Adequação:** média-alta (emocional forte, conversão mais lenta). **Implementação:** média-alta.

### C) "A Máquina Violeta" — conceitual, expressiva
- **Ideia central:** uma única linha SVG contínua atravessa a página inteira — é a esteira: nasce no link, entra na página de captação, enche o grupo, dispara o post, e no fim **fica verde** quando vira pedido. As seções nascem da linha.
- **Percepção:** "existe engenharia de verdade por trás disso".
- **Composição:** a linha dita o layout; seções em ziguezague seguindo o traço; display gigante nos nós.
- **Tipografia/cores:** as mesmas da A (sistema único da marca).
- **Elemento proprietário:** a linha-esteira desenhada por scroll (stroke-dashoffset scrub GSAP).
- **Movimento:** o mais rico das três — a linha é o motion.
- **Riscos:** abstração pode esfriar o lojista pé-no-chão; execução de motion precisa ser impecável senão vira gimmick; mais difícil no mobile.
- **Adequação:** média. **Implementação:** alta.

### Comparação e recomendação
| | A Janela | B Turno | C Máquina |
|---|---|---|---|
| Conversão em tráfego frio | **alta** | média | média |
| Distintividade | alta | **muito alta** | muito alta |
| Fit com público cético | **alta** | alta | média |
| Fit com reference do Igor | **direta** | parcial | parcial |
| Risco de execução | baixo-médio | médio | **alto** |

**RECOMENDAÇÃO: A — "A Janela da Loja"**, absorvendo dois empréstimos: os **timestamps mono** da B (etiquetas das provas: "06h12 · link no ar") e **um trecho da linha** da C (só na seção do mecanismo, ligando os 3 passos). A dá o produto como argumento (o que o cético precisa), casa com o reference escolhido e carrega a identidade violeta sem virar clone de ninguém.

## ETAPA 4 — Arquitetura narrativa (direção A)

Ordem = raciocínio do comprador cético: *"é pra mim?" → "qual é a dor que eles entendem?" → "como funciona?" → "prova que funciona" → "aguenta minha operação?" → "quem são vocês pra dizer isso?" → "e as minhas dúvidas?" → "quanto custa e qual meu risco?" → ação.*

| # | Seção | Objetivo | Mensagem | Objeção que resolve | Prova | Formato | CTA |
|---|---|---|---|---|---|---|---|
| 1 | **Hero** | "é pra mim" em 5s | Encha seus grupos de revendedor. Venda todo dia. | "mais um SaaS genérico?" | sub com origem fundadora (1 frase) | display gigante centrado + janela de produto dominante + régua de pedidos | Criar conta + WhatsApp |
| 2 | **A rotina que dói** | reconhecimento | postar na mão custa venda | "eles me entendem?" | quadro na-mão × com-HubFlow (formato roubado funcional) | 2 colunas contrastadas | — |
| 3 | **A esteira em 3 janelas** | mecanismo claro | link lota → posta em todos → pedido com origem | "como funciona?" | UI real em 3 janelas ligadas por trecho da linha | janelas alternadas + linha | — |
| 4 | **Prova Mega Stock** | credibilidade | a gente fez isso numa loja real | "funciona? quem são vocês?" | **vídeo do bazar** + números (350k/12k/50+/20k) + timestamps mono | janela 9:16 + counters | CTA suave |
| 5 | **Profundidade do produto** | robustez | auto-criação, biblioteca, agenda, origem | "aguenta minha operação?" | 4 janelas menores (features reais) | grid 2×2 | — |
| 6 | **O método como herança** | diferencial | os 4 movimentos que a Mega Stock repetia | "por que vocês e não o genérico?" | história, não entregável | lista editorial numerada | — |
| 7 | **Objeções diretas** | destravar | número seguro, fácil, contatos seus | objeções 1-6 do diagnóstico | respostas secas | FAQ mínimo (5) | — |
| 8 | **Preço + garantia** | decisão | menos que uma grade/mês; 30d incondicional | "mensalidade / risco" | âncora no case; garantia tipográfica | 3 cards, Growth herói | Começar |
| 9 | **Fechamento** | ação | seu próximo grupo cheio começa com um link | — | régua de pedidos retorna | display + 2 CTAs | Criar conta |

## ETAPA 5 — Wireframe textual

**Desktop (container 1200, grid 12):**
```
[nav pill flutuante: logo · Método · Prova · Planos · Dúvidas · Entrar · (Começar)]
1  HERO      centrado: eyebrow mono → H1 2 linhas (92px) → sub (18px, 560px)
             → CTAs pill → [JANELA PRODUTO 960×~540: painel de disparo real]
             → régua de pedidos atravessando a base da janela
2  ROTINA    2 col (5/7): "na mão" lista seca | "com HubFlow" lista verde-pontuada
3  ESTEIRA   3 janelas em ziguezague (7/5 → 5/7 → 7/5), linha SVG ligando;
             etiquetas mono "01 · o link" etc.
4  PROVA     2 col: vídeo 9:16 (4 col) | história + 4 counters (8 col);
             timestamps mono nas bordas
5  PRODUTO   grid 2×2 de janelas menores (auto-criação, biblioteca, agenda, origem)
6  MÉTODO    lista editorial 01-04, número gigante lavanda, texto curto
7  FAQ       1 col estreita (720px), details tipográficos
8  PREÇO     3 cards (Growth elevado), linha de âncora acima; garantia "30" gigante abaixo
9  FECHO     display centrado + régua de pedidos + CTAs
[footer 1 linha: logo · links · assinatura mono]
```
**Mobile:** tudo 1 coluna; janela do hero vira 100vw com leve rotação zero; régua de pedidos vira stack vertical de 2 pedidos; esteira empilha com a linha vertical à esquerda; vídeo 9:16 nativo em largura total; nav = logo + Começar; CTA fixo inferior. Respiro: `py-24` mobile / `py-40` desktop entre capítulos.

## ETAPA 6 — Sistema visual (tokens) — REVISADO (2ª rodada, ordem do Igor: sem herança de marca)

- **Tipografia:** **Archivo** (variable, next/font/google com axis `wdth`) — display Expanded Black (wdth ~125, weight 800-900; H1 `clamp(3rem, 7vw, 5.75rem)`, tracking -0.02em, leading 1.0), corpo 400/500 (16-18, leading 1.6) · **Martian Mono** 400/600 (etiquetas/dados/timestamps, 10-12px, tracking 0.14em, uppercase). Duas famílias, uma assinatura: manchete de comércio + etiqueta industrial. Fallback se axis wdth falhar no build: Archivo Black estático pro display.
- **Escala:** 12 · 14 · 16 · 18 · 22 · 28 · 36 · 48 · 64 · 92.
- **Cores:** `--bg #0C0D0B` (carvão, noite de loja) · `--bg-2 #141612` (janelas/cards) · `--display #F2F1EA` (branco-osso quente) · `--body #A8ABA0` · `--green #2FD46B` (ÚNICA cor de ação: CTA, link, pedido, WhatsApp) · `--green-hover #4AE583` · `--green-deep #0F3D26` (tags/planos de fundo suaves) · `--line rgba(242,241,234,.08)`. Mesh radial verde a 5% + grain fino. **Contraste:** display/bg ≈ 17:1; body/bg ≈ 7:1; carvão sobre verde-CTA ≈ 9:1 (AA/AAA ok).
- **Grid/espaço:** container 1200 · gaps 24/32 · seções py-24/40.
- **Raios:** janelas 24 · cards 16 · pills 999. **Bordas:** 1px `--line`; janelas com hairline osso 12%.
- **Sombras:** só nas janelas: `0 40px 120px -40px rgba(47,212,107,.28)` (glow verde contido).
- **Ícones:** lucide 1.5px stroke, osso; nunca decorativos soltos.
- **Fotografia:** vídeo do bazar (real) e futuras fotos do galpão em janelas com etiqueta mono; nada de stock, nada de imagem gerada posando de real.
- **Telas do produto:** mocks fiéis à UI (dados plausíveis, nomes fictícios), chrome mínimo, sempre dentro de janela.
- **Motion (GSAP):** janelas assentam `scale .96→1 + y 24→0, power4.out`; linha da esteira `stroke-dashoffset` com scrub; counters; régua de pedidos com stagger (~2.5s, pausável; `prefers-reduced-motion` desliga tudo); hover: elevação 2px + glow +10%. Nada de bounce, nada de partícula.
- **Estados:** foco visível `outline 2px --green offset 3px`; botões hover/active com transform físico; links underline on-hover.
- **Ligação com posicionamento:** verde = WhatsApp + dinheiro — clicar e vender têm a mesma cor (a página inteira ensina isso); carvão = a loja depois do expediente, quando a esteira segue vendendo; osso quente = etiqueta de papel do comércio, não branco frio de tech. Categoria inteira é roxo/neon de curso → o verde separa o HubFlow de guru no primeiro segundo.

## ETAPA 7 — Copy (mapeada, já validada nesta sessão)

Fonte: `offers/landing-copy-v2.md` + VOC. Palavras banidas do brief do Igor **+** nossas (IA, lançamento, perpétuo, lead, escale, guru, superlativos) — checadas.

- **Hero:** eyebrow `grupos de whatsapp pra atacado de roupa` · H1 **"Encha seus grupos de revendedor. Venda todo dia."** · sub: "O HubFlow lota seus grupos com revendedores, publica sua oferta em todos de uma vez e mostra de qual grupo veio cada venda. Feito por quem levou um atacado de roupa de R$ 5 mil a R$ 350 mil por mês fazendo exatamente isso." · CTAs: `Criar minha campanha` / `Falar no WhatsApp` · linha mono: `feito por atacadista, pra atacadista · 30 dias de garantia`.
- **Rotina:** título "Postar na mão custa caro. Você só não vê a fatura." Pares na-mão×com (grade grupo a grupo 2h/dia × 1 clique no horário certo; grupo lotou link morto × o próximo nasce sozinho; venda sem origem × cada pedido com origem; página só com programador × modelo no ar em minutos).
- **Esteira:** "Do link ao pedido, sem tocar em nada." 01 o link lota o grupo · 02 a grade sai em todos · 03 o pedido volta com origem.
- **Prova:** "A gente levou a Mega Stock de R$ 5 mil a R$ 350 mil por mês." + história curta + counters + legenda do vídeo `bazar mega stock · evento avisado nos grupos`.
- **Produto:** "Feito pra operação de verdade." (auto-criação · biblioteca de copys/criativos · agenda semanal · origem de cada pedido).
- **Método:** "O jeito Mega Stock de vender, do link ao evento." 4 movimentos (captação constante / grupo aquecido / oferta todo dia / evento de 2 dias) — como história.
- **FAQ:** os 5 já escritos (número, facilidade, grupos, garantia, contatos).
- **Preço:** "Menos que uma grade por mês." + âncora no case + Essencial 197 / Growth 297 (herói) / Operação 497 + garantia 30 incondicional tipográfica.
- **Fecho:** "Seu próximo grupo cheio começa com um link."

---

## ETAPA 8 — (aguardando aprovação)

Plano técnico será apresentado após o OK: rota `/lp2` (matcher do middleware já cobre o prefixo `lp`), componentes (`components/lp2/`), tokens em CSS scoped, GSAP já instalado, vídeo Vimeo com `loading=lazy` + facade de poster pra performance, LCP = H1 (texto), zero imagem externa (CSP), a11y AA, `noindex` enquanto experimento.
