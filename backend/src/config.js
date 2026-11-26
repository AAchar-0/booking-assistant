// Reads settings from environment variables ONCE and checks them, so a wrong setting stops the app at start-up
// with a clear message instead of causing a strange error later.
// Secrets (JWT_SECRET, DATABASE_URL, ANTHROPIC_API_KEY) come only from the environment and are never written in code.

function toInt(text, fallback, name) {
  if (text === undefined || text === '') return fallback;
  const n = Number(text);
  if (!Number.isInteger(n)) throw new Error(`Environment variable ${name} must be a whole number, got "${text}"`);
  return n;
}

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';

  const config = {
    production,
    port: toInt(env.PORT, 8080, 'PORT'),
    databaseUrl: env.DATABASE_URL || '',
    // In development a fixed secret is fine. In production it must be set, long and random.
    jwtSecret: env.JWT_SECRET || (production ? '' : 'development-only-secret-do-not-use-in-production'),
    tokenTtlSeconds: toInt(env.TOKEN_TTL_HOURS, 12, 'TOKEN_TTL_HOURS') * 3600,
    // Exactly one website may call the API from a browser (for example https://aachar-0.github.io).
    allowedOrigin: (env.ALLOWED_ORIGIN || '').replace(/\/+$/, ''),
    trustProxy: env.TRUST_PROXY === 'false' ? false : 1,   // Render puts one proxy in front of the app
    logClientIp: env.LOG_CLIENT_IP === 'true',              // off by default: IP addresses are personal data

    business: {
      name: env.BUSINESS_NAME || 'Acacia Studio (demo)',
      timezone: env.BUSINESS_TZ || 'Africa/Nairobi',
    },
    booking: {
      slotStepMinutes: toInt(env.SLOT_STEP_MINUTES, 15, 'SLOT_STEP_MINUTES'),
      minNoticeMinutes: toInt(env.MIN_NOTICE_MINUTES, 60, 'MIN_NOTICE_MINUTES'),
      maxDaysAhead: toInt(env.MAX_DAYS_AHEAD, 60, 'MAX_DAYS_AHEAD'),
      cancelMinHours: toInt(env.CANCEL_MIN_HOURS, 2, 'CANCEL_MIN_HOURS'),
      maxActiveBookingsPerCustomer: toInt(env.MAX_ACTIVE_BOOKINGS, 5, 'MAX_ACTIVE_BOOKINGS'),
    },
    ai: {
      apiKey: env.ANTHROPIC_API_KEY || '',
      model: env.AI_MODEL || 'claude-haiku-5-5',
      dailyLimit: toInt(env.AI_DAILY_LIMIT, 200, 'AI_DAILY_LIMIT'),          // total assistant calls per day (cost cap)
      userHourlyLimit: toInt(env.AI_USER_HOURLY_LIMIT, 20, 'AI_USER_HOURLY_LIMIT'),
    },
  };

  if (production && config.jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to a random string of at least 32 characters in production.');
  }
  if (production && !config.databaseUrl) {
    throw new Error('DATABASE_URL must be set in production.');
  }
  if (config.booking.slotStepMinutes < 5 || 60 % config.booking.slotStepMinutes !== 0) {
    throw new Error('SLOT_STEP_MINUTES must be 5, 10, 15, 20, 30 or 60.');
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: config.business.timezone });
  } catch {
    throw new Error(`BUSINESS_TZ "${config.business.timezone}" is not a valid time zone name (example: Africa/Nairobi).`);
  }
  return config;
}
