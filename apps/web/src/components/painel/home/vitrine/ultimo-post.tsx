"use client";

import Link from "next/link";
import type { Disparo } from "@/components/painel/home/types";
import { Bolha } from "@/components/painel/bolha";
import { horaBR } from "@/lib/date-br";
import { diaHoraCurto } from "@/lib/painel/inicio";

/**
 * Bloco 5 (12.3): o último post como chegou no celular (pn-bolha) e a linha de
 * cupom com um quadradinho por grupo alcançado.
 */
export function UltimoPost({ disparos, agora }: { disparos: readonly Disparo[]; agora: Date }) {
  const post = [...disparos]
    .filter((d) => d.dispatchedAt && (d.status === "sent" || d.status === "running"))
    .sort((a, b) => (b.dispatchedAt ?? "").localeCompare(a.dispatchedAt ?? ""))[0];

  if (!post) {
    return (
      <div className="pn-card rounded-[var(--radius-control)] p-5">
        <p className="text-15 text-volt-950">Nenhum post ainda.</p>
        <p className="mt-1 text-13 text-slate-600">O que você postar aparece aqui do jeito que chega no celular da cliente.</p>
        <Link href="/painel/disparos" className="mt-3 inline-flex min-h-11 items-center text-15 font-semibold text-cobalt-500">
          Postar novidade
        </Link>
      </div>
    );
  }

  const total = Math.max(0, Math.min(post.total ?? 0, 40));
  const entregues = Math.max(0, Math.min(post.sent ?? 0, total));

  return (
    <div data-testid="inicio-ultimo-post" className="pn-card rounded-[var(--radius-control)] p-4">
      <Bolha
        grupo={`${post.campaignName ?? "Seus grupos"} · ${post.total} ${post.total === 1 ? "grupo" : "grupos"}`}
        hora={horaBR(post.dispatchedAt)}
        texto={post.body ?? ""}
        vazio="Post com mídia, sem texto."
      />
      <div className="pn-cupom mt-3 flex flex-wrap items-center justify-between gap-2">
        <span>
          {diaHoraCurto(post.dispatchedAt!, agora)} · {post.sent} / {post.total} grupos
        </span>
        <span className="pn-cupom__quadrados" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <i key={i} className={i < entregues ? "is-entregue" : undefined} />
          ))}
        </span>
      </div>
      <Link href="/painel/disparos" className="mt-2 inline-flex min-h-11 items-center text-13 font-semibold text-cobalt-500 lg:min-h-8">
        Ver disparos
      </Link>
    </div>
  );
}
