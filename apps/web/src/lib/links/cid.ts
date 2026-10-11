/**
 * `?cid=` no link de grupo: o id do cadastro que o site da loja acabou de
 * mandar (spec 2026-10-10-funil-anuncios §3). Liga o clique à pessoa.
 *
 * Métrica nunca segura o visitante: tudo que não for um cadastro DESTA loja
 * vira `null` e o clique é gravado sem ele.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export function cidDaUrl(url: URL): string | null {
  const cid = (url.searchParams.get("cid") ?? "").trim().toLowerCase();
  return UUID.test(cid) ? cid : null;
}

export async function cidConferido(
  url: URL,
  tenantId: string,
  confere: (tenantId: string, id: string) => Promise<boolean>,
): Promise<string | null> {
  const cid = cidDaUrl(url);
  if (!cid) return null;
  try {
    return (await confere(tenantId, cid)) ? cid : null;
  } catch {
    return null;
  }
}
