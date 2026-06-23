"use client";

import { useEffect, useState } from "react";
import { Smartphone, CheckCircle2, QrCode, ShieldOff, Plus, WifiOff, MessageSquareHeart, X } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/toast";

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
  const [loaded, setLoaded] = useState(false); // 1º fetch (evita flash de "Desconectado")

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
    const t = setInterval(loadSession, 15_000);
    return () => clearInterval(t);
  }, []);

  async function saveWelcome(next: Welcome) {
    setSavingWelcome(true);
    setWelcome(next); // otimista
    try {
      await fetch("/api/welcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      toast(next.enabled ? "Boas-vindas automáticas ligadas" : "Boas-vindas salvas");
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
    toast("Número adicionado à lista de bloqueio");
  }

  async function removeOptout(id: string) {
    await fetch(`/api/optout?id=${id}`, { method: "DELETE" });
    await loadOptout();
    toast("Número removido da lista");
  }

  return (
    <>
      <Topbar title="Configurações" subtitle="Conexão do WhatsApp e LGPD" />
      <main className="flex-1 p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Conexão real */}
          <Card>
            <CardHeader>
              <CardTitle>Conexão do WhatsApp</CardTitle>
            </CardHeader>
            <CardContent>
              {!loaded ? (
                <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-4">
                  <Skeleton className="h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              ) : session.live ? (
                <div className="flex items-center gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
                  <CheckCircle2 className="h-8 w-8 text-green-600" />
                  <div>
                    <p className="font-medium text-green-800">Conectado</p>
                    <p className="text-sm text-green-700">
                      {session.profileName ?? "WhatsApp"} · {session.phone ?? "—"}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-6 text-center">
                  <WifiOff className="h-8 w-8 text-slate-400" />
                  <p className="font-medium text-slate-700">Desconectado</p>
                  <p className="flex items-center gap-1.5 text-sm text-slate-500">
                    <QrCode className="h-4 w-4" />
                    Rode a engine (<code>npm start</code> em devzap-engine) e escaneie o QR.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Limites de envio (config da engine) */}
          <Card>
            <CardHeader>
              <CardTitle>Limites de envio (anti-ban)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-slate-500">
                Padrões atuais da engine. (Edição aplicada à engine vem no backend.)
              </p>
              <div className="grid grid-cols-3 gap-3">
                <LimitField label="Intervalo (s)" value="3–7" />
                <LimitField label="Máx/min" value="8" />
                <LimitField label="Máx/dia" value="800" />
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Número novo entra em warm-up (dia 1 ≈ 20 msgs, sobe ~7 dias).
              </p>
            </CardContent>
          </Card>

          {/* Boas-vindas automáticas (Sprint 2) */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <MessageSquareHeart className="h-4 w-4 text-green-500" />
                Boas-vindas automáticas
              </CardTitle>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <span className={welcome.enabled ? "font-medium text-green-700" : "text-slate-400"}>
                  {welcome.enabled ? "Ligado" : "Desligado"}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={welcome.enabled}
                  onClick={() => saveWelcome({ ...welcome, enabled: !welcome.enabled })}
                  disabled={savingWelcome}
                  className={`relative h-6 w-11 rounded-full transition ${
                    welcome.enabled ? "bg-green-500" : "bg-slate-300"
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
              <p className="mb-3 text-sm text-slate-500">
                Quando alguém <strong>entra num grupo</strong>, manda uma mensagem privada de boas-vindas.
                Passa pela fila anti-ban e <strong>ignora números no opt-out</strong>. Use{" "}
                <code className="rounded bg-slate-100 px-1">{"{nome}"}</code> para o nome da pessoa.
              </p>
              <Textarea
                rows={4}
                value={welcome.message}
                onChange={(e) => setWelcome({ ...welcome, message: e.target.value })}
                placeholder="Oi {nome}! Seja bem-vinda(o) ao grupo..."
              />
              <div className="mt-3 flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs text-amber-600">
                  <ShieldOff className="h-3.5 w-3.5" />
                  DM em massa tem risco de ban — comece devagar e observe a entrega.
                </p>
                <Button
                  size="sm"
                  onClick={() => saveWelcome(welcome)}
                  disabled={savingWelcome || !welcome.message.trim()}
                >
                  {savingWelcome ? "Salvando..." : "Salvar mensagem"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Opt-out / LGPD real */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex items-center justify-between">
              <CardTitle>Descadastro e LGPD</CardTitle>
              <div className="flex items-center gap-2">
                <Input
                  className="h-9 w-44"
                  placeholder="+55 62 9..."
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
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
                <p className="text-sm text-amber-800">
                  Números nesta lista <strong>não recebem boas-vindas nem viram lead</strong>. Mensagens
                  postadas no grupo são vistas por todos os membros — para excluir alguém de verdade,
                  remova a pessoa do grupo.
                </p>
              </div>
              {!loaded ? (
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={`sk-${i}`} className="flex items-center gap-2 px-4 py-3">
                      <Skeleton className="h-4 w-4 rounded" />
                      <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : optout.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">Nenhum número na lista.</p>
              ) : (
                <div className="divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {optout.map((o) => (
                    <div key={o.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Smartphone className="h-4 w-4 text-slate-400" />
                        <div>
                          <p className="text-sm font-medium text-slate-800">{o.phone}</p>
                          <p className="text-xs text-slate-400">{o.reason}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400">{formatDateTime(o.date)}</span>
                        <button
                          onClick={() => removeOptout(o.id)}
                          className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600"
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
        </div>
      </main>
    </>
  );
}

function LimitField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center">
      <p className="text-lg font-semibold text-slate-900">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
