# Usando o Claude Design para criar criativos HubFlow

O Claude Design (claude.ai/design) gera layouts visuais em React renderizados ao vivo.
Você pode colar os templates de texto e pedir para o agente criar o visual.

## Como usar

1. Acesse **claude.ai/design**
2. Crie um novo projeto
3. Cole o prompt abaixo (adapte para cada template)

## Prompt base (copie e ajuste)

```
Crie um post para Instagram (1080×1080px) com o branding do HubFlow:

- Fundo: #0B0D1A (quase preto, premium)
- Acento: gradiente de #6A4BF0 para #8A6CFF (violeta/iris)
- Texto principal: #ECEBF5 (bruma, branco suave)
- Fonte títulos: Bricolage Grotesque ExtraBold
- Fonte corpo: IBM Plex Sans
- Fonte dados/labels: IBM Plex Mono
- Elementos decorativos: grid sutil de linhas brancas 5% opacidade, eclipse/glow iris atrás do conteúdo
- Logo no topo: símbolo de dois elos formando "H" em iris + wordmark "HubFlow" em branco
- Footer: "hubflow.com.br" à esquerda, "O fluxo que vende." à direita, ambos em Plex Mono 10px

Conteúdo do slide:
[COLE O TEXTO DO TEMPLATE AQUI]

Use ícones de Check verde (#10B981) para itens positivos e X vermelho (#F87171) para negativos.
Mantenha o layout limpo, com bastante espaço em branco (breathing room).
```

## Prompts prontos por template

### Template 1.1 — Slide Capa
```
Crie o slide de capa de um carrossel Instagram (1080×1080):

Emoji 😮‍💨 grande no centro.
Abaixo, texto principal em Bricolage ExtraBold 48px branco:
"Você ainda copia e cola oferta em 40 grupos toda manhã?"

Fundo #0B0D1A com glow iris atrás do texto.
Logo HubFlow pequeno no topo esquerdo.
```

### Template 1.1 — Slide Problema
```
Slide de carrossel (1080×1080):

Lista vertical com 4 itens, cada um com ❌ (ícone X vermelho) à esquerda:
- "Abre grupo 1 → cola → envia"
- "Abre grupo 2 → cola → envia"
- "Abre grupo 3 → cola → envia"
- "40 minutos depois: cansou e nem mandou pra todos" (em opacidade reduzida)

Fonte: IBM Plex Sans 18px, cor #ECEBF5 a 80%.
Fundo escuro com grid sutil.
```

### Template 4.2 — "Quanto você perde"
```
Post único Instagram (1080×1080):

No topo, label em Plex Mono: "FAZ A CONTA" (10px, uppercase, tracking wide, cor iris 50%).

Número central gigante: "20h" em Plex Mono Bold 72px, cor branca.
Abaixo: "por mês colando mensagem em grupo." em Plex Sans 18px, bruma 60%.

Separador horizontal sutil (1px branco 10%).

Abaixo: "Quanto vale sua hora?" em Bricolage Bold 24px, cor iris claro (#8A6CFF).

Fundo #0B0D1A. Glow iris sutil no centro.
```

## Dicas

- Peça "variações" para testar layouts diferentes
- Use "estilo dark premium, minimalista" na descrição
- Para carrosséis, peça todos os slides de uma vez: "Crie 4 slides de carrossel..."
- Se quiser screenshot do painel real no post, peça para incluir um placeholder de imagem com overlay escuro
