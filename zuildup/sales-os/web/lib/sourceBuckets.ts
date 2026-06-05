/**
 * Source bucket taxonomy for /leads page filtering.
 *
 * Sales feedback 2026-06-05 (Varun, #zuildup-marketing-engine):
 *   "Need a filter to separate Meta vs Google leads."
 *
 * The DB column `leads.lead_source` carries fine-grained provenance
 * (per-campaign IDs, partner names, channel IDs etc.). For sales triage
 * we want a simple 3-value taxonomy:
 *
 *   - Meta      → Meta lead-form ingest (FB / IG ad-form submissions)
 *                 PLUS the partner channels that flow through Meta ads
 *                 (zuildup-c1 = our hottest campaign, y2g = the y2g brand
 *                 sub-funnel that also originates from FB/IG).
 *
 *   - Google    → Google Ads lead-form ingest (LSA / Search ads).
 *
 *   - Referral  → Word-of-mouth / partner referrals.
 *
 * We expand a bucket to its raw lead_source values at request time
 * (see expandSourceBuckets) because the inbox-api `lead_source` filter
 * does exact-match `ANY($1)`. The expansion uses both prefix matches
 * (Meta campaign IDs are `meta_lead_form_*`) and exact matches.
 *
 * Adding a new bucket later? Add it here and the FilterBar picks it up.
 */

export const SOURCE_BUCKETS = ['Meta', 'Google', 'Referral'] as const
export type SourceBucket = (typeof SOURCE_BUCKETS)[number]

interface BucketRule {
  /** lead_source values that startWith any of these strings match. */
  prefixes: string[]
  /** lead_source values exactly equal to any of these match. */
  exacts: string[]
}

export const SOURCE_BUCKET_RULES: Record<SourceBucket, BucketRule> = {
  Meta: {
    prefixes: ['meta_lead_form'],
    exacts: ['zuildup-c1', 'y2g'],
  },
  Google: {
    prefixes: ['google_lead_form'],
    exacts: [],
  },
  Referral: {
    prefixes: [],
    exacts: ['referral_lead_form', 'referral'],
  },
}

/** Type-guard: is the given string a known bucket name? */
export function isSourceBucket(s: string): s is SourceBucket {
  return (SOURCE_BUCKETS as readonly string[]).includes(s)
}

/**
 * Given the user's bucket selection (one or more of Meta/Google/Referral)
 * AND the full list of known raw lead_source values from the DB, return
 * the flat list of raw lead_source values that the inbox-api should filter on.
 *
 * Multi-select unions across buckets (Meta + Google → all Meta sources
 * PLUS all Google sources). De-dupes the result.
 *
 * If `buckets` is empty, returns null (caller should not apply a filter).
 */
export function expandSourceBuckets(
  buckets: string[],
  knownSources: string[],
): string[] | null {
  const validBuckets = buckets.filter(isSourceBucket)
  if (validBuckets.length === 0) return null
  const out = new Set<string>()
  for (const b of validBuckets) {
    const rule = SOURCE_BUCKET_RULES[b]
    for (const ex of rule.exacts) out.add(ex)
    for (const src of knownSources) {
      for (const prefix of rule.prefixes) {
        if (src.startsWith(prefix)) {
          out.add(src)
          break
        }
      }
    }
  }
  return Array.from(out)
}
