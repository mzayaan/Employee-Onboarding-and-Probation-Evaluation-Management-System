// =============================================================================
// src/components/attendance/AttendanceHeatmap.jsx
// Shared attendance visualisation components:
//   - CalendarHeatmap  — full probation period as a colour-coded day grid
//   - ExceptionsTable  — non-PRESENT records only
//   - StatusBadge      — inline status pill
//
// FR-12 | Objective 2
// Used by: AttendanceLogPage, EmployeeDetailPage
// =============================================================================

import { useMemo, useState } from 'react'
import { LayoutGrid, AlertCircle, CheckCircle2, ChevronLeft, ChevronRight } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

export const STATUS_OPTIONS = [
  { value: 'PRESENT',         label: 'Present',                     colour: 'bg-emerald-100 text-emerald-700', group: 'Attendance' },
  { value: 'ABSENT',          label: 'Absent',                      colour: 'bg-red-100     text-red-700',     group: 'Attendance' },
  { value: 'LATE',            label: 'Late',                        colour: 'bg-amber-100   text-amber-700',   group: 'Attendance' },
  { value: 'HALF_DAY',        label: 'Half Day',                    colour: 'bg-blue-100    text-blue-700',    group: 'Attendance' },
  { value: 'SICK_LEAVE',      label: 'Sick Leave (WRA s.46)',       colour: 'bg-orange-100  text-orange-700',  group: 'WRA 2019 Leave' },
  { value: 'ANNUAL_LEAVE',    label: 'Annual Leave (WRA s.45)',     colour: 'bg-teal-100    text-teal-700',    group: 'WRA 2019 Leave' },
  { value: 'VACATION_LEAVE',  label: 'Vacation Leave (WRA s.47)',   colour: 'bg-cyan-100    text-cyan-700',    group: 'WRA 2019 Leave' },
  { value: 'MATERNITY_LEAVE', label: 'Maternity Leave (WRA s.48)', colour: 'bg-pink-100    text-pink-700',    group: 'WRA 2019 Leave' },
  { value: 'PATERNITY_LEAVE', label: 'Paternity Leave (WRA s.49)', colour: 'bg-violet-100  text-violet-700',  group: 'WRA 2019 Leave' },
  { value: 'SPECIAL_LEAVE',   label: 'Special Leave',               colour: 'bg-indigo-100  text-indigo-700',  group: 'WRA 2019 Leave' },
  { value: 'PUBLIC_HOLIDAY',  label: 'Public Holiday',              colour: 'bg-slate-100   text-slate-600',   group: 'Other' },
]

export const STATUS_GROUPS = ['Attendance', 'WRA 2019 Leave', 'Other']

