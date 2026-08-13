"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import {
  decideRegistration,
  requestMoreInfo,
  revokeRegistration,
  RegistrationConflictError,
} from "@/lib/registrations";

export interface DecisionState {
  error?: string;
}

// The four administrator outcomes (BRD v1.1 §8). APPROVED/REJECTED close the review;
// INFO_REQUIRED returns it to the registrant; REVOKED withdraws a granted approval.
const OUTCOMES = ["APPROVED", "REJECTED", "INFO_REQUIRED", "REVOKED"] as const;
type Outcome = (typeof OUTCOMES)[number];

function isOutcome(value: string): value is Outcome {
  return (OUTCOMES as readonly string[]).includes(value);
}

export async function decideAction(
  _prev: DecisionState | undefined,
  formData: FormData,
): Promise<DecisionState> {
  const admin = await requireAdmin();

  const registrationId = String(formData.get("registrationId") ?? "");
  const outcome = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (!isOutcome(outcome)) {
    return { error: "Choose an outcome for this registration." };
  }
  // A reason is required for every outcome so the audit record is meaningful (FR-22).
  if (reason.length < 3) {
    return {
      error:
        outcome === "INFO_REQUIRED"
          ? "Please describe what the registrant needs to provide."
          : "Please record a reason for this decision.",
    };
  }
  if (!registrationId) {
    return { error: "Missing registration." };
  }

  try {
    if (outcome === "INFO_REQUIRED") {
      await requestMoreInfo({ registrationId, admin: { id: admin.id }, note: reason });
    } else if (outcome === "REVOKED") {
      await revokeRegistration({ registrationId, admin: { id: admin.id }, reason });
    } else {
      await decideRegistration({
        registrationId,
        admin: { id: admin.id },
        decision: outcome,
        reason,
      });
    }
  } catch (err) {
    if (err instanceof RegistrationConflictError) {
      return { error: err.message };
    }
    throw err;
  }

  redirect("/admin/queue");
}
