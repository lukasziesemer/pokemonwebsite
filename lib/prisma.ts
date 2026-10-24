/**
 * Prisma Client Singleton
 * Verhindert mehrfache Instanziierung in Development (Hot Reload)
 */

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';

// Globale Variable für Prisma Client (nur in Development)
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Prisma 7: Verbindung über den pg-Driver-Adapter. connectionTimeoutMillis entspricht
// dem früheren Prisma-6-Standard von 5 s (pg selbst wartet ohne Timeout).
function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

// Prisma Client Singleton
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

// In Development: Speichere Client in globalem Scope
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;

