import Link from "next/link";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import type { RegistrationStatus } from "@/lib/status";

// Administrator review queue (FR-20). Pending registrations first (oldest first),
// with an optional view of already-decided registrations.
export default async function QueuePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const admin = await requireAdmin();
  const { view } = await searchParams;
  const showDecided = view === "decided";

  const pendingStatuses: RegistrationStatus[] = ["SUBMITTED", "UNDER_REVIEW"];
  const decidedStatuses: RegistrationStatus[] = ["APPROVED", "REJECTED"];

  const registrations = await prisma.registration.findMany({
    where: { status: { in: showDecided ? decidedStatuses : pendingStatuses } },
    orderBy: showDecided ? { updatedAt: "desc" } : { submittedAt: "asc" },
    include: {
      user: { select: { email: true } },
      _count: { select: { duplicateFlags: true } },
    },
  });

  const pendingCount = await prisma.registration.count({
    where: { status: { in: pendingStatuses } },
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
          <Link
            href="/admin/queue"
            className="rounded-md px-3 py-1.5"
            style={{
              background: showDecided ? "transparent" : "var(--surface)",
              color: showDecided ? "var(--muted)" : "var(--foreground)",
              fontWeight: showDecided ? 400 : 600,
              boxShadow: showDecided ? "none" : "var(--shadow-card)",
            }}
          >
            Pending
          </Link>
          <Link
            href="/admin/queue?view=decided"
            className="rounded-md px-3 py-1.5"
            style={{
              background: showDecided ? "var(--surface)" : "transparent",
              color: showDecided ? "var(--foreground)" : "var(--muted)",
              fontWeight: showDecided ? 600 : 400,
              boxShadow: showDecided ? "var(--shadow-card)" : "none",
            }}
          >
            Decided
          </Link>
        </div>

        <div className="card mt-5 overflow-hidden">
          {registrations.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
              {showDecided
                ? "No decisions recorded yet. Approvals and rejections will show up here."
                : "No registrations waiting on review. New submissions will appear here."}
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
                        <div className="flex items-center gap-2">
                          <StatusBadge status={r.status as RegistrationStatus} />
                          {r._count.duplicateFlags > 0 && (
                            <span
                              className="badge"
                              style={{ background: "var(--warning-bg)", color: "var(--warning)" }}
                            >
                              Possible duplicate
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
