// =============================================================================
// src/scripts/reseed.js  —  Full database wipe + re-seed
// Run from backend folder:   node src/scripts/reseed.js
// All passwords: Password123!
// NEVER run against production.
// =============================================================================

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') })

const bcrypt    = require('bcrypt')
const sequelize = require('../config/database')

const {
  User, Department, EmployeeProfile,
  DocumentType, OnboardingDocument,
  OnboardingTask, TaskAssignment,
  EvaluationCriterion, ProbationPeriod, EvaluationCheckpoint,
  ManagerEvaluation, EvaluationScore,
  SelfAssessment, SelfAssessmentScore,
  FinalRecommendation, PerformanceNote,
  AttendanceRecord, AuditLog, Notification, GeneratedReport,
} = require('../models')

const daysAgo   = (n) => new Date(Date.now() - n * 86_400_000)
const daysAhead = (n) => new Date(Date.now() + n * 86_400_000)

// ── Wipe all tables in FK-safe order ─────────────────────────────────────────
async function wipeAll() {
  console.log('\n🗑  Wiping all tables…')
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0')
  const tables = [
    'generated_reports','final_recommendations',
    'self_assessment_scores','self_assessments',
    'evaluation_scores','manager_evaluations','evaluation_checkpoints',
    'probation_periods','task_assignments','onboarding_tasks',
    'onboarding_documents','document_types','performance_notes',
    'attendance_records','audit_logs','notifications','leave_balances',
    'employee_profiles','evaluation_criteria','departments','users',
  ]
  for (const t of tables) {
    await sequelize.query(`TRUNCATE TABLE \`${t}\``)
    process.stdout.write(`  ✓ ${t}\n`)
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1')
  console.log('✅  All tables wiped\n')
}


// ── Main seed ──────────────────────────────────────────────────────────────────
async function seed() {
  await sequelize.authenticate()
  console.log('✅  Connected to MySQL')

  const PW_HASH = await bcrypt.hash('Password123!', 12)

  // ─ 1. System users ──────────────────────────────────────────────────────────
  console.log('Seeding system users…')
  const hr       = await User.create({ email:'hr@onboard.dev',          password_hash:PW_HASH, role:'HR_ADMIN',     first_name:'Sarah',  last_name:'Mitchell',     is_active:true })
  const admin    = await User.create({ email:'admin@onboard.dev',       password_hash:PW_HASH, role:'SYSTEM_ADMIN', first_name:'Dev',    last_name:'Admin',        is_active:true })
  const director = await User.create({ email:'director@onboard.dev',   password_hash:PW_HASH, role:'DIRECTOR',     first_name:'Anand',  last_name:'Lutchmun',     is_active:true })

  // ─ 2. Line Managers (one per department) ────────────────────────────────────
  console.log('Seeding managers…')
  const mgr1 = await User.create({ email:'manager.it@onboard.dev',  password_hash:PW_HASH, role:'LINE_MANAGER', first_name:'James',  last_name:'Okonkwo',      is_active:true })
  const mgr2 = await User.create({ email:'manager.hr@onboard.dev',  password_hash:PW_HASH, role:'LINE_MANAGER', first_name:'Nina',   last_name:'Patel',        is_active:true })
  const mgr3 = await User.create({ email:'manager.fin@onboard.dev', password_hash:PW_HASH, role:'LINE_MANAGER', first_name:'Raj',    last_name:'Bhattacharya', is_active:true })
  const mgr4 = await User.create({ email:'manager.ops@onboard.dev', password_hash:PW_HASH, role:'LINE_MANAGER', first_name:'Claire', last_name:'Dubois',       is_active:true })
  const mgr5 = await User.create({ email:'manager.mkt@onboard.dev', password_hash:PW_HASH, role:'LINE_MANAGER', first_name:'Leon',   last_name:'Ferreira',     is_active:true })

  // ─ 3. Departments ────────────────────────────────────────────────────────────
  console.log('Seeding departments…')
  const deptIT  = await Department.create({ name:'Information Technology', description:'Software development, infrastructure and IT support.',           manager_id:mgr1.user_id })
  const deptHR  = await Department.create({ name:'Human Resources',        description:'Recruitment, employee relations and HR administration.',          manager_id:mgr2.user_id })
  const deptFin = await Department.create({ name:'Finance',                description:'Accounting, budgeting and financial reporting.',                   manager_id:mgr3.user_id })
  const deptOps = await Department.create({ name:'Operations',             description:'Day-to-day operational processes and logistics management.',       manager_id:mgr4.user_id })
  const deptMkt = await Department.create({ name:'Marketing',              description:'Brand strategy, digital marketing and customer communications.',   manager_id:mgr5.user_id })

  // ─ 4. Employee users ─────────────────────────────────────────────────────────
  console.log('Seeding employee users…')
  const e1 = await User.create({ email:'employee@onboard.dev', password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Priya',   last_name:'Ramnarain', is_active:true })
  const e2 = await User.create({ email:'emp2@onboard.dev',     password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Thomas',  last_name:'Chen',      is_active:true })
  const e3 = await User.create({ email:'emp3@onboard.dev',     password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Amelia',  last_name:'Johnson',   is_active:true })
  const e4 = await User.create({ email:'emp4@onboard.dev',     password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Karan',   last_name:'Desai',     is_active:true })
  const e5 = await User.create({ email:'emp5@onboard.dev',     password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Sophie',  last_name:'Laurent',   is_active:true })
  const e6 = await User.create({ email:'emp6@onboard.dev',     password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Marcus',  last_name:'Tung',      is_active:true })

  // ─ 5. Employee Profiles ──────────────────────────────────────────────────────
  console.log('Seeding employee profiles…')
  const p1 = await EmployeeProfile.create({ user_id:e1.user_id, department_id:deptIT.department_id,  job_title:'Junior Software Developer', gender:'Female', date_of_birth:'1998-04-15', phone:'+230 5700 0001', address:'12 Royal Road, Port Louis',       start_date:daysAgo(80), probation_end_date:daysAhead(10), employment_status:'PROBATION', manager_id:mgr1.user_id })
  const p2 = await EmployeeProfile.create({ user_id:e2.user_id, department_id:deptIT.department_id,  job_title:'Systems Administrator',     gender:'Male',   date_of_birth:'1995-09-22', phone:'+230 5700 0002', address:'45 Floreal Ave, Curepipe',        start_date:daysAgo(45), probation_end_date:daysAhead(45), employment_status:'PROBATION', manager_id:mgr1.user_id })
  const p3 = await EmployeeProfile.create({ user_id:e3.user_id, department_id:deptHR.department_id,  job_title:'HR Coordinator',            gender:'Female', date_of_birth:'1997-12-01', phone:'+230 5700 0003', address:'8 Rambutan Lane, Rose Hill',       start_date:daysAgo(30), probation_end_date:daysAhead(60), employment_status:'PROBATION', manager_id:mgr2.user_id })
  const p4 = await EmployeeProfile.create({ user_id:e4.user_id, department_id:deptFin.department_id, job_title:'Financial Analyst',         gender:'Male',   date_of_birth:'1993-06-30', phone:'+230 5700 0004', address:'3 Cascade Street, Beau Bassin',   start_date:daysAgo(15), probation_end_date:daysAhead(75), employment_status:'PROBATION', manager_id:mgr3.user_id })
  const p5 = await EmployeeProfile.create({ user_id:e5.user_id, department_id:deptOps.department_id, job_title:'Operations Coordinator',    gender:'Female', date_of_birth:'1996-08-10', phone:'+230 5700 0005', address:'22 Mahebourg Road, Mahebourg',    start_date:daysAgo(20), probation_end_date:daysAhead(70), employment_status:'PROBATION', manager_id:mgr4.user_id })
  const p6 = await EmployeeProfile.create({ user_id:e6.user_id, department_id:deptMkt.department_id, job_title:'Marketing Executive',       gender:'Male',   date_of_birth:'1999-02-28', phone:'+230 5700 0006', address:'7 Beau Songes, Mahebourg',        start_date:daysAgo(10), probation_end_date:daysAhead(80), employment_status:'PROBATION', manager_id:mgr5.user_id })


  // ─ 6. Document Types ─────────────────────────────────────────────────────────
  console.log('Seeding document types…')
  const dts = await DocumentType.bulkCreate([
    { name:'National ID',          description:'National Identity Card',                     is_required:true  },
    { name:'Employment Contract',  description:'Signed employment contract',                 is_required:true  },
    { name:'Bank Details',         description:'Bank account details for payroll setup',     is_required:true  },
    { name:'Academic Certificate', description:'Highest academic qualification certificate', is_required:false },
    { name:'Medical Certificate',  description:'Medical fitness certificate',                is_required:false },
  ], { returning: true })
  // Reload to ensure IDs are populated (MySQL bulkCreate may not auto-set PKs)
  await Promise.all(dts.map(d => d.reload()))

  // ─ 7. Onboarding Documents ───────────────────────────────────────────────────
  console.log('Seeding onboarding documents…')
  const SAMPLE = 'https://res.cloudinary.com/demo/image/upload/sample.pdf'
  await OnboardingDocument.bulkCreate([
    // Priya — 2 approved, 1 pending
    { profile_id:p1.profile_id, document_type_id:dts[0].type_id, cloudinary_url:SAMPLE, original_filename:'national_id.pdf',         file_size:204800, status:'APPROVED', reviewed_by:hr.user_id, reviewed_at:daysAgo(77) },
    { profile_id:p1.profile_id, document_type_id:dts[1].type_id, cloudinary_url:SAMPLE, original_filename:'employment_contract.pdf',  file_size:512000, status:'APPROVED', reviewed_by:hr.user_id, reviewed_at:daysAgo(77) },
    { profile_id:p1.profile_id, document_type_id:dts[2].type_id, cloudinary_url:SAMPLE, original_filename:'bank_details.pdf',         file_size:153600, status:'PENDING' },
    // Thomas — 1 approved, 1 rejected
    { profile_id:p2.profile_id, document_type_id:dts[0].type_id, cloudinary_url:SAMPLE, original_filename:'national_id.pdf',         file_size:204800, status:'APPROVED', reviewed_by:hr.user_id, reviewed_at:daysAgo(42) },
    { profile_id:p2.profile_id, document_type_id:dts[1].type_id, cloudinary_url:SAMPLE, original_filename:'contract_v1.pdf',         file_size:512000, status:'REJECTED', reviewed_by:hr.user_id, reviewed_at:daysAgo(40), feedback:'Document is unsigned. Please re-upload a signed copy.' },
    // Amelia — 1 pending
    { profile_id:p3.profile_id, document_type_id:dts[0].type_id, cloudinary_url:SAMPLE, original_filename:'national_id.pdf',         file_size:204800, status:'PENDING' },
  ])

  // ─ 8. Onboarding Tasks + Assignments ─────────────────────────────────────────
  console.log('Seeding tasks…')
  const tasks = await OnboardingTask.bulkCreate([
    { title:'Complete IT equipment setup',          description:'Set up laptop, email, VPN and dev environment.', created_by:hr.user_id },
    { title:'Review Employee Handbook',             description:'Read and acknowledge the employee handbook.',    created_by:hr.user_id },
    { title:'Complete security awareness training', description:'Complete mandatory cybersecurity module.',       created_by:hr.user_id },
    { title:'Meet with your line manager',          description:'1:1 introduction with your manager.',            created_by:hr.user_id },
    { title:'Complete HR induction',               description:'Attend HR induction session.',                   created_by:hr.user_id },
    { title:'Submit bank details',                 description:'Provide bank information for payroll.',          created_by:hr.user_id },
    { title:'Set up access credentials',           description:'Configure MFA and change initial password.',    created_by:mgr1.user_id },
    { title:'Review probation objectives',         description:'Discuss probation objectives with manager.',    created_by:mgr1.user_id },
  ])

  await TaskAssignment.bulkCreate([
    // Priya — all completed
    { task_id:tasks[0].task_id, profile_id:p1.profile_id, assigned_by:mgr1.user_id, due_date:daysAgo(60), status:'COMPLETED', completed_at:daysAgo(75) },
    { task_id:tasks[1].task_id, profile_id:p1.profile_id, assigned_by:hr.user_id,   due_date:daysAgo(70), status:'COMPLETED', completed_at:daysAgo(72) },
    { task_id:tasks[2].task_id, profile_id:p1.profile_id, assigned_by:hr.user_id,   due_date:daysAgo(50), status:'COMPLETED', completed_at:daysAgo(55) },
    { task_id:tasks[3].task_id, profile_id:p1.profile_id, assigned_by:mgr1.user_id, due_date:daysAgo(75), status:'COMPLETED', completed_at:daysAgo(78) },
    { task_id:tasks[6].task_id, profile_id:p1.profile_id, assigned_by:mgr1.user_id, due_date:daysAgo(78), status:'COMPLETED', completed_at:daysAgo(79) },
    { task_id:tasks[7].task_id, profile_id:p1.profile_id, assigned_by:mgr1.user_id, due_date:daysAgo(60), status:'COMPLETED', completed_at:daysAgo(65) },
    // Thomas
    { task_id:tasks[0].task_id, profile_id:p2.profile_id, assigned_by:mgr1.user_id, due_date:daysAgo(40), status:'COMPLETED', completed_at:daysAgo(43) },
    { task_id:tasks[1].task_id, profile_id:p2.profile_id, assigned_by:hr.user_id,   due_date:daysAgo(35), status:'COMPLETED', completed_at:daysAgo(38) },
    { task_id:tasks[4].task_id, profile_id:p2.profile_id, assigned_by:hr.user_id,   due_date:daysAgo(30), status:'IN_PROGRESS' },
    { task_id:tasks[5].task_id, profile_id:p2.profile_id, assigned_by:hr.user_id,   due_date:daysAgo(10), status:'TODO' },
    // Amelia
    { task_id:tasks[4].task_id, profile_id:p3.profile_id, assigned_by:hr.user_id,   due_date:daysAgo(25), status:'COMPLETED', completed_at:daysAgo(27) },
    { task_id:tasks[1].task_id, profile_id:p3.profile_id, assigned_by:hr.user_id,   due_date:daysAgo(20), status:'IN_PROGRESS' },
    { task_id:tasks[5].task_id, profile_id:p3.profile_id, assigned_by:hr.user_id,   due_date:daysAhead(5), status:'TODO' },
    // Karan
    { task_id:tasks[4].task_id, profile_id:p4.profile_id, assigned_by:hr.user_id,   due_date:daysAhead(5),  status:'TODO' },
    { task_id:tasks[3].task_id, profile_id:p4.profile_id, assigned_by:mgr3.user_id, due_date:daysAhead(7),  status:'TODO' },
    // Sophie (Operations)
    { task_id:tasks[4].task_id, profile_id:p5.profile_id, assigned_by:hr.user_id,   due_date:daysAhead(10), status:'TODO' },
    { task_id:tasks[1].task_id, profile_id:p5.profile_id, assigned_by:hr.user_id,   due_date:daysAhead(15), status:'TODO' },
    // Marcus (Marketing)
    { task_id:tasks[4].task_id, profile_id:p6.profile_id, assigned_by:hr.user_id,   due_date:daysAhead(20), status:'TODO' },
    { task_id:tasks[3].task_id, profile_id:p6.profile_id, assigned_by:mgr5.user_id, due_date:daysAhead(25), status:'TODO' },
  ])


  // ─ 9. Evaluation Criteria ────────────────────────────────────────────────────
  console.log('Seeding evaluation criteria…')
  const cr = await EvaluationCriterion.bulkCreate([
    { name:'Job Performance',          description:'Quality, accuracy and volume of work.',                       weight_percent:40, is_active:true, created_by:admin.user_id },
    { name:'Attendance & Punctuality', description:'Regularity of attendance and timekeeping.',                  weight_percent:20, is_active:true, created_by:admin.user_id },
    { name:'Teamwork & Collaboration', description:'Working effectively with colleagues.',                        weight_percent:20, is_active:true, created_by:admin.user_id },
    { name:'Initiative & Learning',    description:'Willingness to learn and take initiative.',                   weight_percent:10, is_active:true, created_by:admin.user_id },
    { name:'Policy Adherence',         description:'Compliance with company policies and code of conduct.',       weight_percent:10, is_active:true, created_by:admin.user_id },
  ])

  // ─ 10. Probation Periods ─────────────────────────────────────────────────────
  console.log('Seeding probation periods…')
  const pr1 = await ProbationPeriod.create({ profile_id:p1.profile_id, start_date:daysAgo(80), end_date:daysAhead(10), status:'ACTIVE', notes:'Standard 90-day IT probation.' })
  const pr2 = await ProbationPeriod.create({ profile_id:p2.profile_id, start_date:daysAgo(45), end_date:daysAhead(45), status:'ACTIVE' })
  const pr3 = await ProbationPeriod.create({ profile_id:p3.profile_id, start_date:daysAgo(30), end_date:daysAhead(60), status:'ACTIVE' })
  const pr4 = await ProbationPeriod.create({ profile_id:p4.profile_id, start_date:daysAgo(15), end_date:daysAhead(75), status:'ACTIVE' })
  const pr5 = await ProbationPeriod.create({ profile_id:p5.profile_id, start_date:daysAgo(20), end_date:daysAhead(70), status:'ACTIVE' })
  const pr6 = await ProbationPeriod.create({ profile_id:p6.profile_id, start_date:daysAgo(10), end_date:daysAhead(80), status:'ACTIVE' })

  // ─ 11. Evaluation Checkpoints ────────────────────────────────────────────────
  console.log('Seeding checkpoints…')
  const cp1_30 = await EvaluationCheckpoint.create({ period_id:pr1.period_id, checkpoint_label:'30-Day Review', day_number:30, due_date:daysAgo(50), status:'COMPLETED' })
  const cp1_60 = await EvaluationCheckpoint.create({ period_id:pr1.period_id, checkpoint_label:'60-Day Review', day_number:60, due_date:daysAgo(20), status:'COMPLETED' })
  await EvaluationCheckpoint.create({ period_id:pr1.period_id, checkpoint_label:'90-Day Review', day_number:90, due_date:daysAhead(10), status:'PENDING' })

  const cp2_30 = await EvaluationCheckpoint.create({ period_id:pr2.period_id, checkpoint_label:'30-Day Review', day_number:30, due_date:daysAgo(15), status:'COMPLETED' })
  await EvaluationCheckpoint.create({ period_id:pr2.period_id, checkpoint_label:'60-Day Review', day_number:60, due_date:daysAhead(15), status:'PENDING' })
  await EvaluationCheckpoint.create({ period_id:pr3.period_id, checkpoint_label:'30-Day Review', day_number:30, due_date:daysAhead(2), status:'PENDING' })
  await EvaluationCheckpoint.create({ period_id:pr4.period_id, checkpoint_label:'30-Day Review', day_number:30, due_date:daysAhead(15), status:'PENDING' })
  await EvaluationCheckpoint.create({ period_id:pr5.period_id, checkpoint_label:'30-Day Review', day_number:30, due_date:daysAhead(10), status:'PENDING' })
  await EvaluationCheckpoint.create({ period_id:pr6.period_id, checkpoint_label:'30-Day Review', day_number:30, due_date:daysAhead(20), status:'PENDING' })

  // ─ 12. Manager Evaluations + Scores ─────────────────────────────────────────
  console.log('Seeding manager evaluations…')

  const calcWeightedScore = (rawScores) =>
    rawScores.reduce((sum, { cIdx, raw }) => sum + (raw / 5) * Number(cr[cIdx].weight_percent), 0)

  async function mkEval(checkpointId, evaluatorId, rawScores) {
    const wScore = calcWeightedScore(rawScores).toFixed(2)
    const ev = await ManagerEvaluation.create({
      checkpoint_id:           checkpointId,
      evaluated_by:            evaluatorId,
      weighted_score:          wScore,
      attendance_days_present: 20,
      attendance_days_absent:  0,
      late_arrivals:           0,
    })
    await EvaluationScore.bulkCreate(rawScores.map(({ cIdx, raw }) => ({
      eval_id:               ev.eval_id,
      criterion_id:          cr[cIdx].criterion_id,
      raw_score:             raw,
      weighted_contribution: ((raw / 5) * Number(cr[cIdx].weight_percent)).toFixed(2),
    })))
    return wScore
  }

  // Priya 30-day
  const s1_30 = await mkEval(cp1_30.checkpoint_id, mgr1.user_id, [
    { cIdx:0, raw:4 }, { cIdx:1, raw:5 }, { cIdx:2, raw:4 }, { cIdx:3, raw:4 }, { cIdx:4, raw:5 },
  ])
  // Priya 60-day
  const s1_60 = await mkEval(cp1_60.checkpoint_id, mgr1.user_id, [
    { cIdx:0, raw:5 }, { cIdx:1, raw:5 }, { cIdx:2, raw:4 }, { cIdx:3, raw:4 }, { cIdx:4, raw:5 },
  ])
  // Thomas 30-day
  await mkEval(cp2_30.checkpoint_id, mgr1.user_id, [
    { cIdx:0, raw:3 }, { cIdx:1, raw:3 }, { cIdx:2, raw:4 }, { cIdx:3, raw:3 }, { cIdx:4, raw:4 },
  ])

  // ─ 13. Self-Assessments + Scores ─────────────────────────────────────────────
  console.log('Seeding self-assessments…')

  async function mkSelf(checkpointId, profileId, reflectionNotes, rawScores) {
    const self_score = calcWeightedScore(rawScores).toFixed(2)
    const sa = await SelfAssessment.create({
      checkpoint_id:         checkpointId,
      employee_profile_id:   profileId,
      self_reflection_notes: reflectionNotes,
      self_score,
    })
    await SelfAssessmentScore.bulkCreate(rawScores.map(({ cIdx, raw }) => ({
      assessment_id:         sa.assessment_id,
      criterion_id:          cr[cIdx].criterion_id,
      raw_score:             raw,
      weighted_contribution: ((raw / 5) * Number(cr[cIdx].weight_percent)).toFixed(2),
    })))
  }

  await mkSelf(cp1_30.checkpoint_id, p1.profile_id,
    'I feel I have integrated well. The codebase was challenging at first but I am now comfortable.',
    [{ cIdx:0, raw:4 }, { cIdx:1, raw:5 }, { cIdx:2, raw:4 }, { cIdx:3, raw:3 }, { cIdx:4, raw:5 }])

  await mkSelf(cp1_60.checkpoint_id, p1.profile_id,
    'Significant growth since the first checkpoint. I feel confident delivering work independently.',
    [{ cIdx:0, raw:5 }, { cIdx:1, raw:5 }, { cIdx:2, raw:5 }, { cIdx:3, raw:4 }, { cIdx:4, raw:5 }])

  await mkSelf(cp2_30.checkpoint_id, p2.profile_id,
    'Still getting to grips with the infrastructure but learning steadily.',
    [{ cIdx:0, raw:3 }, { cIdx:1, raw:3 }, { cIdx:2, raw:4 }, { cIdx:3, raw:3 }, { cIdx:4, raw:4 }])


  // ─ 14. Final Recommendation for Priya (PENDING_HR_REVIEW) ───────────────────
  console.log('Seeding final recommendation…')
  const cumScore = ((Number(s1_30) + Number(s1_60)) / 2).toFixed(2)
  await FinalRecommendation.create({
    period_id:           pr1.period_id,
    recommendation_type: 'CONFIRM',
    cumulative_score:    cumScore,
    approval_status:     'PENDING_HR_REVIEW',
    submitted_by:        mgr1.user_id,
    generated_by:        mgr1.user_id,
    justification:       'Priya has consistently exceeded expectations across both evaluation checkpoints. ' +
                         'She demonstrates strong technical skills, perfect attendance and excellent team collaboration. ' +
                         'I recommend confirming her employment at the end of the probation period.',
    generated_at: daysAgo(2),
  })

  // ─ 15. Performance Notes ─────────────────────────────────────────────────────
  console.log('Seeding performance notes…')
  await PerformanceNote.bulkCreate([
    { profile_id:p1.profile_id, recorded_by:mgr1.user_id, note_text:'Priya resolved a critical production bug independently. Excellent problem-solving.',       evaluation_period_id:null },
    { profile_id:p1.profile_id, recorded_by:mgr1.user_id, note_text:"Received positive client feedback about Priya's communication during a product demo.",      evaluation_period_id:null },
    { profile_id:p2.profile_id, recorded_by:mgr1.user_id, note_text:'Thomas arrived late on two consecutive Mondays. Punctuality expectations discussed.',       evaluation_period_id:null },
    { profile_id:p3.profile_id, recorded_by:mgr2.user_id, note_text:'Amelia completed the HR induction independently and suggested useful process improvements.', evaluation_period_id:null },
  ])

  // ─ 16. Attendance Records ────────────────────────────────────────────────────
  console.log('Seeding attendance records…')
  const attRows = []
  for (let i = 80; i >= 1; i--) {
    const d = daysAgo(i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    attRows.push({ period_id:pr1.period_id, record_date:d.toISOString().slice(0,10), status: i === 40 ? 'ABSENT' : 'PRESENT', recorded_by:mgr1.user_id })
  }
  for (let i = 45; i >= 1; i--) {
    const d = daysAgo(i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    attRows.push({ period_id:pr2.period_id, record_date:d.toISOString().slice(0,10), status:(i===10||i===3)?'LATE':'PRESENT', recorded_by:mgr1.user_id })
  }
  // Sophie (Operations) — 20 days, one absent
  for (let i = 20; i >= 1; i--) {
    const d = daysAgo(i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    attRows.push({ period_id:pr5.period_id, record_date:d.toISOString().slice(0,10), status: i===5 ? 'ABSENT' : 'PRESENT', recorded_by:mgr4.user_id })
  }
  // Marcus (Marketing) — 10 days, all present
  for (let i = 10; i >= 1; i--) {
    const d = daysAgo(i)
    if (d.getDay() === 0 || d.getDay() === 6) continue
    attRows.push({ period_id:pr6.period_id, record_date:d.toISOString().slice(0,10), status:'PRESENT', recorded_by:mgr5.user_id })
  }
  await AttendanceRecord.bulkCreate(attRows, { validate:false })

  // ─ 17. Notifications ─────────────────────────────────────────────────────────
  console.log('Seeding notifications…')
  await Notification.bulkCreate([
    { user_id:hr.user_id,      type:'DOCUMENT_PENDING',       message:'Priya Ramnarain has submitted a bank details document for review.',                              is_read:false },
    { user_id:hr.user_id,      type:'RECOMMENDATION_PENDING', message:'A new probation recommendation for Priya Ramnarain is awaiting your endorsement.',               is_read:false },
    { user_id:mgr1.user_id,    type:'EVAL_DUE',               message:'The 90-day evaluation checkpoint for Priya Ramnarain is due in 10 days.',                        is_read:false },
    { user_id:e1.user_id,      type:'DOCUMENT_REJECTED',      message:'Your Employment Contract was returned. Please re-upload a signed copy.',                        is_read:true  },
    { user_id:e1.user_id,      type:'TASK_ASSIGNED',          message:'You have been assigned a new task: Complete IT equipment setup.',                                 is_read:true  },
    { user_id:e2.user_id,      type:'DOCUMENT_REJECTED',      message:'Your Employment Contract document was rejected. Reason: Document is unsigned.',                  is_read:false },
    { user_id:e2.user_id,      type:'TASK_OVERDUE',           message:'Your task "Submit bank details" is overdue.',                                                   is_read:false },
  ])

  // ─ 18. Audit Logs ─────────────────────────────────────────────────────────────
  console.log('Seeding audit logs…')
  await AuditLog.bulkCreate([
    { user_id:hr.user_id,   action_type:'EMPLOYEE_CREATED',         description:'HR created employee profile for Priya Ramnarain.',                          ip_address:'127.0.0.1' },
    { user_id:hr.user_id,   action_type:'DOCUMENT_APPROVED',        description:'HR approved National ID for Priya Ramnarain.',                              ip_address:'127.0.0.1' },
    { user_id:hr.user_id,   action_type:'DOCUMENT_REJECTED',        description:'HR rejected Employment Contract for Thomas Chen — unsigned document.',      ip_address:'127.0.0.1' },
    { user_id:mgr1.user_id, action_type:'EVALUATION_SUBMITTED',     description:'Manager submitted 30-day evaluation for Priya Ramnarain.',                 ip_address:'127.0.0.1' },
    { user_id:mgr1.user_id, action_type:'EVALUATION_SUBMITTED',     description:'Manager submitted 60-day evaluation for Priya Ramnarain.',                 ip_address:'127.0.0.1' },
    { user_id:mgr1.user_id, action_type:'RECOMMENDATION_SUBMITTED', description:'Manager submitted final recommendation (CONFIRM) for Priya Ramnarain.',   ip_address:'127.0.0.1' },
    { user_id:e1.user_id,   action_type:'DOCUMENT_UPLOAD',          description:'Employee uploaded bank details document.',                                  ip_address:'127.0.0.1' },
  ])

  // ─ Summary ──────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════')
  console.log('✅  Re-seed complete!')
  console.log('══════════════════════════════════════════════')
  console.log('\n📋  Test credentials  (password: Password123!)')
  console.log('  hr@onboard.dev          HR Admin')
  console.log('  admin@onboard.dev       System Admin')
  console.log('  director@onboard.dev    Director')
  console.log('  manager.it@onboard.dev  Manager — IT')
  console.log('  manager.hr@onboard.dev  Manager — HR')
  console.log('  manager.fin@onboard.dev Manager — Finance')
  console.log('  manager.ops@onboard.dev Manager — Operations')
  console.log('  manager.mkt@onboard.dev Manager — Marketing')
  console.log('  employee@onboard.dev    Employee 1 — Priya (IT)')
  console.log('  emp2@onboard.dev        Employee 2 — Thomas (IT)')
  console.log('  emp3@onboard.dev        Employee 3 — Amelia (HR)')
  console.log('  emp4@onboard.dev        Employee 4 — Karan (Finance)')
  console.log('  emp5@onboard.dev        Employee 5 — Sophie (Operations)')
  console.log('  emp6@onboard.dev        Employee 6 — Marcus (Marketing)')
  console.log(`\n  Priya cumulative score: ${cumScore}% → CONFIRM (pending HR review)`)
}

async function main() {
  try {
    await wipeAll()
    await seed()
  } catch (err) {
    console.error('\n❌  Reseed failed:', err.message)
    if (err.errors) err.errors.forEach((e) => console.error('  -', e.message))
    process.exit(1)
  } finally {
    await sequelize.close()
  }
}

main()
