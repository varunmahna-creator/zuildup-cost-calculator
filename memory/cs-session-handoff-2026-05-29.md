# Creative Studio V1 — Session Handoff (2026-05-29)

**Purpose:** Save full session state before any context loss. Anyone (or future-me) can resume from this file alone.

**Last updated:** 2026-05-29 07:11 UTC
**Current branch:** `iraaj/v1-bootstrap-2026-05-28`
**Repo:** `github.com/varunmahna-creator/zuildup-creative-studio`
**Local clone:** `/opt/openclaw/workspace/zuildup/creative-studio/`
**Discord channel:** `#zuildup-creative-studio` (id `1509539035784413265`)

---

## TL;DR — What's live, what's not

✅ **Working (committed + verified):**
- Backend code (LLM-wired, all 11 endpoints, Cloud SQL persistence) — commit `2d0baae`
- Firebase Auth + Google provider + Varun seeded admin — commit `1a2bbc0`
- Cloud Run thin proxy + IAP TCP cross-project tunnel — commit `078f6c6`
- Backend port/bind fix (10090, 0.0.0.0) for IAP — commit `b2a17cd`
- Nirvana brand seed v1 + voice-differentiated proof brief — commit `f5eaa2f`
- Frontend live wire + Firebase Hosting SSR deploy — commit `a314218`

🟡 **In-progress (code written but uncommitted as of 18:18 UTC throttle):**
- F3 (PDF + Drive integration): files exist, not committed, not verified end-to-end. See "F3 unfinished" below.

🔴 **Operational status right now (07:11 UTC, 2026-05-29):**
- **Live URL** `https://zuildup-creative-studio.web.app` → **HTTP 200** ✅
- **Cloud Run proxy** `https://creative-studio-proxy-oyrq7o3czq-el.a.run.app/_proxy/health` → **timing out** ❌
- **Backend on iraaj VM (port 10090)** → **NOT RUNNING** ❌ (nohup process died, no systemd survival)

→ Live frontend renders but sign-in + brief generation will fail until backend is restarted.

---

## Operational Recovery (do this FIRST when resuming)

### 1. Restart backend on iraaj VM
```bash
cd /opt/openclaw/workspace/zuildup/creative-studio/backend
npm run build  # only if dist/ is stale
# Start via nohup (until systemd install is done with sudo):
nohup env $(cat /opt/openclaw/workspace/secrets/creative-studio.env | xargs) node dist/index.js > /tmp/cs-backend.log 2>&1 &
sleep 3
curl -sS http://127.0.0.1:10090/healthz
# expect: {"ok":true,"service":"creative-studio-api","version":"0.0.1"}
```

### 2. Verify Cloud Run proxy can reach backend
```bash
curl -sS https://creative-studio-proxy-oyrq7o3czq-el.a.run.app/_proxy/health
# expect: {"ok":true,"tunnel":true,"upstream":{"status":200,...}}
```

### 3. Install systemd for persistence (REQUIRES SUDO — Varun must run interactively)
```bash
sudo cp /opt/openclaw/workspace/zuildup/creative-studio/backend/systemd/creative-studio-api.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable creative-studio-api
sudo systemctl start creative-studio-api
sudo systemctl status creative-studio-api --no-pager
```
After this, the backend survives VM reboots. See `backend/systemd/INSTALL.md`.

---

## Commit Ledger (newest first)

