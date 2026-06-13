// =============================================================================
// src/routes/dashboardRoutes.js
// FR-17 | Objective 4
// =============================================================================

const express = require('express')
const router  = express.Router()

const authenticate           = require('../middleware/authenticate')
const authorize              = require('../middleware/authorize')
const { getDashboardStats }  = require('../controllers/dashboardController')

router.get('/stats', authenticate, authorize('HR_ADMIN'), getDashboardStats)

module.exports = router
