import type { ApplyContactInput, ContactFieldValue, IgContactRow } from "@/lib/stores/ig-contacts";

/** O que o motor enxerga da pessoa: campos e etiquetas. */
export type Ficha = { fields: Record<string, ContactFieldValue>; tags: string[] };

export type Mudanca = { set?: Record<string, ContactFieldValue | null>; add?: string[]; remove?: string[] };

/** Cópia da ficha em memória durante um evento: `ler` não vai ao banco depois da primeira vez, `aplicar` grava e troca a cópia. */
export type Contato = {
  ler: () => Promise<Ficha>;
  /** Grava e troca a cópia; erro do banco sobe (o evento é reenviado). */
  aplicar: (mudanca: Mudanca) => Promise<Ficha>;
  /** Como `aplicar`, mas a falha do banco só é registrada: a cópia em memória recebe a mudança de qualquer jeito. */
  guardar: (mudanca: Mudanca) => Promise<Ficha>;
};

export type Contatos = {
  ler: (tenantId: string, igUserId: string) => Promise<IgContactRow | null>;
  aplicar: (tenantId: string, input: ApplyContactInput) => Promise<IgContactRow>;
};

const VAZIA: Ficha = { fields: {}, tags: [] };

/** Só o tipo do erro: a mensagem do PostgREST pode trazer chave, tenant e @ da pessoa. */
export function registrarFalhaDaFicha(e: unknown): void {
  const tipo = e instanceof Error ? ((e as { code?: unknown }).code ?? e.name) : typeof e;
  console.error("[ig/ficha] gravação falhou:", String(tipo));
}

function mesclar(base: Ficha, m: Mudanca): Ficha {
  const fields = { ...base.fields };
  for (const [k, v] of Object.entries(m.set ?? {})) {
    if (v === null) delete fields[k];
    else fields[k] = v;
  }
  const tags = [...new Set([...base.tags, ...(m.add ?? [])])].filter((t) => !(m.remove ?? []).includes(t));
  return { fields, tags };
}

/** `inicial` = a ficha que o evento está gravando (ou já gravou); ausente = lê do banco quando precisar. */
export function contatoDaPessoa(contatos: Contatos, tenantId: string, igUserId: string, username: string | null, agoraIso: string, inicial?: Promise<Ficha | null> | Ficha | null): Contato {
  let atual: Ficha | undefined;
  const ler = async (): Promise<Ficha> => {
    atual ??= (await inicial) ?? (await contatos.ler(tenantId, igUserId)) ?? VAZIA;
    return atual;
  };
  const aplicar = async (mudanca: Mudanca): Promise<Ficha> => {
    // O direct e o toque já foram gravados (`dm: true`) na chegada do evento; aqui é só a mudança do passo.
    const row = await contatos.aplicar(tenantId, { igUserId, username, ...mudanca, seenAt: agoraIso, dm: false });
    atual = { fields: row.fields, tags: row.tags };
    return atual;
  };
  const guardar = async (mudanca: Mudanca): Promise<Ficha> => {
    const base = await ler().catch(() => VAZIA);
    try {
      return await aplicar(mudanca);
    } catch (e) {
      registrarFalhaDaFicha(e);
      atual = mesclar(base, mudanca);
      return atual;
    }
  };
  return { ler, aplicar, guardar };
}
