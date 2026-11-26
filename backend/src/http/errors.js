// One error type for everything the API wants to tell a client on purpose.
// "code" is a stable machine-readable word (the frontend can react to it); "message" is for people.
export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message, details) => new HttpError(400, 'VALIDATION', message, details);
export const unauthenticated = (message = 'Please log in.') => new HttpError(401, 'UNAUTHENTICATED', message);
export const forbidden = (message = 'You are not allowed to do that.') => new HttpError(403, 'FORBIDDEN', message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'NOT_FOUND', message);
export const conflict = (code, message) => new HttpError(409, code, message);
export const tooManyRequests = (retryAfterSeconds) =>
  Object.assign(new HttpError(429, 'RATE_LIMITED', 'Too many requests. Please slow down.'), { retryAfterSeconds });
