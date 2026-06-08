import type { WebSocket } from 'ws';
import { logger } from '../utils/logger';
import type { ServerEvent } from '../types';

// In-memory fan-out of realtime events to every connected browser client.
// For a single-instance MVP this is sufficient; scale-out would swap this for
// a pub/sub backplane (e.g. Redis).
class WsHub {
  private clients = new Set<WebSocket>();

  add(ws: WebSocket): void {
    this.clients.add(ws);
    logger.debug({ clients: this.clients.size }, 'ws client connected');
    ws.on('close', () => {
      this.clients.delete(ws);
      logger.debug({ clients: this.clients.size }, 'ws client disconnected');
    });
    ws.on('error', () => this.clients.delete(ws));
  }

  broadcast(event: ServerEvent): void {
    const data = JSON.stringify(event);
    for (const ws of this.clients) {
      // 1 === WebSocket.OPEN
      if (ws.readyState === 1) {
        try {
          ws.send(data);
        } catch (err) {
          logger.warn({ err }, 'failed to send ws message');
        }
      }
    }
  }

  get size(): number {
    return this.clients.size;
  }
}

export const wsHub = new WsHub();
