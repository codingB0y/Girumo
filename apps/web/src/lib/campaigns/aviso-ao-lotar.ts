import type { EstadoGrupo } from "@/lib/groups/estado";

/**
 * Regras do "Aviso ao lotar" (spec 2026-10-10 D10, §6.8) fora da rota e da tela,
 * para teste. Sem `server-only`: a tela usa o limite e `ultimosAvisos`.
 *
 * Quem decide QUANDO o aviso sai é o banco (`public.enviar_avisos_lotou`, PR 1):
 * grupo admin lotado depois de `aviso_ao_lotar_desde`, uma vez só
 * (`groups.aviso_lotou_em`, nunca limpo). Aqui mora o que a aplicação grava e mostra.
 */

export const AVISO_AO_LOTAR_MAX = 1000;

export type AvisoGravado = { aviso_ao_lotar: string | null; aviso_ao_lotar_desde: string | null };

/** O `avisoAoLotar` do PATCH: texto aparado, até 1000 caracteres. "" desliga. */
export function lerAvisoAoLotar(valor: unknown): { ok: true; texto: string } | { ok: false; error: string } {
  if (typeof valor !== "string") return { ok: false, error: "Aviso ao lotar inválido." };
  const texto = valor.trim();
  if (texto.length > AVISO_AO_LOTAR_MAX) {
    return { ok: false, error: `O aviso ao lotar pode ter até ${AVISO_AO_LOTAR_MAX} caracteres.` };
  }
  return { ok: true, texto };
}

/**
 * O que gravar, a partir do que está gravado e do texto que chegou:
 * - vazio → texto: liga com `desde = agora` (grupo que já estava lotado não recebe);
 * - texto → vazio, ou só espaços: desliga e zera o `desde`. Religar depois começa
 *   do zero, sem rearmar quem lotou com o aviso desligado;
 * - texto → texto: mantém o `desde`. Trocar a mensagem não pode pular quem lotou
 *   entre o `desde` antigo e a edição e ainda não foi varrido.
 * Texto gravado sem `desde` (dado torto) ganha `agora`: com `desde` nulo o
 * `lotado_em >= desde` do banco nunca é verdadeiro e o aviso "ligado" nunca sairia.
 */
export function proximoAviso(
  atual: { texto: string | null; desde: string | null },
  novoTexto: string,
  agora: string,
): AvisoGravado {
  const texto = novoTexto.trim();
  if (texto === "") return { aviso_ao_lotar: null, aviso_ao_lotar_desde: null };
  const estavaLigado = (atual.texto ?? "").trim() !== "";
  return { aviso_ao_lotar: texto, aviso_ao_lotar_desde: estavaLigado && atual.desde ? atual.desde : agora };
}

/**
 * "Últimos avisos" da tela: grupos da campanha que receberam o aviso, mais
 * recentes primeiro.
 *
 * `aviso_lotou_em` não quer dizer só "avisado": o backfill do PR 1, o grupo
 * descoberto já cheio e o grupo sem admin também o preenchem, sem enviar nada.
 * Três filtros separam o aviso de verdade:
 * - `avisoLotouEm >= desde`: a varredura só avisa depois de ligado (tira o
 *   backfill, mesmo de grupo reaberto, cujo `lotadoEm` muda);
 * - `avisoLotouEm !== lotadoEm`: a varredura grava noutra transação, depois da
 *   marca (tira o grupo que entrou já cheio com o aviso ligado);
 * - `isAdmin`: `enviar_avisos_lotou` carimba o grupo sem admin como avisado, mas
 *   não manda nada (não há como postar). É o admin de AGORA, uma aproximação do
 *   que valia na varredura.
 * ponytail: grupo que entrou já cheio com o aviso ligado e depois foi reaberto
 * passa pelos filtros; se aparecer, o banco passa a guardar o envio à parte.
 */
export function ultimosAvisos(grupos: readonly EstadoGrupo[], desde: string | null, limite = 5): EstadoGrupo[] {
  if (!desde) return [];
  const inicio = Date.parse(desde);
  return grupos
    .filter(
      (g) =>
        g.isAdmin &&
        g.avisoLotouEm !== null &&
        g.avisoLotouEm !== g.lotadoEm &&
        Date.parse(g.avisoLotouEm) >= inicio,
    )
    .sort((a, b) => Date.parse(b.avisoLotouEm ?? "") - Date.parse(a.avisoLotouEm ?? ""))
    .slice(0, limite);
}
