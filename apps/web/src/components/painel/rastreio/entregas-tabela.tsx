"use client";

import React from "react";

import { horaBR } from "@/lib/date-br";
import {
  novidadeDaLinha,
  rotuloDaSituacao,
  type FiltroDeEntregas,
  type LinhaDeEntrega,
  type RespostaDeEntregas,
} from "@/lib/rastreio/entregas";

export type PropsDaTabelaDeEntregas = {
  resposta: RespostaDeEntregas;
  filtro: FiltroDeEntregas;
  busca: string;
  carregando: boolean;
  erro: string | null;
  aoFiltrar(f: FiltroDeEntregas): void;
  aoBuscar(b: string): void;
  aoPaginar(p: number): void;
  aoReenviar(l: LinhaDeEntrega): void;
  reenviando: string | null;
};

const TOM_DO_CHIP = { neutro: "", atencao: "pn-chip--line", risco: "pn-chip--risco", ok: "pn-chip--acid" } as const;
const BOTAO = "rounded border border-neutral-300 px-2 py-1 text-xs font-medium hover:bg-neutral-50 disabled:opacity-50";

function Cartao({ titulo, valor, legenda }: { titulo: string; valor: number; legenda: string }) {
  return (
    <div className="pn-card p-3">
      <p className="text-xs font-medium">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums">{valor}</p>
      <p className="text-xs text-neutral-500">{legenda}</p>
    </div>
  );
}

function Vazio({ filtro, busca }: { filtro: FiltroDeEntregas; busca: string }) {
  const texto = busca
    ? "Nenhum pedido encontrado nas entregas dos últimos 30 dias. Pedido que ainda não saiu da loja não aparece aqui."
    : filtro !== "todos"
      ? "Nenhum pedido neste filtro."
      : "Nenhum pedido em andamento nos últimos 30 dias.";
  return <p className="px-3 py-6 text-sm text-neutral-600">{texto}</p>;
}

export function TabelaDeEntregas(p: PropsDaTabelaDeEntregas) {
  const { numeros: n, linhas, total, pagina, porPagina } = p.resposta;
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  const chips: { f: FiltroDeEntregas; texto: string }[] = [
    { f: "todos", texto: `Todos · ${n.todos}` },
    { f: "a_caminho", texto: `A caminho · ${n.aCaminho}` },
    { f: "sem_codigo", texto: `Sem código · ${n.semCodigo}` },
    { f: "problema", texto: `Problema · ${n.problema}` },
    { f: "entregues", texto: "Entregues" },
    ...(n.whatsappFalhou > 0 || p.filtro === "whatsapp_falhou"
      ? [{ f: "whatsapp_falhou" as const, texto: `WhatsApp falhou · ${n.whatsappFalhou}` }]
      : []),
  ];

  return (
    <section className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Cartao titulo="A caminho" valor={n.aCaminho} legenda="enviados, ainda não entregues" />
        <Cartao titulo="Sem código há +2 dias" valor={n.semCodigo} legenda="faturados sem rastreio" />
        <Cartao titulo="Problema na entrega" valor={n.problema} legenda="a transportadora não conseguiu entregar" />
        <Cartao titulo="Entregues em 7 dias" valor={n.entreguesEm7Dias} legenda="" />
        <Cartao
          titulo="Avisos hoje"
          valor={n.avisosHoje.whatsapp + n.avisosHoje.email}
          legenda={`${n.avisosHoje.whatsapp} WhatsApp · ${n.avisosHoje.email} e-mail`}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button key={c.f} type="button" className="pn-chip" aria-pressed={p.filtro === c.f} onClick={() => p.aoFiltrar(c.f)}>
            {c.texto}
          </button>
        ))}
        <label className="ml-auto text-sm">
          <span className="sr-only">Buscar pedido</span>
          <input
            type="search"
            value={p.busca}
            onChange={(e) => p.aoBuscar(e.target.value)}
            placeholder="Buscar por nº, nome ou CPF/CNPJ"
            className="w-64 rounded border border-neutral-300 px-2 py-1"
          />
        </label>
      </div>

      {p.erro && (
        <p role="alert" className="text-sm text-red-700">
          {p.erro}
        </p>
      )}

      <div className="pn-card overflow-x-auto" aria-busy={p.carregando}>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Entregas dos pedidos da Yampi nos últimos 30 dias</caption>
          <thead>
            <tr>
              <th scope="col" className="px-3 py-2">Pedido</th>
              <th scope="col" className="px-3 py-2">Compradora</th>
              <th scope="col" className="px-3 py-2">Situação</th>
              <th scope="col" className="px-3 py-2">Código</th>
              <th scope="col" className="px-3 py-2">Última novidade</th>
              <th scope="col" className="px-3 py-2">Avisos</th>
              <th scope="col" className="sr-only">Ação</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const s = rotuloDaSituacao(l);
              return (
                <tr key={l.id} className="border-t border-neutral-200">
                  <td className="px-3 py-2 font-medium">#{l.numero}</td>
                  <td className="px-3 py-2">{l.primeiroNome ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`pn-chip ${TOM_DO_CHIP[s.tom]}`}>{s.texto}</span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{l.trackingCode ?? "—"}</td>
                  <td className="px-3 py-2">{novidadeDaLinha(l)}</td>
                  <td className="px-3 py-2">
                    {l.avisos.map((a, i) => (
                      <span key={a.texto}>
                        {i > 0 && " · "}
                        {a.falhou ? <strong>{a.texto}</strong> : a.texto}
                      </span>
                    ))}
                  </td>
                  <td className="space-x-2 whitespace-nowrap px-3 py-2 text-right">
                    {l.link && (
                      <a href={l.link} target="_blank" rel="noopener noreferrer" className={BOTAO}>
                        Ver
                      </a>
                    )}
                    {l.telefone && (
                      <a href={`https://wa.me/${l.telefone}`} target="_blank" rel="noopener noreferrer" className={BOTAO}>
                        Chamar compradora
                      </a>
                    )}
                    {l.podeReenviar && (
                      <button type="button" className={BOTAO} disabled={p.reenviando === l.id} onClick={() => p.aoReenviar(l)}>
                        Reenviar aviso
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {linhas.length === 0 && <Vazio filtro={p.filtro} busca={p.busca} />}
      </div>

      <div className="flex items-center justify-between text-sm">
        <button type="button" className={BOTAO} disabled={pagina <= 1} onClick={() => p.aoPaginar(pagina - 1)}>
          Anterior
        </button>
        <span>
          Página {pagina} de {paginas}
        </span>
        <button type="button" className={BOTAO} disabled={pagina >= paginas} onClick={() => p.aoPaginar(pagina + 1)}>
          Próxima
        </button>
      </div>

      <p className="text-xs text-neutral-500">
        Pedidos da Yampi dos últimos 30 dias · atualizado às {horaBR(p.resposta.atualizadoEm)} · WhatsApp falhou = o aviso não
        saiu pelo WhatsApp (número sem WhatsApp, número do atendimento fora do ar, pedido para sair); o e-mail saiu no lugar,
        quando havia e-mail.
      </p>
    </section>
  );
}
