// =============================================================================
// src/routes/hrdcTrainingRoutes.js
// HRDC Training Levy log routes — FR-NEW-01, FR-NEW-03 | NFR-08
//
// Routes:
//   GET    /api/hrdc-training/mine                    → Any authenticated user with an employee profile
//   GET    /api/hrdc-training                         → HR_ADMIN (all logs)
//   GET    /api/hrdc-training/export/g1               → HR_ADMIN (PDF export)
//   GET    /api/hrdc-training/profile/:profileId      → HR_ADMIN (by employee)
//   POST   /api/hrdc-training                         → HR_ADMIN (add entry)
//   DELETE /api/hrdc-training/:trainingId             → HR_ADMIN (remove entry)
//
// IMPORTANT: /mine is declared BEFORE router.use(authorize('HR_ADMIN')) so
//   that any authenticated employee can access their own records.
//   Spec s.4.3: derive profile_id from req.user; never expose another
//   employee's training data.
//
// Note: /export/g1 and /mine must be declared BEFORE /:trainingId to avoid
//   Express treating static path segments as dynamic :trainingId parameters.
// =============================================================================

const express      = require('express');
const router       = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

const {
  getTrainingLogs,
  getTrainingLogsByProfile,
  addTrainingLog,
  deleteTrainingLog,
  exportHRDCG1,
  getMyTrainingLogs,
} = require('../controllers/hrdcTrainingController');

// ── Authentication required for all routes ────────────────────────────────
router.use(authenticate);

// ── Employee self-access route — BEFORE the HR_ADMIN guard ───────────────
// Any authenticated user may fetch their own completed training records.
// profile_id is derived server-side from req.user; training_cost is excluded.
// Spec s.4.3
router.get('/mine', getMyTrainingLogs);

// ── HR_ADMIN-only routes ──────────────────────────────────────────────────
router.use(authorize('HR_ADMIN'));

// Static routes — must precede parameterised routes
router.get('/export/g1',            exportHRDCG1);
router.get('/profile/:profileId',   getTrainingLogsByProfile);
router.get('/',                     getTrainingLogs);
router.post('/',                    addTrainingLog);
router.delete('/:trainingId',       deleteTrainingLog);

module.exports = router;
