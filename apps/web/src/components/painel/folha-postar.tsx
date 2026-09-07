"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/toast";
import { MessageComposer, type ComposerPayload } from "@/components/painel/messages/message-composer";
import type { TenantDispatchView } from "@/lib/campaigns/dispatch-view";
import { Folha } from "./folha";

type Campanha = { id: string; name: string; slug?: string; groupIds?: string[] };

type Props = {
  id?: string;
  aberta: boolean;
  aoFechar: () => void;
  /** Chamado depois de um post aceito, pra barra mostrar o "7/13". */
  aoPostar: () => Promise<void> | void;
};

const hora = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * Folha de postar (spec 3.2): abre com a última campanha pré-selecionada e a
 * prévia na bolha, como chega no celular de quem compra. Posta pela mesma rota
 * que a tela de Disparos.
 */
export function FolhaPostar({ id, aberta, aoFechar, aoPostar }: Props) {
  const toast = useToast();
  const [campanhas, setCampanhas] = useState<Campanha[]>([]);
  const [slug, setSlug] = useState("");
  const [live, setLive] = useState<boolean | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [texto, setTexto] = useState("");

  useEffect(() => {
    if (!aberta) {
      // A folha não desmonta ao fechar; sem isto a prévia antiga piscaria ao reabrir.
      setTexto("");
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

  async function postar(payload: ComposerPayload) {
    if (!campanha) return;
    setEnviando(true);
    setErro(null);
    try {
      const res = await fetch(`/api/campanhas/${slug}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, groupIds: campanha.groupIds ?? [] }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErro(body?.error ?? "Não foi possível postar.");
        return;
      }
      toast("Postado. Acompanhe em Disparos.", "success");
      await aoPostar();
      aoFechar();
    } finally {
      setEnviando(false);
    }
  }

  return (
    <Folha id={id} aberta={aberta} aoFechar={aoFechar} titulo="Postar" testId="painel-folha-postar">
      {carregando ? (
        <div className="space-y-3 pb-4">
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
          {live === false && (
            <p className="rounded-[var(--radius-control)] bg-aviso-fundo px-3 py-2 text-13 text-volt-950">
              WhatsApp desconectado: o post fica na fila até você{" "}
              <Link href="/painel/conectar" onClick={aoFechar} className="font-semibold text-cobalt-500">
                reconectar
              </Link>
              .
            </p>
          )}

          <label className="block">
            <span className="text-13 font-semibold text-slate-600">Campanha</span>
            <select
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="mt-1 h-12 w-full rounded-[var(--radius-control)] border border-line-200 bg-paper-0 px-3 text-[16px] text-volt-950"
            >
              {campanhas.map((c) => (
                <option key={c.id} value={c.slug ?? c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {campanha && (
              <span className="font-data mt-1 block text-12 tabular-nums text-slate-600">
                {campanha.groupIds?.length ?? 0} grupos
              </span>
            )}
          </label>

          <div className="pn-bolha-chat">
            <p className="pn-bolha-chat__grupo">{campanha?.name ?? "Seu grupo"}</p>
            <div className="pn-bolha" data-testid="painel-bolha-previa">
              {texto || <span className="text-slate-600">Sua novidade aparece aqui como chega no celular.</span>}
              <span className="pn-bolha__hora">
                {hora.format(new Date())}
                <svg viewBox="0 0 16 16" className="pn-bolha__check" aria-hidden="true">
                  <path
                    d="M1.5 8.5l3 3 6-6M6.5 11.5l7-7"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
            </div>
          </div>

          <MessageComposer onSend={postar} sending={enviando} onBodyChange={setTexto} />
          {erro && <p className="text-13 text-alerta">{erro}</p>}
        </div>
      )}
    </Folha>
  );
}
