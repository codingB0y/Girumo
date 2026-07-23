import { BRAND } from "@/lib/brand";
import { GIRUMO_PATHS, GIRUMO_VIEWBOX } from "@/lib/girumo-symbol";
import {
  GIRUMO_WORDMARK_ASPECT_RATIO,
  GIRUMO_WORDMARK_PATHS,
  GIRUMO_WORDMARK_VIEWBOX,
} from "@/lib/girumo-wordmark";
import { cn } from "@/lib/utils";
import React from "react";

export function LogoSymbol({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox={GIRUMO_VIEWBOX}
      className={className}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      {GIRUMO_PATHS.map((d) => (
        <path key={d} d={d} fill="currentColor" />
      ))}
    </svg>
  );
}

export function Logo({
  className,
  symbolClassName,
  wordmarkClassName,
  title = BRAND.name,
}: {
  className?: string;
  symbolClassName?: string;
  wordmarkClassName?: string;
  title?: string | null;
}) {
  return (
    <span
      className={cn("inline-flex items-center gap-[0.28em]", className)}
      role={title ? "img" : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title === null ? true : undefined}
    >
      <LogoSymbol
        className={cn(
          "relative top-[-0.015em] h-[1.06em] w-[1.06em] text-current",
          symbolClassName,
        )}
      />
      <svg
        viewBox={GIRUMO_WORDMARK_VIEWBOX}
        aria-hidden="true"
        className={cn("h-[1em] fill-current", wordmarkClassName)}
        style={{ width: `${GIRUMO_WORDMARK_ASPECT_RATIO}em` }}
      >
        {GIRUMO_WORDMARK_PATHS.map((glyph) => (
          <path
            key={`${glyph.d}-${glyph.transform}`}
            d={glyph.d}
            transform={glyph.transform}
            data-girumo-wordmark-path=""
          />
        ))}
      </svg>
    </span>
  );
}
