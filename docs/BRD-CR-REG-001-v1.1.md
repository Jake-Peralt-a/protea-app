# Future Protea App — Business Requirements Document (BRD)

## Change Request: Registration Identity Verification & Admin Approval Workflow

| Field | Detail |
| --- | --- |
| Document title | BRD — Registration Identity Verification & Admin Approval Workflow |
| Change Request ID | CR-REG-001 |
| Product / application | Future Protea App (Scoring application) |
| Prepared for | Maneesh Singh |
| Date | 13 August 2026 |
| Version | 1.1 |
| Status | For review |
| Author | Product / Business Analysis |

### Revision history

| Version | Date | Author | Summary of change |
| --- | --- | --- | --- |
| 1.0 | 3 July 2026 | Product / Business Analysis | Original draft issued for review. |
| 1.1 | 13 August 2026 | Product / Business Analysis | Workflow state machine completed; open questions resolved; NFRs made measurable. |

Section numbering follows version 1.0 exactly, so the two documents can be read side
by side. Requirement identifiers FR-01 to FR-31 are unchanged; new requirements begin
at FR-32. Where an existing requirement has been reworded, it is marked **Amended in
v1.1** with a note of what changed and why.

---

## 0. Summary of changes in v1.1

Version 1.0 was reviewed against a gap analysis (see *CR-REG-001 — Gap Analysis*,
13 August 2026). The changes below close the gaps that fall within this change
request. The reference in the last column is the gap identifier from that analysis.

| # | Section | Change | Closes |
| --- | --- | --- | --- |
| 1 | §8 | The workflow is now a complete state machine: a defined list of states, and a transition table stating every legal move, who triggers it, what must be true first, and whether access follows. Anything not listed is not permitted. | W-01 |
| 2 | §7.9, §8 | A new **Information required** outcome lets an administrator return a registration for more information instead of rejecting it outright. | W-04 |
| 3 | §7.10, §14 | Resubmission is now specified, not an open question. It is permitted, capped at three attempts, and every prior attempt — including its documents and duplicate flags — is retained rather than discarded. | W-02 |
| 4 | §7.11, §8 | A new **Revoked** state allows an administrator to withdraw an approval that turns out to be mistaken or fraudulent. Version 1.0 had no way to do this. | W-03 |
| 5 | §7.12 | A child registration whose subject reaches 18 is flagged for adult re-verification rather than continuing indefinitely on a birth-certificate basis. | W-05 |
| 6 | §7.5 (FR-32) | Duplicate detection gains a second matching basis — full name plus exact date of birth — applied across both age categories, so a child who later registers as an adult is detected. | W-06 |
| 7 | §7.5 (FR-18, FR-33) | The registrant is no longer told that a matching record may exist; they are told only that their registration is under review. The duplicate flag and its basis are visible to administrators only. This removes the contradiction between FR-18 and FR-31. | C-02 |
| 8 | §7.5 (FR-16, FR-17, FR-33) | The document now states which registration states take part in duplicate matching. A rejected registration no longer blocks a later one; a revoked one does. | D-05 |
| 9 | §4.2, §7.7 (FR-34, FR-35) | Migration of existing users is no longer out of scope. Because FR-25 locks out anyone without an approved registration, a cutover requirement is unavoidable. | L-01 |
| 10 | §7.7 (FR-25, FR-26) | The parts of the application a registrant may reach before approval are now listed explicitly, so "no access" becomes testable. | D-04 |
| 11 | §10 | Every non-functional requirement now carries a number: review turnaround, retention period, duplicate-check speed, file size limit, and accepted file formats. | D-02, L-02 |
| 12 | §7 | Priorities have been reworked. Version 1.0 marked 28 of 31 requirements as Must, which gave no sequencing signal. A minimum viable release is now named. | L-04 |
| 13 | §12 | Acceptance criteria are rewritten as Given / When / Then scenarios with example data, including negative cases. | D-03 |
| 14 | §13 | Four further exposures are recorded as visible risks: no separation of duties, no malware scanning of uploads, no parental consent for minors, and no right of erasure. All are outside this revision but must not be invisible. | S-01, S-03, C-01, C-04 |
| 15 | §14 | All five open questions are now answered and recorded as decisions. | D-01 |

**Please note:** every decision in §14 is a **recommended default proposed by the
analysis team**. They are stated as decisions so that the design is complete and
testable, not because they are settled. All are open to your revision, and changing
any of them at review stage costs nothing.

---

## 1. Purpose

This document defines the business requirements for a change to the registration
screen of the Future Protea scoring application. The change introduces a structured
registration workflow with identity verification and a mandatory administrator
approval step.

The primary objective is to ensure that a given individual cannot register more than
once, and that no user can access the application until an administrator has reviewed
the submitted identity information and approved the registration.

Version 1.1 adds a second purpose: to define what happens **after** the first
decision — when a registrant needs to correct something, when a decision needs to be
revisited, and when an approval must be withdrawn. Version 1.0 described only the
path to a first approval and was silent on everything beyond it.

---

## 2. Background & Problem Statement

The current registration process allows an individual to self-register and gain access
to the application without a verification or approval gate. This creates two problems
the business needs to address:

- **Duplicate registrations:** the same person can register multiple times (for
  example under slightly different details), which undermines the integrity of
  scoring, participation records, and reporting.
- **No approval control:** registrants can access the application immediately, before
  their identity or eligibility has been confirmed by a responsible administrator.

To resolve this, registration must capture identity evidence appropriate to whether
the registrant is an adult or a child, check for existing matching records, and route
every registration through an administrator for approval before access is granted.

**Added in v1.1.** Review of version 1.0 identified three further problems that the
original document did not address:

- An approval, once given, could not be taken back. A mistaken or fraudulent approval
  had no business remedy.
- The only way for an administrator to ask for a clearer document was to reject the
  registration, which places a permanent adverse record against a registrant whose
  only fault was a blurred photograph.
- Because the approval gate blocks everyone without an approved registration, the
  people already using the application today would lose access on the day this change
  is deployed. Version 1.0 treated this as out of scope.

---

## 3. Business Objectives

1. Prevent any individual from holding more than one active registration in the
   application.
2. Verify the identity of each registrant using evidence appropriate to their age
   category (adult vs. child).
3. Ensure an administrator reviews and explicitly approves every registration before
   access is granted.
4. Prevent all application access for a registrant until approval is complete.
5. Keep registrants informed of their status, and of what they need to do next, in
   terms that do not disclose any other person's information.
6. Maintain an auditable record of submitted identity information and approval
   decisions, including every superseded attempt.
7. *(Added in v1.1)* Allow a wrongly granted approval to be withdrawn through a
   recorded business process rather than by technical intervention.
