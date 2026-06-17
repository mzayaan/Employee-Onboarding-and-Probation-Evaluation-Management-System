// =============================================================================
// src/controllers/pdfController.js
// Generates a downloadable PDF probation evaluation report using PDFKit.
// Redesigned to match the approved Figma prototype (node 42:2).
// FR-15, FR-16 | NFR-02, NFR-03 | Objective 3
// =============================================================================

const PDFDocument = require('pdfkit');
const {
  ProbationPeriod,
  EmployeeProfile,
  User,
  Department,
  EvaluationCheckpoint,
  ManagerEvaluation,
  EvaluationScore,
  EvaluationCriterion,
  SelfAssessment,
  SelfAssessmentScore,
  FinalRecommendation,
  PerformanceNote,
  AttendanceRecord,
  GeneratedReport,
} = require('../models');
const { createAuditLog } = require('../utils/auditLogger');

// ── Colour palette (matches Figma design) ──────────────────────────────────
const NAVY      = '#1e3a5f';   // header background, avatar, table header
const DARK      = '#0f1c2e';   // primary body text
const ACCENT    = '#3d7dd3';   // logo square, blue elements
const GREEN     = '#16a34a';   // Confirm Employment, positive
const AMBER     = '#d97706';   // Extend Probation
const RED_C     = '#dc2626';   // Recommend Dismissal, negative
const LIGHT_BG  = '#eef3f8';   // employee card background
const CARD_BG   = '#f4f7fb';   // score summary card background
const WHITE     = '#ffffff';
const BORDER    = '#e2e8f0';
const GREY      = '#64748b';   // secondary text
const LGREY     = '#94a3b8';   // labels, muted

// ── Layout constants ─────────────────────────────────────────────────────────
const MARGIN = 40;
const ROW_H  = 14;
const HDR_H  = 16;

// ── Formatting helpers ────────────────────────────────────────────────────────
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }) : 'N/A';

const fmtScore = (v) => (v != null ? parseFloat(v).toFixed(1) : '—');

const recLabel = (t) =>
  ({ CONFIRM: 'CONFIRM EMPLOYMENT', EXTEND: 'EXTEND PROBATION', DISMISS: 'RECOMMEND DISMISSAL' }[t] || t || 'PENDING');

const recColour = (t) =>
  ({ CONFIRM: GREEN, EXTEND: AMBER, DISMISS: RED_C }[t] || GREY);

const recBgColour = (t) =>
  ({ CONFIRM: '#f0fdf4', EXTEND: '#fffbeb', DISMISS: '#fef2f2' }[t] || '#f8fafc');

const recBorderColour = (t) =>
  ({ CONFIRM: '#86efac', EXTEND: '#fcd34d', DISMISS: '#fca5a5' }[t] || BORDER);

const getIp = (req) =>
  req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket.remoteAddress;

// ── Drawing helpers ───────────────────────────────────────────────────────────

/**
 * Adds a new page if adding `needed` more points would reach the bottom margin.
 * Returns true if a new page was added.
 */
function ensureSpace(doc, needed) {
  if (doc.y + needed > doc.page.height - 75) {
    doc.addPage();
    doc.y = MARGIN;
    return true;
  }
  return false;
}

/**
 * Section header: left navy accent bar + bold uppercase title + thin rule below.
 */
function sectionHeader(doc, title) {
  ensureSpace(doc, 38);
  doc.moveDown(0.25);
  const y = doc.y;
  // Left accent bar
  doc.rect(MARGIN, y, 3, 13).fill(NAVY);
  // Title
  doc.save()
     .fillColor(DARK)
     .font('Helvetica-Bold')
     .fontSize(8.5)
     .text(title.toUpperCase(), MARGIN + 9, y + 1)
     .restore();
  doc.y = y + 14;
  const pW = doc.page.width;
  doc.moveTo(MARGIN, doc.y)
     .lineTo(pW - MARGIN, doc.y)
     .lineWidth(0.5)
     .strokeColor(BORDER)
     .stroke();
  doc.y += 4;
}

/**
 * Horizontal progress bar.
 * @param {number} pct 0..1
 */
function progressBar(doc, x, y, barW, pct, color) {
  const fillW = Math.max(0, Math.min(1, pct)) * barW;
  doc.rect(x, y, barW, 5).fill('#e2e8f0');
  if (fillW > 0.5) {
    doc.rect(x, y, fillW, 5).fill(color);
  }
}

