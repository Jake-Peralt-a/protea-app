import { describe, it, expect } from "vitest";
import {
  ageInYears,
  isAdult,
  categoryForDob,
  needsAdultReverification,
} from "./age";

const asOf = new Date("2026-07-24T00:00:00Z");

describe("ageInYears", () => {
  it("computes whole years", () => {
    expect(ageInYears(new Date("2000-07-24"), asOf)).toBe(26);
  });
  it("does not count a birthday that has not occurred yet this year", () => {
    expect(ageInYears(new Date("2008-07-25"), asOf)).toBe(17);
  });
  it("counts a birthday that occurs today", () => {
    expect(ageInYears(new Date("2008-07-24"), asOf)).toBe(18);
  });
});

describe("isAdult / categoryForDob", () => {
  it("treats exactly 18 as an adult (§9)", () => {
    const dob = new Date("2008-07-24");
    expect(isAdult(dob, asOf)).toBe(true);
    expect(categoryForDob(dob, asOf)).toBe("ADULT");
  });
  it("treats one day short of 18 as a child", () => {
    const dob = new Date("2008-07-25");
    expect(isAdult(dob, asOf)).toBe(false);
    expect(categoryForDob(dob, asOf)).toBe("CHILD");
  });
});

// CR-REG-002, gap W-05.
describe("needsAdultReverification", () => {
  it("flags a child registration once the subject reaches 18", () => {
    expect(
      needsAdultReverification(
        { type: "CHILD", dateOfBirth: new Date("2008-07-24") },
        asOf,
      ),
    ).toBe(true);
  });

  it("does not flag the day before the 18th birthday", () => {
    expect(
      needsAdultReverification(
        { type: "CHILD", dateOfBirth: new Date("2008-07-25") },
        asOf,
      ),
    ).toBe(false);
  });

  it("never flags an adult registration — it is already on the adult basis", () => {
    expect(
      needsAdultReverification(
        { type: "ADULT", dateOfBirth: new Date("1990-01-01") },
        asOf,
      ),
    ).toBe(false);
  });
});
