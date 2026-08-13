# NML CRM — Build Plan v1

Merchant acquisition + onboarding + product shelving, for bringing Salla online merchants into NML's offline retail network.

**Stack:** Next.js (App Router) · TypeScript · Supabase (Postgres, Auth, Storage, RLS) · Tailwind · shadcn/ui · TanStack Table · Vercel.

---

## 0. The one architectural decision

**There is no separate `leads` table. A lead and a merchant are the same row.**

A record enters as `stage = 'new'` and walks a single state machine to `active`. No conversion step, no data copying, no duplicate IDs, no "which table is this merchant in" bugs. Every timestamp of its life sits on one row, which makes funnel reporting a single query.

Everything below is built on that.

---

## 1. Roles

| Role | Code | Sees | Does |
|---|---|---|---|
| Admin | `admin` | Everything | Everything, settings, users |
| Acquisition Manager | `acq_manager` | Everything | Uploads leads, assigns/reassigns, approves lost |
| Acquisition Specialist | `acq_specialist` | Only merchants where he is `acquisition_owner` | Logs activity, moves stages up to `cta_completed`, sends form |
| Account Manager | `account_manager` | Only merchants where he is `account_manager` | Runs onboarding checklist, marks steps done |
| Catalog Ops | `catalog_ops` | All merchants at `cta_completed` and beyond, read-only + all products | Reviews and shelves products |
| Viewer | `viewer` | Everything, read-only | Nothing |

Roles are static. Job titles are free text on the profile.

---

## 2. The merchant state machine

```
new ──assign──► assigned ──log call──► contacted ──► interested
                                                        │
                                                   send form
                                                        ▼
                                                   form_sent
                                                        │
                                          merchant submits public form
                                                        ▼
                                                 cta_completed  ◄── THE CONVERSION POINT
                                                        │
                              ┌─────────────────────────┴──────────────────────┐
                              │ auto: assign account manager (manual pick)     │
                              │ auto: all merchant products → ready_for_shelf  │
                              │ auto: onboarding checklist instantiated        │
                              └─────────────────────────┬──────────────────────┘
                                                        ▼
                                                   onboarding
                                              (all required steps done)
                                                        ▼
                                                     active

any stage ──► on_hold (reason required, returns to previous stage)
any stage ──► lost    (reason required, acq_manager or admin only)
```

**Rules enforced in the DB, not just the UI:**
- Cannot enter `cta_completed` without a submitted form record.
- Cannot enter `onboarding` without an `account_manager_id`.
- Cannot enter `active` while any required onboarding step is unfinished.
- Every stage change writes a timestamp column + a `system` activity row. Stage timestamps are never overwritten on a backwards move (first-touch wins).

---

## 3. Sitemap

```
/login
/                         Dashboard (role-aware)
/leads                    Unassigned pool + import
  /leads/import           4-step import wizard
/merchants                Master table (all stages, saved views)
  /merchants/[id]         Merchant record — 7 tabs
/pipeline                 Kanban by stage (my pipeline / team pipeline)
/onboarding               Onboarding board + step queue
/products                 Product pool — 5 tabs
  /products/[id]          Product drawer (opens over list)
/prospecting              Product-first sourcing → merchant discovery → leads
  /prospecting/[listId]
/tasks                    My follow-ups + team follow-ups
/reports                  Funnel, specialist performance, shelf throughput
/settings                 Users · Teams · Form templates · Onboarding templates · Lookups
/f/[token]                PUBLIC merchant form — no auth, no chrome
```

---

## 4. Page specs

### 4.1 `/` Dashboard

Role-aware. One layout, different cards.

**Acquisition Specialist:** 4 stat tiles (My merchants · Due today · Forms awaiting submission · Converted this month) → "Due now" list (merchants where `next_action_at <= now()`, sorted oldest first, each row has inline "Log call" button) → my stage funnel bar.

**Acquisition Manager / Admin:** funnel bar for the whole team (counts + conversion % between each stage) → specialist leaderboard table (assigned, contacted, forms sent, CTA done, conversion %, avg days to CTA) → unassigned lead count with a jump to `/leads` → stale alert list (no activity > 7 days).

**Account Manager:** merchants in onboarding with progress rings → steps overdue against SLA → merchants activated this month.

**Catalog Ops:** ready-for-shelf count by merchant → products in review → shelved this week.

Empty state copy: "No merchants assigned yet. Ask your manager to assign leads from the pool."

---

### 4.2 `/leads` — the pool

