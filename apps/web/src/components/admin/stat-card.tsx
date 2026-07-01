import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  red: "bg-red-50 text-red-600",
  purple: "bg-iris/10 text-iris",
  slate: "bg-slate-100 text-slate-600",
};

type Props = {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: keyof typeof tones;
  hint?: string;
  delta?: string;
};

export function AdminStatCard({ label, value, icon: Icon, tone = "blue", hint, delta }: Props) {
  return (
    <div className="rounded-2xl border border-breu/[0.06] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", tones[tone])}>
          <Icon className="h-5 w-5" />
        </span>
        {delta && (
          <span className="font-data rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-600">
            {delta}
          </span>
        )}
      </div>
      <p className="mt-3 font-display text-2xl font-extrabold tracking-tight text-breu">{value}</p>
      <p className="font-data mt-1 text-xs uppercase tracking-wider text-aco/55">{label}</p>
      {hint && <p className="mt-1 text-[11px] text-aco/45">{hint}</p>}
    </div>
  );
}
