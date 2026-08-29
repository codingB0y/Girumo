# Análise competitiva técnica — arquitetura de conexão e anti-ban

> **Data:** 2026-08-28 · **Escopo:** 13 concorrentes perfilados + verificação em fonte primária da
> plataforma WhatsApp · **Para:** decisões de engenharia e roadmap do Girumo.
> **Insumos:** `competitor-profiles/*.md`, `competitor-profiles/raw/*.md`, docs oficiais da Meta,
> registry npm, API do GitHub, OpenAPI de concorrente, bundles JS, headers HTTP.
> **Regra:** onde é inferência, está marcado. Onde não achei, está dito.

---

## TL;DR

1. **Não existe caminho oficial.** A Groups API da Meta tem teto de **8 participantes por grupo** e
   **nenhum endpoint para adicionar participante**. Grupo VIP de atacado (centenas de membros, entrada
   por convite) é tecnicamente impossível pela API oficial. Toda a categoria roda em protocolo
   não-oficial — nós inclusive, e não por escolha.
2. **O case do Periskope (5.000+ grupos) é real e plausível** — mas a solução dele é *mais números
   dedicados*, não mais grupos por número. Isso valida "celular conectado" como métrica de valor e
   define o vetor de escala do Girumo.
3. **Somos o único da categoria com anti-ban imposto em código.** Warm-up automático, caps por janela,
   jitter e circuit breaker vivem no `claim` do banco. O mercado inteiro entrega um PDF de boas
   práticas e um campo de "intervalo" para o cliente preencher.
4. **O buraco crítico do Girumo não é envio, é sobrevivência do ativo.** Se o número do lojista cair,
   o grupo fica sem administrador operável. O Meu Grupo Vip resolve isso automatizando N admins por
   grupo — e vende exatamente isso como "proteção". Essa é a recomendação nº 1.
5. **O maior risco não é concorrente, é plataforma:** agendamento nativo do WhatsApp em beta desde
   fev/2026.

---

## (a) Veredito do case Periskope: é possível? Como?

