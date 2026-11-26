// All network calls go through this one file.
// The login token is kept in localStorage so a page refresh keeps you logged in.
// Trade-off, written down on purpose: localStorage can be read by any script running on the page, so this app never
// inserts untrusted HTML (React escapes everything). The alternative, cookies, does not work well between
// github.io and onrender.com because browsers block cross-site cookies.

const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'booking.token';

export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } };
export const setToken = (token) => {
  try { token ? localStorage.setItem(TOKEN_KEY, token) : localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
};

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  const token = getToken();
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${BASE}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the server. It may be waking up: wait a moment and try again.');
  }
  let data = null;
  try { data = await response.json(); } catch { /* empty or non-JSON body */ }
  if (!response.ok) {
    const e = data?.error;
    if (response.status === 401 && token) setToken(null);          // an expired token is useless: forget it
    throw new ApiError(response.status, e?.code || 'ERROR', e?.message || `Request failed (${response.status})`, e?.details);
  }
  return data;
}
