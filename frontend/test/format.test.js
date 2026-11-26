import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, buildHash, formatDate, formatDateTime, formatMoney, parseHash } from '../src/format.js';

test('money is shown in whole units, with cents only when needed', () => {
  assert.equal(formatMoney(150000, 'KES'), 'KES 1,500');
  assert.equal(formatMoney(150050, 'KES'), 'KES 1,500.50');
  assert.equal(formatMoney(0, 'KES'), 'KES 0');
});

test('dates do not shift with the visitor time zone', () => {
  assert.equal(formatDate('2026-11-27'), 'Fri 27 Nov 2026');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('date-times are shown in the business time zone', () => {
  assert.equal(formatDateTime('2026-11-27T07:00:00.000Z', 'Africa/Nairobi'), 'Fri 27 Nov 10:00');
  assert.equal(formatDateTime('2026-11-27T07:00:00.000Z', 'America/New_York'), 'Fri 27 Nov 02:00');
});

test('hash routes round-trip', () => {
  assert.deepEqual(parseHash(''), { path: '/', params: {} });
  assert.deepEqual(parseHash('#/book?service=2&date=2026-12-01'), { path: '/book', params: { service: '2', date: '2026-12-01' } });
  assert.equal(buildHash('/book', { service: 2, date: '', x: undefined }), '#/book?service=2');
  assert.equal(buildHash('/mine'), '#/mine');
});
