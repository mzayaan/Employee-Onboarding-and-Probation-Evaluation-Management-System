// =============================================================================
// src/models/OnboardingDocument.js
// Table 5: onboarding_documents
// FR-05, FR-06, FR-18 | NFR-02, NFR-08 | Objective 1
// =============================================================================

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OnboardingDocument = sequelize.define('OnboardingDocument', {
  document_id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  profile_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to employee_profiles',
  },
  document_type_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'FK to document_types',
  },
  cloudinary_url: {
    type: DataTypes.STRING(500),
    allowNull: false,
    comment: 'Secure HTTPS URL returned by Cloudinary after upload',
  },
  cloudinary_public_id: {
    type: DataTypes.STRING(255),
    allowNull: true,
    comment: 'Cloudinary public_id used for deletion/management',
  },
  original_filename: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
  file_size: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'File size in bytes — validated < 10 MB in application layer',
  },
  status: {
    type: DataTypes.ENUM('PENDING', 'APPROVED', 'REJECTED'),
    allowNull: false,
    defaultValue: 'PENDING',
  },
  feedback: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Mandatory when status = REJECTED (enforced in service layer)',
  },
  reviewed_by: {
    type: DataTypes.INTEGER,
    allowNull: true,
    comment: 'FK to users — HR Admin who reviewed',
  },
  reviewed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  uploaded_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'onboarding_documents',
  timestamps: false,
});

module.exports = OnboardingDocument;
