// Builds the Express application: security headers, CORS, JSON parsing, access log, routes, error handling.
// Everything the app needs is passed in, so tests can build an app with a fake clock, an in-memory database
// and a scripted AI client.
import express from 'express';
import { accessLog } from './http/accessLog.js';
import { HttpError, forbidden, unauthenticated, notFound } from './http/errors.js';
import { verifyToken } from './auth/tokens.js';
import { buildRoutes } from './routes.js';

export function createApp({ repo, svc, assistant, config, clock = () => Date.now(), logWrite }) {
  const app = express();
  app.disable('x-powered-by');                       // do not advertise the framework
  app.set('trust proxy', config.trustProxy);         // so req.ip is the visitor behind Render's proxy

  app.use(accessLog({ logClientIp: config.logClientIp, ...(logWrite ? { write: logWrite } : {}) }));

  // Security headers on every response. This is an API, so the strictest content policy is fine.
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Cache-Control': 'no-store',
      'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
    });
    next();
  });

  // CORS: only the configured website may read responses from a browser.
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (origin && config.allowedOrigin && origin === config.allowedOrigin) {
      res.set({
        'Access-Control-Allow-Origin': origin, 'Vary': 'Origin',
        'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Max-Age': '600',
      });
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });

  app.use(express.json({ limit: '20kb' }));          // bodies larger than this are refused (413)

  // Turns "Authorization: Bearer <token>" into req.user (looked up fresh, so role changes apply immediately).
  async function authenticate(req) {
    const header = req.get('authorization') || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    const claims = token ? verifyToken(token, config.jwtSecret, clock()) : null;
    if (!claims) throw unauthenticated();
    const user = await repo.findUserById(claims.sub);
    if (!user) throw unauthenticated();
    return user;
  }

  for (const route of buildRoutes({ repo, svc, assistant, config, clock })) {
    app[route.method](`/api${route.path}`, async (req, res, next) => {
      try {
        if (route.auth !== 'none') {
          req.user = await authenticate(req);
          if (route.auth === 'admin' && req.user.role !== 'ADMIN') throw forbidden('Admins only.');
        }
        const result = await route.handler({ params: req.params, query: req.query, body: req.body, user: req.user, ip: req.ip });
        // A handler may return { status: 201, body } to choose the HTTP status; otherwise the result is the body (200).
        const custom = result && typeof result.status === 'number' && 'body' in result;
        res.status(custom ? result.status : 200).json(custom ? result.body : result);
      } catch (e) {
        next(e);
      }
    });
  }

  app.use('/api', (req, res, next) => next(notFound('No such endpoint.')));

  // Central error handler: known errors become clean JSON; unknown errors become a generic 500 (details only in the log).
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) {
      if (err.retryAfterSeconds) res.set('Retry-After', String(err.retryAfterSeconds));
      return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
    }
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: { code: 'VALIDATION', message: 'The request body is not valid JSON.' } });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: { code: 'TOO_LARGE', message: 'The request body is too large.' } });
    console.error('Unhandled error:', err);
    return res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong on the server.' } });
  });

  return app;
}
