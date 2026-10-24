// apps/web/src/lib/bio/editor-perfil.ts
import type { MidiaRef } from "@/lib/bio/documento";
import { resolveUploadLimitBytes } from "@/lib/media-mime";
import type { LpMediaRef } from "@/lib/pages/content";

/**
 * Regras puras da aba Perfil e das fotos do editor do link da bio (spec 2026-10-19 §4, §8).
 * Roda no navegador e nos testes: nada de fetch, React ou Supabase aqui.
 */

/** Tipos de foto aceitos: o `accept` do seletor e a conferência antes de enviar. */
export const FOTO_ACEITA = ["image/png", "image/jpeg", "image/webp"] as const;

/** `kind` do upload (§4): `lp-media` para foto, `lp-logo` para logo — os dois saem em /api/p/media. */
export type TipoDeFoto = "lp-media" | "lp-logo";

/** "`fotos` até 3 mídias" no link (§4). */
export const MAX_FOTOS_DO_LINK = 3;

/** Por que o arquivo não serve, antes de gastar o envio; null se serve. Quem decide de verdade é o servidor. */
export function problemaDaImagem(arquivo: { type: string; size: number }, tipo: TipoDeFoto): string | null {
  if (!(FOTO_ACEITA as readonly string[]).includes(arquivo.type)) return "Envie a foto em PNG, JPEG ou WebP.";
  const limite = resolveUploadLimitBytes(tipo, arquivo.type);
  return arquivo.size > limite ? `Foto grande demais: o limite é ${Math.round(limite / 1_000_000)} MB.` : null;
}

/**
 * O CNPJ que vai pro documento (§4): sem pontuação, em maiúsculas, no máximo 14. Letra fica:
 * desde julho de 2026 a Receita emite CNPJ com 12 caracteres `[0-9A-Z]` + 2 dígitos.
 */
export function cnpjDoCampo(valor: string): string {
  return valor.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 14);
}

/** A máscara da tela enquanto digita ("11.222.333/0001-81"): cada separador só aparece quando chega o caractere seguinte. */
export function mascaraDoCnpj(cnpj: string): string {
  return cnpjDoCampo(cnpj)
    .replace(/^([0-9A-Z]{2})([0-9A-Z])/, "$1.$2")
    .replace(/^([0-9A-Z]{2})\.([0-9A-Z]{3})([0-9A-Z])/, "$1.$2.$3")
    .replace(/\.([0-9A-Z]{3})([0-9A-Z])/, ".$1/$2")
    .replace(/([0-9A-Z]{4})([0-9A-Z])/, "$1-$2");
}

/**
 * O @ como a página guarda (§4: minúsculo, sem @). Tira o @ e o link do perfil colado
 * ("https://www.instagram.com/loja.exemplo/?hl=pt") e corta em 30 DEPOIS da limpeza — por
 * isso o campo aceita colar mais que 30. Caractere que não vale (espaço, hífen) fica: o
 * painel avisa (`erroNoCampo`) e o salvar recusa.
 */
export function instagramDoCampo(valor: string): string {
  return valor
    .trim()
    .toLowerCase()
    .replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/^@+/, "")
    .slice(0, 30);
}

/** Os campos fixos da tela (3 destaques, 2 linhas do "confere") a partir da lista do documento. */
export function camposDaLista(lista: readonly string[], total: number): string[] {
  return Array.from({ length: total }, (_, i) => lista[i] ?? "");
}

/** A lista que vai pro documento: só os campos com texto, na ordem (cada item precisa de pelo menos 1 letra, §4). */
export function listaDosCampos(campos: readonly string[]): string[] {
  return campos.filter((campo) => campo.trim() !== "");
}

/** A capa no formato que o `CropFocal` (editor de páginas) lê. */
export function refDoCrop(m: MidiaRef): LpMediaRef {
  return m.foco ? { media_id: m.id, alt: "", focal_x: m.foco.x, focal_y: m.foco.y } : { media_id: m.id, alt: "" };
}

/** O foco que o `CropFocal` devolve, em 0..1 com duas casas (a página usa porcentagem inteira). */
export function focoDoCrop(r: LpMediaRef): { x: number; y: number } {
  const duasCasas = (n: number | undefined) => Math.round(Math.min(1, Math.max(0, n ?? 0.5)) * 100) / 100;
  return { x: duasCasas(r.focal_x), y: duasCasas(r.focal_y) };
}
