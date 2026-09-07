<!-- Copiado do scratchpad da sessao e8ae5df1 (research/direcao-d3.md) em 07/09/2026: a spec por tela (secao 12) que a spec principal 2026-09-07-painel-vitrine-aberta-design.md referencia. Onde os dois divergirem, vale a principal. -->

# Direção d3: VITRINE ABERTA

## 1. Nome e one-liner

**Vitrine Aberta.** O painel deixa de ser um sistema e vira a própria loja: o kit na etiqueta, a revendedora com nome e iniciais, o grupo enchendo na sua frente e a mensagem exatamente como ela chega no celular de quem compra.

## 2. Tese

O lojista de atacado não quer "administrar um SaaS". Ele quer ver a loja funcionando: quem chegou, o que está na vitrine, quanto entrou no caixa. Hoje o painel mostra isso em cards brancos iguais com rótulos cinza de 10px, o esqueleto de qualquer admin. A Vitrine Aberta troca a gramática: campanha vira etiqueta de preço com furo e canto cortado, contato vira ficha de revendedora com avatar de iniciais, disparo vira post mostrado numa bolha de WhatsApp real, grupo vira caixa numa prateleira que enche de gente. Verde Zap só aparece onde tem pessoa. Cobalt só onde tem ação. Acid só na etiqueta que grita "AO VIVO" ou "LOTOU". O resultado é calor de comércio brasileiro sobre a disciplina tipográfica da marca: nada de gradiente, nada de vidro, nada de grid de três.

## 3. Por que o lojista vai querer (ao ver no vídeo)

- Ele se reconhece em 2 segundos: "Mega Stock Atacado" escrito no letreiro em cima, o número dele com o ponto verde respirando, "Josiane Moura entrou no #109 · há 2 min" passando. É a loja dele, não um template.
- Ele vê o que nenhum concorrente mostra: a mensagem que ele digitou aparece na bolha verde-clara com o duplo check, do jeito que a revendedora vê. Não tem "formulário de disparo", tem o post pronto.
- Ele vê o grupo lotar: a caixa do "Mega stock atacado infantil #2" enche de verde até 1.012, vira Volt com a etiqueta Acid "LOTOU" e um aviso já aponta o próximo grupo. É satisfação física, como ver a arara esvaziar.
- Ele vê dinheiro: "R$ 8.079,90" em Plex Mono 48px numa fita métrica que mede a meta de R$ 50.000. Fita métrica é ferramenta de quem vende roupa; a metáfora é dele.
- Ele vê gente com nome: Ana Paula Ferreira, Kelly Cristina, Tatiane Rocha, com de onde vieram (LEVA LEVA KIDS ATACADO). Contato deixa de ser linha de tabela e vira cliente.

## 4. Paleta

| Papel na loja | Cor | Hex | Uso exato |
|---|---|---|---|
| Letreiro e texto | Volt | #071923 | Faixa superior de 64px em toda tela, fundo do login, todo título e número |
| Papel de etiqueta | Paper | #FFFEFA | Fundo de etiqueta, ficha, cartão do número, card de login |
| Piso da loja | Canvas | #F4F0E7 | Fundo do conteúdo, trilha de barra, avatar de iniciais |
| Fio de romaneio | Line | #D8D7CF | Bordas de 1px, separadores, texto secundário sobre Volt |
| Assinatura | Acid | #A7FF2F | Etiqueta "AO VIVO" e "LOTOU" (máximo 2 por tela), avatar do dono, marca |
| Ação | Cobalt | #2E66FF | Todo botão primário, todo link, anel de foco |
| Gente | Zap | #25D366 | Ponto do ticker, anel do avatar de quem entrou há menos de 24h, preenchimento das caixas de grupo |
| Apoio | Slate | #52646C | Texto de apoio, nunca abaixo de 12px |

Estados: Success #0C7346 (ponto do número conectado), Warning #7A4A00 sobre #FFF6E5 (grupo quase cheio), Danger #B82936 (desconectado, "Desconectar").

Duas cores fora da marca, usadas só dentro do componente "prova de conversa" (declaradas na seção 13): fundo de chat #EFE7DD e bolha enviada #E7FFDB.

## 5. Tipografia

- **Manrope** é o letreiro e a etiqueta. Nome de campanha e de kit em Manrope 800, caixa alta, tracking -0,5px, nos tamanhos 20 (etiqueta), 32 (etiqueta em destaque), 48 (headline do login). Título de tela em Manrope 700 28px, tracking -0,4px. Nome da loja no letreiro em Manrope 700 16px.
- **IBM Plex Sans** é a conversa. Corpo 15px/22px, nome de revendedora 15px 600, texto da bolha 14px/20px, label de campo 13px 600, apoio 13px Slate. Piso absoluto: 12px.
- **IBM Plex Mono** é o romaneio. Todo número, hora, telefone, link, cota e contagem, sempre `font-variant-numeric: tabular-nums`. Tamanhos: 48 (caixa), 40 (pessoas nos grupos), 32 (número no cartão), 15 (lotação na ficha), 13 (ticker, link, hora), 12 (meta, origem, cabeçalho de grupo de menu). Rótulos em mono ficam em 12px, Slate #52646C sólido, tracking +0,4px, nunca caixa alta em bloco de card; caixa alta só em cabeçalho de grupo do menu e em chip.
- Some o itálico "editorial" atual (não é família da marca). A voz vem do conteúdo (nomes reais, horas, números), não de uma serifa.

## 6. Layout desktop

Base 1280 a 1568px. Três zonas, sempre as mesmas:

