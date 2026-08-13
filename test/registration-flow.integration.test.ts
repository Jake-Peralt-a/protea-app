import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import {
  submitRegistration,
  decideRegistration,
  requestMoreInfo,
  revokeRegistration,
  RegistrationConflictError,
} from "@/lib/registrations";
import { MAX_SUBMISSION_ATTEMPTS } from "@/lib/transitions";
import { STATUS_META, type RegistrationStatus } from "@/lib/status";

// End-to-end exercise of the registration domain against the real database:
// submission → duplicate detection → administrator outcome → audit trail.
// Maps to BRD Acceptance Criteria AC-3, AC-5, AC-6, AC-7, and to the CR-REG-002
// workflow requirements FR-32..FR-48.

const PREFIX = `itest-${randomUUID().slice(0, 8)}`;
const email = (name: string) => `${PREFIX}-${name}@example.test`;

let adminId: string;
let user1: { id: string; email: string };
let user2: { id: string; email: string };
let user3: { id: string; email: string };
let user4: { id: string; email: string };
let user5: { id: string; email: string };

const SHARED_ID = `${PREFIX}-AB-1234`;

async function makeUser(name: string) {
  const u = await prisma.user.create({
    data: { email: email(name), passwordHash: "x", role: "REGISTRANT" },
  });
  return { id: u.id, email: u.email };
}

