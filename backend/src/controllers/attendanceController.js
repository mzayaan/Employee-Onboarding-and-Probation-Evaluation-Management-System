// =============================================================================
// src/controllers/attendanceController.js
// Attendance record management within an employee's probation period.
// HR Admins and Line Managers can add and view attendance records.
// FR-12 | NFR-02, NFR-03 | Objective 2
// =============================================================================

const { AttendanceRecord, ProbationPeriod, EmployeeProfile, User } = require('../models');
const { createAuditLog } = require('../utils/auditLogger');

const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// =============================================================================
// POST /api/attendance
// HR Admin or Line Manager adds an attendance record for an employee's
// active probation period.
// FR-12 | NFR-03
// =============================================================================
const addAttendanceRecord = async (req, res) => {
  try {
    const { period_id, record_date, status, notes } = req.body;

    if (!period_id)    return res.status(400).json({ success: false, message: 'period_id is required.' });
    if (!record_date)  return res.status(400).json({ success: false, message: 'record_date is required.' });
    if (!status)       return res.status(400).json({ success: false, message: 'status is required.' });

    const allowed = ['PRESENT', 'ABSENT', 'LATE', 'HALF_DAY'];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `status must be one of: ${allowed.join(', ')}.`,
      });
    }

    // Verify probation period exists
    const probation = await ProbationPeriod.findByPk(period_id, {
      include: [{ model: EmployeeProfile, as: 'employeeProfile' }],
    });
    if (!probation) {
      return res.status(404).json({ success: false, message: 'Probation period not found.' });
    }

    // Line Managers may only record attendance for employees they manage
    if (req.user.role === 'LINE_MANAGER') {
      const profile = probation.employeeProfile;
      if (!profile || profile.manager_id !== req.user.user_id) {
        return res.status(403).json({
          success: false,
          message: 'You may only record attendance for employees you manage.',
        });
      }
    }

    const record = await AttendanceRecord.create({
      period_id,
      record_date,
      status,
      notes: notes?.trim() || null,
      recorded_by: req.user.user_id,
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'ATTENDANCE_RECORDED',
      description: `Attendance record added for period_id ${period_id}: ${record_date} — ${status}.`,
      ipAddress:   getIp(req),
    });

    return res.status(201).json({ success: true, data: record });
  } catch (error) {
    console.error('[attendanceController.addAttendanceRecord]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to add attendance record.' });
  }
};

// =============================================================================
// GET /api/attendance/period/:periodId
// Returns all attendance records for a given probation period.
// HR Admin and Line Manager access only.
// FR-12 | NFR-03
// =============================================================================
const getAttendanceByPeriod = async (req, res) => {
  try {
    const { periodId } = req.params;

    const probation = await ProbationPeriod.findByPk(periodId, {
      include: [{ model: EmployeeProfile, as: 'employeeProfile' }],
    });
    if (!probation) {
      return res.status(404).json({ success: false, message: 'Probation period not found.' });
    }

    // Line Manager restriction
    if (req.user.role === 'LINE_MANAGER') {
      const profile = probation.employeeProfile;
      if (!profile || profile.manager_id !== req.user.user_id) {
        return res.status(403).json({
          success: false,
          message: 'You may only view attendance for employees you manage.',
        });
      }
    }

    const records = await AttendanceRecord.findAll({
      where: { period_id: periodId },
      include: [
        {
          model: User,
          as: 'recorder',
          attributes: ['first_name', 'last_name'],
        },
      ],
      order: [['record_date', 'DESC']],
    });

    return res.status(200).json({ success: true, data: records });
  } catch (error) {
    console.error('[attendanceController.getAttendanceByPeriod]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve attendance records.' });
  }
};

module.exports = { addAttendanceRecord, getAttendanceByPeriod };
