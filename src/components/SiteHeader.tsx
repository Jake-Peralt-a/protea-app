import Link from "next/link";
import { logout } from "@/app/actions/auth";

export function SiteHeader({
  email,
  role,
}: {
  email?: string;
  role?: "REGISTRANT" | "ADMIN";
}) {
  return (
    <header
      className="w-full border-b"
      style={{ borderColor: "var(--border)", background: "var(--surface)" }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-sm font-bold"
            style={{ background: "var(--primary)", color: "var(--primary-fg)" }}
            aria-hidden
          >
            P
          </span>
          <span className="font-semibold">Future Protea</span>
        </Link>
        {email ? (
          <div className="flex items-center gap-3 text-sm">
            {role === "ADMIN" && (
              <Link href="/admin/queue" className="font-medium" style={{ color: "var(--primary)" }}>
                Review queue
              </Link>
            )}
            <span style={{ color: "var(--muted)" }}>{email}</span>
            <form action={logout}>
              <button type="submit" className="btn btn-secondary" style={{ padding: "0.35rem 0.75rem" }}>
                Sign out
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="btn btn-secondary" style={{ padding: "0.35rem 0.75rem" }}>
            Sign in
          </Link>
        )}
      </div>
    </header>
  );
}
