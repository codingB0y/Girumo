"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronUp, Loader2 } from "lucide-react";

import { ChipDeEstado } from "@/components/painel/grupos/estado-do-grupo";
import { OPS_POR_MINUTO, useProgressoDoLote } from "@/components/painel/grupos/use-progresso-do-lote";
import { COMUNIDADE_NATIVA_MENSAGEM } from "@/lib/communities/validation";
import type { EstadoGrupo } from "@/lib/groups/estado";
import {
  NOTA_DA_DECISAO,
  baseInicial,
  conflitosDaCampanha,
  mover,
  ordemInicial,
  ordemPadrao,
  resumoDoPadrao,
  validarBase,
  type Conflito,
} from "@/lib/groups/padronizar";
import { cn } from "@/lib/utils";

/**
 * "Padronizar nomes e sequência" (spec 2026-10-10 §6.7 e D9; mockup, tela 3).
 *
 * A prévia usa as MESMAS funções puras que a rota (`lib/groups/padronizar.ts`):
 * o "Mudam de nome" que o lojista lê antes de clicar é o número de jobs que o
 * servidor cria. A tela não decide nada sozinha — manda base, ordem e a lista
 * que estava vendo (`esperado`), e o servidor recusa com 409 se a lista mudou.
 */

type Campanha = {
  id: string;
  name: string;
  slug?: string;
  groupIds: string[];
  growTemplate?: Record<string, unknown> | null;
};

type Resultado = { batchId: string; renomes: number };

/** Tela de conflitos do PR 6 ("um grupo, uma campanha"); `?de=<slug>` monta o caminho de volta. */
const CONFLITOS_HREF = "/painel/campanhas/conflitos";

const listaPtBr = new Intl.ListFormat("pt-BR", { type: "conjunction" });

async function lerJson<T>(res: Response, padrao: string): Promise<T> {
  const corpo: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const erro = (corpo as { error?: unknown } | null)?.error;
    throw new Error(typeof erro === "string" ? erro : padrao);
  }
  return corpo as T;
}

function Celula({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b px-5 py-3.5 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
      <span className="text-13 text-slate-600">{rotulo}</span>
      {children}
    </div>
  );
}

