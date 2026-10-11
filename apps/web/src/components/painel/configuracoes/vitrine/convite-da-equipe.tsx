"use client";

import { useId } from "react";
import { Loader2 } from "lucide-react";
import { PlanLimitAlert } from "@/components/painel/plan-limit-alert";
import type { ModuloOpcional } from "@/lib/auth/modulos";
import { FUNCOES_DO_CONVITE, type FuncaoDoConvite } from "@/lib/painel/configuracoes";
import { cn } from "@/lib/utils";
import { CamposDoAcesso } from "./campos-do-acesso";

export type PropsDoConvite = {
  email: string;
  onEmail: (v: string) => void;
  funcao: FuncaoDoConvite;
  onFuncao: (f: FuncaoDoConvite) => void;
  modulos: readonly ModuloOpcional[];
  onModulos: (m: ModuloOpcional[]) => void;
  convidando: boolean;
  erro: string | null;
  upgradeUrl: string | null;
  onConvidar: () => void;
};

const FOCO =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";

/**
 * "Convidar pessoa" com a função escolhida na hora (mockup "Configurações ›
 * Equipe"). Vendedora abre os módulos; os outros papéis não têm o que marcar.
 * `noValidate`: o e-mail é conferido por `montarConvite` e o erro sai no alerta
 * da tela, não no balão do navegador.
 */
export function ConviteDaEquipe({
  email,
  onEmail,
  funcao,
  onFuncao,
  modulos,
  onModulos,
  convidando,
  erro,
  upgradeUrl,
  onConvidar,
}: PropsDoConvite) {
  const id = useId();
  return (
    <form
      noValidate
      aria-labelledby={`${id}-titulo`}
      onSubmit={(e) => {
        e.preventDefault();
        onConvidar();
      }}
      className="mt-6 space-y-5 border-t border-line-200 pt-5"
    >
      <h2 id={`${id}-titulo`} className="font-brand text-[16px] font-bold text-volt-950">
        Convidar pessoa
      </h2>

      <div>
        {/* O rótulo visível É o nome acessível do campo: `aria-label` diferente
            do texto na tela quebra "label in name" (WCAG 2.5.3) e some com o
            seletor que o E2E de convite usa. */}
        <label htmlFor="convite-email" className="block text-13 font-semibold text-volt-950">
          E-mail
        </label>
        <input
          id="convite-email"
          type="email"
          autoComplete="off"
          value={email}
          onChange={(e) => onEmail(e.target.value)}
          placeholder="nome@exemplo.com.br"
          className={`mt-1 h-12 w-full rounded-[var(--radius-control)] border border-line-200 bg-canvas-100 px-3 text-[16px] text-volt-950 sm:max-w-sm ${FOCO}`}
        />
      </div>

      <fieldset className="min-w-0 space-y-2">
        <legend className="mb-2 text-13 font-semibold text-volt-950">Função</legend>
        {FUNCOES_DO_CONVITE.map((f) => (
          <label
            key={f.id}
            className={cn(
              "flex min-h-11 cursor-pointer gap-3 rounded-[var(--radius-control)] border p-3",
              funcao === f.id ? "border-cobalt-500 bg-cobalt-soft" : "border-line-200 bg-paper-0",
            )}
          >
            <input
              type="radio"
              name={`${id}-funcao`}
              value={f.id}
              checked={funcao === f.id}
              onChange={() => onFuncao(f.id)}
              aria-labelledby={`${id}-${f.id}`}
              aria-describedby={`${id}-${f.id}-desc`}
              className={`mt-0.5 h-[18px] w-[18px] shrink-0 accent-cobalt-500 ${FOCO}`}
            />
            <span className="flex flex-col gap-0.5">
              <span id={`${id}-${f.id}`} className="text-[14px] font-semibold text-volt-950">
                {f.nome}
              </span>
              <span id={`${id}-${f.id}-desc`} className="text-13 text-slate-600">
                {f.descricao}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      {funcao === "seller" && (
        <CamposDoAcesso legenda="O que ela pode acessar" modulos={modulos} onModulos={onModulos} />
      )}

      <PlanLimitAlert
        message={erro}
        upgradeUrl={upgradeUrl}
        className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-control)] border-l-[3px] border-danger-700 bg-canvas-100 px-4 py-3 text-13 text-danger-700"
      />

      <div>
        <button
          type="submit"
          disabled={convidando || !email.trim()}
          className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-[var(--radius-control)] bg-cobalt-500 px-6 text-[15px] font-semibold text-paper-0 disabled:opacity-50 sm:w-auto ${FOCO}`}
        >
          {convidando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          Enviar convite
        </button>
        <p className="mt-2 text-12 text-slate-600">Cada pessoa da equipe usa 1 vaga do plano, vendedora também.</p>
      </div>
    </form>
  );
}
