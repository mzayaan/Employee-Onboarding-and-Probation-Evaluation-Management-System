// =============================================================================
// src/controllers/developmentReviewController.js
// Development Review CRUD — HR Admin and Line Manager.
// Employee read + acknowledge — NEW_EMPLOYEE (own reviews only).
// FR-12 | Objective 2
// =============================================================================

const { DevelopmentReview, EmployeeProfile, User, EvaluationCheckpoint } = require('../models');
const { createAuditLog }        = require('../utils/auditLogger');
const { createNotification }    = require('../services/notificationService');

// ── Helper: include config ─────────────────────────────────────────────────
const REVIEW_INCLUDE = [
  {
    model: User,
    as: 'reviewer',
    attributes: ['user_id', 'first_name', 'last_name', 'role'],
  },
  {
    model: EmployeeProfile,
    as: 'employeeProfile',
    include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name', 'email'] }],
  },
  {
    model: EvaluationCheckpoint,
    as: 'checkpoint',
    attributes: ['checkpoint_id', 'checkpoint_label', 'due_date'],
    required: false,
  },
];

// ── POST /api/development-reviews ─────────────────────────────────────────
exports.createReview = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const {
      profile_id,
      checkpoint_id,
      work_life_balance_rating,
      workload_assessment,
      professional_balance_notes,
      professional_development_goals,
      actions_to_balance,
      support_offered,
      next_review_date,
    } = req.body;

    if (!profile_id) {
      return res.status(400).json({ success: false, message: 'profile_id is required.' });
    }

    // LINE_MANAGER scope check: can only review their own team
    if (req.user.role === 'LINE_MANAGER') {
      const profile = await EmployeeProfile.findByPk(profile_id);
      if (!profile || profile.manager_id !== userId) {
        return res.status(403).json({ success: false, message: 'You can only create development reviews for employees in your team.' });
      }
    }

    const review = await DevelopmentReview.create({
      profile_id,
      checkpoint_id: checkpoint_id || null,
      reviewed_by: userId,
      work_life_balance_rating:       work_life_balance_rating       || null,
      workload_assessment:            workload_assessment            || null,
      professional_balance_notes:     professional_balance_notes     || null,
      professional_development_goals: professional_development_goals || null,
      actions_to_balance:             actions_to_balance             || null,
      support_offered:                support_offered                || null,
      next_review_date:               next_review_date               || null,
      employee_acknowledgement:       false,
    });

    await createAuditLog({
      userId,
      actionType:  'DEVELOPMENT_REVIEW_CREATED',
      description: `Development review created for profile ${profile_id} by user ${userId}.`,
    });

    const full = await DevelopmentReview.findByPk(review.review_id, { include: REVIEW_INCLUDE });

    // Notify the employee that a development review has been created for them
    EmployeeProfile.findByPk(profile_id, { attributes: ['user_id'] })
      .then((ep) => {
        if (!ep) return;
        const reviewerName = `${req.user.first_name} ${req.user.last_name}`;
        createNotification({
          userId:            ep.user_id,
          type:              'DEVELOPMENT_REVIEW_CREATED',
          message:           `A development review has been created for you by ${reviewerName}. Please log in to review and acknowledge it.`,
          relatedEntityType: 'development_review',
          relatedEntityId:   review.review_id,
        }).catch(() => {});
      })
      .catch(() => {});

    return res.status(201).json({ success: true, data: full });
  } catch (err) {
    console.error('createReview error:', err);
    return res.status(500).json({ success: false, message: 'Failed to create development review.' });
  }
};

// ── GET /api/development-reviews/profile/:profileId ───────────────────────
exports.getReviewsByProfile = async (req, res) => {
  try {
    const { profileId } = req.params;
    const userId = req.user.user_id;

    // LINE_MANAGER scope check
    if (req.user.role === 'LINE_MANAGER') {
      const profile = await EmployeeProfile.findByPk(profileId);
      if (!profile || profile.manager_id !== userId) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    const reviews = await DevelopmentReview.findAll({
      where: { profile_id: profileId },
      include: REVIEW_INCLUDE,
      order: [['created_at', 'DESC']],
    });

    return res.json({ success: true, data: reviews });
  } catch (err) {
    console.error('getReviewsByProfile error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch development reviews.' });
  }
};

// ── GET /api/development-reviews/:reviewId ────────────────────────────────
exports.getReviewById = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const review = await DevelopmentReview.findByPk(reviewId, { include: REVIEW_INCLUDE });
    if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });

    // LINE_MANAGER scope check
    if (req.user.role === 'LINE_MANAGER') {
      const profile = await EmployeeProfile.findByPk(review.profile_id);
      if (!profile || profile.manager_id !== req.user.user_id) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }
    }

    return res.json({ success: true, data: review });
  } catch (err) {
    console.error('getReviewById error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch review.' });
  }
};

