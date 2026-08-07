import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { DecisionForm } from "@/components/DecisionForm";
import type { RegistrationStatus } from "@/lib/status";

export default async function RegistrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;

  const registration = await prisma.registration.findUnique({
    where: { id },
    include: {
      user: { select: { email: true } },
      documents: true,
      decisions: {
        orderBy: { decidedAt: "desc" },
        include: { admin: { select: { email: true } } },
      },
      duplicateFlags: {
        include: {
          matched: {
            select: {
              id: true,
              fullName: true,
              dateOfBirth: true,
              type: true,
              governmentIdNumber: true,
              birthCertNumber: true,
              parentGuardianName: true,
              user: { select: { email: true } },
            },
          },
        },
      },
    },
  });

  if (!registration) notFound();

  const status = registration.status as RegistrationStatus;
  const isPending = status === "SUBMITTED" || status === "UNDER_REVIEW";
  const isAdult = registration.type === "ADULT";

  return (
    <>
      <SiteHeader email={admin.email} role={admin.role} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10">
        <Link href="/admin/queue" className="text-sm" style={{ color: "var(--primary)" }}>
          ← Back to queue
        </Link>

        <div className="mt-3 flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">{registration.fullName}</h1>
          <StatusBadge status={status} />
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {registration.user.email} · {isAdult ? "Adult" : "Child"} registration
        </p>

        {/* Captured identity details (FR-21). */}
        <section className="card mt-6 p-6">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--muted)" }}>
            Submitted details
          </h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field label="Full name" value={registration.fullName} />
            <Field
              label="Date of birth"
              value={registration.dateOfBirth.toLocaleDateString()}
            />
            {isAdult ? (
              <Field label="Government ID number" value={registration.governmentIdNumber} />
            ) : (
              <>
                <Field label="Parent/guardian" value={registration.parentGuardianName} />
                <Field label="Birth-certificate number" value={registration.birthCertNumber} />
              </>
            )}
            <Field
              label="Submitted"
              value={registration.submittedAt?.toLocaleString() ?? "—"}
            />
          </dl>
        </section>

        {/* Uploaded documents via admin-authenticated route (FR-21, FR-13). */}
        <section className="card mt-6 p-6">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--muted)" }}>
            Identity document
          </h2>
          {registration.documents.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No document uploaded.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {registration.documents.map((d) => (
                <li key={d.id} className="flex items-center justify-between text-sm">
                  <span>
                    {d.type === "GOVERNMENT_ID" ? "Government ID" : "Birth certificate"} ·{" "}
                    {d.originalFilename}
                  </span>
                  <a
                    href={`/api/documents/${d.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "var(--primary)", fontWeight: 600 }}
                  >
                    View document →
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Duplicate comparison — admins may compare with the matched record (FR-23). */}
        {registration.duplicateFlags.length > 0 && (
          <section
            className="card mt-6 p-6"
            style={{ borderColor: "var(--warning)" }}
          >
            <h2 className="mb-1 text-sm font-semibold" style={{ color: "var(--warning)" }}>
              Possible duplicate detected
            </h2>
            {registration.duplicateFlags.map((flag) => (
              <div key={flag.id} className="mt-3">
                <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
                  Matched on{" "}
                  {flag.matchBasis === "ADULT_ID"
                    ? "government-issued ID number"
                    : "birth-certificate details and parent/guardian name"}
                  .
                </p>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <CompareCol title="This registration">
                    <Field label="Name" value={registration.fullName} />
                    {isAdult ? (
                      <Field label="ID number" value={registration.governmentIdNumber} />
                    ) : (
                      <>
                        <Field label="Guardian" value={registration.parentGuardianName} />
                        <Field label="Cert. number" value={registration.birthCertNumber} />
                      </>
                    )}
                  </CompareCol>
                  <CompareCol title="Existing record">
                    <Field label="Name" value={flag.matched.fullName} />
                    {flag.matched.type === "ADULT" ? (
                      <Field label="ID number" value={flag.matched.governmentIdNumber} />
                    ) : (
                      <>
                        <Field label="Guardian" value={flag.matched.parentGuardianName} />
                        <Field label="Cert. number" value={flag.matched.birthCertNumber} />
                      </>
                    )}
                    <Field label="Account" value={flag.matched.user.email} />
                  </CompareCol>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Decision (FR-22) or history for decided registrations. */}
        <section className="card mt-6 p-6">
          <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--muted)" }}>
            {isPending ? "Decision" : "Decision history"}
          </h2>
          {isPending ? (
            <DecisionForm registrationId={registration.id} />
          ) : registration.decisions.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No decision recorded.
            </p>
          ) : (
            <ul className="flex flex-col gap-3">
              {registration.decisions.map((d) => (
                <li key={d.id} className="text-sm">
                  <span className="font-semibold">
                    {d.decision === "APPROVED" ? "Approved" : "Rejected"}
                  </span>{" "}
                  by {d.admin.email} on {d.decidedAt.toLocaleString()}
                  <div style={{ color: "var(--muted)" }}>Reason: {d.reason}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-xs font-medium" style={{ color: "var(--muted)" }}>
        {label}
      </dt>
      <dd className="text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

function CompareCol({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-md p-3"
      style={{ background: "var(--background)", border: "1px solid var(--border)" }}
    >
      <div className="mb-2 text-xs font-semibold" style={{ color: "var(--muted)" }}>
        {title}
      </div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
