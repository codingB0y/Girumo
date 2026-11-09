// apps/web/src/components/painel/configuracoes/yampi.tsx
"use client";

import { type JSX, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { useRole } from "@/components/painel/role-provider";
import { useToast } from "@/components/toast";
import type { CartaoYampi } from "@/lib/yampi/cartao";
import type { ResultadoDaConferencia } from "@/lib/yampi/conferir";
import { authenticatedFetch } from "@/lib/supabase/client";
import { PainelDaYampi, YampiComErro, type CredenciaisDaYampi, type OcupadoDaYampi } from "./yampi-painel";
import { mensagemDoTeste } from "./yampi-painel-texto";

type Carga = "carregando" | "ok" | "erro" | "proibido";

const INDISPONIVEL = "Integração com a Yampi indisponível no momento.";

/** Corpo de erro das rotas da Yampi; 503 traz só `"indisponivel"`, que não é frase. */
async function erroDaResposta(res: Response, padrao: string): Promise<string> {
  if (res.status === 503) return INDISPONIVEL;
  const corpo = (await res.json().catch(() => ({}))) as { error?: unknown };
  return typeof corpo.error === "string" && corpo.error ? corpo.error : padrao;
}

/**
 * Configurações › Integrações › Yampi: estado e chamadas. O desenho é `PainelDaYampi`, testado sem navegador.
 * Só dono e administração (`settings:connection`) veem o cartão: para os outros papéis ele nem aparece e a rota
 * nem é chamada. `children` são os blocos de cada módulo (o Recuperar monta o mesmo componente nos Ajustes dele).
 */
export function Yampi({ children }: { children?: ReactNode }): JSX.Element | null {
  const { can, carregado } = useRole();
  const toast = useToast();
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  // `can()` devolve true enquanto o papel não chegou: sem `carregado`, o operador dispararia a leitura.
  const pode = carregado && can("settings:connection");
  const [carga, setCarga] = useState<Carga>("carregando");
  const [cartao, setCartao] = useState<CartaoYampi | null>(null);
  const [agora, setAgora] = useState(() => new Date());
  const [ocupado, setOcupado] = useState<OcupadoDaYampi>(null);
  const [erroDoFormulario, setErroDoFormulario] = useState<string | null>(null);

  // Só a última chamada de `carregar` escreve estado; o desmonte também invalida.
  const ultimaCarga = useRef(0);

  const carregar = useCallback(async () => {
    const minha = ++ultimaCarga.current;
    setCarga((atual) => (atual === "ok" ? atual : "carregando"));
    try {
      const res = await authenticatedFetch("/api/integracoes/yampi");
      if (minha !== ultimaCarga.current) return;
      if (res.status === 403) {
        setCarga("proibido");
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      const dados = (await res.json()) as CartaoYampi;
      if (minha !== ultimaCarga.current) return;
      setCartao(dados);
      setAgora(new Date());
      setCarga("ok");
    } catch {
      if (minha === ultimaCarga.current) setCarga("erro");
    }
  }, []);

  useEffect(() => {
    if (pode) void carregar();
    return () => {
      // É um contador, não um nó do DOM: queremos mesmo o valor de agora.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      ultimaCarga.current++;
    };
  }, [pode, carregar]);

  async function conectar(credenciais: CredenciaisDaYampi) {
    setOcupado("conectar");
    setErroDoFormulario(null);
    try {
      const res = await authenticatedFetch("/api/integracoes/yampi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credenciais),
      });
      if (!res.ok) {
        // O aviso que não nasceu já deixou a conexão gravada: recarrega para o cartão mostrar o estado novo.
        setErroDoFormulario(await erroDaResposta(res, "Não foi possível conectar a Yampi."));
        if (res.status === 502) await carregar();
        return;
      }
      toast("Yampi conectada.");
      await carregar();
    } catch {
      setErroDoFormulario("Erro de conexão. Tente de novo.");
    } finally {
      setOcupado(null);
    }
  }

  async function testar() {
    setOcupado("testar");
    try {
      const res = await authenticatedFetch("/api/integracoes/yampi/testar", { method: "POST" });
      if (!res.ok) {
        toast(await erroDaResposta(res, "Não foi possível testar a Yampi."), "error");
        return;
      }
      const { texto, tom } = mensagemDoTeste((await res.json()) as ResultadoDaConferencia);
      toast(texto, tom === "erro" ? "error" : undefined);
      await carregar();
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setOcupado(null);
    }
  }

  async function desconectar() {
    const ok = await pedirConfirmacao({
      titulo: "Desconectar Yampi",
      texto:
        "A Girumo para de receber os pedidos e os carrinhos e apaga o acesso e o aviso na Yampi. O Rastreio e o Recuperar ficam parados até você conectar de novo.",
      rotulo: "Desconectar Yampi",
      destrutivo: true,
    });
    if (!ok) return;
    setOcupado("desconectar");
    try {
      const res = await authenticatedFetch("/api/integracoes/yampi", { method: "DELETE" });
      if (!res.ok) {
        toast(await erroDaResposta(res, "Não foi possível desconectar a Yampi."), "error");
        return;
      }
      setErroDoFormulario(null);
      toast("Yampi desconectada.");
      await carregar();
    } catch {
      toast("Erro de conexão.", "error");
    } finally {
      setOcupado(null);
    }
  }

  if (carregado && (!pode || carga === "proibido")) return null;

  function conteudo(): ReactNode {
    // Papel ainda não chegou: nada, em vez de um esqueleto que some para quem não vê a Yampi.
    if (!carregado) return null;
    if (carga === "erro") return <YampiComErro onTentar={() => void carregar()} />;
    if (carga === "carregando" || !cartao) {
      return (
        <div
          className="pn-skeleton h-40 rounded-[var(--radius-control)]"
          role="status"
          aria-label="Carregando a integração com a Yampi"
        />
      );
    }
    return (
      <PainelDaYampi
        cartao={cartao}
        agora={agora}
        ocupado={ocupado}
        erroDoFormulario={erroDoFormulario}
        onConectar={(c) => void conectar(c)}
        onTestar={() => void testar()}
        onDesconectar={() => void desconectar()}
      >
        {children}
      </PainelDaYampi>
    );
  }

  return (
    <div className="space-y-3">
      {conteudo()}
      {folhaDeConfirmacao}
    </div>
  );
}
