"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";

import { BLOCO } from "@/components/painel/configuracoes/bling-painel-estilo";
import { diaMesBR } from "@/lib/date-br";
import { corDoMedidor, type SaudeDoCodigo } from "@/lib/rastreio/entregas";
import { authenticatedFetch } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import { useRastreioLiberado } from "./use-rastreio-liberado";

const LINK = "text-13 text-cobalt-700 underline underline-offset-2";

/** O desenho do bloco, testado sem navegador. */
export function PainelDoBlocoCodigo({ saude }: { saude: SaudeDoCodigo }) {
  const { enviados, comCodigo, maisAntigoSemCodigo } = saude;
  const atencao = corDoMedidor(comCodigo, enviados) === "atencao";
  const largura = enviados > 0 ? Math.round((comCodigo / enviados) * 100) : 0;

  return (
    <section className={BLOCO} aria-labelledby="yampi-codigo-titulo" data-testid="yampi-bloco-codigo">
      <h3 id="yampi-codigo-titulo" className="text-15 font-semibold text-volt-950">
        Código de rastreio nos pedidos enviados
      </h3>
      {enviados === 0 ? (
        <p className="mt-2 text-13 text-slate-600">Nenhum pedido enviado nos últimos 7 dias.</p>
      ) : (
        <>
          <p className="mt-2 text-[14px] text-volt-950">
            <span className="font-data tabular-nums">{`${comCodigo} de ${enviados}`}</span>{" "}
            enviados nos últimos 7 dias chegaram com código
          </p>
          <div className="mt-2 h-2 w-full max-w-sm overflow-hidden rounded-full bg-line-200" aria-hidden="true">
            <div
              className={cn("h-full rounded-full", atencao ? "bg-warning-700" : "bg-success-700")}
              style={{ width: `${largura}%` }}
            />
          </div>
        </>
      )}
      {maisAntigoSemCodigo && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-13 text-warning-700">
          {`Pedido nº ${maisAntigoSemCodigo.numero} está faturado desde ${diaMesBR(maisAntigoSemCodigo.desde) ?? "—"} e ainda sem código.`}
          <Link href="/painel/vendas/entregas?filtro=sem_codigo" className={LINK}>
            Ver em Entregas
          </Link>
        </p>
      )}
      <p className="mt-3 text-13 text-slate-600">
        O código chega sozinho quando a etiqueta é comprada pelo Melhor Envio dentro da Yampi. Se a etiqueta sai pelo
        Bling, ligue “Sincronizar rastreamento automaticamente” nas configurações de lojas virtuais do Bling.
      </p>
      <p className="mt-2 text-13 text-slate-600">
        A Girumo lê os pedidos e cria na sua loja só o aviso de pedido novo. Não muda pedido, produto nem preço.
      </p>
      <p className="mt-2 text-13 text-slate-600">
        Os avisos e a página de rastreio ficam em{" "}
        <Link href="/painel/configuracoes?secao=rastreio" className={LINK}>
          Rastreio de pedidos
        </Link>
      </p>
    </section>
  );
}

/** O bloco do Rastreio dentro do cartão da Yampi. Sem liberação ou com erro, some sem barulho. */
export function BlocoCodigoRastreio() {
  const liberado = useRastreioLiberado();
  const [saude, setSaude] = useState<SaudeDoCodigo | null>(null);

  useEffect(() => {
    if (!liberado) return;
    let vivo = true;
    authenticatedFetch("/api/rastreio/saude")
      .then((res) => (res.ok ? (res.json() as Promise<SaudeDoCodigo>) : null))
      .then((s) => {
        if (vivo) setSaude(s);
      })
      .catch(() => {
        if (vivo) setSaude(null);
      });
    return () => {
      vivo = false;
    };
  }, [liberado]);

  if (!liberado || !saude) return null;
  return <PainelDoBlocoCodigo saude={saude} />;
}
