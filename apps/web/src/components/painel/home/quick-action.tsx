"use client";

import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";

export function QuickAction({ href, icon: Icon, label }: { href: string; icon: LucideIcon; label: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl px-4 py-3 transition-colors duration-[160ms] hover:bg-poco"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cobalt-500/10 text-cobalt-500">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="text-sm font-medium text-volt-950">{label}</span>
      <ArrowUpRight className="ml-auto h-4 w-4 text-aco/30 transition-transform duration-[160ms] ease-[var(--ease-fluxo)] group-hover:translate-x-0.5 group-hover:text-cobalt-500" />
    </Link>
  );
}
