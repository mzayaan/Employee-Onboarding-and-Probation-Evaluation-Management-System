// =============================================================================
// src/controllers/dashboardController.js
// HR dashboard summary statistics and onboarding progress endpoints.
// FR-08, FR-17 | Objective 1 & 4
// =============================================================================

const { Op } = require('sequelize')
const {
  EmployeeProfile,
  ProbationPeriod,
  EvaluationCheckpoint,
  OnboardingDocument,
  TaskAssignment,
  User,
  Department,
} = require('../models')

// =============================================================================
// GET /api/dashboard/stats
// HR summary stat cards — total employees, pending docs, active probations,
// overdue tasks.  FR-17 | HR_ADMIN only
// =============================================================================
const getDashboardStats = async (req, res) => {
  try {
    const today   = new Date()
    const in7Days = new Date(today)
    in7Days.setDate(today.getDate() + 7)

    const [
      totalEmployees,
      pendingDocuments,
      activeProbations,
      overdueTasks,
      upcomingEvaluations,
      overdueEvaluations,
    ] = await Promise.all([
      EmployeeProfile.count(),
      OnboardingDocument.count({ where: { status: 'PENDING' } }),
      ProbationPeriod.count({ where: { status: 'ACTIVE' } }),
      TaskAssignment.count({
        where: {
          status: { [Op.ne]: 'COMPLETED' },
          due_date: { [Op.lt]: today },
        },
      }),
      // Upcoming evaluations: PENDING checkpoints with due_date in the next 7 days (FR-17)
      EvaluationCheckpoint.count({
        where: {
          status:   'PENDING',
          due_date: { [Op.between]: [today, in7Days] },
        },
      }),
      // Overdue evaluations: checkpoints already marked OVERDUE (FR-17)
      EvaluationCheckpoint.count({
        where: { status: 'OVERDUE' },
      }),
    ])

    return res.json({
      success: true,
      data: {
        totalEmployees,
        pendingDocuments,
        activeProbations,
        overdueTasks,
        upcomingEvaluations,
        overdueEvaluations,
      },
    })
  } catch (error) {
    console.error('[dashboardController.getDashboardStats]', error.message)
    return res.status(500).json({ success: false, message: 'Failed to load dashboard statistics.' })
  }
}

// =============================================================================
// GET /api/dashboard/onboarding-progress
// Per-employee onboarding progress: task completion % + document counts.
// FR-08, FR-17 | HR_ADMIN only
// =============================================================================
const getOnboardingProgress = async (req, res) => {
  try {
    const { role, user_id } = req.user

    // LINE_MANAGER sees only employees assigned to them (NFR-03)
    const profileWhere = role === 'LINE_MANAGER' ? { manager_id: user_id } : {}

    const profiles = await EmployeeProfile.findAll({
      where: profileWhere,
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['first_name', 'last_name', 'email', 'is_active'],
        },
        {
          model: Department,
          as: 'department',
          attributes: ['name'],
        },
        {
          model: TaskAssignment,
          as: 'taskAssignments',
          attributes: ['status', 'due_date'],
          required: false,
        },
        {
          model: OnboardingDocument,
          as: 'documents',
          attributes: ['status'],
          required: false,
        },
        {
          model: ProbationPeriod,
          as: 'probationPeriods',
          attributes: ['start_date', 'end_date', 'status'],
          required: false,
        },
      ],
      // Use profile_id (auto-increment PK) for ordering — fully unambiguous across
      // all joined tables. Avoids MySQL ambiguous-column errors caused by
      // task_assignments and probation_periods both defining their own created_at.
      order: [['profile_id', 'DESC']],
    })

    const today = new Date()

    const data = profiles.map((p) => {
      const tasks     = p.taskAssignments || []
      const docs      = p.documents       || []
      const probation = (p.probationPeriods  || [])[0] || null

      const totalTasks     = tasks.length
      const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length
      const overdueTasks   = tasks.filter(
        (t) => t.status !== 'COMPLETED' && new Date(t.due_date) < today
      ).length
      const taskProgress   = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

      const approvedDocs = docs.filter((d) => d.status === 'APPROVED').length
      const pendingDocs  = docs.filter((d) => d.status === 'PENDING').length
      const rejectedDocs = docs.filter((d) => d.status === 'REJECTED').length

      const probationDaysLeft = probation
        ? Math.floor((new Date(probation.end_date) - today) / 86400000)
        : null

      return {
        profile_id:          p.profile_id,
        first_name:          p.user?.first_name,
        last_name:           p.user?.last_name,
        is_active:           p.user?.is_active,
        job_title:           p.job_title,
        department:          p.department?.name,
        start_date:          p.start_date        || null,
        task_progress:       taskProgress,
        total_tasks:         totalTasks,
        completed_tasks:     completedTasks,
        overdue_tasks:       overdueTasks,
        total_docs:          docs.length,
        approved_docs:       approvedDocs,
        pending_docs:        pendingDocs,
        rejected_docs:       rejectedDocs,
        probation_end_date:  probation?.end_date || null,
        probation_status:    probation?.status   || null,
        probation_days_left: probationDaysLeft,
      }
    })

    return res.json({ success: true, data })
  } catch (error) {
    console.error('[dashboardController.getOnboardingProgress]', error.message)
    return res.status(500).json({ success: false, message: 'Failed to load onboarding progress.' })
  }
}

// =============================================================================
// GET /api/dashboard/my-progress
// Employee's own onboarding summary for the Employee Dashboard.
// FR-08 | NEW_EMPLOYEE only
// =============================================================================
const getMyProgress = async (req, res) => {
  try {
    const profile = await EmployeeProfile.findOne({
      where: { user_id: req.user.user_id },
      include: [
        {
          model: TaskAssignment,
          as: 'taskAssignments',
          attributes: ['status', 'due_date'],
        },
        {
          model: OnboardingDocument,
          as: 'documents',
          attributes: ['status'],
        },
        {
          model: ProbationPeriod,
          as: 'probationPeriods',
          attributes: ['start_date', 'end_date', 'status'],
          required: false,
        },
      ],
    })

    if (!profile) {
      return res.status(404).json({ success: false, message: 'Employee profile not found.' })
    }

    const today = new Date()
    const tasks = profile.taskAssignments || []
    const docs  = profile.documents       || []
    const prob  = (profile.probationPeriods  || [])[0] || null

    const totalTasks     = tasks.length
    const completedTasks = tasks.filter((t) => t.status === 'COMPLETED').length
    const taskProgress   = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

    const submittedDocs = docs.length
    const approvedDocs  = docs.filter((d) => d.status === 'APPROVED').length

    const probationDaysLeft = prob
      ? Math.floor((new Date(prob.end_date) - today) / 86400000)
      : null

    return res.json({
      success: true,
      data: {
        total_tasks:         totalTasks,
        completed_tasks:     completedTasks,
        task_progress:       taskProgress,
        submitted_docs:      submittedDocs,
        approved_docs:       approvedDocs,
        probation_days_left: probationDaysLeft,
        probation_status:    prob?.status || null,
      },
    });
  } catch (error) {
    console.error('[dashboardController.getMyProgress]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve progress data.' });
  }
};

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  getDashboardStats,
  getOnboardingProgress,
  getMyProgress,
};
