"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Sun,
  Layers,
  Users,
  UserPlus,
  TrendingUp,
  Settings,
  Sparkles,
  PanelsTopLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/logo";
import { usePanelSession } from "@/components/painel/session-provider";

const NAV_ITEMS = [
  { href: "/painel", label: "Início", icon: Sun },
  { href: "/painel/campanhas", label: "Campanhas", icon: Layers },
  { href: "/painel/grupos", label: "Grupos", icon: Users },
  { href: "/painel/contatos", label: "Contatos", icon: UserPlus },
  { href: "/painel/pages", label: "Páginas", icon: PanelsTopLeft },
  { href: "/painel/resultados", label: "Resultados", icon: TrendingUp },
];

const BOTTOM_ITEMS = [
  { href: "/painel/configuracoes", label: "Configurações", icon: Settings },
];

function isActive(pathname: string, href: string) {
  return href === "/painel" ? pathname === href : pathname.startsWith(href);
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: typeof Sun;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm",
        "transition-[color,background-color] duration-[160ms] ease-[var(--ease-fluxo)]",
        active
          ? "pn-ativo font-medium text-canvas-100"
          : "text-canvas-100/55 hover:bg-paper-0/[0.03] hover:text-canvas-100",
      )}
    >
      <Icon
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-transform duration-[160ms] ease-[var(--ease-fluxo)]",
          active ? "text-acid-500" : "text-canvas-100/45 group-hover:translate-x-0.5",
        )}
        strokeWidth={1.75}
      />
      {label}
    </Link>
  );
}

export function PainelSidebar() {
  const pathname = usePathname();
  const { session, loading: sessionLoading } = usePanelSession();
  // null = ainda não sabemos (carregando ou API fora); não é o mesmo que "offline".
  const connected = sessionLoading || !session ? null : session.live;

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-volt-800 bg-volt-950 lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo className="text-paper-0" />
      </div>

      <nav className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {NAV_ITEMS.map(({ href, label, icon }) => (
            <NavItem key={href} href={href} label={label} icon={icon} active={isActive(pathname, href)} />
          ))}
        </div>
      </nav>

      <div className="border-t border-volt-800 px-3 py-4">
        {/* Status de conexão — respira quando conectado; parado = alarme */}
        <Link
          href="/painel/conectar"
          className="mb-2 flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition-colors duration-[var(--duration-micro)] hover:bg-paper-0/[0.03]"
        >
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              connected === null ? "bg-canvas-100/40" : connected ? "bg-success-700 pn-respira" : "bg-danger-700",
            )}
          />
          <span className={cn("text-xs", connected ? "text-canvas-100/60" : "text-canvas-100/80")}>
            {sessionLoading
              ? "Verificando…"
              : !session
                ? "Status indisponível"
                : session.live
                  ? "WhatsApp conectado"
                  : "WhatsApp desconectado"}
          </span>
        </Link>

        <div className="space-y-1">
          {BOTTOM_ITEMS.map(({ href, label, icon }) => (
            <NavItem key={href} href={href} label={label} icon={icon} active={isActive(pathname, href)} />
          ))}
        </div>
      </div>

      {/* Card de plano — Aurora VIP (eco do "VIP" da marca) */}
      <PlanCard />
    </aside>
  );
}

type Subscription = {
  status: string | null;
  cancel_at_period_end: boolean | null;
  plans: { name: string | null; code: string | null } | null;
};

/** Texto de status da assinatura. Só afirma o que veio do banco. */
function planLabel(sub: Subscription): { title: string; detail: string } {
  const planName = sub.plans?.name?.trim() || "Plano ativo";
  switch (sub.status) {
    case "trialing":
      return { title: planName, detail: "Período de teste em andamento." };
    case "past_due":
    case "unpaid":
      return { title: planName, detail: "Pagamento pendente — regularize pra não perder acesso." };
    case "canceled":
      return { title: planName, detail: "Assinatura cancelada." };
    default:
      return {
        title: planName,
        detail: sub.cancel_at_period_end
          ? "Cancela no fim do período atual."
          : "Assinatura ativa.",
      };
  }
}

/**
 * Plano real do tenant. Antes este card dizia "Plano Growth · Grupos VIP
 * ilimitados" para todo mundo, independente da assinatura.
 */
function PlanCard() {
  const [sub, setSub] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/subscription");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!cancelled) setSub(data ?? null);
      } catch {
        if (!cancelled) setSub(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Enquanto carrega, ou quando não há assinatura / a chamada falhou:
  // não inventamos um plano. Sem assinatura, o CTA vira convite pra escolher um.
  if (loading) {
    return (
      <div className="px-3 pb-4">
        <div className="pn-skeleton h-[104px] rounded-2xl" />
      </div>
    );
  }

  const info = sub ? planLabel(sub) : null;

  return (
    <div className="px-3 pb-4">
      <div className="pn-aurora overflow-hidden rounded-2xl p-4">
        <p className="font-data flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-acid-500">
          <Sparkles className="h-3 w-3" /> {info ? info.title : "Sem plano ativo"}
        </p>
        <p className="mt-2 text-xs text-canvas-100/70">
          {info ? info.detail : "Escolha um plano pra liberar todos os recursos."}
        </p>
        <Link
          href="/painel/configuracoes"
          className="mt-3 flex w-full items-center justify-center rounded-[var(--radius-control)] bg-acid-500 py-2 text-xs font-semibold text-volt-950 transition-[filter] duration-[var(--duration-micro)] hover:brightness-95"
        >
          {info ? "Gerenciar plano" : "Ver planos"}
        </Link>
      </div>
    </div>
  );
}
