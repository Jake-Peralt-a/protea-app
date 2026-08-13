import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUS_META, type RegistrationStatus } from "@/lib/status";

import { MAX_SUBMISSION_ATTEMPTS } from "@/lib/transitions";

const TIMELINE: RegistrationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
];

// States where the progress rail is meaningless — the registration has left the
// happy path.
const CLOSED_STATUSES: RegistrationStatus[] = ["REJECTED", "REVOKED"];

export default async function StatusPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin/queue");
  if (!user.registration) redirect("/register");

  // Duplicate flags are deliberately NOT loaded here: the registrant is never told
  // that their details matched an existing record, because confirming a match
  // discloses that record's existence (FR-18 as amended by CR-REG-002, FR-31).
  const registration = await prisma.registration.findUnique({
    where: { id: user.registration.id },
    include: {
      decisions: { orderBy: { decidedAt: "desc" }, take: 1 },
    },
  });
  if (!registration) redirect("/register");

  const status = registration.status as RegistrationStatus;
  const meta = STATUS_META[status];
  const latestDecision = registration.decisions[0];
  const notifications = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  // INFO_REQUIRED sits at the review stage of the rail — the registration is still in
  // progress, it is just waiting on the registrant rather than the administrator.
  const currentIndex =
    status === "INFO_REQUIRED" ? TIMELINE.indexOf("UNDER_REVIEW") : TIMELINE.indexOf(status);
  const isClosed = CLOSED_STATUSES.includes(status);
  const attemptsRemaining = MAX_SUBMISSION_ATTEMPTS - registration.attemptNumber;
  const canResubmit =
    (status === "REJECTED" || status === "INFO_REQUIRED") && attemptsRemaining > 0;

  return (
    <>
      <SiteHeader email={user.email} role={user.role} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        <div className="flex items-center justify-between">
          <div>
            <p className="mono-label mb-1">Registration</p>
            <h1 className="display text-2xl">Registration status</h1>
          </div>
          <StatusBadge status={status} />
        </div>

        <div className="card mt-5 p-6">
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            {meta.description}
          </p>

          {/* Progress timeline (BRD §8), unless the registration is closed. */}
          {!isClosed && (
            <div className="rail mt-6" aria-label="Registration progress">
              <div className="rail-track">
                {TIMELINE.map((s, i) => {
                  const reached = currentIndex >= i;
                  const isCurrent = currentIndex === i;
                  return (
                    <span
                      key={s}
                      className="rail-seg"
                      data-on={reached}
                      data-current={isCurrent}
                    />
                  );
                })}
              </div>
              <div className="rail-labels">
                {TIMELINE.map((s, i) => {
                  const reached = currentIndex >= i;
                  return (
                    <span key={s} className="rail-label" data-on={reached}>
                      {STATUS_META[s].label}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* What the administrator asked for (FR-36). This text is written by an
              administrator and is required to be free of any other registrant's
              details (FR-31). */}
          {status === "INFO_REQUIRED" && (
            <div className="notice notice-warning mt-6">
              {latestDecision?.reason
                ? `An administrator asked for the following: ${latestDecision.reason}`
                : "An administrator needs more information before your registration can be decided."}
            </div>
          )}

          {/* Rejection reason (FR-28). */}
          {status === "REJECTED" && (
            <div className="notice notice-danger mt-6">
              {latestDecision?.reason
                ? `Reason: ${latestDecision.reason}`
                : "Your registration was not approved."}
            </div>
          )}

          {/* Revocation reason (FR-46). Terminal — no resubmission is offered. */}
          {status === "REVOKED" && (
            <div className="notice notice-danger mt-6">
              {latestDecision?.reason
                ? `Reason: ${latestDecision.reason}`
                : "Your registration has been revoked."}{" "}
              Please contact an administrator if you believe this is a mistake.
            </div>
          )}

          {/* Attempt counter (FR-42) — shown only once an attempt has been used up. */}
          {canResubmit && (
            <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
              You have{" "}
              <span className="mono-value">{attemptsRemaining}</span> of{" "}
              <span className="mono-value">{MAX_SUBMISSION_ATTEMPTS}</span> submission
              attempts remaining.
            </p>
          )}
          {(status === "REJECTED" || status === "INFO_REQUIRED") && !canResubmit && (
            <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
              You have used all {MAX_SUBMISSION_ATTEMPTS} submission attempts. Please
              contact an administrator.
            </p>
          )}

          {(status === "APPROVED" || canResubmit) && (
            <div className="mt-6 flex gap-3">
              {status === "APPROVED" && (
                <Link href="/app" className="btn btn-primary">
                  Go to the application
                </Link>
              )}
              {canResubmit && (
                <Link href="/register" className="btn btn-primary">
                  {status === "INFO_REQUIRED"
                    ? "Update and resubmit"
                    : "Correct and resubmit"}
                </Link>
              )}
            </div>
          )}
        </div>

        {notifications.length > 0 && (
          <section className="mt-8">
            <h2 className="mono-label mb-3">Notifications</h2>
            <ul className="flex flex-col gap-2">
              {notifications.map((n) => (
                <li key={n.id} className="card px-4 py-3 text-sm">
                  <div>{n.message}</div>
                  <div className="mono-value mt-1 text-xs" style={{ color: "var(--muted)" }}>
                    {n.createdAt.toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </>
  );
}
