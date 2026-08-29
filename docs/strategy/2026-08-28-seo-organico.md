# Tráfego orgânico do Girumo — SEO + GEO

**Data:** 28/08/2026 · **Status:** Fases 0 e 1 concluídas — **aguardando aprovação para a Fase 2**
**Domínio:** `https://www.girumo.com.br` · **Autor:** Igor (fundador)

---

## 1. Objetivo e critério de sucesso

Construir tráfego orgânico como **ativo de 6-12 meses**, não como canal de caixa imediato.

**Medido por:**
- Cliques em `wa.me` vindos de orgânico
- Signups e trials com origem orgânica
- Citações em respostas de IA (ChatGPT, Claude, Perplexity, Gemini)

**NUNCA medido por sessões ou pageviews.** Página que traz visita e não traz clique em `wa.me` é custo, não ativo.

**Marcos:**

| Prazo | Critério |
|---|---|
| 90 dias | Páginas indexadas + primeiras impressões em long-tail no GSC |
| 180 dias | Primeiros cliques BOFU convertendo em conversa no WhatsApp |

---

## 2. Restrições que moldam o plano

Levantadas em entrevista com o fundador antes de qualquer execução.

| Variável | Resposta | Consequência no plano |
|---|---|---|
| Domínio definitivo | `girumo.com.br` — sim | SEO investe aqui. Sem risco de trabalho zerado por rebrand |
| Medição hoje | **Nada configurado** | Instrumentar GSC + conversão vira o **item 1 da Fase 2**, antes de qualquer página |
| Horas/mês sustentáveis | **8 a 20h** | Portfólio **finito** de 10-20 páginas + cadência baixa de 2-3 peças/mês. **Sem esteira de blog semanal** |
| Objetivo dominante | Ativo composto de 12 meses | SEO é o canal certo. Caixa de curto prazo vem de outro lugar |
| Ativos de terceiros | **Nenhum** (sem Google Business, sem diretório, sem YouTube) | Fase 5 começa do zero e **compete por tempo** com o portfólio. Trade-off explícito, não item grátis |

### Guardrails

1. Zero conteúdo TOFU definicional em volume — a IA absorve sem gerar clique
2. Zero pSEO raso, zero guest post, zero artigo de IA sem dado próprio e revisão do fundador
3. O funil fecha em **WhatsApp (`wa.me`)**, não em captura de e-mail
4. Mobile-first de verdade: página leve, sem popup desktop-style
5. Toda página carrega prova em primeira mão. Sem prova possível → provavelmente não escrever

---

## 3. Ativo E-E-A-T disponível

O diferencial que nenhum concorrente consegue copiar:

- **História da Mega Stock** — o fundador levou uma operação de atacado de R$5 mil para R$350 mil/mês vendendo por grupos VIP de WhatsApp. O Girumo é a produtização dessa operação
- **Dados reais de uso da plataforma** — grupos, membros, campanhas, atribuição de venda por grupo

Isso deve aparecer como **número, print ou episódio** em cada página. É o que separa o conteúdo do Girumo do genérico de IA que domina o SERP hoje.

---

## 4. Vocabulário nativo da persona

Lojista de atacado de moda e revendedora/sacoleira brasileira. Mobile-first, boa parte **mobile-only**. Vive em WhatsApp e Instagram.

**Usar:** grupo vip · grupo de vendas · sacoleira · revendedora · pronta entrega · pedido mínimo · grade · peça · fornecedor do Brás · atacado de roupa · revenda de roupas · lotar o grupo · grupo cheio · tomar ban · cair o zap

**Nunca usar:** vocabulário traduzido de playbook americano (funil de nutrição, lead scoring, buyer persona, growth loop). A persona não busca por esses termos e eles denunciam conteúdo genérico.

---

## 5. FASE 0 — Auditoria técnica (concluída)

Auditoria de código em `apps/web` + verificação direta em produção. Todos os achados abaixo foram **confirmados individualmente**, não repassados de relatório.

### 5.1 O que já está certo (e não deve ser mexido)

