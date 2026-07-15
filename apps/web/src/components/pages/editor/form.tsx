"use client";

import { LP_COLORS, type LpColor } from "@/lib/pages/schema";
import { cn } from "@/lib/utils";

/**
 * Campos do editor de LP (5-7 placeholders + destino + pixels opcionais).
 * Controlado pelo pai — reutilizado em /painel/pages/nova e no detalhe [id].
 */

export type EditorValues = {
  store_name: string;
  photo_url: string;
  headline: string;
  description: string;
  group_topic: string;
  primary_color: LpColor;
  target_group_url: string;
  campaign_slug: string;
  meta_pixel_id: string;
  ga4_id: string;
};

export const EMPTY_EDITOR_VALUES: EditorValues = {
  store_name: "",
  photo_url: "",
  headline: "",
  description: "",
  group_topic: "",
  primary_color: "emerald",
  target_group_url: "",
  campaign_slug: "",
  meta_pixel_id: "",
  ga4_id: "",
};

const COLOR_LABELS: Record<LpColor, { label: string; swatch: string }> = {
  iris: { label: "Cobalto", swatch: "bg-cobalt-500" },
  emerald: { label: "Ácido", swatch: "bg-acid-500" },
  amber: { label: "Volt", swatch: "bg-volt-950" },
};

export function EditorForm({
  values,
  onChange,
  disabled = false,
}: {
  values: EditorValues;
  onChange: (patch: Partial<EditorValues>) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <Field label="Nome da loja" hint="até 60 caracteres">
        <input
          type="text"
          maxLength={60}
          required
          value={values.store_name}
          onChange={(e) => onChange({ store_name: e.target.value })}
          placeholder="Ex.: Lume Store"
          className={inputClass}
        />
      </Field>

      <Field label="Foto (URL https)" hint="foto do produto ou da loja, formato paisagem">
        <input
          type="url"
          required
          value={values.photo_url}
          onChange={(e) => onChange({ photo_url: e.target.value })}
          placeholder="https://..."
          className={inputClass}
        />
      </Field>

      <Field label="Headline" hint="a promessa principal — até 90 caracteres">
        <input
          type="text"
          maxLength={90}
          required
          value={values.headline}
          onChange={(e) => onChange({ headline: e.target.value })}
          placeholder="Ex.: ⚡ 40% OFF só até meia-noite"
          className={inputClass}
        />
      </Field>

      <Field label="Descrição" hint="1-2 frases — até 240 caracteres">
        <textarea
          maxLength={240}
          rows={3}
          required
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Ex.: Oferta exclusiva pra quem entra no grupo hoje."
          className={inputClass}
        />
      </Field>

      <Field label="Tema do grupo" hint="entra no texto de consentimento (LGPD)">
        <input
          type="text"
          maxLength={60}
          required
          value={values.group_topic}
          onChange={(e) => onChange({ group_topic: e.target.value })}
          placeholder="Ex.: ofertas da loja"
          className={inputClass}
        />
      </Field>

      <Field label="Cor principal">
        <div className="flex gap-2" role="radiogroup" aria-label="Cor principal">
          {LP_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              role="radio"
              aria-checked={values.primary_color === color}
              onClick={() => onChange({ primary_color: color })}
              className={cn(
                "flex items-center gap-2 rounded-[var(--radius-control)] border px-3.5 py-2 text-sm transition-colors",
                values.primary_color === color
                  ? "border-cobalt-500 bg-cobalt-500/10 font-medium text-volt-950"
                  : "border-line-200 bg-paper-0 text-slate-600 hover:border-slate-600",
              )}
            >
              <span className={cn("h-4 w-4 rounded-[4px] border border-volt-950/10", COLOR_LABELS[color].swatch)} />
              {COLOR_LABELS[color].label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Link do grupo do WhatsApp" hint="chat.whatsapp.com/... — pra onde o lead vai">
        <input
          type="url"
          value={values.target_group_url}
          onChange={(e) => onChange({ target_group_url: e.target.value })}
          placeholder="https://chat.whatsapp.com/..."
          className={inputClass}
        />
      </Field>

      <details className="rounded-[var(--radius-card)] border border-line-200 bg-paper-0 px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium text-slate-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500">
          Avançado: campanha rastreada e pixels
        </summary>
        <div className="mt-4 space-y-4">
          <Field
            label="Slug da campanha (opcional)"
            hint="se preencher, o lead vai pro link rastreado /r/{slug} com rotação de grupos — ignora o link fixo acima"
          >
            <input
              type="text"
              value={values.campaign_slug}
              onChange={(e) => onChange({ campaign_slug: e.target.value })}
              placeholder="Ex.: ofertas-verao"
              className={inputClass}
            />
          </Field>
          <Field label="Meta Pixel ID (opcional)">
            <input
              type="text"
              inputMode="numeric"
              value={values.meta_pixel_id}
              onChange={(e) => onChange({ meta_pixel_id: e.target.value })}
              placeholder="Ex.: 123456789012345"
              className={inputClass}
            />
          </Field>
          <Field label="Google Analytics 4 ID (opcional)">
            <input
              type="text"
              value={values.ga4_id}
              onChange={(e) => onChange({ ga4_id: e.target.value })}
              placeholder="Ex.: G-XXXXXXXXXX"
              className={inputClass}
            />
          </Field>
        </div>
      </details>
    </fieldset>
  );
}

const inputClass =
  "min-h-10 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3.5 py-2.5 text-sm text-volt-950 placeholder:text-slate-600/65 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500 disabled:bg-canvas-100";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-volt-950">{label}</span>
      {hint ? <span className="ml-2 text-xs text-slate-600">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}
