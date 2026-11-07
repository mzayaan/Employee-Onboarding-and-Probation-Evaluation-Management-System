// =============================================================================
// src/pages/employee/profile/MyProfilePage.jsx
// Employee self-service profile completion page.
// Employees fill in personal details they are responsible for providing
// during the onboarding period.
//
// HR Admin registration fields (address, work location, identity, work permit)
// are shown as read-only here — employees cannot edit them.
//
// Fields the employee can update (spec s.4.4):
//   - personal_email
//   - Emergency contact: name, relationship, phone
//   - Education: highest_qualification, field_of_study, educational_institution
//   - previous_job_title
//
// FR-04 | NFR-03 | Objective 1 | Spec s.2.3.1, s.4.4
// =============================================================================

import { useEffect, useState } from 'react'
import AppShell                 from '@/components/shared/AppShell'
import { getMyEmployeeProfile, updateMyProfile, uploadMyAvatar } from '@/api/employeeApi'
import { useAuth }              from '@/context/AuthContext'
import AvatarUpload             from '@/components/shared/AvatarUpload'
import { CheckCircle2, Loader2, Lock } from 'lucide-react'

const INPUT_CLS = 'w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100'
const READONLY_CLS = 'w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-500 cursor-not-allowed'

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

const ReadOnlyField = ({ label, value, hint }) => (
  <div>
    <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-slate-500">
      <Lock className="h-3 w-3" /> {label}
    </label>
    <div className={READONLY_CLS}>{value || <span className="italic text-slate-400">Not provided</span>}</div>
    {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
  </div>
)

export default function MyProfilePage() {
  const { refreshProfile } = useAuth()
  const [profile,     setProfile]     = useState(null)
  const [user,        setUser]        = useState(null)
  const [form,        setForm]        = useState({})
  const [errors,      setErrors]      = useState({})
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(false)
  const [saved,       setSaved]       = useState(false)
  const [serverError, setServerError] = useState('')

  useEffect(() => {
    getMyEmployeeProfile()
      .then((data) => {
        // Response shape: { success, user: {...}, employeeProfile: {...} }
        const u = data.user || data.data?.user || data.data || data
        setUser(u)
        const p = data.employeeProfile || data.data?.employeeProfile || u.employeeProfile || {}
        setProfile(p)
        setForm({
          personal_email:                 p.personal_email                 || '',
          emergency_contact_name:         p.emergency_contact_name         || '',
          emergency_contact_relationship: p.emergency_contact_relationship || '',
          emergency_contact_phone:        p.emergency_contact_phone        || '',
          highest_qualification:          p.highest_qualification          || '',
          field_of_study:                 p.field_of_study                 || '',
          educational_institution:        p.educational_institution        || '',
          previous_job_title:             p.previous_job_title             || '',
        })
      })
      .catch(() => setServerError('Could not load profile. Please try again.'))
      .finally(() => setLoading(false))
  }, [])

  const set = (field) => (e) =>
    setForm((prev) => ({ ...prev, [field]: e.target.value }))

  const validate = () => {
    const e = {}
    if (form.personal_email && !/^[\w.%+\-]+@[\w.\-]+\.[a-zA-Z]{2,}$/.test(form.personal_email)) {
      e.personal_email = 'Enter a valid email address.'
    }
    if (form.personal_email && user?.email && form.personal_email.toLowerCase() === user.email.toLowerCase()) {
      e.personal_email = 'Personal email must differ from your work email.'
    }
    return e
  }

  const handleSubmit = async (ev) => {
    ev.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setErrors({})
    setServerError('')
    setSaving(true)
    try {
      // Send only the employee-editable fields
      const payload = {
        personal_email:                 form.personal_email                 || null,
        emergency_contact_name:         form.emergency_contact_name         || null,
        emergency_contact_relationship: form.emergency_contact_relationship || null,
        emergency_contact_phone:        form.emergency_contact_phone        || null,
        highest_qualification:          form.highest_qualification          || null,
        field_of_study:                 form.field_of_study                 || null,
        educational_institution:        form.educational_institution        || null,
        previous_job_title:             form.previous_job_title             || null,
      }
      await updateMyProfile(payload)
      setSaved(true)
      setTimeout(() => setSaved(false), 3500)
    } catch (err) {
      setServerError(err.response?.data?.message || 'Failed to save profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      </AppShell>
    )
  }

  const fullName = [user?.first_name, user?.middle_name, user?.last_name].filter(Boolean).join(' ')
  const address  = [
    profile?.address_line_1, profile?.address_line_2,
    profile?.locality, profile?.district, profile?.country,
  ].filter(Boolean).join(', ')

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6 flex items-center gap-5">
        <AvatarUpload
          firstName={user?.first_name}
          lastName={user?.last_name}
          imageUrl={profile?.profile_image_url}
          onUpload={uploadMyAvatar}
          onSuccess={() => {
            refreshProfile()
            // Re-fetch profile so the local preview stays in sync
            getMyEmployeeProfile().then((data) => {
              const p = data.employeeProfile || data.data?.employeeProfile || {}
              setProfile(p)
            }).catch(() => {})
          }}
          size={72}
        />
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#0f1c2e' }}>My Profile</h1>
          <p className="mt-0.5 text-sm text-slate-500">{fullName}</p>
        </div>
      </div>

      {serverError && (
        <div className="mb-5 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{serverError}</div>
      )}
      {saved && (
        <div className="mb-5 flex items-center gap-2 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <CheckCircle2 className="h-4 w-4" /> Profile saved successfully.
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>

        {/* ── Account (read-only) ──────────────────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 text-base font-semibold" style={{ color: '#0f1c2e' }}>Account Details</h2>
          <p className="mb-4 text-xs text-slate-400">
            Contact HR to update your name or work email address.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Full Name"      value={fullName} />
            <ReadOnlyField label="Work Email"     value={user?.email} />
            <ReadOnlyField label="Job Title"      value={profile?.job_title} />
            <ReadOnlyField label="Department"     value={profile?.department?.name} />
            <ReadOnlyField label="Start Date"     value={profile?.start_date ? new Date(profile.start_date).toLocaleDateString('en-GB') : undefined} />
            <ReadOnlyField label="Probation Ends" value={profile?.probation_end_date ? new Date(profile.probation_end_date).toLocaleDateString('en-GB') : undefined} />
            <ReadOnlyField label="Employment Type"   value={profile?.employment_type?.replace(/_/g, ' ')} />
            <ReadOnlyField label="Work Schedule"     value={profile?.work_schedule_type?.replace(/_/g, ' ')} />
            <ReadOnlyField label="Weekly Hours"      value={profile?.weekly_working_hours != null ? `${profile.weekly_working_hours} hrs` : undefined} />
            <ReadOnlyField label="Work Location"     value={profile?.work_location} />
          </div>
        </section>

        {/* ── Identity & Compliance (read-only) ───────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 text-base font-semibold" style={{ color: '#0f1c2e' }}>Identity &amp; Compliance</h2>
          <p className="mb-4 text-xs text-slate-400">
            Recorded by HR at registration. Contact HR if any details need updating.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnlyField label="NIC Number"        value={profile?.nic_number} />
            <ReadOnlyField label="Tax Account (TAN)" value={profile?.tax_account_number} />
            <ReadOnlyField label="Date of Birth"     value={profile?.date_of_birth ? new Date(profile.date_of_birth).toLocaleDateString('en-GB') : undefined} />
            <ReadOnlyField label="Nationality"       value={profile?.nationality} />
            <ReadOnlyField label="ID Document Type"  value={profile?.id_document_type?.replace(/_/g, ' ')} />
            <ReadOnlyField label="Passport Number"   value={profile?.passport_number} />
          </div>
        </section>

        {/* ── Banking Details (read-only) ──────────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 text-base font-semibold" style={{ color: '#0f1c2e' }}>Banking Details</h2>
          <p className="mb-4 text-xs text-slate-400">
            Your bank details were submitted during onboarding. Contact HR to update them.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Bank Name"           value={profile?.bank_name} />
            <ReadOnlyField label="Bank Account Number" value={profile?.bank_account_number} />
          </div>
        </section>

        {/* ── Address (read-only — set by HR Admin) ───────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-1 text-base font-semibold" style={{ color: '#0f1c2e' }}>Address</h2>
          <p className="mb-4 text-xs text-slate-400">
            Your address was recorded by HR at registration. Contact HR to update it.
          </p>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <ReadOnlyField label="Address" value={address || undefined} />
            <ReadOnlyField label="Work Location" value={profile?.work_location} />
          </div>
        </section>

        {/* ── Personal Email ───────────────────────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Personal Contact</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FIELD
              label="Personal Email"
              error={errors.personal_email}
              hint="Used for communications outside your work account. Must differ from your work email."
            >
              <input
                type="email"
                value={form.personal_email}
                onChange={set('personal_email')}
                placeholder="e.g. yourname@gmail.com"
                className={INPUT_CLS}
              />
            </FIELD>
          </div>
        </section>

        {/* ── Emergency Contact ────────────────────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>Emergency Contact</h2>
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

        {/* ── Education & Previous Employment ─────────────────────────────── */}
        <section className="mb-6 rounded-xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 text-base font-semibold" style={{ color: '#0f1c2e' }}>
            Education &amp; Previous Employment
          </h2>
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
          </div>
        </section>

        {/* ── Save ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium text-white disabled:opacity-60 transition hover:opacity-90"
            style={{ backgroundColor: '#1e3a5f' }}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </form>
    </AppShell>
  )
}
