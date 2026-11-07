// =============================================================================
// src/routes/authRoutes.js
// Authentication routes
// Base path: /api/auth
// FR-01, FR-02, FR-03 | NFR-02
// =============================================================================

const express      = require('express');
const router       = express.Router();
const rateLimit    = require('express-rate-limit');
const authenticate = require('../middleware/authenticate');
const uploadImage  = require('../middleware/uploadImage');
const { login, logout, getMe, forgotPassword, resetPassword, changePassword, uploadProfileImage } = require('../controllers/authController');

// ── Rate limiter for sensitive auth endpoints (NFR-02) ────────────────────────
// Allows 10 attempts per 15-minute window per IP.  Helps mitigate brute-force
// attacks on login and password-reset request endpoints.
const authLimiter = rateLimit({
  windowMs:        15 * 60 * 1000, // 15 minutes
  max:             10,              // max 10 requests per window per IP
  standardHeaders: true,           // Return rate limit info in RateLimit-* headers
  legacyHeaders:   false,
  message: {
    success: false,
    message: 'Too many attempts from this IP address. Please try again after 15 minutes.',
  },
});

// POST /api/auth/login   — public, rate-limited (NFR-02)
router.post('/login', authLimiter, login);

// POST /api/auth/logout  — protected (must be logged in to log out)
router.post('/logout', authenticate, logout);

// GET  /api/auth/me      — protected (returns current user's details)
router.get('/me', authenticate, getMe);

// POST /api/auth/forgot-password — public, rate-limited (FR-03, NFR-02)
// Generates a hashed reset token and emails the raw token to the user.
router.post('/forgot-password', authLimiter, forgotPassword);

// POST /api/auth/reset-password  — public (FR-03)
// Verifies raw token against stored hash and updates the password.
router.post('/reset-password', resetPassword);

// POST /api/auth/change-password — protected (NFR-02 / BUG-09)
// Authenticated user changes their own password — must supply the current one first.
router.post('/change-password', authenticate, changePassword);

// POST /api/auth/profile-image — protected (Spec s.4.1)
// Upload or replace the authenticated user's profile photo.
// Requires an employee profile to exist.  Stored in Cloudinary 'profile-images'.
router.post('/profile-image', authenticate, uploadImage.single('profile_image'), uploadProfileImage);

module.exports = router;