```
a314218  F2: live wire to backend, deployed to Firebase Hosting SSR
b2a17cd  F5b: backend port 10090 + bind 0.0.0.0 for IAP TCP
f5eaa2f  F6: Nirvana brand seed v1 + proof brief
078f6c6  F5: cross-project IAP TCP via Cloud Run thin proxy
1a2bbc0  F4: Firebase Auth + Google provider enabled, allowlist seeded
2d0baae  F1: wire LLM into backend — real generate/stream/regen/section/brain endpoints
480acfd  D4: strip all contact info from playbook output (internal doc rule)
1fd8ed8  D2 follow-up: force-dynamic SSR on per-user routes
9fd4750  D3: lock varunm@zuildup.com as Drive impersonation identity
6432501  D2: pivot frontend to SSR (Firebase Hosting framework-aware), drop static export
73bbbd3  D1: SSE auth via one-use ticket query param
3aa2918  Stream B: backend scaffold (Express+TS, 11 endpoints, systemd, tests)
523a89b  Stream A: bootstrap infra (repo+schema+GCS+secrets+Firebase Hosting)
```

All pushed to `origin/iraaj/v1-bootstrap-2026-05-28`.

---

## F3 (PDF + Drive) — Unfinished Work to Recover

### Code that exists locally but is NOT committed

`git status --short` on `iraaj/v1-bootstrap-2026-05-28`:
```
 M backend/package-lock.json
 M backend/package.json
 M backend/src/routes/briefs.ts
 M backend/src/services/brands.ts
 M backend/src/types.ts
?? backend/src/drive/
?? backend/src/gcs/
?? backend/src/pdf/
?? sql/0002_drive_md_file_id.sql
```

These files were written by the original F3 subagent (which died on the rate-limit cascade at 18:18 UTC) and the F3-finisher subagent (which also got rate-limited).

### What still needs to happen for F3 to ship

1. **Verify code compiles:** `cd backend && npm install && npm run build`. Fix any TS errors.
2. **Run migration:** `PGPASSWORD=$(gcloud secrets versions access latest --secret=db-password --project=zuildup-prod) psql -h 34.100.203.4 -U postgres -d postgres -f sql/0002_drive_md_file_id.sql`
3. **Restart backend** (see Operational Recovery above) so new `/export.pdf` and `/drive-save` endpoints register.
4. **End-to-end PDF test:** mint test JWT, call `POST /v1/briefs/<id>/export.pdf`, verify PDF generated (>50KB, valid `file` magic, NO phone/email per D4).
5. **Drive DWD activation by Varun (2 min):**
   - Workspace Admin Console → Security → API controls → Domain-Wide Delegation → Add new
   - Client ID: from `jq -r .client_id /opt/openclaw/workspace/secrets/creative-studio-drive-sa.json`
   - Scope: `https://www.googleapis.com/auth/drive.file`
   - Full instructions templated in `memory/cs-f3-varun-dwd-steps.md` (exists, but client_id field may need filling in)
6. **Drive smoke test:** `POST /v1/briefs/<id>/drive-save` → expect `{file_id, web_view_link}`
7. **Commit:** `git add backend/src/pdf/ backend/src/drive/ backend/src/gcs/ backend/src/routes/briefs.ts backend/src/services/brands.ts backend/src/types.ts backend/package.json backend/package-lock.json sql/0002_drive_md_file_id.sql && git commit -m "F3: PDF export (Puppeteer) + GCS upload + Drive integration (googleapis DWD)" && git push`

### F3 dependencies expected in `package.json`
- `puppeteer` or `puppeteer-core` (PDF render)
- `@google-cloud/storage` (GCS upload)
- `googleapis` (Drive API + DWD impersonation)

