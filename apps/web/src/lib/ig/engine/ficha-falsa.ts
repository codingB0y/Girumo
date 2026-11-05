import type { ApplyContactInput, IgContactRow } from "@/lib/stores/ig-contacts";
import type { Contatos } from "./ficha";

/**
 * `ig_contacts` dos testes do motor, em memória: grava no mesmo formato do `ig_contact_apply`
 * (campo `null` apaga, etiquetas sem repetir). Sem "server-only" de propósito.
 */
export function criarContatosFalsos(opts: { falharAplicar?: boolean | string; falharPrimeiras?: number; segurar?: Promise<void>; inicial?: Partial<IgContactRow> } = {}) {
  const linhas = new Map<string, IgContactRow>();
  const aplicacoes: ApplyContactInput[] = [];
  const chave = (tenantId: string, igUserId: string) => `${tenantId}:${igUserId}`;
  if (opts.inicial?.ig_user_id) linhas.set(chave(opts.inicial.tenant_id ?? "loja-a", opts.inicial.ig_user_id), { ...linhaVazia(opts.inicial.ig_user_id), ...opts.inicial });

  const contatos: Contatos = {
    async ler(tenantId, igUserId) {
      return linhas.get(chave(tenantId, igUserId)) ?? null;
    },
    async aplicar(tenantId, input) {
      aplicacoes.push(input);
      if (opts.segurar) await opts.segurar;
      if (opts.falharPrimeiras && aplicacoes.length <= opts.falharPrimeiras) throw new Error("ig_contact_apply fora do ar");
      if (opts.falharAplicar) throw new Error(typeof opts.falharAplicar === "string" ? opts.falharAplicar : "ig_contact_apply fora do ar");
      const atual = linhas.get(chave(tenantId, input.igUserId)) ?? { ...linhaVazia(input.igUserId), tenant_id: tenantId };
      const fields = { ...atual.fields };
      for (const [k, v] of Object.entries(input.set ?? {})) {
        if (v === null) delete fields[k];
        else fields[k] = v;
      }
      const tags = [...new Set([...atual.tags, ...(input.add ?? [])])].filter((t) => !(input.remove ?? []).includes(t));
      const row: IgContactRow = { ...atual, username: input.username ?? atual.username, fields, tags, last_seen_at: input.seenAt, last_dm_at: input.dm ? input.seenAt : atual.last_dm_at, source_flow_id: atual.source_flow_id ?? input.sourceFlowId ?? null };
      linhas.set(chave(tenantId, input.igUserId), row);
      return row;
    },
  };
  return { contatos, aplicacoes, linhas };
}

function linhaVazia(igUserId: string): IgContactRow {
  return { id: `pessoa-${igUserId}`, tenant_id: "loja-a", ig_user_id: igUserId, username: null, fields: {}, tags: [], first_seen_at: "2026-10-06T11:00:00Z", last_seen_at: "2026-10-06T11:00:00Z", last_dm_at: null, source_flow_id: null, updated_at: "2026-10-06T11:00:00Z" };
}
