"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  NAV_ALL,
  NAV_GRUPOS_ORDEM,
  NAV_GRUPO_TITULO,
  isNavItemActive,
  resumo,
  type ResumoDados,
} from "@/lib/painel-nav";
import { Folha } from "./folha";

type Linha = { status?: string; enabled?: boolean; createdAt?: string };

/** Aceita lista pura ou envelope ({ offers: [...] }, como /api/relampago/offers). */
async function lista(url: string): Promise<Linha[]> {
  const r = await fetch(url).then((res) => (res.ok ? res.json() : [])).catch(() => []);
  if (Array.isArray(r)) return r;
  const envelope = r && typeof r === "object" ? Object.values(r).find(Array.isArray) : undefined;
  return Array.isArray(envelope) ? envelope : [];
}

/**
 * "Mais" da casca mobile (spec 3.2): todos os módulos por grupo do corredor, com
 * o estado de cada um antes do toque. Busca só quando abre.
 */
export function FolhaMais({ aberta, aoFechar }: { aberta: boolean; aoFechar: () => void }) {
  const pathname = usePathname();
  const [dados, setDados] = useState<ResumoDados | null>(null);

  useEffect(() => {
    if (!aberta) return;
    let cancelado = false;
    (async () => {
      const [campanhas, disparos, ofertas, automacoes, paginas] = await Promise.all([
        lista("/api/campanhas"),
        lista("/api/disparos"),
        lista("/api/relampago/offers"),
        lista("/api/automations"),
        lista("/api/pages"),
      ]);
      if (cancelado) return;
      setDados({
        campanhas: campanhas.length,
        ultimoDisparo: disparos[0]?.createdAt ?? null,
        relampagoAoVivo: ofertas.some((o) => o.status === "open"),
        automacoes: { ligadas: automacoes.filter((a) => a.enabled).length, total: automacoes.length },
        paginasNoAr: paginas.filter((p) => p.status === "published").length,
      });
    })();
    return () => {
      cancelado = true;
    };
  }, [aberta]);

  const linhas = dados ? resumo(dados) : {};

  return (
    <Folha aberta={aberta} aoFechar={aoFechar} titulo="Mais" testId="painel-folha-mais">
      <nav aria-label="Todos os módulos" className="space-y-4 pb-2">
        {NAV_GRUPOS_ORDEM.map((grupo) => (
          <section key={grupo}>
            <h3 className="font-data px-2 pb-1 text-12 uppercase tracking-[0.08em] text-slate-600">
              {NAV_GRUPO_TITULO[grupo]}
            </h3>
            <ul>
              {NAV_ALL.filter((item) => item.grupo === grupo).map(({ href, label, icon: Icon }) => {
                const ativo = isNavItemActive(pathname, href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={aoFechar}
                      aria-current={ativo ? "page" : undefined}
                      className="pn-folha__item"
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0 text-slate-600" strokeWidth={1.75} />
                      <span className={linhas[href] ? "font-data text-13 tabular-nums" : "font-medium"}>
                        {linhas[href] ?? label}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </nav>
    </Folha>
  );
}