If puppeteer-core is used (Chromium not bundled), confirm system chromium exists: `which chromium chromium-browser google-chrome`. If absent, switch to full `puppeteer` and let it download Chromium.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Browser (designer)                                                      │
│   ↓ HTTPS                                                               │
│ Firebase Hosting (zuildup-prod) — SSR via Cloud Function                │
│   `ssrzuildupcreativestudi` (asia-south1, 2nd-gen, framework-aware)     │
│   URL: https://zuildup-creative-studio.web.app                          │
│   Custom domain (pending DNS): creative.zuildup.com                     │
│   ↓ HTTPS + Bearer JWT                                                  │
│ Cloud Run thin proxy (zuildup-prod, asia-south1)                        │
│   Service: creative-studio-proxy                                        │
│   URL: https://creative-studio-proxy-oyrq7o3czq-el.a.run.app            │
│   Runtime SA: creative-studio-proxy-sa@zuildup-prod.iam                 │
│   Does: gcloud start-iap-tunnel at boot → HTTP proxy to localhost:18090 │
│   ↓ IAP TCP                                                             │
│ IAP Tunnel (openclaw-prod-777874)                                     │
│   Firewall rule: allow-iap-to-creative-studio-backend-alt               │
│   Source: 35.235.240.0/20 → tcp:10090,8090 → tag creative-studio-backend│
│   ↓ TCP                                                                 │
│ iraaj VM (openclaw-vm, asia-east1-b)                                  │
│   Tag: creative-studio-backend                                          │
│   Backend on 0.0.0.0:10090 (NOT 127.0.0.1, NOT 8090 — see iptables fix) │
│   Express + TS, systemd unit prepared (sudo install pending)            │
│   ↓ HTTP                                                                │
│ Cloud SQL (zuildup-prod:zuildup-db, asia-south1-a)                      │
│   Host: 34.100.203.4 (VM IP 34.80.141.244 in authorized networks)       │
│   Schema: creative_studio                                               │
│   Tables: brands, users, briefs, brief_versions (+ 0002 drive cols)     │
│   ↓ (parallel)                                                          │
│ Local LLM proxy on iraaj VM                                             │
│   http://127.0.0.1:18801/v1/messages → claude-opus-4-7 (zero per-token) │
└─────────────────────────────────────────────────────────────────────────┘
```

### Why port 10090 + bind 0.0.0.0 (don't change back)
- iraaj VM has blanket iptables NAT redirect for `3000-7999, 8001-8122, 8124-9999 → port 80`. Port 8090 unusable.
- IAP TCP arrives on `nic0` (10.140.0.2), not loopback. Must bind `0.0.0.0`.
- Documented in `infra/README.md` + `memory/cs-f5-handoff.md`.

### Why /_proxy/health (not /healthz) for proxy health
- Google Front End intercepts `/healthz` globally on zuildup-prod Cloud Run services, returns its own 404 before container sees it. Backend's `/healthz` is reachable through the proxy on the actual proxied path — only the proxy's *own* health uses `/_proxy/health`.

---

## Decisions Locked (D1–D4)

| Decision | Summary | Doc |
|----------|---------|-----|
| **D1** | SSE auth via 60s single-use JWT ticket in query string (EventSource can't send headers). `POST /v1/briefs/:id/stream-ticket` → `GET /v1/briefs/:id/stream?ticket=...` | DECISIONS.md |
| **D2** | SSR rendering via Cloud Functions for Firebase (framework-aware). Dropped `output: 'export'`. Per-user routes use `force-dynamic`. | DECISIONS.md |
| **D3** | Drive impersonation = `varunm@zuildup.com` (has Creatives/ folder access). | DECISIONS.md |
| **D4** | NO phone, NO email, NO contact info in any brief output. Internal docs only. CTAs are button labels for the final ad creative only. Enforced in system prompt + schema + seeds + renderer. | DECISIONS.md, cs-d4-verification-brief.md |

---

## Infrastructure Inventory

### GCP — `zuildup-prod`
- **Firebase Hosting site:** `zuildup-creative-studio` → `zuildup-creative-studio.web.app`
- **Firebase Web App:** `Creative Studio Web` (appId `1:176777907104:web:1157a0fbc6f8306ba632c5`)
- **Firebase Auth:** Identity Platform, Google provider enabled (auto-managed OAuth client `176777907104-7b60memtpe96q9471e0a91oqnerone38.apps.googleusercontent.com`), email/pw disabled
- **Authorized auth domains:** localhost, zuildup-creative-studio.web.app, zuildup-creative-studio.firebaseapp.com, creative.zuildup.com
- **Cloud SQL instance:** `zuildup-db` (POSTGRES_15, asia-south1-a, host `34.100.203.4`)
  - Schema: `creative_studio`
  - Tables: `brands`, `users`, `briefs`, `brief_versions`
  - Authorized: VM IP `34.80.141.244`
- **GCS bucket:** `gs://zuildup-creative-studio-exports` (asia-south1, UBLA, versioning ON)
- **Cloud Run service:** `creative-studio-proxy` (asia-south1, 512Mi/1CPU, 3600s timeout, min=0/max=10)
- **Cloud Functions for Firebase:** `ssrzuildupcreativestudi` (asia-south1, 2nd-gen) — SSR
- **Service accounts:**
  - `creative-studio-proxy-sa@zuildup-prod.iam` — Cloud Run runtime, IAP tunnel access
  - `creative-studio-drive-sa@zuildup-prod.iam` — Drive impersonation (DWD pending)
  - `firebase-adminsdk-fbsvc@zuildup-prod.iam` — Hosting deploys
