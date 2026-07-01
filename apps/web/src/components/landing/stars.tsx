import { Star, StarHalf } from "lucide-react";

/** Estrelas com meia-estrela — nota de 0 a 5 (ex.: 4.5). */
export function Stars({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <div className="flex items-center gap-1" aria-label={`${rating} de 5 estrelas`}>
      <div className="flex gap-0.5 text-amber-400">
        {Array.from({ length: 5 }).map((_, i) => {
          if (i < full) return <Star key={i} className="h-4 w-4 fill-current" />;
          if (i === full && half) return <StarHalf key={i} className="h-4 w-4 fill-current" />;
          return <Star key={i} className="h-4 w-4 text-white/15" />;
        })}
      </div>
      <span className="font-data text-xs text-bruma/45">{rating.toFixed(1)}</span>
    </div>
  );
}
