// apps/web/src/components/painel/resultados/anuncios/dialogo-de-gasto.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";

import { Folha } from "@/components/painel/folha";
import type { Carga } from "@/lib/painel/types";
import { custo } from "@/lib/resultados/anuncios-tela";
import {
  formularioDe,
  formularioNovo,
  lerFormulario,
  mensagemDeFalha,
  pedidoDoGasto,
  periodoDoLancamento,
  textoDoRodape,
  valorLido,
  type CorpoDoGasto,
  type FormularioDeGasto,
  type LancamentoDeGasto,
  type OperacaoDeGasto,
  type RespostaDoGasto,
} from "@/lib/resultados/gasto-de-anuncio";
import type { Periodo } from "@/lib/resultados/periodo-anuncios";
import { cn } from "@/lib/utils";

const BOTAO =
  "inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-200 bg-paper-0 px-3.5 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const CAMPO =
  "min-h-11 w-full rounded-lg border border-line-200 bg-paper-0 px-3 text-[16px] text-volt-950 focus-visible:outline-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const PRIMARIO =
  "min-h-11 rounded-[var(--radius-control)] bg-cobalt-500 px-4 text-15 font-semibold text-paper-0 transition-[filter] hover:brightness-95 disabled:opacity-60";
const SECUNDARIO =
  "min-h-11 rounded-[var(--radius-control)] border border-line-200 px-4 text-15 font-semibold text-volt-950 transition-colors hover:bg-canvas-100";
const NA_LINHA = "min-h-9 rounded-md px-2.5 text-13 font-semibold";

/** Destino do foco quando a confirmação de exclusão é cancelada. */
const idDoExcluir = (id: string) => `gasto-excluir-${id}`;

/** Cabeçalho da aba (encaixe `acoesDoCabecalho` do PR 5b). */
export function BotaoLancarGasto({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-haspopup="dialog" className={BOTAO}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 5v14M5 12h14" />
      </svg>
      Lançar gasto
    </button>
  );
}

/** Rodapé do cartão "Gasto lançado" (encaixe `rodapeDoGasto`): "3 lançamentos · lançar". */
export function RodapeDoGasto({ quantos, onLancar }: { quantos: number; onLancar: () => void }) {
  return (
    <>
      {`${textoDoRodape(quantos)} · `}
      <button
        type="button"
        onClick={onLancar}
        aria-haspopup="dialog"
        className="font-semibold text-cobalt-500 underline-offset-2 hover:underline"
      >
        lançar
      </button>
    </>
  );
}

export type PropsDoConteudo = {
  carga: Carga;
  resposta: RespostaDoGasto | null;
  form: FormularioDeGasto;
  /** id do lançamento em edição; `null` = lançamento novo. */
  editando: string | null;
  /** id do lançamento pedindo confirmação de exclusão. */
  excluindo: string | null;
  salvando: boolean;
  erro: string | null;
  onCampo: (campo: keyof FormularioDeGasto, valor: string) => void;
  onSalvar: () => void;
  onCancelarEdicao: () => void;
  onEditar: (lancamento: LancamentoDeGasto) => void;
  onPedirExclusao: (id: string | null) => void;
  onExcluir: (id: string) => void;
  onFechar: () => void;
  aoTentarDeNovo: () => void;
};

/**
 * O miolo do diálogo (mockup Gasto): formulário em cima, lançamentos embaixo. Só
 * desenha. Erro nunca vira lista vazia (padrão `carga` da Vitrine); recarregar
 * depois de salvar mantém a lista anterior na tela até a nova chegar.
 */
export function ConteudoDoGasto(p: PropsDoConteudo) {
  return (
    <div className="space-y-5 pb-2">
      <p className="text-13 text-slate-600">
        Copie do Gerenciador de Anúncios a coluna “Valor usado” da campanha, no mesmo período.
      </p>
      {p.carga === "erro" ? (
        <div className="rounded-lg bg-canvas-100 px-3 py-3">
          <p className="text-15 text-volt-950">Não deu para carregar os lançamentos.</p>
          <button type="button" onClick={p.aoTentarDeNovo} className={cn(SECUNDARIO, "mt-2")}>
            Tentar de novo
          </button>
        </div>
      ) : p.resposta === null ? (
        <p role="status" className="text-13 text-slate-600">
          Carregando os lançamentos…
        </p>
      ) : (
        <>
          <Formulario {...p} campanhas={p.resposta.campanhas} />
          <Lancamentos {...p} lancamentos={p.resposta.lancamentos} />
        </>
      )}
    </div>
  );
}

