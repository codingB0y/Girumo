"use client";

import React, { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ChevronLeft, Check, UserRound } from "lucide-react";
import { estadoDoCampo, iniciais, itensDoFio } from "@/lib/ig/conversas/tela";
import type { ConversaDto } from "@/lib/ig/conversas/tipos";
import { Bolha, MarcaDoFioLinha } from "./bolha";
import { CampoDeResposta } from "./campo-de-resposta";
import type { AcaoDaConversa, Resultado, useFio } from "./use-fio";

type Fio = ReturnType<typeof useFio>;
const BOTAO = "inline-flex min-h-11 items-center gap-1.5 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950 disabled:opacity-50 lg:min-h-9";
const ICONE = "grid h-11 w-11 shrink-0 place-items-center rounded-[var(--radius-control)] text-volt-950 hover:bg-canvas-100";

type Props = {
  conversa: ConversaDto;
  fio: Fio;
  /** Só no celular: volta para a lista / abre a ficha. */
  aoVoltar?: () => void;
  aoAbrirFicha?: () => void;
  /** Ficha em tela cheia por cima: o fio fica fora da ordem de tabulação e dos leitores de tela. */
  inerte?: boolean;
  refBotaoFicha?: RefObject<HTMLButtonElement | null>;
};

/** Perto do fim = quem lê as mensagens novas sem precisar rolar. */
const PERTO_DO_FIM_PX = 120;

export function FioDaConversa({ conversa, fio, aoVoltar, aoAbrirFicha, inerte, refBotaoFicha }: Props) {
  const titulo = useRef<HTMLHeadingElement>(null);
  // No celular a conversa abre em tela cheia: o foco vai para o título dela (o botão da lista saiu da tela).
  const noCelular = useRef(aoVoltar !== undefined);
  useEffect(() => {
    if (noCelular.current) titulo.current?.focus();
  }, []);
  const [erro, setErro] = useState<string | null>(null);
  const [agindo, setAgindo] = useState(false);
  const rolagem = useRef<HTMLDivElement>(null);
  const ultimaVista = useRef<string | null>(null);
  const quem = conversa.username ? `@${conversa.username}` : (conversa.nome ?? "esta pessoa");
  const itens = useMemo(() => itensDoFio(fio.mensagens, fio.marcas), [fio.mensagens, fio.marcas]);
  const campo = estadoDoCampo(fio.janela, fio.pausadoAte, new Date());

  // Desce até a mensagem mais nova ao abrir e quando chega uma nova (se a pessoa já estava lá embaixo).
  const ultimaId = fio.mensagens.at(-1)?.id ?? null;
  useEffect(() => {
    const el = rolagem.current;
    if (!el || ultimaId === ultimaVista.current) return;
    const primeira = ultimaVista.current === null;
    ultimaVista.current = ultimaId;
    if (primeira || el.scrollHeight - el.scrollTop - el.clientHeight < PERTO_DO_FIM_PX) el.scrollTop = el.scrollHeight;
  }, [ultimaId]);

  const agir = async (acao: AcaoDaConversa): Promise<Resultado> => {
    setAgindo(true);
    setErro(null);
    const r = await fio.agir(acao);
    setAgindo(false);
    if (!r.ok) setErro(r.mensagem);
    return r;
  };

  return (
    <section aria-label={`Conversa com ${quem}`} inert={inerte} className="flex min-h-0 flex-col bg-canvas-100">
      <header className="flex flex-wrap items-center gap-2 border-b border-line-200 bg-paper-0 px-3 py-2">
        {aoVoltar && (
          <button type="button" onClick={aoVoltar} aria-label="Voltar pras conversas" className={ICONE}>
            <ChevronLeft aria-hidden="true" className="h-5 w-5" />
          </button>
        )}
        <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-line-200 text-13 font-bold text-volt-950">{iniciais(conversa.username, conversa.nome)}</span>
        <div className="min-w-0 flex-1">
          <h2 ref={titulo} tabIndex={-1} className="truncate text-15 font-semibold text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500">{quem}</h2>
          <p className="truncate text-12 text-slate-600">
            {conversa.situacao === "waiting" ? "Aguardando você" : conversa.situacao === "open" ? "Aberta" : "Resolvida"}
            {conversa.pedido && " · pedido de mensagem"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 text-13 text-slate-600 sm:inline-flex">
            {fio.pausadoAte ? "Robô pausado nesta conversa" : "Robô ligado nesta conversa"}
            {!fio.pausadoAte && <button type="button" disabled={agindo} onClick={() => void agir("pausar")} className="min-h-11 text-cobalt-500 disabled:opacity-50 lg:min-h-9">Pausar</button>}
          </span>
          {conversa.situacao !== "resolved" && (
            <button type="button" disabled={agindo} onClick={() => void agir("resolver")} className={BOTAO}>
              <Check aria-hidden="true" className="h-4 w-4" />
              Resolver
            </button>
          )}
          {aoAbrirFicha && (
            <button ref={refBotaoFicha} type="button" onClick={aoAbrirFicha} aria-label={`Ficha de ${quem}`} className={ICONE}>
              <UserRound aria-hidden="true" className="h-5 w-5" />
            </button>
          )}
        </div>
        {!fio.pausadoAte && (
          <button type="button" disabled={agindo} onClick={() => void agir("pausar")} className="min-h-11 basis-full text-left text-13 text-cobalt-500 disabled:opacity-50 sm:hidden">
            Robô ligado nesta conversa · Pausar
          </button>
        )}
        {erro && <p role="alert" className="basis-full text-13 text-danger-700">{erro}</p>}
      </header>

      <div ref={rolagem} role="log" aria-live="polite" aria-label={`Mensagens com ${quem}`} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {fio.carga === "carregando" && <span role="status" aria-label="Carregando mensagens" className="pn-skeleton block h-5 w-56 rounded-[var(--radius-chip)]" />}
        {fio.carga === "erro" && (
          <p role="alert" className="text-center text-13 text-slate-600">
            {fio.erroDaCarga ?? "Não deu pra carregar as mensagens."} <button type="button" onClick={fio.recarregar} className="min-h-11 text-cobalt-500 lg:min-h-0">Tentar de novo</button>
          </p>
        )}
        {fio.carga === "nao-achou" && <p role="alert" className="text-center text-13 text-slate-600">Esta conversa não existe mais.</p>}
        {fio.carga === "ok" && (
          <>
            {fio.proximo && (
              <div className="mb-3 text-center">
                <button type="button" onClick={() => void fio.maisAntigas()} disabled={fio.buscandoAntigas} className={BOTAO}>
                  {fio.buscandoAntigas ? "Carregando…" : "Ver mensagens anteriores"}
                </button>
              </div>
            )}
            {itens.length === 0 && <p className="text-center text-13 text-slate-600">Nenhuma mensagem nesta conversa ainda.</p>}
            <ul className="flex flex-col gap-3">
              {itens.map((i) => (i.tipo === "mensagem" ? <Bolha key={i.mensagem.id} conversaId={conversa.id} mensagem={i.mensagem} /> : <MarcaDoFioLinha key={i.chave} texto={i.texto} />))}
            </ul>
          </>
        )}
      </div>

      {fio.viuOk && <CampoDeResposta key={conversa.id} estado={campo} quem={quem} aoEnviar={fio.enviar} aoRetomar={() => agir("retomar")} />}
    </section>
  );
}