export default function PadronizarNomesPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug ?? "";
  const caminho = encodeURIComponent(slug);

  const [campanha, setCampanha] = useState<Campanha | null>(null);
  const [naoAchou, setNaoAchou] = useState(false);
  const [estados, setEstados] = useState<EstadoGrupo[] | null>(null);
  const [conflitos, setConflitos] = useState<Conflito[]>([]);
  const [base, setBase] = useState("");
  const [ordem, setOrdem] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [listaMudou, setListaMudou] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // O `disabled` só vale depois do re-render: a trava síncrona impede que dois cliques
  // seguidos enfileirem o mesmo lote de renomes duas vezes.
  const enviandoAgora = useRef(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const { progresso, lerProgresso } = useProgressoDoLote(slug);

  const carregar = useCallback(async () => {
    setErro(null);
    setListaMudou(false);
    try {
      const lista = await lerJson<Campanha[]>(await fetch("/api/campanhas"), "Não foi possível carregar a campanha.");
      const achada = lista.find((c) => c.slug === slug || c.id === slug) ?? null;
      setCampanha(achada);
      setNaoAchou(achada === null);
      if (!achada) return;

      const [resEstados, resConflitos] = await Promise.all([
        fetch(`/api/campanhas/${caminho}/grupos/estados`),
        fetch("/api/campanhas/conflitos"),
      ]);
      const { grupos } = await lerJson<{ grupos: EstadoGrupo[] }>(resEstados, "Não foi possível carregar os grupos.");
      const lidos = await lerJson<{ conflitos: Conflito[] }>(
        resConflitos,
        "Não foi possível conferir os grupos que estão em duas campanhas.",
      );
      setEstados(grupos);
      setConflitos(lidos.conflitos);
      setOrdem(ordemInicial(grupos, achada.growTemplate));
      setBase((atual) => atual || baseInicial(achada.name, achada.growTemplate));
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar.");
    }
  }, [slug, caminho]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const validacao = validarBase(base);
  const baseDaPrevia = validacao.ok ? validacao.base : base.trim();
  const daCampanha = useMemo(() => conflitosDaCampanha(conflitos, campanha?.id ?? ""), [conflitos, campanha]);
  const resumo = useMemo(
    () =>
      resumoDoPadrao({
        ordem,
        base: baseDaPrevia,
        estados: estados ?? [],
        conflitos: daCampanha.jids,
        tamanhoDoPool: campanha?.groupIds.length ?? 0,
      }),
    [ordem, baseDaPrevia, estados, daCampanha, campanha],
  );
  const loteDesta = resultado && progresso?.batchId === resultado.batchId ? progresso : null;

  const mensagem = !resultado
    ? ""
    : resultado.renomes === 0
      ? "Ordem salva. Nenhum nome precisava mudar."
      : `Ordem salva. ${resultado.renomes} ${resultado.renomes === 1 ? "grupo vai ser renomeado" : "grupos vão ser renomeados"} aos poucos — cerca de ${Math.max(1, Math.ceil(resultado.renomes / OPS_POR_MINUTO))} min.`;

  async function aplicar() {
    if (!campanha || !validacao.ok || enviandoAgora.current) return;
    enviandoAgora.current = true;
    setEnviando(true);
    setErro(null);
    setListaMudou(false);
    let status = 0;
    try {
      const res = await fetch(`/api/campanhas/${caminho}/grupos/padronizar`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ base: validacao.base, ordem, esperado: campanha.groupIds }),
      });
      status = res.status;
      setResultado(await lerJson<Resultado>(res, "Não foi possível aplicar."));
      await lerProgresso();
    } catch (e) {
      const texto = e instanceof Error ? e.message : "Não foi possível aplicar.";
      setErro(texto);
      // 409 de lista mudada ou de grupo nascendo se resolve recarregando; o de
      // comunidade nativa, não — ali o botão só repetiria o mesmo erro.
      setListaMudou(status === 409 && texto !== COMUNIDADE_NATIVA_MENSAGEM);
    } finally {
      enviandoAgora.current = false;
      setEnviando(false);
    }
  }

  const voltar = `/painel/campanhas/${caminho}`;
  const nomesEmConflito = daCampanha.nomes.length;

  return (
    <div className="mx-auto max-w-[1180px] space-y-5 px-4 py-6 sm:px-8">
      <header className="space-y-1.5">
        <p className="text-13 text-slate-600">
          {campanha ? (
            <Link href={voltar} className="transition-colors hover:text-volt-950">
              {campanha.name}
            </Link>
          ) : (
            "Campanha"
          )}{" "}
          / Grupos
        </p>
        <h1 className="font-brand text-28 font-bold tracking-[-0.01em] text-volt-950">Padronizar nomes e sequência</h1>
        <p className="max-w-[760px] text-sm text-slate-600">
          A ordem abaixo vira a ordem do link e o número no nome de cada grupo. Começa pelos lotados, do mais cheio para
          o menos cheio; depois o que está enchendo, os da fila e os vazios. Use as setas para ajustar.
        </p>
      </header>

      <p role="status" data-testid="padronizar-status" className="text-sm font-medium text-volt-950">
        {mensagem}
      </p>

      {erro && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl bg-aviso-fundo px-4 py-3 text-sm text-alerta">
          <span>{erro}</span>
          {listaMudou && (
            <button
              type="button"
              onClick={() => void carregar()}
              className="min-h-11 rounded-lg border border-line-200 bg-paper-0 px-3.5 text-sm font-medium text-volt-950"
            >
              Recarregar a lista
            </button>
          )}
        </div>
      )}

      {naoAchou ? (
        <p className="text-sm text-slate-600">Campanha não encontrada.</p>
      ) : estados === null ? (
        erro ? null : <p className="text-sm text-slate-600">Carregando os grupos…</p>
      ) : resultado ? (
        <section aria-label="Aplicando" className="pn-card space-y-4 rounded-xl p-5">
          {loteDesta && loteDesta.total > 0 && (
            <div data-testid="padronizar-progresso">
              <div className="flex items-center justify-between text-13 text-slate-600">
                <span>{loteDesta.pending > 0 ? "Renomeando" : "Renomeação concluída"}</span>
                <span className="font-data tabular-nums text-volt-950">
                  {loteDesta.done + loteDesta.failed} de {loteDesta.total}
                </span>
              </div>
              <div className="pn-poco mt-1.5 h-2 w-full overflow-hidden rounded-full">
                <div
                  className="pn-fill h-full w-full rounded-full"
                  style={{
                    transform: `scaleX(${Math.max((loteDesta.done + loteDesta.failed) / loteDesta.total, 0.02)})`,
                  }}
                />
              </div>
              {loteDesta.failed > 0 && (
                <p className="mt-1.5 text-13 text-atencao">
                  {loteDesta.failed} não mudaram de nome (sem admin ou o WhatsApp recusou). Padronize de novo para
                  tentar só neles.
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2.5">
            <Link
              href={voltar}
              className="inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-4 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600"
            >
              Voltar para a campanha
            </Link>
            <button
              type="button"
              onClick={() => {
                setResultado(null);
                void carregar();
              }}
              className="min-h-11 rounded-lg border border-line-200 bg-paper-0 px-4 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600"
            >
              Padronizar de novo
            </button>
          </div>
        </section>
      ) : estados.length === 0 ? (
        <p className="text-sm text-slate-600">Esta campanha ainda não tem grupos.</p>
      ) : (
        <>
          <section aria-label="Nome base" className="pn-card flex flex-wrap items-end gap-4 rounded-xl p-5">
            <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-1.5">
              <label htmlFor="padronizar-base" className="text-sm font-semibold text-volt-950">
                Nome base
              </label>
              <input
                id="padronizar-base"
                type="text"
                value={base}
                onChange={(e) => setBase(e.target.value)}
                aria-invalid={!validacao.ok}
                aria-describedby={validacao.ok ? undefined : "padronizar-base-erro"}
                className="min-h-11 rounded-lg border border-line-200 bg-paper-0 px-3 text-base text-volt-950"
              />
              {!validacao.ok && (
                <p id="padronizar-base-erro" className="text-13 text-alerta">
                  {validacao.error}
                </p>
              )}
            </div>
            <div className="flex min-w-0 flex-[2_1_380px] flex-col gap-1">
              <span className="text-13 text-slate-600">Fica assim</span>
              <span className="break-words font-data text-sm text-volt-950">
                {baseDaPrevia} 1, {baseDaPrevia} 2, {baseDaPrevia} 3…
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOrdem(ordemPadrao(estados))}
              className="min-h-11 rounded-lg border border-line-200 bg-paper-0 px-3.5 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600"
            >
              Ordenar por membros de novo
            </button>
          </section>

          <section aria-label="Resumo" className="pn-card grid grid-cols-1 rounded-xl sm:grid-cols-3">
            <Celula rotulo="Mudam de nome">
              <span className="font-brand text-28 font-bold tabular-nums text-volt-950">{resumo.mudam}</span>
            </Celula>
            <Celula rotulo="Já estão certos">
              <span className="font-brand text-28 font-bold tabular-nums text-volt-950">{resumo.jaCertos}</span>
            </Celula>
            <Celula rotulo="Próximo grupo criado sozinho">
              <span className="break-words font-brand text-20 font-bold text-volt-950">{resumo.proximo}</span>
            </Celula>
          </section>

          {nomesEmConflito > 0 && (
            <div role="note" className="flex items-start gap-2.5 rounded-xl bg-aviso-fundo px-4 py-3 text-sm text-atencao">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>{listaPtBr.format(daCampanha.nomes)}</strong> também {nomesEmConflito === 1 ? "está" : "estão"} em{" "}
                {listaPtBr.format(daCampanha.outras)}: {nomesEmConflito === 1 ? "entra" : "entram"} na ordem, mas não{" "}
                {nomesEmConflito === 1 ? "é renomeado" : "são renomeados"} até você{" "}
                <Link href={`${CONFLITOS_HREF}?de=${caminho}`} className="font-semibold underline">
                  escolher onde ficam
                </Link>
                .
              </span>
            </div>
          )}

          <p className="text-13 text-slate-600">
            Em cada grupo renomeado os membros veem a linha “Você mudou o nome do grupo”. Os nomes mudam aos poucos,
            pela mesma fila das ações em massa; a ordem do link muda na hora.
          </p>

          <section aria-label="Prévia da sequência" className="pn-card overflow-x-auto rounded-xl">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b text-left text-13 text-slate-600">
                  <th scope="col" className="px-4 py-2.5 font-medium">Nº</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Nome atual</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Nome novo</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Membros</th>
                  <th scope="col" className="px-4 py-2.5 font-medium">Estado</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">Ordem</th>
                </tr>
              </thead>
              <tbody>
                {resumo.linhas.map((linha) => {
                  const indice = linha.numero - 1;
                  return (
                    <tr key={linha.jid} data-testid="padronizar-linha" data-jid={linha.jid} className="border-b last:border-b-0">
                      <td className="px-4 py-1.5 font-data font-medium">{linha.numero}</td>
                      <td className="px-4 py-1.5 text-slate-600">{linha.atual}</td>
                      <td className="px-4 py-1.5">
                        <span className={cn("font-medium", linha.decisao === "muda" ? "text-volt-950" : "text-slate-600")}>
                          {linha.novo}
                        </span>
                        {NOTA_DA_DECISAO[linha.decisao] && (
                          <span className="ml-2 text-13 text-slate-600">{NOTA_DA_DECISAO[linha.decisao]}</span>
                        )}
                      </td>
                      <td className="px-4 py-1.5 text-right font-data text-13 tabular-nums">
                        {linha.membros.toLocaleString("pt-BR")}
                      </td>
                      <td className="px-4 py-1.5">
                        <ChipDeEstado estado={linha.estado} />
                      </td>
                      <td className="px-4 py-1.5">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            aria-label={`Subir ${linha.atual}`}
                            disabled={indice === 0}
                            onClick={() => setOrdem((atual) => mover(atual, indice, -1))}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-line-200 bg-paper-0 text-volt-950 disabled:opacity-35"
                          >
                            <ChevronUp className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Descer ${linha.atual}`}
                            disabled={indice === ordem.length - 1}
                            onClick={() => setOrdem((atual) => mover(atual, indice, 1))}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-line-200 bg-paper-0 text-volt-950 disabled:opacity-35"
                          >
                            <ChevronDown className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <div className="flex flex-wrap justify-end gap-2.5">
            <Link
              href={voltar}
              className="inline-flex min-h-11 items-center rounded-lg border border-line-200 bg-paper-0 px-4 text-sm font-medium text-volt-950 transition-colors hover:border-slate-600"
            >
              Cancelar
            </Link>
            <button
              type="button"
              onClick={() => void aplicar()}
              disabled={!validacao.ok || enviando || ordem.length === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-cobalt-500 px-4 text-sm font-semibold text-white transition-[filter] hover:brightness-110 disabled:opacity-50"
            >
              {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {resumo.mudam > 0
                ? `Renomear ${resumo.mudam} ${resumo.mudam === 1 ? "grupo" : "grupos"} e salvar a ordem`
                : "Salvar a ordem"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
