# Painel do cliente: direção "Vitrine Aberta" (design)

Data: 07/09/2026 · Status: aprovada pelo Igor em 07/09/2026 · Escopo: `/painel/**`, `/login`, `/signup`, `/forgot-password`, `/reset-password`. A área admin fica fora.

Mockups (desktop 1280 e mobile 390 de Login, Início, Grupos e Configurações nas 5 direções, placar do júri, roteiro do vídeo): https://claude.ai/code/artifact/743501ee-24de-4236-897e-67f4fcb0f015

## 1. Por que

O painel de hoje é competente e coerente com a marca, mas parece "SaaS de catálogo": sidebar escura padrão de mercado, onze cards brancos iguais na Início, conteúdo de 750 px numa tela de 1568, faturamento em 32 px num card de apoio enquanto o 9.736 tem 44, labels mono de 10 px a 40% de opacidade abaixo do contraste AA, Acid gasto em upsell, botão Entrar verde-oliva, glow e blur em overlays. Nenhuma tela faz alguém pausar o vídeo de demonstração.

Cinco direções foram desenhadas e julgadas por quatro lentes (marketing/vídeo, lojista no celular, tech lead, crítico anti-IA). Placar sobre 200: Vitrine Aberta 155, Balcão 2.0 152, Bolso 143, Romaneio 125, Sala de Controle 107. Três lentes puseram a Vitrine em primeiro; o tech lead preferiu Balcão 2.0 pela viabilidade. Decisão: Vitrine Aberta com enxertos das outras quatro, e Balcão 2.0 como plano B.

## 2. A ideia

O painel deixa de ser um sistema e vira a própria loja de atacado. Campanha é etiqueta de preço com furo. Contato é ficha de revendedora. Disparo é o post na bolha, exatamente como chega no celular de quem compra. Grupo é caixa numa prateleira que enche. O caixa do mês é medido numa fita métrica. Zap só onde tem gente. Cobalt só onde tem ação. Acid só em Postar, AO VIVO e LOTOU.

## 3. Gramática visual

### 3.1 Três zonas (desktop 1280 a 1568)

- **Letreiro** (`pn-letreiro`): faixa superior de 64 px, largura total, Volt `#071923`. Esquerda: símbolo Girumo em Paper 24 px + nome da loja em Manrope 700 16 px. Centro: ticker de entradas em Plex Mono 13 px Line com ponto Zap 8 px ("Josiane M. entrou no Mega Stock Atacado #109 · há 2 min"). Direita: chip do número em Plex Mono 13 px com ponto Success que respira, sino, avatar de iniciais 32 px Volt sobre Acid. É a única peça escura do painel.
- **Corredor** (`pn-corredor`): sidebar de 224 px, Paper, borda direita 1 px Line. Itens de 40 px, Plex Sans 14 px 500, ícone 18 px sem caixa. Ativo: barra esquerda 3 px Acid + fundo Canvas. Três grupos com cabeçalho Plex Mono 12 px Slate: VENDER (Disparos, Oferta Relâmpago, Automações), LOTAR (Campanhas, Páginas, Indicação), LOJA (Início, Grupos, Contatos, Resultados). Rodapé: Seu número, Configurações, romaneio do plano em mono 12 ("GROWTH · renova 04/10 · 1 de 2 celulares"). Checklist dos 30 dias vira "7 de 8 passos" com barra 4 px Cobalt e some em 8/8. Abaixo de 1280 px o corredor recolhe a 64 px só com ícones.
- **Balcão** (conteúdo): Canvas `#F4F0E7`, padding 32 px, grid de 12 colunas com gutter 24, `max-width: 1200px`, alinhado à esquerda.

Substitui o conceito "estoque escuro + balcão claro" (sidebar escura de 256 px) do design system O Balcão. Tokens e namespace `pn-*` continuam. Registrado no grafo em `decisao-2026-09-07`.

### 3.2 Mobile (390, uma mão)

