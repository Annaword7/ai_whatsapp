import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { wsHub } from './hub';
import { whatsapp } from '../whatsapp/manager';
import { DEFAULT_SESSION_ID } from '../types';

// Registers the realtime WebSocket endpoint. Assumes @fastify/websocket is
// already registered on the app instance.
export default async function wsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/ws', { websocket: true }, (socket: WebSocket) => {
    wsHub.add(socket);

    // Push the current connection status immediately on connect.
    const info = whatsapp.getInfo(DEFAULT_SESSION_ID);
    socket.send(
      JSON.stringify({
        type: 'status',
        sessionId: info.sessionId,
        status: info.status,
        qr: info.qr,
        phoneNumber: info.phoneNumber,
      }),
    );

    // Respond to client pings to keep the connection healthy.
    socket.on('message', (raw: Buffer) => {
      if (raw.toString() === 'ping') socket.send('pong');
    });
  });
}
