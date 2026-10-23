// =============================================================================
// src/controllers/dashboardController.js
// HR dashboard summary statistics and onboarding progress endpoints.
//
// Updated (Block 6 — lecturer requirements):
//   - getDashboardStats: now includes gender headcount (male/female) inline
//   - getGenderHeadcount: standalone endpoint for gender breakdown pie/bar chart
//   - getAttendanceBreakdown: per-status attendance counts using the full WRA 2019
//     ENUM (PRESENT, ABSENT, LATE, HALF_DAY, SICK_LEAVE, ANNUAL_LEAVE,
//     VACATION_LEAVE, MATERNITY_LEAVE, PATERNITY_LEAVE, SPECIAL_LEAVE,
//     PUBLIC_HOLIDAY). Accepts optional ?from=YYYY-MM-DD&to=YYYY-MM-DD query
//     params; defaults to current calendar month.
//
// FR-08, FR-17 | NFR-03 | Objectives 1 & 4
// =============================================================================

const { Op, fn, col, literal } = require('sequelize')
const {
  EmployeeProfile,
  ProbationPeriod,
  EvaluationCheckpoint,
  OnboardingDocument,
  TaskAssignment,
  AttendanceRecord,
  User,
  Department,
} = require('../models')

// ---------------------------------------------------------------------------
// HELPER: build the first and last day of the current calendar month
// ---------------------------------------------------------------------------
const currentMonthRange = () => {
  const now   = new Date()
  const from  = new Date(now.getFullYear(), now.getMonth(), 1)
  const to    = new Date(now.getFullYear(), now.getMonth() + 1, 0)  // last day
  return { from, to }
}

// ---------------------------------------------------------------------------
// HELPER: parse a YYYY-MM-DD string safely; returns null on invalid input
// ---------------------------------------------------------------------------
const parseDate = (str) => {
  if (!str) return null
  const d = new Date(str)
  return Number.isNaN(d.getTime()) ? null : d
}

// =============================================================================
// GET /api/dashboard/stats
// HR summary stat cards — total employees, pending docs, active probations,
// overdue tasks, gender headcount.
// FR-17 | HR_ADMIN only
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
      maleCount,
      femaleCount,
    ] = await Promise.all([
      EmployeeProfile.count(),
      OnboardingDocument.count({ where: { status: 'PENDING' } }),
      ProbationPeriod.count({ where: { status: 'ACTIVE' } }),
      TaskAssignment.count({
        where: {
          status:   { [Op.ne]: 'COMPLETED' },
          due_date: { [Op.lt]: today },
        },
      }),
      // Upcoming evaluations: PENDING checkpoints with due_date in next 7 days (FR-17)
      EvaluationCheckpoint.count({
        where: {
          status:   'PENDING',
          due_date: { [Op.between]: [today, in7Days] },
        },
      }),
      // Overdue evaluations: checkpoints marked OVERDUE (FR-17)
      EvaluationCheckpoint.count({
        where: { status: 'OVERDUE' },
      }),
      // Lecturer requirement: gender headcount — Male
      EmployeeProfile.count({ where: { gender: 'Male' } }),
      // Lecturer requirement: gender headcount — Female
      EmployeeProfile.count({ where: { gender: 'Female' } }),
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
        // Gender headcount — included here for quick stat-card display
        // and also available as a dedicated chart endpoint: GET /gender-headcount
        genderHeadcount: {
          male:     maleCount,
          female:   femaleCount,
          unspecified: totalEmployees - maleCount - femaleCount,
        },
      },
    })
  } catch (error) {
    console.error('[dashboardController.getDashboardStats]', error.message)
    return res.status(500).json({ success: false, message: 'Failed to load dashboard statistics.' })
  }
}

// =============================================================================
// GET /api/dashboard/gender-headcount
// Staff headcount broken down by gender — for Chart.js pie or bar chart.
// Lecturer requirement: HR must be able to see Male / Female staff counts.
// FR-17 | HR_ADMIN | Objective 4
// =============================================================================
const getGenderHeadcount = async (req, res) => {
  try {
    // Pull counts for all recognised gender values plus a catch-all for
    // profiles where gender has not yet been set (NULL).
    const [male, female, unspecified] = await Promise.all([
      EmployeeProfile.count({ where: { gender: 'Male' } }),
      EmployeeProfile.count({ where: { gender: 'Female' } }),
      EmployeeProfile.count({ where: { gender: null } }),
    ])

    const total = male + female + unspecified

    return res.json({
      success: true,
      data: {
        total,
        breakdown: [
          { gender: 'Male',        count: male,        percent: total > 0 ? Number(((male / total) * 100).toFixed(1)) : 0 },
          { gender: 'Female',      count: female,      percent: total > 0 ? Number(((female / total) * 100).toFixed(1)) : 0 },
          { gender: 'Unspecified', count: unspecified, percent: total > 0 ? Number(((unspecified / total) * 100).toFixed(1)) : 0 },
        ],
      },
    })
  } catch (error) {
    console.error('[dashboardController.getGenderHeadcount]', error.message)
    return res.status(500).json({ success: false, message: 'Failed to load gender headcount.' })
  }
}

