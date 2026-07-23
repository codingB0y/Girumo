"use client";

import { Plus, Trash2 } from "lucide-react";
import {
  BENEFITS_MAX,
  CONTENT_LIMITS,
  GALLERY_MAX,
  GALLERY_MIN,
  type LpMediaRef,
} from "@/lib/pages/content";
import { parseVideoUrl } from "@/lib/pages/video";
import type { EditorValuesV2, ProofDraft } from "@/lib/pages/editor-values";
import { ColorField, Field, Group, TextField } from "@/components/pages/editor/fields";
import { UploadField } from "@/components/pages/editor/upload-field";
import { CropFocal } from "@/components/pages/editor/crop-focal";
import { cn } from "@/lib/utils";

/**
 * Editor guiado da LP v2. Cinco grupos recolhíveis na ordem em que a lojista
 * pensa (quem sou → o que ofereço → provas → pra onde vai o lead → medição), em
 * vez de um formulão. A estrutura da página não é escolha dela: o modelo é único
 * (§3), então o editor pergunta CONTEÚDO, nunca layout.
 *
 * Nenhum campo de URL de mídia (§7.3): imagem se envia, vídeo se cola a URL
 * pública do YouTube/Vimeo — e mesmo essa vira `{provider, id}` via `parseVideoUrl`
 * antes de chegar no content.
 *
 * `errors` vem do servidor (`details` do 400) chaveado por campo, então o que foi
 * recusado aparece no input culpado.
 */
