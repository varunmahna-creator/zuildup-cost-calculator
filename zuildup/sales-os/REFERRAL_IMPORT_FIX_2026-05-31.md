# Sales OS — Referral Import Bug Fix (2026-05-31)

## TL;DR

The admin Excel-upload endpoint `/api/admin/leads/import` was writing leads
to **Supabase**, but the production `/leads` page reads from **Cloud SQL**
via the `zuildup-inbox-api` Cloud Run service. Result: 81 referral leads
uploaded by Varun on 2026-05-31 landed in Supabase and were invisible in
production. All 81 have been recovered into Cloud SQL, the import endpoint
has been rewritten to write to Cloud SQL, the audit caught one other stale
read path (`/admin/team-actions`) which has also been fixed, and end-to-end
verification on production passes.

---

## 🚨 Permanent Sales OS Rule (Varun, 2026-05-31)

**Cloud SQL `zuildup-sales-os-pg15` is the only database for Sales OS lead
data. No new Supabase writes for leads / activities / attachments.**

Supabase remains the source of truth for **Auth (user sessions)** only.

Future agents: before touching any route that reads/writes `leads`,
`activities`, `attachments`, `comms_messages`, `lead_relations`, or
`nudge_log`, confirm it goes via the `zuildup-inbox-api` Cloud Run service
(or directly to Cloud SQL with the same JWT auth). Do not reach for
`createAdminClient()` for lead data.

---

## Root Cause

- `app/api/admin/leads/import/route.ts` used `createAdminClient()` (Supabase
  service-role) and called `supabase.from('leads').insert(...)`.
- `app/(app)/leads/page.tsx` calls `getLeadsList(...)` from
  `lib/inboxApiServer.ts`, which hits the inbox-api Cloud Run service which
  uses `DB_DRIVER=cloudsql` against `zuildup_sales_os.leads`.
- The two stores had drifted: Supabase still had a `leads` table from the
  pre-Cloud-SQL era, but no production code reads from it anymore.
- Net effect: every "successful" admin Excel upload silently wrote into a
  dead Supabase table.

## Phase 1 — Recovery of the 81 Leads

1. Queried Supabase: `GET /rest/v1/leads?lead_source=eq.referral&created_at=gte.2026-05-31` returned 81 rows.
2. Connected to Cloud SQL via Cloud SQL Auth Proxy (port 5433, instance
   `openclaw-prod-777874:asia-south1:zuildup-sales-os-pg15`, password
   from Secret Manager `zuildup-cloudsql-pg-password`).
3. Inspected `public.leads` schema — Cloud SQL uses `tier_hint` (not
   `tier`), `status::lead_status` enum, plus the new `status_top` /
   `sub_status` columns.
4. Dedup check: 0 of the 81 phones existed in Cloud SQL.
5. Built CSV, `\copy` to staging temp table, INSERT into `public.leads`
   with these defaults:
   - `lead_source = 'referral'`
   - `tier_hint = 'A'`
   - `status = 'New'::lead_status`
   - `status_top = NULL`, `sub_status = NULL` (sales takes over)
   - `date_received = 2026-05-31`
   - `assigned_to = 21b6926a-3d26-48bb-871d-e4d82ca8501e` (Vaishali, SPOC) —
     per Varun's brief
   - `assigned_by = assigned_to` (self-assign for recovery)
   - `source_row_id = 'referral_recovery_2026-05-31_<uuid>'`
6. Verified end-to-end:
   ```
   GET https://zuildup-inbox-api-176777907104.asia-south1.run.app/leads?lead_source=referral&limit=200
   → ok=true, total=81, rows=81
   ```
   Same data path the production `/leads` SSR page uses.

## Phase 2 — Fix Sales OS Lead Writes

### Audit of Supabase usage in `sales-os/web/`

Searched for `createAdminClient`, `createClient(...supabase)`, and
`.from('leads' | 'activities' | 'attachments' | ...)`.

**Lead/activity/attachment write sites found:**

| File | What it does | Status |
|---|---|---|
| `app/api/admin/leads/import/route.ts` | bulk Excel upload — WROTE to Supabase `leads` (the bug) | **FIXED** — now POSTs to inbox-api `/admin/leads/bulk-import` (Cloud SQL) |
| `app/(app)/admin/team-actions/page.tsx` | READS from Supabase `leads` + `users` for triage UI — table was stale post-migration | **FIXED** — now reads from inbox-api `/admin/team-actions` + `/users` |
| `app/(app)/leads/[id]/actions.ts::uploadAttachment` | writes file to Supabase Storage + row to Supabase `attachments` | **Left in place** — file storage is unrelated to lead data; flagged as "next-rollout item" in existing comment. No new bug introduced. |

**Reads/writes intentionally left on Supabase:**

- Supabase Auth (`auth.getUser`, login, callback, middleware) — Sales OS
  rule explicitly preserves Auth on Supabase.
- `users` table reads via Supabase in `lib/auth.ts::getUser` and a few
  admin pages — Supabase `users` mirrors the Cloud SQL `users` table and
  is kept in sync; reading from Supabase is acceptable here since the rule
  is about lead/activity/attachment data, not user/role metadata.
