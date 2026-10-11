"use client";

import { useId } from "react";
import type { ModuloOpcional } from "@/lib/auth/modulos";
import { DESCRICAO_DO_MODULO, MODULOS_NA_TELA, ROTULO_DO_MODULO } from "@/lib/painel/configuracoes";
import { cn } from "@/lib/utils";

type Props = {
  /** Vira o nome do grupo para leitor de tela ("O que ela pode acessar"). */
  legenda: string;
  modulos: readonly ModuloOpcional[];
  onModulos: (m: ModuloOpcional[]) => void;
  desabilitado?: boolean;
};

/**
 * O que a vendedora alcança, no convite e no "Editar acesso" da ficha (mockup
 * "Configurações › Equipe"). "Registrar vendas" vem marcado e travado: para o
 * papel `seller` ele é implícito e nem é gravado em `modules` — o servidor só
 * guarda os extras.
 */
export function CamposDoAcesso({ legenda, modulos, onModulos, desabilitado = false }: Props) {
  const id = useId();
  return (
    <fieldset disabled={desabilitado} className="min-w-0 rounded-[var(--radius-control)] bg-canvas-100 p-4">
      {/* `float` + `w-full`: sem isso a legenda senta na borda do fieldset, metade fora do fundo. */}
      <legend className="float-left mb-2 w-full text-13 font-semibold text-volt-950">{legenda}</legend>
      <div className="clear-both space-y-1">
        {MODULOS_NA_TELA.map((modulo) => (
          <label
            key={modulo}
            className={cn("flex min-h-11 gap-3 py-1.5", modulo === "vendas" ? "cursor-default" : "cursor-pointer")}
          >
            <input
              type="checkbox"
              checked={modulo === "vendas" || modulos.includes(modulo)}
              disabled={modulo === "vendas"}
              onChange={(e) => {
                if (modulo === "vendas") return;
                onModulos(e.target.checked ? [...modulos, modulo] : modulos.filter((m) => m !== modulo));
              }}
              aria-labelledby={`${id}-${modulo}`}
              aria-describedby={`${id}-${modulo}-desc`}
              className="mt-0.5 h-[18px] w-[18px] shrink-0 accent-cobalt-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500"
            />
            <span className="flex flex-col gap-0.5">
              <span id={`${id}-${modulo}`} className="text-[14px] font-semibold text-volt-950">
                {ROTULO_DO_MODULO[modulo]}
              </span>
              <span id={`${id}-${modulo}-desc`} className="text-13 text-slate-600">
                {DESCRICAO_DO_MODULO[modulo]}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
