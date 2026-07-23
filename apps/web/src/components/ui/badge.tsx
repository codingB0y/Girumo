import { cn } from "@/lib/utils";

type Tone = "green" | "blue" | "amber" | "red" | "slate" | "brand";

const tones: Record<Tone, string> = {
  green: "bg-success-700/10 text-success-700 ring-1 ring-inset ring-success-700/15",
  blue: "bg-info-700/10 text-info-700 ring-1 ring-inset ring-info-700/15",
  amber: "bg-warning-700/10 text-warning-700 ring-1 ring-inset ring-warning-700/15",
  red: "bg-danger-700/10 text-danger-700 ring-1 ring-inset ring-danger-700/15",
  slate: "bg-canvas-100 text-slate-600 ring-1 ring-inset ring-line-200",
  brand: "bg-cobalt-500/10 text-cobalt-700 ring-1 ring-inset ring-cobalt-500/15",
};

export function Badge({
  tone = "slate",
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "type-label inline-flex items-center gap-1 rounded-full px-2.5 py-0.5",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
