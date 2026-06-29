"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { persistSupabaseSession } from "@/lib/supabase/client";

const routeLabels: Record<string, string> = {
  "/hoje": "Hoje",
  "/leads": "Revendedoras",
  "/campaigns": "Campanhas",
  "/campanhas": "Campanhas",
  "/crescer": "Crescer",
  "/settings": "Configuracoes",
  "/groups": "Grupos",
  "/templates": "Modelos",
  "/schedules": "Agendamentos",
  "/reports": "Resultados",
};

function getSafeNext(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/hoje";
  return value;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = getSafeNext(params.get("next"));
  const destination = routeLabels[next] ?? "a area solicitada";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
        router.replace(next);
        router.refresh();
      } else {
        const data = await response.json().catch(() => ({}));
        setError(data.error || "Nao foi possivel entrar.");
      }
    } catch {
      setError("Erro ao entrar. Tente de novo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-aco">E-mail</label>
        <Input
          type="email"
          placeholder="voce@email.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoFocus
          autoComplete="email"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium text-aco">Senha</label>
        <Input
          type="password"
          placeholder="Sua senha"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
        />
        <div className="mt-1 text-right">
          <Link href="/forgot-password" className="text-xs font-medium text-iris hover:text-iris-escuro">
            Esqueci minha senha
          </Link>
        </div>
      </div>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <Button className="w-full" type="submit" disabled={loading || !email || !password}>
        {loading ? "Entrando..." : "Entrar"}
      </Button>
      <p className="text-center text-xs leading-5 text-aco/70">
        Ao entrar, voce volta para {destination}.
      </p>
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

function LoginPageContent() {
  const params = useSearchParams();
  const next = getSafeNext(params.get("next"));
  const destination = routeLabels[next] ?? "a area solicitada";

  return (
    <AuthShell
      title="Entrar"
      subtitle="Acesse sua central de operacao"
      context={next !== "/hoje" ? `Entre para continuar para ${destination}.` : undefined}
      footer={
        <>
          Nao tem conta?{" "}
          <Link href="/signup" className="font-medium text-iris hover:text-iris-escuro">
            Criar conta
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