// =============================================================================
// GET /api/reports/period/:periodId
// FR-15, FR-16 | NFR-02, NFR-03
// =============================================================================
const generateReport = async (req, res) => {
  const { periodId } = req.params;
  const { role, user_id, first_name, last_name } = req.user;

  try {
    // ── Load full probation data ──────────────────────────────────────────
    const period = await ProbationPeriod.findByPk(periodId, {
      include: [
        {
          model: EmployeeProfile,
          as: 'employeeProfile',
          include: [
            { model: User,       as: 'user',       attributes: ['first_name', 'last_name', 'email'] },
            { model: Department, as: 'department',  attributes: ['name'] },
            { model: User,       as: 'manager',     attributes: ['first_name', 'last_name'] },
          ],
        },
        {
          model: EvaluationCheckpoint,
          as: 'checkpoints',
          include: [
            {
              model: ManagerEvaluation,
              as: 'managerEvaluation',
              include: [
                {
                  model: EvaluationScore,
                  as: 'scores',
                  include: [
                    { model: EvaluationCriterion, as: 'criterion', attributes: ['name', 'weight_percent', 'criterion_id'] },
                  ],
                },
                { model: User, as: 'evaluator', attributes: ['first_name', 'last_name'] },
              ],
            },
            {
              model: SelfAssessment,
              as: 'selfAssessment',
              include: [
                {
                  model: SelfAssessmentScore,
                  as: 'scores',
                  include: [
                    { model: EvaluationCriterion, as: 'criterion', attributes: ['name', 'weight_percent', 'criterion_id'] },
                  ],
                },
              ],
            },
            {
              model: PerformanceNote,
              as: 'performanceNotes',
              include: [{ model: User, as: 'recorder', attributes: ['first_name', 'last_name'] }],
            },
          ],
          order: [['day_number', 'ASC']],
        },
        { model: AttendanceRecord,    as: 'attendanceRecords',  attributes: ['status'] },
        { model: FinalRecommendation, as: 'finalRecommendation' },
      ],
    });

    if (!period) {
      return res.status(404).json({ success: false, message: 'Probation period not found.' });
    }

    // ── Access control (NFR-03) ───────────────────────────────────────────
    if (role === 'LINE_MANAGER' && period.employeeProfile?.manager_id !== user_id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    // ── Business rule: at least one completed checkpoint ──────────────────
    const checkpoints  = [...(period.checkpoints || [])].sort((a, b) => a.day_number - b.day_number);
    const completedCps = checkpoints.filter((cp) => cp.status === 'COMPLETED');

    if (completedCps.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'A PDF report can only be generated once at least one evaluation checkpoint has been completed.',
      });
    }

    // ── Collect employee metadata ─────────────────────────────────────────
    const emp          = period.employeeProfile;
    const usr          = emp?.user || {};
    const employeeName = `${usr.first_name || ''} ${usr.last_name || ''}`.trim() || 'Unknown';
    const department   = emp?.department?.name || 'N/A';
    const jobTitle     = emp?.job_title        || 'N/A';
    const managerName  = emp?.manager
      ? `${emp.manager.first_name} ${emp.manager.last_name}`
      : 'N/A';
    const finalRec     = period.finalRecommendation;
    const lastCp       = completedCps[completedCps.length - 1];
    const employeeId   = `EMP-${new Date().getFullYear()}-${String(emp?.profile_id || period.period_id).padStart(3, '0')}`;

    // ── Build criteria cross-tab ─────────────────────────────────────────
    // criteriaMap: criterionName -> { weight, criterion_id, cpScores: {cpId: raw_score} }
    const criteriaMap = {};
    completedCps.forEach((cp) => {
      (cp.managerEvaluation?.scores || []).forEach((s) => {
        const name = s.criterion?.name ?? `Criterion ${s.criterion_id}`;
        if (!criteriaMap[name]) {
          criteriaMap[name] = {
            name,
            weight:       parseFloat(s.criterion?.weight_percent || 0),
            criterion_id: s.criterion_id,
            cpScores:     {},
          };
        }
        criteriaMap[name].cpScores[cp.checkpoint_id] = parseFloat(s.raw_score);
      });
    });
    const criteriaList = Object.values(criteriaMap).sort((a, b) => b.weight - a.weight);

    // Compute weighted score from last completed checkpoint per criterion
    const lastMgrScores = lastCp?.managerEvaluation?.scores || [];
    criteriaList.forEach((c) => {
      const lastS       = lastMgrScores.find((s) => s.criterion_id === c.criterion_id || s.criterion?.name === c.name);
      c.lastRaw         = lastS ? parseFloat(lastS.raw_score) : null;
      c.weightedScore   = c.lastRaw != null ? (c.lastRaw / 5) * c.weight : null;
    });
    const cumulativeScore = criteriaList.reduce((sum, c) => sum + (c.weightedScore ?? 0), 0);

    // Average raw score per checkpoint (for table footer)
    const cpAvgRaw = completedCps.map((cp) => {
      const scores = cp.managerEvaluation?.scores || [];
      if (!scores.length) return null;
      return scores.reduce((s, sc) => s + parseFloat(sc.raw_score), 0) / scores.length;
    });

    // Self-assessment lookup map for last checkpoint (by criterion_id, fallback name)
    const selfScoreMap = {};
    (lastCp?.selfAssessment?.scores || []).forEach((s) => {
      if (s.criterion_id) selfScoreMap[s.criterion_id] = parseFloat(s.raw_score);
      const name = s.criterion?.name ?? `Criterion ${s.criterion_id}`;
      selfScoreMap[`n:${name}`] = parseFloat(s.raw_score);
    });

    const getSelfScore = (c) =>
      selfScoreMap[c.criterion_id] ?? selfScoreMap[`n:${c.name}`] ?? null;

    // All performance notes across all checkpoints
    const allNotes = checkpoints.flatMap((cp) =>
      (cp.performanceNotes || []).map((n) => ({ ...n.toJSON ? n.toJSON() : n, _cpLabel: cp.checkpoint_label }))
    );

    // ── Start PDF stream ──────────────────────────────────────────────────
    // bufferPages: true is required for doc.switchToPage() and doc.bufferedPageRange()
    // used when stamping page-number footers across all pages after content is drawn.
    const doc = new PDFDocument({ margin: MARGIN, size: 'A4', bufferPages: true });
    const filename = `probation-report-${employeeName.replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    let byteCount = 0;
    doc.on('data', (chunk) => { byteCount += chunk.length; });

    const pW = doc.page.width;   // 595.28
    const pH = doc.page.height;  // 841.89
    const cW = pW - 2 * MARGIN;  // 515.28

    // =================================================================
    // HEADER — full-width navy banner
    // =================================================================
    const HEADER_H = 66;
    doc.rect(0, 0, pW, HEADER_H).fill(NAVY);

    // Logo square (accent blue)
    doc.rect(MARGIN, 16, 32, 32).fill(ACCENT);
    doc.save()
       .fillColor(WHITE).font('Helvetica-Bold').fontSize(11)
       .text('HR', MARGIN, 26, { width: 32, align: 'center' })
       .restore();

    // Brand name + subtitle
    doc.save()
       .fillColor(WHITE).font('Helvetica-Bold').fontSize(11)
       .text('HR Onboard', MARGIN + 38, 18)
       .restore();
    doc.save()
       .fillColor('#aac4e8').font('Helvetica').fontSize(7.5)
       .text('Employee Management System', MARGIN + 38, 33)
       .restore();

    // Report title (right-aligned)
    doc.save()
       .fillColor(WHITE).font('Helvetica-Bold').fontSize(13)
       .text('PROBATION EVALUATION REPORT', 0, 17, { width: pW - MARGIN, align: 'right' })
       .restore();
    doc.save()
       .fillColor('#aac4e8').font('Helvetica').fontSize(7)
       .text(`Confidential — For HR use only  ·  Generated ${fmtDate(new Date())}`, 0, 35, { width: pW - MARGIN, align: 'right' })
       .restore();

    // =================================================================
    // EMPLOYEE CARD
    // =================================================================
    const CARD_Y = HEADER_H + 10;
    const CARD_H = 74;
    doc.rect(MARGIN, CARD_Y, cW, CARD_H).fill(LIGHT_BG);

    // Avatar circle
    const AV_R  = 26;
    const AV_CX = MARGIN + 24 + AV_R;
    const AV_CY = CARD_Y + 12 + AV_R;
    doc.circle(AV_CX, AV_CY, AV_R).fill(NAVY);

    const initials = ((usr.first_name?.[0] ?? '') + (usr.last_name?.[0] ?? '')).toUpperCase() || '??';
    doc.save()
       .fillColor(WHITE).font('Helvetica-Bold').fontSize(14)
       .text(initials, AV_CX - AV_R, AV_CY - 8, { width: AV_R * 2, align: 'center' })
       .restore();

    // Employee name + role/dept/manager
    const INFO_X = AV_CX + AV_R + 12;
    const INFO_W = pW - MARGIN - INFO_X - 10;
    doc.save()
       .fillColor(DARK).font('Helvetica-Bold').fontSize(16)
       .text(employeeName, INFO_X, CARD_Y + 10, { width: INFO_W })
       .restore();
    doc.save()
       .fillColor(GREY).font('Helvetica').fontSize(8)
       .text(`${jobTitle}  ·  ${department}  ·  Reports to: ${managerName}`, INFO_X, CARD_Y + 31, { width: INFO_W })
       .restore();

    // Four data fields row
    const FIELDS = [
      { label: 'EMPLOYEE ID',   value: employeeId },
      { label: 'START DATE',    value: fmtDate(period.start_date) },
      { label: 'PROBATION END', value: fmtDate(period.end_date) },
      { label: 'CHECKPOINT',    value: lastCp?.checkpoint_label ?? 'N/A' },
    ];
    const FIELD_W = INFO_W / 4;
    FIELDS.forEach((f, i) => {
      const fx = INFO_X + i * FIELD_W;
      const fy = CARD_Y + 54;
      doc.save().fillColor(LGREY).font('Helvetica').fontSize(6.5)
         .text(f.label, fx + 8, fy).restore();
      doc.save().fillColor(DARK).font('Helvetica-Bold').fontSize(8.5)
         .text(f.value, fx + 8, fy + 10).restore();
    });

    doc.y = CARD_Y + CARD_H + 8;

    // =================================================================
    // SECTION 1 — EVALUATION CRITERIA & WEIGHTED SCORES
    // =================================================================
    sectionHeader(doc, '1. Evaluation Criteria & Weighted Scores');

    if (criteriaList.length === 0) {
      doc.save().fillColor(LGREY).font('Helvetica').fontSize(9)
         .text('No evaluation scores recorded.', MARGIN, doc.y).restore();
      doc.moveDown(0.6);
    } else {
      // Column widths (must sum to cW = 515.28)
      const MAX_CP  = Math.min(completedCps.length, 4);
      const CP_W    = 46;
      const CRIT_W  = 138;
      const WT_W    = 28;
      const WGT_W   = 66;
      const PROG_W  = cW - CRIT_W - WT_W - MAX_CP * CP_W - WGT_W;

      // Column left edges
      const CX_CRIT = MARGIN;
      const CX_WT   = CX_CRIT + CRIT_W;
      const CX_CP   = (i) => CX_WT + WT_W + i * CP_W;
      const CX_WGT  = CX_WT + WT_W + MAX_CP * CP_W;
      const CX_PROG = CX_WGT + WGT_W;

      // Table header
      const tHdrY = doc.y;
      doc.rect(MARGIN, tHdrY, cW, HDR_H).fill(DARK);

      const hdrCells = [
        { text: 'CRITERION', x: CX_CRIT + 4, w: CRIT_W - 8, align: 'left'   },
        { text: 'WT',        x: CX_WT + 2,   w: WT_W - 4,   align: 'center' },
        ...completedCps.slice(0, MAX_CP).map((cp, i) => ({
          text:  cp.checkpoint_label.toUpperCase().split(' ')[0],
          x:     CX_CP(i) + 2,
          w:     CP_W - 4,
          align: 'center',
        })),
        { text: 'WEIGHTED', x: CX_WGT + 2,  w: WGT_W - 4, align: 'center' },
        { text: 'PROGRESS', x: CX_PROG + 4, w: PROG_W - 8, align: 'left'   },
      ];
      hdrCells.forEach(({ text, x, w, align }) => {
        doc.save().fillColor(WHITE).font('Helvetica-Bold').fontSize(7)
           .text(text, x, tHdrY + 6, { width: w, align }).restore();
      });

      let rowY = tHdrY + HDR_H;

      criteriaList.forEach((c, idx) => {
        // Page break check
        if (rowY + ROW_H + 4 > pH - 55) {
          doc.addPage();
          rowY = MARGIN;
        }
        if (idx % 2 === 1) {
          doc.rect(MARGIN, rowY, cW, ROW_H).fill('#f8fafc');
        }

        // Criterion name
        doc.save().fillColor(DARK).font('Helvetica-Bold').fontSize(8)
           .text(c.name, CX_CRIT + 4, rowY + 5, { width: CRIT_W - 8 }).restore();

        // Weight %
        doc.save().fillColor(GREY).font('Helvetica').fontSize(8)
           .text(`${parseFloat(c.weight).toFixed(0)}%`, CX_WT + 2, rowY + 5, { width: WT_W - 4, align: 'center' }).restore();

        // Per-checkpoint raw score
        completedCps.slice(0, MAX_CP).forEach((cp, ci) => {
          const raw = c.cpScores[cp.checkpoint_id];
          doc.save().fillColor(DARK).font('Helvetica').fontSize(8)
             .text(raw != null ? `${fmtScore(raw)}/5` : '—', CX_CP(ci) + 2, rowY + 5, { width: CP_W - 4, align: 'center' }).restore();
        });

        // Weighted score (x.x/weight)
        const wgtTxt = c.weightedScore != null
          ? `${fmtScore(c.weightedScore)}/${parseFloat(c.weight).toFixed(0)}`
          : '—';
        doc.save().fillColor(DARK).font('Helvetica-Bold').fontSize(8)
           .text(wgtTxt, CX_WGT + 2, rowY + 5, { width: WGT_W - 4, align: 'center' }).restore();

        // Progress bar
        const pct      = (c.weight > 0 && c.weightedScore != null) ? c.weightedScore / c.weight : 0;
        const barColor = pct >= 0.75 ? '#22c55e' : pct >= 0.5 ? '#3b82f6' : '#ef4444';
        progressBar(doc, CX_PROG + 4, rowY + 7, PROG_W - 8, pct, barColor);

        rowY += ROW_H;
      });

      // Cumulative footer row
      if (rowY + ROW_H + 2 > pH - 75) { doc.addPage(); rowY = MARGIN; }
      doc.rect(MARGIN, rowY, cW, ROW_H + 2).fill(NAVY);

      doc.save().fillColor(WHITE).font('Helvetica-Bold').fontSize(7.5)
         .text('CUMULATIVE WEIGHTED SCORE', CX_CRIT + 4, rowY + 5, { width: CRIT_W - 8 }).restore();

      doc.save().fillColor('#aac4e8').font('Helvetica').fontSize(7.5)
         .text('100%', CX_WT + 2, rowY + 5, { width: WT_W - 4, align: 'center' }).restore();

      cpAvgRaw.slice(0, MAX_CP).forEach((avg, ci) => {
        doc.save().fillColor('#aac4e8').font('Helvetica').fontSize(7.5)
           .text(avg != null ? fmtScore(avg) : '—', CX_CP(ci) + 2, rowY + 5, { width: CP_W - 4, align: 'center' }).restore();
      });

      doc.save().fillColor(WHITE).font('Helvetica-Bold').fontSize(9)
         .text(`${fmtScore(cumulativeScore)} / 100`, CX_WGT - 16, rowY + 4, { width: WGT_W + 36, align: 'center' }).restore();

      doc.y = rowY + ROW_H + 8;
    }

    // =================================================================
    // SECTION 2 — CHECKPOINT SCORE SUMMARY
    // =================================================================
    sectionHeader(doc, '2. Checkpoint Score Summary');
    ensureSpace(doc, 62);

    const cpCount  = completedCps.length;
    const CGAP     = 10;
    const cpCardW  = (cW - CGAP * (cpCount - 1)) / cpCount;
    const cpCardH  = 56;
    const cardsY   = doc.y;

    completedCps.forEach((cp, i) => {
      const cx     = MARGIN + i * (cpCardW + CGAP);
      const cy     = cardsY;
      const pctVal = parseFloat(cp.managerEvaluation?.weighted_score ?? 0);

      doc.rect(cx, cy, cpCardW, cpCardH).fill(CARD_BG);

      doc.save().fillColor(LGREY).font('Helvetica').fontSize(7)
         .text(cp.checkpoint_label.toUpperCase(), cx + 6, cy + 10, { width: cpCardW - 12, align: 'center' }).restore();

      const pctColour = pctVal >= 75 ? GREEN : pctVal >= 50 ? AMBER : RED_C;
      doc.save().fillColor(pctColour).font('Helvetica-Bold').fontSize(18)
         .text(`${pctVal.toFixed(1)}%`, cx + 6, cy + 18, { width: cpCardW - 12, align: 'center' }).restore();

      progressBar(doc, cx + 8, cy + 38, cpCardW - 16, pctVal / 100, pctColour);

      doc.save().fillColor(LGREY).font('Helvetica').fontSize(6.5)
         .text('Target: >=75%', cx + 6, cy + 46, { width: cpCardW - 12, align: 'center' }).restore();
    });

    doc.y = cardsY + cpCardH + 8;

    // =================================================================
    // SECTION 3 — MANAGER VS SELF-ASSESSMENT (last checkpoint)
    // =================================================================
    sectionHeader(doc, `3. Manager vs Self-Assessment (${lastCp?.checkpoint_label ?? 'Last Checkpoint'})`);

    const lastMgrComp  = lastMgrScores;
    const hasSelf      = Object.keys(selfScoreMap).length > 0;

    if (lastMgrComp.length === 0) {
      doc.save().fillColor(LGREY).font('Helvetica').fontSize(9)
         .text('No manager scores available for the final checkpoint.', MARGIN, doc.y).restore();
      doc.moveDown(0.6);
    } else {
      const C1 = MARGIN;       const W1 = 175;
      const C2 = C1 + W1;     const W2 = 92;
      const C3 = C2 + W2;     const W3 = 112;
      const C4 = C3 + W3;     const W4 = cW - W1 - W2 - W3;

      // Table header
      const t3HdrY = doc.y;
      ensureSpace(doc, HDR_H + lastMgrComp.length * ROW_H + 10);
      doc.rect(MARGIN, doc.y, cW, HDR_H - 2).fill('#f1f5f9');
      const t3Y0 = doc.y;

      [
        [C1, W1, 'CRITERION',        'left'],
        [C2, W2, 'MANAGER',          'center'],
        [C3, W3, 'SELF-ASSESSMENT',  'center'],
        [C4, W4, 'VARIANCE',         'center'],
      ].forEach(([x, w, label, align]) => {
        doc.save().fillColor(LGREY).font('Helvetica-Bold').fontSize(7)
           .text(label, x + 4, t3Y0 + 5, { width: w - 8, align }).restore();
      });

      let t3Y = t3Y0 + HDR_H - 2;

      lastMgrComp.forEach((s, idx) => {
        if (t3Y + ROW_H > pH - 75) { doc.addPage(); t3Y = MARGIN; }
        const name     = s.criterion?.name ?? `Criterion ${s.criterion_id}`;
        const mgrRaw   = parseFloat(s.raw_score);
        const selfRaw  = getSelfScore({ criterion_id: s.criterion_id, name });
        const variance = selfRaw != null ? selfRaw - mgrRaw : null;
        const varTxt   = variance == null ? '—'
          : variance === 0 ? '0.0'
          : variance > 0   ? `+${fmtScore(variance)}`
          : fmtScore(variance);
        const varColour = variance == null ? GREY : variance > 0 ? '#3b82f6' : variance < 0 ? RED_C : GREEN;

        if (idx % 2 === 1) doc.rect(MARGIN, t3Y, cW, ROW_H).fill('#f8fafc');

        doc.save().fillColor(DARK).font('Helvetica-Bold').fontSize(8)
           .text(name, C1 + 4, t3Y + 5, { width: W1 - 8 }).restore();
        doc.save().fillColor(DARK).font('Helvetica').fontSize(8)
           .text(`${fmtScore(mgrRaw)}/5`, C2 + 4, t3Y + 5, { width: W2 - 8, align: 'center' }).restore();
        doc.save().fillColor(DARK).font('Helvetica').fontSize(8)
           .text(selfRaw != null ? `${fmtScore(selfRaw)}/5` : (hasSelf ? '—' : 'N/A'), C3 + 4, t3Y + 5, { width: W3 - 8, align: 'center' }).restore();
        doc.save().fillColor(varColour).font('Helvetica-Bold').fontSize(8)
           .text(varTxt, C4 + 4, t3Y + 5, { width: W4 - 8, align: 'center' }).restore();

        t3Y += ROW_H;
      });

      doc.y = t3Y + 6;
    }

 
    // =================================================================
    // SECTION 4 — PERFORMANCE NOTES
    // =================================================================
    sectionHeader(doc, '4. Performance Notes');

    if (allNotes.length === 0) {
      ensureSpace(doc, 24);
      doc.save().fillColor(LGREY).font('Helvetica').fontSize(9)
         .text('No performance notes recorded during this probation period.', MARGIN, doc.y).restore();
      doc.moveDown(0.8);
    } else {
      allNotes.slice(0, 2).forEach((note) => {
        ensureSpace(doc, 34);
        const noteY = doc.y;

        // Left-border accent
        doc.rect(MARGIN, noteY, 3, 24).fill(ACCENT);

        // Checkpoint label chip
        const chipTxt = (note._cpLabel || 'General').toUpperCase();
        doc.save().fillColor(ACCENT).font('Helvetica-Bold').fontSize(6.5)
           .text(chipTxt, MARGIN + 8, noteY, { width: 90 }).restore();

        // Recorder name + date
        const recorderName = note.recorder
          ? `${note.recorder.first_name} ${note.recorder.last_name}`
          : 'System';
        doc.save().fillColor(LGREY).font('Helvetica').fontSize(6.5)
           .text(`${recorderName}  ·  ${fmtDate(note.created_at)}`, MARGIN + 8, noteY + 10, { width: cW - 16 }).restore();

        // Note body
        doc.save().fillColor(DARK).font('Helvetica').fontSize(8)
           .text(note.note_text || '', MARGIN + 8, noteY + 18, { width: cW - 16, ellipsis: true })
           .restore();

        doc.y = Math.max(doc.y, noteY + 28) + 4;
      });
    }

    // =================================================================
    // SECTION 5 — FINAL RECOMMENDATION
    // =================================================================
    sectionHeader(doc, '5. Final Recommendation');
    ensureSpace(doc, 60);

    const recType   = finalRec?.recommendation_type ?? null;
    const bgColour  = recBgColour(recType);
    const bdColour  = recBorderColour(recType);
    const txtColour = recColour(recType);
    const recBoxY   = doc.y;

    doc.rect(MARGIN, recBoxY, cW, 56)
       .fillAndStroke(bgColour, bdColour);

    // Recommendation label
    doc.save().fillColor(txtColour).font('Helvetica-Bold').fontSize(15)
       .text(recLabel(recType), MARGIN, recBoxY + 10, { width: cW, align: 'center' }).restore();

    // Cumulative score line
    const scoreText = `Cumulative Weighted Score: ${fmtScore(cumulativeScore)} / 100`;
    doc.save().fillColor(DARK).font('Helvetica').fontSize(8.5)
       .text(scoreText, MARGIN, recBoxY + 26, { width: cW, align: 'center' }).restore();

    // Rationale (if present)
    if (finalRec?.rationale) {
      doc.save().fillColor(GREY).font('Helvetica').fontSize(7.5)
         .text(finalRec.rationale, MARGIN + 16, recBoxY + 40, { width: cW - 32, align: 'center', ellipsis: true }).restore();
    } else if (!finalRec) {
      doc.save().fillColor(LGREY).font('Helvetica').fontSize(7.5)
         .text('Recommendation pending — all checkpoints must be completed.', MARGIN, recBoxY + 40, { width: cW, align: 'center' }).restore();
    }

    doc.y = recBoxY + 64;

    // =================================================================
    // RECOMMENDATION THRESHOLD LEGEND
    // =================================================================
    {
      const THRESHOLDS = [
        { label: '>= 75%   Confirm Employment', type: 'CONFIRM' },
        { label: '50 – 74%   Extend Probation', type: 'EXTEND'  },
        { label: '< 50%   Recommend Dismissal',      type: 'DISMISS' },
      ];
      const btnW = (cW - 12) / 3;
      let   bx   = MARGIN;
      const btnY = doc.y;
      THRESHOLDS.forEach(({ label, type }) => {
        const isActive = recType === type;
        const bg  = isActive ? recBgColour(type)    : '#f8fafc';
        const txt = isActive ? recColour(type)       : LGREY;
        const bd  = isActive ? recBorderColour(type) : BORDER;
        doc.rect(bx, btnY, btnW, 18).fillAndStroke(bg, bd);
        doc.save()
           .fillColor(txt)
           .font(isActive ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(7.5)
           .text(label, bx + 4, btnY + 5, { width: btnW - 8, align: 'center' })
           .restore();
        bx += btnW + 6;
      });
      doc.y = btnY + 22;
    }

    // =================================================================
    // SECTION 6 — AUTHORISATION & SIGNATURES
    // =================================================================
    sectionHeader(doc, '6. Authorisation & Signatures');
    {
      const SIG_GAP = 12;
      const sigW    = (cW - SIG_GAP * 2) / 3;
      const sigH    = 60;
      const sigY    = doc.y;

      const hrAdminName = role === 'HR_ADMIN'
        ? `${first_name} ${last_name}`
        : 'HR Administrator';

      const sigBlocks = [
        { name: managerName,  sigRole: 'Line Manager',             date: fmtDate(new Date()), pending: false },
        { name: hrAdminName,  sigRole: 'HR Administrator',         date: fmtDate(new Date()), pending: false },
        { name: employeeName, sigRole: 'Employee Acknowledgement', date: 'Date: Pending',      pending: true  },
      ];

      sigBlocks.forEach(({ name, sigRole, date, pending }, i) => {
        const sx = MARGIN + i * (sigW + SIG_GAP);
        // Box border
        doc.rect(sx, sigY, sigW, sigH).fillAndStroke('#f8fafc', BORDER);
        // Signature line
        doc.moveTo(sx + 10, sigY + 26)
           .lineTo(sx + sigW - 10, sigY + 26)
           .lineWidth(0.5)
           .strokeColor('#cbd5e1')
           .stroke();
        // Name
        doc.save()
           .fillColor(DARK)
           .font('Helvetica-Bold')
           .fontSize(8)
           .text(name, sx + 10, sigY + 30, { width: sigW - 20 })
           .restore();
        // Role label
        doc.save()
           .fillColor(GREY)
           .font('Helvetica')
           .fontSize(7)
           .text(sigRole, sx + 10, sigY + 42, { width: sigW - 20 })
           .restore();
        // Date
        doc.save()
           .fillColor(pending ? AMBER : LGREY)
           .font(pending ? 'Helvetica-Bold' : 'Helvetica')
           .fontSize(7)
           .text(date, sx + 10, sigY + 50, { width: sigW - 20 })
           .restore();
      });

      doc.y = sigY + sigH + 8;
    }

    // =================================================================
    // FOOTER — page numbers on all pages
    // =================================================================
    const totalPages = doc.bufferedPageRange ? doc.bufferedPageRange().count : 1;
    const range = doc.bufferedPageRange ? doc.bufferedPageRange() : { start: 0, count: 1 };
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      const pg = doc.page;
      // Footer must be placed inside the usable area (maxY = page.height - MARGIN).
      // Writing past maxY causes PDFKit to auto-add a new blank page for the text.
      const footerY = pg.height - MARGIN - 20; // guaranteed below maxY (A4 maxY=801.89; footerY+lineHeight~790)
      doc.save()
         .fillColor(LGREY)
         .font('Helvetica')
         .fontSize(7)
         .text(
           `HR Onboard — Employee Onboarding & Probation Evaluation System  ·  Report generated ${fmtDate(new Date())}  ·  Confidential  ·  Page ${i - range.start + 1} of ${range.count}`,
           MARGIN,
           footerY,
           { width: pg.width - MARGIN * 2, align: 'center', lineBreak: false }
         )
         .restore();
      doc.y = MARGIN; // reset cursor so no overflow is triggered after footer stamp
    }

    // ── Finalise and stream PDF ───────────────────────────────────────────────────────────
    doc.end();
    doc.on('end', async () => {
      // Audit log: FR-18, NFR-08
      await createAuditLog({
        userId:      user_id,
        actionType:  'REPORT_GENERATED',
        description: `PDF probation report generated for period_id ${periodId} (${employeeName}) by ${first_name} ${last_name} [${role}]. Size: ${byteCount} bytes.`,
        ipAddress:   getIp(req),
      }).catch(() => {});

      // Record in GeneratedReport table (FR-16)
      GeneratedReport.create({
        period_id:     parseInt(periodId, 10),
        generated_by:  user_id,
        file_name:     filename,
        generated_at:  new Date(),
      }).catch(() => {});
    });

  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to generate PDF report.', error: err.message });
    }
  }
};

module.exports = { generateReport };
