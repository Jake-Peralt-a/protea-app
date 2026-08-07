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
          <h1 className="text-2xl font-bold tracking-tight">Review queue</h1>
          <span className="text-sm" style={{ color: "var(--muted)" }}>
            {pendingCount} pending
          </span>
        </div>

        <div className="mt-4 flex gap-2 text-sm">
          <Link
            href="/admin/queue"
            className="btn btn-secondary"
            style={{
              padding: "0.35rem 0.85rem",
              background: showDecided ? "transparent" : "var(--info-bg)",
            }}
          >
            Pending
          </Link>
          <Link
            href="/admin/queue?view=decided"
            className="btn btn-secondary"
            style={{
              padding: "0.35rem 0.85rem",
              background: showDecided ? "var(--info-bg)" : "transparent",
            }}
          >
            Decided
          </Link>
        </div>

        <div className="card mt-5 overflow-hidden">
          {registrations.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
              {showDecided ? "No decided registrations." : "The queue is empty."}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--muted)" }} className="text-left">
                  <th className="px-5 py-3 font-medium">Applicant</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium">Submitted</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((r) => (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-5 py-3">
                      <div className="font-medium">{r.fullName}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        {r.user.email}
                      </div>
                    </td>
                    <td className="px-5 py-3">{r.type === "ADULT" ? "Adult" : "Child"}</td>
                    <td className="px-5 py-3" style={{ color: "var(--muted)" }}>
                      {r.submittedAt ? r.submittedAt.toLocaleDateString() : "—"}
                    </td>
                    <td className="px-5 py-3">
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
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/admin/registrations/${r.id}`}
                        style={{ color: "var(--primary)", fontWeight: 600 }}
                      >
                        Review →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </>
  );
}
