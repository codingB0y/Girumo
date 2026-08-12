"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Check, Copy, Download, ImageDown, MessageCircle } from "lucide-react";
import { parseHex, relativeLuminance } from "@/lib/pages/palette";
import {
  QR_EXPORT_SIZE,
  STORY_HEIGHT,
  STORY_WIDTH,
  buildPublicUrl,
  buildShareMessage,
  buildWhatsAppShareHref,
  shareFileName,
  truncate,
  wrapWords,
} from "@/lib/pages/share";

/**
 * Kit de divulgação da página: QR pra bazar físico e story, e a mensagem pronta
 * pro WhatsApp.
 *
 * O QR é gerado **no próprio cliente** (`qrcode.react`), nunca por serviço
 * externo — a URL da página do lojista não sai daqui. Precedente do repo: o QR
 * do WhatsApp vazava para quickchart.io (corrigido em 9119f39f).
 *
 * Enviar no WhatsApp é um link `wa.me` comum: abre o app do lojista com o texto
 * pronto e ele escolhe pra quem mandar. Não é disparo da plataforma, então não
 * esbarra na regra anti-ban (automação só posta em grupo, nunca DM).
 */

/** Tamanho do QR na tela; o canvas por trás é bem maior, pra impressão. */
const QR_PREVIEW_PX = 168;

const STORY_CARD = 720;
const STORY_CARD_PAD = 48;

type ShareKitProps = {
  slug: string;
  storeName: string;
  headline: string;
  brandColor: string;
  /** Página não publicada não serve `/p/{slug}` — QR impresso viraria link morto. */
  published: boolean;
};

type StoryInput = {
  qr: HTMLCanvasElement;
  storeName: string;
  headline: string;
  url: string;
  brandColor: string;
};

/** Preto ou branco sobre a cor da marca, pelo mesmo critério WCAG do módulo. */
function inkFor(brandHex: string): { forte: string; suave: string } {
  const rgb = parseHex(brandHex);
  const claro = rgb ? relativeLuminance(rgb) > 0.45 : false;

  return claro
    ? { forte: "#111111", suave: "rgba(17,17,17,0.72)" }
    : { forte: "#ffffff", suave: "rgba(255,255,255,0.82)" };
}

function fillRounded(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof ctx.roundRect !== "function") {
    ctx.fillRect(x, y, w, h);
    return;
  }

  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

