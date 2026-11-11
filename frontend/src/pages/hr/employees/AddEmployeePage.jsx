// =============================================================================
// src/pages/hr/employees/AddEmployeePage.jsx
// HR creates a new user account + employee profile in one form.
// FR-01, FR-03, FR-04, FR-11 | NFR-02, NFR-03 | Objective 1
//
// Spec s.4.2 additions:
//  - Date of birth picker + real-time age badge
//  - Cascading dropdowns: department → filtered managers (with job titles shown)
//  - Custom job title datalist (derived from managers in selected dept)
//  - employment_type and work_schedule_type selects
//  - Probation duration months selector (1/2/3/6/12) with live preview of
//    calculated end date and checkpoint dates (mirrors backend CHECKPOINT_MATRIX)
//  - Password is now optional — leave blank for auto-generated secure password
//
// Spec s.4.4 (HR Admin registration fields — s.2.3.1):
//  - middle_name on user account
//  - Address block: address_line_1/2, locality, district, country, postal_code
//  - weekly_working_hours (conditional on Part-Time)
//  - work_location
//  - id_document_type select + conditional passport_number
//  - work_permit_details + work_authorisation_expiry (conditional on non-Mauritian)
//  - contract_end_date (conditional on Fixed-Term / Contract)
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import { useNavigate }                   from 'react-router-dom'
import AppShell                          from '@/components/shared/AppShell'
import { createEmployee, getDepartments, getManagers } from '@/api/employeeApi'
import { ArrowLeft, Loader2, CheckCircle2, X, Info, Mail, Upload } from 'lucide-react'

// ── FR-03: Password complexity rules (mirrors backend passwordValidator.js) ──
const checkPassword = (pw) => {
  if (!pw || pw.length < 8)       return 'Password must be at least 8 characters long.'
  if (!/[A-Z]/.test(pw))         return 'Password must contain at least one uppercase letter.'
  if (!/[0-9]/.test(pw))         return 'Password must contain at least one number.'
  if (!/[^A-Za-z0-9]/.test(pw)) return 'Password must contain at least one special character.'
  return ''
}

const ROLES = [
  { value: 'NEW_EMPLOYEE', label: 'New Employee' },
  { value: 'LINE_MANAGER', label: 'Line Manager' },
]

const GENDER_OPTIONS = [
  { value: 'Male',   label: 'Male'   },
  { value: 'Female', label: 'Female' },
]

// Spec s.2.3 — employment_type ENUM values
const EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'Permanent',                        label: 'Permanent' },
  { value: 'Fixed-Term / Contract',            label: 'Fixed-Term / Contract' },
  { value: 'Temporary / Agency',               label: 'Temporary / Agency' },
  { value: 'Casual',                           label: 'Casual' },
  { value: 'Independent Contractor / Consultant', label: 'Independent Contractor / Consultant' },
]

// Spec s.2.3 — work_schedule_type ENUM values
const WORK_SCHEDULE_OPTIONS = [
  { value: 'Full-Time',  label: 'Full-Time'  },
  { value: 'Part-Time',  label: 'Part-Time'  },
]

// Mauritius Workers' Rights Act 2019 s.21(1): normal working week ≤ 45 hours.
// Dropdown starts at 10 hours (practical minimum) and steps up to 45 hours (legal max).
const WEEKLY_HOURS_OPTIONS = [
  { value: '10', label: '10 hours / week' },
  { value: '15', label: '15 hours / week' },
  { value: '20', label: '20 hours / week' },
  { value: '25', label: '25 hours / week' },
  { value: '30', label: '30 hours / week' },
  { value: '35', label: '35 hours / week' },
  { value: '40', label: '40 hours / week' },
  { value: '45', label: '45 hours / week (Standard Full-Time, WRA 2019)' },
]

// Spec s.2.3.1 — identity document types
const ID_DOC_OPTIONS = [
  { value: 'NIC',               label: 'National Identity Card (NIC)' },
  { value: 'PASSPORT',          label: 'Passport' },
  { value: 'RESIDENCE_PERMIT',  label: 'Residence Permit' },
  { value: 'OTHER',             label: 'Other' },
]

