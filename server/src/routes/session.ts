import type { FastifyInstance } from 'fastify';
import { whatsapp } from '../whatsapp/manager';
import { DEFAULT_SESSION_ID } from '../types';

// WhatsApp connection lifecycle (QR pairing + session control).
export default async function sessionRoutes(app: FastifyInstance): Promise<void> {
  // Start the connection (returns QR data URL once available via status/WS).
  app.post('/connect', async () => {
    return whatsapp.start(DEFAULT_SESSION_ID);
  });

  // Current connection status + QR (poll this, or subscribe to the WebSocket).
  app.get('/status', async () => {
    return whatsapp.getInfo(DEFAULT_SESSION_ID);
  });

  // Stop the socket but keep the saved session (can reconnect without QR).
  app.post('/disconnect', async () => {
    await whatsapp.stop(DEFAULT_SESSION_ID);
    return whatsapp.getInfo(DEFAULT_SESSION_ID);
  });

  // Backfill chat display names (group subjects + 1:1 contact names).
  app.post('/resolve-names', async () => {
    return whatsapp.resolveNames(DEFAULT_SESSION_ID);
  });

  // Log out and wipe the encrypted auth state (next connect needs a new QR).
  app.post('/logout', async () => {
    await whatsapp.logout(DEFAULT_SESSION_ID);
    return whatsapp.getInfo(DEFAULT_SESSION_ID);
  });
}
