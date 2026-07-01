"use client";

import { useState } from "react";
import { Save, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";

type Setting = {
  key: string;
  value: string;
  label: string;
  description?: string;
  type?: "text" | "textarea" | "url";
};

const EDITABLE_SETTINGS: Omit<Setting, "value">[] = [
  {
    key: "platform_name",
    label: "Nome da Plataforma",
    description: "Exibido no painel e emails",
    type: "text",
  },
  {
    key: "support_email",
    label: "Email de Suporte",
    description: "Email público de contato",
    type: "text",
  },
  {
    key: "whatsapp_support_url",
    label: "WhatsApp Suporte",
    description: "Link do WhatsApp para suporte",
    type: "url",
  },
  {
    key: "onboarding_video_url",
    label: "Vídeo de Onboarding",
    description: "URL do vídeo exibido no onboarding",
    type: "url",
  },
  {
    key: "maintenance_message",
    label: "Mensagem de Manutenção",
    description: "Se preenchido, exibe banner de manutenção no painel",
    type: "textarea",
  },
  {
    key: "max_instances_per_tenant",
    label: "Máx. Instâncias por Tenant",
    description: "Limite padrão de instâncias WhatsApp",
    type: "text",
  },
];

type Props = {
  initialSettings: Record<string, string>;
};

export function SettingsEditor({ initialSettings }: Props) {
  const [values, setValues] = useState<Record<string, string>>(initialSettings);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ type: "success" | "error"; message: string } | null>(null);

  function handleChange(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setResult(null);
  }

  async function handleSave() {
    setSaving(true);
    setResult(null);

    const settings = EDITABLE_SETTINGS.map((s) => ({
      key: s.key,
      value: values[s.key] ?? "",
    }));

    try {
      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });

      const data = await res.json();

      if (!res.ok) {
        setResult({ type: "error", message: data.error ?? "Erro ao salvar" });
      } else {
        setResult({ type: "success", message: `${data.count} configurações salvas.` });
      }
    } catch {
      setResult({ type: "error", message: "Falha na requisição" });
    } finally {
      setSaving(false);
    }
  }

  const hasChanges = EDITABLE_SETTINGS.some(
    (s) => (values[s.key] ?? "") !== (initialSettings[s.key] ?? ""),
  );

  return (
    <div className="space-y-6">
      <div className="divide-y divide-breu/[0.04]">
        {EDITABLE_SETTINGS.map((setting) => (
          <div key={setting.key} className="px-6 py-4">
            <label className="block">
              <span className="text-sm font-medium text-breu">{setting.label}</span>
              {setting.description && (
                <span className="ml-2 font-data text-[11px] text-aco/50">{setting.description}</span>
              )}
              {setting.type === "textarea" ? (
                <textarea
                  value={values[setting.key] ?? ""}
                  onChange={(e) => handleChange(setting.key, e.target.value)}
                  rows={3}
                  className="mt-2 block w-full rounded-xl border border-breu/[0.08] bg-bruma/30 px-4 py-2.5 text-sm text-breu placeholder:text-aco/40 focus:border-iris/30 focus:outline-none focus:ring-2 focus:ring-iris/10"
                  placeholder={`Valor de ${setting.label.toLowerCase()}`}
                />
              ) : (
                <input
                  type={setting.type === "url" ? "url" : "text"}
                  value={values[setting.key] ?? ""}
                  onChange={(e) => handleChange(setting.key, e.target.value)}
                  className="mt-2 block w-full rounded-xl border border-breu/[0.08] bg-bruma/30 px-4 py-2.5 text-sm text-breu placeholder:text-aco/40 focus:border-iris/30 focus:outline-none focus:ring-2 focus:ring-iris/10"
                  placeholder={`Valor de ${setting.label.toLowerCase()}`}
                />
              )}
            </label>
          </div>
        ))}
      </div>

      {/* Save button + feedback */}
      <div className="flex items-center gap-4 px-6 pb-6">
        <button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="inline-flex items-center gap-2 rounded-xl bg-iris px-5 py-2.5 text-sm font-medium text-white transition hover:bg-iris-claro disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Salvar configurações
        </button>

        {result && (
          <div
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium ${
              result.type === "success"
                ? "bg-emerald-50 text-emerald-700"
                : "bg-red-50 text-red-700"
            }`}
          >
            {result.type === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <AlertTriangle className="h-4 w-4" />
            )}
            {result.message}
          </div>
        )}
      </div>
    </div>
  );
}
