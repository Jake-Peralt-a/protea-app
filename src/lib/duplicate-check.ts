// Deterministic duplicate detection (BRD FR-15..19).
//
// This module is intentionally pure (no DB, no server-only imports) so the matching
// rules can be unit tested in isolation. The database-backed lookup that feeds these
// functions lives in src/lib/registrations.ts.

export type MatchBasis = "ADULT_ID" | "CHILD_CERT_GUARDIAN";

// The minimal shape needed to compare two registrations for duplication.
export interface MatchableRegistration {
  id: string;
  type: "ADULT" | "CHILD";
  governmentIdNumber?: string | null;
  birthCertNumber?: string | null;
  parentGuardianName?: string | null;
}

export interface DuplicateMatch {
  matchedRegistrationId: string;
  basis: MatchBasis;
  // Generic, privacy-safe explanation shown to the registrant (FR-18 / FR-31).
  // It never contains any data belonging to the matched record.
  reason: string;
}

/** Normalise an ID / certificate number: uppercase, strip non-alphanumerics. */
export function normalizeIdNumber(value: string | null | undefined): string {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Normalise a person's name: lowercase, collapse internal whitespace, trim. */
export function normalizeName(value: string | null | undefined): string {
  return (value ?? "").toLowerCase().replace(/\s+/g, " ").trim();
}

const ADULT_DUPLICATE_REASON =
  "A registration with the same government-issued ID number already exists. " +
  "Your registration has been sent to an administrator to review this potential duplicate.";

const CHILD_DUPLICATE_REASON =
  "A registration with the same birth-certificate details and parent/guardian name " +
  "already exists. Your registration has been sent to an administrator to review this " +
  "potential duplicate.";

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
 * Return the first existing record that the candidate duplicates, or null.
 * The candidate itself is skipped by id so re-checking a saved registration
 * never matches itself.
 */
export function findDuplicate(
  candidate: MatchableRegistration,
  existing: MatchableRegistration[],
): DuplicateMatch | null {
  for (const record of existing) {
    if (record.id === candidate.id) continue;
    if (isAdultDuplicate(candidate, record)) {
      return {
        matchedRegistrationId: record.id,
        basis: "ADULT_ID",
        reason: ADULT_DUPLICATE_REASON,
      };
    }
    if (isChildDuplicate(candidate, record)) {
      return {
        matchedRegistrationId: record.id,
        basis: "CHILD_CERT_GUARDIAN",
        reason: CHILD_DUPLICATE_REASON,
      };
    }
  }
  return null;
}