// ── PATCH /api/development-reviews/:reviewId ──────────────────────────────
exports.updateReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.user_id;

    const review = await DevelopmentReview.findByPk(reviewId);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });

    // LINE_MANAGER may only update their own reviews
    if (req.user.role === 'LINE_MANAGER' && review.reviewed_by !== userId) {
      return res.status(403).json({ success: false, message: 'You can only edit reviews you created.' });
    }

    const updatable = [
      'work_life_balance_rating',
      'workload_assessment',
      'professional_balance_notes',
      'professional_development_goals',
      'actions_to_balance',
      'support_offered',
      'next_review_date',
      'employee_acknowledgement',
      'employee_acknowledgement_date',
    ];

    const updates = {};
    updatable.forEach((field) => {
      if (field in req.body) updates[field] = req.body[field];
    });
    updates.updated_at = new Date();

    await review.update(updates);

    await createAuditLog({
      userId,
      actionType:  'DEVELOPMENT_REVIEW_UPDATED',
      description: `Development review ${reviewId} updated by user ${userId}.`,
    });

    const updated = await DevelopmentReview.findByPk(reviewId, { include: REVIEW_INCLUDE });
    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('updateReview error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update review.' });
  }
};

// ── GET /api/development-reviews/my — Employee: list own reviews ──────────
// NFR-03: employees may only access their own review records.
exports.getMyReviews = async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Find the employee's profile
    const profile = await EmployeeProfile.findOne({ where: { user_id: userId } });
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' });
    }

    const reviews = await DevelopmentReview.findAll({
      where: { profile_id: profile.profile_id },
      include: REVIEW_INCLUDE,
      order: [['created_at', 'DESC']],
    });

    return res.json({ success: true, data: reviews });
  } catch (err) {
    console.error('getMyReviews error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch your development reviews.' });
  }
};

// ── PATCH /api/development-reviews/:reviewId/acknowledge — Employee ────────
// Employee sets employee_acknowledgement = true and optionally records the date.
// NFR-03: employee may only acknowledge their own reviews.
exports.acknowledgeReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.user_id;

    const review = await DevelopmentReview.findByPk(reviewId);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });

    // Verify this review belongs to the requesting employee
    const profile = await EmployeeProfile.findOne({ where: { user_id: userId } });
    if (!profile || review.profile_id !== profile.profile_id) {
      return res.status(403).json({ success: false, message: 'You can only acknowledge your own development reviews.' });
    }

    const { employee_acknowledgement_date } = req.body;

    await review.update({
      employee_acknowledgement:      true,
      employee_acknowledgement_date: employee_acknowledgement_date || new Date().toISOString().slice(0, 10),
      updated_at:                    new Date(),
    });

    await createAuditLog({
      userId,
      actionType:  'DEVELOPMENT_REVIEW_ACKNOWLEDGED',
      description: `Employee (user ${userId}) acknowledged development review ${reviewId}.`,
    });

    const updated = await DevelopmentReview.findByPk(reviewId, { include: REVIEW_INCLUDE });

    // Notify the reviewer (manager/HR) that the employee has acknowledged the review
    if (review.reviewed_by) {
      const empName = `${req.user.first_name} ${req.user.last_name}`;
      createNotification({
        userId:            review.reviewed_by,
        type:              'DEVELOPMENT_REVIEW_ACKNOWLEDGED',
        message:           `${empName} has acknowledged their development review.`,
        relatedEntityType: 'development_review',
        relatedEntityId:   review.review_id,
      }).catch(() => {});
    }

    return res.json({ success: true, data: updated });
  } catch (err) {
    console.error('acknowledgeReview error:', err);
    return res.status(500).json({ success: false, message: 'Failed to acknowledge review.' });
  }
};

// ── DELETE /api/development-reviews/:reviewId ─────────────────────────────
exports.deleteReview = async (req, res) => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.user_id;

    const review = await DevelopmentReview.findByPk(reviewId);
    if (!review) return res.status(404).json({ success: false, message: 'Review not found.' });

    // LINE_MANAGER may only delete their own reviews
    if (req.user.role === 'LINE_MANAGER' && review.reviewed_by !== userId) {
      return res.status(403).json({ success: false, message: 'You can only delete reviews you created.' });
    }

    await review.destroy();

    await createAuditLog({
      userId,
      actionType:  'DEVELOPMENT_REVIEW_DELETED',
      description: `Development review ${reviewId} deleted by user ${userId}.`,
    });

    return res.json({ success: true, message: 'Review deleted.' });
  } catch (err) {
    console.error('deleteReview error:', err);
    return res.status(500).json({ success: false, message: 'Failed to delete review.' });
  }
};
