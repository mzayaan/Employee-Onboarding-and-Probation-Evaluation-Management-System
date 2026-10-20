// =============================================================================
// src/middleware/authorize.js
// Role-based access control middleware
// FR-01, FR-02, FR-22 | NFR-03
// Updated: added ROLES constants export and DIRECTOR role
// =============================================================================

/**
 * ROLES
 * Named constants for all user roles in the system.
 * Import these in route files instead of using magic strings to prevent typos.
 *
 * Usage in routes:
 *   const { ROLES } = require('../middleware/authorize');
 *   router.get('/approve', authenticate, authorize(ROLES.DIRECTOR), handler);
 */
const ROLES = {
  HR_ADMIN:     'HR_ADMIN',
  LINE_MANAGER: 'LINE_MANAGER',
  NEW_EMPLOYEE: 'NEW_EMPLOYEE',
  SYSTEM_ADMIN: 'SYSTEM_ADMIN',
  DIRECTOR:     'DIRECTOR',
};

/**
 * authorize(...roles)
 * Factory that returns a middleware allowing only the specified roles.
 *
 * Usage:
 *   router.get('/admin-only', authenticate, authorize(ROLES.SYSTEM_ADMIN), handler);
 *   router.get('/hr-or-manager', authenticate, authorize(ROLES.HR_ADMIN, ROLES.LINE_MANAGER), handler);
 *   router.get('/director', authenticate, authorize(ROLES.DIRECTOR), handler);
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
module.exports.ROLES = ROLES;
