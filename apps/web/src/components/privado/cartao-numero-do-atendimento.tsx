"use client";

import { useCallback, useEffect, useState } from "react";
import { Power } from "lucide-react";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { Etiqueta, PainelDoCodigo } from "@/components/painel/conectar/vitrine/conectar-vitrine";
import { useRole } from "@/components/painel/role-provider";
import { POLL_MS, WATCH_MS } from "@/lib/engine-poll";
import { etiquetaDaConexao, telefoneNaVitrine } from "@/lib/painel/conectar";
import {
  cenaDoCartao,
  noArDesde,
  recusadoPeloChipDosGrupos,
  textoDaSaude,
  type CartaoDoNumero,
} from "@/lib/privado/cartao";

/** Mesmo botão primário do "Gerar QR code" de `pergunta-perfil-numero.tsx`. */
const BOTAO_PRIMARIO = "min-h-11 rounded-md bg-cobalt-500 px-4 py-2 text-white disabled:opacity-50";

/**
 * O número do atendimento na página Conectar: o WhatsApp que fala com a cliente no privado (Recuperar
 * e Rastreio), separado do número dos grupos. Mora ao lado do cartão do número dos grupos, mas é outro
 * chip, outra instância e outro polling.
 *
 * Some inteiro (devolve null) sem o add-on e sem número. A rota que o alimenta é fechada à vendedora.
 */
