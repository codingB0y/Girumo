// apps/web/src/lib/resultados/relatorio-anuncios.ts
import { z } from "zod";

/**
 * Contrato do JSON de `public.attribution_report` (migração
 * 20261010130100_funil_anuncios_relatorio.sql; spec 2026-10-10-funil-anuncios §2).
 *
 * A tela nunca confia no formato: um campo que mudar no SQL quebra aqui, com
 * mensagem, em vez de virar zero desenhado no funil.
 */

const contagem = z.number().int().nonnegative();
/** Gasto vem de `ad_spend`, cujo check exige `amount > 0`: negativo aqui é contrato quebrado. */
const gasto = z.number().nonnegative();
/**
 * Vendido é soma de `orders.value`, que outro caminho grava (estorno lançado como
 * pedido negativo, ajuste). Um pedido estranho não derruba a aba inteira: o número
 * sai como veio, e só NaN/Infinity/texto continuam recusados.
 */
const vendido = z.number();
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const linhaSchema = z.object({
  nivel: z.enum(["campanha", "conjunto", "anuncio"]),
  campanha: z.string().nullable(),
  conjunto: z.string().nullable(),
  anuncio: z.string().nullable(),
  cadastros: contagem,
  foram: contagem,
  entraram: contagem,
  ja_membros: contagem,
  compradores: contagem,
  pedidos: contagem,
  vendido,
  gasto: gasto.nullable(),
});

const relatorioSchema = z.object({
  periodo: z.object({ de: dia, ate: dia }),
  total: z.object({
    cadastros: contagem,
    foram: contagem,
    entraram: contagem,
    ja_membros: contagem,
    compradores: contagem,
    pedidos: contagem,
    vendido,
    gasto,
  }),
  linhas: z.array(linhaSchema),
  por_origem: z.array(z.object({ origem: z.string().nullable(), cadastros: contagem, vendido })),
  por_dia: z.array(z.object({ dia, cadastros: contagem, entraram: contagem })),
  fora: z.object({
    entradas_sem_cadastro: contagem,
    pedidos_sem_origem: contagem,
    vendido_sem_origem: vendido,
  }),
});

export type RelatorioAnuncios = z.infer<typeof relatorioSchema>;
export type LinhaRelatorio = z.infer<typeof linhaSchema>;
export type NivelLinha = LinhaRelatorio["nivel"];

/**
 * O relatório como a tela recebe: igual ao do SQL, mas com `total.gasto` podendo ser
 * `null` — o de quem não tem `ads:manage` (`semGasto`). O contrato do SQL continua
 * estrito: `null` no gasto do total vindo do banco é erro, não "escondido".
 */
export type RelatorioParaTela = Omit<RelatorioAnuncios, "total"> & {
  total: Omit<RelatorioAnuncios["total"], "gasto"> & { gasto: number | null };
};

/**
 * Corpo de `GET /api/resultados/anuncios`. `tem_cadastro` diz se a loja já recebeu
 * algum cadastro (de qualquer período): sem nenhum, a aba mostra a tela Vazio em
 * vez de um funil zerado.
 */
export type RespostaAnuncios = { relatorio: RelatorioParaTela; tem_cadastro: boolean };

/**
 * O relatório para quem não tem `ads:manage` (spec §2–§3: gasto é dado de caixa, só
 * dono e administração). Some todo gasto, e também a linha de campanha que só existe
 * por causa dele (gasto lançado sem nenhum cadastro no período: `cadastros = 0` no
 * nível campanha — campanha com cadastro sempre tem pelo menos 1). Retorno e custo
 * por degrau são calculados na tela a partir do gasto, então somem junto.
 * Não muta a entrada.
 */
export function semGasto(relatorio: RelatorioAnuncios): RelatorioParaTela {
  return {
    ...relatorio,
    total: { ...relatorio.total, gasto: null },
    linhas: relatorio.linhas
      .filter((l) => !(l.nivel === "campanha" && l.cadastros === 0))
      .map((l) => ({ ...l, gasto: null })),
  };
}

export function lerRelatorioAnuncios(bruto: unknown): RelatorioAnuncios {
  const lido = relatorioSchema.safeParse(bruto);
  if (!lido.success) {
    const primeiro = lido.error.issues[0];
    throw new Error(`relatorio invalido: ${primeiro?.path.join(".") ?? "?"} ${primeiro?.message ?? ""}`.trim());
  }
  return lido.data;
}
