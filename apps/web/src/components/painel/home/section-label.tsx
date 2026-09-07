"use client";

/** Numeração editorial de seção — índice mono + título Manrope. */
export function SectionLabel({ n, children }: { n: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="font-data text-[13px] text-ardosia">{n}</span>
      <span className="font-data text-[13px] text-ardosia">—</span>
      <h2 className="font-display text-[17px] font-bold tracking-[-0.01em] text-volt-950">{children}</h2>
    </div>
  );
}