Isto contraria a expectativa para uma landing com GSAP e **encolhe a Fase 2**:

| Item | Evidência |
|---|---|
| Landing ~100% server-rendered | `grep "ssr: false"` no projeto → **0 ocorrências** |
| Nenhum mount-gating | Os 6 componentes `"use client"` da `/lp3` são SSR-ados; nenhum usa `useState(false)` + `useEffect(setMounted)` |
| GSAP não esconde conteúdo | Estados iniciais vêm de `gsap.from()` em runtime, não do CSS. Sem JS, a página renderiza inteira |
| Preços no HTML nos dois ciclos | `plans.tsx:163-181` — anual no `span`, mensal no `s`. Crawler extrai sem clicar no toggle |
| Variantes com `noindex` | `/lp`, `/lp2`, `/home-v2` marcadas; `/lp3` redireciona. Sem canibalização |
| Sem bloqueio a bot de IA | `robots.ts` libera tudo; nem `next.config.ts` nem `middleware.ts` filtram user-agent |
| `lang="pt-BR"`, `metadataBase`, `og:locale` | `layout.tsx:29`, `:37`, `:58` |
| LCP mobile é texto | O hero mobile não tem imagem — é o `h1` |

**Consequência:** não é preciso reescrever a landing para publicar conteúdo. As horas vão para o portfólio BOFU.

### 5.2 Achados que só produção revelou

A auditoria de código não podia ver estes dois. Verificados via `curl`.

#### P0-a — Tab literal na env corrompe sitemap e robots

Hexdump do `<loc>` servido em produção:

```
<   l   o   c   >  \t   h   t   t   p   s   :   /   /   g   i   r   u   m   o
```

`NEXT_PUBLIC_SITE_URL` na Vercel foi colada com um caractere de **tabulação (0x09)** no início. Todo `<loc>` do sitemap e a diretiva `Sitemap:` do `robots.txt` começam com ele.

Whitespace inicial num `<loc>` é URL inválida pelo spec de sitemap — **o sitemap pode estar sendo rejeitado inteiro**. O `metadataBase` escapa, porque o construtor `URL` do WHATWG faz strip de control chars; canonical e OG estão salvos.

**Correção:** limpar a env na Vercel **e** adicionar `.trim()` em `getPublicSiteUrl()` (`apps/web/src/lib/brand.ts:41`), que hoje só remove a barra final.

#### P0-b — Apex declara-se canônico, mas produção serve www

`girumo.com.br` → **308** → `www.girumo.com.br`. O código declara `https://girumo.com.br` em `metadataBase`, `robots.host`, `Sitemap:` e nas 3 URLs do sitemap.

Resultado: **todas as URLs do sitemap são redirects**, e o `canonical` da home aponta para uma URL que não é a servida. O SERP já indexou o `www`.

**Decisão tomada:** o canônico é **`www.girumo.com.br`**. O redirect já existe nessa direção e o pouco de sinal indexado está no www — inverter custaria mais do que renderia. O código passa a declarar `www`.

### 5.3 Achados de código

| # | Sev | Achado | Evidência |
|---|---|---|---|
| C1 | CRITICAL | `/p/[slug]` é `index: true` sem canonical | `p/[slug]/page.tsx:70` |
| C2 | CRITICAL | Uma única página indexável com conteúdo comercial | inventário de 15 rotas públicas |
| H1 | HIGH | Dois `h1` com texto idêntico no HTML | `landing-mobile.tsx:27` e `landing-desktop.tsx:29` |
| H2 | HIGH | 5 rotas herdam `title` e `description` da home | `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/auth/callback` |
| H3 | HIGH | `/r/` fora do `disallow` | `robots.ts:12` = `["/painel", "/api"]` |
| M1 | MEDIUM | `/lp3` usa `redirect()` (307) onde o comentário promete permanente (308) | `lp3/page.tsx:6` |
| M2 | MEDIUM | 5 famílias de fonte na home; 3 sem uso no escopo da landing | `layout.tsx:8-26` + `landing.tsx:29-41` |
| M3 | MEDIUM | Sitemap traz `/login` e omite `/termos` e `/privacidade` | `sitemap.ts:7-11` |
| M4 | MEDIUM | Falta `Organization`; `AggregateOffer` sem `offerCount` | `page.tsx:11-35` |
| L3 | LOW | `BRAND.description` não contém "atacado", "revendedora" nem "lojista" | `brand.ts:6-7` |

