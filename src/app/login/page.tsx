import Link from "next/link";
import { login } from "@/app/actions/auth";
import { CredentialsForm } from "@/components/CredentialsForm";
import { SiteHeader } from "@/components/SiteHeader";

export default function LoginPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12">
        <div className="card p-7">
          <h1 className="text-xl font-semibold">Sign in</h1>
          <p className="mt-1 mb-6 text-sm" style={{ color: "var(--muted)" }}>
            Access your Future Protea registration.
          </p>
          <CredentialsForm action={login} submitLabel="Sign in" pendingLabel="Signing in…" />
          <p className="mt-6 text-sm" style={{ color: "var(--muted)" }}>
            New here?{" "}
            <Link href="/signup" style={{ color: "var(--primary)", fontWeight: 600 }}>
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
