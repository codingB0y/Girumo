"use client";

import { useEffect, useRef, useState } from "react";
import { brl } from "@/components/painel/home/format";
import { BuscaDoCliente, ClienteDaVenda, type ClienteBuscado } from "@/components/painel/vendas/busca-do-cliente";
import { FormularioDeItens, LISTA_DE_PRODUTOS } from "@/components/painel/vendas/itens-da-venda";
import { MinhasVendas, useMinhasVendas } from "@/components/painel/vendas/minhas-vendas";
import { VendaRegistrada } from "@/components/painel/vendas/venda-registrada";
import { LINHA_VAZIA, mensagemDeErro, nomeDoCliente, nomesDeProdutos, totalDosItens, vendaDaResposta } from "@/lib/painel/vendas";
import { telefoneCanonico } from "@/lib/vendas/telefone";
import type { ItemDeVenda, VendaDoMes } from "@/lib/vendas/tipos";

const ERRO_AO_REGISTRAR = "Não deu pra registrar a venda. Tente de novo.";
// Sem idempotência no POST: depois de rede caída ou 5xx a venda pode ter sido gravada, e "tente de novo" a duplicaria.
const SEM_CONFIRMACAO = "Não deu pra confirmar se a venda foi registrada. Confira em Minhas vendas antes de tentar de novo.";

/**
 * Registrar venda (spec 2026-10-07 §4, mockup "Registrar venda"): busca por
 * número → cliente → produtos com total ao vivo → confirmação; embaixo, as
 * vendas dela no mês. Celular primeiro, uma coluna em qualquer largura.
 *
 * O formulário de produtos fica montado (escondido) enquanto ela troca o
 * cliente, para não perder o que já digitou. Ao registrar ele é DESMONTADO e
 * entra a confirmação: com o formulário vivo, as mesmas linhas poderiam ser
 * enviadas de novo (venda duplicada). "Registrar outra venda" o remonta vazio.
 */
export default function PainelVendas() {
  const minhas = useMinhasVendas();
  const [cliente, setCliente] = useState<ClienteBuscado | null>(null);
  const [nome, setNome] = useState("");
  const [venda, setVenda] = useState<VendaDoMes | null>(null);
  const [focarBusca, setFocarBusca] = useState(false);
  const [anuncio, setAnuncio] = useState("");
  const produtos = nomesDeProdutos(minhas.dados?.vendas ?? []);
  // O formulário de produtos já está montado (escondido): `autoFocus` não serve, o foco vai depois do commit.
  const produtosRef = useRef<HTMLDivElement>(null);
  const focarProdutos = useRef(false);

  useEffect(() => {
    if (!cliente || !focarProdutos.current) return;
    focarProdutos.current = false;
    produtosRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, [cliente]);

  async function registrar(itens: ItemDeVenda[]): Promise<string | null> {
    if (!cliente) return "Busque o cliente pelo número primeiro.";
    const clienteNovo = !cliente.contato && !cliente.optout;
    const nomeNovo = clienteNovo ? nome.trim() || undefined : undefined;
    let res: Response;
    try {
      res = await fetch("/api/vendas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leadId: cliente.contato?.id, telefone: cliente.telefone, nome: nomeNovo, itens }),
      });
    } catch {
      // Rede caída ou tempo esgotado: o pedido pode ter chegado. A lista recarregada mostra se entrou.
      void minhas.recarregar();
      return SEM_CONFIRMACAO;
    }
    if (res.status >= 500) {
      void minhas.recarregar();
      return SEM_CONFIRMACAO;
    }
    // 403 do guard é texto puro: o parse falha e cai no erro padrão.
    const corpo: unknown = await res.json().catch(() => null);
    if (!res.ok) return mensagemDeErro(corpo, ERRO_AO_REGISTRAR);
    const salva = vendaDaResposta(corpo, {
      id: "",
      cliente: cliente.contato?.nome ?? nomeNovo ?? null,
      telefone: cliente.contato?.telefone ?? telefoneCanonico(cliente.telefone) ?? cliente.telefone,
      total: totalDosItens(itens),
      criadaEm: new Date().toISOString(),
      itens,
      editavel: true,
      origem: "manual",
    });
    setVenda(salva);
    setAnuncio(`Venda registrada: ${nomeDoCliente(salva)}, ${brl.format(salva.total)}.`);
    void minhas.recarregar();
    return null;
  }

  function escolher(encontrado: ClienteBuscado) {
    const clienteNovo = !encontrado.contato && !encontrado.optout;
    // Cliente novo: o foco vai para o nome (autoFocus de `ClienteDaVenda`); senão, para o 1º produto.
    focarProdutos.current = !clienteNovo;
    setCliente(encontrado);
    setNome("");
    setAnuncio(
      encontrado.contato
        ? `Cliente: ${encontrado.contato.nome?.trim() || "sem nome"}.`
        : encontrado.optout
          ? "Nenhum cliente com esse número. Ele pediu pra não receber mensagens: a venda fica fora dos contatos."
          : "Nenhum cliente com esse número.",
    );
  }

  function trocarCliente() {
    setCliente(null);
    // Limpa para que escolher o mesmo cliente de novo volte a ser anunciado.
    setAnuncio("");
    setFocarBusca(true);
  }

  function novaVenda() {
    setVenda(null);
    setCliente(null);
    setNome("");
    setAnuncio("");
    setFocarBusca(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 py-5 lg:py-8">
      <header>
        <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Registrar venda</h1>
        <p className="mt-1 text-[14px] text-slate-600">Busque o cliente pelo número do WhatsApp.</p>
      </header>

      {/* Sem deduplicação na v1: a venda registrada aqui E no Bling conta duas vezes (spec 2026-10-13 §1). */}
      {minhas.dados?.blingAtivo && (
        <p role="note" className="rounded-xl border border-line-200 bg-paper-0 px-4 py-3 text-13 text-volt-950">
          Esta loja recebe as vendas do Bling: registre aqui só o que não passa pelo Bling.
        </p>
      )}

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

          <div ref={produtosRef} hidden={!cliente}>
            <FormularioDeItens
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
