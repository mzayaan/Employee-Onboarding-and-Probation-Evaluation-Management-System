// =============================================================================
// src/routes/dashboardRoutes.js
// FR-08, FR-12, FR-17 | Objective 1 & 4
//
// Updated (Block 6): added /gender-headcount and /attendance-breakdown routes.
// =============================================================================

const express = require('express')
const router  = express.Router()

const authenticate = require('../middleware/authenticate')
const authorize    = require('../middleware/authorize')
const {
  getDashboardStats,
  getGenderHeadcount,
  getAttendanceBreakdown,
  getOnboardingProgress,
  getMyProgress,
} = require('../controllers/dashboardController')

// HR stat cards (includes gender headcount inline)
router.get('/stats',               authenticate, authorize('HR_ADMIN'),     getDashboardStats)

// Lecturer requirement: standalone gender headcount for Chart.js pie/bar chart
// GET /api/dashboard/gender-headcount
router.get('/gender-headcount',    authenticate, authorize('HR_ADMIN'),     getGenderHeadcount)

// Lecturer requirement: attendance status breakdown for HR dashboard
// GET /api/dashboard/attendance-breakdown[?from=YYYY-MM-DD&to=YYYY-MM-DD&profile_id=X]
router.get('/attendance-breakdown',authenticate, authorize('HR_ADMIN'),     getAttendanceBreakdown)

// HR and LINE_MANAGER per-employee onboarding progress table
// LINE_MANAGER receives only employees in their department (filtered in controller)
router.get('/onboarding-progress', authenticate, authorize('HR_ADMIN', 'LINE_MANAGER'), getOnboardingProgress)

// Employee own progress summary
router.get('/my-progress',         authenticate, authorize('NEW_EMPLOYEE'), getMyProgress)

module.exports = router
