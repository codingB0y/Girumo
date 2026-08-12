import { PROVA_MARQUEE } from "@/components/lp3/landing-data";

/**
 * Régua de prova logo abaixo do hero — encosta o número forte (R$ 5 mil → R$ 350 mil)
 * na primeira dobra. O conteúdo é duplicado porque a animação anda até -50%:
 * a segunda cópia entra exatamente onde a primeira saiu.
 * A cópia duplicada é aria-hidden pra o leitor de tela não ouvir tudo duas vezes.
 */
export function ProofMarquee() {
  return (
    <div className="overflow-hidden border-y border-[var(--line)] py-3.5 md:py-4">
      <div className="lp4-marquee lp4-mono text-[9px] text-[var(--body)] md:text-[10px]">
        {[0, 1].map((copy) => (
          <div
            key={copy}
            className="flex shrink-0 gap-8 pr-8 md:gap-12 md:pr-12"
            aria-hidden={copy === 1 || undefined}
          >
            {PROVA_MARQUEE.map((item) => (
              <span key={item.text} className="whitespace-nowrap">
                {item.text}
                {item.volt && <span className="lp4-green">{item.volt}</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
