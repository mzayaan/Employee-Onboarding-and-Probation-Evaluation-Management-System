// =============================================================================
// src/routes/developmentReviewRoutes.js
// Development Review routes — HR_ADMIN + LINE_MANAGER CRUD,
// NEW_EMPLOYEE read-own + acknowledge.
// FR-12 | NFR-03 | Objective 2
// =============================================================================

const express = require('express');
const router  = express.Router();

const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

const {
  createReview,
  getReviewsByProfile,
  getReviewById,
  updateReview,
  deleteReview,
  getMyReviews,
  acknowledgeReview,
} = require('../controllers/developmentReviewController');

// ── Employee-only routes (must come BEFORE the /:reviewId generic routes) ───
router.get(
  '/my',
  authenticate,
  authorize('NEW_EMPLOYEE'),
  getMyReviews,
);

router.patch(
  '/:reviewId/acknowledge',
  authenticate,
  authorize('NEW_EMPLOYEE'),
  acknowledgeReview,
);

// ── HR Admin + Line Manager routes ───────────────────────────────────────────
router.post(
  '/',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  createReview,
);

router.get(
  '/profile/:profileId',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  getReviewsByProfile,
);

router.get(
  '/:reviewId',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  getReviewById,
);

router.patch(
  '/:reviewId',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  updateReview,
);

router.delete(
  '/:reviewId',
  authenticate,
  authorize('HR_ADMIN', 'LINE_MANAGER'),
  deleteReview,
);

module.exports = router;