1. **Letreiro** (`pn-letreiro`): faixa superior de 64px, largura total, Volt #071923. Esquerda: símbolo Girumo em Paper 24px, "Mega Stock Atacado" Manrope 700 16px Paper. Centro: ticker de entradas em Plex Mono 13px Line #D8D7CF com ponto Zap 8px à esquerda ("Josiane Moura entrou no Mega Stock Atacado #109 · há 2 min"). Direita: chip do número "+55 62 9819•1314" em Plex Mono 13px Paper com ponto Success 8px que respira, sino 20px Paper, avatar "IT" 32px Volt sobre Acid. É a única peça escura de toda tela do painel.
2. **Corredor** (sidebar): 224px, Paper #FFFEFA, borda direita 1px Line. Itens de 40px, Plex Sans 14px 500 Volt, ícone lucide 18px sem caixa. Ativo: barra esquerda 3px Acid + fundo Canvas. Três grupos com cabeçalho Plex Mono 12px Slate caixa alta: VENDER (Disparos, Oferta Relâmpago, Automações), LOTAR (Campanhas, Páginas, Indicação), LOJA (Início, Grupos, Contatos, Resultados). Rodapé: Seu número, Configurações, e o romaneio do plano em Plex Mono 12px Slate: "GROWTH · renova 04/10 · 1 de 2 celulares". Checklist dos 30 dias vira uma linha "7 de 8 passos" com barra 4px Cobalt logo acima do romaneio, some em 8/8.
3. **Balcão** (conteúdo): Canvas #F4F0E7, padding 32px, grid de 12 colunas com gutter 24px, `max-width: 1200px`, alinhado à esquerda (não centralizado). Em 1568px sobram 88px à direita, nunca 40%.

Superfícies do balcão: etiqueta e ficha em Paper com borda 1px Line e raio 8px; sem sombra levitando, sem hover que sobe. Hover em ficha: fundo Paper vira #FBF9F3. Raios: 4 (chip), 8 (etiqueta, ficha, botão, input), 12 (só o card do login). Nenhum 16.

## 7. Layout mobile

Base 390px, uma mão só.

- **Letreiro** 56px: símbolo Girumo 22px + "Mega Stock Atacado" Manrope 700 15px + ponto do número 8px (respira conectado, parado desconectado). Sino à direita. O ticker some do letreiro e vira a primeira linha do conteúdo.
- **Conteúdo** com padding 16px, cards de largura total, gutter 12px entre eles.
- **Ação principal** fixa a 12px acima da barra: botão Cobalt 52px, largura `calc(100% - 32px)`, Manrope 600 16px Paper. Início: "Postar novidade". Grupos: "Sincronizar". Contatos: nenhum (leitura). Configurações: nenhum.
- **Barra inferior** 56px + `env(safe-area-inset-bottom)`, Paper com borda superior 1px Line (não Volt: a loja é clara por dentro). Cinco destinos: Início, Grupos, Contatos, Campanhas, Mais. Ícone 24px, label Plex Sans 12px, ativo em Volt com barra superior 3px Acid. Disparos, Relâmpago e Automações ficam no "Mais" e no botão fixo.
- **Ficha** de 64px: nome à esquerda, número mono à direita, barra de 3px embaixo. Toque abre bottom sheet (detentes 40%/90%, handle 32x4 Slate, botão "Fechar" em texto).
- Inputs 48px com `font-size: 16px`.

## 8. Modelo de navegação

- Lugares da loja, não módulos de software. Os rótulos das rotas não mudam (o lojista já aprendeu "Campanhas"), mas o menu agrupa por verbo: VENDER, LOTAR, LOJA. Quem abre o painel pela primeira vez entende que Disparos e Relâmpago vendem, Campanhas e Páginas lotam, Grupos e Contatos são o estoque e a clientela.
- O letreiro responde "a loja está aberta?" antes de qualquer clique: ponto do número respirando = aberta; parado e Danger = fechada, com o ticker trocado por "Número desconectado. Suas campanhas não estão saindo." em Line, clicável para /painel/conectar.
- Ticker é navegação: clicar no nome abre a ficha da revendedora em Contatos; clicar no grupo abre a ficha do grupo.
- Sino vira "campainha": lista de entradas e alertas em fichas de revendedora, não em cards com sino repetido.
- Transição entre telas: fade 90ms de saída, conteúdo entra com 8px de subida em 240ms, a barra Acid do menu desliza 180ms entre itens (View Transitions, sem re-mount).
- Busca por atalho (`pn-palette`) continua, com a palavra "Buscar na loja" no placeholder.

## 9. Componentes-assinatura

### 9.1 Etiqueta de preço (`pn-etiqueta-preco`)
Campanha, oferta e página são etiquetas de peça. Paper #FFFEFA, borda 1px Line, raio 8px, canto superior direito cortado 14px (reaproveita o `clip-path` de `.pn-etiqueta`), furo de 10px à esquerda (círculo Canvas com borda 1px Line, centrado a 16px da borda). Padding 16px 20px 16px 36px. Nome em Manrope 800 20px caixa alta Volt; link em Plex Mono 13px Cobalt logo abaixo ("app.girumo.com.br/r/reativacao-setembro" com botão "Copiar" de 32px); linha de vagas: barra 6px trilha Line, preenchimento Volt, com "475 / 2.048 vagas" em Plex Mono 15px à direita e "23%" em Plex Mono 13 Slate; estado como chip 24px Plex Mono 12 caixa alta: PRONTA (Volt sobre Canvas), AO VIVO ou LOTOU (Volt sobre Acid, o único uso de Acid em superfície). Altura mínima 96px. Nunca em grid de 3: sempre lista vertical, a maior lotação em cima.

