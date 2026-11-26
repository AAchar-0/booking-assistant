// Password hashing with scrypt, which ships with Node (no library needed).
// A password is NEVER stored. We store: algorithm, cost settings, a random salt and the hash.
// The salt makes two users with the same password get different hashes. scrypt is deliberately slow and
// memory-hungry, which makes guessing millions of passwords per second impractical.
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
const COST = 16384;        // N: CPU/memory cost (a power of two)
const BLOCK = 8;           // r
const PARALLEL = 1;        // p
const KEY_LENGTH = 64;

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password, salt, KEY_LENGTH, { N: COST, r: BLOCK, p: PARALLEL });
  return ['scrypt', COST, BLOCK, PARALLEL, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password, stored) {
  const parts = String(stored).split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [, n, r, p, saltText, keyText] = parts;
  const expected = Buffer.from(keyText, 'base64');
  const actual = await scrypt(password, Buffer.from(saltText, 'base64'), expected.length,
    { N: Number(n), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);       // constant-time compare: no clues from how long it takes
}

// A hash of a random password, used to spend the same time when the email is unknown,
// so an attacker cannot tell "no such user" from "wrong password" by measuring the response time.
export const dummyHashPromise = hashPassword(randomBytes(12).toString('hex'));
