"use client";

import { Folha } from "./folha";
import { ListaDosModulos } from "./lista-dos-modulos";
import { useResumoDosModulos } from "./use-resumo-modulos";

/** "Mais" da casca mobile (spec 3.2): todos os módulos por grupo, com o estado de cada um. */
export function FolhaMais({ id, aberta, aoFechar }: { id?: string; aberta: boolean; aoFechar: () => void }) {
  const dados = useResumoDosModulos(aberta);
  return (
    <Folha id={id} aberta={aberta} aoFechar={aoFechar} titulo="Mais" testId="painel-folha-mais">
      <nav aria-label="Todos os módulos" className="space-y-4 pb-2">
        <ListaDosModulos
          dados={dados}
          aoEscolher={aoFechar}
          classeDoGrupo="font-data px-2 pb-1 text-12 uppercase tracking-[0.08em] text-slate-600"
          classeDoItem="pn-folha__item"
        />
      </nav>
    </Folha>
  );
}
