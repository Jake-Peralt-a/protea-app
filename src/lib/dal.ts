import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { prisma } from "./db";
import { readSession, type Role } from "./session";

// The Data Access Layer centralises authorization. Pages, layouts, server actions
// and route handlers call these helpers so the approval gate (FR-25..28) and role
// checks are always enforced against the database — not just the optimistic proxy.

export const getSession = cache(async () => {
  return readSession();
});

/** Full current user with their (optional) registration, or null if signed out. */
export const getCurrentUser = cache(async () => {
  const session = await getSession();
  if (!session) return null;
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: { registration: true },
  });
  return user;
});

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** Require an authenticated user; redirect to /login otherwise. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Require an administrator; redirect otherwise. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role !== ("ADMIN" satisfies Role)) redirect("/status");
  return user;
}

/**
 * Approval gate (FR-25/26): require an authenticated registrant whose registration
 * is APPROVED. Anyone else is redirected to their status page. Admins pass through.
 */
export async function requireApprovedRegistrant(): Promise<CurrentUser> {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  if (user.registration?.status !== "APPROVED") redirect("/status");
  return user;
}

export function isApproved(user: CurrentUser | null): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return user.registration?.status === "APPROVED";
}
