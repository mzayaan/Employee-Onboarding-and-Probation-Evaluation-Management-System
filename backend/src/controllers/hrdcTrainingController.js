// =============================================================================
// src/controllers/hrdcTrainingController.js
// Manages HRDC training log entries and generates the G1 refund claim PDF.
//
// The HRDC G1 form is used by employers to claim refunds on training costs
// from the Human Resource Development Council training levy fund.
// PDFKit is used to generate a structured PDF that lists each training record
// in a format suitable for HRDC submission.
//
// FR-NEW-01 | Objective 1 (extended) | NFR-08
// =============================================================================

const PDFDocument                         = require('pdfkit');
const { HRDCTrainingLog, EmployeeProfile, User } = require('../models');
const { createAuditLog }                  = require('../utils/auditLogger');

// =============================================================================
// GET /api/hrdc-training  (HR_ADMIN)
// Lists all training log entries with employee name details.
// =============================================================================
const getTrainingLogs = async (req, res) => {
  try {
    const logs = await HRDCTrainingLog.findAll({
      include: [
        {
          model: EmployeeProfile,
          as: 'employeeProfile',
          include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name'] }],
        },
      ],
      order: [['completed_date', 'DESC']],
    });

    return res.json({ success: true, data: logs });
  } catch (err) {
    console.error('[hrdcTrainingController.getTrainingLogs]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve training logs.' });
  }
};

// =============================================================================
// GET /api/hrdc-training/profile/:profileId  (HR_ADMIN)
// Lists training logs for a specific employee profile.
// =============================================================================
const getTrainingLogsByProfile = async (req, res) => {
  try {
    const { profileId } = req.params;

    const logs = await HRDCTrainingLog.findAll({
      where:  { profile_id: profileId },
      order:  [['completed_date', 'DESC']],
    });

    return res.json({ success: true, data: logs });
  } catch (err) {
    console.error('[hrdcTrainingController.getTrainingLogsByProfile]', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve training logs.' });
  }
};

// =============================================================================
// POST /api/hrdc-training  (HR_ADMIN)
// Adds a new training log entry for an employee.
// =============================================================================
const addTrainingLog = async (req, res) => {
  try {
    const {
      profile_id,
      course_name,
      training_provider,
      hrdc_approved_course_code,
      training_cost,
      duration_hours,
      completed_date,
    } = req.body;

    if (!profile_id || !course_name || !duration_hours || !completed_date) {
      return res.status(400).json({
        success: false,
        message: 'profile_id, course_name, duration_hours and completed_date are required.',
      });
    }

    const log = await HRDCTrainingLog.create({
      profile_id,
      course_name,
      training_provider:        training_provider || 'Internal',
      hrdc_approved_course_code: hrdc_approved_course_code || null,
      training_cost:             training_cost != null ? parseFloat(training_cost) : 0,
      duration_hours:            parseInt(duration_hours, 10),
      completed_date,
      created_at:                new Date(),
    });

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'ADD_HRDC_TRAINING_LOG',
      description: `HRDC training log added for profile_id ${profile_id}: "${course_name}".`,
    });

    return res.status(201).json({ success: true, message: 'Training log added.', data: log });
  } catch (err) {
    console.error('[hrdcTrainingController.addTrainingLog]', err);
    return res.status(500).json({ success: false, message: 'Failed to add training log.' });
  }
};

// =============================================================================
// DELETE /api/hrdc-training/:trainingId  (HR_ADMIN)
// Removes a training log entry by primary key.
// =============================================================================
const deleteTrainingLog = async (req, res) => {
  try {
    const { trainingId } = req.params;

    const log = await HRDCTrainingLog.findByPk(trainingId);
    if (!log) {
      return res.status(404).json({ success: false, message: 'Training log entry not found.' });
    }

    await log.destroy();

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'DELETE_HRDC_TRAINING_LOG',
      description: `HRDC training log ${trainingId} deleted by HR user ${req.user.user_id}.`,
    });

    return res.json({ success: true, message: 'Training log deleted.' });
  } catch (err) {
    console.error('[hrdcTrainingController.deleteTrainingLog]', err);
    return res.status(500).json({ success: false, message: 'Failed to delete training log.' });
  }
};

