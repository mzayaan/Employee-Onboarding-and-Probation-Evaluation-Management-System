// =============================================================================
// src/middleware/validateNIC.js
// Mauritian National Identity Card (NIC) format validator.
//
// Mauritius NIC format: first letter of surname + 13 digits (14 chars total).
// Example: if last_name = "Ramkhelawon", valid NIC starts with 'R' + 13 digits.
//
// Usage — inject into any route that accepts nic_number in the body:
//   const validateNIC = require('../middleware/validateNIC');
//   router.post('/profile', authenticate, authorize('HR_ADMIN'), validateNIC, createEmployee);
//
// The middleware is a no-op if nic_number is absent from the body, so it is
// safe to mount on update routes where NIC may not be re-submitted.
//
// NFR-02 | FR-04 (extended)
// =============================================================================

/**
 * validateMauritianNIC
 *
 * Validates that req.body.nic_number (when present) conforms to the
 * 14-character Mauritian NIC structural format:
 *   [First letter of last_name (case-insensitive)][13 numeric digits]
 *
 * Returns 400 with a descriptive message on failure.
 * Calls next() on success or when nic_number is not present.
 */
const validateMauritianNIC = (req, res, next) => {
  const { nic_number, last_name } = req.body;

  // Skip validation if no NIC is being submitted (optional field)
  if (!nic_number) return next();

  // last_name is required to derive the expected first character
  if (!last_name || last_name.trim().length === 0) {
    return res.status(400).json({
      success: false,
      message: 'last_name is required to validate NIC format.',
    });
  }

  const firstLetter = last_name.trim().charAt(0).toUpperCase();
  const nicRegex = new RegExp(`^[${firstLetter}][0-9]{13}$`);

  if (!nicRegex.test(nic_number.toUpperCase())) {
    return res.status(400).json({
      success: false,
      message: `Invalid NIC format. Must start with '${firstLetter}' followed by exactly 13 digits (14 characters total).`,
    });
  }

  next();
};

module.exports = validateMauritianNIC;
