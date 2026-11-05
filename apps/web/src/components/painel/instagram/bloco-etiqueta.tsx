"use client";

import React from "react";
import { tituloDoBloco } from "@/lib/ig/flow/labels";
import type { TagNode } from "@/lib/ig/flow/types";
import { ajuda, nomeAcessivel, Problemas, rotulo, type FormProps } from "./bloco-comum";
import { ChipsEtiqueta } from "./chips-etiqueta";

export function BlocoEtiqueta({ node, issues, aoMudar }: Pick<FormProps, "issues" | "aoMudar"> & { node: TagNode }) {
  const nome = nomeAcessivel(tituloDoBloco(node), node.id);
  return (
    <div className="grid gap-4">
      <div>
        <span className={rotulo}>Pôr as etiquetas</span>
        <div className="mt-1"><ChipsEtiqueta etiquetas={node.add} rotulo={nome("Pôr etiqueta")} aoMudar={(add) => aoMudar({ add })} /></div>
      </div>
      <div>
        <span className={rotulo}>Tirar as etiquetas</span>
        <div className="mt-1"><ChipsEtiqueta etiquetas={node.remove} rotulo={nome("Tirar etiqueta")} aoMudar={(remove) => aoMudar({ remove })} /></div>
        <p className={ajuda}>Etiqueta é uma marca na ficha da pessoa. Não manda mensagem, então pode vir em qualquer lugar do fluxo.</p>
      </div>
      <Problemas issues={issues.filter((i) => i.nodeId === node.id)} />
    </div>
  );
}
