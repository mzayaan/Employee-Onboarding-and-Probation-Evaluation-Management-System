/**
 * src/tests/__mocks__/bcrypt.js
 *
 * Pure-JS test double for the bcrypt native addon.
 *
 * Used via jest.config.js moduleNameMapper so the Windows-compiled
 * bcrypt_lib.node binary is never loaded in the Linux test sandbox.
 * Individual test files that need bcrypt to behave differently can still
 * override these defaults with jest.fn().mockResolvedValue(...) in their
 * own beforeEach blocks.
 *
 * Production behaviour is unchanged — this file is never loaded outside
 * the Jest test runner.
 */

module.exports = {
  hash:        jest.fn().mockResolvedValue('$2b$10$mockhashforlinuxtestenvironment'),
  compare:     jest.fn().mockResolvedValue(true),
  genSalt:     jest.fn().mockResolvedValue('$2b$10$mocksalt'),
  hashSync:    jest.fn().mockReturnValue('$2b$10$mockhashsync'),
  compareSync: jest.fn().mockReturnValue(true),
  genSaltSync: jest.fn().mockReturnValue('$2b$10$mockSaltSync'),
};
