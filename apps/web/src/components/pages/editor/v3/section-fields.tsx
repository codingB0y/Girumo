"use client";

import { Plus, Trash2 } from "lucide-react";
import type { ReactNode } from "react";
import type { LpMediaRef } from "@/lib/pages/content";
import { V3_LIMITS, V3_MAX, type LpSection, type SectionOf } from "@/lib/pages/sections";
import { Field, TextField } from "@/components/pages/editor/fields";
import { UploadField } from "@/components/pages/editor/upload-field";
import { CropFocal } from "@/components/pages/editor/crop-focal";

/**
 * Campos de cada tipo de seção (editor v3). Um componente por tipo, todos com a
 * mesma assinatura: recebem a seção, devolvem um patch do `data`. Os erros vêm
 * do servidor chaveados por `<tipo>.<campo>` — cada input pendura o seu.
 */

type Errors = Record<string, string>;
type Patch<T extends LpSection> = (data: Partial<T["data"]>) => void;

const L = V3_LIMITS;
const INPUT =
  "w-full rounded-xl border border-volt-950/15 px-3.5 py-2.5 text-sm text-volt-950 placeholder:text-aco/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cobalt-500";

function ItemBox({ children, onRemove, label, disabled }: { children: ReactNode; onRemove: () => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-volt-950/[0.08] p-4">
      <div className="flex-1 space-y-3">{children}</div>
      <button
        type="button"
        disabled={disabled}
        onClick={onRemove}
        aria-label={`Remover ${label}`}
        className="mt-6 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-aco/50 transition hover:bg-alerta/[0.08] hover:text-alerta"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-3 inline-flex items-center gap-1.5 rounded-xl border border-dashed border-volt-950/20 px-3.5 py-2 text-sm text-aco/70 transition hover:border-cobalt-500/50 hover:text-volt-950"
    >
      <Plus className="h-4 w-4" /> {label}
    </button>
  );
}

function TitleField({ value, onChange, error, disabled, hint }: { value: string; onChange: (v: string) => void; error?: string; disabled?: boolean; hint?: string }) {
  return <TextField label="Título da seção" hint={hint} value={value} onChange={onChange} max={L.section_title} error={error} disabled={disabled} />;
}

/* ------------------------------- hero -------------------------------- */

function HeroFields({ section, patch, errors, disabled }: { section: SectionOf<"hero">; patch: Patch<SectionOf<"hero">>; errors: Errors; disabled?: boolean }) {
  const d = section.data;
  return (
    <>
      <TextField label="Selo" hint="opcional — a pílula curta acima do título" value={d.badge ?? ""} onChange={(badge) => patch({ badge })} max={L.badge} error={errors["hero.badge"]} placeholder="Ex.: Aula ao vivo e gratuita" disabled={disabled} />
      <TextField label="Título" hint="a promessa" value={d.headline} onChange={(headline) => patch({ headline })} max={L.headline} error={errors["hero.headline"]} disabled={disabled} />
      <TextField label="Trecho em destaque" hint="um pedaço do título, na cor da marca" value={d.highlight ?? ""} onChange={(highlight) => patch({ highlight })} max={L.highlight} error={errors["hero.highlight"]} placeholder="Ex.: 40% off" disabled={disabled} />
      <TextField label="Frase de apoio" value={d.description} onChange={(description) => patch({ description })} max={L.description} error={errors["hero.description"]} multiline disabled={disabled} />
      <UploadField label="Foto" hint="opcional, mas é o que mais segura a pessoa — retrato ou peça" value={d.media} onChange={(media) => patch({ media })} aspect="aspect-[4/5]" disabled={disabled} />
      {errors["hero.media"] ? <p role="alert" className="-mt-3 text-xs text-alerta">{errors["hero.media"]}</p> : null}
      {d.media ? <CropFocal media={d.media} onChange={(media) => patch({ media })} disabled={disabled} /> : null}
    </>
  );
}

/* ------------------------------ urgency ------------------------------ */

