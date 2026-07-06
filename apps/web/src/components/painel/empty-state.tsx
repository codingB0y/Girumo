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
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-breu/15 bg-papel/60 px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-iris/10">
        <Icon className="h-7 w-7 text-iris" strokeWidth={1.75} />
      </span>
      {/* voz editorial — o produto fala com o lojista */}
      <h3 className="font-editorial mt-4 text-[22px] italic text-breu">{title}</h3>
      <p className="mt-1.5 max-w-xs text-sm text-aco/65">{description}</p>
      <Link
        href={ctaHref}
        className="hf-shine mt-5 inline-flex items-center gap-2 rounded-[10px] bg-iris px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:brightness-110 active:scale-[0.97]"
      >
        <Plus className="h-4 w-4" />
        {ctaLabel}
      </Link>
    </div>
  );
}
