"use client";

import Link from "next/link";
import { CheckCircle2, LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo, LogoSymbol } from "@/components/landing/logo";

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
  "Dispare ofertas para todos os grupos",
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
    <div className="min-h-screen bg-breu">
      {/* Background gradient */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-iris/20 blur-[120px]" />
        <div className="absolute -bottom-40 -right-40 h-[400px] w-[400px] rounded-full bg-iris/10 blur-[100px]" />
      </div>

      <div className="relative z-10 flex min-h-screen">
        {/* Left panel — branding */}
        <section className="hidden w-1/2 flex-col justify-between p-12 lg:flex xl:p-16">
          <Link href="/" aria-label="Voltar ao início">
            <Logo symbolClassName="h-8 w-8" wordmarkClassName="text-white text-2xl" />
          </Link>

          <div className="max-w-lg">
            <h1 className="font-display text-4xl font-extrabold leading-tight tracking-[-0.03em] text-white xl:text-5xl">
              Todos os seus grupos.
              <br />
              <span className="text-iris-claro">Um clique só.</span>
            </h1>
            <p className="mt-5 text-base leading-relaxed text-bruma/60">
              O HubFlow cuida dos disparos, agendamentos e monitoramento dos seus grupos — enquanto você foca em vender.
            </p>

            <div className="mt-10 space-y-3">
              {checklist.map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.04] px-4 py-3 backdrop-blur-sm">
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-iris-claro" />
                  <span className="text-sm font-medium text-bruma/80">{item}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="font-data text-[11px] text-bruma/30">
            © {new Date().getFullYear()} HubFlow · WhatsApp Growth OS
          </p>
        </section>

        {/* Right panel — form */}
        <section className="flex w-full items-center justify-center px-4 py-8 lg:w-1/2 lg:px-12">
          <div className={cn("w-full", compact ? "max-w-sm" : "max-w-md")}>
            {/* Mobile logo */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <Link href="/" aria-label="Voltar ao início">
                <LogoSymbol className="h-9 w-9 text-iris-claro" />
              </Link>
              <div>
                <p className="font-display text-base font-extrabold text-white">HubFlow</p>
                <p className="font-data text-[10px] uppercase tracking-[0.15em] text-bruma/40">WhatsApp Growth OS</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.03] shadow-deep backdrop-blur-xl">
              <div className="p-6 sm:p-8">
                <div className="mb-6">
                  <h2 className="font-display text-2xl font-extrabold tracking-tight text-white">{title}</h2>
                  <p className="mt-1.5 text-sm text-bruma/50">{subtitle}</p>
                  {context && (
                    <p className="mt-3 rounded-lg border border-iris/20 bg-iris/[0.08] px-3 py-2 text-sm text-iris-claro">
                      {context}
                    </p>
                  )}
                </div>

                {children}

                <div className="mt-6 flex items-start gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 text-xs leading-5 text-bruma/40">
                  <LockKeyhole className="mt-0.5 h-3.5 w-3.5 shrink-0 text-bruma/30" />
                  <span>Seus dados ficam protegidos. Só você tem acesso. Cancele quando quiser.</span>
                </div>
              </div>
            </div>

            {footer && <div className="mt-5 text-center text-sm text-bruma/50">{footer}</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