**C1 em detalhe.** As LPs dos lojistas são geradas por template, com conteúdo curto, estrutura idêntica e qualidade não moderada. Indexá-las em escala produz o padrão que o Google classifica como *thin content / doorway pages*, no domínio da marca. `follow: false` não protege — controla links de saída, não a indexação da própria página.

**Decisão tomada:** `/p/` sai do índice (`index: false` + `Disallow: /p/`). As LPs continuam funcionando: elas são abertas por link do WhatsApp, não por busca.

**H1 em detalhe.** As duas árvores (mobile e desktop) existem no HTML e o CSS escolhe uma. O crawler lê sem aplicar breakpoint, então vê dois heros, duas tabelas de preço e dois `h1` com o mesmo texto — *"Grupo cheio, venda todo dia."* Estimativa por volume de código: **~35% do HTML textual da home é cópia da mesma mensagem**. Para LLM isso lê como boilerplate.

### 5.4 Achado de estratégia

**O `h1` da home não contém um único termo que a persona busca.** Nem "WhatsApp", nem "atacado", nem "grupo VIP". É boa copy e sinal de busca mudo.

### 5.5 Baseline numérico

| Métrica | Valor |
|---|---|
| Rotas públicas distintas | 15 |
| Indexáveis com conteúdo comercial | **1** |
| URLs no sitemap | 3 — todas redirect, todas com tab |
| Rotas com `title` duplicado da home | 5 |
| Rotas com JSON-LD | 2 — só 1 indexável |
| Schema presente | `FAQPage`, `SoftwareApplication`. Faltam `Organization`, `WebSite` |
| Conteúdo da landing no HTML inicial | ~100% |
| Conteúdo da landing duplicado | ~35% |
| Ocorrências de `ssr: false` | 0 |

---

## 6. FASE 1 — Estratégia e mapa de páginas

> Seções 6.2 a 6.4 em elaboração — pendentes da pesquisa competitiva em curso.

### 6.1 Panorama do SERP em pt-BR

Coleta direta, 7 buscas nos termos da persona.

**Espaço vazio confirmado: ninguém cruza "grupo VIP" com "atacado de moda".**

Quem ocupa o SERP hoje, em três blocos que não falam com a persona:

| Bloco | Players | Por que não é concorrente de produto |
|---|---|---|
| Ferramentas genéricas de WhatsApp | Zoppy, ChatGuru, Whaticket, AiSensy | Falam de atendimento 1:1 e chatbot, não de grupo |
| Plataformas de e-commerce fazendo TOFU | Nuvemshop, Mercos, Agendor, Umbler, Loggi | Conteúdo definicional de topo; autoridade alta demais para enfrentar de frente |
| Blogs de atacadista e conteúdo p/ sacoleira | Lambari, Marijasmin, Guia das Roupas, Sacoleira de Sucesso | Falam com a persona **antes** dela precisar do Girumo |

#### Concorrentes de mecânica — brasileiros, e mais perto do que parecia

A leitura inicial ("o Periskope é o concorrente direto") estava incompleta. Existem **três brasileiros que fazem a mesma mecânica** do Girumo — link único que enche grupo + postar em todos de uma vez. Posicionamento verificado direto no `<title>`/meta de cada site:

| Player | Posicionamento | Preço | Ameaça |
|---|---|---|---|
| **Meu Grupo VIP** | "Automação de Grupos WhatsApp **#1 do Brasil**" | R$197+ (*não verificado na fonte*) | **Alta** |
| **DevZapp / DevGrupos** | "Gestão de grupos mais versátil para lançamentos, perpétuos e estratégias avançadas de venda" | R$197 / 447 / 697 | Média-alta |
| **Grupos Inteligentes** | "Distribua cada clique entre grupos **com vaga**, detecte **lotações em tempo real**, capture excedentes em lista de espera e acompanhe o ROI" | *não verificado* | Média |
| **Periskope** (gringo) | "Manage WhatsApp Groups, Chats and Numbers at scale" — ops/suporte enterprise | US$20-30/usuário/mês | Alta em SEO, baixa em produto |

