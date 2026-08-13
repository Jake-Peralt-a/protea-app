// The registration state machine (BRD v1.1 §8).
//
// v1.0 of the BRD listed five states but no transition table, so the rules were
// inferred and enforced by ad-hoc status checks scattered through the domain layer
// (gap W-01). This module is the single authoritative statement of which transitions
// are legal. It is intentionally pure — no DB, no `server-only` — so the whole table
// can be unit tested directly.

export type RegistrationStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "INFO_REQUIRED"
  | "APPROVED"
  | "REJECTED"
  | "REVOKED";

/**
 * Maximum number of submission attempts before the registration is locked and only
 * an administrator can permit a further attempt (BRD v1.1 FR-42, gap W-02).
 */
export const MAX_SUBMISSION_ATTEMPTS = 3;

/**
 * The legal transition table. Anything not listed here is illegal by construction —
 * this mirrors the BRD v1.1 §8 table row for row.
 */
const LEGAL_TRANSITIONS: Record<RegistrationStatus, readonly RegistrationStatus[]> = {
  // The registrant completes the wizard and submits.
  DRAFT: ["SUBMITTED"],
  // Automatic, once the duplicate check has run.
  SUBMITTED: ["UNDER_REVIEW"],
  // The three administrator outcomes.
  UNDER_REVIEW: ["APPROVED", "REJECTED", "INFO_REQUIRED"],
  // The registrant amends and resubmits.
  INFO_REQUIRED: ["SUBMITTED"],
  // An approval can be revoked, but never re-approved in this release.
  APPROVED: ["REVOKED"],
  // A rejected registrant may try again, within the attempt cap.
  REJECTED: ["SUBMITTED"],
  // Terminal. A revoked registrant must be handled as a new case.
  REVOKED: [],
};

/** States from which no transition is possible. */
export const TERMINAL_STATUSES: readonly RegistrationStatus[] = ["REVOKED"];

/**
 * States that participate in duplicate matching (BRD v1.1 FR-33, gap D-05).
 *
 * REJECTED is deliberately excluded: rejections are frequently corrective (an
 * unreadable document, a typo), and matching against them would permanently lock a
 * legitimate person out of the ID number that is genuinely theirs. REVOKED *is*
 * included, because revocation is a deliberate withdrawal of a granted approval and
 * should not be escapable by simply registering again.
 */
export const DUPLICATE_MATCHING_STATUSES: readonly RegistrationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "INFO_REQUIRED",
  "APPROVED",
  "REVOKED",
];

/** States a registrant may resubmit from (BRD v1.1 FR-39). */
export const RESUBMITTABLE_STATUSES: readonly RegistrationStatus[] = [
  "DRAFT",
  "INFO_REQUIRED",
  "REJECTED",
];

/** States that appear in the administrator's pending queue (FR-20). */
export const PENDING_REVIEW_STATUSES: readonly RegistrationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
];

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: RegistrationStatus,
    readonly to: RegistrationStatus,
    message?: string,
  ) {
    super(message ?? `Cannot move a registration from ${from} to ${to}.`);
    this.name = "IllegalTransitionError";
  }
}

export function canTransition(
  from: RegistrationStatus,
  to: RegistrationStatus,
): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

/** Throw unless `from → to` is a legal transition. */
export function assertTransition(
  from: RegistrationStatus,
  to: RegistrationStatus,
): void {
  if (!canTransition(from, to)) {
    throw new IllegalTransitionError(from, to);
  }
}

export function isTerminal(status: RegistrationStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** The full set of transitions leaving a state — used to drive admin UI affordances. */
export function allowedNextStatuses(
  from: RegistrationStatus,
): readonly RegistrationStatus[] {
  return LEGAL_TRANSITIONS[from];
}
