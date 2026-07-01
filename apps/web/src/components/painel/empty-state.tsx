"use client";

import Link from "next/link";
import { Plus, type LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  ctaLabel,
  ctaHref,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  ctaLabel: string;
  ctaHref: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-breu/10 bg-white/50 px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-iris/10">
        <Icon className="h-7 w-7 text-iris" />
      </span>
      <h3 className="font-display mt-4 text-lg font-bold text-breu">{title}</h3>
      <p className="mt-1.5 max-w-xs text-sm text-aco/60">{description}</p>
      <Link
        href={ctaHref}
        className="mt-5 inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro"
      >
        <Plus className="h-4 w-4" />
        {ctaLabel}
      </Link>
    </div>
  );
}
