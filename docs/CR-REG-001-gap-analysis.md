# CR-REG-001 — Gap Analysis

| Field | Detail |
| --- | --- |
| Source document | `BRD_Registration_Verification_Approval_CR-REG-001.docx`, v1.0 (Draft), 3 July 2026 |
| Implementation reviewed | branch `feat/cr-reg-001-registration-approval`, commit `00b83e6` |
| Prepared for | Maneesh Singh |
| Status | For review — Stage 1 of 3 (gap analysis → BRD v1.1 → implementation) |

## Purpose

The BRD has been implemented in full as written. This document records where the
requirements themselves are incomplete, internally contradictory, or silent on
decisions the build was forced to make on the client's behalf. It is a review of the
**specification**, not of the code.

Each gap carries a proposed disposition. Nothing below has been actioned yet; the
purpose of this stage is to agree priorities before the BRD is revised.

**Severity** — Blocker: cannot ship safely as specified. High: material business,
legal, or security exposure. Medium: causes operational pain or rework. Low: quality
of the document rather than the product.

**Disposition** — *BRD v1.1*: fold into the revised BRD and build in this programme.
*New CR*: real, but needs its own change request and budget. *Accept*: acknowledge and
consciously live with it.

---

## Summary

| Area | Blocker | High | Medium | Low | Total |
| --- | --- | --- | --- | --- | --- |
| Workflow completeness | 2 | 3 | 1 | 0 | 6 |
| Compliance & privacy | 1 | 3 | 1 | 0 | 5 |
| Security | 0 | 3 | 1 | 0 | 4 |
| Launch readiness | 1 | 1 | 2 | 0 | 4 |
| Document quality | 0 | 0 | 2 | 3 | 5 |
| **Total** | **4** | **10** | **7** | **3** | **24** |

Four blockers: no revocation path (W-03), no cutover for existing users (L-01), no
parental consent for minors (C-01), and undefined resubmission behaviour that
currently destroys audit evidence (W-02).

---

## A. Workflow completeness

*This is the area selected for design in Stages 2–3. Each of these is proposed for
BRD v1.1.*

| ID | BRD ref | Finding | Severity | Effort | Disposition |
| --- | --- | --- | --- | --- | --- |
| W-01 | §8 | §8 lists five states but gives no transition table — no statement of which transitions are legal, who triggers them, what preconditions apply, or which states are terminal. Every downstream gap in this section follows from this omission. The build inferred the transitions and enforces them through ad-hoc status checks scattered across `src/lib/registrations.ts` (lines 47–55 and 170–178) rather than one authoritative rule set. | High | S | BRD v1.1 |
| W-02 | §14 Q4, §10 | Resubmission after rejection is an open question, yet it is Must-level behaviour. The build resets a rejected registration in place and **deletes** its documents and duplicate flags (`registrations.ts:84–89`). That directly contradicts the auditability NFR in §10 and business rule §9 ("all decisions recorded"): the evidence supporting a rejection disappears the moment the registrant tries again. There is also no cap on attempts. | Blocker | M | BRD v1.1 |
| W-03 | §8, FR-22 | **No revocation path.** `APPROVED` is terminal. If an approval is later found to be fraudulent or mistaken, there is no specified way to withdraw access — `decideRegistration` refuses any registration not in `SUBMITTED`/`UNDER_REVIEW` (`registrations.ts:170–178`). The only remedy today is direct database intervention, which leaves no audit record. | Blocker | M | BRD v1.1 |
| W-04 | FR-22 | Approve and reject are the only decisions available. There is no "more information required" state. An unreadable document scan therefore forces a full rejection, which writes a permanent adverse record against the registrant and sends them back through the entire wizard. This is the single largest predictable source of the admin-queue churn that §13 already identifies as a risk. | High | M | BRD v1.1 |
| W-05 | FR-02, FR-11 | Age category is fixed at registration time and never revisited. A child approved under a birth certificate plus guardian name retains that identity basis indefinitely after turning 18. The BRD states no re-verification trigger, and the guardian relationship silently outlives its legal basis. | High | S | BRD v1.1 |
| W-06 | FR-16, FR-17 | The two matching bases cannot cross age categories, and the candidate query filters on `type` (`registrations.ts:107`). A person registered as a child who re-registers as an adult after their 18th birthday matches nothing and receives a second active registration — defeating the BRD's primary objective (§3, bullet 1). | Medium | S | BRD v1.1 |

