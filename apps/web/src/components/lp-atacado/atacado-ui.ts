/**
 * Classes que se repetem nas seções do /44eBras (mockup Modelo 2). O mockup
 * resolvia com classes CSS (.m2-h, .stk, .icq, .pill); aqui são utilitários
 * Tailwind, sem arquivo CSS novo.
 */

/**
 * Título em League Spartan 900 (.m2-h); a fonte é carregada em atacado-landing.tsx.
 * Junte com o tamanho por template string, NUNCA por cn(): o tailwind-merge
 * descarta o `leading-none` quando um `text-[42px]` vem depois dele.
 */
export const TITULO = "font-[family-name:var(--font-spartan)] font-black leading-none tracking-[-.02em]";

/** Grifo acid embaixo da 2ª frase dos títulos. */
export const GRIFO = "shadow-[inset_0_-0.34em_0_#A7FF2F]";

/** Etiqueta em pílula, caixa-alta (.stk). Cor, tamanho e giro ficam com quem usa. */
export const ETIQUETA =
  "inline-flex items-center gap-2 whitespace-nowrap rounded-full border-2 border-volt-950 font-black uppercase tracking-[.02em]";

/** Quadrado acid com ícone (.icq). O tamanho fica com quem usa. */
export const ICONE = "grid shrink-0 place-items-center rounded-xl bg-acid-500 text-volt-950";

/** Botão pílula (.pill). A cor fica com quem usa. */
export const PILULA =
  "inline-flex min-h-[58px] items-center justify-center gap-2.5 whitespace-nowrap rounded-full border-2 border-volt-950 px-7 text-lg font-extrabold transition-colors";

/** Laterais: 18 px no celular, 88 px a partir de 1280 (o mockup de 1440 tem conteúdo de 1264). */
export const LATERAIS = "px-[18px] lg:px-12 xl:px-[88px]";
export const CONTEUDO = "mx-auto w-full max-w-[1264px]";

export const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-volt-950";
/** Em fundo escuro o contorno volt sumiria. */
export const FOCO_ESCURO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acid-500";

/** Cor do nome de quem escreve nas bolhas de grupo: todas com contraste AA no branco. */
export const COR_NOME = {
  azul: "#1B6FD6",
  verde: "#087A5E",
  rosa: "#B4237A",
  marrom: "#9A4A06",
  roxo: "#6D28D9",
} as const;
