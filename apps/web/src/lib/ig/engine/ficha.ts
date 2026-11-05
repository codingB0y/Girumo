import type { ApplyContactInput, ContactFieldValue, IgContactRow } from "@/lib/stores/ig-contacts";

/** O que o motor enxerga da pessoa: campos e etiquetas. */
export type Ficha = { fields: Record<string, ContactFieldValue>; tags: string[] };

export type Mudanca = { set?: Record<string, ContactFieldValue | null>; add?: string[]; remove?: string[] };

/** Cópia da ficha em memória durante um evento: `ler` não vai ao banco depois da primeira vez, `aplicar` grava e troca a cópia. */
export type Contato = {
  ler: () => Promise<Ficha>;
  aplicar: (mudanca: Mudanca) => Promise<Ficha>;
};

export type Contatos = {
  ler: (tenantId: string, igUserId: string) => Promise<IgContactRow | null>;
  aplicar: (tenantId: string, input: ApplyContactInput) => Promise<IgContactRow>;
};

const VAZIA: Ficha = { fields: {}, tags: [] };

/** `inicial` = a ficha que o evento acabou de gravar (ou ausente = ainda não lida). */
export function contatoDaPessoa(contatos: Contatos, tenantId: string, igUserId: string, username: string | null, agoraIso: string, inicial?: Ficha | null): Contato {
  let atual: Ficha | undefined = inicial ?? undefined;
  return {
    async ler() {
      atual ??= (await contatos.ler(tenantId, igUserId)) ?? VAZIA;
      return atual;
    },
    async aplicar(mudanca) {
      // O direct e o toque já foram gravados (`dm: true`) na chegada do evento; aqui é só a mudança do passo.
      const row = await contatos.aplicar(tenantId, { igUserId, username, ...mudanca, seenAt: agoraIso, dm: false });
      atual = { fields: row.fields, tags: row.tags };
      return atual;
    },
  };
}
