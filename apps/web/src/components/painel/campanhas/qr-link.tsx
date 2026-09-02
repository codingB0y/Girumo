"use client";

import { useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Download, QrCode, X } from "lucide-react";

/**
 * QR do link mestre — cartaz no balcão, adesivo na sacola. Gerado no cliente
 * (`qrcode.react`), nunca por serviço externo: o link não sai da máquina.
 */
export function QrLink({ url, nome }: { url: string; nome: string }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  function baixar() {
    const canvas = wrap.current?.querySelector("canvas");
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-${nome.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
    a.click();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-volt-950/10 bg-papel px-2.5 py-1.5 text-xs font-medium text-volt-950 transition-colors duration-[160ms] hover:border-cobalt-500/30"
      >
        <QrCode className="h-3.5 w-3.5" /> QR code
      </button>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="QR code do link da campanha"
          className="fixed inset-0 z-40 flex items-center justify-center bg-volt-950/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div className="pn-card w-full max-w-xs rounded-2xl p-6 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-volt-950">Aponte a câmera</p>
              <button type="button" onClick={() => setOpen(false)} aria-label="Fechar" className="text-aco/60 hover:text-volt-950">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div ref={wrap} className="mt-4 inline-block rounded-xl bg-white p-3">
              <QRCodeCanvas value={url} size={512} level="M" marginSize={2} bgColor="#ffffff" fgColor="#071923" style={{ width: 208, height: 208 }} />
            </div>
            <p className="font-data mt-3 break-all text-[11px] text-aco/60">{url}</p>
            <button
              type="button"
              onClick={baixar}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2 text-sm font-medium text-white hover:brightness-110"
            >
              <Download className="h-4 w-4" /> Baixar PNG
            </button>
          </div>
        </div>
      )}
    </>
  );
}