**Dois fatos que mudam a urgência:**

1. **O Grupos Inteligentes já vende a dor "grupo lotou"** — detecção de lotação em tempo real é a meta description da home deles. Aquela página BOFU não é território virgem.
2. **O Meu Grupo VIP já provou que verticaliza por subdomínio.** Existe `supermercado.meugrupovip.com.br`, com copy de nicho pronta: *"+22 milhões de leads gerenciados, +150 redes atendidas, aumente vendas em até 12%"*. O movimento `atacado.meugrupovip.com.br` é óbvio — e se acontecer, eles chegam com autoridade de domínio já construída.

**O que sobrevive da tese do nicho vazio:** nenhum dos quatro escreve para a persona de atacado de moda. Todos falam com **infoprodutor e lançador digital**. O vocabulário deles é "lançamento", "perpétuo", "lead", "ROI" — não "grade", "sacoleira", "pedido mínimo". O vazio é de **conteúdo e linguagem**, não de produto. Isso é argumento para começar agora, não para relaxar.

#### Periskope em detalhe

Atende o Brasil **por tradução automática**, não de verdade: preços mantidos em dólar dentro do texto em português, construções travadas, nenhum exemplo brasileiro nomeado, zero ocorrências de "atacado", "sacoleira" ou "pronta entrega". ~110 posts, dos quais 6 confirmados em pt-BR.

Onde ele é fraco para esta persona (verificado lendo o guia principal dele):
- **Não cobre encher grupo** — fala de adicionar membro via API, não de roteamento para o próximo grupo
- **Não cobre atribuição de venda** — a analítica dele é volume de mensagem e tempo de resposta
- **Não cobre risco de ban** — vende "agende e envie para milhares de grupos" sem uma única ressalva sobre saúde da conta

#### O ângulo mais defensável

O cluster "como não ser banido no WhatsApp" é dominado por SendFlow, 3C Plus, DT Network e digiliza — **todas ferramentas de disparo em massa/DM**, dando conselho de como não tomar o ban que a própria ferramenta causa. E o Periskope, que é de grupo, omite o assunto.

O Girumo nunca manda DM: só posta em grupo. Não é opinião, é arquitetura de produto. É o ângulo BOFU mais defensável do portfólio.

**Ângulo mais forte identificado:** o cluster "como não ser banido no WhatsApp" é dominado por SendFlow, 3C Plus, DT Network e digiliza — **todas ferramentas de disparo em massa/DM**, dando conselho de como não tomar o ban que a própria ferramenta causa. O Girumo nunca manda DM: só posta em grupo. É o ângulo BOFU mais defensável do portfólio.

### 6.2 Prova em primeira mão disponível

Fonte: `docs/brand/girumo/copy-library.md:34-41` e `Girumo-Brand-Guide.html:309`, que a marca declara ser **"a única prova factual aprovada"**.

**Da operação fundadora Mega Stock** — sempre nomeada como *operação fundadora*, **nunca** como "cliente" ou "depoimento":
- R$ 5 mil → R$ 350 mil/mês
- 12 mil+ pessoas reunidas em 50+ grupos
- +20 mil peças vendidas num evento de 2 dias
- Região da 44, Goiânia

**Da plataforma** (prova que nenhum concorrente tem):
- 194 grupos conectados, 91 com convite coletado automaticamente
- Automação `group_full` ("Grupo Lotou") com run real
- Filtro anti-ban em produção
- **Evento de saída de grupo gravado como dado do lead** — destrava uma página que nenhum concorrente consegue escrever

### 6.3 Clusters de intenção

Ordenados por proximidade da compra.