// ── Department-specific job title library ────────────────────────────────────
// Keyword → titles map. Matched against department name (case-insensitive).
// Titles containing "Manager" or "Administrator" are excluded — those are
// leadership roles handled via the Reporting Manager field, not job title.
const DEPT_JOB_SUGGESTIONS = {
  'finance':      ['Senior Accountant','Accountant','Junior Accountant','Financial Analyst','Accounts Officer','Payroll Officer','Treasury Officer','Internal Auditor','Finance Executive','Budget Analyst'],
  'accounting':   ['Senior Accountant','Accountant','Junior Accountant','Accounts Officer','Accounts Payable Officer','Accounts Receivable Officer','Payroll Officer','Financial Controller'],
  'human resources': ['HR Officer','HR Executive','Talent Acquisition Specialist','Recruitment Officer','Learning & Development Officer','HR Business Partner','Payroll Officer'],
  'hr ':          ['HR Officer','HR Executive','Talent Acquisition Specialist','Recruitment Officer','Learning & Development Officer','HR Business Partner','Payroll Officer'],
  'information technology': ['Software Engineer','Senior Software Engineer','Junior Software Engineer','Network Engineer','IT Support Officer','DevOps Engineer','Business Analyst','QA Engineer','UI/UX Designer'],
  ' it ':         ['Software Engineer','Senior Software Engineer','Junior Software Engineer','Network Engineer','IT Support Officer','DevOps Engineer','Business Analyst','QA Engineer'],
  'technology':   ['Software Engineer','Senior Software Engineer','Junior Software Engineer','Network Engineer','IT Support Officer','DevOps Engineer','Business Analyst','QA Engineer','UI/UX Designer'],
  'software':     ['Software Engineer','Senior Software Engineer','Junior Software Engineer','DevOps Engineer','QA Engineer','Business Analyst','Technical Lead','Architect'],
  'marketing':    ['Marketing Officer','Digital Marketing Specialist','Content Creator','Brand Executive','Social Media Officer','Market Research Analyst','Marketing Executive','Graphic Designer','SEO Specialist'],
  'sales':        ['Sales Executive','Sales Representative','Business Development Officer','Key Account Executive','Sales Coordinator'],
  'operations':   ['Operations Officer','Operations Executive','Process Coordinator','Logistics Officer','Production Supervisor','Quality Officer','Operations Analyst'],
  'legal':        ['Legal Officer','Legal Counsel','Compliance Officer','Corporate Secretary','Paralegal','Legal Executive','Regulatory Affairs Officer'],
  'compliance':   ['Compliance Officer','Risk Officer','Regulatory Affairs Officer','Internal Auditor','AML Officer'],
  'administration':['Administrative Officer','Administrative Executive','Executive Assistant','Office Assistant','Receptionist','Data Entry Clerk','Document Controller'],
  'admin':        ['Administrative Officer','Administrative Executive','Executive Assistant','Office Assistant','Receptionist'],
  'procurement':  ['Procurement Officer','Purchasing Officer','Logistics Officer','Inventory Controller'],
  'supply':       ['Logistics Officer','Procurement Officer','Inventory Controller','Warehouse Supervisor'],
  'logistics':    ['Logistics Officer','Transport Coordinator','Warehouse Supervisor','Distribution Officer'],
  'customer':     ['Customer Service Officer','Customer Support Specialist','Client Relations Officer','Call Centre Agent','Customer Experience Executive'],
  'engineering':  ['Civil Engineer','Mechanical Engineer','Electrical Engineer','Project Engineer','Technical Officer','Site Engineer','Structural Engineer'],
  'research':     ['Research Officer','Data Analyst','Research Analyst','R&D Officer','Innovation Specialist'],
  'product':      ['Product Owner','Product Analyst','Business Analyst','UX Researcher'],
  'design':       ['UI/UX Designer','Graphic Designer','Creative Director','Motion Designer','Brand Designer'],
  'audit':        ['Chief Auditor','Internal Auditor','Senior Auditor','Audit Officer','Risk Analyst'],
  'security':     ['Security Officer','Information Security Analyst','Cybersecurity Engineer','Risk Officer'],
  'training':     ['Training Officer','Learning & Development Specialist','Corporate Trainer','Instructional Designer'],
  'project':      ['Project Coordinator','Project Analyst','PMO Officer'],
}

// Match a dept name to its job title list using keyword search
function getDeptJobTitles(deptName) {
  if (!deptName) return []
  const lower = ` ${deptName.toLowerCase()} ` // pad to allow word-boundary matching
  for (const [key, titles] of Object.entries(DEPT_JOB_SUGGESTIONS)) {
    if (lower.includes(key)) return titles
  }
  return []
}

// Mauritius districts for address block
const MU_DISTRICTS = [
  'Black River', 'Flacq', 'Grand Port', 'Moka', 'Pamplemousses',
  'Plaines Wilhems', 'Port Louis', 'Rivière du Rempart', 'Savanne',
]

// Spec s.1.4 — probation duration options (calendar-month based)
const PROBATION_DURATION_OPTIONS = [
  { value: '1',  label: '1 Month'   },
  { value: '2',  label: '2 Months'  },
  { value: '3',  label: '3 Months'  },
  { value: '6',  label: '6 Months'  },
  { value: '12', label: '12 Months' },
]

// Mirrors backend CHECKPOINT_MATRIX (spec s.1.4)
const CHECKPOINT_MATRIX = { 1:[1], 2:[1,2], 3:[1,2,3], 6:[2,4,6], 12:[3,6,9,12] }

// ── Calendar-month addition (mirrors backend addCalendarMonths) ──────────────
// Correctly handles end-of-month overflow (e.g. Jan 31 + 1 month → Feb 28/29).
function addCalendarMonths(baseDateStr, months) {
  if (!baseDateStr) return null
  const [year, monthNum, day] = baseDateStr.split('-').map(Number)
  const totalMonths  = (monthNum - 1) + months
  const targetYear   = year + Math.floor(totalMonths / 12)
  const targetMonth  = totalMonths % 12          // 0-based
  const daysInTarget = new Date(targetYear, targetMonth + 1, 0).getDate()
  const targetDay    = Math.min(day, daysInTarget)
  return [
    String(targetYear),
    String(targetMonth + 1).padStart(2, '0'),
    String(targetDay).padStart(2, '0'),
  ].join('-')
}

// ── Age calculation (UTC+4 Mauritius timezone) ───────────────────────────────
function computeAge(dobStr) {
  if (!dobStr) return null
  const MU_OFFSET_MS = 4 * 60 * 60 * 1000
  const nowMU  = new Date(Date.now() + MU_OFFSET_MS)
  const birth  = new Date(dobStr + 'T00:00:00')
  let age = nowMU.getFullYear() - birth.getFullYear()
  const m = nowMU.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && nowMU.getDate() < birth.getDate())) age--
  return age >= 0 ? age : null
}

// ── Format YYYY-MM-DD to readable "DD Mon YYYY" ──────────────────────────────
function fmtDate(str) {
  if (!str) return '—'
  const [y, m, d] = str.split('-')
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return `${d} ${months[Number(m) - 1]} ${y}`
}

const INPUT_CLS = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const SELECT_CLS = `${INPUT_CLS} bg-white`

