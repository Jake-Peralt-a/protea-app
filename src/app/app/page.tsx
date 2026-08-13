import { requireApprovedRegistrant } from "@/lib/dal";
import { SiteHeader } from "@/components/SiteHeader";

// The gated "scoring application". Reachable only by an APPROVED registrant; the
// approval gate (FR-25..27) is enforced server-side here, not just in the proxy.
export default async function ApplicationPage() {
  const user = await requireApprovedRegistrant();

  return (
    <>
      <SiteHeader email={user.email} role={user.role} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-20">
        <div className="card p-8">
          <span
            className="badge"
            style={{ background: "var(--success-bg)", color: "var(--success)" }}
          >
            Approved
          </span>
          <h1 className="display mt-5 text-2xl">
            Welcome to the Future Protea application
          </h1>
          <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
            Your registration has been approved. This is where the scoring application
            would appear (out of scope for CR-REG-001).
          </p>
          <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
            You&apos;ll be notified here once the scoring application is ready to open.
          </p>
        </div>
      </main>
    </>
  );
}
