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
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-5 py-16">
        <div className="card p-9">
          <span
            className="badge"
            style={{ background: "var(--info-bg)", color: "var(--primary)" }}
          >
            Identity verification
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight">
            Register for the Future Protea application
          </h1>
          <p className="mt-3 text-base" style={{ color: "var(--muted)" }}>
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
        </div>
      </main>
    </>
  );
}
