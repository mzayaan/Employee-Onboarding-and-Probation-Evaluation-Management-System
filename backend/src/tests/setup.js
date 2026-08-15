// =============================================================================
// src/tests/setup.js
// Jest global test environment setup.
// Runs before any test file via "setupFiles" in package.json jest config.
// Sets the environment variables required by authentication and other modules
// so tests can run without a real .env file.
// =============================================================================

// Ensure NODE_ENV is 'test' (Jest sets this automatically, but explicit is safer)
process.env.NODE_ENV = 'test';

// JWT configuration — used by authenticate middleware and authController
process.env.JWT_SECRET      = 'test-jwt-secret-key-for-jest-only';
process.env.JWT_EXPIRES_IN  = '1h';

// Database — not used in unit tests; present so require('dotenv') does not warn
process.env.DB_HOST     = 'localhost';
process.env.DB_PORT     = '3306';
process.env.DB_NAME     = 'test_db';
process.env.DB_USER     = 'test_user';
process.env.DB_PASSWORD = 'test_password';

// Cloudinary — not used in unit/auth tests; silences missing-var warnings
process.env.CLOUDINARY_CLOUD_NAME = 'test';
process.env.CLOUDINARY_API_KEY    = 'test';
process.env.CLOUDINARY_API_SECRET = 'test';

// Email — not used in unit tests
process.env.SMTP_HOST = 'localhost';
process.env.SMTP_PORT = '587';
process.env.SMTP_USER = 'test@test.com';
process.env.SMTP_PASS = 'test';

// Frontend URL — used by CORS and password-reset emails
process.env.CLIENT_URL = 'http://localhost:5173';
