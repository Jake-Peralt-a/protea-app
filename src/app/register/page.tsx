import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/SiteHeader";
import { RegistrationWizard } from "@/components/RegistrationWizard";
import {
  RESUBMITTABLE_STATUSES,
  MAX_SUBMISSION_ATTEMPTS,
  type RegistrationStatus,
} from "@/lib/transitions";

export default async function RegisterPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin/queue");

  // Only a registration in a resubmittable state may be edited here; anything else
  // belongs on the status page. The set comes from the transition table so this
  // check can never drift from what the domain layer will accept (BRD v1.1 §8).
  const existing = user.registration;
  const status = existing?.status as RegistrationStatus | undefined;
  if (status && !RESUBMITTABLE_STATUSES.includes(status)) redirect("/status");
  if (existing && existing.attemptNumber >= MAX_SUBMISSION_ATTEMPTS) redirect("/status");

  // Prefill an amendment with what was submitted before, so a registrant returning to
  // fix one field does not have to retype everything (FR-36/FR-39).
  const registration = existing
    ? await prisma.registration.findUnique({
        where: { id: existing.id },
        select: {
          fullName: true,
          dateOfBirth: true,
          governmentIdNumber: true,
          parentGuardianName: true,
          birthCertNumber: true,
        },
      })
    : null;

  const latestNote =
    status === "INFO_REQUIRED" && existing
      ? await prisma.approvalDecision.findFirst({
          where: { registrationId: existing.id, decision: "INFO_REQUESTED" },
          orderBy: { decidedAt: "desc" },
          select: { reason: true },
        })
      : null;

  return (
    <>
      <SiteHeader email={user.email} role={user.role} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        <span className="eyebrow">Registration</span>
        <h1 className="display mt-3 text-3xl">Identity registration</h1>
        <p className="mt-2 mb-6 text-sm" style={{ color: "var(--muted)" }}>
          Complete the steps below. Your registration will be reviewed by an
          administrator before access is granted.
        </p>
        {status === "INFO_REQUIRED" && (
          <div className="notice notice-warning mb-6">
            <strong>An administrator needs more information.</strong>
            {latestNote?.reason ? ` ${latestNote.reason}` : ""} Update your details
            below and submit again.
          </div>
        )}
        {status === "REJECTED" && (
          <p className="notice notice-warning mb-6">
            Your previous registration was not approved. You can correct your details
            and submit again below.
          </p>
        )}
        <RegistrationWizard
          initial={
            registration
              ? {
                  fullName: registration.fullName,
                  dateOfBirth: registration.dateOfBirth.toISOString().slice(0, 10),
                  governmentIdNumber: registration.governmentIdNumber ?? "",
                  parentGuardianName: registration.parentGuardianName ?? "",
                  birthCertNumber: registration.birthCertNumber ?? "",
                }
              : undefined
          }
        />
      </main>
    </>
  );
}
