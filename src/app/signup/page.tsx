import Link from "next/link";
import { signup } from "@/app/actions/auth";
import { CredentialsForm } from "@/components/CredentialsForm";
import { SiteHeader } from "@/components/SiteHeader";

export default function SignupPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12">
        <span className="eyebrow mb-4 self-start">Create account</span>
        <div className="card p-7">
          <h1 className="display text-2xl">Create your account</h1>
          <p className="mt-1 mb-6 text-sm" style={{ color: "var(--muted)" }}>
            Create an account, then complete identity registration for administrator
            approval.
          </p>
          <CredentialsForm action={signup} submitLabel="Create account" pendingLabel="Creating…" />
          <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>
            Already registered?{" "}
            <Link
              href="/login"
              className="hover:underline"
              style={{ color: "var(--primary)", fontWeight: 600 }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
