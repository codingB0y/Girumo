"use client";

import { useState } from "react";
import { brl } from "@/components/painel/home/format";
import { BuscaDoCliente, ClienteDaVenda, type ClienteBuscado } from "@/components/painel/vendas/busca-do-cliente";
import { FormularioDeItens, LISTA_DE_PRODUTOS } from "@/components/painel/vendas/itens-da-venda";
import { MinhasVendas, useMinhasVendas } from "@/components/painel/vendas/minhas-vendas";
import { VendaRegistrada } from "@/components/painel/vendas/venda-registrada";
import { LINHA_VAZIA, mensagemDeErro, nomeDoCliente, nomesDeProdutos } from "@/lib/painel/vendas";
import type { ItemDeVenda, VendaDoMes } from "@/lib/vendas/tipos";

const ERRO_AO_REGISTRAR = "Não deu pra registrar a venda. Tente de novo.";

/**
 * Registrar venda (spec 2026-10-07 §4, mockup "Registrar venda"): busca por
 * número → cliente → produtos com total ao vivo → confirmação; embaixo, as
 * vendas dela no mês. Celular primeiro, uma coluna em qualquer largura.
 *
 * O formulário de produtos fica montado (escondido) enquanto ela troca o
 * cliente, para não perder o que já digitou. Ao registrar ele é DESMONTADO e
 * entra a confirmação: com o formulário vivo, as mesmas linhas poderiam ser
 * enviadas de novo (venda duplicada). "Registrar outra venda" o remonta vazio
 * (`rodada`).
 */
export default function PainelVendas() {
  const minhas = useMinhasVendas();
  const [cliente, setCliente] = useState<ClienteBuscado | null>(null);
  const [nome, setNome] = useState("");
  const [venda, setVenda] = useState<VendaDoMes | null>(null);
  const [rodada, setRodada] = useState(0);
  const [focarBusca, setFocarBusca] = useState(false);
  const [anuncio, setAnuncio] = useState("");
  const produtos = nomesDeProdutos(minhas.dados?.vendas ?? []);

  async function registrar(itens: ItemDeVenda[]): Promise<string | null> {
    if (!cliente) return "Busque o cliente pelo número primeiro.";
    const clienteNovo = !cliente.contato && !cliente.optout;
    try {
      const res = await fetch("/api/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: cliente.contato?.id,
          telefone: cliente.telefone,
          nome: clienteNovo ? nome.trim() || undefined : undefined,
          itens,
        }),
      });
      // 403 do guard é texto puro: o parse falha e cai no erro padrão.
      const corpo: unknown = await res.json().catch(() => null);
      if (!res.ok) return mensagemDeErro(corpo, ERRO_AO_REGISTRAR);
      const salva = corpo as VendaDoMes;
      setVenda(salva);
      setAnuncio(`Venda registrada: ${nomeDoCliente(salva)}, ${brl.format(salva.total)}.`);
      void minhas.recarregar();
      return null;
    } catch {
      // Rede caída: a rejeição não pode escapar de `void enviar()` no formulário.
      return ERRO_AO_REGISTRAR;
    }
  }

  function escolher(encontrado: ClienteBuscado) {
    setCliente(encontrado);
    setNome("");
  }

  function trocarCliente() {
    setCliente(null);
    setFocarBusca(true);
  }

  function novaVenda() {
    setVenda(null);
    setCliente(null);
    setNome("");
    setAnuncio("");
    setRodada((r) => r + 1);
    setFocarBusca(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5 lg:py-8">
      <header>
        <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Registrar venda</h1>
        <p className="mt-1 text-[14px] text-slate-600">Busque o cliente pelo número do WhatsApp.</p>
      </header>

      {/* Sempre montado: região viva inserida já com texto não é anunciada (trial-banner.tsx:14-15). */}
      <p role="status" className="sr-only">
        {anuncio}
      </p>

      {venda ? (
        <VendaRegistrada venda={venda} aoNovaVenda={novaVenda} />
      ) : (
        <>
          {cliente ? (
            <ClienteDaVenda cliente={cliente} nome={nome} aoMudarNome={setNome} aoTrocar={trocarCliente} />
          ) : (
            <BuscaDoCliente aoEncontrar={escolher} focar={focarBusca} />
          )}

          <div hidden={!cliente}>
            <FormularioDeItens
              key={rodada}
              idBase="venda"
              titulo="Produtos"
              linhasIniciais={[LINHA_VAZIA]}
              verbo="Registrar venda"
              aoEnviar={registrar}
            />
          </div>
        </>
      )}

      <datalist id={LISTA_DE_PRODUTOS}>
        {produtos.map((produto) => (
          <option key={produto} value={produto} />
        ))}
      </datalist>

      <MinhasVendas estado={minhas} />
    </div>
  );
}