### 9.2 Ficha de revendedora (`pn-ficha`)
Linha de 64px, Paper, borda inferior 1px Line (sem card em volta). Avatar 40px circular, Canvas #F4F0E7 com iniciais em Manrope 700 14px Volt ("JM"); quem entrou há menos de 24h ganha anel 2px Zap #25D366. Nome Plex Sans 15px 600 Volt; abaixo, origem em Plex Mono 12px Slate ("veio pelo Mega Stock Atacado #109"). Direita: "há 2 dias" Plex Mono 12 Slate, depois dois botões de 36px: "Conversar" (texto Volt, borda Line, ícone `message-circle` 16px, abre wa.me) e "Registrar pedido" (texto Cobalt, sem borda). Telefone só na ficha aberta, mascarado "(62) 9 ....-1314".

### 9.3 Prova de conversa (`pn-bolha`)
Reprodução fiel de como a mensagem chega. Fundo de chat #EFE7DD com raio 8px e padding 16px; dentro, bolha #E7FFDB com raio 8px (canto inferior direito 2px, rabinho de 8px em SVG), largura máxima 320px, texto Plex Sans 14px/20px Volt, hora Plex Mono 11px Slate no canto inferior direito seguida do duplo check em SVG 14px Cobalt. Acima da bolha, nome do grupo em Plex Sans 12px 600 Slate como cabeçalho de chat ("Mega Stock Atacado #109"). Aparece no compositor de Disparos (prévia ao vivo à direita do textarea), no histórico (a mensagem que saiu), em Automações (o que vai ser postado quando ligar) e no Início (último post). Sem emoji, sem logo do WhatsApp.

### 9.4 Prateleira de grupos (`pn-prateleira`)
Os 91 grupos como caixas numa estante. Grade de 13 colunas por 7 linhas, caixa 40x40px, gap 4px, raio 4px, fundo Canvas com borda 1px Line. O preenchimento sobe de baixo para cima em Zap #25D366 na proporção da lotação (578/1.024 = 56% da altura). Caixa cheia (≥ 1.024): fundo Volt, borda Volt, filete superior 3px Acid. Quase cheia (≥ 95%): borda Warning #7A4A00. Hover: tooltip Paper com "Mega Stock Atacado #109 · 578 / 1.024". Quando o webhook registra entrada, a caixa pulsa `scale(1.06)` em 240ms `--ease-girumo`. No mobile a caixa tem 22px e a grade cabe em 13 colunas de 390px. É a versão em miniatura de toda a operação: uma olhada e o lojista sabe onde tem vaga.

### 9.5 Fita métrica do caixa (`pn-fita`)
A meta do mês como fita de costureira. Barra de 12px, trilha Line #D8D7CF, marcas de 1px Volt a cada R$ 5.000 (9 marcas até 50.000) com o número em Plex Mono 11px Slate embaixo a cada R$ 10.000; preenchimento Acid #A7FF2F até o valor atual (R$ 8.079,90 = 16%), com um cursor Volt 2px na ponta. Texto acima: "R$ 8.079,90" Plex Mono 48px Volt e "de R$ 50.000 · faltam 26 dias" Plex Mono 13 Slate. Quando um pedido é registrado, o número sobe em count-up de 600ms e a fita avança em `scaleX` 280ms.

### 9.6 Letreiro (`pn-letreiro`)
Descrito no layout: a faixa Volt de 64px que carrega nome da loja, ticker, número e sino. É a única peça escura e a única superfície com o Volt como fundo dentro do painel. Sem gradiente, sem textura, sem grade.

## 10. Motion

Curva única `--ease-girumo: cubic-bezier(0.22,1,0.36,1)`; durações 90/180/240/280/600ms; só `transform` e `opacity`.

- Ticker: linha nova entra de `translateY(12px)` + opacity 0 em 240ms, a anterior sai por cima em 180ms. Uma troca a cada entrada real; sem loop falso.
- Caixa de grupo: pulso `scale(1.06)` 240ms quando entra gente; ao cruzar 1.024 a caixa vira Volt em 180ms e a etiqueta LOTOU aparece com um pulso de opacity de 180ms.
- Bolha: nasce de `scale(0.96)` com `transform-origin: bottom left` (o rabinho) em 240ms, a cada tecla do compositor só o texto muda, sem re-animar.
- Caixa: count-up 600ms em Plex Mono tabular; fita avança com `scaleX` 280ms, `transform-origin: left`.
- Ficha: lista entra com stagger de 40ms, máximo 8 itens; hover só troca fundo, sem levantar.
- Botão: `scale(0.97)` em 160ms no `:active`.
- Número conectado: ponto respira 2,4s opacity 0,6 a 1; desconectado parado. Alarme é ausência de movimento.
- Nunca anima: filtros, hover de ficha, abrir grupo, qualquer coisa repetida dezenas de vezes por dia. Skeleton `pn-skeleton` respira no máximo 600ms.
- `prefers-reduced-motion`: tudo vira 0ms, o ponto conectado vira estático em Success.

## 11. Money shots

