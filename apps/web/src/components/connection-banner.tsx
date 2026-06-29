"use client";

import { useEffect, useState } from "react";
import { WifiOff, X } from "lucide-react";
import Link from "next/link";

/**
 * Banner global de desconexão (C3): avisa quando o WhatsApp cai sem que o
 * lojista perceba — senão ele acha que está captando leads e não está.
 * Só aparece depois de já ter visto uma conexão viva (evita falso alarme no boot)
 * e pode ser dispensado até a próxima queda.
 */
export function ConnectionBanner() {
  const [live, setLive] = useState<boolean | null>(null);
  const [sawLive, setSawLive] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const load = () =>
      fetch("/api/session")
        .then((r) => r.json())
        .then((d) => {
          const isLive = !!d.live;
          setLive(isLive);
          if (isLive) {
            setSawLive(true);
            setDismissed(false); // rearma o aviso para a próxima queda
          }
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);

  // Só alerta uma queda real (já esteve vivo) e não dispensado.
  if (live !== false || !sawLive || dismissed) return null;

  return (
    <div className="flex items-center gap-3 border-b border-alerta/20 bg-alerta/[0.06] px-4 py-2.5 text-sm text-alerta">
      <WifiOff className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-breu/80">
        <strong className="text-breu">WhatsApp desconectado.</strong> Você não está captando entradas nem enviando
        boas-vindas. Rode a engine e reconecte.
      </span>
      <Link href="/settings" className="shrink-0 font-medium text-alerta underline hover:opacity-80">
        Reconectar
      </Link>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dispensar aviso"
        className="shrink-0 rounded p-0.5 text-alerta hover:bg-alerta/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