- Letreiro 56 px: símbolo 22 px + nome da loja Manrope 700 15 px + ponto do número (respira conectado, parado desconectado) + sino. O ticker vira a primeira linha do conteúdo.
- Barra inferior 56 px + `env(safe-area-inset-bottom)`, Paper com borda superior 1 px Line, cinco destinos: Início, Grupos, **Postar**, Contatos, Mais. Postar é o botão quadrado 60x52 em Acid com canto cortado e sombra dura `3px 3px 0 #071923`, presente em toda tela, e abre a folha de postar com a última campanha pré-selecionada e a prévia na bolha. Em voo mostra "7/13" em mono 13 e barra de 3 px na base. É o único Acid tocável do painel; upgrade vira Cobalt.
- "Mais" mostra o estado de cada módulo antes do toque ("Campanhas · 3", "Disparos · último 02/09 12:12", "Oferta Relâmpago · ao vivo", "Automações · 0 de 3 ligadas", "Páginas · 2 no ar"). `painel-nav.ts` ganha `resumo()`.
- Ficha de 64 px; toque abre bottom sheet com detentes 40%/90%, handle 32x4, botão Fechar em texto. Inputs 48 px com `font-size: 16px`. Alvos de toque 44 px.

### 3.3 Paleta e tipografia

Paleta da marca intacta: Volt, Volt-900, Volt-800, Paper, Canvas, Line, Acid, Cobalt, Cobalt-700, Slate, Success, Warning (sobre `#FFF6E5`), Danger, Zap. Tokens novos: `--color-zap-fundo #EFE7DD`, `--color-zap-bolha #E7FFDB` (só dentro de `pn-bolha`, único desvio de marca aprovado, sem logo do WhatsApp), `--color-aviso-fundo #FFF6E5`, `--color-hover-ficha #FBF9F3`, `--color-porta-ativa #ECE7DC`.

Escala de 8 degraus: 12 / 13 / 15 / 20 / 28 / 32 / 48 / 64. Manrope 800 caixa alta em nome de campanha e kit (20, 32), Manrope 700 28 título de tela, Manrope 800 64 (desktop) / 44 (mobile) só no R$ do caixa. Plex Sans 15/22 corpo, 600 nome, 14/20 texto da bolha, 13 label e apoio. Plex Mono em todo número, hora, telefone, link, cota, sempre `tabular-nums`: 48 caixa, 40 pessoas nos grupos, 32 número no cartão, 15 lotação, 13 ticker, 12 meta. Piso absoluto 12 px, Slate sólido em label, nunca opacidade. O itálico editorial sai.

Raios: 4 (chip), 8 (etiqueta, ficha, botão, input), 12 (só o card do login). Nenhum 16. Sem sombra que levita; hover em ficha só troca o fundo.

### 3.4 Componentes-assinatura

| Primitivo | O que é | Onde aparece |
|---|---|---|
| `pn-letreiro` | faixa Volt de 64 px com nome, ticker, número, sino | toda tela |
| `pn-corredor` | sidebar clara de 224 px por verbo | desktop |
| `pn-etiqueta-preco` | campanha/oferta/página como etiqueta de peça: Paper, canto cortado 14 px, furo de 10 px, nome Manrope 800 20 caixa alta, link mono 13 Cobalt com Copiar, barra 6 px + "475 / 2.048 vagas", chip PRONTA / AO VIVO / LOTOU | Campanhas, Relâmpago, Páginas, Início |
| `pn-ficha` | linha de 64 px: etiqueta quadrada 40x40 de iniciais com canto cortado (Manrope 700 14 sobre Canvas, filete Zap 3 px na base para quem entrou em 24 h), nome 15/600, origem mono 12, "há 2 dias", Conversar e Registrar pedido | Contatos, Início, sino |
| `pn-bolha` | prova de conversa: fundo `#EFE7DD` raio 8, bolha `#E7FFDB` com rabinho SVG, texto 14/20, hora mono 11 + duplo check SVG Cobalt | Disparos (prévia ao vivo), histórico, Automações, Início |
| `pn-prateleira` | 91 grupos em grade 13x7, caixa 40x40 (22 no mobile), enche de baixo pra cima em Volt-800 na proporção da lotação via `::before` com `height: calc(var(--lotacao) * 100%)`; cheia vira Volt com filete Acid; quase cheia borda Warning; Zap só no ponto de "entrou hoje" | Grupos, Início (mini) |
| `pn-fita` | meta do mês como fita métrica: barra 12 px, marcas Volt a cada R$ 5.000 via `::after` com `background-size` de blocos sólidos, preenchimento Acid, cursor Volt 2 px; número em Manrope 800 64/44 acima | Início, Contatos (rodapé) |
| `pn-carimbo-evento` | LOTOU / ENVIADO: mono 12 caixa alta, Volt sobre Acid, borda 2 px; entra com `scale(1.12)` para 1, opacity 0 para 1, 180 ms, rotação -4°, no máximo um por viewport | Grupos, Disparos |
| `pn-cupom` | histórico de disparos em mono 13 com borda inferior tracejada e 13 quadradinhos de 8 px | Disparos, Início |
| `pn-total` | linha de total com borda dupla fechando toda lista (já existe; passa a valer em toda lista) | Grupos, Campanhas, Contatos |
| `pn-odometro` | só o dígito que muda rola, 240 ms | letreiro, ficha do grupo, R$ |

