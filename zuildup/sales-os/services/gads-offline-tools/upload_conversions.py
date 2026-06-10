#!/usr/bin/env python3
"""
Step 2: Offline conversion uploader.
Reads qualified Google leads from Cloud SQL `zuildup_sales_os.public.leads`
that have a `gclid` and uploads them to Google Ads as `ZU_SQL_Lead` conversions.

Cloud Run Job entrypoint. Runs hourly via Cloud Scheduler.

Environment variables required:
  DATABASE_URL                      — postgres://... (Cloud SQL via Unix socket on Cloud Run)
  GOOGLE_ADS_DEVELOPER_TOKEN
  GOOGLE_ADS_CLIENT_ID
  GOOGLE_ADS_CLIENT_SECRET
  GOOGLE_ADS_REFRESH_TOKEN
  GOOGLE_ADS_LOGIN_CUSTOMER_ID      — MCC id (digits only)
  GADS_CUSTOMER_ID                  — direct customer id (digits only, e.g. 2004693646)
  GADS_CONV_ACTION_SQL_ID           — conversion action id (e.g. 7620841658)
  GADS_CONV_ACTION_WON_ID           — optional, for ZU_Won_Lead
  LOOKBACK_DAYS                     — default 30
  DRY_RUN                           — if "1", don't write to GA or DB
"""
import os
import sys
import logging
import psycopg
from datetime import datetime, timezone
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger("upload_conversions")


def gads_client():
    cfg = {
        "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "login_customer_id": os.environ["GOOGLE_ADS_LOGIN_CUSTOMER_ID"],
        "use_proto_plus": True,
    }
    return GoogleAdsClient.load_from_dict(cfg)


def fetch_pending(conn, lookback_days: int):
    """
    NOTE: Sales-OS doesn't have a `qualified_at` column. We approximate the
    qualification timestamp as updated_at (when status_top was last changed to
    'Qualified'). This is accurate enough for Google Ads attribution — the
    conversion_date_time must be after the click, and updated_at is always after
    created_at which is right after the form submit, which is right after the click.
    """
    sql = """
        SELECT id, gclid, updated_at AS qualified_at, created_at, status_top
        FROM public.leads
        WHERE source = 'google'
          AND gclid IS NOT NULL AND gclid <> ''
          AND status_top = 'Qualified'
          AND last_uploaded_to_gads IS NULL
          AND created_at >= NOW() - (%s::int * INTERVAL '1 day')
        ORDER BY created_at ASC
        LIMIT 500
    """
    with conn.cursor() as cur:
        cur.execute(sql, (lookback_days,))
        rows = cur.fetchall()
    return rows


def upload_batch(client, customer_id: str, conv_action_resource: str, rows, dry_run: bool):
    """Upload up to 2000 click conversions per call (API limit).
    Returns (count_uploaded, list_of_(lead_id, error_message))."""
    conv_upload_svc = client.get_service("ConversionUploadService")
    req = client.get_type("UploadClickConversionsRequest")
    req.customer_id = customer_id
    req.partial_failure = True
    req.validate_only = dry_run

    lead_ids_in_order = []
    for lead_id, gclid, qualified_at, created_at, _ in rows:
        cc = client.get_type("ClickConversion")
        cc.conversion_action = conv_action_resource
        cc.gclid = gclid
        ts = qualified_at or created_at
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        cc.conversion_date_time = ts.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S+00:00")
        cc.conversion_value = 1.0
        cc.currency_code = "INR"
        req.conversions.append(cc)
        lead_ids_in_order.append(lead_id)

    log.info("Uploading %d conversions (dry_run=%s)", len(req.conversions), dry_run)
    try:
        resp = conv_upload_svc.upload_click_conversions(request=req)
    except GoogleAdsException as ex:
        log.error("GoogleAdsException on upload: %s", ex)
        return 0, [(lid, "GoogleAdsException - see logs") for lid in lead_ids_in_order]

    # Parse partial-failure errors
    failed_indices = set()
    failure_msg_by_index = {}
    pf = resp.partial_failure_error
    if pf and pf.code != 0:
        # Decode protobuf Any details for per-row error mapping
        from google.ads.googleads.errors import GoogleAdsFailure
        for det in pf.details:
            failure = client.get_type("GoogleAdsFailure")
            failure.ParseFromString(det.value)
            for err in failure.errors:
                # err.location.field_path_elements contains the index
                for fpe in err.location.field_path_elements:
                    if fpe.field_name == "conversions" and fpe.HasField("index"):
                        idx = int(fpe.index)
                        failed_indices.add(idx)
                        failure_msg_by_index[idx] = err.message
                        break

    success_lead_ids = []
    failures = []
    for i, lid in enumerate(lead_ids_in_order):
        if i in failed_indices:
            failures.append((lid, failure_msg_by_index.get(i, "unknown")))
        else:
            success_lead_ids.append(lid)
    return success_lead_ids, failures


def mark_uploaded(conn, lead_ids, action_label: str):
    if not lead_ids:
        return
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE public.leads
                  SET last_uploaded_to_gads = NOW(), gads_uploaded_action = %s
                WHERE id = ANY(%s)""",
            (action_label, list(lead_ids)),
        )
    conn.commit()


def main():
    dry_run = os.environ.get("DRY_RUN") == "1"
    lookback_days = int(os.environ.get("LOOKBACK_DAYS", "30"))
    customer_id = os.environ["GADS_CUSTOMER_ID"]
    conv_action_id = os.environ["GADS_CONV_ACTION_SQL_ID"]
    conv_action_resource = f"customers/{customer_id}/conversionActions/{conv_action_id}"

    log.info(
        "Starting upload_conversions | customer=%s action=%s lookback=%dd dry_run=%s",
        customer_id, conv_action_id, lookback_days, dry_run,
    )

    db_url = os.environ["DATABASE_URL"]
    client = gads_client()

    with psycopg.connect(db_url) as conn:
        rows = fetch_pending(conn, lookback_days)
        log.info("Found %d pending qualified leads with gclid", len(rows))
        if not rows:
            log.info("Nothing to do.")
            return 0

        # Chunk to 2000 (API max)
        total_success = 0
        total_fail = 0
        for i in range(0, len(rows), 2000):
            batch = rows[i:i + 2000]
            success_ids, failures = upload_batch(client, customer_id, conv_action_resource, batch, dry_run)
            total_success += len(success_ids)
            total_fail += len(failures)
            for lid, msg in failures:
                log.warning("  FAIL lead %s: %s", lid, msg)
            if success_ids and not dry_run:
                mark_uploaded(conn, success_ids, "SQL")

        log.info("DONE. uploaded=%d failed=%d (dry_run=%s)", total_success, total_fail, dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
