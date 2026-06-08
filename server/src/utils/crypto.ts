import crypto from 'node:crypto';
import { env } from '../config/env';

// AES-256-GCM encryption for the Baileys auth state at rest.
// Layout of the encrypted buffer: [ iv(12) | authTag(16) | ciphertext ].

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

// Derive a stable 32-byte key from the configured secret.
const KEY = crypto.createHash('sha256').update(env.SESSION_ENCRYPTION_KEY).digest();

export function encrypt(plaintext: string): Buffer {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]);
}

export function decrypt(payload: Buffer): string {
  const iv = payload.subarray(0, IV_LEN);
  const tag = payload.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = payload.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}
