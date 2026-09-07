/**
 * As cinco telas de auth (login, cadastro, esqueci, redefinir, callback) trocam
 * de tema junto: a casca antiga é escura (card Volt sobre Volt), a porta da
 * Vitrine é clara (card Paper sobre Volt). Em vez de repetir os dois conjuntos
 * de classe em cada arquivo, a escolha mora aqui.
 *
 * Sai no PR 10, junto com a flag e a casca antiga.
 */

export type ClassesDaPorta = {
  campo: string;
  rotulo: string;
  primario: string;
  secundario: string;
  erro: string;
  link: string;
  titulo: string;
  texto: string;
  textoFraco: string;
  aviso: string;
};

const ANTIGA: ClassesDaPorta = {
  campo:
    "h-11 w-full rounded-[var(--radius-control)] border border-volt-800 bg-volt-950 px-4 text-sm text-canvas-100 placeholder:text-canvas-100/35 outline-none transition-[border-color,box-shadow] duration-[var(--duration-micro)] ease-[var(--ease-girumo)] focus:border-cobalt-500 focus:ring-2 focus:ring-cobalt-500/30",
  rotulo: "mb-1.5 block text-sm font-medium text-canvas-100/70",
  primario:
    "flex h-11 w-full items-center justify-center rounded-[var(--radius-control)] bg-acid-500 text-sm font-semibold text-volt-950 transition-[filter] duration-[var(--duration-micro)] hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:pointer-events-none disabled:opacity-50",
  secundario:
    "flex h-11 w-full items-center justify-center gap-2.5 rounded-[var(--radius-control)] border border-volt-800 bg-volt-950 text-sm font-medium text-canvas-100 transition-colors duration-[var(--duration-micro)] hover:border-cobalt-500 hover:bg-volt-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:pointer-events-none disabled:opacity-50",
  erro: "rounded-[var(--radius-control)] border border-danger-700/40 bg-danger-700/15 px-3 py-2 text-sm text-canvas-100",
  link: "font-medium text-acid-500 transition-colors hover:text-canvas-100",
  titulo: "font-display text-lg font-bold text-canvas-100",
  texto: "text-sm text-canvas-100/60",
  textoFraco: "text-xs text-canvas-100/45",
  /** Validação inline abaixo do campo: precisa ser lida, não é rodapé. */
  aviso: "mt-1 text-xs text-canvas-100/80",
};

const PORTA: ClassesDaPorta = {
  campo: "pn-porta__campo",
  rotulo: "pn-porta__rotulo",
  primario: "pn-porta__primario",
  secundario: "pn-porta__secundario",
  erro: "pn-porta__erro",
  link: "pn-porta__link",
  titulo: "font-brand text-20 font-bold text-volt-950",
  texto: "text-[14px] text-slate-600",
  textoFraco: "text-12 text-slate-600",
  aviso: "mt-1 text-13 text-danger-700",
};

export function classesDaPorta(vitrine: boolean): ClassesDaPorta {
  return vitrine ? PORTA : ANTIGA;
}
