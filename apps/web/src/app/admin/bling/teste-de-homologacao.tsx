"use client";

import { useState } from "react";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import type { RelatorioHomologacao } from "@/lib/bling/homologacao";
import type { LojaComBling } from "@/lib/stores/bling-conexoes";

type Estado = { tipo: "parado" } | { tipo: "rodando" } | { tipo: "relatorio"; relatorio: RelatorioHomologacao } | { tipo: "erro"; mensagem: string };

/** O Bling aceita até 2 s entre as chamadas do teste: acima disso a tela destaca. */
const LIMITE_ENTRE_CHAMADAS_MS = 2_000;

const STATUS: Record<LojaComBling["status"], string> = {
  ativa: "conectada",
  reconectar: "precisa reconectar",
  desconectada: "desconectada",
};

function nomeDaLoja(l: LojaComBling): string {
  return [l.loja ?? "Loja sem nome", l.empresa ? `Bling: ${l.empresa}` : null, STATUS[l.status]].filter(Boolean).join(" · ");
}

/** Escolhe a loja e dispara `POST /api/admin/bling/homologacao`; mostra cada passo com o status e o tempo. */
export function TesteDeHomologacao({ lojas }: { lojas: readonly LojaComBling[] }) {
  // Nenhuma pré-escolhida: o teste mexe no acesso da loja, e a mais antiga costuma ser a de uma cliente.
  const [loja, setLoja] = useState("");
  const [estado, setEstado] = useState<Estado>({ tipo: "parado" });

  async function rodar() {
    setEstado({ tipo: "rodando" });
    try {
      const res = await fetch("/api/admin/bling/homologacao", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenantId: loja }),
      });
      const corpo = (await res.json().catch(() => null)) as { relatorio?: RelatorioHomologacao; error?: string } | null;
      if (res.ok && corpo?.relatorio) setEstado({ tipo: "relatorio", relatorio: corpo.relatorio });
      else setEstado({ tipo: "erro", mensagem: corpo?.error ?? `Falhou (HTTP ${res.status}).` });
    } catch {
      setEstado({ tipo: "erro", mensagem: "Erro de conexão. Tente de novo." });
    }
  }

  if (lojas.length === 0) {
    return (
      <p className="rounded-2xl border border-aco/15 bg-white p-5 text-sm text-aco/70">
        Nenhuma loja com o Bling conectado. Conecte uma conta do Bling a uma loja (Configurações › Integrações) para
        rodar o teste.
      </p>
    );
  }

  const rodando = estado.tipo === "rodando";
  return (
    <section className="space-y-5 rounded-2xl border border-aco/15 bg-white p-5" aria-labelledby="homologacao-titulo">
      <h2 id="homologacao-titulo" className="text-base font-semibold">
        Teste técnico
      </h2>
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor="homologacao-loja" className="block text-sm font-medium">
            Conexão usada no teste
          </label>
          <select
            id="homologacao-loja"
            value={loja}
            disabled={rodando}
            onChange={(e) => setLoja(e.target.value)}
            className="min-h-11 w-full rounded-lg border border-aco/30 bg-white px-3 text-sm"
          >
            <option value="" disabled>
              Escolha a loja
            </option>
            {lojas.map((l) => (
              <option key={l.tenantId} value={l.tenantId} disabled={l.status !== "ativa"}>
                {nomeDaLoja(l)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={() => void rodar()}
          disabled={rodando || loja === ""}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-volt-950 px-4 text-sm font-semibold text-paper-0 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {rodando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Rodar teste de homologação
        </button>
      </div>
      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        No meio do teste o Bling invalida o acesso desta loja e a Girumo renova sozinha. Se a renovação falhar, a loja
        precisa reconectar o Bling. Prefira uma loja da própria Girumo, ligada à conta do Bling que é dona do app.
      </p>
      <div aria-live="polite">
        {estado.tipo === "erro" && (
          <p role="alert" className="text-sm text-red-700">
            {estado.mensagem}
          </p>
        )}
        {estado.tipo === "relatorio" && <Relatorio relatorio={estado.relatorio} />}
      </div>
    </section>
  );
}

function Relatorio({ relatorio: r }: { relatorio: RelatorioHomologacao }) {
  return (
    <div className="space-y-3">
      <p className={`flex items-center gap-2 text-sm font-semibold ${r.ok ? "text-emerald-700" : "text-red-700"}`}>
        {r.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
        {r.ok ? `Passou em ${r.totalMs} ms. Volte ao Bling para pedir a revisão do app.` : `Não passou: ${r.erro ?? "erro desconhecido"}`}
      </p>
      <table className="w-full text-left text-sm">
        <caption className="sr-only">Passos do teste</caption>
        <thead className="text-xs uppercase tracking-wider text-aco/55">
          <tr>
            <th scope="col" className="py-1.5">Passo</th>
            <th scope="col" className="py-1.5">HTTP</th>
            <th scope="col" className="py-1.5">Tempo</th>
            <th scope="col" className="py-1.5">Desde a anterior</th>
            <th scope="col" className="py-1.5">Renovação</th>
          </tr>
        </thead>
        <tbody className="font-data tabular-nums">
          {r.passos.map((p, i) => (
            <tr key={`${p.passo}-${i}`} className="border-t border-aco/10">
              <td className="py-1.5">{p.passo}</td>
              <td className="py-1.5">{p.status ?? "—"}</td>
              <td className="py-1.5">{p.ms} ms</td>
              <td className={p.intervaloMs > LIMITE_ENTRE_CHAMADAS_MS ? "py-1.5 font-semibold text-red-700" : "py-1.5"}>
                {p.intervaloMs} ms
              </td>
              <td className="py-1.5">{p.renovacaoMs === null ? "—" : `${p.renovacaoMs} ms${p.hashNo401 ? " (o 401 trouxe hash)" : ""}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
