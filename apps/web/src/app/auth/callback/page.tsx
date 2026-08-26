"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LEGAL_VERSION } from "@/lib/legal";
import { safeNextPath } from "@/lib/auth/oauth-account";
import { getSupabaseBrowserClient, setActiveTenantId, takeOAuthNext } from "@/lib/supabase/client";

/**
 * Retorno do consentimento do Google.
 *
 * O supabase-js recebe os tokens no fragmento da URL (`#access_token=...`) e os
 * grava sozinho ao inicializar (`detectSessionInUrl`). Daqui, so precisamos
 * pedir ao servidor que provisione a conta no primeiro acesso e emita o cookie
 * de sessao — o fragmento nunca chegaria ao servidor por conta propria.
 */
export default function OAuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    // Sob StrictMode o effect roda duas vezes; provisionar e um POST, roda uma.
    if (startedRef.current) return;
    startedRef.current = true;

    async function complete() {
      // O erro do provedor chega no fragmento no fluxo implicit, mas o Supabase
      // também o repassa na query em alguns cenários. Checa os dois.
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const queryParams = new URLSearchParams(window.location.search);
      const providerError = hashParams.get("error") ?? queryParams.get("error");

      if (providerError) {
        const code = providerError === "access_denied" ? "oauth_denied" : "oauth_failed";
        router.replace(`/login?error=${code}`);
        return;
      }

      const { data, error: sessionError } = await getSupabaseBrowserClient().auth.getSession();

      if (sessionError || !data.session) {
        router.replace("/login?error=oauth_failed");
        return;
      }

      let response: Response;
      try {
        response = await fetch("/api/auth/oauth-complete", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${data.session.access_token}`,
            "Content-Type": "application/json",
          },
          // A versão que a tela de origem exibiu. Só o primeiro acesso a usa —
          // é onde a conta nasce, e sem ela o servidor recusa provisionar.
          body: JSON.stringify({ legalVersion: LEGAL_VERSION }),
        });
      } catch {
        setError("Nao foi possivel falar com o servidor. Tente de novo.");
        return;
      }

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        setError(payload.error || "Nao foi possivel concluir seu acesso.");
        return;
      }

      const payload = await response.json().catch(() => ({}));
      setActiveTenantId(payload.tenantId);

      router.replace(safeNextPath(takeOAuthNext()));
      router.refresh();
    }

    void complete();
  }, [router]);

  return (
    <AuthShell
      title={error ? "Nao deu para entrar" : "Entrando..."}
      subtitle={error ? "Algo falhou ao concluir seu acesso" : "Confirmando seu acesso com o Google"}
      compact
    >
      {error ? (
        <div className="space-y-4">
          <p
            role="alert"
            className="rounded-[var(--radius-control)] border border-danger-700/40 bg-danger-700/15 px-3 py-2 text-sm text-canvas-100"
          >
            {error}
          </p>
          <Link
            href="/login"
            className="flex h-11 w-full items-center justify-center rounded-[var(--radius-control)] bg-acid-500 text-sm font-semibold text-volt-950 transition-[filter] duration-[var(--duration-micro)] hover:brightness-95"
          >
            Voltar para o login
          </Link>
        </div>
      ) : (
        <p className="text-sm text-canvas-100/60" aria-live="polite">
          Só um instante — estamos preparando seu painel.
        </p>
      )}
    </AuthShell>
  );
}
