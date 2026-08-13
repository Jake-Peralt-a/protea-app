import { describe, it, expect } from "vitest";
import {
  assertTransition,
  canTransition,
  allowedNextStatuses,
  isTerminal,
  IllegalTransitionError,
  DUPLICATE_MATCHING_STATUSES,
  RESUBMITTABLE_STATUSES,
  MAX_SUBMISSION_ATTEMPTS,
  type RegistrationStatus,
} from "./transitions";

const ALL_STATUSES: RegistrationStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "INFO_REQUIRED",
  "APPROVED",
  "REJECTED",
  "REVOKED",
];

// Every row of the BRD v1.1 §8 transition table, stated independently of the
// implementation so a change to the table is a change to this list too.
const LEGAL: [RegistrationStatus, RegistrationStatus][] = [
  ["DRAFT", "SUBMITTED"],
  ["SUBMITTED", "UNDER_REVIEW"],
  ["UNDER_REVIEW", "APPROVED"],
  ["UNDER_REVIEW", "REJECTED"],
  ["UNDER_REVIEW", "INFO_REQUIRED"],
  ["INFO_REQUIRED", "SUBMITTED"],
  ["REJECTED", "SUBMITTED"],
  ["APPROVED", "REVOKED"],
];

describe("the transition table (BRD v1.1 §8)", () => {
  it.each(LEGAL)("allows %s → %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
    expect(() => assertTransition(from, to)).not.toThrow();
  });

  it("rejects every transition not in the table", () => {
    const legal = new Set(LEGAL.map(([from, to]) => `${from}→${to}`));
    const illegal: string[] = [];

    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const edge = `${from}→${to}`;
        if (legal.has(edge)) continue;
        if (canTransition(from, to)) illegal.push(edge);
      }
    }

    expect(illegal).toEqual([]);
  });

  // Named cases, so a regression names itself in the failure output.
  it.each([
    ["APPROVED", "APPROVED"], // an approval cannot be re-applied
    ["APPROVED", "REJECTED"], // a decided registration cannot be re-decided
    ["REJECTED", "APPROVED"], // rejection must go through resubmission and review
    ["REVOKED", "APPROVED"], // no reinstatement in this release
    ["REVOKED", "SUBMITTED"], // a revoked registrant cannot simply try again
    ["UNDER_REVIEW", "SUBMITTED"], // no resubmitting while under review
    ["SUBMITTED", "APPROVED"], // the duplicate check must run first
    ["DRAFT", "APPROVED"], // cannot approve an unsubmitted registration
  ] as [RegistrationStatus, RegistrationStatus][])(
    "refuses %s → %s",
    (from, to) => {
      expect(canTransition(from, to)).toBe(false);
      expect(() => assertTransition(from, to)).toThrow(IllegalTransitionError);
    },
  );

  it("names both states in the error, for the audit trail", () => {
    expect(() => assertTransition("REVOKED", "APPROVED")).toThrow(
      /REVOKED to APPROVED/,
    );
  });
});

describe("terminal states", () => {
  it("treats REVOKED as terminal with no way out", () => {
    expect(isTerminal("REVOKED")).toBe(true);
    expect(allowedNextStatuses("REVOKED")).toEqual([]);
  });

  it("does not treat APPROVED as terminal — it can still be revoked (gap W-03)", () => {
    expect(isTerminal("APPROVED")).toBe(false);
    expect(allowedNextStatuses("APPROVED")).toContain("REVOKED");
  });
});

describe("duplicate matching scope (FR-33, gap D-05)", () => {
  it("excludes REJECTED so a rejection never permanently blocks an ID number", () => {
    expect(DUPLICATE_MATCHING_STATUSES).not.toContain("REJECTED");
  });

  it("includes REVOKED so revocation cannot be escaped by re-registering", () => {
    expect(DUPLICATE_MATCHING_STATUSES).toContain("REVOKED");
  });

  it("includes every state that grants or is en route to access", () => {
    expect(DUPLICATE_MATCHING_STATUSES).toEqual(
      expect.arrayContaining(["SUBMITTED", "UNDER_REVIEW", "INFO_REQUIRED", "APPROVED"]),
    );
  });
});

describe("resubmission (FR-39/FR-42)", () => {
  it("permits resubmission exactly from the states the table allows", () => {
    const fromTable = ALL_STATUSES.filter((s) => canTransition(s, "SUBMITTED"));
    expect([...RESUBMITTABLE_STATUSES].sort()).toEqual(fromTable.sort());
  });

  it("caps attempts at 3", () => {
    expect(MAX_SUBMISSION_ATTEMPTS).toBe(3);
  });
});
