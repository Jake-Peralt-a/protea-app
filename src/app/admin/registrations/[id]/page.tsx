import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import { prisma } from "@/lib/db";
import { SiteHeader } from "@/components/SiteHeader";
import { StatusBadge } from "@/components/StatusBadge";
import { DecisionForm } from "@/components/DecisionForm";
import type { RegistrationStatus } from "@/lib/status";
import { allowedNextStatuses, MAX_SUBMISSION_ATTEMPTS } from "@/lib/transitions";
import { needsAdultReverification } from "@/lib/age";

const MATCH_BASIS_LABEL: Record<string, string> = {
  ADULT_ID: "government-issued ID number",
  CHILD_CERT_GUARDIAN: "birth-certificate details and parent/guardian name",
  NAME_DOB: "full name and date of birth, across age categories",
};

const DECISION_LABEL: Record<string, string> = {
  APPROVED: "Approved",
  REJECTED: "Rejected",
  INFO_REQUESTED: "Returned for more information",
  REVOKED: "Approval revoked",
};

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
      documents: { orderBy: { uploadedAt: "desc" } },
      decisions: {
        orderBy: { decidedAt: "desc" },
        include: { admin: { select: { email: true } } },
      },
      duplicateFlags: {
        orderBy: { createdAt: "desc" },
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
  const isAdult = registration.type === "ADULT";
  // Outcomes are derived from the transition table, so an already-decided or revoked
  // registration simply offers none (BRD v1.1 §8).
  const canDecide = allowedNextStatuses(status).some((s) =>
    ["APPROVED", "REJECTED", "INFO_REQUIRED", "REVOKED"].includes(s),
  );
  const currentDocuments = registration.documents.filter((d) => !d.supersededAt);
  const supersededDocuments = registration.documents.filter((d) => d.supersededAt);
  const currentFlags = registration.duplicateFlags.filter((f) => !f.supersededAt);
  const needsReverification = needsAdultReverification(registration);

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
          {isAdult ? "Adult" : "Child"} registration · attempt{" "}
          <span className="mono-value">
            {registration.attemptNumber} of {MAX_SUBMISSION_ATTEMPTS}
          </span>
        </p>

        {/* Age transition (FR-48, gap W-05): a child verified on a birth certificate
            who has since turned 18 needs re-verification on the adult basis. */}
        {needsReverification && (
          <div className="notice notice-warning mt-4">
            This registrant was verified on the child path but is now 18 or older.
            Their birth-certificate and guardian details are no longer an appropriate
            identity basis — request a government-issued ID before approving.
          </div>
        )}

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
          {currentDocuments.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--muted)" }}>
              No document uploaded.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {currentDocuments.map((d) => (
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

          {/* Earlier attempts are retained, never deleted, so the evidence behind a
              previous decision remains available (FR-40, gap W-02). */}
          {supersededDocuments.length > 0 && (
            <details className="mt-5">
              <summary
                className="cursor-pointer text-sm"
                style={{ color: "var(--muted)" }}
              >
                {supersededDocuments.length} document
                {supersededDocuments.length === 1 ? "" : "s"} from earlier attempts
              </summary>
              <ul className="mt-3 flex flex-col gap-2">
                {supersededDocuments.map((d) => (
                  <li key={d.id} className="flex items-center justify-between text-sm">
                    <span style={{ color: "var(--muted)" }}>
                      Attempt <span className="mono-value">{d.attemptNumber}</span> ·{" "}
                      <span className="mono-value text-xs">{d.originalFilename}</span>
                    </span>
                    <a
                      href={`/api/documents/${d.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--primary)", fontWeight: 600 }}
                    >
                      View →
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* Duplicate comparison — admins may compare with the matched record (FR-23). */}
        {currentFlags.length > 0 && (
          <section
            className="card mt-6 p-6"
            style={{ borderColor: "var(--warning)", background: "var(--warning-bg)" }}
          >
            <h2 className="mono-label mb-1" style={{ color: "var(--warning)" }}>
              Possible duplicate detected
            </h2>
            <p className="text-xs" style={{ color: "var(--muted)" }}>
              Visible to administrators only. The registrant has not been told a match
              exists (FR-18, FR-31).
            </p>
            {currentFlags.map((flag) => (
              <div key={flag.id} className="mt-3">
                <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
                  Matched on {MATCH_BASIS_LABEL[flag.matchBasis] ?? "existing details"}.
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
          <h2 className="mono-label mb-4">{canDecide ? "Decision" : "Decision history"}</h2>
          {canDecide && <DecisionForm registrationId={registration.id} status={status} />}

          {registration.decisions.length === 0 ? (
            !canDecide && (
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                No decision recorded.
              </p>
            )
          ) : (
            <ul
              className="flex flex-col gap-3"
              style={canDecide ? { marginTop: "1.5rem" } : undefined}
            >
              {canDecide && (
                <li className="mono-label" style={{ listStyle: "none" }}>
                  Earlier decisions
                </li>
              )}
              {registration.decisions.map((d) => (
                <li key={d.id} className="text-sm">
                  <span className="font-semibold">
                    {DECISION_LABEL[d.decision] ?? d.decision}
                  </span>{" "}
                  <span className="mono-value text-xs" style={{ color: "var(--muted)" }}>
                    (attempt {d.attemptNumber})
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
