"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Trash2, UserPlus, UsersRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authenticatedFetch } from "@/lib/supabase/client";
import { useToast } from "@/components/toast";

type Member = {
  id: string;
  user_id: string | null;
  role: "owner" | "admin" | "operator";
  invited_email: string | null;
  accepted_at: string | null;
  created_at: string;
};

export function MembersPanel() {
  const toast = useToast();
  const [members, setMembers] = useState<Member[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "operator">("operator");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch("/api/members");
      if (!res.ok) return;
      setMembers(await res.json());
    } catch {
      toast("Nao foi possivel carregar membros", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  async function inviteMember(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setSaving(true);
    try {
      const res = await authenticatedFetch("/api/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao criar convite.");
      setEmail("");
      toast("Convite criado");
      await loadMembers();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao criar convite", "error");
    } finally {
      setSaving(false);
    }
  }

  async function removeMember(member: Member) {
    const alvo = member.invited_email ?? "este membro";
    const pergunta = member.accepted_at
      ? `Remover ${alvo} da equipe? Ele perde o acesso ao painel.`
      : `Revogar o convite de ${alvo}?`;
    if (!window.confirm(pergunta)) return;

    setRemoving(member.id);
    try {
      const res = await authenticatedFetch(`/api/members?id=${encodeURIComponent(member.id)}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erro ao remover.");
      toast(member.accepted_at ? "Membro removido" : "Convite revogado");
      await loadMembers();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Erro ao remover", "error");
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-cobalt-500" />
          Membros e convites
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form className="mb-4 grid gap-2 md:grid-cols-[1fr_160px_auto]" onSubmit={inviteMember}>
          <Input
            type="email"
            placeholder="email@empresa.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as "admin" | "operator")}
            className="h-10 rounded-lg border border-volt-950/10 bg-white px-3 text-sm text-aco outline-none transition focus:border-cobalt-500/30 focus:ring-2 focus:ring-cobalt-500/10"
          >
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" disabled={saving || !email.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Convidar
          </Button>
        </form>

        <div className="divide-y divide-canvas-100 rounded-lg border border-volt-950/10">
          {loading ? (
            <div className="px-4 py-6 text-sm text-aco/50">Carregando membros...</div>
          ) : members.length === 0 ? (
            <div className="px-4 py-6 text-sm text-aco/50">Nenhum membro encontrado.</div>
          ) : (
            members.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-volt-950">
                    {member.invited_email ?? member.user_id ?? "Membro"}
                  </p>
                  <p className="text-xs text-aco/50">
                    {member.accepted_at ? "Acesso ativo" : "Convite pendente"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={member.role === "owner" ? "brand" : "slate"}>{member.role}</Badge>
                  <Badge tone={member.accepted_at ? "green" : "amber"}>
                    {member.accepted_at ? "Ativo" : "Pendente"}
                  </Badge>
                  <button
                    type="button"
                    onClick={() => void removeMember(member)}
                    disabled={removing === member.id}
                    aria-label={
                      member.accepted_at
                        ? `Remover ${member.invited_email ?? "membro"} da equipe`
                        : `Revogar convite de ${member.invited_email ?? "membro"}`
                    }
                    title={member.accepted_at ? "Remover da equipe" : "Revogar convite"}
                    className="rounded-lg p-2 text-aco/40 transition hover:bg-alerta/10 hover:text-alerta disabled:opacity-50"
                  >
                    {removing === member.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