| # | Cluster | Dor real da persona | Int. |
|---|---|---|---|
| **C1** | Substituição de ferramenta | Já cotou um "disparador", ou viu ferramenta gringa em inglês, e está com o cartão na mão comparando | BOFU |
| **C2** | Dor operacional do grupo | "Lotou nos 1024 e o cliente novo não entra"; "posto a mesma grade em 18 grupos na mão"; "não sei qual grupo trouxe a venda" | BOFU |
| **C3** | Anti-ban por desenho | "Vou tomar ban"; "já caiu meu zap"; "perdi 3 mil contatos" | MOFU |
| **C4** | Playbook do atacado por grupo VIP | "Tenho grupo mas não vende como o dos outros" — ela quer a operação, não a ferramenta | MOFU |
| **C5** | Decisão comercial | "Quanto custa"; "vai funcionar pra mim"; "e se eu cancelar" | BOFU |
| **C6** | Assets (ferramenta/templates) | "Quantos grupos preciso pra bater X"; "o que escrevo na oferta" | MOFU |

**C3 é o mais defensável** — é o único onde a posição do Girumo é arquitetural e não retórica. **C4 é caro e converte devagar**: cabem 3 páginas, não 15. **C6 custa hora de código, não de escrita** — e é o primeiro a cair se o orçamento apertar.

### 6.4 Mapa de páginas-alvo

> **Volume de busca não verificado em 100% das linhas.** Sem Ahrefs/Semrush neste ambiente. A priorização é por proximidade da compra e fraqueza do SERP atual — nunca por volume estimado. Nenhum número de volume mensal foi inventado.

