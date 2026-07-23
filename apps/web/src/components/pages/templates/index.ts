import type { ComponentType } from "react";
import type { LpColor, LpContent } from "@/lib/pages/schema";
import { BasicTemplate } from "@/components/pages/templates/basic";
import { ConversionEditorial } from "@/components/pages/templates/structures/conversion-editorial";
import type { StructureProps } from "@/components/pages/templates/contract";

export type { StructureProps };

/** Props que TODO template de LP recebe (contrato do render /p/[slug]). */
export type TemplateProps = {
  /** Slug público da LP — o form/beacons postam com ele. */
  slug: string;
  content: LpContent;
  /** Copy fixa do template (badge, cta, notas) — vem de default_copy. */
  copy: Record<string, string>;
  /** Texto de consent LGPD (exibido no form de captura). */
  consentText: string;
  /** true no editor do painel: desabilita form e min-h. */
  preview?: boolean;
};

/**
 * Tokens de cor → classes literais (Tailwind não compila classe dinâmica).
 * Únicas 3 opções — validadas no server (schema.ts).
 */
export const COLOR_STYLES: Record<
  LpColor,
  { button: string; text: string; ring: string; soft: string }
> = {
  cobalt: {
    button: "bg-cobalt-500 text-paper-0",
    text: "text-cobalt-700",
    ring: "focus-visible:outline-cobalt-500",
    soft: "bg-cobalt-500/10",
  },
  emerald: {
    button: "bg-acid-500 text-volt-950",
    text: "text-volt-950",
    ring: "focus-visible:outline-cobalt-500",
    soft: "bg-acid-500/20",
  },
  amber: {
    button: "bg-volt-950 text-paper-0",
    text: "text-volt-950",
    ring: "focus-visible:outline-cobalt-500",
    soft: "bg-volt-950/10",
  },
};

/**
 * component_key (banco) → componente React.
 * Sessão 2 troca os três pelo layout final; "basic" é o fallback permanente.
 */
export const TEMPLATE_REGISTRY: Record<string, ComponentType<TemplateProps>> = {
  basic: BasicTemplate,
  "promo-relampago": BasicTemplate,
  "sorteio-premio": BasicTemplate,
  "catalogo-grupo": BasicTemplate,
};

export function resolveTemplate(componentKey: string): ComponentType<TemplateProps> {
  return TEMPLATE_REGISTRY[componentKey] ?? BasicTemplate;
}

/**
 * Registry das ESTRUTURAS v2 (conteúdo `schema_version: 2`). Extensível para
 * 3 estruturas × 2 direções; a v1 entrega só a "conversion" editorial ("Acesso
 * VIP"). Qualquer chave desconhecida cai nela. A seleção editorial × basic é por
 * `schema_version` (ver lib/pages/render.ts), não por `component_key`.
 */
export const STRUCTURE_REGISTRY: Record<string, ComponentType<StructureProps>> = {
  conversion: ConversionEditorial,
};

export function resolveStructure(key?: string): ComponentType<StructureProps> {
  return (key && STRUCTURE_REGISTRY[key]) || ConversionEditorial;
}
