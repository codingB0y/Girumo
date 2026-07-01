import { ImageResponse } from "@vercel/og";
import { type NextRequest } from "next/server";

// Dimensões Instagram post (4:5)
const WIDTH = 1080;
const HEIGHT = 1350;

// Cache das fontes em memória para não re-baixar a cada request
let fontsCache: { bricolage: ArrayBuffer; plexSans: ArrayBuffer; plexMono: ArrayBuffer } | null = null;

async function loadFonts() {
  if (fontsCache) return fontsCache;
  const [bricolage, plexSans, plexMono] = await Promise.all([
    fetch(
      "https://fonts.gstatic.com/s/bricolagegrotesque/v9/3y9U6as8bTXq_nANBjzKo3IeZx8z6up5BeSl5jBNz_19PpbpMXuECpwUxJBOm_OJWiaaD30YfKfjZZoLvZvlyM0.ttf"
    ).then((r) => r.arrayBuffer()),
    fetch(
      "https://fonts.gstatic.com/s/ibmplexsans/v23/zYXGKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1swZSAXcomDVmadSD6llzAA.ttf"
    ).then((r) => r.arrayBuffer()),
    fetch(
      "https://fonts.gstatic.com/s/ibmplexmono/v20/-F63fjptAgt5VM-kVkqdyU8n5ig.ttf"
    ).then((r) => r.arrayBuffer()),
  ]);
  fontsCache = { bricolage, plexSans, plexMono };
  return fontsCache;
}

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const template = searchParams.get("t") || "1.1-capa";

  const fonts = await loadFonts();

  const slide = getSlideContent(template);

  return new ImageResponse(slide, {
    width: WIDTH,
    height: HEIGHT,
    fonts: [
      { name: "Bricolage", data: fonts.bricolage, weight: 800 as const, style: "normal" as const },
      { name: "PlexSans", data: fonts.plexSans, weight: 400 as const, style: "normal" as const },
      { name: "PlexMono", data: fonts.plexMono, weight: 400 as const, style: "normal" as const },
    ],
  });
}

/* ============================================================
   TEMPLATES — cada função retorna JSX Satori-compatible
   ============================================================ */

function getSlideContent(template: string) {
  switch (template) {
    case "1.1-capa":
      return slide_1_1_capa();
    case "1.1-problema":
      return slide_1_1_problema();
    case "1.1-solucao":
      return slide_1_1_solucao();
    case "1.1-cta":
      return slide_1_1_cta();
    case "1.2-confessa":
      return slide_1_2_confessa();
    case "2.2-sabia":
      return slide_2_2_sabia();
    case "2.3-capa":
      return slide_2_3_capa();
    case "2.3-01":
      return slide_2_3_item("01", "Dispara pra todos os grupos num clique");
    case "2.3-02":
      return slide_2_3_item("02", "Agenda a semana inteira de uma vez");
    case "2.3-03":
      return slide_2_3_item("03", "Cria grupo novo quando o atual enche");
    case "2.3-04":
      return slide_2_3_item("04", "Muda nome e foto de todos em massa");
    case "2.3-05":
      return slide_2_3_item("05", "Mostra funil e saúde em tempo real");
    case "2.3-cta":
      return slide_2_3_cta();
    case "3.1-numero":
      return slide_3_1_numero();
    case "4.1-semdesculpa":
      return slide_4_1_semdesculpa();
    case "4.2-quanto":
      return slide_4_2_quanto();
    case "5.2-dado":
      return slide_5_2_dado();
    default:
      return slide_1_1_capa();
  }
}

