import { tetoDoEixo, type Barra } from "@/lib/painel/campanha-visao";
import { cn } from "@/lib/utils";

type Props = {
  barras: Barra[];
  /** O que o gráfico diz, em uma frase: vira o nome acessível e a legenda. */
  resumo: string;
  /** Rótulo do eixo a cada N barras: 24 horas não cabem em 390 px. */
  rotuloACada?: number;
};

const pct = (valor: number, teto: number) => `${(valor / teto) * 100}%`;

/**
 * Colunas em HTML (não SVG): o texto do eixo fica em 12 px de verdade em
 * qualquer largura, em vez de encolher junto com o viewBox no celular.
 * A hora que ainda não chegou é um traço, nunca uma coluna zerada.
 */
export function GraficoDeBarras({ barras, resumo, rotuloACada = 1 }: Props) {
  const teto = tetoDoEixo(Math.max(0, ...barras.map((b) => b.valor)));
  const pico = barras.reduce((m, b, i) => (b.valor > barras[m].valor ? i : m), 0);
  const atual = barras.findIndex((b) => b.atual);
  const mostraRotulo = (i: number) =>
    i === atual || (i % rotuloACada === 0 && (atual < 0 || Math.abs(i - atual) > 1));

  return (
    <figure className="m-0">
      <div className="flex gap-2">
        <div aria-hidden="true" className="relative h-44 w-7 shrink-0 text-right text-12 tabular-nums leading-none text-slate-600">
          {/* O meio só ganha número quando é inteiro: "2,5 pessoas" não existe. */}
          {[teto, teto / 2, 0].map((m, i) =>
            Number.isInteger(m) ? (
              <span key={m} className="absolute right-0 -translate-y-1/2" style={{ top: `${i * 50}%` }}>
                {m.toLocaleString("pt-BR")}
              </span>
            ) : null,
          )}
        </div>
        <div className="relative h-44 min-w-0 flex-1">
          <div aria-hidden="true" className="absolute inset-0 flex flex-col justify-between">
            <span className="block border-t border-line-200" />
            <span className="block border-t border-line-200" />
            <span className="block border-t border-slate-600/50" />
          </div>
          <ol role="img" aria-label={resumo} className="absolute inset-0 flex items-end gap-[3px]">
            {barras.map((b, i) => (
              <li key={b.chave} title={`${b.rotuloLongo}: ${b.valor}`} className="relative flex h-full min-w-0 flex-1 items-end">
                {b.futuro ? (
                  <span className="block h-0.5 w-full rounded-full bg-line-200" />
                ) : (
                  <span
                    className={cn("block w-full rounded-t-[2px] bg-serie", b.atual && "opacity-60")}
                    style={{ height: pct(b.valor, teto), minHeight: b.valor > 0 ? 2 : 0 }}
                  />
                )}
                {i === pico && b.valor > 0 && (
                  <span
                    className="absolute inset-x-0 text-center text-12 font-semibold tabular-nums text-volt-950"
                    style={{ bottom: `calc(${pct(b.valor, teto)} + 4px)` }}
                  >
                    {b.valor}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
      </div>
      <ol aria-hidden="true" className="ml-9 mt-2 flex h-4 gap-[3px] text-12 text-slate-600">
        {barras.map((b, i) => (
          <li key={b.chave} className="relative min-w-0 flex-1">
            {mostraRotulo(i) && (
              <span className={cn("absolute left-1/2 -translate-x-1/2 whitespace-nowrap", b.atual && "font-semibold text-volt-950")}>
                {b.rotulo}
              </span>
            )}
          </li>
        ))}
      </ol>
    </figure>
  );
}
