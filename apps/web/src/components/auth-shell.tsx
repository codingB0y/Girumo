"use client";

import Link from "next/link";
import { CheckCircle2, LockKeyhole, MessageCircle, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

type AuthShellProps = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  context?: string;
  checklist?: string[];
  compact?: boolean;
};

const defaultChecklist = [
  "Crie sua organizacao",
  "Conecte o WhatsApp com a engine",
  "Capture leads e envie ofertas",
];

export function AuthShell({
  title,
  subtitle,
  children,
  footer,
  context,
  checklist = defaultChecklist,
  compact = false,
}: AuthShellProps) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] max-w-6xl items-center gap-8 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="hidden lg:block">
          <Link href="/" className="inline-flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white shadow-brand">
              <MessageCircle className="h-5 w-5" />
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-950">HUBFLOW</span>
              <span className="block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                WhatsApp Growth OS
              </span>
            </span>
          </Link>

          <div className="mt-14 max-w-xl">
            <p className="text-sm font-medium text-brand-700">Operacao de crescimento para WhatsApp</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-normal text-slate-950">
              Entre, conecte a engine e acompanhe tudo em um painel simples.
            </h1>
            <p className="mt-4 text-base leading-7 text-slate-600">
              O HUBFLOW organiza leads, campanhas, membros, planos e logs por tenant para manter cada cliente isolado
              e pronto para operar.
            </p>
          </div>

          <div className="mt-8 grid max-w-xl gap-3">
            {checklist.map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-card">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="text-sm font-medium text-slate-700">{item}</span>
              </div>
            ))}
          </div>
        </section>

        <section className={cn("mx-auto w-full max-w-md", compact && "max-w-sm")}>
          <div className="mb-5 flex items-center gap-3 lg:hidden">
            <Link href="/" className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600 text-white shadow-brand">
              <MessageCircle className="h-5 w-5" />
            </Link>
            <div>
              <p className="text-sm font-semibold text-slate-950">HUBFLOW</p>
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">WhatsApp Growth OS</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-card sm:p-6">
            <div className="mb-5">
              <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                Acesso seguro por organizacao
              </div>
              <h1 className="text-2xl font-semibold tracking-normal text-slate-950">{title}</h1>
              <p className="mt-1 text-sm leading-5 text-slate-500">{subtitle}</p>
              {context && (
                <p className="mt-3 rounded-lg border border-brand-100 bg-brand-50 px-3 py-2 text-sm text-brand-800">
                  {context}
                </p>
              )}
            </div>

            {children}

            <div className="mt-5 flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
              <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span>Seus dados ficam isolados por tenant com Supabase Auth, Postgres RLS e Storage privado.</span>
            </div>
          </div>

          {footer && <div className="mt-5 text-center text-sm text-slate-500">{footer}</div>}
        </section>
      </div>
    </div>
  );
}
