// apps/web/src/components/painel/configuracoes/bling.tsx
"use client";

import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useRole } from "@/components/painel/role-provider";
import { useToast } from "@/components/toast";
import type { CartaoBling } from "@/lib/bling/cartao";
import { authenticatedFetch } from "@/lib/supabase/client";
import { BlingComErro, PainelDoBling, RetornoDoBling } from "./bling-painel";
import type { AjustesParaSalvar } from "./bling-painel-ajustes";
import { mensagemDoRetorno, nomeDoCsv, type ListaDoCartao, type Ocupado } from "./bling-painel-texto";

type Carga = "carregando" | "ok" | "erro" | "proibido";

/** O cron lê o histórico a cada 5 min: de minuto em minuto o "N pedidos lidos" anda sem F5. */
const RECARGA_DO_HISTORICO_MS = 60_000;
const REVOGAR_O_CSV_MS = 40_000;
const INDISPONIVEL = "Integração indisponível no momento";

/** Corpo de erro das rotas do Bling; 503 traz só `"indisponivel"`, que não é frase. */
async function erroDaResposta(res: Response, padrao: string): Promise<string> {
  if (res.status === 503) return INDISPONIVEL;
  const corpo = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof corpo.error === "string" && corpo.error ? corpo.error : padrao;
}

/**
 * Configurações › Integrações › Bling (spec 2026-10-13-integracao-bling §6): estado e
 * chamadas. O desenho é `PainelDoBling`, testado sem navegador.
 *
 * Só dono e administração (`settings:connection`) veem o cartão: para os outros papéis ele
 * nem aparece (o Site próprio, logo acima, já dá o recado) e a rota nem é chamada.
 */
