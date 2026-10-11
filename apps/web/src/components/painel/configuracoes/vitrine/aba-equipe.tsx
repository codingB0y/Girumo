"use client";

import type { ModuloOpcional } from "@/lib/auth/modulos";
import { ConviteDaEquipe, type PropsDoConvite } from "./convite-da-equipe";
import { FichaDoMembro, type MembroNaTela } from "./ficha-do-membro";

export type { MembroNaTela };

export type PropsDaEquipe = PropsDoConvite & {
  membros: readonly MembroNaTela[];
  /**
   * Lista vazia não é o mesmo que "só você", e "ainda não voltou" não é o mesmo
   * que "falhou" — são três telas, não duas.
   */
  carga: "carregando" | "ok" | "erro";
  aviso: string | null;
  removendoId: string | null;
  onRemover: (m: MembroNaTela) => void;
  onSalvarAcesso: (id: string, modulos: ModuloOpcional[]) => Promise<void>;
};

/** Equipe como fichas de 64px (spec 12.6), com o convite embaixo. Todo o estado vem da página. */
export function AbaEquipe({
  membros,
  carga,
  aviso,
  removendoId,
  onRemover,
  onSalvarAcesso,
  ...convite
}: PropsDaEquipe) {
  return (
    <section className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8" data-testid="configuracoes-equipe">
      {carga === "carregando" ? (
        <div
          className="pn-skeleton h-32 rounded-[var(--radius-control)]"
          data-testid="painel-skeleton"
          role="status"
          aria-label="Carregando a equipe"
        />
      ) : carga === "erro" ? (
        // Lista vazia por falha de rota diria "só você" a quem tem equipe.
        <p className="text-[14px] text-slate-600">
          Não deu para carregar a equipe agora. Atualize a página em alguns instantes.
        </p>
      ) : membros.length === 0 ? (
        <p className="text-[14px] text-slate-600">Só você por enquanto. Convide alguém abaixo.</p>
      ) : (
        <ul>
          {membros.map((m) => (
            <FichaDoMembro
              key={m.id}
              membro={m}
              removendo={removendoId === m.id}
              onRemover={onRemover}
              onSalvarAcesso={onSalvarAcesso}
            />
          ))}
        </ul>
      )}

      <ConviteDaEquipe {...convite} />

      {aviso && (
        <p role="status" className="mt-3 text-13 text-slate-600">
          {aviso}
        </p>
      )}
    </section>
  );
}
