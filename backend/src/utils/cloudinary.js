// =============================================================================
// src/utils/cloudinary.js
// Cloudinary SDK configuration and upload / delete helpers.
// Credentials are loaded from environment variables — never hard-coded.
// FR-05 | NFR-02, NFR-08
// =============================================================================

const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure:     true,
});

/**
 * Upload a file buffer to Cloudinary.
 * @param {Buffer} buffer      - File buffer from Multer memoryStorage.
 * @param {string} folder      - Cloudinary folder, e.g. 'onboarding-documents'.
 * @param {string} originalName - Original filename (used to build public_id).
 * @returns {Promise<{secure_url: string, public_id: string}>}
 */
const uploadToCloudinary = (buffer, folder, originalName) => {
  return new Promise((resolve, reject) => {
    const sanitised = originalName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const timestamp = Date.now();

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id:       `${timestamp}_${sanitised}`,
        resource_type:   'raw',
        access_mode:     'public',
        use_filename:    false,
        unique_filename: false,
      },
      (error, result) => {
        if (error) return reject(error);
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );

    // Pipe the buffer into the upload stream
    const readable = new Readable();
    readable.push(buffer);
    readable.push(null);
    readable.pipe(uploadStream);
  });
};

/**
 * Delete a file from Cloudinary by public_id.
 * @param {string} publicId
 * @returns {Promise<void>}
 */
const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' });
};

/**
 * Generate a short-lived authenticated download URL for a raw resource using
 * Cloudinary's private_download_url (api.cloudinary.com endpoint).
 * This uses full API credentials so it works regardless of the account's
 * delivery access settings, unlike res.cloudinary.com signed URLs.
 * @param {string} publicId   - Cloudinary public_id of the resource.
 * @param {number} [ttlSeconds=120] - Seconds until the URL expires.
 * @returns {string} Authenticated download URL.
 */
const getSignedUrl = (publicId, ttlSeconds = 120) => {
  return cloudinary.utils.private_download_url(publicId, '', {
    resource_type: 'raw',
    type:          'upload',
    expires_at:    Math.floor(Date.now() / 1000) + ttlSeconds,
    attachment:    false,
  });
};

module.exports = { uploadToCloudinary, deleteFromCloudinary, getSignedUrl };