1. **O grupo lota.** Tela de Grupos: a caixa do "Mega stock atacado infantil #2" enche de Zap até 1.012, mais dois pulsos, vira Volt com filete Acid, a etiqueta LOTOU aparece na ficha e um aviso Warning diz "Mega stock atacado infantil #2 lotou. Mande o link do #109 (578 / 1.024)". 4 segundos, sem narração.
2. **O post na bolha.** Disparos: o lojista digita "BOTA FORA de setembro começou. Kit infantil 50 peças, vagas limitadas. Chama no privado." e a bolha verde-clara à direita escreve junto, com "12:12" e o duplo check. Abaixo: "Vai pra 13 grupos · 9.736 pessoas veem". Clica "Postar em 13 grupos". No histórico aparecem 13 quadradinhos enchendo um a um.
3. **Quem chegou.** Início: fichas de Josiane Moura, Kelly Cristina, Ana Paula Ferreira, Tatiane Rocha entrando com stagger, anel Zap nas duas de quarta. O ticker do letreiro troca para "Kelly Cristina entrou no LEVA LEVA KIDS ATACADO · agora".
4. **O caixa sobe.** Contatos: ao registrar R$ 149,90 no pedido da Josiane, a fita métrica do rodapé avança e "R$ 8.079,90" conta até "R$ 8.229,80".
5. **A oferta ao vivo.** Oferta Relâmpago: etiqueta "NOVO KIT · 5 peças" com chip Acid "AO VIVO · fecha em 4:12", palavra-chave "eu quero" em Plex Mono dentro de uma caixinha Canvas, e a fila "1ª Kelly Cristina 12:03:41 · 2ª Luciene Barbosa 12:03:58" crescendo por baixo.

## 12. SPEC DAS TELAS

Convenções: medidas em px; "Mono" = IBM Plex Mono tabular; "Sans" = IBM Plex Sans; "Manrope" = Manrope. Toda cor por hex. Dados reais do brief.

### 12.1 Login, desktop 1280x800

Fundo inteiro Volt #071923. Duas colunas: esquerda 742px (a rua, a vitrine), direita 538px (a porta acesa).

**Bloco A, marca (esquerda, topo).** Logo Girumo monocromático Paper #FFFEFA, 28px de altura, em x=64 y=48.

**Bloco B, headline (esquerda).** A partir de y=176, largura 520px: "Seus grupos rodando." em Manrope 800 48px/52px Paper, tracking -1,5px; linha seguinte "Você vendendo." igual. Abaixo, 16px de respiro, Sans 16px/24px Line #D8D7CF: "O painel da Mega Stock Atacado: 91 grupos, 9.736 pessoas, um número só."

**Bloco C, etiqueta real (esquerda).** A partir de y=352, uma `pn-etiqueta-preco` de 440x120 sobre o Volt (Paper, borda Line, furo à esquerda, canto cortado): "REATIVAÇÃO SETEMBRO" Manrope 800 20 Volt; "app.girumo.com.br/r/reativacao-setembro" Mono 13 Cobalt #2E66FF; barra 6px trilha Line com 23% em Volt; "475 / 2.048 vagas" Mono 15 Volt à direita; chip "PRONTA" Mono 12 Volt sobre Canvas no canto superior direito antes do corte. É um recorte real do painel, não ilustração.

**Bloco D, ticker (esquerda).** A partir de y=504, três linhas de 28px, Mono 13 Line #D8D7CF, ponto Zap #25D366 8px à esquerda de cada uma:
"Josiane Moura entrou no Mega Stock Atacado #109 · qua 14:20"
"Kelly Cristina entrou no LEVA LEVA KIDS ATACADO · qua 14:02"
"Ana Paula Ferreira entrou no Mega Stock Atacado #109 · seg 11:48"

**Bloco E, rodapé (esquerda).** y=744: "Mega Stock Atacado · Goiânia · moda infantil" Mono 12 Slate #52646C. Sem retângulo decorativo solto.

**Bloco F, card de entrada (direita).** Card Paper #FFFEFA 420px de largura, centrado verticalmente (topo em y=160), raio 12px, canto superior direito cortado 16px, padding 32px, sem sombra. Conteúdo, de cima para baixo:
- "Entrar" Manrope 700 24px Volt.
- "Use o e-mail da sua conta." Sans 14 Slate, 8px abaixo.
- 24px de respiro. Label "E-mail" Sans 13 600 Volt; input 48px, fundo Canvas #F4F0E7, borda 1px Line, raio 8, texto Sans 16 Volt, placeholder "voce@loja.com.br" Slate; foco: borda 2px Cobalt.
- 16px. Label "Senha" + link "Esqueci a senha" Sans 13 Cobalt à direita na mesma linha, alvo de 44px. Input igual, com botão "Mostrar" em texto 13 Slate dentro.
- 24px. Botão "Entrar" 48px, largura total, fundo Cobalt #2E66FF, texto Manrope 600 16 Paper, raio 8. Hover: #1947C9. Foco: anel 2px Cobalt com offset 2px.
- 12px. Botão "Entrar com Google" 48px, largura total, fundo Paper, borda 1px Line, texto Sans 15 Volt, ícone G 18px à esquerda.
- 24px. "Ainda não tem conta? Criar conta" Sans 14 Slate com "Criar conta" em Cobalt.
- 16px. "Seus dados ficam só na sua loja. Política de privacidade." Sans 12 Slate, uma linha só.

**Erro:** caixa 44px, fundo #FBEAEC, borda esquerda 3px Danger #B82936, Sans 14 Volt, `role="alert"`, entre o campo de senha e o botão.

### 12.2 Login, mobile 390x844

Fundo Volt. Topo: logo Paper 22px em x=16 y=20. y=72: "Seus grupos rodando. Você vendendo." Manrope 800 30px/34px Paper, largura 358. y=160: uma linha de ticker Mono 12 Line com ponto Zap: "Josiane Moura entrou no #109 · qua 14:20" (truncada com reticências se passar). A partir de y=208 até a base: card Paper com raio 16 só nos cantos superiores (folha que sobe da base), padding 24px, mesma ordem do desktop: "Entrar" Manrope 700 22; campos 48px com `font-size: 16px`; botão Cobalt 52px; Google 48px; "Criar conta" 14; privacidade 12. Sobra de 24px na base mais `env(safe-area-inset-bottom)`. Nada some no celular: a promessa e o ticker ficam.

