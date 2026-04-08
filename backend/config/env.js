import dotenv from 'dotenv';

dotenv.config();

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

function readTrimmedEnv(name, fallback = '') {
  const rawValue = process.env[name];

  if (typeof rawValue !== 'string') {
    return fallback;
  }

  return rawValue.trim();
}

function parseIntegerEnv(name, fallback, { min = 0 } = {}) {
  const rawValue = readTrimmedEnv(name);

  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (Number.isNaN(parsedValue) || parsedValue < min) {
    throw new Error(`${name} must be an integer greater than or equal to ${min}. Received: ${rawValue}`);
  }

  return parsedValue;
}

function parseBooleanEnv(name, fallback) {
  const rawValue = readTrimmedEnv(name).toLowerCase();

  if (!rawValue) {
    return fallback;
  }

  if (TRUE_VALUES.has(rawValue)) {
    return true;
  }

  if (FALSE_VALUES.has(rawValue)) {
    return false;
  }

  throw new Error(`${name} must be a boolean value (true/false). Received: ${rawValue}`);
}

function parseTrustProxyEnv(name, fallback) {
  const rawValue = readTrimmedEnv(name);

  if (!rawValue) {
    return fallback;
  }

  const normalizedValue = rawValue.toLowerCase();

  if (TRUE_VALUES.has(normalizedValue)) {
    return true;
  }

  if (FALSE_VALUES.has(normalizedValue)) {
    return false;
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  if (!Number.isNaN(parsedValue) && parsedValue >= 0) {
    return parsedValue;
  }

  return rawValue;
}

const nodeEnv = readTrimmedEnv('NODE_ENV', 'development') || 'development';
const isTest = nodeEnv === 'test';
const defaultMaxFileSize = 10 * 1024 * 1024;

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest,
  port: parseIntegerEnv('PORT', 5000, { min: 1 }),
  trustProxy: parseTrustProxyEnv('TRUST_PROXY', false),
  jwtSecret: readTrimmedEnv('JWT_SECRET', isTest ? 'test-secret' : ''),
  uploadDir: readTrimmedEnv('UPLOAD_DIR', 'uploads') || 'uploads',
  maxFileSize: parseIntegerEnv('MAX_FILE_SIZE', defaultMaxFileSize, { min: 1 }),
  redis: {
    url: readTrimmedEnv('REDIS_URL'),
    connectTimeoutMs: parseIntegerEnv('REDIS_CONNECT_TIMEOUT_MS', 5000, { min: 1 })
  },
  email: {
    smtpHost: readTrimmedEnv('SMTP_HOST'),
    smtpPort: parseIntegerEnv('SMTP_PORT', 587, { min: 1 }),
    smtpUser: readTrimmedEnv('SMTP_USER'),
    smtpPass: readTrimmedEnv('SMTP_PASS'),
    fromAddress: readTrimmedEnv('EMAIL_FROM', 'no-reply@localhost')
  },
  twilio: {
    accountSid: readTrimmedEnv('TWILIO_ACCOUNT_SID'),
    authToken: readTrimmedEnv('TWILIO_AUTH_TOKEN'),
    fromNumber: readTrimmedEnv('TWILIO_FROM')
  },
  cache: {
    enabled: parseBooleanEnv('CACHE_ENABLED', true),
    defaultTtlSeconds: parseIntegerEnv('CACHE_DEFAULT_TTL_SECONDS', 60, { min: 1 }),
    maxEntries: parseIntegerEnv('CACHE_MAX_ENTRIES', 1000, { min: 10 }),
    keyPrefix: readTrimmedEnv('CACHE_KEY_PREFIX', 'community-platform') || 'community-platform'
  },
  rateLimit: {
    enabled: parseBooleanEnv('RATE_LIMIT_ENABLED', true),
    standardHeaders: parseBooleanEnv('RATE_LIMIT_STANDARD_HEADERS', true)
  },
  mongo: {
    uri: readTrimmedEnv('MONGODB_URI'),
    serverSelectionTimeoutMS: parseIntegerEnv('DB_SERVER_SELECTION_TIMEOUT_MS', 10000, { min: 1 }),
    socketTimeoutMS: parseIntegerEnv('DB_SOCKET_TIMEOUT_MS', 45000, { min: 1 }),
    maxPoolSize: parseIntegerEnv('DB_MAX_POOL_SIZE', 10, { min: 1 }),
    minPoolSize: parseIntegerEnv('DB_MIN_POOL_SIZE', 0, { min: 0 }),
    autoIndex: parseBooleanEnv('DB_AUTO_INDEX', nodeEnv !== 'production' && !isTest)
  }
};

export function validateEnvironment({ requireDatabase = false } = {}) {
  const missingVariables = [];

  if (!env.jwtSecret) {
    missingVariables.push('JWT_SECRET');
  }

  if (requireDatabase && !env.mongo.uri) {
    missingVariables.push('MONGODB_URI');
  }

  if (missingVariables.length) {
    throw new Error(`Missing required environment variables: ${missingVariables.join(', ')}`);
  }
}