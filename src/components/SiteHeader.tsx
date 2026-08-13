import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

export function SiteHeader({
  email,
  role,
}: {
  email?: string;
  role?: "REGISTRANT" | "ADMIN";
}) {
  return (
    <header
      className="sticky top-0 z-10 w-full border-b backdrop-blur"
      style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--background) 85%, transparent)" }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 py-3">
        <Link href="/" className="flex flex-none items-center gap-2">
          <span
            className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg text-sm font-bold"
            style={{ background: "var(--primary)", color: "var(--primary-fg)" }}
            aria-hidden
          >
            P
          </span>
          <span
            className="whitespace-nowrap font-bold"
            style={{ letterSpacing: "-0.02em" }}
          >
            Future Protea
          </span>
        </Link>
        {email ? (
          <div className="flex min-w-0 items-center gap-3 text-sm">
            {role === "ADMIN" && (
              <Link
                href="/admin/queue"
                className="flex-none whitespace-nowrap font-medium hover:underline"
                style={{ color: "var(--primary)" }}
              >
                Review queue
              </Link>
            )}
            {/* The signed-in address is orientation, not a control — it yields
                first on narrow screens so the sign-out action stays intact. */}
            <span
              className="mono-value hidden truncate text-xs sm:inline"
              style={{ color: "var(--muted)" }}
            >
              {email}
            </span>
            <form action={logout} className="flex-none">
              <button
                type="submit"
                className="btn btn-secondary btn-sm whitespace-nowrap"
              >
                Sign out
              </button>
            </form>
            <ThemeToggle />
          </div>
        ) : (
          <div className="flex flex-none items-center gap-2">
            <Link
              href="/login"
              className="btn btn-secondary btn-sm flex-none whitespace-nowrap"
            >
              Sign in
            </Link>
            <ThemeToggle />
          </div>
        )}
      </div>
    </header>
  );
}
