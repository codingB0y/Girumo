"use client";

import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/supabase/client";
import { useConfirmacao } from "@/components/painel/confirmacao";
import { IndicacaoVitrine } from "@/components/painel/indicacao/vitrine/indicacao-vitrine";
import { comMetaRecalculada } from "@/lib/painel/indicacao";
import type { Carga } from "@/lib/painel/types";

/** Espelha o `ranking` de `GET /api/referrals`. */
type Ranked = {
  id: string;
  referrerName: string;
  group: string;
  slug: string;
  /** Caminho do link pessoal já pronto (`/r/<slug>`) — não montar isso na tela. */
  path: string;
  inviteUrl: string;
  cliques: number;
  atingiu: boolean;
};

type Config = {
  reward: string;
  goal: number;
  updated_at?: string;
};

const CONFIG_FALLBACK: Config = { reward: "Frete grátis no próximo pedido", goal: 3 };

async function readError(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null);
  const message = body && typeof body.error === "string" ? body.error : "";
  return message || fallback;
}

export default function PainelIndicacao() {
  const { pedirConfirmacao, folhaDeConfirmacao } = useConfirmacao();
  const [ranking, setRanking] = useState<Ranked[]>([]);
  const [config, setConfig] = useState<Config>(CONFIG_FALLBACK);
  const [cargaDoRanking, setCargaDoRanking] = useState<Carga>("carregando");
  /**
   * Falha de APAGAR, separada da falha de carregar. A casca antiga usava um
   * estado só para as duas: um DELETE recusado tinha a mesma cara de uma
   * consulta que nunca respondeu.
   */
  const [avisoDeAcao, setAvisoDeAcao] = useState<string | null>(null);
  const [erroDaCarga, setErroDaCarga] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [savingConfig, setSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configSaved, setConfigSaved] = useState(false);

  const [removing, setRemoving] = useState<string | null>(null);

  const load = useCallback(async () => {
    setCargaDoRanking("carregando");
    // Cada tentativa começa limpa. Sem isto, um retry BEM-SUCEDIDO deixa o
    // aviso da falha anterior preso na tela, contradizendo o ranking que
    // aparece logo abaixo.
    setErroDaCarga(null);
    try {
      const res = await authenticatedFetch("/api/referrals");
      if (!res.ok) throw new Error(await readError(res, "Não foi possível carregar as indicações."));
      // A rota devolve `{ config, ranking }`. A tela antiga testava
      // `Array.isArray()` nessa resposta — que é objeto — então a lista ficava
      // vazia mesmo com indicações cadastradas.
      const data = (await res.json()) as { config?: Config; ranking?: Ranked[] };
      const cfg = data.config ?? CONFIG_FALLBACK;
      setConfig(cfg);
      setRanking(Array.isArray(data.ranking) ? data.ranking : []);
      setCargaDoRanking("ok");
    } catch (e) {
      // Sem isto a falha vira "nenhuma indicadora ainda": tela idêntica à de quem
      // realmente não tem nenhuma, e ninguém descobre que a chamada quebrou.
      setCargaDoRanking("erro");
      setErroDaCarga(e instanceof Error ? e.message : "Não foi possível carregar as indicações.");
    }
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    void load();
  }, [load]);

  /**
   * Recebe os campos em vez de ler o estado da página: quem controla o
   * formulário é a Vitrine.
   */
  async function criarIndicadora(dados: { nome: string; grupo: string; inviteUrl: string }) {
    if (creating) return;
    setCreating(true);
    setFormError(null);
    try {
      const res = await authenticatedFetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referrerName: dados.nome,
          group: dados.grupo,
          inviteUrl: dados.inviteUrl,
        }),
      });
      if (!res.ok) throw new Error(await readError(res, "Não foi possível criar o link."));
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Não foi possível criar o link.");
    } finally {
      setCreating(false);
    }
  }

  async function salvarConfig(dados: { reward: string; goal: number }) {
    if (savingConfig) return;
    setSavingConfig(true);
    setConfigError(null);
    setConfigSaved(false);
    try {
      const res = await authenticatedFetch("/api/referrals/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reward: dados.reward, goal: dados.goal }),
      });
      if (!res.ok) throw new Error(await readError(res, "Não foi possível salvar."));
      const saved = (await res.json()) as Config;
      setConfig(saved);
      // A meta mudou: quem bateu e quem não bateu muda junto.
      setRanking((prev) => comMetaRecalculada(prev, saved.goal));
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 2500);
    } catch (err) {
      setConfigError(err instanceof Error ? err.message : "Não foi possível salvar.");
    } finally {
      setSavingConfig(false);
    }
  }

  async function handleRemove(item: Ranked) {
    if (removing) return;
    const ok = await pedirConfirmacao({
      titulo: "Apagar o link",
      texto: `Apagar o link de ${item.referrerName}? Ele para de funcionar na hora.`,
      rotulo: "Apagar",
      destrutivo: true,
    });
    if (!ok) return;
    setRemoving(item.id);
    setAvisoDeAcao(null);
    try {
      const res = await authenticatedFetch(`/api/referrals?id=${encodeURIComponent(item.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(await readError(res, "Não foi possível apagar."));
      setRanking((prev) => prev.filter((r) => r.id !== item.id));
    } catch (err) {
      setAvisoDeAcao(err instanceof Error ? err.message : "Não foi possível apagar.");
    } finally {
      setRemoving(null);
    }
  }

  // PR 12 da Vitrine Aberta: a indicadora vira FICHA (pn-ficha), porque é
  // pessoa, não mercadoria. Nenhuma consulta, efeito ou storage entra ou sai
  // por causa da flag — só o desenho muda.
  return (
    <>
      <IndicacaoVitrine
        ranking={ranking}
        config={config}
        carga={cargaDoRanking}
        origin={origin}
        avisoDeAcao={avisoDeAcao ?? (cargaDoRanking === "ok" ? erroDaCarga : null)}
        criando={creating}
        erroDoFormulario={formError}
        aoCriar={(dados) => void criarIndicadora(dados)}
        salvandoConfig={savingConfig}
        configSalva={configSaved}
        erroDaConfig={configError}
        aoSalvarConfig={(dados) => void salvarConfig(dados)}
        apagando={removing}
        aoApagar={(item) => void handleRemove(item as Ranked)}
        aoTentarDeNovo={() => void load()}
      />
      {folhaDeConfirmacao}
    </>
  );
}
