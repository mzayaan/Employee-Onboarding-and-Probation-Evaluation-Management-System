// =============================================================================
// src/routes/directorRoutes.js
//
// Routes for the three-stage probation approval workflow.
//
// Access matrix:
//   HR_ADMIN  — list pending-hr, endorse, return-to-manager, list-all
//   LINE_MANAGER — resubmit (own rec only)
//   DIRECTOR  — list pending-director, approve, return
//   HR_ADMIN + DIRECTOR — get single recommendation details
//
// All routes require a valid JWT (authenticate middleware).
// FR-15, FR-16, FR-20 | NFR-02, NFR-03 | Objective 3
// =============================================================================

const express = require('express');
const router  = express.Router();

const authenticate = require('../middleware/authenticate');
const authorise    = require('../middleware/authorize');

const {
  listPendingHR,
  listPendingDirector,
  getRecommendation,
  endorseRecommendation,
  returnToManagerByHR,
  resubmitRecommendation,
  reviseAndResubmitRecommendation,
  approveRecommendation,
  returnByDirector,
  listAllRecommendations,
  listMyRecommendations,
} = require('../controllers/directorController');

// ---------------------------------------------------------------------------
// All routes require authentication
// ---------------------------------------------------------------------------
router.use(authenticate);

// ---------------------------------------------------------------------------
// HR queue — recommendations awaiting HR review
// GET /api/director/pending-hr
// ---------------------------------------------------------------------------
router.get(
  '/pending-hr',
  authorise('HR_ADMIN'),
  listPendingHR
);

// ---------------------------------------------------------------------------
// Director queue — recommendations awaiting Director decision
// GET /api/director/pending-director
// ---------------------------------------------------------------------------
router.get(
  '/pending-director',
  authorise('DIRECTOR'),
  listPendingDirector
);

// ---------------------------------------------------------------------------
// All recommendations — HR/Director overview
// GET /api/director/all
// ---------------------------------------------------------------------------
router.get(
  '/all',
  authorise('HR_ADMIN', 'DIRECTOR'),
  listAllRecommendations
);

// ---------------------------------------------------------------------------
// Single recommendation detail for review
// GET /api/director/recommendation/:recId
// ---------------------------------------------------------------------------
router.get(
  '/recommendation/:recId',
  authorise('HR_ADMIN', 'DIRECTOR', 'LINE_MANAGER'),
  getRecommendation
);

// ---------------------------------------------------------------------------
// HR: endorse recommendation → PENDING_DIRECTOR
// POST /api/director/:recId/endorse
// Body: { hr_endorsement_notes? }
// ---------------------------------------------------------------------------
router.post(
  '/:recId/endorse',
  authorise('HR_ADMIN'),
  endorseRecommendation
);

// ---------------------------------------------------------------------------
// HR: return recommendation to manager → RETURNED_TO_MANAGER
// POST /api/director/:recId/return-to-manager
// Body: { hr_endorsement_notes (required) }
// ---------------------------------------------------------------------------
router.post(
  '/:recId/return-to-manager',
  authorise('HR_ADMIN'),
  returnToManagerByHR
);

// ---------------------------------------------------------------------------
// Manager: list own submitted recommendations (all statuses)
// GET /api/director/my-recommendations
// ---------------------------------------------------------------------------
router.get(
  '/my-recommendations',
  authorise('LINE_MANAGER'),
  listMyRecommendations
);

// ---------------------------------------------------------------------------
// Manager: resubmit returned recommendation (justification-only path)
// POST /api/director/:recId/resubmit
// Body: { justification (required) }
// ---------------------------------------------------------------------------
router.post(
  '/:recId/resubmit',
  authorise('LINE_MANAGER', 'HR_ADMIN'),
  resubmitRecommendation
);

// ---------------------------------------------------------------------------
// Manager: revise scores and resubmit returned recommendation      (G08)
// POST /api/director/:recId/revise-and-resubmit
// Body: { justification, correction_reason, score_corrections? }
// Transition: RETURNED_TO_MANAGER → PENDING_HR_REVIEW
// FR-15, FR-18 | G08 | NFR-02, NFR-03 | Objective 3
// ---------------------------------------------------------------------------
router.post(
  '/:recId/revise-and-resubmit',
  authorise('LINE_MANAGER'),
  reviseAndResubmitRecommendation
);

// ---------------------------------------------------------------------------
// Director: approve recommendation → APPROVED (updates ProbationPeriod)
// POST /api/director/:recId/approve
// Body: { director_reason? }
// ---------------------------------------------------------------------------
router.post(
  '/:recId/approve',
  authorise('DIRECTOR'),
  approveRecommendation
);

// ---------------------------------------------------------------------------
// Director: return recommendation → RETURNED_TO_MANAGER
// POST /api/director/:recId/return
// Body: { director_reason (required) }
// ---------------------------------------------------------------------------
router.post(
  '/:recId/return',
  authorise('DIRECTOR'),
  returnByDirector
);

module.exports = router;
