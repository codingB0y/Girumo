"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  MessageSquareHeart,
  Plus,
  QrCode,
  ShieldOff,
  Smartphone,
  WifiOff,
  X,
} from "lucide-react";
import { AuditLogPanel } from "@/components/audit-log-panel";
import { BillingPanel } from "@/components/billing-panel";
import { InstancesPanel } from "@/components/instances-panel";
import { MembersPanel } from "@/components/members-panel";
import { Topbar } from "@/components/topbar";
import { useToast } from "@/components/toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/utils";

type Session = { live: boolean; phone: string | null; profileName: string | null };
type OptOut = { id: string; phone: string; reason: string; date: string };
type Welcome = { enabled: boolean; message: string };

export default function SettingsPage() {
  const toast = useToast();
  const [session, setSession] = useState<Session>({ live: false, phone: null, profileName: null });
  const [optout, setOptout] = useState<OptOut[]>([]);
  const [newPhone, setNewPhone] = useState("");
  const [welcome, setWelcome] = useState<Welcome>({ enabled: false, message: "" });
  const [savingWelcome, setSavingWelcome] = useState(false);
  const [loaded, setLoaded] = useState(false);

  async function loadOptout() {
    try {
      setOptout(await fetch("/api/optout").then((r) => r.json()));
    } catch {}
  }

  async function loadWelcome() {
    try {
      const w = await fetch("/api/welcome").then((r) => r.json());
      setWelcome({ enabled: !!w.enabled, message: w.message ?? "" });
    } catch {}
  }

  useEffect(() => {
    const loadSession = () =>
      fetch("/api/session")
        .then((r) => r.json())
        .then(setSession)
        .catch(() => {})
        .finally(() => setLoaded(true));
    loadSession();
    loadOptout();
    loadWelcome();
    const timer = setInterval(loadSession, 15_000);
    return () => clearInterval(timer);
  }, []);

  async function saveWelcome(next: Welcome) {
    setSavingWelcome(true);
    setWelcome(next);
    try {
      await fetch("/api/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      toast(next.enabled ? "Boas-vindas automaticas ligadas" : "Boas-vindas salvas");
    } catch {
      toast("Erro ao salvar boas-vindas", "error");
    } finally {
      setSavingWelcome(false);
    }
  }

  async function addOptout() {
    if (!newPhone.trim()) return;
    await fetch("/api/optout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: newPhone, reason: "Adicionado no painel" }),
    });
    setNewPhone("");
    await loadOptout();
    toast("Numero adicionado a lista de bloqueio");
  }

  async function removeOptout(id: string) {
    await fetch(`/api/optout?id=${id}`, { method: "DELETE" });
    await loadOptout();
    toast("Numero removido da lista");
  }

  return (
    <>
      <Topbar title="Configuracoes" subtitle="Plano, equipe, WhatsApp e seguranca operacional" />
      <main className="flex-1 bg-bruma/70 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5">
          <section className="grid gap-3 md:grid-cols-3">
            <StatusTile
              label="WhatsApp"
              value={loaded && session.live ? "Conectado" : loaded ? "Desconectado" : "Carregando"}
              detail={session.phone ?? session.profileName ?? "Status da sessao principal"}
              state={loaded && session.live ? "ok" : "muted"}
            />
            <StatusTile
              label="Boas-vindas"
              value={welcome.enabled ? "Ligado" : "Desligado"}
              detail={welcome.message ? "Mensagem configurada" : "Sem mensagem ativa"}
              state={welcome.enabled ? "ok" : "muted"}
            />
            <StatusTile
              label="Opt-out"
              value={`${optout.length}`}
              detail="Numeros bloqueados para automacoes"
              state={optout.length > 0 ? "warn" : "muted"}
            />
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <BillingPanel />
            <MembersPanel />
            <InstancesPanel />
            <AuditLogPanel />

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-iris" />
                  Conexao do WhatsApp
                </CardTitle>
              </CardHeader>
              <CardContent>
                {!loaded ? (
                  <div className="flex items-center gap-3 rounded-lg border border-breu/10 bg-white p-4">
                    <Skeleton className="h-8 w-8 rounded-lg" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-40" />
                    </div>
                  </div>
                ) : session.live ? (
                  <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                    <div>
                      <p className="font-medium text-emerald-900">Conectado</p>
                      <p className="text-sm text-emerald-700">
                        {session.profileName ?? "WhatsApp"} - {session.phone ?? "telefone nao sincronizado"}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3 rounded-lg border border-breu/10 bg-white p-4">
                    <WifiOff className="mt-0.5 h-6 w-6 text-aco/50" />
                    <div>
                      <p className="font-medium text-breu">Desconectado</p>
                      <p className="mt-1 flex items-center gap-1.5 text-sm text-aco/70">
                        <QrCode className="h-4 w-4" />
                        A engine precisa estar online para gerar QR e atualizar status.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock3 className="h-4 w-4 text-iris" />
                  Limites de envio
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-3">
                  <LimitField label="Intervalo" value="3-7s" />
                  <LimitField label="Max/min" value="8" />
                  <LimitField label="Max/dia" value="800" />
                </div>
                <p className="mt-3 text-xs leading-5 text-aco/70">
                  Numeros novos devem entrar em aquecimento gradual antes de campanhas maiores.
                </p>
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2">
                  <MessageSquareHeart className="h-4 w-4 text-emerald-600" />
                  Boas-vindas automaticas
                </CardTitle>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <span className={welcome.enabled ? "font-medium text-emerald-700" : "text-aco/50"}>
                    {welcome.enabled ? "Ligado" : "Desligado"}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={welcome.enabled}
                    onClick={() => saveWelcome({ ...welcome, enabled: !welcome.enabled })}
                    disabled={savingWelcome}
                    className={`relative h-6 w-11 rounded-full transition ${
                      welcome.enabled ? "bg-emerald-500" : "bg-aco/30"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                        welcome.enabled ? "left-[22px]" : "left-0.5"
                      }`}
                    />
                  </button>
                </label>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
                  <Textarea
                    rows={5}
                    value={welcome.message}
                    onChange={(event) => setWelcome({ ...welcome, message: event.target.value })}
                    placeholder="Oi {nome}! Seja bem-vindo ao grupo..."
                  />
                  <div className="rounded-lg border border-breu/10 bg-bruma p-3 text-sm text-aco">
                    <p className="font-medium text-breu">Variavel disponivel</p>
                    <code className="mt-2 inline-flex rounded bg-white px-2 py-1 text-xs text-aco">{"{nome}"}</code>
                    <p className="mt-3 text-xs leading-5 text-aco/70">
                      A mensagem passa pela fila da engine e respeita a lista de opt-out.
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="flex items-center gap-1.5 text-xs text-amber-700">
                    <ShieldOff className="h-3.5 w-3.5" />
                    Comece devagar e acompanhe os logs de entrega.
                  </p>
                  <Button size="sm" onClick={() => saveWelcome(welcome)} disabled={savingWelcome || !welcome.message.trim()}>
                    {savingWelcome ? "Salvando..." : "Salvar mensagem"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <CardTitle>Descadastro e LGPD</CardTitle>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Input
                    className="h-9 sm:w-52"
                    placeholder="+55 62 9..."
                    value={newPhone}
                    onChange={(event) => setNewPhone(event.target.value)}
                  />
                  <Button size="sm" onClick={addOptout}>
                    <Plus className="h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                  <p className="text-sm leading-5 text-amber-900">
                    Numeros nesta lista nao recebem boas-vindas nem entram como lead automatico.
                  </p>
                </div>
                {!loaded ? (
                  <div className="divide-y divide-bruma rounded-lg border border-breu/10 bg-white">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={`sk-${index}`} className="flex items-center gap-2 px-4 py-3">
                        <Skeleton className="h-4 w-4 rounded" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-3 w-24" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : optout.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-breu/10 bg-white py-6 text-center text-sm text-aco/50">
                    Nenhum numero na lista.
                  </p>
                ) : (
                  <div className="divide-y divide-bruma rounded-lg border border-breu/10 bg-white">
                    {optout.map((item) => (
                      <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Smartphone className="h-4 w-4 text-aco/50" />
                          <div>
                            <p className="text-sm font-medium text-breu">{item.phone}</p>
                            <p className="text-xs text-aco/50">{item.reason}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-aco/50">{formatDateTime(item.date)}</span>
                          <button
                            onClick={() => removeOptout(item.id)}
                            className="rounded-lg p-1 text-aco/50 transition hover:bg-red-50 hover:text-red-600"
                            title="Remover da lista"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </>
  );
}

function StatusTile({
  label,
  value,
  detail,
  state,
}: {
  label: string;
  value: string;
  detail: string;
  state: "ok" | "warn" | "muted";
}) {
  const dotClass =
    state === "ok" ? "bg-emerald-500" : state === "warn" ? "bg-amber-500" : "bg-aco/30";

  return (
    <div className="rounded-lg border border-breu/10 bg-white px-4 py-3 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wide text-aco/70">{label}</p>
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      </div>
      <p className="mt-2 text-lg font-semibold text-breu">{value}</p>
      <p className="mt-1 truncate text-xs text-aco/70">{detail}</p>
    </div>
  );
}

function LimitField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-breu/10 bg-white px-3 py-3 text-center">
      <p className="text-lg font-semibold text-breu">{value}</p>
      <p className="text-xs text-aco/50">{label}</p>
    </div>
  );
}
