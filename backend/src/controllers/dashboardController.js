// =============================================================================
// src/controllers/dashboardController.js
// HR dashboard summary statistics endpoint.
// FR-17 | Objective 4
// Returns live counts from existing tables; expands as blocks are completed.
// =============================================================================

const { EmployeeProfile, ProbationPeriod, OnboardingDocument } = require('../models')

/**
 * GET /api/dashboard/stats
 * Accessible by HR_ADMIN only.
 */
const getDashboardStats = async (req, res) => {
  try {
    const [
      totalEmployees,
      pendingDocuments,
      activeProbations,
    ] = await Promise.all([
      EmployeeProfile.count(),
      OnboardingDocument.count({ where: { status: 'PENDING' } }),
      ProbationPeriod.count({ where: { status: 'ACTIVE' } }),
    ])

    res.json({
      success: true,
      data: {
        totalEmployees,
        pendingDocuments,
        activeProbations,
        overdueEvaluations: 0,   // populated in Block 7 (evaluation checkpoints)
      },
    })
  } catch (error) {
    console.error('[Dashboard] getDashboardStats error:', error.message)
    res.status(500).json({ success: false, message: 'Failed to load dashboard statistics.' })
  }
}

module.exports = { getDashboardStats }
