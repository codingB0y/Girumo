"use client";

import { useEffect, useState } from "react";

const DIGITOS = "0123456789".split("");

function Digito({ valor }: { valor: number }) {
  // Nasce no zero e rola até o dígito: é o "odômetro do número" da spec 3.5.
  const [posicao, setPosicao] = useState(0);
  useEffect(() => {
    setPosicao(valor);
  }, [valor]);
  return (
    <span className="pn-odometro__digito" aria-hidden="true">
      <span style={{ transform: `translateY(-${posicao}em)` }}>
        {DIGITOS.map((d) => (
          <i key={d} className="block h-[1em] not-italic">
            {d}
          </i>
        ))}
      </span>
    </span>
  );
}

/** Só o dígito que muda rola; pontos, vírgulas e "R$" ficam parados. */
export function Odometro({ valor, className }: { valor: string; className?: string }) {
  return (
    <span className={className}>
      <span className="sr-only">{valor}</span>
      <span className="pn-odometro" aria-hidden="true">
        {valor.split("").map((c, i) =>
          /\d/.test(c) ? <Digito key={`${i}-${c}`} valor={Number(c)} /> : <span key={i}>{c}</span>,
        )}
      </span>
    </span>
  );
}
