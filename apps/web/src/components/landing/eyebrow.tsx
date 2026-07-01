import { cn } from "@/lib/utils";

export function Eyebrow({
  n,
  children,
  center,
}: {
  n?: string;
  children: React.ReactNode;
  center?: boolean;
}) {
  return (
    <p
      className={cn(
        "font-data mb-4 flex items-center gap-2.5 text-xs uppercase tracking-[0.2em] text-bruma/50",
        center && "justify-center",
      )}
    >
      {n && <span className="text-iris-claro">{n}</span>}
      <span className="h-px w-8 bg-current opacity-40" />
      {children}
    </p>
  );
}
