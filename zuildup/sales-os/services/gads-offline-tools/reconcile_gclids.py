#!/usr/bin/env python3
"""
Step 3: gclid → campaign_id reconciler.

For each Google lead with a gclid but no campaign_id, look up click_view in
Google Ads to find the campaign + ad_group that generated the click.

`click_view` only allows ONE date per query, so we loop over the last 30 days.

Runs daily 02:00 IST (20:30 UTC) via Cloud Scheduler.

Environment variables required:
  DATABASE_URL
  GOOGLE_ADS_DEVELOPER_TOKEN
  GOOGLE_ADS_CLIENT_ID
  GOOGLE_ADS_CLIENT_SECRET
  GOOGLE_ADS_REFRESH_TOKEN
  GOOGLE_ADS_LOGIN_CUSTOMER_ID
  GADS_CUSTOMER_ID
  LOOKBACK_DAYS                  — default 30
  DRY_RUN                        — if "1", don't write to DB
"""
import os
import sys
import logging
from datetime import datetime, timedelta, timezone
from collections import defaultdict
import psycopg
from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("reconcile_gclids")


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
    """Return (lead_id, gclid, created_at) for leads needing reconciliation."""
    sql = """
        SELECT id, gclid, created_at
        FROM public.leads
        WHERE source = 'google'
          AND gclid IS NOT NULL AND gclid <> ''
          AND campaign_id IS NULL
          AND created_at >= NOW() - (%s::int * INTERVAL '1 day')
    """
    with conn.cursor() as cur:
        cur.execute(sql, (lookback_days,))
        return cur.fetchall()


def reconcile_for_date(client, customer_id: str, date_str: str, gclids: set):
    """Query click_view for one date, return dict gclid -> (campaign_id, ad_group_id)."""
    svc = client.get_service("GoogleAdsService")
    # Process in chunks — IN clause limit
    out = {}
    gclids_list = list(gclids)
    for i in range(0, len(gclids_list), 50):
        chunk = gclids_list[i:i + 50]
        # Build the IN clause with quoted gclids
        in_clause = ", ".join([f"'{g}'" for g in chunk])
        q = f"""
            SELECT click_view.gclid, campaign.id, ad_group.id
            FROM click_view
            WHERE segments.date = '{date_str}'
              AND click_view.gclid IN ({in_clause})
        """
        try:
            for row in svc.search(customer_id=customer_id, query=q):
                out[row.click_view.gclid] = (str(row.campaign.id), str(row.ad_group.id))
        except GoogleAdsException as ex:
            log.warning("    click_view query failed on %s: %s", date_str, ex.error.code().name if hasattr(ex, 'error') else str(ex)[:200])
    return out


def update_lead(conn, lead_id, campaign_id, ad_group_id):
    with conn.cursor() as cur:
        cur.execute(
            """UPDATE public.leads
                  SET campaign_id = %s, ad_group_id = %s, gads_reconciled_at = NOW()
                WHERE id = %s""",
            (campaign_id, ad_group_id, lead_id),
        )


def mark_reconciled_no_match(conn, lead_ids):
    """For leads we tried but couldn't find — mark reconciled to avoid re-querying."""
    if not lead_ids:
        return
    with conn.cursor() as cur:
        cur.execute(
            "UPDATE public.leads SET gads_reconciled_at = NOW() WHERE id = ANY(%s) AND gads_reconciled_at IS NULL",
            (list(lead_ids),),
        )


def main():
    dry_run = os.environ.get("DRY_RUN") == "1"
    lookback_days = int(os.environ.get("LOOKBACK_DAYS", "30"))
    customer_id = os.environ["GADS_CUSTOMER_ID"]

    log.info("Starting reconcile_gclids | customer=%s lookback=%dd dry_run=%s",
             customer_id, lookback_days, dry_run)

    db_url = os.environ["DATABASE_URL"]
    client = gads_client()

    with psycopg.connect(db_url) as conn:
        rows = fetch_pending(conn, lookback_days)
        log.info("Pending leads: %d", len(rows))
        if not rows:
            return 0

        # Group leads by created_at date (UTC). click_view query needs date param.
        # A gclid clicked on day D and converted on day D' — click_view stores by click date.
        # We don't know the click date for sure; assume click date == created_at date or 1-2 days before.
        # Strategy: for each lead, try (created_at_date, created_at_date - 1, created_at_date - 2).
        gclid_to_lead = {}
        date_to_gclids = defaultdict(set)
        for lid, gclid, created_at in rows:
            gclid_to_lead[gclid] = lid
            base_date = (created_at.astimezone(timezone.utc) if created_at.tzinfo else created_at.replace(tzinfo=timezone.utc)).date()
            for delta in range(0, 3):
                d = base_date - timedelta(days=delta)
                date_to_gclids[d.strftime("%Y-%m-%d")].add(gclid)

        log.info("Querying click_view across %d unique dates", len(date_to_gclids))

        # Run queries
        gclid_match = {}  # gclid -> (campaign_id, ad_group_id)
        for date_str in sorted(date_to_gclids.keys()):
            gclids = date_to_gclids[date_str]
            matches = reconcile_for_date(client, customer_id, date_str, gclids)
            if matches:
                log.info("  %s: matched %d/%d", date_str, len(matches), len(gclids))
                gclid_match.update(matches)

        # Update DB
        updated = 0
        no_match = []
        for gclid, lid in gclid_to_lead.items():
            if gclid in gclid_match:
                cid, agid = gclid_match[gclid]
                if not dry_run:
                    update_lead(conn, lid, cid, agid)
                updated += 1
            else:
                no_match.append(lid)

        if not dry_run:
            mark_reconciled_no_match(conn, no_match)
            conn.commit()

        log.info("DONE. matched=%d no_match=%d total=%d (dry_run=%s)",
                 updated, len(no_match), len(rows), dry_run)
    return 0


if __name__ == "__main__":
    sys.exit(main())
