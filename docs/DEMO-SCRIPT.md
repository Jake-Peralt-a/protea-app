# Demo Script — Registration, Verification & Approval

A ~12 minute walkthrough for showing the client (Maneesh) what has been built. Every
step below has been run end to end; the expected result after each action is stated so
you can tell immediately if something is off.

**Format:** the left column is what you do, the right is what to say. Skip §7–§8 if
you are tight on time — they are the "we thought about the edge cases" material.

---

## Before you start (5 minutes, not in front of the client)

```bash
docker compose up -d          # Postgres
npm run db:seed               # administrator account
npx tsx scripts/seed-scenario.ts   # two pending registrations, one flagged duplicate
npm run dev                   # http://localhost:3000
```

Check the queue loads at `/admin/queue` before the call starts.

**Accounts:**

| Role | Email | Password |
| --- | --- | --- |
| Administrator | `admin@futureprotea.example` | `Admin123!` |
| Pending registrant | `review.me@example.test` | `Registrant123!` |
| Flagged as a duplicate | `dupe.me@example.test` | `Registrant123!` |
| Approved child, now 18+ (§7) | `grown.up@example.test` | `Registrant123!` |
| Rejected, 3 of 3 attempts used (§7) | `cap.reached@example.test` | `Registrant123!` |

The seed script stages all four registrants, including the two edge cases §7 needs —
those states can't be reached through the UI in a reasonable time.

**Have two browser windows ready** — one normal, one incognito. Keep the administrator
signed in on one and the registrant on the other. Switching accounts by signing in and
out repeatedly is the fastest way to lose the room.

> Re-running `seed-scenario.ts` resets the demo data. If a rehearsal leaves things in a
> strange state, just run it again.

---

## 1. The problem being solved (30 seconds, no screen)

> "Today anyone can self-register and get straight in, and the same person can register
> more than once. What we've built puts an identity check and a human approval in front
> of that. Nobody reaches the application until an administrator has said yes."

---

## 2. Registering — the guided workflow (2 minutes)

**Do:** In the incognito window, go to `/signup`. Create an account with any email.

**Then:** You land on the registration wizard at step 1 of 3.

**Do:** Enter a date of birth of `15/06/1995`.

> "The first thing we ask is date of birth, because that decides what evidence we need
> from you."

**Point at:** the green notice that appears — *"Based on this date (…years), you will
register via the **adult** path."*

> "It routes automatically. An adult provides a government ID. A child provides a birth
> certificate and a parent or guardian's name. The registrant never has to work out
> which form applies to them."

**Do:** Continue. Fill in a name and an ID number, attach any PDF or photo, continue,
and submit on the review step.

**Expected:** you land on the status page showing **Under review**, with a progress
rail — Submitted → Under review → Approved.

> "They can't get any further. There's no route into the application from here."

---

## 3. The administrator's queue (2 minutes)

**Do:** Switch to the admin window, go to `/admin/queue`.

**Point at:** the three tabs and the pending count.

> "Pending is what needs an administrator. Awaiting registrant is waiting on the
> applicant — so it isn't sitting in your queue making the numbers look worse than they
> are. Decided is the history."

**Point at:** the **Possible duplicate** badge on the *Dupe Me* row.

**Do:** Open *Dupe Me*.

**Point at:** the amber duplicate panel with the side-by-side comparison.

> "The system flagged this against an existing registration on the ID number, and shows
> the administrator both records to compare. It never rejects automatically — a real
> person decides."

**Point at:** the small line under the heading — *"Visible to administrators only. The
registrant has not been told a match exists."*

> "That matters. If we told the applicant 'this ID is already registered', we'd be
> confirming that somebody else holds that number — and the form becomes a way to test
> ID numbers one at a time. So the applicant just sees 'under review'."

---

## 4. Request more information (2 minutes) — **the headline change**

**Do:** Open the registration you created in §2. Type a reason:
*"The uploaded ID is too blurry to read. Please upload a clearer photo."*
Click **Request more information**.

**Expected:** back at the queue, pending count drops by one, and the registration
appears under **Awaiting registrant**.

