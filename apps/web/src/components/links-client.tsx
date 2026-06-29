"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Copy, Check, ExternalLink, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function NewLinkButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [campaignName, setCampaignName] = useState("");
  const [targetGroupName, setTargetGroupName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, destinationUrl, campaignName, targetGroupName }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Erro ao criar o link.");
        return;
      }
      setOpen(false);
      setSlug("");
      setDestinationUrl("");
      setCampaignName("");
      setTargetGroupName("");
      router.refresh();
    } catch {
      setError("Falha de rede.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" />
        Novo link
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-xl border border-breu/10 bg-white p-5 shadow-lg">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-semibold text-breu">Novo link rastreado</h3>
          <button onClick={() => setOpen(false)} className="text-aco/50 hover:text-aco">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-3">
          <Field label="Link do grupo (convite do WhatsApp)">
            <Input
              placeholder="https://chat.whatsapp.com/..."
              value={destinationUrl}
              onChange={(e) => setDestinationUrl(e.target.value)}
            />
          </Field>
          <Field label="Apelido do link (slug)">
            <Input
              placeholder="grupo-inverno"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Campanha">
              <Input value={campaignName} onChange={(e) => setCampaignName(e.target.value)} />
            </Field>
            <Field label="Grupo destino">
              <Input value={targetGroupName} onChange={(e) => setTargetGroupName(e.target.value)} />
            </Field>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button className="flex-1" onClick={submit} disabled={saving}>
              {saving ? "Salvando..." : "Criar link"}
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LinkActions({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        onClick={copy}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-aco/70 hover:bg-bruma"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copiado" : "Copiar"}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-green-600 hover:bg-green-50"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Testar
      </a>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-aco">{label}</label>
      {children}
    </div>
  );
}