---

## B. Compliance & privacy

*Catalogued in this pass; not designed. C-01 needs legal input before it can be
specified.*

| ID | BRD ref | Finding | Severity | Effort | Disposition |
| --- | --- | --- | --- | --- | --- |
| C-01 | FR-09, FR-11 | **No parental consent is captured anywhere.** FR-09 records the guardian's *name* and nothing else — no contact details, no consent record, no verification that this person is in fact the child's guardian. POPIA §35 requires the prior consent of a competent person to process a child's personal information; GDPR Art. 8 is equivalent. The child path is simultaneously the most sensitive path in the system and the one with no consent artefact. §13 lists "children's data handled improperly" as a risk but no requirement mitigates it. | Blocker | L | New CR (legal input first) |
| C-02 | FR-18 vs FR-31 | These two requirements contradict each other. FR-18 requires telling the registrant that a matching record may exist; FR-31 forbids disclosing another individual's information. Confirming that a given government ID number is already registered **is** a disclosure — it turns the registration form into an enumeration oracle against which ID numbers can be probed one at a time. The implementation faithfully follows FR-18 and states the matching basis verbatim (`duplicate-check.ts:39–47`). | High | S | BRD v1.1 (amend FR-18: registrant sees "under review" only; the flag is admin-visible) |
| C-03 | §10 Retention, §14 Q3 | The retention NFR ("retained only as long as required and disposed of per policy") is unmeasurable, and the retention period is an unanswered open question. A `DOCUMENT_RETENTION_DAYS` setting exists in `src/lib/config.ts` but nothing reads it — no deletion job exists. Identity documents currently accumulate indefinitely. | High | M | BRD v1.1 for the number; New CR for the deletion job |
| C-04 | §3, §10 | No right to erasure and no way to withdraw an application. A registrant cannot delete their own data or cancel a pending registration. Required under POPIA §24 / GDPR Art. 17. | High | M | New CR |
| C-05 | FR-16, C-03 | Government ID and birth-certificate numbers are stored in plaintext for the life of the record, because duplicate detection needs them. **Design suggestion:** store a salted hash for matching and retain the plaintext only until the decision is made. Matching then survives document deletion, and the retention requirement in C-03 becomes satisfiable without weakening detection. | Medium | M | New CR (bundle with C-03) |

---

## C. Security

*Catalogued in this pass; not designed.*

| ID | BRD ref | Finding | Severity | Effort | Disposition |
| --- | --- | --- | --- | --- | --- |
| S-01 | FR-12, §10 | **No malware scanning of uploads.** The system's core function is accepting files from the public and having staff open them in a browser. Neither the BRD nor the build mentions AV scanning. This is the most direct path to compromising an administrator's workstation. | High | M | New CR |
| S-02 | FR-12 | File type is trusted from the client. `src/app/register/actions.ts:57–59` checks `file.type`, which is browser-supplied and trivially forged; there is no magic-byte verification. EXIF data (including GPS coordinates on phone photographs of documents) is retained unmodified. | High | S | New CR (bundle with S-01) |
| S-03 | §13, §14 Q2 | **No separation of duties.** §14 Q2 raises reviewer-vs-approver but no requirement follows. A single administrator can unilaterally override a duplicate flag, and a registrant promoted to administrator after submitting can approve their own registration — `decideAction` checks only that the actor is an admin, never that they are unrelated to the record. | High | M | New CR |
| S-04 | §10 Performance | No rate limiting or abuse control of any kind exists in the codebase (verified: no throttling in `src/`). Registration submission, login, and signup are all unthrottled. Note also that signup discloses whether an email is already registered (`auth.ts:27`) while login deliberately does not — the two are inconsistent. | Medium | S | New CR |

