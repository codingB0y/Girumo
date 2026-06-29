import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "outline" | "ghost" | "danger";
type Size = "sm" | "md" | "icon";

const variants: Record<Variant, string> = {
  primary: "bg-iris text-white shadow-iris hover:bg-iris-claro active:bg-iris-escuro",
  secondary: "bg-breu text-white hover:bg-breu-2 active:bg-breu",
  outline: "border border-breu/15 bg-white text-breu hover:border-iris hover:text-iris",
  ghost: "text-aco hover:bg-bruma hover:text-breu",
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
        "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all duration-200 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris focus-visible:ring-offset-2",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
