"use client";

import { useActionState } from "react";
import { decideAction } from "@/app/admin/actions";

export function DecisionForm({ registrationId }: { registrationId: string }) {
  const [state, formAction, pending] = useActionState(decideAction, undefined);

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="registrationId" value={registrationId} />
      <label className="field-label" htmlFor="reason">
        Decision reason (recorded for audit)
      </label>
      <textarea
        id="reason"
        name="reason"
        rows={3}
        required
        className="field-input"
        placeholder="e.g. ID verified against submitted document; no duplicate found."
      />
      {state?.error && (
        <p className="field-error" role="alert">
          {state.error}
        </p>
      )}
      <div className="flex gap-3">
        <button
          type="submit"
          name="decision"
          value="APPROVED"
          className="btn btn-primary"
          disabled={pending}
        >
          {pending ? "Saving…" : "Approve"}
        </button>
        <button
          type="submit"
          name="decision"
          value="REJECTED"
          className="btn btn-danger"
          disabled={pending}
        >
          {pending ? "Saving…" : "Reject"}
        </button>
      </div>
    </form>
  );
}
