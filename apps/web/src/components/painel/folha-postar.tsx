"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { ERRO_SEM_CONEXAO, MessageComposer, type ComposerPayload } from "@/components/painel/messages/message-composer";
import { DestinoGrupos, useCargaDosEstados } from "@/components/painel/messages/destino-grupos";
import type { Destino } from "@/lib/campaigns/destino";
import { destinoDaCampanha, fraseResumo, resumoDoDestino } from "@/lib/campaigns/destino-ui";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import { Bolha } from "./bolha";
import { Folha } from "./folha";

type Campanha = { id: string; name: string; slug?: string };

type Props = {
  id?: string;
  aberta: boolean;
  aoFechar: () => void;
  /** Chamado depois de um post aceito, pra barra mostrar o "7/13". */
  aoPostar: () => Promise<void> | void;
  /** A barra de cima abre a folha em qualquer largura (diálogo centrado no desktop). */
  emQualquerLargura?: boolean;
};

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * Folha de postar (spec 3.2): abre com a última campanha pré-selecionada e a
 * prévia na bolha, como chega no celular de quem compra. Posta pela mesma rota
 * que a tela de Disparos.
 */
export function FolhaPostar({ id, aberta, aoFechar, aoPostar, emQualquerLargura }: Props) {
  const toast = useToast();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [slug, setSlug] = useState("");
  const [live, setLive] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");
  // O destino vale para a campanha em que foi escolhido e para esta abertura:
  // trocar de campanha ou reabrir a folha volta ao atalho padrão.
  const [escolha, setEscolha] = useState<{ slug: string; destino: Destino } | null>(null);
  // Fechada, a folha não busca; reaberta, relê os estados (ela não desmonta ao fechar).
  const estados = useCargaDosEstados(aberta ? slug : "");

  useEffect(() => {
    if (!aberta) {
      // A folha não desmonta ao fechar; sem isto a prévia antiga piscaria ao reabrir.
      setTexto("");
      setEscolha(null);
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    (async () => {
      const [c, s, d] = await Promise.all([
        fetch("/api/campanhas").then((r) => (r.ok ? r.json() : [])).catch(() => []),
        fetch("/api/session").then((r) => (r.ok ? r.json() : {})).catch(() => ({})) as Promise<{ live?: boolean }>,
        fetch("/api/disparos").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ]);
      if (cancelado) return;
      const lista: Campanha[] = Array.isArray(c) ? c : [];
      const disparos: TenantDispatchView[] = Array.isArray(d) ? d : [];
      setCampanhas(lista);
      setLive(Boolean(s?.live));
      // Última campanha usada num disparo; sem histórico, a primeira da lista.
      const chave = (x: Campanha) => x.slug ?? x.id;
      const ultimo = disparos.find((x) => lista.some((y) => chave(y) === x.campaignSlug));
      setSlug(ultimo ? ultimo.campaignSlug : lista[0] ? chave(lista[0]) : "");
      setCarregando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [aberta]);

  const campanha = useMemo(() => campanhas.find((c) => (c.slug ?? c.id) === slug) ?? null, [campanhas, slug]);
  const destino = destinoDaCampanha(escolha, slug);

  async function postar(payload: ComposerPayload) {
    if (!campanha) return false;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/campanhas/${slug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, destino }),
      }).catch(() => null);
      if (!res) {
        setErro(ERRO_SEM_CONEXAO);
        return false;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(body?.error ?? "Não foi possível postar.");
        return false;
      }
      toast("Postado. Acompanhe em Disparos.", "success");
      await aoPostar();
      aoFechar();
      return true;
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Folha
      id={id}
      aberta={aberta}
      aoFechar={aoFechar}
      titulo="Postar"
      testId="painel-folha-postar"
      emQualquerLargura={emQualquerLargura}
      // Tocar no escuro acima é o gesto de baixar o teclado no celular: não pode levar o rascunho.
      fundoFecha={false}
    >
      {carregando ? (
        <div className="space-y-3 pb-4" role="status" aria-label="Carregando as campanhas">
          <div className="pn-skeleton h-12 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
          <div className="pn-skeleton h-32 rounded-[var(--radius-control)]" data-testid="painel-skeleton" />
        </div>
      ) : campanhas.length === 0 ? (
        <div className="pb-6 text-center">
          <p className="text-15 text-volt-950">Crie uma campanha primeiro: é ela que diz em quais grupos o post entra.</p>
          <Link
            href="/painel/campanhas/nova"
            onClick={aoFechar}
            className="mt-4 inline-flex h-12 items-center justify-center rounded-[var(--radius-control)] bg-cobalt-500 px-5 text-15 font-semibold text-white"
          >
            Criar campanha
          </Link>
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          {/* A API recusa postar E agendar sem número conectado (409): nada fica na fila. */}
          {live === false && (
            <p className="rounded-[var(--radius-control)] bg-aviso-fundo px-3 py-2 text-13 text-volt-950">
              WhatsApp desconectado: pra postar ou agendar,{" "}
              <Link href="/painel/conectar" onClick={aoFechar} className="font-semibold text-cobalt-500">
                reconecte o número
              </Link>{" "}
              primeiro.
            </p>
          )}

          <label className="block">
            <span className="text-13 font-semibold text-slate-600">Campanha</span>
            <select
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setEscolha(null); // voltar à campanha anterior não ressuscita a lista fixa dela
              }}
              className="mt-1 h-12 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-[16px] text-volt-950"
            >
              {campanhas.map((c) => (
                <option key={c.id} value={c.slug ?? c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {campanha && estados.carga === "pronto" && (
              <span className="font-data mt-1 block text-13 tabular-nums text-slate-600">
                {fraseResumo(resumoDoDestino(estados.grupos, destino))}
              </span>
            )}
          </label>

          <DestinoGrupos
            estados={estados}
            value={destino}
            onChange={(d) => setEscolha({ slug, destino: d })}
            compacto
          />

          <Bolha
            grupo={campanha?.name ?? "Seu grupo"}
            hora={hora.format(new Date())}
            texto={texto}
            vazio="Sua novidade aparece aqui como chega no celular."
            testId="painel-bolha-previa"
          />

          <MessageComposer onSend={postar} sending={enviando} onBodyChange={setTexto} />
          {erro && <p className="text-13 text-alerta">{erro}</p>}
        </div>
      )}
    </Folha>
  );
}
