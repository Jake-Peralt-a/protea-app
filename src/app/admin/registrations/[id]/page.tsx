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
        <Link
          href="/admin/queue"
          className="text-sm transition-colors hover:text-[var(--primary)]"
          style={{ color: "var(--muted)" }}
        >
          ← Back to queue
        </Link>

        <div className="mt-3 flex items-center justify-between">
          <h1 className="display text-2xl">{registration.fullName}</h1>
          <StatusBadge status={status} />
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          <span className="mono-value">{registration.user.email}</span> ·{" "}
          {isAdult ? "Adult" : "Child"} registration
        </p>

        {/* Captured identity details (FR-21). */}
        <section className="card mt-6 p-6">
          <h2 className="mono-label mb-4">Submitted details</h2>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Field label="Full name" value={registration.fullName} />
            <Field
              label="Date of birth"
              value={registration.dateOfBirth.toLocaleDateString()}
              mono
            />
            {isAdult ? (
              <Field
                label="Government ID number"
                value={registration.governmentIdNumber}
                mono
              />
            ) : (
              <>
                <Field label="Parent/guardian" value={registration.parentGuardianName} />
                <Field
                  label="Birth-certificate number"
                  value={registration.birthCertNumber}
                  mono
                />
              </>
            )}
            <Field
              label="Submitted"
              value={registration.submittedAt?.toLocaleString() ?? "—"}
              mono
            />
          </dl>
        </section>

        {/* Uploaded documents via admin-authenticated route (FR-21, FR-13). */}
        <section className="card mt-6 p-6">
          <h2 className="mono-label mb-4">Identity document</h2>
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
                    <span className="mono-value text-xs">{d.originalFilename}</span>
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
            style={{ borderColor: "var(--warning)", background: "var(--warning-bg)" }}
          >
            <h2 className="mono-label mb-1" style={{ color: "var(--warning)" }}>
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
                <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                  <CompareCol title="This registration">
                    <Field label="Name" value={registration.fullName} />
                    {isAdult ? (
                      <Field label="ID number" value={registration.governmentIdNumber} mono />
                    ) : (
                      <>
                        <Field label="Guardian" value={registration.parentGuardianName} />
                        <Field
                          label="Cert. number"
                          value={registration.birthCertNumber}
                          mono
                        />
                      </>
                    )}
                  </CompareCol>
                  <CompareCol title="Existing record">
                    <Field label="Name" value={flag.matched.fullName} />
                    {flag.matched.type === "ADULT" ? (
                      <Field label="ID number" value={flag.matched.governmentIdNumber} mono />
                    ) : (
                      <>
                        <Field label="Guardian" value={flag.matched.parentGuardianName} />
                        <Field
                          label="Cert. number"
                          value={flag.matched.birthCertNumber}
                          mono
                        />
                      </>
                    )}
                    <Field label="Account" value={flag.matched.user.email} mono />
                  </CompareCol>
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Decision (FR-22) or history for decided registrations. */}
        <section className="card mt-6 p-6">
          <h2 className="mono-label mb-4">{isPending ? "Decision" : "Decision history"}</h2>
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
                  by{" "}
                  <span className="mono-value" style={{ color: "var(--muted)" }}>
                    {d.admin.email}
                  </span>{" "}
                  on{" "}
                  <span className="mono-value" style={{ color: "var(--muted)" }}>
                    {d.decidedAt.toLocaleString()}
                  </span>
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

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="mono-label">{label}</dt>
      <dd className={mono ? "mono-value text-sm font-medium" : "text-sm font-medium"}>
        {value || "—"}
      </dd>
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
      className="rounded-lg p-3"
      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
    >
      <div className="mono-label mb-2">{title}</div>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}
