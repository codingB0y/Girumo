"use client";

import { useCallback, useEffect, useState } from "react";
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
  const { can } = useRole();
  const toast = useToast();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const pode = can("settings:connection");
  const [carga, setCarga] = useState<Carga>("carregando");
  const [leitura, setLeitura] = useState<LeituraDoSite | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const [origem, setOrigem] = useState("");
  const [linkEscolhido, setLinkEscolhido] = useState("");
  const [chaveNova, setChaveNova] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<"chave" | "teste" | null>(null);
  const [teste, setTeste] = useState<TesteDoSite | null>(null);

  const carregar = useCallback(async () => {
    // Recarga depois de gerar a chave não volta ao esqueleto: a chave nova continua na tela.
    setCarga((atual) => (atual === "ok" ? atual : "carregando"));
    try {
      const res = await authenticatedFetch("/api/integracoes/site");
      if (res.status === 403) {
        setCarga("proibido");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const dados = (await res.json()) as LeituraDoSite;
      setLeitura(dados);
      setAgora(new Date());
      setLinkEscolhido((atual) => atual || dados.link?.id || dados.links[0]?.id || "");
      setCarga("ok");
    } catch {
      setCarga("erro");
    }
  }, []);

  useEffect(() => {
    setOrigem(window.location.origin);
    if (pode) void carregar();
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
      await carregar();
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

  if (!pode || carga === "proibido") return <SiteSemAcesso />;
  if (carga === "erro") return <SiteComErro onTentar={() => void carregar()} />;
  if (carga === "carregando" || !leitura) {
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
