import "server-only";
import { promises as fs } from "fs";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";
import { legacyDataPath } from "@/lib/legacy-data-dir";

// Config das boas-vindas automáticas (Sprint 2). A engine lê isto e, quando
// alguém ENTRA num grupo, manda uma DM de boas-vindas — pela fila anti-ban e
// respeitando o opt-out. Self-service: o lojista liga/desliga e edita o texto.
const WELCOME_FILE = legacyDataPath("welcome.json");

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

export async function getWelcome(): Promise<WelcomeConfig> {
  try {
    const raw = await fs.readFile(WELCOME_FILE, "utf8");
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

export async function setWelcome(partial: Partial<WelcomeConfig>): Promise<WelcomeConfig> {
  return withFileLock(WELCOME_FILE, async () => {
    const merged: WelcomeConfig = {
      ...(await getWelcome()),
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    await writeFileAtomic(WELCOME_FILE, JSON.stringify(merged, null, 2));
    return merged;
  });
}
