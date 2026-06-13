// =============================================================================
// src/routes/documentRoutes.js
// FR-05, FR-06, FR-09, FR-18 | Objective 1
// =============================================================================

const express    = require('express');
const router     = express.Router();

const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');
const upload       = require('../middleware/upload');

const {
  getDocumentTypes,
  uploadDocument,
  getMyDocuments,
  getAllDocuments,
  getDocumentsByEmployee,
  verifyDocument,
  viewDocument,
} = require('../controllers/documentController');

// View/proxy document — must be defined BEFORE router.use(authenticate)
// so we can inject token from query param (?token=...) for <a href> links
router.get('/:id/view', (req, res, next) => {
  if (!req.headers.authorization && req.query.token) {
    req.headers.authorization = `Bearer ${req.query.token}`;
  }
  next();
}, authenticate, viewDocument);

// All other routes require authentication via global middleware
router.use(authenticate);

// Document types — any authenticated user
router.get('/types', getDocumentTypes);

// Employee routes
router.post('/upload',
  authorize('NEW_EMPLOYEE'),
  upload.single('document'),    // field name must be 'document'
  uploadDocument
);

router.get('/my',
  authorize('NEW_EMPLOYEE'),
  getMyDocuments
);

// HR routes
router.get('/',
  authorize('HR_ADMIN'),
  getAllDocuments
);

router.get('/employee/:profileId',
  authorize('HR_ADMIN'),
  getDocumentsByEmployee
);

router.patch('/:id/verify',
  authorize('HR_ADMIN'),
  verifyDocument
);

module.exports = router;
