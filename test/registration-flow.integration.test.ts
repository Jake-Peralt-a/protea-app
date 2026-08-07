import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  submitRegistration,
  decideRegistration,
  RegistrationConflictError,
} from "@/lib/registrations";

// End-to-end exercise of the registration domain against the real database:
// submission → duplicate detection → administrator decision → audit trail.
// Maps to BRD Acceptance Criteria AC-3, AC-5, AC-6, AC-7.

const PREFIX = `itest-${randomUUID().slice(0, 8)}`;
const email = (name: string) => `${PREFIX}-${name}@example.test`;

let adminId: string;
let user1: { id: string; email: string };
let user2: { id: string; email: string };

const SHARED_ID = `${PREFIX}-AB-1234`;

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: email("admin"), passwordHash: "x", role: "ADMIN" },
  });
  adminId = admin.id;
  const u1 = await prisma.user.create({
    data: { email: email("u1"), passwordHash: "x", role: "REGISTRANT" },
  });
  const u2 = await prisma.user.create({
    data: { email: email("u2"), passwordHash: "x", role: "REGISTRANT" },
  });
  user1 = { id: u1.id, email: u1.email };
  user2 = { id: u2.id, email: u2.email };
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: PREFIX } },
    include: { registration: true },
  });
  const userIds = users.map((u) => u.id);
  const regIds = users
    .map((u) => u.registration?.id)
    .filter((id): id is string => Boolean(id));

  // Remove test audit logs first (they survive user deletion via SetNull), then the
  // users — cascades take registrations, documents, flags, decisions, notifications.
  await prisma.auditLog.deleteMany({
    where: {
      OR: [{ actorId: { in: userIds } }, { registrationId: { in: regIds } }],
    },
  });
  // Delete registrations first so their ApprovalDecisions (which reference the admin
  // user) are cascaded away before the admin user itself is removed.
  await prisma.registration.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

function doc() {
  return {
    storageKey: `${PREFIX}-${randomUUID()}.pdf`,
    originalFilename: "id.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: 1024,
  };
}

describe("registration + duplicate detection + decision", () => {
  it("submits an adult registration and routes it to review (no duplicate)", async () => {
    const result = await submitRegistration({
      user: user1,
      input: {
        type: "ADULT",
        fullName: "Alice First",
        dateOfBirth: "1990-01-01",
        governmentIdNumber: SHARED_ID,
      },
      document: doc(),
    });
    expect(result.duplicate).toBe(false);

    const reg = await prisma.registration.findUnique({
      where: { id: result.registrationId },
      include: { documents: true },
    });
    expect(reg?.status).toBe("UNDER_REVIEW"); // §8: every registration goes to review
    expect(reg?.documents).toHaveLength(1);

    const audit = await prisma.auditLog.findFirst({
      where: { registrationId: result.registrationId, action: "REGISTRATION_SUBMITTED" },
    });
    expect(audit).not.toBeNull();
  });

  it("flags a second adult with the same ID as a potential duplicate (AC-3)", async () => {
    const result = await submitRegistration({
      user: user2,
      input: {
        type: "ADULT",
        fullName: "Bob Second",
        // Same ID, different formatting — normalisation should still match.
        dateOfBirth: "1985-05-05",
        governmentIdNumber: SHARED_ID.toLowerCase().replace(/-/g, " "),
      },
      document: doc(),
    });

    expect(result.duplicate).toBe(true);
    // Reason must be generic and must NOT leak the other registrant's data (FR-18/31).
    expect(result.duplicateReason).toBeTruthy();
    expect(result.duplicateReason).not.toContain("Alice");
    expect(result.duplicateReason).not.toContain(user1.email);

    const flag = await prisma.duplicateFlag.findFirst({
      where: { registrationId: result.registrationId },
    });
    expect(flag?.matchBasis).toBe("ADULT_ID");

    // Still routed to review rather than silently blocked (FR-19).
    const reg = await prisma.registration.findUnique({
      where: { id: result.registrationId },
    });
    expect(reg?.status).toBe("UNDER_REVIEW");
  });

  it("blocks a duplicate submission while one is already pending", async () => {
    await expect(
      submitRegistration({
        user: user1,
        input: {
          type: "ADULT",
          fullName: "Alice First",
          dateOfBirth: "1990-01-01",
          governmentIdNumber: SHARED_ID,
        },
        document: doc(),
      }),
    ).rejects.toBeInstanceOf(RegistrationConflictError);
  });

  it("approves user1 and records an audited decision (AC-5, AC-6, AC-7)", async () => {
    const reg = await prisma.registration.findUniqueOrThrow({
      where: { userId: user1.id },
    });
    await decideRegistration({
      registrationId: reg.id,
      admin: { id: adminId },
      decision: "APPROVED",
      reason: "ID verified against uploaded document.",
    });

    const updated = await prisma.registration.findUniqueOrThrow({
      where: { id: reg.id },
    });
    expect(updated.status).toBe("APPROVED"); // access now granted (§8)

    const decision = await prisma.approvalDecision.findFirstOrThrow({
      where: { registrationId: reg.id },
    });
    expect(decision.decision).toBe("APPROVED");
    expect(decision.adminId).toBe(adminId); // admin identity recorded (FR-24)
    expect(decision.decidedAt).toBeInstanceOf(Date); // timestamp recorded

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { registrationId: reg.id, action: "REGISTRATION_APPROVED" },
    });
    expect(audit.actorId).toBe(adminId);

    const notification = await prisma.notification.findFirst({
      where: { userId: user1.id, type: "APPROVED" },
    });
    expect(notification).not.toBeNull();
  });

  it("rejects user2 with a recorded reason, then allows resubmission", async () => {
    const reg = await prisma.registration.findUniqueOrThrow({
      where: { userId: user2.id },
    });
    await decideRegistration({
      registrationId: reg.id,
      admin: { id: adminId },
      decision: "REJECTED",
      reason: "Confirmed duplicate of an existing registration.",
    });
    const rejected = await prisma.registration.findUniqueOrThrow({
      where: { id: reg.id },
    });
    expect(rejected.status).toBe("REJECTED");

    // A rejected registrant may resubmit (default policy) — moves back to review.
    const result = await submitRegistration({
      user: user2,
      input: {
        type: "ADULT",
        fullName: "Bob Second",
        dateOfBirth: "1985-05-05",
        governmentIdNumber: `${PREFIX}-UNIQUE-9`,
      },
      document: doc(),
    });
    const resubmitted = await prisma.registration.findUniqueOrThrow({
      where: { id: result.registrationId },
    });
    expect(resubmitted.status).toBe("UNDER_REVIEW");
  });
});
