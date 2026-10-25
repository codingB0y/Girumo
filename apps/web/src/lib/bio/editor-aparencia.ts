// apps/web/src/lib/bio/editor-aparencia.ts
import { coresDoModelo } from "@/lib/bio/cores";
import { PALETAS, type DocumentoBio, type Modelo } from "@/lib/bio/documento";

/** Regras puras da aba Aparência (spec 2026-10-19 §3, §8). Roda no navegador e nos testes. */

/** Nome de cada paleta pronta na tela; o id é o do §9 (o `azul` era "Azul da loja" no mockup). */
export const NOME_DA_PALETA: Readonly<Record<(typeof PALETAS)[Modelo][number], string>> = {
  azul: "Azul",
  rosa: "Rosa chiclete",
  menta: "Verde-água",
  grafite: "Grafite e dourado",
  papel: "Papel",
  noite: "Noite",
  rose: "Rosé",
  kraft: "Kraft",
  caneta: "Azul caneta",
  nota: "Verde nota",
  claro: "Claro",
  escuro: "Preto e amarelo",
  lavanda: "Lavanda",
};

/** Uma linha sobre cada modelo, embaixo da miniatura (textos do mockup). */
export const DESCRICAO_DO_MODELO: Readonly<Record<Modelo, string>> = {
  etiqueta: "Botões como etiquetas penduradas num fio. Balançam ao entrar e no toque.",
  vitrine: "Foto cheia da loja em cima; a lista sobe por cima dela.",
  romaneio: "A nota do fardo: itens numerados e o botão principal carimbado.",
  classico: "O formato que todo mundo conhece: foto redonda e botões.",
};

export type CoresDaMarca = NonNullable<DocumentoBio["cores"]>;

/** As duas bolinhas da paleta: o fundo da página e o botão em destaque, como a página pinta. */
export function amostraDaPaleta(modelo: Modelo, paleta: string): readonly [fundo: string, botao: string] {
  const t = coresDoModelo(modelo, paleta, null);
  // O Romaneio não tem `--prin`: o botão carimbado é o `--acento`.
  return [t["--fundo2"], t["--prin"] ?? t["--acento"]];
}

/** A paleta ao trocar de modelo: a mesma, se o novo modelo tem (todos têm `azul`); "marca" fica; senão a primeira. */
export function paletaAoTrocar(paleta: string, modelo: Modelo): string {
  const doModelo: readonly string[] = PALETAS[modelo];
  return paleta === "marca" || doModelo.includes(paleta) ? paleta : doModelo[0];
}

/** O documento noutro modelo. A miniatura e o toque usam a mesma função: a miniatura é o que o toque dá. */
export function comModelo(d: DocumentoBio, modelo: Modelo): DocumentoBio {
  return { ...d, modelo, paleta: paletaAoTrocar(d.paleta, modelo) };
}

/** As cores dos dois seletores: as da marca, se já tem; senão as da paleta que está na tela. */
export function coresDaMarca(d: DocumentoBio): CoresDaMarca {
  if (d.cores) return d.cores;
  const [fundo, botao] = amostraDaPaleta(d.modelo, d.paleta);
  return { fundo, botao };
}

/** `#RRGGBB` maiúsculo (§9) a partir do seletor ou do que foi digitado, com ou sem `#`; null se não for cor. */
export function corDoSeletor(valor: string): string | null {
  const hex = valor.trim().replace(/^#/, "");
  return /^[0-9A-Fa-f]{6}$/.test(hex) ? `#${hex.toUpperCase()}` : null;
}
