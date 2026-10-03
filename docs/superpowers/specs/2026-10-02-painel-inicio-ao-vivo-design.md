# Início "Ao vivo" (mockup F) — design e plano

- **Data:** 02/10/2026 · **Card:** `painel-inicio-ao-vivo` (quadro de produção, `em_construcao`)
- **Mockup:** coluna **F · Ao vivo**, desktop 1440 e celular 390 — fontes em
  `C:/Users/Igor/Desktop/girumo-design-refs/painel-devzapp-2026-09-23/` (`BRIEF.md` seção F,
  `mockup/src/f-desktop.html`, `mockup/src/f-mobile.html`, `mockup/shots/f-*.jpg`)
- **Antecessora:** `2026-09-24-painel-direcao-d-design.md` (casca, tema noite, gráficos, entrega por grupo)

## Por que

A série D entregou a página da campanha. A Início continuou sendo a Vitrine (quem chegou, último post,
caixa do mês, etiquetas de campanha, estoque de grupos). O Igor pediu a Início "conforme o mockup" F: a
sala de controle para quem deixa a tela aberta o dia todo — o que está saindo, onde está entrando gente,
qual grupo lotou e quem está esperando na relâmpago, tudo numa tela.

## Decisões

1. **Vira a Início, dentro da casca D.** O menu lateral da D fica; a barra superior do mockup F não entra.
   O tema noite da D (spec D, decisão 1) já vale no painel inteiro, então a tela nasce escura como o
   mockup, sem trabalho de tema.
2. **Construída ao lado e trocada no fim.** `InicioAoVivo` mora em `components/painel/home/ao-vivo/`
   (um arquivo por bloco), ao lado de `InicioVitrine`. `app/painel/page.tsx` escolhe pela query `?ao-vivo`.
   Não existe mecanismo de flag no projeto e esta série não cria um. O PR 7 torna a nova padrão e apaga a
   Vitrine e o que só ela usava.
