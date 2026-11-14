// =============================================================================
// src/controllers/authController.js
// Authentication controller — login, logout, get current user
// FR-01, FR-02, FR-03 | NFR-02, NFR-03
// =============================================================================

const bcrypt  = require('bcrypt');
const crypto  = require('crypto');
const jwt     = require('jsonwebtoken');
const { Op }  = require('sequelize');
const { User, EmployeeProfile, Department } = require('../models');
const { createAuditLog }           = require('../utils/auditLogger');
const { sendPasswordResetEmail }   = require('../utils/mailer');
const { validatePasswordStrength } = require('../utils/passwordValidator');

// Helper: extract real IP from request (handles reverse proxies)
const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// =============================================================================
// POST /api/auth/login
// FR-01, FR-02 | NFR-02
// =============================================================================
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Basic input validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.',
      });
    }

    // Find user by email — include password_hash for comparison
    const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });

    // Use the same response for "not found" and "wrong password" to prevent
    // user enumeration attacks (NFR-02)
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    if (!user.is_active) {
      // Audit: log deactivated-account login attempt (FR-18)
      await createAuditLog({
        userId:      user.user_id,
        actionType:  'LOGIN_FAILED',
        description: `Login attempt on deactivated account for ${user.email}.`,
        ipAddress:   getIp(req),
      });
      return res.status(403).json({
        success: false,
        message: 'Your account has been deactivated. Please contact HR.',
      });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      // Audit: log wrong-password attempt (FR-18)
      await createAuditLog({
        userId:      user.user_id,
        actionType:  'LOGIN_FAILED',
        description: `Failed login attempt for ${user.email} — incorrect password.`,
        ipAddress:   getIp(req),
      });
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // Sign 24-hour JWT (PAF approved — no refresh tokens for FYP)
    const token = jwt.sign(
      {
        user_id:    user.user_id,
        email:      user.email,
        role:       user.role,
        first_name: user.first_name,
        last_name:  user.last_name,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );

    // Update last login timestamp
    await user.update({ last_login_at: new Date() });

    // Audit log
    await createAuditLog({
      userId:      user.user_id,
      actionType:  'LOGIN',
      description: `User ${user.email} logged in successfully.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: {
        user_id:    user.user_id,
        email:      user.email,
        role:       user.role,
        first_name: user.first_name,
        last_name:  user.last_name,
      },
    });
  } catch (error) {
    console.error('[authController.login]', error.message);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

// =============================================================================
// POST /api/auth/logout
// Stateless JWT — client must discard the token.
// Audit log records the intent to log out.
// FR-01 | NFR-02
// =============================================================================
const logout = async (req, res) => {
  try {
    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'LOGOUT',
      description: `User ${req.user.email} logged out.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({
      success: true,
      message: 'Logged out successfully.',
    });
  } catch (error) {
    console.error('[authController.logout]', error.message);
    return res.status(500).json({ success: false, message: 'Logout failed.' });
  }
};

// =============================================================================
// GET /api/auth/me
// Returns the authenticated user's profile from the token.
// FR-02
// =============================================================================
const getMe = async (req, res) => {
  try {
    const user = await User.findOne({
      where: { user_id: req.user.user_id },
      attributes: ['user_id', 'email', 'role', 'first_name', 'last_name', 'last_login_at', 'created_at'],
    });

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Spec s.4.1: include EmployeeProfile for all roles that have one, so the
    // top-nav consolidated profile block can show job_title and profile_image_url.
    // For NEW_EMPLOYEE the full profile is returned; for other roles a minimal
    // subset (job_title, profile_image_url, department name) is included.
    let employeeProfile = null;

    if (user.role === 'NEW_EMPLOYEE') {
      employeeProfile = await EmployeeProfile.findOne({
        where: { user_id: user.user_id },
        attributes: [
          'profile_id', 'job_title', 'phone', 'start_date', 'probation_end_date',
          'onboarding_status', 'profile_image_url',
          // Employment details (shown read-only on MyProfilePage)
          'employment_type', 'work_schedule_type', 'weekly_working_hours', 'work_location',
          // Identity & compliance (shown read-only on MyProfilePage)
          'nic_number', 'tax_account_number', 'date_of_birth', 'nationality',
          'id_document_type', 'passport_number',
          // Banking details (shown read-only on MyProfilePage)
          'bank_name', 'bank_account_number',
          // Address (shown read-only on MyProfilePage)
          'address_line_1', 'address_line_2', 'locality', 'district', 'country',
          // Salary (shown read-only on MyProfilePage)
          'salary_monthly',
          // Employee-editable fields (editable on MyProfilePage)
          'personal_email',
          'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone',
          'highest_qualification', 'field_of_study', 'educational_institution',
          'previous_job_title',
        ],
        include: [{
          model: Department,
          as: 'department',
          attributes: ['name'],
        }],
      });
    } else {
      // HR_ADMIN, LINE_MANAGER, DIRECTOR, SYSTEM_ADMIN may also have an
      // EmployeeProfile created by HR (not mandatory — required: false).
      employeeProfile = await EmployeeProfile.findOne({
        where: { user_id: user.user_id },
        attributes: ['profile_id', 'job_title', 'profile_image_url'],
        required: false,
      }) || null;
    }

    return res.status(200).json({ success: true, user, employeeProfile });
  } catch (error) {
    console.error('[authController.getMe]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve user.' });
  }
};

// =============================================================================
// POST /api/auth/forgot-password
// Generates a time-limited reset token, stores its SHA-256 hash in the DB,
// and emails the raw token to the user.
// Always returns 200 to prevent email enumeration (NFR-02).
// FR-03 | NFR-02
// =============================================================================
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email is required.' });
    }

    const user = await User.findOne({ where: { email: email.toLowerCase().trim() } });

    // Always respond with 200 — do not reveal whether the email exists (NFR-02)
    if (!user || !user.is_active) {
      return res.status(200).json({
        success: true,
        message: 'If an account with that email exists, a reset link has been sent.',
      });
    }

    // Generate raw token (32 random bytes → hex string)
    const rawToken = crypto.randomBytes(32).toString('hex');
    // Store SHA-256 hash so the raw token is never persisted (NFR-02)
    const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    await user.update({
      reset_token:        hashedToken,
      reset_token_expiry: expiry,
    });

    // Send the raw token in the reset link (fire-and-forget — non-critical)
    sendPasswordResetEmail({
      to:         user.email,
      firstName:  user.first_name,
      rawToken,
    }).catch(() => {});

    await createAuditLog({
      userId:      user.user_id,
      actionType:  'PASSWORD_RESET_REQUESTED',
      description: `Password reset requested for ${user.email}.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({
      success: true,
      message: 'If an account with that email exists, a reset link has been sent.',
    });
  } catch (error) {
    console.error('[authController.forgotPassword]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to process request.' });
  }
};

// =============================================================================
// POST /api/auth/reset-password
// Verifies the raw token against the stored hash, checks expiry,
// updates password_hash with bcrypt and clears the reset fields.
// Body: { token, password }
// FR-03 | NFR-02
// =============================================================================
const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ success: false, message: 'Token and password are required.' });
    }
    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return res.status(400).json({ success: false, message: pwCheck.message });
    }

    // Hash the incoming raw token and look it up
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      where: {
        reset_token:        hashedToken,
        reset_token_expiry: { [Op.gt]: new Date() }, // must not be expired
        is_active:          true,
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'This reset link is invalid or has expired. Please request a new one.',
      });
    }

    const password_hash = await bcrypt.hash(password, 12);

    await user.update({
      password_hash,
      reset_token:        null,
      reset_token_expiry: null,
    });

    await createAuditLog({
      userId:      user.user_id,
      actionType:  'PASSWORD_RESET_COMPLETED',
      description: `Password reset completed for ${user.email}.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (error) {
    console.error('[authController.resetPassword]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};

// =============================================================================
// POST /api/auth/change-password
// Authenticated user changes their own password by providing the current one.
// Body: { currentPassword, newPassword }
// NFR-02 | FR-01
// =============================================================================
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'currentPassword and newPassword are required.',
      });
    }

    const pwCheck = validatePasswordStrength(newPassword);
    if (!pwCheck.valid) {
      return res.status(400).json({ success: false, message: pwCheck.message });
    }

    const user = await User.findByPk(req.user.user_id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect.' });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from the current password.',
      });
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    await user.update({ password_hash });

    await createAuditLog({
      userId:      user.user_id,
      actionType:  'PASSWORD_CHANGED',
      description: `User ${user.email} changed their password.`,
      ipAddress:   getIp(req),
    });

    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (error) {
    console.error('[authController.changePassword]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to change password.' });
  }
};

