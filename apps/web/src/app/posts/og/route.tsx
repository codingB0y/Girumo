import { ImageResponse } from "@vercel/og";
import type { NextRequest } from "next/server";
import type { ReactNode } from "react";
import { BRAND, BRAND_COLORS } from "@/lib/brand";
import { GIRUMO_PATHS } from "@/lib/girumo-symbol";
import { resolvePostFormat } from "../post-formats";

export const runtime = "nodejs";

type ResolvedPostFormat = ReturnType<typeof resolvePostFormat>;
type Surface = "dark" | "light" | "impact";

const FONT_URLS = {
  manrope: "https://fonts.gstatic.com/s/manrope/v20/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk4aE-_F.ttf",
  plexSans:
    "https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD6llzAA.ttf",
  plexMono: "https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf",
} as const;

let fontsCache: { manrope: ArrayBuffer; plexSans: ArrayBuffer; plexMono: ArrayBuffer } | null = null;

async function fetchFont(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Falha ao carregar fonte social: ${response.status}`);
  return response.arrayBuffer();
}

async function loadFonts() {
  if (fontsCache) return fontsCache;
  const [manrope, plexSans, plexMono] = await Promise.all([
    fetchFont(FONT_URLS.manrope),
    fetchFont(FONT_URLS.plexSans),
    fetchFont(FONT_URLS.plexMono),
  ]);
  fontsCache = { manrope, plexSans, plexMono };
  return fontsCache;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const template = searchParams.get("t") || "1.1-capa";
  const format = resolvePostFormat(searchParams.get("format"));
  const fonts = await loadFonts();

  return new ImageResponse(getSlideContent(template, format), {
    width: format.width,
    height: format.height,
    fonts: [
      { name: "Manrope", data: fonts.manrope, weight: 700, style: "normal" },
      { name: "PlexSans", data: fonts.plexSans, weight: 400, style: "normal" },
      { name: "PlexMono", data: fonts.plexMono, weight: 400, style: "normal" },
    ],
  });
}

function getSlideContent(template: string, format: ResolvedPostFormat) {
  switch (template) {
    case "1.1-problema":
      return ProductMessage({
        format,
        eyebrow: "ROTINA MANUAL",
        title: "Abrir. Colar. Enviar. Repetir.",
        body: "Quando a novidade precisa entrar grupo por grupo, sua manhã vira operação — e não venda.",
      });
    case "1.1-solucao":
      return ProductMessage({
        format,
        eyebrow: "GIRUMO CAMPANHAS",
        title: "Publique a novidade em todos os grupos de uma vez.",
        body: "Prepare texto, vídeo ou áudio, escolha os grupos e deixe o envio programado.",
      });
    case "1.1-cta":
      return ProductMessage({
        format,
        eyebrow: "MENOS REPETIÇÃO",
        title: BRAND.functionalLine,
        body: "Captação, grupos e campanhas na mesma operação. Conheça a Girumo no link da bio.",
      });
    case "1.2-confessa":
      return VideoThumbnail({
        format,
        kicker: "PERGUNTA DE LOJISTA",
        title: "Quantos grupos ficaram sem novidade hoje?",
        detail: "Se depende de copiar e colar, sempre sobra trabalho — e pode faltar venda.",
      });
    case "2.2-sabia":
      return ProductMessage({
        format,
        eyebrow: "GIRUMO GRUPOS",
        title: "Grupo lotou? O próximo entra em operação.",
        body: "A página de captação direciona o cliente para um grupo disponível e mantém o fluxo em andamento.",
      });
    case "2.3-capa":
      return VideoThumbnail({
        format,
        kicker: "OPERAÇÃO PROGRAMADA",
        title: "5 tarefas que continuam rodando sem você repetir trabalho.",
        detail: "Da entrada no grupo à leitura dos resultados.",
      });
    case "2.3-01":
      return ProductMessage({
        format,
        index: "01",
        eyebrow: "CAMPANHAS",
        title: "Envia para todos os grupos de uma vez.",
        body: "Uma campanha preparada, os grupos certos e a publicação no horário combinado.",
      });
    case "2.3-02":
      return ProductMessage({
        format,
        index: "02",
        eyebrow: "AGENDA",
        title: "Programa a semana antes da correria começar.",
        body: "Deixe a grade, a reposição e a novidade prontas para entrar na hora certa.",
      });
    case "2.3-03":
      return ProductMessage({
        format,
        index: "03",
        eyebrow: "GRUPOS",
        title: "Organiza a passagem quando um grupo enche.",
        body: "O próximo cliente encontra espaço sem depender de você trocar o link na mão.",
      });
    case "2.3-04":
      return ProductMessage({
        format,
        index: "04",
        eyebrow: "GESTÃO",
        title: "Atualiza nome e foto sem entrar grupo por grupo.",
        body: "Mantenha a comunicação da campanha alinhada em toda a operação.",
      });
    case "2.3-05":
      return ProductMessage({
        format,
        index: "05",
        eyebrow: "RESULTADOS",
        title: "Mostra de onde vieram clientes e pedidos.",
        body: "Leia grupos, páginas e campanhas para decidir onde colocar seu próximo esforço.",
      });
    case "2.3-cta":
      return ProductMessage({
        format,
        eyebrow: "GIRUMO",
        title: BRAND.tagline,
        body: "Veja como a operação funciona no link da bio.",
      });
    case "3.1-numero":
      return FounderProof({ format });
    case "4.1-semdesculpa":
      return ProductMessage({
        format,
        eyebrow: "COMEÇO DIRETO",
        title: "Seu número. Seus grupos. Sua operação mais organizada.",
        body: "Conecte o WhatsApp, escolha os grupos e prepare a primeira campanha.",
      });
    case "4.2-quanto":
      return MetricCard({
        format,
        value: "12 mil+",
        label: "pessoas reunidas em 50+ grupos",
        note: "Operação fundadora Mega Stock",
      });
    case "5.2-dado":
      return MetricCard({
        format,
        value: "+20 mil",
        label: "peças vendidas em um evento de 2 dias",
        note: "Operação fundadora Mega Stock",
      });
    case "1.1-capa":
    default:
      return VideoThumbnail({
        format,
        kicker: "ROTINA DE ATACADO",
        title: "40 grupos. A mesma oferta. Todo dia.",
        detail: "O trabalho repetido não precisa mandar na sua manhã.",
      });
  }
}

function BrandMark({ color, compact = false }: { color: string; compact?: boolean }) {
  const size = compact ? 38 : 46;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: compact ? 12 : 16, color }}>
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
        {GIRUMO_PATHS.map((d) => (
          <path key={d} d={d} fill={color} />
        ))}
      </svg>
      <span style={{ fontFamily: "Manrope", fontSize: compact ? 25 : 31, fontWeight: 700, letterSpacing: "-0.03em" }}>
        {BRAND.name}
      </span>
    </div>
  );
}

function Frame({
  format,
  surface,
  children,
}: {
  format: ResolvedPostFormat;
  surface: Surface;
  children: ReactNode;
}) {
  const landscape = format.key === "videoCover";
  const story = format.key === "story";
  const paddingX = landscape ? 96 : story ? 82 : 68;
  const paddingY = landscape ? 66 : story ? 86 : 64;
  const background =
    surface === "impact" ? BRAND_COLORS.acid : surface === "light" ? BRAND_COLORS.canvas : BRAND_COLORS.volt;
  const foreground = surface === "dark" ? BRAND_COLORS.paper : BRAND_COLORS.volt;
  const accent = surface === "impact" ? BRAND_COLORS.paper : BRAND_COLORS.acid;

  return (
    <div
      style={{
        width: format.width,
        height: format.height,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
        background,
        color: foreground,
        padding: `${paddingY}px ${paddingX}px`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: paddingY,
          right: 0,
          width: landscape ? 260 : 168,
          height: 14,
          background: accent,
        }}
      />
      <div
        style={{
          position: "absolute",
          right: landscape ? 128 : 64,
          bottom: landscape ? 118 : story ? 212 : 116,
          width: landscape ? 170 : 118,
          height: landscape ? 170 : 118,
          border: `2px solid ${surface === "dark" ? BRAND_COLORS.volt800 : BRAND_COLORS.volt}`,
        }}
      />
      <div style={{ display: "flex", position: "relative", zIndex: 2 }}>
        <BrandMark color={foreground} compact={landscape} />
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          position: "relative",
          zIndex: 2,
          padding: landscape ? "30px 0" : story ? "76px 0" : "42px 0",
        }}
      >
        {children}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          position: "relative",
          zIndex: 2,
          color: foreground,
        }}
      >
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: landscape ? 16 : 14,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          Grupos de WhatsApp para atacado
        </span>
        <span style={{ fontFamily: "PlexSans", fontSize: landscape ? 20 : 17 }}>{BRAND.functionalLine}</span>
      </div>
    </div>
  );
}

function ProductMessage({
  format,
  eyebrow,
  title,
  body,
  index,
}: {
  format: ResolvedPostFormat;
  eyebrow: string;
  title: string;
  body: string;
  index?: string;
}) {
  const landscape = format.key === "videoCover";
  const story = format.key === "story";
  return (
    <Frame format={format} surface="dark">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          width: landscape ? 1320 : story ? 820 : 860,
          maxWidth: "100%",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18, marginBottom: story ? 48 : 34 }}>
          {index ? (
            <span style={{ fontFamily: "PlexMono", fontSize: landscape ? 30 : 26, color: BRAND_COLORS.acid }}>
              {index}
            </span>
          ) : null}
          <span
            style={{
              fontFamily: "PlexMono",
              fontSize: landscape ? 18 : 16,
              letterSpacing: "0.16em",
              color: BRAND_COLORS.acid,
            }}
          >
            {eyebrow}
          </span>
        </div>
        <span
          style={{
            fontFamily: "Manrope",
            fontSize: landscape ? 82 : story ? 78 : format.key === "square" ? 62 : 70,
            fontWeight: 700,
            letterSpacing: "-0.045em",
            lineHeight: 1.02,
            color: BRAND_COLORS.paper,
          }}
        >
          {title}
        </span>
        <div style={{ display: "flex", width: landscape ? 92 : 72, height: 12, background: BRAND_COLORS.acid, marginTop: 38 }} />
        <span
          style={{
            fontFamily: "PlexSans",
            fontSize: landscape ? 31 : story ? 31 : 27,
            lineHeight: 1.38,
            color: BRAND_COLORS.canvas,
            marginTop: 30,
            maxWidth: landscape ? 1060 : 760,
          }}
        >
          {body}
        </span>
      </div>
    </Frame>
  );
}

function VideoThumbnail({
  format,
  kicker,
  title,
  detail,
}: {
  format: ResolvedPostFormat;
  kicker: string;
  title: string;
  detail: string;
}) {
  const landscape = format.key === "videoCover";
  const story = format.key === "story";
  return (
    <Frame format={format} surface="impact">
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          width: landscape ? 1380 : 850,
          maxWidth: "100%",
        }}
      >
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: landscape ? 18 : 16,
            letterSpacing: "0.16em",
            color: BRAND_COLORS.volt,
            border: `2px solid ${BRAND_COLORS.volt}`,
            padding: "10px 15px",
            marginBottom: story ? 58 : 38,
          }}
        >
          {kicker}
        </span>
        <span
          style={{
            fontFamily: "Manrope",
            fontSize: landscape ? 96 : story ? 88 : format.key === "square" ? 72 : 80,
            fontWeight: 700,
            letterSpacing: "-0.05em",
            lineHeight: 0.98,
            color: BRAND_COLORS.volt,
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontFamily: "PlexSans",
            fontSize: landscape ? 31 : story ? 32 : 27,
            lineHeight: 1.35,
            color: BRAND_COLORS.volt,
            marginTop: story ? 50 : 36,
            maxWidth: landscape ? 980 : 700,
          }}
        >
          {detail}
        </span>
      </div>
    </Frame>
  );
}

function FounderProof({ format }: { format: ResolvedPostFormat }) {
  const landscape = format.key === "videoCover";
  const story = format.key === "story";
  const metrics = [
    ["R$ 5 mil → R$ 350 mil", "faturamento mensal"],
    ["12 mil+", "pessoas nos grupos"],
    ["50+", "grupos na operação"],
  ] as const;

  return (
    <Frame format={format} surface="light">
      <div style={{ display: "flex", flexDirection: "column", width: "100%", alignItems: "flex-start" }}>
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: landscape ? 18 : 16,
            letterSpacing: "0.16em",
            color: BRAND_COLORS.volt,
          }}
        >
          OPERAÇÃO FUNDADORA · MEGA STOCK
        </span>
        <span
          style={{
            fontFamily: "Manrope",
            fontSize: landscape ? 66 : story ? 72 : 58,
            fontWeight: 700,
            letterSpacing: "-0.04em",
            lineHeight: 1.04,
            color: BRAND_COLORS.volt,
            maxWidth: landscape ? 1200 : 820,
            marginTop: story ? 44 : 28,
          }}
        >
          A Girumo nasceu dentro de um atacado que precisava dar conta do próprio crescimento.
        </span>
        <div
          style={{
            display: "flex",
            flexDirection: story ? "column" : "row",
            width: "100%",
            background: BRAND_COLORS.paper,
            border: `2px solid ${BRAND_COLORS.volt}`,
            marginTop: story ? 76 : 48,
          }}
        >
          {metrics.map(([value, label], index) => (
            <div
              key={value}
              style={{
                display: "flex",
                flexDirection: "column",
                padding: landscape ? "34px 38px" : story ? "38px 42px" : "30px 26px",
                ...(story ? { width: "100%" } : { flex: 1 }),
                ...(!story && index > 0 ? { borderLeft: `1px solid ${BRAND_COLORS.line}` } : {}),
                ...(story && index > 0 ? { borderTop: `1px solid ${BRAND_COLORS.line}` } : {}),
              }}
            >
              <span
                style={{
                  fontFamily: "Manrope",
                  fontSize: landscape ? 43 : story ? 52 : index === 0 ? 31 : 40,
                  fontWeight: 700,
                  letterSpacing: "-0.035em",
                  color: BRAND_COLORS.volt,
                }}
              >
                {value}
              </span>
              <span style={{ fontFamily: "PlexSans", fontSize: landscape ? 21 : 19, color: BRAND_COLORS.slate, marginTop: 10 }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Frame>
  );
}

function MetricCard({
  format,
  value,
  label,
  note,
}: {
  format: ResolvedPostFormat;
  value: string;
  label: string;
  note: string;
}) {
  const landscape = format.key === "videoCover";
  const story = format.key === "story";
  return (
    <Frame format={format} surface="dark">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", width: "100%" }}>
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: landscape ? 18 : 16,
            letterSpacing: "0.16em",
            color: BRAND_COLORS.acid,
          }}
        >
          {note.toUpperCase()}
        </span>
        <span
          style={{
            fontFamily: "Manrope",
            fontSize: landscape ? 190 : story ? 210 : format.key === "square" ? 145 : 172,
            fontWeight: 700,
            letterSpacing: "-0.06em",
            lineHeight: 0.95,
            color: BRAND_COLORS.acid,
            marginTop: story ? 84 : 54,
          }}
        >
          {value}
        </span>
        <span
          style={{
            fontFamily: "PlexSans",
            fontSize: landscape ? 42 : story ? 48 : 36,
            lineHeight: 1.25,
            color: BRAND_COLORS.paper,
            maxWidth: landscape ? 1040 : 780,
            marginTop: 28,
          }}
        >
          {label}
        </span>
        <div
          style={{
            display: "flex",
            background: BRAND_COLORS.paper,
            color: BRAND_COLORS.volt,
            padding: "18px 24px",
            marginTop: story ? 74 : 48,
            fontFamily: "PlexSans",
            fontSize: landscape ? 22 : 19,
          }}
        >
          Case da operação dos fundadores — não depoimento de cliente.
        </div>
      </div>
    </Frame>
  );
}