> "Before this, an administrator had two options: approve, or reject. A blurry photo
> meant rejecting someone who'd done nothing wrong, and putting a permanent black mark
> on their record. Now you can just ask."

**Do:** Switch to the registrant window, go to `/status`.

**Point at:** the note shown verbatim, and the line *"You have 2 of 3 submission
attempts remaining."*

**Do:** Click **Update and resubmit**.

**Point at:** the form — already filled in with their previous answers, opening at the
details step.

> "They fix the one thing that was wrong. They don't retype everything."

**Do:** Attach a different file and submit.

---

## 5. Nothing is thrown away (1 minute)

**Do:** In the admin window, open that registration again.

**Point at:** *"attempt 2 of 3"* in the header, and the collapsible **"1 document from
earlier attempts"**. Expand it.

> "The first document is still here, still viewable, marked as attempt 1. That's
> deliberate. If you'd rejected someone and they resubmitted, the old system would have
> overwritten the evidence your decision was based on. Now every attempt is kept, and
> so is every decision, with who made it and when."

**Do:** Approve it, with a reason.

**Do:** Switch to the registrant window, go to `/app`.

**Expected:** the application loads.

> "Approved, and they're in."

---

## 6. Revoking an approval (1 minute)

> "Now the harder question — what if an approval turns out to be wrong?"

**Do:** In the admin window, reopen that same registration.

**Point at:** the button set — only **Revoke approval** is offered now.

> "The screen only ever offers what's actually legal for this registration. There's no
> re-approving something already approved, and no rejecting something already decided.
> That's driven by a single set of rules the whole system shares."

**Do:** Revoke it with the reason *"Document later found to be falsified."*

**Do:** Switch to the registrant window and try `/app` again.

**Expected:** immediately bounced to `/status`, showing **Revoked** and the reason, with
no resubmit option.

> "Access is checked against the live record on every single request, so it's gone
> immediately — not at their next login. Before this change there was no way to do this
> at all except editing the database by hand, which leaves no record of who did it or
> why."

---

## 7. Two edge cases worth showing (1 minute)

**Do:** Go to `/admin/queue?view=decided`.

**Point at:** the **Now 18+** badge on the *Grown Up* row (a child registration whose
subject has since turned 18). Open it and show the amber banner.

> "A child is verified on a birth certificate and a guardian's name. That basis doesn't
> hold once they turn 18 — so the system raises its hand and asks an administrator to
> re-verify, rather than quietly carrying on."

**Point at:** the *Cap Tester* row showing **attempt 3/3**.

> "And there's a limit of three attempts, so the process can't be used to keep pushing
> a bad document past a reviewer. After that it takes an administrator to reopen it."

If they want to see the registrant's side of that, sign in as
`cap.reached@example.test` — the status page reads *"You have used all 3 submission
attempts. Please contact an administrator."* and offers no resubmit button.

---

## 8. If asked "how do you know it works?" (30 seconds)

> "There are 75 automated tests, including one that checks every legal move through the
> workflow and, more importantly, that every illegal one is refused. That runs on every
> change."

Have this ready in a terminal if they want to see it:

```bash
npm test
```

---

## Closing (30 seconds)

> "That's the workflow end to end. Two things I'd flag as still open before this goes
> live with real people's documents: we don't yet capture parental consent for under-18s,
> which is a legal requirement, and uploaded files aren't virus-scanned. Both are written
> up with recommendations — happy to walk through those separately."

---

## If something goes wrong mid-demo

| Symptom | Fix |
| --- | --- |
| Login form reloads with no error | `APP_URL` doesn't match the URL you're on. Locally it must be `http://localhost:3000`. |
| Queue is empty | Re-run `npx tsx scripts/seed-scenario.ts`. |
| "Document unavailable" | The `.storage` directory was cleared. Re-run the scenario seed. |
| Wizard won't advance | A field failed validation — the message is directly under the field. |
| Demo data is in a confusing state | Re-run the scenario seed; it resets the two demo registrants. |

**Don't demo from a fresh database.** Without `seed-scenario.ts` there is no duplicate
flag to show, and §3 is the part that lands best.
