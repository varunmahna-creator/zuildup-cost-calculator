# Cost Calculator — Override Logic QC (2026-05-02)

End-to-end verification of multiplication logic and override semantics for the editable cost sheet.

## Multiplication Semantics

Per row, the displayed cost is computed as:

```
itemRate = round(item.rate ?? zone.rate[zone])
itemArea = round(item.area)
cost     = round(itemArea × itemRate)
```

All three values are rounded to integers **before** summing, so:

- Each cell's displayed value is the actual integer used in arithmetic
- `zoneSubtotal = Σ round(itemCost)` → mentally adding cells matches the displayed subtotal exactly
- `grandTotal = Σ zoneSubtotal + liftCost` → same property at the top level

No floating-point drift; no "₹5 off" between displayed cells and the total.

## Override Precedence

Effective rate per item = `item.rate ?? state.rates[zone]`

- If a per-item rate is set, that wins (tracked via `item.rate`)
- Otherwise, the zone header rate applies
- Area override is independent of rate override; both can coexist on the same row
- Area override flips `item.areaOverridden = true` → description switches to "As per design scope"

## Workflow Behaviors (verified)

| Action | Effect |
|---|---|
| Edit a row's area | Only that row's cost changes; description → "As per design scope" |
| Edit a row's rate | Only that row's rate changes; rest of zone unaffected |
| Edit zone header rate | Propagates to all items in zone; **clears all per-item rate overrides in that zone** |
| Edit row rate **after** zone header change | Works as expected — only that row deviates from new zone rate |
| Edit area + rate on same row | Both apply: cost = newArea × newRate |
| Click "Reset to Defaults" | Rebuilds state from form, discards every override |

### Why zone-header-change wipes per-item rates

Intentional. If a sales rep sets Terrace=600, Ramp=800, Setback=400, then bumps Zone C to 700, what should happen to the per-item overrides? Two options:

1. **(current)** Wipe per-item overrides — zone rate is "set everything in this zone to X"
2. Leave per-item overrides alone — zone rate only applies to non-overridden items

Picked option 1 because it matches sales-team mental model ("I want the whole zone at this rate"). After the wipe, sales can re-apply line-item tweaks on top.

## QC Simulation Results

Premium 200 sqyd, Stilt + 4 floors, no lift, no basement.

| Scenario | Zone A | Zone B | Zone C | Grand Total |
|---|---|---|---|---|
| Baseline (no overrides) | 47,77,500 | 18,96,375 | 12,42,600 | **79,16,475** |
| Floor 0 area: 1225→1500 | 53,13,750 | 18,96,375 | 12,42,600 | **84,52,725** |
| Floor 0 rate: 1950→2200 (item) | 56,88,750 | 18,96,375 | 12,42,600 | **88,27,725** |
| Zone A rate: 1950→2100 (clears Floor 0 item rate) | 57,22,500 | 18,96,375 | 12,42,600 | **88,61,475** |
| Zone C per-item: T=600, R=800, S=400 | 57,22,500 | 18,96,375 | 11,95,800 | **88,14,675** |
| Zone C header: 600→700 (clears per-item) | 57,22,500 | 18,96,375 | 14,49,700 | **90,68,575** |
| Ramp area=250 + rate=850 (both overrides) | 57,22,500 | 18,96,375 | 15,11,000 | **91,29,875** |

Final-state arithmetic check (manual sum of cells):

```
Floor 0    1500 ×  2100 =   31,50,000
Floor 1    1225 ×  2100 =   25,72,500
Stilt      1225 ×   975 =   11,94,375
Balcony     720 ×   975 =    7,02,000
Terrace    1405 ×   700 =    9,83,500
Ramp        250 ×   850 =    2,12,500
Setback     450 ×   700 =    3,15,000
                          ─────────────
                          91,29,875  ← matches displayed Grand Total
```

## Layered Override Test (zone first, then line item on top)

```
Step 1: Initial Zone C rate = 600 → all items at 600
Step 2: Set Terrace=600, Ramp=800, Setback=400 (per-item)
Step 3: Bump Zone C header → 700 → wipes per-item, all 3 = 700
Step 4: Override Setback → 500 (per-item) → Terrace=700, Ramp=700, Setback=500 ✅
```

This confirms that after a zone change, individual line-item overrides still work normally on top.

## Code Locations

- Render loop: `renderResults()` — `/opt/ocplatform/workspace/zuildup-cost-calculator/zuildup-cost-calculator.html`
- Handlers: `onRateChange`, `onItemRateChange`, `onAreaChange`
- State shape: `{ rates: {A,B,C,D,E}, items: [{zone, name, desc, area, rate?, areaOverridden?}], liftCost }`

## Live URLs

- Netlify: <https://zuildup-cost-calculator.netlify.app/>
- File server: http://34.80.141.244:8123/zuildup-cost-calculator.html
- GitHub: <https://github.com/varunmahna-creator/zuildup-cost-calculator>
