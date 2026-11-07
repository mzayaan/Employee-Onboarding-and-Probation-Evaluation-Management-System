
 // =============================================================================
 // src/scripts/reseed.js  —  Full database wipe + re-seed
 // Run from backend folder:   node src/scripts/reseed.js
 // All passwords: Password123!
 // NEVER run against production.
 //
 // Structure:
 //   5 departments  (IT, HR, Finance, Operations, Marketing)
 //   4 managers     (IT, Finance, Operations, Marketing — HR Admin manages HR staff directly)
 //   10 employees   (2 per dept)
 //   Full probation / evaluation / task data for the longest-tenured employees
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
const dateStr   = (d) => d.toISOString().slice(0, 10)

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


// ── Main seed ─────────────────────────────────────────────────────────────────
async function seed() {
  await sequelize.authenticate()
  console.log('✅  Connected to MySQL')

  const PW_HASH = await bcrypt.hash('Password123!', 12)

  // ─ 1. System users ──────────────────────────────────────────────────────────
  console.log('Seeding system users…')
  const hr       = await User.create({ email:'hr@onboard.dev',       password_hash:PW_HASH, role:'HR_ADMIN',     first_name:'Tariq',  last_name:'Al-Mansoor', is_active:true })
  const admin    = await User.create({ email:'admin@onboard.dev',    password_hash:PW_HASH, role:'SYSTEM_ADMIN', first_name:'Dev',    last_name:'Admin',      is_active:true })
  const director = await User.create({ email:'director@onboard.dev', password_hash:PW_HASH, role:'DIRECTOR',     first_name:'Hamza',  last_name:'Rasheed',    is_active:true })

  // ─ 2. Line Managers (one per department) ────────────────────────────────────
  console.log('Seeding managers…')
  const mgr1 = await User.create({ email:'manager.it@onboard.dev',  password_hash:PW_HASH, role:'LINE_MANAGER', first_name:'Omar',  last_name:'Hassan',  is_active:true })
  const mgr3 = await User.create({ email:'manager.fin@onboard.dev', password_hash:PW_HASH, role:'LINE_MANAGER', first_name:'Amara', last_name:'Diallo',  is_active:true })
  const mgr4 = await User.create({ email:'manager.ops@onboard.dev', password_hash:PW_HASH, role:'LINE_MANAGER', first_name:'Zainab',last_name:'Osei',    is_active:true })
  const mgr5 = await User.create({ email:'manager.mkt@onboard.dev', password_hash:PW_HASH, role:'LINE_MANAGER', first_name:'Kwame', last_name:'Boateng', is_active:true })

  // ─ 3. Departments ────────────────────────────────────────────────────────────
  console.log('Seeding departments…')
  const deptIT  = await Department.create({ name:'Information Technology', description:'Software development, infrastructure and IT support.',         manager_id:mgr1.user_id })
  const deptHR  = await Department.create({ name:'Human Resources',        description:'Recruitment, employee relations and HR administration.',        manager_id:null })
  const deptFin = await Department.create({ name:'Finance',                description:'Accounting, budgeting and financial reporting.',                manager_id:mgr3.user_id })
  const deptOps = await Department.create({ name:'Operations',             description:'Day-to-day operational processes and logistics management.',    manager_id:mgr4.user_id })
  const deptMkt = await Department.create({ name:'Marketing',              description:'Brand strategy, digital marketing and customer communications.',manager_id:mgr5.user_id })

  // ─ 4. Manager EmployeeProfiles ───────────────────────────────────────────────
  // Required so the AddEmployee dept dropdown can auto-select the correct manager.
  // Managers are PERMANENT (past probation) with a start date 2+ years ago.
  // All new EmployeeProfile fields populated for realistic demo data.
  console.log('Seeding manager profiles…')
  await EmployeeProfile.create({
    user_id:            mgr1.user_id,
    department_id:      deptIT.department_id,
    manager_id:         null,
    job_title:          'IT Manager',
    gender:             'Male',
    date_of_birth:      '1980-01-15',
    nationality:        'Mauritian',
    nic_number:         'H1501800012347',
    tax_account_number: 'MU10000001',
    bank_name:          'MCB',
    bank_account_number:'000100010001',
    start_date:         dateStr(daysAgo(730)),
    probation_end_date: dateStr(daysAgo(640)),
    employment_status:  'PERMANENT',
    evaluation_status:  'PERMANENT',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Head Office - Port Louis',
    phone:              '+230 5800 0001',
    personal_email:     'omar.hassan.personal@email.com',
    salary_monthly:     75000,
    salary_scale_tier:  'Band 5',
    address_line_1:     '12 Royal Road',
    locality:           'Rose Hill',
    district:           'Plaines Wilhems',
    country:            'Mauritius',
    highest_qualification: 'MSc',
    field_of_study:     'Information Technology',
    educational_institution: 'University of Mauritius',
    previous_job_title: 'Senior Software Engineer',
    previous_company_name: 'Orange Mauritius',
    previous_salary_monthly: 65000,
    emergency_contact_name: 'Leila Hassan',
    emergency_contact_relationship: 'Spouse',
    emergency_contact_phone: '+230 5900 0001',
    id_document_type:   'NIC',
    onboarding_status:  'COMPLETED',
  })
  await EmployeeProfile.create({
    user_id:            mgr3.user_id,
    department_id:      deptFin.department_id,
    manager_id:         null,
    job_title:          'Finance Manager',
    gender:             'Male',
    date_of_birth:      '1975-03-20',
    nationality:        'Mauritian',
    nic_number:         'D2003750033333',
    tax_account_number: 'MU10000003',
    bank_name:          'MCB',
    bank_account_number:'000300030003',
    start_date:         dateStr(daysAgo(730)),
    probation_end_date: dateStr(daysAgo(640)),
    employment_status:  'PERMANENT',
    evaluation_status:  'PERMANENT',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Ebene CyberCity',
    phone:              '+230 5800 0003',
    personal_email:     'amara.diallo.personal@email.com',
    salary_monthly:     72000,
    salary_scale_tier:  'Band 5',
    address_line_1:     '45 Sir Virgil Naz Street',
    locality:           'Port Louis',
    district:           'Port Louis',
    country:            'Mauritius',
    highest_qualification: 'BSc',
    field_of_study:     'Accounting and Finance',
    educational_institution: 'University of Mauritius',
    previous_job_title: 'Senior Financial Analyst',
    previous_company_name: 'Mauritius Commercial Bank',
    previous_salary_monthly: 62000,
    emergency_contact_name: 'Fatoumata Diallo',
    emergency_contact_relationship: 'Spouse',
    emergency_contact_phone: '+230 5900 0003',
    id_document_type:   'NIC',
    onboarding_status:  'COMPLETED',
  })
  await EmployeeProfile.create({
    user_id:            mgr4.user_id,
    department_id:      deptOps.department_id,
    manager_id:         null,
    job_title:          'Operations Manager',
    gender:             'Female',
    date_of_birth:      '1982-08-10',
    nationality:        'Mauritian',
    nic_number:         'O1008820044444',
    tax_account_number: 'MU10000004',
    bank_name:          'AfrAsia',
    bank_account_number:'000400040004',
    start_date:         dateStr(daysAgo(730)),
    probation_end_date: dateStr(daysAgo(640)),
    employment_status:  'PERMANENT',
    evaluation_status:  'PERMANENT',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Quatre Bornes Office',
    phone:              '+230 5800 0004',
    personal_email:     'zainab.osei.personal@email.com',
    salary_monthly:     68000,
    salary_scale_tier:  'Band 4',
    address_line_1:     '23 Labourdonnais Street',
    locality:           'Mahebourg',
    district:           'Grand Port',
    country:            'Mauritius',
    highest_qualification: 'BSc',
    field_of_study:     'Business Management',
    educational_institution: 'Middlesex University Mauritius',
    previous_job_title: 'Operations Supervisor',
    previous_company_name: 'Air Mauritius',
    previous_salary_monthly: 55000,
    emergency_contact_name: 'Kofi Osei',
    emergency_contact_relationship: 'Spouse',
    emergency_contact_phone: '+230 5900 0004',
    id_document_type:   'NIC',
    onboarding_status:  'COMPLETED',
  })
  await EmployeeProfile.create({
    user_id:            mgr5.user_id,
    department_id:      deptMkt.department_id,
    manager_id:         null,
    job_title:          'Marketing Manager',
    gender:             'Male',
    date_of_birth:      '1979-06-25',
    nationality:        'Mauritian',
    nic_number:         'B2506790055555',
    tax_account_number: 'MU10000005',
    bank_name:          'SBM',
    bank_account_number:'000500050005',
    start_date:         dateStr(daysAgo(730)),
    probation_end_date: dateStr(daysAgo(640)),
    employment_status:  'PERMANENT',
    evaluation_status:  'PERMANENT',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Ebene CyberCity',
    phone:              '+230 5800 0005',
    personal_email:     'kwame.boateng.personal@email.com',
    salary_monthly:     66000,
    salary_scale_tier:  'Band 4',
    address_line_1:     '9 Moka Road',
    locality:           'Moka',
    district:           'Moka',
    country:            'Mauritius',
    highest_qualification: 'BSc',
    field_of_study:     'Marketing and Communications',
    educational_institution: 'Charles Telfair Institute',
    previous_job_title: 'Senior Marketing Executive',
    previous_company_name: 'Emtel Ltd',
    previous_salary_monthly: 56000,
    emergency_contact_name: 'Ama Boateng',
    emergency_contact_relationship: 'Spouse',
    emergency_contact_phone: '+230 5900 0005',
    id_document_type:   'NIC',
    onboarding_status:  'COMPLETED',
  })
  // HR Admin profile — required so the AddEmployee dept dropdown can auto-select
  // Tariq Al-Mansoor when Human Resources is chosen.
  await EmployeeProfile.create({
    user_id:            hr.user_id,
    department_id:      deptHR.department_id,
    manager_id:         null,
    job_title:          'HR Administrator',
    gender:             'Male',
    date_of_birth:      '1978-11-04',
    nationality:        'Mauritian',
    nic_number:         'A0411780066666',
    tax_account_number: 'MU10000006',
    bank_name:          'MCB',
    bank_account_number:'000600060006',
    start_date:         dateStr(daysAgo(730)),
    probation_end_date: dateStr(daysAgo(640)),
    employment_status:  'PERMANENT',
    evaluation_status:  'PERMANENT',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Head Office - Port Louis',
    phone:              '+230 5800 0006',
    personal_email:     'tariq.almansoor.personal@email.com',
    salary_monthly:     80000,
    salary_scale_tier:  'Band 6',
    address_line_1:     '7 Sir William Newton Street',
    locality:           'Port Louis',
    district:           'Port Louis',
    country:            'Mauritius',
    highest_qualification: 'MBA',
    field_of_study:     'Human Resource Management',
    educational_institution: 'University of Technology, Mauritius',
    previous_job_title: 'Senior HR Officer',
    previous_company_name: 'Rogers Group',
    previous_salary_monthly: 68000,
    emergency_contact_name: 'Nadia Al-Mansoor',
    emergency_contact_relationship: 'Spouse',
    emergency_contact_phone: '+230 5900 0006',
    id_document_type:   'NIC',
    onboarding_status:  'COMPLETED',
  })

  // ─ 5. Employee users (2 per department = 10 total) ───────────────────────────
  console.log('Seeding employee users…')
  // IT
  const e1  = await User.create({ email:'employee@onboard.dev',  password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Paige',     last_name:'Turner',      is_active:true })
  const e2  = await User.create({ email:'emp2@onboard.dev',      password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Will',      last_name:'Power',       is_active:true })
  // HR
  const e3  = await User.create({ email:'emp3@onboard.dev',      password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Noah',      last_name:'Fence',       is_active:true })
  const e4  = await User.create({ email:'emp4@onboard.dev',      password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Saige',     last_name:'Fuentes',     is_active:true })
  // Finance
  const e5  = await User.create({ email:'emp5@onboard.dev',      password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Leighton',  last_name:'Kramer',      is_active:true })
  const e6  = await User.create({ email:'emp6@onboard.dev',      password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Marceline', last_name:'Avila',       is_active:true })
  // Operations
  const e7  = await User.create({ email:'emp7@onboard.dev',      password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Maxton',    last_name:'Gill',        is_active:true })
  const e8  = await User.create({ email:'emp8@onboard.dev',      password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Catarina',  last_name:'Samuelsson',  is_active:true })
  // Marketing
  const e9  = await User.create({ email:'emp9@onboard.dev',      password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Boston',    last_name:'Duran',       is_active:true })
  const e10 = await User.create({ email:'emp10@onboard.dev',     password_hash:PW_HASH, role:'NEW_EMPLOYEE', first_name:'Justin',    last_name:'Case',        is_active:true })

  // ─ 6. Employee Profiles ──────────────────────────────────────────────────────
  // All EmployeeProfile fields populated for realistic demo data.
  // NIC format: [Letter][DDMMYY][7 digits] = 14 chars (validateNIC middleware).
  console.log('Seeding employee profiles…')
  // IT — Paige Turner (day 80, nearing end of probation)
  const p1 = await EmployeeProfile.create({
    user_id:            e1.user_id,
    department_id:      deptIT.department_id,
    manager_id:         mgr1.user_id,
    job_title:          'Junior Software Developer',
    gender:             'Female',
    date_of_birth:      '1998-04-15',
    nationality:        'Mauritian',
    nic_number:         'T1504980012347',
    tax_account_number: 'MU20000001',
    bank_name:          'MCB',
    bank_account_number:'100100100100',
    phone:              '+230 5700 0001',
    personal_email:     'paige.turner.personal@email.com',
    start_date:         dateStr(daysAgo(80)),
    probation_end_date: dateStr(daysAhead(10)),
    employment_status:  'PROBATION',
    evaluation_status:  'PROBATION',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Ebene CyberCity',
    salary_monthly:     28000,
    salary_scale_tier:  'Band 2',
    address_line_1:     '14 Vandermeersch Street',
    locality:           'Quatre Bornes',
    district:           'Plaines Wilhems',
    country:            'Mauritius',
    highest_qualification: 'BSc',
    field_of_study:     'Software Engineering',
    educational_institution: 'University of Technology, Mauritius',
    previous_job_title: 'Software Development Intern',
    previous_company_name: 'Ceridian Mauritius',
    previous_salary_monthly: 18000,
    employment_history_summary: 'Completed a 6-month internship at Ceridian Mauritius focusing on React development and REST API integration.',
    emergency_contact_name: 'Martin Turner',
    emergency_contact_relationship: 'Father',
    emergency_contact_phone: '+230 5600 0001',
    id_document_type:   'NIC',
    onboarding_status:  'IN_PROGRESS',
  })
  // IT — Will Power (day 45)
  const p2 = await EmployeeProfile.create({
    user_id:            e2.user_id,
    department_id:      deptIT.department_id,
    manager_id:         mgr1.user_id,
    job_title:          'Systems Administrator',
    gender:             'Male',
    date_of_birth:      '1995-09-22',
    nationality:        'Mauritian',
    nic_number:         'P2209952345678',
    tax_account_number: 'MU20000002',
    bank_name:          'SBM',
    bank_account_number:'100200100200',
    phone:              '+230 5700 0002',
    personal_email:     'will.power.personal@email.com',
    start_date:         dateStr(daysAgo(45)),
    probation_end_date: dateStr(daysAhead(45)),
    employment_status:  'PROBATION',
    evaluation_status:  'PROBATION',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Head Office - Port Louis',
    salary_monthly:     30000,
    salary_scale_tier:  'Band 2',
    address_line_1:     '32 Sir Seewoosagur Ramgoolam Street',
    locality:           'Port Louis',
    district:           'Port Louis',
    country:            'Mauritius',
    highest_qualification: 'BSc',
    field_of_study:     'Computer Science',
    educational_institution: 'University of Mauritius',
    previous_job_title: 'IT Support Technician',
    previous_company_name: 'Mauritius Telecom',
    previous_salary_monthly: 22000,
    employment_history_summary: 'Two years as IT Support Technician at Mauritius Telecom, handling network administration and helpdesk operations.',
    emergency_contact_name: 'Sandra Power',
    emergency_contact_relationship: 'Mother',
    emergency_contact_phone: '+230 5600 0002',
    id_document_type:   'NIC',
    onboarding_status:  'IN_PROGRESS',
  })
  // HR — Noah Fence (day 30)
  const p3 = await EmployeeProfile.create({
    user_id:            e3.user_id,
    department_id:      deptHR.department_id,
    manager_id:         hr.user_id,
    job_title:          'HR Coordinator',
    gender:             'Male',
    date_of_birth:      '1997-12-01',
    nationality:        'Mauritian',
    nic_number:         'F0112973456789',
    tax_account_number: 'MU20000003',
    bank_name:          'MCB',
    bank_account_number:'100300100300',
    phone:              '+230 5700 0003',
    personal_email:     'noah.fence.personal@email.com',
    start_date:         dateStr(daysAgo(30)),
    probation_end_date: dateStr(daysAhead(60)),
    employment_status:  'PROBATION',
    evaluation_status:  'PROBATION',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Head Office - Port Louis',
    salary_monthly:     25000,
    salary_scale_tier:  'Band 2',
    address_line_1:     '5 Pamplemousses Road',
    locality:           'Pamplemousses',
    district:           'Pamplemousses',
    country:            'Mauritius',
    highest_qualification: 'BSc',
    field_of_study:     'Human Resource Management',
    educational_institution: 'University of Technology, Mauritius',
    previous_job_title: 'HR Administrative Assistant',
    previous_company_name: 'SBM Holdings',
    previous_salary_monthly: 19000,
    employment_history_summary: 'One year as HR Administrative Assistant at SBM Holdings supporting recruitment coordination and onboarding processes.',
    emergency_contact_name: 'Carol Fence',
    emergency_contact_relationship: 'Mother',
    emergency_contact_phone: '+230 5600 0003',
    id_document_type:   'NIC',
    onboarding_status:  'IN_PROGRESS',
  })
  // HR — Saige Fuentes (day 25)
  const p4 = await EmployeeProfile.create({
    user_id:            e4.user_id,
    department_id:      deptHR.department_id,
    manager_id:         hr.user_id,
    job_title:          'Recruitment Assistant',
    gender:             'Female',
    date_of_birth:      '1999-07-14',
    nationality:        'Mauritian',
    nic_number:         'F1407994567890',
    tax_account_number: 'MU20000004',
    bank_name:          'ABSA',
    bank_account_number:'100400100400',
    phone:              '+230 5700 0004',
    personal_email:     'saige.fuentes.personal@email.com',
    start_date:         dateStr(daysAgo(25)),
    probation_end_date: dateStr(daysAhead(65)),
    employment_status:  'PROBATION',
    evaluation_status:  'PROBATION',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Head Office - Port Louis',
    salary_monthly:     23000,
    salary_scale_tier:  'Band 1',
    address_line_1:     '18 Plaine Verte Street',
    locality:           'Port Louis',
    district:           'Port Louis',
    country:            'Mauritius',
    highest_qualification: 'Diploma',
    field_of_study:     'Business Administration',
    educational_institution: 'Mauritius Institute of Training and Development',
    previous_job_title: null,
    previous_company_name: null,
    previous_salary_monthly: null,
    employment_history_summary: 'Fresh graduate with strong academic background in business administration and internship experience in talent acquisition.',
    emergency_contact_name: 'Elena Fuentes',
    emergency_contact_relationship: 'Mother',
    emergency_contact_phone: '+230 5600 0004',
    id_document_type:   'NIC',
    onboarding_status:  'IN_PROGRESS',
  })
  // Finance — Leighton Kramer (day 15)
  const p5 = await EmployeeProfile.create({
    user_id:            e5.user_id,
    department_id:      deptFin.department_id,
    manager_id:         mgr3.user_id,
    job_title:          'Financial Analyst',
    gender:             'Male',
    date_of_birth:      '1993-06-30',
    nationality:        'Mauritian',
    nic_number:         'K3006935678901',
    tax_account_number: 'MU20000005',
    bank_name:          'MCB',
    bank_account_number:'100500100500',
    phone:              '+230 5700 0005',
    personal_email:     'leighton.kramer.personal@email.com',
    start_date:         dateStr(daysAgo(15)),
    probation_end_date: dateStr(daysAhead(75)),
    employment_status:  'PROBATION',
    evaluation_status:  'PROBATION',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Ebene CyberCity',
    salary_monthly:     32000,
    salary_scale_tier:  'Band 3',
    address_line_1:     '7 Réduit Road',
    locality:           'Moka',
    district:           'Moka',
    country:            'Mauritius',
    highest_qualification: 'BSc',
    field_of_study:     'Finance and Economics',
    educational_institution: 'University of Mauritius',
    previous_job_title: 'Junior Analyst',
    previous_company_name: 'AfrAsia Bank',
    previous_salary_monthly: 26000,
    employment_history_summary: 'Three years at AfrAsia Bank in financial modelling, budget analysis and regulatory reporting.',
    emergency_contact_name: 'Daniel Kramer',
    emergency_contact_relationship: 'Father',
    emergency_contact_phone: '+230 5600 0005',
    id_document_type:   'NIC',
    onboarding_status:  'IN_PROGRESS',
  })
  // Finance — Marceline Avila (day 12)
  const p6 = await EmployeeProfile.create({
    user_id:            e6.user_id,
    department_id:      deptFin.department_id,
    manager_id:         mgr3.user_id,
    job_title:          'Accounts Assistant',
    gender:             'Female',
    date_of_birth:      '1996-03-19',
    nationality:        'Mauritian',
    nic_number:         'A1903966789012',
    tax_account_number: 'MU20000006',
    bank_name:          'SBM',
    bank_account_number:'100600100600',
    phone:              '+230 5700 0006',
    personal_email:     'marceline.avila.personal@email.com',
    start_date:         dateStr(daysAgo(12)),
    probation_end_date: dateStr(daysAhead(78)),
    employment_status:  'PROBATION',
    evaluation_status:  'PROBATION',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Ebene CyberCity',
    salary_monthly:     24000,
    salary_scale_tier:  'Band 2',
    address_line_1:     '22 Brabant Street',
    locality:           'Rose Hill',
    district:           'Plaines Wilhems',
    country:            'Mauritius',
    highest_qualification: 'Diploma',
    field_of_study:     'Accounting',
    educational_institution: 'London School of Economics (Distance Learning)',
    previous_job_title: 'Accounts Clerk',
    previous_company_name: 'IBL Group',
    previous_salary_monthly: 19000,
    employment_history_summary: 'Two years as Accounts Clerk at IBL Group handling accounts payable, payroll processing and bank reconciliations.',
    emergency_contact_name: 'Rosa Avila',
    emergency_contact_relationship: 'Mother',
    emergency_contact_phone: '+230 5600 0006',
    id_document_type:   'NIC',
    onboarding_status:  'IN_PROGRESS',
  })
  // Operations — Maxton Gill (day 20)
  const p7 = await EmployeeProfile.create({
    user_id:            e7.user_id,
    department_id:      deptOps.department_id,
    manager_id:         mgr4.user_id,
    job_title:          'Operations Coordinator',
    gender:             'Male',
    date_of_birth:      '1996-08-10',
    nationality:        'Mauritian',
    nic_number:         'G1008967890123',
    tax_account_number: 'MU20000007',
    bank_name:          'MCB',
    bank_account_number:'100700100700',
    phone:              '+230 5700 0007',
    personal_email:     'maxton.gill.personal@email.com',
    start_date:         dateStr(daysAgo(20)),
    probation_end_date: dateStr(daysAhead(70)),
    employment_status:  'PROBATION',
    evaluation_status:  'PROBATION',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Quatre Bornes Office',
    salary_monthly:     26000,
    salary_scale_tier:  'Band 2',
    address_line_1:     '11 Flacq Road',
    locality:           'Centre de Flacq',
    district:           'Flacq',
    country:            'Mauritius',
    highest_qualification: 'BSc',
    field_of_study:     'Operations Management',
    educational_institution: 'Middlesex University Mauritius',
    previous_job_title: 'Logistics Assistant',
    previous_company_name: 'Maulogistic',
    previous_salary_monthly: 21000,
    employment_history_summary: 'Two years at Maulogistic coordinating supply chain operations and vendor management across the Indian Ocean region.',
    emergency_contact_name: 'Helen Gill',
    emergency_contact_relationship: 'Mother',
    emergency_contact_phone: '+230 5600 0007',
    id_document_type:   'NIC',
    onboarding_status:  'IN_PROGRESS',
  })
  // Operations — Catarina Samuelsson (day 18)
  const p8 = await EmployeeProfile.create({
    user_id:            e8.user_id,
    department_id:      deptOps.department_id,
    manager_id:         mgr4.user_id,
    job_title:          'Logistics Officer',
    gender:             'Female',
    date_of_birth:      '1998-11-25',
    nationality:        'Mauritian',
    nic_number:         'S2511988901234',
    tax_account_number: 'MU20000008',
    bank_name:          'MAUBANK',
    bank_account_number:'100800100800',
    phone:              '+230 5700 0008',
    personal_email:     'catarina.samuelsson.personal@email.com',
    start_date:         dateStr(daysAgo(18)),
    probation_end_date: dateStr(daysAhead(72)),
    employment_status:  'PROBATION',
    evaluation_status:  'PROBATION',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Quatre Bornes Office',
    salary_monthly:     25000,
    salary_scale_tier:  'Band 2',
    address_line_1:     '3 Rivière des Anguilles Road',
    locality:           'Souillac',
    district:           'Savanne',
    country:            'Mauritius',
    highest_qualification: 'BSc',
    field_of_study:     'Supply Chain Management',
    educational_institution: 'University of Technology, Mauritius',
    previous_job_title: null,
    previous_company_name: null,
    previous_salary_monthly: null,
    employment_history_summary: 'Fresh graduate with distinction in Supply Chain Management. Completed a supply chain simulation project awarded best in cohort.',
    emergency_contact_name: 'Lars Samuelsson',
    emergency_contact_relationship: 'Father',
    emergency_contact_phone: '+230 5600 0008',
    id_document_type:   'NIC',
    onboarding_status:  'IN_PROGRESS',
  })
  // Marketing — Boston Duran (day 10)
  const p9 = await EmployeeProfile.create({
    user_id:            e9.user_id,
    department_id:      deptMkt.department_id,
    manager_id:         mgr5.user_id,
    job_title:          'Marketing Executive',
    gender:             'Male',
    date_of_birth:      '1999-02-28',
    nationality:        'Mauritian',
    nic_number:         'D2802999012345',
    tax_account_number: 'MU20000009',
    bank_name:          'AfrAsia',
    bank_account_number:'100900100900',
    phone:              '+230 5700 0009',
    personal_email:     'boston.duran.personal@email.com',
    start_date:         dateStr(daysAgo(10)),
    probation_end_date: dateStr(daysAhead(80)),
    employment_status:  'PROBATION',
    evaluation_status:  'PROBATION',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Ebene CyberCity',
    salary_monthly:     27000,
    salary_scale_tier:  'Band 2',
    address_line_1:     '28 Royal Road',
    locality:           'Beau Bassin',
    district:           'Plaines Wilhems',
    country:            'Mauritius',
    highest_qualification: 'BSc',
    field_of_study:     'Marketing Management',
    educational_institution: 'Charles Telfair Institute',
    previous_job_title: 'Social Media Coordinator',
    previous_company_name: 'Emtel Ltd',
    previous_salary_monthly: 20000,
    employment_history_summary: 'Eighteen months as Social Media Coordinator at Emtel Ltd managing digital campaigns and brand content across platforms.',
    emergency_contact_name: 'Maria Duran',
    emergency_contact_relationship: 'Mother',
    emergency_contact_phone: '+230 5600 0009',
    id_document_type:   'NIC',
    onboarding_status:  'IN_PROGRESS',
  })
  // Marketing — Justin Case (day 7)
  const p10 = await EmployeeProfile.create({
    user_id:            e10.user_id,
    department_id:      deptMkt.department_id,
    manager_id:         mgr5.user_id,
    job_title:          'Digital Content Coordinator',
    gender:             'Male',
    date_of_birth:      '2000-05-03',
    nationality:        'Mauritian',
    nic_number:         'C0305000123456',
    tax_account_number: 'MU20000010',
    bank_name:          'BCP',
    bank_account_number:'101000101000',
    phone:              '+230 5700 0010',
    personal_email:     'justin.case.personal@email.com',
    start_date:         dateStr(daysAgo(7)),
    probation_end_date: dateStr(daysAhead(83)),
    employment_status:  'PROBATION',
    evaluation_status:  'PROBATION',
    employment_type:    'Permanent',
    work_schedule_type: 'Full-Time',
    weekly_working_hours: 40,
    work_location:      'Ebene CyberCity',
    salary_monthly:     24000,
    salary_scale_tier:  'Band 1',
    address_line_1:     '6 Mahebourg Road',
    locality:           'Mahebourg',
    district:           'Grand Port',
    country:            'Mauritius',
    highest_qualification: 'Diploma',
    field_of_study:     'Digital Media and Communications',
    educational_institution: 'Mauritius Institute of Training and Development',
    previous_job_title: null,
    previous_company_name: null,
    previous_salary_monthly: null,
    employment_history_summary: 'Fresh graduate specialising in digital content creation, SEO and social media analytics. Award-winning final-year project on influencer marketing ROI.',
    emergency_contact_name: 'Linda Case',
    emergency_contact_relationship: 'Mother',
    emergency_contact_phone: '+230 5600 0010',
    id_document_type:   'NIC',
    onboarding_status:  'IN_PROGRESS',
  })

  // ─ 7. Document Types ─────────────────────────────────────────────────────────
  console.log('Seeding document types…')
  const dts = await DocumentType.bulkCreate([
    { name:'National ID',          description:'National Identity Card',                     is_required:true  },
    { name:'Employment Contract',  description:'Signed employment contract',                 is_required:true  },
    { name:'Bank Details',         description:'Bank account details for payroll setup',     is_required:true  },
    { name:'Academic Certificate', description:'Highest academic qualification certificate', is_required:false },
    { name:'Medical Certificate',  description:'Medical fitness certificate',                is_required:false },
  ], { returning: true })
  await Promise.all(dts.map(d => d.reload()))

  // ─ 8. Onboarding Documents ───────────────────────────────────────────────────
  console.log('Seeding onboarding documents…')
  const SAMPLE = 'https://res.cloudinary.com/demo/image/upload/sample.pdf'
  await OnboardingDocument.bulkCreate([
    // Aaliyah (IT) — 2 approved, 1 pending
    { profile_id:p1.profile_id, document_type_id:dts[0].type_id, cloudinary_url:SAMPLE, original_filename:'national_id.pdf',         file_size:204800, status:'APPROVED', reviewed_by:hr.user_id, reviewed_at:daysAgo(77) },
    { profile_id:p1.profile_id, document_type_id:dts[1].type_id, cloudinary_url:SAMPLE, original_filename:'employment_contract.pdf',  file_size:512000, status:'APPROVED', reviewed_by:hr.user_id, reviewed_at:daysAgo(77) },
    { profile_id:p1.profile_id, document_type_id:dts[2].type_id, cloudinary_url:SAMPLE, original_filename:'bank_details.pdf',         file_size:153600, status:'PENDING' },
    // Kevin (IT) — 1 approved, 1 rejected
    { profile_id:p2.profile_id, document_type_id:dts[0].type_id, cloudinary_url:SAMPLE, original_filename:'national_id.pdf',         file_size:204800, status:'APPROVED', reviewed_by:hr.user_id, reviewed_at:daysAgo(42) },
    { profile_id:p2.profile_id, document_type_id:dts[1].type_id, cloudinary_url:SAMPLE, original_filename:'contract_v1.pdf',         file_size:512000, status:'REJECTED', reviewed_by:hr.user_id, reviewed_at:daysAgo(40), feedback:'Document is unsigned. Please re-upload a signed copy.' },
    // Emma (HR) — 1 pending
    { profile_id:p3.profile_id, document_type_id:dts[0].type_id, cloudinary_url:SAMPLE, original_filename:'national_id.pdf',         file_size:204800, status:'PENDING' },
    // Zara (HR) — 1 approved
    { profile_id:p4.profile_id, document_type_id:dts[0].type_id, cloudinary_url:SAMPLE, original_filename:'national_id.pdf',         file_size:204800, status:'APPROVED', reviewed_by:hr.user_id, reviewed_at:daysAgo(22) },
    // Rohan (Finance) — 1 pending
    { profile_id:p5.profile_id, document_type_id:dts[0].type_id, cloudinary_url:SAMPLE, original_filename:'national_id.pdf',         file_size:153600, status:'PENDING' },
    // Camille (Ops) — 1 approved
    { profile_id:p7.profile_id, document_type_id:dts[0].type_id, cloudinary_url:SAMPLE, original_filename:'national_id.pdf',         file_size:204800, status:'APPROVED', reviewed_by:hr.user_id, reviewed_at:daysAgo(18) },
    // Dylan (Marketing) — 1 pending
    { profile_id:p9.profile_id, document_type_id:dts[0].type_id, cloudinary_url:SAMPLE, original_filename:'national_id.pdf',         file_size:153600, status:'PENDING' },
  ])

  // ─ 9. Onboarding Tasks ───────────────────────────────────────────────────────
  console.log('Seeding tasks…')
  const tasks = await OnboardingTask.bulkCreate([
    { title:'Complete IT equipment setup',          description:'Set up laptop, email, VPN and development environment.', created_by:hr.user_id },
    { title:'Review Employee Handbook',             description:'Read and acknowledge the employee handbook.',             created_by:hr.user_id },
    { title:'Complete security awareness training', description:'Complete mandatory cybersecurity module.',               created_by:hr.user_id },
    { title:'Meet with your line manager',          description:'1:1 introduction meeting with your line manager.',       created_by:hr.user_id },
    { title:'Complete HR induction',               description:'Attend the HR induction session.',                       created_by:hr.user_id },
    { title:'Submit bank details',                 description:'Provide bank information for payroll setup.',            created_by:hr.user_id },
    { title:'Set up access credentials',           description:'Configure MFA and change initial password.',            created_by:mgr1.user_id },
    { title:'Review probation objectives',         description:'Discuss and agree probation objectives with manager.',  created_by:mgr1.user_id },
  ])

  // ─ 10. Task Assignments ──────────────────────────────────────────────────────
  console.log('Seeding task assignments…')
  await TaskAssignment.bulkCreate([
    // Aaliyah (IT) — all completed
    { task_id:tasks[0].task_id, profile_id:p1.profile_id, assigned_by:mgr1.user_id, due_date:dateStr(daysAgo(60)),  status:'COMPLETED', completed_at:daysAgo(75) },
    { task_id:tasks[1].task_id, profile_id:p1.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAgo(70)),  status:'COMPLETED', completed_at:daysAgo(72) },
    { task_id:tasks[2].task_id, profile_id:p1.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAgo(50)),  status:'COMPLETED', completed_at:daysAgo(55) },
    { task_id:tasks[3].task_id, profile_id:p1.profile_id, assigned_by:mgr1.user_id, due_date:dateStr(daysAgo(75)),  status:'COMPLETED', completed_at:daysAgo(78) },
    { task_id:tasks[6].task_id, profile_id:p1.profile_id, assigned_by:mgr1.user_id, due_date:dateStr(daysAgo(78)),  status:'COMPLETED', completed_at:daysAgo(79) },
    { task_id:tasks[7].task_id, profile_id:p1.profile_id, assigned_by:mgr1.user_id, due_date:dateStr(daysAgo(60)),  status:'COMPLETED', completed_at:daysAgo(65) },
    // Kevin (IT)
    { task_id:tasks[0].task_id, profile_id:p2.profile_id, assigned_by:mgr1.user_id, due_date:dateStr(daysAgo(40)),  status:'COMPLETED', completed_at:daysAgo(43) },
    { task_id:tasks[1].task_id, profile_id:p2.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAgo(35)),  status:'COMPLETED', completed_at:daysAgo(38) },
    { task_id:tasks[4].task_id, profile_id:p2.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAgo(30)),  status:'IN_PROGRESS' },
    { task_id:tasks[5].task_id, profile_id:p2.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAgo(10)),  status:'TODO' },
    // Emma (HR)
    { task_id:tasks[4].task_id, profile_id:p3.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAgo(25)),  status:'COMPLETED', completed_at:daysAgo(27) },
    { task_id:tasks[1].task_id, profile_id:p3.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAgo(20)),  status:'IN_PROGRESS' },
    { task_id:tasks[5].task_id, profile_id:p3.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAhead(5)), status:'TODO' },
    // Zara (HR)
    { task_id:tasks[4].task_id, profile_id:p4.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAgo(20)),  status:'COMPLETED', completed_at:daysAgo(22) },
    { task_id:tasks[3].task_id, profile_id:p4.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAgo(18)),  status:'COMPLETED', completed_at:daysAgo(20) },
    { task_id:tasks[1].task_id, profile_id:p4.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAhead(5)), status:'TODO' },
    // Rohan (Finance)
    { task_id:tasks[4].task_id, profile_id:p5.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAhead(5)), status:'TODO' },
    { task_id:tasks[3].task_id, profile_id:p5.profile_id, assigned_by:mgr3.user_id, due_date:dateStr(daysAhead(7)), status:'TODO' },
    // Nathan (Finance)
    { task_id:tasks[4].task_id, profile_id:p6.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAhead(8)), status:'TODO' },
    { task_id:tasks[1].task_id, profile_id:p6.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAhead(10)),status:'TODO' },
    // Camille (Operations)
    { task_id:tasks[4].task_id, profile_id:p7.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAhead(10)),status:'TODO' },
    { task_id:tasks[1].task_id, profile_id:p7.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAhead(15)),status:'TODO' },
    // Catarina (Operations)
    { task_id:tasks[4].task_id, profile_id:p8.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAhead(12)),status:'TODO' },
    { task_id:tasks[3].task_id, profile_id:p8.profile_id, assigned_by:mgr4.user_id, due_date:dateStr(daysAhead(14)),status:'TODO' },
    // Boston (Marketing)
    { task_id:tasks[4].task_id, profile_id:p9.profile_id, assigned_by:hr.user_id,   due_date:dateStr(daysAhead(20)),status:'TODO' },
    { task_id:tasks[3].task_id, profile_id:p9.profile_id, assigned_by:mgr5.user_id, due_date:dateStr(daysAhead(25)),status:'TODO' },
    // Justin (Marketing)
    { task_id:tasks[4].task_id, profile_id:p10.profile_id,assigned_by:hr.user_id,   due_date:dateStr(daysAhead(23)),status:'TODO' },
    { task_id:tasks[1].task_id, profile_id:p10.profile_id,assigned_by:hr.user_id,   due_date:dateStr(daysAhead(28)),status:'TODO' },
  ])

  // ─ 11. Evaluation Criteria ───────────────────────────────────────────────────
  console.log('Seeding evaluation criteria…')
  const cr = await EvaluationCriterion.bulkCreate([
    { name:'Job Performance',          description:'Quality, accuracy and volume of work.',                 weight_percent:40, is_active:true, created_by:admin.user_id },
    { name:'Attendance & Punctuality', description:'Regularity of attendance and timekeeping.',            weight_percent:20, is_active:true, created_by:admin.user_id },
    { name:'Teamwork & Collaboration', description:'Working effectively with colleagues.',                  weight_percent:20, is_active:true, created_by:admin.user_id },
    { name:'Initiative & Learning',    description:'Willingness to learn and take initiative.',             weight_percent:10, is_active:true, created_by:admin.user_id },
    { name:'Policy Adherence',         description:'Compliance with company policies and code of conduct.', weight_percent:10, is_active:true, created_by:admin.user_id },
  ])
  await Promise.all(cr.map(c => c.reload()))

  // ─ 12. Probation Periods ─────────────────────────────────────────────────────
  console.log('Seeding probation periods…')
  const pr1  = await ProbationPeriod.create({ profile_id:p1.profile_id,  start_date:dateStr(daysAgo(80)), end_date:dateStr(daysAhead(10)), status:'ACTIVE', notes:'Standard 90-day IT probation.' })
  const pr2  = await ProbationPeriod.create({ profile_id:p2.profile_id,  start_date:dateStr(daysAgo(45)), end_date:dateStr(daysAhead(45)), status:'ACTIVE' })
  const pr3  = await ProbationPeriod.create({ profile_id:p3.profile_id,  start_date:dateStr(daysAgo(30)), end_date:dateStr(daysAhead(60)), status:'ACTIVE' })
  const pr4  = await ProbationPeriod.create({ profile_id:p4.profile_id,  start_date:dateStr(daysAgo(25)), end_date:dateStr(daysAhead(65)), status:'ACTIVE' })
  const pr5  = await ProbationPeriod.create({ profile_id:p5.profile_id,  start_date:dateStr(daysAgo(15)), end_date:dateStr(daysAhead(75)), status:'ACTIVE' })
  const pr6  = await ProbationPeriod.create({ profile_id:p6.profile_id,  start_date:dateStr(daysAgo(12)), end_date:dateStr(daysAhead(78)), status:'ACTIVE' })
  const pr7  = await ProbationPeriod.create({ profile_id:p7.profile_id,  start_date:dateStr(daysAgo(20)), end_date:dateStr(daysAhead(70)), status:'ACTIVE' })
  const pr8  = await ProbationPeriod.create({ profile_id:p8.profile_id,  start_date:dateStr(daysAgo(18)), end_date:dateStr(daysAhead(72)), status:'ACTIVE' })
  const pr9  = await ProbationPeriod.create({ profile_id:p9.profile_id,  start_date:dateStr(daysAgo(10)), end_date:dateStr(daysAhead(80)), status:'ACTIVE' })
  const pr10 = await ProbationPeriod.create({ profile_id:p10.profile_id, start_date:dateStr(daysAgo(7)),  end_date:dateStr(daysAhead(83)), status:'ACTIVE' })

  // ─ 13. Evaluation Checkpoints ────────────────────────────────────────────────
  console.log('Seeding checkpoints…')
  const cp1_30 = await EvaluationCheckpoint.create({ period_id:pr1.period_id, checkpoint_label:'30-Day Review', day_number:30, due_date:dateStr(daysAgo(50)), status:'COMPLETED' })
  const cp1_60 = await EvaluationCheckpoint.create({ period_id:pr1.period_id, checkpoint_label:'60-Day Review', day_number:60, due_date:dateStr(daysAgo(20)), status:'COMPLETED' })
  await EvaluationCheckpoint.create({ period_id:pr1.period_id, checkpoint_label:'90-Day Review', day_number:90, due_date:dateStr(daysAhead(10)), status:'PENDING' })

  const cp2_30 = await EvaluationCheckpoint.create({ period_id:pr2.period_id, checkpoint_label:'30-Day Review', day_number:30, due_date:dateStr(daysAgo(15)), status:'COMPLETED' })
  await EvaluationCheckpoint.create({ period_id:pr2.period_id, checkpoint_label:'60-Day Review', day_number:60, due_date:dateStr(daysAhead(15)), status:'PENDING' })

  await EvaluationCheckpoint.create({ period_id:pr3.period_id,  checkpoint_label:'30-Day Review', day_number:30, due_date:dateStr(daysAhead(2)),  status:'PENDING' })
  await EvaluationCheckpoint.create({ period_id:pr4.period_id,  checkpoint_label:'30-Day Review', day_number:30, due_date:dateStr(daysAhead(5)),  status:'PENDING' })
  await EvaluationCheckpoint.create({ period_id:pr5.period_id,  checkpoint_label:'30-Day Review', day_number:30, due_date:dateStr(daysAhead(15)), status:'PENDING' })
  await EvaluationCheckpoint.create({ period_id:pr6.period_id,  checkpoint_label:'30-Day Review', day_number:30, due_date:dateStr(daysAhead(18)), status:'PENDING' })
  await EvaluationCheckpoint.create({ period_id:pr7.period_id,  checkpoint_label:'30-Day Review', day_number:30, due_date:dateStr(daysAhead(10)), status:'PENDING' })
  await EvaluationCheckpoint.create({ period_id:pr8.period_id,  checkpoint_label:'30-Day Review', day_number:30, due_date:dateStr(daysAhead(12)), status:'PENDING' })
  await EvaluationCheckpoint.create({ period_id:pr9.period_id,  checkpoint_label:'30-Day Review', day_number:30, due_date:dateStr(daysAhead(20)), status:'PENDING' })
  await EvaluationCheckpoint.create({ period_id:pr10.period_id, checkpoint_label:'30-Day Review', day_number:30, due_date:dateStr(daysAhead(23)), status:'PENDING' })

  // ─ 14. Manager Evaluations + Scores ─────────────────────────────────────────
  console.log('Seeding manager evaluations…')

  const calcWeightedScore = (rawScores) =>
    rawScores.reduce((sum, { cIdx, raw }) => sum + (raw / 5) * Number(cr[cIdx].weight_percent), 0)

  async function mkEval(checkpointId, evaluatorId, rawScores, attendance = { present:20, absent:0, late:0 }) {
    const wScore = calcWeightedScore(rawScores).toFixed(2)
    const ev = await ManagerEvaluation.create({
      checkpoint_id:           checkpointId,
      evaluated_by:            evaluatorId,
      weighted_score:          wScore,
      attendance_days_present: attendance.present,
      attendance_days_absent:  attendance.absent,
      late_arrivals:           attendance.late,
    })
    await EvaluationScore.bulkCreate(rawScores.map(({ cIdx, raw }) => ({
      eval_id:               ev.eval_id,
      criterion_id:          cr[cIdx].criterion_id,
      raw_score:             raw,
      weighted_contribution: ((raw / 5) * Number(cr[cIdx].weight_percent)).toFixed(2),
    })))
    return wScore
  }

  // Paige — 30-day
  const s1_30 = await mkEval(cp1_30.checkpoint_id, mgr1.user_id,
    [{ cIdx:0, raw:4 }, { cIdx:1, raw:5 }, { cIdx:2, raw:4 }, { cIdx:3, raw:4 }, { cIdx:4, raw:5 }])
  // Paige — 60-day
  const s1_60 = await mkEval(cp1_60.checkpoint_id, mgr1.user_id,
    [{ cIdx:0, raw:5 }, { cIdx:1, raw:5 }, { cIdx:2, raw:4 }, { cIdx:3, raw:4 }, { cIdx:4, raw:5 }])
  // Will — 30-day
  await mkEval(cp2_30.checkpoint_id, mgr1.user_id,
    [{ cIdx:0, raw:3 }, { cIdx:1, raw:3 }, { cIdx:2, raw:4 }, { cIdx:3, raw:3 }, { cIdx:4, raw:4 }],
    { present:18, absent:0, late:2 })

  // ─ 15. Self-Assessments ──────────────────────────────────────────────────────
  console.log('Seeding self-assessments…')

  async function mkSelf(checkpointId, profileId, notes, rawScores) {
    const self_score = calcWeightedScore(rawScores).toFixed(2)
    const sa = await SelfAssessment.create({
      checkpoint_id:         checkpointId,
      employee_profile_id:   profileId,
      self_reflection_notes: notes,
      self_score,
    })
    await SelfAssessmentScore.bulkCreate(rawScores.map(({ cIdx, raw }) => ({
      assessment_id:         sa.assessment_id,
      criterion_id:          cr[cIdx].criterion_id,
      raw_score:             raw,
      weighted_contribution: ((raw / 5) * Number(cr[cIdx].weight_percent)).toFixed(2),
    })))
  }

  // Paige — 30-day self-assessment
  await mkSelf(cp1_30.checkpoint_id, p1.profile_id,
    'I feel I have integrated well. The codebase was challenging at first but I am now comfortable.',
    [{ cIdx:0, raw:4 }, { cIdx:1, raw:5 }, { cIdx:2, raw:4 }, { cIdx:3, raw:3 }, { cIdx:4, raw:5 }])

  // Paige — 60-day self-assessment
  await mkSelf(cp1_60.checkpoint_id, p1.profile_id,
    'Significant growth since the first checkpoint. I feel confident delivering work independently.',
    [{ cIdx:0, raw:5 }, { cIdx:1, raw:5 }, { cIdx:2, raw:5 }, { cIdx:3, raw:4 }, { cIdx:4, raw:5 }])

  // Will — 30-day self-assessment
  await mkSelf(cp2_30.checkpoint_id, p2.profile_id,
    'Still getting to grips with the infrastructure but learning steadily.',
    [{ cIdx:0, raw:3 }, { cIdx:1, raw:3 }, { cIdx:2, raw:4 }, { cIdx:3, raw:3 }, { cIdx:4, raw:4 }])

  // ─ 16. Final Recommendation (Paige — PENDING_HR_REVIEW) ─────────────────────
  console.log('Seeding final recommendation…')
  const cumScore = ((Number(s1_30) + Number(s1_60)) / 2).toFixed(2)
  await FinalRecommendation.create({
    period_id:           pr1.period_id,
    recommendation_type: 'CONFIRM',
    cumulative_score:    cumScore,
    approval_status:     'PENDING_HR_REVIEW',
    submitted_by:        mgr1.user_id,
    generated_by:        mgr1.user_id,
    justification:       'Paige has consistently exceeded expectations across both evaluation checkpoints. ' +
                         'She demonstrates strong technical skills, perfect attendance and excellent team collaboration. ' +
                         'I recommend confirming her employment at the end of the probation period.',
    generated_at: daysAgo(2),
  })

  // ─ 17. Performance Notes ─────────────────────────────────────────────────────
  console.log('Seeding performance notes…')
  await PerformanceNote.bulkCreate([
    { profile_id:p1.profile_id, recorded_by:mgr1.user_id, note_text:'Paige resolved a critical production bug independently. Excellent problem-solving.',         evaluation_period_id:null },
    { profile_id:p1.profile_id, recorded_by:mgr1.user_id, note_text:"Positive client feedback about Paige's communication during a product demo.",               evaluation_period_id:null },
    { profile_id:p2.profile_id, recorded_by:mgr1.user_id, note_text:'Will arrived late on two consecutive Mondays. Punctuality expectations discussed.',          evaluation_period_id:null },
    { profile_id:p3.profile_id, recorded_by:hr.user_id,   note_text:'Noah completed the HR induction independently and suggested useful process improvements.',   evaluation_period_id:null },
    { profile_id:p7.profile_id, recorded_by:mgr4.user_id, note_text:'Maxton showed strong initiative in reorganising the daily dispatch schedule.',               evaluation_period_id:null },
  ])

  // ─ 18. Attendance Records ────────────────────────────────────────────────────
  console.log('Seeding attendance records…')
  const attRows = []
  for (let i = 80; i >= 1; i--) {
    const d = daysAgo(i); if (d.getDay()===0||d.getDay()===6) continue
    attRows.push({ period_id:pr1.period_id, record_date:dateStr(d), status: i===40?'ABSENT':'PRESENT', recorded_by:mgr1.user_id })
  }
  for (let i = 45; i >= 1; i--) {
    const d = daysAgo(i); if (d.getDay()===0||d.getDay()===6) continue
    attRows.push({ period_id:pr2.period_id, record_date:dateStr(d), status:(i===10||i===3)?'LATE':'PRESENT', recorded_by:mgr1.user_id })
  }
  for (let i = 20; i >= 1; i--) {
    const d = daysAgo(i); if (d.getDay()===0||d.getDay()===6) continue
    attRows.push({ period_id:pr7.period_id, record_date:dateStr(d), status: i===5?'ABSENT':'PRESENT', recorded_by:mgr4.user_id })
  }
  for (let i = 10; i >= 1; i--) {
    const d = daysAgo(i); if (d.getDay()===0||d.getDay()===6) continue
    attRows.push({ period_id:pr9.period_id, record_date:dateStr(d), status:'PRESENT', recorded_by:mgr5.user_id })
  }
  await AttendanceRecord.bulkCreate(attRows, { validate:false })

  // ─ 19. Notifications ─────────────────────────────────────────────────────────
  console.log('Seeding notifications…')
  await Notification.bulkCreate([
    { user_id:hr.user_id,      type:'DOCUMENT_PENDING',       message:'Paige Turner has submitted a bank details document for review.',                        is_read:false },
    { user_id:hr.user_id,      type:'RECOMMENDATION_PENDING', message:'A probation recommendation for Paige Turner is awaiting your endorsement.',             is_read:false },
    { user_id:mgr1.user_id,    type:'EVAL_DUE',               message:'The 90-day evaluation checkpoint for Paige Turner is due in 10 days.',                 is_read:false },
    { user_id:e1.user_id,      type:'DOCUMENT_REJECTED',      message:'Your Employment Contract was returned. Please re-upload a signed copy.',               is_read:true  },
    { user_id:e1.user_id,      type:'TASK_ASSIGNED',          message:'You have been assigned: Complete IT equipment setup.',                                  is_read:true  },
    { user_id:e2.user_id,      type:'DOCUMENT_REJECTED',      message:'Your Employment Contract was rejected. Reason: Document is unsigned.',                 is_read:false },
    { user_id:e2.user_id,      type:'TASK_OVERDUE',           message:'Your task "Submit bank details" is overdue.',                                         is_read:false },
    { user_id:hr.user_id,      type:'EVAL_DUE',               message:'The 30-day evaluation checkpoint for Noah Fence is due in 2 days.',                   is_read:false },
    { user_id:hr.user_id,      type:'EVAL_DUE',               message:'The 30-day evaluation checkpoint for Saige Fuentes is due in 5 days.',                is_read:false },
  ])

  // ─ 20. Audit Logs ─────────────────────────────────────────────────────────────
  console.log('Seeding audit logs…')
  await AuditLog.bulkCreate([
    { user_id:hr.user_id,   action_type:'EMPLOYEE_CREATED',         description:'HR created employee profile for Paige Turner.',                             ip_address:'127.0.0.1' },
    { user_id:hr.user_id,   action_type:'DOCUMENT_APPROVED',        description:'HR approved National ID for Paige Turner.',                                 ip_address:'127.0.0.1' },
    { user_id:hr.user_id,   action_type:'DOCUMENT_REJECTED',        description:'HR rejected Employment Contract for Will Power — unsigned document.',      ip_address:'127.0.0.1' },
    { user_id:mgr1.user_id, action_type:'EVALUATION_SUBMITTED',     description:'Manager submitted 30-day evaluation for Paige Turner.',                    ip_address:'127.0.0.1' },
    { user_id:mgr1.user_id, action_type:'EVALUATION_SUBMITTED',     description:'Manager submitted 60-day evaluation for Paige Turner.',                    ip_address:'127.0.0.1' },
    { user_id:mgr1.user_id, action_type:'RECOMMENDATION_SUBMITTED', description:'Manager submitted final recommendation (CONFIRM) for Paige Turner.',      ip_address:'127.0.0.1' },
    { user_id:e1.user_id,   action_type:'DOCUMENT_UPLOAD',          description:'Employee uploaded bank details document.',                                 ip_address:'127.0.0.1' },
  ])

  // ─ Summary ───────────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════')
  console.log('✅  Re-seed complete!')
  console.log('══════════════════════════════════════════════════════')
  console.log('\n📋  Credentials  (password: Password123!)\n')
  console.log('  SYSTEM')
  console.log('  hr@onboard.dev            HR Admin       — Tariq Al-Mansoor')
  console.log('  admin@onboard.dev         System Admin   — Dev Admin')
  console.log('  director@onboard.dev      Director       — Hamza Rasheed')
  console.log('\n  MANAGERS (IT/Finance/Ops/Mkt — HR Admin manages HR staff directly)')
  console.log('  manager.it@onboard.dev    IT             — Omar Hassan')
  console.log('  manager.fin@onboard.dev   Finance        — Amara Diallo')
  console.log('  manager.ops@onboard.dev   Operations     — Zainab Osei')
  console.log('  manager.mkt@onboard.dev   Marketing      — Kwame Boateng')
  console.log('\n  EMPLOYEES (2 per dept)')
  console.log('  employee@onboard.dev      IT  — Paige Turner          (day 80, eval × 2, CONFIRM pending)')
  console.log('  emp2@onboard.dev          IT  — Will Power             (day 45, eval × 1)')
  console.log('  emp3@onboard.dev          HR  — Noah Fence             (day 30)')
  console.log('  emp4@onboard.dev          HR  — Saige Fuentes          (day 25)')
  console.log('  emp5@onboard.dev          Fin — Leighton Kramer        (day 15)')
  console.log('  emp6@onboard.dev          Fin — Marceline Avila        (day 12)')
  console.log('  emp7@onboard.dev          Ops — Maxton Gill            (day 20)')
  console.log('  emp8@onboard.dev          Ops — Catarina Samuelsson    (day 18)')
  console.log('  emp9@onboard.dev          Mkt — Boston Duran           (day 10)')
  console.log('  emp10@onboard.dev         Mkt — Justin Case            (day 7)')
  console.log(`\n  Paige cumulative score: ${cumScore}% → CONFIRM (pending HR review)`)
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

void main()
