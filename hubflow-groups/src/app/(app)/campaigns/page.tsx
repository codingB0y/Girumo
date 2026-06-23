"use client";

import { useEffect, useState } from "react";
import { Megaphone, Copy, Send, Check, FileText, Trash2, Image as ImageIcon, X } from "lucide-react";
import { Topbar } from "@/components/topbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { type Campaign, type Group, type MessageTemplate } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/toast";
import { useCampanhas } from "@/lib/use-campanhas";

const statusTone = {
  draft: "slate",
  scheduled: "blue",
  queued: "blue",
  running: "amber",
  sent: "green",
  failed: "red",
} as const;

const statusLabel = {
  draft: "Rascunho",
  scheduled: "Agendada",
  queued: "Na fila",
  running: "Enviando",
  sent: "Enviada",
  failed: "Falhou",
} as const;

export default function CampaignsPage() {
  const toast = useToast();
  const { active } = useCampanhas();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [allGroups, setAllGroups] = useState<Group[]>([]);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loaded, setLoaded] = useState(false); // 1º fetch das campanhas (skeleton até lá)
  // Escopo: só os grupos da campanha ativa (se houver). Maiores primeiro.
  const groups = (active ? allGroups.filter((g) => active.groupIds.includes(g.id)) : allGroups)
    .slice()
    .sort((a, b) => b.members - a.members);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [mediaKind, setMediaKind] = useState<"image" | "video">("image");
  const [uploading, setUploading] = useState(false);
  const [mentionAll, setMentionAll] = useState(false);
  const [pollOn, setPollOn] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);

  async function loadCampaigns() {
    try {
      setCampaigns(await fetch("/api/broadcasts").then((r) => r.json()));
    } catch {
    } finally {
      setLoaded(true);
    }
  }
  useEffect(() => {
    loadCampaigns();
    fetch("/api/groups").then((r) => r.json()).then(setAllGroups).catch(() => {});
    fetch("/api/templates").then((r) => r.json()).then(setTemplates).catch(() => {});
  }, []);

  // Enquanto houver disparo na fila/rodando, atualiza o progresso de tempos em tempos.
  const hasActive = campaigns.some((c) => c.status === "queued" || c.status === "running");
  useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(loadCampaigns, 4000);
    return () => clearInterval(t);
  }, [hasActive]);

  async function send(c: Campaign) {
    if (c.groupIds.length === 0) {
      toast("Selecione ao menos um grupo (duplique e edite a campanha).", "error");
      return;
    }
    if (!confirm(`Enviar "${c.name}" para ${c.groupIds.length} grupo(s) agora?`)) return;
    try {
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: c.id }),
      });
      if (!res.ok) throw new Error();
      await loadCampaigns();
      toast("Na fila! A engine vai disparar pela fila anti-ban.");
    } catch {
      toast("Erro ao enfileirar o disparo", "error");
    }
  }

  function toggleGroup(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function uploadFoto(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/media", { method: "POST", body: fd });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error || "Erro no upload");
      }
      const { id, type } = await res.json();
      setMediaId(id);
      setMediaKind(type === "video" ? "video" : "image");
      toast(type === "video" ? "Vídeo anexado 🎬" : "Foto anexada 📷");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setUploading(false);
    }
  }

  const pollValid = pollOn && pollQuestion.trim() && pollOptions.filter((o) => o.trim()).length >= 2;

  async function save() {
    if (!name.trim() || (!message.trim() && !mediaId && !pollValid)) return;
    setSaving(true);
    try {
      const poll = pollValid
        ? { question: pollQuestion.trim(), options: pollOptions.map((o) => o.trim()).filter(Boolean) }
        : undefined;
      await fetch("/api/broadcasts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, message, groupIds: selected, mediaId, mediaType: mediaKind, mentionAll, poll }),
      });
      setName("");
      setMessage("");
      setSelected([]);
      setMediaId(null);
      setMentionAll(false);
      setPollOn(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      await loadCampaigns();
      toast("Oferta salva");
    } catch {
      toast("Erro ao salvar", "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Excluir esta campanha?")) return;
    await fetch(`/api/broadcasts?id=${id}`, { method: "DELETE" });
    await loadCampaigns();
    toast("Campanha excluída");
  }

  const reach = groups
    .filter((g) => selected.includes(g.id))
    .reduce((sum, g) => sum + g.members, 0);

  return (
    <>
      <Topbar title="Ofertas" subtitle="Crie e envie ofertas para seus grupos" />
      <main className="grid flex-1 grid-cols-1 gap-6 p-6 xl:grid-cols-5">
        {/* Lista */}
        <div className="space-y-3 xl:col-span-3">
          <h2 className="font-semibold text-slate-900">Suas campanhas</h2>
          {!loaded &&
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={`sk-${i}`} className="p-4">
                <div className="flex items-start gap-3">
                  <Skeleton className="h-10 w-10 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-3 w-56" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </Card>
            ))}
          {loaded && campaigns.length === 0 && (
            <Card className="p-8 text-center text-sm text-slate-400">
              Nenhuma campanha ainda. Crie a primeira ao lado.
            </Card>
          )}
          {campaigns.map((c) => {
            const pct = c.total ? Math.round((c.sent / c.total) * 100) : 0;
            return (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Megaphone className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="flex items-center gap-1.5 font-medium text-slate-900">
                        {c.name}
                        {c.mediaId && <span title="Com foto" className="text-xs">📷</span>}
                        {c.mentionAll && <span title="Marca todos" className="rounded bg-brand-50 px-1 text-[10px] font-semibold text-brand-700">@todos</span>}
                      </p>
                      <p className="mt-0.5 line-clamp-1 max-w-md text-sm text-slate-500">
                        {c.message || (c.mediaId ? "(só foto)" : "")}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        {c.groupIds.length} grupos · {c.total} destinatários
                      </p>
                    </div>
                  </div>
                  <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>
                </div>
                {(c.status === "running" || c.status === "queued" || c.status === "sent") && (
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={cn("h-full rounded-full", c.status === "queued" ? "bg-blue-400" : "bg-green-500")}
                        style={{ width: `${c.status === "queued" ? 100 : pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-slate-400">
                      {c.status === "queued" ? "na fila" : `${c.sent}/${c.total}`}
                    </span>
                  </div>
                )}
                {c.status === "failed" && c.error && (
                  <p className="mt-2 text-xs text-red-500">⚠️ {c.error}</p>
                )}
                <div className="mt-3 flex gap-2">
                  {(c.status === "draft" || c.status === "failed" || c.status === "sent") && (
                    <Button size="sm" onClick={() => send(c)}>
                      <Send className="h-3.5 w-3.5" />
                      {c.status === "sent" ? "Enviar de novo" : "Enviar agora"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setName(`${c.name} (cópia)`);
                      setMessage(c.message);
                      setSelected(c.groupIds);
                    }}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    Duplicar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => remove(c.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Excluir
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Criador */}
        <div className="xl:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Nova campanha</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Nome</label>
                <Input
                  placeholder="Ex: Promoção de sexta"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700">Usar um template</p>
                <div className="flex flex-wrap gap-1.5">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setMessage(t.body)}
                      className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
                    >
                      <FileText className="h-3 w-3" />
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Mensagem {mediaId && <span className="font-normal text-slate-400">(legenda da foto)</span>}
                </label>
                <Textarea
                  rows={4}
                  placeholder="Digite a mensagem que será enviada aos grupos..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>

              {/* Anexar foto/vídeo */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Foto ou vídeo da peça (opcional)</label>
                {mediaId ? (
                  <div className="flex items-center gap-3 rounded-lg border border-slate-200 p-2">
                    {mediaKind === "video" ? (
                      <video src={`/api/media/${mediaId}`} className="h-16 w-16 rounded-md object-cover" muted />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={`/api/media/${mediaId}`} alt="mídia" className="h-16 w-16 rounded-md object-cover" />
                    )}
                    <span className="flex-1 text-xs text-slate-500">
                      {mediaKind === "video" ? "Vídeo" : "Foto"} anexado — vai junto da oferta.
                    </span>
                    <button onClick={() => setMediaId(null)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Remover">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm font-medium text-slate-500 transition hover:border-brand-300 hover:text-brand-700">
                    <ImageIcon className="h-4 w-4" />
                    {uploading ? "Enviando..." : "Anexar foto ou vídeo (até 6MB foto / 20MB vídeo)"}
                    <input
                      type="file"
                      accept="image/*,video/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadFoto(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Prévia estilo WhatsApp */}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Prévia</label>
                <div className="rounded-lg bg-[#e5ddd5] p-4">
                  <div className="max-w-[85%] overflow-hidden rounded-lg rounded-tl-none bg-white shadow-sm">
                    {mediaId &&
                      (mediaKind === "video" ? (
                        <video src={`/api/media/${mediaId}`} className="max-h-48 w-full object-cover" controls muted />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/media/${mediaId}`} alt="prévia" className="max-h-48 w-full object-cover" />
                      ))}
                    <div className="p-2.5">
                      <p className="whitespace-pre-wrap text-sm text-slate-800">
                        {message || (mediaId ? "" : "Sua mensagem aparece aqui...")}
                      </p>
                      <p className="mt-1 text-right text-[10px] text-slate-400">12:30 ✓✓</p>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Grupos de destino
                </label>
                <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {groups.length === 0 && (
                    <p className="px-2 py-3 text-xs text-slate-400">
                      Nenhum grupo. Rode a engine para sincronizar.
                    </p>
                  )}
                  {groups.map((g) => {
                    const on = selected.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        onClick={() => toggleGroup(g.id)}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-slate-50"
                      >
                        <div
                          className={cn(
                            "flex h-4 w-4 items-center justify-center rounded border-2",
                            on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300",
                          )}
                        >
                          {on && <Check className="h-3 w-3" />}
                        </div>
                        <span className="flex-1 truncate text-sm text-slate-700">{g.name}</span>
                        <span className="text-xs text-slate-400">{g.members}</span>
                      </button>
                    );
                  })}
                </div>
                {selected.length > 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    Alcance estimado:{" "}
                    <span className="font-semibold text-brand-600">
                      {reach.toLocaleString("pt-BR")}
                    </span>{" "}
                    membros em {selected.length} grupos
                  </p>
                )}
              </div>

              {/* Enquete */}
              <div className="rounded-lg border border-slate-200 p-3">
                <button onClick={() => setPollOn((v) => !v)} className="flex w-full items-center gap-3 text-left">
                  <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition", pollOn ? "bg-brand-600" : "bg-slate-300")}>
                    <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", pollOn ? "left-4" : "left-0.5")} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-slate-800">Enviar como enquete</span>
                    <span className="block text-xs text-slate-400">Gera engajamento — a galera vota e o grupo esquenta.</span>
                  </span>
                </button>
                {pollOn && (
                  <div className="mt-3 space-y-2">
                    <Input placeholder="Pergunta (ex: Qual peça você quer essa semana?)" value={pollQuestion} onChange={(e) => setPollQuestion(e.target.value)} />
                    {pollOptions.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <Input
                          placeholder={`Opção ${i + 1}`}
                          value={opt}
                          onChange={(e) => setPollOptions((p) => p.map((o, j) => (j === i ? e.target.value : o)))}
                        />
                        {pollOptions.length > 2 && (
                          <button onClick={() => setPollOptions((p) => p.filter((_, j) => j !== i))} className="rounded p-1.5 text-slate-400 hover:text-red-600">
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 6 && (
                      <button onClick={() => setPollOptions((p) => [...p, ""])} className="text-xs font-medium text-brand-600 hover:text-brand-700">
                        + adicionar opção
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Marcar todos */}
              <button
                onClick={() => setMentionAll((v) => !v)}
                className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left transition hover:bg-slate-50"
              >
                <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition", mentionAll ? "bg-brand-600" : "bg-slate-300")}>
                  <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", mentionAll ? "left-4" : "left-0.5")} />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">Marcar todos no grupo (@)</span>
                  <span className="block text-xs text-slate-400">Notifica cada membro — a oferta não passa batida. Use com moderação.</span>
                </span>
              </button>

              <Button className="w-full" onClick={save} disabled={saving || !name.trim() || (!message.trim() && !mediaId && !pollValid)}>
                <Send className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar oferta"}
              </Button>
              <p className="text-center text-xs text-slate-400">
                Salve a oferta e use <span className="font-medium">Enviar agora</span> — a engine dispara
                pela fila anti-ban, 1 mensagem por grupo no ritmo seguro.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </>
  );
}
