import { cn } from "@/lib/utils";

/**
 * Símbolo da marca: dois elos de corrente sobrepostos formando um "H".
 * Fonte: Brand/Logo/SVG/symbol-*.svg. Usa currentColor — controle a cor pelo `text-*`.
 */
export function LogoSymbol({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 120" fill="none" className={className} aria-hidden="true">
      <mask id="hf-link-mask">
        <rect width="120" height="120" fill="white" />
        <path d="M56 45 a21 21 0 0 1 0 30" fill="none" stroke="black" strokeWidth="15" />
      </mask>
      <g mask="url(#hf-link-mask)">
        <rect x="14" y="24" width="50" height="72" rx="21" fill="none" stroke="currentColor" strokeWidth="15" />
        <rect x="56" y="24" width="50" height="72" rx="21" fill="none" stroke="currentColor" strokeWidth="15" />
      </g>
      <path d="M56 45 a21 21 0 0 1 0 30" fill="none" stroke="currentColor" strokeWidth="15" />
    </svg>
  );
}

/** Lockup horizontal: símbolo + wordmark "HubFlow" em Bricolage. */
export function Logo({
  className,
  symbolClassName,
  wordmarkClassName,
}: {
  className?: string;
  symbolClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoSymbol className={cn("h-7 w-7 text-iris", symbolClassName)} />
      <span className={cn("font-display text-xl font-extrabold tracking-tight", wordmarkClassName)}>
        HubFlow
      </span>
    </span>
  );
}