8. *(Added in v1.1)* Move the existing user base onto the new workflow without an
   interruption of service.

---

## 4. Scope

### 4.1 In scope

- Redesign of the registration screen into a multi-step workflow.
- Adult registration path capturing government-issued ID.
- Child registration path capturing birth certificate and parent/guardian name.
- Upload of supporting identity documents for administrator review.
- Duplicate-detection check across existing registrations, including matching across
  age categories.
- Administrator review-and-approval queue and decision workflow, including returning a
  registration for more information.
- Resubmission by a registrant, within a defined attempt limit, with full retention of
  earlier attempts.
- Withdrawal (revocation) of an approval already granted.
- Flagging of child registrations whose subject has reached 18 for adult
  re-verification.
- Access lockout that prevents application use until approval.
- Status notifications to the registrant.
- **Added in v1.1:** cutover treatment of users who already hold access when this
  change is deployed (see §7.7 and decision 5 in §14).

### 4.2 Out of scope

- Automated / third-party identity verification against external government databases
  (manual administrator review only in this release).
- Changes to the scoring functionality itself.
- Payment or subscription handling.
- Separation of duties between administrators — for example preventing an
  administrator from deciding a registration in which they have an interest. See risk
  R-06 in §13 and decision 2 in §14.
- Malware scanning of uploaded documents. See risk R-07.
- Capture of parental or guardian consent for registrants under 18. See risk R-08;
  this requires legal input and is a prerequisite for public launch.
- A registrant's ability to erase their own data or withdraw a pending application.
  See risk R-09.
- Automated re-verification campaign for grandfathered users (the campaign itself is
  to be scoped separately; the cutover that makes it necessary is in scope).
- Management reporting on approval rates, false-positive rates, and time to decision.

> **Correction to v1.0.** Version 1.0 listed "bulk import or migration of existing
> users (to be assessed separately)" as out of scope. This cannot stand: FR-25 blocks
> all application access for anyone without an approved registration, so on the day
> this change is deployed every existing user is locked out. A cutover policy is
> therefore a requirement of this release, not a later assessment. It has been moved
> into scope and is specified in §7.7. *(Closes L-01.)*

---

## 5. Definitions

| Term | Definition |
| --- | --- |
| Adult | A registrant aged 18 years or older at the time of registration. |
| Child | A registrant under 18 years of age at the time of registration. |
| Duplicate | A registration whose identifying details match an existing registration record (see §7.5 and §9 for matching criteria and matching scope). |
| Administrator | An authorised user responsible for reviewing submitted identity information and approving, returning, rejecting, or revoking registrations. |
| Approval gate | The control that blocks all application access for a registrant until an administrator approves the registration. |
| **Attempt** *(new)* | One complete submission of a registration for review. The first submission is attempt 1. Each resubmission is a new, numbered attempt. Earlier attempts are retained in full. |
| **Return for more information** *(new)* | An administrator outcome that sends a registration back to the registrant for correction, without recording a rejection. |
| **Revocation** *(new)* | The withdrawal by an administrator of an approval already granted. Access is lost immediately. |
| **Locked** *(new)* | The condition of a registration that has used its permitted attempts and cannot be resubmitted without administrator intervention. |
| **Cutover** *(new)* | The deployment of this change into live service, and the treatment of users who already hold access at that moment. |
| **Final decision** *(new)* | An approval, a rejection, or a revocation. Returning for more information is not a final decision. |

---

## 6. Stakeholders

| Stakeholder | Interest |
| --- | --- |
| Registrant (adult) | Registers using government ID; needs clear status, clear next steps, and a fair route to correct a mistake. |
| Registrant (child) / parent | Registers using birth certificate and parent name. |
| Existing user at cutover | Must not lose access without warning; may be asked to re-verify later. |
| Administrator | Reviews identity evidence, resolves duplicates, approves, returns, rejects, and revokes; works to a stated turnaround target. |
| Product owner | Ensures the workflow meets integrity and compliance goals and that the release is sequenced sensibly. |
| Data / compliance | Ensures identity documents are handled, retained, and disposed of securely, and that minors' data receives heightened protection. |

---

## 7. Functional Requirements

Each requirement has a unique identifier and a priority (M = Must have, S = Should
have, C = Could have).

### Note on priorities in v1.1

Version 1.0 marked 28 of 31 requirements as Must. That is not a prioritisation — it
gives no basis for sequencing the build and makes a phased release impossible to plan.
Priorities have therefore been reworked against a single test: *is this needed for the
first release to be safe and correct, or is it needed for the first release to be
comfortable?* Only the former is Must. *(Closes L-04.)*

**The minimum viable release** is the set of Must requirements below. In plain terms
it is: capture the right identity evidence for the registrant's age, check it against
existing records, hold the registrant outside the application until an administrator
has explicitly decided, record every decision with its reason and author, allow a
wrong approval to be withdrawn, allow a registrant to try again within a fixed limit
without destroying the earlier evidence, and let today's users keep working on the day
of deployment. Everything else — side-by-side duplicate comparison, format
pre-validation, upload confirmations, status-change notifications, and age-transition
flagging — improves the experience and reduces administrator effort, but the release
is still safe without it.

The return-for-more-information requirements (§7.9) are Must. They were originally
proposed as a usability improvement that could be deferred, but they have been
delivered in this release, and the state machine in §8 depends on the **Information
required** state being present.

### 7.1 Registration entry & age routing

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-01 | The registration screen shall present a guided, multi-step workflow rather than a single open form. | M |
| FR-02 | At the start of registration the system shall determine whether the registrant is an adult (18 or older) or a child (under 18), based on date of birth. | M |
| FR-03 | The system shall route the registrant to the adult path or the child path based on the age determination. | M |
| FR-04 | The registrant shall not be able to submit the registration until all mandatory fields and documents for their path are provided. | M |

*No priority change. FR-01 remains Must: the guided multi-step workflow is the
client's original stated requirement for this change, and it has already been
delivered. Recording it as anything less would misstate what has been built.*

### 7.2 Adult registration path

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-05 | The adult path shall capture the registrant's full name, date of birth, and government-issued ID number. | M |
| FR-06 | The adult path shall require the registrant to upload a copy (photo or scan) of their government-issued ID for administrator review. | M |
| FR-07 | The system shall validate that the ID number is in a plausible format before allowing submission. | C |

*Priority change: FR-07 lowered from S to C. An administrator inspects the document
against the stated number in every case, so format pre-validation saves the registrant
a round trip but adds no control.*

### 7.3 Child registration path

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-08 | The child path shall capture the child's full name and date of birth. | M |
| FR-09 | The child path shall capture the parent/guardian's full name. | M |
| FR-10 | The child path shall require the registrant to upload a copy of the child's birth certificate for administrator review. | M |
| FR-11 | The combination of birth certificate details and parent/guardian name shall be used as the identity basis for a child registrant. | M |

