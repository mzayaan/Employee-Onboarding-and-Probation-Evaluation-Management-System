// =============================================================================
// src/routes/dashboardRoutes.js
// FR-08, FR-17 | Objective 1 & 4
// =============================================================================

const express = require('express')
const router  = express.Router()

const authenticate = require('../middleware/authenticate')
const authorize    = require('../middleware/authorize')
const {
  getDashboardStats,
  getOnboardingProgress,
  getMyProgress,
} = require('../controllers/dashboardController')

// HR stat cards
router.get('/stats',               authenticate, authorize('HR_ADMIN'),     getDashboardStats)

// HR and LINE_MANAGER per-employee onboarding progress table
// LINE_MANAGER receives only employees assigned to them (filtered in controller)
router.get('/onboarding-progress', authenticate, authorize('HR_ADMIN', 'LINE_MANAGER'), getOnboardingProgress)

// Employee own progress summary
router.get('/my-progress',         authenticate, authorize('NEW_EMPLOYEE'), getMyProgress)

module.exports = router
