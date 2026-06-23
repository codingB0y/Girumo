import { cn } from "@/lib/utils";

type Tone = "green" | "blue" | "amber" | "red" | "slate" | "brand";

const tones: Record<Tone, string> = {
  green: "bg-green-50 text-green-700 ring-1 ring-inset ring-green-600/15",
  blue: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/15",
  amber: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/15",
  red: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/15",
  slate: "bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-500/10",
  brand: "bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-600/15",
};

export function Badge({
  tone = "slate",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