| P | URL | H1 | Cluster | Termo-alvo | Quem rankeia hoje | Ângulo do Girumo | Prova | h |
|---|---|---|---|---|---|---|---|---|
| **P0** | `/` | Automatize seus grupos VIP de WhatsApp no atacado de moda | C2 | grupo vip whatsapp atacado | — | Única página indexável; H1 atual não tem termo nenhum | Números da operação fundadora no hero | 1 |
| **P0** | `/solucoes/saber-de-qual-grupo-veio-a-venda` | De qual grupo veio essa venda? Como parar de chutar | C2 | como saber de qual grupo veio a venda whatsapp | **Ninguém** | Atribuição por grupo. Fraqueza declarada: é first-touch, não multi-toque | Print do painel com ranking real | 4 |
| **P0** | `/comparar/melhores-ferramentas-grupo-vip-whatsapp` | As melhores ferramentas para grupo VIP de WhatsApp (e qual serve pro atacado de moda) | C1 | melhores ferramentas para gerenciar grupos de whatsapp | Periskope, Zoppy, ChatGuru | Listicle honesto: declara onde cada concorrente **ganha** do Girumo | Critérios de operar 50+ grupos; 194 conectados | 6 |
| **P0** | `/comparar/girumo-vs-disparador-de-whatsapp` | Girumo x disparador: por que a gente não manda mensagem no privado | C1 | disparador de whatsapp | SendFlow, DT Network, 3C Plus | Nunca-DM. Fraqueza: se você precisa de DM 1-a-1, **não serve** | Arquitetura anti-ban documentada | 4 |
| **P0** | `/solucoes/grupo-de-whatsapp-lotou-1024` | Seu grupo lotou nos 1024. O que fazer sem perder cliente | C2 | grupo de whatsapp cheio limite 1024 | Portais genéricos + **Grupos Inteligentes** | `group_full` abre o próximo grupo e redireciona a captação sozinha | Run real da automação | 4 |
| **P0** | `/solucoes/postar-oferta-em-varios-grupos-de-whatsapp` | Como postar a grade em todos os seus grupos de uma vez | C2 | enviar mensagem para vários grupos ao mesmo tempo | Tutoriais de lista de transmissão | Lista de transmissão **não chega em grupo** — erro que quase todo tutorial comete | Campanha real: nº de grupos, intervalo | 4 |
| **P0** | `/guias/nao-tomar-ban-no-whatsapp-vendendo-em-grupo` | Como não tomar ban vendendo em grupo (e por que o disparo é que derruba) | C3 | como não ser banido no whatsapp | 100% ferramentas de disparo/DM | Quem escreve sobre ban vende o que causa o ban | Filtro anti-ban + histórico de celulares | 5 |
| **P0** | `/comparar/girumo-vs-periskope` | Girumo ou Periskope: qual serve pra grupo VIP de atacado | C1 | periskope alternativa / português | Periskope (traduzido) | pt-BR de verdade + captação + atribuição. Fraqueza: Periskope tem API e escopo maiores | Comparação com screenshots | 4 |
| **P0** | `/precos` | Quanto custa automatizar seus grupos VIP de WhatsApp | C5 | quanto custa ferramenta de whatsapp lojista | genérico | Preço por celular conectado (1/2/2) vs custo/hora de postar na mão | Horas/mês gastas manualmente | 3 |
| **P1** | `/guias/vender-no-atacado-de-moda-por-grupo-de-whatsapp` | Como vender atacado de moda por grupo de WhatsApp: a operação inteira | C4 | como vender roupas no atacado pelo whatsapp | Lambari, Guia das Roupas | Hub que linka o resto. Escrito por quem fez o caminho | R$5k→R$350k; 12 mil+; 50+ grupos | 6 |
| **P1** | `/solucoes/lotar-grupo-vip-de-atacado` | Como lotar um grupo VIP de atacado | C2 | como lotar grupo de whatsapp | Diretórios de grupos | Captação própria + auto-grow com cadência — não compra de lista | 12 mil+ em 50+ grupos | 5 |
| **P1** | `/guias/evento-de-2-dias-no-grupo-vip` | O evento de 2 dias que vendeu 20 mil peças pelo grupo | C4 | como fazer promoção no grupo / queima de estoque | Blogs de atacadista | Cronograma hora a hora de evento real, não teoria | +20 mil peças em 2 dias | 5 |
| **P1** | `/comparar/girumo-vs-diretorio-de-grupos` | Divulgar seu grupo em site de "grupos de WhatsApp" funciona? | C1 | divulgar grupo de whatsapp | gruposwhats.app, gruposzapp | Entra quem não compra e sai. **Prova que só nós temos** | Taxa de saída por origem (evento de saída gravado) | 4 |
| **P1** | `/solucoes/pagina-de-captura-que-joga-pro-grupo-de-whatsapp` | Página de captura que leva direto pro grupo VIP (sem pedir e-mail) | C2 | landing page para grupo de whatsapp | Nuvemshop, LPs genéricas | O funil fecha no zap, não em e-mail | LPs próprias — **nunca** `/p/[slug]` de cliente | 4 |
| **P1** | `/solucoes/organizar-varios-grupos-de-vendas-whatsapp` | Como organizar 10, 20, 50 grupos sem enlouquecer | C2 | como gerenciar vários grupos de whatsapp | Periskope | Nomeação e segmentação por linha (infantil, plus, jeans) | Estrutura real de 50+ grupos | 4 |
| **P1** | `/comparar/girumo-vs-manychat` | Girumo ou ManyChat pra vender no atacado por WhatsApp | C1 | manychat português / alternativa | ManyChat + agências | ManyChat é chatbot 1:1 e DM de IG — não posta em grupo. Fraqueza: ganha em DM do IG e é mais barato | Print de campanha em N grupos | 4 |
| **P1** | `/guias/caiu-o-zap-como-recuperar-a-operacao-de-grupos` | Caiu o zap: como recuperar a operação sem perder os clientes | C3 | meu whatsapp foi banido como recuperar | Blogs de disparo, portais tech | O ativo é o **grupo**, não o número | Episódio real — **confirmar antes de escrever** | 4 |
| **P1** | `/para-quem-o-girumo-nao-serve` | Pra quem o Girumo não serve | C5 | girumo vale a pena | nada (marca) | Desqualificação explícita. Formato desproporcionalmente citado por LLM | Perfis reais que não fecharam | 3 |
| **P2** | `/comparar/crm-de-whatsapp-x-ferramenta-de-grupo` | CRM de WhatsApp ou ferramenta de grupo: qual você precisa | C1 | crm para whatsapp atacado | Zoppy, ChatGuru, Whaticket | Categorias diferentes; muita loja compra a errada. Fraqueza: não fazemos inbox | Stack real da operação fundadora | 3 |
| **P2** | `/solucoes/mensagem-de-oferta-que-vende-no-grupo` | A mensagem de grade que vende no grupo | C2 | mensagem para grupo de vendas de roupas | Blogs de sacoleira | Estrutura testada + agendamento | `copy-library.md` | 3 |
| **P2** | `/guias/quantos-grupos-um-numero-aguenta` | Quantos grupos um número de WhatsApp aguenta na prática | C3 | limite de grupos whatsapp | Portais genéricos | Dado próprio por celular; amarra no value metric 1/2/2 | Grupos por celular medidos | 3 |
| **P2** | `/cobranca-cancelamento-e-reembolso` | Cobrança, cancelamento e reembolso do Girumo | C5 | girumo cancelamento | nada (marca) | 7 dias do CDC sem letra miúda | Política vigente | 2 |

