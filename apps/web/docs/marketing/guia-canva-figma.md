# Especificações para Canva / Figma — Branding HubFlow

Use estas specs para montar templates reutilizáveis no Canva ou Figma.

---

## Formato dos posts

| Rede | Formato | Dimensão |
|------|---------|----------|
| Instagram Feed / Carrossel | Quadrado | 1080 × 1080 px |
| Instagram Stories / Reels cover | Vertical | 1080 × 1920 px |
| LinkedIn | Paisagem | 1200 × 627 px |
| WhatsApp Status | Vertical | 1080 × 1920 px |

---

## Cores (Hex)

| Nome | Hex | Uso |
|------|-----|-----|
| Breu | `#0B0D1A` | Background principal (obrigatório) |
| Breu 2 | `#11142A` | Superfície elevada / cards |
| Iris | `#6A4BF0` | Acento, CTAs, destaques |
| Iris Claro | `#8A6CFF` | Hover, gradientes, highlights |
| Iris Escuro | `#3D1FB0` | Fim de gradientes |
| Bruma | `#ECEBF5` | Texto principal sobre escuro |
| Aço | `#3A3F5C` | Texto secundário |
| Verde WhatsApp | `#25D366` | Ícone WhatsApp, badges positivos |
| Emerald (checks) | `#10B981` | Ícones de checklist / sucesso |
| Red (erros) | `#F87171` | Ícones negativos / X |

### Gradiente da marca
```
Linear 135°:
#A78CFF → #6A4BF0 → #3D1FB0
```

---

## Tipografia

| Função | Fonte | Peso | Onde |
|--------|-------|------|------|
| Headlines / títulos | Bricolage Grotesque | ExtraBold (800) | Frases de impacto, números |
| Corpo | IBM Plex Sans | Regular (400) / Medium (500) | Descrições, listas |
| Dados / labels | IBM Plex Mono | Regular (400) / Bold (700) | Métricas, tags, footer |
| Citações / editorial | Instrument Serif | Regular (400) italic | Depoimentos |

**No Canva:** Busque "Bricolage Grotesque", "IBM Plex Sans", "IBM Plex Mono" na aba de fontes (todas estão disponíveis no Canva Pro). "Instrument Serif" pode precisar de upload.

**No Figma:** Instale via Google Fonts ou use o plugin "Google Fonts".

---

## Estrutura do slide (grid)

```
┌─────────────────────────────────┐
│  ● HubFlow          (logo+word) │ ← topo, padding 40px
│                                 │
│                                 │
│       [CONTEÚDO CENTRAL]        │ ← centralizado vertical
│                                 │
│                                 │
│  hubflow.com.br    O fluxo...   │ ← footer, Plex Mono 10px
└─────────────────────────────────┘
```

- Padding geral: 60px (feed) / 80px (stories)
- Logo: símbolo 28px + wordmark 14px, canto superior esquerdo
- Footer: alinhado nas bordas inferiores

---

## Elementos decorativos

1. **Grid técnico:** Linhas de 1px, branco 5% opacidade, espaçamento 46px, com máscara radial (desvanecer nas bordas)
2. **Eclipse/Glow:** Círculo radial de iris a 30% opacidade, ~60% do tamanho do slide, centralizado no conteúdo
3. **Conic ring (cards destaque):** Borda com gradiente cônico girando (efeito premium) — no Canva, simule com borda gradiente

---

## Logo

Símbolo: Dois elos de corrente sobrepostos formando um "H".
- Cor: `#6A4BF0` (iris)
- Tamanho mínimo: 24px
- Wordmark: "HubFlow" em Bricolage Grotesque ExtraBold, branco
- Espaçamento entre símbolo e wordmark: 10px

---

## Template Canva — Passo a passo

1. Crie um design 1080×1080
2. Fundo: `#0B0D1A`
3. Adicione um círculo de 800px, gradiente radial iris→transparente, opacidade 25%, centralizado
4. Adicione o grid (elemento de linhas ou use pattern)
5. Posicione logo no topo esquerdo
6. Texto central: Bricolage ExtraBold, tamanho 48-64px, cor bruma
7. Footer: Plex Mono 10px, uppercase, tracking 200, cor bruma 30%
8. Salve como template e duplique para cada slide

---

## Checklist de qualidade

- [ ] Fundo é `#0B0D1A` (nunca branco puro)
- [ ] Texto principal é bruma (`#ECEBF5`), não branco puro
- [ ] Headlines em Bricolage, não em sans genérica
- [ ] Números/métricas em Plex Mono
- [ ] Logo presente no topo
- [ ] Tagline "O fluxo que vende." no footer
- [ ] Contraste suficiente (WCAG AA: 4.5:1 mínimo)
- [ ] Sem mais de 2 cores de acento por slide (iris + verde OU iris + vermelho)
