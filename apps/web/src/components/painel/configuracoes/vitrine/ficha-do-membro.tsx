"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { canOfferRemoval, removalActionLabel } from "@/lib/auth/member-removal";
import { parseModulos, type ModuloOpcional } from "@/lib/auth/modulos";
import { chipsDoAcesso, iniciaisDoEmail, papelEmPortugues } from "@/lib/painel/configuracoes";
import { CamposDoAcesso } from "./campos-do-acesso";

export type MembroNaTela = {
  id: string;
  role: string;
  invited_email?: string | null;
  accepted_at?: string | null;
  /** Os módulos extras da vendedora; os outros papéis vêm com `[]`. */
  modules?: readonly string[] | null;
};

type Props = {
  membro: MembroNaTela;
  removendo: boolean;
  onRemover: (m: MembroNaTela) => void;
  /** Lança `Error` com a frase do servidor; a ficha mostra e continua aberta. */
  onSalvarAcesso: (id: string, modulos: ModuloOpcional[]) => Promise<void>;
};

const FOCO =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

/**
 * Uma pessoa da equipe, na ficha de 64px (spec 12.6).
 *
 * O papel sai sempre em português: "owner", "operator" e "seller" nunca chegam à
 * tela. A vendedora ganha os chips do que alcança e o "Editar acesso", que abre
 * ali mesmo os módulos dela — vale na próxima ação dela, porque o guard do
 * servidor lê `modules` a cada requisição.
 */
export function FichaDoMembro({ membro: m, removendo, onRemover, onSalvarAcesso }: Props) {
  const [aberto, setAberto] = useState(false);
  const [rascunho, setRascunho] = useState<ModuloOpcional[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [salvo, setSalvo] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);
  const vendedora = m.role === "seller";
  const chips = chipsDoAcesso(m.role, m.modules);
  const quem = m.invited_email ?? "este membro";
  const painelId = `acesso-${m.id}`;

  // O painel que tinha o foco se esconde ao salvar; o foco volta para o botão
  // que o abriu. Só depois do `salvando` cair: com o botão ainda desabilitado
  // o `focus()` não pega.
  useEffect(() => {
    if (salvando || !devolverFoco.current) return;
    devolverFoco.current = false;
    toggleRef.current?.focus();
  }, [salvando]);

  function alternar() {
    // Abre sempre do que está salvo: o rascunho de uma edição largada não pode
    // voltar como se fosse o acesso atual dela.
    setRascunho(parseModulos(m.modules));
    setErro(null);
    setSalvo(false);
    setAberto(!aberto);
  }

  async function salvar() {
    setSalvando(true);
    setErro(null);
    try {
      await onSalvarAcesso(m.id, rascunho);
      devolverFoco.current = true;
      setSalvo(true);
      setAberto(false);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível salvar o acesso.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    // A última ficha perde a borda: com ela, a linha da ficha e a do bloco de
    // convite logo abaixo desenhavam um filete duplo.
    <li className="pn-ficha flex-wrap last:border-b-0">
      <span className="pn-ficha__iniciais" aria-hidden="true">
        {iniciaisDoEmail(m.invited_email)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="pn-ficha__nome truncate">{m.invited_email ?? "Membro"}</p>
        <p className="pn-ficha__origem">
          {papelEmPortugues(m.role)}
          {!m.accepted_at && " · convite pendente"}
        </p>
        {chips.length > 0 && (
          <ul aria-label="Acesso liberado" className="mt-1.5 flex flex-wrap gap-1.5">
            {chips.map((chip) => (
              <li key={chip} className="pn-chip">
                {chip}
              </li>
            ))}
          </ul>
        )}
      </div>
      {vendedora && (
        <button
          type="button"
          ref={toggleRef}
          onClick={alternar}
          disabled={salvando}
          aria-expanded={aberto}
          aria-controls={painelId}
          aria-label={`${aberto ? "Fechar" : "Editar"} acesso de ${quem}`}
          className={`inline-flex h-11 shrink-0 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-13 font-semibold text-volt-950 disabled:opacity-50 ${FOCO}`}
        >
          {aberto ? "Fechar" : "Editar acesso"}
        </button>
      )}
      {canOfferRemoval(m) && (
        <button
          type="button"
          onClick={() => onRemover(m)}
          disabled={removendo}
          aria-label={removalActionLabel(m)}
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-slate-600 hover:text-danger-700 disabled:opacity-50 ${FOCO}`}
        >
          {removendo ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      )}
      {/* Sempre montado: região viva criada junto com a mensagem nem sempre é lida. */}
      <p role="status" className="sr-only">
        {salvo ? "Acesso salvo." : ""}
      </p>
      {vendedora && (
        // Sempre no DOM (escondido) para o `aria-controls` apontar para algo real.
        <div id={painelId} hidden={!aberto} className="basis-full pb-2 sm:pl-[52px]">
          <CamposDoAcesso
            legenda={`O que ${quem} pode acessar`}
            modulos={rascunho}
            onModulos={setRascunho}
            desabilitado={salvando}
          />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void salvar()}
              disabled={salvando}
              className={`inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] bg-cobalt-500 px-5 text-[14px] font-semibold text-paper-0 disabled:opacity-50 ${FOCO}`}
            >
              {salvando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              Salvar acesso
            </button>
            <p className="text-12 text-slate-600">Vale na próxima ação dela, sem precisar sair e entrar de novo.</p>
          </div>
          {erro && (
            <p role="alert" className="mt-2 text-13 text-danger-700">
              {erro}
            </p>
          )}
        </div>
      )}
    </li>
  );
}