### 12.3 Início, desktop

Letreiro e corredor como na seção 6. O item ativo do corredor é "Início". Ticker do letreiro: "Kelly Cristina entrou no LEVA LEVA KIDS ATACADO · qua 14:02".

**Bloco 1, cabeçalho do dia (12 colunas, altura 56).** Esquerda: "Sexta, 04 de setembro" Manrope 700 28 Volt, tracking -0,4px; abaixo em Sans 14 Slate: "0 entradas hoje · 4 na semana · último post qua 12:12". Direita: botão "Postar novidade" 44px, Cobalt, Manrope 600 15 Paper, ícone `send` 16 à esquerda; ao lado, botão "Sincronizar grupos" 44px, Paper, borda Line, Sans 14 Volt.

**Bloco 2, caixa (colunas 1 a 7).** Card Paper, borda Line, raio 8, padding 24. "Vendido em setembro" Sans 13 Slate. "R$ 8.079,90" Mono 48 Volt, tracking -1px. Linha Sans 14 Slate: "5 pedidos · quem mais vendeu: Mega Stock Atacado #109". 16px. `pn-fita`: trilha 12px Line, marcas a cada R$ 5.000, números "R$ 10 mil", "20", "30", "40", "50 mil" Mono 11 Slate embaixo, preenchimento Acid até 16% com cursor Volt 2px. Abaixo: "de R$ 50.000 · faltam 26 dias" Mono 13 Slate à esquerda; "Editar meta" Sans 13 Cobalt à direita.

**Bloco 3, quem chegou (colunas 8 a 12).** Card Paper, padding 0, cabeçalho 48px com padding 16: "Quem chegou" Manrope 700 16 Volt à esquerda, "+4 esta semana" Mono 13 Volt com ponto Zap 8px à direita. Quatro `pn-ficha` de 56px (avatar 32):
- "JM" Josiane Moura · veio pelo Mega Stock Atacado #109 · "qua 14:20" · anel Zap
- "KC" Kelly Cristina · veio pelo LEVA LEVA KIDS ATACADO · "qua 14:02" · anel Zap
- "AF" Ana Paula Ferreira · veio pelo Mega Stock Atacado #109 · "seg 11:48"
- "TR" Tatiane Rocha · veio pelo CASTING KIDS & ADULTOS · "seg 09:31"
Rodapé 40px: "Ver os 21 contatos" Sans 13 Cobalt.

**Bloco 4, na vitrine agora (colunas 1 a 7).** Título de seção "Na vitrine agora" Manrope 700 16 Volt com "01" Mono 12 Slate à esquerda (numeração editorial mantida, só aqui e nos blocos 5 e 6). Uma `pn-etiqueta-preco` de 128px de altura: "NOVO KIT" Manrope 800 32 Volt; "5 peças · palavra-chave" Sans 14 Slate seguido de "eu quero" Mono 14 Volt dentro de caixinha Canvas 28px com borda Line; chip "AO VIVO · fecha em 4:12" Mono 12 Volt sobre Acid #A7FF2F no canto superior direito (o Acid desta tela); abaixo, a fila em Mono 13 Volt: "1ª Kelly Cristina 12:03:41", "2ª Luciene Barbosa 12:03:58"; link "Abrir a oferta" Sans 13 Cobalt. Abaixo dela, duas etiquetas de 72px, fechadas, em Canvas em vez de Paper: "KIT DUDUKA · 5 peças · fechada" e "KIT INFANTIL 50 PEÇAS · 5 peças · fechada", Manrope 800 16 Slate, chip "FECHADA" Mono 12 Slate sobre Line.

**Bloco 5, último post (colunas 8 a 12).** Título "Último post" Manrope 700 16 com "02". Uma `pn-bolha`: cabeçalho "BOTA FORA · 13 grupos" Sans 12 600 Slate; fundo #EFE7DD; bolha #E7FFDB com o texto "BOTA FORA de setembro começou. Kit infantil 50 peças, vagas limitadas. Chama no privado." Sans 14/20 Volt; "12:12" Mono 11 Slate + duplo check Cobalt. Abaixo do fundo, linha Mono 13 Volt: "qua 02/09 12:12 · 13 / 13 grupos" com 13 quadradinhos 8px Volt, gap 3px, à direita. Link "Ver disparos" Sans 13 Cobalt.

**Bloco 6, estoque de grupos (colunas 1 a 12).** Título "Estoque de grupos" Manrope 700 16 com "03"; à direita "91 grupos · 9.736 pessoas · 82.448 vagas" Mono 13 Slate. Faixa de 56px: `pn-prateleira` em miniatura (caixas 14px, gap 2px, 13x7, preenchimento Zap proporcional, cheio em Volt com filete Acid 1px). À direita da faixa, largura 360px, aviso `pn-etiqueta` Warning: fundo #FFF6E5, borda esquerda 3px #7A4A00, Sans 14 Volt: "Mega stock atacado infantil #2 está com 1.012 / 1.024." e botão "Mandar o link do #109" Sans 13 Cobalt embaixo.

**Bloco 7, campanhas (colunas 1 a 7).** Título "Campanhas" Manrope 700 16 com "04"; três etiquetas de 88px em lista, ordenadas por lotação:
- REATIVAÇÃO SETEMBRO · /r/reativacao-setembro · barra 23% · "475 / 2.048 vagas" · "4 cliques" Mono 13 Slate · chip PRONTA
- BOTA FORA · /r/bota-fora · barra 0,1% (piso 2%) · "15 / 13.312 vagas" · "7 cliques" · chip PRONTA
- NOVIDADE AGOSTO · /r/novidade-agosto · barra piso · "4 / 2.048 vagas" · "1 clique" · chip PRONTA
Link "Todas as campanhas" Sans 13 Cobalt.

