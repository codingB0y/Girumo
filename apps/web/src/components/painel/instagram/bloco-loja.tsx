"use client";

import React from "react";
import { tituloDoBloco } from "@/lib/ig/flow/labels";
import { MAX_MESSAGE_BYTES, type HandoffNode } from "@/lib/ig/flow/types";
import { ajuda, campo, nomeAcessivel, Problemas, rotulo, type FormProps } from "./bloco-comum";
import { ContadorBytes } from "./contador-bytes";

/** Mesmo teto do schema (`texto` em schema.ts): o campo não aceita o que o servidor recusaria. */
const MAX_TEXTO = 4000;

/** Passar pra loja: fim de caminho. A mensagem é opcional; vazio vira "sem mensagem" (null), nunca texto em branco. */
export function BlocoLoja({ node, issues, aoMudar }: Pick<FormProps, "issues" | "aoMudar"> & { node: HandoffNode }) {
  const nome = nomeAcessivel(tituloDoBloco(node), node.id);
  return (
    <div className="grid gap-4">
      <label className="block">
        <span className="flex items-center justify-between">
          <span className={rotulo}>Mensagem <span className="font-normal text-slate-600">opcional</span></span>
          <ContadorBytes texto={node.text ?? ""} max={MAX_MESSAGE_BYTES} />
        </span>
        <textarea
          aria-label={nome("Mensagem ao passar pra loja")}
          maxLength={MAX_TEXTO}
          value={node.text ?? ""}
          placeholder="Ex.: Já já alguém da loja te responde por aqui."
          onChange={(e) => aoMudar({ text: e.target.value === "" ? null : e.target.value })}
          rows={3}
          className={`${campo} mt-1 resize-y`}
        />
        <p className={ajuda}>Aqui o robô para: a conversa vai pra “Aguardando você” e ele fica 24 h sem responder essa pessoa. Quem responde é a loja, pela tela Conversas.</p>
      </label>
      <Problemas issues={issues.filter((i) => i.nodeId === node.id)} />
    </div>
  );
}
