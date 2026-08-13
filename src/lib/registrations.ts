import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { recordAudit } from "./audit";
import { notifyRegistrant } from "./notify";
import { findDuplicate, type MatchableRegistration } from "./duplicate-check";
import {
  canTransition,
  DUPLICATE_MATCHING_STATUSES,
  MAX_SUBMISSION_ATTEMPTS,
  type RegistrationStatus,
} from "./transitions";
import type { RegistrationInput } from "./validation";

// Server-side domain logic for the registration workflow (BRD §7, extended by
// CR-REG-002). Kept separate from the thin server actions so the transactional rules
// live in one place. Every state change goes through the transition table in
// ./transitions — this module never decides for itself what is legal.

export class RegistrationConflictError extends Error {}

export interface SubmissionDocument {
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface SubmissionResult {
  registrationId: string;
  attemptNumber: number;
  /**
   * Whether a potential duplicate was flagged for administrator attention. This is
   * for internal use and testing — it is deliberately NOT surfaced to the registrant,
   * because confirming a match discloses that the matched record exists (FR-18 as
   * amended by CR-REG-002, FR-31).
   */
  duplicate: boolean;
}

/** Human-readable refusal for an illegal transition, surfaced in the UI. */
function requireTransition(
  from: RegistrationStatus,
  to: RegistrationStatus,
  message: string,
): void {
  if (!canTransition(from, to)) {
    throw new RegistrationConflictError(message);
  }
}

const RESUBMIT_REFUSALS: Partial<Record<RegistrationStatus, string>> = {
  SUBMITTED: "Your registration has already been submitted and is awaiting review.",
  UNDER_REVIEW: "Your registration is currently being reviewed.",
  APPROVED: "You already have an approved registration.",
  REVOKED:
    "Your registration was revoked and cannot be resubmitted. Please contact an administrator.",
};

/**
 * Create or replace a registrant's submission, run duplicate detection, and move it
 * into administrator review. FR-04, FR-12..19, FR-39..43, §8.
 *
 * Resubmission (from REJECTED or INFO_REQUIRED) updates the registration in place but
 * never destroys history: prior documents and duplicate flags are marked superseded
 * rather than deleted, so the evidence behind an earlier decision survives (gap W-02).
 */
export async function submitRegistration(params: {
  user: { id: string; email: string };
  input: RegistrationInput;
  document: SubmissionDocument;
}): Promise<SubmissionResult> {
  const { user, input, document } = params;
  const documentType =
    input.type === "ADULT" ? "GOVERNMENT_ID" : "BIRTH_CERTIFICATE";

  return prisma.$transaction(async (tx) => {
    const existing = await tx.registration.findUnique({
      where: { userId: user.id },
    });

    const attemptNumber = existing ? existing.attemptNumber + 1 : 1;

    if (existing) {
      const from = existing.status as RegistrationStatus;
      requireTransition(
        from,
        "SUBMITTED",
        RESUBMIT_REFUSALS[from] ?? "This registration cannot be resubmitted.",
      );
      // Attempt cap (FR-42). The registrant has already used MAX attempts; only an
      // administrator can permit another.
      if (existing.attemptNumber >= MAX_SUBMISSION_ATTEMPTS) {
        throw new RegistrationConflictError(
          `You have reached the maximum of ${MAX_SUBMISSION_ATTEMPTS} submission ` +
            "attempts. Please contact an administrator.",
        );
      }
    }

    const now = new Date();
    const data: Prisma.RegistrationUncheckedCreateInput = {
      userId: user.id,
      type: input.type,
      status: "SUBMITTED",
      fullName: input.fullName,
      dateOfBirth: new Date(input.dateOfBirth),
      governmentIdNumber:
        input.type === "ADULT" ? input.governmentIdNumber : null,
      parentGuardianName:
        input.type === "CHILD" ? input.parentGuardianName : null,
      birthCertNumber: input.type === "CHILD" ? input.birthCertNumber : null,
      attemptNumber,
      submittedAt: now,
    };

    const registration = existing
      ? await tx.registration.update({
          where: { id: existing.id },
          data: { ...data, status: "SUBMITTED", submittedAt: now, attemptNumber },
        })
      : await tx.registration.create({ data });

    if (existing) {
      // Retain, do not delete (FR-40, gap W-02). Superseded rows stay queryable so an
      // administrator can see what an earlier decision was actually taken against.
      await tx.document.updateMany({
        where: { registrationId: registration.id, supersededAt: null },
        data: { supersededAt: now },
      });
      await tx.duplicateFlag.updateMany({
        where: { registrationId: registration.id, supersededAt: null },
        data: { supersededAt: now },
      });
    }

    await tx.document.create({
      data: {
        registrationId: registration.id,
        type: documentType,
        storageKey: document.storageKey,
        originalFilename: document.originalFilename,
        mimeType: document.mimeType,
        fileSizeBytes: document.fileSizeBytes,
        attemptNumber,
      },
    });

    // Duplicate detection (FR-15..17, FR-32). Candidates are drawn from every age
    // category so the cross-category name+DOB basis can fire, and only from states
    // that participate in matching — a REJECTED record must not block a later
    // registration on the same ID (gap D-05).
    const candidate: MatchableRegistration = {
      id: registration.id,
      type: registration.type,
      fullName: registration.fullName,
      dateOfBirth: registration.dateOfBirth,
      governmentIdNumber: registration.governmentIdNumber,
      birthCertNumber: registration.birthCertNumber,
      parentGuardianName: registration.parentGuardianName,
    };
    const others = await tx.registration.findMany({
      where: {
        id: { not: registration.id },
        status: { in: [...DUPLICATE_MATCHING_STATUSES] },
      },
      select: {
        id: true,
        type: true,
        fullName: true,
        dateOfBirth: true,
        governmentIdNumber: true,
        birthCertNumber: true,
        parentGuardianName: true,
      },
    });
    const match = findDuplicate(candidate, others);

    if (match) {
      await tx.duplicateFlag.create({
        data: {
          registrationId: registration.id,
          matchedRegistrationId: match.matchedRegistrationId,
          matchBasis: match.basis,
          reason: match.adminReason,
          attemptNumber,
        },
      });
      await recordAudit(
        {
          action: "DUPLICATE_FLAGGED",
          registrationId: registration.id,
          actorId: user.id,
          metadata: { basis: match.basis, attemptNumber },
        },
        tx,
      );
    }

    // Every registration goes to administrator review — including non-duplicates (§9).
    requireTransition("SUBMITTED", "UNDER_REVIEW", "Unexpected registration state.");
    await tx.registration.update({
      where: { id: registration.id },
      data: { status: "UNDER_REVIEW" },
    });

    await recordAudit(
      {
        action: "REGISTRATION_SUBMITTED",
        registrationId: registration.id,
        actorId: user.id,
        metadata: {
          type: registration.type,
          attemptNumber,
          resubmission: Boolean(existing),
        },
      },
      tx,
    );

    // The message is identical whether or not a duplicate was flagged — telling the
    // registrant otherwise would confirm the existence of the matched record (C-02).
    await notifyRegistrant(
      {
        userId: user.id,
        email: user.email,
        registrationId: registration.id,
        type: "SUBMITTED",
        subject: "Your Future Protea registration was received",
        message:
          "Your registration has been received and is now under administrator " +
          "review. You will be notified once a decision is made.",
      },
      tx,
    );

    return {
      registrationId: registration.id,
      attemptNumber,
      duplicate: Boolean(match),
    };
  });
}

// --- Administrator outcomes --------------------------------------------------
// Approve, reject, request-more-information and revoke all follow the same shape:
// check the transition, move the state, write an ApprovalDecision, write an audit
// entry, notify the registrant. They share one implementation so the audit trail can
// never diverge between outcomes (FR-24).

type OutcomeDecision = "APPROVED" | "REJECTED" | "INFO_REQUESTED" | "REVOKED";

interface OutcomeSpec {
  toStatus: RegistrationStatus;
  decision: OutcomeDecision;
  auditAction: string;
  notificationType: string;
  subject: string;
  /** Built from the administrator's reason; must never reference another registrant. */
  message: (reason: string) => string;
  /** Refusal shown when the registration is not in a state this outcome applies to. */
  refusal: string;
}

async function applyOutcome(
  params: {
    registrationId: string;
    admin: { id: string };
    reason: string;
  },
  spec: OutcomeSpec,
): Promise<void> {
  const { registrationId, admin, reason } = params;

  await prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUnique({
      where: { id: registrationId },
      include: { user: true },
    });
    if (!registration) {
      throw new Error("Registration not found");
    }

    requireTransition(
      registration.status as RegistrationStatus,
      spec.toStatus,
      spec.refusal,
    );

    await tx.registration.update({
      where: { id: registrationId },
      data: { status: spec.toStatus },
    });

    await tx.approvalDecision.create({
      data: {
        registrationId,
        adminId: admin.id,
        decision: spec.decision,
        reason,
        attemptNumber: registration.attemptNumber,
      },
    });

    await recordAudit(
      {
        action: spec.auditAction,
        registrationId,
        actorId: admin.id,
        metadata: { attemptNumber: registration.attemptNumber },
      },
      tx,
    );

    await notifyRegistrant(
      {
        userId: registration.userId,
        email: registration.user.email,
        registrationId,
        type: spec.notificationType,
        subject: spec.subject,
        message: spec.message(reason),
      },
      tx,
    );
  });
}