**Bloco 8, automações (colunas 8 a 12).** Título "Automações" Manrope 700 16 com "05". Três linhas de 64px, Paper, borda inferior Line, switch 48x28 à esquerda (Volt ligado, Line desligado, bolinha Paper), nome Sans 15 600 Volt, frase Sans 13 Slate:
- Boas-vindas no grupo · "Quem entra recebe boas-vindas · rodou 6 vezes"
- Grupo lotou · "Quando lota, avisa e manda o próximo link · rodou 2 vezes"
- Novidade da semana · "Toda semana posta a novidade nos 91 grupos"
Desligada não fica apagada: texto Slate sólido.

O checklist "Seus primeiros 30 dias" sai da Início e vive no rodapé do corredor ("7 de 8 passos").

### 12.4 Início, mobile 390

Letreiro 56 (símbolo + "Mega Stock Atacado" + ponto). Padding 16. Ordem:
1. Linha de ticker 32px: ponto Zap + "Kelly Cristina entrou no LEVA LEVA KIDS · qua 14:02" Mono 12 Slate.
2. "Sex, 04 de setembro" Manrope 700 22 Volt; "0 hoje · 4 na semana" Sans 13 Slate.
3. Card caixa, largura total, padding 20: "Vendido em setembro" Sans 12 Slate; "R$ 8.079,90" Mono 40 Volt; fita 10px com marcas a cada R$ 10.000; "de R$ 50.000 · faltam 26 dias" Mono 12 Slate; "5 pedidos" Sans 13.
4. Quem chegou: cabeçalho 44px "Quem chegou" Manrope 700 15 + "+4" Mono 13 com ponto Zap; três fichas de 56px (Josiane, Kelly, Ana Paula); "Ver 21 contatos" 44px Cobalt.
5. Etiqueta NOVO KIT, 112px: nome Manrope 800 24, chip AO VIVO Acid, "eu quero" em caixinha, fila com 2 nomes Mono 12.
6. Prateleira em faixa: caixas 22px, 13 colunas, 7 linhas (grade 310x178), seguida do aviso Warning em 64px com o botão "Mandar o link do #109".
7. Campanhas: três etiquetas de 80px.
8. Automações: três linhas de 56px com switch 44x26.
9. Padding final 88px (52 do botão + 12 + 24).

Botão fixo "Postar novidade" 52px Cobalt a 12px da barra. Barra inferior Paper: Início (ativo, barra Acid), Grupos, Contatos, Campanhas, Mais.

### 12.5 Grupos, desktop

Item ativo do corredor: "Grupos". Ticker do letreiro segue vivo.

**Bloco 1, cabeçalho (12 colunas).** "Grupos" Manrope 700 28 Volt; Sans 14 Slate: "91 grupos do seu número. Contagem conferida há 2 h pelo próprio WhatsApp." Direita: "Sincronizar" 44px Paper borda Line Sans 14 Volt; "Ações em massa" 44px Paper borda Line.

**Bloco 2, prateleira (colunas 1 a 8).** Card Paper, padding 24. `pn-prateleira` completa: 13 colunas x 7 linhas, caixa 40, gap 4 (568x304). Ordem: por número do grupo. Caixas com preenchimento Zap: #109 56%, infantil #1 49%, #103 49%, #102 48%, #101 48%, #100 45%, #104 44%, os demais conforme dado. Infantil #2: Volt com filete Acid 3px (o Acid desta tela). Legenda embaixo em Mono 12 Slate: quadrado Zap "gente", quadrado Volt com filete Acid "lotou", contorno Warning "quase". Hover: tooltip Paper, borda Line, "Mega Stock Atacado #109 · 578 / 1.024".

**Bloco 3, totais (colunas 9 a 12).** Sem card, texto direto no Canvas: "9.736" Mono 40 Volt; "pessoas nos 91 grupos" Sans 14 Slate; 16px; "82.448 vagas livres" Mono 20 Volt; "1 lotou · 0 sem convite · 90 ativos" Mono 13 Slate; 24px; aviso Warning `pn-etiqueta`: fundo #FFF6E5, borda esquerda 3px #7A4A00: "Mega stock atacado infantil #2 · 1.012 / 1.024. Faltam 12." Sans 14 Volt; botão "Mandar o link do #109" 40px Cobalt Manrope 600 14 Paper.

**Bloco 4, filtros (12 colunas, 48px).** Segmentado à esquerda, itens 40px Sans 14: "Todos 91" (ativo, Volt sobre Paper com texto Paper), "Ativos 90", "Cheios 1", "Sem convite 0"; contagens em Mono. Busca à direita 280x40, ícone `search`, placeholder "Buscar grupo". Ordenar: "Mais cheio primeiro" Sans 13 Cobalt.

