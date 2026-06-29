"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** Exibe um link da campanha/grupo com botão de copiar (feedback "copiado"). */
export function CopyLink({ url, className }: { url: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url.startsWith("http") ? url : `https://${url}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponível — ignora */
    }
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <span className="font-data truncate text-xs text-iris">{url}</span>
      <button
        onClick={copy}
        aria-label="Copiar link"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-aco/40 transition hover:bg-iris/10 hover:text-iris"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-sucesso" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}