beforeAll(async () => {
  const admin = await prisma.user.create({
    data: { email: email("admin"), passwordHash: "x", role: "ADMIN" },
  });
  adminId = admin.id;
  user1 = await makeUser("u1");
  user2 = await makeUser("u2");
  user3 = await makeUser("u3");
  user4 = await makeUser("u4");
  user5 = await makeUser("u5");
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

function doc(filename = "id.pdf") {
  return {
    storageKey: `${PREFIX}-${randomUUID()}.pdf`,
    originalFilename: filename,
    mimeType: "application/pdf",
    fileSizeBytes: 1024,
  };
}

const adultInput = (fullName: string, dob: string, id: string) =>
  ({
    type: "ADULT",
    fullName,
    dateOfBirth: dob,
    governmentIdNumber: id,
  }) as const;

describe("registration + duplicate detection + decision", () => {
  it("submits an adult registration and routes it to review (no duplicate)", async () => {
    const result = await submitRegistration({
      user: user1,
      input: adultInput("Alice First", "1990-01-01", SHARED_ID),
      document: doc(),
    });
    expect(result.duplicate).toBe(false);
    expect(result.attemptNumber).toBe(1);

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
      input: adultInput(
        "Bob Second",
        "1985-05-05",
        // Same ID, different formatting — normalisation should still match.
        SHARED_ID.toLowerCase().replace(/-/g, " "),
      ),
      document: doc(),
    });

    expect(result.duplicate).toBe(true);

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

  it("tells the registrant nothing about the match (FR-18 amended, gap C-02)", async () => {
    // The notification the registrant actually receives must be indistinguishable
    // from the non-duplicate case — otherwise it confirms the matched record exists.
    const flagged = await prisma.notification.findFirstOrThrow({
      where: { userId: user2.id, type: "SUBMITTED" },
    });
    const clean = await prisma.notification.findFirstOrThrow({
      where: { userId: user1.id, type: "SUBMITTED" },
    });
    expect(flagged.message).toBe(clean.message);
    expect(flagged.message).not.toContain("Alice");
    expect(flagged.message).not.toMatch(/duplicate|already exists|matching/i);
  });

  it("blocks a duplicate submission while one is already pending", async () => {
    await expect(
      submitRegistration({
        user: user1,
        input: adultInput("Alice First", "1990-01-01", SHARED_ID),
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

  it("refuses to decide an already-decided registration", async () => {
    const reg = await prisma.registration.findUniqueOrThrow({
      where: { userId: user1.id },
    });
    await expect(
      decideRegistration({
        registrationId: reg.id,
        admin: { id: adminId },
        decision: "REJECTED",
        reason: "Second thoughts.",
      }),
    ).rejects.toBeInstanceOf(RegistrationConflictError);
  });
});

// --- CR-REG-002: revocation (FR-44, gap W-03) --------------------------------
describe("revocation of an approved registration", () => {
  it("revokes an approval, withdrawing access and recording the decision", async () => {
    const reg = await prisma.registration.findUniqueOrThrow({
      where: { userId: user1.id },
    });
    expect(reg.status).toBe("APPROVED");

    await revokeRegistration({
      registrationId: reg.id,
      admin: { id: adminId },
      reason: "Document later found to be falsified.",
    });

    const revoked = await prisma.registration.findUniqueOrThrow({
      where: { id: reg.id },
    });
    expect(revoked.status).toBe("REVOKED");
    // The approval gate reads this mapping, so access is withdrawn by construction.
    expect(STATUS_META[revoked.status as RegistrationStatus].accessGranted).toBe(false);

    const decision = await prisma.approvalDecision.findFirstOrThrow({
      where: { registrationId: reg.id, decision: "REVOKED" },
    });
    expect(decision.adminId).toBe(adminId);
    expect(decision.reason).toContain("falsified");

    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { registrationId: reg.id, action: "REGISTRATION_REVOKED" },
    });
    expect(audit.actorId).toBe(adminId);

    const notification = await prisma.notification.findFirst({
      where: { userId: user1.id, type: "REVOKED" },
    });
    expect(notification).not.toBeNull();
  });

  it("does not let a revoked registrant resubmit (REVOKED is terminal)", async () => {
    await expect(
      submitRegistration({
        user: user1,
        input: adultInput("Alice First", "1990-01-01", `${PREFIX}-NEW-1`),
        document: doc(),
      }),
    ).rejects.toBeInstanceOf(RegistrationConflictError);
  });

  it("keeps the approval in the decision history alongside the revocation", async () => {
    const reg = await prisma.registration.findUniqueOrThrow({
      where: { userId: user1.id },
    });
    const decisions = await prisma.approvalDecision.findMany({
      where: { registrationId: reg.id },
      orderBy: { decidedAt: "asc" },
    });
    expect(decisions.map((d) => d.decision)).toEqual(["APPROVED", "REVOKED"]);
  });
});

// --- CR-REG-002: return for more information (FR-32) + resubmission (FR-39) ---
describe("return for more information, then amend and approve", () => {
  it("returns a registration to the registrant without an adverse decision", async () => {
    const submitted = await submitRegistration({
      user: user3,
      input: adultInput("Cara Third", "1992-02-02", `${PREFIX}-CARA-1`),
      document: doc("blurry.pdf"),
    });

    await requestMoreInfo({
      registrationId: submitted.registrationId,
      admin: { id: adminId },
      note: "The uploaded ID is too blurry to read. Please upload a clearer photo.",
    });

    const reg = await prisma.registration.findUniqueOrThrow({
      where: { id: submitted.registrationId },
    });
    expect(reg.status).toBe("INFO_REQUIRED");
    expect(STATUS_META.INFO_REQUIRED.accessGranted).toBe(false);

    const decision = await prisma.approvalDecision.findFirstOrThrow({
      where: { registrationId: reg.id, decision: "INFO_REQUESTED" },
    });
    expect(decision.adminId).toBe(adminId);
    expect(decision.attemptNumber).toBe(1);

    await prisma.auditLog.findFirstOrThrow({
      where: { registrationId: reg.id, action: "REGISTRATION_INFO_REQUESTED" },
    });

    const notification = await prisma.notification.findFirstOrThrow({
      where: { userId: user3.id, type: "INFO_REQUIRED" },
    });
    expect(notification.message).toContain("blurry");
  });

  it("retains the superseded document on resubmission rather than deleting it (gap W-02)", async () => {
    const result = await submitRegistration({
      user: user3,
      input: adultInput("Cara Third", "1992-02-02", `${PREFIX}-CARA-1`),
      document: doc("clear.pdf"),
    });
    expect(result.attemptNumber).toBe(2);

    const reg = await prisma.registration.findUniqueOrThrow({
      where: { id: result.registrationId },
      include: { documents: { orderBy: { uploadedAt: "asc" } } },
    });
    expect(reg.status).toBe("UNDER_REVIEW");
    expect(reg.attemptNumber).toBe(2);

    // Both attempts' documents survive; only the newest is current.
    expect(reg.documents).toHaveLength(2);
    const [first, second] = reg.documents;
    expect(first.originalFilename).toBe("blurry.pdf");
    expect(first.supersededAt).toBeInstanceOf(Date);
    expect(first.attemptNumber).toBe(1);
    expect(second.originalFilename).toBe("clear.pdf");
    expect(second.supersededAt).toBeNull();
    expect(second.attemptNumber).toBe(2);
  });

  it("approves the amended registration, keeping the full decision history", async () => {
    const reg = await prisma.registration.findUniqueOrThrow({
      where: { userId: user3.id },
    });
    await decideRegistration({
      registrationId: reg.id,
      admin: { id: adminId },
      decision: "APPROVED",
      reason: "Clear ID received and verified.",
    });

    const decisions = await prisma.approvalDecision.findMany({
      where: { registrationId: reg.id },
      orderBy: { decidedAt: "asc" },
    });
    expect(decisions.map((d) => d.decision)).toEqual(["INFO_REQUESTED", "APPROVED"]);
    // The approval was taken against attempt 2, the info request against attempt 1.
    expect(decisions.map((d) => d.attemptNumber)).toEqual([1, 2]);
  });
});

// --- CR-REG-002: attempt cap (FR-42) and rejection scope (gap D-05) ----------
describe("resubmission limits", () => {
  it(`refuses a submission beyond ${MAX_SUBMISSION_ATTEMPTS} attempts`, async () => {
    const input = adultInput("Dan Fourth", "1988-08-08", `${PREFIX}-DAN-1`);

    for (let attempt = 1; attempt <= MAX_SUBMISSION_ATTEMPTS; attempt++) {
      const result = await submitRegistration({
        user: user4,
        input,
        document: doc(),
      });
      expect(result.attemptNumber).toBe(attempt);

      await decideRegistration({
        registrationId: result.registrationId,
        admin: { id: adminId },
        decision: "REJECTED",
        reason: `Rejected on attempt ${attempt}.`,
      });
    }

    await expect(
      submitRegistration({ user: user4, input, document: doc() }),
    ).rejects.toThrow(/maximum of 3 submission attempts/i);
  });

  it("does not let a rejected registration block a later one on the same ID (gap D-05)", async () => {
    // user4's registration was rejected three times on this ID number. A different
    // person presenting the same ID must still reach review un-flagged, because a
    // rejection is often corrective rather than a genuine identity conflict.
    const result = await submitRegistration({
      user: user5,
      input: adultInput("Eve Fifth", "1979-09-09", `${PREFIX}-DAN-1`),
      document: doc(),
    });
    expect(result.duplicate).toBe(false);

    const flags = await prisma.duplicateFlag.count({
      where: { registrationId: result.registrationId },
    });
    expect(flags).toBe(0);
  });
});
