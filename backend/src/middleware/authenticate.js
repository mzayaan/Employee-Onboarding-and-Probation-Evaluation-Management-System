// =============================================================================
// src/middleware/authenticate.js
// JWT authentication middleware — verifies Bearer token on every protected route
// FR-01, FR-02 | NFR-02, NFR-03
// =============================================================================

const jwt = require('jsonwebtoken');
const { User } = require('../models');

/**
 * authenticate
 * Extracts and verifies the JWT from the Authorization header.
 * Attaches req.user = { user_id, email, role, first_name, last_name }
 * Returns 401 if token is missing, expired or invalid.
 */
const authenticate = async (req, res, next) => {
  try {
    // Primary: Authorization header (all API calls from Axios interceptor).
    // Fallback: ?token= query param, used only for direct browser navigation
    // to file-view endpoints (e.g. GET /documents/:id/view opened in a new tab).
    let token;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required. No token provided.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Session expired. Please log in again.',
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please log in again.',
      });
    }

    // Confirm the user still exists and is active (NFR-03)
    const user = await User.findOne({
      where: { user_id: decoded.user_id, is_active: true },
      attributes: ['user_id', 'email', 'role', 'first_name', 'last_name'],
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Account not found or has been deactivated.',
      });
    }

    req.user = user.toJSON();
    next();
  } catch (error) {
    console.error('[authenticate] Unexpected error:', error.message);
    return res.status(500).json({ success: false, message: 'Authentication error.' });
  }
};

module.exports = authenticate;
