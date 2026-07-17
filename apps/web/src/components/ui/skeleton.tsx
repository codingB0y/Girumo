import { cn } from "@/lib/utils";

export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-[var(--radius-control)] bg-line-200 motion-reduce:animate-none",
        className,
      )}
      style={style}
    />
  );
}
