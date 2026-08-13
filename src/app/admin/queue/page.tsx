import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { RegistrationStatus } from "@/lib/status";
import { PENDING_REVIEW_STATUSES, MAX_SUBMISSION_ATTEMPTS } from "@/lib/transitions";
import { needsAdultReverification } from "@/lib/age";

// Administrator review queue (FR-20). Three views: registrations waiting on an
// administrator, registrations waiting on the registrant (INFO_REQUIRED, added by
// CR-REG-002), and closed registrations.
const VIEWS = {
  pending: {
    label: "Pending",
    statuses: [...PENDING_REVIEW_STATUSES] as RegistrationStatus[],
    empty: "No registrations waiting on review. New submissions will appear here.",
  },
  waiting: {
    label: "Awaiting registrant",
    statuses: ["INFO_REQUIRED"] as RegistrationStatus[],
    empty: "No registrations are waiting on more information from a registrant.",
  },
  decided: {
    label: "Decided",
    statuses: ["APPROVED", "REJECTED", "REVOKED"] as RegistrationStatus[],
    empty: "No decisions recorded yet. Approvals and rejections will show up here.",
  },
} as const;

type ViewKey = keyof typeof VIEWS;

export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const admin = await requireAdmin();
  const { view } = await searchParams;
  const activeView: ViewKey = view === "decided" || view === "waiting" ? view : "pending";
  const current = VIEWS[activeView];

  const registrations = await prisma.registration.findMany({
    where: { status: { in: [...current.statuses] } },
    orderBy: activeView === "pending" ? { submittedAt: "asc" } : { updatedAt: "desc" },
    include: {
      user: { select: { email: true } },
      // Only flags raised against the current attempt matter for triage.
      _count: { select: { duplicateFlags: { where: { supersededAt: null } } } },
    },
  });

  const pendingCount = await prisma.registration.count({
    where: { status: { in: [...VIEWS.pending.statuses] } },
  });

  return (
    <>
      <SiteHeader email={admin.email} role={admin.role} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-10">
        <div className="flex items-center justify-between">
          <h1 className="display text-2xl">Review queue</h1>
          <div className="flex flex-col items-end">
            <span className="mono-value text-xl leading-none">{pendingCount}</span>
            <span className="mono-label mt-1">Pending</span>
          </div>
        </div>

        <div
          className="mt-4 inline-flex gap-1 rounded-lg p-1 text-sm"
          style={{ border: "1px solid var(--border)", background: "var(--surface-2)" }}
        >
          {(Object.keys(VIEWS) as ViewKey[]).map((key) => {
            const on = key === activeView;
            return (
              <Link
                key={key}
                href={key === "pending" ? "/admin/queue" : `/admin/queue?view=${key}`}
                className="rounded-md px-3 py-1.5"
                style={{
                  background: on ? "var(--surface)" : "transparent",
                  color: on ? "var(--foreground)" : "var(--muted)",
                  fontWeight: on ? 600 : 400,
                  boxShadow: on ? "var(--shadow-card)" : "none",
                }}
              >
                {VIEWS[key].label}
              </Link>
            );
          })}
        </div>

        <div className="card mt-5 overflow-hidden">
          {registrations.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
              {current.empty}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Applicant</th>
                    <th>Type</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <div className="font-semibold">{r.fullName}</div>
                        <div className="mono-value text-xs" style={{ color: "var(--muted)" }}>
                          {r.user.email}
                        </div>
                      </td>
                      <td>{r.type === "ADULT" ? "Adult" : "Child"}</td>
                      <td className="mono-value" style={{ color: "var(--muted)" }}>
                        {r.submittedAt ? r.submittedAt.toLocaleDateString() : "—"}
                      </td>
                      <td>
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge status={r.status as RegistrationStatus} />
                          {r._count.duplicateFlags > 0 && (
                            <span
                              className="badge"
                              style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                            >
                              Possible duplicate
                            </span>
                          )}
                          {needsAdultReverification(r) && (
                            <span
                              className="badge"
                              style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                            >
                              Now 18+
                            </span>
                          )}
                          {r.attemptNumber > 1 && (
                            <span className="badge">
                              Attempt {r.attemptNumber}/{MAX_SUBMISSION_ATTEMPTS}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/admin/registrations/${r.id}`}
                          className="hover:underline"
                          style={{ color: "var(--primary)", fontWeight: 600 }}
                        >
                          Review →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
