// =============================================================================
// src/routes/contractRoutes.js
// Employment contract routes — FR-04 (extended) | NFR-02, NFR-03
//
// Routes:
//   GET  /api/contracts/mine                   → NEW_EMPLOYEE (own contract)
//   GET  /api/contracts/profile/:profileId     → HR_ADMIN (any contract)
//   POST /api/contracts                        → HR_ADMIN (create)
//   PATCH /api/contracts/:contractId/sign      → NEW_EMPLOYEE (digital sign)
// =============================================================================

const express    = require('express');
const router     = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const { enforceProbationClause } = require('../middleware/validateProbationBoundary');

const {
  getMyContract,
  getContractByProfile,
  createContract,
  signContract,
} = require('../controllers/contractController');

router.use(authenticate);

// Employee: retrieve own contract
router.get('/mine', authorize('NEW_EMPLOYEE'), getMyContract);

// HR: retrieve any employee's contract by profile ID
router.get('/profile/:profileId', authorize('HR_ADMIN'), getContractByProfile);

// HR: create a new contract — enforceProbationClause checks WRA 2019 s.13
router.post('/', authorize('HR_ADMIN'), enforceProbationClause, createContract);

// Employee: digitally sign their contract
router.patch('/:contractId/sign', authorize('NEW_EMPLOYEE'), signContract);

module.exports = router;
