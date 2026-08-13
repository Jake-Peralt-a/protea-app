import { describe, it, expect } from "vitest";
import {
  findDuplicate,
  isAdultDuplicate,
  isChildDuplicate,
  isCrossCategoryDuplicate,
  normalizeIdNumber,
  normalizeName,
  normalizeDob,
  type MatchableRegistration,
} from "./duplicate-check";

describe("normalisation", () => {
  it("normalises ID numbers by stripping punctuation and casing", () => {
    expect(normalizeIdNumber(" ab-12 34 ")).toBe("AB1234");
  });
  it("normalises names by lowercasing and collapsing whitespace", () => {
    expect(normalizeName("  John   Doe ")).toBe("john doe");
  });
  it("normalises a date of birth to a calendar day, from Date or string", () => {
    expect(normalizeDob("1990-01-01")).toBe("1990-01-01");
    expect(normalizeDob(new Date("1990-01-01T00:00:00.000Z"))).toBe("1990-01-01");
  });
  it("normalises an unparseable or absent date to the empty string", () => {
    expect(normalizeDob("not a date")).toBe("");
    expect(normalizeDob(null)).toBe("");
  });
});

// Distinct names and dates of birth by default, so the primary-basis tests are not
// accidentally satisfied by the cross-category name+DOB basis.
const adult = (
  id: string,
  num: string | null,
  fullName = `Adult ${id}`,
  dateOfBirth = "1990-01-01",
): MatchableRegistration => ({
  id,
  type: "ADULT",
  fullName,
  dateOfBirth,
  governmentIdNumber: num,
});

const child = (
  id: string,
  cert: string | null,
  guardian: string | null,
  fullName = `Child ${id}`,
  dateOfBirth = "2015-06-01",
): MatchableRegistration => ({
  id,
  type: "CHILD",
  fullName,
  dateOfBirth,
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

// CR-REG-002, gap W-06.
describe("cross-category duplicate basis (FR-32)", () => {
  it("matches a child who re-registers as an adult after turning 18", () => {
    const asChild = child("old", "BC9", "Jane Doe", "Sam Mokoena", "2008-03-14");
    const asAdult = adult("new", "ID-77", "Sam Mokoena", "2008-03-14");
    expect(isCrossCategoryDuplicate(asAdult, asChild)).toBe(true);
  });

  it("ignores name formatting differences", () => {
    const a = adult("a", "ID1", "  Sam   Mokoena ", "2008-03-14");
    const b = adult("b", "ID2", "sam mokoena", "2008-03-14");
    expect(isCrossCategoryDuplicate(a, b)).toBe(true);
  });

  it("does not match two people who share a name but not a date of birth", () => {
    const a = adult("a", "ID1", "Sam Mokoena", "1990-01-01");
    const b = adult("b", "ID2", "Sam Mokoena", "1974-11-02");
    expect(isCrossCategoryDuplicate(a, b)).toBe(false);
  });

  it("does not match two people who share a date of birth but not a name", () => {
    const a = adult("a", "ID1", "Sam Mokoena", "1990-01-01");
    const b = adult("b", "ID2", "Thandi Nkosi", "1990-01-01");
    expect(isCrossCategoryDuplicate(a, b)).toBe(false);
  });
});

describe("findDuplicate", () => {
  it("returns the matched record and an admin-facing reason for an adult", () => {
    const match = findDuplicate(adult("new", "AB1234"), [adult("old", "ab-1234")]);
    expect(match?.matchedRegistrationId).toBe("old");
    expect(match?.basis).toBe("ADULT_ID");
    expect(match?.adminReason.toLowerCase()).toContain("government-issued id");
  });

  it("skips the candidate's own record by id", () => {
    expect(findDuplicate(adult("same", "AB1234"), [adult("same", "AB1234")])).toBeNull();
  });

  it("returns null when there is no match", () => {
    expect(findDuplicate(adult("new", "AB1234"), [adult("old", "ZZ0000")])).toBeNull();
  });

  it("finds a cross-category match when no primary basis applies", () => {
    const asChild = child("old", "BC9", "Jane Doe", "Sam Mokoena", "2008-03-14");
    const asAdult = adult("new", "ID-77", "Sam Mokoena", "2008-03-14");
    const match = findDuplicate(asAdult, [asChild]);
    expect(match?.basis).toBe("NAME_DOB");
    expect(match?.matchedRegistrationId).toBe("old");
  });

  it("prefers an exact ID match over a weaker name+DOB match", () => {
    // `weak` shares the candidate's name and date of birth; `strong` shares the ID
    // number. The primary basis must win even though `weak` is listed first.
    const weak = adult("weak", "ZZ0000", "Sam Mokoena", "1990-01-01");
    const strong = adult("strong", "AB1234", "Someone Else", "1971-02-02");
    const candidate = adult("new", "ab-1234", "Sam Mokoena", "1990-01-01");
    const match = findDuplicate(candidate, [weak, strong]);
    expect(match?.basis).toBe("ADULT_ID");
    expect(match?.matchedRegistrationId).toBe("strong");
  });

  it("does not treat an ID number matching a certificate number as a duplicate", () => {
    expect(
      findDuplicate(adult("new", "AB1234"), [child("old", "AB1234", "AB1234")]),
    ).toBeNull();
  });
});
