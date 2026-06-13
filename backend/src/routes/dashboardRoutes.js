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

// HR per-employee onboarding progress table
router.get('/onboarding-progress', authenticate, authorize('HR_ADMIN'),     getOnboardingProgress)

// Employee own progress summary
router.get('/my-progress',         authenticate, authorize('NEW_EMPLOYEE'), getMyProgress)

module.exports = router
