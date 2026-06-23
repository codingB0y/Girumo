import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { collection } from "@/lib/json-collection";
import { writeFileAtomic, withFileLock } from "@/lib/atomic-fs";

// Indicação premiada (member-get-member): cada revendedora tem um LINK PESSOAL
// rastreável que leva ao convite do grupo. Quem ela traz fica amarrado a ela.
// Fonte de gente NOVA de fora SEM verba de anúncio.

export type Referral = {
  id: string;
  referrerName: string; // nome da revendedora que indica
  group: string; // grupo de destino
  slug: string; // link rastreável /r/<slug>
  inviteUrl: string; // convite real do grupo
  createdAt: string;
};

export const referralsColl = collection<Referral>("referrals.json");

// Config da campanha de indicação (recompensa + meta).
const CONFIG_FILE = path.join(process.cwd(), "data", "referral-config.json");

export type ReferralConfig = { reward: string; goal: number; updatedAt: string };

const DEFAULT_CONFIG: ReferralConfig = {
  reward: "Frete grátis no próximo pedido",
  goal: 3,
  updatedAt: new Date(0).toISOString(),
};

export async function getReferralConfig(): Promise<ReferralConfig> {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(await fs.readFile(CONFIG_FILE, "utf8")) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function setReferralConfig(partial: Partial<ReferralConfig>): Promise<ReferralConfig> {
  return withFileLock(CONFIG_FILE, async () => {
    const merged: ReferralConfig = {
      ...(await getReferralConfig()),
      ...partial,
      updatedAt: new Date().toISOString(),
    };
    await writeFileAtomic(CONFIG_FILE, JSON.stringify(merged, null, 2));
    return merged;
  });
}
