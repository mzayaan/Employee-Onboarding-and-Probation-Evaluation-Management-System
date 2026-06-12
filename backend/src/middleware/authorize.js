// =============================================================================
// src/middleware/authorize.js
// Role-based access control middleware
// FR-01, FR-02 | NFR-03
// =============================================================================

/**
 * authorize(...roles)
 * Factory that returns a middleware allowing only the specified roles.
 *
 * Usage:
 *   router.get('/admin-only', authenticate, authorize('SYSTEM_ADMIN'), handler);
 *   router.get('/hr-or-manager', authenticate, authorize('HR_ADMIN', 'LINE_MANAGER'), handler);
 *
 * Must be used AFTER the authenticate middleware so req.user is populated.
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You do not have permission to perform this action.',
      });
    }

    next();
  };
};

module.exports = authorize;
