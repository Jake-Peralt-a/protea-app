# Future Protea — Registration Identity Verification & Admin Approval (CR-REG-001)

A Next.js + Postgres implementation of the BRD `CR-REG-001` registration workflow:
guided multi-step registration with age-appropriate identity verification
(adult → government ID; child → birth certificate + guardian), duplicate detection,
and a **mandatory administrator approval gate** before any application access, with a
full audit trail.

## Stack

- **Next.js 16** (App Router, TypeScript) + **React 19**, Tailwind v4
- **Postgres** via **Prisma 7** (driver adapter `@prisma/adapter-pg`)
- Custom credential auth: **bcryptjs** + **jose** signed httpOnly session cookie,
  roles `REGISTRANT` / `ADMIN` (see "Deviations" below)
- Private document storage behind a pluggable `StorageDriver` (local FS driver by
  default; S3 seam for production)
- **vitest** for unit + integration tests

## Prerequisites

- Node 20+ and Docker (for the local Postgres container)

## Setup

```bash
cp .env.example .env          # then set AUTH_SECRET (openssl rand -hex 32)
docker compose up -d          # Postgres on localhost:5433
npm install
npx prisma migrate dev        # apply schema
npm run db:seed               # seed the administrator account
npm run dev                   # http://localhost:3000
```

Default seeded administrator (from `.env`): `admin@futureprotea.example` / `Admin123!`.

### Optional: demo data

`npx tsx scripts/seed-scenario.ts` stages two pending registrations (one flagged as a
potential duplicate of the other) with real private document files, so the admin
review UI and approval gate can be exercised without a manual upload:

- `review.me@example.test` / `Registrant123!` (pending)
- `dupe.me@example.test` / `Registrant123!` (pending, flagged duplicate)

## How it works

- **Registrant** signs up, completes the wizard (`/register`): step 1 captures DOB and
  routes to the adult or child path; the path collects the identity fields and requires
  a document upload; step 3 reviews and submits.
- **Submission** validates server-side, stores the document privately, runs duplicate
  detection, and moves the registration to `UNDER_REVIEW`.
- **Approval gate**: a non-approved registrant is redirected to `/status` and cannot
  reach `/app`. Enforced by `src/lib/dal.ts` (authoritative, DB-backed) and by the
  optimistic `src/proxy.ts`.
- **Administrator** reviews the queue (`/admin/queue`), views details + document, sees
  a side-by-side comparison for potential duplicates, and approves/rejects with a
  required reason. Decisions and key events are written to `ApprovalDecision` and the
  append-only `AuditLog`.

## Requirement mapping

| Area | Where |
| --- | --- |
| Age routing, adult/child paths, upload (FR-01..14) | `src/components/RegistrationWizard.tsx`, `src/lib/validation.ts`, `src/app/register/actions.ts` |
| Duplicate detection (FR-15..19) | `src/lib/duplicate-check.ts`, `src/lib/registrations.ts` |
| Admin review & audited decisions (FR-20..24) | `src/app/admin/**`, `src/lib/registrations.ts`, `src/lib/audit.ts` |
| Approval gate (FR-25..28) | `src/lib/dal.ts`, `src/proxy.ts`, `src/app/app/page.tsx` |
| Status & notifications (FR-29..31) | `src/app/status/page.tsx`, `src/lib/notify.ts` |
| Private document access (FR-13) | `src/lib/storage.ts`, `src/app/api/documents/[id]/route.ts` |

## Tests

```bash
npm run test     # 22 unit + 5 integration (integration hits the running Postgres)
npm run build    # production build + typecheck
```

The integration test (`test/registration-flow.integration.test.ts`) drives the real
domain against Postgres: submission → duplicate detection → approve/reject → audit
trail, mapping to acceptance criteria AC-3, AC-5, AC-6, AC-7.

## Deviations from the original plan

- **Auth**: implemented a small custom credential/session layer (jose + bcrypt) — the
  exact pattern the Next.js docs recommend — instead of Auth.js v5, which is still beta
  and unproven against the just-released Next 16. Lower risk, same capability.
- **Storage**: the local private-filesystem driver is fully implemented and used for
  dev; the S3 driver is a documented seam (`S3StorageDriver`) to implement against
  `@aws-sdk/client-s3` for production. No MinIO/Docker storage service required locally.
- **Email**: the `log` driver records notifications to the server log in dev; an SMTP
  (nodemailer) driver is a documented seam. In-app status/notifications are fully built.
- **Forms**: the wizard uses controlled React state with the shared zod schemas rather
  than react-hook-form; client and server validation share the same schemas.

## Open questions (BRD §14) — current defaults

Single `ADMIN` role; rejected registrants may resubmit (supersedes the rejected
record); document retention is a configurable TTL (`DOCUMENT_RETENTION_DAYS`); no hard
review SLA; migration of pre-existing users is out of scope.
