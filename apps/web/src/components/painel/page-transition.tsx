"use client";

import { usePathname } from "next/navigation";

/** Re-monta o conteúdo a cada rota e aplica o fade+rise de entrada (ease-fluxo). */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="pn-rise">
      {children}
    </div>
  );
}
