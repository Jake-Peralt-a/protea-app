// Shared zod schemas for registration (used on the client for the wizard and
// re-validated on the server in the submit action). BRD FR-04..11.
import { z } from "zod";
import { categoryForDob } from "./age";

// Plausible government-ID format (FR-07, "Should"): 6–20 alphanumerics, allowing
// spaces/hyphens which are stripped during comparison. Deliberately permissive —
// this is a format sanity check, not real-world ID validation.
export const GOV_ID_REGEX = /^[A-Za-z0-9][A-Za-z0-9\s-]{4,18}[A-Za-z0-9]$/;
export const BIRTH_CERT_REGEX = /^[A-Za-z0-9][A-Za-z0-9\s-]{4,18}[A-Za-z0-9]$/;

const isoDate = z
  .string()
  .min(1, "Date of birth is required")
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date")
  .refine((v) => new Date(v) <= new Date(), "Date of birth cannot be in the future");

export const dobSchema = z.object({
  dateOfBirth: isoDate,
});

export const adultSchema = z.object({
  type: z.literal("ADULT"),
  fullName: z.string().trim().min(2, "Full name is required"),
  dateOfBirth: isoDate,
  governmentIdNumber: z
    .string()
    .trim()
    .regex(GOV_ID_REGEX, "Enter a valid government-issued ID number"),
});

export const childSchema = z.object({
  type: z.literal("CHILD"),
  fullName: z.string().trim().min(2, "Child's full name is required"),
  dateOfBirth: isoDate,
  parentGuardianName: z.string().trim().min(2, "Parent/guardian name is required"),
  birthCertNumber: z
    .string()
    .trim()
    .regex(BIRTH_CERT_REGEX, "Enter a valid birth-certificate number"),
});

export const registrationSchema = z.discriminatedUnion("type", [
  adultSchema,
  childSchema,
]);

export type AdultInput = z.infer<typeof adultSchema>;
export type ChildInput = z.infer<typeof childSchema>;
export type RegistrationInput = z.infer<typeof registrationSchema>;

/**
 * Cross-field rule: the chosen path must match the age implied by the date of
 * birth (FR-02 / FR-03, §9). Returns an error message or null.
 */
export function validatePathMatchesAge(input: RegistrationInput): string | null {
  const category = categoryForDob(new Date(input.dateOfBirth));
  if (category !== input.type) {
    return category === "ADULT"
      ? "This date of birth indicates an adult (18+). Please use the adult registration path."
      : "This date of birth indicates a child (under 18). Please use the child registration path.";
  }
  return null;
}

export const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});
