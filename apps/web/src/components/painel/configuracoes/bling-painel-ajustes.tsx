// apps/web/src/components/painel/configuracoes/bling-painel-ajustes.tsx
"use client";

// React no escopo: o tsx do teste usa o runtime clássico de JSX (mesmo padrão de site-proprio-painel.tsx).
import React, { useRef, useState } from "react";

import { ChevronDown, Loader2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { CanaisForaDoMeta } from "./bling-painel-canais";
import { AJUDA, ANEL, BLOCO, CAMPO, PRIMARIO, SECUNDARIO, TITULO } from "./bling-painel-estilo";
import {
  campoDoValor,
  legendaDaSituacao,
  lerValorAlto,
  MENSAGEM_DO_VALOR,
  reaisCurtos,
  resumoDasSituacoes,
  resumoDoMeta,
  rotuloDoAutomatico,
  rotuloDoPixel,
  situacoesParaSalvar,
  type AjustesDoCartao,
  type Ocupado,
  type SituacoesParaSalvar,
} from "./bling-painel-texto";

/** Corpo do PATCH /api/integracoes/bling (spec §5): as situações só quando a dona mexeu nelas. */
export type AjustesParaSalvar = SituacoesParaSalvar & {
  high_value: number | null;
  meta_enabled: boolean;
  meta_campaign_id: string | null;
  meta_skip_store_ids: number[];
};

const INTERRUPTOR =
  "relative h-7 w-12 shrink-0 cursor-pointer appearance-none rounded-full bg-line-200 transition-colors checked:bg-volt-950 disabled:cursor-not-allowed disabled:opacity-60 before:absolute before:left-[3px] before:top-[3px] before:h-[22px] before:w-[22px] before:rounded-full before:bg-paper-0 before:transition-transform checked:before:translate-x-5";

type PropsDoResumo = {
  ajustes: AjustesDoCartao;
  aberto: boolean;
  onAjustar: (aberto: boolean) => void;
};

/** O que está valendo hoje (mockup Importando) e o botão que abre o formulário logo abaixo. */
export function ResumoDosAjustes({ ajustes, aberto, onAjustar }: PropsDoResumo) {
  return (
    <div className={cn(BLOCO, "flex flex-wrap items-end justify-between gap-4")}>
      <dl className="grid min-w-0 flex-[1_1_560px] gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-13 text-slate-600">Conta como venda</dt>
          <dd className="mt-1 text-[14px] text-volt-950">{resumoDasSituacoes(ajustes.situacoes)}</dd>
        </div>
        <div>
          <dt className="text-13 text-slate-600">Valor alto</dt>
          <dd className="font-data mt-1 text-[14px] tabular-nums text-volt-950">
            {ajustes.high_value === null ? "desligado" : reaisCurtos(ajustes.high_value)}
          </dd>
        </div>
        <div>
          <dt className="text-13 text-slate-600">Meta</dt>
          <dd className="mt-1 text-[14px] tabular-nums text-volt-950">{resumoDoMeta(ajustes)}</dd>
        </div>
      </dl>
      <button
        type="button"
        onClick={() => onAjustar(!aberto)}
        aria-expanded={aberto}
        aria-controls={aberto ? "bling-ajustes" : undefined}
        className={cn(SECUNDARIO, ANEL)}
      >
        Ajustar
        <ChevronDown className={cn("h-4 w-4 transition-transform", aberto && "rotate-180")} aria-hidden="true" />
      </button>
    </div>
  );
}

type PropsDoFormulario = {
  ajustes: AjustesDoCartao;
  /** Qualquer ação em curso trava o formulário: um clique por vez no cartão. */
  ocupado: Ocupado;
  /** Recusa do PATCH (a mensagem do 400 da rota). */
  erro: string | null;
  onSalvar: (ajustes: AjustesParaSalvar) => void;
  onCancelar: () => void;
  onDesconectar: () => void;
};

/**
 * Ajustes do Bling (mockup Ajustes). O rascunho vive aqui e nasce do que está salvo a
 * cada abertura: fechar sem salvar descarta.
 */
export function FormularioDeAjustes({ ajustes, ocupado, erro, onSalvar, onCancelar, onDesconectar }: PropsDoFormulario) {
  // A lista de situações e a versão dela ficam as da abertura: a recarga de fundo do cartão (histórico importando) não
  // mexe no formulário aberto, e o Salvar vai com a versão vista — se a lista mudou no meio, o PATCH responde 409.
  // Os canais também: um canal que chega com o formulário aberto aparece na próxima abertura.
  const [vistas] = useState(() => ({
    situacoes: ajustes.situacoes,
    situacoes_versao: ajustes.situacoes_versao,
    canais: ajustes.canais,
  }));
  const [marcadas, setMarcadas] = useState<ReadonlySet<number>>(
    () => new Set(vistas.situacoes.filter((s) => s.conta).map((s) => s.id)),
  );
  const [valor, setValor] = useState(() => campoDoValor(ajustes.high_value));
  const [meta, setMeta] = useState(ajustes.meta_enabled);
  const [pixel, setPixel] = useState(ajustes.pixel.escolhido ?? "");
  const [fora, setFora] = useState<ReadonlySet<number>>(
    () => new Set(vistas.canais.filter((c) => c.fora_do_meta).map((c) => c.id)),
  );
  const [valorInvalido, setValorInvalido] = useState(false);
  const campoDoValorAlto = useRef<HTMLInputElement>(null);
  const travado = ocupado !== null;

  const alternar = (id: number) => setMarcadas((atual) => comOuSem(atual, id));
  const alternarCanal = (id: number) => setFora((atual) => comOuSem(atual, id));

  function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const lido = lerValorAlto(valor);
    setValorInvalido(!lido.ok);
    if (!lido.ok) {
      campoDoValorAlto.current?.focus();
      return;
    }
    onSalvar({
      ...situacoesParaSalvar(vistas, marcadas),
      high_value: lido.valor,
      meta_enabled: meta,
      meta_campaign_id: pixel || null,
      meta_skip_store_ids: [...fora].sort((x, y) => x - y),
    });
  }

  const { opcoes } = ajustes.pixel;
  return (
    <form id="bling-ajustes" onSubmit={salvar} className={BLOCO} aria-labelledby="bling-ajustes-titulo" noValidate>
      <h3 id="bling-ajustes-titulo" className={TITULO}>
        Ajustes
      </h3>
      <fieldset className="mt-4 min-w-0">
        <legend className="text-15 font-semibold text-volt-950">O que conta como venda</legend>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 sm:gap-x-6">
          {vistas.situacoes.map((s) => (
            <li
              key={s.id}
              className={cn(
                "relative flex min-h-[58px] items-start gap-3 rounded-[var(--radius-control)] border border-line-200 px-3 py-2",
                s.bloqueada ? "bg-canvas-100" : "bg-paper-0",
              )}
            >
              <input
                id={`bling-situacao-${s.id}`}
                type="checkbox"
                checked={!s.bloqueada && marcadas.has(s.id)}
                disabled={s.bloqueada || travado}
                onChange={() => alternar(s.id)}
                aria-describedby={`bling-situacao-${s.id}-legenda`}
                className={cn("mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-volt-950 disabled:cursor-not-allowed", ANEL)}
              />
              <span className="min-w-0">
                {/* O `after` estica o rótulo sobre o cartão inteiro (clicável como no mockup) sem pôr a legenda no nome. */}
                <label
                  htmlFor={`bling-situacao-${s.id}`}
                  className={cn(
                    "block text-[14px] after:absolute after:inset-0",
                    s.bloqueada ? "text-slate-600" : "cursor-pointer text-volt-950",
                  )}
                >
                  {s.nome}
                </label>
                <span id={`bling-situacao-${s.id}-legenda`} className="block text-13 text-slate-600">
                  {legendaDaSituacao(s, vistas.situacoes)}
                </span>
              </span>
            </li>
          ))}
        </ul>
        <p className={AJUDA}>Pedido que ainda não conta como venda entra em Leads qualificados até virar venda.</p>
      </fieldset>

      <div className={cn(BLOCO, "grid gap-8 lg:grid-cols-2")}>
        <div className="space-y-2">
          <label htmlFor="bling-valor-alto" className="block text-15 font-semibold text-volt-950">
            Valor alto<span className="sr-only"> em reais</span>
          </label>
          <div className="flex h-11 w-60 items-center rounded-[var(--radius-control)] border border-slate-600/70 bg-paper-0 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cobalt-500">
            <span aria-hidden="true" className="font-data pl-3 text-15 text-slate-600">
              R$
            </span>
            <input
              ref={campoDoValorAlto}
              id="bling-valor-alto"
              type="text"
              inputMode="decimal"
              autoComplete="off"
              value={valor}
              disabled={travado}
              onChange={(e) => setValor(e.target.value)}
              aria-invalid={valorInvalido || undefined}
              aria-describedby={valorInvalido ? "bling-valor-alto-ajuda bling-valor-alto-erro" : "bling-valor-alto-ajuda"}
              className="font-data h-10 min-w-0 flex-1 bg-transparent px-1.5 text-15 tabular-nums text-volt-950 outline-none"
            />
          </div>
          <p id="bling-valor-alto-ajuda" className="text-13 text-slate-600">
            Cliente com pelo menos uma venda a partir desse valor vai para a lista Alto valor. Vazio desliga a lista.
          </p>
          {valorInvalido && (
            <p id="bling-valor-alto-erro" role="alert" className="text-13 text-danger-700">
              {MENSAGEM_DO_VALOR}
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex min-h-11 items-center justify-between gap-4">
            <label htmlFor="bling-meta" className="text-15 font-semibold text-volt-950">
              Enviar ao Meta
            </label>
            <input
              id="bling-meta"
              type="checkbox"
              role="switch"
              checked={meta}
              disabled={travado}
              onChange={(e) => setMeta(e.target.checked)}
              className={cn(INTERRUPTOR, ANEL)}
            />
          </div>
          {opcoes.length === 0 ? (
            <p className="text-13 text-slate-600">
              Nenhuma campanha tem o pixel e o token do Meta. Configure numa campanha (Editar › Integrações) para as
              vendas irem ao Meta.
            </p>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="bling-pixel" className="block text-13 font-semibold text-volt-950">
                Pixel
              </label>
              <select
                id="bling-pixel"
                value={pixel}
                disabled={travado}
                onChange={(e) => setPixel(e.target.value)}
                className={cn(CAMPO, "w-full", ANEL)}
              >
                <option value="">{rotuloDoAutomatico(opcoes)}</option>
                {opcoes.map((o) => (
                  <option key={o.campaign_id} value={o.campaign_id}>
                    {rotuloDoPixel(o)}
                  </option>
                ))}
              </select>
            </div>
          )}
          <p className="flex items-start gap-2.5 rounded-[var(--radius-control)] bg-canvas-100 p-3 text-13 text-volt-950">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" aria-hidden="true" />
            Telefone, e-mail, nome, nascimento e endereço vão criptografados (SHA-256): o Meta compara, não lê.
          </p>
        </div>
      </div>

      <CanaisForaDoMeta canais={vistas.canais} fora={fora} travado={travado} onAlternar={alternarCanal} />

      {erro && (
        <p role="alert" className="mt-5 text-13 text-danger-700">
          {erro}
        </p>
      )}
      <div className={cn(BLOCO, "flex flex-wrap items-center gap-3")}>
        <button type="submit" disabled={travado} className={cn(PRIMARIO, ANEL)}>
          {ocupado === "salvar" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Salvar ajustes
        </button>
        <button type="button" onClick={onCancelar} disabled={travado} className={cn(SECUNDARIO, ANEL)}>
          Cancelar
        </button>
      </div>

      <div className={cn(BLOCO, "flex flex-wrap items-center gap-x-3 gap-y-1")}>
        <button
          type="button"
          onClick={onDesconectar}
          disabled={travado}
          className={cn(
            "-ml-3 inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] px-3 text-15 font-semibold text-danger-700 transition-colors hover:bg-danger-700/10 disabled:cursor-not-allowed disabled:opacity-60",
            ANEL,
          )}
        >
          {ocupado === "desconectar" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Desconectar Bling
        </button>
        <p className="text-13 text-slate-600">Para de receber vendas e apaga o acesso. As vendas já importadas ficam.</p>
      </div>
    </form>
  );
}

/** Uma cópia do conjunto com o id trocado: marcado sai, desmarcado entra. */
function comOuSem(atual: ReadonlySet<number>, id: number): ReadonlySet<number> {
  const novo = new Set(atual);
  if (novo.has(id)) novo.delete(id);
  else novo.add(id);
  return novo;
}
