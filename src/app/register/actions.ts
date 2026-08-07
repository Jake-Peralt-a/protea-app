"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/dal";
import { config } from "@/lib/config";
import { getStorage, extForMime } from "@/lib/storage";
import {
  registrationSchema,
  validatePathMatchesAge,
} from "@/lib/validation";
import {
  submitRegistration,
  RegistrationConflictError,
} from "@/lib/registrations";

export interface SubmitState {
  error?: string;
}

export async function submitRegistrationAction(
  formData: FormData,
): Promise<SubmitState> {
  const user = await requireUser();
  if (user.role === "ADMIN") {
    return { error: "Administrators do not register as applicants." };
  }

  // 1. Validate the typed fields on the server (mirrors the client wizard, FR-04).
  const parsed = registrationSchema.safeParse({
    type: formData.get("type"),
    fullName: formData.get("fullName"),
    dateOfBirth: formData.get("dateOfBirth"),
    governmentIdNumber: formData.get("governmentIdNumber") || undefined,
    parentGuardianName: formData.get("parentGuardianName") || undefined,
    birthCertNumber: formData.get("birthCertNumber") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check your details." };
  }

  const ageError = validatePathMatchesAge(parsed.data);
  if (ageError) return { error: ageError };

  // 2. Validate the uploaded document (FR-06/10/12).
  const file = formData.get("document");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Please upload the required identity document." };
  }
  if (file.size > config.uploads.maxBytes) {
    const mb = Math.round(config.uploads.maxBytes / (1024 * 1024));
    return { error: `The document is too large. Maximum size is ${mb} MB.` };
  }
  if (!config.uploads.allowedTypes.includes(file.type)) {
    return { error: "Unsupported file type. Upload a PNG, JPG, WEBP, or PDF." };
  }

  // 3. Store the document privately, then run the transactional submission.
  const bytes = new Uint8Array(await file.arrayBuffer());
  const storageKey = await getStorage().put(bytes, file.type, extForMime(file.type));

  try {
    await submitRegistration({
      user: { id: user.id, email: user.email },
      input: parsed.data,
      document: {
        storageKey,
        originalFilename: file.name,
        mimeType: file.type,
        fileSizeBytes: file.size,
      },
    });
  } catch (err) {
    // Roll back the stored file if the DB transaction failed.
    await getStorage().delete(storageKey).catch(() => {});
    if (err instanceof RegistrationConflictError) {
      return { error: err.message };
    }
    throw err;
  }

  redirect("/status");
}
