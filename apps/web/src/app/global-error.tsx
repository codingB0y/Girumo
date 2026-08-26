"use client";

/**
 * Último anteparo do App Router: erro que escapa de todo `error.tsx` e derruba
 * o layout raiz cai aqui.
 *
 * É exatamente o caso da tela branca — o que o cliente vê hoje sem que ninguém
 * fique sabendo. Além de reportar, esta tela dá ao lojista uma saída (recarregar
 * ou voltar ao painel) em vez de deixá-lo olhando para o nada.
 *
 * `global-error` substitui o layout raiz inteiro, então precisa trazer as
 * próprias tags <html> e <body>.
 */

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SENTRY_DSN) return;
    void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
  }, [error]);

  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0d0f0c",
          color: "#f4f4f0",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "420px", textAlign: "center" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 8px" }}>
            Algo quebrou nesta tela
          </h1>
          <p style={{ fontSize: "14px", lineHeight: 1.5, opacity: 0.7, margin: "0 0 24px" }}>
            Já fomos avisados e vamos corrigir. Seus dados estão salvos — nada do que você fez se
            perdeu.
          </p>
          <div style={{ display: "flex", gap: "8px", justifyContent: "center" }}>
            <button
              onClick={reset}
              style={{
                height: "44px",
                padding: "0 20px",
                borderRadius: "10px",
                border: "none",
                background: "#c8f751",
                color: "#0d0f0c",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Tentar de novo
            </button>
            <a
              href="/painel"
              style={{
                height: "44px",
                padding: "0 20px",
                display: "inline-flex",
                alignItems: "center",
                borderRadius: "10px",
                border: "1px solid rgba(244,244,240,0.2)",
                color: "#f4f4f0",
                fontSize: "14px",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Voltar ao painel
            </a>
          </div>
          {error.digest && (
            <p style={{ fontSize: "11px", opacity: 0.4, marginTop: "20px" }}>
              Código do erro: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
