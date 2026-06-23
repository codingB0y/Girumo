import { PrismaClient } from "@prisma/client";

// Catálogo de planos (espelha system/PRICING.md). Idempotente (upsert por code).
const prisma = new PrismaClient();

async function main() {
  const plans = [
    { code: "essencial", name: "Essencial", priceCents: 19700 },
    { code: "growth", name: "Growth", priceCents: 29700 },
    { code: "performance", name: "Performance Max", priceCents: 49700 },
  ];
  for (const p of plans) {
    await prisma.plan.upsert({
      where: { code: p.code },
      update: { name: p.name, priceCents: p.priceCents, active: true },
      create: p,
    });
  }
  console.log(`seed: ${plans.length} planos garantidos.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
