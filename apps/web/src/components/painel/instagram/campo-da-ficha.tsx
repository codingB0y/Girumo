"use client";

import React, { useState } from "react";
import { fieldLabel, toFieldKey } from "@/lib/ig/flow/names";
import { ajuda, campo, erro } from "./bloco-comum";

/**
 * Campo de texto que vira a chave do campo da ficha ao sair dele ("Tamanho do pé" → `tamanho_do_pe`).
 * Mostra o rótulo, não a chave, e sugere os campos que o fluxo já usa.
 */
export function CampoDaFicha({ valor, chaves, aoConfirmar, rotulo, idLista }: {
  valor: string | null | undefined;
  chaves: string[];
  /** `null` = campo limpo. */
  aoConfirmar: (chave: string | null) => void;
  rotulo: string;
  idLista: string;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const [invalido, setInvalido] = useState(false);
  const mostrado = texto ?? (valor ? fieldLabel(valor) : "");
  const confirmar = () => {
    if (texto === null) return;
    const vazio = !texto.trim();
    const chave = vazio ? null : toFieldKey(texto);
    setInvalido(!vazio && chave === null);
    if (vazio || chave !== null) aoConfirmar(chave);
    setTexto(null);
  };
  return (
    <div>
      <input
        aria-label={rotulo}
        list={idLista}
        maxLength={40}
        value={mostrado}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={confirmar}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        placeholder="ex.: Tamanho do pé"
        className={`${campo} mt-1`}
      />
      <datalist id={idLista}>{chaves.map((c) => <option key={c} value={fieldLabel(c)} />)}</datalist>
      {invalido && <p role="alert" className={erro}>Use letras e números, começando por letra.</p>}
      {!invalido && valor && <p className={ajuda}>Na ficha da pessoa: {fieldLabel(valor)}.</p>}
    </div>
  );
}
