import { cn } from "@/lib/utils";

type Tone = "green" | "blue" | "amber" | "red" | "slate" | "brand";

const tones: Record<Tone, string> = {
  green: "bg-sucesso/10 text-sucesso ring-1 ring-inset ring-sucesso/15",
  blue: "bg-iris/[0.07] text-iris ring-1 ring-inset ring-iris/15",
  amber: "bg-atencao/10 text-atencao ring-1 ring-inset ring-atencao/15",
  red: "bg-alerta/10 text-alerta ring-1 ring-inset ring-alerta/15",
  slate: "bg-bruma text-aco/60 ring-1 ring-inset ring-breu/[0.06]",
  brand: "bg-iris/10 text-iris-escuro ring-1 ring-inset ring-iris/15",
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
