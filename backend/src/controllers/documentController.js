// =============================================================================
// src/controllers/documentController.js
// Handles onboarding document upload, listing and HR verification.
// FR-05, FR-06, FR-09, FR-18 | NFR-02, NFR-03, NFR-08 | Objective 1
// =============================================================================

const axios = require('axios');

const {
  OnboardingDocument,
  DocumentType,
  EmployeeProfile,
  User,
} = require('../models');

const { uploadToCloudinary, deleteFromCloudinary, getSignedUrl } = require('../utils/cloudinary');
const { sendDocumentApprovedEmail, sendDocumentRejectedEmail } = require('../utils/mailer');
const { createAuditLog } = require('../utils/auditLogger');
const { createNotification } = require('../services/notificationService');

const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// =============================================================================
// GET /api/documents/types
// Returns all available document types. Accessible to all authenticated users.
// FR-05
// =============================================================================
const getDocumentTypes = async (req, res) => {
  try {
    const types = await DocumentType.findAll({
      order: [['display_order', 'ASC'], ['name', 'ASC']],
    });
    return res.json({ success: true, data: types });
  } catch (error) {
    console.error('[documentController.getDocumentTypes]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve document types.' });
  }
};

// =============================================================================
// POST /api/documents/upload
// Employee uploads a document. Multer parses the file; we stream to Cloudinary.
// FR-05, FR-18 | NFR-02
// =============================================================================
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const { document_type_id } = req.body;
    if (!document_type_id) {
      return res.status(400).json({ success: false, message: 'document_type_id is required.' });
    }

    // Verify document type exists
    const docType = await DocumentType.findByPk(document_type_id);
    if (!docType) {
      return res.status(400).json({ success: false, message: 'Invalid document type.' });
    }

    // Find the employee profile for the authenticated user
    const profile = await EmployeeProfile.findOne({
      where: { user_id: req.user.user_id },
    });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    // Check for an existing PENDING or APPROVED submission of the same type
    // (allow re-upload only if REJECTED)
    const existing = await OnboardingDocument.findOne({
      where: {
        profile_id:       profile.profile_id,
        document_type_id: Number(document_type_id),
      },
      order: [['uploaded_at', 'DESC']],
    });

    if (existing && existing.status !== 'REJECTED') {
      return res.status(409).json({
        success: false,
        message:
          existing.status === 'APPROVED'
            ? 'This document has already been approved.'
            : 'A submission for this document type is already pending review.',
      });
    }

    // Upload to Cloudinary
    const { secure_url, public_id } = await uploadToCloudinary(
      req.file.buffer,
      'onboarding-documents',
      req.file.originalname
    );

    // Create record
    const doc = await OnboardingDocument.create({
      profile_id:           profile.profile_id,
      document_type_id:     Number(document_type_id),
      cloudinary_url:       secure_url,
      cloudinary_public_id: public_id,
      original_filename:    req.file.originalname,
      file_size:            req.file.size,
      status:               'PENDING',
      uploaded_at:          new Date(),
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'DOCUMENT_UPLOAD',
      description: `Employee uploaded ${docType.name} (document_id: ${doc.document_id}).`,
      ipAddress:   getIp(req),
    });

    return res.status(201).json({
      success: true,
      message: 'Document uploaded successfully. It is now pending HR review.',
      data: {
        document_id:       doc.document_id,
        document_type:     docType.name,
        original_filename: doc.original_filename,
        status:            doc.status,
        uploaded_at:       doc.uploaded_at,
      },
    });
  } catch (error) {
    console.error('[documentController.uploadDocument]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to upload document.' });
  }
};

// =============================================================================
// GET /api/documents/my
// Employee views their own submitted documents.
// FR-05 | NFR-03
// =============================================================================
const getMyDocuments = async (req, res) => {
  try {
    const profile = await EmployeeProfile.findOne({
      where: { user_id: req.user.user_id },
    });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    const docs = await OnboardingDocument.findAll({
      where: { profile_id: profile.profile_id },
      include: [
        { model: DocumentType, as: 'documentType', attributes: ['type_id', 'name', 'is_required'] },
      ],
      order: [['uploaded_at', 'DESC']],
    });

    return res.json({ success: true, data: docs });
  } catch (error) {
    console.error('[documentController.getMyDocuments]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve documents.' });
  }
};

// =============================================================================
// GET /api/documents
// HR views all submitted documents, optionally filtered by status.
// FR-06 | NFR-03
// =============================================================================
const getAllDocuments = async (req, res) => {
  try {
    const { status } = req.query; // PENDING | APPROVED | REJECTED

    const where = {};
    if (status && ['PENDING', 'APPROVED', 'REJECTED'].includes(status)) {
      where.status = status;
    }

    const docs = await OnboardingDocument.findAll({
      where,
      include: [
        { model: DocumentType, as: 'documentType', attributes: ['type_id', 'name', 'is_required'] },
        {
          model: EmployeeProfile,
          as: 'employeeProfile',
          attributes: ['profile_id', 'job_title'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['user_id', 'first_name', 'last_name', 'email'],
            },
          ],
        },
      ],
      order: [['uploaded_at', 'DESC']],
    });

    return res.json({ success: true, data: docs });
  } catch (error) {
    console.error('[documentController.getAllDocuments]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve documents.' });
  }
};

