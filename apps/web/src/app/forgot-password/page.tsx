"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
          <Link href="/login" className="font-medium text-iris hover:text-iris-escuro">
            Entrar
          </Link>
        </>
      }
    >
      {sent ? (
        <div className="space-y-4 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50">
            <Mail className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-semibold text-breu">E-mail enviado!</h2>
          <p className="text-sm text-aco/70">
            Se <strong className="text-breu">{email}</strong> estiver cadastrado, você receberá um link para redefinir sua senha.
          </p>
          <p className="text-xs text-aco/50">
            Não recebeu? Verifique a caixa de spam ou tente novamente em alguns minutos.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-iris hover:text-iris-escuro"
          >
            ← Voltar para login
          </Link>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-aco">E-mail da conta</label>
            <Input
              type="email"
              placeholder="voce@email.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              autoFocus
            />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button className="w-full" type="submit" disabled={loading || !emailOk}>
            {loading ? "Enviando..." : "Enviar link de recuperação"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