**Claim:** cliente Plum (insurtech indiana de benefícios) com **20.000+ clientes** atendidos via
WhatsApp, **5.000+ grupos corporativos ativos** e **SLA de resposta abaixo de 10 minutos**.
Fonte: [case oficial](https://periskope.app/case-studies/plum-whatsapp-group-management-with-periskope)
(publicado 27/02/2026).

### Veredito: **PLAUSÍVEL como arquitetura — não como façanha de uma conta só.**

O case nunca afirma que um número está em 5.000 grupos. Ele diz literalmente que os números "all
connect to a single shared dashboard". A leitura correta é multi-número agregado em inbox única, e aí
a conta fecha:

| Peça | Evidência | Leitura |
|---|---|---|
| **Não há teto formal de grupos por conta** | A própria régua da Meta na Groups API oficial é 10.000 grupos por número. Fontes BR/EN não acham limite publicado para conta comum | 5.000 grupos não estoura o modelo de dados do WhatsApp |
| **Multi-número é o modelo de negócio deles** | Docs: "To add more phones"; pricing cobra **cada telefone extra como um assento** (US$20–30/mês); Enterprise exige mínimo de 50 usuários/telefones | A resposta deles para escala é *comprar mais números* |
| **O case declara os números** | 25 agentes de vendas com **número dedicado por agente** + 15 pessoas de CS | ~25–40 números → **125–333 grupos por número**, faixa que o próprio marketing deles trata como normal ("Manage 100+ groups") |
| **Corroboração externa** | A Plum tem 6.000+ empresas-clientes (Tracxn/CB Insights, 2026) | 5.000+ grupos ≈ 1 grupo por empresa-cliente — consistente com dado independente do vendor |
| **O SLA é humano, não tecnológico** | O case diz "Sub-10 min Response SLA **maintained by the CS team**" (15 pessoas) | A tecnologia contribui com alerta de mensagem não respondida e escalação, não com resposta automática |

**Ressalvas honestas:** números reportados pelo vendor, sem auditoria; "seguradora" é impreciso (a
Plum é corretora insurtech de benefícios); o case diz "20,000+ insurance clients managed", não
"20.000 atendimentos"; e **o número de "2.000 mensagens/dia" que circulava no briefing não existe no
case** — reli duas vezes. Provável conflação com o claim de GTM "2.000+ businesses".

### O que isso significa para o Girumo (3 implicações operacionais)

1. **O teto real por número é operacional, não formal.** O gargalo não é uma regra do WhatsApp; é
   quantos grupos uma sessão não-oficial consegue sincronizar e servir com estabilidade. Sincronizar
   centenas de grupos numa sessão Baileys custa memória e tempo de boot, e é aí que o produto quebra
   primeiro — não numa mensagem de erro do WhatsApp.
2. **A escala se resolve com mais números dedicados, e isso é monetizável.** Confirma a decisão 1/2/2
   + add-on. Onde o Periskope cobra US$20–30 por telefone, o Girumo cobra a fração disso — há espaço
   de preço no topo, não pressão para baixar.
3. **O gargalo do lojista de atacado é diferente do gargalo da Plum.** A Plum tem 25 vendedores; o
   lojista tem ele mesmo e talvez duas pessoas no showroom. Para o nosso ICP, "mais números" não é
   escala de time — é redundância. Ver recomendação R1.

---

## (b) O que cada categoria de concorrente faz tecnicamente

### Categoria 1 — Especialista em grupos sobre protocolo não-oficial
*Periskope, Meu Grupo Vip, Disparo Pro, DevZapp, AutoProd, DivulgaNinja, Grupzap, WhatsBoost, Joinzapp*

- **Conexão:** QR code no fluxo "Dispositivos Conectados / Link device" do app WhatsApp. Entram como
  **linked device (companion)** — consomem 1 das 4 vagas de dispositivo do lojista e caem juntos se o
  celular principal ficar 14 dias offline.
- **Motor:** família Baileys/whatsmeow. Evidências diretas encontradas:
  - **Periskope publica fork próprio do Baileys no npm**: `@periskope/baileys`, descrição literal
    "Periskope Fork of Baileys", mantenedores `@hashlabs.dev` (razão social deles), latest
    `7.0.0-rc13-alpha-12`. É o único concorrente com engenharia de protocolo própria.
  - **DivulgaNinja** orquestra pools de servidores **uazapiGO** (linhagem whatsmeow) — strings do
    painel admin no bundle JS, com placeholder `https://free.uazapi.com`.
  - **Meu Grupo Vip**: monolito Laravel/PHP em Apache/2.4.41 (Ubuntu); vocabulário "instância" em
    toda a superfície; motor específico não identificado.
  - **Grupzap**: Next.js na Vercel + Supabase — e o projeto Supabase está **NXDOMAIN** (login e
    signup quebrados em 28/08). Vitrine à frente de produto não-operacional.
- **Vocabulário canônico:** *instância*, `awaiting_scan`, `setup_url`, `restart`, `@g.us`. Quem usa
  isso está no trilho não-oficial, sem exceção.
- **Anti-ban:** intervalo configurável **pelo usuário** + manual de boas práticas. Nenhum impõe
  warm-up.

### Categoria 2 — Disparador em massa com grupos acoplados
*SendFlow, Conecta Tribo, 3C Plus*

- Mesmo trilho da categoria 1, **mais DM 1×1 em massa** — o vetor de ban mais caro.
- **Mecanismos que só existem porque o ban é esperado:** spintax, rotação de remetentes ("randomização
  de números" na 3C Plus, "números reserva" na SendFlow), monitoramento de banimento em tempo real,
  janela de horário, 4 variações de mensagem por IA (3C Plus, exige mínimo de 80 caracteres no texto
  original).
- **Correção importante ao briefing anterior:** a SendFlow **não** é um disparador 1×1 que por acaso
  toca grupos. A LP dela lista criação de grupos, automação de grupos, menção a participantes, remoção
  de participantes, exportação de leads de grupo e resposta por IA no grupo. Ela faz o **mesmo caso de
  uso do Girumo** *e ainda* DM em massa. O diferencial a martelar não é "somos de grupos" — é "nunca
  DM em massa".
- **Contradição contratual útil:** a SendFlow vende "escalar com segurança" e "Manual Anti-Banimento",
  mas o Termo de Uso diz que ela não se responsabiliza por bloqueios causados pela Meta.
- A 3C Plus mantém **fork público de `evolution-api` na org do GitHub** (`3C-Plus/evolution-api`, fork
  de `evolution-foundation/evolution-api`) — prova de experimentação com a mesma stack que usamos, não
  prova de que a produção roda nela.

### Categoria 3 — API oficial pura (e por que ela não alcança o nosso caso)
*DT Network / Chat Corp*

- **Conexão:** número WABA aprovado pela Meta, sem QR. Broadcast só por template homologado, tarifa
  por conversa repassada ao cliente.
- **Anti-ban estrutural**, não de camuflagem: sem intervalo, sem aquecimento, sem rotação.
- **A limitação decisiva (verificada em fonte primária hoje):** a Groups API oficial existe, mas
  ([Meta docs](https://developers.facebook.com/documentation/business-messaging/whatsapp/groups)):
  - "Max group participants: **8**" — inviável para grupo VIP de atacado;
  - "Max groups you can create: 10,000 per business number";
  - **não existe endpoint para adicionar participante** — só remover; entrada por convite/join request;
  - só para Official Business Account; **indisponível para números do app WhatsApp Business**;
  - sem ponte para grupos já existentes do lojista.
- **Correção a fazer em qualquer material nosso:** parar de dizer "a API oficial não posta em grupos".
  Ela posta. O argumento correto é: **ela teto em 8 participantes e não alcança o grupo que o lojista
  já administra.** Esse enquadramento é mais forte e é verificável.

### Categoria 4 — Bot de terceiro dentro do grupo
*Nas.io / Nas.com*

- O criador **não conecta o próprio WhatsApp**: ele cola o link de convite e o **bot da Nas** entra no
  grupo, podendo ser promovido a admin. O risco de ban fica nos números da empresa, não do cliente.
- O broadcast de DM sai da **conta WABA oficial verificada da própria Nas** (selo verde + prompt de
  consentimento do WhatsApp no primeiro contato) — ou seja, é **híbrido**, não "não-oficial", como
  constava no perfil.
- Remoção de membro inadimplente é **manual por design**: "WhatsApp does not allow third-party tools
  to force-remove members".
- **Modelo interessante, não copiável:** para o atacadista, o valor é o número dele no grupo (é a
  loja falando). Um bot genérico postando no lugar dele destrói a razão do produto.

### Categoria 5 — Extensão de navegador sobre o WhatsApp Web
*WhatsBoost, Blueticks, e o terceiro modo da DivulgaNinja*

- **WhatsBoost admite no próprio blog:** "a browser-based connector that interacts with your WhatsApp
  Web session", sem usar a API da Meta.
- A **DivulgaNinja tem um terceiro método de conexão não catalogado**: `sessionMode: "Chave de Acesso"`
  — "funciona somente no Google Chrome", instalar extensão, abrir o WhatsApp Web e clicar em "Vincular
  ao DivulgaNinja". É captura de sessão pelo navegador, com perfil de risco e de UX distinto do
  pareamento multi-device.
- **Feature a observar (e adaptar):** o "**Wa Group Listener**" do WhatsBoost escuta mensagens ou
  palavras-chave de qualquer grupo e exporta para Sheets/webhook. Não temos equivalente. Ver R6.
- **Feature a NÃO copiar:** "Group Number Grabber" (raspar números dos participantes do grupo).

---

## (c) Recomendações para o Girumo — priorizadas por impacto × esforço

**Ponto de partida honesto: já estamos à frente no núcleo.** O gate anti-ban do Girumo vive em
`apps/web/supabase/migrations/20260729120000_engine_antiban_state.sql` e faz, hoje, coisas que
**nenhum concorrente perfilado faz**:

- warm-up automático por número: começa em **20 envios/dia**, cresce com fator estável em
  [1,5 – 2,2] por dia, gradua para o teto duro de **800/dia** em 7 dias;
- **re-entrada em warm-up** se o número ficar 72 h sem enviar (número que some e volta a jorrar é
  padrão de spam);
- caps por janela: **8/min, 120/h**, e o teto diário do warm-up;
- **jitter gaussiano de 3–7 s** (soma de dois uniformes, Bates n=2) entre envios do mesmo número;
- **circuit breaker**: 5 falhas seguidas → pausa de 60 s no número;
- e — o detalhe de engenharia que importa — **tudo isso acontece dentro do `claim`**
  (`app.claim_send_commands`, `FOR UPDATE SKIP LOCKED`, no máximo 1 comando por número por lote), o que
  mantém o worker stateless e correto sob N réplicas, e sobrevive a restart.

Comparação direta: o Periskope, que é o concorrente mais avançado tecnicamente da lista, entrega
**delay randomizado configurável + um documento de boas práticas**. A conclusão a internalizar é que
o roadmap abaixo **não é para alcançar ninguém** — é para fechar buracos e transformar vantagem
invisível em vantagem visível.

---

### 🔴 P0 — Impacto alto, esforço baixo (fazer nas próximas 2 semanas)

#### R1. Multi-admin automático nos grupos (proteção do ativo)
**Problema:** hoje, se o número do lojista cair (ban, troca de aparelho, 14 dias offline), o grupo
fica **sem administrador operável**. O ativo (a lista de clientes) fica órfão. É o único cenário em
que o Girumo perde algo irrecuperável.

**Evidência de concorrente:**
- Meu Grupo Vip vende isso como o produto: componente `MultiInstances` intitulado "Como o Meu Grupo
  VIP te protege", com sequência literal "WhatsApp detecta padrões → Envios repetitivos são
  sinalizados → **Instância banida!** → Outras instâncias assumem → Grupo Protegido!". Strings de
  apoio: "4 instâncias como admin do grupo", "Se uma cair, outra assume instantaneamente",
  "Backups ativos em todos os grupos", contra o risco "Sem backup = Sem recuperação / Nenhuma forma de
  reaver os membros". E o FAQ deles diz que **a plataforma adiciona os admins automaticamente**.
- Conecta Tribo, no FAQ: *"Posso perder meu número? Sim! Esse risco existe... Recomendamos que seus
  grupos tenham pelo menos 3 administradores."*

**Implementação:** quando o tenant tem 2+ instâncias conectadas, promover a(s) secundária(s) a admin em
todo grupo administrado (Evolution já expõe promote/demote); quando tem só 1, **alertar** o lojista
para adicionar um segundo admin humano (o sócio, a vendedora) e oferecer o add-on de celular como a
solução paga. Grava-se o estado em `groups` (quantos admins nossos, quantos humanos).

**Cuidado de messaging:** isso é **redundância do ativo**, não rotação de envio. O envio continua saindo
do número principal do lojista — é ele quem a cliente conhece.

**Impacto:** alto (elimina a única perda irreversível) · **Esforço:** baixo/médio · **Bônus:** vira
argumento de upgrade honesto para o segundo celular.

#### R2. Painel de saúde do número — tornar o anti-ban visível e auditável
**Problema:** temos o melhor anti-ban da categoria e **ninguém vê**. O `instance_send_state` já guarda
warm-up, cap diário efetivo, `next_send_allowed_at`, `consecutive_failures` e `paused_until`, e o
`instance_sends` guarda o log das janelas — nada disso chega na tela.

**Evidência de concorrente:** o mercado inteiro vende anti-ban como *promessa* ("zero detecção" no Meu
Grupo Vip, "Anti Ban Measures" no WhatsBoost sem nenhum detalhe técnico, "manual de boas práticas" no
Grupzap). Ninguém mostra número. O Periskope chega mais perto publicando faixas de risco em doc, mas
não instrumenta a conta do cliente.

**Implementação:** uma tela por celular conectado, lendo o que já existe:
"Seu número está no **dia 3 de aquecimento** · teto de hoje: **112 mensagens** · usadas: 37 ·
próximo envio liberado em 4 s · sem falhas nas últimas 24 h". Mais o histórico de envios por hora.

**Impacto:** alto (converte engenharia invisível em diferencial de venda, reduz ticket de suporte
"por que está lento?") · **Esforço:** baixo (dados prontos, é leitura + UI).

#### R3. Alerta de desconexão + a regra dos 14 dias
**Problema:** dois riscos operacionais silenciosos. (1) A sessão é um **linked device**: se o celular
principal do lojista ficar **14 dias inativo**, o WhatsApp desloga todos os dispositivos vinculados —
o Girumo simplesmente para, sem erro. (2) A sessão consome 1 das 4 vagas de dispositivo; se o lojista
vincular WhatsApp Web em vários computadores, ele nos derruba sem saber. **Nenhum concorrente avisa
disso.**

**Evidência de concorrente:** o DevZapp estampa "aviso de inatividade e desconexão" como bullet de
pricing — plumbing virou argumento de venda. E temos histórico próprio de dor aqui (o incidente do
painel mostrando "desconectado" falso, e o fix do `isLive()` de 90 s para 24 h).

**Implementação:** notificação in-app e por e-mail quando a instância fica sem heartbeat, com texto que
explica a causa provável e o passo de correção; e um card de onboarding explicando a regra dos 14 dias
e das 4 vagas.

**Impacto:** alto (churn silencioso e suporte) · **Esforço:** baixo (temos notificações desde o #101/#102).

---

### 🟡 P1 — Impacto alto, esforço médio (próximo ciclo)

#### R4. Variação automática de mensagem entre grupos
**Problema:** hoje o Girumo posta **o mesmo texto** em N grupos. "Mensagem idêntica em massa" é um dos
gatilhos comportamentais que a Meta pondera — o mesmo texto palavra por palavra replicado dispara o
detector de padrão. É o único ponto em que a nossa cadência é impecável e o **conteúdo** não é.

**Evidência de concorrente:** é a única técnica que *todo mundo* implementa — SendFlow (spintax como
"variações automáticas"), 3C Plus (4 alternativas geradas por IA a partir do texto original),
WhatsBoost (5–6 versões com rotação automática), DivulgaNinja (variação de mensagens no blog).

**Implementação:** spintax nativo no compositor (`{Chegou|Acabou de chegar|Saiu} a grade nova`) com
pré-visualização das variantes, escolhendo variante diferente por grupo. Opcionalmente, geração
assistida das variantes. **Ressalva de honestidade:** spintax é higiene, não escudo — ele ataca um
sinal secundário. Não vender como "anti-ban", vender como "sua mensagem não parece robô".

**Impacto:** médio/alto · **Esforço:** baixo/médio.

#### R5. Pré-voo do grupo: confirmar que ainda somos admin antes de enfileirar
**Problema:** enfileiramos e enviamos contra grupos que podem ter mudado (perdemos o admin, o grupo foi
apagado, o lojista saiu). Isso vira falha de envio — e falha seguida aciona o nosso próprio circuit
breaker, pausando um número que estava saudável. Ou seja: **dado velho de grupo degrada o anti-ban.**

**Evidência de concorrente:** o Periskope faz o análogo no 1:1 — "checks whether a recipient exists on
WhatsApp before dispatching a message", e o próprio doc deles classifica "messaging numbers that don't
exist" como *"a classic spam-list fingerprint"*. É o segundo (e último) mecanismo automático que
encontrei em toda a categoria.

**Implementação:** revalidar `is_admin` e existência do grupo no ciclo de varredura (já existe
`automation-scans.ts` a cada 5 min) e marcar grupos inválidos como inelegíveis antes do enfileiramento;
distinguir no `record_send_failure` a falha "de payload/grupo" da falha "do número" — só a segunda deve
alimentar o breaker.

**Impacto:** médio/alto (protege o número de pausas injustas) · **Esforço:** médio.

#### R6. Escuta de grupo → lead quente (adaptação do "Group Listener")
**Problema:** o Girumo posta no grupo e mede clique, mas **não escuta a resposta**. No atacado, a
intenção de compra aparece dentro do grupo em texto: "quanto?", "tem no P?", "faz quantas peças?",
"quero 3". Hoje isso passa em branco.

**Evidência de concorrente:** WhatsBoost vende "**Wa Group Listener**" — escuta todas as mensagens ou
palavras-chave de qualquer grupo, filtra e exporta para Sheets/webhook, em todos os planos. Nenhum
concorrente brasileiro tem equivalente.

**Por que cabe na nossa política:** é **leitura** de grupo próprio, sem envio, sem DM, sem raspagem de
número de terceiro. Zero superfície nova de ban.

**Implementação:** consumir os eventos de mensagem que a Evolution já entrega em
`apps/web/src/app/api/webhooks/evolution`, casar contra palavras-chave configuráveis por tenant e criar
lead quente ligado ao grupo e à oferta postada — fechando a esteira "postei → alguém perguntou →
vendeu". É a peça que falta na atribuição.

**Impacto:** alto para o nicho (é o momento da venda no atacado) · **Esforço:** médio ·
**Diferencial:** sim, e defensável.

---

### 🟢 P2 — Impacto médio/alto, esforço maior (planejar, não improvisar)

#### R7. Failover de instância no meio do run (≠ rotação)
Hoje `pickSendInstance` escolhe a mais antiga conectada e é **estável de propósito** — alternar
instância a cada passo espalharia o mesmo run por números diferentes. Correto. O que falta é o caso
degradado: se a instância escolhida cair no meio do run, os comandos ficam esperando.
**Evidência:** Meu Grupo Vip vende "se uma cair, outra assume instantaneamente" como continuidade.
**Regra a codificar:** trocar de número apenas quando o atual está indisponível há mais de X, e apenas
para número que **também é admin** do grupo — e registrar a troca no log visível ao lojista.
Isso é continuidade, não diluição de spam. **Impacto:** médio/alto · **Esforço:** médio.

#### R8. Importação de catálogo / grade
Gap real apontado no perfil do AutoProd (produtos cadastrados, integração Shopify/WooCommerce/Mercado
Livre) e na DivulgaNinja (cola o link → gera arte e copy em ~30 s). Para o lojista de moda, a rotina
diária é "chegou grade nova → posta em todos os grupos" — hoje ele monta a mensagem na mão.
**Impacto:** alto no nicho · **Esforço:** alto. Fazer depois de R1–R6, e começar por importação simples
(planilha/CSV com foto, referência, grade e preço), não por integração de e-commerce.

#### R9. API pública + webhooks de saída (destrava o topo do catálogo)
**Evidência:** o Periskope expõe API REST completa de grupos (criar grupo, add/remove participante,
promover admin, gerar convite), **fila de mensagens visível ao cliente** (`List Message Queues`,
`Get Queue Status`, `Purge`), 20 eventos de webhook, SDK TypeScript, coleção Postman e até um servidor
MCP. A Conecta Tribo publica OpenAPI. O Disparo Pro vende "API e webhooks" como o delta do plano de
R$577. Nós temos webhook só de **entrada** (Evolution).
**Recomendação:** começar pelo barato e visível — expor a **fila e o status do broadcast** ao lojista
(dados já existem em `engine_commands`), e só depois desenhar API pública.
**Impacto:** médio (destrava plano de topo e agência) · **Esforço:** médio/alto.

---

## (d) O que NÃO copiar — e por quê

| Prática do mercado | Quem faz | Por que não copiar |
|---|---|---|
| **DM 1×1 em massa acoplada ao produto** | SendFlow, Conecta Tribo, 3C Plus, Meu Grupo Vip (módulo 1×1 + export), Periskope (bulk por créditos) | É o vetor de ban primário: mensagem para quem não te salvou. Decisão durável do Girumo. Copiar isso destrói justamente o que torna a nossa cadência defensável |
| **Rotação/pool de números para diluir volume** | Meu Grupo Vip ("rodízio automático"), 3C Plus ("randomização de números"), SendFlow ("números reserva") | Tática de spammer 1×1. No nosso caso o número do lojista **é o ativo** — é a loja falando com a cliente. Rotacionar multiplica superfície de ban e quebra o vínculo. Failover (R7) ≠ rotação |
| **DM automática na entrada/saída do grupo** | Conecta Tribo ("mensagem no privado quando a pessoa entrar ou sair") | Mensagem privada não solicitada para quem não te salvou. Mesmo vetor, embalado como cortesia |
| **Raspagem de participantes do grupo** | WhatsBoost ("Group Number Grabber") | Colhe número de quem nunca deu opt-in para contato direto. Gera denúncia, que é o sinal que efetivamente bane |
| **Claim "zero detecção" / "sem risco de banimento"** | Meu Grupo Vip, DT Network, WhatsBoost, SendFlow | Tecnicamente não garantível. E se quebra, quebra em público. A SendFlow já vive a contradição: vende segurança no marketing e devolve o risco ao cliente no Termo de Uso |
| **Comprar chip aquecido / serviço de "desban"** | Mercado paralelo (R$90–300 + R$20 de desban; um vendedor se chama "Ads Contingência") | Reclame Aqui tem reclamações de **chip que chega banido**. E a premissa "o número é descartável" não existe para uma loja |
| **Anti-ban como intervalo configurável pelo usuário** | AutoProd, DivulgaNinja, Conecta Tribo, 3C Plus, WhatsBoost | Transfere a responsabilidade para quem não tem como saber a resposta. A nossa cadência é imposta — mantê-la assim é o diferencial |
| **Vender API oficial como escudo** | DT Network ("risco de banimento: 0") | No caso de grupos é engano funcional: a Groups API teto em 8 participantes e não alcança o grupo existente do lojista |
| **Cobrar por grupo** | Conecta Tribo (10/150/200/300) | Mede o que não é custo e pune o cliente que cresce. O mercado convergiu para número conectado — e nós estamos certos nisso |
| **Extensão de navegador como forma de conexão** | WhatsBoost, Blueticks, DivulgaNinja (modo "Chave de Acesso") | Prende a operação ao Chrome aberto do lojista. Pior UX, pior confiabilidade, sem ganho de risco |
| **Tração fabricada** | DivulgaNinja (`ratingCount` 20.000 com 1 review), Grupzap ("500+ clientes" com 7 meses de domínio e backend morto) | Já removemos prova social falsa uma vez (04/jul). Não reintroduzir |

---

## (e) Riscos e ameaças a monitorar

| # | Risco | Estado hoje (28/08/2026) | Vigilância |
|---|---|---|---|
| **1** | **Agendamento nativo do WhatsApp** — comoditiza o ato de agendar para a categoria inteira, de graça, dentro do app | **Em desenvolvimento/beta.** Visto no TestFlight iOS 26.7.10.72 e em builds Android em fev/2026; sem data de GA. Blogs de concorrentes afirmam que "lançou em 2025" — **não confirmado em fonte primária** | Mensal, em **WABetaInfo / MacRumors / blog oficial da Meta** — nunca em blog de concorrente. Defesa: o fosso tem que ser a operação (cadência, grow, lead, atribuição), não o agendamento |
| **2** | **Expansão da Groups API oficial** — se a Meta subir o teto de 8 participantes, a narrativa "API oficial = zero ban" da DT Network vira real e a categoria toda muda de trilho | Teto de 8 participantes e ausência de `POST /participants` **confirmados hoje** na doc da Meta | Trimestral na doc oficial. Seria o único evento capaz de reordenar o mapa competitivo |
| **3** | **Apagão coletivo de sessões** — a Meta muda o protocolo, a lib quebra e todas as sessões caem juntas | Baileys **v7 em RC**; whatsmeow pré-1.0; onda de banimentos em massa registrada em **03/08/2026** com ferramentas não-oficiais citadas como gatilho | Acompanhar releases da Evolution/Baileys; ter runbook de reconexão em massa pronto **antes** de precisar |
| **4** | **Meu Grupo Vip clonar a vertical de supermercado para moda/atacado** | Vertical de varejo já validada (150 redes, clientes nomeados, enterprise sob consulta). Clonar = trocar copy de um subdomínio | Monitorar subdomínios novos (`moda.`, `atacado.`, `loja.`) e o Instagram deles |
| **5** | **Disparo Pro (Ativos Capital) descer para o lojista** | R$247 (2 números) / R$577 (5 números), QR confirmado, grupos ilimitados. **É o único concorrente BR de grupos com empresa, canal e imprensa por trás** | **Perfilar já.** Depois, acompanhar mudança de ICP na copy |
| **6** | **Vesti adicionar automação de grupos** | Hoje é e-commerce B2B + CRM + catálogo para **atacado de moda** — já tem o nosso comprador e já rankeia conteúdo de "grupo VIP" | Monitorar changelog/roadmap. Avaliar **parceria** antes de tratar como inimigo |
| **7** | **Comoditização do redirecionador** | Grupos Inteligentes vende só o rotacionador de link a R$27–167, com 14 dias grátis | Não é ameaça isolada, mas impede que o redirecionador seja um pilar de valor do nosso preço |
| **8** | **Regra dos 14 dias / 4 dispositivos vinculados** | Risco operacional silencioso do nosso próprio produto: celular principal 14 dias offline desloga tudo | Endereçado por R3 |

---

## Anexo — fontes primárias que sustentam as afirmações load-bearing

- **Groups API oficial (teto de 8, 10k grupos, sem add-participant, só OBA):**
  https://developers.facebook.com/documentation/business-messaging/whatsapp/groups ·
  https://www.unipile.com/whatsapp-group-api/
- **Case Plum (25 agentes, número dedicado, 5.000+ grupos, SLA do time de CS):**
  https://periskope.app/case-studies/plum-whatsapp-group-management-with-periskope
- **Periskope: QR/linked device, veto a números de API, multi-telefone, boas práticas:**
  https://docs.periskope.app/get-started/connect-whatsapp ·
  https://docs.periskope.app/get-started/best-practices · https://periskope.app/pricing ·
  https://periskope.app/terms · fork no npm: `registry.npmjs.org/@periskope/baileys`
- **SendFlow admite protocolo não-oficial na própria LP:** https://lp.sendflow.com.br ·
  aquecimento: https://blog.sendflow.pro/artigo/como-aquecer-seu-chip-para-whatsapp/
- **3C Plus (dois canais e fork de Evolution):** https://alo.3cplusnow.com/help/disparos ·
  https://github.com/3C-Plus/evolution-api
- **DT Network (API oficial como escudo):**
  https://dtnetwork.com.br/chat-whatsapp-com-api-oficial-chat-corp/
- **Conecta Tribo (OpenAPI próprio; grupos só no `alternative`):**
  https://conectatribo.com.br/api/v1/docs/openapi.yaml
- **Disparo Pro (preço e conexão por QR):** https://disparopro.com.br/planos/ ·
  https://disparopro.com.br/gestao_de_grupos_no_whatsapp_como_configurar/
- **Agendamento nativo em beta:**
  https://www.macrumors.com/2026/02/24/whatsapp-scheduled-messages-coming/ ·
  https://www.techrepublic.com/article/news-whatsapp-scheduled-messages-feature-ios-beta/
- **Anti-ban atual do Girumo (código):**
  `apps/web/supabase/migrations/20260729120000_engine_antiban_state.sql` ·
  `apps/worker/src/send-loop.ts` · `apps/worker/src/pick-send-instance.ts`
- **Dossiês de apoio:** `competitor-profiles/raw/plataforma-whatsapp-anti-ban.md` ·
  `competitor-profiles/raw/br-mass-senders-anti-ban.md` ·
  `competitor-profiles/raw/periskope-deepdive.md`
