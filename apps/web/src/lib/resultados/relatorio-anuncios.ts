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
const dinheiro = z.number().nonnegative();
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
  vendido: dinheiro,
  gasto: dinheiro.nullable(),
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
    vendido: dinheiro,
    gasto: dinheiro,
  }),
  linhas: z.array(linhaSchema),
  por_origem: z.array(z.object({ origem: z.string().nullable(), cadastros: contagem, vendido: dinheiro })),
  por_dia: z.array(z.object({ dia, cadastros: contagem, entraram: contagem })),
  fora: z.object({
    entradas_sem_cadastro: contagem,
    pedidos_sem_origem: contagem,
    vendido_sem_origem: dinheiro,
  }),
});

export type RelatorioAnuncios = z.infer<typeof relatorioSchema>;
export type LinhaRelatorio = z.infer<typeof linhaSchema>;
export type NivelLinha = LinhaRelatorio["nivel"];

export function lerRelatorioAnuncios(bruto: unknown): RelatorioAnuncios {
  const lido = relatorioSchema.safeParse(bruto);
  if (!lido.success) {
    const primeiro = lido.error.issues[0];
    throw new Error(`relatorio invalido: ${primeiro?.path.join(".") ?? "?"} ${primeiro?.message ?? ""}`.trim());
  }
  return lido.data;
}
