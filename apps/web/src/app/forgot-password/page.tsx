"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setMessage("");

    const redirectTo = `${window.location.origin}/reset-password`;
    const { error: resetError } = await getSupabaseBrowserClient().auth.resetPasswordForEmail(email, { redirectTo });

    if (resetError) setError(resetError.message);
    else setMessage("Enviamos o link de recuperacao para seu e-mail.");

    setLoading(false);
  }

  return (
    <AuthShell
      title="Recuperar senha"
      subtitle="Receba um link seguro para criar uma nova senha"
      footer={
        <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
          Voltar para login
        </Link>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">E-mail</label>
          <Input
            type="email"
            placeholder="voce@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            autoFocus
          />
        </div>
        {message && <p className="text-sm text-green-600">{message}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" type="submit" disabled={loading || !email}>
          {loading ? "Enviando..." : "Enviar link"}
        </Button>
      </form>
    </AuthShell>
  );
}
