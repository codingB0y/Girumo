"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { classificarAnexo, type TipoDeAnexo } from "@/lib/ig/conversas/anexo";
import { uploadMediaFile } from "@/lib/media-upload-client";

export type EstadoDoAnexo =
  | { fase: "vazio" }
  | { fase: "enviando"; nome: string }
  | { fase: "pronto"; nome: string; tipo: TipoDeAnexo; midiaId: string; previa: string };

const VAZIO: EstadoDoAnexo = { fase: "vazio" };

/**
 * Foto ou vídeo do campo de resposta: confere o limite do Instagram NO NAVEGADOR (antes de gastar o upload), sobe
 * direto para o Storage (nunca pela função da Vercel: o corpo dela tem teto de 4,5 MB) e guarda a prévia local. O
 * servidor confere tudo de novo no envio. Escolher outro arquivo ou remover durante o upload descarta o antigo; um
 * arquivo novo inválido só mostra o erro e deixa o anexo anterior onde estava.
 */
export function useAnexo() {
  const [anexo, setAnexo] = useState<EstadoDoAnexo>(VAZIO);
  const [erro, setErro] = useState<string | null>(null);
  const sequencia = useRef(0);
  const previaAtual = useRef<string | null>(null);

  const soltarPrevia = useCallback(() => {
    if (previaAtual.current) URL.revokeObjectURL(previaAtual.current);
    previaAtual.current = null;
  }, []);

  // Ao desmontar, um upload que ainda termina não cria uma URL de objeto que ninguém solta.
  useEffect(
    () => () => {
      sequencia.current += 1;
      soltarPrevia();
    },
    [soltarPrevia],
  );

  const remover = useCallback(() => {
    sequencia.current += 1;
    soltarPrevia();
    setAnexo(VAZIO);
    setErro(null);
  }, [soltarPrevia]);

  const escolher = useCallback(
    async (arquivo: File) => {
      const conferido = classificarAnexo(arquivo.type, arquivo.size);
      if (!conferido.ok) {
        setErro(conferido.mensagem);
        return;
      }
      const meu = ++sequencia.current;
      soltarPrevia();
      setErro(null);
      setAnexo({ fase: "enviando", nome: arquivo.name });
      try {
        const { id } = await uploadMediaFile(arquivo);
        if (meu !== sequencia.current) return;
        const previa = URL.createObjectURL(arquivo);
        previaAtual.current = previa;
        setAnexo({ fase: "pronto", nome: arquivo.name, tipo: conferido.tipo, midiaId: id, previa });
      } catch (e) {
        if (meu !== sequencia.current) return;
        setAnexo(VAZIO);
        setErro(e instanceof Error && e.message ? e.message : "Não deu pra enviar o arquivo. Tente de novo.");
      }
    },
    [soltarPrevia],
  );

  return { anexo, erro, escolher, remover };
}
