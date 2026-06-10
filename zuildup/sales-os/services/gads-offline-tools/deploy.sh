#!/bin/bash
# Deploy gads-offline-tools as two Cloud Run Jobs + two Cloud Scheduler triggers.
# Idempotent — safe to re-run.

set -euo pipefail

PROJECT=zuildup-prod
REGION=asia-south1
INSTANCE="openclaw-prod-777874:asia-south1:zuildup-sales-os-pg15"
IMG="asia-south1-docker.pkg.dev/$PROJECT/zuildup/gads-offline-tools:v1"
SA="176777907104-compute@developer.gserviceaccount.com"   # reuse default compute SA (already has Cloud SQL + Secret Manager access)

# Shared env + secrets for both jobs
COMMON_ENV="GADS_CUSTOMER_ID=2004693646,LOOKBACK_DAYS=30"
COMMON_SECRETS="
GOOGLE_ADS_DEVELOPER_TOKEN=google-ads-developer-token:latest,\
GOOGLE_ADS_CLIENT_ID=google-oauth-client-id:latest,\
GOOGLE_ADS_CLIENT_SECRET=google-oauth-client-secret:latest,\
GOOGLE_ADS_REFRESH_TOKEN=google-ads-refresh-token:latest,\
GOOGLE_ADS_LOGIN_CUSTOMER_ID=google-ads-login-customer-id:latest,\
DATABASE_URL=CLOUDSQL_CONNECTION_STRING:latest\
"

# ─── Job 1: offline conversion uploader ───────────────────────────────────
JOB1=zuildup-gads-offline-conv-uploader
echo "→ Deploying $JOB1"
gcloud run jobs deploy "$JOB1" \
  --project="$PROJECT" --region="$REGION" \
  --image="$IMG" \
  --service-account="$SA" \
  --set-cloudsql-instances="$INSTANCE" \
  --set-env-vars="$COMMON_ENV,GADS_CONV_ACTION_SQL_ID=7620841658,ENTRYPOINT_SCRIPT=upload_conversions.py" \
  --set-secrets="$COMMON_SECRETS" \
  --command=sh --args=-c,"python upload_conversions.py" \
  --task-timeout=600 \
  --max-retries=1

# ─── Job 2: gclid reconciler ───────────────────────────────────────────────
JOB2=zuildup-gads-gclid-reconciler
echo "→ Deploying $JOB2"
gcloud run jobs deploy "$JOB2" \
  --project="$PROJECT" --region="$REGION" \
  --image="$IMG" \
  --service-account="$SA" \
  --set-cloudsql-instances="$INSTANCE" \
  --set-env-vars="$COMMON_ENV,ENTRYPOINT_SCRIPT=reconcile_gclids.py" \
  --set-secrets="$COMMON_SECRETS" \
  --command=sh --args=-c,"python reconcile_gclids.py" \
  --task-timeout=1200 \
  --max-retries=1

# ─── Scheduler 1: hourly uploader ─────────────────────────────────────────
SCH1=zuildup-gads-conv-upload-hourly
JOB1_URI="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/$JOB1:run"
if gcloud scheduler jobs describe "$SCH1" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$SCH1" \
    --location="$REGION" --project="$PROJECT" \
    --schedule="0 * * * *" --time-zone="Asia/Kolkata" \
    --uri="$JOB1_URI" --http-method=POST \
    --oauth-service-account-email="$SA"
else
  gcloud scheduler jobs create http "$SCH1" \
    --location="$REGION" --project="$PROJECT" \
    --schedule="0 * * * *" --time-zone="Asia/Kolkata" \
    --uri="$JOB1_URI" --http-method=POST \
    --oauth-service-account-email="$SA"
fi

# ─── Scheduler 2: daily reconciler 02:00 IST ──────────────────────────────
SCH2=zuildup-gads-reconcile-daily
JOB2_URI="https://$REGION-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/$PROJECT/jobs/$JOB2:run"
if gcloud scheduler jobs describe "$SCH2" --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud scheduler jobs update http "$SCH2" \
    --location="$REGION" --project="$PROJECT" \
    --schedule="0 2 * * *" --time-zone="Asia/Kolkata" \
    --uri="$JOB2_URI" --http-method=POST \
    --oauth-service-account-email="$SA"
else
  gcloud scheduler jobs create http "$SCH2" \
    --location="$REGION" --project="$PROJECT" \
    --schedule="0 2 * * *" --time-zone="Asia/Kolkata" \
    --uri="$JOB2_URI" --http-method=POST \
    --oauth-service-account-email="$SA"
fi

echo
echo "✅ Done. Jobs:"
echo "   $JOB1   ← runs hourly via $SCH1"
echo "   $JOB2   ← runs 02:00 IST via $SCH2"
echo
echo "Manual run:"
echo "  gcloud run jobs execute $JOB1 --region=$REGION --project=$PROJECT"
echo "  gcloud run jobs execute $JOB2 --region=$REGION --project=$PROJECT"
