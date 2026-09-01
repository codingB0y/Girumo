"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ações em massa sobre os grupos que JÁ EXISTEM na campanha: foto, descrição e
 * abrir/fechar.
 *
 * O que o componente NÃO faz, e por quê:
 *
 * - **Não escolhe os grupos.** Ele nem conhece o UUID de `groups` (o `id` que
 *   /api/groups devolve é o whatsapp_group_id). Manda só a carga; o servidor
 *   resolve o alvo a partir de `campaign_groups.group_ids`.
 * - **Não usa realtime.** O progresso é polling de 3s, porque o realtime do app
 *   é decorativo — uma barra pendurada nele nunca se moveria.
 * - **Não apaga descrição sem perguntar.** String vazia apaga a descrição de
 *   todos os grupos no WhatsApp; a confirmação daqui é a primeira barreira, e a
 *   flag `confirmClear` no body é a segunda, no servidor.
 */

type Progresso = {
  batchId: string;
  actions: string[];
  createdAt: string;
  total: number;
  done: number;
  failed: number;
  pending: number;
};

type Resultado = {
  batchId: string;
  total: number;
  skipped: { semAdmin: number; semId: number };
};

type Props = {
  slug: string;
  /** Grupos da campanha onde somos admin — os únicos que podem entrar no lote. */
  administrados: number;
  /** Total de grupos da campanha, para explicar a diferença. */
  totais: number;
  /** Chamado quando um lote termina, para a tela recarregar os selos. */
  onLoteConcluido: () => void;
};

/** Ritmo do executor: 1 operação a cada 4s ≈ 15/min. */
const OPS_POR_MINUTO = 15;
const POLL_MS = 3000;

const ROTULO_ACAO: Record<string, string> = {
  set_description: "descrição",
  set_picture: "foto",
  open: "abertura",
  close: "fechamento",
};