- **Secret Manager:**
  - `creative-studio-jwt-secret`
  - `creative-studio-drive-sa-key` (also at `/opt/openclaw/workspace/secrets/creative-studio-drive-sa.json` mode 600)
  - `db-password`

### GCP — `openclaw-prod-777874` (iraaj VM project)
- **VM:** `openclaw-vm` (asia-east1-b, public IP 34.80.141.244, internal 10.140.0.2)
- **Tag:** `creative-studio-backend`
- **Firewall rule:** `allow-iap-to-creative-studio-backend-alt` (35.235.240.0/20 → tcp:10090,8090)
- **IAM bindings:**
  - `serviceAccount:creative-studio-proxy-sa@zuildup-prod.iam.gserviceaccount.com`
    - `roles/iap.tunnelResourceAccessor`
    - `roles/compute.viewer`

### Files on disk
- **Backend env:** `/opt/openclaw/workspace/secrets/creative-studio.env` (mode 600)
  - `PORT=10090, HOST=0.0.0.0`, JWT_SECRET, DATABASE_URL, LLM_PROXY_URL, FIREBASE_PROJECT_ID, GCS_BUCKET, DRIVE_SA_KEY_PATH
- **Firebase Web SDK env:** `/opt/openclaw/workspace/secrets/creative-studio-firebase-web.env` (mode 600)
- **Drive SA key:** `/opt/openclaw/workspace/secrets/creative-studio-drive-sa.json` (mode 600)
- **DB password:** `/opt/openclaw/workspace/secrets/cloudsql_postgres_password.txt`

---

## Per-Stream Status & Artefacts

### Stream A — Infra bootstrap ✅
- Repo, branch, Cloud SQL schema (4 tables), GCS bucket, Secret Manager entries, Firebase Hosting site
- IAP feasibility documented in `infra/README.md`
- Commit `523a89b`

### Stream B — Backend scaffold ✅
- Express + TS, 11 endpoints (BRIEF §4), systemd unit, 27 tests passing
- Commit `3aa2918`
- Handoff: `memory/cs-stream-b-handoff.md`

### Stream C — LLM playbook generation ✅
- 24-section Zod schema, system prompt builder, Claude streaming client
- generate/regenerate/section/brain services, markdown renderer
- One real ZuildUp brief generated: 40/40 assertions, ~88% exemplar density, 41KB
- Handoff: `memory/cs-stream-c-handoff.md`, fidelity report: `memory/cs-stream-c-fidelity-report.md`

### Stream D — Brand seeds ✅
- `seeds/zuildup.json` v1 (8 hooks, 30 must-avoids, 4 audience bands, full _provenance)
- `seeds/nirvana.json` scaffold (later filled by F6)
- Handoff: `memory/cs-stream-d-handoff.md`

