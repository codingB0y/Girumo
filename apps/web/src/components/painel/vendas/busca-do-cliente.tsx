"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { iniciais } from "@/lib/painel/inicio";
import { mensagemDeErro } from "@/lib/painel/vendas";
import { formatPhoneBR } from "@/lib/phone";
import { telefoneCanonico, variantesDoTelefone } from "@/lib/vendas/telefone";
import type { BuscaDeContato } from "@/lib/vendas/tipos";
import { cn } from "@/lib/utils";
import { ANEL_DE_FOCO, CLASSE_DO_CAMPO, CLASSE_DO_ROTULO } from "./itens-da-venda";

/** O resultado da busca mais o número como ela digitou: é ele que vai no POST quando não há contato. */
export type ClienteBuscado = BuscaDeContato & { telefone: string };

const ERRO_NA_BUSCA = "Não deu pra buscar agora. Tente de novo.";

/**
 * Só por número (decisão de 07/10): a vendedora nunca vê a lista de contatos da
 * loja. Sem DDD a busca nem sai — mesma regra da rota (`variantesDoTelefone`).
 */
export function BuscaDoCliente({ aoEncontrar, focar }: { aoEncontrar: (cliente: ClienteBuscado) => void; focar: boolean }) {
  const [telefone, setTelefone] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");

  async function buscar() {
    if (buscando) return;
    if (variantesDoTelefone(telefone) === null) {
      setErro("Digite o número com DDD.");
      return;
    }
    setErro("");
    setBuscando(true);
    try {
      const res = await fetch(`/api/vendas/contato?telefone=${encodeURIComponent(telefone)}`);
      const corpo: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(mensagemDeErro(corpo, ERRO_NA_BUSCA));
        return;
      }
      const busca = corpo as BuscaDeContato;
      aoEncontrar({ contato: busca.contato ?? null, optout: busca.optout === true, telefone });
    } catch {
      setErro(ERRO_NA_BUSCA);
    } finally {
      setBuscando(false);
    }
  }

  return (
    <form
      aria-label="Buscar cliente"
      onSubmit={(e) => {
        e.preventDefault();
        void buscar();
      }}
      className="flex flex-col gap-1"
    >
      <label htmlFor="vendas-telefone" className={CLASSE_DO_ROTULO}>
        WhatsApp do cliente
      </label>
      <div className="flex gap-2">
        <input
          id="vendas-telefone"
          value={telefone}
          onChange={(e) => {
            setTelefone(e.target.value);
            setErro("");
          }}
          inputMode="tel"
          autoComplete="off"
          autoFocus={focar}
          readOnly={buscando}
          maxLength={30}
          placeholder="(11) 98765-4321"
          aria-invalid={erro ? true : undefined}
          aria-describedby={erro ? "vendas-telefone-erro" : undefined}
          className={CLASSE_DO_CAMPO}
        />
        <button
          type="submit"
          disabled={buscando}
          className={cn(
            "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[var(--radius-control)] bg-volt-950 px-4 text-[14px] font-semibold text-paper-0 disabled:opacity-50",
            ANEL_DE_FOCO,
          )}
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </div>
      {erro && (
        <p id="vendas-telefone-erro" role="alert" className="text-13 text-danger-700">
          {erro}
        </p>
      )}
    </form>
  );
}

function BotaoTrocar({ aoTrocar }: { aoTrocar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoTrocar}
      aria-label="Trocar cliente"
      className={cn("inline-flex min-h-11 shrink-0 items-center px-2 text-13 font-semibold text-cobalt-500", ANEL_DE_FOCO)}
    >
      Trocar
    </button>
  );
}

type ClienteProps = {
  cliente: ClienteBuscado;
  nome: string;
  aoMudarNome: (nome: string) => void;
  aoTrocar: () => void;
};

/**
 * O cliente escolhido (mockup): o contato achado, ou "Nenhum cliente com esse
 * número" com o nome opcional — ele entra nos contatos junto com a venda. Número
 * em opt-out registra a venda sem virar contato (spec §3), então o nome some.
 */
export function ClienteDaVenda({ cliente, nome, aoMudarNome, aoTrocar }: ClienteProps) {
  const numero = formatPhoneBR(cliente.contato?.telefone ?? telefoneCanonico(cliente.telefone)) ?? cliente.telefone;

  if (cliente.contato) {
    const nomeDoContato = cliente.contato.nome?.trim() || null;
    return (
      <section aria-label="Cliente encontrado" className="flex items-center gap-3 rounded-xl border border-line-200 bg-paper-0 p-4">
        <span
          aria-hidden="true"
          className="font-data grid h-11 w-11 shrink-0 place-items-center rounded-full bg-canvas-100 text-13 font-semibold text-volt-950"
        >
          {iniciais(nomeDoContato)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-15 font-semibold text-volt-950">{nomeDoContato ?? "Cliente sem nome"}</p>
          <p className="font-data mt-0.5 truncate text-13 text-slate-600">{numero}</p>
        </div>
        <BotaoTrocar aoTrocar={aoTrocar} />
      </section>
    );
  }

  return (
    <section aria-label="Cliente não encontrado" className="flex flex-col gap-3 rounded-xl border border-dashed border-line-200 bg-paper-0 p-4">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-15 font-semibold text-volt-950">Nenhum cliente com esse número</p>
          <p className="mt-0.5 text-13 text-slate-600">
            {cliente.optout
              ? "Esse número pediu pra não receber mensagens da loja: a venda fica registrada sem entrar nos contatos."
              : "Ele entra nos contatos da loja junto com a venda."}
          </p>
          <p className="font-data mt-1 text-13 text-volt-950">{numero}</p>
        </div>
        <BotaoTrocar aoTrocar={aoTrocar} />
      </div>
      {!cliente.optout && (
        <div>
          <label htmlFor="vendas-nome-cliente" className={CLASSE_DO_ROTULO}>
            Nome do cliente <span className="font-normal text-slate-600">(opcional)</span>
          </label>
          <input
            id="vendas-nome-cliente"
            value={nome}
            onChange={(e) => aoMudarNome(e.target.value)}
            autoComplete="off"
            // Só monta logo depois de escolher um cliente novo: o próximo passo é o nome (a página anuncia o resultado).
            autoFocus
            maxLength={80}
            placeholder="Ex.: Maria Oliveira"
            className={CLASSE_DO_CAMPO}
          />
        </div>
      )}
    </section>
  );
}
