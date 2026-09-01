import { isAdminGroup, type GroupLike } from "@/lib/evolution/admin-group";

/**
 * Separa, na lista que a Evolution devolveu, o que o produto opera do que ele
 * não tem o direito de operar.
 *
 * Grupo onde o número não é admin não dispara campanha (`bulk-batch`), não
 * captura lead (`lead-capture`) e não entra em auto-grow. Guardá-lo só produzia
 * ruído no painel e uma base de contatos de terceiros parada no banco — em
 * 31/08 eram 109 grupos e 33 mil pessoas fora da base do lojista.
 *
 * `descartar` são os ids que devem sair do banco: a Evolution acabou de
 * confirmar que não somos admin deles.
 */
export type ProviderGroup = GroupLike & {
  id?: string | null;
  subject?: string | null;
  size?: number | null;
};

export type SyncPartition<T> = {
  /** Grupos onde somos admin — os únicos que vão para o banco. */
  admin: T[];
  /** `whatsapp_group_id` dos que não são nossos e devem ser removidos. */
  descartar: string[];
  /**
   * `true` quando vieram grupos e NENHUM foi detectado como admin.
   *
   * Isso é indistinguível de "a detecção quebrou" (contrato da Evolution mudou,
   * telefone da instância errado, participantes vazios) — e nesse cenário o
   * descarte apagaria a base inteira do lojista. Quem chama não deve remover
   * nada quando isto for `true`.
   */
  deteccaoSuspeita: boolean;
};

export function partitionByAdmin<T extends ProviderGroup>(
  groups: T[],
  myPhone: string | null | undefined,
): SyncPartition<T> {
  const validos = groups.filter((g) => typeof g.id === "string" && g.id.length > 0);
  const admin: T[] = [];
  const descartar: string[] = [];

  for (const g of validos) {
    if (isAdminGroup(g, myPhone)) admin.push(g);
    else descartar.push(String(g.id));
  }

  const deteccaoSuspeita = validos.length > 0 && admin.length === 0;
  return { admin, descartar: deteccaoSuspeita ? [] : descartar, deteccaoSuspeita };
}
