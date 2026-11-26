// Reads settings from environment variables ONCE and checks them, so a wrong setting stops the app at start-up
// with a clear message instead of causing a strange error later.
// Secrets (JWT_SECRET, DATABASE_URL, ANTHROPIC_API_KEY, AI_API_KEY) come only from the environment and are never written in code.

function toInt(text, fallback, name) {
  if (text === undefined || text === '') return fallback;
  const n = Number(text);
  if (!Number.isInteger(n)) throw new Error(`Environment variable ${name} must be a whole number, got "${text}"`);
  return n;
}

// Which AI service powers the assistant. "anthropic" is the default. "groq" is a preset for Groq's free plan.
// "openai-compatible" works with any service that speaks the OpenAI chat format: you then set AI_BASE_URL yourself.
const AI_PROVIDERS = {
  anthropic: { keyVariable: 'ANTHROPIC_API_KEY', defaultModel: 'claude-haiku-5-5', baseUrl: '' },
  groq: { keyVariable: 'AI_API_KEY', defaultModel: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1' },
  'openai-compatible': { keyVariable: 'AI_API_KEY', defaultModel: '', baseUrl: '' },
};

export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const providerName = env.AI_PROVIDER || 'anthropic';
  const provider = AI_PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`AI_PROVIDER must be one of: ${Object.keys(AI_PROVIDERS).join(', ')}. Got "${providerName}".`);
  }

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
      provider: providerName,
      apiKey: env[provider.keyVariable] || '',
      model: env.AI_MODEL || provider.defaultModel,
      baseUrl: (env.AI_BASE_URL || provider.baseUrl).replace(/\/+$/, ''),
      reasoningEffort: env.AI_REASONING_EFFORT || '',
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
  if (config.ai.apiKey && providerName !== 'anthropic') {
    if (!config.ai.model) throw new Error('AI_MODEL must be set when AI_PROVIDER is openai-compatible (copy the exact model name from your provider).');
    if (!/^https:\/\/[^\s/]+/.test(config.ai.baseUrl)) throw new Error('AI_BASE_URL must start with https:// (for example https://api.groq.com/openai/v1).');
  }
  if (config.ai.reasoningEffort && !['low', 'medium', 'high'].includes(config.ai.reasoningEffort)) {
    throw new Error('AI_REASONING_EFFORT must be low, medium or high (or left empty).');
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
