"use client";

import Link from "next/link";
import { MessageCircle } from "lucide-react";

/**
 * Casca compartilhada das telas de auth (login/signup). Mantém a linguagem
 * futurista da landing — fundo escuro com grade técnica + aurora — e a marca.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-[#0b0718] px-4 py-10">
      {/* grade técnica + aurora (mesma linguagem da landing) */}
      <div className="dz-grid-dark pointer-events-none absolute inset-0" />
      <div className="dz-aurora pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-brand-600/30 blur-[120px]" />
      <div className="dz-aurora-slow pointer-events-none absolute -bottom-40 -right-20 h-[28rem] w-[28rem] rounded-full bg-emerald-500/20 blur-[120px]" />

      <div className="dz-rise relative z-10 w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link
            href="/"
            className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-700 text-white shadow-brand transition hover:-translate-y-0.5"
          >
            <MessageCircle className="h-7 w-7" />
          </Link>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-400">HUBFLOW</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-white">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>

        <div className="dz-border-glow rounded-2xl border border-white/10 bg-white p-6 shadow-2xl shadow-black/40">
          {children}
        </div>

        {footer && <div className="mt-5 text-center text-sm text-slate-400">{footer}</div>}
        <p className="mt-6 text-center text-xs text-slate-500">WhatsApp Growth OS</p>
      </div>
    </div>
  );
}
