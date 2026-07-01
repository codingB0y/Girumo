import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function Cta({
  href,
  children,
  size = "md",
  className,
}: {
  href: string;
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const sizes = {
    sm: "px-4 py-2 text-sm",
    md: "px-5 py-2.5 text-sm",
    lg: "px-7 py-3.5 text-base",
  };
  return (
    <a
      href={href}
      className={cn(
        "hf-shine group inline-flex items-center justify-center gap-2 rounded-xl bg-iris font-medium text-white shadow-iris transition hover:-translate-y-0.5 hover:bg-iris-claro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iris focus-visible:ring-offset-2 focus-visible:ring-offset-breu",
        sizes[size],
        className,
      )}
    >
      {children}
      <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
    </a>
  );
}
