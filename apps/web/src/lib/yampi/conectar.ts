import "server-only";

import { chaveDeIntegracoes, selar } from "@/lib/security/secret-box";
import { atualizarMesmaConexaoYampi, desconectarConexaoYampi, salvarConexaoYampi } from "@/lib/stores/yampi-conexoes";

import { criarClienteYampi, YampiErro } from "./cliente";
import { contextoDoSegredo, lerAlias, lerCredencial } from "./credenciais";
import { apagarAvisosDaNossaUrl, recriarAviso } from "./webhooks";

export type FalhaDeConexao = "indisponivel" | "dados_invalidos" | "credencial_invalida" | "yampi_fora" | "aviso_nao_criado";
export type ResultadoDaConexao = { ok: true } | { ok: false; falha: FalhaDeConexao };

/** A leitura mais barata que prova a credencial (S6b: `/orders` sem filtro responde 200). */
export const PEDIDO_DE_TESTE = { caminho: "/orders", query: { limit: 1 } } as const;
export const AVISO_NAO_CRIADO = "Não foi possível criar o aviso na Yampi.";

const falhou = (falha: FalhaDeConexao): ResultadoDaConexao => ({ ok: false, falha });
const recusou = (e: unknown) => e instanceof YampiErro && e.status === 401;
const mensagemDe = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Conectar (ou colar de novo) a loja Yampi. A ordem dos efeitos é o contrato: nada vai à Yampi com dado fora do
 * formato, e nada é gravado antes de a Yampi aceitar a credencial. O aviso que não nasceu deixa a conexão gravada em
 * `aviso_desativado`: o cron tenta de novo.
 */
export async function conectarYampi(tenantId: string, entrada: unknown): Promise<ResultadoDaConexao> {
  const chave = chaveDeIntegracoes();
  if (!chave) return falhou("indisponivel");
  const campos = typeof entrada === "object" && entrada !== null ? (entrada as Record<string, unknown>) : {};
  const alias = lerAlias(campos.alias);
  const token = lerCredencial(campos.user_token);
  const secretKey = lerCredencial(campos.user_secret_key);
  if (!alias || !token || !secretKey) return falhou("dados_invalidos");

  // Ainda não há conexão para o `yampiGet`: o cliente puro, e um 401 aqui não marca nada.
  try {
    await criarClienteYampi({ alias, token, secretKey }).get(PEDIDO_DE_TESTE.caminho, PEDIDO_DE_TESTE.query);
  } catch (e) {
    return falhou(recusou(e) ? "credencial_invalida" : "yampi_fora");
  }

  const conexao = await salvarConexaoYampi(tenantId, {
    alias,
    userTokenSelado: selar(token, contextoDoSegredo(tenantId, "user_token"), chave),
    userSecretKeySelado: selar(secretKey, contextoDoSegredo(tenantId, "user_secret_key"), chave),
  });
  try {
    await recriarAviso(conexao);
    return { ok: true };
  } catch (e) {
    if (recusou(e)) return falhou("credencial_invalida");
    console.warn(`[yampi/conectar] ${tenantId}: aviso não criado (${mensagemDe(e)})`);
    await atualizarMesmaConexaoYampi(tenantId, conexao.userTokenSelado, { last_error: AVISO_NAO_CRIADO });
    return falhou("aviso_nao_criado");
  }
}

/**
 * Desconectar: o banco primeiro (credencial e aviso apagados, `desconectada`), depois o aviso na Yampi, com as
 * credenciais de antes e por melhor esforço — sem ele a desconexão já vale aqui. Ninguém tenta de novo depois (o
 * cron ignora `desconectada`), então `avisoApagado: false` vai para a tela, que pede para apagar na Yampi.
 * null = não havia conexão.
 */
export async function desconectarYampi(tenantId: string): Promise<{ avisoApagado: boolean } | null> {
  const anterior = await desconectarConexaoYampi(tenantId);
  if (!anterior || anterior.status === "desconectada") return null;
  try {
    await apagarAvisosDaNossaUrl(anterior);
    return { avisoApagado: true };
  } catch (e) {
    console.warn(`[yampi/desconectar] ${tenantId}: aviso na Yampi não apagado (${mensagemDe(e)})`);
    return { avisoApagado: false };
  }
}