/* ===== Componente wrapper (background + logo + footer) ===== */

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        flexDirection: "column",
        background: "#0B0D1A",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Eclipse glow */}
      <div
        style={{
          position: "absolute",
          top: "30%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 900,
          height: 900,
          borderRadius: "50%",
          background:
            "radial-gradient(circle, rgba(138,108,255,0) 45%, rgba(138,108,255,0.4) 55%, rgba(106,75,240,0.12) 65%, transparent 75%)",
        }}
      />
      {/* Grid pattern overlay */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "54px 54px",
        }}
      />
      {/* Logo top */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "48px 56px 0",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Elo symbol simplified */}
        <div
          style={{
            width: 36,
            height: 36,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <svg width="36" height="36" viewBox="0 0 120 120" fill="none">
            <rect
              x="14"
              y="24"
              width="50"
              height="72"
              rx="21"
              fill="none"
              stroke="#6A4BF0"
              strokeWidth="14"
            />
            <rect
              x="56"
              y="24"
              width="50"
              height="72"
              rx="21"
              fill="none"
              stroke="#6A4BF0"
              strokeWidth="14"
            />
          </svg>
        </div>
        <span
          style={{
            fontFamily: "Bricolage",
            fontSize: 22,
            fontWeight: 800,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          HubFlow
        </span>
      </div>
      {/* Main content */}
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: "40px 56px",
          position: "relative",
          zIndex: 10,
        }}
      >
        {children}
      </div>
      {/* Footer */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          padding: "0 56px 48px",
          position: "relative",
          zIndex: 10,
        }}
      >
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: 13,
            letterSpacing: "0.2em",
            textTransform: "uppercase" as const,
            color: "rgba(236,235,245,0.3)",
          }}
        >
          hubflow.com.br
        </span>
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: 13,
            letterSpacing: "0.2em",
            textTransform: "uppercase" as const,
            color: "rgba(106,75,240,0.5)",
          }}
        >
          O fluxo que vende.
        </span>
      </div>
    </div>
  );
}

/* ===== SLIDES ===== */

function slide_1_1_capa() {
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center" as const,
          gap: 32,
        }}
      >
        <span style={{ fontSize: 80 }}>😮‍💨</span>
        <span
          style={{
            fontFamily: "Bricolage",
            fontSize: 56,
            fontWeight: 800,
            color: "#ECEBF5",
            lineHeight: 1.1,
            maxWidth: 800,
          }}
        >
          Você ainda copia e cola oferta em 40 grupos toda manhã?
        </span>
      </div>
    </Frame>
  );
}

function slide_1_1_problema() {
  const items = [
    "Abre grupo 1 → cola → envia",
    "Abre grupo 2 → cola → envia",
    "Abre grupo 3 → cola → envia",
    "...",
    "40 minutos depois: cansou e nem mandou pra todos",
  ];
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", gap: 28, width: "100%" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: "rgba(248,113,113,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ color: "#F87171", fontSize: 18, fontFamily: "PlexSans" }}>✕</span>
            </div>
            <span
              style={{
                fontFamily: "PlexSans",
                fontSize: 26,
                color: i === items.length - 1 ? "rgba(236,235,245,0.5)" : "rgba(236,235,245,0.85)",
              }}
            >
              {item}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function slide_1_1_solucao() {
  const items = [
    "1 clique = todos os grupos recebem",
    "Texto, vídeo e áudio",
    "Agenda da semana inteira de uma vez",
  ];
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
        <span
          style={{
            fontFamily: "Bricolage",
            fontSize: 32,
            fontWeight: 800,
            color: "#8A6CFF",
            marginBottom: 12,
          }}
        >
          Com o HubFlow:
        </span>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(16,185,129,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ color: "#10B981", fontSize: 20, fontFamily: "PlexSans" }}>✓</span>
            </div>
            <span
              style={{
                fontFamily: "PlexSans",
                fontSize: 28,
                color: "#ECEBF5",
              }}
            >
              {item}
            </span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function slide_1_1_cta() {
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center" as const,
          gap: 24,
        }}
      >
        {/* Arrow icon */}
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: 20,
            background: "rgba(106,75,240,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 36, color: "#8A6CFF" }}>→</span>
        </div>
        <span
          style={{
            fontFamily: "Bricolage",
            fontSize: 52,
            fontWeight: 800,
            color: "#ECEBF5",
            lineHeight: 1.15,
          }}
        >
          Teste 7 dias grátis.
        </span>
        <span
          style={{
            fontFamily: "PlexSans",
            fontSize: 26,
            color: "rgba(236,235,245,0.5)",
          }}
        >
          Link na bio.
        </span>
      </div>
    </Frame>
  );
}

