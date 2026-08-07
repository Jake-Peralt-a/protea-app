import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./db";
import { config } from "./config";

// Registrant notifications (FR-29 / FR-30). Every notification is persisted for the
// in-app history/status page (the "Must"), and optionally emitted over email (the
// "Should"). All messages must be privacy-safe and never disclose another
// individual's data (FR-31) — callers are responsible for passing generic text.

type Db = PrismaClient | Prisma.TransactionClient;

interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

// Email driver abstraction. The default "log" driver records the email to the
// server log for local development. A production SMTP driver (nodemailer) can be
// added behind this same function.
async function sendEmail(message: EmailMessage): Promise<void> {
  if (config.email.driver === "smtp") {
    // Production seam: implement with nodemailer using the SMTP_* env vars.
    throw new Error(
      "SMTP email driver is not configured. Install nodemailer and implement the " +
        "smtp branch, or use EMAIL_DRIVER=log.",
    );
  }
  console.info(
    `[email:${config.email.from}] to=${message.to} subject="${message.subject}"\n${message.body}`,
  );
}

export async function notifyRegistrant(
  params: {
    userId: string;
    email: string;
    registrationId?: string | null;
    type: string;
    subject: string;
    message: string;
  },
  db: Db = defaultPrisma,
): Promise<void> {
  await db.notification.create({
    data: {
      userId: params.userId,
      registrationId: params.registrationId ?? null,
      type: params.type,
      message: params.message,
    },
  });
  await sendEmail({
    to: params.email,
    subject: params.subject,
    body: params.message,
  });
}
