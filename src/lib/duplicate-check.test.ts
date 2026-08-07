import { describe, it, expect } from "vitest";
import {
  findDuplicate,
  isAdultDuplicate,
  isChildDuplicate,
  normalizeIdNumber,
  normalizeName,
  type MatchableRegistration,
} from "./duplicate-check";

describe("normalisation", () => {
  it("normalises ID numbers by stripping punctuation and casing", () => {
    expect(normalizeIdNumber(" ab-12 34 ")).toBe("AB1234");
  });
  it("normalises names by lowercasing and collapsing whitespace", () => {
    expect(normalizeName("  John   Doe ")).toBe("john doe");
  });
});

const adult = (id: string, num: string | null): MatchableRegistration => ({
  id,
  type: "ADULT",
  governmentIdNumber: num,
});

const child = (
  id: string,
  cert: string | null,
  guardian: string | null,
): MatchableRegistration => ({
  id,
  type: "CHILD",
  birthCertNumber: cert,
  parentGuardianName: guardian,
});

describe("adult duplicate basis (FR-16)", () => {
  it("matches the same ID number despite formatting differences", () => {
    expect(isAdultDuplicate(adult("a", "AB-1234"), adult("b", "ab1234"))).toBe(true);
  });
  it("does not match different ID numbers", () => {
    expect(isAdultDuplicate(adult("a", "AB1234"), adult("b", "ZZ9999"))).toBe(false);
  });
  it("does not match when an ID number is missing", () => {
    expect(isAdultDuplicate(adult("a", null), adult("b", null))).toBe(false);
  });
});

describe("child duplicate basis (FR-17)", () => {
  it("matches on birth-cert number AND guardian name together", () => {
    expect(
      isChildDuplicate(child("a", "BC-9", "Jane Doe"), child("b", "bc9", "jane  doe")),
    ).toBe(true);
  });
  it("does not match when only the certificate matches", () => {
    expect(
      isChildDuplicate(child("a", "BC9", "Jane Doe"), child("b", "BC9", "Other Name")),
    ).toBe(false);
  });
  it("does not match when only the guardian matches", () => {
    expect(
      isChildDuplicate(child("a", "BC9", "Jane Doe"), child("b", "XX1", "Jane Doe")),
    ).toBe(false);
  });
});

describe("findDuplicate", () => {
  it("returns the matched record and a privacy-safe reason for an adult", () => {
    const match = findDuplicate(adult("new", "AB1234"), [adult("old", "ab-1234")]);
    expect(match?.matchedRegistrationId).toBe("old");
    expect(match?.basis).toBe("ADULT_ID");
    expect(match?.reason).not.toContain("old");
    expect(match?.reason.toLowerCase()).toContain("government-issued id");
  });

  it("skips the candidate's own record by id", () => {
    expect(findDuplicate(adult("same", "AB1234"), [adult("same", "AB1234")])).toBeNull();
  });

  it("returns null when there is no match", () => {
    expect(findDuplicate(adult("new", "AB1234"), [adult("old", "ZZ0000")])).toBeNull();
  });

  it("does not cross adult and child bases", () => {
    expect(findDuplicate(adult("new", "AB1234"), [child("old", "AB1234", "AB1234")])).toBeNull();
  });
});