function Formulario(p: PropsDoConteudo & { campanhas: readonly string[] }) {
  const semCampanha = p.campanhas.length === 0;
  const lido = valorLido(p.form.valor);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        p.onSalvar();
      }}
      className="flex flex-col gap-3.5"
    >
      <div className="flex flex-col gap-1.5">
        {semCampanha ? (
          <>
            <p className={ROTULO}>Campanha</p>
            <p className="text-13 text-slate-600">
              Nenhum nome de campanha chegou nos cadastros ainda. Lance o gasto quando o primeiro cadastro de anúncio
              chegar.
            </p>
          </>
        ) : (
          <>
            <label htmlFor="gasto-campanha" className={ROTULO}>
              Campanha
            </label>
            <select
              id="gasto-campanha"
              value={p.form.campanha}
              onChange={(e) => p.onCampo("campanha", e.target.value)}
              className={CAMPO}
            >
              <option value="">Escolha a campanha…</option>
              {p.campanhas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="text-13 text-slate-600">A lista vem dos nomes de campanha que já chegaram nos cadastros.</span>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="gasto-valor" className={ROTULO}>
            Valor usado
          </label>
          <input
            id="gasto-valor"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="1.620,00"
            value={p.form.valor}
            onChange={(e) => p.onCampo("valor", e.target.value)}
            aria-describedby="gasto-valor-lido"
            className={cn(CAMPO, "font-data tabular-nums")}
          />
          <span id="gasto-valor-lido" aria-live="polite" className="font-data text-13 text-slate-600">
            {lido ?? ""}
          </span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="gasto-de" className={ROTULO}>
            De
          </label>
          <input id="gasto-de" type="date" value={p.form.de} onChange={(e) => p.onCampo("de", e.target.value)} className={CAMPO} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="gasto-ate" className={ROTULO}>
            Até
          </label>
          <input id="gasto-ate" type="date" value={p.form.ate} onChange={(e) => p.onCampo("ate", e.target.value)} className={CAMPO} />
        </div>
      </div>

      <p className="rounded-lg bg-canvas-100 px-3 py-2.5 text-13 text-slate-600">
        Se o período escolhido nos Resultados pegar só parte deste lançamento, entra a parte proporcional aos dias.
      </p>

      {p.erro && (
        <p role="alert" className="text-13 text-danger-700">
          {p.erro}
        </p>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={p.editando ? p.onCancelarEdicao : p.onFechar} className={SECUNDARIO}>
          {p.editando ? "Cancelar edição" : "Cancelar"}
        </button>
        <button type="submit" disabled={p.salvando || semCampanha} className={PRIMARIO}>
          {p.salvando ? "Salvando…" : p.editando ? "Salvar alteração" : "Salvar gasto"}
        </button>
      </div>
    </form>
  );
}

function Lancamentos(p: PropsDoConteudo & { lancamentos: readonly LancamentoDeGasto[] }) {
  return (
    <section aria-labelledby="gasto-lancamentos" className="border-t border-line-200 pt-4">
      <h3 id="gasto-lancamentos" tabIndex={-1} className="font-brand text-15 font-semibold text-volt-950 focus:outline-none">
        Lançamentos
      </h3>
      {p.lancamentos.length === 0 ? (
        <p className="mt-2 text-13 text-slate-600">Nenhum gasto lançado ainda.</p>
      ) : (
        <ul className="mt-1">
          {p.lancamentos.map((l) => {
            const qual = `${l.utm_campaign}, ${periodoDoLancamento(l)}`;
            return (
              <li key={l.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line-200 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-15 font-semibold text-volt-950">{l.utm_campaign}</span>
                  <span className="font-data text-13 text-slate-600">{periodoDoLancamento(l)}</span>
                </span>
                <span className="font-data text-15 tabular-nums text-volt-950">{custo(l.amount)}</span>
                {p.excluindo === l.id ? (
                  <>
                    <span className="text-13 text-volt-950">Excluir este lançamento?</span>
                    <button
                      type="button"
                      aria-label={`Excluir mesmo o gasto de ${qual}`}
                      onClick={() => p.onExcluir(l.id)}
                      disabled={p.salvando}
                      className={cn(NA_LINHA, "bg-danger-700 text-paper-0 disabled:opacity-60")}
                    >
                      Excluir
                    </button>
                    <button
                      type="button"
                      aria-label={`Manter o gasto de ${qual}`}
                      autoFocus
                      onClick={() => p.onPedirExclusao(null)}
                      className={cn(NA_LINHA, "border border-line-200 text-volt-950 hover:bg-canvas-100")}
                    >
                      Manter
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={`Editar gasto de ${qual}`}
                      onClick={() => p.onEditar(l)}
                      // Durante o envio: um salvar que termina chama `recomecar()` e apagaria a edição começada agora.
                      disabled={p.salvando}
                      className={cn(NA_LINHA, "border border-line-200 text-volt-950 hover:bg-canvas-100 disabled:opacity-60")}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      id={idDoExcluir(l.id)}
                      aria-label={`Excluir gasto de ${qual}`}
                      onClick={() => p.onPedirExclusao(l.id)}
                      className={cn(NA_LINHA, "text-danger-700 hover:bg-canvas-100")}
                    >
                      Excluir
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export type PropsDoDialogo = {
  carga: Carga;
  resposta: RespostaDoGasto | null;
  /** Período que a aba mostra: as datas do lançamento novo nascem nele. */
  periodo: Periodo;
  aoFechar: () => void;
  /** Refaz `GET /api/anuncios/gasto`. */
  aoTentarDeNovo: () => void;
  /** Lançou, editou ou excluiu: a página recarrega a lista e o relatório (o gasto proporcional mudou). */
  aoMudar: () => void;
};

const FALHA_DE_REDE = "Sem conexão. Confira a internet e tente de novo.";

/**
 * "Lançar gasto de anúncio" (spec §4, mockup Gasto). Monta já aberto: a página
 * monta quando abre e desmonta quando fecha, então o formulário sempre começa
 * limpo, com as datas do período atual.
 */
export function DialogoDeGasto({ carga, resposta, periodo, aoFechar, aoTentarDeNovo, aoMudar }: PropsDoDialogo) {
  const [form, setForm] = useState<FormularioDeGasto>(() => formularioNovo(periodo));
  const [editando, setEditando] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function recomecar() {
    setForm(formularioNovo(periodo));
    setEditando(null);
    setErro(null);
  }

  // Cancelar a confirmação remove o "Manter" focado: o foco volta para o "Excluir" daquela linha.
  const voltarFocoPara = useRef<string | null>(null);
  useEffect(() => {
    if (excluindo !== null || voltarFocoPara.current === null) return;
    const alvo = document.getElementById(idDoExcluir(voltarFocoPara.current)) ?? document.getElementById("gasto-lancamentos");
    voltarFocoPara.current = null;
    alvo?.focus();
  }, [excluindo]);

  async function enviar(op: OperacaoDeGasto, corpo?: CorpoDoGasto): Promise<boolean> {
    const { url, method, body } = pedidoDoGasto(op, corpo);
    setSalvando(true);
    setErro(null);
    try {
      const r = await fetch(url, { method, body, headers: { "content-type": "application/json" } });
      if (r.ok) return true;
      // Corpo lido uma vez só: `{ error }` das nossas rotas, ou texto puro (403 de permissão e do guard de módulo).
      const texto = await r.text().catch(() => "");
      let json: unknown = null;
      try {
        json = JSON.parse(texto);
      } catch {
        // não é JSON: `mensagemDeFalha` olha o texto.
      }
      setErro(mensagemDeFalha(op, json, texto));
      return false;
    } catch {
      setErro(FALHA_DE_REDE);
      return false;
    } finally {
      setSalvando(false);
    }
  }

  async function salvar() {
    const lido = lerFormulario(form);
    if (!lido.ok) {
      setErro(lido.erro);
      return;
    }
    const ok = await enviar(editando ? { tipo: "editar", id: editando } : { tipo: "criar" }, lido.corpo);
    if (!ok) return;
    recomecar();
    aoMudar();
  }

  async function excluir(id: string) {
    const ok = await enviar({ tipo: "excluir", id });
    setExcluindo(null);
    // O botão clicado some com a linha (ou com a confirmação): sem isto o foco cai no
    // <body>, fora do diálogo. Vai para o título da lista, que é onde a mudança aparece.
    document.getElementById("gasto-lancamentos")?.focus();
    if (!ok) return;
    // Excluiu o que estava editando: salvar depois daria 404.
    if (editando === id) recomecar();
    aoMudar();
  }

  return (
    <Folha aberta aoFechar={aoFechar} titulo="Lançar gasto de anúncio" testId="anuncios-gasto" emQualquerLargura>
      <ConteudoDoGasto
        carga={carga}
        resposta={resposta}
        form={form}
        editando={editando}
        excluindo={excluindo}
        salvando={salvando}
        erro={erro}
        onCampo={(campo, valor) => setForm((f) => ({ ...f, [campo]: valor }))}
        onSalvar={() => void salvar()}
        onCancelarEdicao={recomecar}
        onEditar={(l) => {
          setForm(formularioDe(l));
          setEditando(l.id);
          setExcluindo(null);
          setErro(null);
          // O formulário fica em cima da lista: leva o foco para o valor, que é o que se corrige.
          document.getElementById("gasto-valor")?.focus();
        }}
        onPedirExclusao={(id) => {
          if (id === null) voltarFocoPara.current = excluindo;
          setExcluindo(id);
        }}
        onExcluir={(id) => void excluir(id)}
        onFechar={aoFechar}
        aoTentarDeNovo={aoTentarDeNovo}
      />
    </Folha>
  );
}
