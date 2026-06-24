"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = password.length >= 6 && password === confirmPassword;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError("");

    const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <AuthShell title="Nova senha" subtitle="Defina uma senha segura para sua conta">
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Nova senha</label>
          <Input
            type="password"
            placeholder="Minimo 6 caracteres"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            autoFocus
          />
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-slate-700">Confirmar senha</label>
          <Input
            type="password"
            placeholder="Repita a nova senha"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        {password.length > 0 && password.length < 6 && (
          <p className="text-xs text-amber-600">A senha precisa de pelo menos 6 caracteres.</p>
        )}
        {confirmPassword.length > 0 && password !== confirmPassword && (
          <p className="text-xs text-amber-600">As senhas precisam ser iguais.</p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <Button className="w-full" type="submit" disabled={loading || !valid}>
          {loading ? "Salvando..." : "Salvar nova senha"}
        </Button>
      </form>
    </AuthShell>
  );
}
