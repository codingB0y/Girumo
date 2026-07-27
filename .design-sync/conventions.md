# Girumo — Deslocamento

Foundation da marca Girumo para design-sync. A fonte de verdade visual é o pacote em `docs/brand/girumo/` e os componentes oficiais em `src/components/brand/logo.tsx`.

## Identidade

- **Volt 950** `#071923`: texto principal, navegação e fundos premium.
- **Acid 500** `#A7FF2F`: CTA primário e sinal comercial pontual.
- **Paper 0** `#FFFEFA`: cards prioritários e logo reverso.
- **Canvas 100** `#F4F0E7`: fundo claro de conteúdo.
- **Cobalt 500/700** `#2E66FF` / `#1947C9`: foco, seleção, links e dados. Nunca substitui Acid na ação primária nem vira cor do logo.

O logo é sempre monocromático. Use Paper sobre Volt, Volt sobre Acid, Volt sobre Paper ou preto integral. Nunca separe símbolo e wordmark por cor.

## Tipografia

- `font-brand`: Manrope — títulos e números de destaque.
- `font-body`: IBM Plex Sans — interface e leitura.
- `font-data`: IBM Plex Mono — horários, IDs, métricas auxiliares e status.

## Componentes

- `Logo`: lockup horizontal oficial com símbolo Deslocamento e wordmark em contornos.
- `LogoSymbol`: símbolo oficial isolado, usando `currentColor`.

```tsx
import { Logo, LogoSymbol } from "hubflow-web";

export function Exemplo() {
  return (
    <section className="bg-volt-950 p-12 text-paper-0">
      <Logo className="text-paper-0" />
      <p className="mt-8 font-body text-lg">Seus grupos rodando. Você vendendo.</p>
      <button className="mt-6 rounded-control bg-acid-500 px-6 py-3 font-body font-semibold text-volt-950">
        Ver como funciona
      </button>
      <LogoSymbol className="mt-10 h-12 w-12 text-paper-0" title="Girumo" />
    </section>
  );
}
```

## Composição

- Base plana em Volt, Paper ou Canvas.
- Acid como um único foco.
- Espaçamento em múltiplos de 4 px.
- Raios: 8 px controles, 12 px cards, 16 px painéis de marketing.
- Sem gradientes, glow, glass, grid decorativo, textura gratuita, roxo ou dashboard falso.
