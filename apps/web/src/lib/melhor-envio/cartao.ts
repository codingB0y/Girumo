import "server-only";

import { credenciaisMelhorEnvio } from "@/lib/melhor-envio/oauth";
import { lerConexao } from "@/lib/stores/melhorenvio-conexoes";
import { rastreioLigado } from "@/lib/stores/rastreio-config";
import { entreguesPeloMelhorEnvio } from "@/lib/stores/rastreio-pedidos";

/**
 * O JSON do cartão do Melhor Envio em Configurações › Integrações. O objeto público é montado campo a campo:
 * a conexão guardada traz os tokens selados e nada dela é repassada por espalhamento.
 */

const SEMANA_MS = 7 * 86_400_000;

export type CartaoMelhorEnvio = {
  liberado: boolean;
  disponivel: boolean;
  conexao: null | {
    status: "ativa" | "reautorizar";
    contaNome: string | null;
    contaEmail: string | null;
    temEtiqueta: boolean | null;
    primeiraPassadaFeita: boolean;
    ultimaConsultaEm: string | null;
    ultimoErro: string | null;
  };
  entreguesEm7Dias: number;
};

export type DepsCartao = {
  ligado: typeof rastreioLigado;
  credenciais: typeof credenciaisMelhorEnvio;
  conexao: typeof lerConexao;
  entregues: typeof entreguesPeloMelhorEnvio;
};

const DEPS: DepsCartao = {
  ligado: rastreioLigado,
  credenciais: credenciaisMelhorEnvio,
  conexao: lerConexao,
  entregues: entreguesPeloMelhorEnvio,
};

export async function montarCartao(tenantId: string, agora: Date, deps: DepsCartao = DEPS): Promise<CartaoMelhorEnvio> {
  const disponivel = deps.credenciais() !== null;
  if (!(await deps.ligado(tenantId))) return { liberado: false, disponivel, conexao: null, entreguesEm7Dias: 0 };
  const c = await deps.conexao(tenantId);
  if (!c) return { liberado: true, disponivel, conexao: null, entreguesEm7Dias: 0 };
  return {
    liberado: true,
    disponivel,
    conexao: {
      status: c.status,
      contaNome: c.contaNome,
      contaEmail: c.contaEmail,
      temEtiqueta: c.temEtiqueta,
      primeiraPassadaFeita: c.primeiraPassadaEm !== null,
      ultimaConsultaEm: c.ultimaConsultaEm,
      ultimoErro: c.ultimoErro,
    },
    entreguesEm7Dias: await deps.entregues(tenantId, new Date(agora.getTime() - SEMANA_MS)),
  };
}
