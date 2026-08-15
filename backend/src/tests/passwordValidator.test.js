// =============================================================================
// src/tests/passwordValidator.test.js
// Unit tests for the shared password strength validation utility.
//
// validatePasswordStrength is used during user creation (FR-01) and password
// reset (FR-03).  These are pure function tests — no database or HTTP calls.
//
// Requirements: FR-01, FR-03 | NFR-02 (Security)
// =============================================================================

const { validatePasswordStrength } = require('../utils/passwordValidator');

describe('validatePasswordStrength — password policy enforcement (FR-03)', () => {

  // ==========================================================================
  // VALID PASSWORDS
  // Must satisfy: length >= 8, uppercase, digit, special character
  // ==========================================================================

  test('TC-PWD-001: strong password returns valid: true with empty message', () => {
    const result = validatePasswordStrength('Secure1!');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('');
  });

  test('TC-PWD-002: another valid password with different special character', () => {
    const result = validatePasswordStrength('P@ssw0rd');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('');
  });

  test('TC-PWD-003: exactly 8 characters meeting all requirements → valid', () => {
    // Minimum length boundary: exactly 8 chars
    const result = validatePasswordStrength('Abc1!def');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('');
  });

  test('TC-PWD-004: long password with all requirements → valid', () => {
    const result = validatePasswordStrength('MyStr0ng&SecureP@ssword2026');
    expect(result.valid).toBe(true);
    expect(result.message).toBe('');
  });

  // ==========================================================================
  // INVALID — MINIMUM LENGTH
  // ==========================================================================

  test('TC-PWD-005: password shorter than 8 characters → invalid', () => {
    const result = validatePasswordStrength('Ab1!');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/8 characters/i);
  });

  test('TC-PWD-006: empty string → invalid', () => {
    const result = validatePasswordStrength('');
    expect(result.valid).toBe(false);
    expect(result.message).toBeTruthy();
  });

  test('TC-PWD-007: null input → invalid (no crash)', () => {
    const result = validatePasswordStrength(null);
    expect(result.valid).toBe(false);
    expect(result.message).toBeTruthy();
  });

  test('TC-PWD-008: 7-character password just below minimum → invalid', () => {
    // Boundary: 7 chars (one below limit of 8)
    const result = validatePasswordStrength('Abc1!de');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/8 characters/i);
  });

  // ==========================================================================
  // INVALID — MISSING UPPERCASE LETTER
  // ==========================================================================

  test('TC-PWD-009: password with no uppercase letter → invalid', () => {
    const result = validatePasswordStrength('password1!');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/uppercase/i);
  });

  test('TC-PWD-010: all-lowercase with digit and special char → invalid', () => {
    const result = validatePasswordStrength('secure1@pass');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/uppercase/i);
  });

  // ==========================================================================
  // INVALID — MISSING DIGIT
  // ==========================================================================

  test('TC-PWD-011: password with no digit → invalid', () => {
    const result = validatePasswordStrength('Password!');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/number/i);
  });

  test('TC-PWD-012: uppercase and special char but no digit → invalid', () => {
    const result = validatePasswordStrength('Secure@Pass');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/number/i);
  });

  // ==========================================================================
  // INVALID — MISSING SPECIAL CHARACTER
  // ==========================================================================

  test('TC-PWD-013: password with no special character → invalid', () => {
    const result = validatePasswordStrength('Password1');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/special character/i);
  });

  test('TC-PWD-014: alphanumeric only (no special char) → invalid', () => {
    const result = validatePasswordStrength('SecurePass1');
    expect(result.valid).toBe(false);
    expect(result.message).toMatch(/special character/i);
  });

  // ==========================================================================
  // RETURN SHAPE
  // ==========================================================================

  test('TC-PWD-015: always returns an object with valid and message properties', () => {
    const inputs = ['Secure1!', 'weak', '', null];
    inputs.forEach((input) => {
      const result = validatePasswordStrength(input);
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('message');
      expect(typeof result.valid).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });
  });

});
