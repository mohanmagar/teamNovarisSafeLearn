// ============================================================
// SafeLearn — Authentication helpers (Task B4: real password hashing)
// Passwords are never stored or compared in plain text. Each
// password gets its own random salt, hashed with scrypt (Node's
// built-in, memory-hard KDF — the same class of algorithm as
// bcrypt/argon2, with no extra dependency to install).
// ============================================================
'use strict';

const crypto = require('node:crypto');

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

function hashPassword(plainPassword) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN).toString('hex');
  return { salt, hash };
}

function verifyPassword(plainPassword, salt, expectedHash) {
  const hash = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(expectedHash, 'hex');
  // Constant-time comparison guards against timing attacks.
  if (hash.length !== expected.length) return false;
  return crypto.timingSafeEqual(hash, expected);
}

function createToken() {
  return crypto.randomBytes(32).toString('hex');
}

function newExpiry() {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString();
}

module.exports = { hashPassword, verifyPassword, createToken, newExpiry, SESSION_TTL_MS };
