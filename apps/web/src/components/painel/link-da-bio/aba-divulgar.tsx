// apps/web/src/components/painel/link-da-bio/aba-divulgar.tsx
"use client";

import React, { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Copy, Download } from "lucide-react";

import { Interruptor } from "@/components/painel/instagram/interruptor";
import { useToast } from "@/components/toast";
import { enderecoPrincipal, type ContextoDoEditor } from "@/lib/bio/editor";
import {
  avisoDoSlug,
  ehRespostaDoSlug,
  motivoLocalDoSlug,
  prefixoDoSlug,
  slugDoCampo,
  textoDoNoAr,
  type AvisoDoSlug,
  type ConsultaDoSlug,
} from "@/lib/bio/editor-divulgar";
import type { RespostaDoSlug } from "@/lib/bio/painel-api";
import type { PaginaBio } from "@/lib/stores/bio-pages";
import { authenticatedFetch } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

import type { PropsDaAba } from "./abas";
import { AvisoDaAba, useErroDaAba, type ErroDaAba } from "./erro-da-aba";
import { NumerosDaPagina } from "./numeros-da-pagina";

const FOCO = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-500";
const ROTULO = "text-15 font-semibold text-volt-950";
const AJUDA = "text-13 text-slate-600";
const SECUNDARIO = `inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border border-line-200 bg-paper-0 px-4 text-15 font-semibold text-volt-950 transition-colors hover:border-slate-600 ${FOCO}`;
const CARTAO = "pn-card grid gap-4 rounded-xl p-4 lg:p-5";
const TITULO = "font-brand text-15 font-bold text-volt-950";
const TOM: Readonly<Record<AvisoDoSlug["tom"], string>> = {
  neutro: "text-slate-600",
  ok: "text-success-700",
  erro: "font-medium text-danger-700",
};

/** Os campos da aba que mostram erro do salvar; o resto vai pro aviso do topo. */
const LUGARES_DO_DIVULGAR: readonly string[] = ["slug"];
/** A conferência espera a digitação parar (§8, "com atraso"). */
const ESPERA_DO_SLUG_MS = 400;

/** O endereço digitado está livre? 400 ms depois da última tecla; só a última resposta vale. */
function useConsultaDoSlug(slug: string, salvo: string): ConsultaDoSlug | null {
  const [consulta, setConsulta] = useState<ConsultaDoSlug | null>(null);
  const conferir = slug !== salvo && motivoLocalDoSlug(slug) === null;
  useEffect(() => {
    if (!conferir) return;
    let valendo = true;
    const espera = setTimeout(() => {
      void (async () => {
        let resposta: RespostaDoSlug | null = null;
        try {
          const r = await authenticatedFetch(`/api/link-da-bio/slug?valor=${encodeURIComponent(slug)}`, { cache: "no-store" });
          const corpo: unknown = r.ok ? await r.json() : null;
          if (ehRespostaDoSlug(corpo)) resposta = corpo;
        } catch {
          // Sem rede: `resposta` fica null e a tela diz que não deu pra conferir (o PATCH confere de novo).
        }
        if (valendo) setConsulta({ slug, resposta });
      })();
    }, ESPERA_DO_SLUG_MS);
    return () => {
      valendo = false;
      clearTimeout(espera);
    };
  }, [slug, conferir]);
  return consulta;
}

function CartaoNoAr({ pagina, publicada, aoMudar }: { pagina: PaginaBio; publicada: boolean; aoMudar: (publicada: boolean) => void }) {
  const bloqueada = pagina.bloqueadaEm !== null;
  return (
    <section aria-labelledby="bio-no-ar-titulo" className={CARTAO}>
      <div className="flex items-center gap-3">
        <div className="grid min-w-0 flex-1 gap-0.5">
          <h2 id="bio-no-ar-titulo" className={TITULO}>
            Página no ar
          </h2>
          <p className={AJUDA}>{textoDoNoAr(publicada, pagina.publicada, bloqueada)}</p>
        </div>
        <Interruptor ligado={publicada && !bloqueada} aoMudar={aoMudar} rotulo="Página no ar" desabilitado={bloqueada} />
      </div>
    </section>
  );
}

