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

  console.log("Staged scenario registrants:");
  console.log("  review.me@example.test / Registrant123!  (pending)");
  console.log("  dupe.me@example.test    / Registrant123!  (pending, flagged duplicate)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
