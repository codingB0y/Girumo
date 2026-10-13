"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useRole } from "@/components/painel/role-provider";
import { useToast } from "@/components/toast";
import { authenticatedFetch } from "@/lib/supabase/client";
import {
  PainelDoSite,
  SiteComErro,
  SiteSemAcesso,
  type LeituraDoSite,
  type TesteDoSite,
} from "./site-proprio-painel";

type Carga = "carregando" | "ok" | "erro" | "proibido";

/**
 * Configurações › Integrações › Site próprio (spec 2026-10-10-funil-anuncios §4):
 * estado e chamadas. O desenho é `PainelDoSite`, testado sem navegador.
 *
 * Só dono e administração (`settings:connection`) leem a integração; o operador
 * vê o recado e a rota nem é chamada. 403 da rota cai no mesmo recado, nunca em
 * "Não deu para carregar" — que diria que algo quebrou quando nada quebrou.
 */
export function SiteProprio() {
  const { can, carregado } = useRole();
  const toast = useToast();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  // `can()` devolve true enquanto o papel não chegou: sem `carregado`, o operador
  // dispararia a leitura antes de saber que não pode.
  const pode = carregado && can("settings:connection");
  const [carga, setCarga] = useState<Carga>("carregando");
  const [leitura, setLeitura] = useState<LeituraDoSite | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const [origem, setOrigem] = useState("");
  const [linkEscolhido, setLinkEscolhido] = useState("");
  const [chaveNova, setChaveNova] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"chave" | "teste" | null>(null);
  const [teste, setTeste] = useState<TesteDoSite | null>(null);

  // Só a última chamada de `carregar` escreve estado; o desmonte também invalida.
  const ultimaCarga = useRef(0);

  const carregar = useCallback(async (depoisDeGerar = false) => {
    const minha = ++ultimaCarga.current;
    // Recarga depois de gerar a chave não volta ao esqueleto: a chave nova continua na tela.
    setCarga((atual) => (atual === "ok" ? atual : "carregando"));
    try {
      const res = await authenticatedFetch("/api/integracoes/site");
      if (minha !== ultimaCarga.current) return;
      if (res.status === 403) {
        setCarga("proibido");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const dados = (await res.json()) as LeituraDoSite;
      if (minha !== ultimaCarga.current) return;
      setLeitura(dados);
      setAgora(new Date());
      setLinkEscolhido((atual) => atual || dados.link?.id || dados.links[0]?.id || "");
      setCarga("ok");
    } catch {
      if (minha !== ultimaCarga.current) return;
      // Chave recém-gerada está na tela: trocar por "Tentar de novo" a mostraria inteira de novo.
      if (depoisDeGerar) toast("A chave foi gerada, mas não deu para atualizar o painel.", "error");
      else setCarga("erro");
    }
  }, [toast]);

  useEffect(() => {
    setOrigem(window.location.origin);
    if (pode) void carregar();
    return () => {
      // É um contador, não um nó do DOM: queremos mesmo o valor de agora.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ultimaCarga.current++;
    };
  }, [pode, carregar]);

  async function gerar() {
    if (!leitura || !linkEscolhido) return;
    if (leitura.ativa) {
      const ok = await pedirConfirmacao({
        titulo: "Gerar outra chave",
        texto:
          "A chave atual para de funcionar na hora. Até o site receber a nova, os cadastros vão direto pro link de sempre, sem origem.",
        rotulo: "Gerar outra chave",
        destrutivo: true,
      });
      if (!ok) return;
    }
    setOcupado("chave");
    try {
      const res = await authenticatedFetch("/api/integracoes/site/chave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracked_link_id: linkEscolhido }),
      });
      const corpo = (await res.json().catch(() => ({}))) as { chave?: string; error?: string };
      if (!res.ok || !corpo.chave) {
        toast(corpo.error || "Não foi possível gerar a chave.", "error");
        return;
      }
      setChaveNova(corpo.chave);
      setTeste(null);
      await carregar(true);
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setOcupado(null);
    }
  }

  async function testar() {
    setOcupado("teste");
    try {
      const res = await authenticatedFetch("/api/integracoes/site/teste", { method: "POST" });
      const corpo = (await res.json().catch(() => ({}))) as Partial<TesteDoSite> & { error?: string };
      if (!res.ok || !corpo.resposta) {
        toast(corpo.error || "O teste não respondeu. Tente de novo.", "error");
        return;
      }
      setTeste({ enviado: corpo.enviado ?? {}, resposta: corpo.resposta });
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setOcupado(null);
    }
  }

  if (carregado && (!pode || carga === "proibido")) return <SiteSemAcesso />;
  if (carga === "erro") return <SiteComErro onTentar={() => void carregar()} />;
  if (!carregado || carga === "carregando" || !leitura) {
    return (
      <div
        className="pn-skeleton h-40 rounded-[var(--radius-control)]"
        data-testid="painel-skeleton"
        role="status"
        aria-label="Carregando a integração do site"
      />
    );
  }

  return (
    <>
      <PainelDoSite
        leitura={leitura}
        agora={agora}
        origem={origem}
        linkEscolhido={linkEscolhido}
        onLink={setLinkEscolhido}
        chaveNova={chaveNova}
        ocupado={ocupado}
        teste={teste}
        onGerar={() => void gerar()}
        onTestar={() => void testar()}
      />
      {folhaDeConfirmacao}
    </>
  );
}
