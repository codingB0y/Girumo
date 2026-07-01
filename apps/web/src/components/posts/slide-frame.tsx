/**
 * Frame de 1080×1080px (escala 1:3 no grid) para cada slide de post.
 * Renderiza o conteúdo com o branding HubFlow (fundo breu, gradiente iris).
 * Para exportar: screenshot do card individual ou use devtools "Capture node screenshot".
 */
export function SlideFrame({
  children,
  label,
}: {
  children: React.ReactNode;
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="font-data text-[11px] uppercase tracking-wider text-neutral-500">
          {label}
        </span>
      )}
      <div
        className="relative aspect-square w-full overflow-hidden rounded-2xl border border-white/10"
        style={{ minWidth: 280 }}
      >
        {/* Background layers */}
        <div className="absolute inset-0 bg-breu" />
        <div className="absolute inset-0 hf-grid-dark opacity-40" />
        {/* Eclipse glow centered */}
        <div className="absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 opacity-30">
          <div className="hf-eclipse h-full w-full" />
        </div>
        {/* Content */}
        <div className="relative z-10 flex h-full flex-col">
          {/* Logo watermark top */}
          <div className="flex items-center gap-2 px-6 pt-5">
            <svg viewBox="0 0 120 120" fill="none" className="h-5 w-5 text-iris" aria-hidden>
              <mask id="hf-m">
                <rect width="120" height="120" fill="white" />
                <path d="M56 45 a21 21 0 0 1 0 30" fill="none" stroke="black" strokeWidth="15" />
              </mask>
              <g mask="url(#hf-m)">
                <rect x="14" y="24" width="50" height="72" rx="21" fill="none" stroke="currentColor" strokeWidth="15" />
                <rect x="56" y="24" width="50" height="72" rx="21" fill="none" stroke="currentColor" strokeWidth="15" />
              </g>
              <path d="M56 45 a21 21 0 0 1 0 30" fill="none" stroke="currentColor" strokeWidth="15" />
            </svg>
            <span className="font-display text-sm font-bold text-white/60">HubFlow</span>
          </div>
          {/* Main content area */}
          <div className="flex flex-1 items-center justify-center p-6">
            {children}
          </div>
          {/* Footer */}
          <div className="px-6 pb-5">
            <div className="flex items-center justify-between">
              <span className="font-data text-[10px] uppercase tracking-[0.2em] text-bruma/30">
                hubflow.com.br
              </span>
              <span className="font-data text-[10px] uppercase tracking-[0.2em] text-iris/50">
                O fluxo que vende.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
