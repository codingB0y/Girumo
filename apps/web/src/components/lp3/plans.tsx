"use client";

import { useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import {
  PLANOS_ANCORA,
  PLANS,
  SIGNUP_URL,
  type Plan,
} from "@/components/lp3/landing-data";

/* Planos com ciclo de cobrança. O ANUAL abre por padrão de propósito: ancora o
   preço baixo e faz o mensal parecer caro — quem troca pra "Mensal" vê na hora
   quanto deixa na mesa por ano. Nenhum gatilho aqui é inventado: desconto,
   economia e garantia são reais e conferíveis (sem contador falso, sem "últimas
   vagas"). */

type Cycle = "anual" | "mensal";

const GROWTH = PLANS.find((p) => p.featured) ?? PLANS[1];
const OUTROS_PLANOS = PLANS.filter((p) => !p.featured);

const MAX_OFF = Math.max(
  ...PLANS.map((p) => Math.round((1 - p.annualPrice / p.price) * 100)),
);

function brl(n: number): string {
  return n.toLocaleString("pt-BR");
}

/** Quanto o plano economiza por ano no ciclo anual, em R$. */
function economiaAno(p: Plan): number {
  return (p.price - p.annualPrice) * 12;
}

/** Escada de ancoragem: o plano mais barato cujo MENSAL custa o anual deste. */
function escadaDe(p: Plan): Plan | undefined {
  return PLANS.find((o) => o.name !== p.name && o.price === p.annualPrice);
}

function CycleToggle({
  cycle,
  onCycle,
  className = "",
}: {
  cycle: Cycle;
  onCycle: (c: Cycle) => void;
  className?: string;
}) {
  const base =
    "rounded-full px-4 py-2 text-xs font-semibold transition-colors duration-300 md:px-5 md:text-sm";
  return (
    <div
      role="group"
      aria-label="Ciclo de cobrança"
      className={`inline-flex items-center gap-1 rounded-full border border-[var(--line)] bg-[var(--bg-2)] p-1 ${className}`}
    >
      <button
        type="button"
        aria-pressed={cycle === "mensal"}
        onClick={() => onCycle("mensal")}
        className={`${base} ${
          cycle === "mensal"
            ? "bg-[var(--green)] text-[var(--ink)]"
            : "text-[var(--body)] hover:text-[var(--display)]"
        }`}
      >
        Mensal
      </button>
      <button
        type="button"
        aria-pressed={cycle === "anual"}
        onClick={() => onCycle("anual")}
        className={`${base} inline-flex items-center gap-2 ${
          cycle === "anual"
            ? "bg-[var(--green)] text-[var(--ink)]"
            : "text-[var(--body)] hover:text-[var(--display)]"
        }`}
      >
        Anual
        <span
          className={`lp4-mono rounded-full px-2 py-0.5 text-[8px] font-semibold ${
            cycle === "anual"
              ? "bg-[var(--ink)] text-[var(--green)]"
              : "bg-[rgba(167,255,47,0.14)] text-[var(--green)]"
          }`}
        >
          até {MAX_OFF}% off
        </span>
      </button>
    </div>
  );
}

/** Selo de economia — só aparece no anual, com número conferível. */
function EconomiaBadge({ plan, className = "" }: { plan: Plan; className?: string }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full border border-[rgba(167,255,47,0.4)] bg-[rgba(96,142,20,0.12)] px-3 py-1 text-[11px] font-semibold text-[var(--green)] ${className}`}
    >
      economize R$ {brl(economiaAno(plan))}/ano
    </span>
  );
}

export function DesktopPlans() {
  const [cycle, setCycle] = useState<Cycle>("anual");
  const anual = cycle === "anual";

  return (
    <section className="border-t border-[var(--line)] pb-14 pt-40">
      <div className="mx-auto max-w-6xl px-5">
        <div data-lp4-r className="mx-auto max-w-2xl text-center">
          <h2 className="lp4-x text-[clamp(2rem,4.4vw,3.5rem)]">
            Menos que uma grade <span className="text-[var(--body)]">por mês.</span>
          </h2>
          <p className="mt-5 text-lg text-[var(--body)]">{PLANOS_ANCORA}</p>
        </div>

        <div className="mt-10 flex justify-center">
          <CycleToggle cycle={cycle} onCycle={setCycle} />
        </div>

        <div className="mt-12 grid items-stretch gap-5 md:grid-cols-3">
          {PLANS.map((p) => {
            const escada = escadaDe(p);
            return (
              <article
                key={p.name}
                data-lp4-w
                className={`relative flex flex-col rounded-3xl border p-8 transition-[border-color,box-shadow] duration-500 ${
                  p.featured
                    ? "border-[rgba(167,255,47,0.5)] bg-[var(--bg-2)] shadow-[0_40px_110px_-45px_rgba(167,255,47,0.4)] md:-my-3 md:py-11"
                    : "border-[var(--line)] hover:border-[rgba(167,255,47,0.32)] hover:shadow-[0_34px_90px_-52px_rgba(167,255,47,0.35)]"
                }`}
              >
                {p.featured && (
                  <span className="lp4-mono absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-[var(--green)] px-4 py-1.5 text-[8px] font-semibold text-[var(--ink)]">
                    mais escolhido
                  </span>
                )}
                <h3 className="lp4-x text-2xl">{p.name}</h3>
                <p className="mt-1.5 text-sm text-[var(--body)]">{p.who}</p>

                {anual ? (
                  <div className="mt-7">
                    <p className="lp4-mono text-[10px] text-[var(--body)]">
                      de <s className="opacity-80">R$ {p.price}</s> no mensal por
                    </p>
                    <p className="mt-1 flex items-baseline gap-1.5">
                      <span className="lp4-mono text-[10px] text-[var(--body)]">R$</span>
                      <span className="lp4-x text-6xl">{p.annualPrice}</span>
                      <span className="lp4-mono text-[10px] text-[var(--body)]">/mês no anual</span>
                    </p>
                    <EconomiaBadge plan={p} className="mt-3" />
                    {escada && (
                      <p className="mt-2.5 text-[13px] font-medium text-[var(--display)]">
                        O {p.name} inteiro pelo preço do {escada.name} no mensal.
                      </p>
                    )}
                    <p className="lp4-mono mt-2.5 text-[9px] text-[var(--body)]">
                      R$ {brl(p.annualPrice * 12)} cobrados 1x ao ano · garantia de 30 dias
                    </p>
                  </div>
                ) : (
                  <div className="mt-7">
                    <p className="flex items-baseline gap-1.5">
                      <span className="lp4-mono text-[10px] text-[var(--body)]">R$</span>
                      <span className="lp4-x text-6xl">{p.price}</span>
                      <span className="lp4-mono text-[10px] text-[var(--body)]">/mês</span>
                    </p>
                    <p className="mt-3 text-[13px] leading-snug text-[var(--body)]">
                      No anual sai por{" "}
                      <span className="font-semibold text-[var(--green)]">
                        R$ {p.annualPrice}/mês
                      </span>{" "}
                      — ficar no mensal custa R$ {brl(economiaAno(p))} a mais por ano.
                    </p>
                  </div>
                )}

                <ul className="mt-8 flex-1 space-y-3 border-t border-[var(--line)] pt-7">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm leading-snug">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[var(--green)]" aria-hidden />
                      {f}
                    </li>
                  ))}
                </ul>
                <a
                  href={SIGNUP_URL}
                  className={`lp4-btn mt-8 justify-center text-sm ${p.featured ? "lp4-btn-green" : "lp4-btn-ghost"}`}
                >
                  Começar com {p.name}
                </a>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function MobilePlans() {
  const [cycle, setCycle] = useState<Cycle>("anual");
  const anual = cycle === "anual";
  const growthPrice = anual ? GROWTH.annualPrice : GROWTH.price;

  return (
    <section className="border-t border-[var(--line)] px-5 pb-8 pt-12">
      <h2 data-lp4-r className="lp4-x text-[32px] leading-[1.02]">
        Menos que uma grade <span className="text-[var(--body)]">por mês.</span>
      </h2>
      <p data-lp4-r className="mt-3 text-[13px] leading-[1.55] text-[var(--body)]">
        Postar na mão custa 2h por dia, link morto e venda sem origem. O Growth custa R${" "}
        {growthPrice}
        {anual ? "/mês no anual" : "/mês"} — e faz tudo sozinho.
      </p>

      <div className="mt-4">
        <CycleToggle cycle={cycle} onCycle={setCycle} />
      </div>

      <article
        data-lp4-w
        className="relative mt-6 rounded-[20px] border border-[rgba(167,255,47,0.5)] bg-[var(--bg-2)] p-6 shadow-[0_30px_90px_-40px_rgba(167,255,47,0.4)]"
      >
        <span className="lp4-mono absolute -top-2.5 left-5 rounded-full bg-[var(--green)] px-3 py-[5px] text-[7px] font-semibold text-[var(--ink)]">
          mais escolhido
        </span>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="lp4-x text-xl">{GROWTH.name}</h3>
          <div className="shrink-0 text-right">
            {anual && (
              <p className="lp4-mono text-[9px] text-[var(--body)]">
                de <s className="opacity-80">R$ {GROWTH.price}</s> por
              </p>
            )}
            <p className="flex items-baseline justify-end gap-1 whitespace-nowrap">
              <span className="lp4-mono text-[9px] text-[var(--body)]">R$</span>
              <span className="lp4-x text-[38px]">{growthPrice}</span>
              <span className="lp4-mono text-[9px] text-[var(--body)]">/mês</span>
            </p>
          </div>
        </div>
        {anual ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <EconomiaBadge plan={GROWTH} />
            <span className="lp4-mono text-[8px] text-[var(--body)]">
              R$ {brl(GROWTH.annualPrice * 12)} 1x ao ano · garantia de 30 dias
            </span>
          </div>
        ) : (
          <p className="mt-2 text-[12px] leading-snug text-[var(--body)]">
            No anual sai por{" "}
            <span className="font-semibold text-[var(--green)]">R$ {GROWTH.annualPrice}/mês</span> —
            ficar no mensal custa R$ {brl(economiaAno(GROWTH))} a mais por ano.
          </p>
        )}
        <ul className="mt-4 flex flex-col gap-2.5 border-t border-[var(--line)] pt-4">
          {GROWTH.features.map((f) => (
            <li key={f} className="flex gap-2.5 text-[13px] leading-snug">
              <Check className="mt-0.5 h-[15px] w-[15px] shrink-0 text-[var(--green)]" aria-hidden />
              {f}
            </li>
          ))}
        </ul>
        <a
          href={SIGNUP_URL}
          className="lp4-btn lp4-btn-green mt-[18px] w-full justify-center py-[15px] text-sm"
        >
          Começar com {GROWTH.name} <ArrowRight className="h-[15px] w-[15px]" aria-hidden />
        </a>
      </article>

      <div className="mt-2.5 flex flex-col gap-2">
        {OUTROS_PLANOS.map((p) => (
          <a
            key={p.name}
            href={SIGNUP_URL}
            data-lp4-r
            className="flex items-center justify-between gap-3 rounded-[14px] border border-[var(--line)] px-4 py-3.5 transition-colors hover:border-[rgba(167,255,47,0.32)]"
          >
            <span>
              <span className="block text-sm font-bold">{p.name}</span>
              <span className="block text-[11px] text-[var(--body)]">{p.short}</span>
            </span>
            <span className="lp4-x shrink-0 whitespace-nowrap text-right text-lg">
              {anual && (
                <s className="lp4-mono mr-1.5 text-[10px] font-normal text-[var(--body)] opacity-80">
                  R$ {p.price}
                </s>
              )}
              R$ {anual ? p.annualPrice : p.price}
              <span className="text-[10px] text-[var(--body)]">/mês</span>
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
