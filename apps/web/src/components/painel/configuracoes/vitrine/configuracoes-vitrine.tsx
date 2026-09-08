"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { telefoneNaVitrine } from "@/lib/painel/conectar";
import { resumoDasPortas, type LeituraDasPortas, type Porta } from "@/lib/painel/configuracoes";
import { AbaEquipe, type PropsDaEquipe } from "./aba-equipe";
import { AbaPlano, type PropsDoPlano } from "./aba-plano";

const PORTAS: Porta[] = ["Conexão", "Equipe", "Notificações", "Plano", "Conta"];

export type PropsDosAvisos = {
  /** `null` enquanto a consulta não voltou: o interruptor vira esqueleto. */
  preferencias: Record<string, boolean> | null;
  itens: readonly { key: string; titulo: string; desc: string; aria: string }[];
  salvando: string | null;
  erro: string | null;
  onAlternar: (key: string, proximo: boolean) => void;
};

type Props = {
  porta: Porta;
  onPorta: (p: Porta) => void;
  leitura: LeituraDasPortas;
  conexao: { live: boolean; telefone: string | null; carga: "carregando" | "ok" | "erro" };
  equipe: PropsDaEquipe;
  avisos: PropsDosAvisos;
  plano: PropsDoPlano;
  conta: React.ReactNode;
};

/**
 * Configurações na Vitrine Aberta (spec 12.6).
 *
 * O que muda de verdade são as PORTAS: cada uma mostra o próprio estado antes
 * do clique ("Conexão · conectado", "Equipe · 2 pessoas"), como o "Mais" do
 * mobile já fazia. Quem abre a tela sabe onde precisa mexer sem abrir as cinco.
 *
 * Todo o estado continua na page: aqui só muda o desenho.
 */
export function ConfiguracoesVitrine({
  porta,
  onPorta,
  leitura,
  conexao,
  equipe,
  avisos,
  plano,
  conta,
}: Props) {
  const resumos = resumoDasPortas(leitura);

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 px-4 py-5 lg:px-8 lg:py-8">
      <header data-testid="configuracoes-cabecalho">
        <h1 className="font-brand text-28 font-bold tracking-[-0.4px] text-volt-950">Configurações</h1>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[200px_1fr]">
        {/* Bloco 2: as portas, com o dado de cada uma embaixo. */}
        <nav
          className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0"
          aria-label="Seções das configurações"
          data-testid="configuracoes-portas"
        >
          {/* `aria-current="true"`, não `"page"`: estas portas trocam a seção da
              MESMA página. `"page"` anunciaria a leitor de tela uma navegação
              que não acontece — quem troca de rota é o corredor, e é lá que
              `"page"` está certo. */}
          {PORTAS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => onPorta(p)}
              aria-current={porta === p ? "true" : undefined}
              className={cn(
                "shrink-0 border-l-[3px] px-3 py-2 text-left lg:w-full",
                porta === p
                  ? "border-acid-500 bg-porta-ativa"
                  : "border-transparent hover:bg-hover-ficha",
              )}
            >
              <span className="block text-[14px] text-volt-950">{p}</span>
              {/* `null` = a consulta daquela porta ainda não respondeu. Melhor
                  linha vazia do que afirmar um estado que não conhecemos. */}
              {resumos[p] && (
                <span className="font-data mt-0.5 block text-12 text-slate-600">{resumos[p]}</span>
              )}
            </button>
          ))}
        </nav>

        <div className="min-w-0">
          {porta === "Conexão" && <AbaConexao {...conexao} />}
          {porta === "Equipe" && <AbaEquipe {...equipe} />}
          {porta === "Notificações" && <AbaAvisos {...avisos} />}
          {porta === "Plano" && <AbaPlano {...plano} />}
          {porta === "Conta" && <section className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8">{conta}</section>}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** O cartão do número, no mesmo formato de `/painel/conectar`. */
function AbaConexao({
  live,
  telefone,
  carga,
}: {
  live: boolean;
  telefone: string | null;
  carga: "carregando" | "ok" | "erro";
}) {
  const numero = telefoneNaVitrine(telefone);
  const ok = carga === "ok";

  if (carga === "carregando") {
    return (
      <div
        className="pn-skeleton h-40 rounded-[var(--radius-control)]"
        data-testid="painel-skeleton"
        role="status"
        aria-label="Carregando a conexão"
      />
    );
  }

  return (
    <section className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8" data-testid="configuracoes-conexao">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="font-data flex items-center gap-3 text-[32px] leading-none tabular-nums text-volt-950">
          {ok && (
            <span
              className={cn("pn-ponto", live ? "pn-ponto--conectado" : "pn-ponto--desconectado")}
              aria-hidden="true"
            />
          )}
          {numero ?? (ok ? "Sem número" : "—")}
        </p>
        {/* Sem o `ok` da rota, "Desconectado" seria a mesma frase de quando o
            número cai de verdade — e `/api/session` engole a falha num catch. */}
        <span
          className={cn("pn-chip", ok ? (live ? "text-success-700" : "text-danger-700") : "text-slate-600")}
          data-testid="configuracoes-etiqueta"
        >
          {ok ? (live ? "Conectado" : "Desconectado") : "Sem resposta"}
        </span>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-4 border-t border-line-200 pt-5">
        <Link
          href="/painel/conectar"
          className="inline-flex h-10 items-center gap-2 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-4 text-[14px] text-volt-950"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {live ? "Gerenciar conexão" : "Conectar"}
        </Link>
        <p className="text-13 text-slate-600">
          Os dados dos seus grupos ficam só na sua conta (LGPD).
        </p>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */

/** Três linhas com interruptor. `pn-interruptor` já existe desde o PR 7. */
function AbaAvisos({ preferencias, itens, salvando, erro, onAlternar }: PropsDosAvisos) {
  return (
    <section className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8" data-testid="configuracoes-avisos">
      <ul>
        {itens.map((item) => {
          const ligado = preferencias?.[item.key];
          return (
            <li
              key={item.key}
              className="flex min-h-14 items-center justify-between gap-4 border-b border-line-200 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-[14px] text-volt-950">{item.titulo}</p>
                <p className="mt-0.5 text-13 text-slate-600">{item.desc}</p>
              </div>
              {ligado === undefined ? (
                // `aria-hidden`, e NÃO `role="status"`: este span está dentro do
                // `map` da lista, e as preferências chegam todas do mesmo fetch —
                // um status por linha faria o leitor anunciar a mesma espera uma
                // vez por item. O título e a descrição da linha já foram lidos.
                <span
                  className="pn-skeleton h-7 w-12 shrink-0 rounded-full"
                  data-testid="painel-skeleton"
                  aria-hidden="true"
                />
              ) : (
                <button
                  type="button"
                  role="switch"
                  aria-checked={ligado}
                  aria-label={item.aria}
                  disabled={salvando === item.key}
                  onClick={() => onAlternar(item.key, !ligado)}
                  className="pn-interruptor shrink-0"
                >
                  <span className="pn-interruptor__bolinha" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {erro && (
        <p role="alert" className="mt-3 text-13 text-danger-700">
          {erro}
        </p>
      )}
    </section>
  );
}