function CartaoEndereco({
  pagina,
  slug,
  contexto,
  erros,
  aoMudarSlug,
  aoCopiar,
}: {
  pagina: PaginaBio;
  slug: string;
  contexto: ContextoDoEditor;
  erros: ErroDaAba;
  aoMudarSlug: (slug: string) => void;
  aoCopiar: (url: string) => void;
}) {
  const consulta = useConsultaDoSlug(slug, pagina.slug);
  const prefixo = prefixoDoSlug(contexto.origemGirumo);
  const doSalvar = erros.erroDe("slug");
  const aviso: AvisoDoSlug = doSalvar ? { texto: doSalvar, tom: "erro" } : avisoDoSlug(slug, pagina.slug, consulta, prefixo);
  // O endereço que vai na bio é sempre o SALVO (§2, §8); o slug em edição só vale depois do Salvar.
  const principal = enderecoPrincipal(contexto, pagina.slug);
  return (
    <section aria-labelledby="bio-endereco-titulo" className={CARTAO}>
      <h2 id="bio-endereco-titulo" className={TITULO}>
        Endereço da página
      </h2>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-[1_1_220px] break-all font-data text-15 font-medium text-volt-950">{principal}</p>
        <button type="button" onClick={() => aoCopiar(principal)} className={SECUNDARIO}>
          <Copy className="h-4 w-4" aria-hidden="true" />
          Copiar o endereço
        </button>
      </div>
      {contexto.dominio && <p className={AJUDA}>No seu domínio. O endereço na Girumo, aqui embaixo, também abre a página.</p>}
      <div className="grid gap-1.5">
        <label htmlFor="bio-slug" className={ROTULO}>
          Endereço na Girumo
        </label>
        <div
          className={cn(
            "flex min-h-11 items-center rounded-lg border bg-paper-0 focus-within:outline-2 focus-within:outline-cobalt-500",
            aviso.tom === "erro" ? "border-danger-700" : "border-line-200",
          )}
        >
          <span aria-hidden="true" className="whitespace-nowrap pl-3 font-data text-[16px] text-slate-600">
            {prefixo}
          </span>
          <input
            type="text"
            id="bio-slug"
            value={slug}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={aviso.tom === "erro" ? true : undefined}
            aria-describedby="bio-slug-msg"
            onChange={(e) => {
              erros.corrigiu("slug");
              aoMudarSlug(slugDoCampo(e.target.value));
            }}
            className="min-h-11 min-w-0 flex-1 rounded-r-lg bg-transparent py-2.5 pr-3 font-data text-[16px] text-volt-950 outline-none"
          />
        </div>
        <p id="bio-slug-msg" aria-live="polite" className={cn("text-13", TOM[aviso.tom])}>
          {aviso.texto}
        </p>
        {slug !== pagina.slug && (
          <p className={AJUDA}>
            {`Quando você salvar, o endereço antigo (${prefixo}${pagina.slug}) passa a levar pro novo. Quem tiver o QR ou o link antigo continua chegando.`}
          </p>
        )}
      </div>
    </section>
  );
}

function CartaoInstagram() {
  return (
    <section aria-labelledby="bio-instagram-titulo" className={CARTAO}>
      <h2 id="bio-instagram-titulo" className={TITULO}>
        Pôr na bio do Instagram
      </h2>
      <ol className="grid list-decimal gap-1.5 pl-5 text-15 text-volt-950">
        <li>Toque em Copiar o endereço, aqui em cima.</li>
        <li>No Instagram, abra o seu perfil e toque em Editar perfil.</li>
        <li>Em Links, toque em Adicionar link externo, cole o endereço e salve.</li>
      </ol>
    </section>
  );
}

/**
 * QR do endereço na Girumo com o slug SALVO, mesmo com domínio próprio: vai impresso na sacola e
 * sobrevive à troca de endereço (o antigo leva ao novo, §2) e à de domínio. Gerado no navegador,
 * como o QR da campanha (`campanhas/qr-link.tsx`): o link não sai da máquina.
 */
function CartaoQr({ endereco, slug }: { endereco: string; slug: string }) {
  const qr = useRef<HTMLCanvasElement>(null);
  function baixar() {
    const canvas = qr.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-link-da-bio-${slug}.png`;
    a.click();
  }
  return (
    <section aria-labelledby="bio-qr-titulo" className={CARTAO}>
      <div className="flex flex-wrap items-center gap-4">
        <QRCodeCanvas
          ref={qr}
          value={endereco}
          size={512}
          level="M"
          marginSize={4}
          bgColor="#FFFFFF"
          fgColor="#071923"
          style={{ width: 128, height: 128 }}
          aria-label={`QR code que abre ${endereco}`}
          className="flex-none rounded-lg ring-1 ring-line-200"
        />
        <div className="grid min-w-0 flex-[1_1_220px] gap-2">
          <h2 id="bio-qr-titulo" className={TITULO}>
            QR code
          </h2>
          <p className={AJUDA}>
            Pra imprimir na sacola, na etiqueta e no balcão. Ele abre o endereço na Girumo, que continua valendo mesmo depois de
            trocar o endereço ou o domínio.
          </p>
          <button type="button" onClick={baixar} className={cn(SECUNDARIO, "w-fit")}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Baixar o QR code
          </button>
        </div>
      </div>
    </section>
  );
}

/** Aba Divulgar (spec §8): no ar, o endereço (com o slug editável), o Instagram, o QR e os números. */
export function AbaDivulgar({ pagina, rascunho, contexto, mudarPagina, erro, limparErro }: PropsDaAba) {
  const toast = useToast();
  const erros = useErroDaAba(erro, limparErro, LUGARES_DO_DIVULGAR, pagina.versao);

  async function copiar(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast("Endereço copiado. Agora é só colar na bio.");
    } catch {
      toast("Não deu pra copiar. Selecione o endereço e copie à mão.", "error");
    }
  }

  return (
    <div className="grid gap-4">
      {erros.erroSolto && <AvisoDaAba mensagem={erros.erroSolto} />}
      <CartaoNoAr pagina={pagina} publicada={rascunho.publicada} aoMudar={(publicada) => mudarPagina({ publicada })} />
      <CartaoEndereco
        pagina={pagina}
        slug={rascunho.slug}
        contexto={contexto}
        erros={erros}
        aoMudarSlug={(slug) => mudarPagina({ slug })}
        aoCopiar={(url) => void copiar(url)}
      />
      <CartaoInstagram />
      <CartaoQr endereco={enderecoPrincipal({ dominio: null, origemGirumo: contexto.origemGirumo }, pagina.slug)} slug={pagina.slug} />
      {/* Os títulos vêm da versão salva: é ela que está no ar e que recebe os toques. */}
      <NumerosDaPagina links={pagina.documento.links} />
    </div>
  );
}
