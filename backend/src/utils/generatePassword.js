// =============================================================================
// src/utils/generatePassword.js
// Cryptographic temporary-password generator.
//
// Spec s.3.2: Replace predefined temporary credentials with an automated
// cryptographic utility using Node.js's native crypto module.
// Generates a random 12-character string guaranteed to contain at least:
//   - 1 uppercase letter
//   - 1 lowercase letter
//   - 1 digit
//   - 1 special symbol
//
// The returned plaintext password is passed directly to bcrypt.hash() by the
// calling controller. It must NEVER be logged, persisted in plaintext, or
// returned in an API response body.
//
// NFR-02 | Spec s.3.2
// =============================================================================

const crypto = require('crypto');

const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
const DIGITS    = '0123456789';
const SPECIAL   = '!@#$%^&*()-_=+[]{}|;:,.<>?';

const ALL_CHARS = UPPERCASE + LOWERCASE + DIGITS + SPECIAL;

/**
 * generateSecurePassword
 *
 * Returns a cryptographically random 12-character password string
 * satisfying the composition policy (upper + lower + digit + special).
 *
 * Uses rejection sampling to ensure uniform distribution within each
 * character class — avoids modulo bias on small pools.
 *
 * @returns {string}  12-character plaintext password
 */
function generateSecurePassword() {
  const length = 12;

  // ── Seed one character from each required class ──────────────────────────
  const required = [
    _randomChar(UPPERCASE),
    _randomChar(LOWERCASE),
    _randomChar(DIGITS),
    _randomChar(SPECIAL),
  ];

  // ── Fill remaining 8 positions from the full character pool ──────────────
  const remaining = Array.from({ length: length - required.length }, () =>
    _randomChar(ALL_CHARS),
  );

  // ── Shuffle all 12 characters using Fisher-Yates with crypto entropy ─────
  const chars = [...required, ...remaining];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = _randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

/**
 * _randomChar(pool)
 * Returns a single cryptographically random character from the pool string.
 * Uses rejection sampling to avoid modulo bias.
 */
function _randomChar(pool) {
  const max    = 256 - (256 % pool.length); // rejection ceiling for uniform dist
  let   byte;
  do {
    byte = crypto.randomBytes(1)[0];
  } while (byte >= max);
  return pool[byte % pool.length];
}

/**
 * _randomInt(max)
 * Returns a cryptographically random integer in [0, max).
 */
function _randomInt(max) {
  if (max <= 1) return 0;
  const ceiling = 256 - (256 % max);
  let   byte;
  do {
    byte = crypto.randomBytes(1)[0];
  } while (byte >= ceiling);
  return byte % max;
}

module.exports = { generateSecurePassword };