Only `stage = 'new'` (never assigned). This page has one job: get leads out of it.

- **Header:** count + `Import leads` (primary) + `Assign selected` (appears on selection).
- **Table columns:** checkbox · Store name (link to store_url, external icon) · Owner name · Phone · City · Category · Products count · Batch · Uploaded at.
- **Filters:** batch, city, region, category, products-count range, source, search (store name / phone / owner).
- **Bulk assign panel** (slide-over): pick specialist manually, or **Round-robin across selected specialists** (splits evenly), or **By city** (map city → specialist). Shows a preview count per specialist before confirm. On confirm: sets `acquisition_owner_id`, stage → `assigned`, writes `merchant_assignments` history + notification.
- Row click → merchant detail.

#### `/leads/import` — 4 steps

1. **Upload** — drop CSV/XLSX. Store file in Supabase Storage bucket `imports`, create `lead_batches` row.
2. **Map columns** — auto-guess mapping (store name, store URL, salla store id, owner name, phone, whatsapp, email, city, region, category, products count, rating, followers). Unmapped columns are kept in `raw jsonb` — nothing is thrown away.
3. **Clean & dedupe** — normalize Saudi phone numbers to `9665XXXXXXXX`; strip URL protocol/trailing slash for matching. Preview screen shows: N new, N duplicates (matched on `salla_store_id` → then normalized `store_url` → then phone), N invalid rows with the reason. Duplicate handling choice: **skip** (default) or **enrich existing** (fills only empty fields, never overwrites).
4. **Assign now?** — optionally run the same bulk-assign panel on the imported set, or leave in pool.

Import runs server-side in a Route Handler with the service role, batched 500 rows at a time, with a progress bar. Batch is re-runnable and reversible (`Undo batch` deletes only untouched `new` rows from that batch).

---

### 4.3 `/merchants` — master table

Every merchant, every stage. This is the workhorse screen.

- **Saved views** as tabs across the top: All · My merchants · Needs action · Form sent, not submitted · In onboarding · Active · On hold · Lost. Views are just filter presets; managers can save custom ones.
- **Columns:** Code · Store name · Owner · Phone (click = tel, WhatsApp icon = wa.me deep link with pre-filled Arabic template) · City · Stage badge · Priority · Acquisition owner · Account manager · Products · Last activity (relative) · Next action (red if overdue).
- **Filters:** stage (multi), owner, account manager, city/region, category, priority, source, batch, tags, date ranges on any stage timestamp, "no activity in X days".
- **Bulk actions:** reassign, set priority, add tag, export CSV.
- **Column visibility + density toggle**, persisted per user in localStorage.
- Sticky first column, virtualized rows — must stay fast at 50k rows. Server-side pagination + server-side filter, never fetch-all.

---

### 4.4 `/merchants/[id]` — the record

**Header block (always visible):**
Store name (large) + merchant code (mono) + store link · stage badge · priority selector · owner avatars (acquisition + account manager, click to reassign if permitted) · quick actions: `Log activity` · `Send form` · `Set next action` · `Change stage` · overflow (`Put on hold`, `Mark lost`).

**Signature element — the stage rail.** A horizontal 8-segment rail directly under the header. Each segment shows the stage name, the date it was entered, and days spent in it. Filled segments in accent, current segment pulsing outline, future segments hairline. On-hold shows as a hatched overlay. This is the one visually bold thing in the app — everything else stays quiet and dense.

**Tabs:**

1. **Overview** — two columns. Left: contact card (editable inline: phone, whatsapp, email, owner name, city, region, address, category), store stats (products count, rating, followers, salla store id), source + batch, tags. Right: next action card, latest 3 activities, open tasks, key dates list.
2. **Activity** — reverse-chronological timeline. Composer at top: type (call / whatsapp / email / meeting / visit / note), outcome (only for call), body, optional "next action" date+time which writes back to `merchants.next_action_at`. System events (stage changes, assignments, form sent/opened/submitted) appear inline in a lighter style and are not editable.
3. **Products** — merchant's catalog, status chips, bulk status change (catalog_ops + admin only), `Import products` button (CSV or Salla URL fetch), per-product review notes.
4. **Form** — form links sent (template, channel, sent by, sent at, opened at, submitted at, status), `Send form` action generating a fresh token, `Copy link`, `Revoke`. Once submitted: rendered read-only view of every answer + uploaded files.
5. **Onboarding** — only after `cta_completed`. Checklist with progress %, per step: title, owner, due date (SLA-derived), status dropdown, notes, attachments, completed-by stamp. `Mark merchant active` button, disabled with a tooltip listing what's still open.
6. **Tasks** — follow-ups scoped to this merchant.
7. **Files** — contracts, IDs, CR documents. Supabase Storage bucket `merchant-files`, signed URLs only.