### 3.5 Motion

Curva única `--ease-girumo`, durações 90/180/240/280/600 ms, só `transform` e `opacity`. Três movimentos assinatura: odômetro do número, carimbo caindo, bolha escrevendo junto com o texto. Ticker troca só em entrada real; sem entrada em 24 h vira "Último post qua 12:12 · 13/13 grupos". Conectado respira, desconectado para. Tudo o mais parado. `prefers-reduced-motion` zera durações.

## 4. Regras que valem em toda tela

1. Acid em fundo no máximo duas vezes por tela (Postar, AO VIVO, LOTOU); lint no CI.
2. Zap só em gente entrando (ponto, filete). Nunca botão, nunca fundo de caixa.
3. Cobalt só em ação (botão primário, link, foco, barra de lotação).
4. Nenhum texto abaixo de 12 px; Slate sólido em label; input 16 px; alvo 44 px; contraste AA.
5. Link de convite nunca impresso inteiro: "Copiar convite" que vira "Copiado" por 1,2 s, sufixo "…7Kq2" quando precisar identificar.
6. Nome completo só em Contatos autenticado; ticker e vídeo usam "Josiane M.".
7. Estado vazio é onboarding: cada bloco tem versão sem dado que aponta o próximo passo ("Nenhum pedido registrado", nunca "R$ 0").
8. Login não mostra dado do tenant antes de autenticar. Estado "aparelho lembrado" (cache local) pode mostrar o recorte; visitante vê a prateleira com números genéricos.
9. Removidos do CSS e dos componentes do painel: gradiente, glow, `backdrop-blur`, blob, confete, `Sparkles`, emoji no compositor, `alert`/`confirm` nativos, roxo, `rounded-2xl`/`3xl`, itálico editorial.
10. Uma casca só: a nova entra atrás de flag por no máximo uma release; depois a antiga sai.

## 5. Arquitetura da mudança

- **Tokens** em `apps/web/src/app/globals.css` (`@theme inline`): cores novas, `--sidebar-w: 224px`, `--content-max: 1200px`, raios 4/8/12, escala de tipo. Primitivos `pn-*` novos ao lado dos existentes; `.pn-ativo` passa a Acid; `.pn-carimbo` perde o itálico.
- **Flag** `NEXT_PUBLIC_PAINEL_VITRINE` no padrão de `apps/web/src/lib/pages/flags.ts` (só a string "on" liga), lida no `layout.tsx` do painel e no `auth-shell.tsx`. Desligada, nada muda.
- **Casca**: `components/painel/topbar.tsx` vira letreiro; `sidebar.tsx` vira corredor; `mobile-nav.tsx` ganha o Postar central e o Mais com resumo; `lib/painel-nav.ts` ganha `grupo: 'vender' | 'lotar' | 'loja'` e `resumo()`.
- **Dados**: nenhum backend novo. Ticker e prateleira lêem o webhook de contagem viva já usado em `painel/grupos`; a bolha lê o `message-composer.tsx`; fichas lêem `contacts`. O progresso por grupo do disparo em voo usa o que o worker já reporta (ETA e entregues), sem exigir latência abaixo de 1 s.
- **E2E**: seletores migram para `data-testid` na semana 1; cada PR anexa captura Playwright por seção em 390 e 1440.
- **Gates**: `brand:check`, `verify-local.ps1`, lint de `bg-acid`, contraste automático no fechamento.

