// Presentation + access mapping for the BRD §8 workflow states.
export type RegistrationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "REJECTED";

interface StatusMeta {
  label: string;
  description: string;
  accessGranted: boolean;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
}

export const STATUS_META: Record<RegistrationStatus, StatusMeta> = {
  DRAFT: {
    label: "Draft / In progress",
    description: "You are completing the registration steps.",
    accessGranted: false,
    tone: "neutral",
  },
  SUBMITTED: {
    label: "Submitted",
    description: "Your registration and documents have been submitted.",
    accessGranted: false,
    tone: "info",
  },
  UNDER_REVIEW: {
    label: "Under review",
    description: "An administrator is reviewing your registration.",
    accessGranted: false,
    tone: "warning",
  },
  APPROVED: {
    label: "Approved",
    description: "Your registration has been approved. You have access.",
    accessGranted: true,
    tone: "success",
  },
  REJECTED: {
    label: "Rejected",
    description: "Your registration was not approved.",
    accessGranted: false,
    tone: "danger",
  },
};
