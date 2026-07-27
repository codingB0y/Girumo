"use client";

import Link from "next/link";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { BRAND } from "@/lib/brand";

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
  "Crie sua conta em segundos",
  "Conecte seu WhatsApp pelo QR Code",
  "Envie ofertas para todos os grupos sem repetir o trabalho",
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
    <div className="relative min-h-screen overflow-hidden bg-volt-950 text-canvas-100">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed bottom-[8%] left-[42%] hidden h-32 w-40 translate-x-6 border border-volt-800 bg-volt-900 lg:block"
      />

      <div className="relative z-10 flex min-h-screen">
        {/* Left panel — branding */}
        <section className="hidden w-1/2 flex-col justify-between p-12 lg:flex xl:p-16">
          <Link href="/" aria-label="Voltar ao início">
            <Logo className="text-2xl text-paper-0" />
          </Link>

          <div className="max-w-lg">
            <h1 className="type-display-l max-w-md tracking-[-0.03em] text-canvas-100">
              {BRAND.functionalLine}
            </h1>
            <p className="type-body-m mt-5 max-w-md text-canvas-100/70">
              A Girumo organiza grupos, campanhas e agendamentos enquanto você foca no atendimento e nas vendas.
            </p>

            <div className="mt-10 space-y-3">
              {checklist.map((item) => (
                <div
                  key={item}
                  className="flex items-center gap-3 rounded-[var(--radius-card)] border border-volt-800 bg-volt-900 px-4 py-3"
                >
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-acid-500" />
                  <span className="type-body-s font-medium text-canvas-100/85">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="type-data text-canvas-100/45">
            © {new Date().getFullYear()} {BRAND.emailFooter}
          </p>
        </section>

        {/* Right panel — form */}
        <section className="flex w-full items-center justify-center px-4 py-8 lg:w-1/2 lg:px-12">
          <div className={cn("w-full", compact ? "max-w-sm" : "max-w-md")}>
            {/* Mobile logo */}
            <div className="mb-8 lg:hidden">
              <Link href="/" aria-label="Voltar ao início">
                <Logo className="text-xl text-paper-0" />
              </Link>
            </div>

            <div className="overflow-hidden rounded-[var(--radius-card)] border border-volt-800 bg-volt-900">
              <div className="p-6 sm:p-8">
                <div className="mb-6">
                  <h2 className="type-h2 tracking-tight text-canvas-100">{title}</h2>
                  <p className="type-body-s mt-1.5 text-canvas-100/60">{subtitle}</p>
                  {context && (
                    <p className="type-body-s mt-3 rounded-[var(--radius-control)] border border-cobalt-500/40 bg-cobalt-500/10 px-3 py-2 text-canvas-100">
                      {context}
                    </p>
                  )}
                </div>

                {children}

                <div className="type-label mt-6 flex items-start gap-2 rounded-[var(--radius-control)] border border-volt-800 bg-volt-950 px-3 py-2.5 font-normal text-canvas-100/55">
                  <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-canvas-100/45" />
                  <span>Seus dados ficam protegidos. Só você tem acesso. Cancele quando quiser.</span>
                </div>
              </div>
            </div>

            {footer && <div className="type-body-s mt-5 text-center text-canvas-100/60">{footer}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
