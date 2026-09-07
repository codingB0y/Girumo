"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useState } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_BARRA_DIREITA, NAV_BARRA_ESQUERDA, isNavItemActive, type NavItem } from "@/lib/painel-nav";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import { FolhaMais } from "./folha-mais";
import { FolhaPostar } from "./folha-postar";

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

/** Disparo em voo (fila ou enviando). Só consulta enquanto houver um. */
function useDisparoEmVoo() {
  const [emVoo, setEmVoo] = useState<EmVoo>(null);

  const recarregar = useCallback(async () => {
    setEmVoo(await disparoEmVoo());
  }, []);

  useEffect(() => {
    let cancelado = false;
    void disparoEmVoo().then((voo) => {
      if (!cancelado) setEmVoo(voo);
    });
    return () => {
      cancelado = true;
    };
  }, []);

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
 */
export function BarraMobile() {
  const pathname = usePathname();
  const [folha, setFolha] = useState<"postar" | "mais" | null>(null);
  const fechar = useCallback(() => setFolha(null), []);
  const { emVoo, recarregar } = useDisparoEmVoo();
  const idPostar = useId();
  const idMais = useId();

  return (
    <>
      <nav
        data-testid="painel-mobile-nav"
        aria-label="Navegação"
        className="pn-barra-mobile fixed inset-x-0 bottom-0 z-30 lg:hidden"
      >
        {NAV_BARRA_ESQUERDA.map((item) => (
          <Item key={item.href} item={item} pathname={pathname} />
        ))}
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
        {NAV_BARRA_DIREITA.map((item) => (
          <Item key={item.href} item={item} pathname={pathname} />
        ))}
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
      </nav>

      <FolhaPostar id={idPostar} aberta={folha === "postar"} aoFechar={fechar} aoPostar={recarregar} />
      <FolhaMais id={idMais} aberta={folha === "mais"} aoFechar={fechar} />
    </>
  );
}
