// Small formatting helpers (plain JavaScript, so they can be unit-tested without a browser).

/** 150000 cents of KES -> "KES 1,500" */
export function formatMoney(cents, currency = 'KES') {
  const amount = cents / 100;
  return `${currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "2026-11-27" -> "Fri 27 Nov 2026". Works on the calendar date only, so no time zone can shift it. */
export function formatDate(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(y, m - 1, d))).replace(/,/g, '');      // some Intl versions add a comma, some do not
}

/** "2026-11-27T07:00:00.000Z" in a time zone -> "Fri 27 Nov, 10:00" */
export function formatDateTime(iso, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false, timeZone })
    .format(new Date(iso)).replace(/,/g, '');
}

export function addDays(date, days) {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** Parses "#/book?service=2&date=2026-12-01" into { path: '/book', params: { service: '2', date: '2026-12-01' } }. */
export function parseHash(hash) {
  const text = (hash || '').replace(/^#/, '') || '/';
  const [path, query = ''] = text.split('?');
  return { path: path || '/', params: Object.fromEntries(new URLSearchParams(query)) };
}

export function buildHash(path, params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== '')).toString();
  return `#${path}${query ? `?${query}` : ''}`;
}