### 7.4 Document upload & handling

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-12 | The system shall allow upload of identity documents in the accepted formats and within the file-size limit stated in §10. | M |
| FR-13 | Uploaded documents shall be stored securely and made available only to authorised administrators for review. | M |
| FR-14 | The system shall confirm to the registrant that their document has been received. | C |

*Amended in v1.1: FR-12 now points to §10, where the accepted formats and size limit
are stated as numbers rather than described as "common formats" and "a defined limit".
(Closes D-02.) Priority change: FR-14 lowered from S to C.*

### 7.5 Duplicate detection

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-15 | On submission, the system shall check the registration against existing records to detect potential duplicates. | M |
| FR-16 | **Amended in v1.1.** For an adult, duplicate detection shall be based on the government-issued ID number, supported by name and date of birth, and shall be applied against registrations in the states listed in FR-33. | M |
| FR-17 | **Amended in v1.1.** For a child, duplicate detection shall be based on the combination of birth certificate details and parent/guardian name, and shall be applied against registrations in the states listed in FR-33. | M |
| FR-18 | **Amended in v1.1.** Where a potential duplicate is detected, the registrant shall be told only that their registration has been received and is under review. The registrant shall not be told that a matching record may exist, nor on what basis. The duplicate flag, the matching basis, and the matched record shall be visible to administrators only. | M |
| FR-19 | A registration flagged as a potential duplicate shall be routed to an administrator for review rather than being silently blocked. | M |
| FR-32 | **New in v1.1.** In addition to the bases in FR-16 and FR-17, the system shall apply a secondary matching basis of full name together with an exact date of birth. This secondary basis shall be applied across **both** age categories, so that a person previously registered as a child is detected when they later register as an adult, and the reverse. | M |
| FR-33 | **New in v1.1.** Duplicate matching shall consider registrations in the following states: Submitted, Under review, Information required, Approved, and Revoked. Registrations in the Rejected state shall **not** be considered and shall not block a later registration. Registrations in the Draft state shall not be considered. | M |

*What changed and why:*

- **FR-16, FR-17** — version 1.0 never stated which registrations a new submission is
  matched against. Left undecided, a single rejection would block that ID number
  permanently. FR-33 now settles it. *(Closes D-05. See decision 7 in §14.)*
- **FR-18** — as written in version 1.0, FR-18 contradicted FR-31. Telling a
  registrant that their ID number already matches a record confirms that the number is
  registered to someone, which is a disclosure about that other person, and it turns
  the registration form into a means of testing ID numbers one at a time. The
  registrant now sees a single neutral status; the administrator sees everything.
  *(Closes C-02.)*
- **FR-32** — the two original matching bases share no field, so they cannot detect
  the same person across the two paths. A person registered as a child could obtain a
  second active registration simply by registering again as an adult after their 18th
  birthday, which defeats business objective 1. *(Closes W-06.)*

### 7.6 Administrator review & approval

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-20 | Administrators shall have access to a queue of pending registrations awaiting review. | M |
| FR-21 | For each pending registration, the administrator shall be able to view the captured details and the uploaded identity document(s). | M |
| FR-22 | **Amended in v1.1.** The administrator shall be able to approve, reject, or return a registration for more information, and shall be required to record a reason or note for the outcome in every case. | M |
| FR-23 | Where a registration is flagged as a potential duplicate, the administrator shall be able to compare it with the matching record and decide whether to approve or reject it. | S |
| FR-24 | **Amended in v1.1.** Every outcome — approval, rejection, return for more information, and revocation — including the administrator's identity, the reason recorded, and the date and time, shall be retained for audit purposes and shall never be removed or overwritten by a later attempt. | M |

*What changed and why:*

- **FR-22** — version 1.0 offered only approve and reject, and made the reason
  optional in wording ("shall be able to record a reason"). A third outcome is added
  (see §7.9) and the reason is now mandatory for all outcomes, because §9 requires
  every decision to be explicable and §13 requires the registrant to be given a reason
  on rejection. *(Closes W-04.)*
- **FR-24** — the wording is strengthened so that the audit record explicitly survives
  resubmission. See FR-40. *(Closes W-02.)*
- **Priority change: FR-23 lowered from M to S.** An administrator can review a
  flagged registration and reach a decision without a purpose-built comparison view;
  the comparison view makes that faster and less error-prone.

### 7.7 Access control (approval gate)

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-25 | **Amended in v1.1.** A registrant shall not be able to access any part of the application other than the exempt surface listed below, until their registration is approved by an administrator. | M |
| FR-26 | **Amended in v1.1.** While a registration is in any state other than Approved, any attempt to reach a non-exempt part of the application shall be blocked and the registrant shall be shown their current status and what, if anything, they need to do next. | M |
| FR-27 | On approval, the registrant shall be granted access and notified that their registration has been approved. | M |
| FR-28 | On rejection, the registrant shall be notified and given the reason, and shall remain unable to access the application. | M |
| FR-34 | **New in v1.1.** At cutover, every user who already holds active access to the application shall be placed directly into the Approved state, so that no existing user loses access on the day of deployment. The basis for this grandfathering shall be recorded against each such registration so that it is distinguishable, on audit, from a registration approved by review. | M |
| FR-35 | **New in v1.1.** Grandfathered registrations shall be identifiable as a group, so that a subsequent re-verification campaign can be addressed to them. The campaign itself is out of scope for this release. | S |

**Exempt surface (added in v1.1).** The following are reachable without an approved
registration, and only these:

1. The public home page.
2. The sign-in page.
3. The sign-up page.
4. The registration workflow itself, including document upload and resubmission.
5. The registration status page, including any note asking the registrant for more
   information.

Everything else — including all scoring functionality, all participation and reporting
views, and all administrator functions — is blocked. *(Closes D-04.)*

*What changed and why: "shall not be able to access any part of the application" could
not be tested as written, because the registrant must be able to reach the
registration wizard and their own status page in order to do anything at all.
FR-34/FR-35 exist because FR-25 would otherwise lock out the entire existing user base
on deployment day. (Closes L-01. See decision 5 in §14.)*

### 7.8 Notifications & status

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-29 | **Amended in v1.1.** The registrant shall be able to see the status of their registration, expressed as one of: Submitted, Under review, Information required, Approved, Rejected, Revoked. | M |
| FR-30 | The system shall notify the registrant when their status changes. | S |
| FR-31 | Reasons and notes provided to the registrant for a return, rejection, or revocation shall be clear, shall state what the registrant may do next, and must not disclose another individual's personal information. | M |

