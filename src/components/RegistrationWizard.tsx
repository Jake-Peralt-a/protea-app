"use client";

import { useMemo, useState, useTransition } from "react";
import { categoryForDob, ageInYears } from "@/lib/age";
import {
  adultSchema,
  childSchema,
  dobSchema,
  GOV_ID_REGEX,
  BIRTH_CERT_REGEX,
} from "@/lib/validation";
import { submitRegistrationAction } from "@/app/register/actions";

type Step = "dob" | "details" | "review";
type Category = "ADULT" | "CHILD";

const ACCEPT = ".png,.jpg,.jpeg,.webp,.pdf,image/png,image/jpeg,image/webp,application/pdf";

export function RegistrationWizard() {
  const [step, setStep] = useState<Step>("dob");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [fullName, setFullName] = useState("");
  const [governmentIdNumber, setGovernmentIdNumber] = useState("");
  const [parentGuardianName, setParentGuardianName] = useState("");
  const [birthCertNumber, setBirthCertNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const category: Category | null = useMemo(() => {
    if (!dateOfBirth || Number.isNaN(Date.parse(dateOfBirth))) return null;
    return categoryForDob(new Date(dateOfBirth));
  }, [dateOfBirth]);

  const age = useMemo(() => {
    if (!dateOfBirth || Number.isNaN(Date.parse(dateOfBirth))) return null;
    return ageInYears(new Date(dateOfBirth));
  }, [dateOfBirth]);

  function goFromDob() {
    setError(null);
    const result = dobSchema.safeParse({ dateOfBirth });
    if (!result.success) {
      setError(result.error.issues[0]?.message ?? "Enter a valid date of birth.");
      return;
    }
    setStep("details");
  }

  function goFromDetails() {
    setError(null);
    if (category === "ADULT") {
      const r = adultSchema.safeParse({
        type: "ADULT",
        fullName,
        dateOfBirth,
        governmentIdNumber,
      });
      if (!r.success) {
        setError(r.error.issues[0]?.message ?? "Please check your details.");
        return;
      }
    } else {
      const r = childSchema.safeParse({
        type: "CHILD",
        fullName,
        dateOfBirth,
        parentGuardianName,
        birthCertNumber,
      });
      if (!r.success) {
        setError(r.error.issues[0]?.message ?? "Please check your details.");
        return;
      }
    }
    if (!file) {
      setError(
        category === "ADULT"
          ? "Please upload a copy of your government-issued ID."
          : "Please upload a copy of the child's birth certificate.",
      );
      return;
    }
    setStep("review");
  }

  function submit() {
    if (!category || !file) return;
    setError(null);
    const fd = new FormData();
    fd.set("type", category);
    fd.set("fullName", fullName);
    fd.set("dateOfBirth", dateOfBirth);
    if (category === "ADULT") {
      fd.set("governmentIdNumber", governmentIdNumber);
    } else {
      fd.set("parentGuardianName", parentGuardianName);
      fd.set("birthCertNumber", birthCertNumber);
    }
    fd.set("document", file);

    startTransition(async () => {
      const result = await submitRegistrationAction(fd);
      // On success the action redirects; only an error state returns here.
      if (result?.error) setError(result.error);
    });
  }

  return (
    <div className="card p-7">
      <Stepper step={step} />

      {step === "dob" && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Step 1 · Your date of birth</h2>
          <p className="mt-1 mb-5 text-sm" style={{ color: "var(--muted)" }}>
            We use your date of birth to determine which identity documents are
            required.
          </p>
          <label className="field-label" htmlFor="dob">
            Date of birth
          </label>
          <input
            id="dob"
            type="date"
            className="field-input"
            value={dateOfBirth}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
          {category && (
            <p
              className="mt-3 rounded-md px-3 py-2 text-sm"
              style={{ background: "var(--info-bg)", color: "var(--primary)" }}
            >
              Based on this date ({age} years), you will register via the{" "}
              <strong>{category === "ADULT" ? "adult" : "child"}</strong> path.
            </p>
          )}
          {error && <p className="field-error">{error}</p>}
          <div className="mt-6 flex justify-end">
            <button type="button" className="btn btn-primary" onClick={goFromDob}>
              Continue
            </button>
          </div>
        </section>
      )}

      {step === "details" && category && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">
            Step 2 · {category === "ADULT" ? "Adult" : "Child"} identity details
          </h2>
          <p className="mt-1 mb-5 text-sm" style={{ color: "var(--muted)" }}>
            {category === "ADULT"
              ? "Provide your details and upload your government-issued ID."
              : "Provide the child's details, the parent/guardian name, and upload the birth certificate."}
          </p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="field-label" htmlFor="fullName">
                {category === "ADULT" ? "Full name" : "Child's full name"}
              </label>
              <input
                id="fullName"
                className="field-input"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>

            {category === "ADULT" ? (
              <div>
                <label className="field-label" htmlFor="govId">
                  Government-issued ID number
                </label>
                <input
                  id="govId"
                  className="field-input"
                  value={governmentIdNumber}
                  onChange={(e) => setGovernmentIdNumber(e.target.value)}
                  pattern={GOV_ID_REGEX.source}
                />
              </div>
            ) : (
              <>
                <div>
                  <label className="field-label" htmlFor="guardian">
                    Parent / guardian full name
                  </label>
                  <input
                    id="guardian"
                    className="field-input"
                    value={parentGuardianName}
                    onChange={(e) => setParentGuardianName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="cert">
                    Birth-certificate number
                  </label>
                  <input
                    id="cert"
                    className="field-input"
                    value={birthCertNumber}
                    onChange={(e) => setBirthCertNumber(e.target.value)}
                    pattern={BIRTH_CERT_REGEX.source}
                  />
                </div>
              </>
            )}

            <div>
              <label className="field-label" htmlFor="document">
                {category === "ADULT"
                  ? "Upload government-issued ID"
                  : "Upload birth certificate"}{" "}
                (PNG, JPG, WEBP, or PDF)
              </label>
              <input
                id="document"
                type="file"
                className="field-input"
                accept={ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {file && (
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  Selected: {file.name} ({Math.ceil(file.size / 1024)} KB)
                </p>
              )}
            </div>
          </div>

          {error && <p className="field-error">{error}</p>}
          <div className="mt-6 flex justify-between">
            <button type="button" className="btn btn-secondary" onClick={() => setStep("dob")}>
              Back
            </button>
            <button type="button" className="btn btn-primary" onClick={goFromDetails}>
              Continue
            </button>
          </div>
        </section>
      )}

      {step === "review" && category && (
        <section className="mt-6">
          <h2 className="text-lg font-semibold">Step 3 · Review &amp; submit</h2>
          <p className="mt-1 mb-5 text-sm" style={{ color: "var(--muted)" }}>
            Confirm your details. After submitting, an administrator must approve your
            registration before you can access the application.
          </p>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Row label="Registration type" value={category === "ADULT" ? "Adult" : "Child"} />
            <Row label={category === "ADULT" ? "Full name" : "Child's name"} value={fullName} />
            <Row label="Date of birth" value={dateOfBirth} />
            {category === "ADULT" ? (
              <Row label="Government ID number" value={governmentIdNumber} />
            ) : (
              <>
                <Row label="Parent/guardian" value={parentGuardianName} />
                <Row label="Birth-certificate number" value={birthCertNumber} />
              </>
            )}
            <Row label="Document" value={file?.name ?? "—"} />
          </dl>

          {error && <p className="field-error mt-4">{error}</p>}
          <div className="mt-6 flex justify-between">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setStep("details")}
              disabled={isPending}
            >
              Back
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={submit}
              disabled={isPending}
            >
              {isPending ? "Submitting…" : "Submit registration"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium" style={{ color: "var(--muted)" }}>
        {label}
      </dt>
      <dd className="text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}

function Stepper({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: "dob", label: "Date of birth" },
    { id: "details", label: "Identity details" },
    { id: "review", label: "Review" },
  ];
  const activeIndex = steps.findIndex((s) => s.id === step);
  return (
    <ol className="flex items-center gap-2 text-xs font-medium">
      {steps.map((s, i) => {
        const done = i < activeIndex;
        const active = i === activeIndex;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span
              className="inline-flex h-6 w-6 items-center justify-center rounded-full"
              style={{
                background: active || done ? "var(--primary)" : "var(--info-bg)",
                color: active || done ? "var(--primary-fg)" : "var(--muted)",
              }}
            >
              {i + 1}
            </span>
            <span style={{ color: active ? "var(--foreground)" : "var(--muted)" }}>
              {s.label}
            </span>
            {i < steps.length - 1 && (
              <span aria-hidden style={{ color: "var(--border)" }}>
                ›
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
