import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/dal";
import { SiteHeader } from "@/components/SiteHeader";

export default async function HomePage() {
  const user = await getCurrentUser();

  if (user) {
    if (user.role === "ADMIN") redirect("/admin/queue");
    if (!user.registration) redirect("/register");
    if (user.registration.status === "APPROVED") redirect("/app");
    redirect("/status");
  }

  return (
    <>
      <SiteHeader />
      <main className="band flex-1">
        <div className="mx-auto w-full max-w-3xl px-5 py-20">
          <span className="eyebrow">Identity verification</span>
          <h1 className="display mt-5 text-4xl sm:text-5xl">
            Register once — verified for{" "}
            <span className="accent-gradient">every match you play</span>
          </h1>
          <p className="mt-4 max-w-xl text-base leading-relaxed" style={{ color: "var(--muted)" }}>
            Registration includes identity verification appropriate to your age and a
            mandatory administrator approval step. You will not be able to access the
            application until an administrator has reviewed and approved your
            registration.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link href="/signup" className="btn btn-primary">
              Create an account
            </Link>
            <Link href="/login" className="btn btn-secondary">
              Sign in
            </Link>
          </div>
          <dl className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-3">
            <div>
              <dt className="mono-label">Registration path</dt>
              <dd className="mt-1.5 text-sm" style={{ color: "var(--foreground)" }}>
                Adult or child, based on age
              </dd>
            </div>
            <div>
              <dt className="mono-label">Verification</dt>
              <dd className="mt-1.5 text-sm" style={{ color: "var(--foreground)" }}>
                Identity document required
              </dd>
            </div>
            <div>
              <dt className="mono-label">Access</dt>
              <dd className="mt-1.5 text-sm" style={{ color: "var(--foreground)" }}>
                Granted after admin approval
              </dd>
            </div>
          </dl>
        </div>
      </main>
    </>
  );
}