3. **Uma chamada só.** A tela continua lendo `/api/painel/inicio` (#260). Entram partes novas em
   `resolverPartes`, cada uma com seu `ok`: parte que falha mostra "não deu pra carregar" no bloco dela e
   o resto da tela fica de pé. Enquanto a tela nova está atrás de `?ao-vivo`, a parte `atividade` só vem quando a chamada leva `?ao-vivo` — a Vitrine não paga por ela.
4. **Verdade do produto acima do mockup.** Onde o mockup promete o que o produto não faz, a tela muda:
   - Sem "na ordem de envio": a ordem entre grupos é aleatória (spec D, decisão 8). A grade de entrega
     mostra os grupos **por número**.
   - "EU QUERO até agora" vira **"Pediram até agora: N"** e só aparece quando o post tem oferta relâmpago
     ligada (o mesmo número "Pediram" da aba Resultados). Post comum não tem a linha.
   - Comparação "vs semana passada" só depois de 7 dias medidos de entradas e saídas: a medição começou em
     `ENTRADAS_E_SAIDAS_DESDE` (30/09 23:01:58 BRT), então a comparação aparece a partir de 08/10. Antes
     disso: "medindo desde 30/09".
   - Entradas e saídas só existem para grupos cadastrados com `is_admin` — o mesmo recorte da D.
   - Relâmpago: a regra é uma oferta aberta **por grupo** (`flash_offer_groups_um_aberto_uidx`), então
     pode haver mais de uma no ar. O "Abrir oferta desabilitado" do mockup sai.
5. **Acid só em Postar, AO VIVO e LOTOU, e nunca em botão ou link da Início.** O contrato
   `painel-vitrine-casca.spec.ts` exige zero `button`/`a` com `bg-acid` na Início. A célula LOTOU do mapa é
   um link: o acid vai num `span` de preenchimento dentro dela, não na classe do link. O "Postar" dos estados
   quietos não é acid.
6. **Reuso antes de escrever.** Estado do grupo: `estadoDoGrupo` de `lib/painel/grupos.ts` (cheio, quase
   ≥ 85%, ativo, sem convite). Post acompanhado: `postDaTabela` de `lib/painel/entrega.ts`. Entrega por
   grupo: `useEntrega` + `/api/disparos/[id]/grupos`. Gráfico: `GraficoDeBarras` + `mostraRotulo`.
   Vendedora: `CardDaVendedora` e as rotas da relâmpago. Nenhuma regra nova onde já existe uma.
7. **Atualização por polling, sem realtime.** A resposta da Início recarrega a cada 60 s com a aba
   visível (nada com a aba escondida). Entrega de post saindo e relâmpago aberta: 10 s, o ritmo que a E e a
   tela da fila já usam. "atualizado há N min" ao lado do AO VIVO.

## Dados

| Parte nova em `/api/painel/inicio` | Fonte | Alimenta |
|---|---|---|
| `atividade` | `campaign_activity(p_tenant, null, todos os grupos, hoje, agora, 'hour')` + a semana | faixa (entraram, saíram, saldo, cliques), sparkline, gráfico |
| `relampago` | `listOffers` → abertas; totais da oferta (mesma conta de `offerTotalsByBroadcastIds`); próximas 5 da `listQueue` | card Relâmpago |

"+n hoje" e "novo HH:MM" vêm da própria parte `atividade` (`hojePorGrupo`, `gruposAbertosHoje`), que no PR 2 passa a ler os grupos abertos do tenant inteiro — sem parte nova.

Pedidos, meta, agendamentos, disparos, grupos e campanhas já vêm na resposta de hoje.

**Única mudança no banco:** `campaign_activity` passa a aceitar `p_campaign` nulo = cliques de todos os
links do tenant (hoje a CTE de cliques filtra `e.campaign_group_id = p_campaign`, e nulo não casa nada).
`create or replace` com a mesma assinatura; reaplicar `revoke ... from public, anon, authenticated` e
`grant ... to service_role` (create or replace não preserva ACL em dev). O Igor roda nos dois bancos;
`schema-baseline.json` e `apply-order.txt` no mesmo PR. O gate de drift não vê corpo de função: conferir
por SQL depois de aplicar.

## Os blocos

### Faixa de status (topo, uma linha separada por fios)

- ● **AO VIVO** (chip acid) · dia e hora · à direita "atualizado há N min".
- **Entraram hoje** + os últimos 7 dias em miniatura (a mesma da página da campanha) · comparação com o mesmo dia da semana anterior a partir de 08/10.
- **Saíram** · **Saldo** (+ a semana, somando só o que foi medido).
- **Cliques nos links hoje** + o total histórico dos links (o recorte por campanha exigiria cliques de hoje por campanha, que nenhuma parte traz — fica para quando pedir).
- **Pedidos anotados hoje** · R$ · a faixa mostra "X% da meta do mês" ou "sem meta do mês". O editor da meta mora hoje na Vitrine (`CaixaDoMes`): o PR 7 precisa trazer um jeito de definir a meta antes de apagar a Vitrine.

### Mapa dos grupos (centro)

- Uma célula por grupo, agrupada por campanha, mais o bloco **"Outros grupos"** (fora de campanha).
- Célula: número do grupo, preenchimento de baixo para cima pela lotação, estado por `estadoDoGrupo`
  (LOTOU acid, QUASE warn, ATIVO neutro, SEM CONVITE contorno vermelho + ícone), "+n hoje",
  "novo HH:MM" no grupo aberto hoje.
- Tooltip no hover e no foco: nome, membros/capacidade, %, entraram e saíram hoje. "Post entregue" sai
  (a grade da esquerda já mostra a entrega).
- Filtros Todos · Lotou · Quase · Ativo · Sem convite, com contagem.
- "Lotou → abre outro: ligado/desligado" por campanha, só leitura, com link para a configuração da
  campanha.
- Até 3 alertas acima do mapa: grupo sem convite ("Configurar convite" → leva à tela de Grupos, onde o convite se edita na linha); campanha com todos os
  grupos lotados e o abre-outro desligado.
- Clique na célula abre a campanha do grupo (`/painel/campanhas/<slug>`); em "Outros grupos", a tela de Grupos. Não existe página de um grupo só. Nome acessível completo ("VIP Revenda #39, 935 de 1.024, quase lotado,
  38 entraram hoje"); o estado também é texto, nunca só cor.
- Mais de ~200 grupos: cada campanha mostra os 60 mais cheios + "ver todos".

**Antes do PR 7** (achados da revisão final do PR 2):

- No modo 200+, um filtro diferente de "Todos" tem de buscar em todos os grupos, não só nos 60 visíveis
  por bloco (hoje "Sem convite 5" pode listar nada).
- O tooltip da célula tem de fechar com Esc e poder receber o mouse (WCAG 1.4.13).
- O mapa deixa de fora do bloco da campanha os grupos que não estão no cadastro; a página da campanha
  os mostra como "sumiu".

### Entradas e saídas por hora (abaixo do mapa)

`GraficoDeBarras` da loja inteira, períodos Hoje · 7 dias · Mês. Marcas no eixo: posts (hora de início),
grupo aberto, relâmpago no ar. No máximo 4 marcas visíveis; as demais no tooltip.

### Postando agora (esquerda)

- O post de `postDaTabela`: o que está saindo ou, se nada sai, o último de hoje.
- Cabeçalho: nome e campanha · "27 de 40 grupos" com barra · "termina por volta de HH:MM" (estimado
  pelo ritmo dos últimos envios, só enquanto sai).
- Prévia na bolha do WhatsApp (texto + foto; texto cortado em 6 linhas com "ver tudo").
- Grade "Entrega nos N grupos", por número: entregue ✓✓ · enviando · na fila · falhou.
- "Pediram até agora: N" só com oferta ligada (decisão 4).
- Terminado: "Saiu às 14:08 · 40 de 40" ou "38 de 40 · 2 falharam" com link para a entrega.
- Quieto (nenhum post hoje): "Nada saindo agora" + Postar.
- **Próximos:** 3 agendamentos (hora, nome, campanha; "amanhã" quando for). Vazio: "Nada agendado" +
  link para agendar.

### Relâmpago AO VIVO (direita)

- A oferta aberta mais recente; com mais de uma: "+N outra(s) no ar" com link.
- Cabeçalho: nome, grupos, "no ar há X", "16 de 20 peças" (`slots` − vendidas) com barra.
- Placar: Pediram · Atendidas · Vendeu · Esperando.
- Minha conversa atual (se a vendedora logada tem atendimento aberto): `CardDaVendedora` — nome,
  "em conversa há X min", Chamar no WhatsApp · Vendeu · Não respondeu (rotas `/claims/[id]`).
- "Pegar a próxima: <nome>" via `claimNext`; desligado com o motivo escrito enquanto há conversa aberta.
  Sem prometer posição.
- Fila compacta: próximas 5 com horário e estado + "ver fila inteira".
- "Fechar oferta" discreto, confirmação na própria tela (nunca `window.confirm`).
- Quieto: "Nenhuma relâmpago no ar", a última oferta (vendeu X de Y), "Abrir relâmpago".
- Erro de ação: mensagem do servidor no card, sem sumir sozinha. 409 "já pegaram" recarrega a fila.

### Celular (< 768 px)

- Faixa rola de lado, AO VIVO preso à esquerda.
- Abas **Relâmpago · Postando · Grupos** (`role="tablist"`, setas do teclado, `?aba=` na URL). Abre na
  Relâmpago se há oferta no ar, senão na Postando se há post saindo, senão em Grupos. ● na aba com
  coisa acontecendo.
- Grupos: mapa com células menores e o gráfico só com Hoje. Barra de baixo da D igual.

### Loja nova e estados do dia

- Ficam da Vitrine: `ActivationChecklist` no topo enquanto incompleto; banner de número desconectado acima
  da faixa com "Reconectar" (os números continuam, o histórico vale); `CelebrationModal`.
- Sem grupos: "Nenhum grupo ainda" + criar/importar. Todo bloco tem frase quieta; nada vazio sem explicação.

## PRs, na ordem

Todos atrás de `?ao-vivo` até o 7. Cada um: TDD nas funções puras, os dois `tsc`, lint, CI verde, merge,
verificação em produção logado (1440 / 1100 / 390 + auditoria de contraste).

| # | Entrega | DDL |
|---|---|---|
| 1 | Casca `InicioAoVivo` + seletor `?ao-vivo` + faixa de status + partes `atividade` + polling de 60 s | `campaign_activity` com `p_campaign` nulo (Igor, dois bancos) |
| 2 | Mapa dos grupos: estado, +n hoje, novo, filtros, tooltip, alertas, Outros grupos (`hojePorGrupo`, `gruposAbertosHoje`) | — |
| 3 | Entradas e saídas por hora da loja, com marcas | — |
| 4 | Postando agora: prévia, grade por número, término estimado, Pediram, Próximos | — |
| 5 | Relâmpago AO VIVO (parte `relampago`) | — |
| 6 | Celular com abas + estados de loja nova + e2e | — |
| 7 | A Início nova vira padrão; apagar `InicioVitrine` e o que só ela usava; levar o editor da meta; tirar o `?ao-vivo` da rota e do hook (a parte `atividade` passa a vir sempre) | — |

## Testes

- **Unitários** (`node --test`) em `lib/painel/ao-vivo/`: montagem da faixa (inclusive antes e depois de
  08/10), alertas do mapa, marcas do gráfico, término estimado, escolha da oferta e da aba inicial.
- **Integração** (job e2e, banco de dev): `campaign_activity` com `p_campaign` nulo conta cliques de mais
  de uma campanha. Dado temporário no tenant de QA, apagado no fim. O QA continua **sem instância**.
- **e2e:** `/painel?ao-vivo` com o tenant de QA (sem número): banner de desconectado, estados quietos,
  zero botão/link acid, abas no celular. O e2e da casca da Vitrine continua valendo até o PR 7, que o
  reaponta para a tela nova.

## Fora desta série

- Interruptor "abre outro" e configuração de convite na própria Início (ficam na campanha e no grupo).
- Realtime/websocket.
- Seletor de loja, busca Ctrl K, central de notificações (continuam fora, como na D).
- Pedidos e meta por campanha.

## Riscos

- **Peso da rota:** quatro partes novas na mesma resposta. `campaign_group_member_counts` com todos os
  grupos e `listQueue` só quando há oferta aberta. Medir o tempo da rota no PR 1 e no PR 5.
- **Polling × egress:** 60 s por aba aberta, parado com a aba escondida. A carência de egress vai até 21/10
  (ver memória do polling do worker); se apertar, subir para 120 s.
- **Dia sem nada:** a maior parte do dia não tem post saindo nem relâmpago. A verificação em produção de
  cada bloco precisa de um dia com o evento real; o estado quieto é verificado em qualquer dia.

## Verificação final

Card `painel-inicio-ao-vivo` vai para `no_ar_verificado` só depois do PR 7, com prova colhida na hora em
produção: faixa com números de hoje, mapa com estados reais, um post saindo (ou o último do dia) e o estado
da relâmpago, nas três larguras.
