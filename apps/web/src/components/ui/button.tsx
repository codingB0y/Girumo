import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "lg" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-acid-500 text-volt-950 shadow-sm hover:brightness-95 active:brightness-90",
  secondary: "bg-volt-950 text-paper-0 hover:bg-volt-900 active:bg-volt-800",
  outline:
    "border border-line-200 bg-paper-0 text-volt-950 hover:border-cobalt-500 hover:text-cobalt-700",
  ghost: "text-slate-600 hover:bg-canvas-100 hover:text-volt-950",
  danger: "bg-danger-700 text-paper-0 hover:brightness-95 active:brightness-90",
};

const sizes: Record<Size, string> = {
  sm: "h-[var(--control-height)] px-3 text-sm",
  md: "h-[var(--control-height)] px-4 text-sm",
  lg: "h-[var(--control-height-prominent)] px-5 text-base",
  icon: "h-[var(--control-height)] w-[var(--control-height)]",
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
        "inline-flex cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold",
        "transition-[background-color,box-shadow,filter] duration-[var(--duration-micro)] ease-[var(--ease-girumo)]",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500",
        "disabled:pointer-events-none disabled:opacity-45 disabled:shadow-none",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
