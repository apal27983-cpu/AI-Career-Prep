import { PrismaClient } from '@prisma/client';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

/**
 * One client per process. In dev, `tsx watch` reloads the module graph, so the
 * instance is parked on globalThis to avoid exhausting the connection pool.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env().isProduction ? ['warn', 'error'] : ['warn', 'error'],
    datasources: { db: { url: env().DATABASE_URL } },
  });

if (!env().isProduction) globalForPrisma.prisma = prisma;

export async function disconnectPrisma(): Promise<void> {
  try {
    await prisma.$disconnect();
  } catch (error) {
    logger.warn({ err: error }, 'Error while disconnecting from the database');
  }
}

/** Used by the health endpoint and by the integration test bootstrap. */
export async function databaseReachable(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
