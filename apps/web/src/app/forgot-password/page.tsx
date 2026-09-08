"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft } from "lucide-react";
import { AuthShellVitrine as AuthShell } from "@/components/auth/auth-shell-vitrine";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { CLASSES_DA_PORTA } from "@/lib/painel/auth-classes";

export default function ForgotPasswordPage() {
  const c = CLASSES_DA_PORTA;
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
      footer={
        <>
          Lembrou a senha?{" "}
          <Link href="/login" className={c.link}>
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
          <h2 className={c.titulo}>E-mail enviado!</h2>
          <p className={c.texto}>
            Se <strong className="text-canvas-100">{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha.
          </p>
          <p className={c.textoFraco}>
            Não recebeu? Verifique a caixa de spam ou tente novamente em alguns minutos.
          </p>
          <Link
            href="/login"
            className={`inline-flex items-center gap-1.5 text-sm ${c.link}`}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Voltar para login
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className={c.rotulo}>E-mail da conta</label>
            <input
              type="email"
              placeholder="voce@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              className={c.campo}
            />
          </div>
          {error && <p className={c.erro}>{error}</p>}
          <button
            type="submit"
            disabled={loading || !emailOk}
            className={c.primario}
          >
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </button>
        </form>
      )}
    </AuthShell>
  );
}
