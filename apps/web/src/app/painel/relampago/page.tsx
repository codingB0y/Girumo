"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Flame, Plus } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Group } from "@/lib/mock-data";

type Offer = {
  id: string;
  name: string;
  keyword: string;
  slots: number;
  timer_seconds: number | null;
  status: "draft" | "open" | "closed";
  opened_at: string | null;
  created_at: string;
};

const STATUS: Record<Offer["status"], { label: string; pill: string }> = {
  open: { label: "Aberta", pill: "bg-sucesso/10 text-sucesso" },
  closed: { label: "Fechada", pill: "bg-poco text-aco/60" },
  draft: { label: "Rascunho", pill: "bg-atencao/10 text-atencao" },
};

/** Minutos, não segundos: quem abre a promoção pensa em minutos. */
const TIMERS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 0, label: "Sem timer" },
];

function descreveTimer(segundos: number | null): string {
  if (segundos == null) return "sem timer";
  return `${Math.round(segundos / 60)} min`;
}

export default function PainelRelampago() {
  const router = useRouter();
  const [offers, setOffers] = useState<Offer[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [form, setForm] = useState(false);

  const [nome, setNome] = useState("");
  const [palavra, setPalavra] = useState("EU QUERO");
  const [pecas, setPecas] = useState(10);
  const [timer, setTimer] = useState(10);
  const [alvos, setAlvos] = useState<string[]>([]);

  const carregar = useCallback(async () => {
    const [resOfertas, resGrupos] = await Promise.all([
      fetch("/api/relampago/offers", { cache: "no-store" }),
      fetch("/api/groups", { cache: "no-store" }),
    ]);
    const dadosOfertas = await resOfertas.json();
    const dadosGrupos = await resGrupos.json();
    setOffers(Array.isArray(dadosOfertas?.offers) ? dadosOfertas.offers : []);
    setGroups(Array.isArray(dadosGrupos) ? dadosGrupos : []);
  }, []);

  useEffect(() => {
    carregar()
      .catch(() => setErro("Nao foi possivel carregar as ofertas."))
      .finally(() => setLoading(false));
  }, [carregar]);

  /**
   * Só grupo que administramos. Num grupo sem admin a instância não vê os
   * participantes, então o mapa @lid -> telefone nasce vazio e a fila viria
   * inteira sem número — sem chance de chamar ninguém.
   */
  const elegiveis = useMemo(() => groups.filter((g) => g.isAdmin), [groups]);

  const aberta = offers.find((o) => o.status === "open") ?? null;
  const demais = offers.filter((o) => o.status !== "open");

  async function abrir() {
    setAbrindo(true);
    setErro(null);
    try {
      const res = await fetch("/api/relampago/offers", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: nome,
          keyword: palavra,
          slots: pecas,
          timerMinutes: timer > 0 ? timer : null,
          groupIds: alvos,
        }),
      });

      const dados = await res.json().catch(() => null);

      if (!res.ok) {
        // 409 é a recusa do índice único chegando na tela. Precisa dizer o que
        // fazer, não só que deu errado.
        setErro(dados?.error ?? "Nao foi possivel abrir a oferta.");
        return;
      }

      router.push(`/painel/relampago/${dados.offer.id}`);
    } catch {
      setErro("Nao foi possivel abrir a oferta.");
    } finally {
      setAbrindo(false);
    }
  }

  const podeAbrir = nome.trim().length > 0 && pecas > 0 && alvos.length > 0 && !abrindo;

  return (
    <div className="mx-auto max-w-[1200px] space-y-8 px-4 py-8 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-extrabold tracking-[-0.02em] text-volt-950">
            Oferta Relâmpago
          </h1>
          <p className="font-editorial mt-1 text-[19px] italic text-ardosia">
            Quem comentou primeiro tem prioridade — e a fila decide, não a memória.
          </p>
          {erro && <p className="mt-2 text-sm text-alerta">{erro}</p>}
        </div>
        <button
          type="button"
          onClick={() => setForm((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110"
        >
          <Plus className="h-4 w-4" />
          Nova oferta
        </button>
      </header>

      {form && (
        <section className="pn-card space-y-4 rounded-2xl p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">
                Nome da promoção
              </span>
              <input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Vestido midi — 10 peças"
                className="mt-1 w-full rounded-[10px] border border-volt-950/10 bg-poco px-3 py-2.5 text-sm text-volt-950 outline-none focus:border-cobalt-500/50 focus:bg-papel"
              />
            </label>

            <label className="block">
              <span className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">
                Palavra-chave
              </span>
              <input
                value={palavra}
                onChange={(e) => setPalavra(e.target.value)}
                className="mt-1 w-full rounded-[10px] border border-volt-950/10 bg-poco px-3 py-2.5 text-sm text-volt-950 outline-none focus:border-cobalt-500/50 focus:bg-papel"
              />
              <span className="mt-1 block text-xs text-aco/60">
                Acento, caixa e pontuação não importam. &quot;euquero&quot; junto não conta.
              </span>
            </label>

            <label className="block">
              <span className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">
                Quantas peças
              </span>
              <input
                type="number"
                min={1}
                value={pecas}
                onChange={(e) => setPecas(Number(e.target.value))}
                className="mt-1 w-full rounded-[10px] border border-volt-950/10 bg-poco px-3 py-2.5 text-sm text-volt-950 outline-none focus:border-cobalt-500/50 focus:bg-papel"
              />
            </label>

            <div>
              <span className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">
                Tempo por cliente
              </span>
              <div className="mt-1 flex flex-wrap gap-1 rounded-xl border border-volt-950/10 bg-papel p-1">
                {TIMERS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTimer(t.value)}
                    className={cn(
                      "cursor-pointer rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors duration-[160ms]",
                      timer === t.value
                        ? "bg-volt-950 text-white"
                        : "text-aco/70 hover:text-volt-950",
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <span className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50">
              Grupos
            </span>
            {elegiveis.length === 0 ? (
              <p className="mt-1 text-sm text-atencao">
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
                        setAlvos((atual) =>
                          marcado ? atual.filter((x) => x !== g.id) : [...atual, g.id],
                        )
                      }
                      className={cn(
                        "cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors duration-[160ms]",
                        marcado
                          ? "border-cobalt-500 bg-cobalt-500/10 text-cobalt-700"
                          : "border-volt-950/10 text-aco/70 hover:text-volt-950",
                      )}
                    >
                      {g.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={abrir}
            disabled={!podeAbrir}
            className="inline-flex items-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          >
            <Flame className="h-4 w-4" />
            {abrindo ? "Abrindo…" : "Abrir"}
          </button>
        </section>
      )}

      {loading ? (
        <div className="pn-skeleton h-40 rounded-2xl" />
      ) : (
        <>
          {aberta && (
            <Link
              href={`/painel/relampago/${aberta.id}`}
              className="pn-card block rounded-2xl bg-sucesso/[0.04] p-5 transition-transform duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS.open.pill)}>
                  Acontecendo agora
                </span>
                <span className="font-data text-[11px] tabular-nums text-aco/50">
                  {aberta.slots} peças · {descreveTimer(aberta.timer_seconds)}
                </span>
              </div>
              <p className="mt-2 font-display text-[20px] font-bold text-volt-950">{aberta.name}</p>
              <p className="mt-1 text-sm text-aco/70">
                Palavra-chave: <strong className="text-volt-950">{aberta.keyword}</strong>
              </p>
            </Link>
          )}

          {demais.length === 0 && !aberta ? (
            <p className="text-sm text-aco/60">
              Nenhuma oferta ainda. Abra uma antes de postar a promoção no grupo.
            </p>
          ) : (
            <div className="pn-card overflow-hidden rounded-2xl">
              <div className="hidden border-b border-volt-950/[0.06] bg-poco px-5 py-3 md:grid md:grid-cols-[2fr_1fr_0.8fr_0.8fr] md:gap-4">
                {["Oferta", "Palavra-chave", "Peças", "Status"].map((h) => (
                  <span
                    key={h}
                    className="font-data text-[10px] uppercase tracking-[0.08em] text-aco/50"
                  >
                    {h}
                  </span>
                ))}
              </div>
              <div className="divide-y divide-dashed divide-volt-950/[0.09]">
                {demais.map((o) => (
                  <Link
                    key={o.id}
                    href={`/painel/relampago/${o.id}`}
                    className="grid gap-1 px-5 py-4 transition-colors hover:bg-poco md:grid-cols-[2fr_1fr_0.8fr_0.8fr] md:items-center md:gap-4"
                  >
                    <span className="text-sm font-medium text-volt-950">{o.name}</span>
                    <span className="font-data text-sm text-aco/70">{o.keyword}</span>
                    <span className="font-data text-sm tabular-nums text-aco/70">{o.slots}</span>
                    <span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          STATUS[o.status].pill,
                        )}
                      >
                        {STATUS[o.status].label}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
