"use client";

import { useEffect, useId, useRef } from "react";
import { Lock, MoreHorizontal, Unlock } from "lucide-react";
import { CopyLink } from "@/components/painel/copy-link";
import { lotaDeNovoEm, mensagemAindaCheio } from "@/lib/groups/acao-lotado";
import { ROTULO_ESTADO, type EstadoDoGrupo, type EstadoGrupo } from "@/lib/groups/estado";
import { cn } from "@/lib/utils";

/**
 * Chip de estado e menu ⋯ de um grupo da campanha (mockup "Grupos da campanha").
 *
 * Acid só no Lotado: é o LOTOU do painel (G2, decisão 11). O vazio leva fio tracejado
 * cinza — borda colorida não pinta no painel (`* { border-color }` em globals.css).
 */
const ESTILO_DO_CHIP: Record<EstadoDoGrupo, string> = {
  lotado: "bg-acid-500 text-volt-950",
  enchendo: "bg-cobalt-500 text-white",
  fila: "bg-porta-ativa text-slate-600",
  vazio: "border border-dashed bg-paper-0 text-slate-600",
};

export function ChipDeEstado({ estado }: { estado: EstadoDoGrupo }) {
  return (
    <span
      data-testid="chip-estado"
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-13 font-semibold",
        ESTILO_DO_CHIP[estado],
      )}
    >
      {ROTULO_ESTADO[estado]}
    </span>
  );
}

/**
 * Aberto / Fechado / sem informação.
 *
 * O terceiro estado é dito em voz alta de propósito: sumir com o selo quando
 * `send_state` é nulo faria "nunca aplicamos" parecer "está aberto", que é a
 * suposição errada mais cara — o lojista acharia que fechou o grupo de
 * madrugada quando não fechou.
 */
export function SeloEnvio({ estado }: { estado: "open" | "closed" | null }) {
  if (estado === "open") {
    return (
      <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-sucesso/10 px-2.5 py-1 text-12 uppercase tracking-wider text-sucesso">
        <Unlock className="h-3 w-3" /> Aberto
      </span>
    );
  }
  if (estado === "closed") {
    return (
      <span className="font-data inline-flex items-center gap-1.5 rounded-full bg-poco px-2.5 py-1 text-12 uppercase tracking-wider text-aco">
        <Lock className="h-3 w-3" /> Fechado
      </span>
    );
  }
  return (
    <span className="font-data inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-12 uppercase tracking-wider text-aco">
      Envio: sem informação
    </span>
  );
}

const ITEM =
  "rounded-lg px-3 py-2.5 text-left text-sm font-medium text-volt-950 transition-colors hover:bg-hover-ficha disabled:cursor-not-allowed disabled:text-slate-600 disabled:hover:bg-transparent";

type MenuDoGrupoProps = {
  grupo: EstadoGrupo;
  /** `useLinkOrigin()` da página: convite relativo vira absoluto, como no cartão antigo. */
  origin: string;
  aberto: boolean;
  /** Uma ação deste grupo está a caminho do servidor. */
  ocupado: boolean;
  aoAlternar: () => void;
  /** Estável (`useCallback`): entra na dependência do efeito do clique fora. */
  aoFechar: () => void;
  aoMarcar: () => void;
  aoReabrir: () => void;
  aoEditarCapacidade: () => void;
};

/**
 * Disclosure, não `role="menu"`: o motivo do Reabrir travado e a URL do convite são texto, e
 * `menu` só aceita itens. Esc fecha e devolve o foco ao ⋯; clique fora fecha; escolher uma ação
 * fecha e devolve o foco. Copiar o convite não fecha: o ✓ do `CopyLink` aparece ali.
 */
export function MenuDoGrupo({
  grupo,
  origin,
  aberto,
  ocupado,
  aoAlternar,
  aoFechar,
  aoMarcar,
  aoReabrir,
  aoEditarCapacidade,
}: MenuDoGrupoProps) {
  const caixa = useRef<HTMLDivElement>(null);
  const gatilho = useRef<HTMLButtonElement>(null);
  const painelId = useId();
  const notaId = useId();

  useEffect(() => {
    if (!aberto) return;
    function aoApertarFora(e: PointerEvent) {
      if (!caixa.current?.contains(e.target as Node)) aoFechar();
    }
    document.addEventListener("pointerdown", aoApertarFora);
    return () => document.removeEventListener("pointerdown", aoApertarFora);
  }, [aberto, aoFechar]);

  function aoTeclar(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape" || !aberto) return;
    e.stopPropagation();
    aoFechar();
    gatilho.current?.focus();
  }

  function escolher(acao: () => void) {
    aoFechar();
    gatilho.current?.focus();
    acao();
  }

  const lotado = grupo.estado === "lotado";

  return (
    <div ref={caixa} className="relative" onKeyDown={aoTeclar}>
      <button
        ref={gatilho}
        type="button"
        aria-label={`Ações do grupo ${grupo.nome}`}
        aria-expanded={aberto}
        aria-controls={aberto ? painelId : undefined}
        onClick={aoAlternar}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-hover-ficha hover:text-volt-950"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </button>
      {aberto && (
        <div
          id={painelId}
          role="group"
          aria-label={`Ações de ${grupo.nome}`}
          className="absolute right-0 top-12 z-20 flex w-80 max-w-[calc(100vw-2rem)] flex-col rounded-[10px] border border-line-200 bg-paper-0 p-1.5 shadow-deep"
        >
          {lotado ? (
            <>
              <button
                type="button"
                disabled={!grupo.podeReabrir || ocupado}
                aria-describedby={notaId}
                onClick={() => escolher(aoReabrir)}
                className={ITEM}
              >
                Reabrir para receber gente
              </button>
              <p id={notaId} className="mx-3 mb-2 text-13 text-slate-600">
                {grupo.podeReabrir
                  ? `Volta para o link com prioridade sobre o grupo que está enchendo. Lota de novo sozinho em ${lotaDeNovoEm(grupo.capacidade).toLocaleString("pt-BR")}.`
                  : mensagemAindaCheio(grupo.membros, grupo.capacidade)}
              </p>
            </>
          ) : (
            <>
              <button
                type="button"
                disabled={ocupado}
                aria-describedby={notaId}
                onClick={() => escolher(aoMarcar)}
                className={ITEM}
              >
                Marcar como lotado
              </button>
              <p id={notaId} className="mx-3 mb-2 text-13 text-slate-600">
                Sai do link e passa a receber postagem mesmo sem chegar a 95%.
              </p>
            </>
          )}
          <div className="my-1 h-px bg-line-200" aria-hidden="true" />
          {/* O bloco de convite do GroupCard, igual: mesma URL, mesmo feedback; só a margem muda. */}
          <div data-testid="copiar-convite">
            <p className="px-3 pt-2 text-sm font-medium text-volt-950">Copiar convite</p>
            {grupo.inviteUrl ? (
              <CopyLink url={origin && !grupo.inviteUrl.startsWith("http") ? `${origin}${grupo.inviteUrl}` : grupo.inviteUrl} className="px-3 py-2" />
            ) : (
              <p className="font-data px-3 py-2 text-12 text-atencao">Configure o link de convite</p>
            )}
          </div>
          <button type="button" onClick={() => escolher(aoEditarCapacidade)} className={ITEM}>
            Editar capacidade
          </button>
        </div>
      )}
    </div>
  );
}
