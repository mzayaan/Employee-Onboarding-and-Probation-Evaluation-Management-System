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

// All routes require a valid Bearer token in the Authorization header (NFR-02).
// The previous ?token= query-param injection has been removed: exposing the JWT
// in a URL leaks it into server logs, browser history and Referer headers.
// Callers must use the Axios instance (which attaches the header automatically)
// or include `Authorization: Bearer <token>` in the request.
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

// View/proxy document — requires standard Bearer auth (NFR-02).
// Frontend must use the Axios instance (blob responseType) rather than
// a plain <a href> so the Authorization header is sent correctly.
// LINE_MANAGER may view documents belonging to their team members (NFR-03/BUG-06).
router.get('/:id/view',
  authorize('NEW_EMPLOYEE', 'HR_ADMIN', 'LINE_MANAGER'),
  viewDocument
);

module.exports = router;
