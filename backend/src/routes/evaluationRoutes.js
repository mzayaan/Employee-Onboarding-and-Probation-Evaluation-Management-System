// =============================================================================
// src/routes/evaluationRoutes.js
// FR-11, FR-12, FR-13, FR-14, FR-15 | NFR-02, NFR-03 | Objectives 2, 3
// =============================================================================

const express = require('express');
const {
  getProbationByProfile,
  getMyProbation,
  getCheckpoint,
  getMyTeam,
  submitManagerEvaluation,
  submitSelfAssessment,
} = require('../controllers/evaluationController');
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

const router = express.Router();

// ── Employee routes ────────────────────────────────────────────────────────
// GET /api/evaluations/my-probation
router.get(
  '/my-probation',
  authenticate,
  authorize('NEW_EMPLOYEE'),
  getMyProbation
);

// POST /api/evaluations/checkpoint/:checkpointId/self
router.post(
  '/checkpoint/:checkpointId/self',
  authenticate,
  authorize('NEW_EMPLOYEE'),
  submitSelfAssessment
);

// ── Manager routes ─────────────────────────────────────────────────────────
// GET /api/evaluations/manager/my-team
router.get(
  '/manager/my-team',
  authenticate,
  authorize('LINE_MANAGER'),
  getMyTeam
);

// POST /api/evaluations/checkpoint/:checkpointId/manager
router.post(
  '/checkpoint/:checkpointId/manager',
  authenticate,
  authorize('LINE_MANAGER', 'HR_ADMIN'),
  submitManagerEvaluation
);

// ── Shared routes (HR Admin + Line Manager + Employee) ────────────────────
// GET /api/evaluations/checkpoint/:checkpointId
router.get(
  '/checkpoint/:checkpointId',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER', 'NEW_EMPLOYEE'),
  getCheckpoint
);

// GET /api/evaluations/probation/:profileId  (HR Admin + Manager)
router.get(
  '/probation/:profileId',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  getProbationByProfile
);

module.exports = router;
