"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/components/auth-shell";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  const valid = name.trim().length > 0 && emailOk && password.length >= 6;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      if (res.ok) {
        router.replace("/hoje");
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
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
      subtitle="Comece a lotar seus grupos hoje"
      footer={
        <>
          Já tem conta?{" "}
          <Link href="/login" className="font-medium text-brand-600 hover:text-brand-700">
            Entrar
          </Link>
        </>
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Seu nome</label>
          <Input
            placeholder="Ex: Maria da Silva"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            autoComplete="name"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">E-mail</label>
          <Input
            type="email"
            placeholder="voce@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Senha</label>
          <Input
            type="password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
          {password.length > 0 && password.length < 6 && (
            <p className="mt-1 text-xs text-amber-600">A senha precisa de pelo menos 6 caracteres.</p>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" type="submit" disabled={loading || !valid}>
          {loading ? "Criando..." : "Criar conta"}
        </Button>
      </form>
    </AuthShell>
  );
}