*What changed and why: FR-29 now lists all six statuses a registrant can be in. FR-31
now also covers the new return and revocation messages, and requires that the message
tell the registrant what to do next.*

### 7.9 Return for more information *(new in v1.1)*

*Closes W-04.*

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-36 | An administrator shall be able to return a registration to the registrant for more information, instead of approving or rejecting it. This is not a final decision and shall not be recorded as an adverse outcome against the registrant. | M |
| FR-37 | Returning a registration shall require the administrator to record a note explaining what is needed. The note is mandatory; the registration cannot be returned without one. The note shall be written so that it can be shown to the registrant in full, and must not contain any other individual's personal information. | M |
| FR-38 | The registrant shall be shown the note on their status page, shall be able to amend the affected details and documents, and shall be able to resubmit under §7.10. | M |

*Rationale: with only approve and reject available, an unreadable photograph forces a
full rejection. That places a permanent adverse record against a registrant who has
done nothing wrong and sends them back through the whole workflow, which is the single
most predictable source of the administrator-queue churn already identified as a risk
in §13.*

### 7.10 Resubmission *(new in v1.1)*

*Closes W-02. See decision 4 in §14.*

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-39 | A registrant shall be able to resubmit a registration that is in the Rejected state or the Information required state. Resubmission is not available from any other state. | M |
| FR-40 | Each submission shall be recorded as a separate, numbered attempt. The details, uploaded documents, duplicate flags, administrator notes, and decisions belonging to every earlier attempt shall be **retained in full and never deleted** by a resubmission. | M |
| FR-41 | An administrator reviewing a resubmission shall be able to see the current attempt number and to view every earlier attempt with its documents and its outcome. | M |
| FR-42 | A registration shall be limited to a maximum of **three** attempts in total. On a decision that would otherwise permit a fourth, the registration shall become Locked and the registrant shall be told that they must contact an administrator. | M |
| FR-43 | An administrator shall be able to permit one further attempt on a locked registration, recording a reason for doing so. | S |

*Rationale: version 1.0 left resubmission as an open question (§14 Q4) while making
the surrounding behaviour Must-level. Undefined, the natural implementation is to
overwrite the registration in place, which destroys the documents and duplicate flags
that justified the original rejection — directly contradicting the auditability
requirement in §10 and business rule 7 in §9. An uncapped right to resubmit also gives
an unlimited number of attempts to get a fraudulent document past a reviewer.*

### 7.11 Approval revocation *(new in v1.1)*

*Closes W-03. See decision 6 in §14.*

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-44 | An administrator shall be able to revoke a registration that is in the Approved state. | M |
| FR-45 | Revocation shall require the administrator to record a reason. The reason is mandatory; the registration cannot be revoked without one. | M |
| FR-46 | On revocation, the registrant's access to the application shall cease immediately, and the registrant shall be notified that their registration has been revoked and given the reason. | M |
| FR-47 | The Revoked state is final in this release. A revoked registration shall not be reinstated, shall not be resubmitted, and shall not be returned to any other state. Where a revoked individual is to be given access again, this shall be handled as a new registration case, reviewed on its own merits. A revoked registration continues to participate in duplicate matching (FR-33), so a new registration by the same individual will be flagged to an administrator. | M |

*Rationale: version 1.0 treated Approved as final. If an approval is later found to
have been granted on a forged document, or granted in error, there is no business
process to withdraw it — the only remedy is direct technical intervention in the data,
which leaves no audit record and no notification to the person affected. This is the
one gap in version 1.0 with no workaround at all.*

### 7.12 Age transition *(new in v1.1)*

*Closes W-05.*

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-48 | Where an approved child registration reaches the point at which its subject is 18 years of age, the registration shall be flagged to administrators as requiring adult re-verification. | S |
| FR-49 | An administrator shall be able to see the flagged registrations as a distinct group, and shall be able to request adult identity evidence from the registrant using the return-for-more-information route (§7.9) or, where appropriate, revoke the approval (§7.11). | S |
| FR-50 | Access shall not be withdrawn automatically on the registrant's 18th birthday. The flag is a prompt for administrator action, not an access control. | S |

*Rationale: a child registration is verified on a birth certificate together with a
guardian's name. Once the subject reaches 18, that guardian relationship no longer has
the legal standing it had at registration, but under version 1.0 the registration
would continue on that basis indefinitely, with no trigger to revisit it. Note that
this requirement flags the condition; it does not by itself provide the consent or
guardianship controls discussed in risk R-08.*

---

## 8. Registration Workflow

Version 1.0 listed the states a registration passes through but did not say which
moves between them are legal, who may make them, what must be true first, or which
states are final. This section replaces that list with a complete definition. *(Closes
W-01.)*

### 8.1 States

| State | Description | Access granted? | Final? |
| --- | --- | --- | --- |
| Draft | The registrant is completing the workflow steps. Nothing has been submitted. | No | No |
| Submitted | The registration has been submitted with all required details and documents, and is awaiting the duplicate check. | No | No |
| Under review | The registration is in the administrator queue. It may or may not carry a duplicate flag; the flag is visible to administrators only. | No | No |
| Information required | An administrator has returned the registration to the registrant for correction, with a note. No adverse decision has been recorded. | No | No |
| Approved | An administrator has approved the registration, with a reason recorded. | **Yes** | No — an approval may later be revoked. |
| Rejected | An administrator has rejected the registration, with a reason recorded. The registrant may resubmit within the attempt limit. | No | No — resubmission is permitted until the attempt limit is reached. |
| Revoked | An administrator has withdrawn an approval previously granted, with a reason recorded. | No | **Yes** |

A registration in the Rejected or Information required state that has used all three
permitted attempts is additionally marked **Locked**. Locked is a condition of the
registration, not a separate state; it prevents further resubmission until an
administrator permits another attempt under FR-43.

### 8.2 Transitions

The following are the **only** legal transitions. Any move not listed in this table is
not permitted and shall be refused, including a repeat of a decision already made.

| From | To | Trigger | Actor | Preconditions | Access after |
| --- | --- | --- | --- | --- | --- |
| Draft | Submitted | Registrant submits a complete registration. | Registrant | All mandatory fields and documents for the registrant's path are present (FR-04). | No |
| Submitted | Under review | Automatic, immediately after the duplicate check completes. | System | The duplicate check has run. A duplicate flag, if raised, is attached for administrators only. | No |
| Under review | Approved | Administrator approves. | Administrator | The registration is in Under review. A reason is recorded (mandatory). | **Yes** |
| Under review | Rejected | Administrator rejects. | Administrator | The registration is in Under review. A reason is recorded (mandatory). | No |
| Under review | Information required | Administrator returns the registration for more information. | Administrator | The registration is in Under review. A note for the registrant is recorded (mandatory, FR-37). | No |
| Information required | Submitted | Registrant amends the registration and resubmits. | Registrant | Fewer than three attempts used, or an administrator has permitted a further attempt (FR-43). All mandatory fields and documents are present. The previous attempt is retained in full (FR-40). | No |
| Rejected | Submitted | Registrant resubmits. | Registrant | Fewer than three attempts used, or an administrator has permitted a further attempt (FR-43). All mandatory fields and documents are present. The previous attempt is retained in full (FR-40). | No |
| Approved | Revoked | Administrator revokes the approval. | Administrator | The registration is in Approved. A reason is recorded (mandatory, FR-45). | No — immediately |