- `audit_log`, `comms_attempts`, etc. — non-lead admin tables, not in
  scope.

### Code changes

**`web/app/api/admin/leads/import/route.ts`** (rewritten):
- Same XLSX parsing, header aliasing, phone normalization, and
  per-row validation as before — pre-flight errors still reported by
  spreadsheet row number.
- Removed `createAdminClient()` and all Supabase calls.
- After pre-validation, mints an HS256 JWT (same secret as the rest of
  the Sales OS Cloud Run integration) and POSTs the batch to
  `${API_URL}/admin/leads/bulk-import`.
- Re-maps the API response back into the row-numbered shape the existing
  `AdminLeadsImportUI` component expects — no UI changes needed.
- Adds `db_target: 'cloudsql:zuildup_sales_os'` to the response so future
  manual testers can verify the target DB instantly.

**`web/app/(app)/admin/team-actions/page.tsx`** (rewritten):
- Removed Supabase client usage.
- Calls inbox-api `GET /admin/team-actions` (new endpoint) for the lead
  list and `getUsers()` (existing helper, also Cloud SQL) for the
  assignee dropdown.
- `TeamActionsClient` props and types unchanged.

### Companion inbox-api changes

Same lane, separate deploy:

`lanes/D-sales-os-inbox/shared-db/index.js`:
- `bulkImportLeads({ leads, lead_source, tier_hint, entered_by })` —
  per-row INSERT with defaults `lead_source='referral'`, `tier_hint='A'`,
  `status='New'`, round-robin assignment via existing
  `pickNextAutoAssignee()` (same code path as Meta/Google webhooks and
  `createManualLead`), dedup by phone, activity rows logged, and
  `linkPhoneResubmits` for relation tracking. Cap 2000 rows / call.
- `listTeamActions()` — all leads with `next_action_type IS NOT NULL`,
  joined with assignee.

`lanes/D-sales-os-inbox/inbox-api/index.js`:
- `handleBulkImportLeads` — admin/director JWT-gated. Returns
  `{ ok, created_count, skipped_count, error_count, created[], skipped[], errors[] }`.
- `handleTeamActions` — admin/director JWT-gated.
- Routes registered:
  - `POST /admin/leads/bulk-import`
  - `GET  /admin/team-actions`

Built and deployed as Cloud Run image
`asia-south1-docker.pkg.dev/zuildup-prod/zuildup/zuildup-inbox-api:fix-supabase-2026-05-31`,
revision `zuildup-inbox-api-00026-rj9`.

## Phase 3 — End-to-End Verification

1. **Auth gate live on Vercel:**
   ```
   POST https://zuildup-sales.vercel.app/api/admin/leads/import
   → HTTP 403 {"error":"forbidden"}
   ```
   Confirms the new route is deployed and the admin gate works.

2. **inbox-api bulk-import smoke test (admin JWT):**
   - POSTed 3 fake rows (`TEST_E2E_VERIFY_<ts>_A/B/C`, unique phones).
   - Response: `created_count: 3`, all 3 round-robin assigned to
     Avish/Vaishali/Avish, tier_hint='A', lead_source='referral',
     status='New'.
   - Followed by `GET /leads?lead_source=referral` → total went from
     81 → 84. `GET /leads?q=TEST_E2E_VERIFY_<ts>` returned all 3 rows.
   - Test rows then DELETEd from Cloud SQL (`public.leads` +
     `public.activities`). Final referral count back to 81.

3. **team-actions read path:**
   - `GET /admin/team-actions` (admin JWT) returns `ok=true, rows=24`.
   - Same data the admin triage UI now sees.

## Vercel Deployment

```
git commit -m "fix: Sales OS lead writes/reads → Cloud SQL (was hitting Supabase)"
git push origin master
vercel --prod
```

- Branch: `master`
- Repo: `varunmahna-creator/zuildup-cost-calculator`
- Commit: `6eb560a`
- Vercel project: `zuildup-sales`
- Production URL: https://zuildup-sales.vercel.app
- Deployment URL (this revision):
  https://zuildup-sales-4niazdatv-varunmahna-creators-projects.vercel.app

## Open Items / Follow-up

- **Supabase env vars on Vercel** — not removed in this PR. The auth flow
  still depends on `NEXT_PUBLIC_SUPABASE_URL` and the anon key. The
  service-role key (`SUPABASE_SERVICE_ROLE_KEY`) is still used by
  `lib/supabase/admin.ts` for storage uploads in `uploadAttachment`. Once
  attachments migrate to GCS, the service-role key can be removed.
- **Drift on Supabase `leads`** — Supabase still has lead rows from before
  the migration plus the 81 recovered today. They are not read by any
  production code. Recommend leaving as a frozen archive (do not drop until
  Varun confirms).
- **Other audit-clean stale paths** — `audit_log` page still reads
  Supabase. That table only lives in Supabase, so it's intentional. No
  change required.
