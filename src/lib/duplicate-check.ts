// Deterministic duplicate detection (BRD FR-15..19, extended by CR-REG-002).
//
// This module is intentionally pure (no DB, no server-only imports) so the matching
// rules can be unit tested in isolation. The database-backed lookup that feeds these
// functions lives in src/lib/registrations.ts.
//
// CR-REG-002 changes two things:
//   - adds the NAME_DOB basis, which matches ACROSS age categories so a child who
//     re-registers as an adult after turning 18 is detected (gap W-06);
//   - stops returning a registrant-facing reason. Telling a registrant that their
//     ID number matches an existing record confirms that record exists, which is the
//     enumeration leak in gap C-02. The reason below is administrator-facing only.

export type MatchBasis = "ADULT_ID" | "CHILD_CERT_GUARDIAN" | "NAME_DOB";

// The minimal shape needed to compare two registrations for duplication.
export interface MatchableRegistration {
  id: string;
  type: "ADULT" | "CHILD";
  fullName: string;
  dateOfBirth: Date | string;
  governmentIdNumber?: string | null;
  birthCertNumber?: string | null;
  parentGuardianName?: string | null;
}

export interface DuplicateMatch {
  matchedRegistrationId: string;
  basis: MatchBasis;
  /**
   * Administrator-facing explanation, stored on the duplicate flag. It is never
   * shown to the registrant (FR-18 as amended, FR-31).
   */
  adminReason: string;
}

/** Normalise an ID / certificate number: uppercase, strip non-alphanumerics. */
export function normalizeIdNumber(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Normalise a person's name: lowercase, collapse internal whitespace, trim. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Normalise a date of birth to a YYYY-MM-DD calendar day for exact comparison. */
export function normalizeDob(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

const ADULT_REASON =
  "Matched an existing registration on government-issued ID number.";
const CHILD_REASON =
  "Matched an existing registration on birth-certificate number and parent/guardian name.";
const NAME_DOB_REASON =
  "Matched an existing registration on full name and date of birth, across age " +
  "categories. Check whether this is the same person registering a second time.";

/** Adult duplicate basis: matching government-issued ID number (FR-16). */
export function isAdultDuplicate(
  candidate: MatchableRegistration,
  existing: MatchableRegistration,
): boolean {
  if (candidate.type !== "ADULT" || existing.type !== "ADULT") return false;
  const a = normalizeIdNumber(candidate.governmentIdNumber);
  const b = normalizeIdNumber(existing.governmentIdNumber);
  return a.length > 0 && a === b;
}

/** Child duplicate basis: birth-certificate details + guardian name (FR-17). */
export function isChildDuplicate(
  candidate: MatchableRegistration,
  existing: MatchableRegistration,
): boolean {
  if (candidate.type !== "CHILD" || existing.type !== "CHILD") return false;
  const certA = normalizeIdNumber(candidate.birthCertNumber);
  const certB = normalizeIdNumber(existing.birthCertNumber);
  const guardianA = normalizeName(candidate.parentGuardianName);
  const guardianB = normalizeName(existing.parentGuardianName);
  return (
    certA.length > 0 &&
    certA === certB &&
    guardianA.length > 0 &&
    guardianA === guardianB
  );
}

/**
 * Secondary basis: identical full name AND identical date of birth (BRD v1.1 FR-32).
 *
 * Unlike the two primary bases this deliberately ignores registration type, so an
 * adult registration is compared against child records and vice versa. Requiring an
 * exact date-of-birth match as well as the name keeps the false-positive rate low —
 * two unrelated people sharing a name will almost never share a birth date — and any
 * match is routed to an administrator rather than blocking, so a false positive costs
 * a review rather than a lockout (FR-19).
 */
export function isCrossCategoryDuplicate(
  candidate: MatchableRegistration,
  existing: MatchableRegistration,
): boolean {
  const nameA = normalizeName(candidate.fullName);
  const nameB = normalizeName(existing.fullName);
  const dobA = normalizeDob(candidate.dateOfBirth);
  const dobB = normalizeDob(existing.dateOfBirth);
  return nameA.length > 0 && nameA === nameB && dobA.length > 0 && dobA === dobB;
}

/**
 * Return the first existing record that the candidate duplicates, or null.
 * The candidate itself is skipped by id so re-checking a saved registration
 * never matches itself.
 *
 * The primary bases are tried first across all records, so an exact ID match is
 * always preferred over the weaker name+date-of-birth signal when both apply.
 */
export function findDuplicate(
  candidate: MatchableRegistration,
  existing: MatchableRegistration[],
): DuplicateMatch | null {
  const others = existing.filter((record) => record.id !== candidate.id);

  for (const record of others) {
    if (isAdultDuplicate(candidate, record)) {
      return {
        matchedRegistrationId: record.id,
        basis: "ADULT_ID",
        adminReason: ADULT_REASON,
      };
    }
    if (isChildDuplicate(candidate, record)) {
      return {
        matchedRegistrationId: record.id,
        basis: "CHILD_CERT_GUARDIAN",
        adminReason: CHILD_REASON,
      };
    }
  }

  for (const record of others) {
    if (isCrossCategoryDuplicate(candidate, record)) {
      return {
        matchedRegistrationId: record.id,
        basis: "NAME_DOB",
        adminReason: NAME_DOB_REASON,
      };
    }
  }

  return null;
}
