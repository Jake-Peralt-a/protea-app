import { describe, it, expect } from "vitest";
import {
  adultSchema,
  childSchema,
  registrationSchema,
  validatePathMatchesAge,
} from "./validation";

const adultDob = "1990-01-01";
const childDob = "2015-01-01";

describe("adultSchema (FR-05/07)", () => {
  it("requires a plausible government ID number", () => {
    const ok = adultSchema.safeParse({
      type: "ADULT",
      fullName: "Jane Doe",
      dateOfBirth: adultDob,
      governmentIdNumber: "AB123456",
    });
    expect(ok.success).toBe(true);
  });
  it("rejects an implausible ID number", () => {
    const bad = adultSchema.safeParse({
      type: "ADULT",
      fullName: "Jane Doe",
      dateOfBirth: adultDob,
      governmentIdNumber: "!!",
    });
    expect(bad.success).toBe(false);
  });
});

describe("childSchema (FR-08..11)", () => {
  it("requires guardian name and birth-cert number", () => {
    const missing = childSchema.safeParse({
      type: "CHILD",
      fullName: "Kid Doe",
      dateOfBirth: childDob,
      parentGuardianName: "",
      birthCertNumber: "BC12345",
    });
    expect(missing.success).toBe(false);
  });
});

describe("validatePathMatchesAge (FR-02/03)", () => {
  it("flags an adult DOB submitted on the child path", () => {
    const input = registrationSchema.parse({
      type: "CHILD",
      fullName: "Adult Person",
      dateOfBirth: adultDob,
      parentGuardianName: "Guardian",
      birthCertNumber: "BC12345",
    });
    expect(validatePathMatchesAge(input)).toMatch(/adult/i);
  });
  it("accepts a matching adult path", () => {
    const input = registrationSchema.parse({
      type: "ADULT",
      fullName: "Adult Person",
      dateOfBirth: adultDob,
      governmentIdNumber: "AB123456",
    });
    expect(validatePathMatchesAge(input)).toBeNull();
  });
});
