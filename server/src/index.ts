import { existsSync } from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { ZodError } from 'zod';
import { env } from './config/env';
import { logger } from './utils/logger';
import { prisma } from './db/client';
import { whatsapp } from './whatsapp/manager';
import { AiError } from './services/ai';
import { DEFAULT_SESSION_ID } from './types';
import sessionRoutes from './routes/session';
import chatRoutes from './routes/chats';
import aiRoutes from './routes/ai';
import wsRoutes from './ws/index';

async function buildServer() {
  const app = Fastify({ loggerInstance: logger, trustProxy: true });

  await app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(websocket);

  // Tolerate empty JSON bodies (e.g. bodyless POSTs that still send a JSON
  // content-type) instead of rejecting them with FST_ERR_CTP_EMPTY_JSON_BODY.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch (err) {
      (err as FastifyError).statusCode = 400;
      done(err as Error, undefined);
    }
  });

  // Centralised error handling: validation -> 400, AI errors -> their code.
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'Validation failed', issues: err.issues });
    }
    if (err instanceof AiError) {
      return reply.code(err.statusCode).send({ error: err.message });
    }
    app.log.error({ err }, 'unhandled error');
    return reply.code(err.statusCode ?? 500).send({ error: err.message || 'Internal Server Error' });
  });

  app.get('/api/health', async () => ({ ok: true, ai: env.OPENAI_API_KEY ? 'configured' : 'missing' }));

  await app.register(wsRoutes);
  await app.register(sessionRoutes, { prefix: '/api/session' });
  await app.register(chatRoutes, { prefix: '/api/chats' });
  await app.register(aiRoutes, { prefix: '/api/ai' });

  return app;
}

async function main() {
  const app = await buildServer();

  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info(`🚀 server listening on http://${env.HOST}:${env.PORT}`);

  // Auto-reconnect a previously paired session after a restart/redeploy.
  const credsPath = path.join(env.WA_SESSION_PATH, DEFAULT_SESSION_ID, 'creds.json');
  if (existsSync(credsPath)) {
    logger.info('found saved WhatsApp session — reconnecting');
    void whatsapp.start(DEFAULT_SESSION_ID);
  }

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    try {
      await app.close();
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal startup error');
  process.exit(1);
});
