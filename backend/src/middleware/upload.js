// =============================================================================
// src/middleware/upload.js
// Multer middleware for onboarding document uploads.
// Accepts: PDF, JPG, JPEG, PNG, DOCX  |  Max: 5 MB per file
// FR-05 | NFR-02
// =============================================================================

const multer = require('multer');

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

const storage = multer.memoryStorage(); // buffer → streamed to Cloudinary

const fileFilter = (req, file, cb) => {
  if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error(
        'Invalid file type. Only PDF, JPG, PNG and DOCX files are accepted.'
      ),
      false
    );
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
});

module.exports = upload;