Right rail (persistent, all tabs): full audit log, collapsed.

---

### 4.5 `/pipeline` — kanban

Columns = stages `assigned → contacted → interested → form_sent → cta_completed`. Cards show store name, city, products count, days in stage (amber >3, red >7), next action. Drag to change stage (validated server-side; illegal drops snap back with a toast explaining the rule). Toggle: **My pipeline** / **Team pipeline** (managers only, with a specialist filter). WIP counts per column header.

---

### 4.6 `/onboarding`

Two views, toggled:
- **Board** — merchants grouped by progress bucket (0–25 / 26–50 / 51–75 / 76–99 / done), progress ring per card, account manager avatar, days since `cta_completed`.
- **Step queue** — flat list of every open step across all merchants, filterable by owner role and overdue. This is how an account manager actually works a morning: filter to himself, sort by due date, tick down the list.

Marking the last required step done prompts "Activate merchant now?" → sets stage `active`.

---

### 4.7 `/products` — the shelf pipeline

Tabs = product status: **Ready for shelf** (default) · In review · Shelved · Rejected · All.

- **Grid/table toggle.** Grid shows image, name, price, merchant, status. Table shows Image · Name · SKU · Merchant (link) · Category · Price · Sale price · Stock · Status · Added at.
- **Filters:** merchant, category, brand, price range, has-image, status, date added.
- **Bulk actions:** move to review, shelve, reject (reason required), export CSV for the retail team.
- **Product drawer:** image carousel, full attributes, source (`salla_scrape` / `csv` / `manual` / `form`), raw payload viewer, review notes, status history.
- Products land in `ready_for_shelf` **automatically** when their merchant hits `cta_completed` — that trigger lives in the DB.

---

### 4.8 `/prospecting` — product-first sourcing

This is the "search for a product, find who sells it, assign them" flow.

- **List page:** saved search lists (name, query, results, merchants found, leads created, owner, date).
- **New search:** enter product keyword + optional filters (category, price range, city). Results table: product name, image, price, store name, store URL, and whether that store already exists in the CRM (`Existing — stage X` badge with a link, or `New`).
- **Actions:** select rows → `Create leads` (creates merchants with `source = 'product_search'`, attaches the matched products as `discovered`, dedupes against existing) → optional immediate assign.
- Ingestion: paste/upload results from the existing Salla catalog extraction tool, or hit it as an internal API. Keep the adapter behind one server module (`lib/sources/salla.ts`) so the source can be swapped without touching the UI.

---

### 4.9 `/f/[token]` — the public merchant form (call to action)

No auth, no app chrome, mobile-first, **Arabic RTL by default** with an EN toggle.

- Server-side: resolve token → validate not expired/revoked/already submitted → render template. Invalid token gets a clean "This link is no longer valid — contact your NML representative" page.
- Prefilled from the merchant record (store name, owner, phone) so the merchant confirms rather than retypes.
- Fields are driven by a JSON schema on `form_templates`, so ops can change the form without a redeploy. Field types: text, tel, email, textarea, select, multiselect, number, date, file, checkbox (consent), signature-ish (typed full name + timestamp).
- Default template ("NML Partnership Agreement"): store confirmation, CR number, VAT number, bank IBAN, warehouse/pickup address, category confirmation, expected SKU count, agreement checkbox, contact person.
- Submission → Route Handler with service role → writes `form_submissions`, flips `form_links.status`, moves merchant to `cta_completed`, fires the product + onboarding triggers, notifies the acquisition owner and acquisition manager.
- Success screen: confirmation + what happens next + the account manager's name once assigned.
- Rate-limit by IP + token. Never expose the service key. Never allow anon RLS reads on `merchants`.

---

### 4.10 `/tasks`, `/reports`, `/settings`

**Tasks:** my open / overdue / done, plus team view for managers. Create from anywhere with a merchant attached.

**Reports:**
- Funnel: counts + drop-off % between every stage, filterable by date range, batch, city, specialist.
- Specialist performance: assigned, contacted, forms sent, CTA done, conversion %, avg days lead→CTA, avg days to first contact.
- Source performance: conversion by `source` and by `batch`.
- Onboarding: avg days CTA→active, step-level bottlenecks (which step sits longest).
- Shelf: products ready vs shelved per week, avg days ready→shelved, top merchants by shelved SKUs.
- Every report exports CSV.

