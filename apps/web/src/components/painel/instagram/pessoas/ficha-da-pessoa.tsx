"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useFocusTrap } from "@/components/painel/use-focus-trap";
import { useToast } from "@/components/toast";
import { fieldLabel, toFieldKey } from "@/lib/ig/flow/names";
import type { AcessoDto, FichaDaPessoa, PessoaDto } from "@/lib/ig/pessoas-tipos";
import { dataCurta } from "./datas";
import { lerJson } from "./use-pessoas";

const ORIGEM = { comment: "Comentário", dm: "Direct", story: "Story" } as const;
const ESTADO = { queued: "Na fila", active: "Esperando", done: "Enviado", stopped: "Parado", failed: "Falhou" } as const;
const ENTRADA = "h-9 rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-2 text-13 text-volt-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const BOTAO = "inline-flex h-9 items-center rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-13 font-medium text-volt-950";

type Edicao = { set?: Record<string, string | null>; add?: string[]; remove?: string[] };
type Props = { id: string; acesso: AcessoDto; aoFechar: () => void; aoMudou: () => void; aoApagada: () => void };

/** A ficha lateral: campos e etiquetas editáveis, atendimentos, origem e "Apagar da lista". */
export function FichaLateral({ id, acesso, aoFechar, aoMudou, aoApagada }: Props) {
  const [ficha, setFicha] = useState<FichaDaPessoa | null>(null);
  const [falhou, setFalhou] = useState(false);
  const [novoCampo, setNovoCampo] = useState({ nome: "", valor: "" });
  const [novaEtiqueta, setNovaEtiqueta] = useState("");
  const [apagando, setApagando] = useState(false);
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const toast = useToast();
  const ref = useFocusTrap<HTMLElement>(true);
  const editavel = !acesso.somenteLeitura;

  const carregar = useCallback(async () => {
    setFalhou(false);
    const r = await lerJson<FichaDaPessoa>(`/api/ig/contacts/${id}`);
    if (r.ok) setFicha(r.dados);
    else setFalhou(true);
  }, [id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !apagando) aoFechar();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aoFechar, apagando]);

  const editar = async (corpo: Edicao): Promise<boolean> => {
    const r = await fetch(`/api/ig/contacts/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
    if (!r?.ok) {
      toast(r?.status === 400 ? "Valor inválido. Etiqueta: letras, números e hífen." : "Não deu pra salvar. Tente de novo.", "error");
      return false;
    }
    const { pessoa } = (await r.json()) as { pessoa: PessoaDto };
    setFicha((f) => (f ? { ...f, pessoa } : f));
    aoMudou();
    return true;
  };

  const apagar = async () => {
    setApagando(true);
    const ok = await pedirConfirmacao({ titulo: "Apagar da lista?", texto: "A ficha e os atendimentos dessa pessoa somem. Não dá pra desfazer.", rotulo: "Apagar", destrutivo: true });
    setApagando(false);
    if (!ok) return;
    const r = await fetch(`/api/ig/contacts/${id}`, { method: "DELETE" }).catch(() => null);
    if (!r?.ok) {
      toast("Não deu pra apagar. Tente de novo.", "error");
      return;
    }
    aoApagada();
  };

  const p = ficha?.pessoa;
  return (
    <div className="fixed inset-0 z-50 font-body text-volt-950">
      <button type="button" aria-label="Fechar ficha" onClick={aoFechar} className="absolute inset-0 bg-volt-950/60" />
      <aside ref={ref} role="dialog" aria-modal="true" aria-label={p ? `Ficha de ${p.username ? `@${p.username}` : "pessoa sem @"}` : "Ficha da pessoa"} className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col overflow-y-auto bg-paper-0 shadow-xl">
        <header className="flex items-center justify-between border-b border-line-200 px-5 py-4">
          <h2 className="min-w-0 text-16 font-semibold [overflow-wrap:anywhere]">{p ? (p.username ? `@${p.username}` : "Sem @") : "Ficha"}</h2>
          <button type="button" onClick={aoFechar} className="text-13 text-slate-600">Fechar</button>
        </header>

        {!ficha && !falhou && <span role="status" aria-label="Carregando ficha" className="pn-skeleton m-5 block h-5 w-48 rounded-[var(--radius-chip)]" />}
        {falhou && (
          <p role="alert" className="px-5 py-6 text-13 text-slate-600">
            Não deu pra carregar a ficha. <button type="button" onClick={() => void carregar()} className="text-cobalt-500">Tentar de novo</button>
          </p>
        )}

        {ficha && p && (
          <div className="flex flex-col gap-6 px-5 py-5">
            <section aria-label="Campos">
              <h3 className="text-12 font-medium text-slate-600">Campos</h3>
              {Object.keys(p.fields).length === 0 && <p className="mt-2 text-13 text-slate-600">Nenhum campo guardado.</p>}
              <ul className="mt-2 flex flex-col gap-2">
                {Object.entries(p.fields).map(([chave, valor]) => (
                  <li key={`${chave}:${String(valor)}`} className="flex items-center gap-2">
                    <label className="w-28 shrink-0 text-13 text-slate-600" htmlFor={`campo-${chave}`}>{fieldLabel(chave)}</label>
                    {editavel ? (
                      <>
                        <input id={`campo-${chave}`} defaultValue={String(valor)} maxLength={200} onBlur={(e) => e.target.value !== String(valor) && void editar({ set: { [chave]: e.target.value.trim() === "" ? null : e.target.value } })} className={`${ENTRADA} min-w-0 flex-1`} />
                        <button type="button" aria-label={`Apagar o campo ${fieldLabel(chave)}`} onClick={() => void editar({ set: { [chave]: null } })} className="text-slate-600 hover:text-danger-700">
                          <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </>
                    ) : (
                      <span className="text-13">{String(valor)}</span>
                    )}
                  </li>
                ))}
              </ul>
              {editavel && (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const chave = toFieldKey(novoCampo.nome);
                    if (!chave || !novoCampo.valor.trim()) return toast("Dê um nome e um valor ao campo.", "error");
                    void editar({ set: { [chave]: novoCampo.valor } }).then((ok) => ok && setNovoCampo({ nome: "", valor: "" }));
                  }}
                >
                  <input aria-label="Nome do novo campo" placeholder="Campo" value={novoCampo.nome} maxLength={32} onChange={(e) => setNovoCampo({ ...novoCampo, nome: e.target.value })} className={`${ENTRADA} w-28`} />
                  <input aria-label="Valor do novo campo" placeholder="Valor" value={novoCampo.valor} maxLength={200} onChange={(e) => setNovoCampo({ ...novoCampo, valor: e.target.value })} className={`${ENTRADA} min-w-0 flex-1`} />
                  <button type="submit" className={BOTAO}>Salvar</button>
                </form>
              )}
            </section>

            <section aria-label="Etiquetas">
              <h3 className="text-12 font-medium text-slate-600">Etiquetas</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {p.tags.length === 0 && <li className="text-13 text-slate-600">Nenhuma etiqueta.</li>}
                {p.tags.map((t) => (
                  <li key={t} className="pn-chip gap-1">
                    {t}
                    {editavel && (
                      <button type="button" aria-label={`Tirar a etiqueta ${t}`} onClick={() => void editar({ remove: [t] })}>
                        <X className="h-3 w-3" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {editavel && (
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (novaEtiqueta.trim()) void editar({ add: [novaEtiqueta] }).then((ok) => ok && setNovaEtiqueta(""));
                  }}
                >
                  <input aria-label="Nova etiqueta" placeholder="Nova etiqueta" value={novaEtiqueta} maxLength={80} onChange={(e) => setNovaEtiqueta(e.target.value)} className={`${ENTRADA} min-w-0 flex-1`} />
                  <button type="submit" className={BOTAO}>Pôr</button>
                </form>
              )}
            </section>

            <section aria-label="Origem">
              <h3 className="text-12 font-medium text-slate-600">Origem</h3>
              <p className="mt-2 text-13">Veio por {p.sourceFlowName ?? "—"}</p>
              <p className="mt-1 text-13 text-slate-600">Primeira conversa em {dataCurta(p.firstSeenAt)} · última em {dataCurta(p.lastSeenAt)}</p>
            </section>

            <section aria-label="Atendimentos">
              <h3 className="text-12 font-medium text-slate-600">Atendimentos</h3>
              {ficha.atendimentos.length === 0 && <p className="mt-2 text-13 text-slate-600">Nenhum atendimento nos últimos 90 dias.</p>}
              <ul className="mt-2 flex flex-col divide-y divide-line-200">
                {ficha.atendimentos.map((a) => (
                  <li key={a.id} className="py-2 text-13">
                    <span className="font-medium">{a.flowName ?? "Fluxo apagado"}</span>
                    <span className="text-slate-600"> · {ORIGEM[a.sourceKind]}{a.matchedKeyword ? ` “${a.matchedKeyword}”` : ""} · {dataCurta(a.startedAt)} · {ESTADO[a.status]}</span>
                    {a.errorText && <span className="block text-12 text-danger-700">{a.errorText}</span>}
                  </li>
                ))}
              </ul>
            </section>

            {acesso.podeApagar && (
              <button type="button" onClick={() => void apagar()} className="self-start text-13 font-medium text-danger-700">Apagar da lista</button>
            )}
          </div>
        )}
      </aside>
      {folhaDeConfirmacao}
    </div>
  );
}
