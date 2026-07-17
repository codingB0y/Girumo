"use client";

import { useId, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Primitivos do editor guiado v2. Existem separados do `form-v2` porque o form já
 * carrega os cinco grupos e os editores de lista; e separados do `Field` legado
 * (privado do `form.tsx`) porque aqui cada campo precisa de contador de caracteres
 * e de erro pendurado nele — o editor v2 mostra o que o servidor recusou no input
 * culpado, em vez de um alerta genérico no topo.
 */

const INPUT =
  "w-full rounded-xl border px-3.5 py-2.5 text-sm text-breu placeholder:text-aco/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-iris";

function inputClass(hasError: boolean): string {
  return cn(INPUT, hasError ? "border-alerta bg-alerta/[0.03]" : "border-breu/15");
}

/** Grupo recolhível. `defaultOpen` no primeiro passo pra não abrir tudo fechado. */
export function Group({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-breu/[0.08] bg-white [&[open]>summary]:border-b"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-breu/[0.06] px-5 py-4">
        <span>
          <span className="font-medium text-breu">{title}</span>
          {hint ? <span className="ml-2 text-xs text-aco/50">{hint}</span> : null}
        </span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-aco/40 transition group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-5 p-5">{children}</div>
    </details>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="text-sm font-medium text-breu">
        {label}
      </label>
      {hint ? <span className="ml-2 text-xs text-aco/50">{hint}</span> : null}
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-alerta">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Campo de texto com contador. O `maxLength` corta na digitação e o contador
 * avisa antes: os limites do §7.2 são de design (a headline quebra o layout se
 * passar), então a lojista tem que ver o teto enquanto escreve, não ao salvar.
 */
export function TextField({
  label,
  hint,
  value,
  onChange,
  max,
  error,
  placeholder,
  multiline = false,
  disabled = false,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  error?: string;
  placeholder?: string;
  multiline?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  const near = value.length > max * 0.9;

  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <div className="relative">
        {multiline ? (
          <textarea
            id={id}
            rows={3}
            maxLength={max}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass(Boolean(error))}
          />
        ) : (
          <input
            id={id}
            type="text"
            maxLength={max}
            value={value}
            disabled={disabled}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            className={inputClass(Boolean(error))}
          />
        )}
      </div>
      <p
        className={cn(
          "font-data mt-1 text-right text-[11px]",
          near ? "text-atencao" : "text-aco/40",
        )}
      >
        {value.length}/{max}
      </p>
    </Field>
  );
}

/** Cor da marca: seletor nativo + hex digitável (a lojista costuma ter o hex). */
export function ColorField({
  value,
  onChange,
  error,
  disabled = false,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const valid = /^#[0-9a-f]{6}$/i.test(value);

  return (
    <Field
      label="Cor da marca"
      hint="usada nos botões; o contraste é ajustado sozinho pra continuar legível"
      error={error}
      htmlFor={id}
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={valid ? value : "#6d2436"}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Escolher a cor da marca"
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-breu/15 bg-white p-1"
        />
        <input
          id={id}
          type="text"
          value={value}
          maxLength={7}
          disabled={disabled}
          placeholder="#6d2436"
          onChange={(e) => onChange(e.target.value)}
          className={cn(inputClass(Boolean(error)), "font-data")}
        />
      </div>
    </Field>
  );
}