### Stream E — Frontend scaffold ✅
- Next.js 16 App Router + Tailwind v4, all 9 screens, Firebase v10 auth, mock backend, brand tokens, build passing
- Handoff: `memory/cs-stream-e-handoff.md`

### Decisions D1–D4 ✅
- D1: SSE ticket, 27/27 tests pass (commit `73bbbd3`)
- D2: SSR pivot (commits `6432501` + `1fd8ed8`)
- D3: Drive impersonation locked (commit `9fd4750`)
- D4: 0 phone leaks, 0 email leaks in proof brief (commit `480acfd`, `memory/cs-d4-verification-brief.md`)

### F1 — Backend LLM wire ✅
- Real Claude calls via local proxy → 24-section validated brief → Cloud SQL persistence
- Live smoke test brief `abc01ff4-32f8-4943-84e3-62c9b202be3e` (270s generation, 39550-char output_md)
- 27 tests still pass
- Commit `2d0baae`, verification: `memory/cs-f1-verification.md`

### F2 — Frontend live deploy ✅
- Real Firebase Auth, real backend via Cloud Run proxy URL, deployed via Firebase Hosting framework-aware SSR
- Live URL responds HTTP 200, login page has "Sign in with Google" button, CORS preflight 204
- Commit `a314218`, verification: `memory/cs-f2-live-verification.md`

### F3 — PDF + Drive 🟡 UNFINISHED
- Code written: `backend/src/pdf/`, `backend/src/drive/`, `backend/src/gcs/`, edits to `briefs.ts`, `sql/0002_drive_md_file_id.sql`
- NOT committed, NOT verified end-to-end, Drive DWD click from Varun pending
- Files: `memory/cs-f3-handoff.md`, `memory/cs-f3-varun-dwd-steps.md`
- See "F3 Unfinished Work" section above for recovery steps

### F4 — Firebase Auth ✅
- Identity Platform initialized, Google provider enabled, allowlist seeded (varunmahna@gmail.com + varunm@zuildup.com both admin)
- Web SDK config at `/opt/openclaw/workspace/secrets/creative-studio-firebase-web.env`
- Commit `1a2bbc0`, handoff: `memory/cs-f4-handoff.md`

### F5 — Cloud Run IAP proxy ✅
- Cross-project IAP TCP tunnel via Cloud Run thin proxy
- Discovered two critical fixes: port must be 10090 (iptables), bind must be 0.0.0.0 (IAP lands on nic0)
- Commit `078f6c6`, handoffs: `memory/cs-f5-handoff.md`, `memory/cs-f5-iap-smoke-test.md`

### F5b — Backend port/bind fix ✅
- Backend on `0.0.0.0:10090`, full FE↔BE path verified via `/_proxy/health`
- nohup-only for now; systemd install awaits sudo
- Commit `b2a17cd`, verification: `memory/cs-f5b-verification.md`

