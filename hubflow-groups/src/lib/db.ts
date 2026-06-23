import "server-only";
import { PrismaClient } from "@prisma/client";

// Singleton do Prisma (evita esgotar conexões no hot-reload do Next dev).
// Domínio de contas/billing no Postgres; o operacional segue em file-store (fase híbrida).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
