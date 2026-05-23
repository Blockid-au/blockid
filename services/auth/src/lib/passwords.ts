// Password hashing and verification.
//
// Uses bcryptjs with 12 rounds — matches the existing auth.ts implementation.
// bcryptjs is a pure-JS implementation that works everywhere without native
// compilation (important for Alpine Docker images).

import bcrypt from "bcryptjs";

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Generate a readable temporary password (10 chars, no confusing characters).
 * Used for password-reset flows.
 */
export function generateTempPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let pw = "";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  for (const b of bytes) pw += chars[b % chars.length];
  return pw;
}
