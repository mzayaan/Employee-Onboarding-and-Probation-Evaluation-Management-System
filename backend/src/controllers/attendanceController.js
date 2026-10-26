// =============================================================================
// src/controllers/attendanceController.js
// Attendance record management within an employee's probation period.
// HR Admins and Line Managers can add and view attendance records.
// FR-12 | NFR-02, NFR-03 | Objective 2
// =============================================================================

const { Op }                                                       = require('sequelize');
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

    const allowed = [
      'PRESENT', 'ABSENT', 'LATE', 'HALF_DAY',
      // WRA 2019 statutory leave types
      'SICK_LEAVE',       // s.46 — 15 days/year, accumulates to 90 days max
      'ANNUAL_LEAVE',     // s.45 — 22 working days/year
      'VACATION_LEAVE',   // s.47 — 30 days per 5-year period (salary ≤ MUR 50,000)
      'MATERNITY_LEAVE',  // s.48 — 14 weeks paid
      'PATERNITY_LEAVE',  // s.49 — 5 days paid
      'SPECIAL_LEAVE',    // discretionary — bereavement, civic duty
      'PUBLIC_HOLIDAY',   // Public Holidays Act — Mauritius statutory holidays
    ];
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

    // ── WRA 2019 s.46(3): Medical certificate enforcement ─────────────────
    // If the incoming record is SICK_LEAVE, check whether this would form
    // a run of 3 or more consecutive sick-leave days. If so, the payload
    // must include medical_certificate_provided: true.
    let medical_certificate_provided = req.body.medical_certificate_provided ?? false;

    if (status === 'SICK_LEAVE') {
      const dayBefore1 = new Date(record_date);
      dayBefore1.setDate(dayBefore1.getDate() - 1);
      const dayBefore2 = new Date(record_date);
      dayBefore2.setDate(dayBefore2.getDate() - 2);

      const fmt = (d) => d.toISOString().split('T')[0];

      const priorSickDays = await AttendanceRecord.count({
        where: {
          period_id,
          status: 'SICK_LEAVE',
          record_date: { [Op.in]: [fmt(dayBefore1), fmt(dayBefore2)] },
        },
      });

      // If both of the two preceding days are also SICK_LEAVE, this is the
      // 3rd consecutive sick day — certificate is mandatory (WRA 2019 s.46(3)).
      if (priorSickDays >= 2 && !medical_certificate_provided) {
        return res.status(400).json({
          success: false,
          message:
            'WRA 2019 s.46(3): A medical certificate is required for sick leave spanning 3 or more consecutive days. ' +
            'Please set medical_certificate_provided to true to confirm it has been received.',
        });
      }
    }

    // BUG-10 fix: Prevent duplicate attendance entries for the same date.
    // A second record for the same period + date would corrupt summary counts.
    const existing = await AttendanceRecord.findOne({
      where: { period_id, record_date },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `An attendance record for ${record_date} already exists. To change it, delete the existing record first.`,
      });
    }

    const record = await AttendanceRecord.create({
      period_id,
      record_date,
      status,
      medical_certificate_provided,
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

// =============================================================================
// GET /api/attendance/period/:periodId/summary?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns an aggregated count summary (present / absent / late / half-day)
// for a probation period, optionally filtered to a date window.
// HR Admin and Line Manager access only.
// FR-12 | NFR-03
// =============================================================================
const getAttendanceSummary = async (req, res) => {
  try {
    const { periodId }    = req.params;
    const { from, to }    = req.query;

    const probation = await ProbationPeriod.findByPk(periodId, {
      include: [{ model: EmployeeProfile, as: 'employeeProfile' }],
    });
    if (!probation) {
      return res.status(404).json({ success: false, message: 'Probation period not found.' });
    }

    // Line Manager restriction (NFR-03)
    if (req.user.role === 'LINE_MANAGER') {
      const profile = probation.employeeProfile;
      if (!profile || profile.manager_id !== req.user.user_id) {
        return res.status(403).json({
          success: false,
          message: 'You may only view attendance for employees you manage.',
        });
      }
    }

    // Build optional date filter
    const where = { period_id: periodId };
    if (from && to) {
      where.record_date = { [Op.between]: [from, to] };
    } else if (from) {
      where.record_date = { [Op.gte]: from };
    } else if (to) {
      where.record_date = { [Op.lte]: to };
    }

    const records = await AttendanceRecord.findAll({ where });

    const summary = {
      total_records:    records.length,
      days_present:     records.filter((r) => r.status === 'PRESENT').length,
      days_absent:      records.filter((r) => r.status === 'ABSENT').length,
      late_arrivals:    records.filter((r) => r.status === 'LATE').length,
      half_days:        records.filter((r) => r.status === 'HALF_DAY').length,
      // WRA 2019 statutory leave breakdown
      sick_leave:       records.filter((r) => r.status === 'SICK_LEAVE').length,
      annual_leave:     records.filter((r) => r.status === 'ANNUAL_LEAVE').length,
      vacation_leave:   records.filter((r) => r.status === 'VACATION_LEAVE').length,
      maternity_leave:  records.filter((r) => r.status === 'MATERNITY_LEAVE').length,
      paternity_leave:  records.filter((r) => r.status === 'PATERNITY_LEAVE').length,
      special_leave:    records.filter((r) => r.status === 'SPECIAL_LEAVE').length,
      public_holidays:  records.filter((r) => r.status === 'PUBLIC_HOLIDAY').length,
      from_date:        from || null,
      to_date:          to   || null,
    };

    return res.json({ success: true, data: summary });
  } catch (error) {
    console.error('[attendanceController.getAttendanceSummary]', error.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve attendance summary.' });
  }
};

module.exports = { addAttendanceRecord, getAttendanceByPeriod, getAttendanceSummary };