/** Administrator approve/reject decision (FR-22..24, FR-27/28). */
export async function decideRegistration(params: {
  registrationId: string;
  admin: { id: string };
  decision: "APPROVED" | "REJECTED";
  reason: string;
}): Promise<void> {
  const { decision, ...rest } = params;
  await applyOutcome(
    rest,
    decision === "APPROVED"
      ? {
          toStatus: "APPROVED",
          decision: "APPROVED",
          auditAction: "REGISTRATION_APPROVED",
          notificationType: "APPROVED",
          subject: "Your Future Protea registration was approved",
          message: () =>
            "Good news — your registration has been approved. You now have access " +
            "to the application.",
          refusal: "This registration has already been decided.",
        }
      : {
          toStatus: "REJECTED",
          decision: "REJECTED",
          auditAction: "REGISTRATION_REJECTED",
          notificationType: "REJECTED",
          subject: "Your Future Protea registration was not approved",
          message: (reason) =>
            `Your registration was not approved. Reason: ${reason}`,
          refusal: "This registration has already been decided.",
        },
  );
}

/**
 * Return a registration to the registrant for more information (BRD v1.1 FR-36,
 * gap W-04). This is the middle ground between approve and reject: it does not write
 * an adverse outcome, and the registrant can amend and resubmit.
 */
