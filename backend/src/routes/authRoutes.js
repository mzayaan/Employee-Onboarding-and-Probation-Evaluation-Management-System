// =============================================================================
// src/routes/authRoutes.js
// Authentication routes
// Base path: /api/auth  (rate-limited by authLimiter in server.js)
// FR-01, FR-02, FR-03
// =============================================================================

const express      = require('express');
const router       = express.Router();
const authenticate = require('../middleware/authenticate');
const { login, logout, getMe, forgotPassword, resetPassword } = require('../controllers/authController');

// POST /api/auth/login   — public
router.post('/login', login);

// POST /api/auth/logout  — protected (must be logged in to log out)
router.post('/logout', authenticate, logout);

// GET  /api/auth/me      — protected (returns current user's details)
router.get('/me', authenticate, getMe);

// POST /api/auth/forgot-password — public (FR-03)
// Generates a hashed reset token and emails the raw token to the user.
router.post('/forgot-password', forgotPassword);

// POST /api/auth/reset-password  — public (FR-03)
// Verifies raw token against stored hash and updates the password.
router.post('/reset-password', resetPassword);

module.exports = router;
