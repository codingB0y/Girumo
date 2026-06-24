import "server-only";
import { promises as fs } from "fs";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";
import { LEGACY_DATA_DIR, legacyDataPath } from "@/lib/legacy-data-dir";

// Persistência de leads (MVP) — ndjson em data/leads.ndjson, mas com escrita
// atômica + lock e DEDUPE por telefone (upsert). Migrar p/ Postgres depois.

const DATA_DIR = LEGACY_DATA_DIR;
const LEADS_FILE = legacyDataPath("leads.ndjson");

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

async function ensure() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(LEADS_FILE);
  } catch {
    await writeFileAtomic(LEADS_FILE, "");
  }
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

export async function listLeads(): Promise<Lead[]> {
  await ensure();
  const raw = await fs.readFile(LEADS_FILE, "utf8");
  return parse(raw).sort((a, b) => b.enteredAt.localeCompare(a.enteredAt));
}

/**
 * Registra uma entrada. DEDUPE: se já existe um lead com o MESMO telefone
 * (não-vazio), não cria outro — atualiza a última atividade e acumula o grupo
 * de origem em `alsoIn`. Telefone vazio (LID não resolvido) sempre cria (não
 * dá p/ deduplicar o desconhecido). Evita inflar o funil/meta.
 */
export async function addLead(input: {
  phone: string;
  name?: string;
  sourceGroup: string;
  sourceGroupId?: string;
  sourceCampaign?: string;
}): Promise<Lead> {
  await ensure();
  return withFileLock(LEADS_FILE, async () => {
    const leads = parse(await fs.readFile(LEADS_FILE, "utf8"));
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
        await writeFileAtomic(LEADS_FILE, serialize(leads));
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
    await writeFileAtomic(LEADS_FILE, serialize(leads));
    return lead;
  });
}

export async function updateLeadStatus(id: string, status: LeadStatus): Promise<Lead | null> {
  await ensure();
  return withFileLock(LEADS_FILE, async () => {
    const leads = parse(await fs.readFile(LEADS_FILE, "utf8"));
    const lead = leads.find((l) => l.id === id);
    if (!lead) return null;
    lead.status = status;
    await writeFileAtomic(LEADS_FILE, serialize(leads));
    return lead;
  });
}

/** Exclusão por id (LGPD: direito de eliminação). */
export async function removeLead(id: string): Promise<boolean> {
  await ensure();
  return withFileLock(LEADS_FILE, async () => {
    const leads = parse(await fs.readFile(LEADS_FILE, "utf8"));
    const next = leads.filter((l) => l.id !== id);
    if (next.length === leads.length) return false;
    await writeFileAtomic(LEADS_FILE, serialize(next));
    return true;
  });
}
