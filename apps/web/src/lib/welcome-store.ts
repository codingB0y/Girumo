import "server-only";
import { promises as fs } from "fs";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";
import { LEGACY_DATA_DIR } from "@/lib/legacy-data-dir";
import { tenantDataPath } from "@/lib/tenant-data-path";

// Config das boas-vindas automáticas (Sprint 2). A engine lê isto e, quando
// alguém ENTRA num grupo, manda uma DM de boas-vindas — pela fila anti-ban e
// respeitando o opt-out. Self-service: o lojista liga/desliga e edita o texto.
export type WelcomeConfig = {
  enabled: boolean;
  message: string;
  updatedAt: string;
};

const DEFAULT_MESSAGE =
  "Oi {nome}! Seja muito bem-vinda(o) ao nosso grupo 💛\nAqui você recebe os drops e promoções em primeira mão. Qualquer dúvida é só chamar!";

const DEFAULT: WelcomeConfig = {
  enabled: false,
  message: DEFAULT_MESSAGE,
  updatedAt: new Date(0).toISOString(),
};

function welcomeFile(tenantId: string): string {
  return tenantDataPath(LEGACY_DATA_DIR, tenantId, "welcome.json");
}

export async function getWelcome(tenantId: string): Promise<WelcomeConfig> {
  try {
    const raw = await fs.readFile(welcomeFile(tenantId), "utf8");
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

export async function setWelcome(tenantId: string, partial: Partial<WelcomeConfig>): Promise<WelcomeConfig> {
  const file = welcomeFile(tenantId);
  return withFileLock(file, async () => {
    const merged: WelcomeConfig = {
      ...(await getWelcome(tenantId)),
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    await writeFileAtomic(file, JSON.stringify(merged, null, 2));
    return merged;
  });
}
