"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ALL, NAV_GRUPOS_ORDEM, NAV_GRUPO_TITULO, isNavItemActive, resumo, visivelNoMenu, type ResumoDados } from "@/lib/painel-nav";
import { useCasca } from "./casca-context";
import { useRole } from "./role-provider";

type Props = {
  dados: ResumoDados | null;
  aoEscolher: () => void;
  classeDoGrupo: string;
  classeDoItem: string;
};

/**
 * Todos os módulos por verbo (Vender, Lotar, Loja) com o estado de cada um
 * antes do toque. A folha "Mais" do celular e o menu "Mais" da barra
 * renderizam esta lista; só as classes mudam. Filtra pelo acesso de quem vê
 * (spec 2026-10-07 §1): Vendas não entra no Mais do dono.
 */
export function ListaDosModulos({ dados, aoEscolher, classeDoGrupo, classeDoItem }: Props) {
  const pathname = usePathname();
  const { liberacoes } = useCasca();
  const { acesso } = useRole();
  const linhas = dados ? resumo(dados) : {};
  return (
    <>
      {NAV_GRUPOS_ORDEM.map((grupo) => (
        <section key={grupo}>
          <h3 className={classeDoGrupo}>{NAV_GRUPO_TITULO[grupo]}</h3>
          <ul>
            {NAV_ALL.filter((item) => item.grupo === grupo && visivelNoMenu(item, acesso, liberacoes)).map(({ href, label, icon: Icon }) => {
              const ativo = isNavItemActive(pathname, href);
              return (
                <li key={href}>
                  <Link href={href} onClick={aoEscolher} aria-current={ativo ? "page" : undefined} className={classeDoItem}>
                    <Icon className="h-[18px] w-[18px] shrink-0 text-slate-600" strokeWidth={1.75} aria-hidden="true" />
                    <span className={linhas[href] ? "font-data text-13 tabular-nums" : "font-medium"}>{linhas[href] ?? label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </>
  );
}