---

## D. Launch readiness

| ID | BRD ref | Finding | Severity | Effort | Disposition |
| --- | --- | --- | --- | --- | --- |
| L-01 | §4.2, §14 Q5, FR-25 | **Contradiction: the out-of-scope item is a launch blocker.** §4.2 declares migration of existing users out of scope, but FR-25 blocks all access for anyone without an approved registration — so every existing user is locked out the moment this deploys. §14 Q5 admits the question is open. A cutover requirement is mandatory, not deferrable. *Note: this repository has no legacy user base (the initial commit is a fresh scaffold); the size of the affected population needs confirming against the client's live system.* | Blocker | M | BRD v1.1 (decide the policy); sizing needs client input |
| L-02 | §13, §14 Q1 | No review SLA is defined, yet §13's primary risk ("admin review becomes a bottleneck") is mitigated only by "consider SLAs". Without a target there is nothing to measure the queue against and no trigger for escalation. | High | S | BRD v1.1 |
| L-03 | §3, §13 | No metrics or reporting requirement. Approval rate, duplicate false-positive rate, and time-to-decision are all needed to manage the bottleneck in L-02, and none is specified or built. | Medium | M | New CR |
| L-04 | §7 | 28 of 31 functional requirements are priority "Must". This gives no sequencing signal and makes a phased release impossible to plan. A genuine MVP cut is needed. | Medium | S | BRD v1.1 |

---

## E. Document quality

| ID | BRD ref | Finding | Severity | Effort | Disposition |
| --- | --- | --- | --- | --- | --- |
| D-01 | §14 | All five open questions block Must-level behaviour (SLA, admin roles, retention, resubmission, existing users). They should be resolved into requirements before build, not carried in a v1.0 draft that has already been implemented. | Medium | S | BRD v1.1 |
| D-02 | §10 | Every NFR is expressed as an adjective — "securely", "promptly", "as long as required". None is testable as written. Each needs a number. | Medium | S | BRD v1.1 |
| D-03 | §12 | Acceptance criteria restate the functional requirements in prose rather than expressing testable scenarios. No negative cases, no concrete data. | Low | M | BRD v1.1 (rewrite as Given/When/Then) |
| D-04 | FR-25, FR-26 | "Shall not be able to access any part of the application" is untestable as written, because the registrant must reach the registration wizard and the status page. The exempt surface is never enumerated. | Low | S | BRD v1.1 |
| D-05 | §9 | Business rule §9 permits one *active (approved)* registration, but FR-16/17 match against all records regardless of status. The build matches every record including rejected ones, so a single rejected registration permanently blocks that ID number until an administrator intervenes. The BRD never decides which behaviour is intended. | Low | S | BRD v1.1 |

---

## Recommended sequencing

1. **BRD v1.1 (this programme)** — all of section A, plus C-02, C-03 (the number
   only), L-01, L-02, L-04, and D-01 through D-05. These are specification decisions;
   they cost analysis time, not build time.
2. **Immediately after** — S-01 and S-02 together as one upload-hardening CR. Small,
   self-contained, and the exposure is live from day one.
3. **Before any public launch** — C-01 (parental consent), pending legal input. This
   should not go live carrying children's data without it.
4. **Next quarter** — C-03/C-05 (retention and hashed identifiers) together, S-03,
   S-04, C-04, L-03.

## Decisions needed from the client before Stage 2

1. **Resubmission (W-02):** may a rejected registrant resubmit, and is there a cap on
   attempts?
2. **Revocation (W-03):** who may revoke an approval — any administrator, or a
   restricted role?
3. **Existing users (L-01):** how many are there, and are they grandfathered as
   approved or required to re-verify by a deadline?
4. **Review SLA (L-02):** what turnaround does the business commit to?
5. **Retention (C-03):** how long are identity documents kept after a decision?
6. **Duplicate scope (D-05):** does a rejected registration block a later
   registration on the same ID number?
