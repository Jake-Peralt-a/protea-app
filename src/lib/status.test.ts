import { describe, it, expect } from "vitest";
import { STATUS_META, type RegistrationStatus } from "./status";

// The approval gate in src/lib/dal.ts is a single `status !== "APPROVED"` check, and
// every UI surface reads accessGranted from this map. Pinning the invariant here
// means adding a new state can never accidentally grant access (FR-25/26).
describe("access mapping (FR-25/26)", () => {
  const statuses = Object.keys(STATUS_META) as RegistrationStatus[];

  it("grants access in APPROVED and nowhere else", () => {
    const granting = statuses.filter((s) => STATUS_META[s].accessGranted);
    expect(granting).toEqual(["APPROVED"]);
  });

  it("denies access in the two states added by CR-REG-002", () => {
    expect(STATUS_META.INFO_REQUIRED.accessGranted).toBe(false);
    expect(STATUS_META.REVOKED.accessGranted).toBe(false);
  });

  it("describes every state, so the registrant always sees something (FR-29)", () => {
    for (const status of statuses) {
      expect(STATUS_META[status].label).toBeTruthy();
      expect(STATUS_META[status].description).toBeTruthy();
    }
  });
});
