// Signed login tokens in the standard JWT layout (header.payload.signature), HS256.
// The server signs with a secret only it knows; anyone who changes the payload breaks the signature.
// Only the algorithm we expect (HS256) is accepted, which blocks the classic "alg: none" trick.
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64 = (input) => Buffer.from(input).toString('base64url');
const sign = (data, secret) => createHmac('sha256', secret).update(data).digest('base64url');

export function signToken(claims, secret, ttlSeconds, nowMs = Date.now()) {
  const iat = Math.floor(nowMs / 1000);
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(JSON.stringify({ ...claims, iat, exp: iat + ttlSeconds }));
  return `${header}.${payload}.${sign(`${header}.${payload}`, secret)}`;
}

/** Returns the claims if the token is genuine and not expired, otherwise null. Never throws. */
export function verifyToken(token, secret, nowMs = Date.now()) {
  try {
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const [header, payload, signature] = parts;
    if (JSON.parse(Buffer.from(header, 'base64url').toString()).alg !== 'HS256') return null;
    const expected = Buffer.from(sign(`${header}.${payload}`, secret));
    const given = Buffer.from(signature);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= nowMs) return null;
    return claims;
  } catch {
    return null;
  }
}
