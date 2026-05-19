// 12-char base58-ish nanoid for shareable score URLs (`/s/<slug>`).
// Anyone with the URL can view, like DocSend — no auth required.
// 12 chars * 57 alphabet ≈ 70 bits of entropy, enough for non-guessable but
// short enough to fit in an email subject line.

import { customAlphabet } from "nanoid";

// base58 minus look-alikes (0/O, 1/I/l).
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const generate = customAlphabet(ALPHABET, 12);

export function newSlug(): string {
  return generate();
}

// Per-investor link tokens are longer (16 chars ≈ 93 bits) because each
// recipient gets their own URL — we want them to be effectively unguessable
// so a forwarded link doesn't trivially collide with another investor's link.
const generateInvestorToken = customAlphabet(ALPHABET, 16);

export function newInvestorToken(): string {
  return generateInvestorToken();
}
