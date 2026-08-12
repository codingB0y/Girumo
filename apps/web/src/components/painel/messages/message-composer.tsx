"use client";

import { useCallback, useRef, useState } from "react";
import {
  Send,
  Image,
  Video,
  Mic,
  FileUp,
  AtSign,
  BarChart3,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { CopyPicker } from "./copy-picker";

export type ComposerPayload = {
  body: string;
  mediaId?: string;
  mediaType?: "image" | "video" | "audio" | "file";
  mediaName?: string;
  mentionAll: boolean;
  poll?: { question: string; options: string[] };
};

type Props = {
  onSend: (payload: ComposerPayload) => Promise<void>;
  sending?: boolean;
  className?: string;
};

export function MessageComposer({ onSend, sending, className }: Props) {
  const [body, setBody] = useState("");
  const [mentionAll, setMentionAll] = useState(false);
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<"image" | "video" | "audio" | "file" | null>(null);
  const [mediaName, setMediaName] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showPoll, setShowPoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["" , ""]);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSend = Boolean(body.trim() || mediaId || (showPoll && pollQuestion.trim() && pollOptions.filter(Boolean).length >= 2));

  const handleUpload = useCallback(async (file: File, type: "image" | "video" | "audio" | "file") => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/media", { method: "POST", body: form });
      if (!res.ok) throw new Error("Upload falhou");
      const data = await res.json();
      setMediaId(data.id);
      setMediaType(type);
      setMediaName(file.name);
    } catch {
      alert("Erro ao enviar arquivo. Tente novamente.");
    } finally {
      setUploading(false);
    }
  }, []);

  const pickFile = useCallback((accept: string, type: "image" | "video" | "audio" | "file") => {
    const input = fileRef.current;
    if (!input) return;
    input.accept = accept;
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) handleUpload(f, type);
      input.value = "";
    };
    input.click();
  }, [handleUpload]);

  const handleSend = async () => {
    if (!canSend || sending) return;
    const payload: ComposerPayload = {
      body: body.trim(),
      mentionAll,
      ...(mediaId && mediaType ? { mediaId, mediaType, mediaName: mediaName ?? undefined } : {}),
      ...(showPoll && pollQuestion.trim()
        ? { poll: { question: pollQuestion.trim(), options: pollOptions.filter(Boolean) } }
        : {}),
    };
    await onSend(payload);
    // Reset
    setBody("");
    setMentionAll(false);
    setMediaId(null);
    setMediaType(null);
    setMediaName(null);
    setShowPoll(false);
    setPollQuestion("");
    setPollOptions(["", ""]);
  };

  return (
    <div className={cn("rounded-2xl border border-volt-950/[0.08] bg-white p-4", className)}>
      <input ref={fileRef} type="file" className="hidden" aria-hidden="true" />

      {/* Media preview */}
      {mediaId && (
        <div className="mb-3 flex items-center gap-2 rounded-xl bg-canvas-100/50 px-3 py-2">
          <span className="text-xs text-aco">
            {mediaType === "image" && "📷"}
            {mediaType === "video" && "🎬"}
            {mediaType === "audio" && "🎵"}
            {mediaType === "file" && "📎"}
            {" "}{mediaName ?? "Arquivo"}
          </span>
          <button
            onClick={() => { setMediaId(null); setMediaType(null); setMediaName(null); }}
            className="ml-auto text-aco/50 hover:text-alerta"
            aria-label="Remover mídia"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Poll composer */}
      {showPoll && (
        <div className="mb-3 space-y-2 rounded-xl bg-canvas-100/50 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-volt-950">Enquete</span>
            <button onClick={() => setShowPoll(false)} className="text-aco/50 hover:text-alerta">
              <X className="h-4 w-4" />
            </button>
          </div>
          <input
            type="text"
            placeholder="Pergunta..."
            value={pollQuestion}
            onChange={(e) => setPollQuestion(e.target.value)}
            className="w-full rounded-lg border border-volt-950/10 bg-white px-3 py-2 text-sm text-volt-950 placeholder:text-aco/40 focus:border-cobalt-500 focus:outline-none"
          />
          {pollOptions.map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                placeholder={`Opção ${i + 1}`}
                value={opt}
                onChange={(e) => {
                  const next = [...pollOptions];
                  next[i] = e.target.value;
                  setPollOptions(next);
                }}
                className="flex-1 rounded-lg border border-volt-950/10 bg-white px-3 py-1.5 text-sm text-volt-950 placeholder:text-aco/40 focus:border-cobalt-500 focus:outline-none"
              />
              {pollOptions.length > 2 && (
                <button
                  onClick={() => setPollOptions(pollOptions.filter((_, j) => j !== i))}
                  className="text-aco/40 hover:text-alerta"
                  aria-label="Remover opção"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          {pollOptions.length < 12 && (
            <button
              onClick={() => setPollOptions([...pollOptions, ""])}
              className="text-xs text-cobalt-500 hover:underline"
            >
              + Adicionar opção
            </button>
          )}
        </div>
      )}

      {/* Biblioteca: entra ANTES do campo porque serve pra quem travou no
          "o que escrevo?" — depois do texto pronto ela não faz falta. */}
      <CopyPicker
        className="mb-2"
        onPick={(copy) => setBody((atual) => (atual.trim() ? `${atual.trimEnd()}\n\n${copy}` : copy))}
      />

      {/* Text area */}
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Digite sua mensagem..."
        rows={3}
        className="w-full resize-none rounded-xl border border-volt-950/10 bg-canvas-100/30 px-4 py-3 text-sm text-volt-950 placeholder:text-aco/40 focus:border-cobalt-500 focus:outline-none"
      />

      {/* Toolbar */}
      <div className="mt-3 flex flex-wrap items-center gap-1">
        <ToolBtn
          icon={Image}
          label="Imagem"
          onClick={() => pickFile("image/*", "image")}
          disabled={uploading}
        />
        <ToolBtn
          icon={Video}
          label="Vídeo"
          onClick={() => pickFile("video/*", "video")}
          disabled={uploading}
        />
        <ToolBtn
          icon={Mic}
          label="Áudio"
          onClick={() => pickFile("audio/*", "audio")}
          disabled={uploading}
        />
        <ToolBtn
          icon={FileUp}
          label="Arquivo"
          onClick={() => pickFile("*/*", "file")}
          disabled={uploading}
        />
        <ToolBtn
          icon={BarChart3}
          label="Enquete"
          onClick={() => setShowPoll(!showPoll)}
          active={showPoll}
        />
        <ToolBtn
          icon={AtSign}
          label="@Todos"
          onClick={() => setMentionAll(!mentionAll)}
          active={mentionAll}
        />

        {uploading && <Loader2 className="ml-2 h-4 w-4 animate-spin text-cobalt-500" />}

        <button
          onClick={handleSend}
          disabled={!canSend || sending}
          className={cn(
            "ml-auto inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white shadow-sm transition",
            canSend && !sending
              ? "bg-cobalt-500 hover:-translate-y-0.5 hover:bg-cobalt-500 shadow-brand"
              : "cursor-not-allowed bg-aco/20",
          )}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Enviar
        </button>
      </div>
    </div>
  );
}

function ToolBtn({
  icon: Icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg transition",
        active ? "bg-cobalt-500/10 text-cobalt-500" : "text-aco/50 hover:bg-canvas-100 hover:text-volt-950",
        disabled && "pointer-events-none opacity-40",
      )}
    >
      <Icon className="h-4.5 w-4.5" />
    </button>
  );
}