### 8.3 Notes on the state machine

- **Revoked is final.** There is no transition out of it. An approval, once revoked,
  can never be reinstated in this release. A revoked individual who is to be given
  access again must be handled as a **new registration case**, submitted afresh and
  reviewed on its own merits. Because a revoked registration still participates in
  duplicate matching (FR-33), that new case will be flagged to an administrator, who
  will see the earlier revocation and its reason before deciding.
- **A decided registration cannot be decided again.** An administrator attempting to
  approve, reject, or return a registration that is not in the Under review state
  shall be refused, with an explanation. This protects against two administrators
  acting on the same queue item.
- **Access follows the state and nothing else.** The only state that grants access is
  Approved. Revocation removes access at the moment it is recorded, not at the
  registrant's next sign-in.
- **Resubmission returns to Submitted, not to Under review.** Every attempt is
  re-checked for duplicates, because the population of existing registrations may have
  changed since the previous attempt.

### 8.4 Flow in narrative form

Start → determine adult or child → complete the relevant path (capture details and
upload document) → submit → duplicate check → administrator review → **approve**,
**reject**, or **return for more information**. A returned or rejected registration may
be amended and resubmitted, up to three attempts in total, after which it locks. An
approved registration grants access, and may later be revoked, which removes access
permanently.

---

## 9. Business Rules

1. A registrant aged 18 or over must register via the adult path using a
   government-issued ID.
2. A registrant under 18 must register via the child path using a birth certificate
   and parent/guardian name.
3. An individual may hold only one registration in an access-granting state at any
   time.
4. No registrant may access the application, other than the exempt surface in §7.7,
   until an administrator has approved the registration.
5. Every registration must be reviewed by an administrator before approval, including
   registrations not flagged as duplicates.
6. Where a potential duplicate is detected, the registrant is told only that their
   registration is under review. The flag, its basis, and the matched record are
   disclosed to administrators only. *(Amended in v1.1; closes C-02.)*
7. Every outcome — approval, rejection, return for more information, and revocation —
   must be recorded with the administrator's identity, a mandatory reason or note, and
   a timestamp. *(Amended in v1.1.)*
8. **New in v1.1.** No record belonging to an earlier attempt may be deleted or
   overwritten by a later attempt. Resubmission adds; it never replaces.
9. **New in v1.1.** A registration may be submitted at most three times. A fourth
   attempt requires administrator intervention.
10. **New in v1.1.** Duplicate matching considers registrations that are Submitted,
    Under review, Information required, Approved, or Revoked. Rejected registrations
    do not block a later registration.
11. **New in v1.1.** An approval may be withdrawn at any time by an administrator with
    a recorded reason. A withdrawn approval cannot be reinstated in this release.
12. **New in v1.1.** On the day this change goes live, every user who already holds
    access retains it, in an approved state marked as granted at cutover.

---

## 10. Non-Functional Requirements

Every requirement in this section now carries a number or an explicit list, so that it
can be tested rather than argued about. *(Closes D-02 and L-02.)*

| Category | Requirement | Measure |
| --- | --- | --- |
| Service level — review turnaround | Registrations awaiting an administrator decision shall be decided within a stated turnaround, measured from the moment the registration enters Under review to the moment a first outcome is recorded. Time spent in Information required (that is, waiting on the registrant) does not count towards the target. | **90% within 2 business days; 99% within 5 business days.** *(Decision 1, §14.)* |
| Retention — identity documents | Uploaded identity documents shall be deleted a fixed period after a final decision (approval, rejection, or revocation) on the registration to which they belong. | **365 days after the final decision.** *(Decision 3, §14.)* |
| Retention — decisions and audit | Decision records, reasons, duplicate flags, attempt history, and audit entries shall be retained indefinitely. Deletion of a document must not remove the record that the document existed and what was decided on it. | **Indefinite.** |
| Performance — duplicate check | The duplicate check shall complete without interrupting the registration experience. | **Within 2 seconds at the 95th percentile**, measured from submission to the registrant being shown their status. |
| Documents — size | A single uploaded identity document shall not exceed a stated size. Files above the limit shall be refused with a clear message before submission. | **10 MB per file.** |
| Documents — format | Only the following formats shall be accepted, and any other format shall be refused with a clear message. | **PNG, JPEG, WEBP, PDF.** |
| Security | Identity documents shall be stored securely and be retrievable only by authenticated administrators. No document shall be reachable by an unauthenticated request or by a registrant other than the one who uploaded it. | Verified by test: 0 documents retrievable without an administrator session. |
| Privacy / data protection | Personal and identity data shall be handled in line with applicable data-protection obligations. No message shown to a registrant shall contain any other individual's personal information, and no message shall confirm or deny that a given identity number or name is already registered. | Verified by review of every registrant-facing message; see FR-18, FR-31. |
| Auditability | The system shall retain an audit trail of every submission, duplicate flag, and outcome, including the acting administrator and timestamp, across all attempts. | Every attempt of a registration reconstructable from the audit trail after any number of resubmissions. |
| Usability | The workflow shall guide registrants step by step and communicate status, reasons, and required next steps in plain language. | Every registrant-facing status carries a plain-language explanation and, where action is needed, a stated next step. |

*Note on the retention requirement: the deletion of documents at 365 days is stated
here as a business rule. The mechanism that performs the deletion on schedule is a
separate piece of work and is noted in §13 as risk R-10.*

---

## 11. Assumptions & Dependencies

1. Administrator role(s) with appropriate permissions exist or will be provisioned.
2. Registrants can provide a photo or scan of the required identity document.
3. A secure document storage mechanism is available to the application.
4. Age category is determined from a reliable date-of-birth capture.
5. Manual review is acceptable for this release; no external identity-verification
   service is integrated.
6. **New in v1.1.** Administrator capacity is sufficient to meet the turnaround target
   in §10 at the expected registration volume. Expected volume has not yet been
   provided and is required to confirm this assumption.
