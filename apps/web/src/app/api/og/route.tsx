import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";
import { BRAND, BRAND_COLORS } from "@/lib/brand";

export const runtime = "nodejs";

const FONT_URLS = {
  manrope: "https://fonts.gstatic.com/s/manrope/v20/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk4aE-_F.ttf",
  plexMono: "https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf",
} as const;

let fontsCache: { manrope: ArrayBuffer; plexMono: ArrayBuffer } | null = null;

async function loadFonts() {
  if (fontsCache) return fontsCache;
  const [manrope, plexMono] = await Promise.all([
    fetch(FONT_URLS.manrope).then((r) => r.arrayBuffer()),
    fetch(FONT_URLS.plexMono).then((r) => r.arrayBuffer()),
  ]);
  fontsCache = { manrope, plexMono };
  return fontsCache;
}

// GET /api/og — cartão de resultado compartilhável.
// Params: stat (número), label (legenda), title (chamada), loja (nome).
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const stat = (searchParams.get("stat") ?? "").slice(0, 12);
  const label = (searchParams.get("label") ?? "").slice(0, 60);
  const title = (searchParams.get("title") ?? "Um marco alcançado 🎉").slice(0, 80);
  const loja = (searchParams.get("loja") ?? "").slice(0, 40);
  const fonts = await loadFonts();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BRAND_COLORS.volt,
          padding: "72px",
          fontFamily: "Manrope",
        }}
      >
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: BRAND_COLORS.acid, letterSpacing: "-0.02em" }}>
          {title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
          <div style={{ display: "flex", fontFamily: "PlexMono", fontSize: 220, lineHeight: 1, color: BRAND_COLORS.paper }}>
            {stat || "•"}
          </div>
          {label ? (
            <div style={{ display: "flex", fontSize: 40, color: BRAND_COLORS.canvas, marginTop: 12 }}>{label}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 28, color: BRAND_COLORS.canvas }}>
          <div style={{ display: "flex", fontWeight: 700 }}>{loja ? `${loja} · ` : ""}{BRAND.name}</div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Manrope", data: fonts.manrope, weight: 700, style: "normal" },
        { name: "PlexMono", data: fonts.plexMono, weight: 400, style: "normal" },
      ],
    },
  );
}