**Bloco 5, lista (12 colunas).** Fichas de 64px, Paper, borda inferior Line, sem card externo. Colunas: nome 320px (Sans 15 600 Volt; abaixo Mono 12 Slate "conferido há 2 h"; se não admin, chip "não admin" Mono 12 Slate sobre Line); barra flexível (trilha Line 6px, preenchimento Volt; ≥ 95%: ponta 2px Acid); lotação 120px "1.012 / 1.024" Mono 15 Volt à direita; estado 96px (chip 24px: "ATIVO" Mono 12 Volt sobre Canvas; "CHEIO" Mono 12 Volt sobre Acid, este é o segundo Acid permitido); ações 220px: "Copiar convite" 36px Paper borda Line Sans 13 Volt (nunca a URL), "Campanha" Sans 13 Cobalt, kebab 36px "Configurar". Primeiras oito linhas:
1. Mega stock atacado infantil #2 · 1.012 / 1.024 · CHEIO
2. Mega Stock Atacado #109 · 578 / 1.024 · ATIVO
3. Mega stock atacado infantil #1 · 500 / 1.024 · ATIVO
4. Mega Stock Atacado #103 · 499 / 1.024 · ATIVO
5. Mega Stock Atacado #102 · 490 / 1.024 · ATIVO
6. Mega Stock Atacado #101 · 488 / 1.024 · ATIVO
7. Mega Stock Atacado #100 · 462 / 1.024 · ATIVO
8. Mega Stock Atacado #104 · 449 / 1.024 · ATIVO
Configurar abre inline na ficha (mantém o editor atual), sem modal. Entrada da lista com stagger 40ms nas 8 primeiras.

### 12.6 Configurações, desktop

Item ativo do corredor: "Configurações".

**Bloco 1, cabeçalho.** "Configurações" Manrope 700 28 Volt. Sem slogan.

**Bloco 2, portas (coluna esquerda, 200px).** Cinco itens de 44px Sans 14 Volt: Conexão, Equipe, Notificações, Plano, Conta. Ativo: barra esquerda 3px Acid + Canvas escurecido #ECE7DC. Abaixo de cada item, Mono 12 Slate com o dado: "Conexão · conectado", "Equipe · 2 pessoas", "Notificações · 3 ligadas", "Plano · GROWTH", "Conta · Igor Toledo".

**Bloco 3, conteúdo (colunas 4 a 12 do grid, à direita das portas, largura 880).**

Aba **Conexão**: cartão do número, Paper, padding 32, raio 8, borda Line. Linha 1: "+55 62 9819•1314" Mono 32 Volt com ponto Success 10px respirando à esquerda; à direita "Conectado" Sans 14 #0C7346. Linha 2: "Número veterano · 1 de 4 aparelhos · celular apareceu há 3 dias" Sans 14 Slate. 24px. Linha do tempo em três fichas de 48px com régua vertical 1px Line à esquerda e hora em Mono 13 numa coluna de 88px:
- "qua 02/09 12:12" · "Último post: BOTA FORA, 13 / 13 grupos"
- "hoje" · "0 / 465 mensagens · teto 93 por hora · 0 falhas em 24 h" com barra 6px Line vazia
- "até 18/09" · "O celular precisa aparecer de novo (regra dos 14 dias)"
Rodapé do cartão: "Gerenciar conexão" 40px Paper borda Line Sans 14 Volt; "Desconectar" texto Sans 14 Danger #B82936, alvo 40px. Abaixo do cartão, Sans 13 Slate: "Os dados dos seus grupos ficam só na sua conta (LGPD)."

Aba **Equipe**: duas fichas de 64px: avatar 40 "IT" Volt sobre Acid, "Igor Toledo" Sans 15 600, "Dono · você" Mono 12 Slate; avatar "V" Volt sobre Canvas, "Vanessa" Sans 15 600, "Atendimento" Mono 12 Slate, lixeira 40px à direita. Botão "Convidar pessoa" 44px Cobalt. Papéis sempre em português; "owner" e "operator" nunca aparecem.

Aba **Notificações**: três linhas de 56px com switch 48x28 (Volt ligado): "Grupo lotou", "Número desconectou", "Pedido registrado", cada uma com frase Sans 13 Slate do que dispara.

Aba **Plano**: uma `pn-etiqueta-preco` de 160px: "GROWTH" Manrope 800 32 Volt; chip "ATIVA" Mono 12 Volt sobre Canvas; "Renova em 04/10" Mono 13 Slate; linha Sans 14: "1 de 2 celulares · 91 grupos sincronizados · 21 contatos"; botões "Trocar de plano" 40px Paper borda Line e "Cancelar assinatura" texto Sans 13 Slate (visível, sem "Portal Stripe"). Abaixo, outros planos como linhas de romaneio 48px, Mono 13: nome do plano à esquerda, "ver o que libera" Cobalt à direita. Sem preço inventado.

Aba **Conta**: campos Nome, E-mail, Senha em coluna, input 48px Canvas; um único botão "Salvar" 44px Cobalt no rodapé, ativo só quando algo mudou.

### 12.7 Configurações, mobile 390

Letreiro 56. "Configurações" Manrope 700 22. Portas viram segmentado horizontal de 40px com scroll, cinco chips visíveis por rótulo curto: "Conexão", "Equipe", "Avisos", "Plano", "Conta" (Sans 13; ativo Volt sobre Paper com texto Paper). Todos cabem em 358px sem cortar.

Conexão: cartão com "+55 62 9819•1314" Mono 26 Volt e ponto respirando; "Conectado · veterano" Sans 13; linha do tempo com coluna de hora de 72px; botões empilhados 48px ("Gerenciar conexão" Paper borda Line; "Desconectar" texto Danger). Equipe: fichas 64px; "Convidar" 48px Cobalt no fim. Plano: etiqueta 136px com "GROWTH" Manrope 800 26. Conta: campos 48px, "Salvar" 52px fixo acima da barra só nesta aba. Sem botão fixo nas demais.

## 13. Desvios de marca