7. **New in v1.1 — open dependency.** The number of users who already hold access at
   cutover is not known to the analysis team and **must be confirmed by the client**.
   The cutover policy in FR-34 does not depend on the number, but the scale, cost, and
   timing of the follow-up re-verification campaign do. This is the one item in this
   document that cannot be closed without client input.
8. **New in v1.1.** "Business day" in the turnaround target means a working day in the
   administrators' operating calendar. That calendar is to be confirmed.

---

## 12. Acceptance Criteria

Rewritten in v1.1 as Given / When / Then scenarios with example data, including
negative cases. *(Closes D-03.)* All names, numbers, and dates below are invented for
illustration.

### 12.1 Registration capture

**AC-01 — Adult registration cannot be submitted without ID evidence** *(FR-05,
FR-06)*
Given Thabo Mokoena, born 4 March 1991, is completing the adult path,
And he has entered his full name and date of birth but has not entered an ID number or
uploaded a document,
When he attempts to submit,
Then submission is refused, and he is told which items are still required.

**AC-02 — Child registration cannot be submitted without a birth certificate and
guardian name** *(FR-08, FR-09, FR-10)*
Given Lindiwe Dlamini, born 12 September 2013, is being registered on the child path,
And a birth certificate has been uploaded but the parent/guardian name is blank,
When submission is attempted,
Then submission is refused, and the missing guardian name is identified.

**AC-03 — Age routing** *(FR-02, FR-03)*
Given today is 13 August 2026,
When a date of birth of 14 August 2008 is entered,
Then the registrant is routed to the child path (the registrant is 17);
And when a date of birth of 12 August 2008 is entered,
Then the registrant is routed to the adult path.

**AC-04 — Oversized document is refused** *(FR-12, §10)*
Given Thabo Mokoena selects a scan of his ID that is 14 MB,
When he attempts to upload it,
Then the upload is refused before submission, and he is told the limit is 10 MB.

**AC-05 — Unsupported format is refused (negative)** *(FR-12, §10)*
Given Thabo Mokoena selects a file in a format other than PNG, JPEG, WEBP, or PDF,
When he attempts to upload it,
Then the upload is refused, and the four accepted formats are named.

### 12.2 Duplicate detection

**AC-06 — Duplicate is flagged to the administrator, not to the registrant** *(FR-18,
FR-31, C-02)*
Given an approved registration exists for Thabo Mokoena with ID number 9103045566081,
When a new registration is submitted with the same ID number by someone calling
themselves T. Mokoena,
Then the new registration moves to Under review and carries a duplicate flag visible to
administrators,
And the registrant is shown only "Your registration has been received and is under
review",
And no message shown to the registrant states or implies that a matching record exists.

**AC-07 — Cross-category duplicate is detected** *(FR-32, W-06)*
Given Lindiwe Dlamini was approved as a child in 2024 with date of birth 12 September
2007 and guardian Nomsa Dlamini,
And Lindiwe has since turned 18,
When she submits a new adult registration using her own government ID, with full name
"Lindiwe Dlamini" and date of birth 12 September 2007,
Then the registration is flagged as a potential duplicate on the name-and-date-of-birth
basis and routed to an administrator,
And she is shown only that her registration is under review.

**AC-08 — A rejected registration does not block a later one (negative)** *(FR-33,
D-05)*
Given a registration for ID number 8807125599082 was rejected on 1 July 2026 because
the uploaded document was unreadable,
And there is no other registration for that ID number,
When a new registration is submitted for ID number 8807125599082,
Then no duplicate flag is raised on account of the rejected record,
And the registration proceeds to Under review in the normal way.

**AC-09 — A revoked registration does block a later one** *(FR-33, FR-47)*
Given a registration for ID number 7502281234083 was approved and then revoked on 3
August 2026 for submitting a forged document,
When a new registration is submitted for the same ID number,
Then a duplicate flag is raised and the registration is routed to an administrator,
And the administrator can see the earlier revocation and its recorded reason before
deciding.

**AC-10 — Duplicate check does not delay the registrant** *(§10)*
Given a population of registrations at expected production volume,
When 100 registrations are submitted,
Then at least 95 of them reach a displayed status within 2 seconds of submission.

### 12.3 Administrator decisions

**AC-11 — Approval grants access and is recorded** *(FR-22, FR-24, FR-27)*
Given administrator Priya Naidoo is reviewing Thabo Mokoena's registration in Under
review,
When she approves it and records the reason "ID document matches details supplied",
Then the registration moves to Approved,
And Thabo can access the application,
And the audit record shows Priya Naidoo, the reason, and the date and time.

**AC-12 — A decision cannot be recorded without a reason (negative)** *(FR-22)*
Given administrator Priya Naidoo is reviewing a registration in Under review,
When she attempts to approve, reject, or return it with the reason field empty,
Then the outcome is refused and no state change occurs.

**AC-13 — An already-decided registration cannot be decided again (negative)** *(§8.2,
§8.3)*
Given Thabo Mokoena's registration was approved by Priya Naidoo at 09:15 on 13 August
2026,
When administrator Daniel Foster attempts to approve, reject, or return the same
registration at 09:16,
Then the action is refused with an explanation that the registration has already been
decided,
And no second decision is written to the audit record.

**AC-14 — Return for more information does not record an adverse outcome** *(FR-36,
FR-37, FR-38)*
Given administrator Priya Naidoo is reviewing Lindiwe Dlamini's registration and the
uploaded birth certificate is too dark to read,
When she returns it for more information with the note "The birth certificate image is
too dark to read — please upload a clearer photograph in good light",
Then the registration moves to Information required,
And the registrant sees that note in full on her status page,
And no rejection is recorded against the registration.

### 12.4 Resubmission

**AC-15 — Resubmission from Rejected** *(FR-39)*
Given Thabo Mokoena's attempt 1 was rejected on 5 August 2026,
When he amends his document and resubmits on 6 August 2026,
Then the registration moves to Submitted as attempt 2,
And it is re-checked for duplicates before returning to Under review.

**AC-16 — Prior attempts are retained** *(FR-40, FR-41)*
Given Thabo Mokoena has resubmitted after a rejection,
When administrator Priya Naidoo opens attempt 2,
Then she can see that this is attempt 2 of a maximum of 3,
And she can view attempt 1 in full — its uploaded document, its duplicate flags, and
the rejection reason recorded against it,
And nothing belonging to attempt 1 has been deleted or altered.

**AC-17 — A fourth submission is refused (negative)** *(FR-42)*
Given a registration for Thabo Mokoena has been submitted three times and rejected on
the third,
When he attempts to resubmit a fourth time,
Then the resubmission is refused,
And the registration is shown as locked,
And he is told to contact an administrator.