function slide_1_2_confessa() {
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center" as const,
          gap: 32,
        }}
      >
        <span style={{ fontSize: 80 }}>🫠</span>
        <span
          style={{
            fontFamily: "Bricolage",
            fontSize: 48,
            fontWeight: 800,
            color: "#ECEBF5",
            lineHeight: 1.15,
            maxWidth: 820,
          }}
        >
          Confessa: quantos grupos você deixou de enviar hoje por preguiça de copiar e colar?
        </span>
      </div>
    </Frame>
  );
}

function slide_2_2_sabia() {
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center" as const,
          gap: 28,
        }}
      >
        <span style={{ fontSize: 72 }}>🔄</span>
        <span
          style={{
            fontFamily: "Bricolage",
            fontSize: 46,
            fontWeight: 800,
            color: "#ECEBF5",
            lineHeight: 1.15,
            maxWidth: 800,
          }}
        >
          Sabia que quando um grupo lota, o HubFlow cria o próximo sozinho?
        </span>
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: 16,
            letterSpacing: "0.15em",
            textTransform: "uppercase" as const,
            color: "rgba(138,108,255,0.6)",
            marginTop: 8,
          }}
        >
          Auto-criação de grupos
        </span>
      </div>
    </Frame>
  );
}

function slide_2_3_capa() {
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center" as const,
          gap: 32,
        }}
      >
        <span style={{ fontSize: 72 }}>🌙</span>
        <span
          style={{
            fontFamily: "Bricolage",
            fontSize: 50,
            fontWeight: 800,
            color: "#ECEBF5",
            lineHeight: 1.1,
            maxWidth: 800,
          }}
        >
          5 coisas que o HubFlow faz enquanto você dorme
        </span>
      </div>
    </Frame>
  );
}

function slide_2_3_item(n: string, text: string) {
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center" as const,
          gap: 32,
        }}
      >
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: 120,
            fontWeight: 700,
            color: "rgba(106,75,240,0.3)",
            lineHeight: 1,
          }}
        >
          {n}
        </span>
        <span
          style={{
            fontFamily: "PlexSans",
            fontSize: 34,
            color: "#ECEBF5",
            maxWidth: 700,
            lineHeight: 1.3,
          }}
        >
          {text}
        </span>
      </div>
    </Frame>
  );
}

function slide_2_3_cta() {
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center" as const,
          gap: 20,
        }}
      >
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: 16,
            letterSpacing: "0.2em",
            textTransform: "uppercase" as const,
            color: "#8A6CFF",
          }}
        >
          O fluxo que vende.
        </span>
        <span
          style={{
            fontFamily: "Bricolage",
            fontSize: 52,
            fontWeight: 800,
            color: "#ECEBF5",
            lineHeight: 1.15,
          }}
        >
          Teste 7 dias grátis
        </span>
        <span
          style={{
            fontFamily: "PlexSans",
            fontSize: 24,
            color: "rgba(236,235,245,0.5)",
            marginTop: 8,
          }}
        >
          → link na bio
        </span>
      </div>
    </Frame>
  );
}

function slide_3_1_numero() {
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center" as const,
          gap: 16,
        }}
      >
        <span
          style={{
            fontFamily: "Bricolage",
            fontSize: 140,
            fontWeight: 800,
            color: "#8A6CFF",
            lineHeight: 1,
          }}
        >
          2x
        </span>
        <span
          style={{
            fontFamily: "PlexSans",
            fontSize: 32,
            color: "#ECEBF5",
            marginTop: 12,
          }}
        >
          mais faturamento.
        </span>
        <span style={{ fontFamily: "PlexSans", fontSize: 28, color: "rgba(236,235,245,0.5)" }}>
          Mesma equipe.
        </span>
        <span style={{ fontFamily: "PlexSans", fontSize: 28, color: "rgba(236,235,245,0.5)" }}>
          Um clique por dia.
        </span>
      </div>
    </Frame>
  );
}

