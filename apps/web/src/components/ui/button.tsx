import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "icon";

const variants: Record<Variant, string> = {
  // token-based (bg-iris = var): cobalto no .pn-root do painel, roxo no admin.
  // hover via brightness p/ não depender de hex literal.
  primary:
    "bg-iris text-white shadow-sm hover:brightness-110 active:brightness-95 active:bg-iris-escuro",
  secondary: "bg-breu text-white hover:bg-breu-2 active:bg-breu",
  outline: "border border-breu/15 bg-papel text-breu hover:border-iris/40 hover:text-iris",
  ghost: "text-aco hover:bg-poco hover:text-breu",
  danger: "bg-alerta text-white hover:opacity-90 active:opacity-100",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  icon: "h-9 w-9",
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return (
    <button
      className={cn(
        // física de carimbo: afunda no press (scale), nunca levita no hover
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[10px] font-medium",
        "transition-[background-color,box-shadow,transform] duration-[160ms] ease-[var(--ease-fluxo)]",
        "active:scale-[0.97] active:duration-[90ms] active:ease-[var(--ease-fluxo-snap)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-iris",
        "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