**AC-18 — An administrator can unlock a further attempt** *(FR-43)*
Given Thabo Mokoena's registration is locked after three attempts,
When administrator Priya Naidoo permits one further attempt with the reason "Applicant
confirmed by phone; third rejection was due to a scanning fault at our end",
Then he may submit once more as attempt 4,
And the reason is recorded in the audit trail against her name.

### 12.5 Revocation

**AC-19 — Revocation removes access immediately** *(FR-44, FR-45, FR-46)*
Given Thabo Mokoena's registration is Approved and he is signed in and using the
application,
When administrator Priya Naidoo revokes the registration with the reason "Government ID
confirmed as forged by issuing authority on 12 August 2026",
Then the registration moves to Revoked,
And his next request to any non-exempt part of the application is blocked,
And he is notified of the revocation and its reason.

**AC-20 — A revoked registrant cannot reach the application (negative)** *(FR-25,
FR-26, FR-47)*
Given Thabo Mokoena's registration is Revoked,
When he signs in and attempts to open any scoring, participation, or reporting page,
Then every such attempt is blocked,
And he is shown his status of Revoked with the recorded reason,
And he can still reach the home page, the sign-in page, and his status page.

**AC-21 — A revoked registration cannot be reinstated or resubmitted (negative)**
*(FR-47)*
Given Thabo Mokoena's registration is Revoked,
When an administrator attempts to approve, return, or otherwise reinstate that
registration, or when Thabo attempts to resubmit it,
Then every such action is refused,
And the only available route is a new registration, reviewed on its own merits.

### 12.6 Access control and cutover

**AC-22 — The exempt surface is exactly as listed** *(FR-25, FR-26, D-04)*
Given Lindiwe Dlamini's registration is in Under review,
When she attempts to reach the home page, the sign-in page, the sign-up page, the
registration workflow, and her status page,
Then all five are reachable;
And when she attempts to reach any scoring page, any participation or reporting view,
or any administrator page,
Then every one of them is blocked and she is shown her current status.

**AC-23 — Existing users keep access at cutover** *(FR-34)*
Given user Sipho Khumalo held active access to the application on the day before
deployment,
When this change is deployed,
Then Sipho can continue to use the application without interruption,
And his registration is in the Approved state,
And the audit record shows that the approval was granted at cutover rather than by
administrator review.

**AC-24 — Grandfathered users are identifiable as a group** *(FR-35)*
Given a number of registrations were approved at cutover,
When an administrator lists registrations approved at cutover,
Then all such registrations are returned as a distinct group and none approved by
review is included.

### 12.7 Age transition and retention

**AC-25 — A child registration reaching 18 is flagged** *(FR-48, FR-50)*
Given Lindiwe Dlamini holds an approved child registration and turns 18 on 12 September
2026,
When that date passes,
Then her registration is flagged to administrators as requiring adult re-verification,
And her access is not withdrawn automatically,
And an administrator can request adult identity evidence or revoke the approval.

**AC-26 — Identity documents are deleted 365 days after a final decision** *(§10)*
Given Thabo Mokoena's registration was rejected on 1 August 2025,
When 1 August 2026 passes,
Then the identity documents uploaded for that registration are no longer retrievable,
And the decision record, the reason, the duplicate flags, and the audit entries remain
in full.

**AC-27 — Review turnaround is met** *(§10)*
Given a calendar month of registrations,
When time to first outcome is measured from entry into Under review, excluding time
spent in Information required,
Then at least 90% were decided within 2 business days,
And at least 99% within 5 business days.

---

## 13. Risks & Considerations

Risks R-01 to R-05 are carried forward from version 1.0. Risks R-06 to R-10 are added
in v1.1. **Each of R-06 to R-10 is outside the scope of this revision** — none is
solved by the requirements above — and each is recorded here so that the exposure is
visible and can be scheduled deliberately.

| ID | Risk | Mitigation / consideration | Status |
| --- | --- | --- | --- |
| R-01 | Administrator review becomes a bottleneck. | Provide a clear queue, filters, and reasons. A turnaround target is now stated in §10 (90% within 2 business days) so the queue can be measured and escalated against. The return-for-more-information outcome (§7.9) removes the most common cause of avoidable rework. | Addressed in v1.1 |
| R-02 | Sensitive documents mishandled. | Enforce access controls, secure storage, and the 365-day retention limit in §10. | Addressed in v1.1 |
| R-03 | Duplicate messaging reveals third-party data. | The registrant is now told only that the registration is under review; the flag and its basis are administrator-only (FR-18). | Addressed in v1.1 |
| R-04 | Legitimate registrants blocked by a false duplicate match. | Every flagged registration is reviewed by an administrator rather than blocked (FR-19); administrators may approve over a flag; rejected registrations no longer block later ones (FR-33). | Addressed in v1.1 |
| R-05 | Children's data handled improperly. | Apply heightened protection to minors' records and guardian details. Note this is only partly mitigated — see R-08. | Partly addressed |
| R-06 | **No separation of duties for administrators.** A single administrator can override a duplicate flag and decide a registration unilaterally, with no requirement that they be unrelated to it. A registrant who later becomes an administrator could decide their own registration. | Out of scope for this release; a single administrator role is used (decision 2, §14). Every decision is attributed and auditable, which allows detection after the fact but not prevention. Recommended as a follow-on change request. *(Gap S-03.)* | **Out of scope — recorded limitation** |
| R-07 | **No malware scanning of uploaded documents.** The application accepts files from the public and asks staff to open them. This is the most direct route to compromising an administrator's workstation. | Out of scope for this release. Recommended as the first follow-on change request, bundled with verification of file type by content rather than by the label the browser supplies. *(Gap S-01.)* | **Out of scope — recorded exposure** |
| R-08 | **No parental or guardian consent is captured for registrants under 18.** FR-09 records the guardian's name only — no contact details, no consent record, and no verification that this person is in fact the child's guardian. The child path is the most sensitive path in the system and the one with no consent artefact. | Out of scope for this release and **a legal blocker: this requires legal input and should be resolved before the application is opened to the public carrying children's data.** Flagged for your attention as the highest-priority item outside this revision. *(Gap C-01.)* | **Out of scope — legal blocker before public launch** |
| R-09 | **No right of erasure and no way to withdraw an application.** A registrant cannot delete their own data or cancel a pending registration. | Out of scope for this release. Likely required under applicable data-protection law; recommended as a follow-on change request alongside the retention work. *(Gap C-04.)* | **Out of scope — recorded exposure** |
| R-10 | The 365-day document deletion in §10 is stated as a rule but the scheduled process that carries it out is separate work. Without it, documents accumulate indefinitely and the retention commitment is not met in practice. | Recommended to be scheduled with the retention change request so that the rule and the mechanism land together. | **Dependency** |

---

## 14. Decisions recorded