// =============================================================================
// GET /api/documents/employee/:profileId
// HR views all documents submitted by a specific employee.
// FR-06 | NFR-03
// =============================================================================
const getDocumentsByEmployee = async (req, res) => {
  try {
    const { profileId } = req.params;

    const docs = await OnboardingDocument.findAll({
      where: { profile_id: profileId },
      include: [
        { model: DocumentType, as: 'documentType', attributes: ['type_id', 'name', 'is_required'] },
      ],
      order: [['uploaded_at', 'DESC']],
    });

    return res.json({ success: true, data: docs });
  } catch (error) {
    console.error('[documentController.getDocumentsByEmployee]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve documents.' });
  }
};

// =============================================================================
// PATCH /api/documents/:id/verify
// HR approves or rejects a document. Rejection requires feedback text.
// FR-06, FR-09, FR-18 | NFR-02
// =============================================================================
const verifyDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, feedback } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'status must be APPROVED or REJECTED.',
      });
    }

    if (status === 'REJECTED' && !feedback?.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Feedback is required when rejecting a document.',
      });
    }

    const doc = await OnboardingDocument.findByPk(id, {
      include: [
        { model: DocumentType, as: 'documentType', attributes: ['name'] },
        {
          model: EmployeeProfile,
          as: 'employeeProfile',
          attributes: ['profile_id'],
          include: [
            {
              model: User,
              as: 'user',
              attributes: ['user_id', 'first_name', 'last_name', 'email'],
            },
          ],
        },
      ],
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    if (doc.status !== 'PENDING') {
      return res.status(409).json({
        success: false,
        message: `Document has already been ${doc.status.toLowerCase()}.`,
      });
    }

    await doc.update({
      status,
      feedback:    status === 'REJECTED' ? feedback.trim() : null,
      reviewed_by: req.user.user_id,
      reviewed_at: new Date(),
    });

    // ── Audit log ──────────────────────────────────────────────────────────
    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  status === 'APPROVED' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
      description: `Document ID ${id} (${doc.documentType.name}) ${status.toLowerCase()} by HR.`,
      ipAddress:   getIp(req),
    });

    // ── Email notification ─────────────────────────────────────────────────
    const employee = doc.employeeProfile?.user;
    if (employee) {
      if (status === 'APPROVED') {
        await sendDocumentApprovedEmail({
          to:               employee.email,
          firstName:        employee.first_name,
          documentTypeName: doc.documentType.name,
        });
      } else {
        await sendDocumentRejectedEmail({
          to:               employee.email,
          firstName:        employee.first_name,
          documentTypeName: doc.documentType.name,
          feedback:         feedback.trim(),
        });
      }
      // In-app notification for the employee
      if (employee) {
        await createNotification({
          userId:  employee.user_id,
          type:    status === 'APPROVED' ? 'DOCUMENT_APPROVED' : 'DOCUMENT_REJECTED',
          message: status === 'APPROVED'
            ? `Your document "${doc.documentType.name}" has been approved.`
            : `Your document "${doc.documentType.name}" was rejected. Feedback: ${feedback.trim()}`,
          relatedEntityType: 'document',
          relatedEntityId:   doc.document_id,
        });
      }
    }

    return res.json({
      success: true,
      message: `Document ${status.toLowerCase()} successfully.`,
      data: {
        document_id:  doc.document_id,
        status:       doc.status,
        reviewed_at:  doc.reviewed_at,
        feedback:     doc.feedback,
      },
    });
  } catch (error) {
    console.error('[documentController.verifyDocument]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to verify document.' });
  }
};

// =============================================================================
// GET /api/documents/:id/view
// Proxies the document file from Cloudinary through the backend.
// Employees may only view their own documents; HR may view any.
// FR-05, FR-06 | NFR-02, NFR-03
// =============================================================================
const viewDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const doc = await OnboardingDocument.findByPk(id, {
      include: [
        {
          model: EmployeeProfile,
          as: 'employeeProfile',
          attributes: ['profile_id', 'user_id'],
        },
      ],
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    // Access control (NFR-03):
    //   NEW_EMPLOYEE → own documents only
    //   LINE_MANAGER → documents belonging to employees they manage
    //   HR_ADMIN     → unrestricted
    if (req.user.role === 'NEW_EMPLOYEE') {
      const profile = await EmployeeProfile.findOne({ where: { user_id: req.user.user_id } });
      if (!profile || doc.profile_id !== profile.profile_id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    } else if (req.user.role === 'LINE_MANAGER') {
      // Verify the document's owner is assigned to this manager
      const ownerProfile = await EmployeeProfile.findOne({
        where: { profile_id: doc.profile_id },
        attributes: ['manager_id'],
      });
      if (!ownerProfile || ownerProfile.manager_id !== req.user.user_id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    // Generate a short-lived signed URL via the configured Cloudinary instance.
    // Uses the API credentials in cloudinary.js so signing works correctly.
    const signedUrl = getSignedUrl(doc.cloudinary_public_id, 120);

    // Fetch the signed URL and pipe the response back to the client.
    const cloudinaryResponse = await axios.get(signedUrl, {
      responseType: 'stream',
      timeout:      30000,
    })
    // Forward content-type and content-disposition so the browser handles the
    // file correctly (inline display or download where appropriate).
    const contentType = cloudinaryResponse.headers['content-type'];
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${doc.original_filename || 'document'}"`
    );

    cloudinaryResponse.data.pipe(res);
  } catch (error) {
    console.error('[documentController.viewDocument]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve document.' });
  }
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  getDocumentTypes,
  uploadDocument,
  getMyDocuments,
  getAllDocuments,
  getDocumentsByEmployee,
  verifyDocument,
  viewDocument,
};