1. **Cores do WhatsApp dentro da "prova de conversa".** Fundo de chat #EFE7DD e bolha enviada #E7FFDB não estão na paleta Girumo. Uso restrito ao componente `pn-bolha` (prévia do disparo, histórico, automação, último post). Justificativa: o ângulo inteiro depende de mostrar a mensagem como ela chega; uma bolha em Canvas/Paper vira "card de citação" e perde a prova. Sem logo do WhatsApp, sem verde Zap na bolha: Zap continua reservado a gente.

Nenhum outro desvio: Volt/Acid/Paper/Canvas/Cobalt/Zap intactos, Manrope + Plex Sans + Plex Mono, zero gradiente, zero glass, zero textura, zero roxo. O corredor claro em vez da sidebar escura é mudança do design system "Balcão" (estoque escuro vira letreiro escuro), não da marca; registrar no grafo como decisão se aprovado.

## 14. Implementação

**Tokens (Tailwind 4, `@theme` em `globals.css`):** adicionar `--color-zap-fundo: #EFE7DD`, `--color-zap-bolha: #E7FFDB`, `--color-aviso-fundo: #FFF6E5`, `--color-hover-ficha: #FBF9F3`, `--color-porta-ativa: #ECE7DC`; `--content-max: 1200px` já existe, passa a valer no shell; `--sidebar-w: 224px`; raios `--radius-chip: 4px`, `--radius-control: 8px`, `--radius-porta: 12px` e remover o uso de `rounded-2xl`/`rounded-3xl` no painel.

**Namespace `pn-*` novo:** `pn-letreiro` (topbar), `pn-corredor` (sidebar clara), `pn-etiqueta-preco`, `pn-ficha`, `pn-bolha` (com o SVG do rabinho e do duplo check como componente React), `pn-prateleira` (grid + caixa com `--lotacao` em custom property e preenchimento por `background: linear-gradient` proibido, então usar um `::before` com `height: calc(var(--lotacao) * 100%)`), `pn-fita` (marcas via `repeating-linear-gradient` também proibido, então `::after` com `background-size` de blocos sólidos, sem transição de cor), `pn-switch`.

**Reaproveita:** `clip-path` de `.pn-etiqueta` (canto cortado), `.pn-ativo` (vira Acid), `pn-respira`, `pn-skeleton`, `--ease-girumo` e durações, `painel-nav.ts` (só ganha o campo `grupo: 'vender' | 'lotar' | 'loja'`), `mobile-nav.tsx` (troca fundo e itens), `auth-shell.tsx` (mantém estrutura, troca conteúdo da esquerda), `qr-link.tsx`, `numero-saude.tsx` (dados), o webhook de contagem viva de `grupos/page.tsx` (alimenta a prateleira e o ticker), `message-composer.tsx` (ganha a prévia em bolha), `group-settings.tsx` inline.

**Ordem sugerida, um dev sênior:**
1. Semana 1: tokens, `pn-letreiro`, `pn-corredor`, `pn-ficha`, `pn-etiqueta-preco`, `pn-bolha`; matar `rounded-2xl`, `backdrop-blur`, glow do plano, itálico editorial.
2. Semana 2: Início desktop e mobile (caixa com fita, quem chegou, vitrine, prateleira mini) e Login/Criar conta/Recuperar.
3. Semana 3: Grupos (prateleira completa, fichas, sem URL), Contatos (fichas com fita no rodapé), Configurações (portas, cartão do número, plano como etiqueta).
4. Semana 4: Disparos com bolha ao vivo e 13 quadradinhos, Oferta Relâmpago como etiqueta AO VIVO, Automações como interruptores, Campanhas como lista de etiquetas.
5. Semana 5 (folga): mobile fino (sheets, alvos 44px, inputs 16px), View Transitions, E2E de conteúdo esperado, captura para o vídeo.

**Esforço: 4 a 5 semanas.**

## 15. Riscos

1. **Foto de kit não existe no modelo de dados.** A direção fala em "kit na vitrine", mas Campanhas e Ofertas não têm imagem. Regra: a etiqueta é tipográfica por padrão (Manrope 800 caixa alta); quando o disparo ou a oferta tiver mídia anexada, a miniatura de 64px entra à esquerda do nome. Não criar campo novo na primeira entrega.
2. **Ticker depende de eventos reais.** A contagem viva por webhook já existe, mas "quem entrou" com nome só existe para quem veio por link de campanha (21 contatos). Em loja com poucas entradas o ticker fica parado; nesse caso mostra "Último post qua 12:12 · 13 / 13 grupos" em vez de inventar movimento.
3. **Bolha do WhatsApp e trade dress.** Cores aproximadas e sem logo estão dentro do que o próprio WhatsApp Business publica como prévia; ainda assim, não usar o ícone oficial nem a fonte deles. Se o jurídico pedir, a bolha vira Canvas com rabinho e continua funcionando.
4. **Zap demais.** Prateleira, anéis de avatar e ticker somam bastante verde numa tela. Limite: Zap nunca em texto, nunca em botão, nunca em barra de campanha (essas são Volt). Se no mockup a tela ficar "verde", reduzir a prateleira para preenchimento Volt-800 #123746 e manter Zap só nas pessoas.
5. **Corredor claro contradiz o "estoque escuro" registrado no Balcão.** É decisão de design system; precisa passar pelo `kg_query` e ser registrada antes de codar, senão outra sessão desfaz.
6. **Nomes de revendedora no vídeo.** São plausíveis, não reais; antes de gravar, trocar pelos 21 contatos reais com consentimento ou manter os plausíveis com aviso na descrição do vídeo.
7. **Densidade de 1200px em notebooks de 1366px.** Com corredor de 224 sobram 1142 de balcão: o grid de 12 colunas cabe, mas a prateleira de 568px mais os totais de 360px precisam de 24px de gutter; testar em 1366 antes de fechar as larguras.
