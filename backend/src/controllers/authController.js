// =============================================================================
// src/controllers/authController.js
// Authentication controller — login, logout, get current user
// FR-01, FR-02, FR-03 | NFR-02, NFR-03
// =============================================================================

const bcrypt  = require('bcrypt');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { Op }  = require('sequelize');
const { User } = require('../models');
const { createAuditLog }         = require('../utils/auditLogger');
const { sendPasswordResetEmail } = require('../utils/mailer');

// Helper: extract real IP from request (handles reverse proxies)
const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// =============================================================================
// POST /api/auth/login
// FR-01, FR-02 | NFR-02
// =============================================================================
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Basic input validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    // Find user by email — include password_hash for comparison
    const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });

    // Use the same response for "not found" and "wrong password" to prevent
    // user enumeration attacks (NFR-02)
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact HR.',
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Sign 24-hour JWT (PAF approved — no refresh tokens for FYP)
    const token = jwt.sign(
      {
        user_id:    user.user_id,
        email:      user.email,
        role:       user.role,
        first_name: user.first_name,
        last_name:  user.last_name,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Update last login timestamp
    await user.update({ last_login_at: new Date() });

    // Audit log
    await createAuditLog({
      userId:      user.user_id,
      actionType:  'LOGIN',
      description: `User ${user.email} logged in successfully.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        user_id:    user.user_id,
        email:      user.email,
        role:       user.role,
        first_name: user.first_name,
        last_name:  user.last_name,
      },
    });
  } catch (error) {
    console.error('[authController.login]', error.message);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

// =============================================================================
// POST /api/auth/logout
// Stateless JWT — client must discard the token.
// Audit log records the intent to log out.
// FR-01 | NFR-02
// =============================================================================
const logout = async (req, res) => {
  try {
    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'LOGOUT',
      description: `User ${req.user.email} logged out.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    console.error('[authController.logout]', error.message);
    return res.status(500).json({ success: false, message: 'Logout failed.' });
  }
};

// =============================================================================
// GET /api/auth/me
// Returns the authenticated user's profile from the token.
// FR-02
// =============================================================================
const getMe = async (req, res) => {
  try {
    const user = await User.findOne({
      where: { user_id: req.user.user_id },
      attributes: ['user_id', 'email', 'role', 'first_name', 'last_name', 'last_login_at', 'created_at'],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    console.error('[authController.getMe]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve user.' });
  }
};

// =============================================================================
// POST /api/auth/forgot-password
// Generates a time-limited reset token, stores its SHA-256 hash in the DB,
// and emails the raw token to the user.
// Always returns 200 to prevent email enumeration (NFR-02).
// FR-03 | NFR-02
// =============================================================================
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });

    // Always respond with 200 — do not reveal whether the email exists (NFR-02)
    if (!user || !user.is_active) {
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a reset link has been sent.',
      });
    }

    // Generate raw token (32 random bytes → hex string)
    const rawToken = crypto.randomBytes(32).toString('hex');
    // Store SHA-256 hash so the raw token is never persisted (NFR-02)
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await user.update({
      reset_token:        hashedToken,
      reset_token_expiry: expiry,
    });

    // Send the raw token in the reset link (fire-and-forget — non-critical)
    sendPasswordResetEmail({
      to:         user.email,
      firstName:  user.first_name,
      rawToken,
    }).catch(() => {});

    await createAuditLog({
      userId:      user.user_id,
      actionType:  'PASSWORD_RESET_REQUESTED',
      description: `Password reset requested for ${user.email}.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a reset link has been sent.',
    });
  } catch (error) {
    console.error('[authController.forgotPassword]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to process request.' });
  }
};

// =============================================================================
// POST /api/auth/reset-password
// Verifies the raw token against the stored hash, checks expiry,
// updates password_hash with bcrypt and clears the reset fields.
// Body: { token, password }
// FR-03 | NFR-02
// =============================================================================
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    }

    // Hash the incoming raw token and look it up
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      where: {
        reset_token:        hashedToken,
        reset_token_expiry: { [Op.gt]: new Date() }, // must not be expired
        is_active:          true,
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'This reset link is invalid or has expired. Please request a new one.',
      });
    }

    const password_hash = await bcrypt.hash(password, 12);

    await user.update({
      password_hash,
      reset_token:        null,
      reset_token_expiry: null,
    });

    await createAuditLog({
      userId:      user.user_id,
      actionType:  'PASSWORD_RESET_COMPLETED',
      description: `Password reset completed for ${user.email}.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    console.error('[authController.resetPassword]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};

module.exports = { login, logout, getMe, forgotPassword, resetPassword };
