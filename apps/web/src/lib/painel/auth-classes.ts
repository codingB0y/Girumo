/**
 * As cinco telas de auth (login, cadastro, esqueci, redefinir, callback) usam o
 * mesmo tema: card Paper sobre Volt. Em vez de repetir o conjunto de classes em
 * cada arquivo, ele mora aqui.
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

export const CLASSES_DA_PORTA: ClassesDaPorta = {
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