export function EditorFormV2({
  values,
  onChange,
  errors = {},
  disabled = false,
}: {
  values: EditorValuesV2;
  onChange: (patch: Partial<EditorValuesV2>) => void;
  errors?: Record<string, string>;
  disabled?: boolean;
}) {
  const proof = values.proof;
  const setProof = (patch: Partial<ProofDraft>) => onChange({ proof: { ...proof, ...patch } });

  return (
    <div className="space-y-3">
      <Group title="Identidade" hint="quem é a loja" defaultOpen>
        <TextField
          label="Nome da loja"
          value={values.store_name}
          onChange={(store_name) => onChange({ store_name })}
          max={CONTENT_LIMITS.store_name}
          error={errors.store_name}
          placeholder="Ex.: Lume Atacado"
          disabled={disabled}
        />
        <UploadField
          label="Logo"
          hint="opcional — substitui o nome escrito"
          kind="lp-logo"
          value={values.logo}
          onChange={(logo) => onChange({ logo })}
          altHint="normalmente o nome da loja"
          aspect="aspect-[3/1]"
          disabled={disabled}
        />
        <TextField
          label="Selo"
          hint="opcional — a linha curta embaixo do nome"
          value={values.badge}
          onChange={(badge) => onChange({ badge })}
          max={CONTENT_LIMITS.badge}
          error={errors.badge}
          placeholder="Ex.: Atacado de moda · Bom Retiro"
          disabled={disabled}
        />
        <ColorField
          value={values.brand_color}
          onChange={(brand_color) => onChange({ brand_color })}
          error={errors.brand_color}
          disabled={disabled}
        />
      </Group>

      <Group title="Chamada" hint="a oferta e as vantagens">
        <TextField
          label="Headline"
          hint="a promessa principal"
          value={values.headline}
          onChange={(headline) => onChange({ headline })}
          max={CONTENT_LIMITS.headline}
          error={errors.headline}
          placeholder="Ex.: Peças novas toda semana, direto no seu grupo"
          disabled={disabled}
        />
        <TextField
          label="Descrição"
          hint="1–2 frases explicando o grupo"
          value={values.description}
          onChange={(description) => onChange({ description })}
          max={CONTENT_LIMITS.description}
          error={errors.description}
          placeholder="Ex.: Entre no grupo e receba os drops com preço de atacado."
          multiline
          disabled={disabled}
        />
        <TextField
          label="Texto do botão"
          value={values.cta}
          onChange={(cta) => onChange({ cta })}
          max={CONTENT_LIMITS.cta}
          error={errors.cta}
          placeholder="Ex.: Quero entrar no grupo"
          disabled={disabled}
        />
        <BenefitsEditor
          benefits={values.benefits}
          onChange={(benefits) => onChange({ benefits })}
          errors={errors}
          disabled={disabled}
        />
      </Group>

      <Group title="Mídia" hint="foto principal e galeria">
        <UploadField
          label="Foto principal"
          hint="a primeira coisa que a pessoa vê — paisagem"
          value={values.hero}
          onChange={(hero) => onChange({ hero })}
          disabled={disabled}
        />
        {errors.hero ? (
          <p role="alert" className="-mt-3 text-xs text-alerta">
            {errors.hero}
          </p>
        ) : null}
        {values.hero ? (
          <CropFocal
            media={values.hero}
            onChange={(hero) => onChange({ hero })}
            disabled={disabled}
          />
        ) : null}

        <GalleryEditor
          gallery={values.gallery}
          onChange={(gallery) => onChange({ gallery })}
          error={errors.gallery}
          disabled={disabled}
        />
      </Group>

      <Group title="Prova" hint="opcional — um depoimento de cliente">
        <label className="flex items-center gap-2.5 text-sm text-volt-950">
          <input
            type="checkbox"
            checked={proof.enabled}
            disabled={disabled}
            onChange={(e) => setProof({ enabled: e.target.checked })}
            className="h-4 w-4 rounded border-volt-950/25 text-cobalt-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500"
          />
          Mostrar um depoimento na página
        </label>

        {proof.enabled ? (
          <div className="space-y-5 border-l-2 border-volt-950/[0.08] pl-4">
            <Field label="Formato">
              <div className="flex gap-2" role="radiogroup" aria-label="Formato do depoimento">
                {(["video", "photo"] as const).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    role="radio"
                    aria-checked={proof.kind === kind}
                    disabled={disabled}
                    onClick={() => setProof({ kind })}
                    className={cn(
                      "rounded-xl border px-3.5 py-2 text-sm transition",
                      proof.kind === kind
                        ? "border-cobalt-500 font-medium text-volt-950"
                        : "border-volt-950/15 text-aco/60 hover:border-cobalt-500/40",
                    )}
                  >
                    {kind === "video" ? "Vídeo" : "Foto"}
                  </button>
                ))}
              </div>
            </Field>

            {proof.kind === "video" ? (
              <>
                <VideoUrlField
                  value={proof.video_url}
                  onChange={(video_url) => setProof({ video_url })}
                  error={errors["proof.video"]}
                  disabled={disabled}
                />
                <UploadField
                  label="Capa do vídeo"
                  hint="opcional — aparece antes de a pessoa dar play"
                  value={proof.poster}
                  onChange={(poster) => setProof({ poster })}
                  altHint="o que aparece na capa"
                  aspect="aspect-[4/5]"
                  disabled={disabled}
                />
              </>
            ) : (
              <UploadField
                label="Foto da cliente"
                value={proof.photo}
                onChange={(photo) => setProof({ photo })}
                altHint="quem aparece na foto"
                aspect="aspect-[4/5]"
                disabled={disabled}
              />
            )}

            <TextField
              label="Depoimento"
              value={proof.quote}
              onChange={(quote) => setProof({ quote })}
              max={CONTENT_LIMITS.quote}
              error={errors["proof.quote"]}
              placeholder="Ex.: Vendi tudo em uma semana usando o grupo."
              multiline
              disabled={disabled}
            />
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField
                label="Nome"
                value={proof.name}
                onChange={(name) => setProof({ name })}
                max={CONTENT_LIMITS.person}
                error={errors["proof.name"]}
                placeholder="Ana"
                disabled={disabled}
              />
              <TextField
                label="Loja"
                value={proof.store}
                onChange={(store) => setProof({ store })}
                max={CONTENT_LIMITS.person}
                error={errors["proof.store"]}
                placeholder="Bazar da Ana"
                disabled={disabled}
              />
              <TextField
                label="Cidade"
                value={proof.city}
                onChange={(city) => setProof({ city })}
                max={CONTENT_LIMITS.person}
                error={errors["proof.city"]}
                placeholder="Goiânia"
                disabled={disabled}
              />
            </div>
          </div>
        ) : null}
      </Group>

      <Group title="Captação" hint="pra onde o lead vai">
        <Field
          label="Link do grupo"
          hint="chat.whatsapp.com/... — só aparece depois que a pessoa se cadastra"
          error={errors.target_group_url}
        >
          <input
            type="url"
            value={values.target_group_url}
            disabled={disabled}
            placeholder="https://chat.whatsapp.com/..."
            onChange={(e) => onChange({ target_group_url: e.target.value })}
            className="w-full rounded-xl border border-volt-950/15 px-3.5 py-2.5 text-sm text-volt-950 placeholder:text-aco/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500"
          />
        </Field>
        <Field
          label="Campanha rastreada"
          hint="opcional — se preencher, manda pro /r/{slug} com rotação de grupos e ignora o link acima"
        >
          <input
            type="text"
            value={values.campaign_slug}
            disabled={disabled}
            placeholder="Ex.: ofertas-verao"
            onChange={(e) => onChange({ campaign_slug: e.target.value })}
            className="w-full rounded-xl border border-volt-950/15 px-3.5 py-2.5 text-sm text-volt-950 placeholder:text-aco/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500"
          />
        </Field>
      </Group>

      <Group title="Rastreamento" hint="opcional — pixels">
        <Field label="Meta Pixel ID">
          <input
            type="text"
            inputMode="numeric"
            value={values.meta_pixel_id}
            disabled={disabled}
            placeholder="Ex.: 123456789012345"
            onChange={(e) => onChange({ meta_pixel_id: e.target.value })}
            className="font-data w-full rounded-xl border border-volt-950/15 px-3.5 py-2.5 text-sm text-volt-950 placeholder:text-aco/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500"
          />
        </Field>
        <Field label="Google Analytics 4 ID">
          <input
            type="text"
            value={values.ga4_id}
            disabled={disabled}
            placeholder="Ex.: G-XXXXXXXXXX"
            onChange={(e) => onChange({ ga4_id: e.target.value })}
            className="font-data w-full rounded-xl border border-volt-950/15 px-3.5 py-2.5 text-sm text-volt-950 placeholder:text-aco/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500"
          />
        </Field>
      </Group>
    </div>
  );
}

