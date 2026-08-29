"use client";

import { useEffect } from "react";

/**
 * Registra o clique nos links de saída da landing (hoje: WhatsApp).
 *
 * Delegação no `document` em vez de `onClick` em cada link: `landing.tsx`,
 * `landing-desktop.tsx` e `landing-mobile.tsx` são SERVER components, e os
 * quatro links de WhatsApp estão espalhados entre eles. Pôr handler em cada um
 * obrigaria a marcar os três arquivos com "use client" — arrastando a landing
 * inteira para o bundle do cliente só para medir um clique. Aqui o único
 * componente client é este, e o diff nos outros é um atributo por link.
 *
 * `sendBeacon` e não `fetch`: o clique navega para outro host imediatamente, e o
 * browser cancela requisição pendente ao descarregar a página. `sendBeacon`
 * existe exatamente para este caso — entrega em background, sem segurar a
 * navegação, e é por isso que NÃO fazemos preventDefault: o link funciona igual
 * com ou sem o beacon, e nunca esperamos a rede antes de abrir o WhatsApp.
 */

const ENDPOINT = "/api/track/outbound";

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;

export function OutboundTracker() {
  useEffect(() => {
    // Sem `sendBeacon` não há como medir sem atrasar a navegação. Preferimos
    // perder o dado a segurar o clique de quem quer falar no WhatsApp.
    if (typeof navigator.sendBeacon !== "function") return;

    function onClick(rawEvent: MouseEvent) {
      const target = rawEvent.target;
      if (!(target instanceof Element)) return;

      const link = target.closest<HTMLAnchorElement>("a[data-outbound]");
      const event = link?.dataset.outbound;
      if (!event) return;

      const url = new URL(window.location.href);
      const payload: Record<string, string> = {
        event,
        source_path: `${url.pathname}${url.search}`,
      };

      for (const key of UTM_KEYS) {
        const value = url.searchParams.get(key);
        if (value) payload[key] = value;
      }
      // Referrer só interessa quando é de FORA: o interno é navegação nossa e
      // encheria a série de linhas apontando para a própria landing.
      if (document.referrer && !document.referrer.startsWith(url.origin)) {
        payload.referrer = document.referrer;
      }

      navigator.sendBeacon(
        ENDPOINT,
        new Blob([JSON.stringify(payload)], { type: "application/json" }),
      );
    }

    // Fase de captura: um handler que chame stopPropagation em algum ancestral
    // (o magnético/GSAP da landing mexe nesses mesmos links) engoliria o evento
    // antes de ele chegar ao document na fase de bubbling.
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
