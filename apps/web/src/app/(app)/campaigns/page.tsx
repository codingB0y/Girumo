"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Copy,
  FileText,
  Image as ImageIcon,
  Megaphone,
  Send,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Topbar } from "@/components/topbar";
import { useToast } from "@/components/toast";
import { type Campaign, type Group, type MessageTemplate } from "@/lib/mock-data";
import { cn } from "@/lib/utils";
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
  const [loaded, setLoaded] = useState(false);
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

  const groups = (active ? allGroups.filter((group) => active.groupIds.includes(group.id)) : allGroups)
    .slice()
    .sort((a, b) => b.members - a.members);

  const stats = useMemo(() => {
    return {
      total: campaigns.length,
      active: campaigns.filter((item) => item.status === "queued" || item.status === "running").length,
      sent: campaigns.filter((item) => item.status === "sent").length,
    };
  }, [campaigns]);

  async function loadCampaigns() {
    try {
      setCampaigns(await fetch("/api/broadcasts").then((response) => response.json()));
    } catch {
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    loadCampaigns();
    fetch("/api/groups").then((response) => response.json()).then(setAllGroups).catch(() => {});
    fetch("/api/templates").then((response) => response.json()).then(setTemplates).catch(() => {});
  }, []);

  const hasActive = campaigns.some((campaign) => campaign.status === "queued" || campaign.status === "running");
  useEffect(() => {
    if (!hasActive) return;
    const timer = setInterval(loadCampaigns, 4000);
    return () => clearInterval(timer);
  }, [hasActive]);

  async function send(campaign: Campaign) {
    if (campaign.groupIds.length === 0) {
      toast("Selecione ao menos um grupo duplicando e editando a campanha.", "error");
      return;
    }
    if (!confirm(`Enviar "${campaign.name}" para ${campaign.groupIds.length} grupo(s) agora?`)) return;
    try {
      const response = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: campaign.id }),
      });
      if (!response.ok) throw new Error();
      await loadCampaigns();
      toast("Oferta enviada para a fila da engine");
    } catch {
      toast("Erro ao enfileirar o disparo", "error");
    }
  }

  function toggleGroup(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  async function uploadFoto(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/media", { method: "POST", body: formData });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "Erro no upload");
      }
      const { id, type } = await response.json();
      setMediaId(id);
      setMediaKind(type === "video" ? "video" : "image");
      toast(type === "video" ? "Video anexado" : "Foto anexada");
    } catch (error) {
      toast((error as Error).message, "error");
    } finally {
      setUploading(false);
    }
  }

  const pollValid = pollOn && pollQuestion.trim() && pollOptions.filter((option) => option.trim()).length >= 2;

  async function save() {
    if (!name.trim() || (!message.trim() && !mediaId && !pollValid)) return;
    setSaving(true);
    try {
      const poll = pollValid
        ? { question: pollQuestion.trim(), options: pollOptions.map((option) => option.trim()).filter(Boolean) }
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
    toast("Campanha excluida");
  }

  const reach = groups.filter((group) => selected.includes(group.id)).reduce((sum, group) => sum + group.members, 0);

  return (
    <>
      <Topbar title="Ofertas" subtitle="Criacao, fila e envio para grupos" />
      <main className="flex-1 bg-slate-50/70 px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-5">
          <section className="grid gap-3 md:grid-cols-3">
            <StatCard label="Campanhas" value={stats.total} />
            <StatCard label="Em andamento" value={stats.active} />
            <StatCard label="Enviadas" value={stats.sent} />
          </section>

          <section className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_430px]">
            <div className="grid gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Campanhas salvas</h2>
                <Badge tone={hasActive ? "amber" : "slate"}>{hasActive ? "fila ativa" : "sem disparo ativo"}</Badge>
              </div>

              {!loaded &&
                Array.from({ length: 3 }).map((_, index) => (
                  <Card key={`sk-${index}`} className="p-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-4 w-40" />
                        <Skeleton className="h-3 w-56" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                    </div>
                  </Card>
                ))}

              {loaded && campaigns.length === 0 && (
                <Card className="border-dashed p-8 text-center text-sm text-slate-400">
                  Nenhuma campanha ainda. Crie a primeira no painel ao lado.
                </Card>
              )}

              {campaigns.map((campaign) => {
                const pct = campaign.total ? Math.round((campaign.sent / campaign.total) * 100) : 0;
                return (
                  <Card key={campaign.id} className="p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                          <Megaphone className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium text-slate-900">{campaign.name}</p>
                            {campaign.mediaId && <Badge tone="blue">midia</Badge>}
                            {campaign.mentionAll && <Badge tone="brand">@todos</Badge>}
                          </div>
                          <p className="mt-1 line-clamp-1 max-w-2xl text-sm text-slate-500">
                            {campaign.message || (campaign.mediaId ? "(somente midia)" : "")}
                          </p>
                          <p className="mt-1 text-xs text-slate-400">
                            {campaign.groupIds.length} grupos - {campaign.total} destinatarios
                          </p>
                        </div>
                      </div>
                      <Badge tone={statusTone[campaign.status]}>{statusLabel[campaign.status]}</Badge>
                    </div>

                    {(campaign.status === "running" || campaign.status === "queued" || campaign.status === "sent") && (
                      <div className="mt-4 flex items-center gap-3">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className={cn("h-full rounded-full", campaign.status === "queued" ? "bg-blue-400" : "bg-emerald-500")}
                            style={{ width: `${campaign.status === "queued" ? 100 : pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400">
                          {campaign.status === "queued" ? "na fila" : `${campaign.sent}/${campaign.total}`}
                        </span>
                      </div>
                    )}

                    {campaign.status === "failed" && campaign.error && (
                      <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{campaign.error}</p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {(campaign.status === "draft" || campaign.status === "failed" || campaign.status === "sent") && (
                        <Button size="sm" onClick={() => send(campaign)}>
                          <Send className="h-3.5 w-3.5" />
                          {campaign.status === "sent" ? "Enviar de novo" : "Enviar agora"}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setName(`${campaign.name} (copia)`);
                          setMessage(campaign.message);
                          setSelected(campaign.groupIds);
                        }}
                      >
                        <Copy className="h-3.5 w-3.5" />
                        Duplicar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50"
                        onClick={() => remove(campaign.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>

            <Card className="self-start">
              <CardHeader>
                <CardTitle>Nova oferta</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Nome">
                  <Input placeholder="Ex: Promocao de sexta" value={name} onChange={(event) => setName(event.target.value)} />
                </Field>

                <Field label="Template">
                  <div className="flex flex-wrap gap-1.5">
                    {templates.length === 0 && <p className="text-xs text-slate-400">Nenhum template carregado.</p>}
                    {templates.map((template) => (
                      <button
                        key={template.id}
                        onClick={() => setMessage(template.body)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:border-brand-300 hover:text-brand-700"
                      >
                        <FileText className="h-3 w-3" />
                        {template.name}
                      </button>
                    ))}
                  </div>
                </Field>

                <Field label={mediaId ? "Mensagem ou legenda" : "Mensagem"}>
                  <Textarea
                    rows={4}
                    placeholder="Digite a mensagem que sera enviada aos grupos..."
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                  />
                </Field>

                <Field label="Midia opcional">
                  {mediaId ? (
                    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-2">
                      {mediaKind === "video" ? (
                        <video src={`/api/media/${mediaId}`} className="h-16 w-16 rounded-lg object-cover" muted />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={`/api/media/${mediaId}`} alt="midia" className="h-16 w-16 rounded-lg object-cover" />
                      )}
                      <span className="flex-1 text-xs text-slate-500">{mediaKind === "video" ? "Video" : "Foto"} anexado.</span>
                      <button
                        onClick={() => setMediaId(null)}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Remover"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-sm font-medium text-slate-500 transition hover:border-brand-300 hover:text-brand-700">
                      <ImageIcon className="h-4 w-4" />
                      {uploading ? "Enviando..." : "Anexar imagem ou video"}
                      <input
                        type="file"
                        accept="image/*,video/*"
                        className="hidden"
                        disabled={uploading}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          if (file) uploadFoto(file);
                          event.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </Field>

                <Field label="Previa">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="max-w-[88%] overflow-hidden rounded-lg rounded-tl-none bg-white shadow-sm">
                      {mediaId &&
                        (mediaKind === "video" ? (
                          <video src={`/api/media/${mediaId}`} className="max-h-48 w-full object-cover" controls muted />
                        ) : (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={`/api/media/${mediaId}`} alt="previa" className="max-h-48 w-full object-cover" />
                        ))}
                      <div className="p-2.5">
                        <p className="whitespace-pre-wrap text-sm text-slate-800">
                          {message || (mediaId ? "" : "Sua mensagem aparece aqui...")}
                        </p>
                        <p className="mt-1 text-right text-[10px] text-slate-400">12:30</p>
                      </div>
                    </div>
                  </div>
                </Field>

                <Field label="Grupos de destino">
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                    {groups.length === 0 && (
                      <p className="px-2 py-3 text-xs text-slate-400">Nenhum grupo sincronizado.</p>
                    )}
                    {groups.map((group) => {
                      const on = selected.includes(group.id);
                      return (
                        <button
                          key={group.id}
                          onClick={() => toggleGroup(group.id)}
                          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-slate-50"
                        >
                          <span
                            className={cn(
                              "flex h-4 w-4 items-center justify-center rounded border-2",
                              on ? "border-brand-600 bg-brand-600 text-white" : "border-slate-300",
                            )}
                          >
                            {on && <Check className="h-3 w-3" />}
                          </span>
                          <span className="flex-1 truncate text-sm text-slate-700">{group.name}</span>
                          <span className="text-xs text-slate-400">{group.members}</span>
                        </button>
                      );
                    })}
                  </div>
                  {selected.length > 0 && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-500">
                      <UsersRound className="h-3.5 w-3.5" />
                      Alcance estimado: <span className="font-semibold text-brand-700">{reach.toLocaleString("pt-BR")}</span>
                    </p>
                  )}
                </Field>

                <ToggleRow
                  checked={pollOn}
                  onClick={() => setPollOn((value) => !value)}
                  title="Enviar como enquete"
                  description="Cria uma pergunta com opcoes para aumentar resposta no grupo."
                />
                {pollOn && (
                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <Input
                      placeholder="Pergunta"
                      value={pollQuestion}
                      onChange={(event) => setPollQuestion(event.target.value)}
                    />
                    {pollOptions.map((option, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Input
                          placeholder={`Opcao ${index + 1}`}
                          value={option}
                          onChange={(event) =>
                            setPollOptions((prev) => prev.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                          }
                        />
                        {pollOptions.length > 2 && (
                          <button
                            onClick={() => setPollOptions((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                            className="rounded-lg p-1.5 text-slate-400 hover:text-red-600"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 6 && (
                      <button onClick={() => setPollOptions((prev) => [...prev, ""])} className="text-xs font-medium text-brand-600">
                        + adicionar opcao
                      </button>
                    )}
                  </div>
                )}

                <ToggleRow
                  checked={mentionAll}
                  onClick={() => setMentionAll((value) => !value)}
                  title="Marcar todos no grupo"
                  description="Use com moderacao para campanhas importantes."
                />

                <Button
                  className="w-full"
                  onClick={save}
                  disabled={saving || !name.trim() || (!message.trim() && !mediaId && !pollValid)}
                >
                  <Send className="h-4 w-4" />
                  {saving ? "Salvando..." : "Salvar oferta"}
                </Button>
                <p className="text-center text-xs leading-5 text-slate-400">
                  Depois de salvar, envie pela fila da engine para respeitar o ritmo anti-ban.
                </p>
              </CardContent>
            </Card>
          </section>
        </div>
      </main>
    </>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({
  checked,
  onClick,
  title,
  description,
}: {
  checked: boolean;
  onClick: () => void;
  title: string;
  description: string;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50"
    >
      <span className={cn("relative h-5 w-9 shrink-0 rounded-full transition", checked ? "bg-brand-600" : "bg-slate-300")}>
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all", checked ? "left-4" : "left-0.5")} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-800">{title}</span>
        <span className="block text-xs text-slate-400">{description}</span>
      </span>
    </button>
  );
}
