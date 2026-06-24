"use client";

import { useEffect, useState } from "react";
import { Loader2, UserPlus, UsersRound } from "lucide-react";
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

  async function loadMembers() {
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
  }

  useEffect(() => {
    loadMembers();
  }, []);

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

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersRound className="h-4 w-4 text-brand-500" />
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
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none transition focus:border-brand-300 focus:ring-2 focus:ring-brand-100"
          >
            <option value="operator">Operator</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" disabled={saving || !email.trim()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Convidar
          </Button>
        </form>

        <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {loading ? (
            <div className="px-4 py-6 text-sm text-slate-400">Carregando membros...</div>
          ) : members.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-400">Nenhum membro encontrado.</div>
          ) : (
            members.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">
                    {member.invited_email ?? member.user_id ?? "Membro"}
                  </p>
                  <p className="text-xs text-slate-400">
                    {member.accepted_at ? "Acesso ativo" : "Convite pendente"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={member.role === "owner" ? "brand" : "slate"}>{member.role}</Badge>
                  <Badge tone={member.accepted_at ? "green" : "amber"}>
                    {member.accepted_at ? "Ativo" : "Pendente"}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
