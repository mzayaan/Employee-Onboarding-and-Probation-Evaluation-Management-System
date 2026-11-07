// =============================================================================
// src/utils/ageCalculator.js
// Chronologically precise age calculation utility.
//
// Spec s.3.5: Calculate completed years by comparing current month/day with
// birth month/day in a consistent business timezone (Mauritius = UTC+4).
// Handle 29 February birthdays by treating the age milestone as 1 March in
// non-leap years.
//
// IMPORTANT: Age must NOT be stored permanently. Call this function at request
// time and return the computed value in the response — never persist it.
// date_of_birth is a DPA 2017-sensitive field (s.4(d)).
//
// Spec s.3.5 | NFR-08
// =============================================================================

const MAURITIUS_TZ_OFFSET_MS = 4 * 60 * 60 * 1000; // UTC+4

/**
 * calculateAgeInYears
 *
 * Calculates the number of complete years between date_of_birth and today
 * (or a supplied reference date) using Mauritius timezone (UTC+4).
 *
 * Policy for 29 February birthdays:
 *   In non-leap years, the birthday is treated as 1 March.
 *   This means the age milestone occurs on 1 March in non-leap years.
 *
 * @param {string|Date} dateOfBirth  ISO 8601 date string or Date object
 * @param {Date}        [referenceDate]  Optional; defaults to now (UTC+4)
 * @returns {{ age: number, birthdayThisYear: Date, turnedAgeOn: Date }}
 *   age: completed whole years (integer >= 0)
 *   birthdayThisYear: the Date on which the person's birthday falls this year
 *   turnedAgeOn: the Date on which they last completed a year
 * @throws {Error} if dateOfBirth is invalid
 */
function calculateAgeInYears(dateOfBirth, referenceDate = null) {
  // ── Normalise inputs to Mauritius midnight ───────────────────────────────
  const dobDate = _toMauritiusDate(dateOfBirth);
  const today   = referenceDate ? _toMauritiusDate(referenceDate) : _todayMauritius();

  if (Number.isNaN(dobDate.getTime())) {
    throw new Error('Invalid date_of_birth supplied to ageCalculator.');
  }
  if (dobDate > today) {
    throw new Error('date_of_birth cannot be in the future.');
  }

  const dobYear  = dobDate.getFullYear();
  const dobMonth = dobDate.getMonth(); // 0-based
  const dobDay   = dobDate.getDate();

  const todayYear  = today.getFullYear();
  const todayMonth = today.getMonth();
  const todayDay   = today.getDate();

  // ── Resolve 29-Feb birthday in the target year ───────────────────────────
  const { month: birthMonthThisYear, day: birthDayThisYear } =
    _resolveBirthday(dobMonth, dobDay, todayYear);

  // ── Did the birthday already occur this calendar year? ───────────────────
  const birthdayOccurredThisYear =
    todayMonth > birthMonthThisYear ||
    (todayMonth === birthMonthThisYear && todayDay >= birthDayThisYear);

  const completedAge = birthdayOccurredThisYear
    ? todayYear - dobYear
    : todayYear - dobYear - 1;

  // ── Build the Date object for "birthday this year" ───────────────────────
  const birthdayThisYear = new Date(
    Date.UTC(todayYear, birthMonthThisYear, birthDayThisYear),
  );

  // ── Build the Date object for "last completed year" ──────────────────────
  const lastBirthdayYear = birthdayOccurredThisYear
    ? todayYear
    : todayYear - 1;
  const { month: lastBdMonth, day: lastBdDay } =
    _resolveBirthday(dobMonth, dobDay, lastBirthdayYear);
  const turnedAgeOn = new Date(
    Date.UTC(lastBirthdayYear, lastBdMonth, lastBdDay),
  );

  return {
    age:               completedAge,
    birthdayThisYear,
    turnedAgeOn,
  };
}

/**
 * _resolveBirthday(month0, day, targetYear)
 * Returns the { month, day } for a birthday in targetYear.
 * For 29 Feb birthdays in non-leap years, returns 1 March (month=2, day=1).
 */
function _resolveBirthday(month0, day, targetYear) {
  if (month0 === 1 && day === 29 && !_isLeapYear(targetYear)) {
    return { month: 2, day: 1 }; // 1 March (0-based: month 2)
  }
  return { month: month0, day };
}

/**
 * _isLeapYear(year)
 */
function _isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * _todayMauritius()
 * Returns a Date representing today at midnight UTC+4.
 */
function _todayMauritius() {
  const nowUtc = Date.now() + MAURITIUS_TZ_OFFSET_MS;
  const d      = new Date(nowUtc);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/**
 * _toMauritiusDate(value)
 * Coerces a string "YYYY-MM-DD" or a Date to a midnight-UTC Date
 * interpreted in the Mauritius timezone.
 */
function _toMauritiusDate(value) {
  if (value instanceof Date) {
    const utc4 = new Date(value.getTime() + MAURITIUS_TZ_OFFSET_MS);
    return new Date(
      Date.UTC(utc4.getUTCFullYear(), utc4.getUTCMonth(), utc4.getUTCDate()),
    );
  }
  if (typeof value === 'string') {
    // Accept "YYYY-MM-DD" directly — no timezone shift needed for date-only strings
    const parts = value.split('-');
    if (parts.length === 3) {
      return new Date(
        Date.UTC(
          parseInt(parts[0], 10),
          parseInt(parts[1], 10) - 1,
          parseInt(parts[2], 10),
        ),
      );
    }
  }
  return new Date(value);
}

module.exports = { calculateAgeInYears };
