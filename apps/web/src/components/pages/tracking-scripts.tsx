"use client";

import { useEffect } from "react";

/**
 * Tracking client-side da LP pública:
 * 1. Captura UTMs/fbclid/gclid/ttclid + referrer da URL → sessionStorage
 *    (o lead-form anexa isso no POST /api/p/lead).
 * 2. Beacon PageView pro nosso /api/p/track (fonte da verdade das métricas).
 * 3. Injeta Meta Pixel e GA4 SÓ se o lojista configurou os IDs.
 * Total ~1KB próprio; pixels são carregados async pelos vendors.
 */

export const LP_ATTRIB_KEY = "hf_lp_attrib";

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

export function collectAttribution(): Record<string, string> {
  try {
    const stored = sessionStorage.getItem(LP_ATTRIB_KEY);
    if (stored) return JSON.parse(stored) as Record<string, string>;
  } catch {
    /* sessionStorage indisponível (modo privado antigo) — segue sem */
  }
  return {};
}

/**
 * Id da VISITA (não da pessoa): nasce a cada carregamento e morre com a aba.
 * É o que deixa o servidor dedupar o funil — o mesmo evento da mesma visita conta
 * uma vez, por mais que o efeito rode em dobro ou o beacon seja reenviado (§5).
 * Não identifica ninguém e não persiste entre visitas.
 */
let viewId: string | null = null;

function currentViewId(): string {
  if (!viewId) {
    viewId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
  return viewId;
}

/** Eventos do funil que o client pode emitir. `lead_created` é só do servidor. */
export type LpBeaconEvent = "page_view" | "form_start" | "lead_submit_attempt" | "group_click";

export function trackBeacon(
  slug: string,
  renderContext: string | undefined,
  event: LpBeaconEvent,
): void {
  if (!renderContext) return;
  const payload = JSON.stringify({
    slug,
    event,
    render_context: renderContext,
    view_id: currentViewId(),
    ...collectAttribution(),
  });
  try {
    if (!navigator.sendBeacon?.("/api/p/track", new Blob([payload], { type: "application/json" }))) {
      void fetch("/api/p/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      });
    }
  } catch {
    /* tracking nunca quebra a página */
  }
}

const ATTRIB_PARAMS = [
  "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term",
  "fbclid", "gclid", "ttclid",
] as const;

export function TrackingScripts({
  slug,
  renderContext,
  metaPixelId,
  ga4Id,
  nonce,
}: {
  slug: string;
  renderContext: string;
  metaPixelId: string | null;
  ga4Id: string | null;
  /** Nonce da CSP da request (vem do middleware via a page). */
  nonce: string | null;
}) {
  useEffect(() => {
    // 1. atribuição da visita (persistida pro form)
    const params = new URLSearchParams(window.location.search);
    const attrib: Record<string, string> = {};
    for (const key of ATTRIB_PARAMS) {
      const value = params.get(key);
      if (value) attrib[key] = value.slice(0, 300);
    }
    if (document.referrer) attrib.referrer = document.referrer.slice(0, 300);
    try {
      // não sobrescreve: a 1ª origem da sessão é a que vale
      if (!sessionStorage.getItem(LP_ATTRIB_KEY)) {
        sessionStorage.setItem(LP_ATTRIB_KEY, JSON.stringify(attrib));
      }
    } catch {
      /* segue sem persistir */
    }

    // 2. page_view server-side (nosso — fonte da verdade das métricas)
    trackBeacon(slug, renderContext, "page_view");

    // 3. Meta Pixel
    if (metaPixelId && !window.fbq) {
      const script = document.createElement("script");
      // Script criado por JS não herda nonce nenhum: precisa ser marcado ANTES
      // de entrar no documento, senão a CSP o bloqueia.
      if (nonce) script.nonce = nonce;
      script.textContent = `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${metaPixelId.replace(/[^0-9]/g, "")}');fbq('track','PageView');`;
      document.head.appendChild(script);
    }

    // 4. GA4
    if (ga4Id && !window.gtag) {
      const safeId = ga4Id.replace(/[^A-Za-z0-9-]/g, "");
      const loader = document.createElement("script");
      if (nonce) loader.nonce = nonce;
      loader.async = true;
      loader.src = `https://www.googletagmanager.com/gtag/js?id=${safeId}`;
      document.head.appendChild(loader);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function gtag(...args: unknown[]) {
        window.dataLayer?.push(args);
      };
      window.gtag("js", new Date());
      window.gtag("config", safeId);
    }
    // roda 1x por montagem da LP — ids não mudam sem full reload
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
