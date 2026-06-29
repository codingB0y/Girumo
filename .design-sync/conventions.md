# HubFlow — Direção B / Corrente

Foundation da marca HubFlow (tokens, tipografia e o logo). Use SEMPRE estes tokens e classes
ao desenhar para o HubFlow — não invente cores nem fontes fora desta paleta.

## Identidade (regra 60 / 30 / 10)
- **60% Breu** `#0B0D1A` — base, fundos premium, texto sobre claro. Superfície elevada no escuro: **Breu-2** `#11142A`.
- **30% Íris** `#6A4BF0` — acento ÚNICO: CTAs, estado ativo, destaques. Hover/realce no escuro: **Íris-claro** `#8A6CFF`. Fim de gradiente / íris sobre fundo claro: **Íris-escuro** `#3D1FB0`. **Nunca use Íris em blocos grandes de texto.**
- **10% Bruma** `#ECEBF5` — fundo claro de seções.
- Neutros de texto: **Aço** `#3A3F5C` (secundário), **Ardósia** `#5B6172` (terciário/labels).
- Semânticas: Sucesso `#1E8E5A` · Atenção `#D99B2A` · Alerta `#D84040`. **Verde = só sucesso/crescimento — nunca como ação** (a ação é sempre Íris; evita confusão com o verde do WhatsApp).

## Idioma de estilo: classes utilitárias (Tailwind) que resolvem nos tokens
Não estilize por props nem CSS solto — use estas classes. Todas existem no `styles.css` empacotado:

| Família | Classes |
|---|---|
| Fundo | `bg-breu` `bg-breu-2` `bg-iris` `bg-iris-claro` `bg-iris-escuro` `bg-bruma` `bg-sucesso` `bg-atencao` `bg-alerta` |
| Texto | `text-breu` `text-iris` `text-iris-claro` `text-iris-escuro` `text-bruma` `text-aco` `text-ardosia` `text-white` `text-sucesso` |
| Borda | `border-iris` `border-breu` `border-bruma` `border-aco` |
| Sombra | `shadow-iris` `shadow-deep` |
| Gradiente da marca | `bg-gradient-to-br from-iris-claro via-iris to-iris-escuro` |

Os mesmos valores também estão disponíveis como CSS custom properties (`--hf-breu`, `--hf-iris`, `--hf-bruma`, `--hf-aco`, `--color-breu`, `--color-iris`, …) e fontes (`--font-display`, `--font-body`, `--font-data`, `--font-editorial`).

## Tipografia (4 vozes, papéis fixos)
- **`font-display`** → Bricolage Grotesque (700/800), tracking apertado — títulos, números de destaque, o logo.
- **`font-body`** → IBM Plex Sans (400/500/600) — todo texto de interface.
- **`font-data`** → IBM Plex Mono (400/500) — dados, métricas, labels de seção (use `uppercase tracking-wider`).
- **`font-editorial`** → Instrument Serif (use `italic`) — UMA frase de respiro por seção (manifesto/citação). Nada além disso.

## Componentes disponíveis
- **`Logo`** — lockup horizontal (símbolo da corrente + wordmark "HubFlow"). Props: `className`, `symbolClassName`, `wordmarkClassName`. Em fundo escuro passe `wordmarkClassName="text-white"`.
- **`LogoSymbol`** — só o símbolo (dois elos formando um "H"). Usa `currentColor`: controle a cor com `text-iris` / `text-white` e o tamanho com `h-* w-*`.

## Snippet idiomático
```tsx
import { Logo } from 'hubflow-web';

export function Hero() {
  return (
    <section className="bg-breu text-white">
      <Logo wordmarkClassName="text-white" />
      <p className="font-data text-xs uppercase tracking-wider text-bruma/60">O fluxo que vende</p>
      <h1 className="font-display text-5xl font-extrabold tracking-tight">
        Do caos ao canal. <span className="text-iris-claro">Seus grupos vendendo no automático.</span>
      </h1>
      <button className="bg-iris text-white shadow-iris rounded-xl px-7 py-3.5 font-medium">
        Criar conta
      </button>
    </section>
  );
}
```

Sem provider/wrapper obrigatório — basta `styles.css` no documento. As fontes carregam via `@import` do Google Fonts já presente no `styles.css`.
