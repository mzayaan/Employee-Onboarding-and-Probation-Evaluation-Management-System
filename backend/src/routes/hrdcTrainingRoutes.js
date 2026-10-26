// =============================================================================
// src/routes/hrdcTrainingRoutes.js
// HRDC Training Levy log routes — FR-NEW-01 | NFR-08
//
// Routes:
//   GET    /api/hrdc-training                       → HR_ADMIN (all logs)
//   GET    /api/hrdc-training/export/g1             → HR_ADMIN (PDF export)
//   GET    /api/hrdc-training/profile/:profileId    → HR_ADMIN (by employee)
//   POST   /api/hrdc-training                       → HR_ADMIN (add entry)
//   DELETE /api/hrdc-training/:trainingId           → HR_ADMIN (remove entry)
//
// Note: /export/g1 must be declared BEFORE /:trainingId to avoid Express
//       treating "export" as a dynamic :trainingId parameter.
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
} = require('../controllers/hrdcTrainingController');

router.use(authenticate);
router.use(authorize('HR_ADMIN'));

// Static routes — must precede parameterised routes
router.get('/export/g1',            exportHRDCG1);
router.get('/profile/:profileId',   getTrainingLogsByProfile);
router.get('/',                     getTrainingLogs);
router.post('/',                    addTrainingLog);
router.delete('/:trainingId',       deleteTrainingLog);

module.exports = router;
