import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { STATUS_META, type RegistrationStatus } from "@/lib/status";

const TIMELINE: RegistrationStatus[] = [
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
];

export default async function StatusPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin/queue");
  if (!user.registration) redirect("/register");

  const registration = await prisma.registration.findUnique({
    where: { id: user.registration.id },
    include: {
      duplicateFlags: true,
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

  const currentIndex = TIMELINE.indexOf(status);

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

          {/* Progress timeline (BRD §8), unless rejected. */}
          {status !== "REJECTED" && (
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

          {/* Potential-duplicate notice — generic reason only (FR-18/31). */}
          {registration.duplicateFlags.length > 0 && status !== "REJECTED" && (
            <div className="notice notice-warning mt-6">
              {registration.duplicateFlags[0].reason}
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

          {(status === "APPROVED" || status === "REJECTED") && (
            <div className="mt-6 flex gap-3">
              {status === "APPROVED" && (
                <Link href="/app" className="btn btn-primary">
                  Go to the application
                </Link>
              )}
              {status === "REJECTED" && (
                <Link href="/register" className="btn btn-primary">
                  Correct and resubmit
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
