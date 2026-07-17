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
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-panel)] border border-dashed border-line-200 bg-paper-0 px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-card)] bg-canvas-100">
        <Icon className="h-7 w-7 text-cobalt-500 [stroke-width:var(--icon-stroke)]" />
      </span>
      <h3 className="type-h3 mt-4 text-volt-950">{title}</h3>
      <p className="type-body-s mt-1.5 max-w-xs text-slate-600">{description}</p>
      <Link
        href={ctaHref}
        className="mt-5 inline-flex h-[var(--control-height-prominent)] items-center gap-2 rounded-[var(--radius-control)] bg-acid-500 px-5 text-sm font-semibold text-volt-950 shadow-sm transition-[filter] duration-[var(--duration-micro)] ease-[var(--ease-girumo)] hover:brightness-95 active:brightness-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
      >
        <Plus className="h-4 w-4 [stroke-width:var(--icon-stroke)]" />
        {ctaLabel}
      </Link>
    </div>
  );
}
