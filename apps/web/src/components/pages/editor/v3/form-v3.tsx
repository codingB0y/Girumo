"use client";

import { ChevronDown } from "lucide-react";
import { SECTION_CATALOG, V3_LIMITS, type LpSection } from "@/lib/pages/sections";
import { patchSection, type EditorStateV3 } from "@/lib/pages/editor-v3";
import { ColorField, Field, Group, TextField } from "@/components/pages/editor/fields";
import { UploadField } from "@/components/pages/editor/upload-field";
import { SectionFields } from "@/components/pages/editor/v3/section-fields";
import { cn } from "@/lib/utils";

/**
 * Editor v3: identidade → seções (na ordem da página, cada uma com liga/desliga
 * e variante) → captação → rastreamento. A ordem das seções não é editável:
 * é a do template (spec 14/07). O que a lojista decide é O QUE entra e COMO
 * cada bloco aparece — nunca onde.
 */
export function EditorFormV3({
  state,
  onChange,
  errors = {},
  disabled = false,
}: {
  state: EditorStateV3;
  onChange: (next: EditorStateV3) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}) {
  const { content } = state;
  const setContent = (next: EditorStateV3["content"]) => onChange({ ...state, content: next });
  const setField = (patch: Partial<EditorStateV3>) => onChange({ ...state, ...patch });

  return (
    <div className="space-y-3">
      <Group title="Identidade" hint="quem é a loja" defaultOpen>
        <TextField label="Nome da loja" value={content.store_name} onChange={(store_name) => setContent({ ...content, store_name })} max={V3_LIMITS.store_name} error={errors.store_name} disabled={disabled} />
        <UploadField label="Logo" hint="opcional — substitui o nome escrito" kind="lp-logo" value={content.logo ?? null} onChange={(logo) => setContent({ ...content, logo })} altHint="normalmente o nome da loja" aspect="aspect-[3/1]" disabled={disabled} />
        <ColorField value={content.brand_color} onChange={(brand_color) => setContent({ ...content, brand_color })} error={errors.brand_color} disabled={disabled} />
        <TextField label="Texto do botão" hint="a mesma frase em toda a página" value={content.cta} onChange={(cta) => setContent({ ...content, cta })} max={V3_LIMITS.cta} error={errors.cta} placeholder="Ex.: Quero entrar no grupo" disabled={disabled} />
      </Group>

      <div>
        <p className="px-1 pb-2 text-sm font-medium text-volt-950">
          Seções <span className="ml-1 text-xs font-normal text-aco/50">ligue, desligue e escolha o formato; a ordem é a do modelo</span>
        </p>
        <div className="space-y-2">
          {content.sections.map((section) => (
            <SectionRow
              key={section.type}
              section={section}
              errors={errors}
              disabled={disabled}
              onToggle={(enabled) => setContent(patchSection(content, section.type, { enabled }))}
              onVariant={(variant) => setContent(patchSection(content, section.type, { variant: variant as never }))}
              onData={(data) => setContent(patchSection(content, section.type, { data: data as never }))}
            />
          ))}
        </div>
      </div>

      <Group title="Captação" hint="pra onde o lead vai">
        <Field label="Link do grupo" hint="chat.whatsapp.com/... — só aparece depois que a pessoa se cadastra" error={errors.target_group_url}>
          <input type="url" value={state.target_group_url} disabled={disabled} placeholder="https://chat.whatsapp.com/..." onChange={(e) => setField({ target_group_url: e.target.value })} className={INPUT} />
        </Field>
        <Field label="Campanha rastreada" hint="opcional — se preencher, manda pro /r/{slug} com rotação de grupos e ignora o link acima">
          <input type="text" value={state.campaign_slug} disabled={disabled} placeholder="Ex.: ofertas-verao" onChange={(e) => setField({ campaign_slug: e.target.value })} className={INPUT} />
        </Field>
      </Group>

      <Group title="Rastreamento" hint="opcional — pixels">
        <Field label="Meta Pixel ID">
          <input type="text" inputMode="numeric" value={state.meta_pixel_id} disabled={disabled} placeholder="Ex.: 123456789012345" onChange={(e) => setField({ meta_pixel_id: e.target.value })} className={`font-data ${INPUT}`} />
        </Field>
        <Field label="Google Analytics 4 ID">
          <input type="text" value={state.ga4_id} disabled={disabled} placeholder="Ex.: G-XXXXXXXXXX" onChange={(e) => setField({ ga4_id: e.target.value })} className={`font-data ${INPUT}`} />
        </Field>
      </Group>
    </div>
  );
}

const INPUT =
  "w-full rounded-xl border border-volt-950/15 px-3.5 py-2.5 text-sm text-volt-950 placeholder:text-aco/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500";

/**
 * Uma seção no painel: cabeçalho com o interruptor (só nas opcionais), o nome,
 * o "por quê" em uma linha e o seletor de formato; o corpo abre com os campos.
 * Seção desligada fica fechada e apagada — dá pra ligar de volta sem perder o
 * que estava escrito.
 */
function SectionRow({
  section,
  errors,
  disabled,
  onToggle,
  onVariant,
  onData,
}: {
  section: LpSection;
  errors: Record<string, string>;
  disabled: boolean;
  onToggle: (enabled: boolean) => void;
  onVariant: (variant: string) => void;
  onData: (data: Partial<LpSection["data"]>) => void;
}) {
  const meta = SECTION_CATALOG[section.type];
  const hasError = Object.keys(errors).some((k) => k.startsWith(`${section.type}.`));

  return (
    <details
      open={section.type === "hero"}
      className={cn(
        "group rounded-2xl border bg-white [&[open]>summary]:border-b",
        hasError ? "border-alerta/50" : "border-volt-950/[0.08]",
        !section.enabled && "opacity-70",
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 border-volt-950/[0.06] px-4 py-3.5">
        {meta.required ? (
          <span className="font-data rounded-md bg-canvas-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-aco/60">fixa</span>
        ) : (
          <label className="relative inline-flex h-6 w-10 shrink-0 cursor-pointer items-center" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              role="switch"
              aria-label={`${section.enabled ? "Desligar" : "Ligar"} a seção ${meta.label}`}
              checked={section.enabled}
              disabled={disabled}
              onChange={(e) => onToggle(e.target.checked)}
              className="peer sr-only"
            />
            <span className="absolute inset-0 rounded-full bg-volt-950/15 transition peer-checked:bg-cobalt-500 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-cobalt-500" />
            <span className="absolute left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
          </label>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-volt-950">{meta.label}</span>
          <span className="block truncate text-xs text-aco/50">{meta.why}</span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-aco/40 transition group-open:rotate-180" aria-hidden />
      </summary>

      <div className="space-y-5 p-4 sm:p-5">
        {meta.variants.length > 1 ? (
          <Field label="Formato">
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={`Formato de ${meta.label}`}>
              {meta.variants.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  role="radio"
                  aria-checked={section.variant === v.key}
                  disabled={disabled}
                  onClick={() => onVariant(v.key)}
                  className={cn(
                    "rounded-xl border px-3.5 py-2 text-sm transition",
                    section.variant === v.key ? "border-cobalt-500 font-medium text-volt-950" : "border-volt-950/15 text-aco/60 hover:border-cobalt-500/40",
                  )}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </Field>
        ) : null}
        <SectionFields section={section} onData={onData} errors={errors} disabled={disabled || !section.enabled} />
      </div>
    </details>
  );
}