## 6. Entrega em PRs (um dev sênior, 5 a 6 semanas)

| PR | Escopo | Estimativa |
|---|---|---|
| 1 | Fundação: tokens, escala, raios, primitivos `pn-*` da Vitrine, flag. Sem mudança visual com a flag desligada | 3 dias |
| 1b | Limpeza: glow, blur, confete, `Sparkles`, `rounded-2xl`, itálico; `data-testid` nos E2E; lint `bg-acid` | 2 dias |
| 2 | Casca mobile: barra de 5 itens com Postar central, folha de postar, Mais com resumo, upgrades em Cobalt | 3 dias |
| 3 | Início desktop e mobile: caixa 64/44 com fita, quem chegou, prateleira mini, estado parado com verbo, odômetro | 4 dias |
| 4 | Login, Criar conta, Recuperar senha: `auth-shell` com botão Acid, estado visitante e aparelho lembrado | 2 dias |
| 5 | Grupos: prateleira 13x7, ficha inline 360 px e sheet 40/90, carimbo LOTOU, total de romaneio, Copiar convite | 5 dias |
| 6 | Contatos e Configurações: fichas por dia com fita no rodapé, Configurações como portas, plano como etiqueta | 4 dias |
| 7 | Disparos e Oferta Relâmpago: compositor com bolha ao vivo, histórico em cupom, etiqueta AO VIVO com fila | 4 dias |
| 8 | Campanhas, Automações, Páginas: etiquetas com QR no detalhe, interruptores 56x32, cards com miniatura | 4 dias |
| 9 | Resultados, Indicação, Seu número | 3 dias |
| 10 | Fechamento: remover flag e casca antiga, contraste automático, E2E verdes, gravação das 9 cenas, card do quadro | 3 dias |

Cada PR fecha o loop na mesma sessão (revisar, CI verde, mergear, apagar branch) e move o card `painel-redesign-o-balcao` só com prova colhida na hora.

## 7. Critérios de aceite do conjunto

- As cenas 2, 4 e 6 do roteiro do vídeo gravam com dado real de produção sem retoque.
- Nenhum texto abaixo de 12 px e contraste AA em toda a área do cliente, medido por script.
- Zero `rounded-2xl`, `backdrop-blur`, gradiente decorativo e `Sparkles` em `app/painel` e `components/painel`.
- Barra inferior mobile com Postar acessível em todas as 22 rotas do painel.
- Link de convite nunca impresso inteiro em lista.
- `brand:check`, lint, dois `tsc` e E2E verdes; capturas 390 e 1440 anexadas em cada PR.

## 8. O que não fazer

Não escurecer o painel inteiro. Não adicionar família tipográfica. Não usar pauta, sombra dura em card ou textura. Não mostrar link de convite completo. Não rodar nome completo no ticker. Não criar backend de progresso por grupo nesta fase. Não manter as duas cascas além de uma release atrás de flag.

## 9. Riscos

- Notebooks de 1366 px: corredor 224 + conteúdo 1200 não cabe; abaixo de 1280 o corredor recolhe a 64.
- Prateleira com 91 caixas de 22 px no mobile: tooltip não existe; o toque abre a sheet, e a legenda embaixo diz "1 cheio · faltam 83.448 vagas".
- Ticker com poucos contatos vira repetição; o fallback de 24 h resolve.
- Casca nova e antiga convivendo: cada tela migrada precisa funcionar nas duas até o PR 10; a flag é por ambiente, não por tenant, para não criar caminho de código que só um cliente vê.
- Contagem viva depende do webhook; quando a Evolution atrasa, a prateleira mostra "conferido há 2 h" em vez de fingir tempo real.