/** Vídeo: valida a URL na hora — colar link errado é o erro mais comum aqui. */
function VideoUrlField({
  value,
  onChange,
  error,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const parsed = value.trim() ? parseVideoUrl(value) : null;
  const invalid = Boolean(value.trim()) && !parsed;

  return (
    <Field
      label="Link do vídeo"
      hint="YouTube ou Vimeo — o vídeo só carrega quando a pessoa dá play"
      error={error ?? (invalid ? "Cole um link do YouTube ou do Vimeo." : undefined)}
    >
      <input
        type="url"
        value={value}
        disabled={disabled}
        placeholder="https://www.youtube.com/watch?v=..."
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-xl border px-3.5 py-2.5 text-sm text-volt-950 placeholder:text-aco/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500",
          invalid || error ? "border-alerta bg-alerta/[0.03]" : "border-volt-950/15",
        )}
      />
      {parsed ? (
        <p className="mt-1 text-xs text-sucesso">
          {parsed.provider === "youtube" ? "YouTube" : "Vimeo"} reconhecido.
        </p>
      ) : null}
    </Field>
  );
}

function BenefitsEditor({
  benefits,
  onChange,
  errors,
  disabled,
}: {
  benefits: EditorValuesV2["benefits"];
  onChange: (b: EditorValuesV2["benefits"]) => void;
  errors: Record<string, string>;
  disabled?: boolean;
}) {
  const patch = (i: number, key: "title" | "description", v: string) =>
    onChange(benefits.map((b, j) => (i === j ? { ...b, [key]: v } : b)));

  return (
    <div>
      <p className="text-sm font-medium text-volt-950">
        Vantagens <span className="ml-1 font-normal text-xs text-aco/50">até {BENEFITS_MAX}</span>
      </p>

      <div className="mt-2 space-y-3">
        {benefits.map((b, i) => (
          <div key={i} className="rounded-xl border border-volt-950/[0.08] p-4">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-3">
                <TextField
                  label={`Vantagem ${i + 1}`}
                  value={b.title}
                  onChange={(v) => patch(i, "title", v)}
                  max={CONTENT_LIMITS.benefit_title}
                  error={errors[`benefits[${i}].title`]}
                  placeholder="Ex.: Preço de atacado"
                  disabled={disabled}
                />
                <TextField
                  label="Explicação"
                  value={b.description}
                  onChange={(v) => patch(i, "description", v)}
                  max={CONTENT_LIMITS.benefit_desc}
                  error={errors[`benefits[${i}].description`]}
                  placeholder="Ex.: Direto da fábrica, sem atravessador."
                  disabled={disabled}
                />
              </div>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(benefits.filter((_, j) => j !== i))}
                aria-label={`Remover vantagem ${i + 1}`}
                className="mt-6 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-aco/50 transition hover:bg-alerta/[0.08] hover:text-alerta"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {benefits.length < BENEFITS_MAX ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange([...benefits, { title: "", description: "" }])}
          className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-volt-950/20 px-3.5 py-2 text-sm text-aco/70 transition hover:border-cobalt-500/50 hover:text-volt-950"
        >
          <Plus className="h-4 w-4" /> Adicionar vantagem
        </button>
      ) : null}
    </div>
  );
}

function GalleryEditor({
  gallery,
  onChange,
  error,
  disabled,
}: {
  gallery: LpMediaRef[];
  onChange: (g: LpMediaRef[]) => void;
  error?: string;
  disabled?: boolean;
}) {
  const missing = Math.max(0, GALLERY_MIN - gallery.length);

  return (
    <div>
      <p className="text-sm font-medium text-volt-950">
        Galeria
        <span className="ml-1 text-xs font-normal text-aco/50">
          {GALLERY_MIN} a {GALLERY_MAX} fotos das peças
        </span>
      </p>

      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {gallery.map((g, i) => (
          <UploadField
            key={i}
            label={`Foto ${i + 1}`}
            value={g}
            onChange={(ref) =>
              onChange(ref ? gallery.map((x, j) => (i === j ? ref : x)) : gallery.filter((_, j) => j !== i))
            }
            aspect="aspect-[3/4]"
            disabled={disabled}
          />
        ))}
        {gallery.length < GALLERY_MAX ? (
          <UploadField
            key={`new-${gallery.length}`}
            label="Adicionar"
            value={null}
            onChange={(ref) => (ref ? onChange([...gallery, ref]) : undefined)}
            aspect="aspect-[3/4]"
            disabled={disabled}
          />
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="mt-2 text-xs text-alerta">
          {error}
        </p>
      ) : missing > 0 ? (
        <p className="mt-2 text-xs text-aco/50">
          Faltam {missing} foto{missing > 1 ? "s" : ""} pra publicar.
        </p>
      ) : null}
    </div>
  );
}
