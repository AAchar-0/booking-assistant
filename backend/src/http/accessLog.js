// Writes one line per request in the format the Log Analyzer project reads:
//   <client> - <user> [dd/MMM/yyyy:HH:mm:ss +0000] "METHOD /path HTTP/1.1" status bytes milliseconds
// Privacy by default: the client address is replaced by "-" (set LOG_CLIENT_IP=true to include it), the query string is
// dropped, and the user is a numeric id, not a name or email.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n) => String(n).padStart(2, '0');

export function formatTimestamp(date) {
  return `${pad(date.getUTCDate())}/${MONTHS[date.getUTCMonth()]}/${date.getUTCFullYear()}:` +
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} +0000`;
}

export function formatAccessLine({ ip, userId, date, method, path, status, bytes, millis }) {
  const safePath = String(path).replace(/[^\x21-\x7E]/g, '_');          // no spaces or control characters inside the quotes
  return `${ip || '-'} - ${userId ?? '-'} [${formatTimestamp(date)}] "${method} ${safePath} HTTP/1.1" ${status} ${bytes > 0 ? bytes : '-'} ${millis}`;
}

export function accessLog({ logClientIp = false, write = (line) => console.log(line), now = () => new Date() } = {}) {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      write(formatAccessLine({
        ip: logClientIp ? req.ip : '-', userId: req.user?.id, date: now(), method: req.method,
        path: (req.originalUrl || req.url).split('?')[0], status: res.statusCode,
        bytes: Number(res.getHeader('content-length') || 0), millis: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
      }));
    });
    next();
  };
}
