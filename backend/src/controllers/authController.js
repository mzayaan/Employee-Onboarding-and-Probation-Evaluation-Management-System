// =============================================================================
// src/controllers/authController.js
// Authentication controller — login, logout, get current user
// FR-01, FR-02, FR-03 | NFR-02, NFR-03
// =============================================================================

const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const { User } = require('../models');
const { createAuditLog } = require('../utils/auditLogger');

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

module.exports = { login, logout, getMe };
