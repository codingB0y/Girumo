import "server-only";
import { promises as fs } from "fs";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";
import { LEGACY_DATA_DIR } from "@/lib/legacy-data-dir";
import { tenantDataPath } from "@/lib/tenant-data-path";

// Persistência de leads (MVP) — ndjson em data/leads.ndjson, mas com escrita
// atômica + lock e DEDUPE por telefone (upsert). Migrar p/ Postgres depois.

export type LeadStatus = "novo" | "ativo" | "comprou";

export type Lead = {
  id: string;
  name: string;
  phone: string;
  sourceGroup: string;
  /** JID do grupo de origem (atribuição robusta, independe do nome). */
  sourceGroupId?: string;
  sourceCampaign: string;
  status: LeadStatus;
  enteredAt: string; // 1ª entrada — IMUTÁVEL (não infla "entradas de hoje")
  /** última vez que o número reapareceu (reentrada). */
  lastSeenAt?: string;
  /** grupos extras em que o mesmo número entrou (dedupe não perde origem). */
  alsoIn?: string[];
};

const onlyDigits = (s: string) => String(s).replace(/\D/g, "");

function leadsFile(tenantId: string): string {
  return tenantDataPath(LEGACY_DATA_DIR, tenantId, "leads.ndjson");
}

async function ensure(tenantId: string): Promise<string> {
  const file = leadsFile(tenantId);
  try {
    await fs.access(file);
  } catch {
    await writeFileAtomic(file, "");
  }
  return file;
}

function parse(raw: string): Lead[] {
  const out: Lead[] = [];
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as Lead);
    } catch {
      // ignora linha corrompida
    }
  }
  return out;
}

function serialize(leads: Lead[]): string {
  return leads.map((l) => JSON.stringify(l)).join("\n") + (leads.length ? "\n" : "");
}

export async function listLeads(tenantId: string): Promise<Lead[]> {
  const file = await ensure(tenantId);
  const raw = await fs.readFile(file, "utf8");
  return parse(raw).sort((a, b) => b.enteredAt.localeCompare(a.enteredAt));
}

/**
 * Registra uma entrada. DEDUPE: se já existe um lead com o MESMO telefone
 * (não-vazio), não cria outro — atualiza a última atividade e acumula o grupo
 * de origem em `alsoIn`. Telefone vazio (LID não resolvido) sempre cria (não
 * dá p/ deduplicar o desconhecido). Evita inflar o funil/meta.
 */
export async function addLead(tenantId: string, input: {
  phone: string;
  name?: string;
  sourceGroup: string;
  sourceGroupId?: string;
  sourceCampaign?: string;
}): Promise<Lead> {
  const file = await ensure(tenantId);
  return withFileLock(file, async () => {
    const leads = parse(await fs.readFile(file, "utf8"));
    const d = onlyDigits(input.phone);
    const now = new Date().toISOString();

    if (d) {
      const existing = leads.find((l) => onlyDigits(l.phone) === d);
      if (existing) {
        // enteredAt fica IMUTÁVEL (1ª entrada); só marca a reentrada em lastSeenAt.
        existing.lastSeenAt = now;
        if (input.sourceGroup && input.sourceGroup !== existing.sourceGroup) {
          const set = new Set(existing.alsoIn ?? []);
          set.add(input.sourceGroup);
          existing.alsoIn = [...set];
        }
        await writeFileAtomic(file, serialize(leads));
        return existing;
      }
    }

    const lead: Lead = {
      id: crypto.randomUUID(),
      phone: input.phone,
      name: input.name?.trim() || "Novo membro",
      sourceGroup: input.sourceGroup,
      sourceGroupId: input.sourceGroupId,
      sourceCampaign: input.sourceCampaign?.trim() || "—",
      status: "novo",
      enteredAt: now,
    };
    leads.unshift(lead);
    await writeFileAtomic(file, serialize(leads));
    return lead;
  });
}

export async function updateLeadStatus(tenantId: string, id: string, status: LeadStatus): Promise<Lead | null> {
  const file = await ensure(tenantId);
  return withFileLock(file, async () => {
    const leads = parse(await fs.readFile(file, "utf8"));
    const lead = leads.find((l) => l.id === id);
    if (!lead) return null;
    lead.status = status;
    await writeFileAtomic(file, serialize(leads));
    return lead;
  });
}

/** Exclusão por id (LGPD: direito de eliminação). */
export async function removeLead(tenantId: string, id: string): Promise<boolean> {
  const file = await ensure(tenantId);
  return withFileLock(file, async () => {
    const leads = parse(await fs.readFile(file, "utf8"));
    const next = leads.filter((l) => l.id !== id);
    if (next.length === leads.length) return false;
    await writeFileAtomic(file, serialize(next));
    return true;
  });
}
