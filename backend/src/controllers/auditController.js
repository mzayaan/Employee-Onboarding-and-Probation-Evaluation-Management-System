// =============================================================================
// src/controllers/auditController.js
// System Audit Log — read-only listing for System Administrators.
// FR-18 | NFR-08 | Objective 4
// =============================================================================

const { Op } = require('sequelize');

// ── GET /api/audit ─────────────────────────────────────────────────────────
// Query params:
//   search      – freetext match on description or username
//   action_type – exact ENUM match
//   page        – 1-based page number (default 1)
//   limit       – rows per page (default 25, max 100)
// SYSTEM_ADMIN only (enforced by route middleware).
const getAuditLogs = async (req, res) => {
  try {
    const { AuditLog, User } = require('../models');

    const {
      search      = '',
      action_type = '',
      page        = 1,
      limit       = 25,
    } = req.query;

    const pageNum  = Math.max(1, parseInt(page,  10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const offset   = (pageNum - 1) * pageSize;

    // ── Build where clause ─────────────────────────────────────────────────
    const where = {};

    if (action_type) {
      where.action_type = action_type;
    }

    if (search.trim()) {
      where.description = { [Op.like]: `%${search.trim()}%` };
    }

    // ── Query ──────────────────────────────────────────────────────────────
    const { count, rows } = await AuditLog.findAndCountAll({
      where,
      include: [
        {
          model:      User,
          as:         'actor',
          attributes: ['user_id', 'first_name', 'last_name', 'role'],
        },
      ],
      order:  [['created_at', 'DESC']],
      limit:  pageSize,
      offset,
    });

    return res.json({
      success: true,
      data:    rows,
      pagination: {
        total:      count,
        page:       pageNum,
        limit:      pageSize,
        totalPages: Math.ceil(count / pageSize),
      },
    });
  } catch (error) {
    console.error('[auditController.getAuditLogs]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve audit logs.' });
  }
};

module.exports = { getAuditLogs };
