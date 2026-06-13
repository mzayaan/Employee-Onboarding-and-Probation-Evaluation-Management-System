// =============================================================================
// src/routes/criteriaRoutes.js
// Evaluation criteria routes — System Admin only.
// FR-10 | NFR-03 | Objective 2
// =============================================================================

const express    = require('express');
const router     = express.Router();

const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

const {
  getCriteria,
  createCriterion,
  updateCriterion,
  deactivateCriterion,
} = require('../controllers/criteriaController');

// All criteria routes require authentication and SYSTEM_ADMIN role
router.use(authenticate, authorize(['SYSTEM_ADMIN']));

router.get('/',     getCriteria);
router.post('/',    createCriterion);
router.put('/:id',  updateCriterion);
router.delete('/:id', deactivateCriterion);

module.exports = router;
