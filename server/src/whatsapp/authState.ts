import { promises as fs } from 'node:fs';
import path from 'node:path';
import { initAuthCreds, BufferJSON, proto } from 'baileys';
import type { AuthenticationCreds, AuthenticationState } from 'baileys';
import { encrypt, decrypt } from '../utils/crypto';

// Filesystem-backed Baileys auth state, encrypted at rest with AES-256-GCM.
// Mirrors the behaviour of Baileys' built-in `useMultiFileAuthState`, but every
// file written to disk is encrypted. Point the folder at a persistent volume so
// the WhatsApp session survives restarts/redeploys.

const sanitize = (file: string): string => file.replace(/\//g, '__').replace(/:/g, '-');

export async function useEncryptedAuthState(folder: string): Promise<{
  state: AuthenticationState;
  saveCreds: () => Promise<void>;
  clear: () => Promise<void>;
}> {
  await fs.mkdir(folder, { recursive: true });

  const writeData = async (data: unknown, file: string): Promise<void> => {
    const json = JSON.stringify(data, BufferJSON.replacer);
    await fs.writeFile(path.join(folder, sanitize(file)), encrypt(json));
  };

  const readData = async (file: string): Promise<unknown> => {
    try {
      const buf = await fs.readFile(path.join(folder, sanitize(file)));
      return JSON.parse(decrypt(buf), BufferJSON.reviver);
    } catch {
      return null;
    }
  };

  const removeData = async (file: string): Promise<void> => {
    try {
      await fs.unlink(path.join(folder, sanitize(file)));
    } catch {
      /* ignore */
    }
  };

  const creds: AuthenticationCreds = ((await readData('creds.json')) as AuthenticationCreds) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result: Record<string, unknown> = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}.json`);
              if (type === 'app-state-sync-key' && value) {
                value = proto.Message.AppStateSyncKeyData.fromObject(value as object);
              }
              result[id] = value;
            }),
          );
          return result as never;
        },
        set: async (data) => {
          const tasks: Array<Promise<void>> = [];
          for (const category in data) {
            const entries = data[category as keyof typeof data];
            if (!entries) continue;
            for (const id in entries) {
              const value = (entries as Record<string, unknown>)[id];
              const file = `${category}-${id}.json`;
              tasks.push(value ? writeData(value, file) : removeData(file));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => writeData(creds, 'creds.json'),
    clear: async () => {
      await fs.rm(folder, { recursive: true, force: true });
    },
  };
}
