// =============================================================================
// src/middleware/uploadImage.js
// Multer middleware for profile image uploads.
// Accepts: JPG, JPEG, PNG  |  Max: 2 MB
//
// A separate middleware from upload.js (which handles onboarding documents)
// so that image-specific constraints are enforced independently.
//
// Spec s.4.1 — profile image upload | FR-04 | NFR-02
// =============================================================================

const multer = require('multer');

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];
const MAX_SIZE_BYTES   = 2 * 1024 * 1024; // 2 MB

const storage = multer.memoryStorage(); // buffer → streamed to Cloudinary

const fileFilter = (req, file, cb) => {
  if (IMAGE_MIME_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new Error('Invalid file type. Only JPG and PNG images are accepted for profile photos.'),
      false
    );
  }
};

const uploadImage = multer({
  storage,
  fileFilter,
  limits: { fileSize: MAX_SIZE_BYTES },
});

module.exports = uploadImage;
