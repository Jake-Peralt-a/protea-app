import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Stages two pending registrations (one a duplicate of the other) with real, private
// document files, so the administrator-review UI and approval gate can be driven
// end-to-end in the browser without a manual file upload. Run: npx tsx scripts/seed-scenario.ts

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

const STORAGE_DIR = path.resolve(
  process.cwd(),
  process.env.STORAGE_LOCAL_DIR ?? ".storage",
);

// Minimal valid one-page PDF.
const PDF = `%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF`;

async function writeDoc(): Promise<{ key: string; size: number }> {
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  const key = `${randomUUID()}.pdf`;
  const bytes = Buffer.from(PDF, "utf8");
  await fs.writeFile(path.join(STORAGE_DIR, key), bytes);
  await fs.writeFile(path.join(STORAGE_DIR, `${key}.type`), "application/pdf", "utf8");
  return { key, size: bytes.byteLength };
}

async function stageRegistrant(opts: {
  email: string;
  fullName: string;
  govId: string;
}) {
  const passwordHash = await bcrypt.hash("Registrant123!", 10);
  const user = await prisma.user.upsert({
    where: { email: opts.email },
    update: {},
    create: { email: opts.email, passwordHash, role: "REGISTRANT" },
  });

  // Reset any prior scenario state for a clean run.
  await prisma.registration.deleteMany({ where: { userId: user.id } });

  const registration = await prisma.registration.create({
    data: {
      userId: user.id,
      type: "ADULT",
      status: "UNDER_REVIEW",
      fullName: opts.fullName,
      dateOfBirth: new Date("1990-01-01"),
      governmentIdNumber: opts.govId,
      submittedAt: new Date(),
    },
  });

  const { key, size } = await writeDoc();
  await prisma.document.create({
    data: {
      registrationId: registration.id,
      type: "GOVERNMENT_ID",
      storageKey: key,
      originalFilename: "government-id.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: size,
    },
  });

  await prisma.auditLog.create({
    data: {
      action: "REGISTRATION_SUBMITTED",
      registrationId: registration.id,
      actorId: user.id,
      metadata: { type: "ADULT", scenario: true },
    },
  });

  return registration;
}

/**
 * Stage a registration in an arbitrary workflow state, for the demo cases that the
 * happy path can't produce on its own (CR-REG-002 §7 of the demo script):
 * an approved child registrant who has since turned 18, and a registrant who has
 * exhausted the three-attempt cap.
 */
async function stageEdgeCase(opts: {
  email: string;
  fullName: string;
  type: "ADULT" | "CHILD";
  status: "APPROVED" | "REJECTED";
  dateOfBirth: string;
  attemptNumber: number;
  govId?: string;
  guardian?: string;
  birthCert?: string;
}) {
  const passwordHash = await bcrypt.hash("Registrant123!", 10);
  const user = await prisma.user.upsert({
    where: { email: opts.email },
    update: {},
    create: { email: opts.email, passwordHash, role: "REGISTRANT" },
  });
  await prisma.registration.deleteMany({ where: { userId: user.id } });

  const registration = await prisma.registration.create({
    data: {
      userId: user.id,
      type: opts.type,
      status: opts.status,
      fullName: opts.fullName,
      dateOfBirth: new Date(opts.dateOfBirth),
      governmentIdNumber: opts.govId ?? null,
      parentGuardianName: opts.guardian ?? null,
      birthCertNumber: opts.birthCert ?? null,
      attemptNumber: opts.attemptNumber,
      submittedAt: new Date(),
    },
  });

  const { key, size } = await writeDoc();
  await prisma.document.create({
    data: {
      registrationId: registration.id,
      type: opts.type === "ADULT" ? "GOVERNMENT_ID" : "BIRTH_CERTIFICATE",
      storageKey: key,
      originalFilename:
        opts.type === "ADULT" ? "government-id.pdf" : "birth-certificate.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: size,
      attemptNumber: opts.attemptNumber,
    },
  });

  return registration;
}

async function main() {
  const first = await stageRegistrant({
    email: "review.me@example.test",
    fullName: "Review Me",
    govId: "SCEN-1234-5678",
  });

  // Second registrant shares the same ID → flag it as a potential duplicate.
  const second = await stageRegistrant({
    email: "dupe.me@example.test",
    fullName: "Dupe Me",
    govId: "scen 1234 5678",
  });
  await prisma.duplicateFlag.create({
    data: {
      registrationId: second.id,
      matchedRegistrationId: first.id,
      matchBasis: "ADULT_ID",
      // Administrator-facing since CR-REG-002 (gap C-02) — the registrant is never
      // told that a match exists.
      reason: "Matched an existing registration on government-issued ID number.",
    },
  });

  // Approved on the child path, but turned 18 three months ago — the admin queue
  // should show a "Now 18+" badge and the re-verification banner (FR-48).
  const justTurned18 = new Date();
  justTurned18.setFullYear(justTurned18.getFullYear() - 18);
  justTurned18.setMonth(justTurned18.getMonth() - 3);

  await stageEdgeCase({
    email: "grown.up@example.test",
    fullName: "Grown Up",
    type: "CHILD",
    status: "APPROVED",
    dateOfBirth: justTurned18.toISOString().slice(0, 10),
    attemptNumber: 1,
    guardian: "Some Guardian",
    birthCert: "BC-2008-0114",
  });

  // Rejected having used all three attempts — status page should offer no resubmit
  // and /register should redirect away (FR-42).
  await stageEdgeCase({
    email: "cap.reached@example.test",
    fullName: "Cap Tester",
    type: "ADULT",
    status: "REJECTED",
    dateOfBirth: "1980-01-01",
    attemptNumber: 3,
    govId: "SCEN-CAP-0001",
  });

  console.log("Staged scenario registrants (all password: Registrant123!):");
  console.log("  review.me@example.test    pending");
  console.log("  dupe.me@example.test      pending, flagged as a potential duplicate");
  console.log("  grown.up@example.test     approved child registrant, now 18+");
  console.log("  cap.reached@example.test  rejected, all 3 attempts used");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