// =============================================================================
// GET /api/dashboard/attendance-breakdown
// Attendance record counts grouped by status for the current calendar month
// (or a custom date range supplied via ?from=YYYY-MM-DD&to=YYYY-MM-DD).
//
// Lecturer requirement: HR dashboard must show present / absent / late /
// sick / vacation counts.  This endpoint covers all WRA 2019 leave types
// so the frontend can choose which statuses to display.
//
// Supports optional ?profile_id=X to filter to a single employee.
// FR-12, FR-17 | HR_ADMIN | Objective 4
// =============================================================================
const getAttendanceBreakdown = async (req, res) => {
  try {
    // ── Date-range resolution ────────────────────────────────────────────────
    const { from: fromParam, to: toParam, profile_id } = req.query
    const { role, user_id } = req.user

    let from = parseDate(fromParam)
    let to   = parseDate(toParam)

    if (!from || !to) {
      const range = currentMonthRange()
      from = range.from
      to   = range.to
    }

    if (from > to) {
      return res.status(400).json({
        success: false,
        message: '"from" date must not be later than "to" date.',
      })
    }

    // ── Base WHERE clause ───────────────────────────────────────────────────
    const where = {
      record_date: { [Op.between]: [from, to] },
    }
    if (profile_id) {
      where.profile_id = Number(profile_id)
    }

    // ── LINE_MANAGER: filter to their department's employees only (NFR-03) ──
    if (role === 'LINE_MANAGER') {
      const managerDept = await Department.findOne({ where: { manager_id: user_id } })
      if (!managerDept) {
        // Manager has no department — return zeroes rather than all records
        return res.json({
          success: true,
          data: {
            from:          from.toISOString().slice(0, 10),
            to:            to.toISOString().slice(0, 10),
            profile_id:    null,
            total_records: 0,
            breakdown:     {},
            summary:       { present: 0, absent: 0, late: 0, on_leave: 0, public_holiday: 0 },
          },
        })
      }
      // Get profile_ids in manager's department
      const deptProfiles = await EmployeeProfile.findAll({
        where: { department_id: managerDept.department_id },
        attributes: ['profile_id'],
      })
      const profileIds = deptProfiles.map((p) => p.profile_id)
      // Get probation period IDs for those profiles
      const { ProbationPeriod: PP } = require('../models')
      const periods = await PP.findAll({
        where: { profile_id: { [Op.in]: profileIds } },
        attributes: ['period_id'],
      })
      const periodIds = periods.map((p) => p.period_id)
      where.period_id = { [Op.in]: periodIds.length ? periodIds : [-1] }
    }

    // ── All WRA 2019 status values (matches AttendanceRecord.status ENUM) ───
    const ALL_STATUSES = [
      'PRESENT',
      'ABSENT',
      'LATE',
      'HALF_DAY',
      'SICK_LEAVE',
      'ANNUAL_LEAVE',
      'VACATION_LEAVE',
      'MATERNITY_LEAVE',
      'PATERNITY_LEAVE',
      'SPECIAL_LEAVE',
      'PUBLIC_HOLIDAY',
    ]

    // Count each status in parallel for predictable, fast response
    const counts = await Promise.all(
      ALL_STATUSES.map((status) =>
        AttendanceRecord.count({ where: { ...where, status } })
      )
    )

    // ── Build response ───────────────────────────────────────────────────────
    const breakdown = ALL_STATUSES.reduce((acc, status, idx) => {
      acc[status] = counts[idx]
      return acc
    }, {})

    const totalRecords = counts.reduce((a, b) => a + b, 0)

    // Convenience groupings the frontend may use for summary cards
    const summary = {
      present:     breakdown.PRESENT,
      absent:      breakdown.ABSENT,
      late:        breakdown.LATE,
      on_leave:    breakdown.SICK_LEAVE
                 + breakdown.ANNUAL_LEAVE
                 + breakdown.VACATION_LEAVE
                 + breakdown.MATERNITY_LEAVE
                 + breakdown.PATERNITY_LEAVE
                 + breakdown.SPECIAL_LEAVE,
      public_holiday: breakdown.PUBLIC_HOLIDAY,
    }

    return res.json({
      success: true,
      data: {
        from:          from.toISOString().slice(0, 10),
        to:            to.toISOString().slice(0, 10),
        profile_id:    profile_id ? Number(profile_id) : null,
        total_records: totalRecords,
        breakdown,
        summary,
      },
    })
  } catch (error) {
    console.error('[dashboardController.getAttendanceBreakdown]', error.message)
    return res.status(500).json({ success: false, message: 'Failed to load attendance breakdown.' })
  }
}

// =============================================================================
// GET /api/dashboard/onboarding-progress
// Per-employee onboarding progress: task completion % + document counts.
// FR-08, FR-17 | HR_ADMIN + LINE_MANAGER (departmental filter)
// =============================================================================
const getOnboardingProgress = async (req, res) => {
  try {
    const { role, user_id } = req.user

    // LINE_MANAGER sees only employees in their department (Block 4 — NFR-03)
    let profileWhere = {}
    if (role === 'LINE_MANAGER') {
      const managerDept = await Department.findOne({ where: { manager_id: user_id } })
      profileWhere = managerDept
        ? { department_id: managerDept.department_id }
        : { department_id: -1 }  // returns zero rows if manager has no dept
    }

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
        gender:              p.gender            || null,
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
    })
  } catch (error) {
    console.error('[dashboardController.getMyProgress]', error.message)
    return res.status(500).json({ success: false, message: 'Failed to retrieve progress data.' })
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

module.exports = {
  getDashboardStats,
  getGenderHeadcount,
  getAttendanceBreakdown,
  getOnboardingProgress,
  getMyProgress,
}
