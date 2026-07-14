"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SignupProgress } from "@/components/signup-progress";
import { persistSupabaseSession } from "@/lib/supabase/client";

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

const inputClass =
  "h-11 w-full rounded-[var(--radius-control)] border border-volt-800 bg-volt-950 px-4 text-sm text-canvas-100 placeholder:text-canvas-100/35 outline-none transition-[border-color,box-shadow] duration-[var(--duration-micro)] ease-[var(--ease-girumo)] focus:border-cobalt-500 focus:ring-2 focus:ring-cobalt-500/30";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const valid = name.trim().length > 0 && emailOk && password.length >= 6;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      if (response.ok) {
        const data = await response.json().catch(() => ({}));
        await persistSupabaseSession(data);
        router.replace("/painel");
        router.refresh();
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Não foi possível criar a conta.");
      }
    } catch {
      setError("Erro ao criar conta. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Criar sua conta"
      subtitle="7 dias grátis — sem cartão, sem compromisso"
      context="Depois de criar sua conta, você conecta o WhatsApp em 2 minutos e já pode disparar para todos os grupos."
      footer={
        <>
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-acid-500 transition-colors hover:text-canvas-100">
            Entrar
          </Link>
        </>
      }
    >
      <SignupProgress current={1} />
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-canvas-100/70">Seu nome</label>
          <input
            placeholder="Ex: Maria da Silva"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            autoComplete="name"
            className={inputClass}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-canvas-100/70">E-mail</label>
          <input
            type="email"
            placeholder="voce@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            className={inputClass}
          />
          {email.length > 0 && !emailOk && (
            <p className="mt-1 text-xs text-canvas-100/80">Digite um e-mail válido.</p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-canvas-100/70">Senha</label>
          <input
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className={inputClass}
          />
          {password.length > 0 && password.length < 6 && (
            <p className="mt-1 text-xs text-canvas-100/80">A senha precisa de pelo menos 6 caracteres.</p>
          )}
        </div>

        {error && <p className="rounded-[var(--radius-control)] border border-danger-700/40 bg-danger-700/15 px-3 py-2 text-sm text-canvas-100">{error}</p>}

        <button
          type="submit"
          disabled={loading || !valid}
          className="flex h-11 w-full items-center justify-center rounded-[var(--radius-control)] bg-acid-500 text-sm font-semibold text-volt-950 transition-[filter] duration-[var(--duration-micro)] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? "Criando..." : "Criar conta"}
        </button>

        <div className="relative my-2">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-volt-800" />
          </div>
          <div className="relative flex justify-center">
            <span className="bg-volt-900 px-3 text-xs text-canvas-100/40">ou</span>
          </div>
        </div>

        <a
          href="/api/auth/google?next=/painel"
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-[var(--radius-control)] border border-volt-800 bg-volt-950 text-sm font-medium text-canvas-100 transition-colors duration-[var(--duration-micro)] hover:border-cobalt-500 hover:bg-volt-800"
        >
          <GoogleIcon />
          Criar conta com Google
        </a>

        <p className="text-center text-xs leading-5 text-canvas-100/50">
          Seus dados ficam protegidos e só você tem acesso. Cancele quando quiser.
        </p>
      </form>
    </AuthShell>
  );
}
