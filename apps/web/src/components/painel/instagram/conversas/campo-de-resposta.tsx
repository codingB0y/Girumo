"use client";

import React, { useEffect, useRef, useState } from "react";
import { ImageIcon, Link2, MessageSquareText, Settings2 } from "lucide-react";
import { useRole } from "@/components/painel/role-provider";
import { ANEXO_ACCEPT } from "@/lib/ig/conversas/anexo";
import { aplicarResposta, consultaDaBarra, filtrarRespostas, moverAtivo, type RespostaPronta } from "@/lib/ig/conversas/campo";
import { NOTA_DA_PAUSA, quando, type EstadoDoCampo } from "@/lib/ig/conversas/tela";
import { cn } from "@/lib/utils";
import { PreviaDoAnexo } from "./anexo-do-campo";
import { ConviteDoGrupo } from "./convite-do-grupo";
import { GerenciarRespostas } from "./gerenciar-respostas";
import { ID_DA_LISTA, idDaOpcao, ListaDeRespostas, temOpcoes } from "./respostas-prontas";
import { useAnexo } from "./use-anexo";
import type { Envio, Resultado } from "./use-fio";
import { useRespostasProntas } from "./use-respostas-prontas";

const LIMITE = 1000;
const BOTAO = "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950 disabled:opacity-50 lg:min-h-9";
const SO_ICONE = "w-11 justify-center px-0 lg:w-9";

type Props = {
  estado: EstadoDoCampo;
  /** "@ana" — vai no rótulo do campo. */
  quem: string;
  aoEnviar: (envio: Envio) => Promise<Resultado>;
  aoConvidar: (campanhaId: string) => Promise<Resultado>;
  aoRetomar: () => Promise<Resultado>;
};