export function CartaoNumeroDoAtendimento() {
  const [cartao, setCartao] = useState<CartaoDoNumero | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const { can } = useRole();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();

  /** Falha de leitura (rede, 500, 403) mantém o que já está na tela; o próximo ciclo tenta de novo. */
  const carregar = useCallback(async () => {
    try {
      const res = await fetch("/api/privado/numero", { cache: "no-store" });
      if (res.ok) setCartao((await res.json()) as CartaoDoNumero);
    } catch {
      // Rede fora: segue com o que está na tela.
    }
  }, []);

  const cena = cenaDoCartao(cartao);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Pareando acompanha de perto (o QR chega por webhook e troca a cada ciclo); o resto só vigia. Mudar
  // de cena reinicia o relógio, então "Conectar" passa para o ritmo curto na hora. Aba oculta não
  // consulta, e voltar a ela consulta na hora.
  useEffect(() => {
    const espera = cena === "pareando" ? POLL_MS : WATCH_MS;
    let cancelado = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const ciclo = async () => {
      timer = null;
      if (cancelado) return;
      if (document.visibilityState !== "hidden") await carregar();
      if (!cancelado) timer = setTimeout(ciclo, espera);
    };
    timer = setTimeout(ciclo, espera);

    const aoVoltar = () => {
      if (cancelado || document.visibilityState !== "visible" || timer === null) return;
      clearTimeout(timer);
      void ciclo();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    return () => {
      cancelado = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [carregar, cena]);

  /** POST na API; mostra o `error` dela e recarrega de qualquer jeito (um 409 ou 403 muda a cena). */
  const enviar = useCallback(
    async (url: string, corpo: Record<string, unknown>, falha: string) => {
      setOcupado(true);
      setErro(null);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(corpo),
        });
        if (!res.ok) {
          const detalhe = (await res.json().catch(() => null)) as { error?: string } | null;
          setErro(detalhe?.error || falha);
        }
        await carregar();
      } catch {
        setErro(falha);
      } finally {
        setOcupado(false);
      }
    },
    [carregar],
  );

  if (!cartao || cena === "oculto") return null;

  const { liberado, numero } = cartao;
  const podeAgir = can("settings:connection");
  const urlDaAcao = numero ? `/api/instances/${numero.id}/actions` : "";
  const recusado = numero ? recusadoPeloChipDosGrupos(numero) : false;
  // O painel do código mostra o erro por conta própria; fora dele o cartão mostra o seu.
  const comPainelDoCodigo = cena === "pareando" && podeAgir && liberado;

  const conectar = () =>
    enviar("/api/instances", { purpose: "privado", name: "Atendimento" }, "Não deu para conectar o número do atendimento.");
  const gerarQr = () => enviar(urlDaAcao, { action: "refresh_qr" }, "Não deu para gerar o QR code.");
  const pedirCodigo = (phone: string) =>
    enviar(urlDaAcao, { action: "pairing_code", phone }, "Não deu para gerar o código.");
  const desconectar = async () => {
    const ok = await pedirConfirmacao({
      titulo: "Desconectar o número do atendimento?",
      texto: "As mensagens do Recuperar e os avisos do Rastreio param até você conectar de novo pelo celular do chip.",
      rotulo: "Desconectar",
      destrutivo: true,
    });
    if (ok) await enviar(urlDaAcao, { action: "disconnect" }, "Não deu para desconectar o número do atendimento.");
  };

  const botaoDesconectar = podeAgir && (
    <button
      type="button"
      onClick={desconectar}
      disabled={ocupado}
      aria-label="Desconectar o número do atendimento"
      className="inline-flex h-10 items-center gap-2 text-[14px] text-danger-700 disabled:opacity-50"
    >
      <Power className="h-4 w-4" aria-hidden="true" /> Desconectar
    </button>
  );
  const botaoConectar = (rotulo: string, aoClicar: () => void) =>
    podeAgir && liberado && (
      <button type="button" onClick={aoClicar} disabled={ocupado} className={`mt-4 ${BOTAO_PRIMARIO}`}>
        {rotulo}
      </button>
    );

  return (
    <section
      aria-labelledby="numero-atendimento-titulo"
      data-testid="numero-do-atendimento"
      className="pn-card rounded-[var(--radius-control)] p-6 lg:p-8"
    >
      <h2 id="numero-atendimento-titulo" className="font-brand text-20 font-bold text-volt-950">
        Número do atendimento
      </h2>
      <p className="mt-1 text-[14px] text-slate-600">
        O WhatsApp que fala com a cliente no privado, pelo Recuperar e pelo Rastreio. Ele nunca posta nos grupos.
      </p>

      {cena === "sem-numero" && (
        <div className="mt-5">
          <p className="text-[14px] text-volt-950">Use um chip só para o atendimento, diferente do número dos grupos.</p>
          {botaoConectar("Conectar o número do atendimento", conectar)}
        </div>
      )}

      {cena === "pareando" && numero && (
        <div className="mt-5">
          <p className="text-[14px] text-volt-950">
            Escaneie com o celular do chip do atendimento, não com o dos grupos.
          </p>
          <div className="mt-4">
            {!podeAgir ? (
              <p className="text-[14px] text-slate-600">Conectando…</p>
            ) : comPainelDoCodigo ? (
              <PainelDoCodigo
                instancia={numero}
                carregando={ocupado}
                erro={erro}
                upgradeUrl={null}
                onRefreshQr={gerarQr}
                onPedirCodigo={pedirCodigo}
                onDesconectar={desconectar}
              />
            ) : (
              botaoDesconectar
            )}
          </div>
        </div>
      )}

      {cena === "conectado" && numero && (
        <div className="mt-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="font-data flex items-center gap-3 text-[24px] leading-none tabular-nums text-volt-950">
              <span className="pn-ponto pn-ponto--conectado" aria-hidden="true" />
              {telefoneNaVitrine(numero.phone) ?? numero.name}
            </p>
            <Etiqueta {...etiquetaDaConexao({ instancia: numero, carregando: ocupado, erro })} />
          </div>
          <p className="mt-3 text-13 text-slate-600">
            {[noArDesde(numero.connected_at), textoDaSaude(numero, new Date())].filter(Boolean).join(" · ")}
          </p>
          <div className="mt-4">{botaoDesconectar}</div>
        </div>
      )}

      {cena === "desconectado" && numero && (
        <div className="mt-5">
          <p className="text-[14px] text-volt-950">
            {recusado
              ? "Esse chip é o mesmo do número dos grupos. O número do atendimento precisa de outro chip, para uma restrição no privado nunca derrubar os seus grupos."
              : "O número do atendimento está desconectado. Enquanto isso, nenhuma mensagem sai por ele."}
          </p>
          {botaoConectar(recusado ? "Conectar outro chip" : "Conectar de novo", gerarQr)}
        </div>
      )}

      {numero && !liberado && (
        <p className="mt-4 text-13 text-slate-600">
          O Recuperar e o Rastreio estão desligados: nada sai por este número.
        </p>
      )}
      {!podeAgir && (
        <p className="mt-4 text-13 text-slate-600">
          Só o dono ou um admin da loja conecta e desconecta este número.
        </p>
      )}
      {erro && !comPainelDoCodigo && (
        <p role="alert" className="mt-4 text-13 text-danger-700">
          {erro}
        </p>
      )}
      {folhaDeConfirmacao}
    </section>
  );
}
