// Age determination for adult/child routing (BRD FR-02, §9).
// Pure functions — no I/O — so they are straightforward to unit test.

export const ADULT_AGE = 18;

/** Whole years between `dob` and `asOf` (defaults to now). */
export function ageInYears(dob: Date, asOf: Date = new Date()): number {
  let age = asOf.getFullYear() - dob.getFullYear();
  const monthDiff = asOf.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

/** A registrant aged 18 or older at registration time is an adult (§9). */
export function isAdult(dob: Date, asOf: Date = new Date()): boolean {
  return ageInYears(dob, asOf) >= ADULT_AGE;
}

export type RegistrationCategory = "ADULT" | "CHILD";

export function categoryForDob(
  dob: Date,
  asOf: Date = new Date(),
): RegistrationCategory {
  return isAdult(dob, asOf) ? "ADULT" : "CHILD";
}

/**
 * True when a registration was made on the child path but its subject has since
 * reached adulthood (BRD v1.1 FR-48, gap W-05).
 *
 * A child is verified on a birth certificate plus a parent/guardian name. That basis
 * has no natural expiry, so without this check an 18-year-old keeps an identity
 * assertion — and a guardian relationship — that no longer applies. Evaluated on read
 * rather than by a scheduled job, so it is always correct as of the current request.
 */
export function needsAdultReverification(
  registration: { type: RegistrationCategory; dateOfBirth: Date },
  asOf: Date = new Date(),
): boolean {
  return registration.type === "CHILD" && isAdult(registration.dateOfBirth, asOf);
}
