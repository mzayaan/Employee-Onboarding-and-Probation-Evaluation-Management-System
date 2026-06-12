// =============================================================================
// src/utils/auditLogger.js
// Utility to create audit log entries
// FR-18 | NFR-08
// =============================================================================

const { AuditLog } = require('../models');

/**
 * createAuditLog
 * Inserts an audit record. Call this after any significant system action.
 *
 * @param {object} params
 * @param {number} params.userId      - user_id of the actor
 * @param {string} params.actionType  - one of the audit_logs ENUM values
 * @param {string} params.description - human-readable description
 * @param {string} [params.ipAddress] - IP address of the request (optional)
 */
const createAuditLog = async ({ userId, actionType, description, ipAddress = null }) => {
  try {
    await AuditLog.create({
      user_id: userId,
      action_type: actionType,
      description,
      ip_address: ipAddress,
    });
  } catch (error) {
    // Audit failures must not crash the main request — log silently
    console.error('[AuditLog] Failed to write audit entry:', error.message);
  }
};

module.exports = { createAuditLog };