export function Bling() {
  const { can, carregado } = useRole();
  const toast = useToast();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  // `can()` devolve true enquanto o papel não chegou: sem `carregado`, o operador
  // dispararia a leitura antes de saber que não pode.
  const pode = carregado && can("settings:connection");
  const [carga, setCarga] = useState<Carga>("carregando");
  const [cartao, setCartao] = useState<CartaoBling | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const [ocupado, setOcupado] = useState<Ocupado>(null);
  const [ajustando, setAjustando] = useState(false);
  const [erroDosAjustes, setErroDosAjustes] = useState<string | null>(null);
  const [retorno, setRetorno] = useState<ReturnType<typeof mensagemDoRetorno>>(null);

  // Só a última chamada de `carregar` escreve estado; o desmonte também invalida.
  const ultimaCarga = useRef(0);

  /** `deFundo`: a recarga do histórico, que nunca troca o cartão por esqueleto ou erro. */
  const carregar = useCallback(async (deFundo = false) => {
    const minha = ++ultimaCarga.current;
    if (!deFundo) setCarga((atual) => (atual === "ok" ? atual : "carregando"));
    try {
      const res = await authenticatedFetch("/api/integracoes/bling");
      if (minha !== ultimaCarga.current) return;
      if (res.status === 403) {
        setCarga("proibido");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const dados = (await res.json()) as CartaoBling;
      if (minha !== ultimaCarga.current) return;
      setCartao(dados);
      setAgora(new Date());
      setCarga("ok");
    } catch {
      if (minha !== ultimaCarga.current || deFundo) return;
      setCarga("erro");
    }
  }, []);

  useEffect(() => {
    if (pode) void carregar();
    return () => {
      // É um contador, não um nó do DOM: queremos mesmo o valor de agora.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ultimaCarga.current++;
    };
  }, [pode, carregar]);

  // A volta do OAuth (`retorno`) chega com `?bling=`: mostra uma vez e tira da URL. O
  // `secao` fica, para um F5 continuar na porta Integrações sem repetir a mensagem.
  useEffect(() => {
    const busca = new URLSearchParams(window.location.search);
    const motivo = busca.get("bling");
    if (motivo === null) return;
    setRetorno(mensagemDoRetorno(motivo));
    busca.delete("bling");
    const resto = busca.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${resto ? `?${resto}` : ""}${window.location.hash}`);
  }, []);

  const importando = cartao?.historico?.concluido === false && cartao.conexao?.status === "ativa";
  useEffect(() => {
    if (!importando) return;
    const id = window.setInterval(() => void carregar(true), RECARGA_DO_HISTORICO_MS);
    return () => window.clearInterval(id);
  }, [importando, carregar]);

  // "Voltar" na tela do Bling pode restaurar a página do bfcache com o Conectar ainda girando.
  useEffect(() => {
    const aoVoltar = (e: PageTransitionEvent) => {
      if (e.persisted) setOcupado(null);
    };
    window.addEventListener("pageshow", aoVoltar);
    return () => window.removeEventListener("pageshow", aoVoltar);
  }, []);

  async function conectar() {
    setOcupado("conectar");
    try {
      const res = await authenticatedFetch("/api/integracoes/bling/conectar", { method: "POST" });
      if (res.ok) {
        const { url } = (await res.json()) as { url?: unknown };
        if (typeof url === "string" && url) {
          // Continua "ocupado" até a página sair para o Bling: um segundo clique abriria outro state.
          window.location.assign(url);
          return;
        }
      }
      toast(await erroDaResposta(res, "Não foi possível começar a conexão com o Bling."), "error");
    } catch {
      toast("Erro de conexão.", "error");
    }
    setOcupado(null);
  }

  function ajustar(aberto: boolean) {
    setAjustando(aberto);
    setErroDosAjustes(null);
  }

  async function salvar(ajustes: AjustesParaSalvar) {
    setOcupado("salvar");
    setErroDosAjustes(null);
    try {
      const res = await authenticatedFetch("/api/integracoes/bling", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(ajustes),
      });
      if (!res.ok) {
        // A frase do 400 (zod ou recusa do motor) ou do 409 (as situações mudaram no meio) vai para o formulário.
        setErroDosAjustes(await erroDaResposta(res, "Não foi possível salvar os ajustes."));
        return;
      }
      // Recarrega antes de fechar: o resumo que aparece no lugar do formulário já é o novo.
      await carregar();
      setAjustando(false);
      toast("Ajustes salvos.");
    } catch {
      setErroDosAjustes("Erro de conexão. Tente de novo.");
    } finally {
      setOcupado(null);
    }
  }

  async function desconectar() {
    const ok = await pedirConfirmacao({
      titulo: "Desconectar Bling",
      texto:
        "A Girumo para de receber as vendas do Bling e apaga o acesso. As vendas, pedidos e contatos já importados ficam.",
      rotulo: "Desconectar Bling",
      destrutivo: true,
    });
    if (!ok) return;
    setOcupado("desconectar");
    try {
      const res = await authenticatedFetch("/api/integracoes/bling", { method: "DELETE" });
      if (!res.ok) {
        toast(await erroDaResposta(res, "Não foi possível desconectar o Bling."), "error");
        return;
      }
      setAjustando(false);
      toast("Bling desconectado.");
      await carregar();
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setOcupado(null);
    }
  }

  /** CSV pelo fetch autenticado: o token vai no cabeçalho, nunca num link que fica no histórico. */
  async function baixar(lista: ListaDoCartao) {
    setOcupado(`csv:${lista}`);
    try {
      const res = await authenticatedFetch(`/api/integracoes/bling/lista?l=${lista}`);
      if (!res.ok) {
        toast(await erroDaResposta(res, "Não foi possível gerar a lista."), "error");
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = nomeDoCsv(res.headers.get("content-disposition"), lista);
      link.click();
      // Revogar na hora pode cancelar o download em alguns navegadores (o FileSaver espera 40 s).
      window.setTimeout(() => URL.revokeObjectURL(url), REVOGAR_O_CSV_MS);
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setOcupado(null);
    }
  }

  if (carregado && (!pode || carga === "proibido")) return null;

  function conteudo(): ReactNode {
    // Papel ainda não chegou: nada, em vez de um esqueleto que some para quem não vê o Bling.
    if (!carregado) return null;
    if (carga === "erro") return <BlingComErro onTentar={() => void carregar()} />;
    if (carga === "carregando" || !cartao) {
      return (
        <div
          className="pn-skeleton h-40 rounded-[var(--radius-control)]"
          data-testid="painel-skeleton"
          role="status"
          aria-label="Carregando a integração com o Bling"
        />
      );
    }
    return (
      <PainelDoBling
        cartao={cartao}
        agora={agora}
        ocupado={ocupado}
        ajustando={ajustando}
        erroDosAjustes={erroDosAjustes}
        onConectar={() => void conectar()}
        onAjustar={ajustar}
        onSalvar={(a) => void salvar(a)}
        onDesconectar={() => void desconectar()}
        onBaixar={(l) => void baixar(l)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Montada antes do cartão: a mensagem do `?bling=` entra numa região que já existe e é lida. */}
      <div aria-live="polite" aria-atomic="true">
        {retorno && <RetornoDoBling {...retorno} />}
      </div>
      {conteudo()}
      {folhaDeConfirmacao}
    </div>
  );
}