**Assets — não entram no orçamento de escrita. Validar demanda ANTES de codar:**

| Asset | O quê | Custo |
|---|---|---|
| `/ferramentas/calculadora-de-grupos` | Quantos grupos você precisa pra vender R$X/mês | dev 10-14h |
| `/modelos/mensagens-de-oferta-para-grupo-vip` | Modelos de mensagem, um por página | 6h + manutenção |
| `/ferramentas/checklist-anti-ban` | Checklist para quem vende em grupo | 2h |

Validação = testar com um post no Instagram antes de escrever uma linha de código.

#### Páginas cortadas e por quê

| Cortada | Motivo |
|---|---|
| "Que horas postar a oferta no grupo" | **Sem prova própria confirmada.** Sem dado agregado por horário, é achismo com cara de dado |
| "Como transformar sacoleira em compradora recorrente" | Cluster dominado por Guia das Roupas e Sacoleira de Sucesso; persona longe da compra |
| "Um grupo por linha: quando dividir" | Vira **seção** de `/solucoes/organizar-varios-grupos` — separada, canibaliza |
| "Tirar quem não compra do grupo" | Idem — vira seção de `/organizar-varios-grupos` e de `/vs-diretorio` |

### 6.5 Orçamento — cabe, e com folga

| Bloco | Páginas | Horas |
|---|---|---|
| P0 | 9 | 35h |
| P1 | 9 | 39h |
| P2 | 4 | 11h |
| **Total** | **22** | **85h** |

Distribuído em 12 meses: **~7,1h/mês de escrita nova, ~9h/mês com manutenção.** Cabe no piso de 8h e deixa o teto de 20h livre para os assets, se validados.

**Por que a folga importa:** comparativo desatualizado é pior que comparativo inexistente. O Periskope muda a página dele, o disparador muda o preço, e a sua página passa a mentir. O mapa cru somava 98h (8,2h/mês, zero folga) — foram cortadas 13h de propósito.

**Cronograma:** meses 1-4 → P0 · meses 5-8 → P1 · meses 9-12 → P2 restante + manutenção.

### 6.6 As primeiras 5 páginas

| # | Página | h | Por quê |
|---|---|---|---|
| 1 | **Home — trocar o H1** | 1 | Maior retorno por hora do mapa. É a única página indexável que existe, e o H1 atual não tem sinal de busca nenhum. Enquanto ele não tiver "grupo VIP de WhatsApp" + "atacado de moda", tudo publicado depois aponta pra uma raiz muda. Manter "Grupo cheio, venda todo dia." como linha de apoio — funciona pra conversão, não pra descoberta |
| 2 | `/solucoes/saber-de-qual-grupo-veio-a-venda` | 4 | Onde o vazio é mais absoluto: nenhum dos 5 concorrentes atribui venda a grupo. BOFU puro — quem busca isso já tem grupos, já vende, e já sentiu falta do dado |
| 3 | `/comparar/melhores-ferramentas-grupo-vip-whatsapp` | 6 | Piggyback no único termo onde o Periskope já provou demanda em pt-BR. Listicle é o formato que LLM mais cita — mas só o honesto. Se for propaganda disfarçada, não é citado e as 6h viram lixo |
| 4 | `/comparar/girumo-vs-disparador-de-whatsapp` | 4 | Intercepta a busca comercial mais óbvia da categoria. Quem digita "disparador de whatsapp" está a um passo de comprar a ferramenta que vai derrubar o número dela |
| 5 | `/solucoes/grupo-de-whatsapp-lotou-1024` | 4 | Dor com data e hora: lotou hoje, está perdendo cliente agora. Prova pronta (run real da automação). Atenção: o Grupos Inteligentes já vende essa dor — o diferencial tem que ser a execução, não a novidade |

