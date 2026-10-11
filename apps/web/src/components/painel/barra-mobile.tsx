"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { Menu } from "lucide-react";
import { acessoRestrito } from "@/lib/auth/modulos";
import { cn } from "@/lib/utils";
import {
  NAV_BARRA_DIREITA,
  NAV_BARRA_ESQUERDA,
  isNavItemActive,
  itensDaBarra,
  podePostar,
  visivelNoMenu,
  type NavItem,
} from "@/lib/painel-nav";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import { useCasca } from "./casca-context";
import { FolhaMais } from "./folha-mais";
import { FolhaPostar } from "./folha-postar";
import { useRole } from "./role-provider";

type EmVoo = { sent: number; total: number } | null;

async function disparoEmVoo(): Promise<EmVoo> {
  const lista: TenantDispatchView[] = await fetch("/api/disparos")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  const ativo = Array.isArray(lista)
    ? lista.find((d) => d.status === "queued" || d.status === "running")
    : undefined;
  return ativo && ativo.total > 0 ? { sent: ativo.sent, total: ativo.total } : null;
}

/**
 * Disparo em voo (fila ou enviando). Só consulta enquanto houver um — e só para
 * quem pode postar: sem o módulo, `/api/disparos` daria 403 para a vendedora.
 */
function useDisparoEmVoo(ativo: boolean) {
  const [emVoo, setEmVoo] = useState<EmVoo>(null);

  const recarregar = useCallback(async () => {
    setEmVoo(await disparoEmVoo());
  }, []);

  useEffect(() => {
    if (!ativo) return;
    let cancelado = false;
    void disparoEmVoo().then((voo) => {
      if (!cancelado) setEmVoo(voo);
    });
    return () => {
      cancelado = true;
    };
  }, [ativo]);

  const voando = emVoo !== null;
  useEffect(() => {
    if (!voando) return;
    const t = setInterval(() => void recarregar(), 10_000);
    return () => clearInterval(t);
  }, [voando, recarregar]);

  return { emVoo, recarregar };
}

function Item({ item, pathname }: { item: NavItem; pathname: string }) {
  const ativo = isNavItemActive(pathname, item.href);
  const Icon = item.icon;
  return (
    <Link href={item.href} aria-current={ativo ? "page" : undefined} className="pn-barra-mobile__item">
      <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

/**
 * Barra inferior da Vitrine Aberta (spec 3.2): Início, Grupos, Postar, Contatos,
 * Mais. Postar é o único Acid tocável do painel e está em toda tela; em voo
 * mostra "7/13" com a barra de 3px na base.
 *
 * Acesso restrito, vendedora ou papel desconhecido (spec 2026-10-07 §4): os itens dele (Vendas; Disparos com `postar`)
 * e o Postar se liberado, sem Mais. Até o `/api/auth/me` responder a barra fica
 * vazia no lugar — sem isso o menu do dono piscaria para ela.
 */
export function BarraMobile() {
  const pathname = usePathname();
  const [folha, setFolha] = useState<"postar" | "mais" | null>(null);
  const fechar = useCallback(() => setFolha(null), []);
  const { carregado, acesso } = useRole();
  const { foco, liberacoes } = useCasca();
  const comPostar = carregado && podePostar(acesso);
  const { emVoo, recarregar } = useDisparoEmVoo(comPostar);
  const idPostar = useId();
  const idMais = useId();
  if (foco) return null;

  const restrito = acessoRestrito(acesso);
  const visivel = (item: NavItem) => visivelNoMenu(item, acesso, liberacoes);
  const esquerda = !carregado ? [] : restrito ? itensDaBarra(acesso, liberacoes) : NAV_BARRA_ESQUERDA.filter(visivel);
  const direita = carregado && !restrito ? NAV_BARRA_DIREITA.filter(visivel) : [];
  const comMais = carregado && !restrito;
  // Dono: 2 + Postar + 1 + Mais = as 5 colunas do CSS. Vendedora: 1 ou 3.
  const colunas = esquerda.length + direita.length + Number(comPostar) + Number(comMais);

  return (
    <>
      <nav
        data-testid="painel-mobile-nav"
        aria-label="Navegação"
        aria-busy={!carregado || undefined}
        className="pn-barra-mobile fixed inset-x-0 bottom-0 z-30 lg:hidden"
        style={colunas > 0 ? { gridTemplateColumns: `repeat(${colunas}, 1fr)` } : undefined}
      >
        {esquerda.map((item) => (
          <Item key={item.href} item={item} pathname={pathname} />
        ))}
        {comPostar && (
          <div className="flex items-center justify-center">
            <span className="pn-postar-sombra">
              <button
                type="button"
                data-testid="painel-postar"
                aria-haspopup="dialog"
                aria-expanded={folha === "postar"}
                aria-controls={idPostar}
                aria-label={emVoo ? `Postar (enviando ${emVoo.sent} de ${emVoo.total} grupos)` : "Postar"}
                onClick={() => setFolha("postar")}
                className={cn("pn-postar", emVoo && "pn-postar--voo")}
                style={emVoo ? { ["--p" as string]: emVoo.sent / emVoo.total } : undefined}
              >
                {emVoo ? (
                  <span className="font-data text-13 tabular-nums">
                    {emVoo.sent}/{emVoo.total}
                  </span>
                ) : (
                  "Postar"
                )}
              </button>
            </span>
          </div>
        )}
        {direita.map((item) => (
          <Item key={item.href} item={item} pathname={pathname} />
        ))}
        {comMais && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-expanded={folha === "mais"}
            aria-controls={idMais}
            onClick={() => setFolha("mais")}
            className="pn-barra-mobile__item"
          >
            <Menu className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            Mais
          </button>
        )}
      </nav>

      {comPostar && <FolhaPostar id={idPostar} aberta={folha === "postar"} aoFechar={fechar} aoPostar={recarregar} />}
      {comMais && <FolhaMais id={idMais} aberta={folha === "mais"} aoFechar={fechar} />}
    </>
  );
}
