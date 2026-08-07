// Stateless session management with a signed JWT stored in an httpOnly cookie.
// Follows the Next.js "custom auth" guidance (jose + cookies). The payload holds
// only the stable identifiers (user id + role); the authoritative approval status
// is always read from the database in the data-access layer, never trusted from
// the token.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { config } from "./config";

export type Role = "REGISTRANT" | "ADMIN";

export interface SessionPayload {
  userId: string;
  role: Role;
  [key: string]: unknown;
}

export const SESSION_COOKIE = "protea_session";
const MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function key() {
  return new TextEncoder().encode(config.authSecret);
}

export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(key());
}

export async function decryptSession(
  token: string | undefined,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (typeof payload.userId === "string" && typeof payload.role === "string") {
      return { userId: payload.userId, role: payload.role as Role };
    }
    return null;
  } catch {
    return null;
  }
}

/** Create the session cookie. Call only from a Server Action or Route Handler. */
export async function createSession(userId: string, role: Role): Promise<void> {
  const token = await encryptSession({ userId, role });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

/** Read + verify the session from the request cookies (server components/actions). */
export async function readSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  return decryptSession(cookieStore.get(SESSION_COOKIE)?.value);
}
