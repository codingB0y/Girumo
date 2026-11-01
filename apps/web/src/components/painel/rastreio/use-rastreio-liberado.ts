"use client";

import { useCasca } from "../casca-context";
import { useRole } from "../role-provider";

/** O Rastreio está liberado para esta loja e este papel (dono/admin)? Falso enquanto a casca não sabe. */
export function useRastreioLiberado(): boolean {
  const { carregado, acesso, can } = useRole();
  const { liberacoes } = useCasca();
  return carregado && acesso !== null && can("settings:connection") && liberacoes?.rastreio === true;
}
