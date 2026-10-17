"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { isAuthSessionMissingError } from "@supabase/supabase-js";
import { AuthShellVitrine as AuthShell } from "@/components/auth/auth-shell-vitrine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { CLASSES_DA_PORTA } from "@/lib/painel/auth-classes";
import { linkDeRecuperacaoFalhou, mensagemDaNovaSenha } from "@/lib/auth/erros-do-auth";

type EstadoDoLink = "conferindo" | "valido" | "vencido";

export default function ResetPasswordPage() {
  const c = CLASSES_DA_PORTA;
  const router = useRouter();
  const [link, setLink] = useState<EstadoDoLink>("conferindo");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const valid = password.length >= 6 && password === confirmPassword;

  // Link vencido ou já usado (aberto antes em outro aparelho, clicado duas vezes)
  // chega com o erro na URL e sem sessão: o formulário não teria como salvar, e
  // o lojista só descobria no fim, com "Auth session missing!" em inglês.
  useEffect(() => {
    const { hash, search } = window.location;
    if (linkDeRecuperacaoFalhou(hash) || linkDeRecuperacaoFalhou(search)) {
      setLink("vencido");
      return;
    }
    getSupabaseBrowserClient()
      .auth.getSession()
      .then(({ data }) => setLink(data.session ? "valido" : "vencido"))
      .catch(() => setLink("vencido"));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError("");

    const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({ password });

    if (updateError) {
      if (isAuthSessionMissingError(updateError)) setLink("vencido");
      else setError(mensagemDaNovaSenha(updateError));
      setLoading(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  if (link === "vencido") {
    return (
      <AuthShell title="Link vencido" subtitle="Este link de recuperação não vale mais">
        <div className="space-y-4">
          <p className={c.texto}>
            O link venceu ou já foi usado. Cada link de recuperação funciona uma vez só e por tempo limitado.
          </p>
          <Link href="/forgot-password" className={c.primario}>
            Pedir um novo link
          </Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Nova senha" subtitle="Defina uma senha segura para sua conta">
      <form className="space-y-4" onSubmit={submit}>
        <div>
          <label className={c.rotulo}>Nova senha</label>
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
          <label className={c.rotulo}>Confirmar senha</label>
          <Input
            type="password"
            placeholder="Repita a nova senha"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>
        {password.length > 0 && password.length < 6 && (
          <p className={c.aviso}>A senha precisa de pelo menos 6 caracteres.</p>
        )}
        {confirmPassword.length > 0 && password !== confirmPassword && (
          <p className={c.aviso}>As senhas precisam ser iguais.</p>
        )}
        {error && <p className={c.erro}>{error}</p>}
        <Button className="w-full" type="submit" disabled={loading || !valid || link !== "valido"}>
          {link === "conferindo" ? "Conferindo o link..." : loading ? "Salvando..." : "Salvar nova senha"}
        </Button>
      </form>
    </AuthShell>
  );
}