function drawStory(ctx: CanvasRenderingContext2D, input: StoryInput): void {
  const { qr, storeName, headline, url, brandColor } = input;
  const ink = inkFor(brandColor);

  ctx.fillStyle = brandColor;
  ctx.fillRect(0, 0, STORY_WIDTH, STORY_HEIGHT);
  ctx.textAlign = "center";

  ctx.fillStyle = ink.forte;
  ctx.font = "700 64px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText(truncate(storeName, 24), STORY_WIDTH / 2, 400);

  ctx.fillStyle = ink.suave;
  ctx.font = "400 40px system-ui, -apple-system, Segoe UI, sans-serif";
  wrapWords(headline, 34, 2).forEach((linha, i) => {
    ctx.fillText(linha, STORY_WIDTH / 2, 486 + i * 56);
  });

  const cardX = (STORY_WIDTH - STORY_CARD) / 2;
  const cardY = 660;
  ctx.fillStyle = "#ffffff";
  fillRounded(ctx, cardX, cardY, STORY_CARD, STORY_CARD, 48);
  ctx.drawImage(
    qr,
    cardX + STORY_CARD_PAD,
    cardY + STORY_CARD_PAD,
    STORY_CARD - STORY_CARD_PAD * 2,
    STORY_CARD - STORY_CARD_PAD * 2,
  );

  ctx.fillStyle = ink.forte;
  ctx.font = "600 44px system-ui, -apple-system, Segoe UI, sans-serif";
  ctx.fillText("Aponte a câmera para entrar", STORY_WIDTH / 2, cardY + STORY_CARD + 112);

  ctx.fillStyle = ink.suave;
  ctx.font = "400 32px ui-monospace, SFMono-Regular, monospace";
  ctx.fillText(truncate(url.replace(/^https?:\/\//, ""), 42), STORY_WIDTH / 2, cardY + STORY_CARD + 178);
}

function downloadPng(dataUrl: string, fileName: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export function ShareKit({ slug, storeName, headline, brandColor, published }: ShareKitProps) {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const qrBoxRef = useRef<HTMLDivElement>(null);

  // `window` só existe depois da montagem — o painel é client, mas passa por SSR.
  useEffect(() => setOrigin(window.location.origin), []);

  const url = origin ? buildPublicUrl(origin, slug) : "";
  const message = url ? buildShareMessage({ storeName, headline, url }) : "";

  /**
   * Página fora do ar não divulga — e isso vale principalmente pro QR: um código
   * impresso e distribuído no bazar continua circulando depois, apontando pra
   * uma página que não é servida. O aviso sozinho não segura; o botão trava.
   */
  const podeDivulgar = published && Boolean(url);

  const qrCanvas = useCallback((): HTMLCanvasElement | null => {
    return qrBoxRef.current?.querySelector("canvas") ?? null;
  }, []);

  const baixarQr = useCallback(() => {
    const canvas = qrCanvas();
    if (!canvas) {
      setErro("Não consegui gerar o QR agora. Recarregue a página e tente de novo.");
      return;
    }

    setErro(null);
    downloadPng(canvas.toDataURL("image/png"), shareFileName(slug, "qrcode"));
  }, [qrCanvas, slug]);

  const baixarStory = useCallback(() => {
    const qr = qrCanvas();
    const canvas = document.createElement("canvas");
    canvas.width = STORY_WIDTH;
    canvas.height = STORY_HEIGHT;
    const ctx = canvas.getContext("2d");

    if (!qr || !ctx) {
      setErro("Não consegui montar a imagem do story. Recarregue a página e tente de novo.");
      return;
    }

    setErro(null);
    drawStory(ctx, { qr, storeName, headline, url, brandColor });
    downloadPng(canvas.toDataURL("image/png"), shareFileName(slug, "story"));
  }, [qrCanvas, slug, storeName, headline, url, brandColor]);

  const copiarMensagem = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message);
      setErro(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErro("Não consegui copiar. Selecione o texto e copie na mão.");
    }
  }, [message]);

  return (
    <section className="rounded-2xl border border-volt-950/[0.06] bg-white shadow-card">
      <div className="border-b border-volt-950/[0.06] px-5 py-4">
        <h2 className="font-medium text-volt-950">Kit de divulgação</h2>
        <p className="text-xs text-aco/60">
          QR pro bazar e pro story, e a mensagem pronta pra mandar no WhatsApp.
        </p>
      </div>

      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start">
        <div
          ref={qrBoxRef}
          className="mx-auto shrink-0 rounded-xl border border-volt-950/[0.06] bg-white p-3 sm:mx-0"
        >
          {url ? (
            <QRCodeCanvas
              value={url}
              size={QR_EXPORT_SIZE}
              level="M"
              marginSize={2}
              bgColor="#ffffff"
              fgColor="#0f172a"
              style={{ width: QR_PREVIEW_PX, height: QR_PREVIEW_PX }}
              aria-label={`QR code da página ${storeName}`}
            />
          ) : (
            <div
              className="animate-pulse rounded-lg bg-canvas-100"
              style={{ width: QR_PREVIEW_PX, height: QR_PREVIEW_PX }}
            />
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {!published ? (
            <p className="rounded-lg bg-atencao/[0.08] px-3 py-2 text-sm text-atencao">
              Publique a página antes de divulgar — enquanto ela está fora do ar, o QR e o link
              levam a lugar nenhum.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <a
              href={podeDivulgar ? buildWhatsAppShareHref(message) : undefined}
              target="_blank"
              rel="noreferrer"
              aria-disabled={!podeDivulgar}
              tabIndex={podeDivulgar ? undefined : -1}
              className={
                podeDivulgar
                  ? "inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white shadow-brand transition hover:bg-cobalt-500"
                  : "pointer-events-none inline-flex items-center gap-2 rounded-xl bg-cobalt-500/40 px-4 py-2.5 text-sm font-medium text-white"
              }
            >
              <MessageCircle className="h-4 w-4" /> Enviar no WhatsApp
            </a>

            <button
              type="button"
              onClick={() => void copiarMensagem()}
              disabled={!podeDivulgar}
              className="inline-flex items-center gap-2 rounded-xl border border-volt-950/10 bg-white px-4 py-2.5 text-sm font-medium text-volt-950 transition hover:border-cobalt-500/50 disabled:opacity-60"
            >
              {copied ? <Check className="h-4 w-4 text-sucesso" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copiado!" : "Copiar mensagem"}
            </button>

            <button
              type="button"
              onClick={baixarQr}
              disabled={!podeDivulgar}
              className="inline-flex items-center gap-2 rounded-xl border border-volt-950/10 bg-white px-4 py-2.5 text-sm font-medium text-volt-950 transition hover:border-cobalt-500/50 disabled:opacity-60"
            >
              <Download className="h-4 w-4" /> Baixar QR
            </button>

            <button
              type="button"
              onClick={baixarStory}
              disabled={!podeDivulgar}
              className="inline-flex items-center gap-2 rounded-xl border border-volt-950/10 bg-white px-4 py-2.5 text-sm font-medium text-volt-950 transition hover:border-cobalt-500/50 disabled:opacity-60"
            >
              <ImageDown className="h-4 w-4" /> Imagem pro story
            </button>
          </div>

          <div>
            <p className="text-xs text-aco/60">Mensagem que vai junto:</p>
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-canvas-100 px-3 py-2 text-xs text-aco">
              {message || "…"}
            </pre>
          </div>

          <p role="status" aria-live="polite" className="sr-only">
            {copied ? "Mensagem copiada" : ""}
          </p>

          {erro ? (
            <p role="alert" className="text-sm text-alerta">
              {erro}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
