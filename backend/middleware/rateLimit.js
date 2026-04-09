import { env } from '../config/env.js';
import { incrementRateLimitCounter } from '../services/cacheStore.js';

function resolveRequestKey(req) {
  const forwardedFor = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  return req.user?.userId || forwardedIp || req.ip || 'anonymous';
}

function setRateLimitHeaders(res, { max, remaining, resetAt, windowMs }) {
  if (!env.rateLimit.standardHeaders) {
    return;
  }

  const resetInSeconds = Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000));
  res.set('RateLimit-Limit', String(max));
  res.set('RateLimit-Remaining', String(remaining));
  res.set('RateLimit-Reset', String(resetInSeconds));
  res.set('RateLimit-Policy', `${max};w=${Math.ceil(windowMs / 1000)}`);
}

export function createRateLimit({ namespace, windowMs, max, message, keyGenerator = resolveRequestKey }) {
  return async function rateLimitMiddleware(req, res, next) {
    if (!env.rateLimit.enabled) {
      return next();
    }

    try {
      const key = `${namespace}:${keyGenerator(req)}`;
      const { count, resetAt } = await incrementRateLimitCounter(key, windowMs);
      const remaining = Math.max(max - count, 0);

      setRateLimitHeaders(res, { max, remaining, resetAt, windowMs });

      if (count > max) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((resetAt.getTime() - Date.now()) / 1000))));
        return res.status(429).json(message);
      }

      return next();
    } catch (error) {
      return next(error);
    }
  };
}

export const rateLimitAuth = createRateLimit({
  namespace: 'auth',
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip || resolveRequestKey(req),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many authentication attempts. Please try again in 15 minutes'
    }
  }
});

export const rateLimitContent = createRateLimit({
  namespace: 'content-write',
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many content creation requests. Please try again later'
    }
  }
});

export const rateLimitComment = createRateLimit({
  namespace: 'comment-write',
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many comment requests. Please try again later'
    }
  }
});

export const rateLimitRead = createRateLimit({
  namespace: 'read',
  windowMs: 15 * 60 * 1000,
  max: 180,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many read requests. Please slow down and try again shortly'
    }
  }
});

export const rateLimitSearch = createRateLimit({
  namespace: 'search',
  windowMs: 15 * 60 * 1000,
  max: 90,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many search requests. Please try again in a moment'
    }
  }
});

export const rateLimitSmsSend = createRateLimit({
  namespace: 'sms-send',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: (req) => req.ip || resolveRequestKey(req),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many SMS send requests. Please try again later.'
    }
  }
});

export const rateLimitSmsVerify = createRateLimit({
  namespace: 'sms-verify',
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  keyGenerator: (req) => req.ip || resolveRequestKey(req),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many verification attempts. Please try again later.'
    }
  }
});
