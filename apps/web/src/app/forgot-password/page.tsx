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
          <Link href="/login" className="font-medium text-iris-claro hover:text-iris">
            Entrar
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-iris/20">
            <Mail className="h-7 w-7 text-iris-claro" />
          </div>
          <h2 className="font-display text-lg font-bold text-white">E-mail enviado!</h2>
          <p className="text-sm text-bruma/50">
            Se <strong className="text-white">{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha.
          </p>
          <p className="text-xs text-bruma/30">
            Não recebeu? Verifique a caixa de spam ou tente novamente em alguns minutos.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-iris-claro hover:text-iris"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para login
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-bruma/60">E-mail da conta</label>
            <input
              type="email"
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              className="h-11 w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-4 text-sm text-white placeholder:text-bruma/30 outline-none transition focus:border-iris/50 focus:ring-2 focus:ring-iris/20"
            />
          </div>
          {error && <p className="rounded-lg border border-alerta/30 bg-alerta/10 px-3 py-2 text-sm text-alerta">{error}</p>}
          <button
            type="submit"
            disabled={loading || !emailOk}
            className="flex h-11 w-full items-center justify-center rounded-xl bg-iris text-sm font-medium text-white shadow-iris transition hover:bg-iris-claro disabled:pointer-events-none disabled:opacity-50"
          >
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