function descreveLote(actions: string[]): string {
  const nomes = actions.map((a) => ROTULO_ACAO[a] ?? a);
  if (nomes.length === 0) return "ações";
  if (nomes.length === 1) return nomes[0];
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`;
}

export function AcoesEmMassa({ slug, administrados, totais, onLoteConcluido }: Props) {
  const [descricao, setDescricao] = useState("");
  const [mediaId, setMediaId] = useState<string | null>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [aplicando, setAplicando] = useState<"identidade" | "open" | "close" | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [progresso, setProgresso] = useState<Progresso | null>(null);
  const arquivoRef = useRef<HTMLInputElement>(null);
  // Guarda o pendente da batida anterior: a transição >0 -> 0 é o fim do lote.
  const pendenteAnterior = useRef<number | null>(null);

  const lerProgresso = useCallback(async () => {
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/lotes`);
      if (!res.ok) return;
      const dado = (await res.json()) as Progresso | null;
      setProgresso(dado);

      const antes = pendenteAnterior.current;
      pendenteAnterior.current = dado?.pending ?? null;
      if (antes !== null && antes > 0 && dado && dado.pending === 0) onLoteConcluido();
    } catch {
      // Uma batida perdida não é erro de tela: a próxima corrige.
    }
  }, [slug, onLoteConcluido]);

  // Busca no mount para reencontrar um lote em andamento depois de um F5 — com
  // 91 grupos o lote leva ~6 min, então recarregar no meio é o caso comum.
  useEffect(() => {
    lerProgresso();
  }, [lerProgresso]);

  useEffect(() => {
    if (!progresso || progresso.pending === 0) return;
    const id = setInterval(lerProgresso, POLL_MS);
    return () => clearInterval(id);
  }, [progresso, lerProgresso]);

  const enviarFoto = useCallback(async (file: File) => {
    setEnviandoFoto(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/media", { method: "POST", body: form });
      if (!res.ok) {
        // A rota diz POR QUE recusou — arquivo grande demais, formato errado, ou
        // o 402 de plano sem assinatura valida. Trocar isso por uma frase
        // generica deixava o lojista (e quem fosse investigar) sem nada: o
        // sintoma "deu erro" nao distingue foto de 8MB de assinatura vencida.
        const erro = await res.json().catch(() => null);
        throw new Error(erro?.error ?? "Não foi possível enviar a imagem.");
      }
      const data = (await res.json()) as { id: string };
      setMediaId(data.id);
      setNomeArquivo(file.name);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível enviar a imagem.");
    } finally {
      setEnviandoFoto(false);
    }
  }, []);

  function escolherFoto() {
    const input = arquivoRef.current;
    if (!input) return;
    input.onchange = () => {
      const f = input.files?.[0];
      if (f) enviarFoto(f);
      input.value = "";
    };
    input.click();
  }

  function relatar(resultado: Resultado, verbo: string) {
    const partes = [`${verbo} em ${resultado.total} operações.`];
    if (resultado.skipped.semAdmin > 0) {
      partes.push(
        `${resultado.skipped.semAdmin} grupo(s) ficaram de fora: não somos admin neles.`,
      );
    }
    const minutos = Math.max(1, Math.ceil(resultado.total / OPS_POR_MINUTO));
    partes.push(`Leva cerca de ${minutos} min — o ritmo é o que protege o número.`);
    setAviso(partes.join(" "));
  }

  async function aplicarIdentidade() {
    const temFoto = Boolean(mediaId);
    const texto = descricao;

    if (!temFoto && texto === "") {
      setErro("Escolha uma imagem, escreva uma descrição, ou as duas.");
      return;
    }
    // Só pergunta quando a descrição vazia É a carga: com foto escolhida e
    // descrição em branco, o lote é só de foto e nada é apagado.
    const apagandoDescricao = texto === "" && !temFoto;
    if (apagandoDescricao) {
      const ok = window.confirm(
        `Isso vai APAGAR a descrição de ${administrados} grupo(s) no WhatsApp. Confirmar?`,
      );
      if (!ok) return;
    }

    setAplicando("identidade");
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/identidade`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(texto !== "" || apagandoDescricao ? { description: texto } : {}),
          ...(mediaId ? { mediaId } : {}),
          ...(apagandoDescricao ? { confirmClear: true } : {}),
        }),
      });
      const dado = await res.json();
      if (!res.ok) throw new Error(dado?.error ?? "Não foi possível aplicar.");
      relatar(dado as Resultado, "Enfileirado");
      await lerProgresso();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível aplicar.");
    } finally {
      setAplicando(null);
    }
  }

  async function aplicarEstado(action: "open" | "close") {
    setAplicando(action);
    setErro(null);
    setAviso(null);
    try {
      const res = await fetch(`/api/campanhas/${slug}/grupos/estado`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const dado = await res.json();
      if (!res.ok) throw new Error(dado?.error ?? "Não foi possível aplicar.");
      relatar(
        dado as Resultado,
        action === "open" ? "Abertura enfileirada" : "Fechamento enfileirado",
      );
      await lerProgresso();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível aplicar.");
    } finally {
      setAplicando(null);
    }
  }

  const rodando = Boolean(progresso && progresso.pending > 0);
  const ocupado = aplicando !== null || enviandoFoto;
  const pct =
    progresso && progresso.total > 0
      ? ((progresso.done + progresso.failed) / progresso.total) * 100
      : 0;

  return (
    <section aria-label="Ações em massa" className="pn-card mb-4 rounded-2xl p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-bold text-volt-950">Ações em massa</h2>
        <p className="font-data text-[11px] text-aco/50" data-testid="acoes-massa-alcance">
          {administrados === totais
            ? `${administrados} grupo(s)`
            : `${administrados} de ${totais} grupo(s) — nos outros não somos admin`}
        </p>
      </div>

      {administrados === 0 ? (
        <p className="mt-3 text-sm text-atencao">
          Nenhum grupo desta campanha é administrado por um número conectado. Sem ser admin não dá
          para trocar foto, descrição, nem abrir e fechar.
        </p>
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <div>
              <label
                htmlFor="acoes-massa-descricao"
                className="font-data text-[10px] uppercase tracking-wider text-aco/50"
              >
                Descrição
              </label>
              <textarea
                id="acoes-massa-descricao"
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                rows={4}
                placeholder="Texto que vai valer para todos os grupos."
                className="mt-1.5 w-full rounded-xl bg-poco px-3 py-2 text-sm text-volt-950 outline-none placeholder:text-aco/40"
              />
              <p className="font-data mt-1 text-[10px] text-aco/45">
                Em branco (e sem foto) apaga a descrição de todos — pedimos confirmação.
              </p>
            </div>

            <div>
              <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">
                Foto
              </span>
              <div className="mt-1.5 flex items-center gap-2">
                <button
                  type="button"
                  onClick={escolherFoto}
                  disabled={ocupado}
                  className="inline-flex items-center gap-2 rounded-xl bg-poco px-3 py-2 text-sm text-volt-950 transition-[filter] hover:brightness-95 disabled:opacity-50"
                >
                  {enviandoFoto ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4" />
                  )}
                  {nomeArquivo ? "Trocar imagem" : "Escolher imagem"}
                </button>
                {nomeArquivo && <span className="truncate text-xs text-aco/60">{nomeArquivo}</span>}
              </div>
              <input ref={arquivoRef} type="file" accept="image/*" className="hidden" />

              <button
                type="button"
                onClick={aplicarIdentidade}
                disabled={ocupado}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cobalt-500 px-4 py-2.5 text-sm font-medium text-white transition-[transform,filter] duration-[160ms] ease-[var(--ease-fluxo)] hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-50 disabled:hover:translate-y-0"
              >
                {aplicando === "identidade" && <Loader2 className="h-4 w-4 animate-spin" />}
                Aplicar nos {administrados} grupos
              </button>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-aco/10 pt-4">
            <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">
              Estado dos grupos
            </span>
            <button
              type="button"
              onClick={() => aplicarEstado("open")}
              disabled={ocupado}
              className="inline-flex items-center gap-2 rounded-xl bg-poco px-3 py-2 text-sm text-volt-950 transition-[filter] hover:brightness-95 disabled:opacity-50"
            >
              {aplicando === "open" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Unlock className="h-4 w-4" />
              )}
              Abrir agora
            </button>
            <button
              type="button"
              onClick={() => aplicarEstado("close")}
              disabled={ocupado}
              className="inline-flex items-center gap-2 rounded-xl bg-poco px-3 py-2 text-sm text-volt-950 transition-[filter] hover:brightness-95 disabled:opacity-50"
            >
              {aplicando === "close" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Lock className="h-4 w-4" />
              )}
              Fechar agora
            </button>
          </div>
        </>
      )}

      {erro && <p className="mt-3 text-sm text-alerta">{erro}</p>}
      {aviso && !erro && <p className="mt-3 text-sm text-aco/70">{aviso}</p>}

      {progresso && progresso.total > 0 && (
        <div className="mt-4" data-testid="acoes-massa-progresso">
          <div className="flex items-center justify-between">
            <span className="font-data text-[10px] uppercase tracking-wider text-aco/50">
              {rodando ? `Aplicando ${descreveLote(progresso.actions)}` : "Último lote"}
            </span>
            <span
              className="font-data text-sm tabular-nums text-volt-950"
              data-testid="acoes-massa-contador"
            >
              {progresso.done + progresso.failed} de {progresso.total}
            </span>
          </div>
          <div className="pn-poco mt-1.5 h-2 w-full overflow-hidden rounded-full">
            <div
              className="pn-fill h-full w-full rounded-full"
              style={{ transform: `scaleX(${Math.max(pct / 100, 0.02)})` }}
            />
          </div>
          {progresso.failed > 0 && (
            <p className={cn("font-data mt-1 text-[11px]", "text-atencao")}>
              {progresso.failed} falharam. Reaplique para tentar de novo só neles.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