const FIELD = ({ label, required, error, hint, children }) => (
  <div>
    <label className="mb-1.5 block text-sm font-medium text-slate-700">
      {label} {required && <span className="text-red-500">*</span>}
    </label>
    {children}
    {hint  && !error && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
  </div>
)

// ── Initial form state ────────────────────────────────────────────────────────
const EMPTY_FORM = {
  // Account
  first_name:               '',
  middle_name:              '',   // spec s.2.5
  last_name:                '',
  email:                    '',
  password:                 '',   // blank → backend auto-generates
  role:                     'NEW_EMPLOYEE',
  // Personal
  date_of_birth:            '',
  gender:                   '',
  nationality:              '',
  // Address block — spec s.2.3.1
  address_line_1:           '',
  address_line_2:           '',
  locality:                 '',
  district:                 '',
  country:                  'Mauritius',
  postal_code:              '',
  // Employment
  job_title:                '',
  department_id:            '',
  manager_id:               '',
  phone:                    '',
  work_location:            '',   // spec s.2.3.1
  employment_type:          '',
  work_schedule_type:       '',
  weekly_working_hours:     '',   // spec s.2.3.1 — required when Part-Time
  salary_monthly:           '',
  // Identity — spec s.2.3.1 (DPA 2017)
  id_document_type:         '',
  nic_number:               '',   // shown when id_document_type = NIC
  passport_number:          '',   // shown when id_document_type = PASSPORT or RESIDENCE_PERMIT
  // Work permit — spec s.2.3.1
  work_permit_details:      '',
  work_authorisation_expiry: '',
  // Contract — spec s.2.6
  contract_end_date:        '',   // shown when employment_type = Fixed-Term / Contract
  // Emergency contact — spec s.2.3.1 / s.4.4 (collected by HR at registration)
  emergency_contact_name:         '',
  emergency_contact_relationship: '',
  emergency_contact_phone:        '',
  // Education & previous employment — spec s.2.3.1 / s.4.4
  highest_qualification:    '',
  field_of_study:           '',
  educational_institution:  '',
  previous_job_title:       '',
  previous_company_name:    '',
  previous_salary_monthly:  '',
  // Career progression
  salary_scale_tier:        '',
  next_line_of_promotion:   '',
  reporting_notes:          '',
  // Probation
  start_date:               '',
  probation_duration_months: '3',  // default 3 months (calendar-month based)
}

// =============================================================================
export default function AddEmployeePage() {
  const navigate = useNavigate()

  const [form,               setForm]               = useState(EMPTY_FORM)
  const [errors,             setErrors]             = useState({})
  const [loading,            setLoading]            = useState(false)
  const [success,            setSuccess]            = useState(false)
  const [departments,        setDepartments]        = useState([])
  const [managers,           setManagers]           = useState([])
  const [serverError,        setServerError]        = useState('')
  const [profileImage,       setProfileImage]       = useState(null)       // File object
  const [profileImagePreview, setProfileImagePreview] = useState('')       // data URL

  useEffect(() => {
    Promise.all([getDepartments(), getManagers()])
      .then(([depts, mgrs]) => {
        setDepartments(depts)
        setManagers(mgrs)
      })
      .catch(() => {})
  }, [])

  const set = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const isNewEmployee   = form.role === 'NEW_EMPLOYEE'
  const isPartTime      = form.work_schedule_type === 'Part-Time'
  const isFixedTerm     = form.employment_type === 'Fixed-Term / Contract'
  const needsNIC        = form.id_document_type === 'NIC'
  const needsDocNumber  = ['PASSPORT', 'RESIDENCE_PERMIT', 'OTHER'].includes(form.id_document_type)
  const needsWorkPermit = form.nationality && form.nationality.toLowerCase() !== 'mauritian'

  // Label for the doc number field
  const docNumberLabel = form.id_document_type === 'PASSPORT'
    ? 'Passport Number'
    : form.id_document_type === 'RESIDENCE_PERMIT'
    ? 'Permit Number'
    : 'Document Number'

  // ── Derived: age badge ─────────────────────────────────────────────────────
  const age = useMemo(() => computeAge(form.date_of_birth), [form.date_of_birth])

  // ── Derived: probation end date + checkpoint previews ─────────────────────
  const probEndDate = useMemo(() => {
    if (!isNewEmployee || !form.start_date || !form.probation_duration_months) return null
    return addCalendarMonths(form.start_date, Number(form.probation_duration_months))
  }, [isNewEmployee, form.start_date, form.probation_duration_months])

  const checkpointPreviews = useMemo(() => {
    if (!isNewEmployee || !form.start_date || !form.probation_duration_months) return []
    const monthOffsets = CHECKPOINT_MATRIX[Number(form.probation_duration_months)] || []
    return monthOffsets.map((mo, idx, arr) => ({
      label: idx === arr.length - 1 ? `Month ${mo} — Final` : `Month ${mo} — Review`,
      date:  addCalendarMonths(form.start_date, mo),
    }))
  }, [isNewEmployee, form.start_date, form.probation_duration_months])

  // ── Derived: manager cascade ─────────────────────────────────────────────
  // Spec s.4.2: prefer managers in the selected department.
  // Falls back to all managers if none are assigned to that department yet.
  const filteredManagers = useMemo(() => {
    if (!form.department_id) return managers
    const deptSpecific = managers.filter((m) =>
      m.employeeProfile?.department_id === Number(form.department_id)
    )
    return deptSpecific.length > 0 ? deptSpecific : managers
  }, [managers, form.department_id])

  // The currently selected manager object (for name+title display card)
  const selectedManager = useMemo(() =>
    form.manager_id
      ? managers.find((m) => String(m.user_id) === String(form.manager_id)) || null
      : null
  , [managers, form.manager_id])

  // ── Derived: job title list for selected department ───────────────────────
  // Priority: static dept-keyword lookup first, supplemented by existing
  // manager job titles in that department.
  const jobTitleSuggestions = useMemo(() => {
    if (!form.department_id) return []
    // Static library based on dept name
    const deptName = departments.find((d) => d.department_id === Number(form.department_id))?.name || ''
    const staticTitles = getDeptJobTitles(deptName)
    // Job titles from existing managers in this dept — exclude leadership titles
    // (Manager / Administrator) so they never appear in the new-employee dropdown
    const managerTitles = managers
      .filter((m) => m.employeeProfile?.department_id === Number(form.department_id))
      .map((m) => m.employeeProfile?.job_title)
      .filter((t) => t && !/manager|administrator/i.test(t))
    // Non-leadership manager titles first (bespoke), then static list, deduplicated
    return [...new Set([...managerTitles, ...staticTitles])]
  }, [managers, departments, form.department_id])

  // ── Validation ─────────────────────────────────────────────────────────────
  const validate = () => {
    const e = {}
    if (!form.first_name.trim()) e.first_name = 'First name is required.'
    if (!form.last_name.trim())  e.last_name  = 'Last name is required.'
    if (!form.email.trim())      e.email      = 'Email is required.'
    else if (!/^[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}$/.test(form.email)) e.email = 'Enter a valid email.'
    if (!form.job_title.trim()) e.job_title  = 'Job title is required.'
    if (!form.start_date)       e.start_date = 'Start date is required.'
    // Spec s.2.3.1 conditional validation
    if (form.salary_monthly) {
      const sal = Number(form.salary_monthly)
      if (isNaN(sal) || sal < 17745) {
        e.salary_monthly = 'Monthly salary must be at least MUR 17,745 (National Minimum Wage, Workers\' Rights Act 2019).'
      }
    }
    // WRA 2019 s.21(1): weekly hours required for all employees
    if (!form.weekly_working_hours) {
      e.weekly_working_hours = 'Weekly working hours are required (Workers\' Rights Act 2019).'
    }
    if (isFixedTerm && !form.contract_end_date) {
      e.contract_end_date = 'Contract end date is required for Fixed-Term / Contract employees.'
    }
    if (form.contract_end_date && form.start_date && form.contract_end_date <= form.start_date) {
      e.contract_end_date = 'Contract end date must be after start date.'
    }
    return e
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }

    setErrors({})
    setServerError('')
    setLoading(true)

    try {
      const payload = {
        ...form,
        department_id:  form.department_id  ? Number(form.department_id)  : null,
        manager_id:     form.manager_id     ? Number(form.manager_id)      : null,
        salary_monthly: form.salary_monthly ? Number(form.salary_monthly)  : null,
        // Spec s.1.4 / s.4.2: send month-based probation config for new employees.
        ...(isNewEmployee && {
          probation_duration_months: Number(form.probation_duration_months),
        }),
        // Conditional numeric
        weekly_working_hours: form.weekly_working_hours ? Number(form.weekly_working_hours) : null,
        // Optional fields — omit falsy so backend receives clean payload
        date_of_birth:            form.date_of_birth            || undefined,
        employment_type:          form.employment_type           || undefined,
        work_schedule_type:       form.work_schedule_type        || undefined,
        gender:                   form.gender                    || undefined,
        nationality:              form.nationality               || undefined,
        phone:                    form.phone                     || undefined,
        middle_name:              form.middle_name               || undefined,
        // Address
        address_line_1:           form.address_line_1            || undefined,
        address_line_2:           form.address_line_2            || undefined,
        locality:                 form.locality                  || undefined,
        district:                 form.district                  || undefined,
        country:                  form.country                   || 'Mauritius',
        postal_code:              form.postal_code               || undefined,
        // Work
        work_location:            form.work_location             || undefined,
        // Identity
        id_document_type:         form.id_document_type          || undefined,
        nic_number:               form.nic_number                || undefined,
        passport_number:          form.passport_number           || undefined,
        // Work permit
        work_permit_details:      form.work_permit_details       || undefined,
        work_authorisation_expiry: form.work_authorisation_expiry || undefined,
        // Contract
        contract_end_date:        form.contract_end_date         || undefined,
        // Emergency contact
        emergency_contact_name:         form.emergency_contact_name         || undefined,
        emergency_contact_relationship: form.emergency_contact_relationship || undefined,
        emergency_contact_phone:        form.emergency_contact_phone        || undefined,
        // Education & previous employment
        highest_qualification:    form.highest_qualification     || undefined,
        field_of_study:           form.field_of_study            || undefined,
        educational_institution:  form.educational_institution   || undefined,
        previous_job_title:       form.previous_job_title        || undefined,
        previous_company_name:    form.previous_company_name     || undefined,
        previous_salary_monthly:  form.previous_salary_monthly   ? Number(form.previous_salary_monthly) : undefined,
        // Career progression
        salary_scale_tier:        form.salary_scale_tier         || undefined,
        next_line_of_promotion:   form.next_line_of_promotion    || undefined,
        reporting_notes:          form.reporting_notes           || undefined,
        // Password: omit if blank (backend will auto-generate)
        password:                 form.password                  || undefined,
      }
      // probation_end_date and checkpoint_days are computed server-side
      delete payload.probation_end_date

      // If a profile image was selected, send as multipart/form-data so multer
      // can process it on the backend. Otherwise send plain JSON as before.
      if (profileImage) {
        const fd = new FormData()
        Object.entries(payload).forEach(([k, v]) => {
          if (v !== undefined && v !== null) fd.append(k, v)
        })
        fd.append('profile_image', profileImage)
        await createEmployee(fd)
      } else {
        await createEmployee(payload)
      }
      setSuccess(true)
    } catch (err) {
      setServerError(err.response?.data?.message || 'Failed to create employee. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Success screen ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="mt-4 text-xl font-bold text-slate-800">Employee Created</h2>
          <p className="mt-2 text-sm text-slate-500">
            {form.first_name} {form.last_name}'s account and profile have been set up successfully.
            <span className="mt-1 block text-xs text-amber-600">
              A secure auto-generated password has been sent to {form.email}.
            </span>
          </p>
          <div className="mt-6 flex gap-3">
            <button
              onClick={() => navigate('/hr/employees')}
              className="rounded-lg px-4 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: '#1e3a5f' }}
            >
              View All Employees
            </button>
            <button
              onClick={() => { setSuccess(false); setForm(EMPTY_FORM); setProfileImage(null); setProfileImagePreview('') }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Add Another
            </button>
          </div>
        </div>
      </AppShell>
    )
  }

  // ── Form ───────────────────────────────────────────────────────────────────
  return (
    <AppShell>
      {/* Back */}
      <button
        onClick={() => navigate('/hr/employees')}
        className="mb-5 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="h-4 w-4" /> Back to Employees
      </button>

      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>Add New Employee</h1>
        <p className="mt-1 text-sm text-slate-500">
          Create a user account and employee profile. Fields marked * are required.
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate>
        {serverError && (
          <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {serverError}
          </div>
        )}

        {/* ── Account Information ──────────────────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>
            Account Information
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FIELD label="First Name" required error={errors.first_name}>
              <input type="text" value={form.first_name} onChange={set('first_name')}
                placeholder="e.g. John" className={INPUT_CLS} />
            </FIELD>
            {/* Spec s.2.5 — optional middle name */}
            <FIELD label="Middle Name" error={errors.middle_name} hint="Optional. Displayed as First Middle Last.">
              <input type="text" value={form.middle_name} onChange={set('middle_name')}
                placeholder="e.g. Michael" className={INPUT_CLS} />
            </FIELD>
            <FIELD label="Last Name" required error={errors.last_name}>
              <input type="text" value={form.last_name} onChange={set('last_name')}
                placeholder="e.g. Smith" className={INPUT_CLS} />
            </FIELD>
            <FIELD label="Email Address" required error={errors.email}>
              <input type="email" value={form.email} onChange={set('email')}
                placeholder="e.g. john.smith@company.com" className={INPUT_CLS} />
            </FIELD>

            {/* Password is always auto-generated — HR cannot set it manually */}
            <div className="flex items-start gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3">
              <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
              <div>
                <p className="text-sm font-medium text-blue-800">Password auto-generated</p>
                <p className="mt-0.5 text-xs text-blue-600">
                  A secure temporary password will be generated automatically and emailed to the
                  employee upon account creation.
                </p>
              </div>
            </div>

            <FIELD label="System Role" required error={errors.role}>
              <select value={form.role} onChange={set('role')} className={SELECT_CLS}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </FIELD>
          </div>
        </section>

        {/* ── Personal Information ─────────────────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>
            Personal Information
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Lecturer requirement: gender headcount on HR dashboard */}
            <FIELD label="Gender" error={errors.gender}>
              <select value={form.gender} onChange={set('gender')} className={SELECT_CLS}>
                <option value="">— Select gender —</option>
                {GENDER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FIELD>

            <FIELD label="Nationality" error={errors.nationality}>
              <input type="text" value={form.nationality} onChange={set('nationality')}
                placeholder="e.g. Mauritian" className={INPUT_CLS} />
            </FIELD>

            {/* Spec s.4.2: DOB picker with real-time age badge */}
            <FIELD
              label="Date of Birth"
              error={errors.date_of_birth}
              hint="Used for WRA 2019 age-related leave entitlements. Stored securely per DPA 2017."
            >
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={form.date_of_birth}
                  onChange={set('date_of_birth')}
                  max={new Date().toISOString().split('T')[0]}
                  className={`${INPUT_CLS} flex-1`}
                />
                {age !== null && (
                  <span className="inline-flex shrink-0 items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                    Age {age}
                  </span>
                )}
              </div>
            </FIELD>
          </div>
        </section>

        {/* ── Profile Photo ───────────────────────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 text-base font-semibold" style={{ color: '#0f1c2e' }}>Profile Photo</h2>
          <p className="mb-4 text-xs text-slate-400">
            JPEG or PNG, max 2 MB. Used as the employee's avatar throughout the system.
          </p>
          <div className="flex items-center gap-6">
            {/* Circular preview */}
            <div className="h-20 w-20 flex-shrink-0 overflow-hidden rounded-full border-2 border-slate-200 bg-slate-100 flex items-center justify-center select-none">
              {profileImagePreview ? (
                <img src={profileImagePreview} alt="Profile preview" className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl font-bold text-slate-300">
                  {form.first_name ? form.first_name.charAt(0).toUpperCase() : '?'}
                </span>
              )}
            </div>
            <div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                <Upload className="h-4 w-4 text-slate-500" />
                {profileImage ? 'Change Photo' : 'Upload Photo'}
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png"
                  className="sr-only"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setProfileImage(file)
                    const reader = new FileReader()
                    reader.onload = (ev) => setProfileImagePreview(ev.target.result)
                    reader.readAsDataURL(file)
                  }}
                />
              </label>
              {profileImage && (
                <button
                  type="button"
                  onClick={() => { setProfileImage(null); setProfileImagePreview('') }}
                  className="ml-2 text-xs text-red-500 hover:text-red-700 underline"
                >
                  Remove
                </button>
              )}
              {profileImage && (
                <p className="mt-1.5 text-xs text-slate-400">
                  {profileImage.name} · {(profileImage.size / 1024).toFixed(0)} KB
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── Employment Details ───────────────────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>
            Employment Details
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* Spec s.4.2: department chosen first to cascade job titles + managers */}
            <FIELD label="Department" error={errors.department_id}>
              <select
                value={form.department_id}
                onChange={(e) => {
                  const deptId = e.target.value
                  // Auto-select only when exactly one dept-specific manager exists.
                  // Never auto-select from the full list fallback — that would pick an
                  // unrelated department's manager (e.g. Finance Manager for HR staff).
                  const deptManagers = managers.filter((m) =>
                    m.employeeProfile?.department_id === Number(deptId)
                  )
                  const autoManager = deptId && deptManagers.length === 1
                    ? String(deptManagers[0].user_id)
                    : ''
                  setForm((prev) => ({
                    ...prev,
                    department_id: deptId,
                    manager_id:    autoManager,
                    job_title:     '',   // reset job title on dept change
                  }))
                }}
                className={SELECT_CLS}
              >
                <option value="">— Select department —</option>
                {departments.map((d) => (
                  <option key={d.department_id} value={d.department_id}>{d.name}</option>
                ))}
              </select>
            </FIELD>

            {/* Spec s.4.2: job title — dropdown when dept has known titles, text otherwise */}
            {form.department_id && jobTitleSuggestions.length > 0 ? (
              <FIELD label="Job Title" required error={errors.job_title}>
                <select
                  value={form.job_title}
                  onChange={set('job_title')}
                  className={SELECT_CLS}
                >
                  <option value="">— Select job title —</option>
                  {jobTitleSuggestions.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                  <option value="__other__">Other — enter below</option>
                </select>
                {form.job_title === '__other__' && (
                  <input
                    type="text"
                    value={form._customJobTitle || ''}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        job_title:       e.target.value,
                        _customJobTitle: e.target.value,
                      }))
                    }
                    placeholder="Enter custom job title"
                    className={`${INPUT_CLS} mt-2`}
                    autoFocus
                  />
                )}
              </FIELD>
            ) : (
              <FIELD label="Job Title" required error={errors.job_title}
                hint={form.department_id
                  ? 'No predefined titles for this department. Enter a custom job title.'
                  : 'Select a department first to see available job titles.'}>
                <input
                  type="text"
                  value={form.job_title}
                  onChange={set('job_title')}
                  placeholder="e.g. Software Engineer"
                  className={INPUT_CLS}
                />
              </FIELD>
            )}

            {/* Spec s.4.2: manager cascade — auto-selected from department */}
            <FIELD
              label="Reporting Manager"
              error={errors.manager_id}
              hint={form.department_id && filteredManagers.length === 0
                ? 'No managers are assigned to this department yet.'
                : undefined}
            >
              <select value={form.manager_id} onChange={set('manager_id')} className={SELECT_CLS}>
                <option value="">— Select manager —</option>
                {filteredManagers.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.first_name} {m.last_name} — {m.employeeProfile?.job_title || (m.role === 'HR_ADMIN' ? 'HR Admin' : 'Line Manager')}
                  </option>
                ))}
              </select>
              {/* Auto-selected manager info card */}
              {selectedManager && (
                <div className="mt-2 flex items-center gap-2.5 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2">
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                    style={{ backgroundColor: '#1e4fa8' }}
                  >
                    {selectedManager.first_name?.charAt(0)}{selectedManager.last_name?.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 leading-snug">
                      {selectedManager.first_name} {selectedManager.last_name}
                      <span className="ml-1.5 text-xs font-normal text-slate-500">
                        — {selectedManager.employeeProfile?.job_title || (selectedManager.role === 'HR_ADMIN' ? 'HR Admin' : 'Line Manager')}
                      </span>
                    </p>
                  </div>
                  <span className="ml-auto flex-shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                    Auto-selected
                  </span>
                </div>
              )}
            </FIELD>

            <FIELD label="Phone" error={errors.phone}>
              <input type="tel" value={form.phone} onChange={set('phone')}
                placeholder="e.g. +230 5900 0000" className={INPUT_CLS} />
            </FIELD>

            {/* Spec s.2.3 — employment_type */}
            <FIELD label="Employment Type" error={errors.employment_type}>
              <select value={form.employment_type} onChange={set('employment_type')} className={SELECT_CLS}>
                <option value="">— Select employment type —</option>
                {EMPLOYMENT_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FIELD>

            {/* Spec s.2.3 — work_schedule_type */}
            <FIELD label="Work Schedule" error={errors.work_schedule_type}>
              <select value={form.work_schedule_type} onChange={set('work_schedule_type')} className={SELECT_CLS}>
                <option value="">— Select schedule —</option>
                {WORK_SCHEDULE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FIELD>

            {/* Monthly salary */}
            <FIELD
              label="Monthly Salary (MUR)"
              error={errors.salary_monthly}
              hint="Minimum MUR 17,745 (Workers' Rights Act 2019 — National Minimum Wage). Used to determine leave entitlements."
            >
              <input
                type="number" min="17745" step="500"
                value={form.salary_monthly}
                onChange={set('salary_monthly')}
                placeholder="e.g. 25000 (min MUR 17,745)"
                className={INPUT_CLS}
              />
            </FIELD>

            {/* Spec s.2.3.1 — work location */}
            <FIELD label="Work Location" error={errors.work_location}>
              <input type="text" value={form.work_location} onChange={set('work_location')}
                placeholder="e.g. Head Office - Port Louis, Remote" className={INPUT_CLS} />
            </FIELD>

            {/* Spec s.2.3.1 — weekly hours (required for ALL employees, WRA 2019 s.21) */}
            <FIELD
              label="Weekly Working Hours"
              required
              error={errors.weekly_working_hours}
              hint="Contracted weekly hours per WRA 2019 s.21(1). Normal working week ≤ 45 hours. Full-Time standard is 45 hours."
            >
              <select
                value={form.weekly_working_hours}
                onChange={set('weekly_working_hours')}
                className={SELECT_CLS}
              >
                <option value="">— Select weekly hours —</option>
                {WEEKLY_HOURS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FIELD>

            {/* Spec s.2.6 — contract end date (required when Fixed-Term) */}
            {isFixedTerm && (
              <FIELD
                label="Contract End Date"
                required
                error={errors.contract_end_date}
                hint="Required for Fixed-Term / Contract employees. Triggers a 30-day advance-warning notification."
              >
                <input
                  type="date"
                  value={form.contract_end_date}
                  onChange={set('contract_end_date')}
                  min={form.start_date || new Date().toISOString().split('T')[0]}
                  className={INPUT_CLS}
                />
              </FIELD>
            )}
          </div>
        </section>

        {/* ── Address Information (spec s.2.3.1) ──────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>
            Address Information
          </h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FIELD label="Address Line 1" error={errors.address_line_1}>
              <input type="text" value={form.address_line_1} onChange={set('address_line_1')}
                placeholder="e.g. 12 Royal Road" className={INPUT_CLS} />
            </FIELD>
            <FIELD label="Address Line 2" error={errors.address_line_2} hint="Apartment, suite, floor — optional.">
              <input type="text" value={form.address_line_2} onChange={set('address_line_2')}
                placeholder="e.g. Flat 3A" className={INPUT_CLS} />
            </FIELD>
            <FIELD label="Locality / Town" error={errors.locality}>
              <input type="text" value={form.locality} onChange={set('locality')}
                placeholder="e.g. Curepipe" className={INPUT_CLS} />
            </FIELD>
            <FIELD label="District" error={errors.district}>
              <select value={form.district} onChange={set('district')} className={SELECT_CLS}>
                <option value="">— Select district —</option>
                {MU_DISTRICTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
                <option value="Other">Other</option>
              </select>
            </FIELD>
            <FIELD label="Country" error={errors.country}>
              <input type="text" value={form.country} onChange={set('country')}
                placeholder="Mauritius" className={INPUT_CLS} />
            </FIELD>
            <FIELD label="Postal Code" error={errors.postal_code} hint="Optional in Mauritius addressing.">
              <input type="text" value={form.postal_code} onChange={set('postal_code')}
                placeholder="e.g. 74201" className={INPUT_CLS} />
            </FIELD>
          </div>
        </section>

        {/* ── Emergency Contact (spec s.2.3.1 / s.4.4 — HR collects at registration) ── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 text-base font-semibold" style={{ color: '#0f1c2e' }}>Emergency Contact</h2>
          <p className="mb-4 text-xs text-slate-400">
            Person to contact in case of emergency. Provided by HR at registration; employee may update later.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FIELD label="Contact Name" error={errors.emergency_contact_name}>
              <input type="text" value={form.emergency_contact_name} onChange={set('emergency_contact_name')}
                placeholder="e.g. Jane Doe" className={INPUT_CLS} />
            </FIELD>
            <FIELD label="Relationship" error={errors.emergency_contact_relationship}
              hint="e.g. Spouse, Parent, Sibling">
              <input type="text" value={form.emergency_contact_relationship} onChange={set('emergency_contact_relationship')}
                placeholder="e.g. Spouse" className={INPUT_CLS} />
            </FIELD>
            <FIELD label="Contact Phone" error={errors.emergency_contact_phone}
              hint="Include country code, e.g. +230 5900 0000">
              <input type="tel" value={form.emergency_contact_phone} onChange={set('emergency_contact_phone')}
                placeholder="+230 5900 0000" className={INPUT_CLS} />
            </FIELD>
          </div>
        </section>

        {/* ── Education & Previous Employment (spec s.2.3.1 / s.4.4) ──────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 text-base font-semibold" style={{ color: '#0f1c2e' }}>
            Education &amp; Previous Employment
          </h2>
          <p className="mb-4 text-xs text-slate-400">
            Educational background and most recent employment history. Employee may update these details during onboarding.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FIELD label="Highest Qualification" error={errors.highest_qualification}>
              <input type="text" value={form.highest_qualification} onChange={set('highest_qualification')}
                placeholder="e.g. BSc Software Engineering" className={INPUT_CLS} />
            </FIELD>
            <FIELD label="Field of Study" error={errors.field_of_study}>
              <input type="text" value={form.field_of_study} onChange={set('field_of_study')}
                placeholder="e.g. Computer Science" className={INPUT_CLS} />
            </FIELD>
            <FIELD label="Educational Institution" error={errors.educational_institution}>
              <input type="text" value={form.educational_institution} onChange={set('educational_institution')}
                placeholder="e.g. University of Technology, Mauritius" className={INPUT_CLS} />
            </FIELD>
            <FIELD label="Previous Job Title" error={errors.previous_job_title}
              hint="Most recent role before joining this organisation.">
              <input type="text" value={form.previous_job_title} onChange={set('previous_job_title')}
                placeholder="e.g. Junior Software Engineer" className={INPUT_CLS} />
            </FIELD>
            <FIELD label="Previous Employer / Company" error={errors.previous_company_name}>
              <input type="text" value={form.previous_company_name} onChange={set('previous_company_name')}
                placeholder="e.g. ABC Solutions Ltd" className={INPUT_CLS} />
            </FIELD>
            <FIELD
              label="Previous Monthly Salary (MUR)"
              error={errors.previous_salary_monthly}
              hint="Monthly salary at previous employer. Used for benchmarking purposes."
            >
              <input
                type="number" min="0" step="500"
                value={form.previous_salary_monthly}
                onChange={set('previous_salary_monthly')}
                placeholder="e.g. 20000"
                className={INPUT_CLS}
              />
            </FIELD>
          </div>
        </section>

        {/* ── Career Progression & Compensation ───────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 text-base font-semibold" style={{ color: '#0f1c2e' }}>
            Career Progression &amp; Compensation
          </h2>
          <p className="mb-4 text-xs text-slate-400">
            Internal grading, promotion pathway and reporting structure notes for HR records.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FIELD
              label="Salary Scale / Grade Band"
              error={errors.salary_scale_tier}
              hint="Internal salary grade identifier, e.g. Band 3, Grade B."
            >
              <input type="text" value={form.salary_scale_tier} onChange={set('salary_scale_tier')}
                placeholder="e.g. Band 3" className={INPUT_CLS} />
            </FIELD>
            <FIELD
              label="Next Line of Promotion"
              error={errors.next_line_of_promotion}
              hint="Next role or milestone on the employee's career development path."
            >
              <input type="text" value={form.next_line_of_promotion} onChange={set('next_line_of_promotion')}
                placeholder="e.g. Senior Software Engineer" className={INPUT_CLS} />
            </FIELD>
            <div className="sm:col-span-2">
              <FIELD
                label="Reporting Notes"
                error={errors.reporting_notes}
                hint="Additional context on reporting structure, matrix reporting, or responsibilities beyond the assigned manager."
              >
                <textarea
                  value={form.reporting_notes}
                  onChange={set('reporting_notes')}
                  rows={3}
                  maxLength={500}
                  placeholder="e.g. Also reports to the Regional Director on cross-department projects."
                  className={`${INPUT_CLS} resize-none`}
                />
                <p className="mt-1 text-right text-xs text-slate-400">
                  {form.reporting_notes.length}/500
                </p>
              </FIELD>
            </div>
          </div>
        </section>

        {/* ── Identity & Work Authorisation (spec s.2.3.1 — DPA 2017) ─────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 text-base font-semibold" style={{ color: '#0f1c2e' }}>
            Identity &amp; Work Authorisation
          </h2>
          <p className="mb-4 text-xs text-amber-600">
            Fields in this section are sensitive personal data. Access is restricted to HR Administrators only (DPA 2017).
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

            {/* ID document type */}
            <FIELD label="Identity Document Type" error={errors.id_document_type}>
              <select value={form.id_document_type} onChange={set('id_document_type')} className={SELECT_CLS}>
                <option value="">— Select document type —</option>
                {ID_DOC_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </FIELD>

            {/* NIC number — shown when NIC is selected */}
            {needsNIC && (
              <FIELD
                label="NIC Number"
                error={errors.nic_number}
                hint="National Identity Card number. DPA 2017-sensitive — access is audit-logged."
              >
                <input type="text" value={form.nic_number} onChange={set('nic_number')}
                  placeholder="e.g. A1234567890123Z" className={INPUT_CLS} />
              </FIELD>
            )}

            {/* Passport / Permit / Other number — conditional */}
            {needsDocNumber && (
              <FIELD
                label={docNumberLabel}
                error={errors.passport_number}
                hint="DPA 2017-sensitive. Stored securely and access is audit-logged."
              >
                <input type="text" value={form.passport_number} onChange={set('passport_number')}
                  placeholder="e.g. MU1234567" className={INPUT_CLS} />
              </FIELD>
            )}

            {/* Work permit details — shown when non-Mauritian */}
            {(needsWorkPermit || form.work_permit_details) && (
              <>
                <FIELD label="Work Permit / Authorisation Details" error={errors.work_permit_details}>
                  <input type="text" value={form.work_permit_details} onChange={set('work_permit_details')}
                    placeholder="e.g. Occupation Permit No. OP/2026/00123" className={INPUT_CLS} />
                </FIELD>
                <FIELD
                  label="Work Authorisation Expiry"
                  error={errors.work_authorisation_expiry}
                  hint="A 30-day advance-warning notification will be triggered before expiry."
                >
                  <input
                    type="date"
                    value={form.work_authorisation_expiry}
                    onChange={set('work_authorisation_expiry')}
                    className={INPUT_CLS}
                  />
                </FIELD>
              </>
            )}

            {/* Always show work permit toggle for non-Mauritian nationalities */}
            {!needsWorkPermit && !form.work_permit_details && (
              <div className="sm:col-span-2">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, work_permit_details: ' ' }))}
                  className="text-xs text-blue-600 hover:text-blue-800 underline"
                >
                  + Add work permit / authorisation details
                </button>
              </div>
            )}
          </div>
        </section>

        {/* ── Probation / Employment Dates ─────────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>
            {isNewEmployee ? 'Probation Period' : 'Employment Dates'}
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FIELD label="Start Date" required error={errors.start_date}>
              <input
                type="date"
                value={form.start_date}
                onChange={set('start_date')}
                min={new Date().toISOString().split('T')[0]}
                className={INPUT_CLS}
              />
            </FIELD>

            {/* Spec s.4.2 / s.1.4: month-based duration replaces manual end date */}
            {isNewEmployee && (
              <FIELD
                label="Probation Duration"
                error={errors.probation_duration_months}
                hint="Probation end date and evaluation checkpoints are calculated automatically."
              >
                <select
                  value={form.probation_duration_months}
                  onChange={set('probation_duration_months')}
                  className={SELECT_CLS}
                >
                  {PROBATION_DURATION_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </FIELD>
            )}
          </div>

          {/* Spec s.4.2: live preview of calculated probation end date + checkpoints */}
          {isNewEmployee && form.start_date && probEndDate && (
            <div className="mt-5 rounded-lg border border-blue-100 bg-blue-50 px-4 py-4">
              <div className="mb-3 flex items-center gap-2">
                <Info className="h-4 w-4 shrink-0 text-blue-500" />
                <span className="text-sm font-medium text-blue-800">Probation Schedule Preview</span>
              </div>

              <div className="mb-3 text-sm text-blue-700">
                <span className="font-medium">Probation end date: </span>
                <span>{fmtDate(probEndDate)}</span>
              </div>

              {checkpointPreviews.length > 0 && (
                <>
                  <p className="mb-2 text-xs font-medium text-blue-700">Evaluation checkpoints:</p>
                  <div className="flex flex-wrap gap-2">
                    {checkpointPreviews.map((cp) => (
                      <span
                        key={cp.label}
                        className="inline-flex items-center rounded-full bg-white px-3 py-1 text-xs font-medium text-blue-700 ring-1 ring-blue-200"
                      >
                        {cp.label}
                        <span className="ml-1.5 text-blue-400">({fmtDate(cp.date)})</span>
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-blue-500">
                    Checkpoint dates use calendar-month addition and account for end-of-month boundaries.
                  </p>
                </>
              )}
            </div>
          )}
        </section>

        {/* ── Submit ──────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60 transition hover:opacity-90"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {loading ? 'Creating…' : 'Create Employee'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/hr/employees')}
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </AppShell>
  )
}
