import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { SiteHeader } from "@/components/SiteHeader";
import { RegistrationWizard } from "@/components/RegistrationWizard";

export default async function RegisterPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin/queue");

  // If a submission already exists and has not been rejected, send the user to
  // their status page instead of letting them submit again.
  const status = user.registration?.status;
  if (status && status !== "REJECTED") redirect("/status");

  return (
    <>
      <SiteHeader email={user.email} role={user.role} />
      <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-10">
        <span className="eyebrow">Registration</span>
        <h1 className="display mt-3 text-3xl">Identity registration</h1>
        <p className="mt-2 mb-6 text-sm" style={{ color: "var(--muted)" }}>
          Complete the steps below. Your registration will be reviewed by an
          administrator before access is granted.
        </p>
        {status === "REJECTED" && (
          <p className="notice notice-warning mb-6">
            Your previous registration was not approved. You can correct your details
            and submit again below.
          </p>
        )}
        <RegistrationWizard />
      </main>
    </>
  );
}
