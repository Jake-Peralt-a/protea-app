"use client";

import { useActionState } from "react";
import { decideAction } from "@/app/admin/actions";
import type { RegistrationStatus } from "@/lib/status";
import { allowedNextStatuses } from "@/lib/transitions";

// The available buttons are derived from the transition table rather than hard-coded,
// so the UI can never offer an outcome the domain layer would refuse (BRD v1.1 §8).
const OUTCOME_LABELS: Partial<
  Record<RegistrationStatus, { label: string; className: string }>
> = {
  APPROVED: { label: "Approve", className: "btn btn-primary" },
  REJECTED: { label: "Reject", className: "btn btn-danger" },
  INFO_REQUIRED: { label: "Request more information", className: "btn btn-secondary" },
  REVOKED: { label: "Revoke approval", className: "btn btn-danger" },
};

export function DecisionForm({
  registrationId,
  status,
}: {
  registrationId: string;
  status: RegistrationStatus;
}) {
  const [state, formAction, pending] = useActionState(decideAction, undefined);
  const outcomes = allowedNextStatuses(status).filter((s) => s in OUTCOME_LABELS);

  if (outcomes.length === 0) return null;

  const isRevocation = status === "APPROVED";

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="registrationId" value={registrationId} />
      <label className="field-label" htmlFor="reason">
        {isRevocation
          ? "Reason for revoking (recorded for audit)"
          : "Decision reason (recorded for audit)"}
      </label>
      <textarea
        id="reason"
        name="reason"
        rows={3}
        required
        className="field-input"
        placeholder={
          isRevocation
            ? "e.g. Document later found to be falsified."
            : "e.g. ID verified against submitted document; no duplicate found."
        }
      />
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        {isRevocation
          ? "Revoking withdraws access immediately. This cannot be undone — the registrant cannot resubmit."
          : "If you request more information, this text is shown to the registrant. Do not include another registrant's details."}
      </p>
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {outcomes.map((outcome) => {
          const meta = OUTCOME_LABELS[outcome]!;
          return (
            <button
              key={outcome}
              type="submit"
              name="decision"
              value={outcome}
              className={meta.className}
              disabled={pending}
            >
              {pending ? "Saving…" : meta.label}
            </button>
          );
        })}
      </div>
    </form>
  );
}