export async function requestMoreInfo(params: {
  registrationId: string;
  admin: { id: string };
  note: string;
}): Promise<void> {
  await applyOutcome(
    {
      registrationId: params.registrationId,
      admin: params.admin,
      reason: params.note,
    },
    {
      toStatus: "INFO_REQUIRED",
      decision: "INFO_REQUESTED",
      auditAction: "REGISTRATION_INFO_REQUESTED",
      notificationType: "INFO_REQUIRED",
      subject: "More information is needed for your Future Protea registration",
      message: (note) =>
        "An administrator needs more information before your registration can be " +
        `decided. ${note} You can update your registration and submit it again.`,
      refusal: "This registration is not awaiting review.",
    },
  );
}

/**
 * Withdraw a previously granted approval (BRD v1.1 FR-44, gap W-03). Access is lost
 * on the registrant's next request, because the approval gate reads the current
 * status from the database on every protected route (see requireApprovedRegistrant).
 * REVOKED is terminal: there is no reinstatement path in this release.
 */
export async function revokeRegistration(params: {
  registrationId: string;
  admin: { id: string };
  reason: string;
}): Promise<void> {
  await applyOutcome(params, {
    toStatus: "REVOKED",
    decision: "REVOKED",
    auditAction: "REGISTRATION_REVOKED",
    notificationType: "REVOKED",
    subject: "Your Future Protea registration has been revoked",
    message: (reason) =>
      "Your registration has been revoked and your access to the application has " +
      `been withdrawn. Reason: ${reason}`,
    refusal: "Only an approved registration can be revoked.",
  });
}