`/precos` e a pillar de anti-ban ficam pro mês 3-4: a primeira só rende com tráfego de marca que ainda não existe; a segunda é a mais valiosa a médio prazo e a de SERP mais disputado — entrar nela depois que as quatro primeiras derem sinal de indexação.

### 6.7 O que NÃO vamos disputar

| Abandonado | Motivo |
|---|---|
| "fornecedores de roupas para revenda", "fornecedor do Brás", "onde comprar no atacado" | Dominado por Nuvemshop e agregadores com anos de autoridade. Pior: é onde a persona está **antes** de precisar do Girumo — ela nem tem grupo ainda |
| TOFU definicional: "o que é grupo VIP", "o que é sacoleira" | A IA responde sem gerar clique. Você entrega o conteúdo e não recebe a visita |
| "grupos de whatsapp para entrar", "link de grupo de vendas" | Intenção é **entrar** em grupo, não gerenciar. Os diretórios ganham porque *são* isso. Nunca compra software |
| "CRM para WhatsApp", "chatbot", "multiatendente" | Categoria que o Girumo não é. Quem busca quer inbox — assina, não acha, cancela em 30 dias. Só entramos como desambiguação |
| "WhatsApp Business API", "API oficial preço" | Atrai desenvolvedor e agência. Persona errada |
| "disparador grátis", "ferramenta de whatsapp gratuita" | Sem plano free, é tráfego estruturalmente não-convertível. Disputamos o termo comercial, nunca a variante "grátis" |
| "como vender no Instagram", "tráfego pago para loja de roupa" | Adjacente demais. Volume alto, proximidade da compra zero |
| "como ser sacoleira", "como começar a revender roupa" | Persona pré-comercial. Não temos o que vender pra quem ainda não tem grupo |
| pSEO por cidade: "atacado de roupas em Goiânia / Brás" | Páginas-template sem asset real. E o SERP local pertence a atacadista, não a software |
| "planilha de controle de vendas", iscas de e-mail | Funil errado — fecha em e-mail, e o nosso fecha em `wa.me` |

### 6.8 Dois avisos para o dia da escrita

1. **"Zero banimento" precisa ser auditável antes de ir ao ar.** É a frase mais forte do mapa e a mais fácil de virar processo.
2. **Não usar LP de cliente como exemplo** em `/solucoes/pagina-de-captura...` — as `/p/[slug]` saem do índice, e o exemplo precisa ser nosso.

---

## 7. Fases seguintes (esboço, não aprovado)

- **Fase 2 — Fundação técnica.** Item 1: instrumentar GSC + conversão `wa.me`/signup. Depois: corrigir P0-a e P0-b, C1, H2/H3, M3, M4. Sitemap dinâmico cobrindo toda página nova
- **Fase 3 — Portfólio BOFU finito.** 10-20 páginas conforme mapa da seção 6.3
- **Fase 4 — Ímãs.** Ferramenta grátis (só se a demanda for validada antes de codar) + biblioteca de templates com dezenas de páginas, nunca milhares
- **Fase 5 — GEO.** Presença em terceiros + fact-density. **Sem `llms.txt`** (nenhum motor consome) e **sem ferramenta de "AI visibility score"**
- **Fase 6 — Medição.** Relatório GSC por página/query + conversões `wa.me` por origem