**Settings:** users (invite, role, team, deactivate) · teams · form templates (builder + versioning) · onboarding templates (steps, owner role, SLA days, required flag) · lookups (cities, regions, categories, lost reasons) · WhatsApp message templates.

---

## 5. Design system

Dense internal tool. Legible at 13px, comfortable for 8 hours, Arabic and English side by side.

**Tokens**
```
--ink        #101418   text, headers
--ink-2      #5B6572   secondary text
--paper      #FFFFFF   surfaces
--muted      #F5F6F8   page background, table stripes
--line       #E3E6EA   borders, dividers
--accent     #0B6E4F   NML primary — actions, active stage
--accent-2   #E8F3EE   accent surface
--warn       #B4690E   overdue, on hold
--danger     #B42318   lost, rejected
--info       #1E5FA8   informational badges
```
Swap `--accent` for the real NML brand hex when the UI reference lands — nothing else in the palette depends on it.

**Type**
- UI + Latin: **Inter**, sizes 12 / 13 / 14 / 16 / 20 / 28, weights 400/500/600.
- Arabic: **IBM Plex Sans Arabic**, applied via `:lang(ar)`.
- Codes, IDs, counts, prices in tables: **JetBrains Mono** 12px — numbers must align vertically down a column.

**Layout:** fixed 240px left nav (collapsible to 64px icons), 56px top bar with global search (⌘K → merchants, products, tasks), content max-width none (tables need the room). Radius 6px. Shadows only on overlays. Borders do the separating, not shadows.

**Stage badges:** filled accent for forward stages, hatched amber for `on_hold`, outlined danger for `lost`, solid `--ink` for `active`.

**RTL:** every layout uses logical properties (`ms-`/`me-`, `ps-`/`pe-`) so an `dir="rtl"` flip on the public form and any future Arabic UI just works.

**Quality floor:** keyboard-navigable tables, visible focus rings, optimistic updates with rollback toasts, skeleton rows not spinners, empty states that name the next action.

---

## 6. Automations

| Trigger | Effect |
|---|---|
| Form submitted | stage → `cta_completed`, all merchant products → `ready_for_shelf`, onboarding instantiated from default template, notify acquisition owner + manager |
| Account manager assigned on a `cta_completed` merchant | stage → `onboarding`, step due dates computed from SLA days, notify AM |
| All required onboarding steps done | prompt to activate; on confirm stage → `active` |
| Stage change | timestamp column set (first-touch), `system` activity row, audit row |
| Assignment change | `merchant_assignments` history row + notification |
| `next_action_at` passes | merchant surfaces in "Due now" (no cron needed — query-driven) |
| No activity for 7 days on an in-flight merchant | flagged stale on the manager dashboard (query-driven) |

Notifications: in-app table + optional email via Resend. Build in-app first; email is one function call behind a flag.

---

## 7. Build order (single Claude Code run)

1. Run `nml-crm-schema.sql` in the Supabase SQL editor. Verify tables + RLS.
2. Scaffold Next.js + Tailwind + shadcn + Supabase clients (browser, server, service-role server-only).
3. Auth + profile bootstrap + role-gated middleware + app shell (nav, top bar, ⌘K).
4. Merchants table + detail page + activity timeline. **Everything else depends on this — get it right first.**
5. Leads pool + import wizard + bulk assign.
6. Form templates + send + public `/f/[token]` + submission handler + the conversion cascade.
7. Products pool + shelf statuses + merchant products tab.
8. Onboarding templates + board + step queue.
9. Pipeline kanban, tasks, notifications.
10. Prospecting.
11. Reports.
12. Settings.

Seed 200 fake merchants across every stage before building reports, so the charts are testable.

---

## 8. Decisions to confirm before the build starts

1. **Product source at scale** — schema supports `salla_scrape`, `csv`, `manual`, `form`. Wiring the existing extraction tool as a live API is the only piece that needs its endpoint contract nailed down.
2. **WhatsApp** — deep links (`wa.me`) only for v1, or Cloud API with templates? Deep links assumed.
3. **Arabic UI** — public form is Arabic-first regardless. Is the internal app English-only for v1? Assumed yes, with RTL-ready CSS.
4. **Multi-tenant** — assumed single org (NML). No `org_id` in the schema. Say now if that's wrong, it's expensive later.
