"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";
import {
  PREVIEW_MESSAGE,
  PREVIEW_PATH,
  type PreviewMessage,
} from "@/components/pages/editor/preview-protocol";
import { cn } from "@/lib/utils";

/**
 * Casca do preview ao vivo (v2 e v3): um <iframe> em /editor-preview com
 * viewport próprio — num <div> de 390px numa tela grande o `lg:` continuaria
 * valendo e o preview mobile mentiria. Mobile é o padrão porque é de onde vem o
 * tráfego (§2). A mensagem é opaca pra casca: quem monta é o editor de cada
 * versão, quem interpreta é o frame.
 */

const DEVICES = {
  mobile: { width: 390, height: 780, label: "Celular", icon: Smartphone },
  desktop: { width: 1280, height: 820, label: "Computador", icon: Monitor },
} as const;

type Device = keyof typeof DEVICES;

export function PreviewFrame({ message }: { message: PreviewMessage }) {
  const [device, setDevice] = useState<Device>("mobile");
  const [scale, setScale] = useState(1);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const { width, height } = DEVICES[device];

  const post = useCallback((next: PreviewMessage) => {
    frameRef.current?.contentWindow?.postMessage(next, window.location.origin);
  }, []);

  // O frame avisa quando montou; só então o primeiro estado tem pra onde ir.
  useEffect(() => {
    function onReady(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      const data = event.data as PreviewMessage | undefined;
      if (data?.type === PREVIEW_MESSAGE && data.ready) post(message);
    }
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [post, message]);

  useEffect(() => post(message), [post, message]);

  // A moldura tem largura real (390/1280) e é reduzida pra caber na coluna —
  // encolher o iframe em vez de escalar mudaria o viewport e, com ele, o layout.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const fit = () => setScale(Math.min(1, box.clientWidth / width));
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(box);
    return () => observer.disconnect();
  }, [width]);

  const DeviceIcon = DEVICES[device].icon;

  return (
    // `min-w-0`: o iframe tem largura REAL e o `transform: scale` só encolhe o
    // pixel, não o espaço ocupado — sem isso a coluna do form é esmagada.
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs text-aco/50">
          <DeviceIcon className="h-3.5 w-3.5" aria-hidden />
          Prévia ao vivo — não salva nada
        </p>
        <div
          className="flex gap-1 rounded-xl border border-volt-950/[0.08] bg-white p-1"
          role="radiogroup"
          aria-label="Tamanho da tela na prévia"
        >
          {(Object.keys(DEVICES) as Device[]).map((key) => {
            const Icon = DEVICES[key].icon;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={device === key}
                onClick={() => setDevice(key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs transition",
                  device === key ? "bg-canvas-100 font-medium text-volt-950" : "text-aco/60 hover:text-volt-950",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {DEVICES[key].label}
              </button>
            );
          })}
        </div>
      </div>

      <div
        ref={boxRef}
        className="overflow-hidden rounded-2xl border border-volt-950/[0.08] bg-canvas-100/50"
        style={{ height: height * scale }}
      >
        <iframe
          ref={frameRef}
          src={PREVIEW_PATH}
          title="Prévia da página"
          width={width}
          height={height}
          className="origin-top-left border-0 bg-white"
          style={{ transform: `scale(${scale})` }}
        />
      </div>
    </div>
  );
}
