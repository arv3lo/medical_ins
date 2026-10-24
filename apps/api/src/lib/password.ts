import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  return verify(passwordHash, password);
}

/** Hash of a random password with the same cost, to verify against when no account matches. */
export const DUMMY_PASSWORD_HASH = hashPassword(randomBytes(16).toString('hex'));
