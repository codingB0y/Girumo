import { cn } from "@/lib/utils";

/**
 * Bloco de carregamento que "respira" (organismo aguardando, não scanner).
 * Use `className` p/ tamanho/forma e `style={{ "--i": n }}` p/ dessincronizar
 * blocos irmãos — ex.: <Skeleton className="h-4 w-40" style={{ "--i": 2 }} />.
 * Evita o "pisca vazio" no 1º fetch das telas client (ver docs/UI_RULES.md).
 */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={cn("pn-skeleton rounded-md", className)} style={style} />;
}
