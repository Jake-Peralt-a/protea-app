"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/dal";
import {
  decideRegistration,
  RegistrationConflictError,
} from "@/lib/registrations";

export interface DecisionState {
  error?: string;
}

export async function decideAction(
  _prev: DecisionState | undefined,
  formData: FormData,
): Promise<DecisionState> {
  const admin = await requireAdmin();

  const registrationId = String(formData.get("registrationId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const reason = String(formData.get("reason") ?? "").trim();

  if (decision !== "APPROVED" && decision !== "REJECTED") {
    return { error: "Choose approve or reject." };
  }
  // A reason is required for every decision so the audit record is meaningful (FR-22).
  if (reason.length < 3) {
    return { error: "Please record a reason for this decision." };
  }
  if (!registrationId) {
    return { error: "Missing registration." };
  }

  try {
    await decideRegistration({
      registrationId,
      admin: { id: admin.id },
      decision,
      reason,
    });
  } catch (err) {
    if (err instanceof RegistrationConflictError) {
      return { error: err.message };
    }
    throw err;
  }

  redirect("/admin/queue");
}
