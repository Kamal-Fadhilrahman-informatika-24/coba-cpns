const rateLimit = require('express-rate-limit');

/**
 * General API rate limit — 100 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again later.' }
});

/**
 * Strict rate limit for auth endpoints — 10 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait 15 minutes.' }
});

/**
 * Relaxed limit for test submission — prevent burst but allow normal use
 */
const testLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many test submissions. Please wait a few minutes.' }
});

module.exports = { apiLimiter, authLimiter, testLimiter };
