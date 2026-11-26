// Tiny input validation. Never trust anything from the network: every value is checked and cleaned here
// before it reaches the business logic.
//
// Usage:
//   const input = parse({ email: v.email(), age: v.int({ min: 0 }) }, req.body);
// Unknown fields are dropped. All problems are reported together, not one at a time.
import { badRequest } from './errors.js';

class Issue extends Error {}                    // a problem with ONE field
const fail = (message) => { throw new Issue(message); };

export const v = {
  string({ min = 0, max = 200, optional = false, trim = true } = {}) {
    return (value) => {
      if (value === undefined || value === null) return optional ? undefined : fail('is required');
      if (typeof value !== 'string') return fail('must be text');
      const text = trim ? value.trim() : value;
      if (text.length < min) return fail(min === 1 ? 'must not be empty' : `must be at least ${min} characters`);
      if (text.length > max) return fail(`must be at most ${max} characters`);
      return text;
    };
  },
  email() {
    return (value) => {
      const text = v.string({ min: 3, max: 254 })(value).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) fail('must be a valid email address');
      return text;
    };
  },
  int({ min = -Infinity, max = Infinity, optional = false } = {}) {
    return (value) => {
      if (value === undefined || value === null || value === '') return optional ? undefined : fail('is required');
      const n = typeof value === 'string' && /^-?\d+$/.test(value.trim()) ? Number(value) : value;
      if (!Number.isInteger(n)) return fail('must be a whole number');
      if (n < min || n > max) return fail(`must be between ${min} and ${max}`);
      return n;
    };
  },
  // Calendar date as YYYY-MM-DD (no time). Real dates only: 2026-02-30 is rejected.
  date() {
    return (value) => {
      const text = v.string({ min: 10, max: 10 })(value);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return fail('must look like 2026-12-31');
      const [y, m, d] = text.split('-').map(Number);
      const check = new Date(Date.UTC(y, m - 1, d));
      if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return fail('is not a real date');
      return text;
    };
  },
  // A moment in time, ISO 8601 with a time zone, for example 2026-12-01T07:00:00.000Z
  instant() {
    return (value) => {
      const text = v.string({ min: 20, max: 40 })(value);
      if (!/(Z|[+-]\d{2}:\d{2})$/.test(text) || Number.isNaN(Date.parse(text))) return fail('must be an ISO date-time with a time zone');
      return new Date(text).toISOString();
    };
  },
  oneOf(allowed, { optional = false } = {}) {
    return (value) => {
      if (value === undefined || value === null) return optional ? undefined : fail('is required');
      if (!allowed.includes(value)) return fail(`must be one of: ${allowed.join(', ')}`);
      return value;
    };
  },
  boolean({ optional = false } = {}) {
    return (value) => {
      if (value === undefined || value === null) return optional ? undefined : fail('is required');
      if (typeof value !== 'boolean') return fail('must be true or false');
      return value;
    };
  },
};

export function parse(schema, input) {
  const source = input !== null && typeof input === 'object' ? input : {};
  const clean = {};
  const problems = {};
  for (const [field, check] of Object.entries(schema)) {
    try {
      const value = check(source[field]);
      if (value !== undefined) clean[field] = value;
    } catch (e) {
      if (!(e instanceof Issue)) throw e;       // a real bug: do not hide it
      problems[field] = e.message;
    }
  }
  if (Object.keys(problems).length > 0) throw badRequest('Some fields are not valid.', problems);
  return clean;
}
