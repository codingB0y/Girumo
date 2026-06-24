import { cn } from "@/lib/utils";

/**
 * Bloco de carregamento (pulse). Use `className` p/ definir tamanho/forma —
 * ex.: <Skeleton className="h-4 w-40" /> ou <Skeleton className="h-10 w-10 rounded-full" />.
 * Evita o "pisca vazio" no 1º fetch das telas client (ver docs/UI_RULES.md).
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-slate-200/70", className)} />;
}
