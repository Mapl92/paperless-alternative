import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pool: Pool | undefined;
};

function createPool() {
  return new Pool({ connectionString: process.env.DATABASE_URL });
}

function createPrismaClient(pool: Pool) {
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const pool = globalForPrisma.pool ?? createPool();
export const prisma = globalForPrisma.prisma ?? createPrismaClient(pool);

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pool = pool;
}
