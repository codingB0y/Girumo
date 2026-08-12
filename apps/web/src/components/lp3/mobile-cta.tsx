"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { WhatsAppIcon } from "@/components/landing/icons";

/**
 * Barra fixa de CTA no mobile. Só aparece depois que o CTA do hero (#hero-cta)
 * rola pra fora da tela — assim no topo não existe CTA duplicado com a nav.
 * Desliza de baixo pra cima ao revelar.
 */
export function MobileCta({ signupUrl, whatsappUrl }: { signupUrl: string; whatsappUrl: string }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById("hero-cta");
    if (!target) return;
    const io = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting && entry.boundingClientRect.top < 0),
      { threshold: 0 },
    );
    io.observe(target);
    return () => io.disconnect();
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 flex gap-2 border-t border-[var(--line)] bg-[rgba(7,17,20,0.92)] p-3 backdrop-blur transition-transform duration-500 ease-out md:hidden ${
        visible ? "translate-y-0" : "translate-y-full"
      }`}
      aria-hidden={!visible}
    >
      <a href={signupUrl} className="lp4-btn lp4-btn-green flex-1 justify-center py-3.5 text-sm">
        Começar agora <ArrowRight className="h-4 w-4" aria-hidden />
      </a>
      <a
        href={whatsappUrl}
        aria-label="Falar no WhatsApp"
        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-[var(--hairline)]"
      >
        <WhatsAppIcon className="h-5 w-5 text-[var(--green)]" aria-hidden />
      </a>
    </div>
  );
}
