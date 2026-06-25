import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "icon";

const variants: Record<Variant, string> = {
  primary:
    "bg-brand-600 text-white shadow-brand hover:bg-brand-700 active:bg-brand-800",
  secondary: "bg-slate-900 text-white hover:bg-slate-800 active:bg-slate-950",
  outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
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
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300 focus-visible:ring-offset-1",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