function slide_4_1_semdesculpa() {
  const items = [
    "Conecta em 2 minutos",
    "Sem cartão de crédito",
    "Sem trocar de número",
    "Seus contatos são seus",
  ];
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", gap: 20, width: "100%" }}>
        {items.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: "rgba(16,185,129,0.15)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ color: "#10B981", fontSize: 20, fontFamily: "PlexSans" }}>✓</span>
            </div>
            <span style={{ fontFamily: "PlexSans", fontSize: 28, color: "#ECEBF5" }}>{item}</span>
          </div>
        ))}
        {/* Divider */}
        <div
          style={{
            width: "100%",
            height: 1,
            background: "rgba(255,255,255,0.1)",
            marginTop: 24,
            marginBottom: 12,
          }}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center" as const,
            gap: 8,
          }}
        >
          <span
            style={{
              fontFamily: "Bricolage",
              fontSize: 32,
              fontWeight: 800,
              color: "rgba(236,235,245,0.7)",
            }}
          >
            Faltou desculpa.
          </span>
          <span
            style={{
              fontFamily: "Bricolage",
              fontSize: 38,
              fontWeight: 800,
              color: "#8A6CFF",
            }}
          >
            Teste 7 dias grátis.
          </span>
        </div>
      </div>
    </Frame>
  );
}

function slide_4_2_quanto() {
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center" as const,
          gap: 16,
        }}
      >
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: 15,
            letterSpacing: "0.2em",
            textTransform: "uppercase" as const,
            color: "rgba(236,235,245,0.4)",
          }}
        >
          Faz a conta
        </span>
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: 110,
            fontWeight: 700,
            color: "#ECEBF5",
            lineHeight: 1,
            marginTop: 20,
          }}
        >
          20h
        </span>
        <span
          style={{
            fontFamily: "PlexSans",
            fontSize: 26,
            color: "rgba(236,235,245,0.55)",
            marginTop: 8,
          }}
        >
          por mês colando mensagem em grupo.
        </span>
        {/* Divider */}
        <div
          style={{
            width: 200,
            height: 1,
            background: "rgba(255,255,255,0.1)",
            marginTop: 32,
            marginBottom: 16,
          }}
        />
        <span
          style={{
            fontFamily: "Bricolage",
            fontSize: 36,
            fontWeight: 800,
            color: "#8A6CFF",
          }}
        >
          Quanto vale sua hora?
        </span>
      </div>
    </Frame>
  );
}

function slide_5_2_dado() {
  return (
    <Frame>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center" as const,
          gap: 16,
        }}
      >
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: 120,
            fontWeight: 700,
            color: "#8A6CFF",
            lineHeight: 1,
          }}
        >
          78%
        </span>
        <span
          style={{
            fontFamily: "PlexSans",
            fontSize: 28,
            color: "#ECEBF5",
            maxWidth: 700,
            marginTop: 12,
          }}
        >
          dos brasileiros preferem comprar por WhatsApp.
        </span>
        <span
          style={{
            fontFamily: "PlexMono",
            fontSize: 14,
            color: "rgba(236,235,245,0.35)",
            marginTop: 8,
          }}
        >
          (Opinion Box, 2025)
        </span>
        {/* Divider */}
        <div
          style={{
            width: 200,
            height: 1,
            background: "rgba(255,255,255,0.1)",
            marginTop: 28,
            marginBottom: 12,
          }}
        />
        <span
          style={{
            fontFamily: "Bricolage",
            fontSize: 34,
            fontWeight: 800,
            color: "#ECEBF5",
          }}
        >
          Seus grupos estão prontos?
        </span>
      </div>
    </Frame>
  );
}
