"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LegalConsentNotice } from "@/components/legal/legal-consent";
import { safeNextPath } from "@/lib/auth/oauth-account";
import { isPainelVitrineEnabled } from "@/lib/painel/flags";
import { classesDaPorta } from "@/lib/painel/auth-classes";
import { type Aparelho, aparelhoLembrado, esquecerAparelho, lembrarAparelho } from "@/lib/painel/auth-aparelho";
import { persistSupabaseSession, startGoogleOAuth } from "@/lib/supabase/client";

const routeLabels: Record<string, string> = {
  "/painel": "Painel",
  "/painel/grupos": "Grupos",
  "/painel/campanhas": "Campanhas",
  "/painel/resultados": "Resultados",
  "/painel/conectar": "Conectar",
  "/painel/configuracoes": "Configurações",
};

/** Erros que chegam por redirect (fluxo OAuth). Sem isto o usuário voltava sem mensagem. */
const redirectErrors: Record<string, string> = {
  oauth_denied: "Você cancelou o login com o Google.",
  oauth_failed: "Não foi possível entrar com o Google. Tente de novo.",
};

function LoginForm({
  aparelho,
  onEsquecer,
  onLembrar,
}: {
  aparelho: Aparelho | null;
  onEsquecer: () => void;
  onLembrar: (email: string) => void;
}) {
  const vitrine = isPainelVitrineEnabled();
  const c = classesDaPorta(vitrine);
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const destination = routeLabels[next] ?? "a área solicitada";
  const redirectError = params.get("error");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    redirectError ? redirectErrors[redirectError] ?? "Não foi possível entrar. Tente de novo." : "",
  );
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // O aparelho só é conhecido depois de montar (localStorage não existe no servidor).
  useEffect(() => {
    if (aparelho) setEmail(aparelho.email);
  }, [aparelho]);

  function esquecer() {
    onEsquecer();
    setEmail("");
    setPassword("");
  }

  async function signInWithGoogle() {
    setGoogleLoading(true);
    setError("");
    try {
      await startGoogleOAuth(next);
    } catch {
      setError("Não foi possível abrir o login do Google. Tente de novo.");
      setGoogleLoading(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        await persistSupabaseSession(data);
        onLembrar(email);
        router.replace(next);
        router.refresh();
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Não foi possível entrar.");
      }
    } catch {
      setError("Erro ao entrar. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      {vitrine && aparelho ? (
        // Aparelho lembrado: o e-mail já está no campo, então ele vira contexto e não pergunta.
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-data text-13 text-volt-950">{aparelho.email}</p>
          <button type="button" onClick={esquecer} className="pn-porta__link min-h-11 text-13">
            Entrar com outra conta
          </button>
        </div>
      ) : (
        <div>
          <label className={c.rotulo} htmlFor="login-email">
            E-mail
          </label>
          <input
            id="login-email"
            data-testid="login-email"
            type="email"
            placeholder={vitrine ? "voce@loja.com.br" : "voce@email.com"}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
            autoComplete="email"
            className={c.campo}
          />
        </div>
      )}
      <div>
        <div className="flex items-center justify-between">
          <label className={c.rotulo} htmlFor="login-senha">
            Senha
          </label>
          <Link href="/forgot-password" className={`mb-1.5 ${c.link} ${vitrine ? "text-13" : "text-xs"}`}>
            {vitrine ? "Esqueci a senha" : "Esqueci"}
          </Link>
        </div>
        <input
          id="login-senha"
          data-testid="login-senha"
          type="password"
          placeholder={vitrine ? "" : "Sua senha"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus={vitrine && aparelho != null}
          autoComplete="current-password"
          className={c.campo}
        />
      </div>

      {error && (
        <p role="alert" className={c.erro}>
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !email || !password}
        className={c.primario}
      >
        {loading ? "Entrando..." : "Entrar"}
      </button>

      {vitrine ? (
        <p className="pn-porta__ou my-1">ou</p>
      ) : (
        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-volt-800" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-volt-900 px-3 text-xs text-canvas-100/40">ou</span>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={signInWithGoogle}
        disabled={googleLoading}
        className={c.secundario}
      >
        <GoogleIcon />
        {googleLoading ? "Abrindo o Google..." : "Entrar com Google"}
      </button>

      {!vitrine && <LegalConsentNotice />}

      {!vitrine && (
        <p className="text-center text-xs leading-5 text-canvas-100/50">Ao entrar, você volta para {destination}.</p>
      )}
    </form>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function LoginPageContent() {
  const vitrine = isPainelVitrineEnabled();
  const params = useSearchParams();
  const next = safeNextPath(params.get("next"));
  const destination = routeLabels[next] ?? "a área solicitada";
  const [aparelho, setAparelho] = useState<Aparelho | null>(null);

  useEffect(() => {
    setAparelho(aparelhoLembrado());
  }, []);

  function esquecer() {
    esquecerAparelho();
    setAparelho(null);
  }

  function lembrar(email: string) {
    lembrarAparelho(email);
  }

  return (
    <AuthShell
      title="Entrar"
      subtitle={vitrine ? "Use o e-mail da sua conta." : "Acesse sua central de operação"}
      lembrado={aparelho != null}
      checklist={[
        "Veja todos os seus grupos num painel só",
        "Envie e agende com um clique",
        "Acompanhe resultados em tempo real",
      ]}
      context={next !== "/painel" ? `Entre para continuar para ${destination}.` : undefined}
      footer={
        <>
          Ainda não tem conta?{" "}
          <Link
            href="/signup"
            className={classesDaPorta(vitrine).link}
          >
            Criar conta
          </Link>
        </>
      }
    >
      <LoginForm aparelho={aparelho} onEsquecer={esquecer} onLembrar={lembrar} />
    </AuthShell>
  );
}
