# Fontes versionadas

Carregadas por `next/font/local`. Antes vinham de `next/font/google`, que baixa do
Google Fonts **durante o build**: quando o Google devolvia uma resposta ruim, o
`next build` caía com `Cannot read properties of null (reading '1')` em
`loader.js:122`, e o CI do PR ficava vermelho sem nada de errado no código.

Os `.woff2` são os **mesmos bytes** que o `next/font/google` embutia, extraídos com o
próprio loader dele (`next@15.5.24`, 01/10/2026), só o subset **latin**, que era o
único declarado (`subsets: ["latin"]`) e pré-carregado. Glyph de latin-ext (ex.: `ő`,
`₿`) num texto de tenant cai na fonte de fallback. Nenhum texto do app usa um hoje.

| Pasta                 | Família             | Arquivo                                 | Usada em |
| --------------------- | ------------------- | --------------------------------------- | -------- |
| `manrope`             | Manrope (variável)  | `manrope-latin.woff2`                   | `app/layout.tsx` |
| `ibm-plex-sans`       | IBM Plex Sans (var.)| `ibm-plex-sans-latin.woff2`             | `app/layout.tsx` |
| `ibm-plex-mono`       | IBM Plex Mono       | `ibm-plex-mono-latin-{400,500}.woff2`   | `app/layout.tsx` |
| `archivo`             | Archivo (wght+wdth) | `archivo-latin.woff2`                   | painel, `/`, `/lp3` |
| `league-spartan`      | League Spartan      | `league-spartan-latin.woff2`            | `lp-atacado` |
| `martian-mono`        | Martian Mono        | `martian-mono-latin.woff2`              | `/lp3` |
| `bricolage-grotesque` | Bricolage Grotesque | `bricolage-grotesque-latin.woff2`       | páginas v3 (impacto) |
| `fraunces`            | Fraunces            | `fraunces-latin.woff2`                  | páginas v3 (editorial) |

Todas são SIL Open Font License 1.1 (`OFL.txt` em cada pasta, copiado de
`github.com/google/fonts/ofl/<família>`). A IBM Plex reserva o nome "Plex": não
redistribuir versão **modificada** destes arquivos com esse nome.

Para trocar peso ou família: baixar o CSS do Google Fonts com User-Agent de Chrome
moderno (que é o que faz ele servir woff2), pegar o bloco `/* latin */` e espelhar no
`localFont(...)` os mesmos `font-weight`, `font-style` e `font-stretch` do bloco.
