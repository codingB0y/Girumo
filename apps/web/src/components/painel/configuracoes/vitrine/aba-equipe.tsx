"use client";

import { Loader2, Trash2 } from "lucide-react";
import { PlanLimitAlert } from "@/components/painel/plan-limit-alert";
import { canOfferRemoval, removalActionLabel } from "@/lib/auth/member-removal";
import { iniciaisDoEmail, papelEmPortugues } from "@/lib/painel/configuracoes";

export type MembroNaTela = {
  id: string;
  role: string;
  invited_email?: string | null;
  accepted_at?: string | null;
};

export type PropsDaEquipe = {
  membros: readonly MembroNaTela[];
  /** `false` = a consulta falhou; lista vazia não é o mesmo que "só você". */
  ok: boolean;
  email: string;
  onEmail: (v: string) => void;
  convidando: boolean;
  erro: string | null;
  upgradeUrl: string | null;
  aviso: string | null;
  removendoId: string | null;
  onConvidar: () => void;
  onRemover: (m: MembroNaTela) => void;
};

/**
 * Equipe como fichas de 64px (spec 12.6).
 *
 * "owner" e "operator" nunca chegam à tela: a regra da spec é que papel é
 * sempre palavra em português. Antes a tela imprimia `{m.role}` cru num chip.
 */
export function AbaEquipe({
  membros,
  ok,
  email,
  onEmail,
  convidando,
  erro,
  upgradeUrl,
  aviso,
  removendoId,
  onConvidar,
  onRemover,
}: PropsDaEquipe) {
  return (
    <section className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8" data-testid="configuracoes-equipe">
      {ok && membros.length === 0 ? (
        <p className="text-[14px] text-slate-600">Só você por enquanto. Convide alguém abaixo.</p>
      ) : !ok ? (
        // Lista vazia por falha de rota diria "só você" a quem tem equipe.
        <p className="text-[14px] text-slate-600">
          Não deu para carregar a equipe agora. Atualize a página em alguns instantes.
        </p>
      ) : (
        <ul>
          {membros.map((m) => (
            <li key={m.id} className="pn-ficha">
              <span className="pn-ficha__iniciais" aria-hidden="true">
                {iniciaisDoEmail(m.invited_email)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="pn-ficha__nome truncate">{m.invited_email ?? "Membro"}</p>
                <p className="pn-ficha__origem">
                  {papelEmPortugues(m.role)}
                  {!m.accepted_at && " · convite pendente"}
                </p>
              </div>
              {canOfferRemoval(m) && (
                <button
                  type="button"
                  onClick={() => onRemover(m)}
                  disabled={removendoId === m.id}
                  aria-label={removalActionLabel(m)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-control)] text-slate-600 hover:text-danger-700 disabled:opacity-50"
                >
                  {removendoId === m.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 border-t border-line-200 pt-5">
        <label htmlFor="convite-email" className="block text-13 text-slate-600">
          Convidar pessoa
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <input
            id="convite-email"
            type="email"
            value={email}
            onChange={(e) => onEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onConvidar()}
            placeholder="email@exemplo.com"
            className="h-12 w-full rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-3 text-[16px] text-volt-950 sm:w-72"
          />
          <button
            type="button"
            onClick={onConvidar}
            disabled={convidando || !email.trim()}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-[var(--radius-control)] bg-cobalt-500 px-5 text-[14px] font-semibold text-paper-0 disabled:opacity-50"
          >
            {convidando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            Convidar
          </button>
        </div>

        <PlanLimitAlert
          message={erro}
          upgradeUrl={upgradeUrl}
          className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border-l-[3px] border-danger-700 bg-canvas-100 px-4 py-3 text-13 text-danger-700"
        />
        {aviso && (
          <p role="status" className="mt-3 text-13 text-slate-600">
            {aviso}
          </p>
        )}
      </div>
    </section>
  );
}
