# Painel G2 — barra volt, conteúdo claro (design e plano)

- **Data:** 05/10/2026 · **Card:** `painel-g2-barra-volt` (quadro de produção, `em_construcao`)
- **Mockup:** canvas "Painel Girumo · mockups G, H e I", artboards **G2 · desktop 1440** e **G2 · celular 390**
  (https://claude.ai/artifact/3P1ekCTbVcBngkq3Sc97DF). Fonte dos artboards no scratchpad da sessão
  (`mock-bling/build.mjs` + `src/base.css`); capturas em `mock-bling/out/G2-*.png`.
- **Antecessoras:** `2026-10-02-painel-inicio-ao-vivo-design.md` (F, a tela que está no ar) e
  `2026-09-24-painel-direcao-d-design.md` (casca com corredor + tema noite).

## Por que

A Início ao vivo (F) está no ar desde 04/10. Olhando em produção, o Igor achou a tela pesada: fundo volt
em 100% da tela, legendas de 12 px demais, sete números na faixa, grade de 40 células de entrega. Pediu
a estrutura de SaaS do **Bling** (menu horizontal em cima, conteúdo claro, cartões com sombra) e escolheu
o mockup **G2**: a estrutura da F, com cerca de 35% menos informação, barra de cima volt e conteúdo claro.

O que foi medido no Bling (logado, 1440): barra branca de 48 px com logo, cinco menus com chevron que
abrem painéis de links, busca no centro, ícones e avatar à direita; fundo `#F8FAFC`; cartões brancos de
raio 12 com sombra suave; um acento só. O que não copiar: texto de 12 px em tabela e 10,7 px de base.

## Decisões

1. **Tema claro frio no painel inteiro, pela mesma camada de tokens da D.** O bloco `:root:has(.pn-root)`
   de `painel-vitrine.css` deixa de escrever os valores de noite e passa a escrever os do G2: fundo
   `#F3F5F7`, superfície `#FFFFFF`, fio `#DDE3E7`, hover `#F6F8F9`, selecionado `#E8EDF0`; tinta volta a ser
   o volt `#071923` e o apoio `#52646C` (6,0:1 sobre branco). As ilhas claras, os tons claros de estado e o
   esqueleto escuro saem, porque só existiam por causa da noite. Reverte a decisão 1 da D por escolha do
   Igor (05/10). O canvas creme `#F4F0E7` continua na landing: o painel é frio de propósito, para o branco
   dos cartões e o volt da barra lerem como um SaaS, não como papel.
2. **O painel volta às fontes da raiz:** Plex Sans no corpo, Plex Mono em dado tabular, Manrope nos
   números grandes e títulos. Archivo sai do painel (fica nas landings). Reverte a decisão 2 da D. Os
   `[font-stretch:75%]` saem junto: Plex e Manrope não têm eixo de largura.
3. **Tamanhos:** corpo 14 px; apoio e legenda 13 px (`text-12` só em chip de estado e contador); títulos
   de seção 16/600; números 28 px (célula apertada e celular), 32 px (faixa) e 40 px (destaque) em Manrope
   700 com tracking −0,015em.
4. **Barra volt de 56 px no lugar do corredor e do letreiro** (desktop ≥ 1024). Da esquerda: logo (volta
   para a Início), nome da loja (sem seta: não há troca de loja, decisão 6 da D), navegação **Início ·
   Campanhas · Disparos · Relâmpago · Grupos · Contatos · Mais ▾**, e à direita o estado do número
   ("Conectado"/"Desconectado", link para `/painel/conectar`), o sino, **Postar** e o avatar com as iniciais
   da loja (link para Configurações). Relâmpago carrega um contador com o número de pessoas esperando
   quando há oferta no ar — entra no PR 5 junto com o placar, que é de onde o número vem; até lá o item
   leva um ponto branco quando há oferta no ar (branco, não Acid: decisão 11). O item ativo tem a
   tinta clara e um traço de 2 px embaixo.
   - **Mais ▾** abre um painel ancorado ao botão (não um modal) com todos os módulos por verbo (Vender,
     Lotar, Loja) e o estado de cada um, o mesmo conteúdo da folha "Mais" do celular, mais o romaneio do
     plano no rodapé ("GROWTH · renova 04/10"). Esc, clique fora e seleção fecham.
   - **Sem busca.** O mockup tem um campo "Buscar grupo, contato ou post"; o produto não tem busca. Nada
     de controle falso (decisão 6 da D). Entra quando a busca existir.
   - **Postar** é o `pn-postar` da barra do celular (o Acid tocável do painel), agora também no desktop,
     abrindo a `FolhaPostar` como diálogo centrado. Some em `/painel/disparos`, onde a tela é o próprio
     compositor (contrato do e2e: um único `/^Postar/` ali).
   - Entre 1024 e 1280 px o nome da loja some (ficam as iniciais no avatar) e o chip do número vira só o
     ponto, para a barra caber.
   - O que sai com o corredor: a lista de campanhas sob "Campanhas" (a tela Campanhas lista), o "N de 5
     passos" (o checklist "Comece por aqui" volta a aparecer na Início em toda largura) e o cartão do número
     (vira o chip da barra).
5. **Celular: barra volt de 52 px em cima, barra inferior fica.** O letreiro do celular vira volt (logo,
   nome da loja, ponto do número, sino). A barra inferior Início · Grupos · Postar · Contatos · Mais
   continua (spec Vitrine 3.2): é a zona do polegar e já tem contrato de e2e em toda rota. O artboard G2 do
   celular mostra ☰ e Postar em cima; não entra. Se o Igor preferir o ☰, é um PR à parte.
6. **Faixa G2.** A primeira célula é AO VIVO + hora + data. Depois Entraram (número, variação, faísca, "N na
   terça passada, mesma hora"), Saíram (número e variação pela mesma regra de comparação da Entraram:
   só depois de 7 dias medidos; antes, "medindo desde"), Cliques nos links (número de hoje; legenda "no
   total: VIP 263 · Saldão 48 · Brás 17", as três campanhas com mais cliques) e Pedidos anotados hoje (valor;
   "N pedidos · mês em X% da meta" + editar meta). No fim, "atualizado há N min" com o botão de atualizar.
   **Saldo sai da faixa**: ele aparece no gráfico ("214 entraram · 23 saíram"). No celular: uma linha de
   cabeçalho (AO VIVO · hora · data · "há N min") e quatro células roláveis com rótulo, número de 28 px e
   variação, sem legendas.
7. **Mapa G2.** Chips de filtro com a cor do estado (LOTOU em Acid, QUASE em aviso, ATIVO em cinza, SEM
   CONVITE com fio vermelho) e contagem. Cabeçalho: "58 grupos · 42.368 pessoas · +214 hoje" e o link "Todos
   os grupos". Por campanha: "40 grupos · 95% das vagas · +171 hoje" e "✓ abre o próximo sozinho" quando a
   regra está ligada. Célula de 40 px com o número e o "+N" de hoje, **sem o percentual** (o preenchimento
   diz, e o tooltip confirma). Depois da campanha maior, as outras ficam lado a lado numa grade de dez
   colunas (a segunda com seis, a terceira com três). Rodapé de alerta com o botão "Configurar convite" para
   o grupo sem convite.
8. **Postando agora G2.** A grade de 40 células por número sai; entra a barra de três segmentos (entregues ·
   enviando · na fila, mais "falhou" quando houver) com legenda, e o link "Ver em Disparos" leva à entrega
   por grupo. Prévia na bolha, "Pediram até agora: N" (regra 4 da F) e Próximos ficam.
9. **Relâmpago G2.** Placar com três números (Pediram · Vendeu · Esperando); a nota "Atendidas" sai. A fila
   mostra cinco linhas em volta da posição atual e a linha "N vendidas antes · mais N esperando · ver a fila
   inteira". O resto (em conversa, Pegar a próxima, Fechar oferta) fica.
10. **Gráfico:** igual à F; só muda o tema.
11. **Acid só em Postar, AO VIVO e LOTOU; zero `button`/`a` com `bg-acid` na Início** (regra 10 e
    `painel-vitrine-casca.spec.ts`). O Postar da barra usa a classe `pn-postar`, como o do celular.

## Dados

Nenhuma parte nova em `/api/painel/inicio`. A barra lê o que o corredor e a folha "Mais" já liam
(`/api/subscription`, `/api/instances/health`, as cinco rotas do resumo). Cliques por campanha somam
`TrackedLink.clicks` por `campaignName` (total, não de hoje: por isso a legenda diz "no total"). Sem DDL.

## PRs, na ordem

Cada um: TDD nas funções puras, os dois `tsc`, lint, `npm test`, CI verde, merge, verificação em produção
logado (1440 / 1100 / 390). Um PR por vez, a partir de `origin/main`.

| # | Entrega | Arquivos (aprox.) |
|---|---|---|
| 1 | Tema claro G2 e fontes da raiz; números em Manrope; `font-stretch` fora | `painel-vitrine.css`, `painel/layout.tsx`, `numeros.tsx`, `faixa-de-status.tsx`, 2 da campanha, 1 teste |
| 2 | Barra volt: `barra-de-cima.tsx`, `menu-mais.tsx`, hook do resumo; corredor e letreiro apagados; CSS; e2e da casca | ~12 |
| 3 | Faixa G2 (desktop e celular) | `faixa.ts` + teste, `faixa-de-status.tsx`, `numeros.tsx`, e2e |
| 4 | Mapa G2 | `mapa.ts` + teste, `mapa-dos-grupos.tsx`, `celula-do-grupo.tsx`, e2e |
| 5 | Postando e Relâmpago G2 | `postando-agora.tsx`, `relampago-ao-vivo.tsx`, libs, e2e |
| 6 | Verificação final em produção e card `no_ar_verificado` | — |

## Fora desta série

- Busca (não existe no produto). Seletor de loja. Menu ☰ no celular.
- Painéis de hover por módulo como no Bling (um painel "Mais" basta enquanto são 12 itens).

## Riscos

- **Volt dentro do tema:** no tema noite `bg-volt-950` virou botão claro. No claro volta a ser escuro. Os
  componentes nascidos na D e na F precisam ser olhados um a um no PR 1 (texto volt sobre fundo volt).
- **Contraste:** `#52646C` sobre `#F3F5F7` dá 5,5:1 e sobre `#E8EDF0` 4,9:1; nada de apoio mais claro.
- **Barra a 1024 px:** sete itens mais os controles. O PR 2 mede em 1024, 1100 e 1280 antes do merge.

## Verificação final

Card `painel-g2-barra-volt` em `no_ar_verificado` só depois do PR 5, com prova colhida na hora em produção:
barra volt com o item ativo, Mais aberto, Postar abrindo a folha, faixa e mapa nas três larguras, e um
post saindo ou o estado quieto.
