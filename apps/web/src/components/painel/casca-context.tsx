"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type Passos = { feitos: number; total: number };

type CascaCtx = {
  /** Passos da ativação, como a Início calculou. null = ainda não visitou a Início. */
  passos: Passos | null;
  definirPassos: (passos: Passos) => void;
};

const CascaContext = createContext<CascaCtx>({ passos: null, definirPassos: () => {} });

export const useCasca = () => useContext(CascaContext);

/**
 * O corredor mostra "N de 5 passos" (spec 3.1) mas não tem os dados pra calcular;
 * a Início já os carrega. O layout não remonta entre rotas, então o valor
 * sobrevive à navegação.
 */
export function CascaProvider({ children }: { children: React.ReactNode }) {
  const [passos, definirPassos] = useState<Passos | null>(null);
  const valor = useMemo(() => ({ passos, definirPassos }), [passos]);
  return <CascaContext.Provider value={valor}>{children}</CascaContext.Provider>;
}
