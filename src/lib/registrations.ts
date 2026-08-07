import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { recordAudit } from "./audit";
import { notifyRegistrant } from "./notify";
import { findDuplicate, type MatchableRegistration } from "./duplicate-check";
import type { RegistrationInput } from "./validation";

// Server-side domain logic for the registration workflow (BRD §7). Kept separate
// from the thin server actions so the transactional rules live in one place.

export class RegistrationConflictError extends Error {}

const PENDING_OR_APPROVED = ["SUBMITTED", "UNDER_REVIEW", "APPROVED"] as const;

export interface SubmissionDocument {
  storageKey: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
}

export interface SubmissionResult {
  registrationId: string;
  duplicate: boolean;
  // Generic, privacy-safe reason (FR-18/31) — safe to show the registrant.
  duplicateReason?: string;
}

/**
 * Create or (for a previously rejected registration) replace a registrant's
 * submission, run duplicate detection, and move it into administrator review.
 * FR-04, FR-12..19, §8.
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

    if (
      existing &&
      (PENDING_OR_APPROVED as readonly string[]).includes(existing.status)
    ) {
      throw new RegistrationConflictError(
        "You already have a registration in progress or approved.",
      );
    }

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
      submittedAt: new Date(),
    };

    // Reset a previously rejected registration in place (resubmission).
    const registration = existing
      ? await tx.registration.update({
          where: { id: existing.id },
          data: { ...data, status: "SUBMITTED", submittedAt: new Date() },
        })
      : await tx.registration.create({ data });

    if (existing) {
      await tx.document.deleteMany({ where: { registrationId: registration.id } });
      await tx.duplicateFlag.deleteMany({
        where: { registrationId: registration.id },
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
      },
    });

    // Duplicate detection against other registrants of the same category (FR-15..17).
    const candidate: MatchableRegistration = {
      id: registration.id,
      type: registration.type,
      governmentIdNumber: registration.governmentIdNumber,
      birthCertNumber: registration.birthCertNumber,
      parentGuardianName: registration.parentGuardianName,
    };
    const others = await tx.registration.findMany({
      where: { type: registration.type, id: { not: registration.id } },
      select: {
        id: true,
        type: true,
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
          reason: match.reason,
        },
      });
      await recordAudit(
        {
          action: "DUPLICATE_FLAGGED",
          registrationId: registration.id,
          actorId: user.id,
          metadata: { basis: match.basis },
        },
        tx,
      );
    }

    // Every registration goes to administrator review — including non-duplicates (§9).
    await tx.registration.update({
      where: { id: registration.id },
      data: { status: "UNDER_REVIEW" },
    });

    await recordAudit(
      {
        action: "REGISTRATION_SUBMITTED",
        registrationId: registration.id,
        actorId: user.id,
        metadata: { type: registration.type, resubmission: Boolean(existing) },
      },
      tx,
    );

    await notifyRegistrant(
      {
        userId: user.id,
        email: user.email,
        registrationId: registration.id,
        type: "SUBMITTED",
        subject: "Your Future Protea registration was received",
        message: match
          ? `Your registration has been received and is under administrator review. ${match.reason}`
          : "Your registration has been received and is now under administrator review. You will be notified once a decision is made.",
      },
      tx,
    );

    return {
      registrationId: registration.id,
      duplicate: Boolean(match),
      duplicateReason: match?.reason,
    };
  });
}

/** Administrator approve/reject decision (FR-22..24, FR-27/28). */
export async function decideRegistration(params: {
  registrationId: string;
  admin: { id: string };
  decision: "APPROVED" | "REJECTED";
  reason: string;
}): Promise<void> {
  const { registrationId, admin, decision, reason } = params;

  await prisma.$transaction(async (tx) => {
    const registration = await tx.registration.findUnique({
      where: { id: registrationId },
      include: { user: true },
    });
    if (!registration) {
      throw new Error("Registration not found");
    }
    if (
      registration.status !== "UNDER_REVIEW" &&
      registration.status !== "SUBMITTED"
    ) {
      throw new RegistrationConflictError(
        "This registration has already been decided.",
      );
    }

    await tx.registration.update({
      where: { id: registrationId },
      data: { status: decision },
    });

    await tx.approvalDecision.create({
      data: {
        registrationId,
        adminId: admin.id,
        decision,
        reason,
      },
    });

    await recordAudit(
      {
        action: decision === "APPROVED" ? "REGISTRATION_APPROVED" : "REGISTRATION_REJECTED",
        registrationId,
        actorId: admin.id,
      },
      tx,
    );

    await notifyRegistrant(
      {
        userId: registration.userId,
        email: registration.user.email,
        registrationId,
        type: decision,
        subject:
          decision === "APPROVED"
            ? "Your Future Protea registration was approved"
            : "Your Future Protea registration was not approved",
        message:
          decision === "APPROVED"
            ? "Good news — your registration has been approved. You now have access to the application."
            : `Your registration was not approved. Reason: ${reason}`,
      },
      tx,
    );
  });
}
