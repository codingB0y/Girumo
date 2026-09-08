"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import { etiquetaDaOferta, noArHa } from "@/lib/painel/relampago";
import type { Group } from "@/lib/mock-data";

export type OfertaResumo = {
  id: string;
  name: string;
  keyword: string;
  slots: number;
  status: "draft" | "open" | "closed";
  opened_at: string | null;
};

export type NovaOferta = {
  name: string;
  keyword: string;
  slots: number;
  timerMinutes: number | null;
  groupIds: string[];
};

type Props = {
  ofertas: readonly OfertaResumo[];
  /** Só grupos administrados: sem admin não há mapa @lid -> telefone. */
  elegiveis: readonly Group[];
  carregando: boolean;
  abrindo: boolean;
  erro: string | null;
  aoAbrir: (dados: NovaOferta) => Promise<void>;
};

const TEMPOS = [5, 10, 15, 0];

/**
 * Lista de ofertas da Vitrine Aberta: cada oferta é uma etiqueta de peça
 * (componente 9.1), nunca em grade de três — a que está no ar fica em cima com
 * o chip Acid AO VIVO, um dos três usos de Acid em fundo (regra 10).
 */
export function RelampagoVitrine({ ofertas, elegiveis, carregando, abrindo, erro, aoAbrir }: Props) {
  const [form, setForm] = useState(false);
  const [nome, setNome] = useState("");
  const [palavra, setPalavra] = useState("EU QUERO");
  const [pecas, setPecas] = useState(10);
  const [minutos, setMinutos] = useState(10);
  const [alvos, setAlvos] = useState<string[]>([]);

  // Sem memo: `agora` muda a cada render e congelaria o "no ar há".
  const agora = new Date();
  const aberta = ofertas.find((o) => o.status === "open") ?? null;
  const demais = ofertas.filter((o) => o.status !== "open");
  const podeAbrir = nome.trim().length > 0 && pecas > 0 && alvos.length > 0 && !abrindo;

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 px-4 py-6 sm:px-8 lg:py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Oferta Relâmpago</h1>
          <p className="mt-1 text-15 text-slate-600">
            Quem comentou primeiro tem prioridade — e a fila decide, não a memória.
          </p>
          {erro && <p className="mt-2 text-13 text-alerta">{erro}</p>}
        </div>
        <button
          type="button"
          onClick={() => setForm((v) => !v)}
          aria-expanded={form}
          aria-controls="relampago-nova-oferta"
          className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-[14px] text-volt-950"
        >
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Nova oferta
        </button>
      </header>

      {form && (
        <section id="relampago-nova-oferta" className="pn-card space-y-4 rounded-[var(--radius-control)] p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-13 font-semibold text-slate-600">Nome da promoção</span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Novo kit — 5 peças"
                data-testid="relampago-nome"
                className="mt-1 h-12 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-[16px] text-volt-950 placeholder:text-slate-600"
              />
            </label>

            <label className="block">
              <span className="text-13 font-semibold text-slate-600">Palavra-chave</span>
              <input
                value={palavra}
                onChange={(e) => setPalavra(e.target.value)}
                className="font-data mt-1 h-12 w-full rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-3 text-[16px] text-volt-950"
              />
              <span className="mt-1 block text-12 text-slate-600">
                Acento, caixa e pontuação não importam. &ldquo;euquero&rdquo; junto não conta.
              </span>
            </label>

            <label className="block">
              <span className="text-13 font-semibold text-slate-600">Quantas peças</span>
              <input
                type="number"
                min={1}
                value={pecas}
                onChange={(e) => setPecas(Number(e.target.value))}
                className="font-data mt-1 h-12 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-[16px] tabular-nums text-volt-950"
              />
            </label>

            <fieldset>
              <legend className="text-13 font-semibold text-slate-600">Tempo por cliente</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {TEMPOS.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setMinutos(t)}
                    aria-pressed={minutos === t}
                    className={cn(
                      "h-11 rounded-[var(--radius-control)] border px-3 text-[14px]",
                      minutos === t
                        ? "border-volt-950 bg-volt-950 text-paper-0"
                        : "border-line-200 bg-paper-0 text-volt-950",
                    )}
                  >
                    {t === 0 ? "Sem tempo" : `${t} min`}
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <fieldset>
            <legend className="text-13 font-semibold text-slate-600">Grupos</legend>
            {elegiveis.length === 0 ? (
              <p className="mt-1 text-13 text-atencao">
                Nenhum grupo administrado. Sincronize os grupos em Grupos antes de abrir.
              </p>
            ) : (
              <div className="mt-1 flex flex-wrap gap-2">
                {elegiveis.map((g) => {
                  const marcado = alvos.includes(g.id);
                  return (
                    <button
                      key={g.id}
                      type="button"
                      aria-pressed={marcado}
                      onClick={() =>
                        setAlvos((atual) => (marcado ? atual.filter((x) => x !== g.id) : [...atual, g.id]))
                      }
                      className={cn(
                        "h-11 rounded-[var(--radius-control)] border px-3 text-[14px]",
                        marcado
                          ? "border-volt-950 bg-volt-950 text-paper-0"
                          : "border-line-200 bg-paper-0 text-volt-950",
                      )}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>

          <button
            type="button"
            disabled={!podeAbrir}
            onClick={() =>
              void aoAbrir({
                name: nome,
                keyword: palavra,
                slots: pecas,
                timerMinutes: minutos > 0 ? minutos : null,
                groupIds: alvos,
              })
            }
            className="inline-flex h-12 items-center rounded-[var(--radius-control)] bg-cobalt-500 px-5 text-15 font-semibold text-white disabled:opacity-50"
          >
            {abrindo ? "Abrindo…" : "Abrir oferta"}
          </button>
        </section>
      )}

      {carregando ? (
        <div
          className="pn-skeleton h-40 rounded-[var(--radius-control)]"
          data-testid="painel-skeleton"
          role="status"
          aria-label="Carregando as ofertas"
        />
      ) : ofertas.length === 0 ? (
        <p className="text-15 text-volt-950">
          Nenhuma oferta ainda.{" "}
          <span className="text-slate-600">Abra uma antes de postar a promoção no grupo.</span>
        </p>
      ) : (
        <ul className="space-y-3">
          {aberta && <Etiqueta oferta={aberta} agora={agora} />}
          {demais.map((o) => (
            <Etiqueta key={o.id} oferta={o} agora={agora} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Etiqueta({ oferta, agora }: { oferta: OfertaResumo; agora: Date }) {
  const noAr = oferta.status === "open";
  const tempo = noAr ? noArHa(oferta.opened_at, agora) : null;

  return (
    <li>
      <Link
        href={`/painel/relampago/${oferta.id}`}
        data-testid="relampago-etiqueta"
        className={cn("pn-etiqueta-preco block", !noAr && "pn-etiqueta-preco--fechada")}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={noAr ? "pn-chip pn-chip--acid" : "pn-chip pn-chip--line"}>
            {noAr ? "AO VIVO" : oferta.status === "closed" ? "FECHADA" : "RASCUNHO"}
          </span>
          {tempo && <span className="font-data text-12 tabular-nums text-slate-600">no ar há {tempo}</span>}
        </div>
        <p className="pn-etiqueta-preco__nome mt-2">{etiquetaDaOferta(oferta.name, oferta.slots)}</p>
        <p className="font-data mt-1 text-13 text-slate-600">
          Palavra-chave <span className="text-volt-950">{oferta.keyword}</span>
        </p>
      </Link>
    </li>
  );
}