/** O campo de resposta com os quatro estados do mockup: janela aberta, 24 h a 7 dias, fechada e robô pausado. */
export function CampoDeResposta({ estado, quem, aoEnviar, aoConvidar, aoRetomar }: Props) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [painel, setPainel] = useState<"convite" | "gerenciar" | null>(null);
  const [viaBotao, setViaBotao] = useState(false);
  const [suprimida, setSuprimida] = useState(false);
  const [ativo, setAtivo] = useState(0);
  const campo = useRef<HTMLTextAreaElement>(null);
  const arquivo = useRef<HTMLInputElement>(null);
  const botaoConvite = useRef<HTMLButtonElement>(null);
  const botaoGerenciar = useRef<HTMLButtonElement>(null);
  // Trava síncrona: dois Ctrl+Enter ou cliques antes de `enviando` renderizar mandariam duas vezes.
  const emVoo = useRef(false);
  const { role, tenantId } = useRole();
  const podeGerenciar = role === "owner" || role === "admin";
  const prontas = useRespostasProntas(tenantId);
  const { anexo, erro: erroDoAnexo, escolher, remover } = useAnexo();
  const agora = new Date();
  const vazio = texto.trim() === "";

  // A lista abre com `/` no começo do texto ou pelo botão; Esc fecha até o texto mudar.
  const abertaPelaBarra = consultaDaBarra(texto) !== null;
  const consulta = consultaDaBarra(texto) ?? (viaBotao ? "" : null);
  const aberta = estado.podeEnviar && consulta !== null && !suprimida;
  const filtradas = filtrarRespostas(prontas.respostas, consulta ?? "");
  const indice = filtradas.length ? Math.min(ativo, filtradas.length - 1) : -1;
  const comOpcoes = aberta && temOpcoes(prontas.carga, filtradas);
  // Com a lista aberta o Enter/Ctrl+Enter e o botão não mandam o "/pedido" por engano.
  const pode = estado.podeEnviar && !enviando && !aberta && anexo.fase !== "enviando" && (!vazio || anexo.fase === "pronto");
  const { carregar } = prontas;
  const gerenciando = painel === "gerenciar";
  useEffect(() => {
    if (aberta || gerenciando) void carregar();
  }, [aberta, gerenciando, carregar]);

  const aoDigitar = (valor: string) => {
    setTexto(valor);
    setErro(null);
    setSuprimida(false);
    setAtivo(0);
    if (consultaDaBarra(valor) === null) setViaBotao(false);
  };

  const escolherResposta = (r: RespostaPronta) => {
    const el = campo.current;
    setTexto(aplicarResposta(texto, r.texto, abertaPelaBarra, el?.selectionStart ?? texto.length, el?.selectionEnd ?? texto.length, LIMITE));
    setViaBotao(false);
    setSuprimida(true);
    campo.current?.focus();
  };

  const alternarLista = () => {
    setPainel(null);
    // O botão fecha a lista mesmo aberta pela `/`; fechada, abre.
    setViaBotao(!aberta);
    setSuprimida(aberta);
    setAtivo(0);
    campo.current?.focus();
  };

  /** Fecha o painel inline e devolve o foco ao botão que o abriu. */
  const fecharPainel = () => {
    const alvo = painel === "convite" ? botaoConvite.current : botaoGerenciar.current;
    setPainel(null);
    alvo?.focus();
  };

  const aoTeclar = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void enviar();
    } else if (aberta && e.key === "Escape") {
      e.preventDefault();
      setSuprimida(true);
      setViaBotao(false);
    } else if (aberta && filtradas.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      setAtivo(moverAtivo(indice, e.key, filtradas.length));
    } else if (aberta && filtradas.length > 0 && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      escolherResposta(filtradas[indice]);
    }
  };

  const enviar = async () => {
    if (!pode || emVoo.current) return;
    emVoo.current = true;
    setEnviando(true);
    setErro(null);
    const r = await aoEnviar({ texto: texto.trim() || undefined, midiaId: anexo.fase === "pronto" ? anexo.midiaId : undefined });
    emVoo.current = false;
    setEnviando(false);
    if (r.ok) {
      setTexto("");
      remover();
      // O foco volta ao campo para a loja seguir digitando sem pegar o mouse.
      campo.current?.focus();
    } else {
      setErro(r.mensagem);
    }
  };

  const retomar = async () => {
    const r = await aoRetomar();
    if (!r.ok) setErro(r.mensagem);
  };

  return (
    <div className="flex flex-col gap-2 border-t border-line-200 bg-paper-0 p-3">
      {estado.pausadoAte && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius-control)] bg-canvas-100 px-3 py-2">
          <div className="min-w-0">
            <p className="text-13 font-medium text-volt-950">Robô pausado até {quando(estado.pausadoAte, agora)}</p>
            <p className="text-12 text-slate-600">{NOTA_DA_PAUSA}</p>
          </div>
          <button type="button" onClick={() => void retomar()} className={cn(BOTAO, "shrink-0")}>Retomar agora</button>
        </div>
      )}
      <p className={cn("flex items-center gap-2 text-13 font-medium", estado.modo === "aberta" ? "text-success-700" : estado.modo === "humano" ? "text-warning-700" : "text-slate-600")}>
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-current" />
        {estado.faixa}
      </p>
      <p role="status" className="sr-only">{aberta && prontas.carga === "ok" && filtradas.length > 0 ? (filtradas.length === 1 ? "1 resposta" : `${filtradas.length} respostas`) : ""}</p>
      {aberta && <ListaDeRespostas itens={filtradas} total={prontas.respostas.length} carga={prontas.carga} ativo={indice} podeGerenciar={podeGerenciar} aoEscolher={escolherResposta} aoTentarDeNovo={() => void carregar()} />}
      {painel === "convite" && estado.podeEnviar && <ConviteDoGrupo aoConvidar={aoConvidar} aoFechar={fecharPainel} />}
      {painel === "gerenciar" && podeGerenciar && <GerenciarRespostas respostas={prontas.respostas} carga={prontas.carga} aoCriar={prontas.criar} aoApagar={prontas.apagar} aoTentarDeNovo={() => void carregar()} aoFechar={fecharPainel} />}
      <PreviaDoAnexo anexo={anexo} aoRemover={remover} bloqueado={enviando} />
      <label>
        <span className="sr-only">Responder {quem}</span>
        <textarea
          ref={campo}
          rows={2}
          value={estado.podeEnviar ? texto : ""}
          disabled={!estado.podeEnviar || enviando}
          maxLength={LIMITE}
          placeholder={estado.podeEnviar ? "Escreva a resposta ou digite / para as respostas prontas" : "Fechada pelo Instagram"}
          onChange={(e) => aoDigitar(e.target.value)}
          onKeyDown={aoTeclar}
          role="combobox"
          aria-expanded={comOpcoes}
          aria-haspopup="listbox"
          aria-autocomplete="list"
          aria-controls={comOpcoes ? ID_DA_LISTA : undefined}
          aria-activedescendant={comOpcoes && indice >= 0 ? idDaOpcao(filtradas[indice].id) : undefined}
          className="w-full resize-none rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 py-2 text-14 text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500 disabled:bg-canvas-100"
        />
      </label>
      {erro && <p role="alert" className="text-13 text-danger-700">{erro}</p>}
      {erroDoAnexo && <p role="alert" className="text-13 text-danger-700">{erroDoAnexo}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" disabled={!estado.podeEnviar || enviando} aria-expanded={aberta} onClick={alternarLista} className={BOTAO}>
          <MessageSquareText aria-hidden="true" className="h-4 w-4" />
          Respostas prontas
        </button>
        <button ref={botaoConvite} type="button" disabled={!estado.podeEnviar || enviando} aria-expanded={painel === "convite"} onClick={() => setPainel(painel === "convite" ? null : "convite")} className={BOTAO}>
          <Link2 aria-hidden="true" className="h-4 w-4" />
          Convite do grupo
        </button>
        <button type="button" aria-label="Foto ou vídeo" title="Foto ou vídeo" disabled={!estado.podeEnviar || enviando || anexo.fase === "enviando"} onClick={() => arquivo.current?.click()} className={cn(BOTAO, SO_ICONE)}>
          <ImageIcon aria-hidden="true" className="h-4 w-4" />
        </button>
        <input
          ref={arquivo}
          type="file"
          accept={ANEXO_ACCEPT}
          tabIndex={-1}
          aria-label="Escolher foto ou vídeo"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void escolher(f);
          }}
        />
        {podeGerenciar && (
          <button ref={botaoGerenciar} type="button" aria-label="Gerenciar respostas" title="Gerenciar respostas" aria-expanded={painel === "gerenciar"} onClick={() => setPainel(painel === "gerenciar" ? null : "gerenciar")} className={cn(BOTAO, SO_ICONE)}>
            <Settings2 aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
        <button type="button" onClick={() => void enviar()} disabled={!pode} className={cn(BOTAO, "ml-auto border-cobalt-500 bg-cobalt-500 text-paper-0")}>
          {enviando ? "Enviando…" : estado.rotuloEnviar}
        </button>
      </div>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 flex-1 text-12 text-slate-600">
          {estado.nota}
          {estado.podeEnviar && !estado.pausadoAte && " Ao responder, o robô pausa aqui por 12 h."}
        </p>
        {estado.podeEnviar && <span className="font-data text-12 tabular-nums text-slate-600">{texto.length}/{LIMITE}</span>}
      </div>
    </div>
  );
}
