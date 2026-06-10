# gads-offline-tools

Two Cloud Run Jobs for closing the Google Ads measurement loop:

| Script | Job | Schedule | Purpose |
|---|---|---|---|
| `upload_conversions.py` | `zuildup-gads-offline-conv-uploader` | hourly | Push qualified leads → Google Ads as `ZU_SQL_Lead` conversions |
| `reconcile_gclids.py` | `zuildup-gads-gclid-reconciler` | daily 02:00 IST | Fill `campaign_id` / `ad_group_id` on leads from `click_view` |

Both share the same image, differentiated by `ENTRYPOINT_SCRIPT` env var.

## DB columns added (migration 2026-06-10)

```sql
ALTER TABLE public.leads
  ADD COLUMN last_uploaded_to_gads TIMESTAMPTZ,
  ADD COLUMN gads_uploaded_action  TEXT,
  ADD COLUMN ad_group_id           TEXT,
  ADD COLUMN gads_reconciled_at    TIMESTAMPTZ;
```

Plus partial indexes on `(source,status_top,last_uploaded_to_gads)` and
`(source,created_at,gads_reconciled_at)` for cheap pending-lead scans.

## Secrets used (all in `zuildup-prod` GCP project unless noted)

- `zuildup-cloudsql-pg-password` → DB password
- `zuildup-gads-developer-token`
- `zuildup-gads-client-id`
- `zuildup-gads-client-secret`
- `zuildup-gads-refresh-token`

The refresh-token must be re-issued weekly until the OAuth app is published
to production (currently in Testing mode, 7-day expiry — see
`/opt/openclaw/workspace/zuildup/secrets/google_ads_oauth.env`).

## Conversion action IDs

- `ZU_SQL_Lead` = `7620841658` (UPLOAD_CLICKS, ENABLED)
- `ZU_Won_Lead` = `7621214613` (UPLOAD_CLICKS, ENABLED) — not yet used

## Build & deploy

```bash
cd /opt/openclaw/workspace/zuildup/sales-os/services/gads-offline-tools
gcloud builds submit \
  --project=zuildup-prod \
  --tag=asia-south1-docker.pkg.dev/zuildup-prod/zuildup/gads-offline-tools:latest .
```

See `deploy.sh` for the full job + scheduler setup.

## Smoke test

```bash
# Locally, with proxy on :5433
export DATABASE_URL="postgresql://postgres:$(gcloud secrets versions access latest --secret=zuildup-cloudsql-pg-password --project=zuildup-prod)@127.0.0.1:5433/zuildup_sales_os"
set -a; . /opt/openclaw/workspace/zuildup/secrets/google_ads_oauth.env; set +a
export GADS_CUSTOMER_ID=2004693646
export GADS_CONV_ACTION_SQL_ID=7620841658
export DRY_RUN=1
python upload_conversions.py
python reconcile_gclids.py
```
