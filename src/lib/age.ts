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