*Version 1.0 §14 carried five open questions. All five blocked Must-level behaviour,
and all five are answered below.*

> **Please read this first.** Every decision in this section is a **recommended default
> proposed by the analysis team**, chosen so that the specification is complete and can
> be built and tested. They are **open to your revision**. Changing any of them now
> costs analysis time only. If you disagree with a default, say so at review and it
> will be changed.

### 14.1 The five original open questions

| # | Original question (v1.0) | Decision recorded in v1.1 | Reasoning |
| --- | --- | --- | --- |
| 1 | *What is the target turnaround (SLA) for administrator review of a pending registration?* | **90% of registrations decided within 2 business days; 99% within 5 business days.** Measured from entry into Under review to the first recorded outcome, excluding time spent waiting on the registrant. Stated in §10. | Version 1.0 identified the review queue as its primary risk but mitigated it only by "consider SLAs". Without a number there is nothing to measure against and no trigger to escalate. Two business days is short enough that a registrant is not left waiting, and the 99% tail gives room for genuinely difficult cases. |
| 2 | *Are multiple administrator roles needed (e.g. reviewer vs. approver), or a single role?* | **A single administrator role in this release.** Separation of duties — preventing an administrator from deciding their own registration or one in which they have an interest — is **deferred to a separate change request** and is recorded as a known limitation in risk R-06. | Splitting the role adds meaningful build and operational cost, and with a small administrator team a two-person rule may be impractical day to day. Every decision is attributed and auditable, so misuse is detectable after the fact. This is a conscious trade-off, not an oversight, and it is visible in §13 for that reason. |
| 3 | *What is the retention period for uploaded identity documents after approval or rejection?* | **Identity documents are deleted 365 days after a final decision.** Decision records, reasons, duplicate flags, attempt history, and audit entries are **retained indefinitely.** Stated in §10. | The document is evidence for a decision; once the decision is settled and any appeal window has long passed, holding a copy of someone's ID is a liability rather than an asset. The decision itself must survive, so that the audit trail remains complete after the document is gone. If your regulator or insurer specifies a different period, that number replaces this one directly. |
| 4 | *Should rejected registrants be able to resubmit, and if so under what conditions?* | **Yes — resubmission is permitted from Rejected and from Information required, capped at three attempts in total.** Documents and duplicate flags from every prior attempt are **retained for audit and never deleted.** An administrator may permit one further attempt on a locked registration, with a recorded reason. Specified in §7.10. | Most rejections are corrective — an unreadable scan, a mistyped number — and permanently barring those people would be wrong. But an unlimited right to retry gives an unlimited number of chances to get a fraudulent document past a reviewer, so a cap is needed. Three attempts is generous for honest error and short enough to be a real limit. Retaining prior attempts is not optional: without it, resubmitting destroys the evidence that justified the rejection. |
| 5 | *How should existing already-registered users be handled when this change goes live?* | **Existing approved users are grandfathered into the Approved state at cutover**, marked so that they are distinguishable on audit from users approved by review. A **follow-up re-verification campaign is to be scoped separately.** Specified in FR-34 and FR-35. | The alternative — requiring everyone to re-verify before they can log in again — locks out the entire user base on deployment day and floods the administrator queue at the exact moment the team is least practised with it. Grandfathering keeps the service running and lets re-verification be run at a controlled pace. **Open dependency: the size of the affected population is not known to the analysis team and must be confirmed by you.** The policy does not depend on the number, but the cost and duration of the re-verification campaign do. This is the one item in this document that cannot be closed without your input. |

### 14.2 Two further decisions recorded in this revision

These did not appear as questions in version 1.0 because the behaviour they govern was
not described at all. The same caveat applies — both are recommended defaults, open to
your revision.

| # | Question | Decision recorded in v1.1 | Reasoning |
| --- | --- | --- | --- |
| 6 | *Who may revoke an approval, and can a revoked registration be reinstated?* | **Any administrator may revoke an approved registration, with a mandatory recorded reason. Revoked is final in this release** — a revoked registration is never reinstated, and a revoked individual who is to be given access again is handled as a **new registration case**. Specified in §7.11 and §8.3. | Version 1.0 had no way at all to withdraw an approval, so a mistaken or fraudulent approval could only be undone by technical intervention that left no record and told the person nothing. Restricting revocation to a senior role was considered and rejected for this release: it depends on the role split deferred under decision 2, and the ability to stop a fraudulent user quickly matters more than the ability to stop an administrator over-using it, which is auditable. Making revocation final avoids a reinstatement path that would have to re-answer "on what evidence?" — a new case answers that question properly. |
| 7 | *Does a rejected registration block a later registration on the same identity?* | **No.** Registrations in Submitted, Under review, Information required, Approved, and Revoked participate in duplicate matching. **Rejected registrations do not**, and do not block a later registration. Specified in FR-33. | A rejection is often corrective rather than a judgement on the person — an unreadable document, a wrong date typed in. Blocking permanently on it would lock out legitimate people and force administrators to unpick every case by hand. A **revoked** registration is different in kind: revocation is the deliberate withdrawal of an approval already granted, so it should and does block, bringing the earlier revocation and its reason in front of an administrator before any new approval is given. |

---

## Appendix A — Requirement index

| Group | Requirements | Status |
| --- | --- | --- |
| §7.1 Registration entry & age routing | FR-01 to FR-04 | Unchanged |
| §7.2 Adult path | FR-05 to FR-07 | FR-07 re-prioritised |
| §7.3 Child path | FR-08 to FR-11 | Unchanged |
| §7.4 Document upload & handling | FR-12 to FR-14 | FR-12 amended; FR-14 re-prioritised |
| §7.5 Duplicate detection | FR-15 to FR-19, FR-32, FR-33 | FR-16, FR-17, FR-18 amended; FR-32, FR-33 new |
| §7.6 Administrator review & approval | FR-20 to FR-24 | FR-22, FR-24 amended; FR-23 re-prioritised |
| §7.7 Access control & cutover | FR-25 to FR-28, FR-34, FR-35 | FR-25, FR-26 amended; FR-34, FR-35 new |
| §7.8 Notifications & status | FR-29 to FR-31 | FR-29, FR-31 amended |
| §7.9 Return for more information | FR-36 to FR-38 | New |
| §7.10 Resubmission | FR-39 to FR-43 | New |
| §7.11 Approval revocation | FR-44 to FR-47 | New |
| §7.12 Age transition | FR-48 to FR-50 | New |

**Totals:** 50 requirements — 31 carried forward (10 amended, 3 re-prioritised) and 19
new. 41 Must, 7 Should, 2 Could.

---

*End of document. Prepared for review by Maneesh Singh. Please mark up any decision in
§14 that you would like changed; none of them is fixed.*