// =============================================================================
// GET /api/hrdc-training/export/g1  (HR_ADMIN)
// Generates and streams an HRDC G1 refund claim PDF using PDFKit.
//
// The generated PDF lists all training log entries formatted for HRDC
// submission. The MQA course approval code is highlighted where present.
// =============================================================================
const exportHRDCG1 = async (req, res) => {
  try {
    const logs = await HRDCTrainingLog.findAll({
      include: [
        {
          model: EmployeeProfile,
          as: 'employeeProfile',
          include: [{ model: User, as: 'user', attributes: ['first_name', 'last_name'] }],
        },
      ],
      order: [['completed_date', 'ASC']],
    });

    // ── PDFKit document setup ────────────────────────────────────────────────
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    const today = new Date().toLocaleDateString('en-MU', {
      day: '2-digit', month: 'long', year: 'numeric',
    });

    const filename = `HRDC_G1_Training_Log_${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type',        'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    doc.pipe(res);

    // ── Header ───────────────────────────────────────────────────────────────
    doc
      .fontSize(18).font('Helvetica-Bold')
      .text('HRDC G1 — Training Levy Refund Claim', { align: 'center' })
      .moveDown(0.3);

    doc
      .fontSize(11).font('Helvetica')
      .text('Human Resource Development Council (HRDC) — Mauritius', { align: 'center' })
      .moveDown(0.2)
      .text(`Generated: ${today}`, { align: 'center' })
      .moveDown(1.5);

    // ── Disclaimer ───────────────────────────────────────────────────────────
    doc
      .fontSize(9).font('Helvetica-Oblique')
      .fillColor('#555555')
      .text(
        'Note: Only training programmes with a valid MQA/HRDC Approved Course Code are eligible ' +
        'for levy refund. Internal programmes without an approval code are included for record-keeping ' +
        'purposes only. Verify with HRDC before submission.',
        { align: 'left' }
      )
      .moveDown(1)
      .fillColor('#000000');

    // ── Summary statistics ───────────────────────────────────────────────────
    const totalCost  = logs.reduce((s, l) => s + parseFloat(l.training_cost  || 0), 0);
    const totalHours = logs.reduce((s, l) => s + parseInt(l.duration_hours   || 0, 10), 0);

    doc
      .fontSize(11).font('Helvetica-Bold')
      .text('Summary', { underline: true })
      .moveDown(0.3);

    doc
      .fontSize(10).font('Helvetica')
      .text(`Total Training Entries : ${logs.length}`)
      .text(`Total Training Cost    : MUR ${totalCost.toLocaleString('en-MU', { minimumFractionDigits: 2 })}`)
      .text(`Total Training Hours   : ${totalHours} hrs`)
      .moveDown(1.5);

    // ── Table header ─────────────────────────────────────────────────────────
    const colX = {
      no:         50,
      employee:   75,
      course:     195,
      provider:   320,
      code:       420,
      cost:       480,
      hrs:        530,
      date:       560,
    };

    const drawTableRow = (y, values, isHeader = false) => {
      doc
        .rect(50, y, 495, isHeader ? 18 : 16)
        .fillColor(isHeader ? '#1e3a5f' : (values._even ? '#f5f8ff' : '#ffffff'))
        .fill();

      doc
        .fillColor(isHeader ? '#ffffff' : '#000000')
        .fontSize(isHeader ? 8 : 7.5)
        .font(isHeader ? 'Helvetica-Bold' : 'Helvetica');

      doc.text(values.no,       colX.no,       y + (isHeader ? 5 : 4), { width: 22,  lineBreak: false });
      doc.text(values.employee, colX.employee,  y + (isHeader ? 5 : 4), { width: 118, lineBreak: false });
      doc.text(values.course,   colX.course,    y + (isHeader ? 5 : 4), { width: 122, lineBreak: false });
      doc.text(values.provider, colX.provider,  y + (isHeader ? 5 : 4), { width: 98,  lineBreak: false });
      doc.text(values.code,     colX.code,      y + (isHeader ? 5 : 4), { width: 58,  lineBreak: false });
      doc.text(values.cost,     colX.cost,      y + (isHeader ? 5 : 4), { width: 48,  lineBreak: false, align: 'right' });
      doc.text(values.hrs,      colX.hrs,       y + (isHeader ? 5 : 4), { width: 28,  lineBreak: false, align: 'right' });
      doc.text(values.date,     colX.date,      y + (isHeader ? 5 : 4), { width: 80,  lineBreak: false });

      doc.fillColor('#000000');
    };

    let currentY = doc.y;
    drawTableRow(currentY, {
      no:       '#',
      employee: 'Employee',
      course:   'Course Name',
      provider: 'Provider',
      code:     'HRDC Code',
      cost:     'Cost (MUR)',
      hrs:      'Hrs',
      date:     'Completed',
    }, true);

    currentY += 20;

    logs.forEach((log, idx) => {
      // Page break if needed (leave 60px margin at bottom)
      if (currentY > 760) {
        doc.addPage();
        currentY = 50;
        drawTableRow(currentY, {
          no:       '#',
          employee: 'Employee',
          course:   'Course Name',
          provider: 'Provider',
          code:     'HRDC Code',
          cost:     'Cost (MUR)',
          hrs:      'Hrs',
          date:     'Completed',
        }, true);
        currentY += 20;
      }

      const emp = log.employeeProfile?.user;
      const empName = emp
        ? `${emp.first_name} ${emp.last_name}`.slice(0, 22)
        : `Profile ${log.profile_id}`;

      const costStr = parseFloat(log.training_cost || 0)
        .toLocaleString('en-MU', { minimumFractionDigits: 2 });

      drawTableRow(currentY, {
        no:       String(idx + 1),
        employee: empName,
        course:   (log.course_name || '').slice(0, 30),
        provider: (log.training_provider || 'Internal').slice(0, 22),
        code:     log.hrdc_approved_course_code || '—',
        cost:     costStr,
        hrs:      String(log.duration_hours || 0),
        date:     log.completed_date
          ? new Date(log.completed_date).toLocaleDateString('en-MU', { day: '2-digit', month: 'short', year: 'numeric' })
          : '—',
        _even:    idx % 2 === 1,
      });

      currentY += 18;
    });

    // ── Footer ───────────────────────────────────────────────────────────────
    doc
      .moveDown(2)
      .fontSize(9).font('Helvetica-Oblique')
      .fillColor('#666666')
      .text(
        'This document was generated by the Employee Onboarding and Probation Evaluation Management System. ' +
        'It is intended as a working reference for HRDC claim preparation. ' +
        'The organisation is responsible for verifying all data and compliance before submission to HRDC.',
        { align: 'left' }
      );

    doc.end();

    await createAuditLog({
      userId:      req.user.user_id,
      actionType:  'EXPORT_HRDC_G1',
      description: `HRDC G1 training log PDF exported by HR user ${req.user.user_id}. Entries: ${logs.length}.`,
    });

  } catch (err) {
    console.error('[hrdcTrainingController.exportHRDCG1]', err);
    // Headers may already be sent if PDFKit started piping — only respond if not
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: 'Failed to generate HRDC G1 PDF.' });
    }
  }
};

module.exports = {
  getTrainingLogs,
  getTrainingLogsByProfile,
  addTrainingLog,
  deleteTrainingLog,
  exportHRDCG1,
};
