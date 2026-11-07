// =============================================================================
// src/middleware/validateNIC.js
// Mauritian National Identity Card (NIC / NID) format validator.
//
// Spec s.1.1 update:
//   - Format rule changed to ^[A-Za-z][0-9]{13}$ — any letter prefix, not
//     limited to the first letter of last_name. The spec confirms that NIC and
//     NID refer to the same 14-character string; the leading letter encodes
//     the surname initial at birth but we do NOT enforce surname matching at
//     runtime (the official encoding rules have not been independently
//     verified against an authoritative specification).
//   - Optional DOB cross-check: when req.body.date_of_birth is also present,
//     the validator checks whether the DDMMYY encoded in NIC positions 1-6
//     is consistent with the supplied date. Only rejects on a *confirmed*
//     mismatch — if the century is ambiguous (1900 vs 2000) the check passes.
//   - Employees without a Mauritian NIC may supply an alternative identity
//     type. When req.body.identity_type !== 'NIC' (or is absent), the strict
//     14-char NIC structural check is skipped; req.body.nic_number is still
//     stored as an opaque identifier.
//   - nic_number is treated as a business-sensitive field. It must NOT appear
//     in routine log output or public-facing API responses (DPA 2017 s.4(d)).
//
// Usage — inject into any route that accepts nic_number in the body:
//   const validateNIC = require('../middleware/validateNIC');
//   router.post('/profile', authenticate, authorize('HR_ADMIN'), validateNIC, createEmployee);
//
// The middleware is a no-op if nic_number is absent from the body, so it is
// safe to mount on update routes where NIC may not be re-submitted.
//
// NFR-02 | FR-04 (extended) | Spec s.1.1
// =============================================================================

/**
 * validateMauritianNIC
 *
 * Validates that req.body.nic_number, when present, conforms to the
 * 14-character Mauritian NIC structural format:
 *   [Any letter A-Za-z][exactly 13 numeric digits]
 *
 * Optional: when req.body.date_of_birth is also present, performs a
 * consistency check between the DDMMYY embedded in the NIC and the DOB.
 *
 * Returns 400 with a descriptive message on structural failure.
 * Returns 400 on a *confirmed* DOB mismatch (century-ambiguous cases pass).
 * Calls next() on success or when nic_number is not present.
 */
const validateMauritianNIC = (req, res, next) => {
  const { nic_number, date_of_birth, identity_type } = req.body;

  // Skip all NIC checks if no NIC is being submitted (optional field)
  if (!nic_number) return next();

  // If the employee has a non-Mauritian identity document, skip the strict
  // structural check — store the value as an opaque alternative identifier.
  if (identity_type && identity_type !== 'NIC' && identity_type !== 'NID') {
    return next();
  }

  // ── Structural format check ───────────────────────────────────────────────
  // Format: one letter (any case) followed by exactly 13 digits — 14 chars.
  const nicRegex = /^[A-Za-z][0-9]{13}$/;
  if (!nicRegex.test(nic_number)) {
    return res.status(400).json({
      success: false,
      message:
        'Invalid NIC format. A Mauritian NIC must be exactly 14 characters: ' +
        'one letter followed by 13 digits (e.g. A1234567890123).',
    });
  }

  // ── Optional DOB cross-check ──────────────────────────────────────────────
  // Characters 1-6 of the NIC (after the leading letter) encode DDMMYY.
  // We only reject on a *confirmed* mismatch. If the century is ambiguous
  // (the YY could map to either 19xx or 20xx) we accept both and pass.
  //
  // IMPORTANT: This check implements a plausible encoding convention.
  // Verify against authoritative NIC specifications before enabling strict
  // enforcement in production.
  if (date_of_birth) {
    try {
      const digits = nic_number.slice(1); // remove leading letter
      const dd = parseInt(digits.slice(0, 2), 10);
      const mm = parseInt(digits.slice(2, 4), 10);
      const yy = parseInt(digits.slice(4, 6), 10);

      const dobDate = new Date(date_of_birth);
      if (!Number.isNaN(dobDate.getTime())) {
        const dobDay   = dobDate.getDate();
        const dobMonth = dobDate.getMonth() + 1; // 1-based
        const dobYear  = dobDate.getFullYear();
        const dobYY    = dobYear % 100; // last two digits of year

        // Only reject when both day and month definitely mismatch — a century
        // ambiguity in year alone is not treated as a confirmed mismatch.
        const dayMatch   = dd === dobDay;
        const monthMatch = mm === dobMonth;
        const yearMatch  = yy === dobYY;

        if (dayMatch && monthMatch && !yearMatch) {
          // Day and month match but year differs — century may explain it.
          // Allow this case (century ambiguity rule).
          return next();
        }

        if (!dayMatch || !monthMatch) {
          return res.status(400).json({
            success: false,
            message:
              'NIC date-of-birth encoding does not match the supplied date_of_birth. ' +
              'Please verify the NIC number and date of birth.',
          });
        }
      }
    } catch (_) {
      // If DOB parsing fails for any reason, do not block — the structural
      // check already passed. Controller-level validation handles DOB format.
    }
  }

  next();
};

module.exports = validateMauritianNIC;
