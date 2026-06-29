"use client";

import { usePathname } from "next/navigation";

/** Re-monta o conteúdo a cada rota e aplica o fade+rise de entrada (motion sutil). */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="hf-enter">
      {children}
    </div>
  );
}
