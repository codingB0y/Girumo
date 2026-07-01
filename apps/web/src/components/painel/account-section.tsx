"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useRole } from "@/components/painel/role-provider";

export function AccountSection() {
  const router = useRouter();
  const toast = useToast();
  const { can } = useRole();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/account")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setName(data.name ?? "");
          setEmail(data.email ?? "");
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function save(field: "name" | "email" | "password") {
    const value = field === "name" ? name : field === "email" ? email : password;
    if (!value.trim()) return;

    setSaving(field);
    try {
      const res = await fetch("/api/auth/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast(d.error || "Erro ao salvar.", "error");
        return;
      }
      toast(
        field === "name"
          ? "Nome atualizado."
          : field === "email"
            ? "E-mail atualizado. Confirme na caixa de entrada."
            : "Senha atualizada.",
      );
      if (field === "password") setPassword("");
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setSaving(null);
    }
  }

  async function deleteAccount() {
    const res = await fetch("/api/auth/account", { method: "DELETE" });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      toast(d.error || "Erro ao deletar.", "error");
      return;
    }
    router.replace("/login");
  }

  if (loading) {
    return <div className="py-8 text-center text-sm text-aco/50">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Nome */}
      <FieldRow
        label="Nome"
        value={name}
        onChange={setName}
        saving={saving === "name"}
        onSave={() => save("name")}
      />

      {/* Email */}
      <FieldRow
        label="E-mail"
        type="email"
        value={email}
        onChange={setEmail}
        saving={saving === "email"}
        onSave={() => save("email")}
      />

      {/* Senha */}
      <FieldRow
        label="Nova senha"
        type="password"
        value={password}
        onChange={setPassword}
        placeholder="Mínimo 6 caracteres"
        saving={saving === "password"}
        onSave={() => save("password")}
        disabled={password.length > 0 && password.length < 6}
      />

      {/* Logout */}
      <div className="border-t border-breu/[0.06] pt-5">
        <button
          onClick={() => {
            fetch("/api/auth/logout", { method: "POST" }).then(() => router.push("/login"));
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-breu/15 px-4 py-2.5 text-sm font-medium text-breu transition hover:border-alerta hover:text-alerta"
        >
          Sair da conta
        </button>
      </div>

      {/* Delete */}
      {can("account:delete") && (
        <div className="border-t border-alerta/20 pt-5">
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-alerta/30 px-4 py-2.5 text-sm font-medium text-alerta transition hover:bg-alerta/10"
            >
              <Trash2 className="h-4 w-4" /> Deletar conta
            </button>
          ) : (
            <div className="rounded-2xl border border-alerta/30 bg-alerta/5 p-4">
              <p className="text-sm font-medium text-alerta">
                Tem certeza? Essa ação é irreversível. Todos os dados serão apagados.
              </p>
              <div className="mt-3 flex gap-3">
                <button
                  onClick={deleteAccount}
                  className="inline-flex items-center gap-2 rounded-lg bg-alerta px-4 py-2 text-sm font-medium text-white"
                >
                  <Trash2 className="h-4 w-4" /> Sim, deletar
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-lg border border-breu/15 px-4 py-2 text-sm font-medium text-breu"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FieldRow({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  saving,
  onSave,
  disabled,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  saving: boolean;
  onSave: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex-1">
        <label className="mb-1.5 block text-sm font-medium text-aco">{label}</label>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-breu/10 bg-white px-3.5 py-2.5 text-sm text-breu outline-none transition placeholder:text-aco/40 focus:border-iris/40 focus:ring-4 focus:ring-iris/10"
          onKeyDown={(e) => e.key === "Enter" && !disabled && onSave()}
        />
      </div>
      <button
        onClick={onSave}
        disabled={saving || disabled}
        className={cn(
          "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium text-white transition",
          saving || disabled ? "cursor-not-allowed bg-iris/40" : "bg-iris shadow-iris hover:-translate-y-0.5 hover:bg-iris-claro",
        )}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        Salvar
      </button>
    </div>
  );
}
