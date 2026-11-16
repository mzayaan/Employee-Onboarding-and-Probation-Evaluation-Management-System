/**
 * jest.config.js
 *
 * Merges all options from the "jest" section of package.json and adds a
 * moduleNameMapper entry that redirects 'bcrypt' to a pure-JS test double.
 *
 * WHY THIS FILE EXISTS
 * --------------------
 * The bcrypt npm package ships a pre-compiled native addon (bcrypt_lib.node).
 * The Windows binary (PE32+ DLL) cannot be loaded inside the Linux-based
 * test sandbox.  Direct binary replacement is blocked by NTFS EPERM on the
 * mounted volume, and there is no outbound internet access to download a
 * Linux prebuilt.
 *
 * moduleNameMapper intercepts the require('bcrypt') call before Node ever
 * tries to load the binary, so every test suite runs regardless of platform.
 *
 * SCOPE
 * -----
 * This redirect is test-only.  Production code is unaffected: the real bcrypt
 * binary is used at runtime on the developer's Windows machine and on any
 * deployment target.
 *
 * PACKAGE.JSON ALIGNMENT
 * ----------------------
 * When jest.config.js is present, Jest ignores the "jest" key in package.json.
 * All options from that key are reproduced verbatim below so no behaviour
 * changes.
 */

module.exports = {
  testEnvironment: 'node',
  testMatch:       ['**/tests/**/*.test.js'],
  setupFiles:      ['./src/tests/setup.js'],
  testTimeout:     10000,
  moduleNameMapper: {
    '^bcrypt$': '<rootDir>/src/tests/__mocks__/bcrypt.js',
  },
};