/** Heatmap fill colours — one per status. */
export const HEAT = {
  PRESENT:         '#22c55e',
  ABSENT:          '#ef4444',
  LATE:            '#f59e0b',
  HALF_DAY:        '#3b82f6',
  SICK_LEAVE:      '#f97316',
  ANNUAL_LEAVE:    '#14b8a6',
  VACATION_LEAVE:  '#06b6d4',
  MATERNITY_LEAVE: '#ec4899',
  PATERNITY_LEAVE: '#a855f7',
  SPECIAL_LEAVE:   '#6366f1',
  PUBLIC_HOLIDAY:  '#94a3b8',
  WEEKEND:         '#e2e8f0',
  NONE:            '#f1f5f9',
  OUT_OF_RANGE:    '#f8fafc',
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a local Date object as YYYY-MM-DD without timezone shift. */
export const toLocalISO = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Parse a YYYY-MM-DD string safely at local noon (avoids UTC day-shift). */
export const parseDate = (iso) => new Date(`${iso}T12:00:00`)

/** Format a YYYY-MM-DD (or ISO datetime) string as a readable date. */
export const fmtDateISO = (iso) => {
  if (!iso) return '—'
  return parseDate(iso.slice(0, 10)).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ── StatusBadge ───────────────────────────────────────────────────────────────
export function StatusBadge({ status }) {
  const opt = STATUS_OPTIONS.find((o) => o.value === status) || STATUS_OPTIONS[0]
  return (
    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${opt.colour}`}>
      {opt.label}
    </span>
  )
}

// ── CalendarHeatmap ───────────────────────────────────────────────────────────
/**
 * Monthly carousel calendar heatmap.
 * Props:
 *   records   — array of attendance record objects from the API
 *   startIso  — YYYY-MM-DD start of the range (optional)
 *   endIso    — YYYY-MM-DD end of the range (optional)
 *   compact   — boolean; smaller cells for embedding in detail pages (default false)
 */
export function CalendarHeatmap({ records, startIso, endIso, compact = false }) {
  // Cell size: normal = 44 px, compact = 32 px
  const CELL = compact ? 32 : 44
  const GAP  = compact ? 4  : 5

  const [monthIdx, setMonthIdx] = useState(0)

  // ── Date → status lookup ─────────────────────────────────────────────────
  const statusMap = useMemo(() => {
    const m = {}
    records.forEach((r) => {
      const d = r.record_date?.slice(0, 10)
      if (d) m[d] = r.status
    })
    return m
  }, [records])

  // ── Resolve display range ────────────────────────────────────────────────
  const rangeStartISO = useMemo(() => {
    if (startIso) return startIso
    const dates = records.map((r) => r.record_date?.slice(0, 10)).filter(Boolean).sort()
    return dates[0] || toLocalISO(new Date())
  }, [startIso, records])

  const rangeEndISO = useMemo(() => {
    if (endIso) return endIso
    const dates = records.map((r) => r.record_date?.slice(0, 10)).filter(Boolean).sort()
    return dates[dates.length - 1] || toLocalISO(new Date())
  }, [endIso, records])

  // ── Build array of months in the range ──────────────────────────────────
  const months = useMemo(() => {
    const start = parseDate(rangeStartISO)
    const end   = parseDate(rangeEndISO)
    const list  = []
    const cur   = new Date(start.getFullYear(), start.getMonth(), 1)
    const last  = new Date(end.getFullYear(), end.getMonth(), 1)
    while (cur <= last) {
      list.push({ year: cur.getFullYear(), month: cur.getMonth() })
      cur.setMonth(cur.getMonth() + 1)
    }
    return list
  }, [rangeStartISO, rangeEndISO])

  // Clamp monthIdx to valid range
  const safeIdx  = Math.min(Math.max(monthIdx, 0), months.length - 1)
  const curMonth = months[safeIdx] || { year: new Date().getFullYear(), month: new Date().getMonth() }

  // ── Build week rows for the current month ────────────────────────────────
  // Standard calendar layout: rows = weeks, columns = Mon–Sun
  const weeks = useMemo(() => {
    const { year, month } = curMonth
    const firstDay = new Date(year, month, 1)
    const lastDay  = new Date(year, month + 1, 0)

    // Rewind to Monday of the week containing the 1st
    const grid = new Date(firstDay)
    const dow  = grid.getDay()
    grid.setDate(grid.getDate() - (dow === 0 ? 6 : dow - 1))

    // Advance to Sunday of the week containing the last day
    const gridEnd = new Date(lastDay)
    const dowEnd  = gridEnd.getDay()
    if (dowEnd !== 0) gridEnd.setDate(gridEnd.getDate() + (7 - dowEnd))

    const ws = []
    while (grid <= gridEnd) {
      const week = []
      for (let d = 0; d < 7; d++) {
        week.push(new Date(grid))
        grid.setDate(grid.getDate() + 1)
      }
      ws.push(week)
    }
    return ws
  }, [curMonth])

  // ── Month stats ──────────────────────────────────────────────────────────
  const monthStats = useMemo(() => {
    const { year, month } = curMonth
    const mr = records.filter((r) => {
      const d = r.record_date?.slice(0, 10)
      if (!d) return false
      const dt = parseDate(d)
      return dt.getFullYear() === year && dt.getMonth() === month
    })
    return {
      present:  mr.filter((r) => r.status === 'PRESENT').length,
      absent:   mr.filter((r) => r.status === 'ABSENT').length,
      late:     mr.filter((r) => r.status === 'LATE').length,
      halfDay:  mr.filter((r) => r.status === 'HALF_DAY').length,
      leave:    mr.filter((r) => ['SICK_LEAVE','ANNUAL_LEAVE','VACATION_LEAVE',
                                   'MATERNITY_LEAVE','PATERNITY_LEAVE','SPECIAL_LEAVE'].includes(r.status)).length,
      holiday:  mr.filter((r) => r.status === 'PUBLIC_HOLIDAY').length,
      total:    mr.length,
    }
  }, [records, curMonth])

  // ── Colour + tooltip helpers ─────────────────────────────────────────────
  const getColor = (date) => {
    const iso = toLocalISO(date)
    if (iso < rangeStartISO || iso > rangeEndISO) return HEAT.OUT_OF_RANGE
    const status = statusMap[iso]
    if (status) return HEAT[status] || HEAT.NONE
    const dow = date.getDay()
    return (dow === 0 || dow === 6) ? HEAT.WEEKEND : HEAT.NONE
  }

  const getTooltip = (date) => {
    const iso = toLocalISO(date)
    if (iso < rangeStartISO || iso > rangeEndISO) return 'Outside probation window'
    const status = statusMap[iso]
    const label  = status
      ? (STATUS_OPTIONS.find((o) => o.value === status)?.label || status)
      : 'No record yet'
    return `${date.toLocaleDateString('en-GB', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    })}: ${label}`
  }

  const monthLabel = new Date(curMonth.year, curMonth.month, 1)
    .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const totalWidth = 7 * CELL + 6 * GAP   // exact width of the 7-column grid
  const fontSize   = compact ? 10 : 12
  const dateFont   = compact ? 10 : 13

  return (
    <div className={`rounded-xl bg-white shadow-sm ring-1 ring-slate-200 ${compact ? 'p-4' : 'p-5'}`}>

      {/* ── Top bar: title + legend ─────────────────────────────────────── */}
      <div className={`flex flex-wrap items-center justify-between gap-3 ${compact ? 'mb-3' : 'mb-4'}`}>
        <h2 className={`flex items-center gap-2 font-semibold text-slate-800 ${compact ? 'text-sm' : ''}`}>
          <LayoutGrid className={`text-slate-400 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
          Attendance Heatmap
          <span className="text-xs font-normal text-slate-400">
            {records.length} record{records.length !== 1 ? 's' : ''}
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
          {[
            { color: HEAT.PRESENT,       label: 'Present'   },
            { color: HEAT.ABSENT,        label: 'Absent'    },
            { color: HEAT.LATE,          label: 'Late'      },
            { color: HEAT.HALF_DAY,      label: 'Half Day'  },
            { color: HEAT.ANNUAL_LEAVE,  label: 'Leave'     },
            { color: HEAT.PUBLIC_HOLIDAY,label: 'Holiday'   },
            { color: HEAT.WEEKEND,       label: 'Weekend'   },
            { color: HEAT.NONE,          label: 'No record' },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1">
              <span className="inline-block rounded-sm border border-slate-200/80"
                    style={{ width: 10, height: 10, backgroundColor: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Month navigation ────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between mb-3"
        style={{ maxWidth: totalWidth + 60 }}  /* align roughly to calendar width */
      >
        <button
          onClick={() => setMonthIdx((i) => i - 1)}
          disabled={safeIdx === 0}
          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        <div className="text-center">
          <span className={`font-semibold text-slate-800 ${compact ? 'text-sm' : 'text-base'}`}>
            {monthLabel}
          </span>
          {months.length > 1 && (
            <span className="ml-2 text-xs text-slate-400">
              {safeIdx + 1} / {months.length}
            </span>
          )}
        </div>

        <button
          onClick={() => setMonthIdx((i) => i + 1)}
          disabled={safeIdx === months.length - 1}
          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          title="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* ── Calendar grid ───────────────────────────────────────────────── */}
      <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', gap: GAP }}>

          {/* Day-of-week header row */}
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${CELL}px)`, gap: GAP }}>
            {DAY_LABELS.map((label) => (
              <div
                key={label}
                style={{
                  height:     CELL * 0.6,
                  display:    'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize:   fontSize,
                  fontWeight: 600,
                  color:      label === 'Sat' || label === 'Sun' ? '#94a3b8' : '#475569',
                  letterSpacing: '0.03em',
                }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Week rows */}
          {weeks.map((week, wi) => (
            <div key={wi} style={{ display: 'grid', gridTemplateColumns: `repeat(7, ${CELL}px)`, gap: GAP }}>
              {week.map((date, di) => {
                const iso       = toLocalISO(date)
                const inRange   = iso >= rangeStartISO && iso <= rangeEndISO
                const inMonth   = date.getMonth() === curMonth.month
                const color     = getColor(date)
                const isWeekend = date.getDay() === 0 || date.getDay() === 6
                // Choose text colour based on background darkness
                const darkBg    = ['#ef4444','#f59e0b','#3b82f6','#22c55e','#f97316',
                                    '#14b8a6','#06b6d4','#ec4899','#a855f7','#6366f1'].includes(color)
                const textColor = !inRange || !inMonth
                  ? 'rgba(0,0,0,0.2)'
                  : darkBg
                    ? 'rgba(255,255,255,0.9)'
                    : '#475569'

                return (
                  <div
                    key={di}
                    title={inMonth ? getTooltip(date) : undefined}
                    style={{
                      width:           CELL,
                      height:          CELL,
                      backgroundColor: inMonth ? color : (isWeekend ? '#f8fafc' : '#fafafa'),
                      borderRadius:    compact ? 5 : 7,
                      border:          `1px solid ${inMonth && inRange ? 'rgba(0,0,0,0.07)' : 'rgba(0,0,0,0.04)'}`,
                      opacity:         inRange ? 1 : 0.4,
                      display:         'flex',
                      alignItems:      'center',
                      justifyContent:  'center',
                      fontSize:        dateFont,
                      fontWeight:      inMonth && inRange && color !== HEAT.NONE && color !== HEAT.WEEKEND ? 600 : 400,
                      color:           textColor,
                      cursor:          inMonth && inRange ? 'default' : 'default',
                      transition:      'transform 0.08s, box-shadow 0.08s',
                      userSelect:      'none',
                    }}
                    onMouseEnter={(e) => {
                      if (inMonth && inRange) {
                        e.currentTarget.style.transform  = 'scale(1.1)'
                        e.currentTarget.style.boxShadow  = '0 2px 8px rgba(0,0,0,0.12)'
                        e.currentTarget.style.zIndex     = '10'
                        e.currentTarget.style.position   = 'relative'
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)'
                      e.currentTarget.style.boxShadow = 'none'
                    }}
                  >
                    {inMonth ? date.getDate() : ''}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── Monthly stats strip ─────────────────────────────────────────── */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3">
        {[
          { value: monthStats.present, label: 'present',  color: 'text-emerald-600' },
          { value: monthStats.absent,  label: 'absent',   color: 'text-red-500'     },
          { value: monthStats.late,    label: 'late',     color: 'text-amber-500'   },
          { value: monthStats.halfDay, label: 'half day', color: 'text-blue-500'    },
          { value: monthStats.leave,   label: 'leave',    color: 'text-orange-500'  },
          { value: monthStats.holiday, label: 'holiday',  color: 'text-slate-400'   },
        ].map(({ value, label, color }) => (
          <span key={label} className="text-xs text-slate-500">
            <span className={`font-bold ${color}`}>{value}</span> {label}
          </span>
        ))}
        {monthStats.total === 0 && (
          <span className="text-xs text-slate-400 italic">No records this month</span>
        )}

        {/* Month navigation dots */}
        {months.length > 1 && (
          <div className="ml-auto flex items-center gap-1.5">
            {months.map((_, i) => (
              <button
                key={i}
                onClick={() => setMonthIdx(i)}
                style={{
                  width:           i === safeIdx ? 20 : 7,
                  height:          7,
                  borderRadius:    4,
                  backgroundColor: i === safeIdx ? '#1e3a5f' : '#cbd5e1',
                  border:          'none',
                  cursor:          'pointer',
                  transition:      'width 0.2s, background-color 0.2s',
                  padding:         0,
                }}
                title={new Date(months[i].year, months[i].month, 1)
                  .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── ExceptionsTable ───────────────────────────────────────────────────────────
/**
 * Shows only non-PRESENT attendance records sorted by date descending.
 * Props:
 *   records  — full records array
 *   compact  — boolean; reduces padding (default false)
 */
export function ExceptionsTable({ records, compact = false }) {
  const exceptions = useMemo(
    () =>
      records
        .filter((r) => r.status !== 'PRESENT')
        .slice()
        .sort((a, b) => (b.record_date > a.record_date ? 1 : -1)),
    [records]
  )

  const pad = compact ? 'px-4 py-2' : 'px-6 py-3'

  return (
    <div className="rounded-xl bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 ${compact ? 'px-4 py-3' : 'px-6 py-4'}`}>
        <div className="flex items-center gap-2">
          <AlertCircle className={`text-amber-400 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
          <h2 className={`font-semibold text-slate-800 ${compact ? 'text-sm' : ''}`}>
            Exceptions
            {exceptions.length > 0 && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                ({exceptions.length} non-present)
              </span>
            )}
          </h2>
        </div>
        <span className="text-xs text-slate-400">Present days hidden</span>
      </div>

      {exceptions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <CheckCircle2 className="h-6 w-6 text-emerald-400" />
          <p className={`font-medium text-slate-600 ${compact ? 'text-xs' : 'text-sm'}`}>All records show Present</p>
          <p className="text-xs text-slate-400">No absences or leave days on record.</p>
        </div>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wide">
              <th className={`${pad} text-left`}>Date</th>
              <th className={`${pad} text-left`}>Status</th>
              <th className={`${pad} text-left`}>Notes</th>
              <th className={`${pad} text-left`}>Recorded By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {exceptions.map((r) => (
              <tr key={r.record_id} className="hover:bg-slate-50/60 transition-colors">
                <td className={`${pad} font-medium text-slate-700 whitespace-nowrap`}>
                  {fmtDateISO(r.record_date)}
                </td>
                <td className={pad}>
                  <StatusBadge status={r.status} />
                </td>
                <td className={`${pad} text-slate-500 max-w-xs`}>
                  {r.notes || <span className="text-slate-300">—</span>}
                </td>
                <td className={`${pad} text-slate-500 whitespace-nowrap`}>
                  {r.recorder
                    ? `${r.recorder.first_name} ${r.recorder.last_name}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
