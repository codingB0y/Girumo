"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { persistSupabaseSession } from "@/lib/supabase/client";

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
        setError(data.error || "Nao foi possivel criar a conta.");
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
      subtitle="Comece gratis e configure sua operacao em poucos passos"
      context="Depois da conta, voce entra no painel para conectar o WhatsApp, revisar o plano e criar a primeira oferta."
      footer={
        <>
          Ja tem conta?{" "}
          <Link href="/login" className="font-medium text-iris hover:text-iris-escuro">
            Entrar
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-aco">Seu nome</label>
          <Input
            placeholder="Ex: Maria da Silva"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            autoComplete="name"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-aco">E-mail</label>
          <Input
            type="email"
            placeholder="voce@email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
          />
          {email.length > 0 && !emailOk && (
            <p className="mt-1 text-xs text-amber-600">Digite um e-mail valido para acessar sua organizacao.</p>
          )}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-aco">Senha</label>
          <Input
            type="password"
            placeholder="Minimo 6 caracteres"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
          {password.length > 0 && password.length < 6 && (
            <p className="mt-1 text-xs text-amber-600">A senha precisa de pelo menos 6 caracteres.</p>
          )}
        </div>
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <Button className="w-full" type="submit" disabled={loading || !valid}>
          {loading ? "Criando..." : "Criar conta"}
        </Button>
        <p className="text-center text-xs leading-5 text-aco/70">
          Ao criar conta, seus dados ficam separados da base de outros clientes por tenant.
        </p>
      </form>
    </AuthShell>
  );
}
