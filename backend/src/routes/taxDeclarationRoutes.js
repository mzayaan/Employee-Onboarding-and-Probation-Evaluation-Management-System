// =============================================================================
// src/routes/taxDeclarationRoutes.js
// MRA Employee Declaration Form (EDF) routes — FR-NEW-02 | NFR-08
//
// Routes:
//   GET  /api/tax-declarations/mine  → NEW_EMPLOYEE (own declaration)
//   POST /api/tax-declarations       → NEW_EMPLOYEE (create/replace)
// =============================================================================

const express      = require('express');
const router       = express.Router();
const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

const {
  getMyTaxDeclaration,
  submitTaxDeclaration,
} = require('../controllers/taxDeclarationController');

router.use(authenticate);

router.get('/mine', authorize('NEW_EMPLOYEE'), getMyTaxDeclaration);
router.post('/',    authorize('NEW_EMPLOYEE'), submitTaxDeclaration);

module.exports = router;
