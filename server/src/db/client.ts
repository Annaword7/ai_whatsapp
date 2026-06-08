import { PrismaClient } from '@prisma/client';
import { isProd } from '../config/env';

// Reuse a single PrismaClient across the process (and across hot-reloads in dev).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: isProd ? ['error', 'warn'] : ['error', 'warn'],
  });

if (!isProd) globalForPrisma.prisma = prisma;
