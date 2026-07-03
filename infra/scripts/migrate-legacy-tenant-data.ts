import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_FILES = ["leads.ndjson", "optout.json", "welcome.json"] as const;

export type LegacyMigrationPlan = {
  tenantId: string;
  source: string;
  destination: string;
  backupBase: string;
  files: string[];
  deleteOriginals: false;
};

export function planLegacyMigration(tenantId: string, dataDir: string): LegacyMigrationPlan {
  if (!UUID.test(tenantId)) throw new Error("tenant-id deve ser um UUID válido.");
  const source = path.resolve(dataDir);
  return {
    tenantId,
    source,
    destination: path.join(source, "tenants", tenantId),
    backupBase: path.join(source, "backups"),
    files: [...LEGACY_FILES],
    deleteOriginals: false,
  };
}

export async function migrateLegacyTenantData(plan: LegacyMigrationPlan): Promise<{ backup: string; copied: string[] }> {
  const available: string[] = [];
  for (const filename of plan.files) {
    try {
      await fs.access(path.join(plan.source, filename));
      available.push(filename);
    } catch {
      // Arquivo legado ausente não precisa ser criado artificialmente.
    }
  }
  if (available.length === 0) throw new Error(`Nenhum arquivo legado encontrado em ${plan.source}.`);

  for (const filename of available) {
    try {
      await fs.access(path.join(plan.destination, filename));
      throw new Error(`Destino já existe: ${path.join(plan.destination, filename)}`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Destino já existe:")) throw error;
    }
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(plan.backupBase, `legacy-tenant-${plan.tenantId}-${stamp}`);
  await fs.mkdir(backup, { recursive: true });
  await fs.mkdir(plan.destination, { recursive: true });

  for (const filename of available) {
    const source = path.join(plan.source, filename);
    await fs.copyFile(source, path.join(backup, filename), constants.COPYFILE_EXCL);
    await fs.copyFile(source, path.join(plan.destination, filename), constants.COPYFILE_EXCL);
  }

  return { backup, copied: available };
}

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  const tenantId = argument("--tenant-id");
  if (!tenantId) throw new Error("Uso: --tenant-id <UUID> [--data-dir <diretório>]");
  const dataDir = argument("--data-dir") ?? process.env.HUBFLOW_DATA_DIR ?? path.join(process.cwd(), "apps", "web", "data");
  const result = await migrateLegacyTenantData(planLegacyMigration(tenantId, dataDir));
  console.log(`Backup criado em: ${result.backup}`);
  console.log(`Arquivos copiados: ${result.copied.join(", ")}`);
  console.log("Originais preservados.");
}

const entry = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