### F6 — Nirvana brand seed ✅
- `seeds/nirvana.json` v1: jewel-tones (#1B3A2E, #B08D57, #F4EBD8, #2A2722), Cormorant Garamond + Source Serif, 4 hooks craftsmanship/cross-border/heritage, 4 audience bands incl. `bali_villa_buyers`, KPIs hook≥20%/hold≥22%/qCPL_A≤₹5k
- Proof brief shows clear voice differentiation from ZuildUp (no delay-penalty language, no fast-build promises, no contact info)
- Commit `f5eaa2f`, research: `memory/cs-f6-nauhomes-research.md`, proof: `memory/cs-f6-nirvana-proof-brief.md`

### F7 — End-to-end QA (NOT STARTED)
- Should spawn after F3 commits + Drive DWD active
- Plan: full designer flow on live URL with both ZuildUp and Nirvana brands

---

## Outstanding Manual Steps for Varun

1. **Sudo systemd install for backend persistence** (~30 sec):
   ```bash
   sudo cp /opt/openclaw/workspace/zuildup/creative-studio/backend/systemd/creative-studio-api.service /etc/systemd/system/
   sudo systemctl daemon-reload && sudo systemctl enable creative-studio-api && sudo systemctl start creative-studio-api
   ```
   Until this runs, backend dies on VM reboot.

2. **Drive DWD activation in Workspace Admin** (~2 min) — REQUIRED for F3 Drive feature:
   - https://admin.google.com → Security → API controls → Domain-Wide Delegation → Add new
   - Client ID: see `jq -r .client_id /opt/ocplatform/workspace/secrets/creative-studio-drive-sa.json`
   - Scope: `https://www.googleapis.com/auth/drive.file`
   - Authorize

3. **DNS for custom domain `creative.zuildup.com`** (when ready):
   - Add A/CNAME records pointing to Firebase Hosting (`zuildup-creative-studio.web.app`)
   - Firebase Hosting auto-provisions cert (D2 auto-managed).
   - Already in authorized auth domains.

4. **Sign-in smoke test** (3 min, blocked on backend being up):
   - Visit https://zuildup-creative-studio.web.app/login
   - Click "Sign in with Google" → sign in as `varunmahna@gmail.com`
   - Expect redirect to `/brands`, role visible as `admin`, two brand cards (ZuildUp + Nirvana)

---

## What Killed the Final Push (timeline)

- **18:11 UTC** — F4 lands, fleet at 5/5
- **18:13 UTC** — F5 lands with port/bind discovery, spawn F5b
- **18:18 UTC** — Anthropic API rate-limit cascade kills 4 in-flight subagents simultaneously: F2 (133k tokens), F3 (162k tokens), F6 (79k tokens), F5b first attempt (46k tokens)
- **18:32 UTC** — Throttle clears, respawn F5b → completes (commit `b2a17cd`), F6 ALREADY landed silently while waiting (commit `f5eaa2f`)
- **18:32 UTC** — Spawn F2-finisher + F3-finisher
- **18:32 UTC** — F2-finisher completes (commit `a314218`, live deploy verified)
- **19:00–07:00 UTC** — Backend nohup process dies overnight (no systemd, no auto-restart). F3-finisher also appears to have died from rate-limit echo or simply didn't commit before session went idle.

Lesson logged for `MEMORY.md`:
- **When fleet hits 4+ concurrent heavy subagents, rate-limit cascade can kill ALL of them simultaneously.** Pace spawns to max 2-3 concurrent for token-heavy work.
- **nohup is not a backend persistence story.** Either ship with systemd from day 1 OR ensure the spawn pipeline restarts the backend before declaring done.

---

## Quick-Resume Checklist (paste into next session)

```
[ ] Read this file: memory/cs-session-handoff-2026-05-29.md
[ ] Restart backend on iraaj VM (commands at top of file)
[ ] Verify Cloud Run proxy /_proxy/health returns 200
[ ] Verify live URL still serves 200
[ ] Spawn F3-finisher (recovery instructions in "F3 Unfinished Work" section)
[ ] DM Varun the Drive DWD steps (with SA client_id filled in)
[ ] After F3 lands + Drive DWD active: spawn F7 (E2E QA on live URL)
[ ] Coordinate with Varun for systemd sudo install
```

---

## File Inventory (everything written this sprint)

### Memory / handoff docs
- `memory/cs-session-handoff-2026-05-29.md` — **this file**
- `memory/cs-stream-{b,c,d,e}-handoff.md` — initial stream handoffs
- `memory/cs-stream-c-fidelity-report.md` — playbook quality scoring
- `memory/cs-d4-verification-brief.md` — no-contact-info proof
- `memory/cs-f1-verification.md` — backend LLM live smoke test
- `memory/cs-f2-live-verification.md` — frontend live deploy smoke test
- `memory/cs-f3-handoff.md` — F3 partial state
- `memory/cs-f3-varun-dwd-steps.md` — Drive DWD instructions for Varun
- `memory/cs-f4-handoff.md` — Firebase Auth + Web SDK config
- `memory/cs-f5-handoff.md` — IAP proxy architecture
- `memory/cs-f5-iap-smoke-test.md` — proxy verification transcript
- `memory/cs-f5b-verification.md` — port/bind fix verification
- `memory/cs-f6-nauhomes-research.md` — Nirvana brand research
- `memory/cs-f6-nirvana-proof-brief.md` — Nirvana voice differentiation proof
- `memory/2026-05-28.md` — daily log with full per-stream notes

### Repo structure (committed)
```
zuildup/creative-studio/
├── README.md
├── firebase.json
├── .firebaserc
├── infra/
│   └── README.md (architecture, ops, sudo install instructions)
├── proxy/
│   ├── package.json
│   ├── index.js
│   ├── Dockerfile
│   └── README.md
├── backend/
│   ├── package.json
│   ├── src/
│   │   ├── index.ts (Express + cors)
│   │   ├── config.ts (PORT=10090, HOST=0.0.0.0)
│   │   ├── db.ts (pg pool)
│   │   ├── llm/ (Claude client + SSE parser)
│   │   ├── prompt/ (system prompt builder)
│   │   ├── schema/ (24-section Zod)
│   │   ├── services/ (generate, brain, briefs, brands, users, renderMarkdown)
│   │   ├── routes/ (auth, brands, briefs, brain, admin, health)
│   │   ├── middleware/ (auth.ts — Firebase + app JWT)
│   │   ├── pdf/ ← UNCOMMITTED (F3)
│   │   ├── gcs/ ← UNCOMMITTED (F3)
│   │   └── drive/ ← UNCOMMITTED (F3)
│   ├── systemd/
│   │   ├── creative-studio-api.service
│   │   └── INSTALL.md
│   └── tests/ (27 passing)
├── web/
│   ├── package.json
│   ├── next.config.js (NO output: 'export'; force-dynamic on user routes)
│   ├── firebase.json (experiments.webframeworks: true)
│   ├── .env.example
│   ├── app/ (login, brands, briefs, admin)
│   ├── components/
│   └── lib/ (firebase, auth, api)
├── seeds/
│   ├── zuildup.json (full v1)
│   └── nirvana.json (full v1, F6)
└── sql/
    ├── 0001_initial.sql
    └── 0002_drive_md_file_id.sql ← UNCOMMITTED (F3)
```

### Documents from kickoff (read-only reference)
- `zuildup/creative-studio-kickoff/BRIEF.md` (396 lines, 16 sections)
- `zuildup/creative-studio-kickoff/REEL-01-exemplar.md` (595 lines, 23 sections)
- `zuildup/creative-studio-kickoff/DECISIONS.md`

---

## Key URLs / IDs Cheat Sheet

| Thing | Value |
|---|---|
| Live frontend | https://zuildup-creative-studio.web.app |
| Cloud Run proxy | https://creative-studio-proxy-oyrq7o3czq-el.a.run.app |
| Backend internal | http://127.0.0.1:10090 (on iraaj VM) |
| Cloud SQL host | 34.100.203.4 |
| LLM proxy (local) | http://127.0.0.1:18801/v1/messages |
| Firebase Web App ID | 1:176777907104:web:1157a0fbc6f8306ba632c5 |
| Google OAuth client | 176777907104-7b60memtpe96q9471e0a91oqnerone38.apps.googleusercontent.com |
| Repo | github.com/varunmahna-creator/zuildup-creative-studio |
| Branch | iraaj/v1-bootstrap-2026-05-28 |
| Discord channel | 1509539035784413265 (#zuildup-creative-studio) |
| Varun Discord ID | 896631452937113630 |
| Test brief ID | abc01ff4-32f8-4943-84e3-62c9b202be3e |

