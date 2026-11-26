// Tiny shared building blocks.
import { ApiError } from './api.js';

export function Notice({ kind = 'info', children }) {
  if (!children) return null;
  return <p className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</p>;
}

export function errorText(error) {
  if (error instanceof ApiError && error.details) {
    const parts = Object.entries(error.details).map(([field, problem]) => `${field}: ${problem}`);
    return `${error.message} ${parts.join('; ')}`;
  }
  return error?.message || 'Something went wrong.';
}

export function Spinner({ label = 'Loading...' }) {
  return <p className="muted" role="status">{label}</p>;
}
