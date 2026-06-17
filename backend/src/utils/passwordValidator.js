// =============================================================================
// src/utils/passwordValidator.js
// Shared password strength validation used across authentication and employee
// creation.  Enforces FR-03: min 8 characters, uppercase, digit, symbol.
// =============================================================================

/**
 * Validates password strength.
 * @param {string} password
 * @returns {{ valid: boolean, message: string }}
 */
const validatePasswordStrength = (password) => {
  if (!password || password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long.' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter.' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number.' };
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one special character (e.g. !@#$%^&*).' };
  }
  return { valid: true, message: '' };
};

module.exports = { validatePasswordStrength };