// =============================================================================
// POST /api/auth/profile-image
// Upload or replace the authenticated user's profile image.
//
// Spec s.4.1: profile image stored in Cloudinary under the 'profile-images'
// folder; URL saved to EmployeeProfile.profile_image_url.
// If the user has no EmployeeProfile, a 404 is returned.
// The old Cloudinary image is deleted when a new one replaces it.
//
// FR-04 (profile management) | NFR-02, NFR-08
// =============================================================================
const uploadProfileImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No image file provided.' });
    }

    const profile = await EmployeeProfile.findOne({ where: { user_id: req.user.user_id } });
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'No employee profile found for this account.',
      });
    }

    const { uploadToCloudinary, deleteFromCloudinary } = require('../utils/cloudinary');

    // Delete the old profile image from Cloudinary if one exists
    if (profile.profile_image_url) {
      try {
        // Extract public_id from the existing URL
        // Cloudinary URLs look like: https://res.cloudinary.com/<cloud>/image/upload/v.../profile-images/<id>
        const urlParts = profile.profile_image_url.split('/');
        const publicIdWithExt = urlParts.slice(urlParts.indexOf('profile-images')).join('/');
        const publicId = publicIdWithExt.replace(/\.[^.]+$/, ''); // strip extension
        await deleteFromCloudinary(publicId);
      } catch {
        // Non-fatal: proceed even if old image deletion fails
      }
    }

    // Upload new image to Cloudinary (public access — profile images are not sensitive)
    const cloudinary = require('cloudinary').v2;
    const { Readable } = require('stream');

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder:          'profile-images',
          public_id:       `user_${req.user.user_id}_${Date.now()}`,
          resource_type:   'image',
          access_mode:     'public',
          overwrite:       true,
          transformation:  [{ width: 256, height: 256, crop: 'fill', gravity: 'face' }],
        },
        (error, result) => {
          if (error) return reject(error);
          resolve(result);
        }
      );
      const readable = new Readable();
      readable.push(req.file.buffer);
      readable.push(null);
      readable.pipe(stream);
    });

    await profile.update({ profile_image_url: uploadResult.secure_url });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'UPDATE_PROFILE_IMAGE',
      description: `Profile image updated for user ${req.user.user_id}.`,
    });

    return res.json({
      success: true,
      message: 'Profile image updated.',
      profile_image_url: uploadResult.secure_url,
    });
  } catch (error) {
    console.error('[authController.uploadProfileImage]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to upload profile image.' });
  }
};

module.exports = { login, logout, getMe, forgotPassword, resetPassword, changePassword, uploadProfileImage };
