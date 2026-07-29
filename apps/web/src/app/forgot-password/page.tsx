"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!emailOk) return;
    setLoading(true);
    setError("");

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email, { redirectTo });

    if (resetError) setError(resetError.message);
    else setSent(true);

    setLoading(false);
  }

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle="Enviaremos um link para redefinir sua senha"
      compact
      checklist={[
        "Você recebe um e-mail com o link",
        "Clique no link para criar nova senha",
        "Volte a acessar seu painel",
      ]}
      footer={
        <>
          Lembrou a senha?{" "}
          <Link href="/login" className="font-medium text-acid-500 transition-colors hover:text-canvas-100">
            Entrar
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[var(--radius-card)] bg-success-700">
            <Mail className="h-7 w-7 text-canvas-100" />
          </div>
          <h2 className="font-display text-lg font-bold text-canvas-100">E-mail enviado!</h2>
          <p className="text-sm text-canvas-100/60">
            Se <strong className="text-canvas-100">{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha.
          </p>
          <p className="text-xs text-canvas-100/45">
            Não recebeu? Verifique a caixa de spam ou tente novamente em alguns minutos.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-acid-500 transition-colors hover:text-canvas-100"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para login
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-canvas-100/70">E-mail da conta</label>
            <input
              type="email"
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              className="h-11 w-full rounded-[var(--radius-control)] border border-volt-800 bg-volt-950 px-4 text-sm text-canvas-100 placeholder:text-canvas-100/35 outline-none transition-[border-color,box-shadow] duration-[var(--duration-micro)] ease-[var(--ease-girumo)] focus:border-cobalt-500 focus:ring-2 focus:ring-cobalt-500/30"
            />
          </div>
          {error && <p className="rounded-[var(--radius-control)] border border-danger-700/40 bg-danger-700/15 px-3 py-2 text-sm text-canvas-100">{error}</p>}
          <button
            type="submit"
            disabled={loading || !emailOk}
            className="flex h-11 w-full items-center justify-center rounded-[var(--radius-control)] bg-acid-500 text-sm font-semibold text-volt-950 transition-[filter] duration-[var(--duration-micro)] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
