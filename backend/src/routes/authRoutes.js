// =============================================================================
// src/routes/authRoutes.js
// Authentication routes
// Base path: /api/auth  (rate-limited by authLimiter in server.js)
// FR-01, FR-02, FR-03
// =============================================================================

const express      = require('express');
const router       = express.Router();
const authenticate = require('../middleware/authenticate');
const { login, logout, getMe } = require('../controllers/authController');

// POST /api/auth/login   — public
router.post('/login', login);

// POST /api/auth/logout  — protected (must be logged in to log out)
router.post('/logout', authenticate, logout);

// GET  /api/auth/me      — protected (returns current user's details)
router.get('/me', authenticate, getMe);

module.exports = router;