function toLocalInput(iso?: string): string {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function UrgencyFields({ section, patch, errors, disabled }: { section: SectionOf<"urgency">; patch: Patch<SectionOf<"urgency">>; errors: Errors; disabled?: boolean }) {
  const d = section.data;
  const countdown = section.variant === "countdown";
  return (
    <>
      <TextField label={countdown ? "Texto antes da contagem" : "Texto"} value={d.label} onChange={(label) => patch({ label })} max={L.urgency_label} error={errors["urgency.label"]} placeholder={countdown ? "Ex.: A promoção fecha em" : "Ex.: Terça, 16 de setembro, às 20h"} disabled={disabled} />
      <Field label={countdown ? "Termina em" : "Data (opcional)"} hint={countdown ? "a contagem só existe com data real" : "usada só como referência"} error={errors["urgency.ends_at"]}>
        <input type="datetime-local" className={INPUT} disabled={disabled} value={toLocalInput(d.ends_at)} onChange={(e) => patch({ ends_at: e.target.value ? new Date(e.target.value).toISOString() : undefined })} />
      </Field>
      <TextField label="Observação" hint="opcional" value={d.note ?? ""} onChange={(note) => patch({ note })} max={L.urgency_label} error={errors["urgency.note"]} disabled={disabled} />
    </>
  );
}

/* ---------------------------- deliverables --------------------------- */

function DeliverablesFields({ section, patch, errors, disabled }: { section: SectionOf<"deliverables">; patch: Patch<SectionOf<"deliverables">>; errors: Errors; disabled?: boolean }) {
  const { title, items } = section.data;
  const numbers = section.variant === "numbers";
  const photos = section.variant === "photo_cards";
  const max = numbers ? V3_MAX.numbers : V3_MAX.deliverables;
  const set = (i: number, p: Partial<(typeof items)[number]>) => patch({ items: items.map((it, j) => (i === j ? { ...it, ...p } : it)) });
  return (
    <>
      <TitleField value={title} onChange={(t) => patch({ title: t })} error={errors["deliverables.title"]} disabled={disabled} />
      <div className="space-y-3">
        {items.map((it, i) => (
          <ItemBox key={i} label={`item ${i + 1}`} disabled={disabled} onRemove={() => patch({ items: items.filter((_, j) => j !== i) })}>
            <TextField label={numbers ? `Número ${i + 1}` : `Item ${i + 1}`} value={it.title} onChange={(v) => set(i, { title: v })} max={L.item_title} error={errors[`deliverables.items[${i}].title`]} placeholder={numbers ? "Ex.: 4.000" : "Ex.: Frete grátis acima de 12 peças"} disabled={disabled} />
            <TextField label={numbers ? "Legenda" : "Explicação"} hint="opcional" value={it.description ?? ""} onChange={(v) => set(i, { description: v })} max={L.item_desc} error={errors[`deliverables.items[${i}].description`]} disabled={disabled} />
            {photos ? <UploadField label="Foto" value={it.media ?? null} onChange={(media) => set(i, { media })} aspect="aspect-[4/5]" disabled={disabled} /> : null}
          </ItemBox>
        ))}
      </div>
      {items.length < max ? <AddButton label="Adicionar item" disabled={disabled} onClick={() => patch({ items: [...items, { title: "" }] })} /> : null}
    </>
  );
}

/* ------------------------------ audience ----------------------------- */

function StringList({ label, items, max, prefix, onChange, errors, disabled }: { label: string; items: string[]; max: number; prefix: string; onChange: (items: string[]) => void; errors: Errors; disabled?: boolean }) {
  return (
    <div>
      <p className="text-sm font-medium text-volt-950">{label} <span className="ml-1 text-xs font-normal text-aco/50">até {max}</span></p>
      <div className="mt-2 space-y-3">
        {items.map((t, i) => (
          <ItemBox key={i} label={`frase ${i + 1}`} disabled={disabled} onRemove={() => onChange(items.filter((_, j) => j !== i))}>
            <TextField label={`Frase ${i + 1}`} value={t} onChange={(v) => onChange(items.map((x, j) => (i === j ? v : x)))} max={L.item_desc} error={errors[`${prefix}[${i}]`]} disabled={disabled} />
          </ItemBox>
        ))}
      </div>
      {items.length < max ? <AddButton label="Adicionar frase" disabled={disabled} onClick={() => onChange([...items, ""])} /> : null}
    </div>
  );
}

function AudienceFields({ section, patch, errors, disabled }: { section: SectionOf<"audience">; patch: Patch<SectionOf<"audience">>; errors: Errors; disabled?: boolean }) {
  const { title, items, not_items } = section.data;
  return (
    <>
      <TitleField value={title} onChange={(t) => patch({ title: t })} error={errors["audience.title"]} disabled={disabled} />
      <StringList label={section.variant === "for_not_for" ? "É pra você se" : "Você que…"} items={items} max={V3_MAX.audience} prefix="audience.items" onChange={(v) => patch({ items: v })} errors={errors} disabled={disabled} />
      {section.variant === "for_not_for" ? <StringList label="Não é pra você se" items={not_items ?? []} max={V3_MAX.not_for} prefix="audience.not_items" onChange={(v) => patch({ not_items: v })} errors={errors} disabled={disabled} /> : null}
    </>
  );
}

/* ------------------------------- proof ------------------------------- */

function ProofFields({ section, patch, errors, disabled }: { section: SectionOf<"proof">; patch: Patch<SectionOf<"proof">>; errors: Errors; disabled?: boolean }) {
  const { title, prints, cards } = section.data;
  if (section.variant === "prints") {
    return (
      <>
        <TitleField value={title} onChange={(t) => patch({ title: t })} error={errors["proof.title"]} disabled={disabled} />
        <p className="rounded-xl bg-atencao/[0.08] px-3.5 py-2.5 text-xs leading-relaxed text-volt-950">
          Só prints reais de clientes. Print inventado é propaganda enganosa — e a página mostra o selo &ldquo;print enviado pela loja&rdquo; em cada um.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {prints.map((p, i) => (
            <UploadField key={i} label={`Print ${i + 1}`} value={p} onChange={(ref) => patch({ prints: ref ? prints.map((x, j) => (i === j ? ref : x)) : prints.filter((_, j) => j !== i) })} altHint="quem fala e o que diz" aspect="aspect-[9/16]" disabled={disabled} />
          ))}
          {prints.length < V3_MAX.prints ? <UploadField key={`new-${prints.length}`} label="Adicionar" value={null} onChange={(ref) => (ref ? patch({ prints: [...prints, ref] }) : undefined)} aspect="aspect-[9/16]" disabled={disabled} /> : null}
        </div>
        {errors["proof.prints"] ? <p role="alert" className="text-xs text-alerta">{errors["proof.prints"]}</p> : null}
      </>
    );
  }
  const set = (i: number, p: Partial<(typeof cards)[number]>) => patch({ cards: cards.map((c, j) => (i === j ? { ...c, ...p } : c)) });
  return (
    <>
      <TitleField value={title} onChange={(t) => patch({ title: t })} error={errors["proof.title"]} disabled={disabled} />
      <div className="space-y-3">
        {cards.map((c, i) => (
          <ItemBox key={i} label={`depoimento ${i + 1}`} disabled={disabled} onRemove={() => patch({ cards: cards.filter((_, j) => j !== i) })}>
            <TextField label="Depoimento" value={c.quote} onChange={(v) => set(i, { quote: v })} max={L.quote} error={errors[`proof.cards[${i}].quote`]} multiline disabled={disabled} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Nome" value={c.name} onChange={(v) => set(i, { name: v })} max={L.person} error={errors[`proof.cards[${i}].name`]} disabled={disabled} />
              <TextField label="Quem é" hint="opcional" value={c.detail ?? ""} onChange={(v) => set(i, { detail: v })} max={L.person} error={errors[`proof.cards[${i}].detail`]} placeholder="Ex.: Boutique MA · Goiânia" disabled={disabled} />
            </div>
          </ItemBox>
        ))}
      </div>
      {cards.length < V3_MAX.proof_cards ? <AddButton label="Adicionar depoimento" disabled={disabled} onClick={() => patch({ cards: [...cards, { name: "", quote: "" }] })} /> : null}
      {errors["proof.cards"] ? <p role="alert" className="text-xs text-alerta">{errors["proof.cards"]}</p> : null}
    </>
  );
}

/* ------------------------------- about ------------------------------- */

function AboutFields({ section, patch, errors, disabled }: { section: SectionOf<"about">; patch: Patch<SectionOf<"about">>; errors: Errors; disabled?: boolean }) {
  const d = section.data;
  return (
    <>
      <TitleField value={d.title} onChange={(t) => patch({ title: t })} error={errors["about.title"]} hint="o rótulo acima do nome" disabled={disabled} />
      <TextField label="Nome" value={d.name} onChange={(name) => patch({ name })} max={L.person} error={errors["about.name"]} disabled={disabled} />
      <TextField label="Quem é" hint="opcional — cargo, cidade, desde quando" value={d.role ?? ""} onChange={(role) => patch({ role })} max={L.person} error={errors["about.role"]} disabled={disabled} />
      <TextField label="História curta" value={d.text} onChange={(text) => patch({ text })} max={L.long_text} error={errors["about.text"]} multiline disabled={disabled} />
      <UploadField label="Foto" hint="opcional" value={d.media} onChange={(media) => patch({ media })} aspect="aspect-[4/5]" disabled={disabled} />
    </>
  );
}

/* ------------------------------ schedule ----------------------------- */

function ScheduleFields({ section, patch, errors, disabled }: { section: SectionOf<"schedule">; patch: Patch<SectionOf<"schedule">>; errors: Errors; disabled?: boolean }) {
  const { title, items } = section.data;
  const set = (i: number, p: Partial<(typeof items)[number]>) => patch({ items: items.map((it, j) => (i === j ? { ...it, ...p } : it)) });
  const labelName = section.variant === "days" ? "Dia" : section.variant === "steps" ? "Etiqueta" : "Regra";
  return (
    <>
      <TitleField value={title} onChange={(t) => patch({ title: t })} error={errors["schedule.title"]} disabled={disabled} />
      <div className="space-y-3">
        {items.map((it, i) => (
          <ItemBox key={i} label={`item ${i + 1}`} disabled={disabled} onRemove={() => patch({ items: items.filter((_, j) => j !== i) })}>
            <div className="grid gap-3 sm:grid-cols-[120px_1fr]">
              <TextField label={labelName} value={it.label} onChange={(v) => set(i, { label: v })} max={L.item_label} error={errors[`schedule.items[${i}].label`]} placeholder={section.variant === "days" ? "Dia 1" : "Horário"} disabled={disabled} />
              <TextField label="Título" value={it.title} onChange={(v) => set(i, { title: v })} max={L.item_title} error={errors[`schedule.items[${i}].title`]} disabled={disabled} />
            </div>
            <TextField label="Explicação" hint="opcional" value={it.description ?? ""} onChange={(v) => set(i, { description: v })} max={L.item_desc} error={errors[`schedule.items[${i}].description`]} disabled={disabled} />
          </ItemBox>
        ))}
      </div>
      {items.length < V3_MAX.schedule ? <AddButton label="Adicionar" disabled={disabled} onClick={() => patch({ items: [...items, { label: "", title: "" }] })} /> : null}
    </>
  );
}

/* --------------------------- blocos de texto -------------------------- */

function TextBlockFields({ section, patch, errors, disabled }: { section: SectionOf<"why_free"> | SectionOf<"after_signup">; patch: Patch<SectionOf<"why_free">>; errors: Errors; disabled?: boolean }) {
  const d = section.data;
  return (
    <>
      <TitleField value={d.title} onChange={(t) => patch({ title: t })} error={errors[`${section.type}.title`]} disabled={disabled} />
      <TextField label="Texto" value={d.text} onChange={(text) => patch({ text })} max={L.short_text} error={errors[`${section.type}.text`]} multiline disabled={disabled} />
    </>
  );
}

function CtaBandFields({ section, patch, errors, disabled }: { section: SectionOf<"cta_band">; patch: Patch<SectionOf<"cta_band">>; errors: Errors; disabled?: boolean }) {
  const d = section.data;
  return (
    <>
      <TitleField value={d.title} onChange={(t) => patch({ title: t })} error={errors["cta_band.title"]} hint="o botão repete o texto do botão da abertura" disabled={disabled} />
      <TextField label="Frase abaixo" hint="opcional" value={d.note ?? ""} onChange={(note) => patch({ note })} max={L.item_desc} error={errors["cta_band.note"]} disabled={disabled} />
    </>
  );
}

function FaqFields({ section, patch, errors, disabled }: { section: SectionOf<"faq">; patch: Patch<SectionOf<"faq">>; errors: Errors; disabled?: boolean }) {
  const { title, items } = section.data;
  const set = (i: number, p: Partial<(typeof items)[number]>) => patch({ items: items.map((it, j) => (i === j ? { ...it, ...p } : it)) });
  return (
    <>
      <TitleField value={title} onChange={(t) => patch({ title: t })} error={errors["faq.title"]} disabled={disabled} />
      <div className="space-y-3">
        {items.map((it, i) => (
          <ItemBox key={i} label={`pergunta ${i + 1}`} disabled={disabled} onRemove={() => patch({ items: items.filter((_, j) => j !== i) })}>
            <TextField label={`Pergunta ${i + 1}`} value={it.q} onChange={(v) => set(i, { q: v })} max={L.faq_q} error={errors[`faq.items[${i}].q`]} disabled={disabled} />
            <TextField label="Resposta" value={it.a} onChange={(v) => set(i, { a: v })} max={L.faq_a} error={errors[`faq.items[${i}].a`]} multiline disabled={disabled} />
          </ItemBox>
        ))}
      </div>
      {items.length < V3_MAX.faq ? <AddButton label="Adicionar pergunta" disabled={disabled} onClick={() => patch({ items: [...items, { q: "", a: "" }] })} /> : null}
    </>
  );
}

/* ------------------------------ despacho ----------------------------- */

export function SectionFields({
  section,
  onData,
  errors,
  disabled,
}: {
  section: LpSection;
  /** Patch parcial do `data` da seção (o editor faz o merge sem mutar). */
  onData: (data: Partial<LpSection["data"]>) => void;
  errors: Errors;
  disabled?: boolean;
}) {
  const p = onData as (d: Partial<LpSection["data"]>) => void;
  switch (section.type) {
    case "hero":
      return <HeroFields section={section} patch={p} errors={errors} disabled={disabled} />;
    case "urgency":
      return <UrgencyFields section={section} patch={p} errors={errors} disabled={disabled} />;
    case "deliverables":
      return <DeliverablesFields section={section} patch={p} errors={errors} disabled={disabled} />;
    case "audience":
      return <AudienceFields section={section} patch={p} errors={errors} disabled={disabled} />;
    case "proof":
      return <ProofFields section={section} patch={p} errors={errors} disabled={disabled} />;
    case "about":
      return <AboutFields section={section} patch={p} errors={errors} disabled={disabled} />;
    case "schedule":
      return <ScheduleFields section={section} patch={p} errors={errors} disabled={disabled} />;
    case "why_free":
    case "after_signup":
      return <TextBlockFields section={section} patch={p} errors={errors} disabled={disabled} />;
    case "cta_band":
      return <CtaBandFields section={section} patch={p} errors={errors} disabled={disabled} />;
    case "faq":
      return <FaqFields section={section} patch={p} errors={errors} disabled={disabled} />;
  }
}

export type { LpMediaRef };
