"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { credentialsSchema } from "@/lib/validation";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createSession, destroySession } from "@/lib/session";
import { recordAudit } from "@/lib/audit";

export interface AuthState {
  error?: string;
}

export async function signup(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }
  const { email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "An account with that email already exists. Please sign in." };
  }

  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), role: "REGISTRANT" },
  });
  await recordAudit({ action: "ACCOUNT_CREATED", actorId: user.id });
  await createSession(user.id, "REGISTRANT");

  redirect("/register");
}

export async function login(
  _prev: AuthState | undefined,
  formData: FormData,
): Promise<AuthState> {
  const parsed = credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  // Uniform error message to avoid leaking which emails are registered.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return { error: "Invalid email or password." };
  }

  await createSession(user.id, user.role);
  redirect("/");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
