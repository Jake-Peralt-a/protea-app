import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "./db";

// Append-only audit trail (NFR — auditability; business rule §9).
type Db = PrismaClient | Prisma.TransactionClient;

export async function recordAudit(
  params: {
    action: string;
    registrationId?: string | null;
    actorId?: string | null;
    metadata?: Prisma.InputJsonValue;
  },
  db: Db = defaultPrisma,
): Promise<void> {
  await db.auditLog.create({
    data: {
      action: params.action,
      registrationId: params.registrationId ?? null,
      actorId: params.actorId ?? null,
      metadata: params.metadata,
    },
  });
}
