import "server-only";

import { randomUUID } from "node:crypto";

import { sendCapiEvent } from "@/lib/campaigns/meta-capi";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { chaveDeIntegracoes } from "@/lib/security/secret-box";
import {
  atualizarConexao,
  lerConexao,
  marcarReconectar,
  pegarTrava,
  salvarTokensRenovados,
  soltarTrava,
} from "@/lib/stores/bling-conexoes";
import { lerContato, recalcularListas, salvarContato } from "@/lib/stores/bling-contatos";
import {
  agendarNovaTentativa,
  contarPendentes,
  enfileirarPedidos,
  existePendenteVencido,
  listarPendentes,
  salvarEfeitos,
  salvarProcessado,
} from "@/lib/stores/bling-pedidos";
import { listCampaignGroups } from "@/lib/stores/campaign-groups";
import { ultimoCadastroDaChave } from "@/lib/stores/site-captures";
import { findLeadByPhones, type SaleLead } from "@/lib/stores/vendas";

import { avisarReconectar } from "./avisar-reconectar";
import type { CampanhaComMetadata } from "./eventos-meta";
import { credenciaisBling, renovarToken, type CredenciaisBling } from "./oauth";
import { projetarPedido } from "./pedido-girumo";

/**
 * Tudo o que o motor (`sincronizar`, `processar-pedido`) usa de fora: banco, Bling, Meta, relógio.
 * Os testes trocam o pacote inteiro por falsos em memória (`src/test/bling-falso.ts`); a produção
 * usa `depsDeProducao()`.
 */

/**
 * Orçamento GLOBAL de /oauth/token (todas as lojas e instâncias, no Upstash): 20 chamadas em 60 s
 * bloqueiam o IP no Bling por 60 min. O retorno do OAuth gasta do mesmo balde. Com o Upstash fora, o
 * motor cai num balde em memória de 1 por minuto por instância: longe dos 20/min, e nenhuma loja para
 * de vez (falhar fechado pararia todas quando o token vence).
 */
export const LIMITE_DE_TOKEN = { id: "bling:oauth-token", max: 10, janelaMs: 60_000, maxSeFalhar: 1 } as const;

/** Para o cron e o retorno: credenciais do app e chave de cifra válidas. Sem elas a integração está desligada. */
export function blingDisponivel(env: NodeJS.ProcessEnv = process.env): boolean {
  return credenciaisBling(env) !== null && chaveDeIntegracoes(env) !== null;
}

export type DepsBling = {
  agora: () => Date;
  esperar: (ms: number) => Promise<void>;
  novoId: () => string;
  fetchImpl: typeof fetch;
  conexoes: {
    lerConexao: typeof lerConexao;
    salvarTokensRenovados: typeof salvarTokensRenovados;
    marcarReconectar: typeof marcarReconectar;
    atualizarConexao: typeof atualizarConexao;
    pegarTrava: typeof pegarTrava;
    soltarTrava: typeof soltarTrava;
  };
  pedidos: {
    enfileirarPedidos: typeof enfileirarPedidos;
    listarPendentes: typeof listarPendentes;
    existePendenteVencido: typeof existePendenteVencido;
    contarPendentes: typeof contarPendentes;
    salvarProcessado: typeof salvarProcessado;
    salvarEfeitos: typeof salvarEfeitos;
    agendarNovaTentativa: typeof agendarNovaTentativa;
  };
  contatos: {
    lerContato: typeof lerContato;
    salvarContato: typeof salvarContato;
    recalcularListas: typeof recalcularListas;
  };
  leads: { porTelefones: (tenantId: string, telefones: string[]) => Promise<SaleLead | null> };
  cadastros: { ultimoDaChave: typeof ultimoCadastroDaChave };
  campanhas: { comMetadata: (tenantId: string) => Promise<CampanhaComMetadata[]> };
  projetar: typeof projetarPedido;
  meta: { enviar: typeof sendCapiEvent };
  oauth: { renovar: typeof renovarToken; credenciais: () => CredenciaisBling | null };
  cifra: { chave: () => Buffer | null };
  /** true = bloqueado (`checkRateLimit` de `LIMITE_DE_TOKEN`; com o Upstash fora, 1 por minuto por instância). */
  limiteTokenGlobal: () => Promise<boolean>;
  avisarReconectar: (tenantId: string) => Promise<void>;
};

export function depsDeProducao(): DepsBling {
  return {
    agora: () => new Date(),
    esperar: (ms) => new Promise<void>((pronto) => setTimeout(pronto, ms)),
    novoId: () => randomUUID(),
    fetchImpl: fetch,
    conexoes: { lerConexao, salvarTokensRenovados, marcarReconectar, atualizarConexao, pegarTrava, soltarTrava },
    pedidos: {
      enfileirarPedidos,
      listarPendentes,
      existePendenteVencido,
      contarPendentes,
      salvarProcessado,
      salvarEfeitos,
      agendarNovaTentativa,
    },
    contatos: { lerContato, salvarContato, recalcularListas },
    leads: { porTelefones: findLeadByPhones },
    cadastros: { ultimoDaChave: ultimoCadastroDaChave },
    campanhas: { comMetadata: campanhasComMetadata },
    projetar: projetarPedido,
    meta: { enviar: sendCapiEvent },
    oauth: { renovar: renovarToken, credenciais: () => credenciaisBling() },
    cifra: { chave: () => chaveDeIntegracoes() },
    limiteTokenGlobal: () =>
      checkRateLimit(LIMITE_DE_TOKEN.id, LIMITE_DE_TOKEN.max, LIMITE_DE_TOKEN.janelaMs, { maxSeFalhar: LIMITE_DE_TOKEN.maxSeFalhar }),
    avisarReconectar: (tenantId) => avisarReconectar(tenantId),
  };
}

/** Só o que `escolherPixel` lê: id, nome e metadata (pixel, token e código de teste ficam nela). */
async function campanhasComMetadata(tenantId: string): Promise<CampanhaComMetadata[]> {
  const campanhas = await listCampaignGroups(tenantId);
  return campanhas.map(({ id, name, metadata }) => ({ id, name, metadata }));
}
